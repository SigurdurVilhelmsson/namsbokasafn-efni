/**
 * Apply, apply-and-render, review completion and restore record their research events (G1.2 PR3 Task 24; spec
 * §5.9, §5.11; plan decisions 44, 48, 53, 56, 57, 59, 60; Review Focus 24, 34, 35, 39).
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. The post-apply hooks and the hold are stubbed (decisions 59 and 60); every stub is restored
 * after each case. The cases share one database and run in declaration order; each takes `eventMark()` before the
 * act it measures.
 */
import { mkdtempSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-apply-events-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const applyHold = require('../lib/applyHold');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince, researchBytes } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const M = 'm97401'; // apply, apply-and-render, restore
const M_REVIEW = 'm97402'; // review completion
const M_HELD = 'm97403'; // review completion under the hold
const M_ACT = 'm97404'; // a completion posted with a clientActionId
const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const id = (mod, x) => `${mod}:para:${x}`;

const APPLY_KEYS = [
  'acceptedCount',
  'appliedCount',
  'lapsedAcceptances',
  'savedPath',
  'success',
  'supersededCount',
  'totalEditsMarked',
];

const userOf = (p, role = 'editor') => Object.freeze({ id: p, username: p, role, books: [] });
const PA = userOf('p-a');
const PB = userOf('p-b');
const PH = userOf('p-h', 'admin');

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let segmentEditorService;
let tmService;
let concordance;
let pipelineStatusService;
let pipelineService;
let acceptanceService;
let db;
let h;

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot();
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  segmentEditorService = segmentEditor;
  tmService = require('../services/tmService');
  concordance = require('../services/concordanceService');
  pipelineStatusService = require('../services/pipelineStatusService');
  pipelineService = require('../services/pipelineService');
  acceptanceService = require('../services/acceptanceService');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const mod of [M, M_REVIEW, M_HELD, M_ACT]) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: mod,
      en: LETTERS.map((x) => [id(mod, x), `EN ${x}`]),
      mt: LETTERS.map((x) => [id(mod, x), `IS ${x}`]),
    });
  }
  for (const p of ['p-a', 'p-b', 'p-h']) consent(makeUser(p));
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    accept: handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept'),
    submit: handlerFor(router, 'post', '/:book/:chapter/:moduleId/submit'),
    approve: handlerFor(router, 'post', '/edit/:editId/approve'),
    apply: handlerFor(router, 'post', '/:book/:chapter/:moduleId/apply'),
    render: handlerFor(router, 'post', '/:book/:chapter/:moduleId/apply-and-render'),
    complete: handlerFor(router, 'post', '/reviews/:reviewId/complete'),
    restore: handlerFor(router, 'post', '/:book/:chapter/:moduleId/restore/:version'),
  };
  db = new Database(dbPath);
});

let holdStub;
beforeEach(() => {
  // Decisions 59 and 60: the post-apply hooks have their own timers and databases, and chemistry is held.
  vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
  vi.spyOn(concordance, 'indexModule').mockImplementation(() => {});
  vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
  holdStub = vi.spyOn(applyHold, 'assertFaithfulWritable').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  researchDb._reset();
  db.close();
  rmSync(work, { recursive: true, force: true });
});

const paramsOf = (mod) => ({ book: CHEM, chapter: '1', moduleId: mod });
const onModule = (mod, user, body = {}, params = {}) => ({
  params: { ...paramsOf(mod), ...params },
  chapterNum: 1,
  user,
  body,
});

/** A save as the page sends it: the served hash, and the row it displays. */
async function save(mod, user, x, text) {
  const page = (await invoke(h.get, onModule(mod, user))).body;
  const rows = page.edits[id(mod, x)];
  const shown = rows && rows.length ? rows[0] : null;
  const r = await invoke(
    h.save,
    onModule(mod, user, {
      segmentId: id(mod, x),
      editedContent: text,
      baseSha256: page.segments.find((s) => s.segmentId === id(mod, x)).baseSha256,
      ...(shown
        ? {
            baseEditId: shown.id,
            displayedEditId: shown.id,
            displayedEditSha256: shown.contentSha256,
          }
        : {}),
      clientActionId: `ap-${mod}-${x}-${text}`,
    })
  );
  expect(r.status).toBe(200);
  return r.body.editId;
}
const approve = async (editId, body = {}) => {
  const r = await invoke(h.approve, {
    params: { editId: String(editId) },
    user: PH,
    body,
  });
  expect(r.status).toBe(200);
};

