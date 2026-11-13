/**
 * Who may read data that names team members.
 *
 * A sign-in that matches no account row is a visit: a `viewer` session (CLAUDE.md § Auth). A route
 * that asks only for a sign-in is therefore open to everyone in the school tenant. Four routes
 * returned per-person data on that footing:
 *
 *   GET /api/status/dashboard            each editor's workload, notes and activity
 *   GET /api/status/analytics            per-person productivity
 *   GET /api/status/activity/timeline    who did what, and when
 *   GET /api/activity/section/:b/:c/:s   the same, for one section
 *
 * The first two are for head editors and admins (Heim shows the dashboard to no one else); the
 * other two are for editors and above.
 *
 * The requests go through the real routers with real tokens. A permitted role must get past
 * authorization (anything but 401/403: the handlers read book files this harness does not
 * supply); a refused role must get 403. The viewer rows are the point; the rest are the control
 * that the routes still open for the roles that use them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'team-data-roles-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

let server;
let base;
let createToken;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const app = express();
  app.use(cookieParser());
  app.use('/api/status', require('../routes/status'));
  app.use('/api/activity', require('../routes/activity'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

/** A session with no `users` row, as a visitor's is; the role is the token's. */
function statusFor(role, url) {
  const token = createToken({
    id: `enginn-reikningur-${role}`,
    username: `${role}@skoli.example`,
    name: role,
    role,
    books: role === 'head-editor' ? ['efnafraedi-2e'] : [],
  });
  return fetch(base + url, { headers: { cookie: `auth_token=${token}` } }).then((r) => r.status);
}

const HEAD_EDITOR_AND_ABOVE = ['/api/status/dashboard', '/api/status/analytics'];
const EDITOR_AND_ABOVE = [
  '/api/status/activity/timeline',
  '/api/activity/section/efnafraedi-2e/1/m68663',
];

describe('routes that name team members are not open to a bare sign-in', () => {
  it.each([...HEAD_EDITOR_AND_ABOVE, ...EDITOR_AND_ABOVE])(
    'a viewer is refused %s',
    async (url) => {
      expect(await statusFor('viewer', url)).toBe(403);
    }
  );

  it.each(HEAD_EDITOR_AND_ABOVE)('an editor is refused %s', async (url) => {
    expect(await statusFor('editor', url)).toBe(403);
  });

  it.each(EDITOR_AND_ABOVE)('an editor gets past authorization on %s', async (url) => {
    expect([401, 403]).not.toContain(await statusFor('editor', url));
  });

  it.each([...HEAD_EDITOR_AND_ABOVE, ...EDITOR_AND_ABOVE])(
    'a head editor gets past authorization on %s',
    async (url) => {
      expect([401, 403]).not.toContain(await statusFor('head-editor', url));
    }
  );

  it.each([...HEAD_EDITOR_AND_ABOVE, ...EDITOR_AND_ABOVE])(
    'an admin gets past authorization on %s',
    async (url) => {
      expect([401, 403]).not.toContain(await statusFor('admin', url));
    }
  );

  it('no sign-in at all is 401, not 403', async () => {
    expect((await fetch(base + '/api/status/dashboard')).status).toBe(401);
  });
});
