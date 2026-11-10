// server/__tests__/moduleRouteSuggestions.test.js
//
// G1.23 PR1 Task 6: step 5 of the segment editor's module route (spec §5.4 step 5; index decision 7).
// After the served versions are minted and the module's opening is recorded, one call to
// suggestionView.offeredForModule attaches `seg.suggestions = { groups, tagged }` to the segments
// that have any. The handler is driven without HTTP (servedFixture) on a real migrated database;
// the books root and the change-log root are the same temp directory (suggestionLogs._setTestRoots).
//
// SESSIONS_DB_PATH and JWT_SECRET are set BEFORE any server require (the route reaches userService),
// so a run never creates pipeline-output/sessions.db. Every edit row is seeded by SQL, so no
// first-edit hook writes an MT lock and nothing reaches books/. The switch row is seeded by SQL too:
// nothing else writes it yet.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'module-route-suggestions-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');
const log = require('../lib/logger');
const userService = require('../services/userService');
const segmentParser = require('../services/segmentParser');
const moduleOpenings = require('../services/moduleOpenings');
const researchDb = require('../services/researchDb');
const researchConsentText = require('../lib/researchConsentText');
const serverCommit = require('../lib/serverCommit');
const L = require('../lib/suggestionLogs');
const { sha256Text } = require('../lib/servedText');
const { writeModule, handlerFor, invoke } = require('./helpers/servedFixture');
const { APPROVED, consent } = require('./helpers/researchFixture.cjs');

const BOOK = 'efnafraedi-2e';
const ROUTE = '/:book/:chapter/:moduleId';
const SWITCH_AT = 1_700_000_001_000;
const BEFORE_SWITCH = SWITCH_AT - 500; // an opening before the first switch-on
const AFTER_SWITCH = SWITCH_AT + 500; // an opening after it

// The same pattern as researchBoundary.test.js's FORBIDDEN_KEY, copied (importing would run that
// file's suites). It must stay identical to it.
const FORBIDDEN_KEY =
  /(opened|switched|inflight|editor_?key|client_?action|assists?$|accept_?origin|reviewed_?edit|replayed|research|consent)/i;
const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];

const RULINGS = {
  rulings: [
    { id: 'r-a', en: ['alpha'], is: 'alfa' },
    { id: 'r-b', en: ['beta'], is: 'beta-is' },
    { id: 'r-c', en: ['zeta'], is: 'zeta-is' },
  ],
};
// The texts the MT file holds for each segment (the loader serves plain text unchanged).
const TEXT = { a: 'alpha beta gamma', b: 'plain text', c: 'zeta' };
// [segment, ruling, find, replace], in chain order per segment.
const OPS = [
  ['a', 'r-a', 'alpha', 'ALFA'],
  ['a', 'r-b', 'beta', 'BETA'],
  ['c', 'r-c', 'zeta', 'ZETA'],
];
const opId = (m, seg, n) => `ch01/${m}/${seg}.op${n}`;

let db;
let get;
let booksRoot;
let realBooksDir;
let editor;

const segId = (m, s) => `${m}:para:${s}`;
/** Plant a module (EN, MT) and its change log, revision and ruling set under the temp roots. */
function plant(moduleId, { revision = undefined } = {}) {
  writeModule(booksRoot, {
    book: BOOK,
    chapterDir: 'ch01',
    moduleId,
    en: Object.keys(TEXT).map((s) => [segId(moduleId, s), `English ${s}.`]),
    mt: Object.entries(TEXT).map(([s, t]) => [segId(moduleId, s), t]),
  });
  const dir = path.join(booksRoot, BOOK, '02-mt-revised', 'ch01');
  mkdirSync(dir, { recursive: true });
  const rulingBytes = JSON.stringify(RULINGS);
  writeFileSync(path.join(work, 'rulings.json'), rulingBytes);
  const lines = [];
  const texts = { ...TEXT };
  const counts = {};
  for (const [s, ruling, find, replace] of OPS) {
    counts[s] = (counts[s] || 0) + 1;
    const before = texts[s];
    const after = before.replace(find, replace);
    texts[s] = after;
    lines.push(
      JSON.stringify({
        module: moduleId,
        segmentId: segId(moduleId, s),
        occurrence: 0,
        key: segId(moduleId, s),
        opId: opId(moduleId, s, counts[s]),
        source: 'ai',
        rulingId: ruling,
        category: 'term',
        find,
        replace,
        before,
        after,
        beforeSha256: sha256Text(before),
        afterSha256: sha256Text(after),
        runId: 'run-1',
      })
    );
  }
  writeFileSync(path.join(dir, `${moduleId}-changes.jsonl`), lines.join('\n') + '\n');
  writeFileSync(
    path.join(dir, `${moduleId}-revision.json`),
    revision !== undefined
      ? revision
      : JSON.stringify({
          schema: 'mt-revised/1',
          rulingSet: {
            path: 'rulings.json',
            sha256: crypto.createHash('sha256').update(rulingBytes).digest('hex'),
          },
        })
  );
}

