/**
 * G1.23 PR2 Task 1: a segment save records which AI suggestion groups it took
 * (`segment_edits.accepted_suggestions`; spec §7, controller rulings R4–R7, R16).
 *
 * A real migrated database (SESSIONS_DB_PATH in a temp dir) and one synthetic chemistry-like module
 * under a temp books root, shared by the segment loader and by suggestionLogs (its change log and
 * revision sit under that root's 02-mt-revised). Saves go through saveOnServedBase, the one writer.
 * Every "dropped" case has a sibling that is kept, and lists are compared by value.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath() is read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'suggestion-writes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const { sha256Text } = require('../lib/servedText');
const { writeModule } = require('./helpers/servedFixture');
const log = require('../lib/logger');
const L = require('../lib/suggestionLogs');

const BOOK = 'efnafraedi-2e';
const MODULE = 'm95010';
const SEG = `${MODULE}:para:a`;
const SEG2 = `${MODULE}:para:b`;
const A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const OP = {
  a1: 'ch01/m95010/001.op1',
  b: 'ch01/m95010/001.op2',
  a2: 'ch01/m95010/001.op3',
  s2: 'ch01/m95010/002.op1',
};
const BASE = 'alpha beta gamma';
const RULINGS = {
  rulings: [
    { id: 'r-a', en: ['alpha'], is: 'alfa' },
    { id: 'r-b', en: ['beta'], is: 'beta-is' },
  ],
};
const CHAINS = [
  {
    segmentId: SEG,
    base: BASE,
    ops: [
      [OP.a1, 'r-a', 'alpha', 'ALFA'],
      [OP.b, 'r-b', 'beta', 'BETA'],
      [OP.a2, 'r-a', 'gamma', 'GAMMA'],
    ],
  },
  { segmentId: SEG2, base: 'delta', ops: [[OP.s2, 'r-a', 'delta', 'DELTA']] },
];

function logLines() {
  const lines = [];
  for (const c of CHAINS) {
    let text = c.base;
    for (const [opId, rulingId, find, replace] of c.ops) {
      const after = text.replace(find, replace);
      lines.push(
        JSON.stringify({
          module: MODULE,
          segmentId: c.segmentId,
          occurrence: 0,
          key: c.segmentId,
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
        })
      );
      text = after;
    }
  }
  return lines;
}

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let servedEdit;
let propagationService;
let db;
let warn;

function plantLog() {
  const dir = path.join(root, BOOK, '02-mt-revised', 'ch01');
  mkdirSync(dir, { recursive: true });
  const rulingBytes = JSON.stringify(RULINGS);
  writeFileSync(path.join(work, 'rulings.json'), rulingBytes);
  writeFileSync(path.join(dir, `${MODULE}-changes.jsonl`), logLines().join('\n') + '\n');
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

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  servedEdit = require('../services/servedEdit');
  propagationService = require('../services/propagationService');
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
    en: [
      [SEG, 'EN a'],
      [SEG2, 'EN b'],
    ],
    mt: [
      [SEG, BASE],
      [SEG2, 'delta'],
    ],
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
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  L._setTestRoots(null);
});

const entry = (opId, occurrence = 0) => ({ opId, occurrence });
/** An editor save. `accepted` undefined means the key is absent (propagation, re-attach). */
function save(over = {}) {
  const { accepted, ...rest } = over;
  const input = {
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId: SEG,
    editedContent: 'ALFA beta gamma',
    editorId: A,
    editorUsername: 'A',
    origin: 'editor-save',
    requireEcho: false,
    ...rest,
  };
  if (accepted !== undefined) input.acceptedSuggestions = accepted;
  return servedEdit.saveOnServedBase(input);
}
const rowOf = (editorId = A, segmentId = SEG) =>
  db
    .prepare(
      `SELECT * FROM segment_edits WHERE editor_id = ? AND segment_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(editorId, segmentId);
const listOf = (row) =>
  row.accepted_suggestions === null ? null : JSON.parse(row.accepted_suggestions);

describe('what a save stores', () => {
  it('a save stores the accepted ops whose replace text is in the saved text', () => {
    save({ accepted: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });

  it('an op whose replace text is not in the saved text is dropped, its sibling that is kept stays', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1), entry(OP.b)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });

  it('the list is canonical JSON sorted by opId, each op once', () => {
    save({
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b), entry(OP.a1), entry(OP.b)],
    });
    expect(rowOf().accepted_suggestions).toBe(JSON.stringify([entry(OP.a1), entry(OP.b)]));
  });

  it('kept ops are sorted by opId even when claimed (and so inserted) out of order', () => {
    // Claimed order a2, b -> unsorted would be [a2, b]; sorted by opId is [b, a2].
    save({ editedContent: 'alpha BETA GAMMA', accepted: [entry(OP.a2), entry(OP.b)] });
    expect(listOf(rowOf())).toEqual([entry(OP.b), entry(OP.a2)]);
  });

  it('an op not in the module log for that segment is dropped, and the save still succeeds', () => {
    // OP.s2 is a real op of ANOTHER segment; the second is no op at all; the third is a control.
    const r = save({
      accepted: [entry(OP.s2), entry('ch01/m95010/999.op1'), entry(OP.a1)],
    });
    expect(r.outcome).toBe('inserted');
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });

  it("an entry for another occurrence is not this save's", () => {
    // OP.a1 at occurrence 1 would otherwise qualify (real op, its text is in the saved text); the
    // sibling at occurrence 0 is the positive control.
    save({ editedContent: 'ALFA BETA gamma', accepted: [entry(OP.a1, 1), entry(OP.b, 0)] });
    expect(listOf(rowOf())).toEqual([entry(OP.b, 0)]);
  });

  it('nothing kept stores NULL', () => {
    save({ accepted: [entry(OP.b)] }); // BETA is not in the text
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it('a claimed list on a module whose log is absent succeeds and stores NULL, and keeps once the log is back', () => {
    rmSync(path.join(root, BOOK, '02-mt-revised'), { recursive: true, force: true });
    const r = save({ accepted: [entry(OP.a1)] });
    expect(r.outcome).toBe('inserted');
    expect(rowOf().accepted_suggestions).toBeNull();
    // Control: with the log back, the same save keeps the op.
    plantLog();
    save({ editorId: B, editorUsername: 'B', accepted: [entry(OP.a1)] });
    expect(listOf(rowOf(B))).toEqual([entry(OP.a1)]);
  });

  it('a re-save over a list, with the log now unusable, writes NULL although its text still holds the words', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
    rmSync(path.join(root, BOOK, '02-mt-revised'), { recursive: true, force: true });
    // ALFA is still in the text, so the NULL comes from the log rule (R5), not from the text.
    const r = save({ editedContent: 'ALFA beta gamma!', accepted: [entry(OP.a1)] });
    expect(r.outcome).toBe('updated');
    expect(rowOf().edited_content).toBe('ALFA beta gamma!');
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it('a log that is malformed keeps nothing and does not fail the save', () => {
    writeFileSync(path.join(root, BOOK, '02-mt-revised', 'ch01', `${MODULE}-changes.jsonl`), 'x\n');
    const r = save({ accepted: [entry(OP.a1)] });
    expect(r.outcome).toBe('inserted');
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it('a log read that throws keeps nothing and does not fail the save', () => {
    const spy = vi.spyOn(L, 'readModuleLog').mockImplementation(() => {
      throw new Error('boom');
    });
    const r = save({ accepted: [entry(OP.a1)] });
    spy.mockRestore();
    expect(r.outcome).toBe('inserted');
    expect(rowOf().accepted_suggestions).toBeNull();
  });
});

describe('a re-save', () => {
  it('keeps the old list, adds the new, and drops one whose replace text is gone', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    // Re-save: ALFA still there (kept without being claimed), BETA claimed (added), and the text
    // no longer holds GAMMA, which was claimed too (dropped).
    save({
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b), entry(OP.a2)],
    });
    expect(listOf(rowOf())).toEqual([entry(OP.a1), entry(OP.b)]);
  });

  it('drops an old op whose words the new text no longer holds', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    save({ editedContent: 'alpha BETA gamma', accepted: [entry(OP.b)] });
    expect(listOf(rowOf())).toEqual([entry(OP.b)]);
  });

  it('where nothing survives writes NULL over a non-NULL list', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
    const r = save({ editedContent: 'alpha beta GAMMA!', accepted: [] });
    expect(r.outcome).toBe('updated');
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it('an unparseable previous list counts as none, warns without the value, and the save succeeds', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    db.prepare('UPDATE segment_edits SET accepted_suggestions = ? WHERE editor_id = ?').run(
      'not json',
      A
    );
    const r = save({ editedContent: 'ALFA BETA gamma', accepted: [entry(OP.b)] });
    expect(r.outcome).toBe('updated');
    expect(listOf(rowOf())).toEqual([entry(OP.b)]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('not json');
    // Names the place and a reason; never the value.
    expect(warn.mock.calls[0][0]).toMatchObject({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: SEG,
      reason: 'malformed',
    });
  });

  it('an unreadable own pending list that is also the displayed row warns exactly once', () => {
    save({ editedContent: 'ALFA beta gamma', accepted: [entry(OP.a1)] });
    db.prepare('UPDATE segment_edits SET accepted_suggestions = ? WHERE editor_id = ?').run(
      'not json',
      A
    );
    const shown = rowOf(A);
    const r = save({
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b)],
      requireEcho: true,
      baseSha256: sha256Text(BASE),
      displayedEditId: shown.id,
      displayedEditSha256: sha256Text(shown.edited_content),
    });
    expect(r.outcome).toBe('updated');
    expect(listOf(rowOf())).toEqual([entry(OP.b)]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a withdraw (text back to base) deletes the row with its list', () => {
    save({ accepted: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
    const r = save({ editedContent: BASE, accepted: [] });
    expect(r.outcome).toBe('withdrawn');
    expect(rowOf()).toBeUndefined();
  });
});

describe('writers that name no list leave the column alone', () => {
  it('saveOnServedBase with origin "propagation" and no list leaves the UPDATE untouched', () => {
    save({ accepted: [entry(OP.a1)] });
    const r = save({ origin: 'propagation', editedContent: 'ALFA beta gamma!' });
    expect(r.outcome).toBe('updated');
    expect(rowOf().edited_content).toBe('ALFA beta gamma!'); // control: the UPDATE did run
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });

  it('a first save with no list inserts NULL', () => {
    save({ origin: 'propagation' });
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it("propagationService's own UPDATE over a row holding a list leaves the list unchanged", () => {
    save({ accepted: [entry(OP.a1)] });
    save({ segmentId: SEG2, editedContent: 'DELTA', accepted: [entry(OP.s2)] });
    const before = [rowOf().accepted_suggestions, rowOf(A, SEG2).accepted_suggestions];
    const res = propagationService.createPropagatedEdits(db, {
      book: BOOK,
      editorId: A,
      editorUsername: 'A',
      propagatedText: 'ALFA beta gamma?',
      category: 'terminology',
      note: 'x',
      sourceEn: '',
      occurrences: [
        {
          chapter: 1,
          moduleId: MODULE,
          segmentId: SEG,
          currentIs: BASE,
          en: 'EN a',
          layer: 'mt-output',
          occurrence: 0,
          duplicated: false,
        },
      ],
    });
    expect(res.writes.map((w) => w.inPlace)).toEqual([true]); // the UPDATE path
    expect(rowOf().edited_content).toBe('ALFA beta gamma?'); // control: it did write
    expect(rowOf().accepted_suggestions).toBe(before[0]);
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
    // The sibling row was not part of the propagation and is as it was.
    expect(rowOf(A, SEG2).accepted_suggestions).toBe(before[1]);
  });
});

describe('an accepted suggestion is an assist only', () => {
  it('writes no acceptance row, and the edit stays pending', () => {
    save({ accepted: [entry(OP.a1)] });
    expect(db.prepare('SELECT COUNT(*) AS n FROM segment_acceptances').get().n).toBe(0);
    expect(rowOf().status).toBe('pending');
    // Control: the list is there, so the zero is not a missing feature.
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });
});

describe("another editor's pending edit under the saver", () => {
  /** A saves 'ALFA beta gamma' taking OP.a1; returns the echo B must send to save on top of it. */
  function bOn(editedContent, accepted) {
    save({ accepted: [entry(OP.a1)] });
    const shown = rowOf(A);
    return save({
      editorId: B,
      editorUsername: 'B',
      editedContent,
      accepted,
      requireEcho: true,
      baseSha256: sha256Text(BASE),
      displayedEditId: shown.id,
      displayedEditSha256: sha256Text(shown.edited_content),
    });
  }

  it("B saving on A's displayed pending edit keeps A's ops whose words survive, and adds B's own", () => {
    const r = bOn('ALFA BETA gamma', [entry(OP.b)]);
    expect(r.outcome).toBe('inserted');
    expect(listOf(rowOf(B))).toEqual([entry(OP.a1), entry(OP.b)]);
    // A's own row is untouched.
    expect(listOf(rowOf(A))).toEqual([entry(OP.a1)]);
  });

  it("drops A's op when B typed over its words, and keeps B's own", () => {
    const r = bOn('alpha BETA gamma', [entry(OP.b)]);
    expect(r.outcome).toBe('inserted');
    expect(listOf(rowOf(B))).toEqual([entry(OP.b)]);
  });

  it('the displayed row is not used when it is not in flight (a rejected row)', () => {
    save({ accepted: [entry(OP.a1)] });
    const shown = rowOf(A);
    db.prepare("UPDATE segment_edits SET status = 'rejected' WHERE id = ?").run(shown.id);
    save({
      editorId: B,
      editorUsername: 'B',
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b)],
      requireEcho: true,
      baseSha256: sha256Text(BASE),
      displayedEditId: shown.id,
      displayedEditSha256: sha256Text(shown.edited_content),
    });
    expect(listOf(rowOf(B))).toEqual([entry(OP.b)]);
  });
});

describe('R4: a displayed row that is in flight, whoever wrote it', () => {
  const echo = (shown) => ({
    requireEcho: true,
    baseSha256: sha256Text(BASE),
    displayedEditId: shown.id,
    displayedEditSha256: sha256Text(shown.edited_content),
  });
  const setRow = (id, status, appliedAt) =>
    db
      .prepare('UPDATE segment_edits SET status = ?, applied_at = ? WHERE id = ?')
      .run(status, appliedAt, id);

  it("another editor's approved, unapplied row is in flight: its op is kept; applied, it is not", () => {
    save({ accepted: [entry(OP.a1)] });
    const shown = rowOf(A);
    setRow(shown.id, 'approved', null);
    save({
      editorId: B,
      editorUsername: 'B',
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b)],
      ...echo(shown),
    });
    expect(listOf(rowOf(B))).toEqual([entry(OP.a1), entry(OP.b)]);
    // Negative: the same row, applied, is not in flight.
    db.exec("DELETE FROM segment_edits WHERE editor_id = '" + B + "'");
    setRow(shown.id, 'approved', '2026-11-10 10:00:00');
    save({
      editorId: B,
      editorUsername: 'B',
      editedContent: 'ALFA BETA gamma',
      accepted: [entry(OP.b)],
      ...echo(shown),
    });
    expect(listOf(rowOf(B))).toEqual([entry(OP.b)]);
  });

  it("the saving editor's own approved, unapplied row is in flight: its op is kept; applied, it is not", () => {
    save({ accepted: [entry(OP.a1)] });
    const shown = rowOf(A);
    setRow(shown.id, 'approved', null);
    // No pending row of A's is left, so the list can only come from the displayed row.
    save({ editedContent: 'ALFA BETA gamma', accepted: [entry(OP.b)], ...echo(shown) });
    expect(listOf(rowOf(A))).toEqual([entry(OP.a1), entry(OP.b)]);
    // Negative: applied, the row is history.
    db.exec("DELETE FROM segment_edits WHERE editor_id = '" + A + "'");
    save({ accepted: [entry(OP.a1)] });
    const shown2 = rowOf(A);
    setRow(shown2.id, 'approved', '2026-11-10 10:00:00');
    save({ editedContent: 'ALFA BETA gamma', accepted: [entry(OP.b)], ...echo(shown2) });
    expect(listOf(rowOf(A))).toEqual([entry(OP.b)]);
  });
});

describe('the route sanitises the body list', () => {
  const { handlerFor, invoke } = require('./helpers/servedFixture');
  let edit;
  beforeAll(() => {
    edit = handlerFor(
      require('../routes/segment-editor'),
      'post',
      '/:book/:chapter/:moduleId/edit'
    );
  });
  /** The route's save, by the real handler; the user's id is a GUID, as in production. */
  const post = (body, user = { id: A, username: 'A', role: 'editor', books: [] }) =>
    invoke(edit, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user,
      body: {
        segmentId: SEG,
        editedContent: 'ALFA BETA gamma',
        category: 'terminology',
        baseSha256: sha256Text(BASE),
        ...body,
      },
    });

  it('a whole well-formed list is passed on and stored', async () => {
    const res = await post({ acceptedSuggestions: [entry(OP.a1), entry(OP.b)] });
    expect(res.status).toBe(200);
    expect(listOf(rowOf())).toEqual([entry(OP.a1), entry(OP.b)]);
  });

  it.each([
    ['a non-array', 'ALFA'],
    ['one bad entry among good ones', [entry(OP.a1), { opId: OP.b, occurrence: -1 }]],
    ['a non-integer occurrence', [entry(OP.a1), { opId: OP.b, occurrence: 0.5 }]],
    ['an empty opId', [entry(OP.a1), { opId: '', occurrence: 0 }]],
    ['an opId over 128 characters', [entry(OP.a1), { opId: 'x'.repeat(129), occurrence: 0 }]],
    ['a non-string opId', [entry(OP.a1), { opId: 7, occurrence: 0 }]],
    ['more than 500 entries', Array.from({ length: 501 }, () => entry(OP.a1))],
  ])(
    '%s becomes [] (the save succeeds, nothing is claimed) and is never a 400',
    async (_n, bad) => {
      const res = await post({ acceptedSuggestions: bad });
      expect(res.status).toBe(200);
      expect(rowOf().accepted_suggestions).toBeNull();
      // Control: the whole good list in the same position IS kept (a different editor, so a new row).
      const ok = await post(
        { acceptedSuggestions: [entry(OP.a1)] },
        { id: B, username: 'B', role: 'editor', books: [] }
      );
      expect(ok.status).toBe(200);
      expect(listOf(rowOf(B))).toEqual([entry(OP.a1)]);
    }
  );

  it('no acceptedSuggestions key on a module whose log is absent: 200 and NULL', async () => {
    rmSync(path.join(root, BOOK, '02-mt-revised'), { recursive: true, force: true });
    const res = await post({});
    expect(res.status).toBe(200);
    expect(rowOf().accepted_suggestions).toBeNull();
    // Control: log back, a claimed list on the same shape of request is stored.
    plantLog();
    const ok = await post(
      { acceptedSuggestions: [entry(OP.a1)] },
      { id: B, username: 'B', role: 'editor', books: [] }
    );
    expect(ok.status).toBe(200);
    expect(listOf(rowOf(B))).toEqual([entry(OP.a1)]);
  });

  it('an absent list still recomputes: the route always passes an array', async () => {
    await post({ acceptedSuggestions: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
    await post({ editedContent: 'alpha beta GAMMA!' }); // no list at all
    expect(rowOf().accepted_suggestions).toBeNull();
  });
});

describe('rejecting a suggestion group (the route)', () => {
  const { handlerFor, invoke, writeModule: rewriteModule } = require('./helpers/servedFixture');
  const researchLog = require('../services/researchLog');
  const suggestionView = require('../services/suggestionView');
  const KEY = { a: `${SEG}#0|r-a`, b: `${SEG}#0|r-b`, s2: `${SEG2}#0|r-a` };
  const EDITOR_A = { id: A, username: 'A', role: 'editor', books: [] };
  const EDITOR_B = { id: B, username: 'B', role: 'editor', books: [] };
  let reject;
  let recorded;
  let record;

  beforeAll(() => {
    reject = handlerFor(
      require('../routes/segment-editor'),
      'post',
      '/:book/:chapter/:moduleId/suggestions/reject'
    );
  });
  beforeEach(() => {
    db.exec(
      `DELETE FROM suggestion_rejections; DELETE FROM suggestion_left_open;
       DELETE FROM module_opening_inflight; DELETE FROM module_openings; DELETE FROM book_switch_events;`
    );
    // Eligible: switched on, then the module opened with nothing in flight.
    db.prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, 1000)"
    ).run(BOOK);
    db.prepare(
      'INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count) VALUES (?, 1, ?, 2000, 0)'
    ).run(BOOK, MODULE);
    recorded = [];
    record = vi.spyOn(researchLog, 'record').mockImplementation((event) => {
      recorded.push(event);
    });
  });

  const post = (body, { user = EDITOR_A, book = BOOK } = {}) =>
    invoke(reject, {
      params: { book, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user,
      body: {
        segmentId: SEG,
        occurrence: 0,
        groupKey: KEY.a,
        baseSha256: sha256Text(BASE),
        ...body,
      },
    });
  const rejections = () =>
    db
      .prepare('SELECT * FROM suggestion_rejections ORDER BY op_id')
      .all()
      .map((r) => ({ op: r.op_id, ruling: r.ruling_id, by: r.rejected_by }));
  /** The group keys the module serve offers one editor on the base, given that editor's edit rows. */
  const offeredKeys = (editsBySegment) =>
    [
      ...suggestionView
        .offeredForModule(db, {
          book: BOOK,
          chapter: 1,
          moduleId: MODULE,
          segments: [{ segmentId: SEG, occurrence: 0, baseSha256: sha256Text(BASE) }],
          editsBySegment,
        })
        .get(SEG).groups,
    ].map((g) => g.key);

  it('writes one row per change and hides the group on the next serve, for every editor', async () => {
    const before = offeredKeys({});
    expect(before).toEqual([KEY.a, KEY.b]); // control: both groups are offered first
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 2, alreadyClosed: 0 });
    expect(rejections()).toEqual([
      { op: OP.a1, ruling: 'r-a', by: A },
      { op: OP.a2, ruling: 'r-a', by: A },
    ]);
    // Editor A (no rows) and editor B (a pending edit that took nothing) both lose group a only.
    save({ editorId: B, editorUsername: 'B', editedContent: 'alpha beta gamma!' });
    const bRows = db
      .prepare("SELECT * FROM segment_edits WHERE editor_id = ? AND status = 'pending'")
      .all(B);
    expect(offeredKeys({})).toEqual([KEY.b]);
    expect(offeredKeys({ [SEG]: bRows })).toEqual([KEY.b]);
  });

  it('a second reject of the same group inserts nothing and emits nothing', async () => {
    await post({});
    expect(recorded).toHaveLength(2);
    const again = await post({}, { user: EDITOR_B });
    expect(again.body).toEqual({ inserted: 0, alreadyClosed: 2 });
    expect(recorded).toHaveLength(2); // none added
    expect(rejections().map((r) => r.by)).toEqual([A, A]); // B's click changed nothing
    // Control: another group still rejects and emits.
    const other = await post({ groupKey: KEY.b }, { user: EDITOR_B });
    expect(other.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    expect(recorded).toHaveLength(3);
  });

  it('an op already left open is counted as closed and not inserted; a sibling group still is', async () => {
    db.prepare(
      `INSERT INTO suggestion_left_open (book, chapter, module_id, segment_id, occurrence, op_id, ruling_id,
         run_id, finishing_act, finishing_kind, finishing_id, closed_by, closed_at_ms, shown_at_finish)
       VALUES (?, 1, ?, ?, 0, ?, 'r-a', 'run-1', 'approval', 'segment_edit', 1, ?, 3000, 1)`
    ).run(BOOK, MODULE, SEG, OP.a1, B);
    const res = await post({});
    expect(res.body).toEqual({ inserted: 1, alreadyClosed: 1 });
    expect(rejections()).toEqual([{ op: OP.a2, ruling: 'r-a', by: A }]);
    expect(recorded.map((e) => e.items[0].opId)).toEqual([OP.a2]);
    const sibling = await post({ groupKey: KEY.b });
    expect(sibling.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    expect(rejections().map((r) => r.op)).toEqual([OP.b, OP.a2]); // by op id
  });

  it('a stale echoed base succeeds and its events carry baseMismatch true; the current base carries false', async () => {
    const stale = await post({ groupKey: KEY.b, baseSha256: sha256Text('some older text') });
    expect(stale.status).toBe(200);
    expect(stale.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    expect(recorded[0].detail).toEqual({
      echoedBaseSha256: sha256Text('some older text'),
      baseMismatch: true,
    });
    // A missing and a non-hash base are the same, and never a 400.
    for (const bad of [undefined, 7, 'not-a-hash']) {
      db.exec('DELETE FROM suggestion_rejections');
      recorded.length = 0;
      const r = await post({ groupKey: KEY.b, baseSha256: bad });
      expect(r.status).toBe(200);
      expect(recorded[0].detail).toEqual({ echoedBaseSha256: null, baseMismatch: true });
    }
    // Control: the current base.
    db.exec('DELETE FROM suggestion_rejections');
    recorded.length = 0;
    await post({ groupKey: KEY.b });
    expect(recorded[0].detail).toEqual({
      echoedBaseSha256: sha256Text(BASE),
      baseMismatch: false,
    });
  });

  it('events: one per inserted row, with the group rows, the served version and the claim against the offered set', async () => {
    await post({ groupActionId: 'g-1' });
    expect(
      recorded.map((e) => [
        e.eventType,
        e.editingKind,
        e.segmentId,
        e.occurrence,
        e.actorProviderId,
      ])
    ).toEqual([
      ['suggestion-reject', 'suggestion_rejection', SEG, 0, A],
      ['suggestion-reject', 'suggestion_rejection', SEG, 0, A],
    ]);
    const ids = db
      .prepare('SELECT id FROM suggestion_rejections ORDER BY op_id')
      .all()
      .map((r) => r.id);
    expect(recorded.map((e) => e.editingId)).toEqual(ids);
    const minted = db
      .prepare('SELECT id FROM served_text_versions WHERE segment_id = ?')
      .all(SEG)
      .map((r) => r.id);
    expect(minted).toHaveLength(1);
    expect(recorded.map((e) => e.servedVersionId)).toEqual([minted[0], minted[0]]);
    expect(recorded.map((e) => e.items[0])).toEqual([
      expect.objectContaining({
        opId: OP.a1,
        rulingId: 'r-a',
        runId: 'run-1',
        category: 'term',
        groupActionId: 'g-1',
        claim: 'validated',
      }),
      expect.objectContaining({ opId: OP.a2, claim: 'validated' }),
    ]);
  });

  it('an unknown group key is 404 SUGGESTION_UNKNOWN and writes nothing; a known one beside it works', async () => {
    const cases = [
      { groupKey: `${SEG}#0|r-nope` },
      { groupKey: KEY.s2 }, // another segment's group, asked for on this segment
      { occurrence: 1 }, // the right key at an occurrence the log does not hold
    ];
    for (const c of cases) {
      const res = await post(c);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'SUGGESTION_UNKNOWN' });
    }
    expect(rejections()).toEqual([]);
    expect(recorded).toEqual([]);
    expect((await post({ groupKey: KEY.b })).status).toBe(200); // control
    expect(rejections()).toEqual([{ op: OP.b, ruling: 'r-b', by: A }]);
  });

  it('organic is 404 with nothing placed and nothing written', async () => {
    const place = vi.spyOn(servedEdit, 'placeAndMintBase');
    const minted = () => db.prepare('SELECT COUNT(*) AS n FROM served_text_versions').get().n;
    const mintedBefore = minted();
    const res = await post({}, { book: 'lifraen-efnafraedi' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'SUGGESTION_UNKNOWN' });
    expect(place).not.toHaveBeenCalled();
    expect(rejections()).toEqual([]);
    expect(minted()).toBe(mintedBefore);
    // Control: the study book places and writes.
    expect((await post({})).status).toBe(200);
    expect(place).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no segmentId', { segmentId: undefined }],
    ['an empty segmentId', { segmentId: '' }],
    ['an over-long segmentId', { segmentId: 'x'.repeat(201) }],
    ['a negative occurrence', { occurrence: -1 }],
    ['a fractional occurrence', { occurrence: 0.5 }],
    ['a string occurrence', { occurrence: '0' }],
    ['no groupKey', { groupKey: undefined }],
    ['an over-long groupKey', { groupKey: 'k'.repeat(513) }],
  ])('%s is a 400 and writes nothing', async (_n, bad) => {
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(rejections()).toEqual([]);
    expect((await post({})).status).toBe(200); // control: the same request without the defect
  });

  it('a placement refusal answers through the refusal sender and writes nothing', async () => {
    // The log still holds SEG's groups, but the module no longer has the segment.
    rewriteModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: MODULE,
      en: [[SEG2, 'EN b']],
      mt: [[SEG2, 'delta']],
    });
    try {
      const res = await post({});
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'segment not found' });
      expect(rejections()).toEqual([]);
      expect(recorded).toEqual([]);
      // Control: the segment that is still there rejects.
      const ok = await post({ segmentId: SEG2, groupKey: KEY.s2, baseSha256: sha256Text('delta') });
      expect(ok.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    } finally {
      rewriteModule(root, {
        book: BOOK,
        chapterDir: 'ch01',
        moduleId: MODULE,
        en: [
          [SEG, 'EN a'],
          [SEG2, 'EN b'],
        ],
        mt: [
          [SEG, BASE],
          [SEG2, 'delta'],
        ],
      });
    }
  });

  it('the response is the same whatever record returned', async () => {
    const answers = [];
    for (const outcome of [{ status: 'recorded' }, { status: 'skipped' }, undefined, null]) {
      db.exec('DELETE FROM suggestion_rejections');
      record.mockImplementation(() => outcome);
      answers.push(await post({ groupKey: KEY.b }));
    }
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);
    expect(answers.map((a) => a.body)).toEqual(Array(4).fill({ inserted: 1, alreadyClosed: 0 }));
  });
});
