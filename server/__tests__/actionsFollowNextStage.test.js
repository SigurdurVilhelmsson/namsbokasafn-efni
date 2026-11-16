/**
 * `GET /api/status/:book/:chapter` answers "what is next" twice: `nextStage`
 * (from `formatChapterStatus`) and `actions` (from `suggestNextActions`).
 *
 * `suggestNextActions` used to re-derive the stage with its own if/else chain
 * over every stage, CLI-side ones included. So in one response `nextStage`
 * named the review while `actions` told the reader to extract, to run the
 * archived protect tool, or to upload segments by hand (register §C224, §C141 ③).
 * It also tested a top-level `publication.complete` flag that nothing builds,
 * so a chapter with all three tracks published was still told to publish.
 *
 * These cases pin that the two agree: the action is for `nextStage`, and there
 * is no action when `nextStage` is null.
 *
 * The two control cases pass before the change too: from review onward, with
 * the CLI-side stages complete, the old chain happened to agree.
 *
 * The last block pins that the commands name things that exist. The review's
 * command was `/review-chapter`, a Claude slash command and no server path; the
 * publication command ended in `/:track`, which no route has. Those cases check
 * each command against the router that would serve it, so a renamed route turns
 * them red.
 *
 * Harness idiom: handler extracted from the router stack, as in
 * reviewStaysInProgress.test.js.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'actions-next-stage-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const pipelineStatusService = require('../services/pipelineStatusService');

const BOOK = 'efnafraedi-2e';
const CHAPTER = 1;
const CLI_STAGES = ['extraction', 'mtReady', 'mtOutput'];

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

async function view(chapter = String(CHAPTER)) {
  const { body } = await invoke(handler, {
    params: { book: BOOK, chapter },
    query: {},
    user: {},
  });
  return body;
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

describe('the suggested action is for nextStage', () => {
  it('names the review for an untouched chapter', async () => {
    const body = await view();
    expect(body.actions[0].stage).toBe(body.nextStage);
  });

  it('names the review when only extraction is complete', async () => {
    complete('extraction');
    const body = await view();
    expect(body.actions[0].stage).toBe(body.nextStage);
  });

  it('names the review when extraction and mtReady are complete', async () => {
    complete('extraction', 'mtReady');
    const body = await view();
    expect(body.actions[0].stage).toBe(body.nextStage);
  });

  it('names the review for a chapter published as mt-preview without one', async () => {
    complete('injection', 'rendering', 'publication.mtPreview');
    const body = await view();
    expect(body.actions[0].stage).toBe(body.nextStage);
  });

  it('names injection after the review when no CLI-side stage is recorded', async () => {
    complete('linguisticReview');
    const body = await view();
    expect(body.actions[0].stage).toBe(body.nextStage);
  });

  it('names publication while a track is still unpublished', async () => {
    complete('linguisticReview', 'injection', 'rendering', 'publication.mtPreview');
    const body = await view();
    expect(body.actions[0].stage).toBe('publication');
  });

  it('gives one action', async () => {
    const body = await view();
    expect(body.actions).toHaveLength(1);
  });
});

describe('no action when nothing is next', () => {
  it('gives no action for a chapter with every track published', async () => {
    complete('linguisticReview', 'injection', 'rendering');
    complete('publication.mtPreview', 'publication.faithful', 'publication.localized');
    const body = await view();
    expect(body.actions).toEqual([]);
  });

  it('has a null nextStage in that same state (control for the case above)', async () => {
    complete('linguisticReview', 'injection', 'rendering');
    complete('publication.mtPreview', 'publication.faithful', 'publication.localized');
    const body = await view();
    expect(body.nextStage).toBeNull();
  });
});

describe('no action names a CLI-side or retired step', () => {
  it('does not name the archived protect tool', async () => {
    complete('extraction');
    const body = await view();
    expect(JSON.stringify(body.actions)).not.toContain('protect-segments');
  });

  it('does not tell the reader to upload segments by hand', async () => {
    complete('extraction', 'mtReady');
    const body = await view();
    expect(JSON.stringify(body.actions)).not.toContain('malstadur.is');
  });

  it('never names a CLI-side stage', async () => {
    const body = await view();
    expect(CLI_STAGES).not.toContain(body.actions[0].stage);
  });
});

describe('control: where the old chain already agreed', () => {
  it('names injection once the review and the CLI-side stages are complete', async () => {
    complete(...CLI_STAGES, 'linguisticReview');
    const body = await view();
    expect([body.nextStage, body.actions[0].stage]).toEqual(['injection', 'injection']);
  });

  it('names rendering once injection is complete', async () => {
    complete(...CLI_STAGES, 'linguisticReview', 'injection');
    const body = await view();
    expect([body.nextStage, body.actions[0].stage]).toEqual(['rendering', 'rendering']);
  });
});

describe('the commands name a real page and real routes', () => {
  const PUBLISHED_ROUTES = ['mt-preview', 'faithful', 'localized'].map(
    (t) => `Publication API: POST /api/publication/${BOOK}/${CHAPTER}/${t}`
  );

  async function publicationAction() {
    complete('linguisticReview', 'injection', 'rendering');
    return (await view()).actions[0];
  }

  /** Paths of the routes a router serves for one method. */
  function routePaths(router, method) {
    return router.stack.filter((l) => l.route && l.route.methods[method]).map((l) => l.route.path);
  }

  it('sends the review to the segment editor page for the chapter', async () => {
    expect((await view()).actions[0].command).toBe(`/editor?book=${BOOK}&chapter=${CHAPTER}`);
  });

  it('uses the canonical chapter value for the appendices', async () => {
    expect((await view('appendices')).actions[0].command).toBe(`/editor?book=${BOOK}&chapter=-1`);
  });

  it('names a page the views router serves', async () => {
    const pagePath = (await view()).actions[0].command.split('?')[0];
    expect(routePaths(require('../routes/views'), 'get')).toContain(pagePath);
  });

  it('lists the three publication routes', async () => {
    expect((await publicationAction()).commands).toEqual(PUBLISHED_ROUTES);
  });

  it('names only routes the publication router serves', async () => {
    const served = routePaths(require('../routes/publication'), 'post');
    const named = (await publicationAction()).commands.map((c) =>
      c.replace(
        `Publication API: POST /api/publication/${BOOK}/${CHAPTER}`,
        '/:bookSlug/:chapterNum'
      )
    );
    expect(served).toEqual(expect.arrayContaining(named));
  });

  it('carries no route placeholder', async () => {
    expect(JSON.stringify(await publicationAction())).not.toContain('/:');
  });
});
