/**
 * "Merkja sem lokið" on the server (register §C222; design
 * docs/superpowers/specs/2026-11-17-c222-unit-done-signal-design.md).
 *
 * A press is a recorded moment, never a status: every press succeeds, writes an activity-log row of type
 * `module_marked_done` before the response, and, for a consenting editor in a study book, the research event
 * `module-submit` with the unit's open edit ids. No `module_reviews` row is created, which is what made the old
 * "Senda til yfirlestrar" work once per unit (ED-07). The module GET carries the reader's own latest press.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. Each case uses its own module, so no case reads another's rows.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'unit-done-route-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const auth = require('../services/auth');
const activityLog = require('../services/activityLog');
const { writeModule, handlerFor, invoke, invokeChain } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const DONE = '/:book/:chapter/:moduleId/done';
const TYPE = 'module_marked_done';

const A = Object.freeze({ id: 'p-a', username: 'p-a', role: 'editor', books: [] }); // consents
const B = Object.freeze({ id: 'p-b', username: 'p-b', role: 'editor', books: [] }); // no consent
const N = Object.freeze({ id: 'p-n', username: 'p-n', role: 'editor', books: [] }); // no consent
const H = Object.freeze({ id: 'p-h', username: 'p-h', role: 'admin', books: [] });

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let router;
let db;
let h;

/** A module with EN and MT segments `a`..`f` in `chapterDir`. */
function addModule(moduleId, chapterDir = 'ch01') {
  const ids =
    moduleId === 'chapter-metadata'
      ? [`chapter:title:${chapterDir}`]
      : ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `${moduleId}:para:${x}`);
  writeModule(root, {
    book: CHEM,
    chapterDir,
    moduleId,
    en: ids.map((id, i) => [id, `English ${i}.`]),
    mt: ids.map((id, i) => [id, `Íslenska ${i}.`]),
  });
}

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
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const m of [
    'm97302',
    'm97303',
    'm97304',
    'm97306',
    'm97307',
    'm97308',
    'm97309',
    'm97310',
    'm97311',
  ]) {
    addModule(m);
  }
  addModule('m97305', 'appendices');
  addModule('chapter-metadata', 'ch01');
  addModule('chapter-metadata', 'ch02');
  consent(makeUser('p-a'));
  makeUser('p-b');
  makeUser('p-n');
  router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    done: handlerFor(router, 'post', DONE),
  };
  db = new Database(dbPath);
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
  if (db) db.close();
  rmSync(work, { recursive: true, force: true });
});

const params = (moduleId, chapter = '1') => ({ book: CHEM, chapter, moduleId });
const chapterNumOf = (chapter) => (chapter === 'appendices' ? -1 : Number(chapter));
const press = (user, moduleId, chapter = '1') =>
  invoke(h.done, {
    params: params(moduleId, chapter),
    chapterNum: chapterNumOf(chapter),
    user,
    body: {},
  });
const page = async (user, moduleId, chapter = '1') =>
  (
    await invoke(h.get, {
      params: params(moduleId, chapter),
      chapterNum: chapterNumOf(chapter),
      user,
    })
  ).body;
const pressRows = (userId) =>
  db
    .prepare('SELECT * FROM activity_log WHERE type = ? AND user_id = ? ORDER BY id')
    .all(TYPE, userId);
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

/** An edit row planted directly, for statuses a save cannot reach. Returns its id. */
function plant({ moduleId, chapter = 1, seg, editor, status, appliedAt = null }) {
  return Number(
    db
      .prepare(
        `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
           edited_content, status, editor_id, editor_username, applied_at)
         VALUES (?, ?, ?, ?, 'Íslenska.', ?, ?, ?, ?, ?)`
      )
      .run(CHEM, chapter, moduleId, seg, `breytt ${seg}`, status, editor, editor, appliedAt)
      .lastInsertRowid
  );
}

