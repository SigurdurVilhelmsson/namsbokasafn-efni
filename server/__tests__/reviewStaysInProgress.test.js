/**
 * Linguistic review no longer GATES injection ([USER] 2026-11-15, option A), but
 * it stays in the two things `GET /api/status/:book/:chapter` tells people: the
 * progress figure and the next stage.
 *
 * Both were computed over the sequential stages only. Once review became
 * non-sequential, a chapter under review reported 0% and named `injection` as
 * its next stage, so the dashboard's attention list and the meeting agenda's
 * "Næsta skref" line proposed injecting a chapter whose review was still going.
 *
 * So the status view deliberately differs from the DB read model here:
 * `getChapterStage().currentStage` answers "what does the server wait on", and
 * names `injection`; `nextStage` answers "what work is next", and names the
 * review until it is done. The last case pins that difference.
 *
 * Harness idiom: handler extracted from the router stack, as in
 * nonSequentialStages.test.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'review-progress-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const pipelineStatusService = require('../services/pipelineStatusService');

const BOOK = 'efnafraedi-2e';
const CHAPTER = 1;

let db;
let handler;

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

async function view() {
  const { body } = await invoke(handler, {
    params: { book: BOOK, chapter: String(CHAPTER) },
    query: {},
    user: {},
  });
  return body;
}

function set(stage, status) {
  pipelineStatusService.transitionStage(BOOK, CHAPTER, stage, status, 'user1', null);
}

beforeAll(() => {
  const router = require('../routes/status');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/:chapter' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

beforeEach(() => {
  if (db) db.close();
  db = new Database(':memory:');
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
  pipelineStatusService._setTestDb(db);
});

afterAll(() => {
  pipelineStatusService._setTestDb(null);
  if (db) db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('the status view keeps linguistic review in progress and next stage', () => {
  it('names the review as the next stage while it is under way', async () => {
    set('linguisticReview', 'in_progress');
    expect((await view()).nextStage).toBe('linguisticReview');
  });

  it('names the review as the next stage for an untouched chapter', async () => {
    expect((await view()).nextStage).toBe('linguisticReview');
  });

  it('counts a completed review toward progress', async () => {
    set('linguisticReview', 'complete');
    expect((await view()).progress).toBe(25);
  });

  it('moves on to injection once the review is complete', async () => {
    set('linguisticReview', 'complete');
    expect((await view()).nextStage).toBe('injection');
  });

  it('names the review as next for a chapter published as mt-preview without one', async () => {
    set('injection', 'complete');
    set('rendering', 'complete');
    set('publication.mtPreview', 'complete');
    expect((await view()).nextStage).toBe('linguisticReview');
  });

  it('reaches 100% only with the review and every publication track complete', async () => {
    for (const s of ['linguisticReview', 'injection', 'rendering']) set(s, 'complete');
    for (const t of ['mtPreview', 'faithful', 'localized']) set(`publication.${t}`, 'complete');
    expect((await view()).progress).toBe(100);
  });

  it('still leaves the CLI-side stages and tmCreated out of the next stage', async () => {
    set('linguisticReview', 'complete');
    set('injection', 'complete');
    expect((await view()).nextStage).toBe('rendering');
  });

  it('differs from the DB read model on purpose: currentStage names what the server waits on', async () => {
    set('linguisticReview', 'in_progress');
    expect(pipelineStatusService.getChapterStage(BOOK, CHAPTER).currentStage).toBe('injection');
  });
});