/** A submitted review of two edits by p-a, every stamped edit approved; returns its id. */
async function approvedReview(mod) {
  await save(mod, PA, 'a', `${mod} edit a`);
  await save(mod, PA, 'b', `${mod} edit b`);
  const s = await invoke(h.submit, onModule(mod, PA));
  expect(s.status).toBe(200);
  const stamped = db
    .prepare('SELECT id FROM segment_edits WHERE review_id = ? ORDER BY id')
    .all(s.body.reviewId);
  expect(stamped).toHaveLength(2);
  for (const { id: editId } of stamped) await approve(editId);
  return s.body.reviewId;
}

const LOSER_NOTE = 'LOSER-REVIEWER-NOTE yfirlesara';
let A1;
let B1;
let B2;
let C;

describe('the apply routes record their research events (spec §5.9; decisions 48, 57)', () => {
  it("apply: winners and losers in the detail, losers' notes and texts filtered, the response unchanged", async () => {
    A1 = await save(M, PA, 'a', 'A1-TEXT');
    B1 = await save(M, PB, 'a', 'B1-TEXT');
    B2 = await save(M, PB, 'b', 'B2-TEXT');
    await approve(A1, { note: LOSER_NOTE }); // the reviewer's note the apply overwrites on the loser
    await approve(B1);
    await approve(B2);
    const acc = await invoke(
      h.accept,
      onModule(M, PA, {
        segmentId: id(M, 'c'),
        acceptedContent: 'IS c',
        clientActionId: 'ap-acc-c',
      })
    );
    expect(acc.status).toBe(200);
    C = acc.body.acceptance.id;

    const mark = eventMark();
    const r = await invoke(h.apply, onModule(M, PH));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(APPLY_KEYS);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'apply',
      segment_id: null,
      served_version_id: null,
      content_json: null,
      book: CHEM,
      chapter: 1n,
      module_id: M,
    });
    const note = segmentEditorService.SUPERSEDED_BY_NEWER_NOTE;
    expect(ev[0].detail).toEqual({
      trigger: 'apply',
      applied: [B1, B2],
      superseded: [A1],
      supersededReviewerNote: { length: [...note].length, sha256: sha256Text(note) },
      selfHealReset: { editIds: [], acceptanceIds: [] },
      lapsedAcceptanceIds: [],
      stampedAcceptanceIds: [C],
    });
    expect(ev[0].before).toHaveLength(1);
    expect(ev[0].before[0].table).toBe('segment_edits');
    expect(ev[0].before[0].row.id).toBe(A1);
    expect(ev[0].before[0].row.status).toBe('approved');
    expect(ev[0].before[0].row.edited_content_sha256).toBe(sha256Text('A1-TEXT'));
    expect('edited_content' in ev[0].before[0].row).toBe(false); // H is not the author
    // The before-image's purpose (spec §5.9): each loser's reviewer note as it was before the apply overwrote it,
    // as length and hash, never raw, and never the fixed note the apply wrote over it.
    const losers = ev[0].before.filter((b) => ev[0].detail.superseded.includes(b.row.id));
    expect(losers.map((b) => b.row.id)).toEqual([A1]);
    expect(db.prepare('SELECT reviewer_note FROM segment_edits WHERE id = ?').get(A1)).toEqual({
      reviewer_note: note,
    }); // the apply did overwrite it
    for (const b of losers) {
      expect(b.row.reviewer_note).toEqual({
        length: [...LOSER_NOTE].length,
        sha256: sha256Text(LOSER_NOTE),
      });
      expect(b.row.reviewer_note.sha256).not.toBe(sha256Text(note));
    }
    expect(researchBytes().includes('LOSER-REVIEWER-NOTE')).toBe(false);
  });

  it('apply with the self-heal names the rows it reset, and the acceptance it stamps again', async () => {
    unlinkSync(path.join(root, CHEM, '03-faithful-translation', 'ch01', `${M}-segments.is.md`));
    const mark = eventMark();
    const r = await invoke(h.apply, onModule(M, PH));
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.selfHealReset).toEqual({ editIds: [B1, B2], acceptanceIds: [C] });
    expect(ev[0].detail.applied).toEqual([B1, B2]);
    expect(ev[0].detail.stampedAcceptanceIds).toEqual([C]);
    const before = ev[0].before.map((b) => [b.table, b.row.id, b.row.applied]);
    expect(before).toEqual([
      ['segment_edits', B1, true],
      ['segment_edits', B2, true],
      ['segment_acceptances', C, true],
    ]);
  });

  it('apply-and-render records the apply before the pipeline starts, and the response is unchanged', async () => {
    vi.spyOn(pipelineService, 'hasRunningJob').mockReturnValue(null);
    vi.spyOn(pipelineService, 'hasCapacity').mockReturnValue(true);
    const run = vi.spyOn(pipelineService, 'runPipeline').mockImplementation(() => {
      throw new Error('pipeline refused to start');
    });
    await approve(await save(M, PA, 'd', 'D-TEXT'));
    const mark = eventMark();
    const bad = await invoke(h.render, onModule(M, PH));
    expect(bad.status).toBe(500);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('apply');
    expect(ev[0].detail.trigger).toBe('apply-and-render');

    run.mockReturnValue({ jobId: 'job-1' });
    run.mockImplementation(() => ({ jobId: 'job-1' }));
    await approve(await save(M, PA, 'e', 'E-TEXT'));
    const mark2 = eventMark();
    const r = await invoke(h.render, onModule(M, PH));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['applied', 'jobId', 'message', 'success']);
    expect(Object.keys(r.body.applied).sort()).toEqual(APPLY_KEYS.filter((k) => k !== 'success'));
    expect(eventsSince(mark2).map((e) => e.detail.trigger)).toEqual(['apply-and-render']);
  });

  it('review completion: two events, linked by reviewId; the response unchanged', async () => {
    const reviewId = await approvedReview(M_REVIEW);
    const mark = eventMark();
    const r = await invoke(h.complete, {
      params: { reviewId: String(reviewId) },
      user: PH,
      body: { notes: 'REVIEW-NOTES' },
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual([
      'allReviewed',
      'applied',
      'counts',
      'status',
      'success',
    ]);
    expect('before' in r.body.applied).toBe(false);
    const ev = eventsSince(mark).sort((x, y) => (x.key_seq < y.key_seq ? -1 : 1));
    expect(ev.map((e) => e.event_type)).toEqual(['review-complete', 'apply']);
    expect(ev[0].content).toEqual({
      note: { length: [...'REVIEW-NOTES'].length, sha256: sha256Text('REVIEW-NOTES') },
    });
    expect(ev[0].detail).toEqual({ reviewId, status: 'approved', apply: 'applied' });
    for (const e of ev) {
      expect([e.book, e.chapter, e.module_id]).toEqual([CHEM, 1n, M_REVIEW]);
    }
    expect(ev[1].detail.trigger).toBe('review-complete');
    expect(ev[1].detail.reviewId).toBe(reviewId);
  });

  it('review completion under the hold: apply held, one event only', async () => {
    const reviewId = await approvedReview(M_HELD);
    holdStub.mockRestore(); // the real hold: chemistry is held
    const mark = eventMark();
    const r = await invoke(h.complete, {
      params: { reviewId: String(reviewId) },
      user: PH,
      body: {},
    });
    expect(r.status).toBe(200);
    expect(r.body.applied.held).toBe(true);
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type)).toEqual(['review-complete']);
    expect(ev[0].detail.apply).toBe('held');
  });

  it('restore: the version in the content, the lapsed acceptances in the detail, the response unchanged', async () => {
    const lapse = vi.spyOn(acceptanceService, 'lapseDriftedIds');
    const mark = eventMark();
    const r = await invoke(h.restore, onModule(M, PH, { confirm: true }, { version: '1' }));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual([
      'restoredVersion',
      'savedPath',
      'segmentsKept',
      'segmentsRestored',
      'segmentsSkipped',
      'snapshotVersion',
      'success',
    ]);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'restore',
      segment_id: null,
      served_version_id: null,
    });
    expect(ev[0].content).toEqual({ version: 1 });
    expect(lapse).toHaveBeenCalledTimes(1);
    expect(ev[0].detail).toEqual({ lapsedAcceptanceIds: lapse.mock.results[0].value });
  });

  it('no multi-event request carries a clientActionId (decision 53)', async () => {
    const reviewId = await approvedReview(M_ACT);
    const mark = eventMark();
    const r = await invoke(h.complete, {
      params: { reviewId: String(reviewId) },
      user: PH,
      body: { notes: 'n', clientActionId: 'act-x' },
    });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type).sort()).toEqual(['apply', 'review-complete']);
    for (const e of ev) expect(e.client_action_id).toBeNull();
  });
});
