/**
 * The book glossary page's routes (design §5.2). This task covers the read routes and the guard; the
 * write routes extend this file. Requests go through the real router with real tokens.
 *
 * Never writes under the real books/ tree: the books root and the project root (the export status
 * file) are temp directories injected through test seams.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/book-glossary', require('../routes/book-glossary'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  for (const t of [
    'book_glossary_exclusion',
    'book_glossary_entry',
    'book_glossary_change',
    'book_term_preference',
    'concept_term',
    'concept',
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  writeFileSync(path.join(projectRoot, 'pipeline-output', '.glossary-export-status.json'), '{}');
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
