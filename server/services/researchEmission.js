/**
 * researchEmission — the only path from a route to the research event log's record (G1.2 spec
 * §5.9–§5.11). Routes call this module's emitters and nothing else of the research layer: they never
 * call record themselves, so a route gains one line per act, the builders are testable without HTTP,
 * and nothing a builder does can fail an editor's act (plan decision 42).
 *
 * Nothing here may change a response (spec §5.11 step 3). The research-only fields a request carries
 * are read only after the act, and a malformed one becomes null; it never refuses (decision 43).
 *
 * Assist items (spec §5.10; decision 50): claimAssistItems rebuilds each item from known fields only,
 * computes the hashes itself (the client never hashes, §5.18) and sets its claim from one table,
 * CLAIM_VALIDATORS. It checks, marks and never refuses (§14 call 17). G1.23 replaces the table's
 * ai-suggestion entry with its own check (§5.10, "G1.23 supplies that check"); rule-suggestion stays
 * mismatch, since no rule suggestion is ever offered.
 */
const log = require('../lib/logger');
const researchLog = require('./researchLog');
const concordance = require('./concordanceService');
const segmentEditor = require('./segmentEditorService'); // the apply's fixed superseded note, and the review row
const suggestionView = require('./suggestionView'); // the accepted-suggestion claim check
const { sha256Text } = require('../lib/servedText');
const { ITEM_TYPES } = require('../lib/researchVocabulary');

const MAX_CLIENT_ACTION_ID = 128; // record stores a longer id as null (Task 11's buildEvent)
const MAX_ITEM_TEXT = 10000; // the save route's own editedContent cap (routes/segment-editor.js)
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ACCEPT_ORIGINS = Object.freeze(['single', 'keyboard-stream']);

/** The sources each item type may name; the client's own table is segment-save-state.js's ITEM_SOURCES. */
const ITEM_SOURCES = Object.freeze({
  'repetition-insert': Object.freeze(['tm']),
  'term-insert': Object.freeze(['termbase']),
  'markup-wrap': Object.freeze(['toolbar', 'keyboard']),
  'ai-suggestion': Object.freeze(['ai']),
  'rule-suggestion': Object.freeze(['rule']),
  'draft-restore': Object.freeze([null]),
});

/** A non-empty string of at most `max` characters, else null ('' is null: it would merge dedupe keys). */
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
/** A safe integer of at least `min`, else null. */
const int = (v, min = 0) => (Number.isSafeInteger(v) && v >= min ? v : null);
/**
 * A note as text: nullish or '' → null, anything else String(v). No route type-checks a note and the services
 * store a number, so a non-string note must not reach record's filter raw, which throws on it and loses the act's
 * event (final review M7). The filter then stores it as { length, sha256 }.
 */
const noteOf = (v) => (v === undefined || v === null || v === '' ? null : String(v));

/**
 * @param {object} body A request body.
 * @returns {{clientActionId: string|null, clientActionTime: number|null, replayed: boolean}}
 */
function readClientFields(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    clientActionId: str(b.clientActionId, MAX_CLIENT_ACTION_ID),
    clientActionTime: int(b.clientActionTime, 1),
    replayed: b.replayed === true,
  };
}

/** @returns {'single'|'keyboard-stream'|null} */
const readAcceptOrigin = (body) =>
  body && ACCEPT_ORIGINS.includes(body.acceptOrigin) ? body.acceptOrigin : null;

/**
 * A client-sent value in a hash slot, kept only when it IS a hash (Review Focus 41): PR1 type-checks these strings
 * but never their format, so anything else is null and flagged, never stored (spec §5.6: no text).
 * @param {unknown} v
 * @returns {{value: string|null, malformed: boolean}} absent ('' is absent to PR1 too) → null, not malformed
 */
function hashOrNull(v) {
  if (v === null || v === undefined || v === '') return { value: null, malformed: false };
  if (typeof v === 'string' && SHA256_HEX.test(v)) return { value: v, malformed: false };
  return { value: null, malformed: true };
}

/** @returns {string|null} 64 lowercase hex, else null. */
const readReviewedEditSha256 = (body) =>
  body && typeof body.reviewedEditSha256 === 'string' && SHA256_HEX.test(body.reviewedEditSha256)
    ? body.reviewedEditSha256
    : null;

/** A whole-text item keeps the text it put in place (spec §5.10, §14 call 18) and the server's hash of it. */
function wholeText(d) {
  if (typeof d.text === 'string' && d.text.length <= MAX_ITEM_TEXT) {
    return { text: d.text, textSha256: sha256Text(d.text) };
  }
  if (typeof d.text === 'string') return { textLength: d.text.length, textDropped: true };
  if (d.textDropped === true) {
    return {
      ...(int(d.textLength) !== null ? { textLength: d.textLength } : {}),
      textDropped: true,
    };
  }
  return {};
}

