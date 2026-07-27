/**
 * C10-R2, second read model: the status.json-shaped view served by
 * `GET /api/status/:book/:chapter` must skip non-sequential stages exactly as
 * the DB read model does.
 *
 * There are two independent status read models in this codebase —
 * `services/pipelineStatusService.js` (DB) and `routes/status.js`
 * (`formatChapterStatus` / `suggestNextActions`, fed from the DB but sequencing
 * over the full `PIPELINE_STAGES` list). Making `tmCreated` non-sequential in
 * only the first one made them contradict each other: a fully published chapter
 * would report every real stage complete while `nextStage` still said
 * `tmCreated` and `progress` was capped below 100% forever. That is not
 * cosmetic — `nextStage` drives the dashboard's assignment proposals
 * (`routes/status.js:196-203`) and the meeting agenda's "Næsta skref" line
 * (`:851`), and `suggestNextActions` would have told editors to run Matecat
 * Align, a tool this pipeline retired.
 *
 * Harness idiom: handler extracted from the router stack, invoked with fake
 * req/res (cf. statusChapterRoute.test.js).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'nonseq-stages-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const pipelineStatusService = require('../services/pipelineStatusService');
const { NON_SEQUENTIAL_STAGES } = require('../constants');

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

function get() {
  return invoke(handler, { params: { book: BOOK, chapter: String(CHAPTER) }, query: {}, user: {} });
}

function complete(...stages) {
  for (const stage of stages) {
    pipelineStatusService.transitionStage(BOOK, CHAPTER, stage, 'complete', 'user1', null);
  }
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
  db.pragma('journal_mode = WAL');
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

describe('the two status read models agree on non-sequential stages (C10-R2)', () => {
  it('names a real next stage instead of parking on tmCreated', async () => {
    complete('extraction', 'mtReady', 'mtOutput', 'linguisticReview');

    const { body } = await get();
    expect(body.nextStage).toBe('injection');
    expect(pipelineStatusService.getChapterStage(BOOK, CHAPTER).currentStage).toBe('injection');
  });

  it('suggests the real next action, not the retired Matecat Align step', async () => {
    complete('extraction', 'mtReady', 'mtOutput', 'linguisticReview');

    const { body } = await get();
    expect(body.actions.map((a) => a.stage)).not.toContain('tmCreated');
    expect(body.actions[0].stage).toBe('injection');
  });

  it('reaches 100% and a null nextStage with every sequential stage complete', async () => {
    complete('extraction', 'mtReady', 'mtOutput', 'linguisticReview', 'injection', 'rendering');
    complete('publication.mtPreview', 'publication.faithful', 'publication.localized');

    const { body } = await get();
    expect(body.progress).toBe(100);
    expect(body.nextStage).toBeNull();
    expect(body.actions.map((a) => a.stage)).not.toContain('tmCreated');
    // NB: `actions` still carries a 'publication' entry here. That is a
    // SEPARATE pre-existing defect, not this change: `suggestNextActions` tests
    // `rawStatus.publication?.complete`, but `getStatusDataFromDb` only ever
    // builds `publication.{mtPreview,faithful,localized}.complete` — there is no
    // top-level flag, so that branch can never be satisfied. `formatChapterStatus`
    // gets it right (it ANDs the three sub-tracks), which is why `progress` and
    // `nextStage` above are correct. Logged in the campaign register.
  });

  it('still REPORTS the non-sequential stage in the stages list', async () => {
    const { body } = await get();
    expect(body.stages.map((s) => s.stage)).toEqual(expect.arrayContaining(NON_SEQUENTIAL_STAGES));
  });

  it('progress is unaffected by whether the non-sequential stage is complete', async () => {
    complete('extraction', 'mtReady', 'mtOutput', 'linguisticReview');
    const before = (await get()).body.progress;

    complete('tmCreated');
    const after = (await get()).body.progress;

    expect(after).toBe(before);
  });
});
