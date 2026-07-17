/**
 * apply-and-render guard order (item 12, F6) + apply-all removal pin (item 12 §8).
 *
 * With a pipeline job already running for the module's book+chapter, the
 * route must 409 with NOTHING applied. Pre-fix it applied first: edits were
 * written but unrendered, the client saw total failure, and a retry died on
 * "All approved edits have already been applied".
 */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() loads at import time.
const work = mkdtempSync(path.join(tmpdir(), 'applyguard-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');

const BOOK = 'guard-test-book'; // synthetic — never touches committed books/
const MODULE = 'm99901';
const SEGMENT_ID = `${MODULE}:para:fs-id1`;

let db;
let handler;
let pipelineService;

function invoke(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      },
    };
    handler(req, res);
  });
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);

  pipelineService = require('../services/pipelineService');
  const router = require('../routes/segment-editor');
  const layer = router.stack.find(
    (l) =>
      l.route &&
      l.route.path === '/:book/:chapter/:moduleId/apply-and-render' &&
      l.route.methods.post
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  db.close();
});

afterEach(() => {
  pipelineService._jobsMap().delete('guard-test-job');
  db.prepare(`DELETE FROM segment_edits WHERE book = ?`).run(BOOK);
});

describe('POST /:book/:chapter/:moduleId/apply-and-render — guard order (F6)', () => {
  it('409s BEFORE applying anything when a pipeline job is already running', async () => {
    // An approved, unapplied edit a mis-ordered route would have applied.
    db.prepare(
      `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          editor_id, editor_username, status, reviewed_at)
       VALUES (?, 1, ?, ?, 'upphaflegt', 'breytt', 'e1', 'editor1', 'approved', CURRENT_TIMESTAMP)`
    ).run(BOOK, MODULE, SEGMENT_ID);

    pipelineService._jobsMap().set('guard-test-job', {
      id: 'guard-test-job',
      type: 'pipeline',
      book: BOOK,
      chapter: 1,
      moduleId: 'all',
      track: 'faithful',
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      output: [],
      error: null,
    });

    const { status, body } = await invoke({
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: { id: 7, username: 'ritstjori' },
      body: {},
    });

    expect(status).toBe(409);
    expect(body.jobId).toBe('guard-test-job');

    // NOTHING was applied — the approved edit is untouched on both axes.
    const row = db.prepare(`SELECT applied_at, status FROM segment_edits WHERE book = ?`).get(BOOK);
    expect(row.status).toBe('approved');
    expect(row.applied_at).toBeNull();
  });
});

describe('apply-all route removal pin (item 12 §8)', () => {
  it('the router no longer defines POST /:book/:chapter/apply-all', () => {
    const router = require('../routes/segment-editor');
    const layer = router.stack.find((l) => l.route && l.route.path === '/:book/:chapter/apply-all');
    expect(layer).toBeUndefined();
  });
});
