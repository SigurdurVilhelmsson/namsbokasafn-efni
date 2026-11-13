/**
 * servedEdit — the only way to write a `segment_edits` row on a served base (G1.1; spec §5.6,
 * §5.7, §5.10; plan Task 13).
 *
 * `saveOnServedBase` checks a save against the text the server serves NOW, in the spec's order
 * (§5.6 steps 1–6), and stores the served version it was checked against with the row. The
 * segment editor's save route, re-attach by content and any script call it; none of them calls
 * `saveSegmentEdit` directly for a study book. `placeOnServedBase` is steps 1–3 alone, which the
 * accept route shares, and the propagation routes for their source (PR1 review C3).
 *
 * The order, and why each step is where it is:
 *   1. a book that is never minted (organic) is refused before anything is loaded (§5.4, §11);
 *   2. a module with no Icelandic layer has no base to save on (`NO_LAYER`, plan decision 5);
 *   3. placement: an id not served is `SEGMENT_NOT_FOUND`; an id served more than once is
 *      `DUPLICATE_ID` whatever occurrence a caller names, because the loader serves every copy
 *      the first copy's Icelandic (G1.12), so which copy was edited is unknowable; option (b) of
 *      G1.12 was not built, and no chemistry id is duplicated since G1.12 (a), so this is a backstop (R4,
 *      §5.7);
 *   4. a writer with a client view (`requireEcho`) must echo the base hash it was shown
 *      (`BASE_MISSING`, `STALE_BASE`) and the edit it displayed (`STALE_DISPLAYED`, plan
 *      decisions 7 and 39), and that edit must be the one a page loaded now would display
 *      (`UNSEEN_EDIT`, added after the 2026-11-13 interface audit, ED-05);
 *   5. the marker backstop, against the server-loaded base, for every caller (index decision 16);
 *   6. mint the served version and write the row in ONE transaction, so no row is ever stored
 *      without its version and no version is left behind by a save that failed (§5.6 step 6).
 *
 * A refusal is an `Error` with `code`, `refusal: { code, echoedSha256, currentSha256 }` and, for
 * `STRUCTURE_BLOCKED`, `violations`. It carries reason and hashes only, never text, so a later
 * event log can record it as it is.
 */
const segmentParser = require('./segmentParser');
const segmentEditor = require('./segmentEditorService');
const servedVersions = require('./servedVersions');
const segmentValidation = require('../public/js/segment-validation');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const suggestionLogs = require('../lib/suggestionLogs');
const suggestionView = require('./suggestionView');
const log = require('../lib/logger');
const { isStudyBook } = require('../lib/researchScope');
const { sha256Text, isNotMintedBook } = require('../lib/servedText');
const { EDIT_ORIGINS } = require('../lib/editOrigins');
const { pickLatest } = require('../lib/editRecency');

