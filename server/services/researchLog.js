/**
 * The research service routes may call (spec §5.11, §5.16). Write-only: nothing here returns a
 * research key or reads research data back to a caller.
 *
 * - **Order (spec §5.11):** the editing record is written and committed first; then the route
 *   calls `record` synchronously, inside the same request; then it answers. The response never
 *   depends on what `record` did, and its result is never read by a route.
 * - **G1.23 calls `record` and never checks consent itself; `record` does.** The gate drops a
 *   decliner's, an undecided editor's and a visitor's act before anything is written or counted
 *   (R1): counting a decliner's activity would itself be capture.
 * - **`record` cannot throw,** so it is called bare: activityLogCallsiteGuard.test.js refuses a
 *   try-wrapped call in routes/ and services/. Its failure log carries four fields and no content.
 * - Services expose only write functions to routes (§5.16); research rows are never changed after
 *   they are written (§5.9, researchAppendOnly.test.js).
 * - Research ids are BigInt (decision 4): the handle reads with safe integers and no id is ever
 *   converted to Number.
 */
const crypto = require('crypto');
const log = require('../lib/logger');
const researchDb = require('./researchDb');
const researchConsent = require('./researchConsent');
const userService = require('./userService');
const { isStudyBook } = require('../lib/researchScope');
const { sha256Text } = require('../lib/servedText');
const { getServerCommit } = require('../lib/serverCommit');
const { flagSnapshotJson } = require('../lib/featureFlags');
const { EVENT_TYPES, EDITING_KINDS } = require('../lib/researchVocabulary');
const { EDIT_ORIGINS, RESERVED_EDIT_ORIGINS } = require('../lib/editOrigins');
const {
  filterContent,
  filterBefore,
  filterDetail,
  buildItemRows,
} = require('../lib/researchFilter');

/**
 * Mint the editor key for a consent interval (spec §5.16). Write-only: never returns the key.
 * Never throws.
 * @param {number} intervalId the id of the interval's starting research_consent row
 * @returns {{status: 'minted' | 'exists' | 'failed'}}
 */
function ensureKey(intervalId) {
  try {
    if (!Number.isSafeInteger(intervalId) || intervalId < 1) return { status: 'failed' };
    const db = researchDb.getHandle();
    return db
      .transaction(() => {
        if (db.prepare('SELECT 1 FROM editor_keys WHERE interval_id = ?').get(intervalId)) {
          return { status: 'exists' };
        }
        db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(
          intervalId,
          crypto.randomBytes(16).toString('hex')
        );
        return { status: 'minted' };
      })
      .immediate();
  } catch (err) {
    // record() mints the key at the interval's first event when this fails (spec §5.16).
    log.error({ errorCode: err.code || err.name }, 'Editor key not minted at consent (spec §5.16)');
    researchDb.noteFailure(err);
    return { status: 'failed' };
  }
}

// /api/health reports it (spec §5.20); set on a failed consent lookup.
let consentFlag = false;

/** @returns {boolean} whether the last consent lookup failed */
function consentLookupFailing() {
  return consentFlag;
}

/** Test-only: forget the consent-lookup flag. */
function _reset() {
  consentFlag = false;
}

/**
 * The one failure log (decision 21). ONLY these four fields (spec §5.11 step 2): no content,
 * before-image, detail, key or user id reaches journald, and never `err` or its message.
 */
function logLoss(err, ev, errorClass) {
  log.error(
    {
      errorCode: (err && (err.code || err.name)) || null,
      errorClass,
      eventType: ev?.eventType ?? null,
      book: ev?.book ?? null,
    },
    'research capture lost (spec §5.11)'
  );
}

/**
 * Record one research event (spec §5.11). Never throws.
 * @param {object} event the act: actorProviderId, eventType, book, chapter, moduleId (required),
 *   and the optional fields of spec §5.9's input list, plus editingContentSha256 (decision 7)
 * @returns {{status: 'written', eventId: bigint} | {status: 'duplicate'}
 *   | {status: 'skipped', reason: 'not-study' | 'no-user' | 'not-consenting' | 'before-consent'}
 *   | {status: 'lost', reason: string, ledgered: boolean}}
 */
