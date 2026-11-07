/**
 * The propagate route records its research events (G1.2 PR3 Task 25; spec §5.6, §5.9; plan decisions 44, 49, 53, 54,
 * 65; Review Focus 24, 26, 27, 35, 38, 44): one `propagation` event per WRITTEN target with the preview's hash and
 * its flag, none when nothing is written, and `write-refused` for a refused propagation.
 *
 * Drives the real handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the research file
 * derives into it too) over synthetic modules under a temp books root. Nothing under books/ or pipeline-output/ is
 * read or written. The cases share one database and run in declaration order.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-propagation-events-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchLog = require('../services/researchLog');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, makeUser, consent, losses } = require('./helpers/researchFixture.cjs');
const { eventMark, eventsSince } = require('./helpers/researchEventsFixture.cjs');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const SRC = 'm97501';
const NOTE = 'Sjálfvirk fjölgun';
const NOTE_CONTENT = { length: [...NOTE].length, sha256: sha256Text(NOTE) };
const sid = (mod, x) => `${mod}:para:${x}`;

const userOf = (p) => Object.freeze({ id: p, username: p, role: 'editor', books: [] });
const PP = userOf('p-p');
const PO = userOf('p-o');

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
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
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  const mod = (moduleId, en, mt, book = CHEM) =>
    writeModule(root, { book, chapterDir: 'ch01', moduleId, en, mt });
  mod(
    SRC,
    [
      [sid(SRC, 's'), 'Recurring.'],
      [sid(SRC, 's2'), 'Base case.'],
    ],
    [
      [sid(SRC, 's'), 'Endurtekið.'],
      [sid(SRC, 's2'), 'Grunnur.'],
    ]
  );
  mod('m97502', [[sid('m97502', 't'), 'Recurring.']], [[sid('m97502', 't'), 'IS t']]);
  mod('m97503', [[sid('m97503', 'u'), 'Recurring.']], [[sid('m97503', 'u'), 'IS u']]);
  mod(
    'm97504',
    [
      [sid('m97504', 'w'), 'Recurring.'],
      [sid('m97504', 'w'), 'Recurring.'],
    ],
    [
      [sid('m97504', 'w'), 'IS w1'],
      [sid('m97504', 'w'), 'IS w2'],
    ]
  );
  mod('m97505', [[sid('m97505', 'v'), 'Base case.']], [[sid('m97505', 'v'), 'IS v']]);
  // A duplicated SOURCE id: placing the source refuses (PR1 review C3).
  mod(
    'm97506',
    [
      [sid('m97506', 'd'), 'Dup.'],
      [sid('m97506', 'd'), 'Dup.'],
    ],
    [
      [sid('m97506', 'd'), 'IS d1'],
      [sid('m97506', 'd'), 'IS d2'],
    ]
  );
  mod('m97507', [[sid('m97507', 'x'), 'EN x']], [[sid('m97507', 'x'), 'IS x']], ORGANIC);
  for (const p of ['p-p', 'p-o']) consent(makeUser(p));
  const router = require('../routes/segment-editor');
  h = {
    get: handlerFor(router, 'get', '/:book/:chapter/:moduleId'),
    save: handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit'),
    propagate: handlerFor(router, 'post', '/:book/:chapter/:moduleId/propagate'),
  };
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

const onModule = (moduleId, user, body = undefined, book = CHEM) => ({
  params: { book, chapter: '1', moduleId },
  chapterNum: 1,
  user,
  body,
});

/** A save as the page sends it: the served hash, and the row it displays. */
async function save(moduleId, user, x, text) {
  const page = (await invoke(h.get, onModule(moduleId, user))).body;
  const rows = page.edits[sid(moduleId, x)];
  const shown = rows && rows.length ? rows[0] : null;
  const r = await invoke(
    h.save,
    onModule(moduleId, user, {
      segmentId: sid(moduleId, x),
      editedContent: text,
      baseSha256: page.segments.find((s) => s.segmentId === sid(moduleId, x)).baseSha256,
      ...(shown
        ? {
            baseEditId: shown.id,
            displayedEditId: shown.id,
            displayedEditSha256: shown.contentSha256,
          }
        : {}),
      clientActionId: `pe-${moduleId}-${x}-${text}`,
    })
  );
  expect(r.status).toBe(200);
  return r.body.editId;
}

