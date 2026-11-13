/**
 * A session follows the account, not the token.
 *
 * A token is minted at sign-in and lives for JWT_EXPIRY (24 hours by default). Its role and book
 * list are a copy of the account row at that moment. Until this was pinned, a request was decided
 * from that copy, so deactivating an account, lowering a role or taking a book away changed the
 * database and nothing else until the token ran out.
 *
 * Every request is now decided from the row as it is (services/auth.js currentAccess). The three
 * places that read a token are covered: requireAuth, optionalAuth and the page gate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: all three are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'session-follows-account-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';
process.env.ADMIN_USERS = 'stjori@skoli.example';

let db;
let auth;
let userService;
let requireAuth;
let optionalAuth;
let requirePageAuth;

beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  auth = require('../services/auth');
  userService = require('../services/userService');
  ({ requireAuth, optionalAuth } = require('../middleware/requireAuth'));
  ({ requirePageAuth } = require('../routes/views'));
});

afterAll(() => {
  db.close();
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM user_book_access');
  db.exec('DELETE FROM users');
});

/** An account row, as the admin page and a first sign-in leave it. */
function account(n, role) {
  return userService.createUser({
    providerId: `ms-oid-${n}`,
    providerUsername: `kennari${n}@skoli.example`,
    email: `kennari${n}@skoli.example`,
    role,
  });
}

/** The token that account got when it signed in with `role` and `books`. */
function tokenFor(n, role, books = [], username = `kennari${n}@skoli.example`) {
  return auth.createToken({ id: `ms-oid-${n}`, username, name: `Kennari ${n}`, role, books });
}

function run(middleware, token) {
  const req = { cookies: token ? { auth_token: token } : {}, headers: {}, originalUrl: '/admin' };
  const res = {
    statusCode: 200,
    body: undefined,
    redirectedTo: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.redirectedTo = url;
      return this;
    },
  };
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

describe('requireAuth decides from the account row', () => {
  it('control: an unchanged account gets what its token says', () => {
    account(1, 'editor');
    const { req, nextCalled } = run(requireAuth, tokenFor(1, 'editor'));
    expect(nextCalled).toBe(true);
    expect(req.user).toMatchObject({ id: 'ms-oid-1', role: 'editor', books: [] });
  });

  it('a deactivated account is refused although its token is still valid', () => {
    const row = account(2, 'editor');
    const token = tokenFor(2, 'editor');
    expect(run(requireAuth, token).nextCalled).toBe(true); // before

    userService.deactivateUser(row.id);

    const { res, nextCalled, req } = run(requireAuth, token);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Account deactivated');
    expect(req.user).toBeUndefined();
  });

  it('a reactivated account is let in again', () => {
    const row = account(3, 'editor');
    userService.deactivateUser(row.id);
    userService.reactivateUser(row.id);
    expect(run(requireAuth, tokenFor(3, 'editor')).nextCalled).toBe(true);
  });

  it('a lowered role holds from the next request', () => {
    const row = account(4, 'admin');
    const token = tokenFor(4, 'admin');
    userService.updateUser(row.id, { role: 'editor' });
    expect(run(requireAuth, token).req.user.role).toBe('editor');
  });

  it('a raised role holds from the next request too', () => {
    const row = account(5, 'editor');
    const token = tokenFor(5, 'editor');
    userService.updateUser(row.id, { role: 'head-editor' });
    userService.assignBookAccess(row.id, 'efnafraedi-2e', 'head-editor', 'prufa');
    expect(run(requireAuth, token).req.user).toMatchObject({
      role: 'head-editor',
      books: ['efnafraedi-2e'],
    });
  });

  it('a head editor loses a book the moment it is taken away', () => {
    const row = account(6, 'head-editor');
    userService.assignBookAccess(row.id, 'efnafraedi-2e', 'head-editor', 'prufa');
    userService.assignBookAccess(row.id, 'liffraedi-2e', 'head-editor', 'prufa');
    const token = tokenFor(6, 'head-editor', ['efnafraedi-2e', 'liffraedi-2e']);
    expect(run(requireAuth, token).req.user.books.sort()).toEqual([
      'efnafraedi-2e',
      'liffraedi-2e',
    ]);

    userService.removeBookAccess(row.id, 'liffraedi-2e');

    expect(run(requireAuth, token).req.user.books).toEqual(['efnafraedi-2e']);
  });

  it("a book held as an editor is not a head editor's book", () => {
    const row = account(7, 'head-editor');
    userService.assignBookAccess(row.id, 'efnafraedi-2e', 'editor', 'prufa');
    expect(run(requireAuth, tokenFor(7, 'head-editor', ['efnafraedi-2e'])).req.user.books).toEqual(
      []
    );
  });
});

describe('a token with no account row keeps its claims', () => {
  it('a visitor stays a viewer, and no row is created for it', () => {
    const { req, nextCalled } = run(requireAuth, tokenFor(8, 'viewer'));
    expect(nextCalled).toBe(true);
    expect(req.user.role).toBe('viewer');
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(0);
  });

  it('a role above viewer with no row is still honoured (a deleted row is not caught)', () => {
    // No screen deletes an account row, and the E2E helper's tokens have none. Closing this needs
    // those fixtures to have rows first; it is recorded as open, not as covered.
    expect(run(requireAuth, tokenFor(9, 'editor')).req.user.role).toBe('editor');
  });
});

describe('an address on ADMIN_USERS', () => {
  it('stays an admin whatever its row says, as at sign-in', () => {
    const row = userService.createUser({
      providerId: 'ms-oid-10',
      providerUsername: 'stjori@skoli.example',
      email: 'stjori@skoli.example',
      role: 'editor',
    });
    userService.deactivateUser(row.id);
    const token = tokenFor(10, 'admin', [], 'Stjori@Skoli.example');
    const { req, nextCalled } = run(requireAuth, token);
    expect(nextCalled).toBe(true);
    expect(req.user.role).toBe('admin');
  });
});

describe('the other two readers of a token', () => {
  it('optionalAuth treats a deactivated account as signed out', () => {
    const row = account(11, 'editor');
    const token = tokenFor(11, 'editor');
    expect(run(optionalAuth, token).req.user.role).toBe('editor'); // before
    userService.deactivateUser(row.id);
    const { req, nextCalled } = run(optionalAuth, token);
    expect(nextCalled).toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('optionalAuth reports the lowered role', () => {
    const row = account(12, 'admin');
    userService.updateUser(row.id, { role: 'viewer' });
    expect(run(optionalAuth, tokenFor(12, 'admin')).req.user.role).toBe('viewer');
  });

  it('the page gate sends a deactivated account to sign in', () => {
    const row = account(13, 'admin');
    const token = tokenFor(13, 'admin');
    expect(run(requirePageAuth('admin'), token).nextCalled).toBe(true); // before
    userService.deactivateUser(row.id);
    const { res, nextCalled } = run(requirePageAuth('admin'), token);
    expect(nextCalled).toBe(false);
    expect(res.redirectedTo).toBe('/login?redirect=%2Fadmin');
  });

  it('the page gate bounces an admin page for an account that is no longer an admin', () => {
    const row = account(14, 'admin');
    const token = tokenFor(14, 'admin');
    userService.updateUser(row.id, { role: 'editor' });
    const { res, nextCalled } = run(requirePageAuth('admin'), token);
    expect(nextCalled).toBe(false);
    expect(res.redirectedTo).toBe('/');
  });
});