// tm_segments.chapter is TEXT (036-tm-segments.js; indexModule writes String(chapterNum)), so the client sends
// the suggestion's chapter as a string; a number is accepted too. Stored as a Number, like the events' own chapter.
const chapterOf = (v) =>
  Number.isSafeInteger(v) ? v : typeof v === 'string' && /^-?\d{1,4}$/.test(v) ? Number(v) : null;

/** Per item type, the detail fields kept; everything else the client sent is left out. */
const DETAIL = {
  'repetition-insert': (d) => ({
    ...wholeText(d),
    book: str(d.book, 64),
    chapter: chapterOf(d.chapter),
    moduleId: str(d.moduleId, 64),
  }),
  'draft-restore': (d) => ({ ...wholeText(d), ...(d.legacy === true ? { legacy: true } : {}) }),
  'term-insert': (d) => {
    const term = str(d.term, 200);
    return term === null ? {} : { term, termSha256: sha256Text(term) };
  },
  'markup-wrap': (d) => ({ marker: str(d.marker, 8) }),
  'ai-suggestion': () => ({}),
  'rule-suggestion': () => ({}),
};

/** The fields G1.23 §8 names for a suggestion item, mapped now so its seam is the check only. */
const suggestionFields = (r) => ({
  opId: str(r.opId, 128),
  occurrence: int(r.occurrence),
  category: str(r.category, 64),
  runId: str(r.runId, 128),
  groupActionId: str(r.groupActionId, 128),
  rulingId: str(r.rulingId, 128),
  ruleId: str(r.ruleId, 128),
});

/** Validated when the text is the suggestion the server would offer now (Review Focus 29), else mismatch. */
function validateRepetition(item, at) {
  if (typeof item.detail.textSha256 !== 'string') return 'unverified'; // the sent body carried no text
  const offered = at.offered(); // one module load per claimAssistItems call, not per item (Review Focus 39)
  if (!offered) return 'mismatch';
  return sha256Text(offered.is_text) === item.detail.textSha256 ? 'validated' : 'mismatch';
}
// The server cannot check these, whichever segment the client attributes them to (Review Focus 30).
const unverified = () => 'unverified';
// No rule suggestion is ever offered, so a claim to have accepted one is false (spec §5.10: "a failed check is
// mismatch"); the item is kept, never dropped or refused (Review Focus 31).
const noSuggestionOffered = () => 'mismatch';

/** One claim rule per item type: (item, at) => 'validated' | 'unverified' | 'mismatch'. */
const CLAIM_VALIDATORS = Object.freeze({
  'repetition-insert': validateRepetition,
  'term-insert': unverified,
  'markup-wrap': unverified,
  'draft-restore': unverified,
  'ai-suggestion': (item, at) => at.suggestionCheck(item),
  'rule-suggestion': noSuggestionOffered,
});

/**
 * Rebuild a save's assist items from known fields and give each its claim. Never throws.
 *
 * @param {unknown} raw The body's assist list as the client sent it.
 * @param {{book: string, chapter: number|string, moduleId: string, segmentId: string, occurrence?: number,
 *   saved?: object, editedContent?: string}} place occurrence, saved (the finished save) and editedContent
 *   (its text) are what the ai-suggestion check needs; without `saved` such an item is mismatch.
 * @returns {{items: Array<object>, droppedCount: number}} Items are exactly the keys record accepts;
 *   droppedCount counts entries of an unknown type (and a list that is not an array, as one).
 */
