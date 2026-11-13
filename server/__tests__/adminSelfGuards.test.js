/**
 * An admin cannot lock themselves out from the user list.
 *
 * Since a session follows the account row (sessionFollowsAccount.test.js), a change to the
 * caller's own row holds from their very next request. Before that, a mis-click on one's own row
 * could be undone from the same session; now it cannot, so the routes refuse it:
 *
 *   - PUT /api/admin/users/:id refuses to deactivate or demote the caller's own row;
 *   - DELETE /api/admin/users/:id refuses the caller's own row.
 *
 * "Own row" is decided by the account id, which sign-in binds to the row. The username is not a
 * key: the row stores it lowercased and the token carries it as Microsoft sent it, so the old
 * comparison missed every address with a capital letter in it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: both are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'admin-self-guards-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

let db;
let userService;
let putUser;
let deleteUser;

beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();
  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);
  userService = require('../services/userService');
  const router = require('../routes/admin');
  const handler = (method) =>
    router.stack
      .find((l) => l.route && l.route.path === '/users/:id' && l.route.methods[method])
      .route.stack.at(-1).handle;
  putUser = handler('put');
  deleteUser = handler('delete');
});

afterAll(() => {
  db.close();
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM user_book_access');
  db.exec('DELETE FROM users');
});

/** Anna is an admin by her row; Microsoft sends her address with capital letters. */
const ANNA = { id: 'ms-oid-anna', username: 'Anna.Jons@Skoli.example', role: 'admin' };

function row(providerId, address, role) {
  return userService.createUser({
    providerId,
    providerUsername: address,
    email: address,
    role,
  });
}

function call(handler, user, id, { body = {}, query = {} } = {}) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  handler({ params: { id: String(id) }, body, query, user }, res);
  return res;
}

const stored = (id) => db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(id);

describe("PUT /api/admin/users/:id on the caller's own row", () => {
  it('refuses to deactivate it', () => {
    const anna = row(ANNA.id, ANNA.username, 'admin');
    const res = call(putUser, ANNA, anna.id, { body: { isActive: false } });
    expect(res.statusCode).toBe(400);
    expect(stored(anna.id)).toEqual({ role: 'admin', is_active: 1 });
  });

  it('refuses to demote it, whatever the letter case of the address', () => {
    const anna = row(ANNA.id, ANNA.username, 'admin');
    expect(userService.findById(anna.id).provider_username).toBe('anna.jons@skoli.example'); // stored lowercased
    const res = call(putUser, ANNA, anna.id, { body: { role: 'editor' } });
    expect(res.statusCode).toBe(400);
    expect(stored(anna.id)).toEqual({ role: 'admin', is_active: 1 });
  });

  it('still lets the caller change their own name, and keep their role and active state', () => {
    const anna = row(ANNA.id, ANNA.username, 'admin');
    const res = call(putUser, ANNA, anna.id, {
      body: { displayName: 'Anna Jónsdóttir', role: 'admin', isActive: true },
    });
    expect(res.statusCode).toBe(200);
    expect(userService.findById(anna.id).display_name).toBe('Anna Jónsdóttir');
    expect(stored(anna.id)).toEqual({ role: 'admin', is_active: 1 });
  });
});

describe("PUT /api/admin/users/:id on another person's row (control: the guard is about the caller only)", () => {
  it('deactivates and demotes', () => {
    row(ANNA.id, ANNA.username, 'admin');
    const bjorn = row('ms-oid-bjorn', 'bjorn@skoli.example', 'head-editor');
    expect(call(putUser, ANNA, bjorn.id, { body: { isActive: false } }).statusCode).toBe(200);
    expect(call(putUser, ANNA, bjorn.id, { body: { role: 'editor' } }).statusCode).toBe(200);
    expect(stored(bjorn.id)).toEqual({ role: 'editor', is_active: 0 });
  });

  it('a row nobody has signed in to yet (no account id) is not the caller', () => {
    row(ANNA.id, ANNA.username, 'admin');
    const stub = userService.createUser({
      providerId: null,
      providerUsername: 'nyr@skoli.example',
      email: 'nyr@skoli.example',
      role: 'editor',
    });
    expect(call(putUser, ANNA, stub.id, { body: { isActive: false } }).statusCode).toBe(200);
    expect(stored(stub.id).is_active).toBe(0);
  });
});

describe('PUT /api/admin/users/:id: isActive is true or false', () => {
  it.each([
    ['an empty string', ''],
    ['the text "false"', 'false'],
    ['a number', 0],
    ['null', null],
  ])('refuses %s and changes nothing', (_name, isActive) => {
    row(ANNA.id, ANNA.username, 'admin');
    const bjorn = row('ms-oid-bjorn', 'bjorn@skoli.example', 'editor');
    const res = call(putUser, ANNA, bjorn.id, { body: { isActive } });
    expect(res.statusCode).toBe(400);
    expect(stored(bjorn.id)).toEqual({ role: 'editor', is_active: 1 });
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it("refuses the caller's own row, whatever the letter case of the address", () => {
    const anna = row(ANNA.id, ANNA.username, 'admin');
    expect(call(deleteUser, ANNA, anna.id).statusCode).toBe(400);
    expect(call(deleteUser, ANNA, anna.id, { query: { hard: 'true' } }).statusCode).toBe(400);
    expect(stored(anna.id)).toEqual({ role: 'admin', is_active: 1 });
  });

  it("deactivates another person's row (control)", () => {
    row(ANNA.id, ANNA.username, 'admin');
    const bjorn = row('ms-oid-bjorn', 'bjorn@skoli.example', 'editor');
    expect(call(deleteUser, ANNA, bjorn.id).statusCode).toBe(200);
    expect(stored(bjorn.id).is_active).toBe(0);
  });
});
