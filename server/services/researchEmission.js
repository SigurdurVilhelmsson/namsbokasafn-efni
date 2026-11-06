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
 * CLAIM_VALIDATORS. It checks, marks and never refuses (§14 call 17). G1.23 replaces the table's two
 * suggestion entries (ai-suggestion, rule-suggestion) with its own check (§5.10, "G1.23 supplies that
 * check").
 */
const log = require('../lib/logger');
const concordance = require('./concordanceService');
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
// Before G1.23 no suggestion is ever offered, so a claim to have accepted one is false (spec §5.10: "a failed
// check is mismatch"); the item is kept, never dropped or refused (Review Focus 31). G1.23 replaces these two
// entries with its §6 check.
const noSuggestionOffered = () => 'mismatch';

/** One claim rule per item type: (item, at) => 'validated' | 'unverified' | 'mismatch'. */
const CLAIM_VALIDATORS = Object.freeze({
  'repetition-insert': validateRepetition,
  'term-insert': unverified,
  'markup-wrap': unverified,
  'draft-restore': unverified,
  'ai-suggestion': noSuggestionOffered,
  'rule-suggestion': noSuggestionOffered,
});

/**
 * Rebuild a save's assist items from known fields and give each its claim. Never throws.
 *
 * @param {unknown} raw The body's assist list as the client sent it.
 * @param {{book: string, chapter: number|string, moduleId: string, segmentId: string}} place
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
  };
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
        { errorCode: (err && (err.code || err.name)) || 'unknown', itemType: r.itemType },
        'Assist claim check failed; marked unverified'
      );
    }
    items.push({ ...item, claim });
  }
  return { items, droppedCount };
}

module.exports = {
  ITEM_SOURCES,
  CLAIM_VALIDATORS,
  readClientFields,
  readAcceptOrigin,
  readReviewedEditSha256,
  claimAssistItems,
};
