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
