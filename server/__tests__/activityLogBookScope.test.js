/**
 * Who reads which book's activity log ([USER] 2026-11-14, answer 5).
 *
 * The log says who saved or approved what, and when. One rule for every read of it:
 *
 *   an admin reads every book's log;
 *   anyone else reads the log of the books they hold or are assigned to
 *   (a head-editor or editor book-access row, or a chapter assignment).
 *
 * The log search already held a head editor to their own books. Three other reads returned the same rows
 * to any editor, for any book: the Framvinda timeline, the per-section activity, and the dashboard's team
 * activity. So the rule could be walked around by a lower role than the one it restricted.
 *
 * The requests go through the real routers with real tokens. Each refusal has a control beside it: the same
 * reader is answered for their own book, and an admin is answered for the book the reader was refused.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: the DB path and JWT config are read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'activity-book-scope-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const express = require('express');
const cookieParser = require('cookie-parser');

const MINE = 'efnafraedi-2e';
const OTHER = 'liffraedi-2e';

let server;
let base;
let createToken;

/** provider id → the session's token fields. Every reader but the admin has an account row. */
const READERS = {
  assigned: { id: 'p-assigned', role: 'editor' }, // a chapter of MINE
  access: { id: 'p-access', role: 'editor' }, // an editor book-access row for MINE
  nothing: { id: 'p-nothing', role: 'editor' }, // an account, and no book
  head: { id: 'p-head', role: 'head-editor' }, // head editor of MINE
  admin: { id: 'p-admin', role: 'admin' }, // no row: the token's role stands
  // A head editor's session with no account row: its books are the ones its token holds.
  rowless: { id: 'p-rowless', role: 'head-editor', books: [MINE] },
};
const NO_ROW = ['admin', 'rowless'];

