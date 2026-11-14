/**
 * POST /:book/:chapter/:moduleId/edit requires the served base hash (G1.1; spec §5.6, §5.18,
 * §13a; T3's relabel save, T4's and T18's route halves; plan Task 14, decisions 14, 15, 20, 39).
 *
 * Drives the real GET and POST handlers on a real migrated database (SESSIONS_DB_PATH in a temp
 * dir, so the foreign key from segment_edits.served_version_id is live) over synthetic modules
 * under a temp books root: nothing under books/ is read or written, and the first-edit MT lock
 * lands beside the temp copy. Every echo a body carries comes from a module GET, as the page's
 * does. Every refusal compares the whole edit table and the served-version id list before and
 * after, by value, and carries a control that writes, so a route refusing everything fails.
 */
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'served-save-route-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const M = 'm93001';
const A = `${M}:para:a`;
const B = `${M}:para:b`;
const D = `${M}:para:d`;
const EDITOR2 = Object.freeze({ id: 'u-ed2', username: 'editor2', role: 'editor', books: [] });

const M93001_EN = [
  [A, 'EN a'],
  [B, 'EN b'],
  [D, 'EN d'],
  [D, 'EN d'],
];
const M93001_MT = [
  [A, 'IS a'],
  [B, 'IS b'],
  [D, 'IS d1'],
  [D, 'IS d2'],
];

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let REFUSAL_MESSAGES;
let get;
let edit;
let db;

/** Rewrites m93001 from its literal; `isOverrides` replaces one id's Icelandic. */
function writeM93001(isOverrides = {}) {
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M,
    en: M93001_EN,
    mt: M93001_MT.map(([id, text]) => [id, isOverrides[id] ?? text]),
  });
}

function writeFixtures() {
  writeM93001();
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: 'm93002',
    en: [['m93002:para:a', 'EN a']], // EN only: no Icelandic layer
  });
  writeModule(root, {
    book: ORGANIC,
    chapterDir: 'ch01',
    moduleId: 'm93004',
    en: [['m93004:para:a', 'EN a']],
    mt: [['m93004:para:a', 'IS a']],
  });
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  ({ REFUSAL_MESSAGES } = require('../services/servedEdit'));
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  edit = handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit');
  db = new Database(dbPath);
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  db.close();
  rmSync(work, { recursive: true, force: true });
});

// The tests share one database and one books root and run in declaration order, so each starts
// from the literal modules and no edit rows (the precedent: acceptanceRoutes.test.js). Served
// versions are left alone: they are referenced through a live foreign key, and every test
// compares version id sets before and after instead of assuming an empty table.
beforeEach(() => {
  writeFixtures();
  rmSync(path.join(root, CHEM, '03-faithful-translation'), { recursive: true, force: true });
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
});

function serve(book, chapterNum, moduleId, user = EDITOR) {
  return invoke(get, { params: { book, chapter: String(chapterNum), moduleId }, chapterNum, user });
}

function save(body, { user = EDITOR, book = CHEM, chapterNum = 1, moduleId = M } = {}) {
  return invoke(edit, {
    params: { book, chapter: String(chapterNum), moduleId },
    chapterNum,
    user,
    body: { category: 'accuracy', ...body },
  });
}

const segOf = (page, id) => page.segments.find((s) => s.segmentId === id);
const editRows = () => db.prepare('SELECT * FROM segment_edits ORDER BY id').all();
const versionIds = () =>
  db
    .prepare('SELECT id FROM served_text_versions ORDER BY id')
    .all()
    .map((r) => r.id);
const snapshot = () => ({ edits: editRows(), versions: versionIds() });
const versionById = (id) => db.prepare('SELECT * FROM served_text_versions WHERE id = ?').get(id);

