/**
 * The book glossary page's routes (design §5.2): the guard, the read routes and the write routes.
 * Requests go through the real router with real tokens.
 *
 * Never writes under the real books/ tree: the books root and the project root (the export status
 * file) are temp directories injected through test seams.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'book-glossary-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const BOOK = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

let server;
let base;
let createToken;
let db;
let bookId;
let layer;
let rules;
let service;
let booksRoot;
let projectRoot;
let inflections;
let logger;
let routes;
let runner;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  db = require('../services/bookGlossaryDb').getDb();
  layer = require('../lib/bookGlossaryLayer');
  rules = require('../lib/bookGlossaryRules');
  service = require('../services/bookGlossaryService');
  bookId = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(BOOK).id;

  booksRoot = path.join(work, 'books');
  mkdirSync(path.join(booksRoot, BOOK, 'glossary'), { recursive: true });
  mkdirSync(path.join(booksRoot, OTHER), { recursive: true }); // no glossary/ directory
  require('../services/segmentParser')._setTestBooksDir(booksRoot);
  projectRoot = path.join(work, 'project');
  mkdirSync(path.join(projectRoot, 'pipeline-output'), { recursive: true });
  service._setProjectRoot(projectRoot);

  // The lookup runs only when a BÍN file exists. Any file will do, because the runner is injected
  // and never reads it; the licensed file never enters a test.
  inflections = require('../services/bookGlossaryInflections');
  const binStandIn = path.join(work, 'bin-stand-in.csv');
  writeFileSync(binStandIn, '');
  inflections._setBinDataPath(binStandIn);
  logger = require('../lib/logger');
  routes = require('../routes/book-glossary');

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/book-glossary', routes);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await inflections._idle();
  inflections._setRunner(undefined);
  inflections._setBinDataPath(undefined);
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

// A lookup outcome the service reads as forms written, so a finished lookup logs no warning.
const FOUND_FORMS = {
  code: 0,
  signal: null,
  report: { strings: { total: 1, unambiguous: 1 }, rows: { written: 1, superseded: 0 } },
  stderr: '',
};

beforeEach(() => {
  for (const t of [
    'book_glossary_exclusion',
    'book_glossary_entry',
    'book_glossary_change',
    'book_term_preference',
    'concept_term',
    'concept',
    'activity_log',
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  writeFileSync(path.join(projectRoot, 'pipeline-output', '.glossary-export-status.json'), '{}');
  runner = vi.fn(async () => FOUND_FORMS);
  inflections._setRunner(runner);
});

afterEach(async () => {
  // A lookup still running would write its activity row into the next test.
  await inflections._idle();
  vi.restoreAllMocks();
});

function cookieFor(role, books = [], id = `enginn-reikningur-${role}`) {
  const token = createToken({ id, username: `${role}@skoli.example`, name: role, role, books });
  return `auth_token=${token}`;
}
const headEditor = () => cookieFor('head-editor', [BOOK]);

async function get(url, cookie = headEditor()) {
  const res = await fetch(base + url, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(url, body, cookie = headEditor()) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function addPair(domain, english, icelandic, extra = {}) {
  const id = Number(
    db
      .prepare('INSERT INTO concept (domain, collection) VALUES (?, ?)')
      .run(domain, extra.collection ?? null).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  const termId = Number(ins.run(id, 'is', icelandic).lastInsertRowid);
  return { id, termId };
}

const write = {
  reason: 'af því bara',
  source: 'test',
  at: '2026-11-20T00:00:00.000Z',
};

describe('the guard', () => {
  it('an editor, a head editor of another book and no session are refused; a head editor of the book and an admin get through', async () => {
    const url = `/api/book-glossary/${BOOK}`;
    const statuses = [
      (await get(url, cookieFor('editor'))).status,
      (await get(url, cookieFor('head-editor', [OTHER]))).status,
      (await get(url, null)).status,
      (await get(url, headEditor())).status,
      (await get(url, cookieFor('admin'))).status,
    ];
    expect(statuses).toEqual([403, 403, 401, 200, 200]);
  });
});

describe('GET /', () => {
  it('lists exclusions and entries with display names and inflection state', async () => {
    const accountId = 'reikningur-ritstjori-1';
    db.prepare(
      "INSERT INTO users (provider_id, provider_username, display_name, role) VALUES (?, 'r@skoli.example', 'Rannveig Ritstjóri', 'head-editor')"
    ).run(accountId);
    layer.addEntry(db, {
      ...write,
      book: BOOK,
      english: ['zword'],
      icelandic: 'zorð',
      by: accountId,
    });
    layer.addExclusion(db, { ...write, book: BOOK, english: 'zdrop', by: accountId });

    const { status, body } = await get(`/api/book-glossary/${BOOK}`);
    expect(status).toBe(200);
    expect(body.book).toBe(BOOK);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].createdBy).toBe('Rannveig Ritstjóri');
    expect(body.entries[0].inflections).toEqual({ state: 'exact-only', reason: null });
    expect(body.exclusions).toHaveLength(1);
    expect(body.exclusions[0].createdBy).toBe('Rannveig Ritstjóri');
  });

  it('reports the hold from the status file', async () => {
    writeFileSync(
      path.join(projectRoot, 'pipeline-output', '.glossary-export-status.json'),
      JSON.stringify({
        ran: '2026-11-20T00:00:00.000Z',
        errors: 0,
        books: { [BOOK]: { outcome: 'refused-layer-change', since: '2026-11-19T12:00:00.000Z' } },
      })
    );
    const { body } = await get(`/api/book-glossary/${BOOK}`);
    expect(body.hold.held).toBe(true);
    expect(body.hold.since).toBe('2026-11-19T12:00:00.000Z');
  });

  it('reports no hold when the status file is absent', async () => {
    const { body } = await get(`/api/book-glossary/${BOOK}`);
    expect(body.hold).toEqual({ held: false, since: null, recordError: false });
  });
});

describe('GET /lookup', () => {
  it('reports house style through the same predicate as the write refusal', async () => {
    addPair('chemistry', 'zhouse', 'zhús', { collection: 'house-style' });
    const expected = rules.houseStyleInScope(db, bookId, 'zhouse');
    expect(expected).toHaveLength(1);
    const { status, body } = await get(`/api/book-glossary/${BOOK}/lookup?english=zhouse`);
    expect(status).toBe(200);
    expect(body.houseStyle).toEqual(expected);
  });

  it("lists the book's preferences on the headword by chapter", async () => {
    const a = addPair('chemistry', 'zpref', 'zval');
    const b = addPair('chemistry', 'zpref', 'zannað');
    const ins = db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,?,?,?)'
    );
    ins.run(bookId, 3, 'zpref', a.termId);
    ins.run(bookId, 5, 'zpref', b.termId);
    const { body } = await get(`/api/book-glossary/${BOOK}/lookup?english=zpref`);
    expect(body.preferences).toEqual([
      { chapter: 3, icelandic: 'zval', conceptId: a.id },
      { chapter: 5, icelandic: 'zannað', conceptId: b.id },
    ]);
    expect(body.resolution).toBeDefined();
  });
});

describe('GET /history', () => {
  it('returns rows newest first, with display names', async () => {
    const added = layer.addExclusion(db, { ...write, book: BOOK, english: 'zhist', by: 'tester' });
    layer.removeExclusion(db, { ...write, book: BOOK, exclusionId: added.id, by: 'tester' });
    const { status, body } = await get(`/api/book-glossary/${BOOK}/history?english=zhist`);
    expect(status).toBe(200);
    const ids = body.history.map((h) => h.id);
    expect(ids).toEqual([...ids].sort((x, y) => y - x));
    expect(body.history.map((h) => h.action)).toEqual(['unexclude', 'exclude']);
    expect(body.history[0].by).toBe('tester');
  });
});

describe('validation', () => {
  it('an unregistered book and a control character in english are 400', async () => {
    const unknown = await get('/api/book-glossary/ekki-til/lookup?english=x', cookieFor('admin'));
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ error: 'Ógilt gildi: book' });
    const bad = await get(`/api/book-glossary/${BOOK}/lookup?english=a%00b`);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'Ógilt gildi: english' });
    const missing = await get(`/api/book-glossary/${BOOK}/history`);
    expect(missing.body).toEqual({ error: 'Ógilt gildi: english' });
  });
});

describe('service', () => {
  it('hasGlossaryDir follows the books root: present for one book, absent for another', () => {
    expect(service.hasGlossaryDir(BOOK)).toBe(true);
    expect(service.hasGlossaryDir(OTHER)).toBe(false);
  });
});

// ── The write routes ────────────────────────────────────────────────────────────────────────────

const url = `/api/book-glossary/${BOOK}`;
const REASON = 'af því bara';

/** Row counts of every table a write can touch, so "writes nothing" compares before and after. */
function counts() {
  return Object.fromEntries(
    [
      'book_glossary_exclusion',
      'book_glossary_entry',
      'book_glossary_change',
      'concept',
      'concept_term',
      'activity_log',
    ].map((t) => [t, db.prepare(`SELECT count(*) n FROM ${t}`).get().n])
  );
}

