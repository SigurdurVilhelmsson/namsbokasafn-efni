/**
 * getEditorialProgress — appendices label fix (item 14, finding 17a).
 * Both halves pinned: FS segment count (was 0 via 'chappendices') and DB
 * editMap join (was 0 via key 'appendices' vs stringified integer '-1').
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'edprog-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const BOOK = 'synthetic-edprog-book';
const MODULE = 'm99901';

let service;
let segmentParser;
let realBooksDir;
let booksDir;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  booksDir = path.join(work, 'books');
  const appDir = path.join(booksDir, BOOK, '02-for-mt', 'appendices');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    path.join(appDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  // Write fixture rows through a direct connection to the same file the
  // service's lazy singleton will open (env was set before any require).
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const insert = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', 'ed1', 'editor1')`
  );
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id001`, 'First.', 'Fyrsti.');
  insert.run(BOOK, -1, MODULE, `${MODULE}:para:fs-id002`, 'Second.', 'Annar.');
  db.close();

  service = require('../services/segmentEditorService');
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('getEditorialProgress', () => {
  it('is exported from segmentEditorService', () => {
    expect(typeof service.getEditorialProgress).toBe('function');
  });

  it('counts appendix segments from the filesystem (17a half 1)', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[-1]).toBeDefined();
    expect(progress.chapters[-1].totalSegments).toBe(2);
  });

  it('joins appendix DB edit aggregates (17a half 2) and reaches complete', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[-1].approvedSegments).toBe(2);
    expect(progress.chapters[-1].percentComplete).toBe(100);
    expect(progress.summary.modulesComplete).toBe(1);
  });
});