describe('POST /done: a press is a recorded moment', () => {
  it('a second press succeeds (ED-07)', async () => {
    const r1 = await press(A, 'm97304');
    const r2 = await press(A, 'm97304');
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(Object.keys(r2.body).sort()).toEqual(['doneAt', 'success']);
    expect(r2.body.success).toBe(true);
    expect(r2.body.doneAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('a press with no open edits answers 200 and records openEditIds: []', async () => {
    const mark = eventMark();
    const r = await press(A, 'm97303');
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail).toEqual({ openEditIds: [] });
  });

  it('creates no module_reviews row and stamps no review_id', async () => {
    plant({ moduleId: 'm97306', seg: 'm97306:para:a', editor: 'p-a', status: 'pending' });
    const reviewsBefore = count('SELECT COUNT(*) n FROM module_reviews');
    const r = await press(A, 'm97306');
    expect(r.status).toBe(200);
    expect(count('SELECT COUNT(*) n FROM module_reviews')).toBe(reviewsBefore);
    expect(count('SELECT COUNT(*) n FROM segment_edits WHERE review_id IS NOT NULL')).toBe(0);
  });

  it('module-submit for a consenting editor carries exactly the open set, any editor', async () => {
    const m = 'm97302';
    const pendingA = plant({ moduleId: m, seg: `${m}:para:a`, editor: 'p-a', status: 'pending' });
    const discussB = plant({ moduleId: m, seg: `${m}:para:b`, editor: 'p-b', status: 'discuss' });
    const approvedUnappliedB = plant({
      moduleId: m,
      seg: `${m}:para:c`,
      editor: 'p-b',
      status: 'approved',
    });
    plant({
      moduleId: m,
      seg: `${m}:para:d`,
      editor: 'p-a',
      status: 'approved',
      appliedAt: '2026-11-01 10:00:00',
    });
    plant({ moduleId: m, seg: `${m}:para:e`, editor: 'p-b', status: 'rejected' });
    plant({ moduleId: m, seg: `${m}:para:f`, editor: 'p-a', status: 'superseded' });
    const mark = eventMark();
    const r = await press(A, m);
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'module-submit',
      segment_id: null,
      served_version_id: null,
    });
    expect(ev[0].detail).toEqual({ openEditIds: [pendingA, discussB, approvedUnappliedB] });
  });

  it('a non-consenting editor: the activity row is written, no research event', async () => {
    const mark = eventMark();
    const r = await press(N, 'm97307');
    expect(r.status).toBe(200);
    expect(pressRows('p-n')).toHaveLength(1);
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('a failed activity write answers 500 DONE_NOT_RECORDED and records no event', async () => {
    vi.spyOn(activityLog, 'log').mockReturnValueOnce(null);
    const mark = eventMark();
    const r = await press(A, 'm97308');
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('DONE_NOT_RECORDED');
    expect(eventsSince(mark)).toHaveLength(0);
  });

  // Final review, Important 1: the read-back runs after the press is recorded, so its failure must not turn a
  // recorded press into "not recorded" (the editor would retry and record it twice).
  it('a failed read-back after a recorded press still answers success, and the press is recorded once', async () => {
    const before = pressRows('p-a').length;
    vi.spyOn(activityLog, 'latestOfTypeByUser').mockImplementation(() => {
      throw new Error('read failed');
    });
    const mark = eventMark();
    const r = await press(A, 'm97311');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, doneAt: null });
    expect(pressRows('p-a')).toHaveLength(before + 1);
    expect(eventsSince(mark)).toHaveLength(1);
  });

  // Final review, Important 2: the module GET did not depend on the activity log before §C222.
  it('the module GET still opens the unit when the trace cannot be read', async () => {
    vi.spyOn(activityLog, 'latestOfTypeByUser').mockImplementation(() => {
      throw new Error('read failed');
    });
    const r = await invoke(h.get, { params: params('m97311'), chapterNum: 1, user: A });
    expect(r.status).toBe(200);
    expect(r.body.myLastDoneAt).toBeNull();
    expect(r.body.segments.length).toBeGreaterThan(0);
  });

  it('the activity description is the approved string', async () => {
    await press(A, 'm97309');
    const row = pressRows('p-a').at(-1);
    expect(row.description).toBe('p-a merkti m97309 sem lokið');
    expect(row).toMatchObject({ book: CHEM, chapter: '1', section: 'm97309' });
  });

  it('the /submit route is gone', () => {
    expect(
      router.stack.some((l) => l.route && l.route.path === '/:book/:chapter/:moduleId/submit')
    ).toBe(false);
  });
});

