/**
 * Books Router — Retired Routes
 *
 * Regression guard: asserts that Matecat-era routes that were deliberately
 * removed do not re-appear in the books router's registered stack.
 *
 * Uses Express router introspection (layer.route.path) instead of supertest
 * so the test runs without a live server or DB connection.
 */

import { writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('books router — retired routes', () => {
  it('POST /:bookId/chapters/:chapter/import-mt is retired (not registered)', () => {
    const router = require('../routes/books');

    // Collect every explicitly-registered route path from the router stack.
    const registeredPaths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    expect(registeredPaths).not.toContain('/:bookId/chapters/:chapter/import-mt');
  });
});

function invoke(h, req) {
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
  return Promise.resolve(h(req, res)).then(() => done);
}

describe('faithful-count appendices acceptance', () => {
  const router = require('../routes/books');
  const faithfulCountHandler = router.stack
    .find(
      (l) =>
        l.route && l.route.path === '/:book/chapters/:chapter/faithful-count' && l.route.methods.get
    )
    .route.stack.at(-1).handle;

  it('accepts "appendices" (not 400)', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: 'appendices' },
    });
    expect(r.status).not.toBe(400); // 200 with a count, or 404 if dir absent — both are past the validator
  });

  it('still rejects 0', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: '0' },
    });
    expect(r.status).toBe(400);
  });

  it('still rejects garbage', async () => {
    const r = await invoke(faithfulCountHandler, {
      params: { book: 'efnafraedi-2e', chapter: 'xyz' },
    });
    expect(r.status).toBe(400);
  });
});

/**
 * GET /:bookId/chapters/:chapter (disk-sourced via loadBookData, C1b task 3b).
 *
 * This route has no browser caller (the books.html UI hits the DB-sourced
 * admin.js route instead — see adminAppendixChapterDetail.test.js), but it
 * must still resolve 'appendices' instead of 404ing via the pre-fix
 * `parseInt('appendices', 10)` -> NaN. A distinctively-named fixture file is
 * written to server/data/ (and removed in afterAll) so this test is
 * independent of which real books happen to carry an `appendices` array —
 * ⚠️ a real-book-data.json inconsistency was found in the process: only
 * chemistry-2e.json/biology-2e.json carry `appendices`; the rest don't (see
 * task-3-report.md finding — not fixed here, out of scope per the plan).
 */
describe('GET /:bookId/chapters/:chapter — appendices (disk-sourced)', () => {
  const FIXTURE_SLUG = 'c1b-books-chapter-route-fixture';
  const fixturePath = path.join(__dirname, '..', 'data', `${FIXTURE_SLUG}.json`);

  beforeAll(() => {
    writeFileSync(
      fixturePath,
      JSON.stringify({
        book: FIXTURE_SLUG,
        slug: FIXTURE_SLUG,
        title: 'C1b Fixture Book',
        titleIs: 'C1b Prófbók',
        chapters: [{ chapter: 1, title: 'Chapter One', modules: [{ id: 'm10001' }] }],
        appendices: [
          { id: 'm90001', title: 'Periodic Table' },
          { id: 'm90002', title: 'Units' },
        ],
      }),
      'utf8'
    );
  });

  afterAll(() => {
    if (existsSync(fixturePath)) unlinkSync(fixturePath);
  });

  const router = require('../routes/books');
  const chapterDetailHandler = router.stack
    .find((l) => l.route && l.route.path === '/:bookId/chapters/:chapter' && l.route.methods.get)
    .route.stack.at(-1).handle;

  it('resolves "appendices" (not 404) with modules from book.appendices', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: 'appendices' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(-1);
    expect(r.body.modules).toEqual([
      { id: 'm90001', title: 'Periodic Table' },
      { id: 'm90002', title: 'Units' },
    ]);
  });

  it('still 404s on chapter "0"', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: '0' },
    });
    expect(r.status).toBe(404);
  });

  it('still 404s on garbage', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: 'xyz' },
    });
    expect(r.status).toBe(404);
  });

  it('leaves a numeric chapter unchanged', async () => {
    const r = await invoke(chapterDetailHandler, {
      params: { bookId: FIXTURE_SLUG, chapter: '1' },
    });
    expect(r.status).toBe(200);
    expect(r.body.chapter).toBe(1);
    expect(r.body.title).toBe('Chapter One');
  });
});
