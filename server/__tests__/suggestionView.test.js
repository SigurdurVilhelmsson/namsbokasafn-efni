// server/__tests__/suggestionView.test.js
//
// G1.23 PR1 Task 5: the read half of the suggestion view (spec §6.1–6.4 and §6.6; index decisions
// 4–7): eligibility, integrity, the snapshot, duplicate ids, closed ops, the offered set and its GG
// tags. One planted module in a temp books root (suggestionLogs._setTestRoots); the opening and the
// switch rows are inserted by SQL with explicit times; edits are plain objects in the route's
// editsBySegment shape (newest first).
//
// SESSIONS_DB_PATH is set to a temp file BEFORE any server require, as a safety net:
// suggestionView loads moduleOpenings, which loads userService. Every database call goes through
// the handle passed in.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-view-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const log = require('../lib/logger');
const L = require('../lib/suggestionLogs');
const { sha256Text } = require('../lib/servedText');
const SV = require('../services/suggestionView');

const BOOK = 'efnafraedi-2e';
const MODULE = 'm95010';
const KEY = Object.freeze({ book: BOOK, chapter: 1, moduleId: MODULE });
// Distinctive times, so a leak into the result is findable as text.
const ON_AT = 1_700_000_000_211;
const OPENED_AT = 1_700_000_000_377;

const RULINGS = {
  rulings: [
    { id: 'r-a', en: ['alpha'], is: 'alfa' },
    { id: 'r-b', en: ['beta'], is: 'beta-is' },
    { id: 'r-c', en: ['zeta'], is: 'zeta-is' },
  ],
};

const OP = {
  s1a1: 'ch01/m95010/001.op1',
  s1b: 'ch01/m95010/001.op2',
  s1a2: 'ch01/m95010/001.op3',
  s2: 'ch01/m95010/002.op1',
  s3o0: 'ch01/m95010/003.op1',
  s3o1: 'ch01/m95010/003.op2',
  s4: 'ch01/m95010/004.op1',
  s5: 'ch01/m95010/005.op1',
  s6drop: 'ch01/m95010/006.op1',
  s6keep: 'ch01/m95010/006.op2',
};

/**
 * The module's chains. s1 has two groups: r-a (two changes, interleaved with r-b's) and r-b. s2 is
 * in the opening's snapshot; s3 is served twice (a duplicated id); s4's served base is not the text
 * its chain starts from; s5 is plain, the positive control; s6 is never served by `SEGMENTS` (its
 * first record is an agreement change, so the drop removes the group the chain starts with).
 */
const CHAINS = [
  {
    segmentId: 's1',
    occurrence: 0,
    base: 'alpha beta gamma',
    ops: [
      [OP.s1a1, 'r-a', 'term', 'alpha', 'ALFA'],
      [OP.s1b, 'r-b', 'term', 'beta', 'BETA'],
      [OP.s1a2, 'r-a', 'term', 'gamma', 'GAMMA'],
    ],
  },
  {
    segmentId: 's2',
    occurrence: 0,
    base: 'delta',
    ops: [[OP.s2, 'r-a', 'term', 'delta', 'DELTA']],
  },
  {
    segmentId: 's3',
    occurrence: 0,
    base: 'eta one',
    ops: [[OP.s3o0, 'r-a', 'term', 'eta', 'ETA']],
  },
  {
    segmentId: 's3',
    occurrence: 1,
    base: 'eta two',
    ops: [[OP.s3o1, 'r-a', 'term', 'eta', 'ETA']],
  },
  {
    segmentId: 's4',
    occurrence: 0,
    base: 'epsilon old',
    ops: [[OP.s4, 'r-a', 'term', 'epsilon', 'EPSILON']],
  },
  { segmentId: 's5', occurrence: 0, base: 'zeta', ops: [[OP.s5, 'r-c', 'term', 'zeta', 'ZETA']] },
  {
    segmentId: 's6',
    occurrence: 0,
    base: 'theta iota',
    ops: [
      [OP.s6drop, 'r-b', 'agreement', 'theta', 'THETA'],
      [OP.s6keep, 'r-c', 'term', 'iota', 'IOTA'],
    ],
  },
];

