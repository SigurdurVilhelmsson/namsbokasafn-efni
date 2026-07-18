/**
 * F18 (item 16 PR1): `applied` is a strict subset of `approved` by SQL
 * construction (apply stamps applied_at, status stays 'approved'), so
 * approved + applied double-counts every applied segment. A module with
 * 1-of-2 segments approved-and-applied must NOT report complete.
 * Two halves: service (getEditorialProgress) and route
 * (/:book/editorial-progress moduleDetails) — handler-extraction idiom
 * cf. statusChapterRoute.test.js.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'dblcount-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const BOOK = 'synthetic-dblcount-book';
const MODULE = 'm99902';

let service;
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
    `<!-- SEG:${MODULE}:para:fs-id001 -->\nFirst.\n\n<!-- SEG:${MODULE}:para:fs-id002 -->\nSecond.\n`
  );
  segmentParser._setTestBooksDir(booksDir);

  const { VALID_BOOKS } = require('../config');
  VALID_BOOKS.push(BOOK);

  // ONE approved edit, already applied, on a 2-segment module. Old formula:
  // approved(1) + applied(1) = 2 >= 2 → falsely complete.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', 'ed1', 'editor1', datetime('now'))`
  ).run(BOOK, 1, MODULE, `${MODULE}:para:fs-id001`, 'First.', 'Fyrsti.');
  db.close();

  service = require('../services/segmentEditorService');
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

describe('applied-and-approved segments are counted once (F18)', () => {
  it('service: a half-reviewed module is not modulesComplete', () => {
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.summary.modulesComplete).toBe(0);
  });

  it('route: moduleDetails reports 1 approved segment, status in-progress', async () => {
    const r = await invoke(progressHandler, { params: { book: BOOK }, query: {} });
    expect(r.status).toBe(200);
    const ch = r.body.chapters.find((c) => String(c.chapter) === '1');
    const mod = ch.moduleDetails.find((m) => m.moduleId === MODULE);
    expect(mod.segmentsApproved).toBe(1);
    expect(mod.status).toBe('in-progress');
  });
});
