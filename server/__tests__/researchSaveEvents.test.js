/**
 * The save route records edit-save, edit-resave, edit-withdraw and write-refused (G1.2 PR3 Task 21; spec §5.6,
 * §5.9, §5.10, §5.18; T4's and T5's event halves (save), T20's route part; plan decisions 49–51, 53, 65; Review
 * Focus 21–23, 32, 33, 41, 43, 44).
 *
 * Drives the real GET and POST handlers on a real migrated database (SESSIONS_DB_PATH in a temp dir, so the
 * research file derives into it too) over synthetic modules under a temp books root: nothing under books/ or
 * pipeline-output/ is read or written. Every echo a body carries comes from a module GET, as the page's does.
 *
 * The cases share one database and run in declaration order; each takes `eventMark()` before the act it
 * measures, and "one event" means `eventsSince(mark)` has length 1. Every writing call carries a fresh
 * clientActionId unless the case is about the dedupe, so no case is a duplicate of another by accident.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath(), the research path and the JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'research-save-events-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const logger = require('../lib/logger');
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
const M = 'm97101';
const id = (x) => `${M}:para:${x}`;
const LATER = ['f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o']; // one segment per later case
const EN = [
  [id('a'), 'Recurring sentence.'],
  [id('b'), 'EN b'],
  [id('c'), 'EN c'],
  [id('d'), 'EN d'],
  [id('d'), 'EN d'],
  [id('e'), 'EN e'],
  ...LATER.map((x) => [id(x), `EN ${x}`]),
];
const MT = [
  [id('a'), 'IS a'],
  [id('b'), 'IS b'],
  [id('c'), 'IS c'],
  [id('d'), 'IS d'],
  [id('d'), 'IS d'],
  [id('e'), 'IS e'],
  ...LATER.map((x) => [id(x), `IS ${x}`]),
];
// PR1 Task 14's response, key for key.
const SAVE_KEYS = [
  'baseSha256',
  'displayedEditId',
  'displayedEditSha256',
  'editId',
  'qaFindings',
  'success',
  'termWarnings',
  'updated',
];

const userOf = (p) => Object.freeze({ id: p, username: p, role: 'editor', books: [] });
const ED1 = userOf('p-ed1');
const ED2 = userOf('p-ed2');
const DEC = userOf('p-dec');

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let concordance;
let servedEdit;
let get;
let edit;
let db;
let INT1;
const uid = {};
const isOverrides = {}; // cumulative: a case that rewrites one segment's base keeps it for later cases

function writeM97101() {
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: M,
    en: EN,
    mt: MT.map(([sid, text]) => [sid, isOverrides[sid] ?? text]),
  });
}
function rewriteBase(x, text) {
  isOverrides[id(x)] = text;
  writeM97101();
}

beforeAll(() => {
  runAllMigrations();
  researchDb.openAtBoot(); // no consent yet, so the file is created
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  concordance = require('../services/concordanceService');
  servedEdit = require('../services/servedEdit');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  writeM97101();
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch02',
    moduleId: 'm97109',
    en: [['m97109:para:r', 'Recurring sentence.']],
    faithful: [['m97109:para:r', 'Samþykkt þýðing.']],
  });
  concordance.indexModule(CHEM, 2, 'm97109');
  for (const p of ['p-ed1', 'p-ed2', 'p-dec']) uid[p] = makeUser(p);
  INT1 = consent(uid['p-ed1']);
  consent(uid['p-ed2']);
  decline(uid['p-dec']);
  const router = require('../routes/segment-editor');
  get = handlerFor(router, 'get', '/:book/:chapter/:moduleId');
  edit = handlerFor(router, 'post', '/:book/:chapter/:moduleId/edit');
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
  db.close();
  rmSync(work, { recursive: true, force: true });
});

const PARAMS = Object.freeze({ book: CHEM, chapter: '1', moduleId: M });
const serve = (user) => invoke(get, { params: PARAMS, chapterNum: 1, user });
const post = (user, body) => invoke(edit, { params: PARAMS, chapterNum: 1, user, body });

let actSeq = 0;
const act = () => `act-auto-${++actSeq}`;

/** What `user`'s page shows for segment x: its served base hash and the row it displays (edits[seg][0]). */
async function view(user, x) {
  const page = (await serve(user)).body;
  const seg = page.segments.find((s) => s.segmentId === id(x));
  const rows = page.edits[id(x)];
  return { baseSha256: seg.baseSha256, row: rows && rows.length ? rows[0] : null };
}
const served = async (user, x) => (await view(user, x)).baseSha256;

