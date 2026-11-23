/**
 * Migration 060: editor_licence_clauses (G1.13 spec §6.4).
 *
 * The record that an editor signed the licence clause: append-only, no foreign key on user_id, kept by retention.
 * The schema is read back from a database every real migration built (freshMigratedDb). The never-throw test is
 * 059's: an index holding the table's name makes its CREATE TABLE throw inside the unit.
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
const m060 = require('../migrations/060-editor-licence-clauses');

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

const CLAUSE_COLS = {
  id: ['INTEGER', 0],
  user_id: ['INTEGER', 1],
  signed_on: ['TEXT', 1],
  recorded_by: ['TEXT', 1],
  recorded_at_ms: ['INTEGER', 1],
};

function clause(db, { userId = 7, signedOn = '2026-11-01', by = 'adm', at = 1 } = {}) {
  return db
    .prepare(
      'INSERT INTO editor_licence_clauses (user_id, signed_on, recorded_by, recorded_at_ms) VALUES (?, ?, ?, ?)'
    )
    .run(userId, signedOn, by, at);
}

describe('migration 060: editor_licence_clauses', () => {
  it('creates the table, column by column', () => {
    expect(cols(migrated(), 'editor_licence_clauses')).toEqual(CLAUSE_COLS);
  });

  it('creates the user index', () => {
    const db = migrated();
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
      .pluck()
      .all('editor_licence_clauses');
    expect(idx).toContain('idx_editor_licence_clauses_user');
  });

  it('has no foreign key, so the evidence outlives the account row', () => {
    const db = migrated();
    expect(db.pragma('foreign_key_list(editor_licence_clauses)')).toEqual([]);
    expect(() => clause(db, { userId: 987654 })).not.toThrow(); // no users row 987654
  });

  it('refuses an UPDATE as append-only, and a DELETE is still possible', () => {
    const db = migrated();
    const { lastInsertRowid: id } = clause(db);
    expect(() =>
      db
        .prepare('UPDATE editor_licence_clauses SET signed_on = ? WHERE id = ?')
        .run('2026-11-02', id)
    ).toThrow(/append-only/);
    expect(db.prepare('DELETE FROM editor_licence_clauses WHERE id = ?').run(id).changes).toBe(1);
  });

  it('refuses a date that is not YYYY-MM-DD, and admits one that is', () => {
    const db = migrated();
    expect(() => clause(db, { signedOn: '2026-1-1' })).toThrow(/CHECK/);
    expect(() => clause(db, { signedOn: '2026-11-01' })).not.toThrow();
  });

  it('refuses a non-positive recorded_at_ms', () => {
    const db = migrated();
    expect(() => clause(db, { at: 0 })).toThrow(/CHECK/);
  });

  it('is idempotent', () => {
    const db = migrated();
    clause(db);
    const schema = () => db.prepare('SELECT sql FROM sqlite_master ORDER BY name').pluck().all();
    const before = schema();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m060.up(db);
    expect(schema()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) FROM editor_licence_clauses').pluck().get()).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a colliding object leaves no table, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    db.exec('CREATE TABLE z (a); CREATE INDEX editor_licence_clauses ON z (a)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m060.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[060\]/);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'editor_licence_clauses'"
        )
        .all()
    ).toEqual([]);

    // Control: the same migration completes once the fault is gone.
    db.exec('DROP INDEX editor_licence_clauses');
    m060.up(db);
    expect(cols(db, 'editor_licence_clauses')).toEqual(CLAUSE_COLS);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is registered in migrationRunner after 059', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/060-editor-licence-clauses'`);
    expect(src.indexOf('059-retention-runs')).toBeLessThan(
      src.indexOf('060-editor-licence-clauses')
    );
  });

  it('checks.schema lists every column and names the table when it is missing', () => {
    const db = migrated();
    expect(EXPECTED_SCHEMA.tables.editor_licence_clauses).toEqual(Object.keys(CLAUSE_COLS));
    expect(checkSchema(db)).toEqual({ ok: true, missing: [] }); // control: a fresh database is ok
    db.exec('DROP TABLE editor_licence_clauses');
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['editor_licence_clauses'] });
  });
});