function record(event) {
  // A plain copy of the top-level fields, taken FIRST and inside its own try: a getter or a proxy
  // that throws is met here, once. Everything after reads only this copy, so the catch below (and
  // Task 12's loss handlers, which read ev.book, ev.chapter, …) cannot throw by reading the field
  // that failed. Nested values (content, before, …) are read inside the build.
  let ev;
  try {
    ev = event !== null && typeof event === 'object' ? { ...event } : {};
  } catch (err) {
    logLoss(err, null, 'other');
    return { status: 'lost', reason: 'other', ledgered: false };
  }
  try {
    return recordInner(ev);
  } catch (err) {
    logLoss(err, ev, 'other');
    return { status: 'lost', reason: 'other', ledgered: false };
  }
}

function classifyError(err) {
  const code = (err && err.code) || '';
  // researchDb's busy cool-off fails fast with reason 'busy': the same loss as the busy write that started it.
  if (code === 'RESEARCH_UNAVAILABLE') return err.reason === 'busy' ? 'busy' : 'unavailable';
  if (/^SQLITE_(BUSY|LOCKED)/.test(code)) return 'busy';
  if (/^SQLITE_CONSTRAINT/.test(code)) return 'constraint';
  return 'other';
}

const actionIdOf = (ev) => (typeof ev.clientActionId === 'string' ? ev.clientActionId : null);

/**
 * Steps 4-5 failed for a consenting actor: one content-free ledger row (spec §5.11 step 6). Reads
 * only the plain copy `record` took, so a throwing getter cannot make this throw.
 * @param {boolean} [fromResearchWrite] whether the research handle or its write raised `err`. Only then
 *   is it noted against the handle: a sessions.db error in the build must never close, cool off or
 *   stick the research handle (final review M5).
 */
function lose(err, ev, intervalId, fromResearchWrite = false) {
  const errorClass = classifyError(err);
  if (fromResearchWrite) researchDb.noteFailure(err);
  logLoss(err, ev, errorClass);
  const ledgered = researchConsent.recordLoss({
    intervalId,
    book: ev.book,
    chapter: ev.chapter,
    moduleId: ev.moduleId,
    eventType: ev.eventType,
    errorClass,
    clientActionId: actionIdOf(ev),
    nowMs: Date.now(),
  });
  return { status: 'lost', reason: errorClass, ledgered };
}

/** Steps 2-3 failed: consent could not be read, so the act cannot be told from a decliner's (decision 17). */
function consentUnknown(err, ev) {
  consentFlag = true; // /api/health reports it (spec §5.20) until a lookup succeeds again
  logLoss(err, ev, 'consent-unknown');
  const ledgered = researchConsent.recordLoss({
    intervalId: null,
    book: ev.book,
    chapter: ev.chapter,
    moduleId: ev.moduleId,
    eventType: ev.eventType,
    errorClass: 'consent-unknown',
    clientActionId: actionIdOf(ev),
    nowMs: Date.now(),
  });
  return { status: 'lost', reason: 'consent-unknown', ledgered };
}

function recordInner(ev) {
  if (!isStudyBook(ev.book)) return { status: 'skipped', reason: 'not-study' }; // step 1
  let user;
  let capture;
  try {
    user = userService.findByProviderId(ev.actorProviderId); // step 2
    if (!user) return { status: 'skipped', reason: 'no-user' };
    capture = researchConsent.captureStateFor(user.id); // step 3
  } catch (err) {
    return consentUnknown(err, ev);
  }
  consentFlag = false;
  if (!capture.capturing) return { status: 'skipped', reason: 'not-consenting' };
  // Decision 16: a replay is captured only if its client time proves it came after consent.
  if (
    ev.replayed === true &&
    !(Number.isFinite(ev.clientActionTime) && ev.clientActionTime >= capture.startedAtMs)
  ) {
    return { status: 'skipped', reason: 'before-consent' };
  }
  if (ev.buildFailed === true) {
    // The route's builder threw before record could build anything (decision 14). After the gate,
    // so only a consenting actor's failure is counted.
    return lose(
      Object.assign(new Error('research event build failed'), { code: 'BUILD_FAILED' }),
      ev,
      capture.intervalId
    );
  }
  let row;
  let items;
  try {
    // step 4: validation and sessions.db reads, plus research.db index probes when the content
    // carries a text on the event's own segment or the before-image holds a row the actor owns
    // (decision 65, AMENDED 2026-11-07); never a research lock
    row = buildEvent(ev);
    items = buildItemRows(ev.eventType, ev.items);
  } catch (err) {
    return lose(err, ev, capture.intervalId);
  }
  try {
    return writeEvent(capture.intervalId, row, items); // step 5
  } catch (err) {
    return lose(err, ev, capture.intervalId, true);
  }
}