const propagate = (user, body, moduleId = SRC, book = CHEM) =>
  invoke(h.propagate, onModule(moduleId, user, body, book));

const propagations = (mark) => eventsSince(mark).filter((e) => e.event_type === 'propagation');
const byModule = (events, moduleId) => events.filter((e) => e.module_id === moduleId);
const storedJson = (events) =>
  events.map((e) => `${e.content_json}${e.detail_json}${e.before_json}`).join('\n');

describe('the propagation events', () => {
  it('T16, event half: one event per written target; the client text stored once; the preview hash; no flag when they agree', async () => {
    await save(SRC, PP, 's', 'Fjölgað');
    const mark = eventMark();
    const r = await propagate(PP, {
      segmentId: sid(SRC, 's'),
      editedContent: 'Fjölgað',
      clientActionId: 'prop-1',
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['created', 'skipped']);
    const ev = propagations(mark);
    expect(ev.map((e) => e.module_id).sort()).toEqual(['m97502', 'm97503']);
    for (const e of ev) {
      const row = db
        .prepare('SELECT * FROM segment_edits WHERE module_id = ? AND editor_id = ?')
        .get(e.module_id, 'p-p');
      expect(e.book).toBe(CHEM);
      expect(BigInt(row.id)).toBe(e.editing_id);
      expect(BigInt(row.served_version_id)).toBe(e.served_version_id);
      expect(e.origin).toBe('propagation');
      expect(e.editing_content_sha256).toBe(sha256Text('Fjölgað'));
      expect(e.client_action_id).toBeNull();
      expect(e.content).toEqual({ category: null, note: NOTE_CONTENT, text: 'Fjölgað' });
      expect(e.detail).toMatchObject({
        clientTextSha256: sha256Text('Fjölgað'),
        previewSha256: sha256Text('Fjölgað'),
        previewSource: 'own-edit',
        previewText: 'Fjölgað',
        previewMismatch: false,
        source: { moduleId: SRC, segmentId: sid(SRC, 's') },
      });
    }
    const batches = ev.map((e) => e.detail.batch).sort((a, b) => a.index - b.index);
    expect(batches).toEqual([
      { index: 0, size: 2 },
      { index: 1, size: 2 },
    ]);
  });

  it('T5, event half: the duplicated target is listed once, on index 0', async () => {
    await save(SRC, PP, 's', 'Fjölgað2');
    const mark = eventMark();
    const r = await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Fjölgað2' });
    expect(r.status).toBe(200);
    const ev = propagations(mark).sort((a, b) => a.detail.batch.index - b.detail.batch.index);
    expect(ev).toHaveLength(2);
    expect(ev[0].detail.skipped).toEqual([
      { moduleId: 'm97504', segmentId: sid('m97504', 'w'), reason: 'duplicate-id', occurrence: 0 },
      { moduleId: 'm97504', segmentId: sid('m97504', 'w'), reason: 'duplicate-id', occurrence: 1 },
    ]);
    expect('skipped' in ev[1].detail).toBe(false);
    expect(byModule(ev, 'm97504')).toEqual([]);
  });

  it('T16: a client text that differs from the preview is flagged', async () => {
    await save(SRC, PP, 's', 'Nýrra');
    const mark = eventMark();
    await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Annað' });
    const ev = propagations(mark);
    expect(ev).toHaveLength(2);
    for (const e of ev) {
      expect(e.detail.previewMismatch).toBe(true);
      expect(e.detail.previewSha256).toBe(sha256Text('Nýrra'));
      expect(e.detail.clientTextSha256).toBe(sha256Text('Annað'));
    }
  });

  it("another editor's live edit as the preview: hash only", async () => {
    await save(SRC, PO, 's', 'ANNARS-TEXTI');
    const mark = eventMark();
    await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Mitt' });
    const ev = propagations(mark);
    expect(ev).toHaveLength(2);
    for (const e of ev) {
      expect(e.detail.previewSource).toBe('other-edit');
      expect(e.detail.previewSha256).toBe(sha256Text('ANNARS-TEXTI'));
      expect('previewText' in e.detail).toBe(false);
    }
    expect(storedJson(ev)).not.toContain('ANNARS-TEXTI');
  });

  it("a propagated text byte-identical to another editor's live edit is stored as its hash (decision 65)", async () => {
    const mark = eventMark();
    await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'ANNARS-TEXTI' });
    const ev = propagations(mark);
    expect(ev).toHaveLength(2);
    for (const e of ev) {
      expect(e.content).toEqual({
        category: null,
        note: NOTE_CONTENT,
        textSha256: sha256Text('ANNARS-TEXTI'),
      });
      expect(e.editing_content_sha256).toBe(sha256Text('ANNARS-TEXTI'));
      expect(e.detail.clientTextSha256).toBe(sha256Text('ANNARS-TEXTI'));
      expect(e.detail.previewSource).toBe('other-edit');
      expect(e.detail.previewMismatch).toBe(false);
    }
    expect(storedJson(ev)).not.toContain('ANNARS-TEXTI');

    const mark2 = eventMark();
    await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Þriðja' });
    const next = propagations(mark2);
    expect(next).toHaveLength(2);
    for (const e of next) {
      expect(e.content.text).toBe('Þriðja'); // control: a different text keeps its text
      expect(e.before[0].row.edited_content_sha256).toBe(sha256Text('ANNARS-TEXTI'));
      expect('edited_content' in e.before[0].row).toBe(false);
    }
    expect(storedJson(next)).not.toContain('ANNARS-TEXTI');
  });

  it('the base as the preview: its text is kept', async () => {
    const mark = eventMark();
    const r = await propagate(PP, {
      segmentId: sid(SRC, 's2'),
      editedContent: 'Grunnur nýr',
    });
    expect(r.status).toBe(200);
    const ev = propagations(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].module_id).toBe('m97505');
    expect(ev[0].detail).toMatchObject({
      previewSource: 'base',
      previewText: 'Grunnur.',
      previewSha256: sha256Text('Grunnur.'),
      previewMismatch: true,
    });
  });

  it("an in-place update carries the propagator's own row as it was", async () => {
    await save('m97503', PP, 'u', 'eldra mitt');
    const mark = eventMark();
    await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Fjórða' });
    const ev = byModule(propagations(mark), 'm97503');
    expect(ev).toHaveLength(1);
    expect(ev[0].before[0].row.edited_content).toBe('eldra mitt');
    expect(ev[0].before[0].row.origin).toBe('editor-save');
  });

  it('a propagation that writes nothing records nothing', async () => {
    const mark = eventMark();
    const lossesBefore = losses();
    const r = await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Fjórða' });
    expect(r.status).toBe(200);
    expect(r.body.created).toEqual([]);
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(lossesBefore);
  });
});

