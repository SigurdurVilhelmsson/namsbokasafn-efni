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

  it('an op not in the module log for that segment is dropped, and the save still succeeds', () => {
    // OP.s2 is a real op of ANOTHER segment; the second is no op at all; the third is a control.
    const r = save({
      accepted: [entry(OP.s2), entry('ch01/m95010/999.op1'), entry(OP.a1)],
    });
    expect(r.outcome).toBe('inserted');
    expect(listOf(rowOf())).toEqual([entry(OP.a1)]);
  });

  it("an entry for another occurrence is not this save's", () => {
    save({ accepted: [entry(OP.a1, 1), entry(OP.a1, 0)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1, 0)]);
  });

  it('nothing kept stores NULL', () => {
    save({ accepted: [entry(OP.b)] }); // BETA is not in the text
    expect(rowOf().accepted_suggestions).toBeNull();
  });

  it('a save with no acceptedSuggestions on a module whose log is not ok succeeds and stores NULL', () => {
    rmSync(path.join(root, BOOK, '02-mt-revised'), { recursive: true, force: true });
    const r = save({ accepted: [entry(OP.a1)] });
    expect(r.outcome).toBe('inserted');
    expect(rowOf().accepted_suggestions).toBeNull();
    // Control: with the log back, the same save keeps the op.
    plantLog();
    save({ editorId: B, editorUsername: 'B', accepted: [entry(OP.a1)] });
    expect(listOf(rowOf(B))).toEqual([entry(OP.a1)]);
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
    ['a non-integer occurrence', [{ opId: OP.a1, occurrence: 0.5 }]],
    ['an empty opId', [{ opId: '', occurrence: 0 }]],
    ['an opId over 128 characters', [{ opId: 'x'.repeat(129), occurrence: 0 }]],
    ['a non-string opId', [{ opId: 7, occurrence: 0 }]],
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

  it('an absent list still recomputes: the route always passes an array', async () => {
    await post({ acceptedSuggestions: [entry(OP.a1)] });
    expect(listOf(rowOf())).toEqual([entry(OP.a1)].slice(0, 1));
    await post({ editedContent: 'alpha beta GAMMA!' }); // no list at all
    expect(rowOf().accepted_suggestions).toBeNull();
  });
});
