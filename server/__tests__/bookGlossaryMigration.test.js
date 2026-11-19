// server/__tests__/bookGlossaryMigration.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const Database = require('better-sqlite3');
const { checkSchema, EXPECTED_SCHEMA } = require('../lib/schemaHealth');
const migration = require('../migrations/058-book-glossary-layer');

const COLUMNS = {
  book_glossary_exclusion: [
    'id',
    'book_id',
    'english',
    'match_key',
    'concept_id',
    'idordabanki_id',
    'icelandic',
    'reason',
    'source',
    'created_by',
    'created_at',
  ],
  book_glossary_entry: [
    'concept_id',
    'book_id',
    'reason',
    'source',
    'created_by',
    'created_at',
    'updated_by',
    'updated_at',
  ],
  book_glossary_change: [
    'id',
    'book_id',
    'at',
    'by',
    'action',
    'english',
    'before_json',
    'after_json',
    'reason',
    'source',
  ],
};

function schemaSnapshot(db) {
  return db.prepare('SELECT name, sql FROM sqlite_master ORDER BY type, name').all();
}

function exclusion(db, matchKey, conceptId) {
  return db
    .prepare(
      `INSERT INTO book_glossary_exclusion
         (book_id, english, match_key, concept_id, reason, source, created_by, created_at)
       VALUES (1, 'x', ?, ?, 'r', 's', 'u', 't')`
    )
    .run(matchKey, conceptId);
}

describe('migration 058: the book glossary layer', () => {
  it('a fresh migrated DB has the three layer tables with their columns', () => {
    const { db } = freshMigratedDb();
    for (const [table, cols] of Object.entries(COLUMNS)) {
      const names = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
      expect(names).toEqual(cols);
    }
  });

  it('running 058 twice changes nothing and throws nothing', () => {
    const { db } = freshMigratedDb();
    const before = schemaSnapshot(db);
    expect(() => migration.up(db)).not.toThrow();
    expect(schemaSnapshot(db)).toEqual(before);
  });

  it('the exclusion key is unique per (book, match_key, concept_id)', () => {
    const { db } = freshMigratedDb();
    exclusion(db, 'atom', 0);
    expect(() => exclusion(db, 'atom', 0)).toThrow(/UNIQUE/);
  });

  it('the same match_key with another concept_id is accepted', () => {
    const { db } = freshMigratedDb();
    exclusion(db, 'atom', 0);
    expect(() => exclusion(db, 'atom', 5)).not.toThrow();
  });

  it('a failing migrate() is caught: up() warns and does not throw', () => {
    const db = new Database(':memory:');
    db.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => migration.up(db)).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('schema health lists the three tables and two indexes, and flags their absence', () => {
    for (const [table, cols] of Object.entries(COLUMNS)) {
      expect(EXPECTED_SCHEMA.tables[table]).toEqual(cols);
    }
    expect(EXPECTED_SCHEMA.indexes).toEqual(
      expect.arrayContaining(['idx_book_glossary_entry_book', 'idx_book_glossary_change_book'])
    );
    const bare = new Database(':memory:');
    try {
      const { ok, missing } = checkSchema(bare, EXPECTED_SCHEMA);
      expect(ok).toBe(false);
      expect(missing).toContain('book_glossary_exclusion');
      expect(missing).toContain('index idx_book_glossary_change_book');
    } finally {
      bare.close();
    }
    // Control: a database every migration built is healthy.
    expect(checkSchema(freshMigratedDb().db, EXPECTED_SCHEMA).ok).toBe(true);
  });
});
