/**
 * Item 19 — review-queue route contract tests.
 * Harness idiom: locApproveConflict.test.js (handler extracted from the
 * router stack, invoked with fake req/res).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

// MUST precede every server require — activityLog opens the real sessions.db
// otherwise (item-12 pollution lesson).
process.env.SESSIONS_DB_PATH = path.join(os.tmpdir(), `term-review-routes-${process.pid}.db`);
// routes/terminology.js -> middleware/requireAuth -> services/auth.js throws
// at require-time if unset (locApproveConflict.test.js harness convention).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminologyService = require('../services/terminologyService');

let db;
let router;

function getLayer(routePath, method) {
  return router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
}

function getHandler(routePath, method) {
  const layer = getLayer(routePath, method);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invoke(handler, req) {
  let resolveResult;
  const done = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const res = {
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      resolveResult({ status: this.statusCode, body });
    },
  };
  return Promise.resolve(handler(req, res)).then(() => done);
}

const HE_USER = { id: 'he1', name: 'Head Editor', username: 'head' };

function insertTerm(english, icelandic, status = 'proposed', subjects = []) {
  const hw = db.prepare('INSERT INTO terminology_headwords (english) VALUES (?)').run(english);
  const tr = db
    .prepare(
      `INSERT INTO terminology_translations (headword_id, icelandic, source, status)
       VALUES (?, ?, 'manual', ?)`
    )
    .run(Number(hw.lastInsertRowid), icelandic, status);
  const trId = Number(tr.lastInsertRowid);
  for (const s of subjects) {
    db.prepare(
      'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    ).run(trId, s);
  }
  return trId;
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations(); // gives activityLog a real (temp) DB to write into
  db = createTestDb();
  terminologyService._setTestDb(db);
  router = require('../routes/terminology');
});

afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM terminology_discussions');
  db.exec('DELETE FROM terminology_translation_subjects');
  db.exec('DELETE FROM terminology_translations');
  db.exec('DELETE FROM terminology_headwords');
});

describe('route registration (item-L ordering trap)', () => {
  it('registers queue + batch routes above the parametric routes', () => {
    const order = (p, m) =>
      router.stack.findIndex((l) => l.route && l.route.path === p && l.route.methods[m]);
    expect(order('/review-queue', 'get')).toBeGreaterThan(-1);
    expect(order('/review-queue/counts', 'get')).toBeGreaterThan(-1);
    expect(order('/review-queue/counts', 'get')).toBeLessThan(order('/:id', 'get'));
    expect(order('/review-queue', 'get')).toBeLessThan(order('/:id', 'get'));
    expect(order('/translations/batch-approve', 'post')).toBeGreaterThan(-1);
    expect(getLayer('/translations/:id/reject', 'post')).toBeDefined();
  });

  it('the legacy headword-granular getReviewQueue is gone from the service', () => {
    expect(terminologyService.getReviewQueue).toBeUndefined();
  });
});

describe('GET /review-queue (new contract)', () => {
  it('returns {items, total, limit, offset}', async () => {
    insertTerm('molecule', 'sameind', 'proposed');
    insertTerm('atom', 'frumeind', 'approved');
    const out = await invoke(getHandler('/review-queue', 'get'), { query: {} });
    expect(out.status).toBe(200);
    expect(out.body.total).toBe(1);
    expect(out.body.items[0].english).toBe('molecule');
    expect(out.body.limit).toBe(50);
    expect(out.body.offset).toBe(0);
  });

  it('parses comma-separated status and 400s on an unknown one', async () => {
    insertTerm('a', 'a1', 'rejected');
    const ok = await invoke(getHandler('/review-queue', 'get'), {
      query: { status: 'rejected' },
    });
    expect(ok.body.total).toBe(1);
    const bad = await invoke(getHandler('/review-queue', 'get'), {
      query: { status: 'bogus' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('GET /review-queue/counts', () => {
  it('returns per-status counts with resolved subject', async () => {
    insertTerm('a', 'a1', 'proposed', ['chemistry']);
    insertTerm('b', 'b1', 'disputed');
    const out = await invoke(getHandler('/review-queue/counts', 'get'), {
      query: { book: 'efnafraedi-2e' },
    });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ proposed: 1, disputed: 0, needsReview: 0, subject: 'chemistry' });
  });
});

describe('POST /translations/:id/approve with subjects', () => {
  it('tags and approves; 400 on invalid slug', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const handler = getHandler('/translations/:id/approve', 'post');
    const ok = await invoke(handler, {
      params: { id: String(trId) },
      body: { subjects: ['chemistry'] },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.term.translations[0].status).toBe('approved');
    expect(ok.body.term.translations[0].subjects).toEqual(['chemistry']);

    const trId2 = insertTerm('b', 'b1', 'proposed');
    const bad = await invoke(handler, {
      params: { id: String(trId2) },
      body: { subjects: ['klingon'] },
      user: HE_USER,
    });
    expect(bad.status).toBe(400);
  });

  it('legacy no-body approve still works', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const out = await invoke(getHandler('/translations/:id/approve', 'post'), {
      params: { id: String(trId) },
      body: {},
      user: HE_USER,
    });
    expect(out.status).toBe(200);
    expect(out.body.term.translations[0].status).toBe('approved');
  });
});

describe('POST /translations/batch-approve', () => {
  it('approves + tags untagged; all-or-nothing 404 names missing ids', async () => {
    const a = insertTerm('a', 'a1', 'proposed');
    const b = insertTerm('b', 'b1', 'proposed', ['biology']);
    const handler = getHandler('/translations/batch-approve', 'post');
    const ok = await invoke(handler, {
      body: { ids: [a, b], subjects: ['chemistry'] },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ success: true, approved: 2, tagged: 1 });

    const c = insertTerm('c', 'c1', 'proposed');
    const bad = await invoke(handler, { body: { ids: [c, 9999] }, user: HE_USER });
    expect(bad.status).toBe(404);
    expect(bad.body.message).toContain('9999');
    const row = db.prepare('SELECT status FROM terminology_translations WHERE id = ?').get(c);
    expect(row.status).toBe('proposed');
  });

  it('400s on empty/oversized/garbage ids', async () => {
    const handler = getHandler('/translations/batch-approve', 'post');
    expect((await invoke(handler, { body: { ids: [] }, user: HE_USER })).status).toBe(400);
    expect((await invoke(handler, { body: {}, user: HE_USER })).status).toBe(400);
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    expect((await invoke(handler, { body: { ids: tooMany }, user: HE_USER })).status).toBe(400);
  });
});

describe('POST /translations/:id/reject', () => {
  it('rejects with reason; 404 unknown; 400 oversize reason', async () => {
    const trId = insertTerm('a', 'a1', 'proposed');
    const handler = getHandler('/translations/:id/reject', 'post');
    const ok = await invoke(handler, {
      params: { id: String(trId) },
      body: { reason: 'rangt' },
      user: HE_USER,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.term.translations[0].status).toBe('rejected');

    const missing = await invoke(handler, {
      params: { id: '9999' },
      body: {},
      user: HE_USER,
    });
    expect(missing.status).toBe(404);

    const trId2 = insertTerm('b', 'b1', 'proposed');
    const oversize = await invoke(handler, {
      params: { id: String(trId2) },
      body: { reason: 'a'.repeat(501) },
      user: HE_USER,
    });
    expect(oversize.status).toBe(400);
  });
});
