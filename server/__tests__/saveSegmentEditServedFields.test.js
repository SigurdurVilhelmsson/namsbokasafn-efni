/**
 * saveSegmentEdit stores the served fields, and a re-save moves the base record (G1.1; spec §5.8,
 * §5.6 step 6; plan Task 12, decisions 10 and 11).
 *
 * On a database built by every real migration (freshMigratedDb), so the foreign key from
 * segment_edits.served_version_id to served_text_versions is live, as it is in production. The
 * served-version ids are real ones, minted by servedVersions.mintVersions. Both books roots point at
 * an empty temp directory: no MT file exists there, so the first-edit lock hook writes nothing, and
 * nothing under books/ is read or written.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const built = freshMigratedDb();
// Before any service loads: a service that resolves the database path at load finds the temp file.
process.env.SESSIONS_DB_PATH = built.path;

const service = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const servedVersions = require('../services/servedVersions');

const db = built.db;
const KEY = Object.freeze({
  book: 'testbook',
  chapter: 1,
  moduleId: 'm00001',
  segmentId: 'm00001:para:fs-id001',
});
const FIELDS =
  'original_content, served_version_id, occurrence, origin, displayed_edit_id, displayed_edit_sha256';

let root;
let realBooksDir;
let v1;
let v2;

function versionRow(is) {
  return servedVersions.buildVersionRow({
    ...KEY,
    occurrence: 0,
    en: 'The base.',
    is,
    layer: 'mt-output',
  });
}

function save(fields) {
  return service.saveSegmentEdit({
    ...KEY,
    category: null,
    editorNote: null,
    editorId: 'u-ed1',
    editorUsername: 'editor1',
    ...fields,
  });
}

function tuple(id) {
  const row = db.prepare(`SELECT ${FIELDS} FROM segment_edits WHERE id = ?`).get(id);
  return row ? Object.values(row) : undefined;
}

const editCount = () => db.prepare('SELECT COUNT(*) AS n FROM segment_edits').get().n;

beforeAll(() => {
  service._setTestDb(db);
  realBooksDir = segmentParser.BOOKS_DIR;
  root = mkdtempSync(path.join(tmpdir(), 'save-served-fields-'));
  service._setTestBooksDir(root);
  segmentParser._setTestBooksDir(root);
});

afterAll(() => {
  service._setTestBooksDir(realBooksDir);
  segmentParser._setTestBooksDir(realBooksDir);
  service._setTestDb(null);
  db.close();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
  db.exec('DELETE FROM served_text_versions');
  [v1] = servedVersions.mintVersions(db, [versionRow('B1')]);
  [v2] = servedVersions.mintVersions(db, [versionRow('B2')]);
});

const SERVED_INSERT = Object.freeze({
  originalContent: 'B1',
  editedContent: 'E1',
  servedVersionId: null, // set per test: v1 is minted in beforeEach
  occurrence: 0,
  origin: 'editor-save',
  displayedEditId: null,
  displayedEditSha256: null,
});

describe('saveSegmentEdit — the served fields (G1.1)', () => {
  it('an INSERT stores the served fields', () => {
    expect(Number.isInteger(v1)).toBe(true);
    expect(v2).not.toBe(v1);
    const result = save({ ...SERVED_INSERT, servedVersionId: v1 });
    expect(result.updated).toBe(false);
    expect(tuple(result.id)).toEqual(['B1', v1, 0, 'editor-save', null, null]);
  });

  it('a re-save moves original_content and the served fields to this save’s values, keeping the id', () => {
    const first = save({ ...SERVED_INSERT, servedVersionId: v1 });
    const second = save({
      ...SERVED_INSERT,
      originalContent: 'B2',
      editedContent: 'E2',
      servedVersionId: v2,
      origin: 'editor-save',
      displayedEditId: 7,
      displayedEditSha256: 'a'.repeat(64),
    });
    expect(second.id).toBe(first.id);
    expect(second.updated).toBe(true);
    expect(tuple(first.id)).toEqual(['B2', v2, 0, 'editor-save', 7, 'a'.repeat(64)]);
    expect(
      db.prepare('SELECT edited_content FROM segment_edits WHERE id = ?').get(first.id)
    ).toEqual({ edited_content: 'E2' });
    expect(editCount()).toBe(1);
  });

  it('a legacy re-save writes the base it was given and NULLs what it does not know', () => {
    const first = save({ ...SERVED_INSERT, servedVersionId: v1 });
    const beforeRow = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(first.id);
    const second = save({ originalContent: 'B3', editedContent: 'E3' });
    // PR3 adds before and the two lists on purpose (spec §5.9); the id and flag are today's.
    expect(second).toEqual({
      id: first.id,
      updated: true,
      before: beforeRow,
      supersededEditIds: [],
      supersededAcceptanceIds: [],
    });
    expect(tuple(first.id)).toEqual(['B3', null, null, null, null, null]);
  });

  it('a legacy INSERT writes NULLs and returns today’s shape', () => {
    const result = save({ originalContent: 'B1', editedContent: 'E1' });
    // PR3 adds the two lists on purpose (spec §5.9); `reverted` stays absent (errorHandling.test.js).
    expect(Object.keys(result).sort()).toEqual([
      'id',
      'supersededAcceptanceIds',
      'supersededEditIds',
      'updated',
    ]);
    expect(result.updated).toBe(false);
    expect(tuple(result.id)).toEqual(['B1', null, null, null, null, null]);
  });

  it('withdraw is still edited === original', () => {
    const first = save({ ...SERVED_INSERT, servedVersionId: v1 });
    const withdraw = save({ ...SERVED_INSERT, servedVersionId: v1, editedContent: 'B1' });
    expect(withdraw).toMatchObject({ reverted: true, updated: true });
    expect(withdraw.id).toBe(first.id);
    expect(tuple(first.id)).toBeUndefined();
    expect(editCount()).toBe(0);
  });

  it('a servedVersionId with no row fails loud (the foreign key is live)', () => {
    expect(
      db.prepare('SELECT id FROM served_text_versions WHERE id = 999999').get()
    ).toBeUndefined();
    expect(() => save({ ...SERVED_INSERT, servedVersionId: 999999 })).toThrow(
      /FOREIGN KEY constraint failed/
    );
    expect(editCount()).toBe(0);
    // Control: the same save on a real served version writes its row.
    const ok = save({ ...SERVED_INSERT, servedVersionId: v1 });
    expect(tuple(ok.id)).toEqual(['B1', v1, 0, 'editor-save', null, null]);
    expect(editCount()).toBe(1);
  });

  it('getDb returns the connection saveSegmentEdit writes on', () => {
    expect(service.getDb()).toBe(db);
  });
});
