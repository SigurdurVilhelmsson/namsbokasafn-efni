/**
 * Migration 044 — remap two books off subjects that carry no terminology.
 *
 * Migration 032 seeded `lifraen-efnafraedi → organic-chemistry` and
 * `orverufraedi → microbiology`. Measured on production 2026-08-07, BOTH of
 * those subjects have **zero** tagged translations — no row anywhere carries
 * them — so `exportBookGlossary`'s subject scope and `findTermsInSegments`'
 * tier resolution both return nothing for those two books. Their editors see
 * an empty terminology panel, and organic's glossary export produces 0 terms.
 *
 * Lead ruling 2026-08-07 (register §C14 ②): the parent discipline's collection
 * is the one Árnastofnun actually maintains — the Icelandic Chemical Society is
 * responsible for all of chemistry, and microbiology's terminology sits in the
 * biology collection.
 *
 * FIXTURE NOTE: this builds `registered_books` + `book_subject_mapping`
 * directly rather than running the whole migration chain. Those two tables are
 * the entire surface 044 touches, and their shapes here are copied from
 * migration 032. A fresh DB has NO registered books (they are created at
 * runtime), so running the real chain would leave nothing to remap and the
 * tests would pass vacuously.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration044 = require('../migrations/044-remap-empty-subjects');

let db;

/** Shapes copied from migration 032. */
function createSchema(database) {
  database.exec(`
    CREATE TABLE registered_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE
    );
    CREATE TABLE book_subject_mapping (
      book_id INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      PRIMARY KEY (book_id),
      FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
    );
  `);
}

/** Seeds the post-032 state, exactly as production carries it. */
function seedPost032(database) {
  const book = database.prepare('INSERT INTO registered_books (slug) VALUES (?)');
  const map = database.prepare(
    'INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (?, ?)'
  );
  for (const [slug, subject] of [
    ['efnafraedi-2e', 'chemistry'],
    ['orverufraedi', 'microbiology'],
    ['liffraedi-2e', 'biology'],
    ['lifraen-efnafraedi', 'organic-chemistry'],
    ['edlisfraedi-2e', 'physics'],
  ]) {
    map.run(book.run(slug).lastInsertRowid, subject);
  }
}

const subjectOf = (slug) =>
  db
    .prepare(
      `SELECT bsm.primary_subject AS s
         FROM book_subject_mapping bsm
         JOIN registered_books rb ON rb.id = bsm.book_id
        WHERE rb.slug = ?`
    )
    .get(slug)?.s;

beforeEach(() => {
  db = new Database(':memory:');
  createSchema(db);
});

afterEach(() => db.close());

describe('migration 044 remap-empty-subjects', () => {
  it('remaps lifraen-efnafraedi to chemistry', () => {
    seedPost032(db);
    migration044.up(db);
    expect(subjectOf('lifraen-efnafraedi')).toBe('chemistry');
  });

  it('remaps orverufraedi to biology', () => {
    seedPost032(db);
    migration044.up(db);
    expect(subjectOf('orverufraedi')).toBe('biology');
  });

  it('leaves efnafraedi-2e untouched', () => {
    seedPost032(db);
    migration044.up(db);
    expect(subjectOf('efnafraedi-2e')).toBe('chemistry');
  });

  it('leaves liffraedi-2e untouched', () => {
    seedPost032(db);
    migration044.up(db);
    expect(subjectOf('liffraedi-2e')).toBe('biology');
  });

  it('leaves edlisfraedi-2e untouched', () => {
    seedPost032(db);
    migration044.up(db);
    expect(subjectOf('edlisfraedi-2e')).toBe('physics');
  });

  it('is idempotent across a re-run', () => {
    seedPost032(db);
    migration044.up(db);
    migration044.up(db);
    expect(subjectOf('lifraen-efnafraedi')).toBe('chemistry');
  });

  it('creates no mapping row for a book that has none', () => {
    db.prepare('INSERT INTO registered_books (slug) VALUES (?)').run('lifraen-efnafraedi');
    migration044.up(db);
    expect(subjectOf('lifraen-efnafraedi')).toBeUndefined();
  });

  it('does not throw on a database with no registered books', () => {
    expect(() => migration044.up(db)).not.toThrow();
  });

  it('does not respect a later manual override — it is a one-shot correction', () => {
    // Documents the chosen semantics: 044 re-asserts on every boot, because
    // migrations re-run. If a book's subject is ever meant to be editable at
    // runtime, this migration must be revisited — there is no route that
    // writes book_subject_mapping today, so nothing can currently conflict.
    seedPost032(db);
    migration044.up(db);
    db.prepare(
      `UPDATE book_subject_mapping SET primary_subject = 'physics'
        WHERE book_id = (SELECT id FROM registered_books WHERE slug = 'orverufraedi')`
    ).run();
    migration044.up(db);
    expect(subjectOf('orverufraedi')).toBe('biology');
  });
});
