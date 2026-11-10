/**
 * G1.23 PR2 Task 2: the save-time claim check, CLAIM_VALIDATORS['ai-suggestion'] (spec §6, index decision 12;
 * controller ruling R8). emitSave is driven with researchLog.record stubbed to capture the event, after a real
 * saveOnServedBase save, on a temp DB with an eligible synthetic module under a temp books root.
 *
 * Every "not validated" assertion has a sibling item of the same save that IS validated, and claims are
 * compared by value (opId -> claim), never by count.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() is read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'suggestion-emission-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { sha256Text } = require('../lib/servedText');
const { writeModule } = require('./helpers/servedFixture');
const L = require('../lib/suggestionLogs');

const BOOK = 'efnafraedi-2e';
const MODULE = 'm95020';
const SEG = `${MODULE}:para:a`;
const A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const OP = {
  a: 'ch01/m95020/001.op1',
  b: 'ch01/m95020/001.op2',
  c: 'ch01/m95020/001.op3',
  d1: 'ch01/m95020/001.op4',
  d2: 'ch01/m95020/001.op5',
};
// Group B's find (ísómerum) occurs twice in the base (inside rúmísómerum) and once after group A is applied.
const BASE = 'rúmísómerum og ísómerum, sýra, efni og lausn';
const RULINGS = {
  rulings: [
    { id: 'r-a', en: ['spatial isomers'], is: 'rúmsamsætum' },
    { id: 'r-b', en: ['isomers'], is: 'samsætum' },
    { id: 'r-c', en: ['acid'], is: 'sýru' },
    { id: 'r-d', en: ['solution'], is: 'lausn' },
  ],
};
const OPS = [
  [OP.a, 'r-a', 'rúmísómerum', 'rúmsamsætum'],
  [OP.b, 'r-b', 'ísómerum', 'samsætum'],
  [OP.c, 'r-c', 'sýra', 'sýru'],
  [OP.d1, 'r-d', 'efni', 'EFNI'],
  [OP.d2, 'r-d', 'lausn', 'LAUSN'],
];
// Each text is the base with the named groups applied.
const T_A = 'rúmsamsætum og ísómerum, sýra, efni og lausn';
const T_AB = 'rúmsamsætum og samsætum, sýra, efni og lausn';
const T_ABC = 'rúmsamsætum og samsætum, sýru, efni og lausn';
const T_C = 'rúmísómerum og ísómerum, sýru, efni og lausn';
const T_AC = 'rúmsamsætum og ísómerum, sýru, efni og lausn';

function plantLog() {
  const dir = path.join(root, BOOK, '02-mt-revised', 'ch01');
  mkdirSync(dir, { recursive: true });
  const rulingBytes = JSON.stringify(RULINGS);
  writeFileSync(path.join(work, 'rulings.json'), rulingBytes);
  let text = BASE;
  const lines = OPS.map(([opId, rulingId, find, replace]) => {
    const after = text.replace(find, replace);
    const line = JSON.stringify({
      module: MODULE,
      segmentId: SEG,
      occurrence: 0,
      key: SEG,
      opId,
      source: 'ai',
      rulingId,
      category: 'term',
      find,
      replace,
      before: text,
      after,
      beforeSha256: sha256Text(text),
      afterSha256: sha256Text(after),
      runId: 'run-1',
    });
    text = after;
    return line;
  });
  writeFileSync(path.join(dir, `${MODULE}-changes.jsonl`), lines.join('\n') + '\n');
  writeFileSync(
    path.join(dir, `${MODULE}-revision.json`),
    JSON.stringify({
      schema: 'mt-revised/1',
      rulingSet: {
        path: 'rulings.json',
        sha256: crypto.createHash('sha256').update(rulingBytes).digest('hex'),
      },
    })
  );
}

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let servedEdit;
let researchEmission;
let researchLog;
let db;
let recorded;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  servedEdit = require('../services/servedEdit');
  researchEmission = require('../services/researchEmission');
  researchLog = require('../services/researchLog');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  db = segmentEditor.getDb();
  writeModule(root, {
    book: BOOK,
    chapterDir: 'ch01',
    moduleId: MODULE,
    en: [[SEG, 'EN a']],
    mt: [[SEG, BASE]],
  });
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  segmentEditor.getDb().close();
  segmentEditor._setTestDb(null);
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  plantLog();
  L._setTestRoots({ booksRoot: root, repoRoot: work });
  db.exec(
    `DELETE FROM segment_acceptances; DELETE FROM segment_edits; DELETE FROM suggestion_rejections;
     DELETE FROM suggestion_left_open; DELETE FROM module_opening_inflight; DELETE FROM module_openings;
     DELETE FROM book_switch_events;`
  );
  // Eligible: switched on, then the module opened, nothing in flight.
  db.prepare(
    "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, 1000)"
  ).run(BOOK);
  db.prepare(
    'INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count) VALUES (?, 1, ?, 2000, 0)'
  ).run(BOOK, MODULE);
  recorded = [];
  vi.spyOn(researchLog, 'record').mockImplementation((event) => {
    recorded.push(event);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  L._setTestRoots(null);
});

/** A real editor save. */
function save(over = {}) {
  return servedEdit.saveOnServedBase({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId: SEG,
    editedContent: T_ABC,
    editorId: A,
    editorUsername: 'A',
    origin: 'editor-save',
    requireEcho: false,
    ...over,
  });
}
/** A save that displays another row (or the caller's own), with the echo the server requires. */
const saveDisplaying = (shown, over) =>
  save({
    requireEcho: true,
    baseSha256: sha256Text(BASE),
    displayedEditId: shown.id,
    displayedEditSha256: sha256Text(shown.edited_content),
    ...over,
  });