describe('POST /edit — the stale family (spec §5.6 step 4)', () => {
  it('STALE_BASE: the base file changed after the page loaded', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const shownHash = segOf(page, A).baseSha256;
    expect(shownHash).toBe(sha256Text('IS a'));
    writeM93001({ [A]: 'IS a breytt á diski' });

    const before = snapshot();
    const r = await save({ segmentId: A, editedContent: 'IS a ný', baseSha256: shownHash });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'STALE_BASE', message: REFUSAL_MESSAGES.STALE_BASE });
    expect(snapshot()).toEqual(before);

    // Control: after a reload the same save, echoing the new base, is written on that base.
    const fresh = (await serve(CHEM, 1, M)).body;
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a ný',
      baseSha256: segOf(fresh, A).baseSha256,
    });
    expect(ok.status).toBe(200);
    const rows = editRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].original_content).toBe('IS a breytt á diski');
  });

  it('UNSEEN_EDIT: the same editor saved from another page, which this page never showed', async () => {
    // Two pages of one editor, both loaded before any edit. checkEditConflict looks only at other
    // editors' rows, and the page names no displayed edit, so before the 2026-11-13 interface audit
    // (ED-05) the second page's save replaced the first's text with no message.
    const first = (await serve(CHEM, 1, M)).body;
    const second = (await serve(CHEM, 1, M)).body;
    const saved = await save({
      segmentId: A,
      editedContent: 'IS a flipi 1',
      baseEditId: 0,
      baseSha256: segOf(first, A).baseSha256,
    });
    expect(saved.status).toBe(200);

    const before = snapshot();
    const stale = await save({
      segmentId: A,
      editedContent: 'IS a flipi 2',
      baseEditId: 0,
      baseSha256: segOf(second, A).baseSha256,
      displayedEditId: null,
      displayedEditSha256: null,
      handlesUnseenEdit: true, // as the page sends it (segment-save-state.js buildSaveBody)
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: 'UNSEEN_EDIT', message: REFUSAL_MESSAGES.UNSEEN_EDIT });
    expect(snapshot()).toEqual(before);

    // Control: after a reload the page shows the first save, names it, and saves over it.
    const fresh = (await serve(CHEM, 1, M)).body;
    const shown = fresh.edits[A][0];
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a flipi 2',
      baseEditId: shown.id,
      baseSha256: segOf(fresh, A).baseSha256,
      displayedEditId: shown.id,
      displayedEditSha256: shown.contentSha256,
    });
    expect(ok.status).toBe(200);
    expect(editRows().map((r) => r.edited_content)).toEqual(['IS a flipi 2']);
  });

  it('a page loaded before UNSEEN_EDIT existed sends no handlesUnseenEdit, and is answered as before', async () => {
    // It does not keep the text on a code it does not know, so the route does not refuse it.
    const first = (await serve(CHEM, 1, M)).body;
    const body = { segmentId: A, baseEditId: 0, baseSha256: segOf(first, A).baseSha256 };
    expect((await save({ ...body, editedContent: 'IS a flipi 1' })).status).toBe(200);
    const stale = await save({ ...body, editedContent: 'IS a flipi 2' });
    expect(stale.status).toBe(200);
    expect(editRows().map((r) => r.edited_content)).toEqual(['IS a flipi 2']);
  });

  it('STALE_DISPLAYED where checkEditConflict passes', async () => {
    // Editor 2 saves on a, through the route.
    const page2 = (await serve(CHEM, 1, M, EDITOR2)).body;
    const s2 = await save(
      {
        segmentId: A,
        editedContent: 'IS a ritstjóri 2',
        baseSha256: segOf(page2, A).baseSha256,
      },
      { user: EDITOR2 }
    );
    expect(s2.status).toBe(200);

    // Editor 1 loads the module: the row displays editor 2's edit.
    const page1 = (await serve(CHEM, 1, M)).body;
    const shown = page1.edits[A][0];
    expect(shown.id).toBe(s2.body.editId);
    expect(shown.contentSha256).toBe(sha256Text('IS a ritstjóri 2'));

    // Editor 2 re-saves new text: the same row id, so checkEditConflict cannot see it.
    const r2 = await save(
      {
        segmentId: A,
        editedContent: 'IS a ritstjóri 2, önnur útgáfa',
        baseEditId: s2.body.editId,
        baseSha256: s2.body.baseSha256,
        displayedEditId: s2.body.displayedEditId,
        displayedEditSha256: s2.body.displayedEditSha256,
      },
      { user: EDITOR2 }
    );
    expect(r2.status).toBe(200);
    expect(r2.body.editId).toBe(shown.id);

    // Editor 1 saves a text other than editor 2's new one (so decision 39 cannot apply).
    const before = snapshot();
    const r1 = await save({
      segmentId: A,
      editedContent: 'IS a ritstjóri 1',
      baseEditId: shown.id,
      baseSha256: segOf(page1, A).baseSha256,
      displayedEditId: shown.id,
      displayedEditSha256: shown.contentSha256,
    });
    expect(r1.status).toBe(409);
    expect(r1.body).toEqual({
      error: 'STALE_DISPLAYED',
      message: REFUSAL_MESSAGES.STALE_DISPLAYED,
    });
    expect(snapshot()).toEqual(before);

    // Control: after a reload, the pair the page now shows passes.
    const again = (await serve(CHEM, 1, M)).body;
    const nowShown = again.edits[A][0];
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a ritstjóri 1',
      baseEditId: nowShown.id,
      baseSha256: segOf(again, A).baseSha256,
      displayedEditId: nowShown.id,
      displayedEditSha256: nowShown.contentSha256,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.updated).toBe(false);
  });

  it('decision 39: a replay whose first attempt landed answers 200 and writes no second row', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const baseSha256 = segOf(page, A).baseSha256;
    const first = await save({ segmentId: A, editedContent: 'IS a v1', baseSha256 });
    expect(first.status).toBe(200);
    const E = first.body.editId;

    const reload = (await serve(CHEM, 1, M)).body;
    const shown = reload.edits[A][0];
    expect(shown.id).toBe(E);
    const B_BODY = {
      segmentId: A,
      editedContent: 'IS a v2',
      baseEditId: E,
      baseSha256: segOf(reload, A).baseSha256,
      displayedEditId: E,
      displayedEditSha256: shown.contentSha256,
    };
    const rows = () =>
      db
        .prepare(
          `SELECT id, edited_content, original_content, served_version_id, displayed_edit_id,
                  displayed_edit_sha256, status
             FROM segment_edits WHERE segment_id = ? ORDER BY id`
        )
        .all(A);

    // The first attempt: re-saves the editor's own displayed edit in place.
    const attempt = await save(B_BODY);
    expect(attempt.status).toBe(200);
    expect(attempt.body.editId).toBe(E);
    expect(attempt.body.updated).toBe(true);
    const afterAttempt = rows();
    expect(afterAttempt).toHaveLength(1);
    expect(afterAttempt[0].edited_content).toBe('IS a v2');

    // The replay: its displayedEditSha256 names v1, which the row no longer holds, but the row
    // holds exactly the replayed text.
    const replay = await save({ ...B_BODY, replayed: true });
    expect(replay.status).toBe(200);
    expect(replay.body.editId).toBe(E);
    expect(replay.body.updated).toBe(true);
    expect(rows()).toEqual(afterAttempt);

    // Control: the same stale pair with a third text is refused, and nothing changes.
    const third = await save({ ...B_BODY, editedContent: 'IS a v3' });
    expect(third.status).toBe(409);
    expect(third.body.error).toBe('STALE_DISPLAYED');
    expect(rows()).toEqual(afterAttempt);
  });
});