function claimAssistItems(raw, place) {
  if (raw === undefined || raw === null) return { items: [], droppedCount: 0 };
  if (!Array.isArray(raw)) return { items: [], droppedCount: 1 };
  // Every item of one save names the same segment, so the suggestion is looked up once (null is a result and
  // is kept). A throw is not memoized: the next item asks again and is marked unverified the same way.
  let memo;
  const at = {
    ...place,
    offered: () =>
      memo !== undefined
        ? memo
        : (memo = concordance.suggestionFor(
            place.book,
            place.chapter,
            place.moduleId,
            place.segmentId
          )),
    suggestionCheck: (item) => checkSuggestionClaim(item),
  };
  // The accepted-suggestion check (G1.23 PR2 task 2) runs once per save over every claimed op of this
  // occurrence. A throw is not memoized and reaches the caller's catch (the item is unverified).
  let validatedOps;
  function checkSuggestionClaim(item) {
    if (!place.saved) return 'mismatch'; // a direct caller without a save: nothing to check against, and the read side offers nothing, so the claim is false
    if (typeof item.opId !== 'string' || item.occurrence !== place.occurrence) return 'mismatch';
    if (validatedOps === undefined) {
      const opIds = raw
        .filter((r) => r && typeof r === 'object' && r.itemType === 'ai-suggestion')
        .map(suggestionFields)
        .filter((f) => f.occurrence === place.occurrence && f.opId !== null)
        .map((f) => f.opId);
      const conn = segmentEditor.getDb();
      const displayedText = suggestionView.displayedTextForSave(conn, place.saved);
      if (displayedText === null) {
        validatedOps = null; // a null text is a result too: the SELECT runs once per save
      } else
        validatedOps = suggestionView.checkAcceptedGroups(conn, {
          book: place.book,
          chapter: place.chapter,
          moduleId: place.moduleId,
          segmentId: place.segmentId,
          occurrence: place.occurrence,
          baseSha256: place.saved.baseSha256,
          displayedText,
          savedText: place.editedContent,
          opIds: opIds,
        });
    }
    if (validatedOps === null) return 'unverified';
    return validatedOps.has(item.opId) ? 'validated' : 'mismatch';
  }
  const items = [];
  let droppedCount = 0;
  for (const r of raw) {
    if (!r || typeof r !== 'object' || !ITEM_TYPES.includes(r.itemType)) {
      droppedCount += 1; // record throws on an unknown type, which would lose the whole event (decision 50)
      continue;
    }
    const src = r.source === undefined ? null : r.source;
    const item = {
      itemType: r.itemType,
      source: ITEM_SOURCES[r.itemType].includes(src) ? src : null,
      clientTimeMs: int(r.clientTimeMs),
      detail: DETAIL[r.itemType](r.detail && typeof r.detail === 'object' ? r.detail : {}),
      ...(r.itemType === 'ai-suggestion' || r.itemType === 'rule-suggestion'
        ? suggestionFields(r)
        : {}),
    };
    let claim;
    try {
      claim = CLAIM_VALIDATORS[r.itemType](item, at);
    } catch (err) {
      // The check could not run (a database error): an unverifiable claim is never called false.
      claim = 'unverified';
      log.warn(
        { errorCode: errorCodeOf(err), itemType: r.itemType },
        'Assist claim check failed; marked unverified'
      );
    }
    items.push({ ...item, claim });
  }
  return { items, droppedCount };
}

/** A thrown value's code or name for a log line; never throws (a Proxy or hostile getter reads as 'unknown'). */
function errorCodeOf(err) {
  try {
    return (err && (err.code || err.name)) || 'unknown';
  } catch {
    return 'unknown';
  }
}

const NO_CLIENT = Object.freeze({ clientActionId: null, clientActionTime: null, replayed: false });
const NONE = Object.freeze({
  segmentId: null,
  occurrence: null,
  servedVersionId: null,
  editingKind: null,
  editingId: null,
  editingContentSha256: null,
  origin: null,
  items: null,
  sessionId: null,
  ...NO_CLIENT,
});

/**
 * @param {{user: {id: string}}} req
 * @param {string} eventType
 * @param {{book: string, chapter: number, moduleId: string}} place
 * @returns {{actorProviderId: string, eventType: string, book: string, chapter: number, moduleId: string}}
 */
function headFor(req, eventType, { book, chapter, moduleId }) {
  return { actorProviderId: req.user.id, eventType, book, chapter, moduleId };
}

/**
 * The one place a route hands an event to the log (spec §5.11). Called after the editing write committed and before
 * the route answers. Never throws: a builder bug is recorded as a loss through the log itself (decision 14), and the
 * log is called after the try/catch, never inside it (it cannot throw; activityLogCallsiteGuard bans a try-wrapped call).
 *
 * @param {() => object} headFn
 * @param {() => (object|null)} build Null means the act wrote nothing and nothing is recorded.
 * @returns {void}
 */
function emit(headFn, build) {
  let head = null; // a plain snapshot of primitives; the caller's object is never read again after the copy
  let event = null;
  try {
    const raw = headFn();
    head = {
      actorProviderId: raw.actorProviderId,
      eventType: raw.eventType,
      book: raw.book,
      chapter: raw.chapter,
      moduleId: raw.moduleId,
    };
    const fields = build();
    if (fields === null) return;
    if (fields === undefined) throw new TypeError('build returned undefined'); // a builder bug, not "nothing to record"
    event = { ...fields, ...head };
  } catch (err) {
    log.error(
      {
        errorCode: errorCodeOf(err),
        eventType: head ? head.eventType : null,
        book: head ? head.book : null,
      },
      'Research event could not be built; recorded as a loss for a consenting actor (spec §5.11)'
    );
    if (!head) return; // with no actor and no place there is nothing to count
    event = { ...head, buildFailed: true };
  }
  researchLog.record(event);
}

/** saveOnServedBase's outcome → the event it records (decision 51); 'unchanged' wrote nothing, so it has none. */
const SAVE_EVENT_TYPE = Object.freeze({
  inserted: 'edit-save',
  updated: 'edit-resave',
  withdrawn: 'edit-withdraw',
});
const clientOf = (req) => readClientFields(req.body);
const placeOf = (req) => ({
  book: req.params.book,
  chapter: req.chapterNum,
  moduleId: req.params.moduleId,
});

