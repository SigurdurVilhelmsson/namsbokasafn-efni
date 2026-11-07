/**
 * T10, T12 and T8 through the real routes (G1.2 PR3 Task 27; spec §10; plan decision 62; index Review Focus 7):
 * the research file down, locked or half-gone never touches the editor. An opening, a save and a reject answer
 * 2xx and leave the editing tables as they would without it; the loss ledger grows by exactly one row per lost
 * event; a decliner's and an undecided editor's act leaves no loss at all.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root: nothing under books/ or pipeline-output/
 * is read or written. The cases share one database and run in declaration order; the research file's state at
 * the start of a case is named in its title. Every writing call carries a fresh clientActionId.
 */
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-route-capture-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const logger = require('../lib/logger');
const userService = require('../services/userService');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const {
  APPROVED,
  makeUser,
  consent,
  decline,
  losses,
  readResearch,
} = require('./helpers/researchFixture.cjs');
const { allEvents, eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const MODS = ['m97001', 'm97002', 'm97003'];
const id = (m, x) => `${m}:para:${x}`;
const SEGS = ['a', 'b'];

const userOf = (p, role = 'editor') => Object.freeze({ id: p, username: p, role, books: [] });
const E = userOf('p-e');
const H = userOf('p-h', 'head-editor');
const D = userOf('p-d');
const U = userOf('p-u');

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let get;
let edit;
let reject;
let db;
let IE;
let IH;
let researchPath;
let golden;
let controlSaveKeys;

/** Every loss as `interval|event|class|module`, sorted. */
const lossSet = () =>
  losses()
    .map((l) => `${l.interval_id}|${l.event_type}|${l.error_class}|${l.module_id}`)
    .sort();
const sorted = (xs) => [...xs].sort();
const added = (before) => lossSet().filter((l) => !before.includes(l));

beforeAll(() => {
  // The file-down warnings and the loss errors are expected here.
  vi.spyOn(logger, 'warn').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
  runAllMigrations();
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
  for (const m of MODS) {
    writeModule(root, {
      book: CHEM,
      chapterDir: 'ch01',
      moduleId: m,
      en: SEGS.map((x) => [id(m, x), `EN ${x}`]),
      mt: SEGS.map((x) => [id(m, x), `IS ${x}`]),
    });
  }
  const e = makeUser('p-e');
  const h = makeUser('p-h', 'head-editor');
  makeUser('p-d');
  makeUser('p-u');
  userService.assignChapter(e, CHEM, 1);
  decline(userService.findByProviderId('p-d').id);
  // No consenting row exists yet, so the boot creates the file; a checkpoint puts the schema in the main file.
  researchDb.openAtBoot();
  IE = consent(e);
  IH = consent(h);
  researchPath = resolveResearchDbPath().researchPath;
  researchDb.getHandle().pragma('wal_checkpoint(TRUNCATE)');
  golden = path.join(work, 'research.golden');
  copyFileSync(researchPath, golden);
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  edit = handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit');
  reject = handlerFor(router, 'post', '/edit/:editId/reject');
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

const params = (m) => ({ book: CHEM, chapter: '1', moduleId: m });
const serve = (user, m) => invoke(get, { params: params(m), chapterNum: 1, user });
const post = (user, m, body) => invoke(edit, { params: params(m), chapterNum: 1, user, body });
const rejectEdit = (user, editId) =>
  invoke(reject, { params: { editId: String(editId) }, user, body: {} });

let actSeq = 0;
const act = () => `rc-act-${++actSeq}`;

/** The file gone: no handle, and none of its three files left. */
function removeResearchFile() {
  researchDb._reset();
  for (const p of [researchPath, `${researchPath}-wal`, `${researchPath}-shm`]) {
    rmSync(p, { force: true });
  }
}
/** The golden file back, with no stale WAL or shm; the handle opens lazily on the next write. */
function restoreGolden() {
  removeResearchFile();
  copyFileSync(golden, researchPath);
}

/** What `user`'s page shows for segment x of module m: the served hash and the row it displays. */
async function view(user, m, x) {
  const page = (await serve(user, m)).body;
  const rows = page.edits[id(m, x)];
  return {
    baseSha256: page.segments.find((s) => s.segmentId === id(m, x)).baseSha256,
    row: rows && rows.length ? rows[0] : null,
  };
}
const bodyFor = (m, x, text, v) => ({
  segmentId: id(m, x),
  editedContent: text,
  baseSha256: v.baseSha256,
  ...(v.row
    ? { baseEditId: v.row.id, displayedEditId: v.row.id, displayedEditSha256: v.row.contentSha256 }
    : {}),
  clientActionId: act(),
});
/** A save as the page sends it, from a fresh serve. */
async function saveShowing(user, m, x, text) {
  return post(user, m, bodyFor(m, x, text, await view(user, m, x)));
}

const keyOf = (interval) => {
  const r = readResearch();
  try {
    return r.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(interval)
      .editor_key;
  } finally {
    r.close();
  }
};
const savedRow = (editId) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(editId);
const openingRow = (m) => db.prepare('SELECT * FROM module_openings WHERE module_id = ?').get(m);

describe('T10 and T12 through the routes: the research file never touches the editor', () => {
  it('control: with the file up, the three acts write events and no loss', async () => {
    const r = await serve(E, 'm97001'); // the opening
    expect(r.status).toBe(200);
    const saved = await saveShowing(E, 'm97001', 'a', 'Control texti');
    expect(saved.status).toBe(200);
    controlSaveKeys = Object.keys(saved.body).sort();
    expect((await rejectEdit(H, saved.body.editId)).status).toBe(200);
    const byKey = {};
    for (const ev of allEvents()) (byKey[ev.editor_key] ||= []).push(ev.event_type);
    expect(byKey).toEqual({
      [keyOf(IE)]: ['module-opened', 'edit-save'],
      [keyOf(IH)]: ['edit-reject'],
    });
    expect(lossSet()).toEqual([]);
  });

  it('T10: the module JSON is byte-identical with and without the research file', async () => {
    const before = JSON.stringify((await serve(E, 'm97001')).body);
    removeResearchFile();
    const after = JSON.stringify((await serve(E, 'm97001')).body);
    expect(after).toBe(before);
  });

  it('T10: with the file down, an opening, a save and a reject succeed and each leaves exactly one loss', async () => {
    const opened = await serve(E, 'm97002');
    expect(opened.status).toBe(200);
    expect(openingRow('m97002')).toBeDefined();
    const saved = await saveShowing(E, 'm97002', 'a', 'Niðri texti');
    expect(saved.status).toBe(200);
    expect(savedRow(saved.body.editId)).toBeDefined();
    const rejected = await rejectEdit(H, saved.body.editId);
    expect(rejected.status).toBe(200);
    expect(savedRow(saved.body.editId).status).toBe('rejected');
    expect(lossSet()).toEqual(
      sorted([
        `${IE}|edit-save|unavailable|m97002`,
        `${IE}|module-opened|unavailable|m97002`,
        `${IH}|edit-reject|unavailable|m97002`,
      ])
    );
    expect(existsSync(researchPath)).toBe(false); // never recreated
  });

  it("T8, file down: a decliner's and an undecided editor's saves leave no loss row (index Review Focus 7)", async () => {
    const hashB1 = (await view(E, 'm97001', 'b')).baseSha256;
    const hashB2 = (await view(E, 'm97002', 'b')).baseSha256;
    const before = lossSet();
    expect(before).toContain(`${IE}|edit-save|unavailable|m97002`); // control: a consenting save left its loss
    const d = await post(D, 'm97002', {
      segmentId: id('m97002', 'b'),
      editedContent: 'Afþakkað',
      baseSha256: hashB2,
      clientActionId: act(),
    });
    const u = await post(U, 'm97001', {
      segmentId: id('m97001', 'b'),
      editedContent: 'Óákveðið',
      baseSha256: hashB1,
      clientActionId: act(),
    });
    expect([d.status, u.status]).toEqual([200, 200]);
    expect(savedRow(d.body.editId).editor_id).toBe('p-d');
    expect(savedRow(u.body.editId).editor_id).toBe('p-u');
    expect(lossSet()).toEqual(before);
  });

  it('T10: a held lock answers 2xx within the timeout plus a margin, with one busy loss', async () => {
    restoreGolden();
    const before = lossSet();
    const holder = new Database(researchPath);
    holder.exec('BEGIN EXCLUSIVE'); // held from here, so the act starts only once the lock is confirmed
    try {
      const t0 = performance.now();
      const page = await serve(E, 'm97003'); // the opening: module-opened loses
      const v = page.body.segments.find((s) => s.segmentId === id('m97003', 'b'));
      const saved = await post(E, 'm97003', {
        segmentId: id('m97003', 'b'),
        editedContent: 'Læst texti',
        baseSha256: v.baseSha256,
        clientActionId: act(),
      });
      const elapsed = performance.now() - t0;
      expect([page.status, saved.status]).toEqual([200, 200]);
      expect(elapsed).toBeLessThan(researchDb.BUSY_TIMEOUT_MS * 2 + 1500);
      expect(added(before)).toEqual(
        sorted([`${IE}|edit-save|busy|m97003`, `${IE}|module-opened|busy|m97003`])
      );
    } finally {
      holder.exec('ROLLBACK');
      holder.close();
    }
  });

  it('T12: the research row is readable from a second connection when the response returns, timers frozen', async () => {
    restoreGolden();
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'setImmediate'] });
    try {
      const r = await saveShowing(E, 'm97001', 'a', 'T12 texti');
      expect(r.status).toBe(200);
      const reader = readResearch();
      try {
        const row = reader
          .prepare(
            "SELECT content_json FROM research_events WHERE editing_id = ? AND event_type IN ('edit-save', 'edit-resave')"
          )
          .get(BigInt(r.body.editId));
        expect(JSON.parse(row.content_json).text).toBe('T12 texti');
      } finally {
        reader.close();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("T8: with research_consent dropped, a consenting editor's save answers 200 and leaves one consent-unknown loss", async () => {
    await serve(E, 'm97003'); // already opened: no module-opened
    const hashA = (await view(E, 'm97003', 'a')).baseSha256;
    let mark;
    let before;
    let r;
    db.exec('ALTER TABLE research_consent RENAME TO rc_hidden');
    try {
      mark = eventMark();
      before = lossSet();
      r = await post(E, 'm97003', {
        segmentId: id('m97003', 'a'),
        editedContent: 'CU texti',
        baseSha256: hashA,
        clientActionId: act(),
      });
    } finally {
      db.exec('ALTER TABLE rc_hidden RENAME TO research_consent');
    }
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(controlSaveKeys);
    expect(savedRow(r.body.editId).edited_content).toBe('CU texti');
    expect(added(before)).toEqual(['null|edit-save|consent-unknown|m97003']);
    expect(eventsSince(mark)).toEqual([]);
    // Positive control: with the table back, the same editor's re-save is recorded and loses nothing.
    const lossesNow = lossSet();
    const again = await saveShowing(E, 'm97003', 'a', 'CU texti 2');
    expect(again.status).toBe(200);
    expect(again.body.editId).toBe(r.body.editId);
    const ev = eventsSince(mark);
    expect(ev.map((e) => [e.event_type, e.editing_id])).toEqual([
      ['edit-resave', BigInt(r.body.editId)],
    ]);
    expect(lossSet()).toEqual(lossesNow);
  });
});
