/**
 * Segment Editor Service Tests
 *
 * Tests the critical save workflow: save -> approve/reject -> apply.
 * Uses in-memory better-sqlite3 DB and temp directories for file operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const service = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');

// Store original BOOKS_DIR to restore after tests
const originalBooksDir = segmentParser.BOOKS_DIR;

/**
 * Create an in-memory DB with the segment_edits schema applied.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Migration 008 (post-039 shape): segment_edits table
  createSegmentEditsSchema(db);

  // Migration 008: module_reviews table
  db.exec(`
    CREATE TABLE module_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      submitted_by_username TEXT NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'in_review', 'approved', 'changes_requested'
      )),
      reviewed_by TEXT,
      reviewed_by_username TEXT,
      reviewed_at DATETIME,
      review_notes TEXT,
      total_segments INTEGER DEFAULT 0,
      edited_segments INTEGER DEFAULT 0,
      approved_segments INTEGER DEFAULT 0,
      rejected_segments INTEGER DEFAULT 0
    );
  `);

  // Migration 008: segment_discussions table
  db.exec(`
    CREATE TABLE segment_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_edit_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (segment_edit_id) REFERENCES segment_edits(id)
    );

    -- Migration 031: content_versions — apply's snapshot now writes here on the
    -- apply's own connection (inside the IMMEDIATE txn), so the test DB needs it.
    CREATE TABLE content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book, module_id, segment_id, version)
    );
  `);

  return db;
}

// =====================================================================
// DB Lifecycle Tests
// =====================================================================

describe('segmentEditorService — DB lifecycle', () => {
  let db;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
  });

  beforeEach(() => {
    // Clear all edits between tests
    db.exec('DELETE FROM segment_edits');
  });

  // --- Save operations ---

  it('saveSegmentEdit creates a new edit with correct fields', () => {
    const result = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original text',
      editedContent: 'Breytt texti',
      category: 'accuracy',
      editorNote: 'Fixed translation',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(result.id).toBeDefined();
    expect(result.updated).toBe(false);

    const edit = service.getEditById(result.id);
    expect(edit.book).toBe('efnafraedi-2e');
    expect(edit.module_id).toBe('m00001');
    expect(edit.segment_id).toBe('m00001:para:fs-id001');
    expect(edit.original_content).toBe('Original text');
    expect(edit.edited_content).toBe('Breytt texti');
    expect(edit.category).toBe('accuracy');
    expect(edit.status).toBe('pending');
    expect(edit.editor_id).toBe('user-1');
  });

  it('saveSegmentEdit updates existing pending edit by same editor (dedup)', () => {
    const first = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'First edit',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const second = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Updated edit',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(second.id).toBe(first.id);
    expect(second.updated).toBe(true);

    const edit = service.getEditById(first.id);
    expect(edit.edited_content).toBe('Updated edit');
  });

  it('saveSegmentEdit creates separate edit for different editor on same segment', () => {
    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Editor 1 version',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Editor 2 version',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });

    const edits = service.getSegmentEdits('efnafraedi-2e', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(2);
    const contents = edits.map((e) => e.edited_content).sort();
    expect(contents).toEqual(['Editor 1 version', 'Editor 2 version']);
  });

  // --- Review lifecycle ---

  it('approveEdit changes status to approved and records reviewer', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const approved = service.approveEdit(id, 'reviewer-1', 'reviewer1', 'Looks good');
    expect(approved.status).toBe('approved');
    expect(approved.reviewer_id).toBe('reviewer-1');
    expect(approved.reviewer_username).toBe('reviewer1');
    expect(approved.reviewer_note).toBe('Looks good');
    expect(approved.reviewed_at).toBeTruthy();
  });

  it('approveEdit permits self-approval (head-editor/admin tier)', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Same user approves their own edit — allowed for the approve tier so that
    // edit-again is usable on a small team.
    const result = service.approveEdit(id, 'user-1', 'editor1');
    expect(result.status).toBe('approved');
  });

  it('rejectEdit changes status to rejected', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const rejected = service.rejectEdit(id, 'reviewer-1', 'reviewer1', 'Not accurate');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewer_note).toBe('Not accurate');
  });

  it('approveEdit throws on non-pending edit (no double-approve)', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.approveEdit(id, 'reviewer-1', 'reviewer1');
    expect(() => service.approveEdit(id, 'reviewer-2', 'reviewer2')).toThrow('Edit is not pending');
  });

  it('deleteSegmentEdit removes pending edit', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.deleteSegmentEdit(id, 'user-1');
    const edit = service.getEditById(id);
    expect(edit).toBeUndefined();
  });

  it('deleteSegmentEdit works when editor_id types differ (number vs string)', () => {
    // Bug: SQLite may store editor_id as "99999" (text) but JWT provides 99999 (number).
    // Strict comparison (!==) fails across types.
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 99999,
      editorUsername: 'test-admin',
    });

    // Delete with the same numeric ID — should succeed
    service.deleteSegmentEdit(id, 99999);
    const edit = service.getEditById(id);
    expect(edit).toBeUndefined();
  });

  it('deleteSegmentEdit works when editor_id stored as string, deleted with number', () => {
    // Simulate the real-world case: save with string, delete with number
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: '99999',
      editorUsername: 'test-admin',
    });

    // Delete with numeric ID — should succeed (type coercion)
    service.deleteSegmentEdit(id, 99999);
    const edit = service.getEditById(id);
    expect(edit).toBeUndefined();
  });

  it('deleteSegmentEdit still rejects wrong editor (different value, not just type)', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 99999,
      editorUsername: 'test-admin',
    });

    expect(() => service.deleteSegmentEdit(id, 88888)).toThrow('Not your edit');
  });

  it('deleteSegmentEdit rejects deletion of approved edit', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.approveEdit(id, 'reviewer-1', 'reviewer1');
    expect(() => service.deleteSegmentEdit(id, 'user-1')).toThrow('Can only delete pending edits');
  });

  // --- Query operations ---

  it('getModuleEdits returns all edits for a module', () => {
    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Orig1',
      editedContent: 'Edit1',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const edits = service.getModuleEdits('efnafraedi-2e', 'm00001');
    expect(edits).toHaveLength(2);
  });

  it('getModuleEdits with status filter returns only matching', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Orig',
      editedContent: 'Edit',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.approveEdit(id, 'reviewer-1', 'reviewer1');

    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const approved = service.getModuleEdits('efnafraedi-2e', 'm00001', 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(id);

    const pending = service.getModuleEdits('efnafraedi-2e', 'm00001', 'pending');
    expect(pending).toHaveLength(1);
  });

  it('getSegmentEdits returns edits for specific segment', () => {
    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Orig',
      editedContent: 'Edit A',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit B',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const edits = service.getSegmentEdits('efnafraedi-2e', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(1);
    expect(edits[0].edited_content).toBe('Edit A');
  });
});

// =====================================================================
// Supersede-on-save: discuss/rejected exit path (post-039)
// =====================================================================

describe('discuss/rejected exit path — supersede-on-save + collision matrix', () => {
  let db;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
  });

  beforeEach(() => {
    db.exec('DELETE FROM segment_edits');
  });

  // Shorthand: a save by editor u1 on segment s1 of module m1.
  function save(overrides = {}) {
    return service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'seg-exit-1',
      originalContent: 'original',
      editedContent: 'edited v' + Math.random(),
      editorId: 'u1',
      editorUsername: 'editor1',
      ...overrides,
    });
  }

  // Note: the brief refers to this as `getSegmentEditHistory` — the service's
  // actual function with that shape (all rows for a segment, newest-first) is
  // `getSegmentEdits(book, moduleId, segmentId)` (segmentEditorService.js:279).

  it('re-discuss after a re-save is clean (the live-reproduced alert() bug)', () => {
    const first = save();
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'ræðum þetta');
    const second = save(); // supersedes the stranded discuss row
    expect(() => service.markForDiscussion(second.id, 'rev1', 'reviewer1', 'aftur')).not.toThrow();
    const rows = service.getSegmentEdits('testbook', 'm00001', 'seg-exit-1');
    expect(rows.find((r) => r.id === first.id).status).toBe('superseded');
    expect(rows.find((r) => r.id === second.id).status).toBe('discuss');
  });

  it('re-reject after a re-save is clean', () => {
    const first = save({ segmentId: 'seg-exit-2' });
    service.rejectEdit(first.id, 'rev1', 'reviewer1', 'nei');
    const second = save({ segmentId: 'seg-exit-2' });
    expect(() => service.rejectEdit(second.id, 'rev1', 'reviewer1', 'enn nei')).not.toThrow();
  });

  it('a second approval while an earlier approved row is unapplied is clean', () => {
    const first = save({ segmentId: 'seg-exit-3' });
    service.approveEdit(first.id, 'rev1', 'reviewer1');
    const second = save({ segmentId: 'seg-exit-3' });
    expect(() => service.approveEdit(second.id, 'rev1', 'reviewer1')).not.toThrow();
    // The approved row is live work product — save must NOT supersede it.
    const rows = service.getSegmentEdits('testbook', 'm00001', 'seg-exit-3');
    expect(rows.find((r) => r.id === first.id).status).toBe('approved');
  });

  it('supersedes only the SAME editor’s rows on the SAME segment', () => {
    const mine = save({ segmentId: 'seg-exit-4' });
    service.rejectEdit(mine.id, 'rev1', 'reviewer1', 'nei');
    const theirs = save({ segmentId: 'seg-exit-4', editorId: 'u2', editorUsername: 'editor2' });
    service.rejectEdit(theirs.id, 'rev1', 'reviewer1', 'nei');
    const otherSeg = save({ segmentId: 'seg-exit-5' });
    service.rejectEdit(otherSeg.id, 'rev1', 'reviewer1', 'nei');

    save({ segmentId: 'seg-exit-4' }); // u1 re-saves seg-exit-4 only
    const seg4 = service.getSegmentEdits('testbook', 'm00001', 'seg-exit-4');
    expect(seg4.find((r) => r.id === mine.id).status).toBe('superseded');
    expect(seg4.find((r) => r.id === theirs.id).status).toBe('rejected'); // other editor untouched
    const seg5 = service.getSegmentEdits('testbook', 'm00001', 'seg-exit-5');
    expect(seg5.find((r) => r.id === otherSeg.id).status).toBe('rejected'); // other segment untouched
  });

  it('supersede preserves the reviewer’s fields as history', () => {
    const first = save({ segmentId: 'seg-exit-6' });
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'athugasemd');
    save({ segmentId: 'seg-exit-6' });
    const row = service
      .getSegmentEdits('testbook', 'm00001', 'seg-exit-6')
      .find((r) => r.id === first.id);
    expect(row.status).toBe('superseded');
    expect(row.reviewer_note).toBe('athugasemd');
    expect(row.reviewer_username).toBe('reviewer1');
  });

  it('withdraw (content == original) does NOT supersede anything', () => {
    const first = save({ segmentId: 'seg-exit-7' });
    service.markForDiscussion(first.id, 'rev1', 'reviewer1', 'ræðum');
    save({ segmentId: 'seg-exit-7', editedContent: 'original' }); // withdraw path
    const row = service
      .getSegmentEdits('testbook', 'm00001', 'seg-exit-7')
      .find((r) => r.id === first.id);
    expect(row.status).toBe('discuss'); // no new revision happened — history stands
  });
});

describe('returnEditToPending — head-editor manual exit', () => {
  let db;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
  });

  beforeEach(() => {
    db.exec('DELETE FROM segment_edits');
  });

  function save(overrides = {}) {
    return service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'seg-rtp-1',
      originalContent: 'original',
      editedContent: 'edited v' + Math.random(),
      editorId: 'u1',
      editorUsername: 'editor1',
      ...overrides,
    });
  }

  it('returns a discuss row to pending and clears reviewer fields', () => {
    const e = save();
    service.markForDiscussion(e.id, 'rev1', 'reviewer1', 'ræðum');
    const back = service.returnEditToPending(e.id);
    expect(back.status).toBe('pending');
    expect(back.reviewer_id).toBeNull();
    expect(back.reviewer_username).toBeNull();
    expect(back.reviewer_note).toBeNull();
    expect(back.reviewed_at).toBeNull();
  });

  it('returns a rejected row to pending', () => {
    const e = save({ segmentId: 'seg-rtp-2' });
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    expect(service.returnEditToPending(e.id).status).toBe('pending');
  });

  it('refuses when the editor already has a newer pending row (409 code)', () => {
    const e = save({ segmentId: 'seg-rtp-3' });
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    save({ segmentId: 'seg-rtp-3' }); // editor already responded — old row is superseded…
    // …so returnEditToPending must refuse on status, or on the pending guard for
    // a row that somehow stayed rejected. Recreate that state directly:
    db.prepare(`UPDATE segment_edits SET status = 'rejected' WHERE id = ?`).run(e.id);
    let err;
    try {
      service.returnEditToPending(e.id);
    } catch (x) {
      err = x;
    }
    expect(err?.code).toBe('PENDING_EXISTS');
  });

  it('refuses non-discuss/rejected rows and applied rows', () => {
    const e = save({ segmentId: 'seg-rtp-4' });
    expect(() => service.returnEditToPending(e.id)).toThrow(/discuss/);
    service.rejectEdit(e.id, 'rev1', 'reviewer1', 'nei');
    db.prepare(`UPDATE segment_edits SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`).run(e.id);
    expect(() => service.returnEditToPending(e.id)).toThrow(/applied/);
  });
});

describe('unapproveEdit — pending-exists guard', () => {
  let db;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
  });

  beforeEach(() => {
    db.exec('DELETE FROM segment_edits');
  });

  function save(overrides = {}) {
    return service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'seg-unapprove-1',
      originalContent: 'original',
      editedContent: 'edited v' + Math.random(),
      editorId: 'u1',
      editorUsername: 'editor1',
      ...overrides,
    });
  }

  it('refuses when the same editor already has a pending row on the segment (409 code)', () => {
    // save → approve → save again: the approved row and the fresh pending
    // row now coexist on the same segment for the same editor.
    const first = save();
    service.approveEdit(first.id, 'rev1', 'reviewer1');
    save(); // fresh pending row, same editor, same segment

    let err;
    try {
      service.unapproveEdit(first.id);
    } catch (x) {
      err = x;
    }
    expect(err?.code).toBe('PENDING_EXISTS');
  });

  it('normal unapprove (no pending row) still works', () => {
    const e = save({ segmentId: 'seg-unapprove-2' });
    service.approveEdit(e.id, 'rev1', 'reviewer1');
    const back = service.unapproveEdit(e.id);
    expect(back.status).toBe('pending');
    expect(back.reviewer_id).toBeNull();
    expect(back.reviewer_username).toBeNull();
    expect(back.reviewer_note).toBeNull();
    expect(back.reviewed_at).toBeNull();
  });
});

// =====================================================================
// applyApprovedEdits Integration Tests
// =====================================================================

describe('applyApprovedEdits — integration', () => {
  let db;
  let tmpDir;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);

    // Create temp directory structured as a mini book
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-test-'));
    const booksDir = join(tmpDir, 'books');
    const bookDir = join(booksDir, 'testbook');

    // EN source segments
    const enDir = join(bookDir, '02-for-mt', 'ch01');
    mkdirSync(enDir, { recursive: true });
    writeFileSync(
      join(enDir, 'm00001-segments.en.md'),
      [
        '<!-- SEG:m00001:para:fs-id001 -->',
        'This is paragraph one.',
        '',
        '<!-- SEG:m00001:para:fs-id002 -->',
        'This is paragraph two.',
        '',
        '<!-- SEG:m00001:title:fs-id003 -->',
        'Chapter Title',
      ].join('\n'),
      'utf-8'
    );

    // MT output segments (IS base text)
    const mtDir = join(bookDir, '02-mt-output', 'ch01');
    mkdirSync(mtDir, { recursive: true });
    writeFileSync(
      join(mtDir, 'm00001-segments.is.md'),
      [
        '<!-- SEG:m00001:para:fs-id001 -->',
        'Þetta er fyrsta efnisgrein.',
        '',
        '<!-- SEG:m00001:para:fs-id002 -->',
        'Þetta er önnur efnisgrein.',
        '',
        '<!-- SEG:m00001:title:fs-id003 -->',
        'Titill kafla',
      ].join('\n'),
      'utf-8'
    );

    // Point both services at our temp books directory
    service._setTestBooksDir(booksDir);
    segmentParser._setTestBooksDir(booksDir);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
    // Restore original BOOKS_DIR
    service._setTestBooksDir(join(originalBooksDir));
    segmentParser._setTestBooksDir(originalBooksDir);
  });

  beforeEach(() => {
    db.exec('DELETE FROM segment_edits');
    // Remove faithful files if they exist from a previous test
    try {
      const { unlinkSync, readdirSync } = require('fs');
      // Clean up any .bak files too
      const dir = join(tmpDir, 'books', 'testbook', '03-faithful-translation', 'ch01');
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          unlinkSync(join(dir, f));
        }
      }
    } catch {
      // Directory may not exist yet
    }
  });

  /**
   * Helper: insert an edit and approve it (by a different reviewer).
   */
  function saveAndApprove(segmentId, editedContent) {
    const { id } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId,
      originalContent: 'original',
      editedContent,
      editorId: 'editor-1',
      editorUsername: 'editor1',
    });
    service.approveEdit(id, 'reviewer-1', 'reviewer1');
    return id;
  }

  it('apply writes faithful file with approved content replacing MT content', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarið efnisgrein eitt.');

    const result = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(result.appliedCount).toBe(1);
    expect(existsSync(result.savedPath)).toBe(true);

    // Parse the written file and verify content
    const content = readFileSync(result.savedPath, 'utf-8');
    const segments = segmentParser.parseSegments(content);
    const seg1 = segments.find((s) => s.segmentId === 'm00001:para:fs-id001');
    const seg2 = segments.find((s) => s.segmentId === 'm00001:para:fs-id002');

    // Edited segment should have the approved content
    expect(seg1.content).toBe('Yfirfarið efnisgrein eitt.');
    // Non-edited segment should keep MT content
    expect(seg2.content).toBe('Þetta er önnur efnisgrein.');
  });

  it('apply marks edits as applied (applied_at set)', () => {
    const editId = saveAndApprove('m00001:para:fs-id001', 'Yfirfarið.');

    service.applyApprovedEdits('testbook', 1, 'm00001');

    const edit = service.getEditById(editId);
    expect(edit.applied_at).toBeTruthy();
  });

  it('apply with superseded edits: latest approved wins, older marked superseded', () => {
    // Create two approved edits for the same segment (different editors)
    const { id: id1 } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'original',
      editedContent: 'Eldri breyting',
      editorId: 'editor-1',
      editorUsername: 'editor1',
    });
    service.approveEdit(id1, 'reviewer-1', 'reviewer1');

    // Backdate the first edit's reviewed_at so the second one is clearly newer
    db.prepare(
      `UPDATE segment_edits SET reviewed_at = datetime('now', '-1 hour') WHERE id = ?`
    ).run(id1);

    const { id: id2 } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'original',
      editedContent: 'Nýrri breyting',
      editorId: 'editor-2',
      editorUsername: 'editor2',
    });
    service.approveEdit(id2, 'reviewer-1', 'reviewer1');

    const result = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(result.appliedCount).toBe(1);
    expect(result.supersededCount).toBe(1);

    // The newer edit (reviewed later) should win — ORDER BY reviewed_at DESC
    const content = readFileSync(result.savedPath, 'utf-8');
    const segments = segmentParser.parseSegments(content);
    const seg1 = segments.find((s) => s.segmentId === 'm00001:para:fs-id001');
    expect(seg1.content).toBe('Nýrri breyting');

    // The older edit should be marked as superseded (not rejected — apply-time
    // supersede is resolved history, not a review decision).
    const olderEdit = service.getEditById(id1);
    expect(olderEdit.status).toBe('superseded');
    expect(olderEdit.applied_at).toBeTruthy();
  });

  it('edit-again: revising a published segment supersedes it and preserves other applied edits', () => {
    // First round: edit two segments, approve, apply (both become "published").
    saveAndApprove('m00001:para:fs-id001', 'Fyrsta útgáfa, grein eitt.');
    saveAndApprove('m00001:para:fs-id002', 'Fyrsta útgáfa, grein tvö.');
    const first = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(first.appliedCount).toBe(2);

    // Edit-again: a brand-new edit on the already-applied seg1 only.
    const reviseId = saveAndApprove('m00001:para:fs-id001', 'Endurskoðuð grein eitt.');
    const second = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(second.appliedCount).toBe(1);

    const segments = segmentParser.parseSegments(readFileSync(second.savedPath, 'utf-8'));
    const seg1 = segments.find((s) => s.segmentId === 'm00001:para:fs-id001');
    const seg2 = segments.find((s) => s.segmentId === 'm00001:para:fs-id002');

    // seg1 now carries the revision...
    expect(seg1.content).toBe('Endurskoðuð grein eitt.');
    // ...and seg2's first-round edit is PRESERVED, not reverted to MT text — the
    // second apply reads the faithful file as its baseline. This is what makes
    // incremental edit-again safe.
    expect(seg2.content).toBe('Fyrsta útgáfa, grein tvö.');
    expect(service.getEditById(reviseId).applied_at).toBeTruthy();
  });

  it('apply throws when no approved edits exist', () => {
    // Only a pending edit, no approved ones
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'original',
      editedContent: 'Pending only',
      editorId: 'editor-1',
      editorUsername: 'editor1',
    });

    expect(() => service.applyApprovedEdits('testbook', 1, 'm00001')).toThrow(
      'No approved edits to apply'
    );
  });

  it('apply self-heals when faithful file was deleted (re-applies)', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarið efnisgrein.');

    // First apply — creates the file
    const firstResult = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(existsSync(firstResult.savedPath)).toBe(true);

    // Delete the faithful file to simulate data loss
    const { unlinkSync } = require('fs');
    unlinkSync(firstResult.savedPath);
    expect(existsSync(firstResult.savedPath)).toBe(false);

    // Second apply — should self-heal by resetting applied_at and re-applying
    const secondResult = service.applyApprovedEdits('testbook', 1, 'm00001');
    expect(existsSync(secondResult.savedPath)).toBe(true);

    const content = readFileSync(secondResult.savedPath, 'utf-8');
    const segments = segmentParser.parseSegments(content);
    const seg1 = segments.find((s) => s.segmentId === 'm00001:para:fs-id001');
    expect(seg1.content).toBe('Yfirfarið efnisgrein.');
  });

  describe("apply-time supersede uses 'superseded' (was mislabelled 'rejected')", () => {
    it('marks the losing approved row superseded, keeps note + applied_at stamp', () => {
      // Two approved edits by the same editor on one segment. The second save
      // doesn't touch the first row — save-time supersede only acts on
      // 'discuss'/'rejected' rows, and this one is 'approved' — so both
      // reach 'approved' cleanly (post-039, a second approval collides with
      // nothing).
      const { id: id1 } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: 'm00001:para:fs-id002',
        originalContent: 'original',
        editedContent: 'Fyrri samþykkta breytingin',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.approveEdit(id1, 'reviewer-1', 'reviewer1');
      // Backdate so the second approval is unambiguously newer (apply orders
      // approved-and-unapplied edits by reviewed_at DESC).
      db.prepare(
        `UPDATE segment_edits SET reviewed_at = datetime('now', '-1 hour') WHERE id = ?`
      ).run(id1);

      const { id: id2 } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: 'm00001:para:fs-id002',
        originalContent: 'original',
        editedContent: 'Nýrri samþykkta breytingin',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.approveEdit(id2, 'reviewer-1', 'reviewer1');

      service.applyApprovedEdits('testbook', 1, 'm00001');

      const rows = service.getSegmentEdits('testbook', 'm00001', 'm00001:para:fs-id002');
      const loser = rows.find((r) => r.id === id1);
      expect(loser).toBeDefined();
      expect(loser.status).toBe('superseded');
      expect(loser.reviewer_note).toBe('Leyst úr gildi af nýrri samþykktri breytingu');
      expect(loser.applied_at).not.toBeNull();
      expect(rows.filter((r) => r.status === 'rejected')).toEqual([]);
    });

    it('apply is clean when the editor also has an old rejected row on the segment (the :812 in-transaction collision)', () => {
      // editor-1 holds an APPROVED row and a genuinely-standing REJECTED row
      // on the SAME segment at once: approve first (so the row is 'approved'
      // when the next save happens — save-time supersede leaves it alone),
      // then save+reject a second row (which stands, since editor-1 never
      // saves again). A second editor's competing approval makes editor-1's
      // approved row the apply-time LOSER, so apply must flip it onto a
      // status for which a 'rejected' sibling row (same book/module/segment/
      // editor) already exists. Pre-039, marking the loser 'rejected' hit the
      // table-level UNIQUE(book, module_id, segment_id, status, editor_id)
      // against that standing rejected row. Post-039 + 'superseded' it cannot.
      const { id: approvedId } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: 'm00001:para:fs-id002',
        originalContent: 'original',
        editedContent: 'editor-1 fyrri samþykkt',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.approveEdit(approvedId, 'reviewer-1', 'reviewer1');
      // Backdate so editor-1's approval is clearly the OLDER (losing) one.
      db.prepare(
        `UPDATE segment_edits SET reviewed_at = datetime('now', '-1 hour') WHERE id = ?`
      ).run(approvedId);

      const { id: rejectedId } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: 'm00001:para:fs-id002',
        originalContent: 'original',
        editedContent: 'editor-1 hafnað tilraun',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.rejectEdit(rejectedId, 'reviewer-1', 'reviewer1', 'nei');

      const { id: winnerId } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: 'm00001:para:fs-id002',
        originalContent: 'original',
        editedContent: 'editor-2 nýrri samþykkt',
        editorId: 'editor-2',
        editorUsername: 'editor2',
      });
      service.approveEdit(winnerId, 'reviewer-1', 'reviewer1');

      let result;
      expect(() => {
        result = service.applyApprovedEdits('testbook', 1, 'm00001');
      }).not.toThrow();
      expect(existsSync(result.savedPath)).toBe(true);

      // The loser is 'superseded', not 'rejected' — the latter would collide
      // with editor-1's standing rejected row under the pre-039 schema.
      const loser = service.getEditById(approvedId);
      expect(loser.status).toBe('superseded');
      const standingRejected = service.getEditById(rejectedId);
      expect(standingRejected.status).toBe('rejected'); // untouched, still stands
    });
  });

  describe('superseded rows are invisible to effective content and review stamping', () => {
    beforeEach(() => {
      db.exec('DELETE FROM module_reviews');
    });

    it('buildEffectiveSegments ignores superseded rows (withdraw-after-supersede regression)', () => {
      const segmentId = 'm00001:para:fs-id002';
      const { id: v1Id } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'fyrsta breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.rejectEdit(v1Id, 'reviewer-1', 'reviewer1', 'nei');
      const { id: v2Id } = service.saveSegmentEdit({
        // Same editor re-saving supersedes v1 (save-time supersede).
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'onnur breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.deleteSegmentEdit(v2Id, 'editor-1'); // withdraw v2 (pending → delete)

      // Only v1 remains, and it's 'superseded' — it must never resurface as
      // the "latest non-rejected" edit; the baseline (MT) content must win.
      const segments = service.buildEffectiveSegments('testbook', 1, 'm00001');
      const seg = segments.find((s) => s.segmentId === segmentId);
      expect(seg.isContent).toBe('Þetta er önnur efnisgrein.');
    });

    it('buildEffectiveSegments returns baseline when the only non-rejected row is superseded (sharper resurface regression)', () => {
      // save v1 → reject v1 → save v2 (v1 becomes superseded) → reject v2.
      // The only non-rejected row on the segment is now v1 ('superseded') —
      // it must NOT resurface as effective content.
      const segmentId = 'm00001:para:fs-id002';
      const { id: v1Id } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'fyrsta breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.rejectEdit(v1Id, 'reviewer-1', 'reviewer1', 'nei');
      const { id: v2Id } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'onnur breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.rejectEdit(v2Id, 'reviewer-1', 'reviewer1', 'nei aftur');

      const rows = service.getSegmentEdits('testbook', 'm00001', segmentId);
      expect(rows.find((r) => r.id === v1Id).status).toBe('superseded');
      expect(rows.find((r) => r.id === v2Id).status).toBe('rejected');

      const segments = service.buildEffectiveSegments('testbook', 1, 'm00001');
      const seg = segments.find((s) => s.segmentId === segmentId);
      expect(seg.isContent).toBe('Þetta er önnur efnisgrein.'); // baseline, not v1's content
    });

    it('submitModuleForReview does not stamp superseded rows into the new review', () => {
      const segmentId = 'm00001:para:fs-id002';
      const { id: v1Id } = service.saveSegmentEdit({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'fyrsta breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });
      service.rejectEdit(v1Id, 'reviewer-1', 'reviewer1', 'nei');
      const { id: v2Id } = service.saveSegmentEdit({
        // v1 -> superseded; v2 is the fresh pending row.
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        segmentId,
        originalContent: 'original',
        editedContent: 'onnur breyting',
        editorId: 'editor-1',
        editorUsername: 'editor1',
      });

      const review = service.submitModuleForReview({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        submittedBy: 'editor-1',
        submittedByUsername: 'editor1',
      });

      const rows = service.getSegmentEdits('testbook', 'm00001', segmentId);
      const superseded = rows.find((r) => r.id === v1Id);
      const pending = rows.find((r) => r.id === v2Id);
      expect(superseded.status).toBe('superseded');
      expect(superseded.review_id).toBeNull();
      expect(pending.review_id).toBe(review.id);
    });
  });
});

// =====================================================================
// Review Queue and Edge Cases
// =====================================================================

describe('Review queue and edge cases', () => {
  let db;
  let tmpDir;

  beforeAll(() => {
    db = createTestDb();
    service._setTestDb(db);

    // Create temp directory structured as a mini book (needed for applyApprovedEdits in test 7)
    tmpDir = mkdtempSync(join(tmpdir(), 'review-test-'));
    const booksDir = join(tmpDir, 'books');
    const bookDir = join(booksDir, 'testbook');

    // EN source segments
    const enDir = join(bookDir, '02-for-mt', 'ch01');
    mkdirSync(enDir, { recursive: true });
    writeFileSync(
      join(enDir, 'm00001-segments.en.md'),
      [
        '<!-- SEG:m00001:para:fs-id001 -->',
        'This is paragraph one.',
        '',
        '<!-- SEG:m00001:para:fs-id002 -->',
        'This is paragraph two.',
      ].join('\n'),
      'utf-8'
    );

    // MT output segments (IS base text)
    const mtDir = join(bookDir, '02-mt-output', 'ch01');
    mkdirSync(mtDir, { recursive: true });
    writeFileSync(
      join(mtDir, 'm00001-segments.is.md'),
      [
        '<!-- SEG:m00001:para:fs-id001 -->',
        'Þetta er fyrsta efnisgrein.',
        '',
        '<!-- SEG:m00001:para:fs-id002 -->',
        'Þetta er önnur efnisgrein.',
      ].join('\n'),
      'utf-8'
    );

    service._setTestBooksDir(booksDir);
    segmentParser._setTestBooksDir(booksDir);
  });

  afterAll(() => {
    db.close();
    service._setTestDb(null);
    service._setTestBooksDir(join(originalBooksDir));
    segmentParser._setTestBooksDir(originalBooksDir);
  });

  beforeEach(() => {
    db.exec('DELETE FROM segment_edits');
    db.exec('DELETE FROM module_reviews');
    // Clean up faithful files if they exist
    try {
      const { unlinkSync, readdirSync } = require('fs');
      const dir = join(tmpDir, 'books', 'testbook', '03-faithful-translation', 'ch01');
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          unlinkSync(join(dir, f));
        }
      }
    } catch {
      // Directory may not exist yet
    }
  });

  it('getReviewQueue returns pending reviews with edit counts', () => {
    // Create two edits and submit for review
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti 1',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Original 2',
      editedContent: 'Breytt texti 2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Approve one of the edits
    const edits = service.getModuleEdits('testbook', 'm00001', 'pending');
    service.approveEdit(edits[0].id, 'reviewer-1', 'reviewer1');

    const queue = service.getReviewQueue('testbook');
    expect(queue).toHaveLength(1);

    const item = queue[0];
    expect(item.book).toBe('testbook');
    expect(item.module_id).toBe('m00001');
    expect(item.pending_edits).toBe(1);
    expect(item.approved_edits).toBe(1);
    expect(item.submitted_at).toBeTruthy();
  });

  it('completeModuleReview — all approved → status=approved', () => {
    // Save one edit
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Submit for review
    const { id: reviewId } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Approve the edit
    service.approveEdit(editId, 'reviewer-1', 'reviewer1');

    // Complete the review
    const result = service.completeModuleReview(reviewId, 'reviewer-1', 'reviewer1', 'All good');
    expect(result.status).toBe('approved');
    expect(result.allReviewed).toBe(true);
  });

  it('completeModuleReview — some pending → status=changes_requested', () => {
    // Save two edits
    const { id: editId1 } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original 1',
      editedContent: 'Breytt texti 1',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Original 2',
      editedContent: 'Breytt texti 2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Submit for review
    const { id: reviewId } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Approve only the first edit — second remains pending
    service.approveEdit(editId1, 'reviewer-1', 'reviewer1');

    // Complete the review
    const result = service.completeModuleReview(reviewId, 'reviewer-1', 'reviewer1', 'Needs work');
    expect(result.status).toBe('changes_requested');
    expect(result.allReviewed).toBe(false);
  });

  it('completeModuleReview — discuss edits → status=changes_requested', () => {
    // Save one edit
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Submit for review
    const { id: reviewId } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Mark the edit for discussion
    service.markForDiscussion(editId, 'reviewer-1', 'reviewer1', 'Need to discuss this');

    // Complete the review
    const result = service.completeModuleReview(
      reviewId,
      'reviewer-1',
      'reviewer1',
      'Has discuss items'
    );
    expect(result.status).toBe('changes_requested');
    expect(result.allReviewed).toBe(false);
  });

  it("completeModuleReview — counts the review's own edits even when created before submit", () => {
    // Regression: editors create edits, then submit seconds/minutes later, so an
    // edit's created_at precedes the review's submitted_at. The old
    // created_at >= submitted_at window wrongly excluded these → a review with
    // unreviewed edits auto-approved with 0 segments counted. With review_id
    // scoping the edit is attributed to the review regardless of timing.
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    // Backdate the edit so it clearly predates the review submission.
    db.prepare(
      `UPDATE segment_edits SET created_at = datetime('now', '-30 seconds') WHERE id = ?`
    ).run(editId);

    const { id: reviewId } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Edit left pending → the review must report changes_requested, not approve.
    const result = service.completeModuleReview(reviewId, 'reviewer-1', 'reviewer1', null);
    expect(result.status).toBe('changes_requested');
    expect(result.allReviewed).toBe(false);
  });

  it('completeModuleReview — an edit created after submit is not part of this review', () => {
    // Intentional behavior change (the memory note's "not just the review's own"):
    // an edit appearing mid-review (e.g. a propagated pending edit) belongs to a
    // future cycle and must not block completing the current review.
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt 1',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    const { id: reviewId } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });
    service.approveEdit(editId, 'reviewer-1', 'reviewer1');
    // New pending edit appears after submission — not stamped with this review_id.
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Original 2',
      editedContent: 'Breytt 2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const result = service.completeModuleReview(reviewId, 'reviewer-1', 'reviewer1', null);
    expect(result.status).toBe('approved');
    expect(result.allReviewed).toBe(true);
  });

  it('completeModuleReview — a still-pending edit from a prior cycle is re-claimed on resubmit', () => {
    // changes-requested → fix → resubmit loop: an unresolved edit must follow
    // into the new review, not stay stranded on the (frozen) prior one.
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    const { id: review1 } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });
    // Reviewer leaves it unresolved → changes_requested.
    const c1 = service.completeModuleReview(review1, 'reviewer-1', 'reviewer1', null);
    expect(c1.status).toBe('changes_requested');

    // Editor resubmits without resolving it (e.g. expecting a second look).
    const { id: review2 } = service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });
    expect(review2).not.toBe(review1);
    // The pending edit was re-claimed by review2, so it still blocks completion.
    expect(editId).toBeTruthy();
    const c2 = service.completeModuleReview(review2, 'reviewer-1', 'reviewer1', null);
    expect(c2.status).toBe('changes_requested');
    expect(c2.allReviewed).toBe(false);
  });

  it('submitModuleForReview — already pending → throws', () => {
    // Save an edit and submit for review
    service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.submitModuleForReview({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      submittedBy: 'user-1',
      submittedByUsername: 'editor1',
    });

    // Try to submit again — should throw
    expect(() =>
      service.submitModuleForReview({
        book: 'testbook',
        chapter: 1,
        moduleId: 'm00001',
        submittedBy: 'user-1',
        submittedByUsername: 'editor1',
      })
    ).toThrow('already has a pending review');
  });

  it('unapproveEdit — not approved → throws', () => {
    // Create a pending edit (not approved)
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Breytt texti',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Try to unapprove a pending edit — should throw
    expect(() => service.unapproveEdit(editId)).toThrow('not approved');
  });

  it('unapproveEdit — already applied → throws', () => {
    // Create edit, approve it, apply it to files
    const { id: editId } = service.saveSegmentEdit({
      book: 'testbook',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Yfirfarið efnisgrein.',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.approveEdit(editId, 'reviewer-1', 'reviewer1');

    // Apply approved edits — writes to disk and sets applied_at
    service.applyApprovedEdits('testbook', 1, 'm00001');

    // Verify the edit is now applied
    const edit = service.getEditById(editId);
    expect(edit.applied_at).toBeTruthy();

    // Try to unapprove an already-applied edit — should throw
    expect(() => service.unapproveEdit(editId)).toThrow('already been applied');
  });
});