const isTermId = (conceptId) =>
  db.prepare("SELECT id FROM concept_term WHERE concept_id = ? AND lang = 'is'").get(conceptId).id;

const lookedUp = () => runner.mock.calls.map((c) => c[0].conceptTermIds);

/** An entry written straight through the write API, for routes that act on one. */
const seedEntry = (english, icelandic = 'zfærsla') =>
  layer.addEntry(db, { ...write, book: BOOK, english: [english], icelandic, by: 'tester' });

describe('POST: who writes', () => {
  it("each route writes as the session's account, ignoring a by in the body", async () => {
    const cookie = cookieFor('head-editor', [BOOK], 'reikningur-seta-1');
    const forged = { by: 'falsari', at: '1999-01-01T00:00:00.000Z', reason: REASON };
    const ex = await post(
      `${url}/exclusions`,
      { ...forged, english: 'zwho', conceptId: 0 },
      cookie
    );
    await post(`${url}/exclusions/${ex.body.id}/undo`, forged, cookie);
    const entry = await post(
      `${url}/entries`,
      { ...forged, forms: ['zwhom'], icelandic: 'zhver', mode: 'add' },
      cookie
    );
    await post(
      `${url}/entries/${entry.body.conceptId}/change`,
      { ...forged, icelandic: 'zhvor' },
      cookie
    );
    await post(`${url}/entries/${entry.body.conceptId}/remove`, forged, cookie);
    const rows = db.prepare('SELECT by, at FROM book_glossary_change ORDER BY id').all();
    expect({
      writes: rows.length,
      by: [...new Set(rows.map((r) => r.by))],
      backdated: rows.filter((r) => r.at === forged.at).length,
    }).toEqual({ writes: 5, by: ['reikningur-seta-1'], backdated: 0 });
  });

  it('an omitted source is written as an empty string', async () => {
    await post(`${url}/exclusions`, { english: 'znosource', conceptId: 0, reason: REASON });
    const row = db.prepare('SELECT source FROM book_glossary_exclusion').get();
    const change = db.prepare('SELECT source FROM book_glossary_change').get();
    expect([row.source, change.source]).toEqual(['', '']);
  });

  it('a provided source is written trimmed', async () => {
    await post(`${url}/exclusions`, {
      english: 'zsourced',
      conceptId: 0,
      reason: REASON,
      source: '  fundur 20. nóvember  ',
    });
    const row = db.prepare('SELECT source FROM book_glossary_exclusion').get();
    expect(row.source).toBe('fundur 20. nóvember');
  });

  // Design §AMENDED 2026-11-20 (1): a reason pasted from an email keeps its words on one line.
  it('line breaks and tabs in reason and source are collapsed to one space', async () => {
    const res = await post(`${url}/exclusions`, {
      english: 'zcollapsed',
      conceptId: 0,
      reason: 'fyrsta lína\r\n\tönnur   lína',
      source: ' nefnd\nfundur ',
    });
    const row = db.prepare('SELECT reason, source FROM book_glossary_exclusion').get();
    const change = db.prepare('SELECT reason, source FROM book_glossary_change').get();
    expect({ status: res.status, row, change }).toEqual({
      status: 201,
      row: { reason: 'fyrsta lína önnur lína', source: 'nefnd fundur' },
      change: { reason: 'fyrsta lína önnur lína', source: 'nefnd fundur' },
    });
  });

  it("removing a replacing entry with undoExclusions undoes that entry's exclusion", async () => {
    const old = addPair('chemistry', 'zreplaced', 'zgamla');
    const entry = await post(`${url}/entries`, {
      forms: ['zreplaced'],
      icelandic: 'znýja',
      mode: 'replace',
      replaces: [old.id],
      reason: REASON,
    });
    const exclusion = db
      .prepare('SELECT id FROM book_glossary_exclusion WHERE concept_id = ?')
      .get(old.id);
    const removed = await post(`${url}/entries/${entry.body.conceptId}/remove`, {
      reason: REASON,
      undoExclusions: [exclusion.id],
    });
    expect({
      status: removed.status,
      undone: removed.body.undone,
      left: db.prepare('SELECT count(*) n FROM book_glossary_exclusion').get().n,
    }).toEqual({ status: 200, undone: [exclusion.id], left: 0 });
  });
});