const ORIGINS = new Set([...EDIT_ORIGINS, ...RESERVED_EDIT_ORIGINS]);
const HEX64 = /^[0-9a-f]{64}$/;
// An absent optional field is null (spec §5.9 lists them "as the tables above say"); an absent
// REQUIRED field fails its check below.
const opt = (v) => (v === undefined ? null : v);
const isIntOrNull = (v) => v === null || Number.isSafeInteger(v);

function invalid(field) {
  return new TypeError(`research event: invalid ${field}`); // never the value (decision 21)
}

/**
 * Validates the event and assembles its row, before any research lock is taken (step 4).
 * Throws on anything outside the vocabulary or a served version that names no row (decision 7).
 */
function buildEvent(ev) {
  const segmentId = opt(ev.segmentId);
  const occurrence = opt(ev.occurrence);
  const servedVersionId = opt(ev.servedVersionId);
  const editingKind = opt(ev.editingKind);
  const editingId = opt(ev.editingId);
  const editingContentSha256 = opt(ev.editingContentSha256);
  const origin = opt(ev.origin);

  if (!EVENT_TYPES.includes(ev.eventType)) throw invalid('eventType');
  if (!Number.isSafeInteger(ev.chapter)) throw invalid('chapter');
  if (typeof ev.moduleId !== 'string') throw invalid('moduleId');
  if (segmentId !== null && typeof segmentId !== 'string') throw invalid('segmentId');
  if (!isIntOrNull(occurrence)) throw invalid('occurrence');
  if (!isIntOrNull(servedVersionId)) throw invalid('servedVersionId');
  if (!isIntOrNull(editingId)) throw invalid('editingId');
  if (editingKind !== null && !EDITING_KINDS.includes(editingKind)) throw invalid('editingKind');
  if ((editingKind === null) !== (editingId === null)) throw invalid('editingKind/editingId');
  if (editingContentSha256 !== null && !HEX64.test(editingContentSha256)) {
    throw invalid('editingContentSha256');
  }
  if (origin !== null && !ORIGINS.has(origin)) throw invalid('origin');

  const conn = researchConsent.getSessionsDb();
  // Decision 7: the base is looked up, never passed. A NULL served version (module-opened,
  // module-submit, review-complete, apply, restore, write-refused: spec §5.9) has no base; only an
  // id that names no row fails the build.
  let baseIsSha256 = null;
  if (servedVersionId !== null) {
    const sv = conn
      .prepare('SELECT is_sha256 FROM served_text_versions WHERE id = ?')
      .get(servedVersionId);
    if (!sv) {
      throw Object.assign(new Error('research event: served version not found'), {
        code: 'SERVED_VERSION_MISSING',
      });
    }
    baseIsSha256 = sv.is_sha256;
  }
  const withheld = othersLiveTexts(ev);
  const commit = getServerCommit();
  const clientActionId = ev.clientActionId;
  return {
    event_type: ev.eventType,
    client_action_id:
      typeof clientActionId === 'string' &&
      clientActionId.length >= 1 &&
      clientActionId.length <= 128
        ? clientActionId
        : null,
    client_action_time_ms: Number.isFinite(ev.clientActionTime)
      ? Math.trunc(ev.clientActionTime)
      : null,
    server_time_ms: Date.now(),
    replayed: ev.replayed === true ? 1 : 0,
    session_id: typeof ev.sessionId === 'string' ? ev.sessionId : null,
    book: ev.book,
    chapter: ev.chapter,
    module_id: ev.moduleId,
    segment_id: segmentId,
    occurrence,
    served_version_id: servedVersionId,
    base_is_sha256: baseIsSha256,
    editing_kind: editingKind,
    editing_id: editingId,
    editing_content_sha256: editingContentSha256,
    origin,
    content_json: filterContent(ev.content, { withheld }),
    before_json: filterBefore(ev.before, ev.actorProviderId, { withheld }),
    detail_json: filterDetail(ev.eventType, ev.detail, { withheld }),
    flag_snapshot_json: flagSnapshotJson(ev.book, { conn }), // once per event: it costs a read per flag
    server_commit: commit.serverCommit,
    commit_source: commit.commitSource,
    code_dirty: commit.codeDirty,
  };
}