describe('refusals', () => {
  it('a refused source placement logs write-refused with its code and no client action id (R-A, R-B)', async () => {
    const mark = eventMark();
    const r = await propagate(
      PP,
      { segmentId: sid('m97506', 'd'), editedContent: 'X', clientActionId: 'prop-refused' },
      'm97506'
    );
    expect(r.status).toBe(409);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('write-refused');
    expect(ev[0].detail).toMatchObject({ reason: 'DUPLICATE_ID', action: 'propagate' });
    expect(ev[0].origin).toBe('propagation');
    expect(ev[0].client_action_id).toBeNull();
    expect(propagations(mark)).toEqual([]);
  });

  it('an organic propagation: write-refused, dropped by record at step 1', async () => {
    const mark = eventMark();
    const lossesBefore = losses();
    const spy = vi.spyOn(researchLog, 'record');
    try {
      const r = await propagate(
        PP,
        { segmentId: sid('m97507', 'x'), editedContent: 'X', clientActionId: 'prop-organic' },
        'm97507',
        ORGANIC
      );
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('BOOK_NOT_MINTED');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toMatchObject({
        eventType: 'write-refused',
        book: ORGANIC,
        clientActionId: null,
        detail: { reason: 'BOOK_NOT_MINTED', action: 'propagate' },
      });
      expect(spy.mock.results[0].value).toEqual({ status: 'skipped', reason: 'not-study' });
    } finally {
      spy.mockRestore();
    }
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(lossesBefore);
  });
});