describe('POST: the guard', () => {
  // Every route gets ids that exist and a body it would accept, so a route that lost its guard
  // shows as a write here, never as a 400 or a 409 that would look like a refusal.
  it.each([
    [
      '/exclusions',
      () => ({ path: '/exclusions', body: { english: 'zguard', conceptId: 0, reason: REASON } }),
    ],
    [
      '/exclusions/:id/undo',
      () => {
        const ex = layer.addExclusion(db, { ...write, book: BOOK, english: 'zgone', by: 'tester' });
        return { path: `/exclusions/${ex.id}/undo`, body: { reason: REASON } };
      },
    ],
    [
      '/entries',
      () => ({
        path: '/entries',
        body: { forms: ['zguarded'], icelandic: 'zvarið', mode: 'add', reason: REASON },
      }),
    ],
    [
      '/entries/:conceptId/change',
      () => ({
        path: `/entries/${seedEntry('zchange').conceptId}/change`,
        body: { icelandic: 'zbreytt', reason: REASON },
      }),
    ],
    [
      '/entries/:conceptId/remove',
      () => ({
        path: `/entries/${seedEntry('zremove').conceptId}/remove`,
        body: { reason: REASON },
      }),
    ],
    [
      '/entries/:conceptId/inflections',
      () => ({ path: `/entries/${seedEntry('zretry').conceptId}/inflections`, body: {} }),
    ],
  ])(
    'an editor of the book, a head editor of another book and no session are refused, and nothing is written: %s',
    async (_route, setup) => {
      const { path: p, body } = setup();
      const before = counts();
      const statuses = [];
      for (const cookie of [cookieFor('editor', [BOOK]), cookieFor('head-editor', [OTHER]), null]) {
        statuses.push((await post(url + p, body, cookie)).status);
      }
      // The retry route's lookup writes its activity row after the response.
      await inflections._idle();
      expect({ statuses, after: counts(), lookups: runner.mock.calls.length }).toEqual({
        statuses: [403, 403, 401],
        after: before,
        lookups: 0,
      });
    }
  );

  it('an admin passes the same guard and writes (control)', async () => {
    const before = counts().book_glossary_exclusion;
    const res = await post(
      `${url}/exclusions`,
      { english: 'zguard', conceptId: 0, reason: REASON },
      cookieFor('admin')
    );
    expect({ status: res.status, written: counts().book_glossary_exclusion - before }).toEqual({
      status: 201,
      written: 1,
    });
  });

  it('no session on an unknown book is 401, not 400: the guard answers before the registry is read', async () => {
    const res = await post(
      '/api/book-glossary/ekki-til/exclusions',
      { english: 'zguard', conceptId: 0, reason: REASON },
      null
    );
    expect(res.status).toBe(401);
  });
});