const rowOf = (editorId) =>
  db
    .prepare('SELECT * FROM segment_edits WHERE editor_id = ? AND segment_id = ?')
    .get(editorId, SEG);
const item = (opId, over = {}) => ({
  itemType: 'ai-suggestion',
  source: null,
  clientTimeMs: 5,
  opId,
  occurrence: 0,
  ...over,
});

/** emitSave for a finished save; the captured event. */
function emit(saved, text, assists, userId = A) {
  recorded.length = 0;
  const req = {
    user: { id: userId },
    params: { book: BOOK, moduleId: MODULE },
    chapterNum: 1,
    body: { assists },
  };
  researchEmission.emitSave(req, { segmentId: SEG, editedContent: text, saved });
  expect(recorded).toHaveLength(1);
  return recorded[0];
}
/** The claims of an emitted event, as { opId -> claim }. */
const claimsOf = (event) => Object.fromEntries(event.items.map((i) => [i.opId, i.claim]));
/** Save and emit in one step. */
function run(text, assists, over = {}) {
  const saved = save({ editedContent: text, ...over });
  return claimsOf(emit(saved, text, assists));
}

describe('a claimed group is checked against the log and the text on screen', () => {
  it('a group accepted on the base and saved is validated, the unclaimed rest is not mentioned', () => {
    expect(run(T_AC, [item(OP.a), item(OP.c)])).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'validated',
    });
  });

  it('a dependent pair accepted in one pane is validated, both ops (Review Focus 2)', () => {
    expect(run(T_ABC, [item(OP.a), item(OP.b), item(OP.c)])).toEqual({
      [OP.a]: 'validated',
      [OP.b]: 'validated',
      [OP.c]: 'validated',
    });
  });

  it('the dependent group claimed alone does not place on the base: mismatch; its sibling is validated', () => {
    // ísómerum occurs twice in the base until group A is applied.
    const T = 'rúmísómerum og samsætum, sýru, efni og lausn';
    expect(run(T, [item(OP.b), item(OP.c)])).toEqual({
      [OP.b]: 'mismatch',
      [OP.c]: 'validated',
    });
  });

  it('a placed group whose replace text was typed away is mismatch, yet the group depending on it is validated (R8)', () => {
    // A, B (depends on A) and C all claimed; the editor then typed A's word back by hand.
    const T = 'rúmísómerum og samsætum, sýru, efni og lausn';
    const all = [item(OP.a), item(OP.b), item(OP.c)];
    expect(run(T, all)).toEqual({ [OP.a]: 'mismatch', [OP.b]: 'validated', [OP.c]: 'validated' });
  });

  it('control: the full A+B+C text validates all three', () => {
    expect(run(T_ABC, [item(OP.a), item(OP.b), item(OP.c)])).toEqual({
      [OP.a]: 'validated',
      [OP.b]: 'validated',
      [OP.c]: 'validated',
    });
  });

  it('an op another editor rejected before this save is mismatch, and the save itself is untouched (Review Focus 1)', () => {
    // A rejected group A; B's save then claims A, the dependent B and the sibling C.
    db.prepare(
      `INSERT INTO suggestion_rejections (book, chapter, module_id, segment_id, occurrence, op_id,
         ruling_id, run_id, rejected_by, rejected_at_ms) VALUES (?, 1, ?, ?, 0, ?, 'r-a', 'run-1', ?, 2500)`
    ).run(BOOK, MODULE, SEG, OP.a, A);
    const claimed = [OP.a, OP.b, OP.c].map((opId) => ({ opId, occurrence: 0 }));
    const saved = save({
      editedContent: T_ABC,
      editorId: B,
      editorUsername: 'B',
      acceptedSuggestions: claimed,
    });
    expect(saved.outcome).toBe('inserted');
    const event = emit(saved, T_ABC, [item(OP.a), item(OP.b), item(OP.c)], B);
    expect(claimsOf(event)).toEqual({
      [OP.a]: 'mismatch',
      [OP.b]: 'mismatch',
      [OP.c]: 'validated',
    });
    // The row is as saved: its text is kept and its list still names every op whose replace is in the text.
    expect(rowOf(B).edited_content).toBe(T_ABC);
    expect(JSON.parse(rowOf(B).accepted_suggestions)).toEqual(claimed);
  });

  it('an op whose replace text is not in the saved text is mismatch; its sibling is validated', () => {
    // The editor claimed C but saved the text without it.
    expect(run(T_A, [item(OP.a), item(OP.c)])).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'mismatch',
    });
  });

  it('an op that is not in the module log is mismatch; its sibling is validated', () => {
    expect(run(T_AC, [item(OP.a), item('ch01/m95020/999.op9')])).toEqual({
      [OP.a]: 'validated',
      ['ch01/m95020/999.op9']: 'mismatch',
    });
  });

  it('one op claimed out of a two-change group is mismatch; the whole group is validated', () => {
    const T = 'rúmsamsætum og ísómerum, sýra, EFNI og LAUSN';
    expect(run(T, [item(OP.a), item(OP.d1)])).toEqual({
      [OP.a]: 'validated',
      [OP.d1]: 'mismatch',
    });
    // Control: both ops of the group claimed, C not claimed at all.
    expect(run(T, [item(OP.d1), item(OP.d2)])).toEqual({
      [OP.d1]: 'validated',
      [OP.d2]: 'validated',
    });
  });

  it('an item whose occurrence differs from the save is mismatch (R8a); its sibling is validated', () => {
    expect(run(T_AC, [item(OP.a), item(OP.c, { occurrence: 1 })])).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'mismatch',
    });
  });

  it('the same op claimed under another occurrence is mismatch while its occurrence-0 claim is validated', () => {
    const saved = save({ editedContent: T_AC });
    const event = emit(saved, T_AC, [item(OP.c), item(OP.c, { occurrence: 1 })]);
    expect(event.items.map((i) => [i.opId, i.occurrence, i.claim])).toEqual([
      [OP.c, 0, 'validated'],
      [OP.c, 1, 'mismatch'],
    ]);
  });

  it('a part-claimed group is not taken whole by a claim under another occurrence (R8a)', () => {
    const T = 'rúmsamsætum og ísómerum, sýra, EFNI og LAUSN';
    const saved = save({ editedContent: T });
    const event = emit(saved, T, [item(OP.d1), item(OP.d2, { occurrence: 1 }), item(OP.a)]);
    expect(event.items.map((i) => [i.opId, i.occurrence, i.claim])).toEqual([
      [OP.d1, 0, 'mismatch'],
      [OP.d2, 1, 'mismatch'],
      [OP.a, 0, 'validated'],
    ]);
  });

  it('rule-suggestion is still mismatch; an ai-suggestion sibling is validated', () => {
    const claims = run(T_AC, [item(OP.a), item(OP.c, { itemType: 'rule-suggestion' })]);
    expect(claims).toEqual({ [OP.a]: 'validated', [OP.c]: 'mismatch' });
  });
});

