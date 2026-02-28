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

// Store original BOOKS_DIR to restore after tests
const originalBooksDir = segmentParser.BOOKS_DIR;

/**
 * Create an in-memory DB with the segment_edits schema applied.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Migration 008: segment_edits table
  db.exec(`
    CREATE TABLE segment_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      original_content TEXT NOT NULL,
      edited_content TEXT NOT NULL,
      category TEXT CHECK(category IN (
        'terminology', 'accuracy', 'readability', 'style', 'omission'
      )),
      editor_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending', 'approved', 'rejected', 'discuss'
      )),
      editor_id TEXT NOT NULL,
      editor_username TEXT NOT NULL,
      reviewer_id TEXT,
      reviewer_username TEXT,
      reviewer_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      applied_at DATETIME
    );

    CREATE INDEX idx_segment_edits_module ON segment_edits(book, module_id);
    CREATE INDEX idx_segment_edits_status ON segment_edits(status);
    CREATE INDEX idx_segment_edits_segment ON segment_edits(module_id, segment_id);
    CREATE INDEX idx_segment_edits_applied ON segment_edits(module_id, status, applied_at);
  `);

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
      book: 'efnafraedi',
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
    expect(edit.book).toBe('efnafraedi');
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
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'First edit',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const second = service.saveSegmentEdit({
      book: 'efnafraedi',
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
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Editor 1 version',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    service.saveSegmentEdit({
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Editor 2 version',
      editorId: 'user-2',
      editorUsername: 'editor2',
    });

    const edits = service.getSegmentEdits('efnafraedi', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(2);
    const contents = edits.map((e) => e.edited_content).sort();
    expect(contents).toEqual(['Editor 1 version', 'Editor 2 version']);
  });

  // --- Review lifecycle ---

  it('approveEdit changes status to approved and records reviewer', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi',
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

  it('approveEdit rejects self-approval (editor_id === reviewer_id)', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original',
      editedContent: 'Edited',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(() => service.approveEdit(id, 'user-1', 'editor1')).toThrow(
      'Cannot approve your own edit'
    );
  });

  it('rejectEdit changes status to rejected', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi',
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
      book: 'efnafraedi',
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
      book: 'efnafraedi',
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

  it('deleteSegmentEdit rejects deletion of approved edit', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi',
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
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Orig1',
      editedContent: 'Edit1',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const edits = service.getModuleEdits('efnafraedi', 'm00001');
    expect(edits).toHaveLength(2);
  });

  it('getModuleEdits with status filter returns only matching', () => {
    const { id } = service.saveSegmentEdit({
      book: 'efnafraedi',
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
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit2',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const approved = service.getModuleEdits('efnafraedi', 'm00001', 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(id);

    const pending = service.getModuleEdits('efnafraedi', 'm00001', 'pending');
    expect(pending).toHaveLength(1);
  });

  it('getSegmentEdits returns edits for specific segment', () => {
    service.saveSegmentEdit({
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Orig',
      editedContent: 'Edit A',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });
    service.saveSegmentEdit({
      book: 'efnafraedi',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id002',
      originalContent: 'Orig2',
      editedContent: 'Edit B',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    const edits = service.getSegmentEdits('efnafraedi', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(1);
    expect(edits[0].edited_content).toBe('Edit A');
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

  it('apply with superseded edits: latest approved wins, older marked rejected', () => {
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

    // The older edit should be marked as rejected/superseded
    const olderEdit = service.getEditById(id1);
    expect(olderEdit.status).toBe('rejected');
    expect(olderEdit.applied_at).toBeTruthy();
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
});