/**
 * The save route's research event (spec §5.9, §5.10; decision 51), after the commit and before the response.
 * Never throws. `saved` is read only inside emit's callbacks, never here, so an odd result can never throw into
 * the route: the outcome in the head (the event type is the head's), every other field in the build.
 *
 * @param {object} req The save request (user, params, chapterNum, body).
 * @param {{segmentId: string, editedContent: string, category?: string, editorNote?: string, saved: object}} act
 *   The route's own fields and saveOnServedBase's return.
 * @returns {void}
 */
function emitSave(req, { segmentId, editedContent, category, editorNote, saved }) {
  let eventType = null; // set by the head, read by the build; both run inside emit's try
  emit(
    () => {
      const outcome = saved.outcome;
      eventType = Object.hasOwn(SAVE_EVENT_TYPE, outcome) ? SAVE_EVENT_TYPE[outcome] : null;
      return headFor(req, eventType, placeOf(req));
    },
    () => {
      if (eventType === null) return null; // 'unchanged': nothing was written (decision 51)
      const base = {
        segmentId,
        occurrence: saved.occurrence,
        editingKind: 'segment_edit',
        editingId: saved.editId,
        origin: 'editor-save',
        sessionId: null,
        ...clientOf(req),
      };
      if (eventType === 'edit-withdraw') {
        // The deleted row is the event's source (spec §5.9's source table). A withdraw's assists are never sent:
        // record throws on items outside the save events (Review Focus 33).
        const row = saved.before;
        return {
          ...base,
          servedVersionId: row.served_version_id ?? null,
          editingContentSha256: sha256Text(row.edited_content),
          content: null,
          before: { table: 'segment_edits', row },
          detail: null,
          items: null,
        };
      }
      const { items, droppedCount } = claimAssistItems(req.body && req.body.assists, {
        ...placeOf(req),
        segmentId,
        occurrence: saved.occurrence,
        saved,
        editedContent,
      });
      const displayed = saved.displayed;
      // The displayed hash is the client's echo, and PR1 stores it unchecked where decision 39 lets a save through
      // without comparing it: kept only when it is a hash (Review Focus 41's rule, as for a refusal's echo).
      const displayedSha256 = hashOrNull(displayed.sha256);
      return {
        ...base,
        servedVersionId: saved.servedVersionId,
        editingContentSha256: saved.editedContentSha256,
        // As saveSegmentEdit stores them, so a rebuild hashes the note the row holds; the exception is a numeric
        // note, which the row renders as REAL text ('5.0') and noteOf as String(v) ('5'). record keeps only the
        // text's hash when another editor holds the same bytes as a live edit (decision 65).
        content: { text: editedContent, note: noteOf(editorNote), category: category || null },
        before: eventType === 'edit-resave' ? { table: 'segment_edits', row: saved.before } : null,
        detail: {
          displayed: { editId: displayed.editId, sha256: displayedSha256.value },
          supersededEditIds: saved.supersededEditIds,
          supersededAcceptanceIds: saved.supersededAcceptanceIds,
          ...(droppedCount ? { droppedAssistCount: droppedCount } : {}),
          ...(displayedSha256.malformed ? { echoMalformed: true } : {}),
        },
        items,
      };
    }
  );
}

const MAX_SEGMENT_ID = 200;
// The save refusals PR1's refuse() raises with no echo (placement, before the hash check, and STRUCTURE_BLOCKED
// after it): the client's baseSha256 is the echo (decision 49). Never STALE_DISPLAYED: its echo is the displayed
// hash, not the base. Nor SEGMENT_CONFLICT: the conflict check compared edit ids, never this hash.
const ECHO_FROM_BODY = new Set([
  'BOOK_NOT_MINTED',
  'NO_LAYER',
  'SEGMENT_NOT_FOUND',
  'DUPLICATE_ID',
  'STRUCTURE_BLOCKED',
]);

/**
 * A refused write's research event, `write-refused` (spec §5.6, §5.9; decision 49): its reason and both hashes,
 * never a text, a note or an item. Never throws.
 *
 * @param {object} req The refused request (user, params, chapterNum, body).
 * @param {{action: 'save'|'accept'|'propagate', segmentId: unknown, origin?: string|null,
 *   refusal: ({code: string, echoedSha256: unknown, currentSha256: unknown}
 *     | {code: string, echoedText: unknown, currentText: unknown})}} refused
 *   A hash form is checked as a hash; a text form (the accept's value check) is hashed here.
 * @returns {void}
 */
