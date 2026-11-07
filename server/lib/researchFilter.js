// server/lib/researchFilter.js — THE FILTER RULE (spec §5.9): before anything reaches research.db,
// another person's data appears only as a hash. Text is hashed, free text is reduced to
// { length, sha256 }, identity is never stored raw, another person's times are dropped, and a
// column nobody classified is dropped.
//
// Before-image field table (spec §5.9 plus plan decisions 9 and 10). A class names what happens:
//   locator        kept            names no person and no time
//   state          kept            ids, enums, hashes the server computed; never text
//   hash           kept or null    a hash a client supplied (displayed_edit_sha256: PR1 stores the echo
//                                  unchecked when decision 39 lets a save through); kept only as 64
//                                  lowercase hex, else null, so a client string never reaches research
//   text           kept or hashed  kept only when the actor wrote it AND no other editor holds the
//                                  same bytes as a live edit (decision 65); else edited_content_sha256
//   free-text      reduced         { length, sha256 } or null
//   identity       dropped         the event's key is the actor's identity (decision 9)
//   base           dropped         the served MT; served_version_id identifies it
//   time:<column>  kept or dropped kept only when <column> is the actor's own (decision 8)
//   applied        boolean         `applied` = applied_at is not null; whose time it is is unknown
//   dropped        dropped
// BEFORE_FIELD_CLASSES must name every column of both editing tables: a drift-guard test fails when a
// migration adds a column nobody classified, which makes a new editing column a decision rather than
// an accident. filterBefore is the only place a before-image is shaped (`record` calls it, so no
// caller can forget). `withheld` is decision 65's set of texts other editors hold as live edits,
// computed by `record` from sessions.db; this module is pure and reads no database.

const { sha256Text } = require('./servedText');
const { canonicalJson } = require('./canonicalJson');
const { ITEM_TYPES, ITEM_CLAIMS, ITEM_OUTCOME_BY_EVENT } = require('./researchVocabulary');

const BEFORE_FIELD_CLASSES = Object.freeze({
  segment_edits: Object.freeze({
    id: 'locator',
    book: 'locator',
    chapter: 'locator',
    module_id: 'locator',
    segment_id: 'locator',
    original_content: 'base',
    edited_content: 'text',
    category: 'state',
    editor_note: 'free-text',
    status: 'state',
    editor_id: 'identity',
    editor_username: 'identity',
    reviewer_id: 'identity',
    reviewer_username: 'identity',
    reviewer_note: 'free-text',
    created_at: 'time:editor_id',
    reviewed_at: 'time:reviewer_id',
    applied_at: 'applied',
    review_id: 'dropped',
    served_version_id: 'state',
    occurrence: 'state',
    origin: 'state',
    displayed_edit_id: 'state',
    displayed_edit_sha256: 'hash',
  }),
  segment_acceptances: Object.freeze({
    id: 'locator',
    book: 'locator',
    chapter: 'locator',
    module_id: 'locator',
    segment_id: 'locator',
    accepted_content: 'base',
    accepted_by: 'identity',
    accepted_by_username: 'identity',
    accepted_at: 'time:accepted_by',
    status: 'state',
    superseded_at: 'dropped',
    superseded_reason: 'state',
    applied_at: 'applied',
    served_version_id: 'state',
    occurrence: 'state',
  }),
});

/** The one place a detail carries a text: event type -> keys that may be withheld. */
const DETAIL_TEXT_KEYS = Object.freeze({ propagation: Object.freeze(['previewText']) });

const NONE_WITHHELD = Object.freeze(new Set());
const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * @param {string|null|undefined} s A free text.
 * @returns {{length: number, sha256: string}|null} Code-point length and hash; null when absent or ''.
 */
function freeText(s) {
  if (s === null || s === undefined || s === '') return null;
  return { length: [...s].length, sha256: sha256Text(s) };
}

const CONTENT_KEYS = ['text', 'note', 'comment', 'category', 'version'];

/**
 * @param {object|null} content An event's content (allowlist: text, note, comment, category, version).
 * @param {{withheld?: Set<string>}} [opts] Decision 65's set.
 * @returns {string|null} Canonical JSON, or null for a null content.
 * @throws {TypeError} On a key outside the allowlist (a caller's textSha256 included).
 */
function filterContent(content, { withheld = NONE_WITHHELD } = {}) {
  if (content === null || content === undefined) return null;
  const out = {};
  for (const key of Object.keys(content)) {
    if (!CONTENT_KEYS.includes(key)) {
      throw new TypeError(`filterContent: unknown key ${key}`);
    }
    const v = content[key];
    if (v === undefined) continue;
    if (key === 'note' || key === 'comment') out[key] = freeText(v);
    else if (key === 'text' && typeof v === 'string' && withheld.has(v)) {
      out.textSha256 = sha256Text(v);
    } else out[key] = v;
  }
  return canonicalJson(out);
}

