/**
 * The licence-clause routes (G1.13 spec §6.4): admin-only, validated dates, a logged reason on removal.
 * The database is a fully migrated one (every real migration), mounted through the real admin router.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config are read at module load.
const freshMigratedDb = require('./helpers/freshMigratedDb');
const seeded = freshMigratedDb();
process.env.SESSIONS_DB_PATH = seeded.path;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const jwt = require('jsonwebtoken');

const ADMIN = { username: 'test-admin', role: 'admin', books: [] };
const EDITOR = { username: 'test-editor', role: 'editor', books: [] };
const HEAD = { username: 'test-head', role: 'head-editor', books: ['efnafraedi-2e'] };

function mintToken(user) {
  return jwt.sign(
    {
      sub: `u-${user.username}`,
      username: user.username,
      name: user.username,
      role: user.role,
      books: user.books,
    },
    process.env.JWT_SECRET,
    { issuer: 'namsbokasafn-pipeline', expiresIn: '10m' }
  );
}

let server;
let base;
let userId;

beforeAll(() => {
  const info = seeded.db
    .prepare(
      "INSERT INTO users (provider_id, provider_username, display_name, role) VALUES ('u-subject', 'test-subject', 'Test Subject', 'editor')"
    )
    .run();
  userId = Number(info.lastInsertRowid);
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin'));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
  seeded.db.close();
});

afterEach(() => vi.restoreAllMocks());

const removalLogCount = () =>
  seeded.db
    .prepare("SELECT COUNT(*) FROM activity_log WHERE type = 'licence_clause_removed'")
    .pluck()
    .get();
const rowCount = (id) =>
  seeded.db.prepare('SELECT COUNT(*) FROM editor_licence_clauses WHERE id = ?').pluck().get(id);

const call = (user, method, path, body) =>
  fetch(`${base}/api/admin/users/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${mintToken(user)}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const utcDay = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

describe('licence-clause routes', () => {
  it.each(['2026-02-30', '2026-13-01'])('refuses %s as BAD_DATE', async (d) => {
    const res = await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: d });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BAD_DATE');
  });

  it('refuses a missing date as BAD_DATE', async () => {
    const res = await call(ADMIN, 'POST', `${userId}/licence-clause`, {});
    expect((await res.json()).code).toBe('BAD_DATE');
  });

  it('refuses tomorrow (UTC) as FUTURE_DATE', async () => {
    const res = await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(1) });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FUTURE_DATE');
  });

  it('refuses an unknown user with 404 USER_NOT_FOUND', async () => {
    const res = await call(ADMIN, 'POST', '987654/licence-clause', { signedOn: utcDay(0) });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('USER_NOT_FOUND');
  });

  it.each([
    ['an editor', EDITOR],
    ['a head-editor', HEAD],
  ])('refuses %s with 403 on all three routes', async (_n, caller) => {
    const post = await call(caller, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) });
    const del = await call(caller, 'DELETE', `${userId}/licence-clause/1`, {
      reason: 'a long enough reason',
    });
    const get = await call(caller, 'GET', `${userId}/licence-clause`);
    expect([post.status, del.status, get.status]).toEqual([403, 403, 403]);
  });

  it('records today (201), lists oldest first, and names the recording admin', async () => {
    const first = await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) });
    expect(first.status).toBe(201);
    const body = await first.json();
    expect(body.signedOn).toBe(utcDay(0));
    const second = await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(-1) });
    expect(second.status).toBe(201);
    const list = await (await call(ADMIN, 'GET', `${userId}/licence-clause`)).json();
    expect(list.rows.map((r) => r.id)).toContain(body.id);
    const ids = list.rows.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b)); // newest last
    expect(list.rows.every((r) => r.recordedBy === 'test-admin')).toBe(true);
  });

  it('refuses a short reason with 400 REASON_REQUIRED and removes nothing', async () => {
    const rec = await (
      await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) })
    ).json();
    const res = await call(ADMIN, 'DELETE', `${userId}/licence-clause/${rec.id}`, {
      reason: 'short',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('REASON_REQUIRED');
    const still = seeded.db
      .prepare('SELECT COUNT(*) FROM editor_licence_clauses WHERE id = ?')
      .pluck()
      .get(rec.id);
    expect(still).toBe(1);
  });

  it("refuses a row that is not this user's with 404", async () => {
    const rec = await (
      await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) })
    ).json();
    const res = await call(ADMIN, 'DELETE', `${userId + 1000}/licence-clause/${rec.id}`, {
      reason: 'a long enough reason',
    });
    expect(res.status).toBe(404);
  });

  // The row is checked before the log is written, so a refused id leaves no removal entry.
  it("a 404 for a row that is not this user's writes no activity_log entry", async () => {
    const rec = await (
      await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) })
    ).json();
    const before = removalLogCount();
    await call(ADMIN, 'DELETE', `${userId + 1000}/licence-clause/${rec.id}`, {
      reason: 'a long enough reason',
    });
    expect(removalLogCount()).toBe(before);
  });

  // spec §6.4: the log entry comes first. activityLog.log returns null when its write fails (it
  // never throws), and then the route answers 500 and deletes nothing.
  describe('when the activity log write fails', () => {
    let rec;
    let res;
    beforeAll(async () => {
      rec = await (
        await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) })
      ).json();
      vi.spyOn(require('../services/activityLog'), 'log').mockReturnValue(null);
      res = await call(ADMIN, 'DELETE', `${userId}/licence-clause/${rec.id}`, {
        reason: 'recorded against the wrong account',
      });
      vi.restoreAllMocks();
    });

    it('answers 500', () => expect(res.status).toBe(500));

    it('keeps the row', () => expect(rowCount(rec.id)).toBe(1));

    it('control: the same request with the log working removes the row', async () => {
      const again = await call(ADMIN, 'DELETE', `${userId}/licence-clause/${rec.id}`, {
        reason: 'recorded against the wrong account',
      });
      expect([again.status, rowCount(rec.id)]).toEqual([200, 0]);
    });
  });

  it('a good DELETE removes the row and writes one activity_log row naming the row id and reason', async () => {
    const rec = await (
      await call(ADMIN, 'POST', `${userId}/licence-clause`, { signedOn: utcDay(0) })
    ).json();
    const before = seeded.db
      .prepare("SELECT COUNT(*) FROM activity_log WHERE type = 'licence_clause_removed'")
      .pluck()
      .get();
    const res = await call(ADMIN, 'DELETE', `${userId}/licence-clause/${rec.id}`, {
      reason: 'recorded against the wrong account',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });
    const rows = seeded.db
      .prepare(
        "SELECT description, username FROM activity_log WHERE type = 'licence_clause_removed'"
      )
      .all();
    expect(rows).toHaveLength(before + 1);
    const last = rows[rows.length - 1];
    expect(last.description).toContain(`${rec.id}`);
    expect(last.description).toContain('recorded against the wrong account');
    expect(last.username).toBe('test-admin');
    expect(
      seeded.db
        .prepare('SELECT COUNT(*) FROM editor_licence_clauses WHERE id = ?')
        .pluck()
        .get(rec.id)
    ).toBe(0);
  });
});

// A licence row removed after the assignment would leave the editor assigned with no record, so the
// removal refuses while the user holds a chapter in a book open to editors (spec §6.4, amendment 8).
describe('removing a licence clause while the user holds a chapter', () => {
  const { plantAssignment } = require('./helpers/plantAssignment.cjs');
  const licenceClauses = require('../services/licenceClauses');
  const MESSAGE =
    'Ekki er hægt að fjarlægja leyfisákvæðið á meðan notandinn hefur kafla úthlutaðan. Fjarlægðu fyrst kaflaúthlutanir notandans.';
  let n = 0;

  const newEditor = () => {
    n += 1;
    const info = seeded.db
      .prepare(
        'INSERT INTO users (provider_id, provider_username, display_name, role) VALUES (?, ?, ?, ?)'
      )
      .run(`u-holder-${n}`, `test-holder-${n}`, `Test Holder ${n}`, 'editor');
    return Number(info.lastInsertRowid);
  };
  const withClause = async (id) =>
    (await (await call(ADMIN, 'POST', `${id}/licence-clause`, { signedOn: utcDay(0) })).json()).id;
  const remove = (id, rowId) =>
    call(ADMIN, 'DELETE', `${id}/licence-clause/${rowId}`, {
      reason: 'recorded against the wrong account',
    });

  describe('an editor holding a chemistry chapter', () => {
    let id;
    let rowId;
    let res;
    let body;
    let logsBefore;
    beforeAll(async () => {
      id = newEditor();
      rowId = await withClause(id);
      plantAssignment(seeded.db, { userId: id, book: 'efnafraedi-2e', chapter: 1 });
      logsBefore = removalLogCount();
      res = await remove(id, rowId);
      body = await res.json();
    });

    it('is refused with 409', () => expect(res.status).toBe(409));

    it('gets HOLDS_CHAPTERS and the Icelandic message', () =>
      expect(body).toEqual({ error: 'HOLDS_CHAPTERS', message: MESSAGE }));

    it('keeps the licence row', () => expect(rowCount(rowId)).toBe(1));

    it('writes no activity_log entry', () => expect(removalLogCount()).toBe(logsBefore));

    it('is removed (200, row gone, one log row) once the chapter is removed', async () => {
      seeded.db.prepare('DELETE FROM user_chapter_assignments WHERE user_id = ?').run(id);
      const again = await remove(id, rowId);
      expect([again.status, rowCount(rowId), removalLogCount()]).toEqual([200, 0, logsBefore + 1]);
    });
  });

  it('removes the row of an editor holding only a closed-book chapter', async () => {
    const id = newEditor();
    const rowId = await withClause(id);
    plantAssignment(seeded.db, { userId: id, book: 'orverufraedi', chapter: 1 });
    const res = await remove(id, rowId);
    expect([res.status, rowCount(rowId)]).toEqual([200, 0]);
  });

  it('removeClause throws HOLDS_CHAPTERS and deletes nothing while a chemistry row is held', async () => {
    const id = newEditor();
    const rowId = await withClause(id);
    plantAssignment(seeded.db, { userId: id, book: 'efnafraedi-2e', chapter: 2 });
    let code;
    try {
      licenceClauses.removeClause(seeded.db, { userId: id, rowId });
    } catch (err) {
      code = err.code;
    }
    expect([code, rowCount(rowId)]).toEqual(['HOLDS_CHAPTERS', 1]);
  });

  it("removeClause still returns false for a row that is not the user's", () => {
    expect(licenceClauses.removeClause(seeded.db, { userId: newEditor(), rowId: 999999 })).toBe(
      false
    );
  });
});
