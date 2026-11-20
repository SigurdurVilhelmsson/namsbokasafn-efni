/**
 * Predicates the book glossary layer's write refusals and the lookup route share, so the two
 * cannot disagree about what a refusal protects (design §5.1, plan ruling P3).
 *
 * Requires conceptResolver and houseStyleTerms only: bookGlossaryLayer requires this module, and
 * houseStyleTerms must never require the layer (require cycle).
 */
const { matchKey } = require('./conceptResolver');
const { HOUSE_STYLE_SOURCE } = require('./houseStyleTerms');

/**
 * A concept carries the English iff it has an en term whose matchKey equals the form's:
 * build ruling R1 (docs/superpowers/specs/2026-11-19-book-glossary-build-rulings.md).
 *
 * @param {object} db
 * @param {number} conceptId
 * @param {string} english
 * @returns {boolean}
 */
function conceptCarries(db, conceptId, english) {
  const key = matchKey(english);
  return db
    .prepare("SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en'")
    .all(conceptId)
    .some((r) => matchKey(r.text) === key);
}

/**
 * Keep the first spelling of each matchKey, in order. Two spellings of one key would be two en
 * terms the resolver cannot tell apart, and an exact duplicate would reach SQLite's uniqueness
 * check as a raw error instead of a refusal.
 *
 * @param {string[]} forms
 * @returns {string[]}
 */
function dedupeForms(forms) {
  const seen = new Set();
  const out = [];
  for (const f of forms) {
    const k = matchKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

/**
 * House-style concepts in the book's domain chain that carry the English. The one predicate for
 * "a house-style concept is in scope": the write refusal and GET /lookup both call it.
 *
 * @param {object} db
 * @param {number} bookId
 * @param {string} english
 * @returns {Array<{conceptId:number, english:string, icelandic:string|null}>}
 */
function houseStyleInScope(db, bookId, english) {
  const key = matchKey(english);
  const concepts = db
    .prepare(
      `SELECT c.id FROM concept c
        WHERE c.collection = ?
          AND c.domain IN (SELECT domain FROM book_domain_priority WHERE book_id = ?)
        ORDER BY c.id`
    )
    .all(HOUSE_STYLE_SOURCE, bookId);
  const out = [];
  for (const { id } of concepts) {
    const en = db
      .prepare(
        "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'en' ORDER BY rank, id"
      )
      .all(id)
      .find((r) => matchKey(r.text) === key);
    if (!en) continue;
    const is = db
      .prepare(
        "SELECT text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY rank, id LIMIT 1"
      )
      .get(id);
    out.push({ conceptId: id, english: en.text, icelandic: is ? is.text : null });
  }
  return out;
}

/**
 * An editor's term preference (any chapter of the book) protects the headword: excluding the
 * whole headword (conceptId 0), or the concept the preferred term belongs to, would silently
 * override it. `english` is COLLATE NOCASE in the table.
 *
 * @param {object} db
 * @param {number} bookId
 * @param {string} english
 * @param {number} conceptId 0 for a whole-headword exclusion
 * @returns {boolean}
 */
function preferenceBlocksExclusion(db, bookId, english, conceptId) {
  const rows = db
    .prepare(
      `SELECT t.concept_id FROM book_term_preference p
         JOIN concept_term t ON t.id = p.term_id
        WHERE p.book_id = ? AND p.english = ?`
    )
    .all(bookId, english);
  if (rows.length === 0) return false;
  return conceptId === 0 || rows.some((r) => r.concept_id === conceptId);
}

/**
 * Preference rows (any book) whose term is a term of the concept.
 *
 * @param {object} db
 * @param {number} conceptId
 * @returns {number}
 */
function preferencesOnTermsOf(db, conceptId) {
  return db
    .prepare(
      `SELECT COUNT(*) n FROM book_term_preference p
         JOIN concept_term t ON t.id = p.term_id
        WHERE t.concept_id = ?`
    )
    .get(conceptId).n;
}

module.exports = {
  conceptCarries,
  dedupeForms,
  houseStyleInScope,
  preferenceBlocksExclusion,
  preferencesOnTermsOf,
};