describe('the text that was on screen', () => {
  it("a re-save replays on the caller's own previous row: a change it already made does not place again", () => {
    save({ editedContent: T_C }); // A's own pending row already has C applied
    const shown = rowOf(A);
    const saved = saveDisplaying(shown, { editedContent: T_AC });
    expect(saved.outcome).toBe('updated');
    expect(saved.displayed.editId).toBe(shown.id);
    // On the base, C would place and validate; on the screen text (T_C) its find is gone.
    expect(claimsOf(emit(saved, T_AC, [item(OP.a), item(OP.c)]))).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'mismatch',
    });
  });

  it("another editor's displayed row is the screen text", () => {
    save({ editedContent: T_C, editorId: B, editorUsername: 'B' });
    const shown = rowOf(B);
    const saved = saveDisplaying(shown, { editedContent: T_AC });
    expect(saved.displayed.editId).toBe(shown.id);
    expect(claimsOf(emit(saved, T_AC, [item(OP.a), item(OP.c)]))).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'mismatch',
    });
  });

  it('the control: with the base on screen the same claims are both validated', () => {
    expect(run(T_AC, [item(OP.a), item(OP.c)])).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'validated',
    });
  });

  it('a displayed row that cannot be found leaves every ai-suggestion item unverified', () => {
    save({ editedContent: T_C, editorId: B, editorUsername: 'B' });
    const shown = rowOf(B);
    const saved = saveDisplaying(shown, { editedContent: T_AB });
    // Control: with the row there, A (which places on T_C) is validated.
    expect(claimsOf(emit(saved, T_AB, [item(OP.a), item(OP.b)]))).toEqual({
      [OP.a]: 'validated',
      [OP.b]: 'validated',
    });
    db.prepare('DELETE FROM segment_edits WHERE id = ?').run(shown.id);
    expect(claimsOf(emit(saved, T_AB, [item(OP.a), item(OP.b)]))).toEqual({
      [OP.a]: 'unverified',
      [OP.b]: 'unverified',
    });
  });
});

