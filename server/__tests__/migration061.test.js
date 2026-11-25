/**
 * Migration 061: served_text_versions.layer admits 'fable'.
 *
 * The database under test is built by running the real migrations 001–060 against a temp file, then
 * given served versions, editing rows that reference them, and an AUTOINCREMENT sequence above the
 * largest id (editorial retention deletes served versions, so that state is real). The rebuild is
 * checked byte for byte: rows, ids, child references, the child tables' schema text, the indexes,
 * the sequence, and the foreign_keys pragma afterwards. The never-throw tests follow 048's model: a
 * fault leaves the prior state, warns, and never throws.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const m061 = require('../migrations/061-served-layer-fable');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '..', 'migrations');

const open = [];
const dirs = [];
afterEach(() => {
  while (open.length) {
    const db = open.pop();
    if (db.open) db.close();
  }
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A database built by the real migrations 001–060, with their console output silenced. */
function dbAt060() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm061-'));
  dirs.push(dir);
  const db = new Database(path.join(dir, 'sessions.db'));
  open.push(db);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{3}-.*\.js$/.test(f) && Number(f.slice(0, 3)) <= 60)
    .sort();
  for (const f of files) require(path.join(MIGRATIONS, f)).up(db);
  log.mockRestore();
  warn.mockRestore();
  return db;
}

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

function insertVersion(db, overrides = {}) {
  const row = {
    book: 'efnafraedi-2e',
    chapter: 1,
    module_id: 'm68664',
    segment_id: 'm68664:para:fs-a',
    occurrence: 0,
    en_sha256: HEX_A,
    is_sha256: HEX_B,
    layer: 'mt-output',
    en_text: 'Acid',
    is_text: 'Sýra',
    ...overrides,
  };
  return db
    .prepare(
      `INSERT INTO served_text_versions
         (book, chapter, module_id, segment_id, occurrence, en_sha256, is_sha256, layer,
          en_text, is_text)
       VALUES (@book, @chapter, @module_id, @segment_id, @occurrence, @en_sha256, @is_sha256,
               @layer, @en_text, @is_text)`
    )
    .run(row).lastInsertRowid;
}

/** A database at 060 with five versions (the last deleted), an edit and an acceptance on them. */
function populated() {
  const db = dbAt060();
  insertVersion(db, { occurrence: 0, en_text: 'Acid base', is_text: 'Sýra og basi' });
  insertVersion(db, { occurrence: 1, layer: 'faithful', is_text: 'Línur\nmeð\ttáknum' });
  insertVersion(db, { occurrence: 2, layer: 'selected', segment_id: 'm68664:para:fs-b' });
  insertVersion(db, { chapter: -1, module_id: 'chapter-metadata', is_text: '' });
  const top = insertVersion(db, { occurrence: 9 });
  db.prepare('DELETE FROM served_text_versions WHERE id = ?').run(top);
  db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
       edited_content, editor_id, editor_username, served_version_id, occurrence, origin)
     VALUES ('efnafraedi-2e', 1, 'm68664', 'm68664:para:fs-a', 'o', 'e', 'u1', 'u1', 2, 1, 'save')`
  ).run();
  db.prepare(
    `INSERT INTO segment_acceptances (book, chapter, module_id, segment_id, accepted_content,
       accepted_by, accepted_by_username, served_version_id, occurrence)
     VALUES ('efnafraedi-2e', 1, 'm68664', 'm68664:para:fs-b', 'c', 'u2', 'u2', 3, 2)`
  ).run();
  return db;
}

/** Every row of a table as type-and-hex per column, so a changed byte or storage class shows. */
function rowBytes(db, table) {
  const cols = db.pragma(`table_info(${table})`).map((c) => c.name);
  const sel = cols.map((c) => `typeof(${c}) || ':' || hex(${c}) AS ${c}`).join(', ');
  return db.prepare(`SELECT ${sel} FROM ${table} ORDER BY rowid`).all();
}

const tableSql = (db, name) =>
  db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(name)?.sql;
const indexSql = (db) =>
  db
    .prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'served_text_versions'
       ORDER BY name`
    )
    .all();
