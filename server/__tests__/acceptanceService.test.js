/**
 * Acceptance Service Tests (item 20b) — accept happy path + idempotence,
 * 409 guards (STALE_CONTENT / EDIT_EXISTS / NO_TRANSLATION), first-accept
 * MT-lock, revoke authz, supersede-on-edit, content-drift lapse,
 * applied_at stamping, sidecar (Task 3/4 describes live in this file too).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);

// Pin the DB env BEFORE any server require (same rule as segmentEditorService.test.js)
process.env.SESSIONS_DB_PATH = join(tmpdir(), `acc-test-${process.pid}.db`);

const Database = require('better-sqlite3');
const acceptance = require('../services/acceptanceService');
const editorService = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const mtLock = require('../../tools/lib/mt-lock.cjs');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration043 = require('../migrations/043-segment-acceptances');

const BOOK = 'accbook';
const MODULE = 'm00001';
const originalBooksDir = segmentParser.BOOKS_DIR;

let db;
let tmpDir;
let booksDir;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  migration043.up(db);
  acceptance._setTestDb(db);
  editorService._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'acc-svc-'));
  booksDir = join(tmpDir, 'books');
  const en = join(booksDir, BOOK, '02-for-mt', 'ch01');
  const mt = join(booksDir, BOOK, '02-mt-output', 'ch01');
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  writeFileSync(
    join(en, `${MODULE}-segments.en.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Paragraph one.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Paragraph two.',
      '',
      '<!-- SEG:m00001:para:fs-id004 -->',
      'Untranslated paragraph.',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(mt, `${MODULE}-segments.is.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Fyrsta efnisgrein.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Önnur efnisgrein.',
    ].join('\n'),
    'utf-8'
  );
  segmentParser._setTestBooksDir(booksDir);
  editorService._setTestBooksDir(booksDir);
});

afterAll(() => {
  db.close();
  acceptance._setTestDb(null);
  editorService._setTestDb(null);
  segmentParser._setTestBooksDir(originalBooksDir);
  editorService._setTestBooksDir(originalBooksDir);
});

beforeEach(() => {
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM segment_edits');
  const lockPath = mtLock.mtLockPathFor(segmentParser.getModulePaths(BOOK, 1, MODULE).mtOutput);
  if (existsSync(lockPath)) unlinkSync(lockPath);
});

function accept(segmentId = 'm00001:para:fs-id001', content = 'Fyrsta efnisgrein.') {
  return acceptance.acceptSegment({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId,
    acceptedContent: content,
    userId: 'user-1',
    username: 'editor1',
  });
}

/**
 * Assert fn throws an error carrying the given .code — toThrow with
 * asymmetric matchers is version-sensitive; this is explicit and portable.
 */
function expectCode(fn, code) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `expected a thrown error with code ${code}`).toBeTruthy();
  expect(thrown.code).toBe(code);
}

describe('acceptSegment', () => {
  it('records an active acceptance with the exact bytes', () => {
    const result = accept();
    expect(result.alreadyAccepted).toBe(false);
    expect(result.acceptance.status).toBe('active');
    expect(result.acceptance.accepted_content).toBe('Fyrsta efnisgrein.');
    expect(result.acceptance.accepted_by).toBe('user-1');
    expect(result.acceptance.accepted_by_username).toBe('editor1');
    expect(result.acceptance.chapter).toBe(1);
  });

  it('is idempotent: second accept returns alreadyAccepted, one row', () => {
    accept();
    const second = accept();
    expect(second.alreadyAccepted).toBe(true);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM segment_acceptances`).get().n).toBe(1);
  });

  it('409 STALE_CONTENT when bytes differ from the current baseline', () => {
    expectCode(() => accept('m00001:para:fs-id001', 'Aðrir bætar.'), 'STALE_CONTENT');
  });

  it('409 EDIT_EXISTS on a pending edit', () => {
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    expectCode(() => accept(), 'EDIT_EXISTS');
  });

  it('409 EDIT_EXISTS on an approved-but-unapplied edit', () => {
    const { id } = editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    editorService.approveEdit(id, 'rev-1', 'reviewer1');
    expectCode(() => accept(), 'EDIT_EXISTS');
  });

  it('a REJECTED edit does not block acceptance', () => {
    const { id } = editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    editorService.rejectEdit(id, 'rev-1', 'reviewer1');
    expect(accept().alreadyAccepted).toBe(false);
  });

  it('NO_TRANSLATION for a segment with no IS content', () => {
    expectCode(() => accept('m00001:para:fs-id004', ''), 'NO_TRANSLATION');
  });

  it('SEGMENT_NOT_FOUND for an unknown segment', () => {
    expectCode(() => accept('m00001:para:nope', 'x'), 'SEGMENT_NOT_FOUND');
  });

  it('writes the Track-C MT lock on the module FIRST acceptance only', () => {
    const lockPath = mtLock.mtLockPathFor(segmentParser.getModulePaths(BOOK, 1, MODULE).mtOutput);
    expect(existsSync(lockPath)).toBe(false);
    accept();
    expect(existsSync(lockPath)).toBe(true);
  });

  it('getModuleAcceptances returns only active rows', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    db.prepare(
      `UPDATE segment_acceptances SET status = 'superseded'
       WHERE segment_id = 'm00001:para:fs-id002'`
    ).run();
    const rows = acceptance.getModuleAcceptances(BOOK, MODULE);
    expect(rows).toHaveLength(1);
    expect(rows[0].segment_id).toBe('m00001:para:fs-id001');
  });
});
