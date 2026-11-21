/**
 * G1.15(a): who sees per-person figures, and how they are listed (SD7, as answered on 2026-11-21:
 * docs/decisions/2026-11-21-g115-editor-privacy-split-and-sd7-scope.md).
 *
 *   the activity log's ROWS follow the reader's books (the 14 Nov rule, activityLogBookScope.test.js);
 *   per-person FIGURES (the dashboard's workload, the analytics' team metrics, the meeting agenda's
 *   activity counts) follow the books the reader HEADS; an admin sees everybody;
 *   no list orders people by volume.
 *
 * The case that tells the two scopes apart is a head editor of one book who is also an editor on another:
 * they read the other book's log rows, and see none of its people in a per-person list. Each refusal has a
 * control: the same reader's own book, an admin, and the other book's log rows.
 *
 * The requests go through the real routers with real tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'per-editor-sd7-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const MINE = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

let server;
let base;
let createToken;

/** provider id → the session's token fields. */
const READERS = {
  headBoth: { id: 'p-head-both', role: 'head-editor' }, // head editor of MINE, editor on OTHER
  admin: { id: 'p-admin', role: 'admin' }, // no row: the token's role stands
};

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const userService = require('../services/userService');
  const activityLog = require('../services/activityLog');

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const headBothId = Number(
    db
      .prepare(
        `INSERT INTO users (provider_id, provider_username, display_name, role, is_active)
         VALUES (?, ?, ?, ?, 1)`
      )
      .run(READERS.headBoth.id, 'headboth@skoli.example', 'headBoth', 'head-editor').lastInsertRowid
  );
  // Edits in each book, by different people; MINE's busier editor sorts last by name.
  const addEdit = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content, status,
        editor_id, editor_username)
     VALUES (?, 1, ?, ?, 'x', 'y', 'pending', ?, ?)`
  );
  addEdit.run(MINE, 'm1', 'm1:para:a', 'u-z', 'Þórunn');
  addEdit.run(MINE, 'm1', 'm1:para:b', 'u-z', 'Þórunn');
  addEdit.run(MINE, 'm1', 'm1:para:c', 'u-a', 'Anna');
  addEdit.run(OTHER, 'm9', 'm9:para:a', 'u-b', 'Bjarni');
  db.close();

  userService.assignBookAccess(headBothId, MINE, 'head-editor', 'test');
  userService.assignBookAccess(headBothId, OTHER, 'editor', 'test');

  // Log rows, oldest first; the agenda reads newest first, so its insertion order is the reverse of
  // the name order and a list that kept it would fail the order test.
  for (const [username, book] of [
    ['Arna', MINE],
    ['Skrifari-Annar', OTHER],
    ['Skrifari-Mín', MINE],
  ]) {
    activityLog.log({
      type: 'segment_edit_saved',
      userId: `w-${username}`,
      username,
      book,
      chapter: '1',
      section: 'm1',
      description: `saved in ${book}`,
    });
  }

  const app = express();
  app.use(cookieParser());
  app.use('/api/status', require('../routes/status'));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(work, { recursive: true, force: true });
});

async function get(readerName, url) {
  const reader = READERS[readerName];
  const token = createToken({
    id: reader.id,
    username: `${readerName}@skoli.example`,
    name: readerName,
    role: reader.role,
    books: [],
  });
  const res = await fetch(base + url, { headers: { cookie: `auth_token=${token}` } });
  return { status: res.status, body: await res.json() };
}

/** The usernames of the meeting agenda's per-person activity section, in the order given. */
const agendaPeople = (body) =>
  (
    (body.sections || []).find((s) => s.title === 'Virkni síðustu 7 daga') || { items: [] }
  ).items.map((i) => i.username);

describe('the two scopes: log rows by the books worked on, per-person figures by the books headed', () => {
  it("control: the head editor reads the other book's log rows (the 14 Nov rule stands)", async () => {
    const r = await get('headBoth', `/api/status/activity/timeline?book=${OTHER}`);
    expect([r.status, r.body.activities.map((a) => a.username)]).toEqual([200, ['Skrifari-Annar']]);
  });

  it("the dashboard's workload holds only the people of the book they head", async () => {
    const r = await get('headBoth', '/api/status/dashboard');
    expect(r.body.workload.map((w) => w.editor)).toEqual(['Anna', 'Þórunn']);
  });

  it("the analytics' per-person figures hold only the people of the book they head", async () => {
    const r = await get('headBoth', '/api/status/analytics');
    expect(r.body.teamMetrics.map((m) => m.username)).toEqual(['Arna', 'Skrifari-Mín']);
  });

  it("the meeting agenda's activity counts hold only the people of the book they head", async () => {
    const r = await get('headBoth', '/api/status/meeting-agenda');
    expect(agendaPeople(r.body)).toEqual(['Arna', 'Skrifari-Mín']);
  });

  it('an admin sees everybody in all three, listed by name', async () => {
    const [dash, analytics, agenda] = await Promise.all([
      get('admin', '/api/status/dashboard'),
      get('admin', '/api/status/analytics'),
      get('admin', '/api/status/meeting-agenda'),
    ]);
    expect([
      dash.body.workload.map((w) => w.editor),
      analytics.body.teamMetrics.map((m) => m.username),
      agendaPeople(agenda.body),
    ]).toEqual([
      ['Anna', 'Bjarni', 'Þórunn'],
      ['Arna', 'Skrifari-Annar', 'Skrifari-Mín'],
      ['Arna', 'Skrifari-Annar', 'Skrifari-Mín'],
    ]);
  });
});
