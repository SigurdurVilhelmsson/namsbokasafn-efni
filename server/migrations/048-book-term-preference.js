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
 * ⚠️ NEVER THROW HERE, FOR ANY REASON. migrationRunner runs up() unconditionally
 * on every server start and `failLoudOnMigrationErrors` turns a collected error
 * into `exit(1)`, so a migration that throws wedges that box permanently — it
 * will not boot again until a human edits the database. Reporting loudly
 * (console.warn, one line per finding) is the correct posture; refusal is not,
 * because there is no operator present to un-refuse it.
 *
 * ⚠️ THE CAUSE LIST BELOW IS **NOT EXHAUSTIVE**, and presenting it as if it were
 * is what let a fourth cause through unnoticed (whole-branch review, 2026-08-09).
 * An earlier version of this header enumerated three causes and stopped, which
 * reads as a closed set. The causes known TODAY are:
 *   ① a concept with no English concept_term (category 2 below);
 *   ② a cross-concept NOCASE collision (category 3 below);
 *   ③ an ordinary SQLite error on the DDL;
 *   ④ ⚠️ **A FOREIGN KEY VIOLATION ON THE EXPANSION INSERT.** `INSERT OR IGNORE`
 *      does **NOT** suppress this — SQLite's `ON CONFLICT` clause covers
 *      NOT NULL / UNIQUE / PRIMARY KEY / CHECK **only**, never FOREIGN KEY.
 *      Measured directly with better-sqlite3: an `INSERT OR IGNORE … SELECT`
 *      feeding a dangling child row raises `SQLITE_CONSTRAINT_FOREIGNKEY:
 *      FOREIGN KEY constraint failed`. A `book_concept_preference` row whose
 *      `term_id` no longer names a live `concept_term` therefore aborts
 *      `expand.run()`.
 *      ⚠️ 045's `ON DELETE CASCADE` does NOT preclude that row. A dangling row
 *      arises whenever foreign keys were OFF when the parent was deleted, and
 *      that is (a) this repo's own established test-fixture idiom
 *      (`resolvedGlossary.test.js`, `conceptResolverIntegrity.test.js` both
 *      `pragma('foreign_keys = OFF')` to plant exactly this) and (b) **the
 *      system `sqlite3` CLI's default** — CLAUDE.md flags that CLI as a trap in
 *      the other direction, and an operator deleting a `concept_term` row with
 *      it leaves the dangling row behind with no warning at all.
 * Because the list is open, the handler below catches **everything**, not FK
 * alone, and the accounting check exists so that a FIFTH cause cannot hide by
 * construction.
 *
 * ⚠️ ON A CAUGHT FAILURE THE OLD TABLE IS LEFT IN PLACE, DELIBERATELY. The
 * `DROP TABLE` lives INSIDE `db.transaction(...)`, so a throw rolls the whole
 * unit back and `book_concept_preference` survives with its rows intact. The
 * migration then re-attempts on every subsequent boot and re-reports until an
 * operator fixes the data — which is the intended behaviour, not a leak: the
 * alternative is losing an editor's preferences to a data fault nobody saw.
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

    // ⚠️ THE ACCOUNTING, IN **SOURCE-ROW** UNITS. `before` counts rows in
    // book_concept_preference; `expanded` (res.changes) counts rows written to
    // book_term_preference — DIFFERENT UNITS, because one source row expands
    // into one destination row PER English term. The obvious identity
    // `before === expanded + noEnglish + collisionLosses` is therefore WRONG and
    // fires on this migration's own passing test (migration048.test.js's
    // "expands one concept row into one row per English term": before=1,
    // expanded=2). A permanent false warning on the file's own fixture is worse
    // than no check, so the unit is normalised to source rows here.
    //
    // ⚠️ MEASURED FROM THE DESTINATION, NOT COMPUTED BY SUBTRACTION. `survived`
    // and `lost` are two independent queries against book_term_preference AFTER
    // the insert; deriving either from the other would make the identity true by
    // construction and prove nothing. A source row "survived" iff its own answer
    // — its (book_id, chapter, term_id) — is present in the new table.
    const countSurvived = db.prepare(`
      SELECT COUNT(*) AS c
        FROM book_concept_preference p
       WHERE EXISTS (
         SELECT 1 FROM book_term_preference b
          WHERE b.book_id = p.book_id AND b.chapter = p.chapter AND b.term_id = p.term_id
       )
    `);

    // Source rows that HAD an English term to expand through and still left no
    // answer behind. Expected to be exactly the cross-concept collision losers;
    // anything else here is a cause nobody has named yet.
    const findLost = db.prepare(`
      SELECT p.book_id, p.chapter, p.concept_id, p.term_id
        FROM book_concept_preference p
       WHERE EXISTS (
         SELECT 1 FROM concept_term t WHERE t.concept_id = p.concept_id AND t.lang = 'en'
       )
       AND NOT EXISTS (
         SELECT 1 FROM book_term_preference b
          WHERE b.book_id = p.book_id AND b.chapter = p.chapter AND b.term_id = p.term_id
       )
    `);

    const run = db.transaction(() => {
      const before = db.prepare('SELECT COUNT(*) AS c FROM book_concept_preference').get().c;
      if (before === 0) {
        db.exec('DROP TABLE book_concept_preference');
        return { before, expanded: 0, noEnglish: [], collisions: [], survived: 0, lost: [] };
      }

      const noEnglish = findNoEnglish.all();
      const collisions = findCollisionGroups.all().map((g) => ({
        book_id: g.book_id,
        chapter: g.chapter,
        english: g.keyEnglish,
        members: findCollisionMembers.all(g.book_id, g.chapter, g.keyEnglish),
      }));

      const res = expand.run();
      // ⚠️ BOTH MEASUREMENTS HAPPEN HERE, BEFORE THE DROP. book_concept_preference
      // is the left-hand side of both queries and does not exist after the next
      // line, so moving either of them out of this transaction silently turns the
      // whole accounting into "no such table".
      const survived = countSurvived.get().c;
      const lost = findLost.all();
      db.exec('DROP TABLE book_concept_preference');
      return { before, expanded: res.changes, noEnglish, collisions, survived, lost };
    });

    // ⚠️ NEVER THROW — see the header's fourth cause. `expand.run()` raises
    // SQLITE_CONSTRAINT_FOREIGNKEY on a dangling `term_id` (INSERT OR IGNORE does
    // not suppress a foreign-key violation), which would reach migrationRunner,
    // reach failLoudOnMigrationErrors, and stop the server booting — every boot,
    // for good. CATCH EVERYTHING, not FK alone: the cause list is open.
    //
    // The rollback is what makes reporting safe rather than lossy: DROP TABLE is
    // inside the transaction above, so book_concept_preference and its rows
    // survive untouched and the next boot re-attempts.
    let outcome;
    try {
      outcome = run();
    } catch (err) {
      console.warn(
        `[048] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. ` +
          'book_concept_preference has been LEFT IN PLACE with its rows intact (the DROP was ' +
          'rolled back with the rest of the transaction) and book_term_preference is empty or ' +
          'partial; NOTHING was lost. This migration will re-attempt on the next server start. ' +
          'The known cause is a book_concept_preference row whose term_id no longer names a live ' +
          'concept_term row — INSERT OR IGNORE does NOT suppress a FOREIGN KEY violation. Find ' +
          'it with: SELECT p.* FROM book_concept_preference p LEFT JOIN concept_term t ON ' +
          't.id = p.term_id WHERE t.id IS NULL; then delete or re-point those rows. ' +
          'NOT THROWN ON PURPOSE: throwing here would stop this server booting at all.'
      );
      return;
    }
    const { before, expanded, noEnglish, collisions, survived, lost } = outcome;

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

    // ── THE ACCOUNTING (whole-branch review, 2026-08-09) ─────────────────────
    //
    // ⚠️ THE POINT IS THAT A CAUSE NOBODY HAS NAMED CANNOT HIDE. Three logged
    // categories are only trustworthy if they add up; without this, a fifth way
    // for a preference to vanish would produce a perfectly calm three-count log
    // line and no other trace. Every source row must land in exactly one of:
    //   · survived        — its answer is present in book_term_preference
    //   · noEnglish       — its concept had no English term to expand through
    //   · lost            — it had one and still left nothing behind
    // and `lost` must, in turn, be fully explained by the collisions detected
    // BEFORE the insert. Both halves are reported, never thrown.
    const accounted = survived + noEnglish.length + lost.length;
    if (accounted !== before) {
      console.warn(
        `[048] ACCOUNTING FAILED — ${before} source row(s) in book_concept_preference, but ` +
          `survived=${survived} + noEnglish=${noEnglish.length} + lost=${lost.length} = ` +
          `${accounted}. These three are meant to partition the source rows, so a mismatch ` +
          `means a row was counted twice or not at all — i.e. this migration's three reported ` +
          `categories do NOT explain what happened to the data. Do not treat the counts above ` +
          `as complete. (Counting unit: SOURCE rows. 'expanded' is a DESTINATION-row count and ` +
          `is deliberately not part of this identity — one source row expands into one row per ` +
          `English term.)`
      );
    }

    // A lost row that no detected collision group named is the fifth cause the
    // check above exists to expose — reported with the rows themselves, because
    // a bare count would send the next reader looking in the wrong place.
    const collided = new Set(
      collisions.flatMap((c) => c.members.map((m) => `${c.book_id}|${c.chapter}|${m.concept_id}`))
    );
    const unexplained = lost.filter(
      (r) => !collided.has(`${r.book_id}|${r.chapter}|${r.concept_id}`)
    );
    if (unexplained.length) {
      console.warn(
        `[048] UNEXPLAINED LOSS — ${unexplained.length} preference row(s) had an English term ` +
          `to expand through, left NO row in book_term_preference, and were not named by any ` +
          `detected cross-concept collision. This is a cause not in this migration's list; ` +
          `investigate before trusting the counts above. Rows: ` +
          unexplained
            .map(
              (r) =>
                `book_id=${r.book_id} chapter=${r.chapter} concept_id=${r.concept_id} ` +
                `term_id=${r.term_id}`
            )
            .join('; ')
      );
    }
  },
};
