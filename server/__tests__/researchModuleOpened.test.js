/**
 * The module GET records module-opened after the opening's commit (G1.2 PR3 Task 26; spec §5.5, §5.9; index
 * decision 2; plan decisions 53, 55).
 *
 * Drives the real GET handler on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. The cases share one database and run in declaration order.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-module-opened-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const userService = require('../services/userService');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent, decline, losses } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const M1 = 'm97601';
const M2 = 'm97602';
const M3 = 'm97603';
const userOf = (p) => Object.freeze({ id: p, username: p, role: 'editor', books: [] });
const OP = userOf('p-op');
const DEC = userOf('p-dec');
const UN = userOf('p-un');

let segmentParser;
let segmentEditor;
let realBooksDir;
let get;
let db;

const segs = (m) => [
  [`${m}:para:a`, 'a'],
  [`${m}:para:b`, 'b'],
  [`${m}:para:d`, 'd'],
  [`${m}:para:d`, 'd'],
];

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
  const root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  for (const m of [M1, M2, M3]) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: m,
      en: segs(m).map(([s, t]) => [s, `EN ${t}`]),
      mt: segs(m).map(([s, t]) => [s, `IS ${t}`]),
    });
  }
  const opId = makeUser('p-op');
  const decId = makeUser('p-dec');
  makeUser('p-un');
  consent(opId);
  decline(decId);
  consent(userService.findByProviderId('p-un').id);
  userService.assignChapter(opId, CHEM, 1);
  userService.assignChapter(decId, CHEM, 1);
  db = new Database(dbPath);
  // A pending edit by p-dec before the opening, so the snapshot holds one segment.
  db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
       editor_id, editor_username, created_at)
     VALUES (?, 1, ?, ?, 'IS', 'IS breytt', 'pending', 'p-dec', 'p-dec', '2026-06-16 10:00:00')`
  ).run(CHEM, M1, `${M1}:para:a`);
  get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
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

const serve = (user, moduleId) =>
  invoke(get, { params: { book: CHEM, chapter: '1', moduleId }, chapterNum: 1, user });
const keyOf = (r) => `${r.segmentId ?? r.segment_id}#${r.occurrence}=${r.servedVersionId ?? r.id}`;
let firstBody;

describe('the opening records module-opened (spec §5.5, §5.9)', () => {
  it("the first assigned serve records one module-opened with the opening's served versions, duplicated ids and inflight count", async () => {
    const mark = eventMark();
    const r = await serve(OP, M1);
    firstBody = r.body;
    expect(r.status).toBe(200);
    const events = eventsSince(mark);
    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.event_type).toBe('module-opened');
    expect(e.segment_id).toBeNull();
    expect(e.served_version_id).toBeNull();
    expect(e.editing_kind).toBeNull();
    expect(e.content).toBeNull();
    expect(e.before).toBeNull();
    expect(e.detail.duplicatedIds).toEqual([`${M1}:para:d`]);
    expect(e.detail.inflightCount).toBe(1);
    const rows = db
      .prepare('SELECT segment_id, occurrence, id FROM served_text_versions WHERE module_id = ?')
      .all(M1);
    expect(new Set(e.detail.servedVersionIds.map(keyOf))).toEqual(new Set(rows.map(keyOf)));
  });

  it('a second serve, by anyone, records nothing', async () => {
    const mark = eventMark();
    await serve(OP, M1);
    await serve(DEC, M1);
    expect(eventsSince(mark)).toEqual([]);
  });

  it('an unassigned serve opens nothing and records nothing', async () => {
    const mark = eventMark();
    const r = await serve(UN, M2);
    expect(r.status).toBe(200);
    expect(db.prepare('SELECT * FROM module_openings WHERE module_id = ?').get(M2)).toBeUndefined();
    expect(eventsSince(mark)).toEqual([]);
  });

  it("a declining assigned editor's opening is recorded in sessions.db and nowhere else", async () => {
    const mark = eventMark();
    const before = losses();
    await serve(DEC, M3);
    expect(db.prepare('SELECT * FROM module_openings WHERE module_id = ?').get(M3)).toBeDefined();
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(before);
  });

  it('the response is the same with and without an opening (no field added)', async () => {
    const again = (await serve(OP, M1)).body;
    expect(Object.keys(firstBody).sort()).toEqual(Object.keys(again).sort());
  });
});
