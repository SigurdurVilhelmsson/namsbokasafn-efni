/**
 * Migration 057: suggestion_rejections, suggestion_left_open and segment_edits.accepted_suggestions
 * (G1.23 spec §7; PR1 Task 4).
 *
 * The schema is read back from a database every real migration built (freshMigratedDb). The
 * never-throw test is the model's (048, 056): a fault rolls the whole unit back, warns once, and the
 * next start completes it. The fault is an index holding the second table's name, because a
 * pre-existing table of that name would make CREATE TABLE IF NOT EXISTS a silent no-op.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { checkSchema, EXPECTED_SCHEMA } = require('../lib/schemaHealth');
const m057 = require('../migrations/057-suggestion-view');

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
const names = (db, t) => db.pragma(`table_info(${t})`).map((c) => c.name);
const schema = (db) => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all();

const REJECTION_COLS = [
  'id',
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'occurrence',
  'op_id',
  'ruling_id',
  'run_id',
  'rejected_by',
  'rejected_at_ms',
];
const LEFT_OPEN_COLS = [
  'id',
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'occurrence',
  'op_id',
  'ruling_id',
  'run_id',
  'finishing_act',
  'finishing_kind',
  'finishing_id',
  'closed_by',
  'closed_at_ms',
  'shown_at_finish',
];

function rejection(db, o = {}) {
  const r = { occurrence: 0, opId: 'op1', at: 1, ...o };
  return db
    .prepare(
      `INSERT INTO suggestion_rejections
         (book, chapter, module_id, segment_id, occurrence, op_id, ruling_id, run_id, rejected_by, rejected_at_ms)
       VALUES ('b', 1, 'm1', 's1', ?, ?, 'r1', NULL, 5, ?)`
    )
    .run(r.occurrence, r.opId, r.at);
}

function leftOpen(db, o = {}) {
  const r = {
    occurrence: 0,
    opId: 'op1',
    act: 'approval',
    kind: 'segment_edit',
    shown: 1,
    at: 1,
    ...o,
  };
  return db
    .prepare(
      `INSERT INTO suggestion_left_open
         (book, chapter, module_id, segment_id, occurrence, op_id, ruling_id, run_id,
          finishing_act, finishing_kind, finishing_id, closed_by, closed_at_ms, shown_at_finish)
       VALUES ('b', 1, 'm1', 's1', ?, ?, 'r1', NULL, ?, ?, 9, 5, ?, ?)`
    )
    .run(r.occurrence, r.opId, r.act, r.kind, r.at, r.shown);
}

describe('migration 057: the suggestion editing record', () => {
  it('creates both tables and the column on a fresh database', () => {
    const db = migrated();
    expect(names(db, 'suggestion_rejections')).toEqual(REJECTION_COLS);
    expect(names(db, 'suggestion_left_open')).toEqual(LEFT_OPEN_COLS);
    expect(names(db, 'segment_edits')).toContain('accepted_suggestions');
  });

  it('is a no-op on a second run (every boot re-runs it)', () => {
    const db = migrated();
    const before = schema(db);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => m057.up(db)).not.toThrow();
    expect(schema(db)).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the CHECKs and the UNIQUE key refuse what the spec rules out, and admit a valid row', () => {
    const db = migrated();
    const pairs = [
      [() => rejection(db, { occurrence: -1 }), () => rejection(db, { occurrence: 0 })],
      [() => rejection(db, { at: 0, opId: 'op2' }), () => rejection(db, { at: 1, opId: 'op2' })],
      [() => leftOpen(db, { occurrence: -1 }), () => leftOpen(db, { occurrence: 0 })],
      [
        () => leftOpen(db, { act: 'x', opId: 'op2' }),
        () => leftOpen(db, { act: 'stadfesta-mt', opId: 'op2' }),
      ],
      [
        () => leftOpen(db, { kind: 'x', opId: 'op3' }),
        () => leftOpen(db, { kind: 'segment_acceptance', opId: 'op3' }),
      ],
      [
        () => leftOpen(db, { shown: 2, opId: 'op4' }),
        () => leftOpen(db, { shown: 0, opId: 'op4' }),
      ],
      [() => leftOpen(db, { at: 0, opId: 'op5' }), () => leftOpen(db, { at: 1, opId: 'op5' })],
    ];
    for (const [bad, good] of pairs) {
      expect(bad).toThrow(/CHECK/);
      expect(good).not.toThrow();
    }
    // The UNIQUE key: op1 at occurrence 0 exists in both tables from the controls above.
    expect(() => rejection(db, { occurrence: 0, opId: 'op1' })).toThrow(/UNIQUE/);
    expect(() => leftOpen(db, { occurrence: 0, opId: 'op1' })).toThrow(/UNIQUE/);
    // Control: a different occurrence of the same op is a different key.
    expect(() => rejection(db, { occurrence: 1, opId: 'op1' })).not.toThrow();
  });

  it('has no foreign key, while foreign keys are live', () => {
    const db = migrated();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_list(suggestion_rejections)')).toEqual([]);
    expect(db.pragma('foreign_key_list(suggestion_left_open)')).toEqual([]);
    // rejected_by 5 names no user in this database and the insert still lands.
    expect(() => rejection(db, { opId: 'fk' })).not.toThrow();
  });

  it('never throws: a colliding object rolls the whole unit back (ALTER included), warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    db.exec(
      'CREATE TABLE segment_edits (id INTEGER PRIMARY KEY);' +
        'CREATE TABLE z (a); CREATE INDEX suggestion_left_open ON z (a)'
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m057.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[057\]/);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'suggestion_rejections'").all()
    ).toEqual([]);
    expect(names(db, 'segment_edits')).toEqual(['id']);

    // Control: the same migration completes once the fault is gone.
    db.exec('DROP INDEX suggestion_left_open');
    m057.up(db);
    expect(names(db, 'suggestion_rejections')).toEqual(REJECTION_COLS);
    expect(names(db, 'suggestion_left_open')).toEqual(LEFT_OPEN_COLS);
    expect(names(db, 'segment_edits')).toEqual(['id', 'accepted_suggestions']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('checks.schema reports the new names missing on a database without 057', () => {
    const db = track(new Database(':memory:'));
    db.exec('CREATE TABLE segment_edits (id INTEGER PRIMARY KEY)');
    const { ok, missing } = checkSchema(db, EXPECTED_SCHEMA);
    expect(ok).toBe(false);
    expect(missing).toContain('suggestion_rejections');
    expect(missing).toContain('suggestion_left_open');
    expect(missing).toContain('segment_edits.accepted_suggestions');
    // Control: a database every migration built is healthy.
    expect(checkSchema(migrated(), EXPECTED_SCHEMA).ok).toBe(true);
  });

  it('is registered in migrationRunner after 056', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/057-suggestion-view'`);
    expect(src.indexOf('056-research-deletions')).toBeLessThan(src.indexOf('057-suggestion-view'));
  });
});