function emitRefused(req, { action, segmentId, refusal, origin = null }) {
  emit(
    () => headFor(req, 'write-refused', placeOf(req)),
    () => {
      const hash = (t) => (typeof t === 'string' ? sha256Text(t) : null);
      // detail is stored unfiltered (decision 49), so a value is kept only when it IS a hash (hashOrNull).
      let malformed = false;
      const asHash = (v) => {
        const h = hashOrNull(v);
        if (h.malformed) malformed = true;
        return h.value;
      };
      let echoed = 'echoedText' in refusal ? hash(refusal.echoedText) : refusal.echoedSha256;
      if (action === 'save' && ECHO_FROM_BODY.has(refusal.code) && req.body) {
        echoed = req.body.baseSha256;
      }
      const echoedSha256 = asHash(echoed);
      const currentSha256 = asHash(
        'currentText' in refusal ? hash(refusal.currentText) : refusal.currentSha256
      );
      return {
        segmentId:
          typeof segmentId === 'string' && segmentId.length <= MAX_SEGMENT_ID ? segmentId : null,
        occurrence: null,
        servedVersionId: null, // spec §5.9's source table: a refused write has no base
        editingKind: null,
        editingId: null,
        editingContentSha256: null,
        origin,
        content: null,
        before: null,
        items: null,
        sessionId: null,
        detail: {
          reason: refusal.code,
          echoedSha256,
          currentSha256,
          action,
          ...(malformed ? { echoMalformed: true } : {}),
        },
        // Decision 53: a propagation carries no client action id, so its refusal carries none either.
        ...(action === 'propagate' ? NO_CLIENT : clientOf(req)),
      };
    }
  );
}

/** The accept's eligibility refusals (acceptanceService.acceptSegment, after PR1's placement). Decision 49: logged as
 * write-refused with no hash, since each compares row states, never a text. Pinned against the codes the service
 * throws (Task 22's test). */
const ACCEPT_ELIGIBILITY_REFUSALS = Object.freeze([
  'NO_TRANSLATION',
  'EDIT_EXISTS',
  'DISCUSS_OPEN',
  'HUMAN_CONTENT',
]);

/**
 * The accept route's research event, `mt-accept` (spec §5.9): the acceptance row the write made, its served version
 * and the accepted text's hash. An `alreadyAccepted` result logs nothing (spec §5.6). Never throws.
 *
 * @param {object} req The accept request (user, params, chapterNum, body).
 * @param {{result: {alreadyAccepted?: boolean, acceptance?: object}}} act acceptSegment's return.
 * @returns {void}
 */
function emitAccept(req, { result }) {
  if (!result || result.alreadyAccepted) return; // spec §5.6: an alreadyAccepted result logs no event
  emit(
    () => {
      const a = result.acceptance;
      return headFor(req, 'mt-accept', { book: a.book, chapter: a.chapter, moduleId: a.module_id });
    },
    () => {
      const a = result.acceptance;
      return {
        segmentId: a.segment_id,
        occurrence: a.occurrence ?? null,
        servedVersionId: a.served_version_id ?? null,
        editingKind: 'segment_acceptance',
        editingId: a.id,
        editingContentSha256: sha256Text(a.accepted_content),
        origin: null,
        content: null,
        before: null,
        items: null,
        sessionId: null,
        detail: { acceptOrigin: readAcceptOrigin(req.body) },
        ...clientOf(req),
      };
    }
  );
}

/**
 * `suggestion-reject` (G1.23 PR2 task 3; spec §5.9): one event per inserted rejection row, each with one
 * ai-suggestion item. The item's claim is `validated` when the op was among the groups the server would
 * offer on the current base, else `mismatch`; a stale echoed base is flagged in the detail and never refuses
 * the act. Each event's client action id is "<id>:<opId>" when that fits the cap, else null (never cut).
 * Never throws.
 *
 * @param {object} req The reject request (user, params, chapterNum, body).
 * @param {{ rows: object[], servedVersionId: number, offeredOpIds: Iterable<string>|null,
 *   groupActionId: unknown, echoedBaseSha256: string|null, baseMismatch: boolean }} act
 * @returns {void}
 */
function emitSuggestionReject(req, act) {
  // Nothing here may throw outside `emit`'s guarded callbacks: only a plain array read happens out here.
  const rows = act && Array.isArray(act.rows) ? act.rows : [];
  for (const row of rows) {
    emit(
      () => headFor(req, 'suggestion-reject', placeOf(req)),
      () => {
        const { servedVersionId, offeredOpIds, groupActionId, echoedBaseSha256, baseMismatch } =
          act;
        // A null offered set means the check could not run: every claim is unverified.
        const offered = offeredOpIds === null ? null : new Set(offeredOpIds);
        const client = clientOf(req);
        const composed =
          client.clientActionId === null ? null : `${client.clientActionId}:${row.op_id}`;
        return {
          segmentId: row.segment_id,
          occurrence: row.occurrence,
          servedVersionId,
          editingKind: 'suggestion_rejection',
          editingId: row.id,
          editingContentSha256: null,
          origin: null,
          content: null,
          before: null,
          sessionId: null,
          items: [
            {
              itemType: 'ai-suggestion',
              source: 'ai',
              clientTimeMs: null,
              detail: {},
              opId: row.op_id,
              occurrence: row.occurrence,
              category: str(row.category, 64),
              runId: str(row.run_id, 128),
              groupActionId: str(groupActionId, 128),
              rulingId: str(row.ruling_id, 128),
              ruleId: null,
              claim:
                offered === null ? 'unverified' : offered.has(row.op_id) ? 'validated' : 'mismatch',
            },
          ],
          detail: { echoedBaseSha256, baseMismatch },
          clientActionId:
            composed !== null && composed.length <= MAX_CLIENT_ACTION_ID ? composed : null,
          clientActionTime: client.clientActionTime,
          replayed: client.replayed,
        };
      }
    );
  }
}

