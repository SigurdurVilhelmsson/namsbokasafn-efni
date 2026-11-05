/**
 * Migration 054: module_openings and module_opening_inflight, the opening record (G1.1 + G1.2
 * spec §5.5, §13; PR2 Task 1, decision 2).
 *
 * The schema is read back from a database every real migration built (freshMigratedDb). No user
 * column on either table (R3): the exact-shape cases below fail on a user_id or opened_by column.
 * The never-throw test is the model's (048, 053): a fault rolls the whole unit back, warns once,
 * and the next start completes it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const m054 = require('../migrations/054-module-openings');

const __dirname = dirname(fileURLToPath(import.meta.url));

const open = [];
function track(db) {
  open.push(db);
  return db;
}
afterEach(() => {
  while (open.length) {
    const db = open.pop();
    if (db.open) db.close();
  }
  vi.restoreAllMocks();
});

const migrated = () => track(freshMigratedDb().db);

/** Each column as [type, notnull, pk position], so the comparison is exact. */
const shape = (db, t) =>
  Object.fromEntries(db.pragma(`table_info(${t})`).map((c) => [c.name, [c.type, c.notnull, c.pk]]));

const BOOK = 'efnafraedi-2e';

function insertOpening(db, chapter, openedAtMs = 1700000000000, inflightCount = 0) {
  return db
    .prepare(
      `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
       VALUES (?, ?, 'chapter-metadata', ?, ?)`
    )
    .run(BOOK, chapter, openedAtMs, inflightCount);
}

/** Task 2's statement: it ignores only the key conflict (decision 6). */
function insertOpeningOnConflict(db, chapter, openedAtMs, inflightCount = 0) {
  return db
    .prepare(
      `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
       VALUES (?, ?, 'chapter-metadata', ?, ?)
       ON CONFLICT (book, chapter, module_id) DO NOTHING`
    )
    .run(BOOK, chapter, openedAtMs, inflightCount);
}

function insertInflight(db, chapter, segmentId, occurrence = -1) {
  return db
    .prepare(
      `INSERT INTO module_opening_inflight (book, chapter, module_id, segment_id, occurrence)
       VALUES (?, ?, 'chapter-metadata', ?, ?)`
    )
    .run(BOOK, chapter, segmentId, occurrence);
}

