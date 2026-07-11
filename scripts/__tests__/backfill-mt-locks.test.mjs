import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backfill-mt-locks.js');

// better-sqlite3 is only installed under server/node_modules (root has no
// dependency on it) — same resolution the repo already uses in
// scripts/__tests__/backup-db.test.mjs and tools/migrate-pipeline-status.js.
function makeSegmentEditsDb(dbPath) {
  const Database = require(path.join(REPO, 'server', 'node_modules', 'better-sqlite3'));
  const d = new Database(dbPath);
  // Column set from server/migrations/008-segment-editing.js (minus the CHECK
  // constraints and indexes, which this test doesn't need).
  d.exec(`
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
      reviewer_id TEXT,
      reviewer_username TEXT,
      reviewer_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    );
  `);
  return d;
}

function insertEdit(db, { book, chapter, moduleId, segmentId }) {
  db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content, editor_id, editor_username)
     VALUES (?, ?, ?, ?, 'orig', 'edited', 'editor-1', 'editor1')`
  ).run(book, chapter, moduleId, segmentId);
}

// Books tree with a module that has an mtOutput file but NO faithful file —
// i.e. only discoverable via the DB signal, never the file signal. Also
// includes a "__"-prefixed test-fixture book in the same shape, to prove the
// existing fixture-skip (Correction 5) applies to DB rows too.
function makeBooksTree(root) {
  const mtDir = path.join(root, 'fixture-book', '02-mt-output', 'ch01');
  mkdirSync(mtDir, { recursive: true });
  writeFileSync(path.join(mtDir, 'm1-segments.is.md'), '<!-- SEG:m1:para:x -->\nhallo\n');

  const dunderMtDir = path.join(root, '__dunder-fixture__', '02-mt-output', 'ch01');
  mkdirSync(dunderMtDir, { recursive: true });
  writeFileSync(path.join(dunderMtDir, 'm2-segments.is.md'), '<!-- SEG:m2:para:x -->\nhallo\n');
}

const LOCK_PATH = (booksDir) =>
  path.join(booksDir, 'fixture-book', '02-mt-output', 'ch01', 'm1-segments.locked');
const DUNDER_LOCK_PATH = (booksDir) =>
  path.join(booksDir, '__dunder-fixture__', '02-mt-output', 'ch01', 'm2-segments.locked');

describe('backfill-mt-locks.js --db', () => {
  let work;

  afterEach(() => {
    if (work) rmSync(work, { recursive: true, force: true });
    work = undefined;
  });

  it('locks a DB-only module (no faithful file) under --db, and still skips a "__" test-fixture book', () => {
    work = mkdtempSync(path.join(tmpdir(), 'mtlock-backfill-'));
    const booksDir = path.join(work, 'books');
    makeBooksTree(booksDir);
    const dbPath = path.join(work, 'sessions.db');
    const db = makeSegmentEditsDb(dbPath);
    insertEdit(db, { book: 'fixture-book', chapter: 1, moduleId: 'm1', segmentId: 'm1:para:x' });
    insertEdit(db, {
      book: '__dunder-fixture__',
      chapter: 1,
      moduleId: 'm2',
      segmentId: 'm2:para:x',
    });
    db.close();

    const env = { ...process.env, BOOKS_ROOT_OVERRIDE: booksDir, SESSIONS_DB_PATH: dbPath };
    const out = execFileSync('node', [SCRIPT, '--db'], { env, encoding: 'utf8' });

    expect(existsSync(LOCK_PATH(booksDir))).toBe(true);
    expect(existsSync(DUNDER_LOCK_PATH(booksDir))).toBe(false);
    expect(out).toMatch(/locked/i);

    // Re-run: idempotent, and the "already locked" summary should now report
    // the module verified above without re-counting it as newly locked.
    const secondOut = execFileSync('node', [SCRIPT, '--db'], { env, encoding: 'utf8' });
    expect(secondOut).toMatch(/already locked:\s*1/i);
  });

  it('does NOT lock a DB-only module without --db', () => {
    work = mkdtempSync(path.join(tmpdir(), 'mtlock-backfill-'));
    const booksDir = path.join(work, 'books');
    makeBooksTree(booksDir);
    const dbPath = path.join(work, 'sessions.db');
    const db = makeSegmentEditsDb(dbPath);
    insertEdit(db, { book: 'fixture-book', chapter: 1, moduleId: 'm1', segmentId: 'm1:para:x' });
    db.close();

    const env = { ...process.env, BOOKS_ROOT_OVERRIDE: booksDir, SESSIONS_DB_PATH: dbPath };
    execFileSync('node', [SCRIPT], { env, encoding: 'utf8' }); // no --db

    expect(existsSync(LOCK_PATH(booksDir))).toBe(false);
  });

  it('exits non-zero (fails loud) when --db is passed but the resolved DB does not exist', () => {
    work = mkdtempSync(path.join(tmpdir(), 'mtlock-backfill-'));
    const booksDir = path.join(work, 'books');
    makeBooksTree(booksDir);
    const missingDbPath = path.join(work, 'no-such-sessions.db');

    const env = { ...process.env, BOOKS_ROOT_OVERRIDE: booksDir, SESSIONS_DB_PATH: missingDbPath };
    let error;
    try {
      execFileSync('node', [SCRIPT, '--db'], { env, encoding: 'utf8' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.status).not.toBe(0);
    expect(error.stderr).toMatch(/no database exists|not found/i);
    expect(existsSync(LOCK_PATH(booksDir))).toBe(false);
  });
});