/** A save as the page sends it: the served hash, and the row it displays as baseEditId and displayed pair. */
async function saveShowing(user, x, editedContent, extra = {}) {
  const v = await view(user, x);
  return post(user, {
    segmentId: id(x),
    editedContent,
    baseSha256: v.baseSha256,
    ...(v.row
      ? {
          baseEditId: v.row.id,
          displayedEditId: v.row.id,
          displayedEditSha256: v.row.contentSha256,
        }
      : {}),
    clientActionId: act(),
    ...extra,
  });
}

const pendingRowOf = (editorId, x) =>
  db
    .prepare(
      "SELECT * FROM segment_edits WHERE segment_id = ? AND editor_id = ? AND status = 'pending'"
    )
    .get(id(x), editorId);
const rowsHolding = (text) =>
  db.prepare('SELECT id FROM segment_edits WHERE edited_content = ?').all(text);

const termItem = () => ({
  itemType: 'term-insert',
  source: 'termbase',
  clientTimeMs: Date.now(),
  detail: { term: 'hugtak' },
});

let replayBody = null; // the T20 case's body, replayed by the next case

describe('the save route records its research event (spec §5.9; decision 51)', () => {
  it('an insert writes one edit-save: editing row, served version, content, displayed pair, items and client fields', async () => {
    // Both repetition items are built as the client builds them (PR1 Task 10), from the panel's suggestion.
    const rep = concordance.findRepetitions(CHEM, 1, M).find((r) => r.segmentId === id('a'));
    expect(rep && rep.suggestion.is_text).toBe('Samþykkt þýðing.');
    const s = rep.suggestion;
    const repItem = (text) => ({
      itemType: 'repetition-insert',
      source: 'tm',
      clientTimeMs: Date.now(),
      detail: { text, book: s.book, chapter: s.chapter, moduleId: s.module_id },
    });
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('a'),
      editedContent: 'IS a breytt',
      editorNote: 'n1',
      category: 'terminology',
      baseSha256: await served(ED1, 'a'),
      clientActionId: 'act-1',
      clientActionTime: Date.now(),
      assists: [
        repItem(s.is_text),
        repItem('Fölsuð.'),
        termItem(),
        {
          itemType: 'markup-wrap',
          source: 'toolbar',
          clientTimeMs: Date.now(),
          detail: { marker: '__' },
        },
        { itemType: 'magic-insert' },
      ],
    });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(SAVE_KEYS);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    const row = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(r.body.editId);
    expect(ev[0]).toMatchObject({
      event_type: 'edit-save',
      editing_kind: 'segment_edit',
      editing_id: BigInt(r.body.editId),
      served_version_id: BigInt(row.served_version_id),
      editing_content_sha256: sha256Text('IS a breytt'),
      origin: 'editor-save',
      occurrence: 0n,
      client_action_id: 'act-1',
      replayed: 0n,
      before: null,
    });
    expect(ev[0].content).toEqual({
      category: 'terminology',
      note: { length: 2, sha256: sha256Text('n1') },
      text: 'IS a breytt',
    });
    expect(ev[0].detail).toEqual({
      displayed: { editId: null, sha256: null },
      supersededEditIds: [],
      supersededAcceptanceIds: [],
      droppedAssistCount: 1,
    });
    const items = itemsOf(ev[0].id);
    expect(items.map((i) => [i.item_type, i.claim])).toEqual([
      ['repetition-insert', 'validated'],
      ['repetition-insert', 'mismatch'],
      ['term-insert', 'unverified'],
      ['markup-wrap', 'unverified'],
    ]);
    expect(JSON.parse(items[0].detail_json).chapter).toBe(2); // the client's string, kept as a number
  });

  it("a re-save writes edit-resave with the caller's own previous text and first-save time", async () => {
    const prior = pendingRowOf('p-ed1', 'a');
    const mark = eventMark();
    const r = await saveShowing(ED1, 'a', 'IS a þriðja');
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('edit-resave');
    expect(ev[0].editing_id).toBe(BigInt(prior.id));
    expect(ev[0].before[0].row.edited_content).toBe('IS a breytt');
    expect(ev[0].before[0].row.created_at).toBe(prior.created_at);
  });

  it('a withdraw writes edit-withdraw: the deleted row, its served version, no items', async () => {
    const snapshot = pendingRowOf('p-ed1', 'a');
    const mark = eventMark();
    // The base text, with an assist still in the body (Review Focus 33).
    const r = await saveShowing(ED1, 'a', 'IS a', { assists: [termItem()] });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'edit-withdraw',
      served_version_id: BigInt(snapshot.served_version_id),
      editing_content_sha256: sha256Text(snapshot.edited_content),
      content: null,
    });
    expect(itemsOf(ev[0].id)).toEqual([]);
    expect(ev[0].before[0].row.id).toBe(snapshot.id);
  });

  it('an identity save with no pending row writes nothing', async () => {
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('b'),
      editedContent: 'IS b',
      baseSha256: await served(ED1, 'b'),
      clientActionId: act(),
    });
    expect(r.status).toBe(200);
    expect(eventsSince(mark)).toEqual([]); // control: the inserts above wrote
  });
});