describe('migration 054: the opening record', () => {
  it('creates module_openings with the three-part key and no user column (R3)', () => {
    const db = migrated();
    expect(shape(db, 'module_openings')).toEqual({
      book: ['TEXT', 1, 1],
      chapter: ['INTEGER', 1, 2],
      module_id: ['TEXT', 1, 3],
      opened_at_ms: ['INTEGER', 1, 0],
      inflight_count: ['INTEGER', 1, 0],
    });
  });

  it('creates module_opening_inflight with the five-part key and nothing else', () => {
    const db = migrated();
    expect(shape(db, 'module_opening_inflight')).toEqual({
      book: ['TEXT', 1, 1],
      chapter: ['INTEGER', 1, 2],
      module_id: ['TEXT', 1, 3],
      segment_id: ['TEXT', 1, 4],
      occurrence: ['INTEGER', 1, 5],
    });
  });

  it('adds no index beyond the two primary keys’ automatic ones (decision 2)', () => {
    const db = migrated();
    // Every read is by the full key. The two autoindexes are the control: they prove the query
    // reaches both tables, so an empty list cannot pass.
    expect(
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'index'
           AND tbl_name IN ('module_openings', 'module_opening_inflight') ORDER BY name`
        )
        .pluck()
        .all()
    ).toEqual(['sqlite_autoindex_module_opening_inflight_1', 'sqlite_autoindex_module_openings_1']);
  });

  it('the key refuses a second opening and admits another chapter of chapter-metadata', () => {
    const db = migrated();
    insertOpening(db, 2);
    const first = db.prepare('SELECT * FROM module_openings WHERE chapter = 2').get();
    expect(() => insertOpening(db, 2)).toThrow(/UNIQUE/);
    // The control: the same module id in another chapter is another unit.
    expect(() => insertOpening(db, 5)).not.toThrow();

    // Task 2's statement ignores the key conflict, and leaves the first row as it was.
    expect(insertOpeningOnConflict(db, 2, 1800000000000).changes).toBe(0);
    expect(db.prepare('SELECT * FROM module_openings WHERE chapter = 2').get()).toEqual(first);
    // ...but only the key conflict: a bad value on a new key still throws.
    expect(() => insertOpeningOnConflict(db, 7, 0)).toThrow(/CHECK/);
    expect(
      db.prepare('SELECT chapter FROM module_openings WHERE chapter = 7').get()
    ).toBeUndefined();
  });

  it('the checks refuse what the columns cannot mean', () => {
    const db = migrated();
    insertOpening(db, 2);
    expect(() => insertInflight(db, 2, 'chapter:title:ch02', -1)).not.toThrow();
    expect(() => insertInflight(db, 2, 'chapter:title:ch02', -2)).toThrow(/CHECK/);
    expect(() => insertOpening(db, 3, 0)).toThrow(/CHECK/);
    expect(() => insertOpening(db, 4, 1700000000000, -1)).toThrow(/CHECK/);
  });

  it('the checks require integers: a TEXT or REAL value in a checked column is refused', () => {
    const db = migrated();
    // In SQLite any TEXT sorts above every number, so a bare `> 0` admitted 'now' and 1.5 (PR2
    // review U41). The INTEGER affinity runs before the check, so what it turns into an integer is one.
    expect(() => insertOpening(db, 3, 'now')).toThrow(/CHECK/);
    expect(() => insertOpening(db, 4, 1.5)).toThrow(/CHECK/);
    expect(() => insertOpening(db, 5, 1700000000000, 'many')).toThrow(/CHECK/);
    expect(() => insertOpening(db, 6, 1700000000000, 0.5)).toThrow(/CHECK/);
    insertOpening(db, 2);
    expect(() => insertInflight(db, 2, 'chapter:title:ch02', 'all')).toThrow(/CHECK/);
    expect(() => insertInflight(db, 2, 'chapter:title:ch02', 0.5)).toThrow(/CHECK/);
    // control: an integer in each column is admitted, and nothing refused was written
    expect(() => insertInflight(db, 2, 'chapter:title:ch02', 0)).not.toThrow();
    expect(
      db
        .prepare(
          'SELECT chapter, typeof(opened_at_ms) AS t, typeof(inflight_count) AS c FROM module_openings'
        )
        .all()
    ).toEqual([{ chapter: 2, t: 'integer', c: 'integer' }]);
    expect(
      db.prepare('SELECT occurrence, typeof(occurrence) AS t FROM module_opening_inflight').all()
    ).toEqual([{ occurrence: 0, t: 'integer' }]);
  });

  it('a snapshot row needs its opening, and goes with it', () => {
    const db = migrated();
    expect(() => insertInflight(db, 9, 'chapter:title:ch09')).toThrow(
      /FOREIGN KEY constraint failed/
    );
    insertOpening(db, 2, 1700000000000, 1);
    insertOpening(db, 5, 1700000000000, 1);
    insertInflight(db, 2, 'chapter:title:ch02');
    insertInflight(db, 5, 'chapter:title:ch05');

    db.prepare('DELETE FROM module_openings WHERE chapter = 2').run();
    // The control: the cascade took only its own child.
    expect(db.prepare('SELECT chapter, segment_id FROM module_opening_inflight').all()).toEqual([
      { chapter: 5, segment_id: 'chapter:title:ch05' },
    ]);
  });

  it('is idempotent: a second start changes nothing and warns nothing', () => {
    const db = migrated();
    const schema = () =>
      db
        .prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name')
        .all()
        .map((r) => `${r.type}|${r.name}|${r.sql}`);
    const before = schema();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m054.up(db);
    expect(schema()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a failing step rolls the unit back, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    // An INDEX of that name fails `CREATE TABLE IF NOT EXISTS`; a VIEW would not — it satisfies
    // `IF NOT EXISTS` with no table behind the name, measured 2026-11-03. checks.schema names a
    // table a VIEW stands in for (schemaHealth.test.js).
    db.exec('CREATE TABLE decoy (a INTEGER); CREATE INDEX module_opening_inflight ON decoy (a)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m054.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[054\]/);
    // Atomic: the first table rolled back with the second.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'module_openings'").all()
    ).toEqual([]);

    // The control: the same migration completes once the fault is gone.
    db.exec('DROP INDEX module_opening_inflight');
    m054.up(db);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'module_opening%' ORDER BY name"
        )
        .pluck()
        .all()
    ).toEqual(['module_opening_inflight', 'module_openings']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is registered in migrationRunner after 053', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/054-module-openings'`);
    expect(src.indexOf('053-served-text-versions')).toBeLessThan(
      src.indexOf('054-module-openings')
    );
  });
});