beforeAll(async () => {
  require('../services/migrationRunner').runAllMigrations();
  ({ createToken } = require('../services/auth'));
  const userService = require('../services/userService');
  const activityLog = require('../services/activityLog');

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const addUser = db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, role, is_active)
     VALUES (?, ?, ?, ?, 1)`
  );
  const ids = {};
  for (const [name, reader] of Object.entries(READERS)) {
    if (NO_ROW.includes(name)) continue;
    ids[name] = Number(
      addUser.run(reader.id, `${name}@skoli.example`, name, reader.role).lastInsertRowid
    );
  }
  db.close();

  userService.assignChapter(ids.assigned, MINE, 3, 'test');
  userService.assignBookAccess(ids.access, MINE, 'editor', 'test');
  userService.assignBookAccess(ids.head, MINE, 'head-editor', 'test');

  // One row in each book, one with no book, and each written by a different person.
  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'writer-mine',
    username: 'Skrifari-Mín',
    book: MINE,
    chapter: '3',
    section: 'm1',
    description: 'saved in my book',
  });
  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'writer-other',
    username: 'Skrifari-Annar',
    book: OTHER,
    chapter: '1',
    section: 'm9',
    description: 'saved in the other book',
  });
  activityLog.log({
    type: 'user_updated',
    userId: 'writer-nobook',
    username: 'Skrifari-Engin-Bók',
    description: 'a row that belongs to no book',
  });

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

async function get(readerName, url) {
  const reader = READERS[readerName];
  const token = createToken({
    id: reader.id,
    username: `${readerName}@skoli.example`,
    name: readerName,
    role: reader.role,
    books: reader.books || [],
  });
  const res = await fetch(base + url, { headers: { cookie: `auth_token=${token}` } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  return { status: res.status, body };
}

/** The people named in a list of activity rows, sorted. */
const names = (rows) => [...new Set((rows || []).map((a) => a.username))].sort();

describe('the Framvinda timeline (GET /api/status/activity/timeline)', () => {
  it.each(['assigned', 'access', 'head'])(
    '%s reads the log of the book they work on',
    async (reader) => {
      const r = await get(reader, `/api/status/activity/timeline?book=${MINE}`);
      expect(r.status).toBe(200);
      expect(names(r.body.activities)).toEqual(['Skrifari-Mín']);
    }
  );

  it.each(['assigned', 'access', 'head', 'nothing'])(
    "%s is refused another book's log",
    async (reader) => {
      const r = await get(reader, `/api/status/activity/timeline?book=${OTHER}`);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('NOT_YOUR_BOOK');
      expect(JSON.stringify(r.body)).not.toContain('Skrifari-Annar');
    }
  );

  it('a session with no account row reads the books its token holds, and no other', async () => {
    const mine = await get('rowless', `/api/status/activity/timeline?book=${MINE}`);
    expect(mine.status).toBe(200);
    expect(names(mine.body.activities)).toEqual(['Skrifari-Mín']);
    expect((await get('rowless', `/api/status/activity/timeline?book=${OTHER}`)).status).toBe(403);
  });

  it('an editor with no book is refused a named book, and gets no rows without one', async () => {
    expect((await get('nothing', `/api/status/activity/timeline?book=${MINE}`)).status).toBe(403);
    const r = await get('nothing', '/api/status/activity/timeline');
    expect(r.status).toBe(200);
    expect(r.body.activities).toEqual([]);
    expect(r.body.total).toBe(0);
  });

  it('with no book named, a reader gets only the books they work on', async () => {
    const r = await get('assigned', '/api/status/activity/timeline');
    expect(r.status).toBe(200);
    expect(names(r.body.activities)).toEqual(['Skrifari-Mín']);
    expect(r.body.total).toBe(1);
  });

  it("?user= does not reach into another book's rows", async () => {
    const r = await get('assigned', '/api/status/activity/timeline?user=writer-other');
    expect(r.status).toBe(200);
    expect(r.body.activities).toEqual([]);
  });

  it('control: an admin reads the other book, and every row when no book is named', async () => {
    const other = await get('admin', `/api/status/activity/timeline?book=${OTHER}`);
    expect(other.status).toBe(200);
    expect(names(other.body.activities)).toEqual(['Skrifari-Annar']);

    const all = await get('admin', '/api/status/activity/timeline');
    expect(names(all.body.activities)).toEqual([
      'Skrifari-Annar',
      'Skrifari-Engin-Bók',
      'Skrifari-Mín',
    ]);
  });
});

describe('the per-section activity (GET /api/activity/section/:book/:chapter/:section)', () => {
  it('a reader gets the section of a book they work on', async () => {
    const r = await get('assigned', `/api/activity/section/${MINE}/3/m1`);
    expect(r.status).toBe(200);
    expect(names(r.body.activities)).toEqual(['Skrifari-Mín']);
  });

  it.each(['assigned', 'access', 'head', 'nothing'])(
    "%s is refused another book's section",
    async (reader) => {
      const r = await get(reader, `/api/activity/section/${OTHER}/1/m9`);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('NOT_YOUR_BOOK');
    }
  );

  it('control: an admin gets it', async () => {
    const r = await get('admin', `/api/activity/section/${OTHER}/1/m9`);
    expect(r.status).toBe(200);
    expect(names(r.body.activities)).toEqual(['Skrifari-Annar']);
  });
});

describe("the dashboard's team activity (GET /api/status/dashboard)", () => {
  it("a head editor's team activity holds only their books", async () => {
    const r = await get('head', '/api/status/dashboard');
    expect(r.status).toBe(200);
    expect(names(r.body.teamActivity)).toEqual(['Skrifari-Mín']);
  });

  it('control: an admin sees every row', async () => {
    const r = await get('admin', '/api/status/dashboard');
    expect(r.status).toBe(200);
    expect(names(r.body.teamActivity)).toEqual([
      'Skrifari-Annar',
      'Skrifari-Engin-Bók',
      'Skrifari-Mín',
    ]);
  });
});

describe('the figures built from the log (analytics and the meeting agenda)', () => {
  const agendaNames = (body) =>
    (body.sections || [])
      .flatMap((section) => section.items || [])
      .map((item) => item.username)
      .filter(Boolean)
      .sort();

  it("a head editor's per-person figures hold only the people in their books", async () => {
    const r = await get('head', '/api/status/analytics');
    expect(r.status).toBe(200);
    expect(r.body.teamMetrics.map((m) => m.username)).toEqual(['Skrifari-Mín']);
  });

  it("a head editor's meeting agenda names only the people in their books", async () => {
    const r = await get('head', '/api/status/meeting-agenda');
    expect(r.status).toBe(200);
    expect(agendaNames(r.body)).toEqual(['Skrifari-Mín']);
  });

  it('control: an admin gets everybody in both', async () => {
    const everybody = ['Skrifari-Annar', 'Skrifari-Engin-Bók', 'Skrifari-Mín'];
    const analytics = await get('admin', '/api/status/analytics');
    expect(analytics.body.teamMetrics.map((m) => m.username).sort()).toEqual(everybody);
    const agenda = await get('admin', '/api/status/meeting-agenda');
    expect(agendaNames(agenda.body)).toEqual(everybody);
  });
});

/**
 * Every read of the log in a route is either held to the reader's books or listed here with the reason it
 * need not be. A new read that is neither fails this test by name: that is how the timeline, the per-section
 * read, the dashboard, the analytics and the meeting agenda came to return rows the search refused.
 */
describe('no route reads the log outside the rule', () => {
  const fs = require('node:fs');
  const routesDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'routes');

  // file → the reads in it that carry no `books:` scope, each with why that is right.
  const UNSCOPED_ON_PURPOSE = {
    'activity.js': {
      'activityLog.search(':
        'a non-admin must name a book, and mayReadLogOf decides it before the read',
      'activityLog.getRecent(': 'admin only (requireRole ADMIN)',
      'activityLog.getByUser(userId': 'admin only (requireRole ADMIN)',
      'activityLog.getByBook(': "the book's head editor or an admin (requireHeadEditor)",
      'activityLog.getBySection(': 'mayReadLogOf refuses another book before the read',
      'activityLog.getByUser(req.user.id': "the reader's own rows",
    },
    'my-work.js': {
      'activityLog.getByUser(req.user.id': "the reader's own rows",
    },
  };

  it('every activityLog read in server/routes is scoped or accounted for', () => {
    const unaccounted = [];
    const seenAllowances = new Set();
    for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const pattern = /activityLog\.(search|getRecent|getByUser|getByBook|getBySection)\(/g;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        // The call's own argument text: from the name to the bracket that closes it.
        let depth = 0;
        let end = match.index + match[0].length - 1;
        for (; end < source.length; end++) {
          if (source[end] === '(') depth++;
          else if (source[end] === ')' && --depth === 0) break;
        }
        const call = source.slice(match.index, end + 1);
        if (/\bbooks:/.test(call)) continue;
        const allowances = UNSCOPED_ON_PURPOSE[file] || {};
        const allowed = Object.keys(allowances).find((prefix) => call.startsWith(prefix));
        if (allowed) seenAllowances.add(file + ' ' + allowed);
        else unaccounted.push(file + ': ' + call.replace(/\s+/g, ' ').slice(0, 80));
      }
    }
    expect(unaccounted).toEqual([]);
    // Control: the scan really found the reads it excuses, so an empty list is not a scan that matched nothing.
    const expected = Object.entries(UNSCOPED_ON_PURPOSE).flatMap(([file, allowances]) =>
      Object.keys(allowances).map((prefix) => file + ' ' + prefix)
    );
    expect([...seenAllowances].sort()).toEqual(expected.sort());
  });
});

describe('the log search (GET /api/activity) follows the same rule', () => {
  it('a head editor searches a book they hold, and is refused another', async () => {
    const mine = await get('head', `/api/activity?book=${MINE}`);
    expect(mine.status).toBe(200);
    expect(names(mine.body.activities)).toEqual(['Skrifari-Mín']);
    expect((await get('head', `/api/activity?book=${OTHER}`)).status).toBe(403);
    expect((await get('head', '/api/activity')).status).toBe(403);
  });
});