describe('T4, event half (spec §10 T4): a refusal writes one write-refused, with both hashes and no text', () => {
  const REFUSED_SHAPE = {
    event_type: 'write-refused',
    served_version_id: null,
    editing_kind: null,
    editing_id: null,
    content: null,
    before: null,
    origin: 'editor-save',
    occurrence: null,
  };

  it('STALE_BASE', async () => {
    const mark = eventMark();
    const old = await served(ED1, 'c');
    rewriteBase('c', 'IS c2');
    const r = await post(ED1, {
      segmentId: id('c'),
      editedContent: 'SENTINEL-REFUSED-1',
      baseSha256: old,
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ ...REFUSED_SHAPE, segment_id: id('c') });
    expect(ev[0].detail).toEqual({
      reason: 'STALE_BASE',
      echoedSha256: old,
      currentSha256: sha256Text('IS c2'),
      action: 'save',
    });
    expect(itemsOf(ev[0].id)).toEqual([]);
    expect(researchBytes().includes('SENTINEL-REFUSED-1')).toBe(false);
    expect(rowsHolding('SENTINEL-REFUSED-1')).toEqual([]);
  });

  it('BASE_MISSING', async () => {
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('c'),
      editedContent: 'SENTINEL-REFUSED-2',
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ ...REFUSED_SHAPE, segment_id: id('c') });
    expect(ev[0].detail).toEqual({
      reason: 'BASE_MISSING',
      echoedSha256: null,
      currentSha256: sha256Text('IS c2'),
      action: 'save',
    });
    expect(researchBytes().includes('SENTINEL-REFUSED-2')).toBe(false);
  });

  it('STALE_DISPLAYED', async () => {
    const first = await saveShowing(ED2, 'e', 'e2 fyrst');
    expect(first.status).toBe(200);
    const v1 = await view(ED1, 'e'); // the pair this page shows: p-ed2's row and its first text
    expect(v1.row.id).toBe(first.body.editId);
    const again = await saveShowing(ED2, 'e', 'e2 síðar'); // the same id, so checkEditConflict passes
    expect(again.body.editId).toBe(first.body.editId);
    const mark = eventMark(); // after p-ed2's own acts, so "one event" is the refusal alone
    const r = await post(ED1, {
      segmentId: id('e'),
      editedContent: 'SENTINEL-REFUSED-3',
      baseSha256: v1.baseSha256,
      baseEditId: v1.row.id,
      displayedEditId: v1.row.id,
      displayedEditSha256: v1.row.contentSha256,
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('STALE_DISPLAYED');
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ ...REFUSED_SHAPE, segment_id: id('e') });
    expect(ev[0].detail).toEqual({
      reason: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('e2 fyrst'),
      currentSha256: sha256Text('e2 síðar'),
      action: 'save',
    });
    expect(researchBytes().includes('SENTINEL-REFUSED-3')).toBe(false);
  });

  it('positive control: a stored text IS found by the byte scan, so the three absences above can fail', async () => {
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('c'),
      editedContent: 'POSITIVE-CONTROL-TEXT',
      baseSha256: await served(ED1, 'c'),
      clientActionId: act(),
    });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type)).toEqual(['edit-save']);
    expect(researchBytes().includes('POSITIVE-CONTROL-TEXT')).toBe(true);
  });
});