describe("the module GET carries the reader's own latest press", () => {
  it("shows only the reader's own press", async () => {
    const m = 'm97310';
    const b = await press(B, m);
    expect((await page(A, m)).myLastDoneAt).toBeNull();
    const a = await press(A, m);
    expect((await page(A, m)).myLastDoneAt).toBe(a.body.doneAt);
    expect((await page(B, m)).myLastDoneAt).toBe(b.body.doneAt);
  });

  // Review Focus 1: E2E and Microsoft tokens give req.user.id as a number; the row stores String(id).
  it('numeric user id: the trace finds the press', async () => {
    const num = { id: 88001, username: 'num', role: 'editor', books: [] };
    const r = await press(num, 'm97304');
    expect(r.status).toBe(200);
    expect((await page(num, 'm97304')).myLastDoneAt).toBe(r.body.doneAt);
  });

  // Review Focus 2: appendices are chapter -1; write and read must agree on its string.
  it("appendices: a press shows in the unit's trace", async () => {
    const r = await press(A, 'm97305', 'appendices');
    expect(r.status).toBe(200);
    expect(r.body.doneAt).not.toBeNull();
    expect((await page(A, 'm97305', 'appendices')).myLastDoneAt).toBe(r.body.doneAt);
  });

  // Review Focus 3: chapter-metadata is one module id in every chapter (§C209).
  it('chapter-metadata: a press is held to its chapter', async () => {
    const ch2Edit = plant({
      moduleId: 'chapter-metadata',
      chapter: 2,
      seg: 'chapter:title:ch02',
      editor: 'p-a',
      status: 'pending',
    });
    const ch1Edit = plant({
      moduleId: 'chapter-metadata',
      chapter: 1,
      seg: 'chapter:title:ch01',
      editor: 'p-a',
      status: 'pending',
    });
    const mark = eventMark();
    const r = await press(A, 'chapter-metadata', '1');
    expect(r.status).toBe(200);
    expect(eventsSince(mark)[0].detail).toEqual({ openEditIds: [ch1Edit] });
    expect(eventsSince(mark)[0].detail.openEditIds).not.toContain(ch2Edit);
    expect((await page(A, 'chapter-metadata', '1')).myLastDoneAt).toBe(r.body.doneAt);
    expect((await page(A, 'chapter-metadata', '2')).myLastDoneAt).toBeNull();
  });

  // Review Focus 4: created_at has one-second resolution; the latest press is the latest row.
  it('two presses in one second: both recorded, trace is the later row', async () => {
    const before = pressRows('p-h').length;
    const [r1, r2] = [await press(H, 'm97303'), await press(H, 'm97303')];
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(pressRows('p-h')).toHaveLength(before + 2);
    // Insertion order decides, not the timestamp: a later row with an earlier clock reading still wins.
    const ins = db.prepare(
      `INSERT INTO activity_log (type, user_id, username, book, chapter, section, description, metadata, created_at)
       VALUES (?, 'p-h', 'p-h', ?, '1', 'm97303', 'x', '{}', ?)`
    );
    ins.run(TYPE, CHEM, '2099-01-01 00:00:05');
    ins.run(TYPE, CHEM, '2099-01-01 00:00:04');
    expect((await page(H, 'm97303')).myLastDoneAt).toBe('2099-01-01 00:00:04');
  });
});

// Review Focus 5: a viewer (a visit's session) is refused by the route's own middleware.
describe('access', () => {
  const bearer = (user) => ({
    authorization: `Bearer ${auth.createToken({ ...user, name: user.username, avatar: '' })}`,
  });

  it('a viewer is refused and nothing is written', async () => {
    const viewer = {
      id: 'ms-oid-visitor',
      username: 'gestur@skoli.example',
      role: 'viewer',
      books: [],
    };
    const mark = eventMark();
    const r = await invokeChain(router, 'post', DONE, {
      params: params('m97307'),
      headers: bearer(viewer),
      cookies: {},
      body: {},
    });
    expect(r.status).toBe(403);
    expect(pressRows('ms-oid-visitor')).toHaveLength(0);
    expect(eventsSince(mark)).toHaveLength(0);
    // positive control: the same chain with an admin's token records the press
    const ok = await invokeChain(router, 'post', DONE, {
      params: params('m97307'),
      headers: bearer(H),
      cookies: {},
      body: {},
    });
    expect(ok.status).toBe(200);
  });
});