describe("the preview read is the research event's alone: it never fails the propagation (spec §5.11)", () => {
  it('a throwing latestLiveEdit: the propagation answers 200, writes its targets, and its events carry no preview', async () => {
    const propagationService = require('../services/propagationService');
    const logger = require('../lib/logger');
    const mark = eventMark();
    const read = vi.spyOn(propagationService, 'latestLiveEdit').mockImplementation(() => {
      throw Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR_READ' });
    });
    const warn = vi.spyOn(logger, 'warn');
    let r;
    let reads;
    try {
      r = await propagate(PP, { segmentId: sid(SRC, 's'), editedContent: 'Án forsýnar' });
    } finally {
      reads = read.mock.calls.length; // before mockRestore, which clears the call log
      read.mockRestore();
    }
    try {
      expect(reads).toBe(1);
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(['created', 'skipped']);
      const written = db
        .prepare('SELECT module_id FROM segment_edits WHERE edited_content = ? ORDER BY module_id')
        .all('Án forsýnar')
        .map((x) => x.module_id);
      expect(written).toEqual(['m97502', 'm97503']);
      const ev = propagations(mark);
      expect(ev.map((e) => e.module_id).sort()).toEqual(['m97502', 'm97503']);
      for (const e of ev) {
        expect(e.content.text).toBe('Án forsýnar');
        expect(e.detail.clientTextSha256).toBe(sha256Text('Án forsýnar'));
        expect(e.detail.previewSha256).toBeNull();
        expect(e.detail.previewSource).toBeNull();
        expect(e.detail.previewMismatch).toBeNull();
        expect('previewText' in e.detail).toBe(false);
      }
      // The warning carries the error's code and no content.
      const line = warn.mock.calls.find((c) => /preview/i.test(String(c[1])));
      expect(line[0]).toEqual({ errorCode: 'SQLITE_IOERR_READ' });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('Án forsýnar');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('a propagation under a held research lock pays one busy wait, not one per target (final review I2)', () => {
  const N = 40;
  const BUSY_SRC = 'm97590';
  const targetOf = (i) => `m976${String(i).padStart(2, '0')}`;

  it('N targets: about one BUSY_TIMEOUT_MS, every target a busy loss, the response unchanged', async () => {
    const mod = (moduleId, x) =>
      writeModule(root, {
        book: CHEM,
        chapterDir: 'ch01',
        moduleId,
        en: [[sid(moduleId, x), 'Locked recurring sentence.']],
        mt: [[sid(moduleId, x), `IS ${moduleId}`]],
      });
    mod(BUSY_SRC, 'z');
    for (let i = 0; i < N; i++) mod(targetOf(i), 'y');
    const { resolveResearchDbPath } = require('../lib/researchDbPath');
    researchDb.getHandle(); // open first: the open itself must not wait on the lock
    const lossesBefore = losses().length;
    const mark = eventMark();
    const holder = new Database(resolveResearchDbPath().researchPath);
    holder.exec('BEGIN EXCLUSIVE'); // held from here, so the act starts only once the lock is confirmed
    let r;
    let elapsed;
    try {
      const t0 = performance.now();
      r = await propagate(
        PP,
        { segmentId: sid(BUSY_SRC, 'z'), editedContent: 'Læst fjölgun' },
        BUSY_SRC
      );
      elapsed = performance.now() - t0;
    } finally {
      holder.exec('ROLLBACK');
      holder.close();
    }
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['created', 'skipped']);
    expect(r.body.created).toHaveLength(N);
    expect(r.body.skipped).toEqual([]);
    const gained = losses().slice(lossesBefore);
    expect(gained).toHaveLength(N);
    expect(new Set(gained.map((l) => `${l.event_type}|${l.error_class}`))).toEqual(
      new Set(['propagation|busy'])
    );
    expect(eventsSince(mark)).toEqual([]);
    expect(elapsed).toBeLessThan(researchDb.BUSY_TIMEOUT_MS * 2 + 1500);
  }, 60_000);
});
