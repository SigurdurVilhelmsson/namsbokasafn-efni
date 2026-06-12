/**
 * Authorization middleware tests — book-scoped head-editor checks.
 *
 * Covers the Unit-0 hotfix that replaced bare `requireRole(HEAD_EDITOR)`
 * (role-level only) with per-book ownership on the review/apply/publish
 * endpoints:
 *   - requireHeadEditor(bookParam)   — book taken from a route param
 *   - requireHeadEditorFor(resolve)  — book resolved from an :editId / :reviewId
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// auth.js (pulled in transitively) requires JWT_SECRET at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const { requireHeadEditor, requireHeadEditorFor, ROLES } = require('../middleware/requireRole');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

/** Run a middleware synchronously and report whether next() was called. */
function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

const admin = { id: 1, username: 'admin', role: ROLES.ADMIN, books: [] };
const headX = { id: 2, username: 'headX', role: ROLES.HEAD_EDITOR, books: ['book-x'] };
const headY = { id: 3, username: 'headY', role: ROLES.HEAD_EDITOR, books: ['book-y'] };
const editorA = { id: 4, username: 'editorA', role: ROLES.EDITOR, books: [] };

describe('requireHeadEditor(bookParam)', () => {
  it('passes a head-editor who owns the book (default :book param)', () => {
    const { nextCalled, res } = run(requireHeadEditor(), {
      user: headX,
      params: { book: 'book-x' },
    });
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('reads the book from a custom param name (:bookSlug)', () => {
    const { nextCalled } = run(requireHeadEditor('bookSlug'), {
      user: headX,
      params: { bookSlug: 'book-x' },
    });
    expect(nextCalled).toBe(true);
  });

  it('rejects a head-editor of a different book with 403', () => {
    const { nextCalled, res } = run(requireHeadEditor('bookSlug'), {
      user: headY,
      params: { bookSlug: 'book-x' },
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('lets admin through for any book', () => {
    const { nextCalled } = run(requireHeadEditor(), {
      user: admin,
      params: { book: 'book-x' },
    });
    expect(nextCalled).toBe(true);
  });

  it('returns 401 when unauthenticated', () => {
    const { nextCalled, res } = run(requireHeadEditor(), { params: { book: 'book-x' } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('requireHeadEditorFor(resolveBook)', () => {
  const resolveToBookX = () => 'book-x';

  it('passes a head-editor who owns the resolved book', () => {
    const { nextCalled } = run(requireHeadEditorFor(resolveToBookX), { user: headX, params: {} });
    expect(nextCalled).toBe(true);
  });

  it('rejects a head-editor of a different book with 403', () => {
    const { nextCalled, res } = run(requireHeadEditorFor(resolveToBookX), {
      user: headY,
      params: {},
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('rejects an editor with 403 before resolving the book', () => {
    let resolverCalled = false;
    const resolver = () => {
      resolverCalled = true;
      return 'book-x';
    };
    const { nextCalled, res } = run(requireHeadEditorFor(resolver), { user: editorA, params: {} });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(resolverCalled).toBe(false);
  });

  it('lets admin through without consulting the resolver', () => {
    let resolverCalled = false;
    const resolver = () => {
      resolverCalled = true;
      return 'book-x';
    };
    const { nextCalled } = run(requireHeadEditorFor(resolver), { user: admin, params: {} });
    expect(nextCalled).toBe(true);
    expect(resolverCalled).toBe(false);
  });

  it('returns 404 when the resolver throws (target not found)', () => {
    const resolver = () => {
      throw new Error('Edit not found');
    };
    const { nextCalled, res } = run(requireHeadEditorFor(resolver), { user: headX, params: {} });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Edit not found');
  });

  it('returns 404 when the resolver yields no book', () => {
    const { nextCalled, res } = run(
      requireHeadEditorFor(() => null),
      { user: headX, params: {} }
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', () => {
    const { nextCalled, res } = run(requireHeadEditorFor(resolveToBookX), { params: {} });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
