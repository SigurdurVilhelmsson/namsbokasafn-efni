/**
 * Route-level 409 mapping for the loc approve newest-first guard (item 13).
 * PENDING_EXISTS -> 409; 'not found' -> 404 stays; generic errors -> 400 stay.
 * Harness idiom: localizationSaveBackstop.test.js (handler extracted from the
 * router stack, invoked with fake req/res).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'loc-approve-409-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const BOOK = 'synthetic-loc-approve-book';
const MODULE = 'mLOCA01';
const SEG = `${MODULE}:para:seg1`;

let approveHandler;
let review;
let segmentParser;
let realBooksDir;
let synRoot;

function invoke(handler, req) {
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
  return Promise.resolve(handler(req, res)).then(() => done);
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  segmentParser = require('../services/segmentParser');
  realBooksDir = segmentParser.BOOKS_DIR;
  synRoot = mkdtempSync(path.join(tmpdir(), 'loc-approve-syn-'));
  const bookDir = path.join(synRoot, BOOK);
  mkdirSync(path.join(bookDir, '02-for-mt', 'ch01'), { recursive: true });
  mkdirSync(path.join(bookDir, '03-faithful-translation', 'ch01'), { recursive: true });
  writeFileSync(
    path.join(bookDir, '02-for-mt', 'ch01', `${MODULE}-segments.en.md`),
    `<!-- SEG:${SEG} -->\nEN text\n`
  );
  writeFileSync(
    path.join(bookDir, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`),
    `<!-- SEG:${SEG} -->\nHrein þýðing\n`
  );
  segmentParser._setTestBooksDir(synRoot);

  review = require('../services/localizationReviewService');

  const router = require('../routes/localization-editor');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/loc-edit/:editId/approve' && l.route.methods.post
  );
  approveHandler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(synRoot, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

describe('POST /loc-edit/:editId/approve conflict mapping', () => {
  it('maps PENDING_EXISTS to 409 with the Icelandic message', async () => {
    const older = review.submitEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      originalContent: 'Hrein þýðing',
      editedContent: 'Eldri',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const newer = review.submitEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      originalContent: 'Hrein þýðing',
      editedContent: 'Nýrri',
      editorId: 5,
      editorUsername: 'editorB',
    });
    const Database = require('better-sqlite3');
    const db = new Database(process.env.SESSIONS_DB_PATH);
    db.prepare(
      `UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:00' WHERE id = ?`
    ).run(older.id);
    db.prepare(
      `UPDATE localization_pending_edits SET created_at = '2026-07-17 10:00:05' WHERE id = ?`
    ).run(newer.id);
    db.close();

    const { status, body } = await invoke(approveHandler, {
      params: { editId: String(older.id) },
      user: { id: 2, username: 'headX', role: 'head_editor', books: [BOOK] },
      body: {},
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Nýrri breyting í bið/);
  });

  it('keeps 404 for a missing edit', async () => {
    const { status } = await invoke(approveHandler, {
      params: { editId: '999999' },
      user: { id: 2, username: 'headX', role: 'head_editor', books: [BOOK] },
      body: {},
    });
    expect(status).toBe(404);
  });
});