/**
 * `suggestion-left-open` (G1.23 PR2 task 4; spec §5.9): one event per left-open row a finishing act wrote, each
 * with one ai-suggestion item (claim `validated`: the server itself computed the group as open on the base). The
 * place is each row's own (it was written from the finishing row: the acceptance for Staðfesta MT, the edit for an
 * approval). No client action id, time or replay (the acting click is not a suggestion click). Never throws.
 *
 * @param {object} req The finishing request (user).
 * @param {{ rows: object[], act: 'stadfesta-mt'|'approval', servedVersionId: number|null }} input
 * @returns {void}
 */
function emitSuggestionLeftOpen(req, input) {
  const rows = input && Array.isArray(input.rows) ? input.rows : [];
  for (const row of rows) {
    emit(
      () => headFor(req, 'suggestion-left-open', rowPlace(row)),
      () => ({
        segmentId: row.segment_id,
        occurrence: row.occurrence,
        servedVersionId: input.servedVersionId ?? null,
        editingKind: 'suggestion_left_open',
        editingId: row.id,
        editingContentSha256: null,
        origin: null,
        content: null,
        before: null,
        sessionId: null,
        items: [
          {
            itemType: 'ai-suggestion',
            source: 'ai',
            clientTimeMs: null,
            detail: {},
            opId: row.op_id,
            occurrence: row.occurrence,
            category: str(row.category, 64),
            runId: str(row.run_id, 128),
            groupActionId: null,
            rulingId: str(row.ruling_id, 128),
            ruleId: null,
            claim: 'validated',
          },
        ],
        detail: { act: input.act, shownAtFinish: row.shown_at_finish === 1 },
        ...NO_CLIENT,
      })
    );
  }
}

const REVIEW_DECISIONS = Object.freeze(['edit-approve', 'edit-reject', 'edit-discuss']);
const rowPlace = (row) => ({ book: row.book, chapter: row.chapter, moduleId: row.module_id });
/** A segment_edits row as the event's editing reference (the row's own fields; the hash is the server's). */
const editRef = (edit) => ({
  segmentId: edit.segment_id,
  occurrence: edit.occurrence ?? null,
  servedVersionId: edit.served_version_id ?? null,
  editingKind: 'segment_edit',
  editingId: edit.id,
  editingContentSha256: sha256Text(edit.edited_content),
  origin: edit.origin ?? null,
  items: null,
  sessionId: null,
});

/**
 * A review act's research event (spec §5.9; decisions 52, 53, 57): approve, reject, discuss, unapprove or
 * return-to-pending, after the write committed and before the response. A decision carries the reviewer's note
 * and the hash they echoed; an echo that is missing or differs from the text now held is flagged `mismatch`,
 * never refused (§5.18; Review Focus 25). A reviewer's act reads no client field (decision 53). Never throws:
 * the route's values are read only inside emit's guarded callbacks.
 *
 * @param {object} req The review request (user, params, body).
 * @param {string} eventType One of the five review event types.
 * @param {{edit: object, before: object}} act The row after the write and the row before it.
 * @returns {void}
 */
function emitReview(req, eventType, { edit, before }) {
  emit(
    () => headFor(req, eventType, rowPlace(edit)),
    () => {
      const ref = editRef(edit);
      const row = { table: 'segment_edits', row: before };
      if (!REVIEW_DECISIONS.includes(eventType)) {
        return { ...ref, content: null, before: row, detail: null, ...NO_CLIENT };
      }
      const echoed = readReviewedEditSha256(req.body);
      return {
        ...ref,
        content: { note: noteOf(req.body && req.body.note) },
        before: row,
        detail: { reviewedEditSha256: echoed, mismatch: echoed !== ref.editingContentSha256 },
        ...NO_CLIENT,
      };
    }
  );
}

/** `edit-delete`: the deleted row is the source (spec §5.9's table). Never throws. */
function emitDelete(req, { before }) {
  emit(
    () => headFor(req, 'edit-delete', rowPlace(before)),
    () => ({
      ...editRef(before),
      content: null,
      before: { table: 'segment_edits', row: before },
      detail: null,
      ...NO_CLIENT,
    })
  );
}

