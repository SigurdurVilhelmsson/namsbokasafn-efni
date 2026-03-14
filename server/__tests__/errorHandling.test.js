/**
 * Error Handling Tests for segmentEditorService
 *
 * Tests edge cases: empty content, null parameters, re-save dedup, and
 * the withdraw-on-match-original behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const service = require('../services/segmentEditorService');

/**
 * Create an in-memory DB with the segment_edits schema.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

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

  return db;
}

describe('segmentEditorService — error handling', () => {
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

  it('save with empty editedContent succeeds when different from original', () => {
    const result = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Some original text',
      editedContent: '',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(result.id).toBeDefined();
    expect(result.reverted).toBeUndefined();

    const edit = service.getEditById(result.id);
    expect(edit.edited_content).toBe('');
    expect(edit.original_content).toBe('Some original text');
    expect(edit.status).toBe('pending');
  });

  it('save with null segmentId throws a database constraint error', () => {
    expect(() =>
      service.saveSegmentEdit({
        book: 'efnafraedi-2e',
        chapter: 1,
        moduleId: 'm00001',
        segmentId: null,
        originalContent: 'Original',
        editedContent: 'Edited',
        editorId: 'user-1',
        editorUsername: 'editor1',
      })
    ).toThrow();
  });

  it('save then re-save same segment updates existing pending edit', () => {
    const first = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original text',
      editedContent: 'First attempt',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(first.updated).toBe(false);

    const second = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original text',
      editedContent: 'Second attempt',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    // Same row updated, not a new row
    expect(second.id).toBe(first.id);
    expect(second.updated).toBe(true);

    // Only one edit exists in the DB
    const edits = service.getSegmentEdits('efnafraedi-2e', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(1);
    expect(edits[0].edited_content).toBe('Second attempt');
  });

  it('save matching original withdraws existing edit', () => {
    // First, create a real edit
    const first = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original text',
      editedContent: 'Changed text',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(first.id).toBeDefined();

    // Now save again with editedContent === originalContent — this withdraws the edit
    const withdrawn = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Original text',
      editedContent: 'Original text',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(withdrawn.reverted).toBe(true);
    expect(withdrawn.id).toBe(first.id);

    // The edit should be gone from the DB
    const edit = service.getEditById(first.id);
    expect(edit).toBeUndefined();

    // No edits remain for this segment
    const edits = service.getSegmentEdits('efnafraedi-2e', 'm00001', 'm00001:para:fs-id001');
    expect(edits).toHaveLength(0);
  });

  it('save matching original with no existing edit returns reverted with null id', () => {
    // No prior edit exists — saving with editedContent === originalContent is a no-op
    const result = service.saveSegmentEdit({
      book: 'efnafraedi-2e',
      chapter: 1,
      moduleId: 'm00001',
      segmentId: 'm00001:para:fs-id001',
      originalContent: 'Same text',
      editedContent: 'Same text',
      editorId: 'user-1',
      editorUsername: 'editor1',
    });

    expect(result.reverted).toBe(true);
    expect(result.id).toBeNull();
  });
});
