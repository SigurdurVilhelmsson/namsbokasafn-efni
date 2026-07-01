/**
 * OAuth callback — auth_token cookie attributes (regression guard).
 *
 * The session cookie set in the Microsoft OAuth callback MUST use SameSite=Lax,
 * not Strict. Strict is withheld on the cross-site-initiated redirect back from
 * Microsoft to '/', so requirePageAuth() bounces the just-logged-in user to
 * /login — a login loop that shows up first in "clean" browsers (Edge) while a
 * browser holding a prior session (Chrome) appears to work. Lax still blocks
 * cross-site POST/subresource cookie-sends (the CSRF control that matters) while
 * letting the top-level GET return navigation carry the cookie.
 *
 * This drives the real /login → /callback state handshake. It uses `createRequire`
 * (like viewsPageAuth.test.js) so the test and the route share the ONE real auth
 * service singleton; only the network-calling `authenticate()` is stubbed on that
 * shared instance. If this fails because someone set SameSite back to 'strict',
 * that IS the bug — do not "fix" the test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

// Config must be present BEFORE services/auth.js is first required — its CONFIG
// object is captured from env at module load, and isConfigured() reads it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MS_CLIENT_ID = process.env.MS_CLIENT_ID || 'test-client-id';
process.env.MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || 'test-client-secret';
process.env.MS_TENANT_ID = process.env.MS_TENANT_ID || 'common';

const require = createRequire(import.meta.url);

// Same singleton the router captures (both native require → shared module cache).
const authService = require('../services/auth');
const authRouter = require('../routes/auth');

/** Pull the final route handler for a path out of the router stack. */
function findHandler(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    cookies: {},
    redirectedTo: null,
    body: null,
    cookie(name, value, opts) {
      this.cookies[name] = { value, opts };
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectedTo = url;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
  };
}

describe('OAuth callback — auth_token cookie', () => {
  beforeAll(() => {
    // Stub only the network round-trip (code → Microsoft → user profile → JWT).
    // Mutating the shared exports object is read at call time by the route.
    authService.authenticate = async () => ({
      user: {
        id: 'u1',
        username: 'u@example.is',
        name: 'U',
        avatar: null,
        role: 'editor',
        books: [],
      },
      token: 'fake.jwt.token',
    });
  });

  it('sets the session cookie with SameSite=Lax so it survives the OAuth return redirect', async () => {
    // 1. Drive /login to mint a valid state token (kept in the router's private Map).
    const loginRes = mockRes();
    findHandler(authRouter, '/login')({ query: {} }, loginRes);
    expect(loginRes.statusCode).toBe(302);
    const state = new URL(loginRes.redirectedTo).searchParams.get('state');
    expect(state).toBeTruthy();

    // 2. Complete /callback with that state + a code (browser, non-JSON request).
    const cbRes = mockRes();
    await findHandler(authRouter, '/callback')(
      { query: { code: 'test-code', state }, headers: {} },
      cbRes
    );

    const cookie = cbRes.cookies.auth_token;
    expect(cookie, 'callback should set the auth_token cookie').toBeTruthy();
    expect(cookie.opts.sameSite).toBe('lax');
    expect(cookie.opts.httpOnly).toBe(true);

    // …and it redirects to the landing page, not returns JSON.
    expect(cbRes.statusCode).toBe(302);
    expect(cbRes.redirectedTo).toMatch(/loggedIn=1/);
  });
});
