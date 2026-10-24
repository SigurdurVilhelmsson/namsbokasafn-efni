/**
 * SD2 (register, 2026-10-24): a sign-in with no account row is a VISIT, not an account.
 *
 * [USER] is content for anyone in the shared school tenant to look around, students
 * included, provided they cannot change anything (route guards already ensure that).
 * What must not happen is a row in `users` per visit: the admin page lists accounts,
 * and a flood of visits by accident or a fluke would bury the editors in it.
 *
 * AUTO_CREATE_USERS now selects one of three policies:
 *   unset or empty  → 'visitor': a viewer session, and NO row
 *   'true'          → 'create':  the old behaviour, a viewer row per first sign-in
 *   'false'         → 'deny':    no session for anyone without a row
 *   any other value → 'deny', failing closed
 *
 * A visitor must also leave no trace through the two pages that assumed a row:
 * the profile page (which showed an error) and the notification settings (which
 * stored a preferences row keyed on the visitor's Microsoft id).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'visitor-sessions-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';
process.env.ADMIN_USERS = '';

let db;
let auth;
let userService;

beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  auth = require('../services/auth');
  userService = require('../services/userService');
});

afterAll(() => {
  delete process.env.AUTO_CREATE_USERS;
  db.close();
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  delete process.env.AUTO_CREATE_USERS;
  db.exec('DELETE FROM notification_preferences');
  db.exec('DELETE FROM users');
});

/** A Microsoft Graph /me profile, as determineUserRole receives it. */
const msUser = (n) => ({
  id: `ms-oid-${n}`,
  displayName: `Prófari ${n}`,
  mail: `profari${n}@skoli.example`,
});

const userRows = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

/** Seed an account row the way the admin page's "add user" does, or as a linked member. */
function seedMember(n, { linked = true, role = 'editor' } = {}) {
  return userService.createUser({
    providerId: linked ? `ms-oid-${n}` : null,
    providerUsername: `profari${n}@skoli.example`,
    email: `profari${n}@skoli.example`,
    role,
  });
}

/** Call a route's final handler with a fake req/res, as adminAssignAppendices.test.js does. */
function handlerOf(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  return layer.route.stack.at(-1).handle;
}

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

/** The req.user requireAuth builds from a visitor's token. */
const visitorToken = (n) => ({
  id: `ms-oid-${n}`,
  username: `profari${n}@skoli.example`,
  name: `Prófari ${n}`,
  role: 'viewer',
  books: [],
});

describe('signInPolicy (read from AUTO_CREATE_USERS)', () => {
  it.each([
    [undefined, 'visitor'],
    ['', 'visitor'],
    ['true', 'create'],
    [' TRUE ', 'create'],
    ['false', 'deny'],
    ['False', 'deny'],
    ['yes', 'deny'],
    ['1', 'deny'],
  ])('%j gives %s', (value, expected) => {
    expect(auth.signInPolicy(value)).toBe(expected);
  });
});

describe('a first sign-in with no account row', () => {
  it('is a visit by default: a viewer session', () => {
    expect(auth.determineUserRole(msUser(1))).toMatchObject({ role: 'viewer', source: 'visitor' });
  });

  it('leaves no row in users', () => {
    auth.determineUserRole(msUser(2));
    expect(userRows()).toBe(0);
  });

  it('carries no database id', () => {
    expect(auth.determineUserRole(msUser(3)).dbUserId).toBeUndefined();
  });

  it('creates a viewer row when AUTO_CREATE_USERS=true (the old behaviour, kept as a switch)', () => {
    process.env.AUTO_CREATE_USERS = 'true';
    auth.determineUserRole(msUser(4));
    expect(userService.findByProviderId('ms-oid-4')?.role).toBe('viewer');
  });

  it('is refused when AUTO_CREATE_USERS=false', () => {
    process.env.AUTO_CREATE_USERS = 'false';
    expect(auth.determineUserRole(msUser(5))).toBeNull();
  });

  it('is refused for an unrecognised AUTO_CREATE_USERS value, failing closed', () => {
    process.env.AUTO_CREATE_USERS = 'yes';
    expect(auth.determineUserRole(msUser(6))).toBeNull();
  });

  it('leaves no row when refused for an unrecognised value', () => {
    process.env.AUTO_CREATE_USERS = 'yes';
    auth.determineUserRole(msUser(6));
    expect(userRows()).toBe(0);
  });
});

