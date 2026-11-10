/**
 * G1.23 PR2 Task 1: a segment save records which AI suggestion groups it took
 * (`segment_edits.accepted_suggestions`; spec §7, controller rulings R4–R7, R16).
 *
 * A real migrated database (SESSIONS_DB_PATH in a temp dir) and one synthetic chemistry-like module
 * under a temp books root, shared by the segment loader and by suggestionLogs (its change log and
 * revision sit under that root's 02-mt-revised). Saves go through saveOnServedBase, the one writer.
 * Every "dropped" case has a sibling that is kept, and lists are compared by value.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
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

function plantLog(book = BOOK) {
  const dir = path.join(root, book, '02-mt-revised', 'ch01');
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
    save({ editorId: B, editorUsername: 'B', editedContent: 'alpha beta gamma!' });
    const bRows = db
      .prepare("SELECT * FROM segment_edits WHERE editor_id = ? AND status = 'pending'")
      .all(B);
    const before = offeredKeys({});
    expect(before).toEqual([KEY.a, KEY.b]); // control: both groups are offered first
    expect(offeredKeys({ [SEG]: bRows })).toEqual([KEY.a, KEY.b]); // ... to B with his pending edit too
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 2, alreadyClosed: 0 });
    expect(rejections()).toEqual([
      { op: OP.a1, ruling: 'r-a', by: A },
      { op: OP.a2, ruling: 'r-a', by: A },
    ]);
    // Editor A (no rows) and editor B (a pending edit that took nothing) both lose group a only.
    expect(bRows).toHaveLength(1);
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
    // a1 was closed, so group a was not on offer: a2's claim is mismatch (kills offeredOpIds = own ops).
    expect(recorded.map((e) => e.items[0].claim)).toEqual(['mismatch']);
    const sibling = await post({ groupKey: KEY.b });
    expect(sibling.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    expect(recorded.map((e) => e.items[0].claim)).toEqual(['mismatch', 'validated']); // b was on offer
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
    // Offered on the CURRENT base, whatever the screen echoed (kills a lookup on the echoed base).
    expect(recorded[0].items[0].claim).toBe('validated');
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
    // A real organic log, keyed exactly as the request names it: only the guard in readModuleLog refuses it.
    plantLog('lifraen-efnafraedi');
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
    rmSync(path.join(root, 'lifraen-efnafraedi'), { recursive: true, force: true });
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

  it('R17: a module whose switch is off can still be rejected; rows are written and every claim is mismatch', async () => {
    // Positive control: the same reject while the module is on reads validated.
    await post({});
    expect(recorded.map((e) => e.items[0].claim)).toEqual(['validated', 'validated']);
    db.exec('DELETE FROM suggestion_rejections');
    recorded.length = 0;
    db.prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 0, 5000)"
    ).run(BOOK);
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 2, alreadyClosed: 0 });
    expect(rejections().map((r) => r.op)).toEqual([OP.a1, OP.a2]);
    expect(recorded.map((e) => e.items[0].claim)).toEqual(['mismatch', 'mismatch']);
  });

  it('a module whose files are gone answers 404 like the save, and writes nothing; a present one rejects', async () => {
    const enPath = path.join(root, BOOK, '02-for-mt', 'ch01', `${MODULE}-segments.en.md`);
    const keep = readFileSync(enPath);
    rmSync(enPath);
    try {
      const res = await post({});
      expect(res.status).toBe(404);
      expect(rejections()).toEqual([]);
    } finally {
      writeFileSync(enPath, keep);
    }
    expect((await post({})).status).toBe(200); // control
  });

  it('a failing offered-set check never fails the reject: rows are written, claims are unverified, a warning names the place', async () => {
    const ctx = vi.spyOn(suggestionView, 'moduleContext').mockImplementation(() => {
      throw Object.assign(new Error('boom: secret text'), { code: 'SQLITE_BUSY' });
    });
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 2, alreadyClosed: 0 });
    expect(rejections().map((r) => r.op)).toEqual([OP.a1, OP.a2]);
    expect(recorded.map((e) => e.items[0].claim)).toEqual(['unverified', 'unverified']);
    const calls = warn.mock.calls.filter((c) =>
      JSON.stringify(c).includes('claims are unverified')
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      reason: 'SQLITE_BUSY',
    });
    expect(JSON.stringify(calls[0])).not.toContain('secret');
    // Control: the check back, the next reject is validated.
    ctx.mockRestore();
    await post({ groupKey: KEY.b });
    expect(recorded.at(-1).items[0].claim).toBe('validated');
  });

  it("has the save route's middleware stack, and the check can see a different one", () => {
    const router = require('../routes/segment-editor');
    const stackOf = (p) =>
      router.stack
        .find((l) => l.route && l.route.path === p && l.route.methods.post)
        .route.stack.map((l) => l.handle)
        .slice(0, -1);
    const save = stackOf('/:book/:chapter/:moduleId/edit');
    const rej = stackOf('/:book/:chapter/:moduleId/suggestions/reject');
    expect(rej).toHaveLength(save.length);
    expect(rej).toHaveLength(4);
    // The shared middleware are the same functions; requireBookAccess() builds a closure per call, so
    // that one is compared by source.
    expect(rej.map((h) => h.name)).toEqual(save.map((h) => h.name));
    expect(rej[0]).toBe(save[0]);
    expect(rej[1]).toBe(save[1]);
    expect(String(rej[2])).toBe(String(save[2]));
    expect(rej[3]).toBe(save[3]);
    // Control: another route's stack is seen as different.
    const other = stackOf('/edit/:editId/approve');
    expect(other.length === save.length && other.every((h, i) => h === save[i])).toBe(false);
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

describe('a rejection through the real research log (spec §5.9)', () => {
  const { handlerFor, invoke } = require('./helpers/servedFixture');
  const researchDb = require('../services/researchDb');
  const researchConsentText = require('../lib/researchConsentText');
  const serverCommit = require('../lib/serverCommit');
  const { APPROVED, makeUser, consent } = require('./helpers/researchFixture.cjs');
  const { eventMark, eventsSince, itemsOf } = require('./helpers/researchEventsFixture.cjs');
  const EDITOR = { id: A, username: 'A', role: 'editor', books: [] };

  beforeAll(() => {
    researchDb.openAtBoot();
    researchConsentText._setTestApprovedTexts(APPROVED);
    serverCommit._setTestServerCommit({
      serverCommit: 'c'.repeat(40),
      commitSource: 'deploy-file',
      codeDirty: 0,
    });
    consent(makeUser(A));
  });
  afterAll(() => {
    researchConsentText._setTestApprovedTexts(null);
    serverCommit._setTestServerCommit(null);
    researchDb._reset();
  });

  it("a consenting editor's reject is one suggestion-reject event with one rejected item per row", async () => {
    db.exec(
      `DELETE FROM suggestion_rejections; DELETE FROM suggestion_left_open;
       DELETE FROM module_opening_inflight; DELETE FROM module_openings; DELETE FROM book_switch_events;`
    );
    db.prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, 1000)"
    ).run(BOOK);
    db.prepare(
      'INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count) VALUES (?, 1, ?, 2000, 0)'
    ).run(BOOK, MODULE);
    const rejectRoute = handlerFor(
      require('../routes/segment-editor'),
      'post',
      '/:book/:chapter/:moduleId/suggestions/reject'
    );
    const mark = eventMark();
    const res = await invoke(rejectRoute, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
      body: {
        segmentId: SEG,
        occurrence: 0,
        groupKey: `${SEG}#0|r-b`,
        baseSha256: sha256Text(BASE),
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inserted: 1, alreadyClosed: 0 });
    const events = eventsSince(mark);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'suggestion-reject',
      editing_kind: 'suggestion_rejection',
    });
    const rowId = db.prepare('SELECT id FROM suggestion_rejections').get().id;
    expect(events[0].editing_id).toBe(BigInt(rowId));
    const items = itemsOf(events[0].id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ outcome: 'rejected', claim: 'validated', op_id: OP.b });
  });
});

describe('closing the open groups as left open at a finishing act (G1.23 PR2 task 4)', () => {
  const { handlerFor, invoke } = require('./helpers/servedFixture');
  const researchLog = require('../services/researchLog');
  const suggestionView = require('../services/suggestionView');
  const HEAD = { id: B, username: 'B', role: 'head-editor', books: [BOOK] };
  const EDITOR_A = { id: A, username: 'A', role: 'editor', books: [] };
  const OTHER = '9b2f6c1e-1c3d-4f55-8f0e-2d7a1b6c9e10';
  let accept;
  let approve;
  let rejectEdit;
  let unapprove;
  let revoke;
  let recorded;

  beforeAll(() => {
    const router = require('../routes/segment-editor');
    accept = handlerFor(router, 'post', '/:book/:chapter/:moduleId/accept');
    approve = handlerFor(router, 'post', '/edit/:editId/approve');
    rejectEdit = handlerFor(router, 'post', '/edit/:editId/reject');
    unapprove = handlerFor(router, 'post', '/edit/:editId/unapprove');
    revoke = handlerFor(router, 'post', '/acceptance/:id/revoke');
  });
  beforeEach(() => {
    db.exec(
      `DELETE FROM suggestion_rejections; DELETE FROM suggestion_left_open;
       DELETE FROM module_opening_inflight; DELETE FROM module_openings; DELETE FROM book_switch_events;`
    );
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

  const params = { book: BOOK, chapter: '1', moduleId: MODULE };
  const postAccept = (over = {}, user = EDITOR_A) =>
    invoke(accept, {
      params,
      chapterNum: 1,
      user,
      body: { segmentId: SEG, acceptedContent: BASE, ...over },
    });
  const postApprove = (id, user = HEAD) =>
    invoke(approve, { params: { editId: String(id) }, user, body: {} });
  const leftOpen = () => db.prepare('SELECT * FROM suggestion_left_open ORDER BY op_id').all();
  /** [opId, shown_at_finish] pairs, compared as a set. */
  const shownPairs = () =>
    leftOpen()
      .map((r) => [r.op_id, r.shown_at_finish])
      .sort();
  const leftOpenEvents = () => recorded.filter((e) => e.eventType === 'suggestion-left-open');
  /** A pending edit of SEG by A, with the ops it took. */
  const pendingEdit = (text, accepted) => {
    save({ editedContent: text, accepted });
    return rowOf(A);
  };

  it('Staðfesta MT closes every open group as left open, shown 1, and the acceptance still succeeds', async () => {
    const res = await postAccept();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const acc = db.prepare('SELECT * FROM segment_acceptances WHERE segment_id = ?').get(SEG);
    expect(shownPairs()).toEqual(
      [
        [OP.a1, 1],
        [OP.a2, 1],
        [OP.b, 1],
      ].sort()
    );
    expect(
      leftOpen().map((r) => [
        r.finishing_act,
        r.finishing_kind,
        r.finishing_id,
        r.closed_by,
        r.occurrence,
        r.segment_id,
      ])
    ).toEqual(Array(3).fill(['stadfesta-mt', 'segment_acceptance', acc.id, A, 0, SEG]));
    // Events: one per row, the place from the acceptance row, the act in the detail.
    expect(
      leftOpenEvents()
        .map((e) => [e.items[0].opId, e.detail.shownAtFinish])
        .sort()
    ).toEqual(
      [
        [OP.a1, true],
        [OP.a2, true],
        [OP.b, true],
      ].sort()
    );
    expect(new Set(leftOpenEvents().map((e) => e.detail.act))).toEqual(new Set(['stadfesta-mt']));
    expect(new Set(leftOpenEvents().map((e) => e.editingKind))).toEqual(
      new Set(['suggestion_left_open'])
    );
    expect(new Set(leftOpenEvents().map((e) => e.moduleId))).toEqual(new Set([MODULE]));
    expect(new Set(leftOpenEvents().map((e) => e.clientActionId))).toEqual(new Set([null]));
    expect(new Set(leftOpenEvents().map((e) => e.items[0].claim))).toEqual(new Set(['validated']));
    // Control: another segment's group is untouched by this acceptance.
    expect(leftOpen().filter((r) => r.segment_id === SEG2)).toEqual([]);
  });

  it('a repeated Staðfesta MT (alreadyAccepted) closes nothing new and emits nothing new', async () => {
    await postAccept();
    const rows = leftOpen().length;
    const events = leftOpenEvents().length;
    expect(rows).toBe(3);
    const again = await postAccept({}, { id: OTHER, username: 'O', role: 'editor', books: [] });
    expect(again.body.alreadyAccepted).toBe(true);
    expect(leftOpen()).toHaveLength(rows);
    expect(leftOpenEvents()).toHaveLength(events);
    // Control: a different segment's first acceptance closes its own group.
    const other = await postAccept({ segmentId: SEG2, acceptedContent: 'delta' });
    expect(other.body.alreadyAccepted).toBe(false);
    expect(
      leftOpen()
        .filter((r) => r.segment_id === SEG2)
        .map((r) => r.op_id)
    ).toEqual([OP.s2]);
  });

  it('a repeat Staðfesta MT with groups still open writes no left-open row and no event (the alreadyAccepted guard)', async () => {
    // The first accept closes nothing (switch off then), so the groups are still open on the
    // already-accepted segment when the switch comes back on: only the guard stops the repeat.
    db.prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 0, 2500)"
    ).run(BOOK);
    const first = await postAccept();
    expect(first.body.alreadyAccepted).toBe(false);
    expect(leftOpen()).toEqual([]);
    db.prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, 3000)"
    ).run(BOOK);
    const again = await postAccept({}, { id: OTHER, username: 'O', role: 'editor', books: [] });
    expect(again.body.alreadyAccepted).toBe(true);
    expect(leftOpen()).toEqual([]);
    expect(leftOpenEvents()).toEqual([]);
    // Control: with the switch on, a first accept of another segment does close its group.
    const other = await postAccept({ segmentId: SEG2, acceptedContent: 'delta' });
    expect(other.body.alreadyAccepted).toBe(false);
    expect(leftOpen().map((r) => r.op_id)).toEqual([OP.s2]);
    expect(leftOpenEvents().map((e) => e.items[0].opId)).toEqual([OP.s2]);
  });

  it('approval closes the groups the edit did not take, and leaves the accepted ones alone', async () => {
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1), entry(OP.a2)]);
    expect(listOf(edit).map((e) => e.opId)).toEqual([OP.a1, OP.a2]);
    const res = await postApprove(edit.id);
    expect(res.status).toBe(200);
    expect(shownPairs()).toEqual([[OP.b, 1]]); // group a was taken; group b was not, and still places
    const row = leftOpen()[0];
    expect([row.finishing_act, row.finishing_kind, row.finishing_id, row.closed_by]).toEqual([
      'approval',
      'segment_edit',
      edit.id,
      B,
    ]);
    expect(leftOpenEvents().map((e) => [e.items[0].opId, e.detail.act])).toEqual([
      [OP.b, 'approval'],
    ]);
    expect(leftOpenEvents()[0].editingId).toBe(row.id);
  });

  it('a group typed over before approval is closed with shown_at_finish 0; the control is shown', async () => {
    const edit = pendingEdit('ALFA zzz GAMMA', [entry(OP.a1), entry(OP.a2)]);
    await postApprove(edit.id);
    expect(shownPairs()).toEqual([[OP.b, 0]]);
    // Control: the same group with its find still in the text is shown.
    db.exec('DELETE FROM suggestion_left_open; DELETE FROM segment_edits');
    const kept = pendingEdit('ALFA beta GAMMA', [entry(OP.a1), entry(OP.a2)]);
    await postApprove(kept.id);
    expect(shownPairs()).toEqual([[OP.b, 1]]);
  });

  it('a dependent group not yet placeable at the finish is closed with shown_at_finish 0', async () => {
    // A second ruling's op on SEG2 whose find only exists once the first op has been applied.
    CHAINS[1].ops.push(['ch01/m95010/002.op2', 'r-b', 'DELTA', 'DELTA2']);
    try {
      plantLog();
      const res = await postAccept({ segmentId: SEG2, acceptedContent: 'delta' });
      expect(res.status).toBe(200);
      expect(shownPairs()).toEqual(
        [
          [OP.s2, 1],
          ['ch01/m95010/002.op2', 0],
        ].sort()
      );
    } finally {
      CHAINS[1].ops.pop();
      plantLog();
    }
  });

  it('a head editor rejecting the edit writes nothing, and its groups are offered again on the next serve', async () => {
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    const res = await invoke(rejectEdit, {
      params: { editId: String(edit.id) },
      user: HEAD,
      body: { note: 'nei' },
    });
    expect(res.status).toBe(200);
    expect(leftOpen()).toEqual([]);
    expect(leftOpenEvents()).toEqual([]);
    const offered = suggestionView
      .offeredForModule(db, {
        book: BOOK,
        chapter: 1,
        moduleId: MODULE,
        segments: [{ segmentId: SEG, occurrence: 0, baseSha256: sha256Text(BASE) }],
        editsBySegment: {
          [SEG]: [db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(edit.id)],
        },
      })
      .get(SEG)
      .groups.map((g) => g.key);
    expect(db.prepare('SELECT status FROM segment_edits WHERE id = ?').get(edit.id).status).toBe(
      'rejected'
    );
    expect(offered).toEqual([`${SEG}#0|r-a`, `${SEG}#0|r-b`]);
    // Control: approving a fresh edit does write.
    const next = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    await postApprove(next.id);
    expect(leftOpen().length).toBeGreaterThan(0);
  });

  it('revoking the acceptance or un-approving the edit does not reopen a left-open group', async () => {
    await postAccept();
    const acc = db.prepare('SELECT * FROM segment_acceptances WHERE segment_id = ?').get(SEG);
    const before = leftOpen();
    expect(before).toHaveLength(3);
    const rv = await invoke(revoke, {
      params: { id: String(acc.id) },
      user: { id: A, username: 'A', role: 'admin', books: [] },
      body: {},
    });
    expect(rv.status).toBe(200);
    expect(leftOpen()).toEqual(before);
  });

  it('un-approving an edit does not reopen the groups its approval closed', async () => {
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1), entry(OP.a2)]);
    await postApprove(edit.id);
    const afterApprove = leftOpen();
    expect(afterApprove.map((r) => r.op_id)).toEqual([OP.b]); // the approval itself closed b
    const un = await invoke(unapprove, {
      params: { editId: String(edit.id) },
      user: HEAD,
      body: {},
    });
    expect(un.status).toBe(200);
    expect(
      db.prepare('SELECT status FROM segment_edits WHERE id = ?').get(edit.id).status
    ).not.toBe('approved');
    expect(leftOpen()).toEqual(afterApprove);
  });

  it('a declining approver: rows written, no event', async () => {
    researchLog.record.mockImplementation(() => ({ status: 'skipped' }));
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1), entry(OP.a2)]);
    const res = await postApprove(edit.id);
    expect(res.status).toBe(200);
    expect(shownPairs()).toEqual([[OP.b, 1]]);
    expect(leftOpenEvents()).toEqual([]); // record declined; nothing captured
    // record was asked once per written left-open row (and the approval's own call is not counted).
    expect(
      researchLog.record.mock.calls.filter((c) => c[0].eventType === 'suggestion-left-open')
    ).toHaveLength(leftOpen().length);
    expect(leftOpen()).toHaveLength(1);
  });

  it('a row with a NULL served_version_id closes nothing and the act succeeds; a sibling with one closes', async () => {
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    db.prepare('UPDATE segment_edits SET served_version_id = NULL WHERE id = ?').run(edit.id);
    const res = await postApprove(edit.id);
    expect(res.status).toBe(200);
    expect(leftOpen()).toEqual([]);
    expect(warn.mock.calls.filter((c) => /Left open/.test(c[1]))).toEqual([]);
    // Control.
    const ok = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    await postApprove(ok.id);
    expect(leftOpen().length).toBeGreaterThan(0);
  });

  it('a failing closure write warns and the act still answers 200 with the same body shape', async () => {
    const good = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    db.exec(
      "CREATE TRIGGER lo_boom BEFORE INSERT ON suggestion_left_open BEGIN SELECT RAISE(ABORT, 'boom'); END"
    );
    let res;
    try {
      res = await postApprove(good.id);
    } finally {
      db.exec('DROP TRIGGER lo_boom');
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.edit.status).toBe('approved');
    expect(leftOpen()).toEqual([]);
    const warned = warn.mock.calls.filter((c) => /Left open/.test(c[1]));
    expect(warned).toHaveLength(1);
    expect(warned[0][0]).toMatchObject({
      book: BOOK,
      moduleId: MODULE,
      segmentId: SEG,
      act: 'approval',
    });
    expect(JSON.stringify(warned[0][0])).not.toMatch(/alpha|ALFA/);
    // Control: the same approval without the trigger writes.
    const next = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    await postApprove(next.id);
    expect(leftOpen().length).toBeGreaterThan(0);
  });

  it('an UNREADABLE accepted list counts as none: every open group closes (a, already in the text, shown 0) and one warning is logged', async () => {
    const edit = pendingEdit('ALFA beta GAMMA', [entry(OP.a1)]);
    db.prepare('UPDATE segment_edits SET accepted_suggestions = ? WHERE id = ?').run(
      'not json',
      edit.id
    );
    await postApprove(edit.id);
    expect(shownPairs()).toEqual(
      [
        [OP.a1, 0],
        [OP.a2, 0],
        [OP.b, 1],
      ].sort()
    );
    const warned = warn.mock.calls.filter((c) => /accepted_suggestions discarded/.test(c[1]));
    expect(warned).toHaveLength(1);
    expect(warned[0][0]).toMatchObject({ book: BOOK, moduleId: MODULE, segmentId: SEG });
    expect(JSON.stringify(warned[0][0])).not.toMatch(/not json/);
  });

  it('a group with an op already rejected is not closed again; its sibling is', async () => {
    db.prepare(
      `INSERT INTO suggestion_rejections (book, chapter, module_id, segment_id, occurrence, op_id,
         ruling_id, run_id, rejected_by, rejected_at_ms)
       VALUES (?, 1, ?, ?, 0, ?, 'r-a', 'run-1', ?, 3000)`
    ).run(BOOK, MODULE, SEG, OP.a1, OTHER);
    await postAccept();
    // Rejecting one op of the two-op group a closes the whole group: a2 is not closed again, b is.
    expect(shownPairs()).toEqual([[OP.b, 1]]);
    expect(leftOpen().map((r) => r.op_id)).not.toContain(OP.a2);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM suggestion_rejections WHERE op_id = ?').get(OP.a1).n
    ).toBe(1);
  });
});
