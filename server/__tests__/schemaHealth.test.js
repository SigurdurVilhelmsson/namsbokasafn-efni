/**
 * checks.schema in /api/health (spec §5.20, §5.8; plan decision 3).
 *
 * checks.migrations only counts migration files, so a never-throw migration that failed would
 * otherwise show only as save errors. checkSchema names every table, column and index the G1.1
 * migrations add that the database lacks, and never throws. Each case below removes one thing from
 * a database every real migration built and asserts that exactly that name, and nothing else, is
 * reported; the fresh database is the control.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { EXPECTED_SCHEMA, checkSchema } = require('../lib/schemaHealth');
const m054 = require('../migrations/054-module-openings');

const __dirname = dirname(fileURLToPath(import.meta.url));

const open = [];
function migrated() {
  const { db } = freshMigratedDb();
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

describe('checkSchema', () => {
  it('a fresh migrated database is ok', () => {
    expect(checkSchema(migrated())).toEqual({ ok: true, missing: [] });
  });

  it('a missing table is named, with its index', () => {
    const db = migrated();
    // No row references it, so the live foreign key on served_version_id permits the drop.
    db.exec('DROP TABLE served_text_versions');
    expect(checkSchema(db)).toEqual({
      ok: false,
      missing: ['served_text_versions', 'index idx_served_text_versions_key'],
    });
  });

  it('a missing column is named', () => {
    const db = migrated();
    db.exec('ALTER TABLE segment_edits DROP COLUMN origin');
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['segment_edits.origin'] });
  });

  it('a missing column of a present tables entry is named as <table>.<column>, and its table is not', () => {
    const db = migrated();
    // No index or CHECK names en_text, so SQLite permits the drop. The table's other ten columns,
    // still present, are the control.
    db.exec('ALTER TABLE served_text_versions DROP COLUMN en_text');
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['served_text_versions.en_text'] });
  });

  it('never throws: a closed handle reports not ok', () => {
    const db = migrated();
    db.close();
    const result = checkSchema(db);
    expect(result.ok).toBe(false);
    expect(result.missing).toBeNull();
    expect(typeof result.error).toBe('string');
  });

  it('a columns entry names each absent column, whether or not its table exists', () => {
    // The rule PR2–PR4 rely on when they append entries. An absent table under `columns` is not
    // collapsed to the table's name, unlike an absent `tables` entry.
    const db = migrated();
    const result = checkSchema(db, {
      tables: { no_such_table: ['a'] },
      columns: { no_such_table: ['a', 'b'], segment_edits: ['id', 'no_such_column'] },
      indexes: ['no_such_index'],
    });
    expect(result).toEqual({
      ok: false,
      missing: [
        'no_such_table',
        'no_such_table.a',
        'no_such_table.b',
        'segment_edits.no_such_column',
        'index no_such_index',
      ],
    });
  });

  it('PR2: a missing opening table is named', () => {
    // `a fresh migrated database is ok` above is this case's positive control: migration 054
    // builds both tables, so only the drop below can make one missing.
    const db = migrated();
    db.exec('DROP TABLE module_opening_inflight');
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['module_opening_inflight'] });
    // `tables` maps a table to EVERY column it has, so each PR2 entry equals the migrated table.
    const columnsOf = (table) => db.pragma(`table_info(${table})`).map((c) => c.name);
    expect(EXPECTED_SCHEMA.tables.module_openings).toEqual(columnsOf('module_openings'));
    expect(EXPECTED_SCHEMA.tables.module_opening_inflight).toEqual([
      'book',
      'chapter',
      'module_id',
      'segment_id',
      'occurrence',
    ]);
  });

  it('PR2: a VIEW under an opening table name is named as missing, though the migration reports success over it', () => {
    // A VIEW satisfies 054's CREATE TABLE IF NOT EXISTS and answers table_info with its columns, so
    // the name looked present while every assigned serve's INSERT would fail (PR2 review U42).
    const db = migrated();
    db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
    db.exec(
      `CREATE TABLE decoy (book TEXT, chapter INTEGER, module_id TEXT, opened_at_ms INTEGER,
         inflight_count INTEGER);
       CREATE VIEW module_openings AS SELECT * FROM decoy`
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m054.up(db);
    expect(warn).not.toHaveBeenCalled();
    expect(
      db
        .prepare(
          "SELECT type, name FROM sqlite_master WHERE name LIKE 'module_opening%' ORDER BY name"
        )
        .all()
    ).toEqual([
      { type: 'table', name: 'module_opening_inflight' },
      { type: 'view', name: 'module_openings' },
    ]);
    // the view carries every expected column, so only its type can make it missing
    expect(db.pragma('table_info(module_openings)').map((c) => c.name)).toEqual(
      EXPECTED_SCHEMA.tables.module_openings
    );
    expect(checkSchema(db)).toEqual({ ok: false, missing: ['module_openings'] });
  });

  it('PR3: a fresh database is still ok', () => {
    expect(checkSchema(migrated())).toEqual({ ok: true, missing: [] });
  });

  it('PR3: a missing consent or switch table is named', () => {
    const db = migrated();
    db.exec('DROP TABLE IF EXISTS research_consent; DROP TABLE IF EXISTS book_switch_events;');
    const { missing } = checkSchema(db);
    // research_capture_losses is untouched: the control.
    expect(
      missing.filter((m) =>
        ['research_consent', 'research_capture_losses', 'book_switch_events'].includes(m)
      )
    ).toEqual(['research_consent', 'book_switch_events']);
  });

  it('a columns entry whose name a VIEW holds names each of its columns, as an absent table does', () => {
    const db = migrated();
    db.exec('CREATE VIEW not_a_table AS SELECT 1 AS a');
    expect(checkSchema(db, { tables: {}, columns: { not_a_table: ['a'] }, indexes: [] })).toEqual({
      ok: false,
      missing: ['not_a_table.a'],
    });
  });

  it('a table whose stored name differs only in case is present, as SQLite resolves it', () => {
    // The table check compares names lowercased (PR2 review U42); a case-sensitive compare would
    // name a real table as missing (PR2 review SB2).
    const db = migrated();
    db.exec('CREATE TABLE Mixed_Case (a INTEGER)');
    expect(checkSchema(db, { tables: { mixed_case: ['a'] }, columns: {}, indexes: [] })).toEqual({
      ok: true,
      missing: [],
    });
  });
});

describe('EXPECTED_SCHEMA', () => {
  it('lists every served_text_versions column, the seven added columns and the index', () => {
    // `tables` maps a table to EVERY column it has, so it is compared with the migrated table.
    const db = migrated();
    const columnsOf = (table) => db.pragma(`table_info(${table})`).map((c) => c.name);
    expect(EXPECTED_SCHEMA.tables.served_text_versions).toEqual(columnsOf('served_text_versions'));
    expect(EXPECTED_SCHEMA.tables.served_text_versions).toHaveLength(11);
    expect(EXPECTED_SCHEMA.columns).toEqual({
      segment_edits: [
        'served_version_id',
        'occurrence',
        'origin',
        'displayed_edit_id',
        'displayed_edit_sha256',
      ],
      segment_acceptances: ['served_version_id', 'occurrence'],
    });
    expect(EXPECTED_SCHEMA.indexes).toEqual(['idx_served_text_versions_key']);
  });

  it('is deeply frozen', () => {
    const levels = [
      EXPECTED_SCHEMA,
      EXPECTED_SCHEMA.tables,
      EXPECTED_SCHEMA.columns,
      EXPECTED_SCHEMA.indexes,
      ...Object.values(EXPECTED_SCHEMA.tables),
      ...Object.values(EXPECTED_SCHEMA.columns),
    ];
    expect(levels.every((o) => Object.isFrozen(o))).toBe(true);
  });
});

describe('index.js wires it into /api/health', () => {
  // The handler cannot be required in a unit test (startup.test.js says why), so the wiring is
  // pinned against the source, as startup.test.js pins the request-timing mount.
  const indexSource = readFileSync(join(__dirname, '..', 'index.js'), 'utf-8');

  it('index.js wires it into /api/health', () => {
    expect(indexSource).toContain("require('./lib/schemaHealth')");
    expect(indexSource).toMatch(/checks\.schema\s*=/);
    // The open-failure catch has checkSchema's own error shape.
    expect(indexSource).toContain('checks.schema = { ok: false, missing: null, error:');
  });
});