const asEditor = () => ({
  id: editor.provider_id,
  username: editor.provider_username,
  role: 'editor',
  books: [],
});
const serve = (moduleId, user = asEditor()) =>
  invoke(get, { params: { book: BOOK, chapter: '1', moduleId }, chapterNum: 1, user });
const at = (ms) => moduleOpenings._setTestClock(() => ms);
const seg = (body, m, s) => body.segments.find((x) => x.segmentId === segId(m, s));
/** Each segment that carries the key, as values: its group keys with opIds, and its tagged opIds. */
const withSuggestions = (body) =>
  Object.fromEntries(
    body.segments
      .filter((s) => 'suggestions' in s)
      .map((s) => [
        s.segmentId,
        {
          groups: s.suggestions.groups.map((g) => ({
            key: g.key,
            ops: g.changes.map((c) => c.opId),
          })),
          tagged: s.suggestions.tagged.map((t) => t.opId),
        },
      ])
  );
const opened = (m) =>
  db
    .prepare('SELECT opened_at_ms FROM module_openings WHERE book = ? AND module_id = ?')
    .get(BOOK, m);

/** What an eligible module serves: a with two groups, c with one, b none. */
const expectedFor = (m) => ({
  [segId(m, 'a')]: {
    groups: [
      { key: `${segId(m, 'a')}#0|r-a`, ops: [opId(m, 'a', 1)] },
      { key: `${segId(m, 'a')}#0|r-b`, ops: [opId(m, 'a', 2)] },
    ],
    tagged: [],
  },
  [segId(m, 'c')]: {
    groups: [{ key: `${segId(m, 'c')}#0|r-c`, ops: [opId(m, 'c', 1)] }],
    tagged: [],
  },
});

beforeAll(() => {
  runAllMigrations();
  db = new Database(process.env.SESSIONS_DB_PATH);
  realBooksDir = segmentParser.BOOKS_DIR;
  booksRoot = path.join(work, 'books');
  segmentParser._setTestBooksDir(booksRoot);
  L._setTestRoots({ booksRoot, repoRoot: work });
  get = handlerFor(require('../routes/segment-editor'), 'get', ROUTE);
  editor = userService.createUser({
    providerId: 'p-sug-ed',
    providerUsername: 'sug-ed@skoli.example',
    email: 'sug-ed@skoli.example',
    role: 'editor',
  });
  userService.assignChapter(editor.id, BOOK, 1);
  // The editor consents, so the opening serve really reaches the research file (the failure test
  // below stubs its handle; without consent the stub would never be called).
  researchConsentText._setTestApprovedTexts(APPROVED);
  serverCommit._setTestServerCommit({
    serverCommit: 'c'.repeat(40),
    commitSource: 'deploy-file',
    codeDirty: 0,
  });
  researchDb.openAtBoot();
  consent(editor.id);
  db.prepare(
    "INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, 'suggestion-view', 1, ?)"
  ).run(BOOK, SWITCH_AT);
});

afterEach(() => {
  moduleOpenings._setTestClock(null);
  vi.restoreAllMocks();
});

