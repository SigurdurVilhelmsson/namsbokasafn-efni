// server/__tests__/bookGlossaryChangeId.test.js
/**
 * The book glossary layer's change id (stage 2, PR 1, T4e): the largest
 * book_glossary_change.id of a book, read lazily and read-only for the exporter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  addExclusion,
  lastLayerChangeId,
  createLayerChangeIdFn,
} = require('../lib/bookGlossaryLayer');

const A = 'bok-a';
const B = 'bok-b';
let db;
const base = { reason: 'because', source: 'test', by: 'tester', at: '2026-11-20T00:00:00.000Z' };

function idOf(slug) {
  return db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug).id;
}

beforeAll(() => {
  db = freshMigratedDb().db;
  const ins = db.prepare(
    "INSERT INTO registered_books (slug, title_is, registered_by, status) VALUES (?, ?, 'system', 'active')"
  );
  ins.run(A, 'Bók A');
  ins.run(B, 'Bók B');
});
afterAll(() => db.close());

describe('lastLayerChangeId', () => {
  it('is null for a book with no layer history', () => {
    expect(lastLayerChangeId(db, B)).toBeNull();
  });

  it('is the largest change id of that book only', () => {
    addExclusion(db, { ...base, book: A, english: 'Alpha' });
    addExclusion(db, { ...base, book: A, english: 'Beta' });
    addExclusion(db, { ...base, book: B, english: 'Gamma' });
    const maxA = db
      .prepare('SELECT MAX(id) AS m FROM book_glossary_change WHERE book_id = ?')
      .get(idOf(A)).m;
    expect(lastLayerChangeId(db, A)).toBe(maxA);
    expect(lastLayerChangeId(db, A)).not.toBe(lastLayerChangeId(db, B));
  });

  it('is null for an unregistered slug', () => {
    expect(lastLayerChangeId(db, 'no-such-book')).toBeNull();
  });
});

describe('createLayerChangeIdFn', () => {
  it('throws on a missing database and does not create it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'c239-changeid-'));
    try {
      const missing = path.join(dir, 'nope.db');
      const fn = createLayerChangeIdFn(missing);
      expect(() => fn(A)).toThrow(/unable to open database file/);
      expect(existsSync(missing)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
