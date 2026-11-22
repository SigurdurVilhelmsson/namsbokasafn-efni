// server/__tests__/editorScopeRoutes.test.js
//
// G1.13 (spec §6.1, §6.7; proofs T2 and T9): the closed-book guard on the real routers, one route
// for each place a route finds its book — the :book param, the request body, and the row it acts
// on. A non-admin is refused 403 BOOK_CLOSED on a closed book; an admin passes; the allowlisted
// book passes. The writes of §6.7 get the book check and no chapter check: a section's assigned
// reviewer, a plain editor holding no chapter row, still submits review and comments in chemistry.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'editor-scope-routes-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const migration040 = require('../migrations/040-service-table-ownership');
const {
  createSegmentEditsSchema,
  createSegmentDiscussionsSchema,
} = require('./helpers/segmentEditsSchema.cjs');

const CHEM = 'efnafraedi-2e';
const LIF = 'liffraedi-2e';

// Invented personas. ED holds a users row and no chapter row; the others decide from their token.
const ED = { username: 'ed-prufa', role: 'editor', books: [] };
const HE_LIF = { username: 'he-lif', role: 'head-editor', books: [LIF] };
const HE_CHEM = { username: 'he-chem', role: 'head-editor', books: [CHEM] };
const ADM = { username: 'adm-prufa', role: 'admin', books: [] };

const SECTION_CHEM = 10; // chemistry, ED is its assigned reviewer, review in progress
const SECTION_LIF = 11; // biology, likewise

let server;
let base;
let editLif;
let editChem;

