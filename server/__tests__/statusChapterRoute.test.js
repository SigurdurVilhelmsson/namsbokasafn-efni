/**
 * GET /api/status/:book/:chapter accepts the appendices chapter (item 14).
 * Harness idiom: handler extracted from the router stack, invoked with fake
 * req/res (cf. locApproveConflict.test.js).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'status-route-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
// auth.js (pulled in transitively via routes/status's requireAuth) throws at
// import time if JWT_SECRET is unset — same convention as locApproveConflict.test.js.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const BOOK = 'synthetic-status-book';
const MODULE = 'm99901';

let handler;
let progressHandler;
let segmentParser;
let realBooksDir;

function invoke(h, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(h(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  // Appendices fixture: one module, two EN segments, two approved edits.
  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const appDir = path.join(booksDir, BOOK, '02-for-mt', 'appendices');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    path.join(appDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  // The editorial-progress route 400s on VALID_BOOKS.includes(book) before
  // ever reaching appendices logic; VALID_BOOKS is only DB-refreshed from
  // server/index.js at real server startup (not in this isolated-handler
  // harness), so register the synthetic book directly (mutable exported
  // array — same pattern chapterLabel's own tests rely on for isolation).
  const { VALID_BOOKS } = require('../config');
  VALID_BOOKS.push(BOOK);

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

  const router = require('../routes/status');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const progressLayer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/editorial-progress' && l.route.methods.get
  );
  progressHandler = progressLayer.route.stack[progressLayer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  const { VALID_BOOKS } = require('../config');
  const idx = VALID_BOOKS.indexOf(BOOK);
  if (idx !== -1) VALID_BOOKS.splice(idx, 1);
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/status/:book/:chapter appendices acceptance', () => {
  // NOTE (deviation from the brief, see task-4-report.md): getStatusDataFromDb
  // never throws for a book/chapter absent from chapter_pipeline_status — the
  // underlying SELECT just returns zero rows and the route builds a default
  // "not started" status, so a nonexistent book resolves 200, not 404, for
  // ANY chapter (verified empirically both pre- and post-fix). The brief's
  // 404 expectation was a mispredicted assumption; asserting on it would
  // require inventing 404 behavior the brief's own edit instructions never
  // call for. Asserting `chapterDir` instead exercises the brief's actual
  // stated "Produces" contract and still fails pre-fix (400).
  it('accepts "appendices" — 200 with chapterDir "appendices", NOT 400', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: 'appendices' } });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(-1);
    expect(r.body.chapterDir).toBe('appendices');
  });

  it('accepts "-1" identically', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '-1' } });
    expect(r.status).toBe(200);
    expect(r.body.chapterDir).toBe('appendices');
  });

  it('still rejects 0', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '0' } });
    expect(r.status).toBe(400);
  });

  it('still rejects garbage', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: 'chappendices' } });
    expect(r.status).toBe(400);
  });

  it('still accepts regular chapters (200, not 400)', async () => {
    const r = await invoke(handler, { params: { book: 'nosuch-book', chapter: '3' } });
    expect(r.status).toBe(200);
    expect(r.body.chapterDir).toBe('ch03');
  });
});

describe('GET /api/status/:book/editorial-progress appendices counts (finding 17a route surface)', () => {
  it('reports real segment totals for the appendix chapter', async () => {
    const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
    expect(r.status).toBe(200);
    const appendixEntry = r.body.chapters.find((c) => c.chapter === -1);
    expect(appendixEntry).toBeDefined();
    expect(appendixEntry.segmentsTotal).toBe(2);
    expect(appendixEntry.moduleDetails[0].segmentCount).toBe(2);
  });
});