// Icelandic: approved by [USER] 2026-11-04 (index decision 13; BASE_MISSING as worded in plan
// decision 20, plus the "every time it appears" clause [USER] approved the same day after the
// PR1 review). STRUCTURE_BLOCKED is moved verbatim from the route; SEGMENT_NOT_FOUND is today's
// 404 body.
const REFUSAL_MESSAGES = Object.freeze({
  BOOK_NOT_MINTED: 'Þessi bók er ekki í þýðingu og ekki er tekið við breytingum á henni.',
  NO_LAYER: 'Engin íslensk útgáfa er til af þessari einingu, svo ekki er hægt að vista á hana.',
  SEGMENT_NOT_FOUND: 'segment not found',
  DUPLICATE_ID:
    'Auðkenni þessa bútar kemur oftar en einu sinni fyrir í einingunni og ekki er hægt að vista á hann ' +
    'fyrr en það hefur verið lagað.',
  // The only text a page loaded before G1.1's deploy shows (plan decision 33), so it gives the
  // steps that keep the typed text BEFORE it says F5, as a SEQUENCE, never as alternatives:
  //   1. wait for that page's own closePanels confirm (quoted, so it is recognised) and answer
  //      its Hætta við (Cancel) every time it appears, not the pane's own Hætta við button,
  //      which discards the text;
  //   2. copy from the pane;
  //   3. F5.
  // OK at the confirm closes the pane, so copying cannot come first (plan decision 20). The old
  // page asks the confirm up to three times (its reload, then the terms and the repetitions
  // refreshes each re-render), and OK at any of them loses the text: hence "every time"
  // ([USER] 2026-11-04, after the PR1 review, C6).
  BASE_MISSING:
    'Síðunni var hlaðið fyrir uppfærslu ritilsins og vistun var hafnað. Svo að textinn glatist ' +
    'ekki: bíðið eftir spurningunni „Opnum klippispjöldum verður lokað. Viltu halda áfram?“ ' +
    'og veljið þar Hætta við (Cancel) í hvert sinn sem hún birtist (hún getur komið allt að ' +
    'þrisvar), ekki hnappinn Hætta við í bútnum, sem fleygir textanum. ' +
    'Textinn er þá enn á skjánum og má afrita hann úr textareitnum. Endurhlaðið svo síðuna (F5) ' +
    'og vistið aftur.',
  STALE_BASE:
    'Grunntexti bútsins hefur breyst frá því að síðunni var hlaðið. Vistun hafnað: endurhlaðið eininguna og ' +
    'gerið breytinguna aftur.',
  STALE_DISPLAYED:
    'Breytingin sem sýnd var í bútnum hefur breyst eða verið fjarlægð frá því að síðunni var hlaðið. ' +
    'Vistun hafnað: endurhlaðið eininguna.',
  // Interface audit 2026-11-13 (ED-05). NOT yet approved by [USER], unlike the texts above: an edit
  // of this segment is in flight that the page never showed (it was saved from another tab or
  // device, or by another editor, after the page loaded).
  UNSEEN_EDIT:
    'Breyting á þessum bút hefur verið vistuð frá því að síðunni var hlaðið og hún er ekki sýnd hér. ' +
    'Vistun hafnað: endurhlaðið eininguna.',
  STRUCTURE_BLOCKED: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
});
const REFUSAL_STATUS = Object.freeze({
  BOOK_NOT_MINTED: 409,
  NO_LAYER: 409,
  DUPLICATE_ID: 409,
  BASE_MISSING: 409,
  STALE_BASE: 409,
  STALE_DISPLAYED: 409,
  UNSEEN_EDIT: 409,
  SEGMENT_NOT_FOUND: 404,
  STRUCTURE_BLOCKED: 400,
});

function refuse(code, { echoedSha256 = null, currentSha256 = null, violations } = {}) {
  const err = new Error(REFUSAL_MESSAGES[code]);
  err.code = code;
  // Every code carries it (the route's refusal sender keys on it). A hash is null where the code
  // is raised before the hash check (placement) or outside it (STRUCTURE_BLOCKED). A later event
  // log records every code as a refused write: reason and hashes, no text.
  err.refusal = { code, echoedSha256, currentSha256 };
  if (violations) err.violations = violations;
  return err;
}

/**
 * Steps 1–3 of spec §5.6, shared by the save, the accept route and the propagation routes' source.
 * Throws a refusal (`refuse`, which acceptSegment also throws for organic).
 */
function placeOnServedBase({ book, chapter, moduleId, segmentId, occurrence }) {
  if (isNotMintedBook(book)) throw refuse('BOOK_NOT_MINTED');
  const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);
  if (!data.isSource) throw refuse('NO_LAYER');
  const { occurrences, duplicated } = servedVersions.countOccurrences(data.segments);
  const at = data.segments.findIndex((s) => s.segmentId === segmentId);
  if (at < 0) throw refuse('SEGMENT_NOT_FOUND');
  if (duplicated.has(segmentId)) throw refuse('DUPLICATE_ID'); // backstop (R4): occurrence is unknowable
  if (occurrence !== undefined && occurrence !== null && occurrence !== occurrences[at]) {
    throw refuse('SEGMENT_NOT_FOUND');
  }
  return {
    data,
    seg: data.segments[at],
    occurrence: occurrences[at],
    duplicatedIds: [...duplicated].sort(),
  };
}

/**
 * The one mint of a segment's current base (spec §5.4 step 3): the served-version row for the text
 * the server holds now. saveOnServedBase mints through it inside its own transaction; the reject
 * route reaches it through placeAndMintBase. Must run inside a transaction the caller opened.
 *
 * @returns {number} the served version's id
 */
function mintBase(conn, { book, chapter, moduleId, segmentId, placed, seg, layer }) {
  const [servedVersionId] = servedVersions.mintVersions(conn, [
    servedVersions.buildVersionRow({
      book,
      chapter,
      moduleId,
      segmentId,
      occurrence: placed,
      en: seg.en,
      is: seg.is,
      layer,
    }),
  ]);
  return servedVersionId;
}