describe('POST /edit — what is stored and what is answered (spec §5.6 step 6, §5.18)', () => {
  it('the stored original_content is the server’s base, whatever the client posts', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const r = await save({
      segmentId: A,
      originalContent: 'RANGT',
      editedContent: 'IS a lagað',
      baseSha256: segOf(page, A).baseSha256,
    });
    expect(r.status).toBe(200);
    const rows = editRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].original_content).toBe('IS a');
    expect(rows[0].origin).toBe('editor-save');
    expect(versionById(rows[0].served_version_id)).toMatchObject({
      book: CHEM,
      module_id: M,
      segment_id: A,
      is_text: 'IS a',
      is_sha256: sha256Text('IS a'),
    });
  });

  it('the success response carries what the next save echoes', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const baseSha256 = segOf(page, A).baseSha256;
    const ins = await save({ segmentId: A, editedContent: 'IS a nýtt', baseSha256 });
    expect(ins.status).toBe(200);
    expect(ins.body).toMatchObject({ success: true, updated: false });
    expect(ins.body.baseSha256).toBe(baseSha256);
    expect(ins.body.displayedEditId).toBe(ins.body.editId);
    expect(ins.body.displayedEditSha256).toBe(sha256Text('IS a nýtt'));
    // Decision 15: exactly three fields added to today's response.
    expect(Object.keys(ins.body).sort()).toEqual(
      [
        'baseSha256',
        'displayedEditId',
        'displayedEditSha256',
        'editId',
        'qaFindings',
        'success',
        'termWarnings',
        'updated',
      ].sort()
    );

    // The withdraw, echoing exactly what the insert answered.
    const wd = await save({
      segmentId: A,
      editedContent: 'IS a',
      baseEditId: ins.body.editId,
      baseSha256: ins.body.baseSha256,
      displayedEditId: ins.body.displayedEditId,
      displayedEditSha256: ins.body.displayedEditSha256,
    });
    expect(wd.status).toBe(200);
    expect(wd.body).toMatchObject({
      success: true,
      editId: ins.body.editId,
      updated: true,
      baseSha256,
      displayedEditId: null,
      displayedEditSha256: null,
    });
    expect(editRows()).toEqual([]);
  });

  it('T3: a relabel with identical bytes does not refuse', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    expect(page.isSource).toBe('mt-output');
    const H = segOf(page, B).baseSha256;
    const servedAt = db
      .prepare('SELECT * FROM served_text_versions WHERE segment_id = ? AND is_sha256 = ?')
      .all(B, H);
    expect(servedAt.map((v) => v.layer)).toEqual(['mt-output']);

    const rel = (layer) => path.join(root, CHEM, layer, 'ch01', `${M}-segments.is.md`);
    mkdirSync(path.dirname(rel('03-faithful-translation')), { recursive: true });
    copyFileSync(rel('02-mt-output'), rel('03-faithful-translation'));

    const r = await save({ segmentId: B, editedContent: 'IS b lagað', baseSha256: H });
    expect(r.status).toBe(200);
    const [row] = editRows();
    const version = versionById(row.served_version_id);
    expect(version.layer).toBe('faithful');
    expect(version.is_sha256).toBe(H);
    expect(version.id).not.toBe(servedAt[0].id);
  });
});