/** `mt-accept-revoke`: the acceptance row after the write, its previous state as the before-image. Never throws. */
function emitRevoke(req, { row, before }) {
  emit(
    () => headFor(req, 'mt-accept-revoke', rowPlace(row)),
    () => ({
      segmentId: row.segment_id,
      occurrence: row.occurrence ?? null,
      servedVersionId: row.served_version_id ?? null,
      editingKind: 'segment_acceptance',
      editingId: row.id,
      editingContentSha256: sha256Text(row.accepted_content),
      origin: null,
      content: null,
      before: { table: 'segment_acceptances', row: before },
      items: null,
      sessionId: null,
      detail: null,
      ...NO_CLIENT,
    })
  );
}

/** `edit-comment`: the comment as length and hash (record's filter); the edit is the row commented on. Never throws. */
function emitComment(req, { edit, comment }) {
  emit(
    () => headFor(req, 'edit-comment', rowPlace(edit)),
    () => ({
      ...editRef(edit),
      content: { comment: typeof comment === 'string' ? comment : String(comment) },
      before: null,
      detail: null,
      ...NO_CLIENT,
    })
  );
}

/** `module-submit`: no segment; the ids the submit stamped are the detail. Never throws. */
function emitSubmit(req, { reviewId, stampedEditIds }) {
  emit(
    () => headFor(req, 'module-submit', placeOf(req)),
    () => ({
      ...NONE,
      content: null,
      before: null,
      detail: { reviewId, stampedEditIds },
    })
  );
}

const ids = (rows) => rows.map((r) => r.id);

/**
 * `apply`: no segment, no served version; the per-row outcomes are the detail, not the content (decision 48).
 * Winners, losers, the rows a self-heal reset and the acceptances the apply stamped are all ids; the before-image
 * holds the rows the apply (or its reset) changed. Several events per request carry no client fields (decision 53).
 * A self-heal whose recursive apply threw never reaches here: the act failed, so nothing is recorded (Review Focus
 * 28). Never throws: `before` is read only inside emit's callbacks.
 *
 * @param {object} req
 * @param {{book: string, chapter: number, moduleId: string, before: object, trigger: string, reviewId?: (number|null)}} act
 *   `before` is the unstripped result's `before` (Task 17); `trigger` is `apply`, `apply-and-render` or `review-complete`.
 * @returns {void}
 */
function emitApply(req, { book, chapter, moduleId, before, trigger, reviewId = null }) {
  emit(
    () => headFor(req, 'apply', { book, chapter, moduleId }),
    () => ({
      ...NONE,
      content: null,
      before: [
        ...before.superseded.map((row) => ({ table: 'segment_edits', row })),
        ...before.selfHealReset.edits.map((row) => ({ table: 'segment_edits', row })),
        ...before.selfHealReset.acceptances.map((row) => ({ table: 'segment_acceptances', row })),
      ],
      detail: {
        trigger,
        ...(reviewId !== null ? { reviewId } : {}),
        applied: ids(before.applied),
        superseded: ids(before.superseded),
        supersededReviewerNote: {
          length: [...segmentEditor.SUPERSEDED_BY_NEWER_NOTE].length,
          sha256: sha256Text(segmentEditor.SUPERSEDED_BY_NEWER_NOTE),
        },
        selfHealReset: {
          editIds: ids(before.selfHealReset.edits),
          acceptanceIds: ids(before.selfHealReset.acceptances),
        },
        lapsedAcceptanceIds: before.lapsedAcceptanceIds,
        stampedAcceptanceIds: before.stampedAcceptanceIds,
      },
    })
  );
}

/**
 * `review-complete`: the head editor's note and what became of the apply it causes (decision 56). The location is
 * the review row's (`completeModuleReview` returns none; Review Focus 34), read once in the head (Review Focus 39).
 * No client fields (decision 53). Never throws.
 *
 * @param {object} req
 * @param {{reviewId: number, result: object, notes: *, apply: ('applied'|'held'|'failed'|'not-attempted')}} act
 * @returns {void}
 */
function emitReviewComplete(req, { reviewId, result, notes, apply }) {
  emit(
    () => {
      const { review } = segmentEditor.getModuleReviewWithEdits(reviewId);
      return headFor(req, 'review-complete', rowPlace(review));
    },
    () => ({
      ...NONE,
      content: { note: typeof notes === 'string' ? notes : null },
      before: null,
      detail: { reviewId, status: result.status, apply },
    })
  );
}

/**
 * `restore`: the version restored is the content; the acceptances the restore lapsed are the detail. No client
 * fields (decision 53). Never throws.
 *
 * @param {object} req The restore request (user, params, chapterNum).
 * @param {{version: number, before: ({lapsedAcceptanceIds: number[]}|undefined)}} act
 * @returns {void}
 */
