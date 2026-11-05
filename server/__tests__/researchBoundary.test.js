/**
 * T17: nothing of the research reaches a browser (spec §10 and §11; index decision 15).
 *
 * One file, grown by every PR: each PR appends its own `describe`, and a new editing column joins
 * ALLOWED_COLUMNS only in the commit of the migration that adds it. Every `describe` carries a
 * planted control, so a check that cannot see a violation cannot pass.
 */
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import (the module-JSON
// describe below drives the real module route on this temp database).
const work = mkdtempSync(path.join(tmpdir(), 'research-boundary-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';
// Removed once, after EVERY describe (PR2 Task 3): the services' connections stay open on this file
// between describes, so a describe that removed it would leave the next one migrating a fresh file
// at the same path while the route's connection still reads the deleted one.
afterAll(() => rmSync(work, { recursive: true, force: true }));

const freshMigratedDb = require('./helpers/freshMigratedDb');
const { writeModule, handlerFor, invoke, EDITOR } = require('./helpers/servedFixture');

// Every column the module route sends to every editor's browser through SELECT *
// (segmentEditorService.getModuleEdits, acceptanceService.getModuleAcceptances). A column joins
// this list only after asking whether the tool needs it and whether every editor may see it
// (spec §5.8, R3).
const ALLOWED_COLUMNS = Object.freeze({
  segment_edits: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'original_content',
    'edited_content',
    'category',
    'editor_note',
    'status',
    'editor_id',
    'editor_username',
    'reviewer_id',
    'reviewer_username',
    'reviewer_note',
    'created_at',
    'reviewed_at',
    'applied_at',
    'review_id',
    // PR1
    'served_version_id',
    'occurrence',
    'origin',
    'displayed_edit_id',
    'displayed_edit_sha256',
  ],
  segment_acceptances: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'accepted_content',
    'accepted_by',
    'accepted_by_username',
    'accepted_at',
    'status',
    'superseded_at',
    'superseded_reason',
    'applied_at',
    // PR1
    'served_version_id',
    'occurrence',
  ],
});

function columnDrift(db, table, allowed) {
  const have = db.pragma(`table_info(${table})`).map((c) => c.name);
  return {
    unexpected: have.filter((c) => !allowed.includes(c)).sort(),
    missing: allowed.filter((c) => !have.includes(c)).sort(),
  };
}

describe('T17 (PR1): the editing columns the module route sends are an allowlist', () => {
  for (const table of Object.keys(ALLOWED_COLUMNS)) {
    it(`${table} has exactly the allowed columns`, () => {
      const { db } = freshMigratedDb();
      expect(columnDrift(db, table, ALLOWED_COLUMNS[table])).toEqual({
        unexpected: [],
        missing: [],
      });
    });
  }

  it('control: a planted column is reported by name', () => {
    const { db } = freshMigratedDb();
    db.exec('ALTER TABLE segment_edits ADD COLUMN research_probe TEXT');
    expect(columnDrift(db, 'segment_edits', ALLOWED_COLUMNS.segment_edits).unexpected).toEqual([
      'research_probe',
    ]);
  });
});

// What the module route may send (spec §5.4 step 6): today's keys plus PR1's three. Exact sets, so any new key fails.
const MODULE_JSON_ALLOWED = Object.freeze({
  top: [
    'book',
    'chapter',
    'moduleId',
    'isSource',
    'title',
    'titleIs',
    'segments',
    'equations',
    'segmentCount',
    'translatedCount',
    'mtFindingsGeneratedAt',
    'extractedAt',
    'sourceHash',
    'edits',
    'stats',
    'acceptances',
    'otherPendingSegments',
  ],
  segment: [
    'segmentId',
    'moduleId',
    'segmentType',
    'elementId',
    'en',
    'is',
    'hasTranslation',
    'mtFinding',
    'occurrence',
    'baseSha256',
  ],
  editRow: [...ALLOWED_COLUMNS.segment_edits, 'contentSha256'],
  acceptanceRow: [...ALLOWED_COLUMNS.segment_acceptances],
});
// Research and time-of-person names that must never reach a browser (spec §11), at any depth.
const FORBIDDEN_KEY =
  /(opened|switched|inflight|editor_?key|client_?action|assists?$|accept_?origin|reviewed_?edit|replayed|research|consent)/i;
const keysDeep = (v) =>
  v && typeof v === 'object'
    ? Object.entries(v).flatMap(([k, x]) => [...(Array.isArray(v) ? [] : [k]), ...keysDeep(x)])
    : [];
// The keys of EVERY object in the list, not of one sample (PR1 review C23): a key on a second edit row is still sent.
const keysOfAll = (objects) => [...new Set(objects.flatMap((o) => Object.keys(o)))];
function jsonDrift(body) {
  const odd = (keys, allowed) => keys.filter((k) => !allowed.includes(k)).sort();
  return {
    top: odd(Object.keys(body), MODULE_JSON_ALLOWED.top),
    segment: odd(keysOfAll(body.segments), MODULE_JSON_ALLOWED.segment),
    editRow: odd(keysOfAll(Object.values(body.edits).flat()), MODULE_JSON_ALLOWED.editRow),
    acceptanceRow: odd(
      keysOfAll(Object.values(body.acceptances)),
      MODULE_JSON_ALLOWED.acceptanceRow
    ),
    forbidden: [...new Set(keysDeep(body).filter((k) => FORBIDDEN_KEY.test(k)))].sort(),
  };
}

describe('T17 (PR1): the module JSON carries no research field and no new time', () => {
  const BOOK = 'efnafraedi-2e';
  const MODULE = 'm90020';
  let segmentParser;
  let segmentEditor;
  let realBooksDir;
  let get;

  beforeAll(() => {
    const { runAllMigrations } = require('../services/migrationRunner');
    runAllMigrations();
    segmentParser = require('../services/segmentParser');
    segmentEditor = require('../services/segmentEditorService');
    realBooksDir = segmentParser.BOOKS_DIR;
    // a temp books root: the seeding save and accept write their MT lock beside the fixture
    const root = path.join(work, 'books');
    mkdirSync(root, { recursive: true });
    segmentParser._setTestBooksDir(root);
    segmentEditor._setTestBooksDir(root);
    get = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: MODULE,
      en: [
        [`${MODULE}:para:a`, 'Alpha.'],
        [`${MODULE}:para:b`, 'Beta.'],
      ],
      mt: [
        [`${MODULE}:para:a`, 'Alfa.'],
        [`${MODULE}:para:b`, 'Beta á íslensku.'],
      ],
    });
    // seed: one edit (legacy call) and one acceptance (legacy call), on different segments
    segmentEditor.saveSegmentEdit({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:a`,
      originalContent: 'Alfa.',
      editedContent: 'Alfa, breytt.',
      category: 'accuracy',
      editorNote: null,
      editorId: EDITOR.id,
      editorUsername: EDITOR.username,
    });
    require('../services/acceptanceService').acceptSegment({
      book: BOOK,
      chapter: 1,
      moduleId: MODULE,
      segmentId: `${MODULE}:para:b`,
      acceptedContent: 'Beta á íslensku.',
      userId: EDITOR.id,
      username: EDITOR.username,
    });
  });

  afterAll(() => {
    segmentParser._setTestBooksDir(realBooksDir);
    segmentEditor._setTestBooksDir(realBooksDir);
  });

  const serve = () =>
    invoke(get, {
      params: { book: BOOK, chapter: '1', moduleId: MODULE },
      chapterNum: 1,
      user: EDITOR,
    });

  it('every key is allowed, at every level', async () => {
    const { status, body } = await serve();
    expect(status).toBe(200);
    // the seeded rows are what the drift check reads (so an empty edits or acceptances map cannot pass it)
    expect(Object.keys(body.edits)).toEqual([`${MODULE}:para:a`]);
    expect(Object.keys(body.acceptances)).toEqual([`${MODULE}:para:b`]);
    expect(jsonDrift(body)).toEqual({
      top: [],
      segment: [],
      editRow: [],
      acceptanceRow: [],
      forbidden: [],
    });
  });

  it('control: a planted key is reported at each level', async () => {
    const { body } = await serve();
    body.opened_at_ms = 1;
    body.segments.find((s) => 'baseSha256' in s).assists = [];
    Object.values(body.edits)[0][0].clientActionId = 'x';
    expect(jsonDrift(body)).toMatchObject({
      top: ['opened_at_ms'],
      segment: ['assists'],
      editRow: ['clientActionId'],
      forbidden: ['assists', 'clientActionId', 'opened_at_ms'],
    });
  });

  // PR1 review C23: the exact sets are the union over EVERY segment, edit row and acceptance, not one sample of
  // each. The planted keys sit on non-first objects and match no FORBIDDEN_KEY name, so only the exact sets see them.
  it('control: a key planted on a non-first segment, edit row or acceptance is reported', async () => {
    const { body } = await serve();
    expect(body.segments.length).toBeGreaterThan(1); // there is a non-first segment to plant on
    body.segments.at(-1).probe_segment = 1;
    const rows = Object.values(body.edits)[0];
    rows.push({ ...rows[0], probe_edit: 1 });
    const firstAcc = Object.values(body.acceptances)[0];
    body.acceptances['probe-segment'] = { ...firstAcc, probe_acceptance: 1 };
    expect(jsonDrift(body)).toEqual({
      top: [],
      segment: ['probe_segment'],
      editRow: ['probe_edit'],
      acceptanceRow: ['probe_acceptance'],
      forbidden: [],
    });
  });
});

// ── PR2 (Task 3): the opening record. Bound here, under names no earlier describe uses; the env
// lines at the top of this file (SESSIONS_DB_PATH, JWT_SECRET) already precede these requires.
const OpeningDb = require('better-sqlite3');
const { runAllMigrations: migrateAll } = require('../services/migrationRunner');
const moduleOpenings = require('../services/moduleOpenings');
const pr2Parser = require('../services/segmentParser');

const SENTINEL_MS = 1_777_777_777_777;
/** Every .js file under root whose text matches pattern (read as bytes, so a NUL cannot hide a match). */
function filesNaming(root, pattern) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && pattern.test(readFileSync(p, 'latin1')))
        out.push(path.relative(root, p));
    }
  };
  walk(root);
  return out.sort();
}
const OPENING_NAMES = /module_openings|module_opening_inflight|opened_at_ms/;

describe('T17 (PR2): no opened time, no switch time and no snapshot in any response (spec §11)', () => {
  const PR2_BOOK = 'efnafraedi-2e';
  const OPENER = { id: 'p-t17', username: 'p-t17', role: 'editor', books: [] };
  let db;
  let priorBooksDir;
  let booksRoot;
  let getModule;

  beforeAll(() => {
    migrateAll(); // idempotent
    db = new OpeningDb(process.env.SESSIONS_DB_PATH);
    const userService = require('../services/userService');
    priorBooksDir = pr2Parser.BOOKS_DIR;
    booksRoot = mkdtempSync(path.join(tmpdir(), 't17-pr2-books-'));
    pr2Parser._setTestBooksDir(booksRoot);
    getModule = handlerFor(require('../routes/segment-editor'), 'get', '/:book/:chapter/:moduleId');
    writeModule(booksRoot, {
      book: PR2_BOOK,
      chapterDir: 'ch01',
      moduleId: 'm94030',
      en: [
        ['m94030:para:a', 'Alpha.'],
        ['m94030:para:b', 'Beta.'],
      ],
      mt: [
        ['m94030:para:a', 'Alfa.'],
        ['m94030:para:b', 'Beta á íslensku.'],
      ],
    });
    const opener = userService.createUser({
      providerId: 'p-t17',
      providerUsername: 'p-t17',
      role: 'editor',
    });
    userService.assignChapter(opener.id, PR2_BOOK, 1);
    // seeded by SQL on this db, so jsonDrift finds an edit row and an acceptance row and nothing
    // is written under books/
    addEdit({ moduleId: 'm94030', seg: 'm94030:para:a' });
    db.prepare(
      `INSERT INTO segment_acceptances (book, chapter, module_id, segment_id, accepted_content,
         accepted_by, accepted_by_username, status)
       VALUES (?, 1, 'm94030', 'm94030:para:b', 'Beta á íslensku.', 'ed-a', 'ed-a', 'active')`
    ).run(PR2_BOOK);
  });

  afterEach(() => {
    moduleOpenings._setTestClock(null);
  });

  afterAll(() => {
    db.close();
    pr2Parser._setTestBooksDir(priorBooksDir);
    rmSync(booksRoot, { recursive: true, force: true });
  });

  const serveAs = (user) =>
    invoke(getModule, {
      params: { book: PR2_BOOK, chapter: '1', moduleId: 'm94030' },
      chapterNum: 1,
      user,
    });
  const openingRow = (m) =>
    db
      .prepare('SELECT * FROM module_openings WHERE book = ? AND chapter = 1 AND module_id = ?')
      .get(PR2_BOOK, m);
  const snapshotOf = (m) =>
    db
      .prepare(
        `SELECT segment_id, occurrence FROM module_opening_inflight
         WHERE book = ? AND chapter = 1 AND module_id = ? ORDER BY segment_id, occurrence`
      )
      .all(PR2_BOOK, m);
  function addEdit({ moduleId, seg, editor = 'ed-a' }) {
    db.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
         editor_id, editor_username, created_at)
       VALUES (?, 1, ?, ?, 'IS', 'IS breytt', 'pending', ?, ?, '2026-06-16 10:00:00')`
    ).run(PR2_BOOK, moduleId, seg, editor, editor);
  }

  it('the serve that opens a unit sends exactly what any serve sends, and no trace of its time', async () => {
    moduleOpenings._setTestClock(() => SENTINEL_MS);
    const first = await serveAs(OPENER);
    expect(first.status).toBe(200);
    // positive control: this serve DID record the time and a snapshot, so their absence below means something
    expect(openingRow('m94030').opened_at_ms).toBe(SENTINEL_MS);
    expect(snapshotOf('m94030')).toEqual([{ segment_id: 'm94030:para:a', occurrence: -1 }]);
    // the seeded rows are what the drift check reads (so an empty edits or acceptances map cannot pass it)
    expect(Object.keys(first.body.edits)).toEqual(['m94030:para:a']);
    expect(Object.keys(first.body.acceptances)).toEqual(['m94030:para:b']);
    expect(jsonDrift(first.body)).toEqual({
      top: [],
      segment: [],
      editRow: [],
      acceptanceRow: [],
      forbidden: [],
    });
    const text = JSON.stringify(first.body);
    expect(
      [String(SENTINEL_MS), new Date(SENTINEL_MS).toISOString()].filter((s) => text.includes(s))
    ).toEqual([]);
    const second = await serveAs(OPENER);
    expect(second.body).toEqual(first.body); // opening added nothing a later serve lacks
  });

  it('control: the comparison sees a change', async () => {
    const a = await serveAs(OPENER);
    addEdit({ moduleId: 'm94030', seg: 'm94030:para:b', editor: 'ed-b' });
    expect((await serveAs(OPENER)).body).not.toEqual(a.body);
  });

  it('no file under server/routes/ names the opening tables or their time column', () => {
    const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'routes');
    expect(filesNaming(routesDir, OPENING_NAMES)).toEqual([]);
  });

  it('control: the scan names a planted file', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 't17-pr2-'));
    writeFileSync(
      path.join(tmp, 'leak.js'),
      'db.prepare("SELECT opened_at_ms FROM module_openings")'
    );
    writeFileSync(path.join(tmp, 'clean.js'), 'module.exports = {};');
    expect(filesNaming(tmp, OPENING_NAMES)).toEqual(['leak.js']);
    rmSync(tmp, { recursive: true, force: true });
  });
});