afterAll(() => {
  researchConsentText._setTestApprovedTexts(null);
  serverCommit._setTestServerCommit(null);
  researchDb._reset();
  db.close();
  L._setTestRoots(null);
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('step 5 of the module route (spec §5.4 step 5)', () => {
  it('an eligible module carries suggestions on exactly the segments that have groups', async () => {
    plant('m96001');
    at(AFTER_SWITCH);
    const r = await serve('m96001');
    expect(r.status).toBe(200);
    expect(withSuggestions(r.body)).toEqual(expectedFor('m96001'));
    // the segment with no chain has no key at all, not an empty one
    expect(Object.keys(seg(r.body, 'm96001', 'b'))).not.toContain('suggestions');
    // the group and change values, not only their keys
    expect(seg(r.body, 'm96001', 'a').suggestions.groups[0]).toMatchObject({
      rulingId: 'r-a',
      label: { en: 'alpha', is: 'alfa' },
      changes: [{ find: 'alpha', replace: 'ALFA', chainIndex: 0 }],
    });
  });

  it('the serve that opens the module already carries them (step 5 runs after the opening)', async () => {
    plant('m96002');
    expect(opened('m96002')).toBeUndefined();
    at(AFTER_SWITCH);
    const first = await serve('m96002');
    expect(opened('m96002')).toEqual({ opened_at_ms: AFTER_SWITCH }); // this serve recorded it
    expect(withSuggestions(first.body)).toEqual(expectedFor('m96002'));
  });

  it('a module opened before the switch-on carries no suggestions key anywhere; an eligible sibling does', async () => {
    plant('m96003');
    plant('m96004');
    at(BEFORE_SWITCH);
    await serve('m96003'); // opens it before the switch row's time
    expect(opened('m96003')).toEqual({ opened_at_ms: BEFORE_SWITCH });
    at(AFTER_SWITCH);
    const late = await serve('m96003');
    expect(late.status).toBe(200);
    expect(late.body.segments.length).toBe(3);
    expect(late.body.segments.some((s) => 'suggestions' in s)).toBe(false);
    expect(keysDeep(late.body)).not.toContain('suggestions');
    // positive control: a module opened after the switch-on serves them
    const control = await serve('m96004');
    expect(withSuggestions(control.body)).toEqual(expectedFor('m96004'));
  });

  it('no key matches FORBIDDEN_KEY at any depth, and every nested key set is exactly the index shape', async () => {
    plant('m96006');
    at(AFTER_SWITCH);
    await serve('m96006'); // opens it; the edit below is therefore not in the snapshot
    db.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
         status, editor_id, editor_username, created_at, accepted_suggestions)
       VALUES (?, 1, 'm96006', ?, 'zeta', 'ZETA', 'pending', 'ed-x', 'ed-x', '2026-06-16 10:00:00', ?)`
    ).run(
      BOOK,
      segId('m96006', 'c'),
      JSON.stringify([{ opId: opId('m96006', 'c', 1), occurrence: 0 }])
    );
    const r = await serve('m96006');
    const c = seg(r.body, 'm96006', 'c');
    // c's only group was accepted: it is tagged, not offered (so the tagged shape is checked on a real entry)
    expect(c.suggestions.groups).toEqual([]);
    expect(c.suggestions.tagged.map((t) => t.opId)).toEqual([opId('m96006', 'c', 1)]);
    const a = seg(r.body, 'm96006', 'a');
    expect(a.suggestions.groups.map((g) => g.key)).toEqual([
      `${segId('m96006', 'a')}#0|r-a`,
      `${segId('m96006', 'a')}#0|r-b`,
    ]);

    expect(keysDeep(r.body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    const sorted = (o) => Object.keys(o).sort();
    expect(sorted(a.suggestions)).toEqual(['groups', 'tagged']);
    for (const g of a.suggestions.groups) {
      expect(sorted(g)).toEqual(
        ['changes', 'key', 'label', 'occurrence', 'rulingId', 'segmentId', 'source'].sort()
      );
      expect(sorted(g.label)).toEqual(['en', 'is']);
      for (const ch of g.changes) {
        expect(sorted(ch)).toEqual(
          ['category', 'chainIndex', 'find', 'occurrence', 'opId', 'replace', 'runId'].sort()
        );
      }
    }
    expect(sorted(c.suggestions.tagged[0])).toEqual(
      ['chainIndex', 'find', 'occurrence', 'opId', 'replace', 'rulingId'].sort()
    );
    expect(c.suggestions.tagged[0]).toMatchObject({
      find: 'zeta',
      replace: 'ZETA',
      rulingId: 'r-c',
    });
    // the segment itself gains only the one key
    expect(sorted(a)).toEqual(
      [
        'baseSha256',
        'elementId',
        'en',
        'hasTranslation',
        'is',
        'moduleId',
        'mtFinding',
        'occurrence',
        'segmentId',
        'segmentType',
        'suggestions',
      ].sort()
    );
  });

  it('the opening serve with the research file unreadable returns the body a later serve returns', async () => {
    plant('m96007');
    at(AFTER_SWITCH); // a constant clock: nothing else may differ between the two serves
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const getHandle = vi.spyOn(researchDb, 'getHandle').mockImplementation(() => {
      throw new Error('research file unreadable');
    });
    const first = await serve('m96007');
    expect(first.status).toBe(200);
    expect(opened('m96007')).toEqual({ opened_at_ms: AFTER_SWITCH }); // it was the opening serve
    // positive control: the body carries the suggestions, so equality below is not two empty bodies
    expect(withSuggestions(first.body)).toEqual(expectedFor('m96007'));
    // control: the stub was reached, so the research write really failed under this serve
    expect(getHandle.mock.calls.length).toBeGreaterThan(0);
    getHandle.mockRestore();
    const later = await serve('m96007');
    expect(JSON.stringify(first.body)).toBe(JSON.stringify(later.body));
  });

  it('a damaged log gives the module without suggestions, status 200 and one warning; a sibling still gets them', async () => {
    plant('m96008', { revision: '{ not json' });
    plant('m96009');
    at(AFTER_SWITCH);
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const bad = await serve('m96008');
    expect(bad.status).toBe(200);
    expect(bad.body.segments.length).toBe(3);
    expect(bad.body.segments.some((s) => 'suggestions' in s)).toBe(false);
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      { book: BOOK, moduleId: 'm96008', reason: 'malformed' },
    ]);
    const sibling = await serve('m96009');
    expect(withSuggestions(sibling.body)).toEqual(expectedFor('m96009'));
    expect(warn.mock.calls.length).toBe(1); // the sibling added none
  });
});