// Decision 65 (spec AMENDED 2026-11-04): the texts OTHER editors hold as live edits on the segments
// this event names: its own segment, and a propagation's source (detail.source, decision 54); since
// the AMENDED 2026-11-07 block, also the source of each propagation onto the segment of a row the
// actor's before-image carries with that row's current text, or onto the event's own segment with
// the content's text (propagatedCopySources, below). "Live" is
// propagationService.latestEditedText's predicate, verbatim (the test pins the string). Read on the
// sessions.db connection after the act committed: the route is synchronous from its write to emit,
// and no save or propagation changes another editor's row, so these are the rows the act met. Runs
// after the gate (step 4), so a decliner's, a visitor's or a non-study request never pays for it; a
// throw here is a build failure (a counted loss, Task 12).
const LIVE_EDITS_SQL = `SELECT editor_id, edited_content FROM segment_edits
   WHERE book = ? AND module_id = ? AND segment_id = ? AND status NOT IN ('rejected', 'superseded')`;
// The same "live" predicate, book-wide, for a set of exact texts (the propagated copies whose source is
// unknown), in ONE query per event: an apply's before-image can carry many such rows, and one query per
// text scans the book's rows once per text. The texts are bound as one JSON array of strings, which
// json_each decodes; edited_content is declared with no collation (BINARY), so a row is returned exactly
// when `edited_content = ?` would have matched one of the texts.
const LIVE_TEXTS_IN_BOOK_SQL = `SELECT editor_id, edited_content FROM segment_edits
   WHERE book = ? AND edited_content IN (SELECT value FROM json_each(?))
     AND status NOT IN ('rejected', 'superseded')`;
// The propagation events onto one segment with one text (research.db, read only): a propagation
// event's segment is its target. Each call is one probe of the partial index
// idx_research_events_propagation_target on all five columns (research schema version 2); the
// chapter is bound as stored, an integer. `event_type = 'propagation'` stays a LITERAL: SQLite uses a
// partial index only for a query whose WHERE implies the index's (researchSchema.test.js reads this
// SQL from this file and checks its query plan).
const PROPAGATIONS_ONTO_SQL = `SELECT detail_json FROM research_events
   WHERE event_type = 'propagation' AND book = ? AND chapter = ? AND module_id = ?
     AND segment_id = ? AND editing_content_sha256 = ?`;

// decision 8's comparison; a row with no editor_id is another person's (String(null) is never an actor)
const isOthers = (editorId, actor) => String(editorId) !== String(actor);

