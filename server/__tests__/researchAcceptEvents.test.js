/**
 * The accept route records mt-accept and write-refused (G1.2 PR3 Task 22; spec §5.6, §5.9, §5.10; T5's event half
 * (accept), T18 route level, T20 route part; plan decisions 49 and 53; Review Focus 38, 43).
 *
 * Drives the real /accept handler on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/ is
 * read or written. The cases share one database and run in declaration order; each takes `eventMark()` before the
 * act it measures, and "one event" means `eventsSince(mark)` has length 1.
 */
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-accept-events-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent, decline, losses } = require('./helpers/researchFixture.cjs');
const {
  eventMark,
  eventsSince,
  itemsOf,
  researchBytes,
} = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const M = 'm97201';
const id = (x) => `${M}:para:${x}`;
const LETTERS = ['a', 'b', 'c', 'e', 'f', 'g', 'i', 'j', 'k'];
const EN = [
  ...LETTERS.map((x) => [id(x), `EN ${x}`]),
  [id('d'), 'EN d'],
  [id('d'), 'EN d'],
  [id('h'), 'EN h'], // in the EN file only: no translation
];
const MT = [...LETTERS.map((x) => [id(x), `IS ${x}`]), [id('d'), 'IS d'], [id('d'), 'IS d']];
const ACCEPT_KEYS = ['acceptance', 'alreadyAccepted', 'success'];

const userOf = (p) => Object.freeze({ id: p, username: p, role: 'editor', books: [] });
const ACC = userOf('p-acc');
const DACC = userOf('p-dacc');

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let router;
let accepter;
let db;
const isOverrides = {};

function writeM97201() {
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M,
    en: EN,
    mt: MT.map(([sid, text]) => [sid, isOverrides[sid] ?? text]),
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
  writeM97201();
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: 'm97202',
    en: [['m97202:para:a', 'EN a']],
  });
  writeModule(root, {
    book: ORGANIC,
    chapterDir: 'ch01',
    moduleId: 'm97204',
    en: [['m97204:para:x', 'EN x']],
    mt: [['m97204:para:x', 'IS x']],
  });
  consent(makeUser('p-acc'));
  decline(makeUser('p-dacc'));
  router = require('../routes/segment-editor');
  accepter = handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept');
  db = new Database(dbPath);
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

function accept(body, { book = CHEM, moduleId = M, user = ACC } = {}) {
  return invoke(accepter, { params: { book, chapter: '1', moduleId }, chapterNum: 1, user, body });
}

/** A pending legacy edit on segment x by another editor. @returns {number} the edit's id */
function seedEdit(x, editedContent = `IS ${x} breytt`, originalContent = `IS ${x}`) {
  return segmentEditor.saveSegmentEdit({
    book: CHEM,
    chapter: 1,
    moduleId: M,
    segmentId: id(x),
    originalContent,
    editedContent,
    editorId: 'u-other',
    editorUsername: 'other',
  }).id;
}

