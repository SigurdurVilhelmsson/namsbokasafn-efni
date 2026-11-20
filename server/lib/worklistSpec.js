/**
 * What one book-glossary history row asks the worklist to find (design §5.5; plan rulings
 * Q1-Q3). Read-only; requires no service module, so a test on a fresh database stays out of the
 * segment editor's connection.
 */
const { matchKey } = require('./conceptResolver');

const fold = (s) => String(s).toLocaleLowerCase('is');
const NONE = (reason) => ({
  kind: null,
  reason,
  english: [],
  old: [],
  oldForms: [],
  newIcelandic: null,
});

/**
 * One history row of this book, JSON parsed; null when the id is not this book's.
 * @returns {{id:number, action:string, before:object|null, after:object|null}|null}
 */
function readChange(db, bookSlug, changeId) {
  const row = db
    .prepare(
      `SELECT c.id, c.action, c.before_json, c.after_json
         FROM book_glossary_change c
         JOIN registered_books b ON b.id = c.book_id
        WHERE c.id = ? AND b.slug = ?`
    )
    .get(changeId, bookSlug);
  if (!row) return null;
  const parse = (j) => (j == null ? null : JSON.parse(j));
  return {
    id: row.id,
    action: row.action,
    before: parse(row.before_json),
    after: parse(row.after_json),
  };
}

/** Parse a stored inflection list; null when none is known. */
function parseInflections(stored) {
  if (Array.isArray(stored)) return stored;
  if (typeof stored !== 'string') return null;
  try {
    const v = JSON.parse(stored);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Plan ruling Q1: the replaced words, from this book's current single-concept exclusions of the
 * replaced concepts whose key is one of the entry's forms.
 * @returns {{rows: number, words: Array<{icelandic: string, inflections: string[]|null}>}}
 */
function replacedWords(db, bookSlug, after) {
  const keys = new Set((after.english || []).map(matchKey));
  const concepts = new Set(after.replaces || []);
  const rows = db
    .prepare(
      `SELECT e.concept_id, e.match_key, e.icelandic
         FROM book_glossary_exclusion e
         JOIN registered_books b ON b.id = e.book_id
        WHERE b.slug = ?`
    )
    .all(bookSlug)
    .filter((r) => concepts.has(r.concept_id) && keys.has(r.match_key));
  const words = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r.icelandic) continue;
    const mark = `${r.concept_id}\u0001${r.icelandic}`;
    if (seen.has(mark)) continue;
    seen.add(mark);
    const term = db
      .prepare(
        "SELECT text, inflections FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
      )
      .get(r.concept_id);
    const inflections =
      term && term.text === r.icelandic ? parseInflections(term.inflections) : null;
    words.push({ icelandic: r.icelandic, inflections });
  }
  return { rows: rows.length, words };
}

/** Plan ruling Q3: [icelandic, ...inflections] per old word, minus the new Icelandic. */
function finish(kind, english, words, newIcelandic) {
  const old = [];
  const oldForms = [];
  for (const w of words) {
    if (newIcelandic != null && fold(w.icelandic) === fold(newIcelandic)) continue;
    const forms = [w.icelandic, ...(w.inflections || [])].filter(
      (f) => f && (newIcelandic == null || fold(f) !== fold(newIcelandic))
    );
    // Concepts sharing one word (compared case-insensitively) are listed once; their forms merge.
    const seen = old.find((o) => fold(o.icelandic) === fold(w.icelandic));
    if (seen) seen.inflected = seen.inflected || Array.isArray(w.inflections);
    else old.push({ icelandic: w.icelandic, inflected: Array.isArray(w.inflections) });
    for (const f of forms) if (!oldForms.includes(f)) oldForms.push(f);
  }
  if (oldForms.length === 0) return NONE('nothing-to-search');
  return { kind, reason: null, english: [...english], old, oldForms, newIcelandic };
}

/**
 * What the worklist must search for, derived from one history row.
 * @param {object} db
 * @param {string} bookSlug
 * @param {{action:string, before:object|null, after:object|null}} row
 * @returns {{kind:'replacement'|'change'|'removal'|null, reason:string|null, english:string[],
 *   old:Array<{icelandic:string, inflected:boolean}>, oldForms:string[], newIcelandic:string|null}}
 */
function worklistSpec(db, bookSlug, row) {
  const { action, before, after } = row;
  if (action === 'entry-add') {
    if (!after || !(after.replaces || []).length) return NONE('add-alongside');
    const { rows, words } = replacedWords(db, bookSlug, after);
    if (rows === 0) return NONE('exclusion-undone');
    return finish('replacement', after.english, words, after.icelandic);
  }
  if (action === 'entry-change') {
    if (!before || !after || before.icelandic === after.icelandic) return NONE('no-new-word');
    const words = before.icelandic
      ? [{ icelandic: before.icelandic, inflections: parseInflections(before.inflections) }]
      : [];
    return finish('change', after.english, words, after.icelandic);
  }
  if (action === 'entry-remove') {
    const words =
      before && before.icelandic
        ? [{ icelandic: before.icelandic, inflections: parseInflections(before.inflections) }]
        : [];
    return finish('removal', (before && before.english) || [], words, null);
  }
  return NONE('not-applicable');
}

module.exports = { readChange, worklistSpec };