function othersLiveTexts(ev) {
  const named = [[ev.moduleId, ev.segmentId]];
  const src = ev.eventType === 'propagation' && ev.detail ? ev.detail.source : null;
  if (src) named.push([src.moduleId, src.segmentId]);
  const copies = propagatedCopySources(ev);
  named.push(...copies.sources);
  const withheld = new Set();
  const conn = researchConsent.getSessionsDb();
  const stmt = conn.prepare(LIVE_EDITS_SQL);
  const seen = new Set();
  for (const [moduleId, segmentId] of named) {
    if (typeof moduleId !== 'string' || typeof segmentId !== 'string') continue; // names no segment
    const key = JSON.stringify([moduleId, segmentId]);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const r of stmt.all(ev.book, moduleId, segmentId)) {
      if (isOthers(r.editor_id, ev.actorProviderId) && typeof r.edited_content === 'string') {
        withheld.add(r.edited_content);
      }
    }
  }
  if (copies.unknownTexts.length > 0) {
    // Each distinct text once, keyed as better-sqlite3 binds a string: well-formed, a lone surrogate
    // becoming U+FFFD (a JSON escape of one would decode to other bytes and match nothing). A returned row
    // withholds every text that binds to its content, which is what one query per text withheld.
    const byBound = new Map();
    for (const text of copies.unknownTexts) {
      const bound = text.toWellFormed();
      if (!byBound.has(bound)) byBound.set(bound, new Set());
      byBound.get(bound).add(text);
    }
    const rows = conn
      .prepare(LIVE_TEXTS_IN_BOOK_SQL)
      .all(ev.book, JSON.stringify([...byBound.keys()]));
    for (const r of rows) {
      if (isOthers(r.editor_id, ev.actorProviderId) && byBound.has(r.edited_content)) {
        for (const text of byBound.get(r.edited_content)) withheld.add(text);
      }
    }
  }
  return withheld;
}

/**
 * Decision 65 as AMENDED 2026-11-07 (finding C1, refined the same day on findings I1, the residual, I-R1 and
 * I-R2). Editor A propagates editor B's live text X, so A holds a copy of X on each target. X came from the
 * propagation's source segment, which a later event on the copy need not name: a re-save, withdraw or delete
 * names the target, an apply names no segment. So a text this event is about to store is looked up among the
 * `propagation` events onto ITS segment (book, chapter, module, segment: a propagation event's segment is its
 * target) whose editing_content_sha256 is the sha256 of that text, and each match's detail.source joins the
 * segments othersLiveTexts checks.
 *
 * Keyed on the segment and the text, never on the row id or on `origin`: an unchanged re-save rewrites origin
 * to 'editor-save' and a copy edited away and back carries X under another origin (finding I1), and a copy
 * deleted or withdrawn and typed again lives in a new row with a new id (finding I-R2). The chapter is part of
 * the key because `chapter-metadata` is one module id shared by every chapter.
 *
 * What is looked up: (1) every segment_edits row in the before-image that the actor owns, whatever its origin,
 * by the row's own segment and current text. This follows the row, not the event, so it applies to every event
 * type, including those that name no segment. (2) When the content carries a text and the event names its own
 * segment, that text, by the event's segment (the residual: a save that types X onto the copy's segment again).
 *
 * The fallback: a before-row from (1) that matches no event and whose origin is `propagation` or NULL has an
 * unknown source (the propagation was not captured, or its write was lost; or the row predates migration 053,
 * which added `origin` with no backfill: finding I-R1), so its text is checked against other editors' live edits
 * anywhere in the event's book. An absent origin reads as NULL, as every absent field does here (`opt`). No
 * fallback for any other origin (a book-wide check of every own row is the wide check the lead declined), and
 * none for content.
 *
 * The before-image is read as filterBefore reads it: one { table, row } or an array of them (emitApply has
 * already flattened apply's losers and self-heal rows into that array). research.db is read only when there is
 * something to look up, one index probe per distinct (segment, text) (research schema version 2); an act with
 * nothing to look up pays nothing here.
 * @returns {{sources: Array<[string, string]>, unknownTexts: string[]}}
 */
