/**
 * getApplyStatus rebuild affordance (Unit 4.5).
 *
 * When every approved edit is marked applied but the faithful file is gone,
 * getApplyStatus reports can_rebuild=true so the editor UI can re-enable the
 * apply button (applyApprovedEdits self-heals by re-applying).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const service = require('../services/segmentEditorService');

const BOOK = 'testbook';
const CHAPTER = 1;
const MODULE = 'm00001';

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

describe('getApplyStatus rebuild affordance', () => {
  let db;
  let tmpDir;
  let booksDir;
  let faithfulPath;

  function insertEdit({ status, applied }) {
    db.prepare(
      `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username, applied_at)
       VALUES (?, ?, ?, ?, 'orig', 'new', ?, '4', 'editorA', ?)`
    ).run(
      BOOK,
      CHAPTER,
      MODULE,
      `${MODULE}:para:fs-id001`,
      status,
      applied ? new Date().toISOString() : null
    );
  }

  function writeFaithful() {
    const dir = join(booksDir, BOOK, '03-faithful-translation', 'ch01');
    mkdirSync(dir, { recursive: true });
    faithfulPath = join(dir, `${MODULE}-segments.is.md`);
    writeFileSync(faithfulPath, '<!-- SEG:m00001:para:fs-id001 -->\nnew', 'utf-8');
  }

  beforeEach(() => {
    db = createTestDb();
    service._setTestDb(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'applystatus-test-'));
    booksDir = join(tmpDir, 'books');
    service._setTestBooksDir(booksDir);
  });

  afterEach(() => {
    db.close();
    service._setTestDb(null);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports faithful_exists and no rebuild when the file is present', () => {
    insertEdit({ status: 'approved', applied: true });
    writeFaithful();
    const status = service.getApplyStatus(BOOK, MODULE, CHAPTER);
    expect(status.applied_count).toBe(1);
    expect(status.faithful_exists).toBe(true);
    expect(status.can_rebuild).toBe(false);
  });

  it('flags can_rebuild when all edits are applied but the faithful file is gone', () => {
    insertEdit({ status: 'approved', applied: true });
    // no faithful file written
    const status = service.getApplyStatus(BOOK, MODULE, CHAPTER);
    expect(status.unapplied_count).toBe(0);
    expect(status.applied_count).toBe(1);
    expect(status.faithful_exists).toBe(false);
    expect(status.can_rebuild).toBe(true);
  });

  it('does not flag rebuild when there are still unapplied approved edits', () => {
    insertEdit({ status: 'approved', applied: false });
    const status = service.getApplyStatus(BOOK, MODULE, CHAPTER);
    expect(status.unapplied_count).toBe(1);
    expect(status.can_rebuild).toBe(false);
  });

  it('omits file info when no chapter is supplied (backward compatible)', () => {
    insertEdit({ status: 'approved', applied: true });
    const status = service.getApplyStatus(BOOK, MODULE);
    expect(status.applied_count).toBe(1);
    expect(status.faithful_exists).toBe(null);
    expect(status.can_rebuild).toBe(false);
  });
});
