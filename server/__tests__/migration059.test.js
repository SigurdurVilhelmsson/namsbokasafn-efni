/**
 * Migration 059: retention_runs (G1.15(b) spec §4.4; plan Task 3).
 *
 * One row per retention step that finished: its kind, when, and how many rows it changed in all. The schema is read
 * back from a database every real migration built (freshMigratedDb). The never-throw test is 056's: an index holding
 * the table's name makes its CREATE TABLE throw inside the unit, the migration warns once, and the next start
 * completes it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { EXPECTED_SCHEMA, checkSchema } = require('../lib/schemaHealth');
const m059 = require('../migrations/059-retention-runs');

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

const cols = (db, t) =>
  Object.fromEntries(db.pragma(`table_info(${t})`).map((c) => [c.name, [c.type, c.notnull]]));

// Exactly these three: a step's totals, never a person and never a per-person count.
const RUN_COLS = {
  kind: ['TEXT', 1],
  done_at_ms: ['INTEGER', 1],
  rows_changed: ['INTEGER', 1],
};

function run(db, { kind = 'named', doneAt = 1, rows = 0 } = {}) {
  return db
    .prepare('INSERT INTO retention_runs (kind, done_at_ms, rows_changed) VALUES (?, ?, ?)')
    .run(kind, doneAt, rows);
}

describe('migration 059: retention_runs', () => {
  it('creates retention_runs, column by column', () => {
    expect(cols(migrated(), 'retention_runs')).toEqual(RUN_COLS);
  });

  it('the CHECKs refuse what the spec rules out, and admit what it allows', () => {
    const db = migrated();
    const pairs = [
      [() => run(db, { kind: 'research' }), () => run(db, { kind: 'named' })],
      [() => run(db, { kind: 'unnamed', doneAt: 0 }), () => run(db, { kind: 'unnamed' })],
      [() => run(db, { kind: 'consent', rows: -1 }), () => run(db, { kind: 'consent', rows: 0 })],
    ];
    for (const [bad, good] of pairs) {
      expect(bad).toThrow(/CHECK/);
      expect(good).not.toThrow();
    }
  });

  it('records each kind at most once', () => {
    const db = migrated();
    run(db, { kind: 'named', rows: 5 });
    expect(() => run(db, { kind: 'named', rows: 0 })).toThrow(/UNIQUE/);
    expect(() => run(db, { kind: 'unnamed' })).not.toThrow(); // control: another kind is fine
  });

  it('is idempotent', () => {
    const db = migrated();
    run(db, { kind: 'named', rows: 3 });
    const schema = () => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all();
    const before = schema();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m059.up(db);
    expect(schema()).toEqual(before);
    expect(db.prepare('SELECT kind, rows_changed FROM retention_runs').all()).toEqual([
      { kind: 'named', rows_changed: 3 },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a colliding object leaves no table, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    db.exec('CREATE TABLE z (a); CREATE INDEX retention_runs ON z (a)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m059.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[059\]/);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'retention_runs'")
        .all()
    ).toEqual([]);

    // Control: the same migration completes once the fault is gone.
    db.exec('DROP INDEX retention_runs');
    m059.up(db);
    expect(cols(db, 'retention_runs')).toEqual(RUN_COLS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is registered in migrationRunner after 058', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/059-retention-runs'`);
    expect(src.indexOf('058-book-glossary-layer')).toBeLessThan(src.indexOf('059-retention-runs'));
  });

  it('checks.schema lists every retention_runs column and names the table when it is missing', () => {
    const db = migrated();
    expect(EXPECTED_SCHEMA.tables.retention_runs).toEqual(Object.keys(RUN_COLS));
    expect(checkSchema(db)).toEqual({ ok: true, missing: [] }); // control: a fresh database is ok
    db.exec('DROP TABLE retention_runs');
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['retention_runs'] });
  });
});