/** The change-log lines of CHAINS, every hash and every before/after consistent. */
function logLines(moduleId) {
  const lines = [];
  for (const c of CHAINS) {
    let text = c.base;
    for (const [opId, rulingId, category, find, replace] of c.ops) {
      const after = text.replace(find, replace);
      lines.push(
        JSON.stringify({
          module: moduleId,
          segmentId: c.segmentId,
          occurrence: c.occurrence,
          key: c.segmentId,
          opId,
          source: 'ai',
          rulingId,
          category,
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

/** The route's data.segments for this module: s3 twice and without baseSha256 (decision 5). */
const SEG = {
  s1: { segmentId: 's1', occurrence: 0, baseSha256: sha256Text('alpha beta gamma') },
  s2: { segmentId: 's2', occurrence: 0, baseSha256: sha256Text('delta') },
  s3o0: { segmentId: 's3', occurrence: 0 },
  s3o1: { segmentId: 's3', occurrence: 1 },
  s4: { segmentId: 's4', occurrence: 0, baseSha256: sha256Text('epsilon new') },
  s5: { segmentId: 's5', occurrence: 0, baseSha256: sha256Text('zeta') },
};
const SEGMENTS = [SEG.s1, SEG.s2, SEG.s3o0, SEG.s3o1, SEG.s4, SEG.s5];

let db;
let tmp;
let changesPath;
let warn;
/** Plant a module's change log, revision and ruling set under tmp; returns the log's path. */
function plantModule(moduleId, book = BOOK) {
  const dir = path.join(tmp, 'books', book, '02-mt-revised', 'ch01');
  fs.mkdirSync(dir, { recursive: true });
  const rulingBytes = JSON.stringify(RULINGS);
  fs.writeFileSync(path.join(tmp, 'rulings.json'), rulingBytes);
  const logPath = path.join(dir, `${moduleId}-changes.jsonl`);
  fs.writeFileSync(logPath, logLines(moduleId).join('\n') + '\n');
  fs.writeFileSync(
    path.join(dir, `${moduleId}-revision.json`),
    JSON.stringify({
      schema: 'mt-revised/1',
      rulingSet: {
        path: 'rulings.json',
        sha256: crypto.createHash('sha256').update(rulingBytes).digest('hex'),
      },
    })
  );
  return logPath;
}
beforeEach(() => {
  ({ db } = freshMigratedDb());
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-view-books-'));
  changesPath = plantModule(MODULE);
  L._setTestRoots({ booksRoot: path.join(tmp, 'books'), repoRoot: tmp });
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  L._setTestRoots(null);
  fs.rmSync(tmp, { recursive: true, force: true });
  db.close();
});

// ── Rows, by SQL, with explicit times ─────────────────────────────────────────────────────────
const sw = (value, at, book = BOOK) =>
  db
    .prepare(
      "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', ?, ?)"
    )
    .run(book, value, at);
function open(at, inflight = [], k = KEY) {
  db.prepare(
    'INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count) VALUES (?, ?, ?, ?, ?)'
  ).run(k.book, k.chapter, k.moduleId, at, inflight.length);
  const add = db.prepare(
    'INSERT INTO module_opening_inflight (book, chapter, module_id, segment_id, occurrence) VALUES (?, ?, ?, ?, ?)'
  );
  for (const [segmentId, occurrence] of inflight) {
    add.run(k.book, k.chapter, k.moduleId, segmentId, occurrence);
  }
}
/** The default eligible module: switched on, then opened with s2 in flight. */
function eligibleModule(inflight = [['s2', 0]]) {
  sw(1, ON_AT);
  open(OPENED_AT, inflight);
}
function reject(segmentId, occurrence, opId, rulingId, k = KEY) {
  db.prepare(
    `INSERT INTO suggestion_rejections (book, chapter, module_id, segment_id, occurrence, op_id,
       ruling_id, run_id, rejected_by, rejected_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'run-1', 7, ?)`
  ).run(k.book, k.chapter, k.moduleId, segmentId, occurrence, opId, rulingId, OPENED_AT + 5);
}
function leftOpen(segmentId, occurrence, opId, rulingId, k = KEY) {
  db.prepare(
    `INSERT INTO suggestion_left_open (book, chapter, module_id, segment_id, occurrence, op_id,
       ruling_id, run_id, finishing_act, finishing_kind, finishing_id, closed_by, closed_at_ms,
       shown_at_finish) VALUES (?, ?, ?, ?, ?, ?, ?, 'run-1', 'approval', 'segment_edit', 3, 8, ?, 1)`
  ).run(k.book, k.chapter, k.moduleId, segmentId, occurrence, opId, rulingId, OPENED_AT + 9);
}

// ── Inputs and readouts ───────────────────────────────────────────────────────────────────────
/** An edit row as the route hands it over (segment_edits.* plus contentSha256). */
const edit = (status, accepted, over = {}) => ({
  status,
  applied_at: null,
  edited_content: 'whatever the editor typed',
  accepted_suggestions: accepted === undefined ? null : JSON.stringify(accepted),
  ...over,
});
const input = (editsBySegment = {}, over = {}) => ({
  ...KEY,
  segments: SEGMENTS,
  editsBySegment,
  ...over,
});
const groupId = (g) => `${g.key}:${g.changes.map((c) => c.opId).join(',')}`;
const keys = (groups) => groups.map((g) => g.key);
/** The map as values: each segment's group keys with their opIds, and its tagged opIds. */
const view = (m) =>
  Object.fromEntries(
    [...m].map(([id, v]) => [
      id,
      { groups: v.groups.map(groupId), tagged: v.tagged.map((t) => t.opId) },
    ])
  );
const G = {
  s1a: `s1#0|r-a:${OP.s1a1},${OP.s1a2}`,
  s1b: `s1#0|r-b:${OP.s1b}`,
  s2: `s2#0|r-a:${OP.s2}`,
  s5: `s5#0|r-c:${OP.s5}`,
};
const S5_ONLY = { groups: [G.s5], tagged: [] };

describe('isEligible (spec §6.2; index decision 4, reason order R4)', () => {
  it.each([
    ['not a study book', { book: 'liffraedi-2e', onAt: 200, openedAt: 300 }, 'not-study-book'],
    ['organic', { book: 'lifraen-efnafraedi', onAt: 200, openedAt: 300 }, 'not-study-book'],
    ['no switch row', { openedAt: 300 }, 'never-switched-on'],
    ['only an off row', { rows: [0], openedAt: 900 }, 'never-switched-on'],
    ['switched on, then off', { rows: [1, 0], openedAt: 900 }, 'switch-off'],
    ['switched on, then off, never opened', { rows: [1, 0] }, 'switch-off'],
    ['switched on, never opened', { onAt: 200 }, 'not-opened'],
    ['opened before the first switch-on', { openedAt: 100, onAt: 200 }, 'opened-before-switch-on'],
    ['opened in the same millisecond', { openedAt: 200, onAt: 200 }, 'opened-before-switch-on'],
    ['opened after', { openedAt: 300, onAt: 200 }, 'eligible'],
    [
      'opened while off, then on again: the first switch-on stands (Q6)',
      { rows: [1, 0, 1], openedAt: 250 },
      'eligible',
    ],
  ])('eligibility: %s', (_n, { book = BOOK, rows, onAt, openedAt }, reason) => {
    // rows: values at times 100, 200, 300, …
    if (rows) rows.forEach((v, i) => sw(v, 100 * (i + 1), book));
    if (onAt !== undefined) sw(1, onAt, book);
    if (openedAt !== undefined) open(openedAt, [], { ...KEY, book });
    expect(SV.isEligible(db, { ...KEY, book })).toEqual({
      eligible: reason === 'eligible',
      reason,
    });
  });

  it('the first switch-on is the lowest-id on row, not the earliest time', () => {
    sw(1, 500); // id 1
    sw(0, 600); // id 2
    sw(1, 100); // id 3: the earliest time, a later row
    open(300);
    expect(SV.isEligible(db, KEY).reason).toBe('opened-before-switch-on');
    // Control: the same opening after the lowest-id row's time is eligible.
    open(501, [], { ...KEY, moduleId: 'm95011' });
    expect(SV.isEligible(db, { ...KEY, moduleId: 'm95011' }).reason).toBe('eligible');
  });

  it("another book's switch and another chapter's opening are not this module's", () => {
    sw(1, 100, 'liffraedi-2e');
    open(300);
    expect(SV.isEligible(db, KEY).reason).toBe('never-switched-on');
    sw(1, 200);
    open(300, [], { ...KEY, chapter: 2 }); // chapter-metadata is one module id in many chapters
    expect(SV.isEligible(db, { ...KEY, chapter: 3 }).reason).toBe('not-opened');
    expect(SV.isEligible(db, KEY).reason).toBe('eligible'); // control
  });

  it('a book off the study allowlist touches no table: a closed handle', () => {
    const closed = new Database(':memory:');
    closed.close();
    expect(SV.isEligible(closed, { ...KEY, book: 'liffraedi-2e' })).toEqual({
      eligible: false,
      reason: 'not-study-book',
    });
    // Control: the study book reads the switch on that handle, and the closed handle throws.
    expect(() => SV.isEligible(closed, KEY)).toThrow(/not open/);
  });
});

describe('closedOpKeys (spec §6.6, §7)', () => {
  it("holds this module's rejected and left-open ops from both tables, and nothing else", () => {
    reject('s1', 0, OP.s1a2, 'r-a');
    leftOpen('s5', 0, OP.s5, 'r-c');
    reject('s1', 0, OP.s1b, 'r-b', { ...KEY, moduleId: 'm95099' });
    leftOpen('s1', 0, OP.s1a1, 'r-a', { ...KEY, chapter: 2 });
    reject('s1', 0, OP.s1a1, 'r-a', { ...KEY, book: 'liffraedi-2e' });
    expect(SV.closedOpKeys(db, KEY)).toEqual(new Set([`s1#0|${OP.s1a2}`, `s5#0|${OP.s5}`]));
  });

  it('is empty for a module with no closed op', () => {
    reject('s1', 0, OP.s1a2, 'r-a', { ...KEY, moduleId: 'm95099' }); // control: a row exists
    expect(SV.closedOpKeys(db, KEY)).toEqual(new Set());
  });
});

describe('moduleContext', () => {
  it('an eligible module reads the log, the snapshot and the closed ops', () => {
    eligibleModule([
      ['s1', -1],
      ['s2', 0],
    ]);
    reject('s5', 0, OP.s5, 'r-c');
    const read = vi.spyOn(L, 'readModuleLog');
    const ctx = SV.moduleContext(db, KEY);
    expect(Object.keys(ctx).sort()).toEqual(['closed', 'eligible', 'inflight', 'log', 'reason']);
    expect(ctx.eligible).toBe(true);
    expect(ctx.reason).toBe('eligible');
    expect(ctx.log.ok).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(KEY);
    expect(ctx.inflight).toEqual(new Set(['s1#*', 's2#0']));
    expect(ctx.closed).toEqual(new Set([`s5#0|${OP.s5}`]));
  });

  it('a module that is not eligible reads neither the log nor the closed tables', () => {
    sw(1, ON_AT);
    open(ON_AT - 1, [['s2', 0]]);
    const read = vi.spyOn(L, 'readModuleLog');
    db.exec('DROP TABLE suggestion_rejections; DROP TABLE suggestion_left_open');
    expect(SV.moduleContext(db, KEY)).toEqual({
      eligible: false,
      reason: 'opened-before-switch-on',
      log: null,
      inflight: new Set(),
      closed: new Set(),
    });
    expect(read).not.toHaveBeenCalled();
    expect(SV.offeredForModule(db, input())).toEqual(new Map());
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('staticGroupsFor (spec §6.1–6.4, §6.6)', () => {
  it('each withheld segment is withheld by its own rule: lifting that rule alone offers it', () => {
    eligibleModule();
    const ctx = SV.moduleContext(db, KEY);
    expect(keys(SV.staticGroupsFor(ctx, SEG.s1))).toEqual(['s1#0|r-a', 's1#0|r-b']); // control
    // s2: in the opening's snapshot (§6.3a). The same context without the snapshot offers it.
    expect(SV.staticGroupsFor(ctx, SEG.s2)).toEqual([]);
    expect(keys(SV.staticGroupsFor({ ...ctx, inflight: new Set() }, SEG.s2))).toEqual(['s2#0|r-a']);
    // s3: a duplicated id carries no baseSha256 (§6.4 via decision 5). Given its chain's hash, offered.
    expect(SV.staticGroupsFor(ctx, SEG.s3o0)).toEqual([]);
    expect(SV.staticGroupsFor(ctx, SEG.s3o1)).toEqual([]);
    expect(
      keys(SV.staticGroupsFor(ctx, { ...SEG.s3o0, baseSha256: sha256Text('eta one') }))
    ).toEqual(['s3#0|r-a']);
    expect(
      keys(SV.staticGroupsFor(ctx, { ...SEG.s3o1, baseSha256: sha256Text('eta two') }))
    ).toEqual(['s3#1|r-a']);
    // s4: the served base is not the text the AI read (§6.3). Given that text's hash, offered.
    expect(SV.staticGroupsFor(ctx, SEG.s4)).toEqual([]);
    expect(
      keys(SV.staticGroupsFor(ctx, { ...SEG.s4, baseSha256: sha256Text('epsilon old') }))
    ).toEqual(['s4#0|r-a']);
  });

  it('integrity reads the first record of the full chain, before the drop (§6.3)', () => {
    eligibleModule();
    const ctx = SV.moduleContext(db, KEY);
    const s6 = { segmentId: 's6', occurrence: 0 };
    // The chain starts with a dropped agreement change; its kept r-c group is offered on the base.
    expect(
      SV.staticGroupsFor(ctx, { ...s6, baseSha256: sha256Text('theta iota') }).map(groupId)
    ).toEqual([`s6#0|r-c:${OP.s6keep}`]);
    // The first KEPT record's before is not the text the AI read first.
    expect(SV.staticGroupsFor(ctx, { ...s6, baseSha256: sha256Text('THETA iota') })).toEqual([]);
  });

  it('a snapshot row for one occurrence withholds only that occurrence', () => {
    eligibleModule();
    const ctx = SV.moduleContext(db, KEY);
    expect(SV.staticGroupsFor({ ...ctx, inflight: new Set(['s1#0']) }, SEG.s1)).toEqual([]);
    expect(keys(SV.staticGroupsFor({ ...ctx, inflight: new Set(['s1#1']) }, SEG.s1))).toEqual([
      's1#0|r-a',
      's1#0|r-b',
    ]);
    expect(SV.staticGroupsFor({ ...ctx, inflight: new Set(['s1#*']) }, SEG.s1)).toEqual([]);
  });

  it('nothing without an eligible context or a usable log', () => {
    eligibleModule();
    const ctx = SV.moduleContext(db, KEY);
    expect(keys(SV.staticGroupsFor(ctx, SEG.s5))).toEqual(['s5#0|r-c']); // control
    expect(SV.staticGroupsFor({ ...ctx, eligible: false }, SEG.s5)).toEqual([]);
    expect(SV.staticGroupsFor({ ...ctx, log: null }, SEG.s5)).toEqual([]);
    expect(SV.staticGroupsFor({ ...ctx, log: { ok: false, reason: 'absent' } }, SEG.s5)).toEqual(
      []
    );
  });

  it('the offered group is exactly the index shape', () => {
    eligibleModule();
    const [g] = SV.staticGroupsFor(SV.moduleContext(db, KEY), SEG.s5);
    expect(g).toEqual({
      key: 's5#0|r-c',
      segmentId: 's5',
      occurrence: 0,
      rulingId: 'r-c',
      source: 'ai',
      label: { en: 'zeta', is: 'zeta-is' },
      changes: [
        {
          opId: OP.s5,
          occurrence: 0,
          find: 'zeta',
          replace: 'ZETA',
          category: 'term',
          runId: 'run-1',
          chainIndex: 0,
        },
      ],
    });
  });
});

describe('offeredForModule (spec §6.1–6.4, §6.6, §7)', () => {
  it('offers s1 and withholds s2, s3, s4, with s5 as a second positive control', () => {
    eligibleModule();
    const m = SV.offeredForModule(db, input());
    expect([...m.keys()]).toEqual(['s1', 's5']);
    expect(view(m)).toEqual({ s1: { groups: [G.s1a, G.s1b], tagged: [] }, s5: S5_ONLY });
  });

  it('a -1 snapshot row withholds every occurrence', () => {
    eligibleModule([
      ['s1', -1],
      ['s2', 0],
    ]);
    expect(view(SV.offeredForModule(db, input()))).toEqual({ s5: S5_ONLY });
  });

  it('a rejected op closes its whole group, and a left-open op too; another group on the segment stays', () => {
    eligibleModule();
    // Rows that are not this place close nothing: another occurrence, module, chapter.
    reject('s1', 1, OP.s1a2, 'r-a');
    reject('s1', 0, OP.s1a2, 'r-a', { ...KEY, moduleId: 'm95099' });
    leftOpen('s1', 0, OP.s1a1, 'r-a', { ...KEY, chapter: 2 });
    expect(view(SV.offeredForModule(db, input()))).toEqual({
      s1: { groups: [G.s1a, G.s1b], tagged: [] },
      s5: S5_ONLY,
    });
    // A rejection of r-a's SECOND change closes r-a, its first change too; r-b and s5 stay.
    reject('s1', 0, OP.s1a2, 'r-a');
    expect(view(SV.offeredForModule(db, input()))).toEqual({
      s1: { groups: [G.s1b], tagged: [] },
      s5: S5_ONLY,
    });
    // The same through a left-open row on r-a's FIRST change.
    db.exec('DELETE FROM suggestion_rejections');
    leftOpen('s1', 0, OP.s1a1, 'r-a');
    expect(view(SV.offeredForModule(db, input()))).toEqual({
      s1: { groups: [G.s1b], tagged: [] },
      s5: S5_ONLY,
    });
    // Both groups closed: s1 leaves the map, s5 stays.
    reject('s1', 0, OP.s1b, 'r-b');
    expect(view(SV.offeredForModule(db, input()))).toEqual({ s5: S5_ONLY });
  });

  it('tags the accepted ops of a pending displayed edit and offers the rest', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({ s1: [edit('pending', [{ opId: OP.s1a1, occurrence: 0 }])] })
    );
    // r-a holds an accepted op, so it is not offered; only that op is tagged, not r-a's second.
    expect(view(m)).toEqual({ s1: { groups: [G.s1b], tagged: [OP.s1a1] }, s5: S5_ONLY });
    expect(m.get('s1').tagged).toEqual([
      {
        opId: OP.s1a1,
        occurrence: 0,
        find: 'alpha',
        replace: 'ALFA',
        rulingId: 'r-a',
        chainIndex: 0,
      },
    ]);
  });

  it('a segment whose every group is accepted stays in the map for its tags, in chain order', () => {
    eligibleModule();
    const accepted = [
      { opId: OP.s1a2, occurrence: 0 },
      { opId: OP.s1b, occurrence: 0 },
      { opId: OP.s1a1, occurrence: 0 },
    ];
    const m = SV.offeredForModule(db, input({ s1: [edit('pending', accepted)] }));
    expect(view(m)).toEqual({
      s1: { groups: [], tagged: [OP.s1a1, OP.s1b, OP.s1a2] },
      s5: S5_ONLY,
    });
    expect(m.get('s1').tagged.map((t) => [t.rulingId, t.chainIndex])).toEqual([
      ['r-a', 0],
      ['r-b', 1],
      ['r-a', 2],
    ]);
  });

  it('an accepted entry on another occurrence is not accepted here', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({
        s1: [
          edit('pending', [
            { opId: OP.s1b, occurrence: 1 },
            { opId: OP.s1a1, occurrence: 0 },
          ]),
        ],
      })
    );
    expect(view(m)).toEqual({ s1: { groups: [G.s1b], tagged: [OP.s1a1] }, s5: S5_ONLY });
  });

  it('tags nothing on an approved, unapplied displayed edit', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({ s1: [edit('approved', [{ opId: OP.s1b, occurrence: 0 }])] })
    );
    // Its accepted group is not offered either.
    expect(view(m)).toEqual({ s1: { groups: [G.s1a], tagged: [] }, s5: S5_ONLY });
    // Every group accepted: no group and no tag, so s1 leaves the map.
    const all = SV.offeredForModule(
      db,
      input({
        s1: [
          edit('approved', [
            { opId: OP.s1a1, occurrence: 0 },
            { opId: OP.s1b, occurrence: 0 },
          ]),
        ],
      })
    );
    expect(view(all)).toEqual({ s5: S5_ONLY });
  });

  it('a rejected newest edit shows the base: groups offered again, nothing tagged', () => {
    eligibleModule();
    // The rejected row carries an accepted list, and an older pending edit lies under it: only
    // the newest row is ever the displayed edit (baselineTextFor), so neither list counts.
    const m = SV.offeredForModule(
      db,
      input({
        s1: [
          edit('rejected', [
            { opId: OP.s1a1, occurrence: 0 },
            { opId: OP.s1b, occurrence: 0 },
          ]),
          edit('pending', [{ opId: OP.s1b, occurrence: 0 }]),
        ],
      })
    );
    expect(view(m)).toEqual({ s1: { groups: [G.s1a, G.s1b], tagged: [] }, s5: S5_ONLY });
  });

  it('an applied newest edit shows the base too', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({
        s1: [
          edit('approved', [{ opId: OP.s1b, occurrence: 0 }], {
            applied_at: '2026-11-09 10:00:00',
          }),
        ],
      })
    );
    expect(view(m)).toEqual({ s1: { groups: [G.s1a, G.s1b], tagged: [] }, s5: S5_ONLY });
  });

  it.each([
    ['NULL', null],
    ['unparseable JSON', '[{"opId":'],
    ['an object, not an array', JSON.stringify({ opId: OP.s1b, occurrence: 0 })],
    ['a JSON string', JSON.stringify('x')],
    ['an opId that is not a string', JSON.stringify([{ opId: 4, occurrence: 0 }])],
    ['an occurrence that is a string', JSON.stringify([{ opId: OP.s1b, occurrence: '0' }])],
    ['an occurrence that is not an integer', JSON.stringify([{ opId: OP.s1b, occurrence: 0.5 }])],
    ['a null entry', JSON.stringify([null])],
    [
      'one bad entry beside a good one',
      JSON.stringify([{ opId: OP.s1b, occurrence: 0 }, { opId: OP.s1a1 }]),
    ],
    ['a parsed array instead of JSON text', [{ opId: OP.s1b, occurrence: 0 }]],
  ])('an accepted_suggestions value that is %s counts as an empty list', (_n, value) => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({ s1: [edit('pending', undefined, { accepted_suggestions: value })] })
    );
    expect(view(m)).toEqual({ s1: { groups: [G.s1a, G.s1b], tagged: [] }, s5: S5_ONLY });
    // Control: the well-formed list does change the view.
    const good = SV.offeredForModule(
      db,
      input({ s1: [edit('pending', [{ opId: OP.s1b, occurrence: 0 }])] })
    );
    expect(view(good)).toEqual({ s1: { groups: [G.s1a], tagged: [OP.s1b] }, s5: S5_ONLY });
  });

  it('a malformed non-NULL accepted list is thrown away with exactly one warning, no text', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({ s1: [edit('pending', undefined, { accepted_suggestions: '[{"opId":' })] })
    );
    expect(view(m)).toEqual({ s1: { groups: [G.s1a, G.s1b], tagged: [] }, s5: S5_ONLY });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(Object.keys(warn.mock.calls[0][0]).sort()).toEqual([
      'book',
      'chapter',
      'moduleId',
      'reason',
      'segmentId',
    ]);
    expect(warn.mock.calls[0][0]).toMatchObject({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: 's1',
    });
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('opId');
  });

  it('a NULL accepted list and a valid one warn about nothing', () => {
    eligibleModule();
    SV.offeredForModule(db, input({ s1: [edit('pending', undefined)] }));
    expect(warn).not.toHaveBeenCalled();
    SV.offeredForModule(db, input({ s1: [edit('pending', [{ opId: OP.s1b, occurrence: 0 }])] }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns an empty map when the log is unusable: the reader warns once, the view adds nothing', () => {
    eligibleModule();
    expect([...SV.offeredForModule(db, input()).keys()]).toEqual(['s1', 's5']); // control
    expect(warn).not.toHaveBeenCalled();
    fs.appendFileSync(changesPath, 'not json\n');
    expect(SV.offeredForModule(db, input())).toEqual(new Map());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ book: BOOK, moduleId: MODULE, reason: 'malformed' });
  });

  it('a module with no change log gets an empty map and no warning', () => {
    eligibleModule();
    fs.rmSync(changesPath);
    expect(SV.offeredForModule(db, input())).toEqual(new Map());
    expect(warn).not.toHaveBeenCalled();
  });

  it('a throw inside the view warns once, with no text, and returns an empty map', () => {
    eligibleModule();
    db.exec('DROP TABLE suggestion_left_open');
    let m;
    expect(() => (m = SV.offeredForModule(db, input()))).not.toThrow();
    expect(m).toEqual(new Map());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      reason: 'SQLITE_ERROR',
    });
  });

  it('a throw from the log reader or from bad input is caught the same way', () => {
    eligibleModule();
    const reader = vi.spyOn(L, 'readModuleLog').mockImplementation(() => {
      throw new Error('planted: alpha beta gamma');
    });
    expect(SV.offeredForModule(db, input())).toEqual(new Map());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toMatch(/alpha|planted/);
    reader.mockRestore();
    warn.mockClear();
    expect(SV.offeredForModule(db, input({}, { segments: null }))).toEqual(new Map());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      reason: 'TypeError',
    });
  });

  it('groups the log once per context, however many segments', () => {
    eligibleModule();
    const grouped = vi.spyOn(L, 'keptGroups');
    expect([...SV.offeredForModule(db, input()).keys()]).toEqual(['s1', 's5']);
    expect(grouped).toHaveBeenCalledTimes(1);
  });

  it('a module that is not a study book, or not eligible, gets an empty map without reading its log', () => {
    // Every other condition holds for the non-study book: switched on, opened after, log planted.
    plantModule(MODULE, 'liffraedi-2e');
    sw(1, ON_AT, 'liffraedi-2e');
    open(OPENED_AT, [], { ...KEY, book: 'liffraedi-2e' });
    sw(1, ON_AT, 'lifraen-efnafraedi');
    open(OPENED_AT, [], { ...KEY, book: 'lifraen-efnafraedi' });
    // This book's module: opened in the switch-on's own millisecond.
    sw(1, OPENED_AT);
    open(OPENED_AT);
    const read = vi.spyOn(L, 'readModuleLog');
    expect(SV.offeredForModule(db, input({}, { book: 'liffraedi-2e' }))).toEqual(new Map());
    expect(SV.offeredForModule(db, input({}, { book: 'lifraen-efnafraedi' }))).toEqual(new Map());
    expect(SV.offeredForModule(db, input())).toEqual(new Map());
    expect(read).not.toHaveBeenCalled();
    // Control: a second module of this book, opened after the switch-on, with nothing in flight.
    plantModule('m95011');
    open(OPENED_AT + 1, [], { ...KEY, moduleId: 'm95011' });
    expect(view(SV.offeredForModule(db, input({}, { moduleId: 'm95011' })))).toEqual({
      s1: { groups: [G.s1a, G.s1b], tagged: [] },
      s2: { groups: [G.s2], tagged: [] },
      s5: S5_ONLY,
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns no time, no opened state and no switch state', () => {
    eligibleModule();
    const m = SV.offeredForModule(
      db,
      input({ s1: [edit('pending', [{ opId: OP.s1b, occurrence: 0 }])] })
    );
    expect([...m.keys()]).toEqual(['s1', 's5']); // control: there is a result to inspect
    for (const v of m.values()) expect(Object.keys(v).sort()).toEqual(['groups', 'tagged']);
    const text = JSON.stringify([...m]);
    expect([String(ON_AT), String(OPENED_AT)].filter((s) => text.includes(s))).toEqual([]);
    expect(text).not.toMatch(/opened|switch|inflight|eligib/i);
  });
});