function propagatedCopySources(ev) {
  const sources = [];
  const unknownTexts = [];
  const lookups = [];
  const content = ev.content;
  if (
    typeof ev.segmentId === 'string' &&
    content !== null &&
    content !== undefined &&
    typeof content.text === 'string'
  ) {
    // The event's own segment with the text its content carries (the residual): never the book-wide check.
    const key = segmentKey(ev.book, ev.chapter, ev.moduleId, ev.segmentId);
    if (key) lookups.push(lookupOf(key, content.text, false));
  }
  const actor = ev.actorProviderId;
  const before = ev.before;
  // Fails closed as filterRow's own() does: with no actor, no row is anyone's own.
  const beforeRows =
    actor === null || actor === undefined || before === null || before === undefined
      ? []
      : Array.isArray(before)
        ? before
        : [before];
  for (const entry of beforeRows) {
    const row = entry && entry.table === 'segment_edits' ? entry.row : null;
    if (
      !row ||
      typeof row.edited_content !== 'string' ||
      row.editor_id === null ||
      row.editor_id === undefined ||
      String(row.editor_id) !== String(actor)
    ) {
      continue;
    }
    const unknownIfMissed =
      row.origin === 'propagation' || row.origin === null || row.origin === undefined;
    const key = segmentKey(row.book, row.chapter, row.module_id, row.segment_id);
    if (key) {
      lookups.push(lookupOf(key, row.edited_content, unknownIfMissed));
    } else if (unknownIfMissed) {
      // A row whose segment cannot be read cannot be matched to an event: a copy's source is unknown.
      unknownTexts.push(row.edited_content);
    }
  }
  if (lookups.length === 0) return { sources, unknownTexts };

  // probe -> the readable sources of the events it matched
  const matched = new Map();
  try {
    const stmt = statementsFor(researchDb.getHandle()).propagationsOnto;
    for (const { probe, params } of lookups) {
      if (matched.has(probe)) continue; // an unchanged re-save's content and its before-row share one
      matched.set(
        probe,
        stmt
          .all(...params)
          .map((e) => sourceOf(e.detail_json))
          .filter((source) => source !== null)
      );
    }
  } catch (err) {
    // A research-handle error is noted against the handle (lose() notes only the write's errors);
    // rethrown, it is a build failure and a counted loss.
    researchDb.noteFailure(err);
    throw err;
  }
  for (const { probe, text, unknownIfMissed } of lookups) {
    const found = matched.get(probe);
    sources.push(...found);
    // An event whose detail names no readable source does not count as found: the book is checked instead.
    if (found.length === 0 && unknownIfMissed) unknownTexts.push(text);
  }
  return { sources, unknownTexts };
}

/**
 * A segment as the lookup's key, or null when a part of it cannot be read. The chapter is an integer as
 * segment_edits and research_events store it (a sessions.db handle reads it as a Number; a BigInt binds the same).
 * @returns {[string, number|bigint, string, string] | null}
 */
function segmentKey(book, chapter, moduleId, segmentId) {
  return typeof book === 'string' &&
    (Number.isSafeInteger(chapter) || typeof chapter === 'bigint') &&
    typeof moduleId === 'string' &&
    typeof segmentId === 'string'
    ? [book, chapter, moduleId, segmentId]
    : null;
}

/**
 * One text to look up on one segment: PROPAGATIONS_ONTO_SQL's parameters, and `probe`, which is equal for two
 * lookups exactly when their parameters are (String(chapter): 1 and 1n are one chapter).
 * @param {[string, number|bigint, string, string]} key segmentKey's answer
 * @param {string} text
 * @param {boolean} unknownIfMissed whether a miss is checked book-wide (the fallback)
 */
function lookupOf(key, text, unknownIfMissed) {
  const [book, chapter, moduleId, segmentId] = key;
  const textSha256 = sha256Text(text);
  return {
    params: [book, chapter, moduleId, segmentId, textSha256],
    probe: JSON.stringify([book, String(chapter), moduleId, segmentId, textSha256]),
    text,
    unknownIfMissed,
  };
}

/** A propagation event's detail.source as [moduleId, segmentId], or null when it cannot be read. */
function sourceOf(detailJson) {
  try {
    const source = JSON.parse(detailJson).source;
    return typeof source.moduleId === 'string' && typeof source.segmentId === 'string'
      ? [source.moduleId, source.segmentId]
      : null;
  } catch {
    return null; // an unreadable detail names no source: the caller checks the book instead
  }
}