describe('a check that cannot run', () => {
  it('a throw inside one call is not memoized: the first item is unverified, the next is checked again', () => {
    const view = require('../services/suggestionView');
    const real = view.checkAcceptedGroups;
    const spy = vi.spyOn(view, 'checkAcceptedGroups').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    spy.mockImplementation(real);
    const saved = save({ editedContent: T_AC });
    const event = emit(saved, T_AC, [item(OP.a), item(OP.c)]);
    expect(event.items.map((i) => [i.opId, i.claim])).toEqual([
      [OP.a, 'unverified'],
      [OP.c, 'validated'],
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('the check runs once per save when it succeeds', () => {
    const view = require('../services/suggestionView');
    const spy = vi.spyOn(view, 'checkAcceptedGroups');
    const saved = save({ editedContent: T_AC });
    expect(claimsOf(emit(saved, T_AC, [item(OP.a), item(OP.c)]))).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'validated',
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a database error during the check marks the item unverified, and nothing else changes', () => {
    const saved = save({ editedContent: T_AC });
    const assists = [item(OP.a), item(OP.c)];
    const rowBefore = rowOf(A);
    const good = emit(saved, T_AC, assists);
    expect(claimsOf(good)).toEqual({ [OP.a]: 'validated', [OP.c]: 'validated' });

    db.exec('ALTER TABLE suggestion_rejections RENAME TO suggestion_rejections_gone');
    let broken;
    try {
      broken = emit(saved, T_AC, assists);
    } finally {
      db.exec('ALTER TABLE suggestion_rejections_gone RENAME TO suggestion_rejections');
    }
    expect(claimsOf(broken)).toEqual({ [OP.a]: 'unverified', [OP.c]: 'unverified' });
    const strip = (e) => ({ ...e, items: e.items.map(({ claim: _claim, ...rest }) => rest) });
    expect(strip(broken)).toEqual(strip(good));
    expect(rowOf(A)).toEqual(rowBefore);
    // A fresh check after the table is back validates again.
    expect(claimsOf(emit(saved, T_AC, assists))).toEqual({
      [OP.a]: 'validated',
      [OP.c]: 'validated',
    });
  });
});

describe('suggestion-reject events', () => {
  const suggestionView = require('../services/suggestionView');
  const groupD = () =>
    L.keptGroups(L.readModuleLog({ book: BOOK, chapter: 1, moduleId: MODULE }))
      .get(`${SEG}#0`)
      .find((g) => g.rulingId === 'r-d');
  /** recordRejection for group d (two changes), the way the route does. */
  const rejectD = () =>
    suggestionView.recordRejection(db, {
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      occurrence: 0,
      group: groupD(),
      rejectedBy: A,
      nowMs: 5000,
    });
  const reqWith = (body) => ({
    user: { id: A },
    params: { book: BOOK, moduleId: MODULE },
    chapterNum: 1,
    body,
  });
  const act = (rows, over = {}) => ({
    rows,
    servedVersionId: 11,
    offeredOpIds: [OP.d1, OP.d2],
    groupActionId: 'g-9',
    echoedBaseSha256: sha256Text(BASE),
    baseMismatch: false,
    ...over,
  });

  it('each event has its own client action id and one item', () => {
    const { rows } = rejectD();
    expect(rows.map((r) => r.op_id)).toEqual([OP.d1, OP.d2]);
    researchEmission.emitSuggestionReject(reqWith({ clientActionId: 'click-1' }), act(rows));
    expect(recorded.map((e) => e.clientActionId)).toEqual([`click-1:${OP.d1}`, `click-1:${OP.d2}`]);
    expect(recorded.map((e) => e.items.map((i) => i.opId))).toEqual([[OP.d1], [OP.d2]]);
    expect(recorded.map((e) => e.editingId)).toEqual(rows.map((r) => r.id));
    expect(recorded[0]).toMatchObject({
      eventType: 'suggestion-reject',
      editingKind: 'suggestion_rejection',
      segmentId: SEG,
      occurrence: 0,
      servedVersionId: 11,
      actorProviderId: A,
    });
    expect(recorded[0].items[0]).toEqual({
      itemType: 'ai-suggestion',
      source: 'ai',
      clientTimeMs: null,
      detail: {},
      opId: OP.d1,
      occurrence: 0,
      category: 'term',
      runId: 'run-1',
      groupActionId: 'g-9',
      rulingId: 'r-d',
      ruleId: null,
      claim: 'validated',
    });
  });

  it('no client id, and an id too long to compose, give null (never a truncated id)', () => {
    const { rows } = rejectD();
    researchEmission.emitSuggestionReject(reqWith({}), act(rows));
    expect(recorded.map((e) => e.clientActionId)).toEqual([null, null]);
    recorded.length = 0;
    // 127 characters fit alone but not with ":<opId>" appended.
    researchEmission.emitSuggestionReject(reqWith({ clientActionId: 'x'.repeat(127) }), act(rows));
    expect(recorded.map((e) => e.clientActionId)).toEqual([null, null]);
    recorded.length = 0;
    // Control: a short id composes.
    researchEmission.emitSuggestionReject(reqWith({ clientActionId: 'ok' }), act(rows));
    expect(recorded.map((e) => e.clientActionId)).toEqual([`ok:${OP.d1}`, `ok:${OP.d2}`]);
  });

  it('claims: an op in the offered set is validated, one not in it is mismatch', () => {
    const { rows } = rejectD();
    researchEmission.emitSuggestionReject(reqWith({}), act(rows, { offeredOpIds: [OP.d1] }));
    expect(Object.fromEntries(recorded.map((e) => [e.items[0].opId, e.items[0].claim]))).toEqual({
      [OP.d1]: 'validated',
      [OP.d2]: 'mismatch',
    });
  });

  it('a stale base is carried in the detail, not refused', () => {
    const { rows } = rejectD();
    researchEmission.emitSuggestionReject(
      reqWith({}),
      act(rows, { echoedBaseSha256: null, baseMismatch: true })
    );
    expect(recorded.map((e) => e.detail)).toEqual(
      Array(2).fill({ echoedBaseSha256: null, baseMismatch: true })
    );
  });

  it('a declining editor: the rows are written and record skips the events', () => {
    researchLog.record.mockImplementation(() => ({ status: 'skipped' }));
    const { rows } = rejectD();
    expect(() => researchEmission.emitSuggestionReject(reqWith({}), act(rows))).not.toThrow();
    expect(
      db
        .prepare('SELECT op_id FROM suggestion_rejections ORDER BY op_id')
        .all()
        .map((r) => r.op_id)
    ).toEqual([OP.d1, OP.d2]);
    expect(researchLog.record).toHaveBeenCalledTimes(2); // asked once per row; the log decided
  });

  it('a request that cannot be read fails inside emit, never into the route', () => {
    // No place to count a loss against, so emit records nothing; the control is a good request.
    expect(() =>
      researchEmission.emitSuggestionReject({ user: { id: A }, params: null }, act([{ id: 1 }]))
    ).not.toThrow();
    expect(recorded).toEqual([]);
    const { rows } = rejectD();
    researchEmission.emitSuggestionReject(reqWith({}), act(rows));
    expect(recorded).toHaveLength(2);
  });
});

describe('suggestion-left-open events (G1.23 PR2 task 4)', () => {
  const suggestionView = require('../services/suggestionView');
  const reqWith = () => ({ user: { id: A }, params: { book: 'other-book', moduleId: 'zzz' } });
  /** closeLeftOpen for SEG on a real minted version, nothing taken. */
  const close = (over = {}) => {
    save({ editedContent: T_ABC });
    const edit = rowOf(A);
    return {
      edit,
      rows: suggestionView.closeLeftOpen(db, {
        book: BOOK,
        chapter: 1,
        moduleId: MODULE,
        segmentId: SEG,
        occurrence: edit.occurrence,
        servedVersionId: edit.served_version_id,
        act: 'approval',
        finishingKind: 'segment_edit',
        finishingId: edit.id,
        finishedText: BASE,
        acceptedOps: [],
        closedBy: A,
        nowMs: 5000,
        ...over,
      }),
    };
  };

  it('one event per row: its own place, editing reference, one validated item, act and shown flag in the detail', () => {
    const { edit, rows } = close({ acceptedOps: [OP.c] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.op_id)).not.toContain(OP.c); // the taken group is not closed
    researchEmission.emitSuggestionLeftOpen(reqWith(), {
      rows,
      act: 'approval',
      servedVersionId: edit.served_version_id,
    });
    expect(recorded.map((e) => e.items[0].opId)).toEqual(rows.map((r) => r.op_id));
    expect(recorded.map((e) => e.editingId)).toEqual(rows.map((r) => r.id));
    expect(recorded[0]).toMatchObject({
      eventType: 'suggestion-left-open',
      editingKind: 'suggestion_left_open',
      segmentId: SEG,
      occurrence: 0,
      servedVersionId: edit.served_version_id,
      actorProviderId: A,
      // The place is the row's, never the request's.
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      clientActionId: null,
      clientActionTime: null,
      replayed: false,
      content: null,
      before: null,
    });
    expect(recorded[0].items[0]).toEqual({
      itemType: 'ai-suggestion',
      source: 'ai',
      clientTimeMs: null,
      detail: {},
      opId: rows[0].op_id,
      occurrence: 0,
      category: 'term',
      runId: 'run-1',
      groupActionId: null,
      rulingId: rows[0].ruling_id,
      ruleId: null,
      claim: 'validated',
    });
    expect(
      Object.fromEntries(recorded.map((e) => [e.items[0].opId, e.detail.shownAtFinish]))
    ).toEqual(Object.fromEntries(rows.map((r) => [r.op_id, r.shown_at_finish === 1])));
    expect(new Set(recorded.map((e) => e.detail.act))).toEqual(new Set(['approval']));
  });

  it('shownAtFinish is true for a group still on the text and false for one typed over', () => {
    // Group d's finds (efni, lausn) are gone from this text; group c (sýra) still places.
    const { rows } = close({ finishedText: 'rúmísómerum og ísómerum, sýra, X og Y' });
    researchEmission.emitSuggestionLeftOpen(reqWith(), {
      rows,
      act: 'approval',
      servedVersionId: 1,
    });
    const shown = Object.fromEntries(
      recorded.map((e) => [e.items[0].opId, e.detail.shownAtFinish])
    );
    expect(shown[OP.c]).toBe(true);
    expect(shown[OP.d1]).toBe(false);
    expect(shown[OP.d2]).toBe(false);
  });

  it('a declining approver: the rows stay written and record skips the events', () => {
    researchLog.record.mockImplementation(() => ({ status: 'skipped' }));
    const { rows } = close();
    expect(() =>
      researchEmission.emitSuggestionLeftOpen(reqWith(), {
        rows,
        act: 'approval',
        servedVersionId: 1,
      })
    ).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM suggestion_left_open').get().n).toBe(rows.length);
    expect(researchLog.record).toHaveBeenCalledTimes(rows.length);
  });

  it('no rows, or an input that cannot be read, records nothing and never throws', () => {
    expect(() => researchEmission.emitSuggestionLeftOpen(reqWith(), undefined)).not.toThrow();
    expect(() =>
      researchEmission.emitSuggestionLeftOpen(reqWith(), { rows: [], act: 'approval' })
    ).not.toThrow();
    expect(() =>
      researchEmission.emitSuggestionLeftOpen(
        { params: null },
        { rows: [{ id: 1 }], act: 'approval' }
      )
    ).not.toThrow();
    expect(recorded).toEqual([]);
    // Control: a real row records.
    const { rows } = close();
    researchEmission.emitSuggestionLeftOpen(reqWith(), {
      rows,
      act: 'approval',
      servedVersionId: 1,
    });
    expect(recorded).toHaveLength(rows.length);
  });

  it('closeLeftOpen: a second close on the same segment inserts nothing (ON CONFLICT), a NULL occurrence closes nothing', () => {
    const first = close();
    expect(first.rows.length).toBeGreaterThan(0);
    const again = suggestionView.closeLeftOpen(db, {
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      occurrence: 0,
      servedVersionId: first.edit.served_version_id,
      act: 'approval',
      finishingKind: 'segment_edit',
      finishingId: first.edit.id,
      finishedText: BASE,
      acceptedOps: [],
      closedBy: B,
      nowMs: 6000,
    });
    expect(again).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM suggestion_left_open').get().n).toBe(
      first.rows.length
    );
    db.exec('DELETE FROM suggestion_left_open');
    const nullOcc = close({ occurrence: null });
    expect(nullOcc.rows).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM suggestion_left_open').get().n).toBe(0);
  });
});
