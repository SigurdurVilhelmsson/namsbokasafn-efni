/**
 * C1c Task 3 — GET /api/tm/export appendix support.
 *
 * Harness mirrors tmRoute.test.js (handler + middleware extracted from
 * router.stack, invoked with fake req/res). Own temp books dir + own
 * beforeAll/afterAll so this file doesn't contaminate tmRoute.test.js's
 * fixture or vice versa.
 *
 * The load-bearing case is the POSITIVE-content fixture: chapterLabel's
 * contract carries the canonical chapter as the NUMBER -1, but
 * tools/lib/tm-export.cjs's listFaithfulChapterDirs only matches the on-disk
 * dir when chapterFilter === the STRING 'appendices' (a number -1 computes
 * `want = 'ch-1'`, matching nothing). A validator fix alone (accepting the
 * query param) would still 404 on real appendix content unless the route
 * also converts -1 -> 'appendices' at the generateTm() call site. The
 * 404-on-EMPTY case alone can't catch that regression — it 404s either way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

process.env.SESSIONS_DB_PATH = path.join(tmpdir(), `tm-export-appendices-${process.pid}.db`);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const require = createRequire(import.meta.url);
const tmExport = require('../../tools/lib/tm-export.cjs');
const router = require('../routes/tm');

const BOOK = 'efnafraedi-2e'; // a real VALID_BOOKS slug with a licence row; content is fixture-only
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
  work = mkdtempSync(path.join(tmpdir(), 'tm-export-appendices-'));

  // Appendix fixture: 02-for-mt/appendices + 03-faithful-translation/appendices.
  const enApx = path.join(work, 'books', BOOK, '02-for-mt', 'appendices');
  const isApx = path.join(work, 'books', BOOK, '03-faithful-translation', 'appendices');
  mkdirSync(enApx, { recursive: true });
  mkdirSync(isApx, { recursive: true });
  writeFileSync(
    path.join(enApx, 'm9-segments.en.md'),
    '<!-- SEG:m9:para:p1 -->\nThe periodic table lists elements.\n'
  );
  writeFileSync(
    path.join(isApx, 'm9-segments.is.md'),
    '<!-- SEG:m9:para:p1 -->\nLotukerfið telur upp frumefni.\n'
  );

  // Normal-chapter fixture for the "unchanged" sanity case.
  const enCh = path.join(work, 'books', BOOK, '02-for-mt', 'ch03');
  const isCh = path.join(work, 'books', BOOK, '03-faithful-translation', 'ch03');
  mkdirSync(enCh, { recursive: true });
  mkdirSync(isCh, { recursive: true });
  writeFileSync(
    path.join(enCh, 'm1-segments.en.md'),
    '<!-- SEG:m1:para:p1 -->\nWater is H[[sub:2]]O.\n'
  );
  writeFileSync(
    path.join(isCh, 'm1-segments.is.md'),
    '<!-- SEG:m1:para:p1 -->\nVatn er H[[sub:2]]O.\n'
  );

  tmExport._setTestBooksDir(path.join(work, 'books'));
});

afterAll(() => {
  tmExport._setTestBooksDir(path.join(process.cwd(), 'books'));
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/tm/export — appendices support (C1c A3)', () => {
  it('accepts chapter=appendices and serves real appendix TM content', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: 'appendices', format: 'tmx' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(200);
    expect(out.body).toContain('Lotukerfið telur upp frumefni.');
    // Filename must read "appendices", never "-1" or "K-1".
    expect(out.headers['Content-Disposition']).toContain(`${BOOK}-appendices-tm.tmx`);
    expect(out.headers['Content-Disposition']).not.toContain('K-1');
    expect(out.headers['Content-Disposition']).not.toMatch(/-1-tm/);
  });

  it('accepts chapter=appendices but 404s (not 400) when there is no appendix content', async () => {
    const EMPTY_BOOK = 'liffraedi-2e'; // real VALID_BOOKS slug, no fixture content set up for it here
    const out = await invoke(handler('get', '/export'), {
      query: { book: EMPTY_BOOK, chapter: 'appendices', format: 'tmx' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(404);
    expect(out.body).toMatchObject({ error: 'No translation memory' });
  });

  it('still 400s a numeric chapter above MAX_CHAPTERS', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: '999' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ error: 'Invalid chapter' });
  });

  it('still 400s junk / 0 chapters', async () => {
    const junk = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: 'not-a-chapter' },
      user: { id: 'u1' },
    });
    expect(junk.status).toBe(400);

    const zero = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: '0' },
      user: { id: 'u1' },
    });
    expect(zero.status).toBe(400);
  });

  it('leaves a normal numeric chapter unchanged (accepted, -K<N> filename)', async () => {
    const out = await invoke(handler('get', '/export'), {
      query: { book: BOOK, chapter: '3', format: 'tmx' },
      user: { id: 'u1' },
    });
    expect(out.status).toBe(200);
    expect(out.headers['Content-Disposition']).toContain(`${BOOK}-K3-tm.tmx`);
  });
});