// Written out, not generated, so a grep for the writer finds it (researchAppendOnly.test.js aims at
// this text). Named parameters: a row missing a column fails loudly instead of binding NULL.
const INSERT_EVENT_SQL = `INSERT INTO research_events (id, key_seq, event_type, editor_key,
     client_action_id, client_action_time_ms, server_time_ms, replayed, session_id, book, chapter,
     module_id, segment_id, occurrence, served_version_id, base_is_sha256, editing_kind, editing_id,
     editing_content_sha256, origin, content_json, before_json, detail_json, flag_snapshot_json,
     server_commit, commit_source, code_dirty)
   VALUES (@id, @key_seq, @event_type, @editor_key,
     @client_action_id, @client_action_time_ms, @server_time_ms, @replayed, @session_id, @book, @chapter,
     @module_id, @segment_id, @occurrence, @served_version_id, @base_is_sha256, @editing_kind, @editing_id,
     @editing_content_sha256, @origin, @content_json, @before_json, @detail_json, @flag_snapshot_json,
     @server_commit, @commit_source, @code_dirty)`;
const INSERT_ITEM_SQL = `INSERT INTO research_event_items (event_id, ordinal, item_type, outcome,
     source, op_id, occurrence, category, run_id, group_action_id, ruling_id, rule_id, client_time_ms,
     claim, detail_json)
   VALUES (@event_id, @ordinal, @item_type, @outcome,
     @source, @op_id, @occurrence, @category, @run_id, @group_action_id, @ruling_id, @rule_id, @client_time_ms,
     @claim, @detail_json)`;

// Prepared once per handle: researchDb reopens after a restart-like reset, and a statement must
// never outlive the handle it was prepared on.
const statements = new WeakMap();
function statementsFor(db) {
  let s = statements.get(db);
  if (!s) {
    s = {
      selectKey: db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?'),
      insertKey: db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)'),
      selectAction: db.prepare(
        'SELECT 1 FROM research_events WHERE editor_key = ? AND client_action_id = ?'
      ),
      maxSeq: db.prepare(
        'SELECT COALESCE(MAX(key_seq), 0) AS m FROM research_events WHERE editor_key = ?'
      ),
      insertEvent: db.prepare(INSERT_EVENT_SQL),
      insertItem: db.prepare(INSERT_ITEM_SQL),
      propagationsOnto: db.prepare(PROPAGATIONS_ONTO_SQL),
    };
    statements.set(db, s);
  }
  return s;
}

/** Decision 4: a random positive 63-bit BigInt, redrawn if zero. A collision is a constraint loss. */
function randomEventId() {
  for (;;) {
    const id = BigInt(`0x${crypto.randomBytes(8).toString('hex')}`) & 0x7fffffffffffffffn;
    if (id !== 0n) return id;
  }
}

/**
 * Step 5: the event and its items in one BEGIN IMMEDIATE transaction (decision 5), so the key_seq
 * read and the insert are atomic against any other connection. A duplicate is found by a SELECT
 * before the insert, never by catching UNIQUE (decision 6): a duplicate is not a loss.
 */
function writeEvent(intervalId, row, items) {
  const db = researchDb.getHandle();
  const s = statementsFor(db);
  return db
    .transaction(() => {
      let key = s.selectKey.get(intervalId)?.editor_key;
      if (!key) {
        key = crypto.randomBytes(16).toString('hex');
        s.insertKey.run(intervalId, key); // minted at the first event if minting at consent failed (§5.16)
      }
      if (row.client_action_id !== null && s.selectAction.get(key, row.client_action_id)) {
        return { status: 'duplicate' };
      }
      // key_seq is a per-key counter, not an id: on this safe-integer handle MAX reads as a BigInt.
      const keySeq = Number(s.maxSeq.get(key).m) + 1;
      const id = randomEventId();
      s.insertEvent.run({ ...row, id, editor_key: key, key_seq: keySeq });
      items.forEach((it) => s.insertItem.run({ ...it, event_id: id }));
      return { status: 'written', eventId: id };
    })
    .immediate();
}

module.exports = { record, ensureKey, consentLookupFailing, _reset };
