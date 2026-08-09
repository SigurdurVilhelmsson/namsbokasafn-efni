/**
 * Migration 048: replace book_concept_preference with book_term_preference.
 *
 * WHY (register §C36 B4a, §C38): a preference keyed on `concept_id` cannot say
 * what an editor means. An editor acts on an ENGLISH STRING and one concept
 * carries many, so a row set while looking at "accuracy" silently moved every
 * other English string on that concept. Keyed on the string, a row means exactly
 * one thing and its blast radius is exactly the string named in it.
 *
 * ⚠️ This is the table §C36 decision 6 ruled for before 045 shipped the concept
 * key — "two questions, two columns, neither overloaded". Restoring, not inventing.
 *
 * ⚠️ english is COLLATE NOCASE. collectSourceEnglish does NO lowercasing, so the
 * census carries atom/Atom/ATOM as three strings; one editor row must cover all
 * of them. Candidate lookup (concept_term.text) stays CASE-SENSITIVE and is
 * deliberately untouched — folding case there would change which candidates every
 * resolution in the corpus finds.
 *
 * ⚠️ EXPANSION IS DELIBERATE AND IS LOGGED. One old concept row becomes one row
 * per English term on that concept — which MATERIALISES the very blast radius
 * this migration removes, as rows a reviewer can read and delete. On production
 * it is a no-op: 0 rows, measured 2026-08-09, and no production code INSERTs.
 * A non-zero count anywhere is a finding to look at, not a success.
 *
 * ⚠️ Idempotent: migrationRunner calls up() on every server start.
 */
module.exports = {
  name: '048-book-term-preference',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_term_preference (
        book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        chapter  INTEGER NOT NULL,
        english  TEXT    NOT NULL COLLATE NOCASE,
        term_id  INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, chapter, english)
      );
    `);

    const old = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='book_concept_preference'"
      )
      .get();
    if (!old) return; // already migrated on a previous boot

    // INSERT OR IGNORE: two English terms on one concept differing only in case
    // collide under NOCASE. Losing the duplicate is correct — they are the same
    // editor answer — and `changes` still counts what landed.
    const expand = db.prepare(`
      INSERT OR IGNORE INTO book_term_preference (book_id, chapter, english, term_id)
      SELECT p.book_id, p.chapter, t.text, p.term_id
        FROM book_concept_preference p
        JOIN concept_term t ON t.concept_id = p.concept_id AND t.lang = 'en'
    `);

    const run = db.transaction(() => {
      const before = db.prepare('SELECT COUNT(*) AS c FROM book_concept_preference').get().c;
      const res = expand.run();
      db.exec('DROP TABLE book_concept_preference');
      return { before, expanded: res.changes };
    });
    const { before, expanded } = run();

    if (before > 0) {
      // Not a console.log guard: this is the only record that an implicit
      // multi-string reach existed on this box.
      console.warn(
        `[048] expanded ${before} book_concept_preference row(s) into ${expanded} ` +
          `book_term_preference row(s) — review them: a concept row silently covered ` +
          `every English string on its concept.`
      );
    }
  },
};
