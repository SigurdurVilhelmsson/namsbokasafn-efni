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
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

// ── PR3 (Task 31): no route reaches research data, research scripts read no editing record, the loss log is clean.
const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE_FORBIDDEN = /\bresearchDb\b|\beditor_keys\b/;
// §5.22: research figures never read an editing record. G1.23 adds its rejection and left-open tables here.
const FORBIDDEN_TABLES = [
  'segment_edits',
  'segment_acceptances',
  'module_openings',
  'book_switch_events',
  'research_consent',
  'activity_log',
  'analytics_events',
];
// The ONLY exceptions §5.22 allows, each naming research_consent and nothing else:
const RESEARCH_SCRIPT_EXCEPTIONS = Object.freeze({
  'research-withdrawal.js': {
    allowed: ['research_consent'],
    reason:
      'finds withdrawn intervals and sets deletion_done_at_ms (spec §5.15); computes no figure',
  },
  // PR4: the paper-consent admin script, if it is given a research- name (spec §5.14), records a decision or a
  // withdrawal; add it here with the same single allowance.
});
const tableRe = (t) => new RegExp(`\\b${t}\\b`); // \b: module_openings never matches module_opening_inflight

/** Every research-* script under root/scripts, relative to root, sorted. */
function researchScripts(root) {
  const dir = path.join(root, 'scripts');
  return readdirSync(dir)
    .filter((n) => /^research-.*\.js$/.test(n))
    .sort()
    .map((n) => `scripts/${n}`);
}
/** { file, table }[]: each forbidden table a research-* script names, beyond its listed exception. */
function forbiddenTableUses(root) {
  const out = [];
  for (const file of researchScripts(root)) {
    const text = readFileSync(path.join(root, file), 'latin1');
    const allowed = RESEARCH_SCRIPT_EXCEPTIONS[path.basename(file)]?.allowed ?? [];
    for (const table of FORBIDDEN_TABLES) {
      if (!allowed.includes(table) && tableRe(table).test(text)) out.push({ file, table });
    }
  }
  return out;
}

describe('T17 (PR3): no route reaches research data (spec §5.16)', () => {
  it('no file under server/routes/ references researchDb or editor_keys', () => {
    expect(filesNaming(path.join(SERVER_ROOT, 'routes'), ROUTE_FORBIDDEN)).toEqual([]);
  });

  it('control: a planted reference is named', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 't17-pr3-routes-'));
    try {
      writeFileSync(path.join(tmp, 'x.js'), "const r = require('../services/researchDb');");
      writeFileSync(path.join(tmp, 'clean.js'), 'module.exports = {};');
      expect(filesNaming(tmp, ROUTE_FORBIDDEN)).toEqual(['x.js']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('positive control: researchLog.js does reference researchDb', () => {
    expect(filesNaming(path.join(SERVER_ROOT, 'services'), /\bresearchDb\b/)).toContain(
      'researchLog.js'
    );
  });
});

describe('T17 (PR3): research-* scripts read no editing record (spec §5.22)', () => {
  it('no server/scripts/research-* file names a forbidden table, beyond its listed exception', () => {
    expect(researchScripts(SERVER_ROOT)).toContain('scripts/research-status.js');
    expect(forbiddenTableUses(SERVER_ROOT)).toEqual([]);
  });

  it('controls: the exception covers research_consent only, and only for its own file', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 't17-pr3-scripts-'));
    const put = (name, text) => {
      mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
      writeFileSync(path.join(tmp, 'scripts', name), text);
    };
    try {
      put('research-withdrawal.js', 'SELECT * FROM research_consent');
      expect(forbiddenTableUses(tmp)).toEqual([]);
      put('research-withdrawal.js', 'SELECT * FROM research_consent; SELECT * FROM segment_edits');
      expect(forbiddenTableUses(tmp)).toEqual([
        { file: 'scripts/research-withdrawal.js', table: 'segment_edits' },
      ]);
      rmSync(path.join(tmp, 'scripts', 'research-withdrawal.js'));
      put('research-other.js', 'SELECT * FROM research_consent');
      expect(forbiddenTableUses(tmp)).toEqual([
        { file: 'scripts/research-other.js', table: 'research_consent' },
      ]);
      rmSync(path.join(tmp, 'scripts', 'research-other.js'));
      put('research-x.js', 'SELECT * FROM module_opening_inflight');
      expect(forbiddenTableUses(tmp)).toEqual([]); // §5.22 allows the snapshot
      put('research-x.js', 'SELECT * FROM module_openings');
      expect(forbiddenTableUses(tmp)).toEqual([
        { file: 'scripts/research-x.js', table: 'module_openings' },
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── PR4 (Task 4): the admin reader is required by nothing outside server/scripts/ and server/__tests__/.
const ADMIN_READER = /\bresearchAdmin\b/;
// Every top-level entry of server/ except these. filesNaming (PR2) walks everything under its root,
// node_modules and .venv included, so this walker skips them by name at any depth.
const SKIP_DIRS = new Set(['node_modules', '.venv']);
const SCRIPT_SIDE = new Set(['scripts', '__tests__']);
function nonScriptFilesNaming(root, pattern) {
  const found = [];
  const visited = [];
  const walk = (dir, top) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name) || (top && SCRIPT_SIDE.has(e.name))) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, false);
      else if (/\.(?:c|m)?js$/.test(e.name)) {
        visited.push(path.relative(root, p));
        if (pattern.test(readFileSync(p, 'latin1'))) found.push(path.relative(root, p));
      }
    }
  };
  walk(root, true);
  return { found: found.sort(), visited };
}

