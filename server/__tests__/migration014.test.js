// server/__tests__/migration014.test.js
//
// Register §C250: migration 014 used to run three bare ALTERs. A crash after the first left
// `source_commit_hash` present, and every later start's first ALTER threw "duplicate column", which
// migrationRunner counts as skipped, so the other two columns were never added. A transaction stops
// NEW stranding; these tests pin that 014 also REPAIRS a database already stranded that way.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration014 = require('../migrations/014-source-tracking');

const SOURCE_COLUMNS = ['source_commit_hash', 'source_fetched_at', 'source_repo'];

function registeredBooks(extraColumns) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE registered_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE
    ${extraColumns.map((c) => `, ${c}`).join('')}
  )`);
  return db;
}
const columns = (db) =>
  db
    .prepare('PRAGMA table_info(registered_books)')
    .all()
    .map((c) => c.name);

describe('migration 014 (register §C250)', () => {
  it('repairs a database stranded with only source_commit_hash: all three source columns exist', () => {
    const db = registeredBooks(['source_commit_hash TEXT']);
    migration014.up(db);
    expect(columns(db)).toEqual(expect.arrayContaining(SOURCE_COLUMNS));
  });

  it('repairs a database stranded with the first two columns', () => {
    const db = registeredBooks(['source_commit_hash TEXT', 'source_fetched_at DATETIME']);
    migration014.up(db);
    expect(columns(db)).toEqual(expect.arrayContaining(SOURCE_COLUMNS));
  });

  it('CONTROL: adds all three to a table that has none', () => {
    const db = registeredBooks([]);
    migration014.up(db);
    expect(columns(db)).toEqual(expect.arrayContaining(SOURCE_COLUMNS));
  });

  // Not a control: the unguarded 014 throws "duplicate column" here (the runner then skips it).
  it('a re-run on a complete table is a no-op and does not throw', () => {
    const db = registeredBooks([]);
    migration014.up(db);
    const before = columns(db);
    expect(() => migration014.up(db)).not.toThrow();
    expect(columns(db)).toEqual(before);
  });

  it('keeps existing rows and their values through a repair', () => {
    const db = registeredBooks(['source_commit_hash TEXT']);
    db.prepare('INSERT INTO registered_books (slug, source_commit_hash) VALUES (?, ?)').run(
      'b',
      'abc'
    );
    migration014.up(db);
    expect(db.prepare('SELECT slug, source_commit_hash FROM registered_books').get()).toEqual({
      slug: 'b',
      source_commit_hash: 'abc',
    });
  });
});