describe('POST /edit — placement and scope refusals (spec §5.6 steps 1–3, §5.7, §11)', () => {
  it('DUPLICATE_ID and NO_LAYER answer 409; nothing is written', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const dups = page.segments.filter((s) => s.segmentId === D);
    expect(dups).toHaveLength(2);
    expect(dups.every((s) => !('baseSha256' in s))).toBe(true);
    const layerless = (await serve(CHEM, 1, 'm93002')).body;
    expect(layerless.isSource).toBe(null);
    expect('baseSha256' in segOf(layerless, 'm93002:para:a')).toBe(false);

    const before = snapshot();
    // As the page sends it (no hash on the row), and with a well-formed hash.
    for (const baseSha256 of [undefined, sha256Text('IS d2')]) {
      const r = await save({ segmentId: D, editedContent: 'IS d breytt', baseSha256 });
      expect(r.status).toBe(409);
      expect(r.body).toEqual({ error: 'DUPLICATE_ID', message: REFUSAL_MESSAGES.DUPLICATE_ID });
    }
    for (const baseSha256 of [undefined, sha256Text('')]) {
      const r = await save(
        { segmentId: 'm93002:para:a', editedContent: 'IS a', baseSha256 },
        { moduleId: 'm93002' }
      );
      expect(r.status).toBe(409);
      expect(r.body).toEqual({ error: 'NO_LAYER', message: REFUSAL_MESSAGES.NO_LAYER });
    }
    expect(snapshot()).toEqual(before);

    // Control: a single-occurrence id of the same module saves.
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a breytt',
      baseSha256: segOf(page, A).baseSha256,
    });
    expect(ok.status).toBe(200);
    expect(editRows()).toHaveLength(1);
  });

  it('T18: an organic save answers 409 BOOK_NOT_MINTED even with a correct hash', async () => {
    const loaded = segmentParser.loadModuleForEditing(ORGANIC, 1, 'm93004');
    const hash = sha256Text(loaded.segments.find((s) => s.segmentId === 'm93004:para:a').is);

    const before = snapshot();
    const r = await save(
      { segmentId: 'm93004:para:a', editedContent: 'IS a breytt', baseSha256: hash },
      { book: ORGANIC, moduleId: 'm93004' }
    );
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: 'BOOK_NOT_MINTED',
      message: REFUSAL_MESSAGES.BOOK_NOT_MINTED,
    });
    expect(snapshot()).toEqual(before);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM segment_edits WHERE book = ?').get(ORGANIC).n
    ).toBe(0);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM served_text_versions WHERE book = ?').get(ORGANIC).n
    ).toBe(0);

    // Control, same test: a chemistry save with its hash answers 200.
    const page = (await serve(CHEM, 1, M)).body;
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a breytt',
      baseSha256: segOf(page, A).baseSha256,
    });
    expect(ok.status).toBe(200);
  });
});

describe('POST /edit — the body’s types (decision 14)', () => {
  it('rejects a displayed pair of the wrong type with 400', async () => {
    const page = (await serve(CHEM, 1, M)).body;
    const baseSha256 = segOf(page, A).baseSha256;
    const before = snapshot();

    const r = await save({
      segmentId: A,
      editedContent: 'IS a breytt',
      baseSha256,
      displayedEditId: '12',
    });
    expect(r.status).toBe(400);
    for (const extra of [
      { displayedEditId: 1.5 },
      { displayedEditSha256: 12 },
      { editedContent: 42 },
    ]) {
      const bad = await save({ segmentId: A, editedContent: 'IS a breytt', baseSha256, ...extra });
      expect(bad.status, JSON.stringify(extra)).toBe(400);
    }
    // A baseSha256 that is not a non-empty string counts as absent.
    for (const notAHash of [42, '']) {
      const missing = await save({
        segmentId: A,
        editedContent: 'IS a breytt',
        baseSha256: notAHash,
      });
      expect(missing.status).toBe(409);
      expect(missing.body.error).toBe('BASE_MISSING');
    }
    expect(snapshot()).toEqual(before);

    // Control: a null pair is the row showing the base, and saves.
    const ok = await save({
      segmentId: A,
      editedContent: 'IS a breytt',
      baseSha256,
      displayedEditId: null,
      displayedEditSha256: null,
    });
    expect(ok.status).toBe(200);
  });
});
