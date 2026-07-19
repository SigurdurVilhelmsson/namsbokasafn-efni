/**
 * Acceptance Service Tests (item 20b) — accept happy path + idempotence,
 * 409 guards (STALE_CONTENT / EDIT_EXISTS / NO_TRANSLATION), first-accept
 * MT-lock, revoke authz, supersede-on-edit, content-drift lapse,
 * applied_at stamping, sidecar (Task 3/4 describes live in this file too).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  rmSync,
} from 'fs';
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
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
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

describe('revokeAcceptance authz', () => {
  it('owner can revoke; row flips to superseded(revoked)', () => {
    const { acceptance: a } = accept();
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'user-1',
      actorRole: 'editor',
      actorBooks: [],
    });
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('revoked');
    expect(row.superseded_at).toBeTruthy();
  });

  it('another editor cannot revoke (FORBIDDEN)', () => {
    const { acceptance: a } = accept();
    expectCode(
      () =>
        acceptance.revokeAcceptance(a.id, {
          actorId: 'user-9',
          actorRole: 'editor',
          actorBooks: [],
        }),
      'FORBIDDEN'
    );
  });

  it('book-scoped head editor can revoke; head editor of ANOTHER book cannot', () => {
    const { acceptance: a } = accept();
    expectCode(
      () =>
        acceptance.revokeAcceptance(a.id, {
          actorId: 'he-2',
          actorRole: 'head-editor',
          actorBooks: ['other-book'],
        }),
      'FORBIDDEN'
    );
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'he-1',
      actorRole: 'head-editor',
      actorBooks: [BOOK],
    });
    expect(row.status).toBe('superseded');
  });

  it('admin can revoke', () => {
    const { acceptance: a } = accept();
    const row = acceptance.revokeAcceptance(a.id, {
      actorId: 'adm',
      actorRole: 'admin',
      actorBooks: [],
    });
    expect(row.status).toBe('superseded');
  });

  it('unknown id / non-active row throw', () => {
    expect(() =>
      acceptance.revokeAcceptance(99999, {
        actorId: 'user-1',
        actorRole: 'editor',
        actorBooks: [],
      })
    ).toThrow('Acceptance not found');
    const { acceptance: a } = accept();
    acceptance.revokeAcceptance(a.id, {
      actorId: 'user-1',
      actorRole: 'editor',
      actorBooks: [],
    });
    expect(() =>
      acceptance.revokeAcceptance(a.id, {
        actorId: 'user-1',
        actorRole: 'editor',
        actorBooks: [],
      })
    ).toThrow('Acceptance is not active');
  });
});

describe('edit supersedes acceptance (spec §7)', () => {
  it('saving an edit on an accepted segment lapses the acceptance', () => {
    const { acceptance: a } = accept();
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt efnisgrein.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    const row = acceptance.getAcceptanceById(a.id);
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('superseded-by-edit');
  });

  it('withdrawing the edit does NOT resurrect the acceptance (re-accept is one keypress)', () => {
    const { acceptance: a } = accept();
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt efnisgrein.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    // Withdraw: identical content deletes the pending row (server :107-115)
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Fyrsta efnisgrein.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    expect(acceptance.getAcceptanceById(a.id).status).toBe('superseded');
    // ...and the segment can simply be re-accepted
    expect(accept().alreadyAccepted).toBe(false);
  });

  it('the UPDATE-existing-pending path also supersedes a later acceptance', () => {
    // pending edit first, acceptance would be blocked — so build the edge the
    // other way: edit on seg2, accept seg2 is blocked; instead verify the
    // update path on seg1: edit → (acceptance impossible) — so directly
    // insert an active acceptance row, then update the pending edit.
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt v1.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Fyrsta efnisgrein.', 'u9', 'editor9')`
    ).run(BOOK, MODULE);
    editorService.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Fyrsta efnisgrein.',
      editedContent: 'Breytt v2.',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });
    const row = db.prepare(`SELECT * FROM segment_acceptances WHERE accepted_by = 'u9'`).get();
    expect(row.status).toBe('superseded');
    expect(row.superseded_reason).toBe('superseded-by-edit');
  });
});

describe('lapseDrifted + stampApplied', () => {
  it('lapses when written bytes differ; keeps a matching acceptance active', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    const lapsed = acceptance.lapseDrifted(BOOK, MODULE, [
      { segmentId: 'm00001:para:fs-id001', content: 'Allt aðrir bætar.' },
      { segmentId: 'm00001:para:fs-id002', content: 'Önnur efnisgrein.' },
    ]);
    expect(lapsed).toBe(1);
    const rows = db
      .prepare(`SELECT segment_id, status, superseded_reason FROM segment_acceptances ORDER BY id`)
      .all();
    expect(rows[0]).toMatchObject({ status: 'superseded', superseded_reason: 'content-drift' });
    expect(rows[1]).toMatchObject({ status: 'active', superseded_reason: null });
  });

  it('a segment missing from the written set lapses too', () => {
    accept();
    expect(acceptance.lapseDrifted(BOOK, MODULE, [])).toBe(1);
  });

  it('stampApplied stamps active NULL rows only, returns the count', () => {
    accept();
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    expect(acceptance.stampApplied(BOOK, MODULE)).toBe(2);
    // Second stamp is a no-op (already applied)
    expect(acceptance.stampApplied(BOOK, MODULE)).toBe(0);
    const stamped = db
      .prepare(`SELECT COUNT(*) AS n FROM segment_acceptances WHERE applied_at IS NOT NULL`)
      .get().n;
    expect(stamped).toBe(2);
  });
});

describe('writeReviewStatusSidecar (spec §8)', () => {
  const FAITHFUL_DIR = () => join(booksDir, BOOK, '03-faithful-translation', 'ch01');

  function writeFaithful(entries) {
    mkdirSync(FAITHFUL_DIR(), { recursive: true });
    writeFileSync(
      join(FAITHFUL_DIR(), `${MODULE}-segments.is.md`),
      entries.map(([segId, text]) => `<!-- SEG:${segId} -->\n${text}`).join('\n\n'),
      'utf-8'
    );
  }

  it('derives the full per-segment map with all three statuses, file key order', () => {
    writeFaithful([
      ['m00001:para:fs-id001', 'Breytt og birt.'],
      ['m00001:para:fs-id002', 'Önnur efnisgrein.'],
      ['m00001:para:fs-id003', 'Carryover texti.'],
    ]);
    // fs-id001: approved+applied edit
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at, applied_at)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'x', 'Breytt og birt.',
               'u2', 'editor2', 'approved', '2026-07-19 10:00:00', '2026-07-19 10:05:00')`
    ).run(BOOK, MODULE);
    // fs-id002: active acceptance
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');

    const outPath = acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE);
    expect(outPath).toBe(acceptance.sidecarPathFor(BOOK, 1, MODULE));
    const sidecar = JSON.parse(readFileSync(outPath, 'utf-8'));

    expect(sidecar.book).toBe(BOOK);
    expect(sidecar.chapter).toBe('1');
    expect(sidecar.module).toBe(MODULE);
    expect(sidecar.generated).toBeTruthy();
    // Deterministic key order = file segment order
    expect(Object.keys(sidecar.segments)).toEqual([
      'm00001:para:fs-id001',
      'm00001:para:fs-id002',
      'm00001:para:fs-id003',
    ]);
    expect(sidecar.segments['m00001:para:fs-id001']).toEqual({
      status: 'edited',
      by: 'editor2',
      at: '2026-07-19 10:00:00',
    });
    expect(sidecar.segments['m00001:para:fs-id002']).toMatchObject({
      status: 'accepted',
      by: 'editor1',
    });
    expect(sidecar.segments['m00001:para:fs-id003']).toEqual({ status: 'carryover' });
  });

  it('an active acceptance outranks an older applied edit on the same segment (restore edge)', () => {
    writeFaithful([['m00001:para:fs-id001', 'Fyrsta efnisgrein.']]);
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at, applied_at)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'x', 'Gömul breyting.',
               'u2', 'editor2', 'approved', '2026-07-01 10:00:00', '2026-07-01 10:05:00')`
    ).run(BOOK, MODULE);
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    const sidecar = JSON.parse(
      readFileSync(acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE), 'utf-8')
    );
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('accepted');
  });

  it('throws when no faithful file exists', () => {
    rmSync(FAITHFUL_DIR(), { recursive: true, force: true });
    expect(() => acceptance.writeReviewStatusSidecar(BOOK, 1, MODULE)).toThrow(
      'Faithful file not found'
    );
  });
});
