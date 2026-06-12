/**
 * View-route page-auth gate tests (Unit 5.1 / audit F12).
 *
 * `requirePageAuth([minRole])` is the defense-in-depth gate on the HTML view
 * routes: anonymous/invalid sessions are redirected to /login (preserving the
 * destination), and under-privileged-but-authenticated users are bounced to '/'.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// auth.js (pulled in transitively) requires JWT_SECRET at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const require = createRequire(import.meta.url);
const { requirePageAuth } = require('../routes/views');
const { createToken, ROLES } = require('../services/auth');

function mockRes() {
  return {
    statusCode: 200,
    redirectedTo: null,
    redirect(code, url) {
      this.statusCode = code;
      this.redirectedTo = url;
      return this;
    },
  };
}

function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

function reqWith(token, originalUrl = '/editor') {
  return { cookies: token ? { auth_token: token } : {}, originalUrl };
}

const editorToken = createToken({ id: 4, username: 'ed', role: ROLES.EDITOR, books: [] });
const headToken = createToken({ id: 2, username: 'he', role: ROLES.HEAD_EDITOR, books: ['x'] });
const adminToken = createToken({ id: 1, username: 'ad', role: ROLES.ADMIN, books: [] });

describe('requirePageAuth()', () => {
  it('redirects anonymous browsers to /login with the destination preserved', () => {
    const { res, nextCalled } = run(requirePageAuth(), reqWith(null, '/editor?module=m1'));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('/login?redirect=' + encodeURIComponent('/editor?module=m1'));
  });

  it('redirects an invalid/expired token to /login', () => {
    const { res, nextCalled } = run(requirePageAuth(), reqWith('not-a-real-token'));
    expect(nextCalled).toBe(false);
    expect(res.redirectedTo).toMatch(/^\/login\?redirect=/);
  });

  it('lets any authenticated user through when no role is required', () => {
    const { nextCalled } = run(requirePageAuth(), reqWith(editorToken));
    expect(nextCalled).toBe(true);
  });
});

describe('requirePageAuth(minRole)', () => {
  it('bounces an under-privileged authenticated user to /', () => {
    const { res, nextCalled } = run(requirePageAuth(ROLES.ADMIN), reqWith(editorToken, '/admin'));
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('/');
  });

  it('lets a head-editor into a HEAD_EDITOR-gated page', () => {
    const { nextCalled } = run(
      requirePageAuth(ROLES.HEAD_EDITOR),
      reqWith(headToken, '/assignments')
    );
    expect(nextCalled).toBe(true);
  });

  it('lets an admin into an ADMIN-gated page', () => {
    const { nextCalled } = run(requirePageAuth(ROLES.ADMIN), reqWith(adminToken, '/admin'));
    expect(nextCalled).toBe(true);
  });
});
