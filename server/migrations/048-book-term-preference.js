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
 * ⚠️ EXPANSION IS DELIBERATE AND IS LOGGED, IN THREE SEPARATE CATEGORIES — not
 * one (before, expanded) pair, which cannot tell a harmless case-fold dedup
 * apart from a lost editorial answer. A single old `book_concept_preference` row
 * can, per book_id+chapter:
 *   1. EXPAND cleanly into one or more book_term_preference rows (one per
 *      English term on its concept) — the intended, harmless case.
 *   2. DROP entirely, if its concept has ZERO English concept_term rows (schema
 *      permits this — `lang` is only constrained to en/is/la — so a Latin- or
 *      Icelandic-only concept has nothing for the JOIN below to match). The
 *      INNER JOIN silently excludes these before INSERT OR IGNORE ever runs;
 *      `changes` never reflects them because they never became insert attempts.
 *   3. COLLIDE with a DIFFERENT concept's preference that happens to share the
 *      same (book_id, chapter, english) key under NOCASE. This is NOT the same
 *      as two case-variants of ONE concept's own English term (harmless — same
 *      term_id, same editor answer, safe to dedup). Two DIFFERENT concepts can
 *      genuinely share an English headword (e.g. two senses of "cell") with
 *      DIFFERENT preferred term_ids — INSERT OR IGNORE keeps only one, chosen by
 *      SQL enumeration order, not by anything editorial. That is register §C18's
 *      defect (a database row order deciding an editorial answer) reproduced
 *      inside the very migration meant to end it, so it is reported by name:
 *      the English string plus every contending concept_id/term_id.
 * On production this whole path is a no-op: 0 rows, measured 2026-08-09, and no
 * production code INSERTs into book_concept_preference. A non-zero count in ANY
 * of the three categories, anywhere, is a finding to look at, not a success.
 *
 * ⚠️ Idempotent: migrationRunner calls up() on every server start.
 *
 * ⚠️ NEVER THROW HERE. migrationRunner runs up() unconditionally on every
 * server start; a migration that throws on a box holding a no-English-term or
 * cross-concept-collision row would wedge that server permanently. Reporting
 * loudly (console.warn, one line per finding) is the correct posture — refusal
 * is not, because there is no operator present to un-refuse it.
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

    // Category 2: a book_concept_preference row whose concept has NO English
    // concept_term at all. The expansion JOIN below is an INNER JOIN, so these
    // rows never produce an insert attempt and `changes` cannot see them —
    // they must be found separately, before the JOIN runs and the table drops.
    const findNoEnglish = db.prepare(`
      SELECT p.book_id, p.chapter, p.concept_id
        FROM book_concept_preference p
       WHERE NOT EXISTS (
         SELECT 1 FROM concept_term t WHERE t.concept_id = p.concept_id AND t.lang = 'en'
       )
    `);

    // Category 3: (book_id, chapter, english) keys — under the SAME NOCASE
    // collation book_term_preference's own PRIMARY KEY uses, so this matches
    // what INSERT OR IGNORE actually collides on rather than reimplementing
    // SQLite's (ASCII-only) case fold in JS — that more than one DISTINCT
    // concept_id maps into. A group of size >1 sharing one concept_id (a
    // concept with two case-variant English terms) is the harmless, documented
    // case and is excluded by the HAVING clause.
    const findCollisionGroups = db.prepare(`
      SELECT p.book_id, p.chapter, t.text COLLATE NOCASE AS keyEnglish
        FROM book_concept_preference p
        JOIN concept_term t ON t.concept_id = p.concept_id AND t.lang = 'en'
       GROUP BY p.book_id, p.chapter, t.text COLLATE NOCASE
      HAVING COUNT(DISTINCT p.concept_id) > 1
    `);

    // Every contending row for one flagged group, so the log can name every
    // concept_id/term_id involved — not just the one that happened to survive.
    const findCollisionMembers = db.prepare(`
      SELECT p.concept_id, p.term_id, t.text AS english
        FROM book_concept_preference p
        JOIN concept_term t ON t.concept_id = p.concept_id AND t.lang = 'en'
       WHERE p.book_id = ? AND p.chapter = ? AND t.text = ? COLLATE NOCASE
       ORDER BY p.concept_id
    `);

    // INSERT OR IGNORE: still needed even after the two checks above, because
    // it is what actually resolves a same-concept case-variant collision (the
    // harmless case) and what actually performs the (lossy, now-logged)
    // cross-concept collision resolution the findCollisionGroups query merely
    // detects in advance.
    const expand = db.prepare(`
      INSERT OR IGNORE INTO book_term_preference (book_id, chapter, english, term_id)
      SELECT p.book_id, p.chapter, t.text, p.term_id
        FROM book_concept_preference p
        JOIN concept_term t ON t.concept_id = p.concept_id AND t.lang = 'en'
    `);

    const run = db.transaction(() => {
      const before = db.prepare('SELECT COUNT(*) AS c FROM book_concept_preference').get().c;
      if (before === 0) {
        db.exec('DROP TABLE book_concept_preference');
        return { before, expanded: 0, noEnglish: [], collisions: [] };
      }

      const noEnglish = findNoEnglish.all();
      const collisions = findCollisionGroups.all().map((g) => ({
        book_id: g.book_id,
        chapter: g.chapter,
        english: g.keyEnglish,
        members: findCollisionMembers.all(g.book_id, g.chapter, g.keyEnglish),
      }));

      const res = expand.run();
      db.exec('DROP TABLE book_concept_preference');
      return { before, expanded: res.changes, noEnglish, collisions };
    });
    const { before, expanded, noEnglish, collisions } = run();

    if (before === 0) return;

    // Not a console.log guard: this is the only record that an implicit
    // multi-string reach — or a lost preference — existed on this box. Three
    // counts, not one, because (before, expanded) alone cannot distinguish
    // "harmless case-fold dedup" from "an editor's preference vanished".
    console.warn(
      `[048] book_concept_preference had ${before} row(s): ${expanded} expanded into ` +
        `book_term_preference, ${noEnglish.length} dropped (concept has no English term), ` +
        `${collisions.length} English string(s) collapsed by cross-concept collision.`
    );

    for (const row of noEnglish) {
      console.warn(
        `[048] DROPPED — book_id=${row.book_id} chapter=${row.chapter} ` +
          `concept_id=${row.concept_id} has no English concept_term, so its preference ` +
          `could not be re-keyed onto an English string and was lost. Review manually.`
      );
    }

    for (const c of collisions) {
      const desc = c.members
        .map((m) => `concept_id=${m.concept_id} term_id=${m.term_id} english="${m.english}"`)
        .join('; ');
      console.warn(
        `[048] COLLISION — book_id=${c.book_id} chapter=${c.chapter}: ${c.members.length} ` +
          `distinct concepts share the English string "${c.english}" (case-insensitively). ` +
          `INSERT OR IGNORE kept only one, chosen by SQL enumeration order, not by any ` +
          `editorial signal. Contending rows: ${desc}. Review and re-set the losing ` +
          `book_term_preference row(s) by hand.`
      );
    }
  },
};