function mintToken(user) {
  return jwt.sign(
    {
      sub: `u-${user.username}`,
      username: user.username,
      name: user.username,
      role: user.role,
      books: user.books,
    },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}

async function post(pathname, user, body) {
  const res = await fetch(base + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mintToken(user)}` },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(() => {
  const db = new Database(process.env.SESSIONS_DB_PATH);
  migration040.up(db); // activity_log, notifications: the handlers' audit writes
  createSegmentEditsSchema(db);
  createSegmentDiscussionsSchema(db);
  // The tables getSection, findByProviderId and updateSectionStatus read, as in
  // crossBookAuthz.test.js (minimal columns, types copied from migrations 003, 006, 010).
  db.exec(`
    CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT, title_is TEXT);
    CREATE TABLE book_chapters (
      id INTEGER PRIMARY KEY, title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started'
    );
    CREATE TABLE book_sections (
      id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
      chapter_num INTEGER NOT NULL, section_num TEXT NOT NULL, module_id TEXT,
      title_en TEXT, title_is TEXT, status TEXT DEFAULT 'not_started',
      linguistic_reviewer TEXT, linguistic_reviewer_name TEXT,
      linguistic_assigned_at DATETIME, linguistic_submitted_at DATETIME,
      linguistic_approved_at DATETIME, linguistic_approved_by TEXT, linguistic_approved_by_name TEXT,
      localizer TEXT, localizer_name TEXT, localization_assigned_at DATETIME,
      localized_published_at DATETIME
    );
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT,
      role TEXT DEFAULT 'editor', is_active INTEGER DEFAULT 1, provider_id TEXT
    );
    CREATE TABLE user_book_access (
      user_id INTEGER NOT NULL, book_slug TEXT NOT NULL, role_for_book TEXT
    );
    CREATE TABLE user_chapter_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_slug TEXT NOT NULL,
      chapter INTEGER NOT NULL, assigned_by TEXT, assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_slug, chapter)
    );
    CREATE TABLE book_settings (
      book TEXT PRIMARY KEY, enforce_assignments INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare(`INSERT INTO registered_books (id, slug, title_is) VALUES (1, ?, 'Líffræði')`).run(
    LIF
  );
  db.prepare(`INSERT INTO registered_books (id, slug, title_is) VALUES (2, ?, 'Efnafræði')`).run(
    CHEM
  );
  db.prepare(`INSERT INTO book_chapters (id, title_en, title_is) VALUES (1, 'Ch 1', 'K 1')`).run();
  db.prepare(`INSERT INTO book_chapters (id, title_en, title_is) VALUES (2, 'Ch 1', 'K 1')`).run();
  db.prepare(
    `INSERT INTO users (id, display_name, role, provider_id) VALUES (1, 'Prufa Ritstjóri', 'editor', ?)`
  ).run(`u-${ED.username}`);
  const section = db.prepare(
    `INSERT INTO book_sections (id, book_id, chapter_id, chapter_num, section_num, status,
       linguistic_reviewer) VALUES (?, ?, ?, 1, ?, 'review_in_progress', ?)`
  );
  section.run(SECTION_CHEM, 2, 2, '1.1', `u-${ED.username}`);
  section.run(SECTION_LIF, 1, 1, '1.1', `u-${ED.username}`);
  const edit = db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content,
       edited_content, editor_id, editor_username) VALUES (?, 1, 'm68664', 'm68664:para:a', 'a', 'b',
       'u-onnur', 'onnur')`
  );
  editLif = Number(edit.run(LIF).lastInsertRowid);
  editChem = Number(edit.run(CHEM).lastInsertRowid);
  db.close();

  const app = express();
  app.use(express.json());
  app.use('/api/segment-editor', require('../routes/segment-editor'));
  app.use('/api/sections', require('../routes/sections'));
  app.use('/api/pipeline', require('../routes/pipeline'));
  app.use(require('../middleware/errorHandler').errorHandler); // last, as index.js mounts it
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(work, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

const BOOK_CLOSED = { status: 403, error: 'BOOK_CLOSED' };
const verdict = (r) => ({ status: r.status, error: r.body?.error });

describe('the closed-book guard, :book param (T2)', () => {
  const save = (book) => `/api/segment-editor/${book}/1/m68664/edit`;

  it("refuses a closed book's own head editor", async () =>
    expect(verdict(await post(save(LIF), HE_LIF, {}))).toEqual(BOOK_CLOSED));

  it('refuses a plain editor before the chapter check', async () =>
    expect(verdict(await post(save(LIF), ED, {}))).toEqual(BOOK_CLOSED));

  // An empty body stops each passing request at the handler's own validation.
  it('lets an admin through to the handler', async () =>
    expect(verdict(await post(save(LIF), ADM, {}))).toEqual({
      status: 400,
      error: 'segmentId is required',
    }));

  it("lets the allowlisted book's head editor through to the handler", async () =>
    expect(verdict(await post(save(CHEM), HE_CHEM, {}))).toEqual({
      status: 400,
      error: 'segmentId is required',
    }));
});

// SAFETY: every pipeline probe uses chapter 9999, so validateParams answers 400 to any request
// that clears authz and no pipeline job can start (as in crossBookAuthz.test.js).
describe('the closed-book guard, body book (T2)', () => {
  const inject = '/api/pipeline/inject';

  it("refuses a closed book's own head editor", async () =>
    expect(verdict(await post(inject, HE_LIF, { book: LIF, chapter: 9999 }))).toEqual(BOOK_CLOSED));

  it('lets an admin through to validation', async () =>
    expect((await post(inject, ADM, { book: LIF, chapter: 9999 })).status).toBe(400));

  // Chemistry passes the guard and then meets the pipeline hold (G1.14), which answers 423.
  it("lets the allowlisted book's head editor past the guard", async () =>
    expect((await post(inject, HE_CHEM, { book: CHEM, chapter: 9999 })).status).toBe(423));

  // Refused, never accepted. requireHeadEditorFor, which runs before the guard, answers first:
  // 404 "Target not found" when the body names no book, 403 when the book is not one of the
  // caller's (a number never is).
  for (const [name, body, status] of [
    ['missing', { chapter: 9999 }, 404],
    ['a number', { book: 42, chapter: 9999 }, 403],
  ]) {
    it(`a ${name} book is refused with ${status}`, async () =>
      expect((await post(inject, HE_CHEM, body)).status).toBe(status));
  }
});

describe('the closed-book guard, row-derived book (T2)', () => {
  it("refuses a comment on a closed book's edit", async () =>
    expect(
      verdict(await post(`/api/segment-editor/edit/${editLif}/comment`, ED, { comment: 'x' }))
    ).toEqual(BOOK_CLOSED));

  it('answers 404 for an edit that does not exist', async () =>
    expect(
      (await post('/api/segment-editor/edit/999999/comment', ED, { comment: 'x' })).status
    ).toBe(404));

  // The guard is the comment route's first row lookup. A lookup that fails for any reason other
  // than a missing row is an outage: the app's error handler answers 500 and withholds the message.
  it("answers a failed row lookup with the error handler's 500, never a 404 carrying the message", async () => {
    vi.spyOn(require('../services/segmentEditorService'), 'getEditById').mockImplementation(() => {
      throw new Error('SQLITE_BUSY: database is locked');
    });
    const r = await post(`/api/segment-editor/edit/${editChem}/comment`, ED, { comment: 'x' });
    expect([r.status, r.body]).toEqual([
      500,
      { error: 'Internal Server Error', message: 'An unexpected error occurred' },
    ]);
  });

  it("refuses the assigned reviewer's submit-review in a closed book", async () =>
    expect(verdict(await post(`/api/sections/${SECTION_LIF}/submit-review`, ED, {}))).toEqual(
      BOOK_CLOSED
    ));
});

describe('the writes outside requireBookAccess check the book only (T9, spec §6.7)', () => {
  it("the section's assigned reviewer, holding no chapter row, submits review in chemistry", async () =>
    expect(verdict(await post(`/api/sections/${SECTION_CHEM}/submit-review`, ED, {}))).toEqual({
      status: 200,
      error: undefined,
    }));

  it('a plain editor holding no chapter row comments on a chemistry edit', async () => {
    const r = await post(`/api/segment-editor/edit/${editChem}/comment`, ED, { comment: 'x' });
    expect([r.status, r.body?.success]).toEqual([200, true]);
  });
});
