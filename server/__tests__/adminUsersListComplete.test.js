/**
 * SD2 (register, 2026-10-24): the admin page's account list must never cut off silently.
 *
 * The page fetches GET /api/admin/users with no limit, and both its role filter and its
 * head-editor picker filter IN THE BROWSER. The route used to default to 100 rows, newest
 * first, so past 100 accounts the OLDEST dropped off the page without a word, and the
 * oldest accounts are the editors. Visitors no longer get rows (visitorSessions.test.js),
 * which keeps the list short; this pins the list itself, so a flood of rows from any
 * other route cannot hide an editor either.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'admin-users-list-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const ACCOUNTS = 105; // more than the old silent cut-off of 100
let listUsersHandler;
let userService;

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

beforeAll(() => {
  require('../services/migrationRunner').runAllMigrations();

  // The oldest account is an editor; every later one is a viewer, as a flood would be.
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  db.exec('DELETE FROM users');
  const insert = db.prepare(
    `INSERT INTO users (provider_id, provider_username, email, role, created_at)
     VALUES (?, ?, ?, ?, datetime('2026-01-01 00:00:00', ? || ' minutes'))`
  );
  for (let i = 0; i < ACCOUNTS; i++) {
    insert.run(
      `oid-${i}`,
      `u${i}@skoli.example`,
      `u${i}@skoli.example`,
      i === 0 ? 'editor' : 'viewer',
      i
    );
  }
  db.close();

  userService = require('../services/userService');
  const router = require('../routes/admin');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/users' && l.route.methods.get
  );
  listUsersHandler = layer.route.stack.at(-1).handle;
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('listUsers', () => {
  it('returns every row when the limit is null', () => {
    expect(userService.listUsers({ limit: null }).users).toHaveLength(ACCOUNTS);
  });

  it('still defaults to 100 for callers that pass no limit (control)', () => {
    expect(userService.listUsers({}).users).toHaveLength(100);
  });
});

describe('GET /api/admin/users', () => {
  it('returns every account when the page asks with no limit', async () => {
    const { body } = await invoke(listUsersHandler, { query: {} });
    expect(body.users).toHaveLength(ACCOUNTS);
  });

  it('keeps the oldest account, the editor, in that list', async () => {
    const { body } = await invoke(listUsersHandler, { query: {} });
    expect(body.users.some((u) => u.role === 'editor')).toBe(true);
  });

  it('still pages when a limit is given (control)', async () => {
    const { body } = await invoke(listUsersHandler, { query: { limit: '10' } });
    expect(body.users).toHaveLength(10);
  });
});