/**
 * G1.23's reject: place the segment (the same refusals as a save) and mint its current base in one
 * immediate transaction, writing nothing else. Throws a refusal (`refuse`) when it cannot place.
 *
 * @param {{ book: string, chapter: number, moduleId: string, segmentId: string, occurrence: number }} input
 * @returns {{ servedVersionId: number, baseSha256: string, occurrence: number }}
 */
function placeAndMintBase({ book, chapter, moduleId, segmentId, occurrence }) {
  const {
    data,
    seg,
    occurrence: placed,
  } = placeOnServedBase({
    book,
    chapter,
    moduleId,
    segmentId,
    occurrence,
  });
  const conn = segmentEditor.getDb();
  const mint = conn.transaction(() =>
    mintBase(conn, { book, chapter, moduleId, segmentId, placed, seg, layer: data.isSource })
  );
  return {
    servedVersionId: mint.immediate(),
    baseSha256: sha256Text(seg.is),
    occurrence: placed,
  };
}

/**
 * The edit a page loaded now would display for the segment, or null: the newest edit of the segment by the
 * canonical recency rule, if it is in flight. This is the module GET's own choice (routes/segment-editor.js orders
 * each segment's edits with isNewer, and the row displays edits[0] when acceptEligibility.isEditInFlight says so),
 * made from the same rows, so a page that has seen every edit always echoes the id this returns.
 */
function displayedEditNow({ book, moduleId, segmentId }) {
  const rows = segmentEditor
    .getDb()
    .prepare(
      `SELECT id, status, applied_at, created_at, edited_content, editor_id, category, editor_note
       FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?`
    )
    .all(book, moduleId, segmentId);
  const newest = pickLatest(rows);
  return isEditInFlight(newest) ? newest : null;
}

