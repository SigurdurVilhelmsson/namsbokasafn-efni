/**
 * Migration 056: research_deletions and research_derived_datasets (G1.1 + G1.2 spec §5.15, §5.20;
 * PR4 Task 1).
 *
 * The schema is read back from a database every real migration built (freshMigratedDb). The
 * never-throw test is the model's (048, 053, 054, 055): a fault rolls the whole unit back, warns
 * once, and the next start completes it. Its fault must be an object that really collides: a
 * pre-existing research_deletions (x TEXT) would make CREATE TABLE IF NOT EXISTS a silent no-op,
 * so the collision is an index holding the second table's name.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const m056 = require('../migrations/056-research-deletions');

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

// Exactly these four: a rows, count or user_id column fails here, which is the point (spec §5.15).
const DELETION_COLS = {
  kind: ['TEXT', 1],
  interval_id: ['INTEGER', 0],
  done_at_ms: ['INTEGER', 1],
  verified: ['INTEGER', 1],
};
const DATASET_COLS = {
  path: ['TEXT', 1],
  sha256: ['TEXT', 1],
  created_day: ['TEXT', 1],
};

const HEX64 = 'a'.repeat(64);

function deletion(db, { kind = 'withdrawal', interval = 7, doneAt = 1, verified = 1 } = {}) {
  return db
    .prepare(
      `INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES (?, ?, ?, ?)`
    )
    .run(kind, interval, doneAt, verified);
}

function dataset(db, { path = 'x', sha = HEX64, day = '2026-11-03' } = {}) {
  return db
    .prepare(`INSERT INTO research_derived_datasets (path, sha256, created_day) VALUES (?, ?, ?)`)
    .run(path, sha, day);
}

describe('migration 056: research_deletions and research_derived_datasets', () => {
  it('creates both tables, column by column, and research_deletions holds no count and no person', () => {
    const db = migrated();
    expect(cols(db, 'research_deletions')).toEqual(DELETION_COLS);
    expect(cols(db, 'research_derived_datasets')).toEqual(DATASET_COLS);
  });

  it('the CHECKs refuse what the spec rules out, and admit what it allows', () => {
    const db = migrated();
    const pairs = [
      [() => deletion(db, { kind: 'purge' }), () => deletion(db, { kind: 'withdrawal' })],
      [
        () => deletion(db, { kind: 'withdrawal', interval: null }),
        () => deletion(db, { kind: 'withdrawal', interval: 7 }),
      ],
      [
        () => deletion(db, { kind: 'retention', interval: 7 }),
        () => deletion(db, { kind: 'retention', interval: null }),
      ],
      [() => deletion(db, { verified: 2 }), () => deletion(db, { verified: 1 })],
      [() => deletion(db, { doneAt: 0 }), () => deletion(db, { doneAt: 1 })],
      [() => dataset(db, { sha: 'a'.repeat(63) }), () => dataset(db, { sha: HEX64 })],
      [() => dataset(db, { sha: 'A'.repeat(64) }), () => dataset(db, { sha: 'a'.repeat(64) })],
      [() => dataset(db, { day: '2026-1-3' }), () => dataset(db, { day: '2026-11-03' })],
      [() => dataset(db, { path: '' }), () => dataset(db, { path: 'x' })],
    ];
    for (const [bad, good] of pairs) {
      expect(bad).toThrow(/CHECK/);
      expect(good).not.toThrow();
    }
  });

  it('no foreign key on research_deletions.interval_id, while foreign keys are live', () => {
    const db = migrated();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_list(research_deletions)')).toEqual([]);
    expect(() => deletion(db, { kind: 'withdrawal', interval: 999999 })).not.toThrow();
    // Control: a reference of the kind this table deliberately lacks would really bite.
    expect(() =>
      db
        .prepare(
          `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter)
           VALUES (999999, 'efnafraedi-2e', 1)`
        )
        .run()
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('is idempotent', () => {
    const db = migrated();
    const schema = () => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all();
    const before = schema();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m056.up(db);
    expect(schema()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a colliding object rolls the whole unit back, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    // An index holding the second table's name, so its CREATE TABLE throws inside the unit.
    db.exec('CREATE TABLE z (a); CREATE INDEX research_derived_datasets ON z (a)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m056.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[056\]/);
    // research_deletions was created first and rolled back with the rest: one transaction.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'research_deletions'").all()
    ).toEqual([]);

    // Control: the same migration completes once the fault is gone.
    db.exec('DROP INDEX research_derived_datasets');
    m056.up(db);
    expect(cols(db, 'research_deletions')).toEqual(DELETION_COLS);
    expect(cols(db, 'research_derived_datasets')).toEqual(DATASET_COLS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is registered in migrationRunner after 055', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/056-research-deletions'`);
    expect(src.indexOf('055-research-consent-and-switches')).toBeLessThan(
      src.indexOf('056-research-deletions')
    );
  });
});
