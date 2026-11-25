/**
 * POST /:book/:chapter/:moduleId/fable-comparison-opened (PR 2 Task 10; spec §6.9).
 *
 * Drives the route's whole middleware chain with real JWTs on a real migrated database over a
 * synthetic Fable-served unit under a temp books root; nothing under books/ is read or written.
 * The cases share one database and run in declaration order.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'fable-comparison-opened-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const researchConsent = require('../services/researchConsent');
const serverCommit = require('../lib/serverCommit');
const {
  writeModule,
  writeRaw,
  handlerFor,
  invoke,
  invokeChain,
} = require('./helpers/servedFixture');
const { plantAssignment } = require('./helpers/plantAssignment.cjs');
const { APPROVED, makeUser, consent, decline } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const M = 'm97701';
const ROUTE = '/:book/:chapter/:moduleId/fable-comparison-opened';
const A = `${M}:para:a`; // flagged, not in flight
const B = `${M}:para:b`; // not flagged
const C = `${M}:para:c`; // flagged, but in flight at the opening

let segmentParser;
let segmentEditor;
let realBooksDir;
let router;
let auth;
let db;
let get;
const users = {};

const asUser = (providerId, books = []) => ({
  id: providerId,
  username: providerId,
  role: 'editor',
  books,
});
const bearer = (user) => ({
  authorization: `Bearer ${auth.createToken({ ...user, name: user.username, avatar: '' })}`,
});
const post = (user, body, moduleId = M) =>
  invokeChain(router, 'post', ROUTE, {
    params: { book: CHEM, chapter: '1', moduleId },
    headers: user ? bearer(user) : {},
    cookies: {},
    body,
  });
const serve = (user) =>
  invoke(get, { params: { book: CHEM, chapter: '1', moduleId: M }, chapterNum: 1, user });

beforeAll(async () => {
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
  const root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  const pairs = (p) => [
    [A, `${p} a`],
    [B, `${p} b`],
    [C, `${p} c`],
  ];
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M,
    en: pairs('EN'),
    mt: pairs('MT'),
    fable: pairs('FABLE'),
  });
  const tag = (segmentId) =>
    JSON.stringify({ segmentId, occurrence: 0, tags: ['meaning'], before: `MT ${segmentId}` });
  writeRaw(root, `${CHEM}/02-mt-fable/ch01/${M}-tags.jsonl`, `${tag(A)}\n${tag(C)}\n`);

  router = require('../routes/segment-editor');
  auth = require('../services/auth');
  db = new Database(dbPath);
  for (const p of ['p-con', 'p-dec', 'p-wd', 'p-nobody']) users[p] = makeUser(p);
  consent(users['p-con']);
  decline(users['p-dec']);
  consent(users['p-wd']);
  for (const p of ['p-con', 'p-dec', 'p-wd'])
    plantAssignment(db, { userId: users[p], book: CHEM, chapter: 1 });
  // Human text in flight on C before the opening, so C's flag is withheld for good.
  db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
       editor_id, editor_username, created_at)
     VALUES (?, 1, ?, ?, 'IS', 'IS breytt', 'pending', 'p-dec', 'p-dec', '2026-06-16 10:00:00')`
  ).run(CHEM, M, C);
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  // The first assigned serve records the opening (and its in-flight snapshot).
  const opened = await serve(asUser('p-con'));
  expect(opened.status).toBe(200);
  expect(opened.body.segments.find((s) => s.segmentId === A).fableMeaning).toEqual({
    before: `MT ${A}`,
  });
  expect(opened.body.segments.find((s) => s.segmentId === C).fableMeaning).toBeNull();
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

describe('the Fable comparison being opened is recorded', () => {
  it('a consenting editor: 204 and one fable-comparison-opened row with segment, occurrence and served version', async () => {
    const mark = eventMark();
    const r = await post(asUser('p-con'), { segmentId: A, occurrence: 0 });
    expect(r.status).toBe(204);
    const events = eventsSince(mark);
    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.event_type).toBe('fable-comparison-opened');
    expect(e.segment_id).toBe(A);
    expect(Number(e.occurrence)).toBe(0);
    expect(e.editing_kind).toBeNull();
    expect(e.detail).toEqual({});
    const version = db
      .prepare(
        "SELECT id FROM served_text_versions WHERE module_id = ? AND segment_id = ? AND layer = 'fable'"
      )
      .get(M, A);
    expect(Number(e.served_version_id)).toBe(version.id);
  });

  it('a declining editor: 204 and no row', async () => {
    const mark = eventMark();
    const r = await post(asUser('p-dec'), { segmentId: A, occurrence: 0 });
    expect(r.status).toBe(204);
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('a withdrawn editor: 204 and no row (control: the same editor recorded before withdrawing)', async () => {
    const before = eventMark();
    expect((await post(asUser('p-wd'), { segmentId: A, occurrence: 0 })).status).toBe(204);
    expect(eventsSince(before)).toHaveLength(1);
    researchConsent.withdraw({ userId: users['p-wd'], nowMs: Date.now() });
    const mark = eventMark();
    expect((await post(asUser('p-wd'), { segmentId: A, occurrence: 0 })).status).toBe(204);
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('an unflagged segment: 400 NOT_FLAGGED and no row', async () => {
    const mark = eventMark();
    const r = await post(asUser('p-con'), { segmentId: B, occurrence: 0 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'NOT_FLAGGED' });
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('a flagged segment the opening snapshot suppresses: 400 NOT_FLAGGED and no row', async () => {
    const mark = eventMark();
    const r = await post(asUser('p-con'), { segmentId: C, occurrence: 0 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'NOT_FLAGGED' });
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('an unknown segment, a wrong occurrence and a malformed body: 400 and no row', async () => {
    const mark = eventMark();
    for (const body of [
      { segmentId: 'nope', occurrence: 0 },
      { segmentId: A, occurrence: 1 },
      { segmentId: A },
      { segmentId: A, occurrence: '0' },
      {},
    ]) {
      expect((await post(asUser('p-con'), body)).status).toBe(400);
    }
    expect(eventsSince(mark)).toHaveLength(0);
  });

  it('unauthenticated: the chain answers 401', async () => {
    expect((await post(null, { segmentId: A, occurrence: 0 })).status).toBe(401);
  });

  it("another book's editor, with no assignment here: the chain answers 403", async () => {
    const mark = eventMark();
    const r = await post(asUser('p-nobody', ['other-book']), { segmentId: A, occurrence: 0 });
    expect(r.status).toBe(403);
    expect(eventsSince(mark)).toHaveLength(0);
  });
});
