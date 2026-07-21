/**
 * Item 21 PR-B — GET /api/terminology/added-terms/export route contract.
 * Handler + middleware pulled from the router stack, invoked with fake req/res
 * (terminologyReviewRoutes.test.js idiom). Fixture DB via createTestDb.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

process.env.SESSIONS_DB_PATH = path.join(os.tmpdir(), `added-terms-route-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const { createTestDb } = require('./helpers/terminologyTestDb');
const terminology = require('../services/terminologyService');

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
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(c) {
        this.statusCode = c;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      json(b) {
        resolve({ status: this.statusCode, headers: this.headers, body: b });
      },
      send(b) {
        resolve({ status: this.statusCode, headers: this.headers, body: b });
      },
    };
    Promise.resolve(handler(req, res));
  });
}

const HE_USER = { id: 'he1', name: 'Head Editor', username: 'head', role: 'head-editor' };
const ROUTE = '/added-terms/export';

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations(); // gives activityLog a real (temp) DB
  router = require('../routes/terminology');
});
beforeEach(() => {
  db = createTestDb();
  terminology._setTestDb(db);
});
afterAll(() => {
  terminology._setTestDb(null);
});

function seedRow() {
  const h = Number(
    db.prepare('INSERT INTO terminology_headwords (english) VALUES (?)').run('adsorb')
      .lastInsertRowid
  );
  db.prepare(
    `INSERT INTO terminology_translations (headword_id, icelandic, source, status, idordabanki_id)
     VALUES (?, 'aðsog', 'openstax-mt', 'approved', NULL)`
  ).run(h);
}

describe('GET /api/terminology/added-terms/export', () => {
  it('is registered before the parametric /:id route (no shadowing)', () => {
    const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
    expect(paths).toContain(ROUTE);
    expect(paths.indexOf(ROUTE)).toBeLessThan(paths.indexOf('/:id'));
  });

  it('requireRole gate 403s an editor', async () => {
    const layer = getLayer(ROUTE, 'get');
    expect(layer.route.stack.length).toBe(3); // requireAuth, requireRole, handler
    const gate = layer.route.stack[1].handle;
    const out = await invoke(gate, { user: { role: 'editor', id: 'e1' }, query: {} });
    expect(out.status).toBe(403);
  });

  it('defaults to json and returns provenance_note + terms for a head-editor', async () => {
    seedRow();
    const out = await invoke(getHandler(ROUTE, 'get'), { query: {}, user: HE_USER });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/json/);
    const doc = JSON.parse(out.body);
    expect(doc.provenance_note).toBeTruthy();
    expect(doc.terms.map((t) => t.icelandic)).toEqual(['aðsog']);
  });

  it('serves csv with the exact header and attachment filename', async () => {
    seedRow();
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'csv' }, user: HE_USER });
    expect(out.headers['Content-Type']).toMatch(/csv/);
    expect(out.headers['Content-Disposition']).toContain('arnastofnun-added-terms.csv');
    expect(out.body.split('\n')[0]).toBe(
      'english,pos,definition_en,icelandic,definition_is,alternatives,subject,notes,source,submission_type,existing_idordabanki_term,existing_idordabanki_id,proposed_by,approved_by,approved_at'
    );
  });

  it('400s an unknown format', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'xml' }, user: HE_USER });
    expect(out.status).toBe(400);
  });

  it('400s an unknown subject', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), {
      query: { subject: 'astrology' },
      user: HE_USER,
    });
    expect(out.status).toBe(400);
  });

  it('returns a valid header-only CSV when there are no added terms', async () => {
    const out = await invoke(getHandler(ROUTE, 'get'), { query: { format: 'csv' }, user: HE_USER });
    expect(out.status).toBe(200);
    expect(out.body.split('\n')[0]).toContain('english,pos,');
    expect(out.body.split('\n').filter((l) => l.length).length).toBe(1); // header only
  });

  it('500s and logs when the underlying query fails (real DB-closed throw, not a mock)', async () => {
    db.close(); // getDb() still returns this (closed) instance via _setTestDb
    const out = await invoke(getHandler(ROUTE, 'get'), { query: {}, user: HE_USER });
    expect(out.status).toBe(500);
    expect(out.body).toMatchObject({ error: 'Failed to export added terms' });
  });
});