const seqOf = (db) =>
  db.prepare(`SELECT seq FROM sqlite_sequence WHERE name = 'served_text_versions'`).get()?.seq;
const fkOn = (db) => db.pragma('foreign_keys', { simple: true });
const leftovers = (db) =>
  db
    .prepare(
      `SELECT name FROM sqlite_master WHERE name LIKE 'served_text_versions_%' AND type = 'table'`
    )
    .all();

/** The positive control: the rebuild happened (a no-op or a rollback also leaves rows unchanged). */
const widened = (db) => /'selected', 'fable'\)/.test(tableSql(db, 'served_text_versions'));

const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('migration 061: served_text_versions admits layer fable', () => {
  it('refuses layer fable before it runs (the control)', () => {
    const db = dbAt060();
    expect(() => insertVersion(db, { layer: 'fable' })).toThrow(/CHECK constraint failed/);
  });

  it('admits layer fable after it runs, and still refuses an unknown layer', () => {
    const db = dbAt060();
    m061.up(db);
    expect(() => insertVersion(db, { layer: 'fable' })).not.toThrow();
    expect(() => insertVersion(db, { layer: 'other', occurrence: 3 })).toThrow(
      /CHECK constraint failed/
    );
  });

  it('keeps every served version byte-identical with the same ids', () => {
    const db = populated();
    const before = rowBytes(db, 'served_text_versions');
    m061.up(db);
    expect({ widened: widened(db), rows: rowBytes(db, 'served_text_versions') }).toEqual({
      widened: true,
      rows: before,
    });
  });

  it('keeps the edit and acceptance rows byte-identical, still pointing at the same versions', () => {
    const db = populated();
    const edits = rowBytes(db, 'segment_edits');
    const accepts = rowBytes(db, 'segment_acceptances');
    m061.up(db);
    expect({
      widened: widened(db),
      children: [rowBytes(db, 'segment_edits'), rowBytes(db, 'segment_acceptances')],
    }).toEqual({ widened: true, children: [edits, accepts] });
  });

  it('leaves no foreign key violation behind', () => {
    const db = populated();
    m061.up(db);
    expect({ widened: widened(db), check: db.pragma('foreign_key_check') }).toEqual({
      widened: true,
      check: [],
    });
  });

  it('leaves foreign_keys on for the connection', () => {
    const db = populated();
    m061.up(db);
    expect({ widened: widened(db), fk: fkOn(db) }).toEqual({ widened: true, fk: 1 });
  });

  it.each([
    ['with child rows', populated],
    ['without child rows', dbAt060],
  ])('leaves the child tables referencing served_text_versions by that name (%s)', (_, build) => {
    const db = build();
    const before = [tableSql(db, 'segment_edits'), tableSql(db, 'segment_acceptances')];
    m061.up(db);
    expect({
      widened: widened(db),
      children: [tableSql(db, 'segment_edits'), tableSql(db, 'segment_acceptances')],
    }).toEqual({ widened: true, children: before });
  });

  it('keeps each child foreign key live on the rebuilt table', () => {
    const db = populated();
    m061.up(db);
    expect(() =>
      db
        .prepare('UPDATE segment_edits SET served_version_id = 999 WHERE served_version_id = 2')
        .run()
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('recreates idx_served_text_versions_key identically', () => {
    const db = populated();
    const before = indexSql(db);
    m061.up(db);
    expect({ widened: widened(db), indexes: indexSql(db) }).toEqual({
      widened: true,
      indexes: before,
    });
  });

  it('keeps the AUTOINCREMENT sequence above the largest id', () => {
    const db = populated();
    const before = seqOf(db);
    m061.up(db);
    expect({ widened: widened(db), seq: seqOf(db) }).toEqual({ widened: true, seq: before });
  });

  it('never reuses a deleted id after it runs', () => {
    const db = populated();
    m061.up(db);
    expect(Number(insertVersion(db, { occurrence: 20 }))).toBe(6);
  });

  it('keeps the sequence of a table emptied by retention', () => {
    const db = populated();
    db.prepare('DELETE FROM segment_edits').run();
    db.prepare('DELETE FROM segment_acceptances').run();
    db.prepare('DELETE FROM served_text_versions').run();
    m061.up(db);
    expect(Number(insertVersion(db, { occurrence: 20 }))).toBe(6);
  });

  it('changes only the layer CHECK in the table schema', () => {
    const db = populated();
    const before = tableSql(db, 'served_text_versions');
    m061.up(db);
    const after = tableSql(db, 'served_text_versions');
    const norm = (s) =>
      s
        .replace(/^CREATE TABLE "?served_text_versions(_new)?"?/, 'CREATE TABLE T')
        .replace(", 'fable'", '')
        .replace(/\s+/g, ' ');
    expect(norm(after)).toBe(norm(before));
  });

  it('leaves no working table behind', () => {
    const db = populated();
    m061.up(db);
    expect({ widened: widened(db), leftovers: leftovers(db) }).toEqual({
      widened: true,
      leftovers: [],
    });
  });

  it('is idempotent: a second start changes nothing and warns nothing', () => {
    const db = populated();
    m061.up(db);
    const schema = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();
    const changes = db.prepare('SELECT total_changes() AS n').get().n;
    const warn = quiet();
    m061.up(db);
    expect({
      schema: db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all(),
      changes: db.prepare('SELECT total_changes() AS n').get().n,
      warned: warn.mock.calls.length,
      fk: fkOn(db),
    }).toEqual({ schema, changes, warned: 0, fk: 1 });
  });

  it('a fresh database built by every migration ends with the widened CHECK', () => {
    const { db } = freshMigratedDb();
    open.push(db);
    expect(tableSql(db, 'served_text_versions')).toMatch(
      /layer IN \('mt-output', 'faithful', 'selected', 'fable'\)/
    );
  });

  describe('never throws', () => {
    /** served_text_versions rebuilt without en_text: the copy would fail inside the unit. */
    function malformed() {
      const db = dbAt060();
      db.pragma('foreign_keys = OFF');
      db.exec(`
        DROP TABLE served_text_versions;
        CREATE TABLE served_text_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT, book TEXT NOT NULL, chapter INTEGER NOT NULL,
          module_id TEXT NOT NULL, segment_id TEXT NOT NULL, occurrence INTEGER NOT NULL,
          en_sha256 TEXT NOT NULL, is_sha256 TEXT NOT NULL,
          layer TEXT NOT NULL CHECK (layer IN ('mt-output', 'faithful', 'selected')),
          is_text TEXT NOT NULL
        );
        INSERT INTO served_text_versions VALUES (1, 'b', 1, 'm', 's', 0, '${HEX_A}', '${HEX_B}', 'mt-output', 'x');
      `);
      db.pragma('foreign_keys = ON');
      return db;
    }

    it('a table missing a column: does not throw', () => {
      const db = malformed();
      quiet();
      expect(() => m061.up(db)).not.toThrow();
    });

    it('a table missing a column: warns', () => {
      const db = malformed();
      const warn = quiet();
      m061.up(db);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('a table missing a column: leaves the schema, rows and pragma as they were', () => {
      const db = malformed();
      const before = {
        sql: tableSql(db, 'served_text_versions'),
        rows: rowBytes(db, 'served_text_versions'),
      };
      quiet();
      m061.up(db);
      expect({
        sql: tableSql(db, 'served_text_versions'),
        rows: rowBytes(db, 'served_text_versions'),
        fk: fkOn(db),
        leftovers: leftovers(db),
      }).toEqual({ ...before, fk: 1, leftovers: [] });
    });

    it('a failure inside the rebuild rolls back every step and restores foreign_keys', () => {
      const db = populated();
      // A row the old CHECK should have refused: the copy into the new table fails on it, inside
      // the transaction, after the pragma is off and the new table exists.
      db.pragma('ignore_check_constraints = ON');
      insertVersion(db, { occurrence: -1 });
      db.pragma('ignore_check_constraints = OFF');
      const before = rowBytes(db, 'served_text_versions');
      const schema = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();
      const seq = seqOf(db);
      const warn = quiet();
      expect(() => m061.up(db)).not.toThrow();
      expect({
        warned: warn.mock.calls.length,
        schema: db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all(),
        rows: rowBytes(db, 'served_text_versions'),
        seq: seqOf(db),
        fk: fkOn(db),
      }).toEqual({ warned: 1, schema, rows: before, seq, fk: 1 });
    });

    it('a leftover working table: is left untouched, warns, and the rebuild waits', () => {
      const db = populated();
      const before = rowBytes(db, 'served_text_versions');
      const sql = tableSql(db, 'served_text_versions');
      db.exec('CREATE TABLE served_text_versions_new (x INTEGER)');
      db.exec('INSERT INTO served_text_versions_new VALUES (1)');
      const warn = quiet();
      expect(() => m061.up(db)).not.toThrow();
      expect({
        warned: warn.mock.calls.length,
        sql: tableSql(db, 'served_text_versions'),
        rows: rowBytes(db, 'served_text_versions'),
        fk: fkOn(db),
        stray: rowBytes(db, 'served_text_versions_new'),
      }).toEqual({ warned: 1, sql, rows: before, fk: 1, stray: [{ x: 'integer:31' }] });
    });

    it('a missing table: does nothing and does not throw', () => {
      const db = dbAt060();
      db.pragma('foreign_keys = OFF');
      db.exec('DROP TABLE served_text_versions');
      db.pragma('foreign_keys = ON');
      const warn = quiet();
      expect(() => m061.up(db)).not.toThrow();
      expect({ warned: warn.mock.calls.length, fk: fkOn(db) }).toEqual({ warned: 1, fk: 1 });
    });

    it('called inside an open transaction: leaves the table alone and does not throw', () => {
      const db = populated();
      const sql = tableSql(db, 'served_text_versions');
      quiet();
      db.exec('BEGIN');
      expect(() => m061.up(db)).not.toThrow();
      db.exec('ROLLBACK');
      expect({ sql: tableSql(db, 'served_text_versions'), fk: fkOn(db) }).toEqual({ sql, fk: 1 });
    });
  });
});

describe('checks.schema reports a 061 that did not complete (whole-branch review A M-4 / B I2)', () => {
  const { checkSchema } = require('../lib/schemaHealth');
  const MISSING = "served_text_versions.layer CHECK 'fable'";

  it('a database 061 refused (a leftover working table) is not ok, and names the CHECK', () => {
    const db = dbAt060();
    db.exec('CREATE TABLE served_text_versions_new (x INTEGER)');
    quiet();
    m061.up(db);
    expect(widened(db)).toBe(false); // control: 061 really refused
    expect(checkSchema(db)).toEqual({ ok: false, missing: [MISSING] });
  });

  it('a database built by every migration is ok', () => {
    const { db } = freshMigratedDb();
    open.push(db);
    expect(widened(db)).toBe(true); // control: 061 ran
    expect(checkSchema(db)).toEqual({ ok: true, missing: [] });
  });

  it('a served_text_versions with no layer CHECK of the known shape is not ok either', () => {
    const db = dbAt060();
    db.exec('DROP TABLE served_text_versions');
    db.exec(
      'CREATE TABLE served_text_versions (id INTEGER PRIMARY KEY, book TEXT, chapter INTEGER, ' +
        'module_id TEXT, segment_id TEXT, occurrence INTEGER, en_sha256 TEXT, is_sha256 TEXT, ' +
        'layer TEXT, en_text TEXT, is_text TEXT)'
    );
    db.exec(
      'CREATE UNIQUE INDEX idx_served_text_versions_key ON served_text_versions (book, chapter, ' +
        'module_id, segment_id, occurrence, en_sha256, is_sha256, layer)'
    );
    expect(checkSchema(db)).toEqual({ ok: false, missing: [MISSING] });
  });
});