describe('a sign-in that matches an account row (unchanged by the policy)', () => {
  it('takes its role from the row', () => {
    seedMember(7);
    expect(auth.determineUserRole(msUser(7))).toMatchObject({ role: 'editor', source: 'database' });
  });

  it('links an address the admin added before the first sign-in (the way to join)', () => {
    seedMember(8, { linked: false });
    auth.determineUserRole(msUser(8));
    expect(userService.findByProviderId('ms-oid-8')?.role).toBe('editor');
  });

  it('links the added address even when the policy denies visitors', () => {
    process.env.AUTO_CREATE_USERS = 'false';
    seedMember(9, { linked: false });
    expect(auth.determineUserRole(msUser(9))).toMatchObject({ role: 'editor' });
  });

  it('refuses a deactivated account', () => {
    const member = seedMember(10);
    userService.updateUser(member.id, { isActive: false });
    expect(auth.determineUserRole(msUser(10))).toBeNull();
  });
});

describe('GET /api/profile', () => {
  it('answers a visitor from the token, marked as a visitor', async () => {
    const get = handlerOf(require('../routes/profile'), 'get', '/');
    const { status, body } = await invoke(get, { user: visitorToken(20) });
    expect({ status, body }).toEqual({
      status: 200,
      body: {
        visitor: true,
        displayName: 'Prófari 20',
        email: 'profari20@skoli.example',
        role: 'viewer',
      },
    });
  });

  it('creates no row for the visitor it answers', async () => {
    const get = handlerOf(require('../routes/profile'), 'get', '/');
    await invoke(get, { user: visitorToken(21) });
    expect(userRows()).toBe(0);
  });

  it('still answers a member from their row (control)', async () => {
    seedMember(22);
    const get = handlerOf(require('../routes/profile'), 'get', '/');
    const { body } = await invoke(get, { user: { ...visitorToken(22), role: 'editor' } });
    expect(body).toMatchObject({ email: 'profari22@skoli.example', role: 'editor' });
  });

  it('does not mark a member as a visitor (control)', async () => {
    seedMember(23);
    const get = handlerOf(require('../routes/profile'), 'get', '/');
    const { body } = await invoke(get, { user: { ...visitorToken(23), role: 'editor' } });
    expect(body.visitor).toBeUndefined();
  });
});

describe('PUT /api/notifications/preferences', () => {
  const prefsBody = { reviews: { inApp: false, email: false } };
  const storedRows = (userId) =>
    db.prepare('SELECT COUNT(*) AS n FROM notification_preferences WHERE user_id = ?').get(userId)
      .n;

  it('is refused for a visitor, marked as a visitor', async () => {
    const put = handlerOf(require('../routes/notifications'), 'put', '/preferences');
    const { status, body } = await invoke(put, { user: visitorToken(30), body: prefsBody });
    expect({ status, visitor: body.visitor }).toEqual({ status: 403, visitor: true });
  });

  it('stores nothing for a visitor', async () => {
    const put = handlerOf(require('../routes/notifications'), 'put', '/preferences');
    await invoke(put, { user: visitorToken(31), body: prefsBody });
    expect(storedRows('ms-oid-31')).toBe(0);
  });

  it("still saves a member's preferences (control)", async () => {
    seedMember(32);
    const put = handlerOf(require('../routes/notifications'), 'put', '/preferences');
    await invoke(put, { user: { ...visitorToken(32), role: 'editor' }, body: prefsBody });
    expect(storedRows('ms-oid-32')).toBe(1);
  });
});
