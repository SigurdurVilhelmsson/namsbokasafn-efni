/**
 * "Yfirlestrar" lists the units with edits waiting for a decision (interface audit 2026-11-13, ED-08; [USER]
 * 2026-11-14, answer 11; register §C222). It used to show a banner, "Sýnir einingar sem bíða yfirlestrar", over
 * the ordinary pickers, filtering nothing.
 *
 * GET /api/segment-editor/review-list answers one row per unit (book, chapter, module) that holds a pending
 * edit: how many, and since when, oldest first, each with the link that opens it filtered to pending edits.
 * It is held to the books the reader works on, by the same rule as the activity log (lib/activityScope): an
 * admin sees every book.
 *
 * Requests go through the real router with real tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'review-list-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const MINE = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

let server;
let base;
let createToken;

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const addEdit = db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
       status, editor_id, editor_username, created_at)
     VALUES (?, ?, ?, ?, 'a', 'b', ?, 'e1', 'editor@skoli.example', ?)`
  );
  // MINE ch 3 m300: two pending, the older at 08:00; one approved (not counted).
  addEdit.run(MINE, 3, 'm300', 'm300:para:1', 'pending', '2026-11-12 09:00:00');
  addEdit.run(MINE, 3, 'm300', 'm300:para:2', 'pending', '2026-11-12 08:00:00');
  addEdit.run(MINE, 3, 'm300', 'm300:para:3', 'approved', '2026-11-01 08:00:00');
  // MINE ch 1 m100: one pending, older than m300's.
  addEdit.run(MINE, 1, 'm100', 'm100:para:1', 'pending', '2026-11-10 08:00:00');
  // MINE ch 2 m200: only a rejected and a discussion (not waiting for a decision).
  addEdit.run(MINE, 2, 'm200', 'm200:para:1', 'rejected', '2026-11-09 08:00:00');
  addEdit.run(MINE, 2, 'm200', 'm200:para:2', 'discuss', '2026-11-09 08:00:00');
  // OTHER ch 1 m900: one pending, the oldest of all.
  addEdit.run(OTHER, 1, 'm900', 'm900:para:1', 'pending', '2026-11-01 08:00:00');
  db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, role, is_active)
     VALUES ('p-editor', 'editor@skoli.example', 'Editor', 'editor', 1)`
  ).run();
  db.close();

  const app = express();
  app.use(cookieParser());
  app.use('/api/segment-editor', require('../routes/segment-editor'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

async function list(role, { id, books = [] } = {}) {
  const token = createToken({
    id: id || `p-${role}`,
    username: `${role}@skoli.example`,
    name: role,
    role,
    books,
  });
  const res = await fetch(`${base}/api/segment-editor/review-list`, {
    headers: { cookie: `auth_token=${token}` },
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

const units = (body) => body.modules.map((m) => `${m.book}/${m.chapter}/${m.moduleId}`);

describe('the units with edits waiting', () => {
  it('a head editor sees the units of their book with pending edits, oldest first', async () => {
    const r = await list('head-editor', { books: [MINE] });
    expect(r.status).toBe(200);
    expect(units(r.body)).toEqual([`${MINE}/1/m100`, `${MINE}/3/m300`]);
  });

  it('each unit carries how many edits wait, since when, and a link that opens it filtered', async () => {
    const r = await list('head-editor', { books: [MINE] });
    const m300 = r.body.modules.find((m) => m.moduleId === 'm300');
    expect(m300.pendingCount).toBe(2);
    expect(m300.oldestAt).toBe('2026-11-12 08:00:00');
    expect(m300.url).toBe(`/editor?book=${MINE}&chapter=3&module=m300&view=reviews`);
    expect(typeof m300.bookLabel).toBe('string');
  });

  it('a unit with only rejected or discussed edits is not listed (nothing waits for a decision)', async () => {
    const r = await list('head-editor', { books: [MINE] });
    expect(units(r.body)).not.toContain(`${MINE}/2/m200`);
  });

  it('control: an admin sees every book', async () => {
    const r = await list('admin');
    expect(units(r.body)).toEqual([`${OTHER}/1/m900`, `${MINE}/1/m100`, `${MINE}/3/m300`]);
  });

  it('an editor who works on no book sees nothing', async () => {
    const r = await list('editor', { id: 'p-editor' });
    expect(r.status).toBe(200);
    expect(r.body.modules).toEqual([]);
  });

  it('a guest is refused', async () => {
    expect((await list('viewer')).status).toBe(403);
  });
});
