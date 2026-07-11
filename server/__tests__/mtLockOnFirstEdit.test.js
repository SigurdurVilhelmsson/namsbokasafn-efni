/**
 * MT edit-lock — server hook (Track C2).
 *
 * saveSegmentEdit must write a per-module `.locked` marker next to the module's
 * MT output on the FIRST segment_edits row for that module (book+chapter+moduleId),
 * and must leave it untouched on subsequent edits (the hook only attempts the
 * write when this insert was the first row; writeMtLock is idempotent besides).
 *
 * Uses the committed `books/__e2e-fixture__` book (it has a real
 * 02-mt-output/ch01/m68664-segments.is.md) rather than a synthetic temp dir:
 * segmentParser's BOOKS_DIR does have a test seam (_setTestBooksDir), but
 * repointing it would mean fabricating a matching mtOutput fixture from
 * scratch for no benefit — the real fixture module already exists. The
 * `.locked` marker this test creates in that committed tree is removed in
 * afterEach so the tree stays clean (verified separately: `git status --short
 * books/` must come back empty after the run).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const fs = require('fs');

const service = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');

const BOOK = '__e2e-fixture__';
const CHAPTER = 1;
const MODULE = 'm68664';

const { mtOutput } = segmentParser.getModulePaths(BOOK, CHAPTER, MODULE);
const LOCK_PATH = mtLockPathFor(mtOutput);

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
      category TEXT,
      editor_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      editor_id TEXT NOT NULL,
      editor_username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      applied_at DATETIME
    );
  `);
  return db;
}

function save(segmentId, editedContent) {
  return service.saveSegmentEdit({
    book: BOOK,
    chapter: CHAPTER,
    moduleId: MODULE,
    segmentId,
    originalContent: 'orig',
    editedContent,
    editorId: 'editor-1',
    editorUsername: 'editor1',
  });
}

describe('MT lock on first saved edit', () => {
  let db;

  beforeEach(() => {
    // Defensive: a previous crashed run may have left the marker behind.
    fs.rmSync(LOCK_PATH, { force: true });
    db = createTestDb();
    service._setTestDb(db);
  });

  afterEach(() => {
    db.close();
    service._setTestDb(null);
    // The fixture book is committed to git — never leave the marker behind.
    fs.rmSync(LOCK_PATH, { force: true });
  });

  it('writes the .locked marker on the first edit and leaves it untouched on the second', () => {
    expect(fs.existsSync(LOCK_PATH)).toBe(false);

    const a = save(`${MODULE}:para:fs-id001`, 'first edit');
    expect(a.id).toBeGreaterThan(0);
    expect(fs.existsSync(LOCK_PATH)).toBe(true);

    const first = fs.readFileSync(LOCK_PATH, 'utf8');
    const meta = JSON.parse(first);
    expect(meta.reason).toBe('editing-started');
    expect(meta.firstEditId).toBe(a.id);

    // Second edit, a different segment but the same module — this is the
    // module's *second* segment_edits row. The hook must not touch the marker.
    const b = save(`${MODULE}:para:fs-id002`, 'second edit');
    expect(b.id).toBeGreaterThan(a.id);
    expect(fs.readFileSync(LOCK_PATH, 'utf8')).toBe(first);
  });
});
