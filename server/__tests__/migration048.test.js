// server/__tests__/migration048.test.js
import { describe, it, expect, vi } from 'vitest';
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

  // ── review fix — book review 2026-08-09, all three findings ────────────────
  //
  // Reproduced live: the INNER JOIN on `t.lang = 'en'` silently drops a source
  // row whose concept has zero English concept_term rows (schema-legal — lang
  // is only constrained to en/is/la), before INSERT OR IGNORE ever runs, so
  // `changes` cannot see it. Pinned as its own category, not folded into
  // "expanded".
  it('drops a preference whose concept has no English term, and reports it separately — not silently, not counted as expanded', () => {
    const { db } = freshMigratedDb();
    db.exec(`
      CREATE TABLE book_concept_preference (
        book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
        concept_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
        PRIMARY KEY (book_id, chapter, concept_id));
    `);
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;
    // A concept with ONLY an Icelandic term — no 'en' concept_term row at all.
    const conceptId = db
      .prepare("INSERT INTO concept (domain, collection) VALUES ('biology', 'TEST')")
      .run().lastInsertRowid;
    const termId = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'ediksgerla', 1, 'test')"
      )
      .run(conceptId).lastInsertRowid;
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,0,?,?)'
    ).run(bookId, conceptId, termId);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    require('../migrations/048-book-term-preference').up(db);
    // ⚠️ Read .mock.calls BEFORE mockRestore() — Vitest's mockRestore() also
    // clears recorded call history (it does what mockReset()/mockClear() do,
    // then restores the original implementation), unlike some other mocking
    // libraries where restore leaves history queryable. Measured directly:
    // reading .mock.calls.length after mockRestore() returned 0 even though
    // the spy had genuinely captured 2 calls moments earlier.
    const messages = warnSpy.mock.calls.map((call) => call.join(' '));
    warnSpy.mockRestore();

    expect(db.prepare('SELECT COUNT(*) AS c FROM book_term_preference').get().c).toBe(0);
    expect(
      messages.some(
        (m) => /DROPPED/.test(m) && m.includes(`concept_id=${conceptId}`) && /no English/i.test(m)
      )
    ).toBe(true);
    db.close();
  });

  // Reproduced live: two DISTINCT concepts (different concept_id, different
  // editorial preferences) sharing one English string for the same
  // (book_id, chapter) — INSERT OR IGNORE keeps only one, by SQL enumeration
  // order. This is NOT the documented same-concept case-variant collapse (the
  // migration's old comment claimed "they are the same editor answer", which
  // is false here — they are two DIFFERENT editor answers). Pins that exactly
  // one row survives AND that the collision is named: both concept ids, both
  // term ids, the English string.
  it('collapses a cross-concept collision, and reports it by name — both concept ids, both term ids, the string', () => {
    const { db } = freshMigratedDb();
    db.exec(`
      CREATE TABLE book_concept_preference (
        book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
        concept_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
        PRIMARY KEY (book_id, chapter, concept_id));
    `);
    const bookId = db
      .prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'")
      .get().id;

    // Two senses of "cell" — biology's fruma, physics' rafhlaða — the
    // canonical §C18 shape, spelled with different case to also prove the
    // collision is detected under NOCASE, not just exact-string equality.
    const conceptA = db
      .prepare("INSERT INTO concept (domain, collection) VALUES ('biology', 'TEST')")
      .run().lastInsertRowid;
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'cell', 1, 'test')"
    ).run(conceptA);
    const termA = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'fruma', 1, 'test')"
      )
      .run(conceptA).lastInsertRowid;

    const conceptB = db
      .prepare("INSERT INTO concept (domain, collection) VALUES ('physics', 'TEST')")
      .run().lastInsertRowid;
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', 'Cell', 1, 'test')"
    ).run(conceptB);
    const termB = db
      .prepare(
        "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'rafhlaða', 1, 'test')"
      )
      .run(conceptB).lastInsertRowid;

    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?,0,?,?)'
    );
    ins.run(bookId, conceptA, termA);
    ins.run(bookId, conceptB, termB);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    require('../migrations/048-book-term-preference').up(db);
    // ⚠️ Read .mock.calls before mockRestore() — see the comment on the same
    // pattern above; mockRestore() clears recorded history in Vitest.
    const messages = warnSpy.mock.calls.map((call) => call.join(' '));
    warnSpy.mockRestore();

    // Exactly one row survives for the shared key — pins the (undesirable but
    // real, and now VISIBLE) collapse; this test is not endorsing it.
    const rows = db
      .prepare(
        "SELECT term_id FROM book_term_preference WHERE book_id = ? AND chapter = 0 AND english = 'cell' COLLATE NOCASE"
      )
      .all(bookId);
    expect(rows.length).toBe(1);

    const collisionMsg = messages.find((m) => /COLLISION/.test(m));
    expect(collisionMsg).toBeDefined();
    expect(collisionMsg).toContain(`concept_id=${conceptA}`);
    expect(collisionMsg).toContain(`concept_id=${conceptB}`);
    expect(collisionMsg).toContain(`term_id=${termA}`);
    expect(collisionMsg).toContain(`term_id=${termB}`);
    expect(collisionMsg).toMatch(/cell/i);
    db.close();
  });
});
