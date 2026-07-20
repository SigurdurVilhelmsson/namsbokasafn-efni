/**
 * Item 21 PR-A — GET /api/tm/export route contract.
 * Harness: handler + middleware extracted from router.stack, invoked with
 * fake req/res (terminologyReviewRoutes.test.js idiom). Fixture content via
 * _setTestBooksDir; book slug is a real VALID_BOOKS entry so the guard passes,
 * but all files live in a temp dir — never live books/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

process.env.SESSIONS_DB_PATH = path.join(tmpdir(), `tm-route-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const tmExport = require('../../tools/lib/tm-export.cjs');
const router = require('../routes/tm');

const BOOK = 'efnafraedi-2e'; // a real VALID_BOOKS slug; content is fixture-only
let work;

function layer(method, routePath) {
  return router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
}
function handler(method, routePath) {
  const l = layer(method, routePath);
  return l.route.stack[l.route.stack.length - 1].handle;
}
function invoke(h, req) {
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
      json(body) {
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
      send(body) {
        resolve({ status: this.statusCode, headers: this.headers, body });
      },
    };
    Promise.resolve(h(req, res));
  });
}

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'tm-route-books-'));
  const en = path.join(work, 'books', BOOK, '02-for-mt', 'ch03');
  const is = path.join(work, 'books', BOOK, '03-faithful-translation', 'ch03');
  mkdirSync(en, { recursive: true });
  mkdirSync(is, { recursive: true });
  writeFileSync(
    path.join(en, 'm1-segments.en.md'),
    '<!-- SEG:m1:para:p1 -->\nWater is H[[sub:2]]O.\n'
  );
  writeFileSync(
    path.join(is, 'm1-segments.is.md'),
    '<!-- SEG:m1:para:p1 -->\nVatn er H[[sub:2]]O.\n'
  );
  tmExport._setTestBooksDir(path.join(work, 'books'));
});

afterAll(() => {
  tmExport._setTestBooksDir(path.join(process.cwd(), 'books'));
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/tm/export', () => {
  it('wires requireAuth as the first middleware (gate fires)', async () => {
    const l = layer('get', '/export');
    expect(l.route.stack.length).toBeGreaterThanOrEqual(2); // requireAuth + handler
    const gate = l.route.stack[0].handle;
    const out = await invoke(gate, { headers: {}, cookies: {}, query: {} });
    expect(out.status).toBe(401);
  });

  it('defaults to tmx and sets attachment headers', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/xml/);
    expect(out.headers['Content-Disposition']).toContain(`${BOOK}-tm.tmx`);
    expect(out.body).toContain('<tmx version="1.4">');
    expect(out.body).toContain('<prop type="licence">CC BY 4.0</prop>'); // efnafraedi-2e licence stamped
  });

  it('serves csv when asked', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, format: 'csv' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Type']).toMatch(/csv/);
    expect(out.body.split('\n')[0]).toBe('book,chapter,module,segment_id,en,is,licence');
  });

  it('400s an unknown book', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: 'not-a-book' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(400);
  });

  it('400s an unknown format', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, format: 'xml' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(400);
  });

  it('400s a bad chapter', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: '999' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(400);
  });

  it('404s a book with no faithful content', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: 'liffraedi-2e' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(404);
  });
});