function filterRow(table, row, actor, withheld) {
  const classes = BEFORE_FIELD_CLASSES[table];
  if (!classes) throw new TypeError(`filterBefore: unknown table ${table}`);
  // Fails closed: with no actor nothing is anyone's own (String(undefined) would match a row holding 'undefined').
  const own = (col) =>
    actor !== null &&
    actor !== undefined &&
    row[col] !== null &&
    row[col] !== undefined &&
    String(row[col]) === String(actor);
  const out = {};
  for (const [col, cls] of Object.entries(classes)) {
    if (!(col in row)) continue;
    if (cls === 'locator' || cls === 'state') out[col] = row[col];
    else if (cls === 'hash') {
      out[col] = typeof row[col] === 'string' && SHA256_HEX.test(row[col]) ? row[col] : null;
    } else if (cls === 'free-text') out[col] = freeText(row[col]);
    else if (cls === 'applied') out.applied = row[col] !== null;
    else if (cls === 'text') {
      if (own('editor_id') && !withheld.has(row[col])) out.edited_content = row[col];
      else out.edited_content_sha256 = row[col] === null ? null : sha256Text(row[col]);
    } else if (cls.startsWith('time:') && own(cls.slice(5))) out[col] = row[col];
    // 'base', 'identity', 'dropped', and another person's time: left out (spec §5.9; decisions 9-10)
  }
  return out;
}

/**
 * @param {{table: string, row: object}|Array<{table: string, row: object}>|null} before
 * @param {string|number} actorProviderId The actor's Entra provider id.
 * @param {{withheld?: Set<string>}} [opts] Decision 65's set.
 * @returns {string|null} Canonical JSON of an array of { table, row }, or null.
 * @throws {TypeError} On an unknown table.
 */
function filterBefore(before, actorProviderId, { withheld = NONE_WITHHELD } = {}) {
  if (before === null || before === undefined) return null;
  const entries = Array.isArray(before) ? before : [before];
  return canonicalJson(
    entries.map(({ table, row }) => ({
      table,
      row: filterRow(table, row, actorProviderId, withheld),
    }))
  );
}

/**
 * @param {string} eventType
 * @param {object|null} detail
 * @param {{withheld?: Set<string>}} [opts] Decision 65's set.
 * @returns {string|null} Canonical JSON; a listed text key is dropped when withheld.
 */
function filterDetail(eventType, detail, { withheld = NONE_WITHHELD } = {}) {
  if (detail === null || detail === undefined) return null;
  const out = { ...detail };
  for (const key of DETAIL_TEXT_KEYS[eventType] || []) {
    if (key in out && withheld.has(out[key])) delete out[key];
  }
  return canonicalJson(out);
}

const ITEM_KEYS = [
  'itemType',
  'source',
  'clientTimeMs',
  'detail',
  'claim',
  'opId',
  'occurrence',
  'category',
  'runId',
  'groupActionId',
  'rulingId',
  'ruleId',
];
const orNull = (v) => (v === undefined ? null : v);

/**
 * @param {string} eventType
 * @param {Array<object>|null} items Validated by the emitter (decision 12).
 * @returns {Array<object>} Rows of research_event_items but event_id.
 * @throws {TypeError} On items for an event type that takes none, or any value outside the vocabulary.
 */
function buildItemRows(eventType, items) {
  if (!items || items.length === 0) return [];
  const outcome = ITEM_OUTCOME_BY_EVENT[eventType];
  if (!outcome) throw new TypeError(`buildItemRows: ${eventType} carries no items`);
  return items.map((it, ordinal) => {
    for (const key of Object.keys(it)) {
      if (!ITEM_KEYS.includes(key)) throw new TypeError(`buildItemRows: unknown key ${key}`);
    }
    if (!ITEM_TYPES.includes(it.itemType)) {
      throw new TypeError(`buildItemRows: unknown itemType ${it.itemType}`);
    }
    if (!ITEM_CLAIMS.includes(it.claim)) {
      throw new TypeError(`buildItemRows: unknown claim ${it.claim}`);
    }
    const t = it.clientTimeMs;
    if (t !== null && t !== undefined && !Number.isFinite(t)) {
      throw new TypeError('buildItemRows: clientTimeMs must be a finite number or null');
    }
    return {
      ordinal,
      item_type: it.itemType,
      outcome,
      source: orNull(it.source),
      op_id: orNull(it.opId),
      occurrence: orNull(it.occurrence),
      category: orNull(it.category),
      run_id: orNull(it.runId),
      group_action_id: orNull(it.groupActionId),
      ruling_id: orNull(it.rulingId),
      rule_id: orNull(it.ruleId),
      client_time_ms: t === null || t === undefined ? null : Math.trunc(t),
      claim: it.claim,
      detail_json: it.detail === null || it.detail === undefined ? null : canonicalJson(it.detail),
    };
  });
}

module.exports = {
  BEFORE_FIELD_CLASSES,
  DETAIL_TEXT_KEYS,
  freeText,
  filterContent,
  filterBefore,
  filterDetail,
  buildItemRows,
};
