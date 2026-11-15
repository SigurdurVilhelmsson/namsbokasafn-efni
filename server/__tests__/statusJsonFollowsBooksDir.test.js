/**
 * The status.json cache is written under the SAME books directory the rest of
 * the server uses, so a test that redirects it keeps the write out of the real
 * `books/` tree.
 *
 * `pipelineStatusService` held its own `BOOKS_DIR`, fixed at the repository's
 * `books/`. Tests that redirect the books directory through
 * `segmentParser._setTestBooksDir()` (applyHold, acceptanceRoutes) run against a
 * real temporary database, so a completed stage transition wrote
 * `books/<slug>/chapters/<ch>/status.json` into the working tree. That stayed
 * hidden while the transition was refused, and surfaced when register §C224 ③
 * let `linguisticReview` complete.
 *
 * This file uses a real temporary database on purpose: `_setTestDb()` turns the
 * file write off altogether, which would make every assertion here vacuous.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'status-json-dir-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const segmentParser = require('../services/segmentParser');
const pipelineStatusService = require('../services/pipelineStatusService');

// A chapter the repository has no status directory for, so a file appearing at
// the real path can only have come from this test.
const BOOK = 'liffraedi-2e';
const CHAPTER = 1;
const REL = path.join(BOOK, 'chapters', 'ch01', 'status.json');

let realBooksDir;
let tempBooksDir;
let realPath;
let realExistedBefore;

beforeAll(() => {
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec(`
    CREATE TABLE chapter_pipeline_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_slug TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      completed_at DATETIME,
      completed_by TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_slug, chapter_num, stage)
    );
  `);
  db.close();

  realBooksDir = segmentParser.BOOKS_DIR;
  realPath = path.join(realBooksDir, REL);
  realExistedBefore = existsSync(realPath);

  tempBooksDir = path.join(work, 'books');
  mkdirSync(path.join(tempBooksDir, BOOK), { recursive: true });
  segmentParser._setTestBooksDir(tempBooksDir);

  pipelineStatusService.transitionStage(BOOK, CHAPTER, 'linguisticReview', 'complete', 'user1');
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  // Remove only what this test created, and only at the real path.
  if (!realExistedBefore && existsSync(realPath)) {
    rmSync(path.dirname(realPath), { recursive: true, force: true });
  }
  rmSync(work, { recursive: true, force: true });
});

describe('the status.json cache follows the redirected books directory', () => {
  it('starts from a real tree that has no status file for this chapter', () => {
    expect(realExistedBefore).toBe(false);
  });

  it('writes the status file under the redirected directory', () => {
    expect(existsSync(path.join(tempBooksDir, REL))).toBe(true);
  });

  it('records the completed stage in that file', () => {
    const written = JSON.parse(readFileSync(path.join(tempBooksDir, REL), 'utf8'));
    expect(written.status.linguisticReview.complete).toBe(true);
  });

  it('writes nothing into the real books tree', () => {
    expect(existsSync(realPath)).toBe(false);
  });
});
