// server/__tests__/migration048.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// ⚠️ Default export is the function itself, not `{ freshMigratedDb }` — see
// server/__tests__/helpers/freshMigratedDb.js. It also returns
// `{ db, errors, applied, path }`, not a bare db. Matched to how every other
// consumer in this repo (conceptResolverScope.test.js, freshMigratedDb.test.js,
// Task 1's addition to conceptResolverScope.test.js) actually calls it.
const freshMigratedDb = require('./helpers/freshMigratedDb');

/**
 * One registered book + one concept + one English concept_term, so a
 * book_term_preference row's foreign keys hold. `book_id` is looked up from a
 * REAL registered_books row rather than assumed to be 1 — a fresh migrated DB
 * pre-registers 'lifraen-efnafraedi' and 'edlisfraedi-2e' (§C35) at whatever
 * ids their own migrations happened to assign (observed: 3 and 4, not 1), and
 * PRAGMA foreign_keys is ON, so a literal fake book_id/term_id would throw
 * SQLITE_CONSTRAINT_FOREIGNKEY.
 */
function seedBookAndTerm(db) {
  const bookId = db
    .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
    .get().id;
  const conceptId = db
    .prepare("INSERT INTO concept (domain, collection) VALUES ('physics', 'TEST')")
    .run().lastInsertRowid;
  const termId = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'accuracy', 1, 'test')"
    )
    .run(conceptId).lastInsertRowid;
  return { bookId, termId };
}

/** One concept carrying TWO English strings ('accuracy' + 'exactness'), and
 * the (Icelandic) term an editor actually preferred for it. */
function seedConceptWithTwoEnglish(db) {
  const conceptId = db
    .prepare("INSERT INTO concept (domain, collection) VALUES ('physics', 'TEST')")
    .run().lastInsertRowid;
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'accuracy', 1, 'test')"
  ).run(conceptId);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'exactness', 2, 'test')"
  ).run(conceptId);
  const termId = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'nákvæmni', 1, 'test')"
    )
    .run(conceptId).lastInsertRowid;
  return { conceptId, termId };
}

describe('migration 048 — book_term_preference', () => {
  it('creates the table keyed on (book_id, chapter, english)', () => {
    const { db } = freshMigratedDb();
    const cols = db.prepare('PRAGMA table_info(book_term_preference)').all();
    expect(cols.map((c) => c.name)).toEqual(['book_id', 'chapter', 'english', 'term_id']);
    const pk = cols
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    expect(pk).toEqual(['book_id', 'chapter', 'english']);
    db.close();
  });

  it('english is COLLATE NOCASE, so one row covers every capitalisation', () => {
    const { db } = freshMigratedDb();
    const sql = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'book_term_preference'")
      .get().sql;
    expect(sql).toMatch(/english\s+TEXT\s+NOT NULL\s+COLLATE NOCASE/i);
    db.close();
  });

  // ⚠️ THE CONTROL. The collation claim above is about DDL text; this one is
  // about behaviour. A COLLATE in the column definition that failed to reach the
  // primary key index would pass the test above and fail this one.
  it('CONTROL: inserting two case variants of one string collides', () => {
    const { db } = freshMigratedDb();
    const { bookId, termId } = seedBookAndTerm(db);
    const ins = db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    );
    ins.run(bookId, 'accuracy', termId);
    expect(() => ins.run(bookId, 'Accuracy', termId)).toThrow(/UNIQUE|PRIMARY KEY/i);
    db.close();
  });

  it('drops book_concept_preference', () => {
    const { db } = freshMigratedDb();
    const t = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='book_concept_preference'"
      )
      .get();
    expect(t).toBeUndefined();
    db.close();
  });

  it('reports ZERO expanded rows on a fresh database — the production case', () => {
    const { db } = freshMigratedDb();
    expect(db.prepare('SELECT COUNT(*) AS c FROM book_term_preference').get().c).toBe(0);
    db.close();
  });

  it('is idempotent — running up() twice is safe', () => {
    const { db } = freshMigratedDb();
    const m048 = require('../migrations/048-book-term-preference');
    expect(() => m048.up(db)).not.toThrow();
    expect(() => m048.up(db)).not.toThrow();
    db.close();
  });

  it('expands one concept row into one row per English term, and drops the old table', () => {
    // Build the PRE-048 state by hand: 045's table plus a concept carrying TWO
    // English strings — the exact shape whose blast radius B4a removes.
    // ⚠️ freshMigratedDb() has already run 048 (it's now the last migration
    // file on disk) and dropped book_concept_preference, which is exactly why
    // this test re-creates it inline instead of relying on 045's copy.
    const { db } = freshMigratedDb();
    db.exec(`
      CREATE TABLE book_concept_preference (
        book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
        concept_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
        PRIMARY KEY (book_id, chapter, concept_id));
    `);
    // ⚠️ A real registered_books id, not a literal 1 (see seedBookAndTerm's
    // comment) — the row this migration WRITES lands in book_term_preference,
    // which enforces book_id REFERENCES registered_books(id) with foreign_keys
    // ON, even though this hand-built OLD table enforces no such thing.
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    const { conceptId, termId } = seedConceptWithTwoEnglish(db); // 'accuracy' + 'exactness'
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,0,?,?)'
    ).run(bookId, conceptId, termId);

    require('../migrations/048-book-term-preference').up(db);

    const rows = db
      .prepare('SELECT english FROM book_term_preference ORDER BY english')
      .all()
      .map((r) => r.english);
    expect(rows).toEqual(['accuracy', 'exactness']);
    db.close();
  });
});
