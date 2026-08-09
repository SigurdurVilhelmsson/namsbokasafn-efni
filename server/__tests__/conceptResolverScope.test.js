// server/__tests__/conceptResolverScope.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope, lookupCandidates, resolve } = require('../lib/conceptResolver');

/** A registered book with no priority rows — the 'no-priorities' case. */
function registerBare(db, slug) {
  // ⚠️ registered_books has THREE NOT NULL, no-default columns: slug, title_is,
  // registered_by (migration 003). Supply all three. This is the same class of
  // bug as §C35, where migration 019 registers two books WITHOUT registered_by
  // and its INSERT OR IGNORE silently discards them — which is why only
  // lifraen-efnafraedi and edlisfraedi-2e exist on a fresh migrated DB.
  db.prepare(
    "INSERT INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'test')"
  ).run(slug, slug);
  const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?').run(id);
  return id;
}

/**
 * `efnafraedi-2e` is NOT one of the two books a fresh migrated DB registers
 * (§C35 — only lifraen-efnafraedi and edlisfraedi-2e are). The B4a collation
 * and control tests need a book of their own with a chemistry priority row and
 * a seeded English term 'accuracy', so this registers it explicitly rather than
 * borrowing one of the two pre-registered books.
 */
function registerChemistryWithConcepts() {
  const { db } = freshMigratedDb();
  db.prepare(
    "INSERT INTO registered_books (slug, title_is, registered_by) VALUES ('efnafraedi-2e', 'Efnafræði', 'test')"
  ).run();
  const bookId = db
    .prepare("SELECT id FROM registered_books WHERE slug = 'efnafraedi-2e'")
    .get().id;
  db.prepare('INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, 1)').run(
    bookId,
    'chemistry'
  );
  const { termId } = seedConcept(db, { domain: 'chemistry', en: 'accuracy', is: 'nákvæmni' });
  return { db, bookId, termId };
}

describe('buildScope — D3, an unscoped book names WHICH fault', () => {
  it('returns unscoped:"unregistered" when the slug has no registered_books row', () => {
    const { db } = freshMigratedDb();
    expect(buildScope(db, 'no-such-book')).toEqual({ unscoped: 'unregistered' });
    db.close();
  });

  it('returns unscoped:"no-priorities" when registered with zero priority rows', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    expect(buildScope(db, 'bok-an-forgangs')).toEqual({ unscoped: 'no-priorities' });
    db.close();
  });

  it('CONTROL: the two causes are distinguishable, not one boolean', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    const a = buildScope(db, 'no-such-book').unscoped;
    const b = buildScope(db, 'bok-an-forgangs').unscoped;
    expect(a).not.toBe(b);
    db.close();
  });

  it('a book WITH priority rows is not unscoped', () => {
    const { db } = freshMigratedDb();
    // edlisfraedi-2e is one of the two books a fresh clone actually registers (§C35).
    const scope = buildScope(db, 'edlisfraedi-2e');
    expect(scope.unscoped).toBe(false);
    expect(scope.positionOf.get('physics')).toBe(1);
    db.close();
  });
});

/** Seed one concept with one Icelandic term; return {conceptId, termId}. */
function seedConcept(db, { domain = 'physics', en = 'force', is = 'kraftur', rank = 1 } = {}) {
  const c = db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain);
  const conceptId = Number(c.lastInsertRowid);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  const t = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    )
    .run(conceptId, is, rank);
  return { conceptId, termId: Number(t.lastInsertRowid) };
}