function saveOnServedBase(input) {
  const {
    book,
    chapter,
    moduleId,
    segmentId,
    occurrence,
    editedContent,
    category,
    editorNote,
    editorId,
    editorUsername,
    baseEditId,
    origin,
    requireEcho,
    baseSha256,
    displayedEditId = null,
    displayedEditSha256 = null,
    refuseUnseenEdit = false,
    acceptedSuggestions,
  } = input;
  if (!EDIT_ORIGINS.includes(origin)) {
    throw new TypeError(`saveOnServedBase: origin must be one of ${EDIT_ORIGINS.join(', ')}`);
  }
  if (typeof requireEcho !== 'boolean') {
    throw new TypeError('saveOnServedBase: requireEcho must be a boolean');
  }
  if (typeof editedContent !== 'string') {
    throw new TypeError('saveOnServedBase: editedContent must be a string');
  }

  const {
    data,
    seg,
    occurrence: placed,
  } = placeOnServedBase({ book, chapter, moduleId, segmentId, occurrence });
  const currentSha256 = sha256Text(seg.is);

  if (requireEcho) {
    if (typeof baseSha256 !== 'string' || baseSha256 === '') {
      throw refuse('BASE_MISSING', { currentSha256 });
    }
    if (baseSha256 !== currentSha256) {
      throw refuse('STALE_BASE', { echoedSha256: baseSha256, currentSha256 });
    }
    if (displayedEditId !== null) {
      const shown = segmentEditor.getEditById(displayedEditId);
      // Decision 7: a row of another book, module or segment is not the edit this row displayed.
      // (A chapter-metadata segment id names its chapter, so these three place a row exactly.)
      const here =
        shown &&
        shown.book === book &&
        shown.module_id === moduleId &&
        shown.segment_id === segmentId;
      const shownSha256 = here ? sha256Text(shown.edited_content) : null;
      // Decision 39 ([USER] 2026-11-04, spec AMENDED 2026-11-04): a displayed row of THIS
      // segment that already holds exactly the text being saved passes, so a replay whose first
      // attempt landed is not refused. Compared as hashes, the currency of the pair; sha256Text
      // does not normalise, so equal hashes are equal bytes.
      const alreadyHolds = shownSha256 !== null && shownSha256 === sha256Text(editedContent);
      if (!alreadyHolds && (shownSha256 === null || shownSha256 !== displayedEditSha256)) {
        throw refuse('STALE_DISPLAYED', {
          echoedSha256: displayedEditSha256,
          currentSha256: shownSha256,
        });
      }
    }
    // Interface audit 2026-11-13, ED-05: an in-flight edit this page never showed (UNSEEN_EDIT). The checks above
    // compare only the row the page NAMED, so a page that named none (it loaded before the edit existed), or
    // named an older one, passed, and the save then replaced the editor's own pending text from another tab or
    // device with no message (checkEditConflict looks only at other editors' rows, and only at ids). The edit a
    // page loaded now would show must be the one this page showed. Its own code, not STALE_DISPLAYED: the row
    // the page named, if any, is unchanged, and STALE_DISPLAYED means that row changed or is gone.
    //
    // Only for a caller that says it handles the refusal (`refuseUnseenEdit`; the route passes the body's
    // `handlesUnseenEdit`). A page loaded before this check existed does not keep the text on a code it does not
    // know: its reload would ask closePanels, and OK there loses the text. Such a page is answered as before.
    //
    // One pass, for a replay whose first attempt landed: the edit a page would show now is the caller's own
    // pending row (the row this save would UPDATE) and already holds exactly what is being saved, the text and
    // the category and note with it, so the write changes nothing the page did not show. It is decision 39's
    // reason applied to a page that named no edit, or an older one; decision 39 itself covers only the named
    // row. The hashes a refusal records: what the page named (null when none), and the edit a page would show now.
    if (refuseUnseenEdit) {
      const nowShown = displayedEditNow({ book, moduleId, segmentId });
      if (nowShown && nowShown.id !== displayedEditId) {
        const nowShownSha256 = sha256Text(nowShown.edited_content);
        const ownReplay =
          nowShown.status === 'pending' &&
          String(nowShown.editor_id) === String(editorId) &&
          nowShownSha256 === sha256Text(editedContent) &&
          (nowShown.category || null) === (category || null) &&
          (nowShown.editor_note || null) === (editorNote || null);
        if (!ownReplay) {
          throw refuse('UNSEEN_EDIT', {
            echoedSha256: displayedEditSha256,
            currentSha256: nowShownSha256,
          });
        }
      }
    }
  }

  if (editedContent !== seg.is) {
    // The marker backstop (SR-OOS-2), against the SERVER-loaded base, for every caller (spec
    // §5.6 step 5; moved from routes/segment-editor.js, index decision 16). The client's
    // hard-block gate is bypassable, so the server re-checks the structural markers against its
    // own base, never a caller-supplied one. An identity save skips it: text equal to the base
    // cannot add corruption relative to what is already on disk, even where the base itself
    // would fail an EN-derived rule (an MT base that already dropped a [[MATH:N]]). Warnings are
    // advisory and deliberately not enforced here (design D3).
    const structure = segmentValidation.validateStructure(seg.en, seg.is, editedContent);
    if (structure.blocked) throw refuse('STRUCTURE_BLOCKED', { violations: structure.blocked });
  }

  const displayed =
    requireEcho && displayedEditId !== null
      ? { editId: displayedEditId, sha256: displayedEditSha256 }
      : { editId: null, sha256: null };
  const conn = segmentEditor.getDb();
  // G1.23 (spec §7): the accepted list is recomputed only when the caller names one (an editor save
  // always does; propagation passes none, and scripts/reattach-segment-edits.js calls saveSegmentEdit
  // directly, never this function (it refuses the study book and passes no list); undefined leaves
  // the UPDATE's column as it was and the INSERT writes NULL). The log is
  // read once, here, before the transaction. A log that cannot be read keeps nothing, and never
  // fails the save (R5).
  // A book outside the study does no suggestion work (R22): no log read, the list is NULL.
  const recompute = acceptedSuggestions !== undefined;
  const suggestionWork = recompute && isStudyBook(book);
  let moduleLog = null;
  if (suggestionWork) {
    try {
      moduleLog = suggestionLogs.readModuleLog({ book, chapter, moduleId });
    } catch (err) {
      log.warn(
        { book, chapter, moduleId, reason: (err && (err.code || err.name)) || 'error' },
        'suggestion log read failed; the save keeps no accepted suggestions'
      );
    }
  }
  // One transaction (spec §5.6 step 6): the mint and saveSegmentEdit's own transactions become
  // savepoints inside it, so a save that fails after its mint leaves no served-version row.
  const mintAndSave = conn.transaction(() => {
    const servedVersionId = mintBase(conn, {
      book,
      chapter,
      moduleId,
      segmentId,
      placed,
      seg,
      layer: data.isSource,
    });
    let acceptedSuggestionsJson; // undefined: leave the column as it was
    if (recompute && !suggestionWork) {
      acceptedSuggestionsJson = null;
    } else if (recompute) {
      try {
        const place = { book, chapter, moduleId, segmentId };
        // Two rows, on purpose: what the caller's own editing row already took, and what the row
        // displayed to them took when it is in flight, whoever wrote it. The claim check (task 2)
        // replays on the screen text, which is a different question.
        const own = conn
          .prepare(
            `SELECT id, accepted_suggestions FROM segment_edits
           WHERE book = ? AND module_id = ? AND segment_id = ? AND editor_id = ? AND status = 'pending'`
          )
          .get(book, moduleId, segmentId, editorId);
        const previous = suggestionView.parseAcceptedSuggestions(
          own ? own.accepted_suggestions : null,
          place
        );
        if (displayed.editId !== null && !(own && own.id === displayed.editId)) {
          // (the caller's own row, when displayed, was read above: parsed once, so it warns once)
          const shown = conn
            .prepare(
              'SELECT book, module_id, segment_id, status, applied_at, accepted_suggestions FROM segment_edits WHERE id = ?'
            )
            .get(displayed.editId);
          if (
            shown &&
            shown.book === book &&
            shown.module_id === moduleId &&
            shown.segment_id === segmentId &&
            isEditInFlight(shown)
          ) {
            previous.push(
              ...suggestionView.parseAcceptedSuggestions(shown.accepted_suggestions, place)
            );
          }
        }
        acceptedSuggestionsJson = suggestionView.acceptedForSave(moduleLog, {
          segmentId,
          occurrence: placed,
          editedContent,
          claimed: acceptedSuggestions,
          previous,
        });
      } catch (err) {
        // The save never fails because of the list (spec R5): NULL, and a warning without text.
        acceptedSuggestionsJson = null;
        log.warn(
          {
            book,
            chapter,
            moduleId,
            segmentId,
            reason: (err && (err.code || err.name)) || 'error',
          },
          'accepted suggestions not computed; the save keeps none'
        );
      }
    }
    const r = segmentEditor.saveSegmentEdit({
      book,
      chapter,
      moduleId,
      segmentId,
      originalContent: seg.is, // the server's base, never a caller's (spec §5.6 step 6)
      editedContent,
      category,
      editorNote,
      editorId,
      editorUsername,
      baseEditId,
      servedVersionId,
      occurrence: placed,
      origin,
      displayedEditId: displayed.editId,
      displayedEditSha256: displayed.sha256,
      acceptedSuggestionsJson,
    });
    let outcome = r.updated ? 'updated' : 'inserted';
    if (r.reverted) outcome = r.id === null ? 'unchanged' : 'withdrawn';
    const kept = outcome === 'inserted' || outcome === 'updated';
    return {
      outcome,
      editId: r.id === null ? null : Number(r.id),
      servedVersionId,
      occurrence: placed,
      baseSha256: currentSha256,
      layer: data.isSource,
      editedContentSha256: kept ? sha256Text(editedContent) : null,
      displayed,
      // G1.2 (spec §5.9): the research event's inputs, never a response field.
      before: r.before ?? null,
      supersededEditIds: r.supersededEditIds ?? [],
      supersededAcceptanceIds: r.supersededAcceptanceIds ?? [],
    };
  });
  // IMMEDIATE, because its first statement is the mint's SELECT: a deferred transaction would
  // already hold a read when it asks for the write lock, and SQLite does not run the busy handler
  // for that upgrade, so a lock another process holds (backup-db.sh's checkpoint) would fail the
  // save at once with SQLITE_BUSY instead of waiting the busy timeout (PR1 review C2). The mint's
  // own two passes (a lock-free read, then an IMMEDIATE insert only when a row is missing) run as
  // savepoints inside this transaction (servedVersions.mintVersions, spec §5.4 step 3).
  return mintAndSave.immediate();
}

module.exports = {
  REFUSAL_MESSAGES,
  REFUSAL_STATUS,
  refuse,
  placeOnServedBase,
  placeAndMintBase,
  saveOnServedBase,
};