describe('POST: validation', () => {
  const add = { icelandic: 'zí', mode: 'add', reason: REASON };
  it.each([
    [
      'empty english',
      () => '/exclusions',
      { english: '', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'whitespace-only reason',
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: '   ' },
      'reason',
    ],
    [
      'conceptId -1',
      () => '/exclusions',
      { english: 'zv', conceptId: -1, reason: REASON },
      'conceptId',
    ],
    [
      'conceptId 1.5',
      () => '/exclusions',
      { english: 'zv', conceptId: 1.5, reason: REASON },
      'conceptId',
    ],
    ['a missing conceptId', () => '/exclusions', { english: 'zv', reason: REASON }, 'conceptId'],
    ['forms []', () => '/entries', { ...add, forms: [] }, 'forms'],
    [
      '21 forms',
      () => '/entries',
      { ...add, forms: Array.from({ length: 21 }, (_, i) => `zf${i}`) },
      'forms',
    ],
    ['a 201-character form', () => '/entries', { ...add, forms: ['z'.repeat(201)] }, 'forms'],
    ["mode 'both'", () => '/entries', { ...add, forms: ['zv'], mode: 'both' }, 'mode'],
    [
      'replace without replaces',
      () => '/entries',
      { ...add, forms: ['zv'], mode: 'replace' },
      'replaces',
    ],
    ['add with replaces', () => '/entries', { ...add, forms: ['zv'], replaces: [1] }, 'replaces'],
    [
      "confirmHouseStyle 'yes'",
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: REASON, confirmHouseStyle: 'yes' },
      'confirmHouseStyle',
    ],
    [
      'a change with neither field',
      (s) => `/entries/${s.conceptId}/change`,
      { reason: REASON },
      'icelandic',
    ],
    [
      'a non-numeric concept id in the path',
      () => '/entries/abc/remove',
      { reason: REASON },
      'conceptId',
    ],
    [
      'a 2001-character reason',
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: 'r'.repeat(2001) },
      'reason',
    ],
    [
      'a 501-character source',
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: REASON, source: 's'.repeat(501) },
      'source',
    ],
    [
      'a numeric source',
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: REASON, source: 7 },
      'source',
    ],
    [
      'a 201-character icelandic',
      () => '/entries',
      { ...add, forms: ['zv'], icelandic: 'í'.repeat(201) },
      'icelandic',
    ],
    [
      'a control character inside a form',
      () => '/entries',
      { ...add, forms: ['z\u0007v'] },
      'forms',
    ],
    [
      'a non-numeric undoExclusions id',
      (s) => `/entries/${s.conceptId}/remove`,
      { reason: REASON, undoExclusions: ['x'] },
      'undoExclusions',
    ],
    // changeEntry checks neither length nor characters itself, so the route is the only boundary.
    [
      'a 201-character icelandic in a change',
      (s) => `/entries/${s.conceptId}/change`,
      { icelandic: 'í'.repeat(201), reason: REASON },
      'icelandic',
    ],
    [
      'a control character inside a form in a change',
      (s) => `/entries/${s.conceptId}/change`,
      { forms: ['zseeded', 'z\u0007v'], reason: REASON },
      'forms',
    ],
    [
      'a non-numeric exclusion id in the path',
      () => '/exclusions/abc/undo',
      { reason: REASON },
      'id',
    ],
    // Design §AMENDED 2026-11-20 (2): invisible characters make a headword that matches nothing.
    [
      'a zero-width space inside english',
      () => '/exclusions',
      { english: 'z\u200Bv', conceptId: 0, reason: REASON },
      'english',
    ],
    // trim() strips U+FEFF, so a trailing byte-order mark must be refused before trimming.
    [
      'a byte-order mark at the end of a form',
      () => '/entries',
      { ...add, forms: ['zv\uFEFF'] },
      'forms',
    ],
    [
      'a bidi override inside english',
      () => '/exclusions',
      { english: 'z\u202Ev', conceptId: 0, reason: REASON },
      'english',
    ],
    // One sample per invisible range, so dropping any range from INVISIBLE_CHARS fails a row.
    [
      'a zero-width non-joiner inside english',
      () => '/exclusions',
      { english: 'z\u200Cv', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'a left-to-right mark inside english',
      () => '/exclusions',
      { english: 'z\u200Ev', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'a bidi embedding inside english',
      () => '/exclusions',
      { english: 'z\u202Av', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'a word joiner inside english',
      () => '/exclusions',
      { english: 'z\u2060v', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'a bidi isolate inside english',
      () => '/exclusions',
      { english: 'z\u2066v', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'an Arabic letter mark inside english',
      () => '/exclusions',
      { english: 'z\u061Cv', conceptId: 0, reason: REASON },
      'english',
    ],
    [
      'a byte-order mark at the start of english',
      () => '/exclusions',
      { english: '\uFEFFzv', conceptId: 0, reason: REASON },
      'english',
    ],
    // The rule covers the Icelandic term too (add and change routes), so it cannot hold a hidden character.
    [
      'a zero-width space inside the icelandic of a new entry',
      () => '/entries',
      { ...add, forms: ['zv'], icelandic: 'z\u200Bí' },
      'icelandic',
    ],
    [
      'a byte-order mark at the end of the icelandic in a change',
      (s) => `/entries/${s.conceptId}/change`,
      { icelandic: 'zí\uFEFF', reason: REASON },
      'icelandic',
    ],
    // Design §AMENDED 2026-11-20 (1): collapsing whitespace must not let other control characters in.
    [
      'a control character inside a reason',
      () => '/exclusions',
      { english: 'zv', conceptId: 0, reason: 'a\u0001b' },
      'reason',
    ],
  ])(
    'each validation failure is 400 and writes nothing: %s',
    async (_name, pathOf, body, field) => {
      const seeded = seedEntry('zseeded');
      const before = counts();
      const res = await post(url + pathOf(seeded), body);
      expect({ status: res.status, body: res.body, after: counts() }).toEqual({
        status: 400,
        body: { error: `Ógilt gildi: ${field}` },
        after: before,
      });
    }
  );
});

describe('POST: refusals', () => {
  const MESSAGES = {
    'concept-missing': 'Hugtakið er ekki til.',
    'not-carried': 'Hugtakið ber ekki þetta enska orð.',
    'entry-conflict': 'Bókin hefur þegar færslu fyrir þetta orð.',
    'excluded-headword': 'Orðið er útilokað í heild í þessari bók. Afturkallaðu útilokunina fyrst.',
    preference:
      'Bókin hefur valið þýðingu fyrir þetta orð. Síðan getur ekki breytt því vali; biddu forritara um að gera það.',
    'own-entry':
      'Þetta er færsla bókarinnar sjálfrar. Breyttu henni eða fjarlægðu hana frekar en að útiloka hana.',
    'replaced-not-carried': 'Hugtakið sem á að víkja ber ekkert af ensku orðum færslunnar.',
    'not-found': 'Fannst ekki í orðasafni bókarinnar.',
    'merged-into':
      'Öðru hugtaki hefur verið steypt saman við þessa færslu. Biddu forritara um að skoða það.',
    'no-scope': 'Bókin hefur enga sviðsröð. Biddu forritara um að skoða það.',
    'needs-confirm':
      'Þessi breyting víkur til hliðar ákvörðun um orðanotkun verksins. Staðfestu til að halda áfram.',
    invalid: 'Ógild beiðni.',
    'unknown-book': 'Ógild beiðni.',
  };
  const newEntry = (forms) => ({ forms, icelandic: 'zí', mode: 'add', reason: REASON });

  it('MESSAGES has an Icelandic message for every refusal the write API can throw', () => {
    expect(routes.MESSAGES).toEqual(MESSAGES);
    expect(Object.keys(routes.MESSAGES).sort()).toEqual([...layer.REFUSALS].sort());
  });

  // invalid and unknown-book are absent: the route's own validation and registered-book check
  // answer first, so no request reaches the write API with either.
  it.each([
    [
      'concept-missing',
      () => ({ path: '/exclusions', body: { english: 'zq', conceptId: 999999, reason: REASON } }),
    ],
    [
      'not-carried',
      () => {
        const c = addPair('chemistry', 'zfoo', 'zfú');
        return { path: '/exclusions', body: { english: 'zbar', conceptId: c.id, reason: REASON } };
      },
    ],
    [
      'entry-conflict',
      () => {
        seedEntry('zclash');
        return { path: '/exclusions', body: { english: 'zclash', conceptId: 0, reason: REASON } };
      },
    ],
    [
      'excluded-headword',
      () => {
        layer.addExclusion(db, { ...write, book: BOOK, english: 'zgone', by: 'tester' });
        return { path: '/entries', body: newEntry(['zgone']) };
      },
    ],
    [
      'preference',
      () => {
        const c = addPair('chemistry', 'zchosen', 'zvalið');
        db.prepare(
          'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?,?,?,?)'
        ).run(bookId, 3, 'zchosen', c.termId);
        return { path: '/entries', body: newEntry(['zchosen']) };
      },
    ],
    [
      'own-entry',
      () => {
        const e = seedEntry('zmine');
        return {
          path: '/exclusions',
          body: { english: 'zmine', conceptId: e.conceptId, reason: REASON },
        };
      },
    ],
    [
      'replaced-not-carried',
      () => {
        const c = addPair('chemistry', 'zold', 'zgamalt');
        return {
          path: '/entries',
          body: { ...newEntry(['znew']), mode: 'replace', replaces: [c.id] },
        };
      },
    ],
    [
      'no-scope',
      () => {
        const saved = db
          .prepare('SELECT * FROM book_domain_priority WHERE book_id = ?')
          .all(bookId);
        db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?').run(bookId);
        const restore = () => {
          const ins = db.prepare(
            `INSERT INTO book_domain_priority (${Object.keys(saved[0]).join(', ')}) VALUES (${Object.keys(
              saved[0]
            )
              .map(() => '?')
              .join(', ')})`
          );
          for (const r of saved) ins.run(...Object.values(r));
        };
        return { path: '/entries', body: newEntry(['zscope']), restore };
      },
    ],
    ['not-found', () => ({ path: '/exclusions/999999/undo', body: { reason: REASON } })],
    [
      'merged-into',
      () => {
        const e = seedEntry('zmerged');
        db.prepare('INSERT INTO concept (domain, merged_into) VALUES (?, ?)').run(
          'chemistry',
          e.conceptId
        );
        return { path: `/entries/${e.conceptId}/remove`, body: { reason: REASON } };
      },
    ],
  ])('a refusal is 409 with its Icelandic message and code: %s', async (refusal, setup) => {
    const { path: p, body, restore } = setup();
    let res;
    try {
      res = await post(url + p, body);
    } finally {
      if (restore) restore();
    }
    expect({ status: res.status, body: res.body }).toEqual({
      status: 409,
      body: { error: MESSAGES[refusal], refusal },
    });
  });

  it('needs-confirm is 409 with the house-style term; resending with confirmHouseStyle writes', async () => {
    addPair('chemistry', 'zhouse', 'zhús', { collection: 'house-style' });
    const body = { english: 'zhouse', conceptId: 0, reason: REASON };
    const houseStyle = rules.houseStyleInScope(db, bookId, 'zhouse');
    const first = await post(`${url}/exclusions`, body);
    const second = await post(`${url}/exclusions`, { ...body, confirmHouseStyle: true });
    expect({
      houseStyleFound: houseStyle.length,
      first: { status: first.status, body: first.body },
      second: second.status,
      written: db
        .prepare('SELECT count(*) n FROM book_glossary_exclusion WHERE english = ?')
        .get('zhouse').n,
    }).toEqual({
      houseStyleFound: 1,
      first: {
        status: 409,
        body: { error: MESSAGES['needs-confirm'], refusal: 'needs-confirm', houseStyle },
      },
      second: 201,
      written: 1,
    });
  });

  it('an error that is not a refusal is 500 and is logged', async () => {
    vi.spyOn(layer, 'addExclusion').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const res = await post(`${url}/exclusions`, { english: 'zboom', conceptId: 0, reason: REASON });
    expect({ status: res.status, body: res.body, logged: logged.mock.calls.length }).toEqual({
      status: 500,
      body: { error: 'Villa á þjóni' },
      logged: 1,
    });
  });
});

describe('POST: a book with no glossary directory', () => {
  const NO_DIR =
    'Bókin hefur enga glossary-möppu, svo breytingar á orðasafni hennar kæmust aldrei í git. Biddu forritara um að stofna hana.';
  const other = `/api/book-glossary/${OTHER}`;
  it.each([
    ['/exclusions', { english: 'zdir', conceptId: 0, reason: REASON }],
    ['/exclusions/1/undo', { reason: REASON }],
    ['/entries', { forms: ['zdir'], icelandic: 'zmappa', mode: 'add', reason: REASON }],
    ['/entries/1/change', { icelandic: 'zmappa', reason: REASON }],
    ['/entries/1/remove', { reason: REASON }],
    ['/entries/1/inflections', {}],
  ])('a book with no glossary directory is 409 and nothing is written: %s', async (p, body) => {
    const before = counts();
    const res = await post(other + p, body, cookieFor('head-editor', [OTHER]));
    await inflections._idle();
    expect({
      status: res.status,
      body: res.body,
      after: counts(),
      lookups: runner.mock.calls.length,
    }).toEqual({
      status: 409,
      body: { error: NO_DIR },
      after: before,
      lookups: 0,
    });
  });

  it('the same exclusion is written for a book that has the directory (control)', async () => {
    const res = await post(`${url}/exclusions`, { english: 'zdir', conceptId: 0, reason: REASON });
    expect(res.status).toBe(201);
  });
});

describe('POST: inflection lookups', () => {
  it("an added entry and a changed Icelandic schedule one lookup with the entry's is term id", async () => {
    const added = await post(`${url}/entries`, {
      forms: ['zinflect'],
      icelandic: 'zbeyging',
      mode: 'add',
      reason: REASON,
    });
    await inflections._idle();
    const afterAdd = lookedUp();
    const changed = await post(`${url}/entries/${added.body.conceptId}/change`, {
      icelandic: 'znýbeyging',
      reason: REASON,
    });
    await inflections._idle();
    const termId = isTermId(added.body.conceptId);
    expect({
      added: added.status,
      changed: changed.status,
      afterAdd,
      afterChange: lookedUp(),
    }).toEqual({
      added: 201,
      changed: 200,
      afterAdd: [[termId]],
      afterChange: [[termId], [termId]],
    });
  });

  it('a forms-only change and a repeated add schedule nothing', async () => {
    const e = seedEntry('zquiet', 'zhljótt');
    const formsOnly = await post(`${url}/entries/${e.conceptId}/change`, {
      forms: ['zquiet', 'zquieter'],
      reason: REASON,
    });
    const again = await post(`${url}/entries`, {
      forms: ['zquiet', 'zquieter'],
      icelandic: 'zhljótt',
      mode: 'add',
      reason: REASON,
    });
    await inflections._idle();
    expect({
      formsOnly: [formsOnly.status, formsOnly.body.icelandicChanged],
      again: [again.status, again.body.status],
      lookups: runner.mock.calls.length,
    }).toEqual({ formsOnly: [200, false], again: [200, 'already'], lookups: 0 });
  });

  it('the retry route schedules a lookup and answers 202', async () => {
    const e = seedEntry('zretry', 'zaftur');
    const res = await post(`${url}/entries/${e.conceptId}/inflections`, {});
    await inflections._idle();
    expect({ status: res.status, lookups: lookedUp() }).toEqual({
      status: 202,
      lookups: [[isTermId(e.conceptId)]],
    });
  });

  it("the retry route refuses a concept that is not one of the book's entries", async () => {
    const c = addPair('chemistry', 'zshared', 'zsameign');
    const res = await post(`${url}/entries/${c.id}/inflections`, {});
    await inflections._idle();
    expect({
      status: res.status,
      refusal: res.body.refusal,
      lookups: runner.mock.calls.length,
    }).toEqual({
      status: 409,
      refusal: 'not-found',
      lookups: 0,
    });
  });
});

describe('POST: activity', () => {
  it('every successful write logs one book_glossary_changed activity', async () => {
    const cookie = cookieFor('head-editor', [BOOK], 'reikningur-virkni-1');
    const ex = await post(
      `${url}/exclusions`,
      { english: 'zact', conceptId: 0, reason: REASON },
      cookie
    );
    const undo = await post(`${url}/exclusions/${ex.body.id}/undo`, { reason: REASON }, cookie);
    const entry = await post(
      `${url}/entries`,
      { forms: ['zactive'], icelandic: 'zvirkur', mode: 'add', reason: REASON },
      cookie
    );
    const change = await post(
      `${url}/entries/${entry.body.conceptId}/change`,
      { icelandic: 'zvirkari', reason: REASON },
      cookie
    );
    const removed = await post(
      `${url}/entries/${entry.body.conceptId}/remove`,
      { reason: REASON },
      cookie
    );
    await inflections._idle();
    const rows = db
      .prepare(
        "SELECT user_id, username, book, metadata FROM activity_log WHERE type = 'book_glossary_changed' ORDER BY id"
      )
      .all()
      .map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
    const as = (action, res) => ({
      user_id: 'reikningur-virkni-1',
      username: 'head-editor@skoli.example',
      book: BOOK,
      metadata: { action, changeId: res.body.changeId },
    });
    expect(rows).toEqual([
      as('exclude', ex),
      as('unexclude', undo),
      as('entry-add', entry),
      as('entry-change', change),
      as('entry-remove', removed),
    ]);
  });

  it('an answer that wrote nothing logs no activity', async () => {
    const e = seedEntry('zsame', 'zsama');
    const unchanged = await post(`${url}/entries/${e.conceptId}/change`, {
      icelandic: 'zsama',
      reason: REASON,
    });
    const changed = db
      .prepare("SELECT count(*) n FROM activity_log WHERE type = 'book_glossary_changed'")
      .get().n;
    expect({ status: unchanged.status, state: unchanged.body.status, changed }).toEqual({
      status: 200,
      state: 'unchanged',
      changed: 0,
    });
  });
});
