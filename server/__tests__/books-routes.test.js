/**
 * Books Router — Retired Routes
 *
 * Regression guard: asserts that Matecat-era routes that were deliberately
 * removed do not re-appear in the books router's registered stack.
 *
 * Uses Express router introspection (layer.route.path) instead of supertest
 * so the test runs without a live server or DB connection.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// auth.js throws at load time if JWT_SECRET is unset.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);

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
