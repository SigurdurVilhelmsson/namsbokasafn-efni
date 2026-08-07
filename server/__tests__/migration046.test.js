// server/__tests__/migration046.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const migration046 = require('../migrations/046-seed-domain-priority');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  const ins = db.prepare('INSERT INTO registered_books (id, slug) VALUES (?,?)');
  [
    [1, 'efnafraedi-2e'],
    [2, 'orverufraedi'],
    [3, 'liffraedi-2e'],
    [6, 'stjornufraedi'],
    [17, 'lifraen-efnafraedi'],
    [155, 'edlisfraedi-2e'],
  ].forEach(([id, slug]) => ins.run(id, slug));
  migration045.up(db);
  migration046.up(db);
});
afterEach(() => db.close());

const order = (slug) =>
  db
    .prepare(
      `SELECT p.domain FROM book_domain_priority p
         JOIN registered_books b ON b.id = p.book_id
        WHERE b.slug = ? ORDER BY p.position`
    )
    .all(slug)
    .map((r) => r.domain);

describe('migration 046 domain priority seed', () => {
  it('puts chemistry first for efnafraedi-2e', () => {
    expect(order('efnafraedi-2e')[0]).toBe('chemistry');
  });

  it('gives efnafraedi-2e biology as a fallback — this is what returns pH and bond', () => {
    expect(order('efnafraedi-2e')).toContain('biology');
  });

  it('puts astronomy first for stjornufraedi, which had no terminology at all', () => {
    expect(order('stjornufraedi')[0]).toBe('astronomy');
  });

  it('gives orverufraedi biology first', () => {
    expect(order('orverufraedi')[0]).toBe('biology');
  });

  it('gives lifraen-efnafraedi chemistry first', () => {
    expect(order('lifraen-efnafraedi')[0]).toBe('chemistry');
  });

  it('gives edlisfraedi-2e physics first', () => {
    expect(order('edlisfraedi-2e')[0]).toBe('physics');
  });

  it('gives every registered book a priority list — a book scoped to nothing is the bug', () => {
    const books = db
      .prepare('SELECT slug FROM registered_books')
      .all()
      .map((r) => r.slug);
    for (const slug of books) expect(order(slug).length).toBeGreaterThan(0);
  });

  it('uses contiguous positions starting at 1', () => {
    expect(order('efnafraedi-2e').length).toBeGreaterThan(1);
    const positions = db
      .prepare('SELECT position FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all()
      .map((r) => r.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  });

  it('is idempotent across a re-run', () => {
    const before = order('efnafraedi-2e');
    migration046.up(db);
    expect(order('efnafraedi-2e')).toEqual(before);
  });
});