describe('the save event, the refusals and the dedupe, through the route', () => {
  it("T4: a save while another editor's edit is displayed carries that pair, as the row stores it", async () => {
    await saveShowing(ED2, 'e', 'e2 sýnd'); // p-ed2's row is the one p-ed1's page displays
    const v = await view(ED1, 'e');
    expect(v.row.editor_id).toBe('p-ed2');
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('e'),
      editedContent: 'IS e frá ed1',
      baseSha256: v.baseSha256,
      baseEditId: v.row.id,
      displayedEditId: v.row.id,
      displayedEditSha256: v.row.contentSha256,
      clientActionId: act(),
    });
    expect(r.status).toBe(200);
    const row = db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(r.body.editId);
    expect([row.displayed_edit_id, row.displayed_edit_sha256]).toEqual([
      v.row.id,
      v.row.contentSha256,
    ]);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.displayed).toEqual({
      editId: row.displayed_edit_id,
      sha256: row.displayed_edit_sha256,
    });
  });

  it('T5, event half (save): a duplicated id writes one write-refused and nothing else', async () => {
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('d'),
      editedContent: 'IS d ný',
      baseSha256: sha256Text('IS d'),
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('DUPLICATE_ID');
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: 'write-refused', segment_id: id('d') });
    // PR1's refusal carries no echo for this code, so it is the body's (decision 49); no version is minted for a
    // duplicated id, so there is no current hash.
    expect(ev[0].detail).toEqual({
      reason: 'DUPLICATE_ID',
      echoedSha256: sha256Text('IS d'),
      currentSha256: null,
      action: 'save',
    });
    expect(rowsHolding('IS d ný')).toEqual([]);

    const markNoHash = eventMark();
    const bare = await post(ED1, {
      segmentId: id('d'),
      editedContent: 'IS d ný',
      clientActionId: act(),
    });
    expect(bare.status).toBe(409);
    const evNoHash = eventsSince(markNoHash);
    expect(evNoHash).toHaveLength(1);
    expect(evNoHash[0].detail).toEqual({
      reason: 'DUPLICATE_ID',
      echoedSha256: null,
      currentSha256: null,
      action: 'save',
    });

    // Control: a non-duplicated sibling saves and writes its edit-save.
    const markSibling = eventMark();
    const ok = await post(ED1, {
      segmentId: id('f'),
      editedContent: 'IS f ný',
      baseSha256: await served(ED1, 'f'),
      clientActionId: act(),
    });
    expect(ok.status).toBe(200);
    expect(eventsSince(markSibling).map((e) => e.event_type)).toEqual(['edit-save']);
  });

  it('a malformed echoed hash is never stored: null, and flagged (decision 49; Review Focus 41)', async () => {
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('j'),
      editedContent: 'IS j ný',
      baseSha256: 'SENTINEL-NOT-A-HASH',
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('STALE_BASE'); // PR1 accepts any non-empty string (PR1 decision 14)
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('write-refused');
    expect(ev[0].detail).toEqual({
      reason: 'STALE_BASE',
      echoedSha256: null,
      currentSha256: sha256Text('IS j'),
      action: 'save',
      echoMalformed: true,
    });
    expect(researchBytes().includes('SENTINEL-NOT-A-HASH')).toBe(false);

    // Upper case: the length is right, the format is not.
    const markUpper = eventMark();
    const upper = await post(ED1, {
      segmentId: id('j'),
      editedContent: 'IS j ný',
      baseSha256: 'A'.repeat(64),
      clientActionId: act(),
    });
    expect(upper.status).toBe(409);
    const evUpper = eventsSince(markUpper);
    expect(evUpper).toHaveLength(1);
    expect([evUpper[0].detail.echoedSha256, evUpper[0].detail.echoMalformed]).toEqual([null, true]);
    // Control: the STALE_BASE case above keeps its lowercase hash and has no echoMalformed key (its toEqual),
    // and the T4 positive control shows the byte scan sees stored text.
  });

  it("T20, route part: a replayed save carries replayed 1 and the client's original action time", async () => {
    const t = Date.now();
    replayBody = {
      segmentId: id('g'),
      editedContent: 'IS g ný',
      baseSha256: await served(ED1, 'g'),
      replayed: true,
      clientActionTime: t,
      clientActionId: 'act-replay',
    };
    const mark = eventMark();
    const r = await post(ED1, replayBody);
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect([ev[0].replayed, ev[0].client_action_time_ms]).toEqual([1n, BigInt(t)]);
    // Control: the first case's live save read replayed 0n.
  });

  it("a replay of a recorded act writes nothing new (record's dedupe, reached through the route)", async () => {
    const mark = eventMark();
    // The caller's pending row now holds this text, so the save takes the re-save path.
    const r = await post(ED1, replayBody);
    expect(r.status).toBe(200);
    expect(r.body.updated).toBe(true);
    // Its edit-resave carries act-replay, which record finds under that key already (Task 11, decision 6).
    expect(eventsSince(mark)).toEqual([]);
  });

  it('a replay whose first attempt landed passes the displayed check and is a duplicate, not a second event', async () => {
    const first = await saveShowing(ED1, 'h', 'v1');
    expect(first.status).toBe(200);
    const v = await view(ED1, 'h');
    expect([v.row.id, v.row.contentSha256]).toEqual([first.body.editId, sha256Text('v1')]);
    const body = {
      segmentId: id('h'),
      editedContent: 'v2',
      baseEditId: v.row.id,
      baseSha256: v.baseSha256,
      displayedEditId: v.row.id,
      displayedEditSha256: v.row.contentSha256,
      clientActionId: 'act-d',
    };
    const mark = eventMark();
    const landed = await post(ED1, body);
    expect(landed.status).toBe(200);
    expect(eventsSince(mark).map((e) => e.event_type)).toEqual(['edit-resave']);

    // The same body again: a replay whose first answer was lost (PR1 Review Focus 18), sent live, so decision
    // 16's replay rule plays no part and an empty result can only be the dedupe (decision 53).
    const markAfterFirst = eventMark();
    const replay = await post(ED1, body);
    expect(replay.status).toBe(200);
    expect([replay.body.updated, replay.body.editId]).toEqual([true, landed.body.editId]);
    expect(eventsSince(markAfterFirst)).toEqual([]);

    // Control (PR1 Review Focus 18's): once the row moves on to a third text, the same body is refused
    // STALE_DISPLAYED, and that refusal is a duplicate of act-d too; with a fresh id it writes its event.
    const markThird = eventMark();
    const third = await saveShowing(ED1, 'h', 'v3', { clientActionId: 'act-d3' });
    expect(third.status).toBe(200);
    expect(eventsSince(markThird).map((e) => e.event_type)).toEqual(['edit-resave']);
    const markStale = eventMark();
    const stale = await post(ED1, body);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('STALE_DISPLAYED');
    expect(eventsSince(markStale)).toEqual([]);
    const fresh = await post(ED1, { ...body, clientActionId: 'act-d4' });
    expect(fresh.status).toBe(409);
    expect(eventsSince(markStale).map((e) => e.event_type)).toEqual(['write-refused']);
  });

  it('SEGMENT_CONFLICT writes one write-refused, with no hash; the wire answer is unchanged (decision 49)', async () => {
    const theirs = await saveShowing(ED2, 'k', 'k frá ed2');
    expect(theirs.status).toBe(200);
    const base = await served(ED1, 'k');
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('k'),
      baseEditId: 0, // so checkEditConflict sees p-ed2's newer row
      baseSha256: base,
      editedContent: 'SENTINEL-REFUSED-4',
      clientActionId: 'act-c',
    });
    expect(r.status).toBe(409);
    expect(Object.keys(r.body).sort()).toEqual(['error', 'message']);
    expect([r.body.error, typeof r.body.message]).toEqual(['conflict', 'string']);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      event_type: 'write-refused',
      origin: 'editor-save',
      segment_id: id('k'),
      client_action_id: 'act-c',
      content: null,
      served_version_id: null,
    });
    // The server's code, not the wire's; the conflict compares edit ids, so no hash, and the body's
    // baseSha256 is not taken.
    expect(ev[0].detail).toEqual({
      reason: 'SEGMENT_CONFLICT',
      echoedSha256: null,
      currentSha256: null,
      action: 'save',
    });
    expect(researchBytes().includes('SENTINEL-REFUSED-4')).toBe(false);

    // Positive control: a request that succeeds logs no write-refused.
    const v = await view(ED1, 'k');
    const markBeforeIt = eventMark();
    const ok = await post(ED1, {
      segmentId: id('k'),
      editedContent: 'k frá ed1',
      baseEditId: v.row.id,
      displayedEditId: v.row.id,
      displayedEditSha256: v.row.contentSha256,
      baseSha256: v.baseSha256,
      clientActionId: act(),
    });
    expect(ok.status).toBe(200);
    expect(eventsSince(markBeforeIt).map((e) => e.event_type)).toEqual(['edit-save']);
  });

  it("a decliner's refused save writes nothing and counts nothing (the gate is inside record)", async () => {
    const theirs = await saveShowing(ED2, 'm', 'm frá ed2');
    expect(theirs.status).toBe(200);
    const base = await served(DEC, 'm');
    const lossesBefore = losses();
    const mark = eventMark();
    const body = {
      segmentId: id('m'),
      baseEditId: 0, // so checkEditConflict sees p-ed2's newer row
      baseSha256: base,
      editedContent: 'SENTINEL-REFUSED-5', // without it the route answers 400 before the conflict check
    };
    const r = await post(DEC, { ...body, clientActionId: 'act-dec' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('conflict');
    expect(eventsSince(mark)).toEqual([]);
    expect(losses()).toEqual(lossesBefore);

    // Control, same rows: a consenting editor's identical refusal reaches record, so the decliner's empty
    // result is the gate's.
    const c = await post(ED1, { ...body, clientActionId: 'act-dec-c' });
    expect(c.status).toBe(409);
    expect(c.body.error).toBe('conflict');
    const ev = eventsSince(mark);
    expect(ev.map((e) => [e.event_type, e.segment_id])).toEqual([['write-refused', id('m')]]);
  });

  it("a saved text byte-identical to another editor's live edit is stored as its hash only (decision 65)", async () => {
    const markTheirs = eventMark();
    const theirs = await saveShowing(ED2, 'l', 'SAMA-TEXTI');
    expect(theirs.status).toBe(200);
    // p-ed2's own event keeps the text: no other editor holds it yet.
    expect(eventsSince(markTheirs).map((e) => e.content && e.content.text)).toEqual(['SAMA-TEXTI']);

    const v = await view(ED1, 'l');
    expect(v.row.editor_id).toBe('p-ed2');
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('l'),
      editedContent: 'SAMA-TEXTI',
      baseEditId: v.row.id,
      displayedEditId: v.row.id,
      displayedEditSha256: v.row.contentSha256,
      baseSha256: v.baseSha256,
      clientActionId: act(),
    });
    expect(r.status).toBe(200);
    const ev = eventsSince(mark);
    expect(ev).toHaveLength(1);
    expect(ev[0].event_type).toBe('edit-save');
    expect(ev[0].content).toEqual({
      category: null,
      note: null,
      textSha256: sha256Text('SAMA-TEXTI'),
    });
    expect(ev[0].editing_content_sha256).toBe(sha256Text('SAMA-TEXTI'));

    // Control: a different text keeps its text; the before-image of the actor's own copy, still identical to
    // p-ed2's live edit, holds its hash only, and keeps the actor's own created_at.
    const prior = pendingRowOf('p-ed1', 'l');
    const markResave = eventMark();
    const resave = await saveShowing(ED1, 'l', 'SAMA-TEXTI og meira');
    expect(resave.status).toBe(200);
    const evResave = eventsSince(markResave);
    expect(evResave).toHaveLength(1);
    expect(evResave[0].event_type).toBe('edit-resave');
    expect(evResave[0].content.text).toBe('SAMA-TEXTI og meira');
    const beforeRow = evResave[0].before[0].row;
    expect(beforeRow.edited_content_sha256).toBe(sha256Text('SAMA-TEXTI'));
    expect('edited_content' in beforeRow).toBe(false);
    expect(beforeRow.created_at).toBe(prior.created_at);
  });

  it('a builder failure never fails the save, and is counted for a consenting editor (decision 14)', async () => {
    // The route calls servedEdit.saveOnServedBase through the module object, so wrap the real one and return
    // its result with one property the route never reads and the builder does.
    const real = servedEdit.saveOnServedBase;
    const saveSpy = vi.spyOn(servedEdit, 'saveOnServedBase').mockImplementation((input) =>
      Object.defineProperty({ ...real(input) }, 'supersededAcceptanceIds', {
        enumerable: true,
        get() {
          throw new TypeError('boom');
        },
      })
    );
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      const base = await served(ED1, 'i');
      const lossCount = losses().length;
      const mark = eventMark();
      const r = await post(ED1, {
        segmentId: id('i'),
        editedContent: 'IS i ný',
        baseSha256: base,
        clientActionId: act(),
      });
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(SAVE_KEYS);
      expect(rowsHolding('IS i ný').map((x) => x.id)).toEqual([r.body.editId]); // the real save ran
      expect(eventsSince(mark)).toEqual([]);
      const gained = losses().slice(lossCount);
      expect(gained).toHaveLength(1);
      expect(gained[0]).toMatchObject({
        interval_id: INT1,
        event_type: 'edit-save',
        error_class: 'other',
      });
      expect(errorSpy.mock.calls.map((c) => c[0])).toContainEqual({
        errorCode: 'TypeError',
        eventType: 'edit-save',
        book: CHEM,
      });
    } finally {
      saveSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('a non-string note never loses the act (final review M7)', () => {
  it('a numeric editorNote: one edit-save with the note as length and hash, no loss', async () => {
    const lossCount = losses().length;
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('n'),
      editedContent: 'IS n ný',
      baseSha256: await served(ED1, 'n'),
      editorNote: 5, // no route check refuses it, and the service stores it (as TEXT)
      clientActionId: act(),
    });
    expect(r.status).toBe(200);
    // The row and the event differ, and this pins both: better-sqlite3 binds the number as REAL, which the TEXT
    // column renders '5.0', while the emitter stringifies the JSON value. A rebuild comparing note hashes
    // (researchRebuild.cjs) would not reconcile such a row; reported to the controller, not resolved here.
    expect(pendingRowOf('p-ed1', 'n').editor_note).toBe('5.0');
    const ev = eventsSince(mark);
    expect(ev.map((e) => e.event_type)).toEqual(['edit-save']);
    expect(ev[0].content.note).toEqual({ length: 1, sha256: sha256Text('5') });
    expect(losses().slice(lossCount)).toEqual([]);
  });
});

