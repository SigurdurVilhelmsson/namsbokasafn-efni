/**
 * F3 final-review (item 20b PR1 fix wave): an accept-only module (0 edits,
 * every segment covered by an active acceptance) must report `complete` in
 * BOTH the book-wide summary (getEditorialProgress, already acceptance-aware
 * per item 20b Task 8) and the per-module/per-chapter breakdown built by
 * routes/status.js's editorial-progress handler — which previously derived
 * module status from getBookEditsByModule (edits-only: approved >= segCount)
 * and so showed `not-started` on the very same JSON payload
 * (git diff 0b777875..HEAD -- server/routes/status.js was empty before this
 * fix — the route never picked up Task 8's redefinition). Regression guard
 * for the getReviewedSegmentsByModule extraction + its wiring into the route.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'acc-progress-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const BOOK = 'synthetic-acceptcomplete-book';
const MODULE = 'm99920';

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

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  const booksDir = path.join(work, 'books');
  const chDir = path.join(booksDir, BOOK, '02-for-mt', 'ch01');
  mkdirSync(chDir, { recursive: true });
  writeFileSync(
    path.join(chDir, `${MODULE}-segments.en.md`),
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nOnly segment.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  const { VALID_BOOKS } = require('../config');
  VALID_BOOKS.push(BOOK);

  // Zero edits, one active acceptance covering the module's only segment —
  // the previously-impossible-to-agree-on case.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.prepare(
    `INSERT INTO segment_acceptances
       (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
     VALUES (?, 1, ?, ?, 'Aðeins bútur.', 'u1', 'editor1')`
  ).run(BOOK, MODULE, `${MODULE}:para:fs-id001`);
  db.close();

  const router = require('../routes/status');
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

describe('accept-only module completion agrees with the book-wide summary (F3)', () => {
  it('route: module status is complete and counted in chModulesComplete, matching summary.modulesComplete', async () => {
    const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
    expect(r.status).toBe(200);
    const ch = r.body.chapters.find((c) => String(c.chapter) === '1');
    const mod = ch.moduleDetails.find((m) => m.moduleId === MODULE);
    expect(mod.status).toBe('complete');
    expect(ch.modulesComplete).toBe(1);
    expect(r.body.summary.modulesComplete).toBe(1);
  });
});