function emitRestore(req, { version, before }) {
  emit(
    () => headFor(req, 'restore', placeOf(req)),
    () => ({
      ...NONE,
      content: { version },
      before: null,
      detail: { lapsedAcceptanceIds: before ? before.lapsedAcceptanceIds : [] },
    })
  );
}

/**
 * `propagation`: one event per WRITTEN target, none when nothing was written (spec §5.6, §5.9; decisions 44, 53, 54,
 * 65). The client's text is stored once (`content.text`; `record` swaps it for its hash when another editor holds
 * the same bytes live); the preview is what the source's latest live edit (or the base) was just before the write,
 * kept as text only when it is the actor's own or the base (another editor's text only as a hash). The skipped
 * targets ride on index 0 only, so a sum over events counts each skip once. No client fields: one request, several
 * events. Never throws: the route's values are read only inside emit's guarded callbacks. When the preview read
 * failed (`previewUnknown`), the preview's hash, source and mismatch flag are null and no preview text is stored.
 *
 * @param {object} req The propagate request (user, params, chapterNum).
 * @param {{sourceSegmentId: string, sourceIs: string, latest: ({editor_id: *, edited_content: string}|null),
 *   previewUnknown?: boolean, editedContent: string, category?: string, note: string, writes: object[],
 *   skipped: object[]}} act
 *   `writes` and `skipped` are createPropagatedEdits' lists; `latest` is propagationService.latestLiveEdit's
 *   answer, read just before the write; `previewUnknown` is true when that read threw.
 * @returns {void}
 */
function emitPropagation(
  req,
  {
    sourceSegmentId,
    sourceIs,
    latest,
    previewUnknown = false,
    editedContent,
    category,
    note,
    writes,
    skipped,
  }
) {
  const list = Array.isArray(writes) ? writes : [];
  list.forEach((w, index) => {
    emit(
      () =>
        headFor(req, 'propagation', {
          book: req.params.book,
          chapter: w.chapter,
          moduleId: w.moduleId,
        }),
      () => {
        const clientTextSha256 = sha256Text(editedContent);
        const known = previewUnknown !== true; // false when the preview read failed: neither base nor edit is known
        let previewSource = known ? 'base' : null;
        let previewText = sourceIs;
        if (known && latest) {
          previewSource =
            String(latest.editor_id) === String(req.user.id) ? 'own-edit' : 'other-edit';
          previewText = latest.edited_content;
        }
        const previewSha256 = known ? sha256Text(previewText) : null;
        return {
          ...NONE,
          segmentId: w.segmentId,
          occurrence: w.occurrence,
          servedVersionId: w.servedVersionId,
          editingKind: 'segment_edit',
          editingId: w.editId,
          editingContentSha256: clientTextSha256,
          origin: 'propagation',
          content: { text: editedContent, note: noteOf(note), category: category || null },
          before: w.inPlace ? { table: 'segment_edits', row: w.before } : null,
          detail: {
            source: { moduleId: req.params.moduleId, segmentId: sourceSegmentId },
            clientTextSha256,
            previewSha256,
            previewSource,
            ...(previewSource === 'other-edit' || !known ? {} : { previewText }),
            previewMismatch: known ? clientTextSha256 !== previewSha256 : null,
            supersededAcceptanceIds: w.supersededAcceptanceIds,
            batch: { index, size: list.length },
            ...(index === 0 ? { skipped } : {}),
          },
        };
      }
    );
  });
}

/**
 * `module-opened`: the opening's served versions, duplicated ids and in-flight count (spec §5.5, §5.9). No segment,
 * no served version (spec §5.9: NULL) and no client fields (decision 53). Never throws.
 *
 * @param {object} req The module GET request (params, chapterNum).
 * @param {{detail: {servedVersionIds: object[], duplicatedIds: string[], inflightCount: number}}} act
 *   `detail` is moduleOpenings.moduleOpenedDetail's answer.
 * @returns {void}
 */
function emitModuleOpened(req, { detail }) {
  emit(
    () => headFor(req, 'module-opened', placeOf(req)),
    () => ({ ...NONE, content: null, before: null, detail })
  );
}

module.exports = {
  NO_CLIENT,
  NONE,
  headFor,
  emit,
  ITEM_SOURCES,
  CLAIM_VALIDATORS,
  SAVE_EVENT_TYPE,
  readClientFields,
  readAcceptOrigin,
  readReviewedEditSha256,
  claimAssistItems,
  emitSave,
  emitRefused,
  emitPropagation,
  emitAccept,
  emitReview,
  emitSuggestionReject,
  emitSuggestionLeftOpen,
  emitDelete,
  emitRevoke,
  emitComment,
  emitSubmit,
  emitApply,
  emitReviewComplete,
  emitRestore,
  emitModuleOpened,
  ACCEPT_ELIGIBILITY_REFUSALS,
};
