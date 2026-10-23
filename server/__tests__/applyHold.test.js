/**
 * register §C203 — the apply hold.
 *
 * Chemistry's approved edits include 41 made on an OLDER MT, and applyApprovedEdits'
 * self-heal re-applies them over today's text on one click. Until a base-text guard and
 * §C202's fix exist, no code path may write a held book's faithful file: not apply, not
 * apply-and-render, not review completion, not a version restore.
 *
 * Every refusal below is paired with a CONTROL in which the same state, in a book that is
 * not held, DOES write. A refusal therefore cannot pass because the fixture never reached
 * the write.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const work = mkdtempSync(path.join(tmpdir(), 'apply-hold-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const HELD = 'efnafraedi-2e';
const FREE = 'liffraedi-2e'; // in VALID_BOOKS, and never held by this change
const MODULE = 'mHOLD01';
const CH = 1;
const SEG_A = `${MODULE}:para:a`;
const HEAD = { id: 'u-he1', username: 'head1', role: 'head-editor', books: [HELD, FREE] };

let service;
let segmentParser;
let contentVersionService;
let dashboard;
let tmService;
let pipelineService;
let realBooksDir;
let booksDir;
const handlers = {};

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

const openDb = () => new (require('better-sqlite3'))(process.env.SESSIONS_DB_PATH);
const faithfulPath = (book) =>
  path.join(booksDir, book, '03-faithful-translation', 'ch01', `${MODULE}-segments.is.md`);

function writeModule(book) {
  const seg = (id, text) => `<!-- SEG:${MODULE}:para:${id} -->\n${text}\n`;
  mkdirSync(path.join(booksDir, book, '02-for-mt', 'ch01'), { recursive: true });
  mkdirSync(path.join(booksDir, book, '02-mt-output', 'ch01'), { recursive: true });
  writeFileSync(
    path.join(booksDir, book, '02-for-mt', 'ch01', `${MODULE}-segments.en.md`),
    seg('a', 'EN a') + '\n' + seg('b', 'EN b')
  );
  writeFileSync(
    path.join(booksDir, book, '02-mt-output', 'ch01', `${MODULE}-segments.is.md`),
    seg('a', 'IS a') + '\n' + seg('b', 'IS b')
  );
}

/** The §C203 state: an approved edit marked applied, no faithful file, so a click self-heals. */
function armSelfHeal(book) {
  const conn = openDb();
  conn
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, status, editor_id, editor_username, applied_at)
       VALUES (?, ?, ?, ?, 'an older text', 'an edit on the older text', 'approved',
               'e1', 'editor-one', '2026-06-12 16:00:00')`
    )
    .run(book, CH, MODULE, SEG_A);
  conn.close();
}

function appliedAt(book) {
  const conn = openDb();
  const row = conn
    .prepare('SELECT applied_at FROM segment_edits WHERE book = ? AND module_id = ?')
    .get(book, MODULE);
  conn.close();
  return row.applied_at;
}

function versionCount(book) {
  const conn = openDb();
  const n = conn
    .prepare('SELECT COUNT(*) AS n FROM content_versions WHERE book = ? AND module_id = ?')
    .get(book, MODULE).n;
  conn.close();
  return n;
}

const snapshot = (book) =>
  contentVersionService.snapshotModule(book, CH, MODULE, [
    { segmentId: SEG_A, content: 'June text a' },
  ]);

function caught(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  service = require('../services/segmentEditorService');
  contentVersionService = require('../services/contentVersionService');
  dashboard = require('../services/dashboardReadModel');
  tmService = require('../services/tmService');
  pipelineService = require('../services/pipelineService');
  // A successful apply schedules a whole-book TM regeneration that would spawn
  // generate-tm.js against the checkout's real books/. Never in a test.
  tmService._setRunner(async () => ({ code: 0, stderr: '' }));
  realBooksDir = segmentParser.BOOKS_DIR;
  booksDir = path.join(work, 'books');
  writeModule(HELD);
  writeModule(FREE);
  segmentParser._setTestBooksDir(booksDir);
  service._setTestBooksDir(booksDir);
  const router = require('../routes/segment-editor');
  const find = (p, method) =>
    router.stack
      .find((l) => l.route && l.route.path === p && l.route.methods[method])
      .route.stack.at(-1).handle;
  handlers.apply = find('/:book/:chapter/:moduleId/apply', 'post');
  handlers.applyRender = find('/:book/:chapter/:moduleId/apply-and-render', 'post');
  handlers.restore = find('/:book/:chapter/:moduleId/restore/:version', 'post');
  handlers.complete = find('/reviews/:reviewId/complete', 'post');
});

afterAll(() => {
  tmService._setRunner();
  segmentParser._setTestBooksDir(realBooksDir);
  service._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  const conn = openDb();
  conn.exec(
    'DELETE FROM segment_acceptances; DELETE FROM segment_edits; DELETE FROM content_versions; DELETE FROM module_reviews;'
  );
  conn.close();
  for (const b of [HELD, FREE]) {
    rmSync(path.join(booksDir, b, '03-faithful-translation'), { recursive: true, force: true });
  }
});

describe('the held list (an enforceable value: change it here and in this test together)', () => {
  it('holds chemistry, with a reason that cites §C203', () => {
    const applyHold = require('../lib/applyHold');
    expect(applyHold.faithfulWriteHold(HELD)).toMatch(/§C203/);
  });

  it('holds no other book', () => {
    const applyHold = require('../lib/applyHold');
    expect(applyHold.HELD_BOOKS).toEqual([HELD]);
    expect(applyHold.faithfulWriteHold(FREE)).toBeNull();
  });
});

describe('applyApprovedEdits', () => {
  it('control: in an unheld book the armed state self-heals and writes the faithful file', () => {
    armSelfHeal(FREE);
    service.applyApprovedEdits(FREE, CH, MODULE);
    expect(readFileSync(faithfulPath(FREE), 'utf8')).toContain('an edit on the older text');
  });

  it('refuses a held book with code APPLY_HELD', () => {
    armSelfHeal(HELD);
    const err = caught(() => service.applyApprovedEdits(HELD, CH, MODULE));
    expect(err?.code).toBe('APPLY_HELD');
  });

  it('a refused apply resets no applied_at, so the self-heal never started', () => {
    armSelfHeal(HELD);
    caught(() => service.applyApprovedEdits(HELD, CH, MODULE));
    expect(appliedAt(HELD)).toBe('2026-06-12 16:00:00');
  });

  it('a refused apply writes no faithful file', () => {
    armSelfHeal(HELD);
    caught(() => service.applyApprovedEdits(HELD, CH, MODULE));
    expect(existsSync(faithfulPath(HELD))).toBe(false);
  });
});

describe('restoreVersion on the faithful track', () => {
  it('control: an unheld book restores a snapshot into its faithful file', () => {
    snapshot(FREE);
    contentVersionService.restoreVersion(FREE, CH, MODULE, 1, { username: 'tester' });
    expect(readFileSync(faithfulPath(FREE), 'utf8')).toContain('June text a');
  });

  it('refuses a held book with code APPLY_HELD', () => {
    snapshot(HELD);
    const err = caught(() =>
      contentVersionService.restoreVersion(HELD, CH, MODULE, 1, { username: 'tester' })
    );
    expect(err?.code).toBe('APPLY_HELD');
  });

  it('a refused restore writes no faithful file and takes no snapshot of its own', () => {
    snapshot(HELD);
    caught(() => contentVersionService.restoreVersion(HELD, CH, MODULE, 1, { username: 'tester' }));
    expect(existsSync(faithfulPath(HELD))).toBe(false);
    expect(versionCount(HELD)).toBe(1);
  });
});

describe('getApplyStatus', () => {
  it('reports the hold reason for a held book', () => {
    armSelfHeal(HELD);
    expect(service.getApplyStatus(HELD, MODULE, CH).held).toMatch(/§C203/);
  });

  it('reports no hold for an unheld book', () => {
    armSelfHeal(FREE);
    expect(service.getApplyStatus(FREE, MODULE, CH).held).toBeNull();
  });
});

describe('routes', () => {
  const moduleReq = (book, extra = {}) => ({
    params: { book, chapter: '1', moduleId: MODULE, ...extra.params },
    chapterNum: CH,
    user: HEAD,
    body: extra.body || {},
  });

  it('control: the apply route applies in an unheld book', async () => {
    armSelfHeal(FREE);
    const out = await invoke(handlers.apply, moduleReq(FREE));
    expect(out.status).toBe(200);
  });

  it('the apply route answers 423 with the reason for a held book', async () => {
    armSelfHeal(HELD);
    const out = await invoke(handlers.apply, moduleReq(HELD));
    expect(out.status).toBe(423);
    expect(out.body).toEqual(
      expect.objectContaining({ held: true, error: expect.stringMatching(/§C203/) })
    );
  });

  it('apply-and-render answers 423 for a held book and starts no pipeline', async () => {
    armSelfHeal(HELD);
    const spy = vi.spyOn(pipelineService, 'runPipeline');
    const out = await invoke(handlers.applyRender, moduleReq(HELD));
    expect(out.status).toBe(423);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('the restore route answers 423 for a held book', async () => {
    snapshot(HELD);
    const out = await invoke(
      handlers.restore,
      moduleReq(HELD, { params: { version: '1' }, body: { confirm: true } })
    );
    expect(out.status).toBe(423);
  });

  it('completing a held book review reports the hold, not a retryable apply error', async () => {
    const conn = openDb();
    const rid = conn
      .prepare(
        `INSERT INTO module_reviews (book, chapter, module_id, submitted_by, submitted_by_username, edited_segments)
         VALUES (?, ?, ?, 'e1', 'editor-one', 1)`
      )
      .run(HELD, CH, MODULE).lastInsertRowid;
    conn
      .prepare(
        `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
           edited_content, status, editor_id, editor_username, review_id)
         VALUES (?, ?, ?, ?, 'IS a', 'IS a edited', 'approved', 'e1', 'editor-one', ?)`
      )
      .run(HELD, CH, MODULE, SEG_A, rid);
    conn.close();
    const out = await invoke(handlers.complete, {
      params: { reviewId: String(rid) },
      user: HEAD,
      body: {},
    });
    expect(out.status).toBe(200);
    expect(out.body.applied).toEqual(expect.objectContaining({ held: true, retryable: false }));
    expect(existsSync(faithfulPath(HELD))).toBe(false);
  });
});

describe('the my-work ready list', () => {
  it('leaves held books out and keeps unheld ones', () => {
    const conn = openDb();
    const ins = conn.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
         edited_content, status, editor_id, editor_username)
       VALUES (?, ?, ?, ?, 'a', 'b', 'approved', 'e1', 'editor-one')`
    );
    ins.run(HELD, CH, MODULE, SEG_A);
    ins.run(FREE, CH, MODULE, SEG_A);
    conn.close();
    const books = dashboard.getReadyToApply().map((r) => r.book);
    expect(books).toEqual([FREE]);
  });
});

describe('the segment editor apply panel (client source)', () => {
  const src = readFileSync(path.join(HERE, '..', 'public', 'js', 'segment-editor.js'), 'utf8');
  const fn = src.slice(
    src.indexOf('async function loadApplyStatus'),
    src.indexOf('async function applyEdits')
  );

  it('shows the hold and returns before any branch can enable a button', () => {
    const heldBranch = fn.indexOf('if (held)');
    const firstEnable = fn.indexOf('btnApply.disabled = false');
    expect(heldBranch).toBeGreaterThan(-1);
    expect(heldBranch).toBeLessThan(firstEnable);
    expect(fn.slice(heldBranch, firstEnable)).toMatch(
      /statusEl\.textContent = held;[\s\S]*return;/
    );
  });
});
