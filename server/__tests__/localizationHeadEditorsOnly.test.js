/**
 * Localization is for head editors and admins ([USER] 2026-11-14, answer 12; interface audit 2026-11-13, LO-02;
 * register §C223). The menu already showed Aðlögun to head editors and admins only, while the page was served to
 * any signed-in user and the save routes accepted the editor role. The server now follows the menu.
 *
 * Requests go through the real routers with real tokens. A refusal is 403 (or, for the page, a redirect to Heim);
 * the controls check that a head editor of the book and an admin get past the guard. Past it, a route may still
 * answer 400 or 404 for this test's empty body and module; only the guard is under test here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'loc-head-only-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const BOOK = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

let server;
let base;
let createToken;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/localization-editor', require('../routes/localization-editor'));
  app.use('/', require('../routes/views'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

function cookieFor(role, books = []) {
  const token = createToken({
    id: `enginn-reikningur-${role}`,
    username: `${role}@skoli.example`,
    name: role,
    role,
    books,
  });
  return `auth_token=${token}`;
}

const SESSIONS = {
  editor: () => cookieFor('editor'),
  'head editor of another book': () => cookieFor('head-editor', [OTHER]),
  'head editor of the book': () => cookieFor('head-editor', [BOOK]),
  admin: () => cookieFor('admin'),
};

const WRITES = [
  ['save', `/api/localization-editor/${BOOK}/1/m68663/save`, { segmentId: 'x', content: 'y' }],
  ['save-all', `/api/localization-editor/${BOOK}/1/m68663/save-all`, { segments: [] }],
  ['log', `/api/localization-editor/${BOOK}/1/m68663/log`, {}],
];

async function post(session, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { cookie: SESSIONS[session](), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.status;
}

describe('the localization writes', () => {
  for (const [name, url, body] of WRITES) {
    it.each(['editor', 'head editor of another book'])(`%s is refused ${name}`, async (session) => {
      expect(await post(session, url, body)).toBe(403);
    });

    it.each(['head editor of the book', 'admin'])(
      `%s gets past the guard on ${name}`,
      async (session) => {
        const status = await post(session, url, body);
        expect([401, 403]).not.toContain(status);
      }
    );
  }
});

describe('the page', () => {
  async function page(session) {
    const res = await fetch(base + '/localization', {
      headers: { cookie: SESSIONS[session]() },
      redirect: 'manual',
    });
    return { status: res.status, location: res.headers.get('location') };
  }

  it('an editor is sent to Heim', async () => {
    expect(await page('editor')).toEqual({ status: 302, location: '/' });
  });

  it.each(['head editor of the book', 'admin'])('%s gets the page', async (session) => {
    expect((await page(session)).status).toBe(200);
  });
});
