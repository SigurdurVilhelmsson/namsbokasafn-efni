/**
 * GET /api/books/list — book ordering by session scope.
 *
 * bookSelector.js falls back to books[0] when nothing is stored, so a purely
 * alphabetical list opened every page on Eðlisfræði regardless of who logged
 * in. For a head-editor scoped to one book that was not merely wrong but
 * broken: /assignments loaded a book they cannot read and 403'd on load
 * (2026-08-06 UX audit).
 *
 * The endpoint stays PUBLIC on purpose — the anonymous feedback form populates
 * a book dropdown from it — so the auth read is optional and must degrade to
 * the plain alphabetical list. That property is the important half of this
 * guard: do not "fix" a failure here by adding requireAuth.
 *
 * Uses Express router introspection + a fake req/res, so no live server or DB.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);

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

describe('GET /books/list — scoped ordering', () => {
  let handler;
  let signToken;

  beforeAll(() => {
    const router = require('../routes/books');
    handler = router.stack
      .find((l) => l.route && l.route.path === '/list' && l.route.methods.get)
      .route.stack.at(-1).handle;

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET, JWT_ISSUER } = (() => {
      // Mirror how services/auth signs, so verifyToken accepts what we mint.
      return { JWT_SECRET: process.env.JWT_SECRET, JWT_ISSUER: 'namsbokasafn-pipeline' };
    })();
    signToken = (books) =>
      jwt.sign({ sub: 1, username: 'u', name: 'U', role: 'head-editor', books }, JWT_SECRET, {
        issuer: JWT_ISSUER,
        expiresIn: '1h',
      });
  });

  it('returns the plain alphabetical list for an anonymous request', async () => {
    const r = await invoke(handler, { cookies: {} });
    const labels = r.body.books.map((b) => b.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'is')));
  });

  it('does not throw when there are no cookies at all', async () => {
    const r = await invoke(handler, {});
    expect(Array.isArray(r.body.books)).toBe(true);
    expect(r.body.books.length).toBeGreaterThan(0);
  });

  it('falls back to alphabetical when the token is unreadable', async () => {
    const r = await invoke(handler, { cookies: { auth_token: 'not-a-jwt' } });
    const labels = r.body.books.map((b) => b.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'is')));
  });

  it("puts the session's own book first so books[0] is one the user can open", async () => {
    const anon = await invoke(handler, { cookies: {} });
    const scopedSlug = anon.body.books[anon.body.books.length - 1].slug; // deliberately not first

    const r = await invoke(handler, { cookies: { auth_token: signToken([scopedSlug]) } });
    expect(r.body.books[0].slug).toBe(scopedSlug);
    expect(r.body.books).toHaveLength(anon.body.books.length); // nothing dropped
  });

  it('keeps the remaining books in alphabetical order after the scoped ones', async () => {
    const anon = await invoke(handler, { cookies: {} });
    const scopedSlug = anon.body.books[2].slug;

    const r = await invoke(handler, { cookies: { auth_token: signToken([scopedSlug]) } });
    const rest = r.body.books.slice(1).map((b) => b.label);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'is')));
  });

  it('ignores a token whose books are not in the catalogue', async () => {
    const r = await invoke(handler, { cookies: { auth_token: signToken(['__nope__']) } });
    const labels = r.body.books.map((b) => b.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'is')));
  });
});
