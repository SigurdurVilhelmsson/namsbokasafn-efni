/**
 * Migration 053: served_text_versions and the G1.1 editing columns (spec §5.2, §5.8, §13).
 *
 * The schema is read back from a database every real migration built (freshMigratedDb), except
 * where a test needs the editing tables in their pre-053 shape with rows already in them; there it
 * runs 008, 009, 038, 039 and 043 by hand, which build both tables as production has them today.
 * The never-throw test is the model's (048, 052): a fault anywhere rolls the whole unit back,
 * warns once, and the next start completes it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const m008 = require('../migrations/008-segment-editing');
const m009 = require('../migrations/009-segment-edit-apply');
const m038 = require('../migrations/038-segment-edit-review-id');
const m039 = require('../migrations/039-segment-edit-exit-path');
const m043 = require('../migrations/043-segment-acceptances');
const m053 = require('../migrations/053-served-text-versions');

const __dirname = dirname(fileURLToPath(import.meta.url));

const open = [];
function track(db) {
  open.push(db);
  return db;
}
afterEach(() => {
  while (open.length) open.pop().close();
  vi.restoreAllMocks();
});

const migrated = () => track(freshMigratedDb().db);

const NEW_EDIT_COLUMNS = [
  'served_version_id',
  'occurrence',
  'origin',
  'displayed_edit_id',
  'displayed_edit_sha256',
];
const NEW_ACCEPTANCE_COLUMNS = ['served_version_id', 'occurrence'];

const columnsOf = (db, table) => db.pragma(`table_info(${table})`).map((c) => c.name);

function insertVersion(db, overrides = {}) {
  const row = {
    book: 'efnafraedi-2e',
    chapter: 1,
    module_id: 'm68664',
    segment_id: 'm68664:para:fs-a',
    occurrence: 0,
    en_sha256: 'a'.repeat(64),
    is_sha256: 'a'.repeat(64),
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
    .run(row);
}

function insertEdit(db, extra = {}) {
  const cols = {
    book: 'efnafraedi-2e',
    chapter: 1,
    module_id: 'm68664',
    segment_id: 'm68664:para:fs-a',
    original_content: 'Sýra',
    edited_content: 'Sýran',
    editor_id: 'u-ed1',
    editor_username: 'editor1',
    ...extra,
  };
  const names = Object.keys(cols);
  return db
    .prepare(
      `INSERT INTO segment_edits (${names.join(', ')})
       VALUES (${names.map((n) => '@' + n).join(', ')})`
    )
    .run(cols);
}

/** The editing tables in their pre-053 shape, as production has them today. */
function pre053() {
  const db = track(new Database(':memory:'));
  for (const m of [m008, m009, m038, m039, m043]) m.up(db);
  return db;
}