describe('T17 (PR4): the admin reader stays on the script side (spec §5.16)', () => {
  it('no file outside server/scripts/ and server/__tests__/ requires the admin reader (spec §5.16)', () => {
    const { found, visited } = nonScriptFilesNaming(SERVER_ROOT, ADMIN_READER);
    expect(found).toEqual([]);
    // An empty result is not an empty read.
    expect(visited).toEqual(
      expect.arrayContaining([
        'routes/research.js',
        'services/researchLog.js',
        'lib/researchFiles.js',
      ])
    );
  });

  it('control: a planted require is named wherever it is not allowed', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 't17-pr4-admin-'));
    const put = (rel) => {
      mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      writeFileSync(path.join(tmp, rel), "const a = require('../scripts/lib/researchAdmin');");
    };
    try {
      for (const rel of [
        'routes/x.js',
        'services/y.js',
        'lib/z.js',
        'scripts/research-a.js',
        '__tests__/b.test.js',
      ]) {
        put(rel);
      }
      expect(nonScriptFilesNaming(tmp, ADMIN_READER).found).toEqual([
        'lib/z.js',
        'routes/x.js',
        'services/y.js',
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("T17 (PR3): record's failure log holds no content and no key (spec §5.11 step 2)", () => {
  it('a forced failure logs four fields and nothing else', () => {
    const researchDbT17 = require('../services/researchDb');
    const researchLogT17 = require('../services/researchLog');
    const researchConsentTextT17 = require('../lib/researchConsentText');
    const serverCommitT17 = require('../lib/serverCommit');
    const logger = require('../lib/logger');
    const {
      APPROVED,
      makeUser,
      consent,
      saveEvent,
      readResearch,
    } = require('./helpers/researchFixture.cjs');
    const { resolveResearchDbPath } = require('../lib/researchDbPath');
    const USER_ROW = require('../services/userService');

    migrateAll();
    researchConsentTextT17._setTestApprovedTexts(APPROVED);
    serverCommitT17._setTestServerCommit({
      serverCommit: 'c'.repeat(40),
      commitSource: 'deploy-file',
      codeDirty: 0,
    });
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    let holder;
    try {
      // Boot first: once a consented row exists the research file is never created, so without the boot there
      // would be no file, no key and nothing to lock.
      researchDbT17.openAtBoot();
      const userId = makeUser('p-log');
      const interval = consent(userId);
      const first = researchLogT17.record(
        saveEvent({ actorProviderId: 'p-log', clientActionId: 'f-0' })
      );
      expect(first.status).toBe('written'); // the key now exists
      const r = readResearch();
      let key;
      try {
        key = r
          .prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?')
          .get(interval).editor_key;
      } finally {
        r.close();
      }
      expect(typeof key).toBe('string');
      expect(USER_ROW.findByProviderId('p-log').id).toBe(userId);

      holder = new OpeningDb(resolveResearchDbPath().researchPath);
      holder.exec('BEGIN EXCLUSIVE');
      const result = researchLogT17.record(
        saveEvent({
          actorProviderId: 'p-log',
          content: { text: 'SENTINEL-TEXT-77', note: 'SENTINEL-NOTE-77' },
          clientActionId: 'f-1',
        })
      );
      expect(result).toMatchObject({ status: 'lost', reason: 'busy' });

      expect(spy.mock.calls.length).toBeGreaterThan(0);
      for (const [arg] of spy.mock.calls) {
        expect(Object.keys(arg).sort()).toEqual(['book', 'errorClass', 'errorCode', 'eventType']);
      }
      const logged = JSON.stringify(spy.mock.calls);
      for (const leak of ['SENTINEL-TEXT-77', 'SENTINEL-NOTE-77', key, 'p-log']) {
        expect(logged.includes(leak)).toBe(false);
      }
      const values = spy.mock.calls.flatMap(([arg]) => Object.values(arg));
      expect(values.map(String)).not.toContain(String(userId));
      // Positive control: the spy is aimed at the log that fired.
      expect(spy.mock.calls.map(([arg]) => arg)).toContainEqual({
        errorCode: 'SQLITE_BUSY',
        errorClass: 'busy',
        eventType: 'edit-save',
        book: 'efnafraedi-2e',
      });
    } finally {
      if (holder) {
        holder.exec('ROLLBACK');
        holder.close();
      }
      spy.mockRestore();
      researchDbT17._reset();
      researchConsentTextT17._setTestApprovedTexts(null);
      serverCommitT17._setTestServerCommit(null);
    }
  });
});