describe('a save over an edit the page never showed (interface audit 2026-11-13, ED-05)', () => {
  it('UNSEEN_EDIT is logged with its reason and both hashes, never the text', async () => {
    const stale = await view(ED1, 'o'); // a page that shows no edit on o
    expect(stale.row).toBeNull();
    const elsewhere = await saveShowing(ED1, 'o', 'o flipi 1'); // the same person, from another tab
    expect(elsewhere.status).toBe(200);
    const mark = eventMark();
    const r = await post(ED1, {
      segmentId: id('o'),
      editedContent: 'SENTINEL-REFUSED-UNSEEN',
      baseSha256: stale.baseSha256,
      clientActionId: act(),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('UNSEEN_EDIT');
    const ev = eventsSince(mark);
    expect(ev.map((e) => [e.event_type, e.segment_id])).toEqual([['write-refused', id('o')]]);
    expect(ev[0].detail).toEqual({
      reason: 'UNSEEN_EDIT',
      echoedSha256: null,
      currentSha256: sha256Text('o flipi 1'),
      action: 'save',
    });
    expect(researchBytes().includes('SENTINEL-REFUSED-UNSEEN')).toBe(false);
    expect(pendingRowOf('p-ed1', 'o').edited_content).toBe('o flipi 1'); // the first tab's text stands
  });
});