describe('migration 053 served_text_versions', () => {
  it('creates served_text_versions with every column NOT NULL', () => {
    const db = migrated();
    expect(
      Object.fromEntries(
        db.pragma('table_info(served_text_versions)').map((c) => [c.name, [c.type, c.notnull]])
      )
    ).toEqual({
      // An INTEGER PRIMARY KEY reports notnull 0.
      id: ['INTEGER', 0],
      book: ['TEXT', 1],
      chapter: ['INTEGER', 1],
      module_id: ['TEXT', 1],
      segment_id: ['TEXT', 1],
      occurrence: ['INTEGER', 1],
      en_sha256: ['TEXT', 1],
      is_sha256: ['TEXT', 1],
      layer: ['TEXT', 1],
      en_text: ['TEXT', 1],
      is_text: ['TEXT', 1],
    });
  });

  it('has the eight-part unique key, in order', () => {
    const db = migrated();
    expect(db.pragma('index_list(served_text_versions)')).toContainEqual(
      expect.objectContaining({ name: 'idx_served_text_versions_key', unique: 1 })
    );
    expect(db.pragma("index_info('idx_served_text_versions_key')").map((c) => c.name)).toEqual([
      'book',
      'chapter',
      'module_id',
      'segment_id',
      'occurrence',
      'en_sha256',
      'is_sha256',
      'layer',
    ]);
  });

  it('refuses a second identical version and admits a layer-only difference', () => {
    const db = migrated();
    insertVersion(db);
    expect(() => insertVersion(db)).toThrow(/UNIQUE/);
    // The control: the same bytes under another layer are another version (spec §5.2).
    expect(() => insertVersion(db, { layer: 'faithful' })).not.toThrow();
    expect(() => insertVersion(db, { layer: 'bogus' })).toThrow(/CHECK/);
    expect(db.prepare('SELECT layer FROM served_text_versions ORDER BY id').pluck().all()).toEqual([
      'mt-output',
      'faithful',
    ]);
  });

  it('both hashes are 64 lowercase hex (decision 2)', () => {
    const db = migrated();
    let n = 0;
    const attempt = (column, value) => () =>
      insertVersion(db, { segment_id: `bad-${n++}`, [column]: value });
    expect(attempt('en_sha256', 'A'.repeat(64))).toThrow(/CHECK/);
    expect(attempt('en_sha256', 'g'.repeat(64))).toThrow(/CHECK/);
    expect(attempt('is_sha256', 'A'.repeat(64))).toThrow(/CHECK/);
    expect(attempt('is_sha256', 'g'.repeat(64))).toThrow(/CHECK/);
    // The control, in the same fixture: lowercase hex in both columns inserts.
    insertVersion(db, { segment_id: 'ok', en_sha256: 'b'.repeat(64), is_sha256: 'b'.repeat(64) });
    expect(db.prepare('SELECT segment_id FROM served_text_versions').pluck().all()).toEqual(['ok']);
  });

  it('adds the new columns; rows made before G1.1 read NULL and keep their values', () => {
    const db = pre053();
    insertEdit(db, { category: 'terminology', editor_note: 'athugasemd' });
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES ('efnafraedi-2e', 1, 'm68664', 'm68664:para:fs-b', 'Basi', 'u-ed1', 'editor1')`
    ).run();
    const editBefore = db.prepare('SELECT * FROM segment_edits').get();
    const accBefore = db.prepare('SELECT * FROM segment_acceptances').get();
    for (const c of NEW_EDIT_COLUMNS) expect(editBefore).not.toHaveProperty(c); // the seed is pre-053
    for (const c of NEW_ACCEPTANCE_COLUMNS) expect(accBefore).not.toHaveProperty(c);

    m053.up(db);

    expect(db.prepare('SELECT * FROM segment_edits').get()).toEqual({
      ...editBefore,
      ...Object.fromEntries(NEW_EDIT_COLUMNS.map((c) => [c, null])),
    });
    expect(db.prepare('SELECT * FROM segment_acceptances').get()).toEqual({
      ...accBefore,
      ...Object.fromEntries(NEW_ACCEPTANCE_COLUMNS.map((c) => [c, null])),
    });
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
    m053.up(db);
    expect(schema()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never throws: a missing table rolls the whole unit back, warns once, and the next start completes it', () => {
    const db = track(new Database(':memory:'));
    for (const m of [m008, m009, m038, m039]) m.up(db); // no segment_acceptances
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => m053.up(db)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[053\]/);
    // Atomic: neither the table nor any column added before the fault survives.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'served_text_versions'").get()
    ).toBeUndefined();
    expect(columnsOf(db, 'segment_edits')).not.toContain('served_version_id');
    for (const c of NEW_EDIT_COLUMNS) expect(columnsOf(db, 'segment_edits')).not.toContain(c);

    // The control: the same migration completes once the fault is gone.
    m043.up(db);
    m053.up(db);
    expect(columnsOf(db, 'segment_edits')).toEqual(expect.arrayContaining(NEW_EDIT_COLUMNS));
    expect(columnsOf(db, 'segment_acceptances')).toEqual(
      expect.arrayContaining(NEW_ACCEPTANCE_COLUMNS)
    );
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'served_text_versions'").get()
    ).toEqual({ name: 'served_text_versions' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('the foreign key is live', () => {
    const db = migrated();
    expect(() => insertEdit(db, { served_version_id: 999999 })).toThrow(
      /FOREIGN KEY constraint failed/
    );
    // The control: a real served version's id inserts.
    const { lastInsertRowid } = insertVersion(db);
    expect(() =>
      insertEdit(db, { segment_id: 'm68664:para:fs-c', served_version_id: lastInsertRowid })
    ).not.toThrow();
    expect(
      db.prepare('SELECT served_version_id FROM segment_edits').pluck().all().map(Number)
    ).toEqual([Number(lastInsertRowid)]);
  });

  // PR1 review C27 (Review Focus 12): 053 adds the same REFERENCES to segment_acceptances, so it is pinned there too.
  it('the foreign key is live on segment_acceptances too', () => {
    const db = migrated();
    const insertAcceptance = (extra) =>
      db
        .prepare(
          `INSERT INTO segment_acceptances
             (book, chapter, module_id, segment_id, accepted_content, accepted_by,
              accepted_by_username, served_version_id)
           VALUES ('efnafraedi-2e', 1, 'm68664', @segment_id, 'Basi', 'u-ed1', 'editor1',
                   @served_version_id)`
        )
        .run(extra);
    expect(() =>
      insertAcceptance({ segment_id: 'm68664:para:fs-b', served_version_id: 999999 })
    ).toThrow(/FOREIGN KEY constraint failed/);
    // The control: a real served version's id inserts.
    const { lastInsertRowid } = insertVersion(db);
    expect(() =>
      insertAcceptance({ segment_id: 'm68664:para:fs-c', served_version_id: lastInsertRowid })
    ).not.toThrow();
    expect(
      db.prepare('SELECT served_version_id FROM segment_acceptances').pluck().all().map(Number)
    ).toEqual([Number(lastInsertRowid)]);
  });

  it('is registered in migrationRunner after 052', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'migrationRunner.js'), 'utf-8');
    expect(src).toContain(`'../migrations/053-served-text-versions'`);
    expect(src.indexOf('052-retire-chapter-generated-files')).toBeLessThan(
      src.indexOf('053-served-text-versions')
    );
  });
});
