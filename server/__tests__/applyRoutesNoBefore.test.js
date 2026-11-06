/**
 * No apply or restore response carries a before-image (G1.2; spec §5.9, §11; plan Task 17,
 * decision 44, Review Focus 24). applyApprovedEdits and restoreVersion return `before` for the
 * research event; the four routes that spread or send their result (apply, apply-and-render,
 * review completion, restore) strip it, so each response is key-for-key what it was.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir) over
 * synthetic modules under a temp books root; nothing under books/ or pipeline-output/ is written.
 * The book is not held, so no hold stub is needed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'apply-routes-no-before-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');

const BOOK = 'testbook';
const MODULES = { apply: 'm96811', render: 'm96812', review: 'm96813', restore: 'm96814' };
const IDS = ['a', 'b'];

const HEAD = { id: 'p-h', username: 'h', role: 'head-editor', books: [BOOK] };
const OWNER = { id: 'p-a', username: 'a', role: 'editor', books: [BOOK] };

const APPLY_KEYS = [
  'acceptedCount',
  'appliedCount',
  'lapsedAcceptances',
  'savedPath',
  'success',
  'supersededCount',
  'totalEditsMarked',
];

let segmentParser;
let segmentEditor;
let tmService;
let concordanceService;
let pipelineStatusService;
let pipelineService;
let realBooksDir;
let h;
const bodies = [];

const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  tmService = require('../services/tmService');
  concordanceService = require('../services/concordanceService');
  pipelineStatusService = require('../services/pipelineStatusService');
  pipelineService = require('../services/pipelineService');
  realBooksDir = segmentParser.BOOKS_DIR;
  const root = path.join(work, 'books');
  for (const M of Object.values(MODULES)) {
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: M,
      en: IDS.map((x) => [`${M}:para:${x}`, `EN ${x}`]),
      mt: IDS.map((x) => [`${M}:para:${x}`, `IS ${x}`]),
    });
  }
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  const router = require('../routes/segment-editor');
  const H = (method, p) => handlerFor(router, method, p);
  h = {
    apply: H('post', '/:book/:chapter/:moduleId/apply'),
    render: H('post', '/:book/:chapter/:moduleId/apply-and-render'),
    complete: H('post', '/reviews/:reviewId/complete'),
    restore: H('post', '/:book/:chapter/:moduleId/restore/:version'),
  };
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  vi.restoreAllMocks();
  // Decision 59: the post-apply hooks have their own timers and databases.
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
});

// The legacy service calls: no research event exists yet, so no consent is needed.
function save(M, x) {
  return segmentEditor.saveSegmentEdit({
    book: BOOK,
    chapter: 1,
    moduleId: M,
    segmentId: `${M}:para:${x}`,
    originalContent: `IS ${x}`,
    editedContent: `EDIT ${x}`,
    editorId: OWNER.id,
    editorUsername: OWNER.username,
  }).id;
}
const approve = (id) => segmentEditor.approveEdit(id, HEAD.id, HEAD.username);
function seedApproved(M) {
  for (const x of IDS) approve(save(M, x));
}

async function call(handler, req) {
  const r = await invoke(handler, req);
  bodies.push(r.body);
  return r;
}
const onModule = (M, extra = {}) => ({
  params: { book: BOOK, chapter: '1', moduleId: M, ...extra.params },
  chapterNum: 1,
  user: HEAD,
  body: extra.body || {},
});

describe('apply and restore routes send what they sent before, and nothing else', () => {
  it('apply', async () => {
    seedApproved(MODULES.apply);
    const r = await call(h.apply, onModule(MODULES.apply));
    expect(r.status).toBe(200);
    expect(r.body.appliedCount).toBe(2); // positive control: the apply ran
    expect(Object.keys(r.body).sort()).toEqual(APPLY_KEYS);
  });

  it('apply-and-render', async () => {
    vi.spyOn(pipelineService, 'hasRunningJob').mockReturnValue(null);
    vi.spyOn(pipelineService, 'hasCapacity').mockReturnValue(true);
    vi.spyOn(pipelineService, 'runPipeline').mockReturnValue({ jobId: 'job-1' });
    seedApproved(MODULES.render);
    const r = await call(h.render, onModule(MODULES.render));
    expect(r.status).toBe(200);
    expect(r.body.applied.appliedCount).toBe(2);
    expect(Object.keys(r.body).sort()).toEqual(['applied', 'jobId', 'message', 'success']);
    expect(Object.keys(r.body.applied).sort()).toEqual(APPLY_KEYS.filter((k) => k !== 'success'));
  });

  it('review-complete', async () => {
    const M = MODULES.review;
    for (const x of IDS) save(M, x);
    const review = segmentEditor.submitModuleForReview({
      book: BOOK,
      chapter: 1,
      moduleId: M,
      submittedBy: OWNER.id,
      submittedByUsername: OWNER.username,
    });
    expect(review.stampedEditIds).toHaveLength(IDS.length);
    for (const id of review.stampedEditIds) approve(id);
    const r = await call(h.complete, {
      params: { reviewId: String(review.id) },
      user: HEAD,
      body: {},
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('approved');
    expect(r.body.applied.appliedCount).toBe(2); // positive control: the auto-apply ran
    expect(Object.keys(r.body).sort()).toEqual([
      'allReviewed',
      'applied',
      'counts',
      'status',
      'success',
    ]);
    expect('before' in r.body.applied).toBe(false);
  });

  it('restore', async () => {
    seedApproved(MODULES.restore);
    segmentEditor.applyApprovedEdits(BOOK, 1, MODULES.restore); // version 1 = the MT text
    const r = await call(
      h.restore,
      onModule(MODULES.restore, { params: { version: '1' }, body: { confirm: true } })
    );
    expect(r.status).toBe(200);
    expect(r.body.segmentsRestored).toBe(2);
    expect(Object.keys(r.body).sort()).toEqual([
      'restoredVersion',
      'savedPath',
      'segmentsKept',
      'segmentsRestored',
      'segmentsSkipped',
      'snapshotVersion',
      'success',
    ]);
  });

  it('no response carries a research key, at any depth', () => {
    expect(keysDeep({ x: { before: 1 } })).toContain('before');
    expect(bodies).toHaveLength(4);
    const keys = new Set(bodies.flatMap(keysDeep));
    for (const k of [
      'before',
      'writes',
      'selfHealReset',
      'lapsedAcceptanceIds',
      'stampedAcceptanceIds',
    ]) {
      expect(keys.has(k)).toBe(false);
    }
  });
});