describe('the accept route records mt-accept (spec §5.9)', () => {
  it("an accept writes one mt-accept: the acceptance row, its served version, the accepted text's hash, acceptOrigin", async () => {
    const mark = eventMark();
    const r = await accept({
      segmentId: id('a'),
      acceptedContent: 'IS a',
      acceptOrigin: 'keyboard-stream',
      clientActionId: 'acc-1',
      clientActionTime: Date.now(),
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(ACCEPT_KEYS);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'mt-accept',
      editing_kind: 'segment_acceptance',
      editing_id: BigInt(r.body.acceptance.id),
      served_version_id: BigInt(r.body.acceptance.served_version_id),
      occurrence: 0n,
      editing_content_sha256: sha256Text('IS a'),
      origin: null,
      content: null,
      before: null,
      client_action_id: 'acc-1',
      replayed: 0n,
    });
    expect(ev[0].detail).toEqual({ acceptOrigin: 'keyboard-stream' });
    expect(itemsOf(ev[0].id)).toEqual([]);
    expect(eventsSince(mark).map((e) => e.event_type)).toEqual(['mt-accept']);
  });

  it('an unknown acceptOrigin is null in the event and the accept is unchanged', async () => {
    const mark = eventMark();
    const r = await accept({ segmentId: id('b'), acceptedContent: 'IS b', acceptOrigin: 'mouse' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(ACCEPT_KEYS);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail).toEqual({ acceptOrigin: null });
  });

  it('alreadyAccepted writes nothing', async () => {
    const mark = eventMark();
    const r = await accept({ segmentId: id('a'), acceptedContent: 'IS a' });
    expect(r.status).toBe(200);
    expect(r.body.alreadyAccepted).toBe(true);
    expect(eventsSince(mark)).toEqual([]);
  });
});

describe('T5, event half (accept) and the other refusals', () => {
  it('a duplicated id writes one write-refused', async () => {
    const mark = eventMark();
    const r = await accept({ segmentId: id('d'), acceptedContent: 'IS d' });
    expect(r.status).toBe(409);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('write-refused');
    expect(ev[0].origin).toBeNull();
    expect(ev[0].detail).toEqual({
      reason: 'DUPLICATE_ID',
      echoedSha256: null,
      currentSha256: null,
      action: 'accept',
    });
    const c = await accept({ segmentId: id('c'), acceptedContent: 'IS c' }); // control
    expect(c.status).toBe(200);
    expect(eventsSince(mark).map((e) => e.event_type)).toEqual(['write-refused', 'mt-accept']);
  });

  it('the value check (STALE_CONTENT) writes one write-refused with both hashes', async () => {
    isOverrides[id('e')] = 'IS e2';
    writeM97201();
    const mark = eventMark();
    const r = await accept({ segmentId: id('e'), acceptedContent: 'IS e' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('STALE_CONTENT');
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail).toEqual({
      reason: 'STALE_CONTENT',
      echoedSha256: sha256Text('IS e'),
      currentSha256: sha256Text('IS e2'),
      action: 'accept',
    });
  });

  it('NO_LAYER writes one write-refused', async () => {
    const mark = eventMark();
    const r = await accept(
      { segmentId: 'm97202:para:a', acceptedContent: 'EN a' },
      { moduleId: 'm97202' }
    );
    expect(r.status).toBe(409);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.reason).toBe('NO_LAYER');
  });
});

describe('the eligibility refusals each write one write-refused, with no hash and no text (decision 49)', () => {
  async function refusedCase(x, body, status, code, clientActionId) {
    const mark = eventMark();
    const r = await accept({ segmentId: id(x), clientActionId, ...body });
    expect(r.status).toBe(status);
    expect(r.body.error).toBe(code);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'write-refused',
      origin: null,
      served_version_id: null,
      content: null,
      segment_id: id(x),
      client_action_id: clientActionId,
    });
    expect(ev[0].detail).toEqual({
      reason: code,
      echoedSha256: null,
      currentSha256: null,
      action: 'accept',
    });
  }

  it('NO_TRANSLATION', async () => {
    await refusedCase('h', { acceptedContent: 'SENTINEL-ACCEPT-1' }, 400, 'NO_TRANSLATION', 'el-1');
    expect(researchBytes().includes('SENTINEL-ACCEPT-1')).toBe(false);
  });

  it('EDIT_EXISTS', async () => {
    seedEdit('f');
    await refusedCase('f', { acceptedContent: 'IS f' }, 409, 'EDIT_EXISTS', 'el-2');
  });

  it('DISCUSS_OPEN', async () => {
    const editId = seedEdit('i');
    db.prepare("UPDATE segment_edits SET status = 'discuss' WHERE id = ?").run(editId);
    await refusedCase('i', { acceptedContent: 'IS i' }, 409, 'DISCUSS_OPEN', 'el-3');
  });

  it('HUMAN_CONTENT', async () => {
    const editId = seedEdit('j', 'IS j', 'gamalt');
    db.prepare(
      "UPDATE segment_edits SET status = 'approved', applied_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(editId);
    await refusedCase('j', { acceptedContent: 'IS j' }, 409, 'HUMAN_CONTENT', 'el-4');
  });
});

describe('gates and pins', () => {
  it("a decliner's refused accept writes nothing and counts nothing (the gate is inside record)", async () => {
    seedEdit('k');
    const before = losses();
    const mark = eventMark();
    const r = await accept({ segmentId: id('k'), acceptedContent: 'IS k' }, { user: DACC });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('EDIT_EXISTS');
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(before);
  });

  it('the eligibility list is the codes acceptanceService throws, each one classified', () => {
    const E = require('../services/researchEmission');
    const src = readFileSync(path.join(__dirname, '../services/acceptanceService.js'), 'utf8');
    const codes = [
      ...new Set([...src.matchAll(/codedError\(\s*'([A-Z_]+)'/g)].map((m) => m[1])),
    ].sort();
    expect(codes).toEqual(
      [...E.ACCEPT_ELIGIBILITY_REFUSALS, 'FORBIDDEN', 'SEGMENT_NOT_FOUND', 'STALE_CONTENT'].sort()
    );
    expect(codes).toContain('EDIT_EXISTS');
  });

  it('T18, route level: an organic accept records and counts nothing', async () => {
    const before = losses();
    const mark = eventMark();
    const r = await accept(
      { segmentId: 'm97204:para:x', acceptedContent: 'IS x' },
      { book: ORGANIC, moduleId: 'm97204' }
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('BOOK_NOT_MINTED');
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(before);
  });

  it('T20, route part: a replayed accept carries replayed 1 and its client time', async () => {
    const t = Date.now();
    const mark = eventMark();
    const r = await accept({
      segmentId: id('g'),
      acceptedContent: 'IS g',
      replayed: true,
      clientActionTime: t,
      clientActionId: 'acc-r',
    });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].replayed).toBe(1n);
    expect(ev[0].client_action_time_ms).toBe(BigInt(t));
  });
});