describe('buildScope — the preference merge', () => {
  // ⚠️ B4a (§C36 / §C38): re-keyed from concept_id onto the ENGLISH STRING,
  // lowercased. A preference keyed on concept_id could not express what an
  // editor means — one concept carries many English strings, so a row set
  // while looking at one string silently moved all the others. These cases
  // keep their original meaning; only the key changed from a concept id to a
  // lowercased english string.
  it('a chapter row OVERRIDES a book-default row for the same concept', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId } = seedConcept(db);
    const alt = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'afl', 2, 'test')"
      )
      .run(conceptId);
    const bookTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'kraftur'")
      .get(conceptId).id;
    const chapTermId = Number(alt.lastInsertRowid);

    const ins = db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, ?, ?, ?)'
    );
    ins.run(bookId, 0, 'force', bookTermId);
    ins.run(bookId, 3, 'force', chapTermId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get('force')).toEqual({ termId: chapTermId, tier: 'chapter' });
    db.close();
  });

  it('falls back to the book default when the chapter has no row', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, 'force', termId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get('force')).toEqual({ termId, tier: 'book' });
    db.close();
  });

  it('ignores a DIFFERENT chapter’s override', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 7, ?, ?)'
    ).run(bookId, 'force', termId);

    expect(buildScope(db, 'edlisfraedi-2e', 3).preference.size).toBe(0);
    db.close();
  });

  it('handles the appendices sentinel (-1) like any other chapter', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, -1, ?, ?)'
    ).run(bookId, 'force', termId);

    expect(buildScope(db, 'edlisfraedi-2e', -1).preference.get('force')).toEqual({
      termId,
      tier: 'chapter',
    });
    db.close();
  });

  it('an appendices (-1) override survives a book default inserted after it', () => {
    const { db } = freshMigratedDb();
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId, termId: appendixTermId } = seedConcept(db);
    const alt = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'afl', 2, 'test')"
      )
      .run(conceptId);
    const bookTermId = Number(alt.lastInsertRowid);

    const ins = db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, ?, ?, ?)'
    );
    // ⚠️ INDEX order, NOT insertion order — this comment claimed the latter until
    // 2026-08-08, and the sentence it made was internally incoherent ("returns -1
    // first even though -1 is inserted first"). Measured with EXPLAIN QUERY PLAN:
    // `SELECT ... WHERE chapter IN (0, -1)` scans the primary key
    // (book_id, chapter, english) ASCENDING, so the chapter=-1 row comes back
    // before the chapter=0 row regardless of the order they were written in. A
    // merge loop that overwrote unconditionally would therefore let the
    // book-default row, processed second, clobber the appendices override. This is
    // the test that pins buildPreferenceMap's `!preference.has()` guard — and it
    // would pin it just as well with these two inserts swapped.
    ins.run(bookId, -1, 'force', appendixTermId);
    ins.run(bookId, 0, 'force', bookTermId);

    const scope = buildScope(db, 'edlisfraedi-2e', -1);
    expect(scope.preference.get('force')).toEqual({ termId: appendixTermId, tier: 'chapter' });
    db.close();
  });

  it('a preference row belonging to a DIFFERENT book does not leak into this book’s scope', () => {
    const { db } = freshMigratedDb();
    // lifraen-efnafraedi is the OTHER book a fresh migrated DB registers (§C35) —
    // no new registered_books insert needed.
    const otherBookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'lifraen-efnafraedi'")
      .get().id;
    const { termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(otherBookId, 'force', termId);

    expect(buildScope(db, 'edlisfraedi-2e', 3).preference.size).toBe(0);
    db.close();
  });

  // §C39 — CHARACTERIZATION, not an endorsement, and UPDATED for B4a's re-key
  // (not deleted, per task-1-brief.md's instruction). The skew this test pins
  // did NOT disappear — it MOVED, from key-space to term-space:
  //   - Before B4a: buildPreferenceMap keyed on the RAW concept_id, while
  //     lookupCandidates reported the post-followMerge SURVIVOR id, so the map
  //     lookup itself missed — `if (pref)` never ran, and no integrity code fired.
  //   - After B4a: the map is keyed on the english STRING, which both the
  //     absorbed and surviving concept share ('accuracy'), so the lookup now
  //     HITS. But the termId it carries (hittni) hangs off the ABSORBED concept
  //     — lookupCandidates only ever returns the SURVIVOR, whose isTerms is
  //     [nákvæmni]. So `c.isTerms.find(t => t.termId === pref.termId)` still
  //     misses, just one step later. That is what conceptResolver.js's
  //     followMerge docstring means by "defuses this (it surfaces as
  //     `preference-not-a-candidate`)": not that the hazard is gone, but that
  //     the `if (pref)` branch now RUNS, so the failure stops being silent.
  //
  // ⚠️ UPDATED AGAIN 2026-08-09 BY TASK 6 — not deleted, per task-1-brief.md.
  // Task 6's override closes the silence: the skew still exists (the preference
  // names a term hanging off the ABSORBED concept, and lookupCandidates only
  // ever returns the SURVIVOR), but it now surfaces as
  // `preference-not-a-candidate` on `resolve()`'s integrity array instead of
  // being swallowed with no code at all. The final assertion below is the new
  // half. Part C's merge tooling still has to face the underlying skew — this
  // test characterizes it, it does not endorse it.
  it('§C39: a preference on a merged-away concept is FOUND by english, names a termId no candidate carries, and now REPORTS it', () => {
    const { db } = freshMigratedDb();
    // lifraen-efnafraedi is the pre-registered book whose priority list includes
    // both biology and physics (§C35), so it plays the "chemistry book" role.
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'lifraen-efnafraedi'")
      .get().id;
    const { conceptId: absorbed, termId } = seedConcept(db, {
      domain: 'biology',
      en: 'accuracy',
      is: 'hittni',
    });
    const { conceptId: survivor } = seedConcept(db, {
      domain: 'physics',
      en: 'accuracy',
      is: 'nákvæmni',
    });
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, 'accuracy', termId);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, absorbed);

    const scope = buildScope(db, 'lifraen-efnafraedi', 0);
    // The key hit is real — no more silent map miss.
    expect(scope.preference.get('accuracy')).toEqual({ termId, tier: 'book' });

    // But the candidate lookupCandidates would hand resolveCandidates carries
    // ONLY the survivor, and the survivor's isTerms does not include the
    // preference's termId — the skew, relocated.
    const { candidates } = lookupCandidates(db, 'accuracy', scope.stmts);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conceptId).toBe(survivor);
    expect(candidates[0].isTerms.map((t) => t.termId)).not.toContain(termId);

    // ⚠️ THE END OF THE SILENCE (B4a Task 6). The concept_term row for 'hittni'
    // still exists — only its concept was merged away — so `termById` finds it
    // and the fault is the MISFILED one, not the missing one. The resolution is
    // otherwise exactly what it would be with no preference row at all.
    const r = resolve(scope, 'accuracy');
    expect(r.integrity).toContain('preference-not-a-candidate');
    expect(r.winner).toMatchObject({ text: 'nákvæmni', conceptId: survivor });
    expect(r.reason).toBe('head-form');
    db.close();
  });

  // B4a — the collation contract. book_term_preference.english is COLLATE
  // NOCASE, so SQLite folds case on the column, but a JS Map does not: both
  // sides must lowercase or a row is stored and never found — silent, and the
  // exact failure class this slice exists to end.
  it('a preference written in any case is found in any case — COLLATE NOCASE + toLowerCase', () => {
    const { db, bookId, termId } = registerChemistryWithConcepts();
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, 'Accuracy', termId);
    const scope = buildScope(db, 'efnafraedi-2e', 0);
    expect(scope.preference.get('accuracy')).toEqual({ termId, tier: 'book' });
    db.close();
  });

  // ⚠️ THE CONTROL. If someone "helpfully" folds case in concept_term lookup too,
  // the test above still passes while every resolution in the corpus changes
  // which candidates it finds.
  it('CONTROL: candidate lookup stays CASE-SENSITIVE — concept_term is untouched', () => {
    const { db } = registerChemistryWithConcepts(); // seeds English term 'accuracy'
    const scope = buildScope(db, 'efnafraedi-2e', 0);
    expect(lookupCandidates(scope.db, 'accuracy', scope.stmts).candidates.length).toBeGreaterThan(
      0
    );
    expect(lookupCandidates(scope.db, 'Accuracy', scope.stmts).candidates).toEqual([]);
    db.close();
  });
});
