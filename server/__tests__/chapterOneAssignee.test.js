/**
 * One assignee per chapter ([USER] 2026-11-14, docs/decisions/2026-11-14-interface-audit-answers.md, answer 9;
 * interface audit 2026-11-13, AS-01).
 *
 * Before: choosing another editor for a chapter ADDED a second row, the screen went on showing one name, and
 * "— Óúthlutað —" removed whichever row the query returned first. With enforcement on, the editor who had been
 * "replaced" could still save.
 *
 * Now: both doors that assign (Úthlutanir's chapter row, Stjórnandi's user dialog) make the chosen editor the
 * chapter's one assignee, and clearing a chapter removes everyone on it. A chapter that already holds two rows
 * (written before this rule) is settled by the next choice.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'one-assignee-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const ANNA = 7001;
const BJORN = 7002;
const DORA = 7003;
const GUEST = 7004; // role viewer: not assignable
const GONE = 7005; // deactivated: not assignable
let BOOK;
let userService;
let handlers;

function invoke(h, req) {
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
  return Promise.resolve(h(req, res)).then(() => done);
}

const admin = { id: 'adm1', username: 'admin1', role: 'admin' };

/** The user ids that hold a chapter, sorted. */
function holders(chapter) {
  return userService
    .getBookAssignments(BOOK)
    .filter((a) => a.chapter === chapter)
    .map((a) => a.user_id)
    .sort();
}

const assign = (chapter, userId) =>
  invoke(handlers.assign, {
    params: { book: BOOK, chapter: String(chapter) },
    body: { userId },
    user: admin,
  });
const clear = (chapter) =>
  invoke(handlers.clear, { params: { book: BOOK, chapter: String(chapter) }, user: admin });

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const ins = db.prepare(
    `INSERT INTO users (id, provider_id, provider_username, display_name, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  ins.run(ANNA, 't-7001', 'anna', 'Anna', 'editor', 1);
  ins.run(BJORN, 't-7002', 'bjorn', 'Björn', 'editor', 1);
  ins.run(DORA, 't-7003', 'dora', 'Dóra', 'editor', 1);
  ins.run(GUEST, 't-7004', 'gestur', 'Gestur', 'viewer', 1);
  ins.run(GONE, 't-7005', 'farinn', 'Farinn', 'editor', 0);
  db.close();

  userService = require('../services/userService');
  const router = require('../routes/admin');
  const find = (routePath, method) =>
    router.stack
      .find((l) => l.route && l.route.path === routePath && l.route.methods[method])
      .route.stack.at(-1).handle;
  handlers = {
    assign: find('/assignments/:book/:chapter', 'post'),
    clear: find('/assignments/:book/:chapter', 'delete'),
    list: find('/assignments/:book', 'get'),
    userChapters: find('/users/:id/chapters', 'post'),
  };
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('Úthlutanir: the chapter row (POST and DELETE /assignments/:book/:chapter)', () => {
  it('choosing another editor replaces the first, and says whom it replaced', async () => {
    expect((await assign(4, ANNA)).status).toBe(200);
    expect(holders(4)).toEqual([ANNA]);

    const second = await assign(4, BJORN);
    expect(second.status).toBe(200);
    expect(holders(4)).toEqual([BJORN]);
    expect(second.body.replaced).toEqual([{ id: ANNA, name: 'Anna' }]);
  });

  it('choosing the editor who already holds the chapter changes nothing', async () => {
    const again = await assign(4, BJORN);
    expect(again.status).toBe(200);
    expect(holders(4)).toEqual([BJORN]);
    expect(again.body.replaced).toEqual([]);
  });

  it('a chapter that holds two editors from before the rule is settled by the next choice', async () => {
    userService.assignChapter(ANNA, BOOK, 5, 'before-the-rule');
    userService.assignChapter(BJORN, BOOK, 5, 'before-the-rule');
    expect(holders(5)).toEqual([ANNA, BJORN]);

    const r = await assign(5, DORA);
    expect(r.status).toBe(200);
    expect(holders(5)).toEqual([DORA]);
    expect(r.body.replaced.map((u) => u.id).sort()).toEqual([ANNA, BJORN]);
  });

  it('keeping one of two editors drops only the other', async () => {
    userService.assignChapter(ANNA, BOOK, 6, 'before-the-rule');
    userService.assignChapter(BJORN, BOOK, 6, 'before-the-rule');

    const r = await assign(6, ANNA);
    expect(r.status).toBe(200);
    expect(holders(6)).toEqual([ANNA]);
    expect(r.body.replaced).toEqual([{ id: BJORN, name: 'Björn' }]);
  });

  it('clearing a chapter removes everyone on it, not one row at a time', async () => {
    userService.assignChapter(ANNA, BOOK, 8, 'before-the-rule');
    userService.assignChapter(BJORN, BOOK, 8, 'before-the-rule');

    const r = await clear(8);
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(true);
    expect(holders(8)).toEqual([]);
  });

  it('clearing a chapter nobody holds answers removed: false', async () => {
    const r = await clear(9);
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(false);
  });

  it.each([
    ['a guest', GUEST],
    ['a deactivated account', GONE],
    ['an id with no account', 999999],
  ])('%s cannot be assigned, and the chapter keeps its editor', async (_label, userId) => {
    await assign(10, ANNA);
    const r = await assign(10, userId);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NOT_ASSIGNABLE');
    expect(holders(10)).toEqual([ANNA]);
  });

  it('only the chapter named is touched', async () => {
    await assign(11, ANNA);
    await assign(12, ANNA);
    await assign(11, BJORN);
    expect(holders(11)).toEqual([BJORN]);
    expect(holders(12)).toEqual([ANNA]);
  });
});

describe('Stjórnandi: the user dialog (POST /users/:id/chapters)', () => {
  it('giving a user a chapter takes it from whoever held it, and says so', async () => {
    await assign(13, ANNA);
    const r = await invoke(handlers.userChapters, {
      params: { id: String(DORA) },
      body: { bookSlug: BOOK, chapters: [13, 14] },
      user: admin,
    });
    expect(r.status).toBe(200);
    expect(holders(13)).toEqual([DORA]);
    expect(holders(14)).toEqual([DORA]);
    expect(r.body.replaced).toEqual([{ chapter: 13, users: [{ id: ANNA, name: 'Anna' }] }]);
  });

  it.each([
    ['a guest', GUEST],
    ['a deactivated account', GONE],
    ['an id with no account', 999999],
  ])('%s cannot be given a chapter here either, and its editor stays', async (_label, userId) => {
    await assign(17, ANNA);
    const r = await invoke(handlers.userChapters, {
      params: { id: String(userId) },
      body: { bookSlug: BOOK, chapters: [17] },
      user: admin,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('NOT_ASSIGNABLE');
    expect(holders(17)).toEqual([ANNA]);
  });
});

describe('the service', () => {
  it('setChapterAssignee leaves the chapter as it was when the new row cannot be written', () => {
    userService.setChapterAssignee(ANNA, BOOK, 15, 'admin1');
    // No such user: the foreign key refuses the row, and the delete before it must be undone with it.
    expect(() => userService.setChapterAssignee(424242, BOOK, 15, 'admin1')).toThrow();
    expect(holders(15)).toEqual([ANNA]);
  });

  it('assignChapter still only adds a row (fixtures and rows written before the rule use it)', () => {
    userService.assignChapter(ANNA, BOOK, 16, 'x');
    userService.assignChapter(BJORN, BOOK, 16, 'x');
    expect(holders(16)).toEqual([ANNA, BJORN]);
  });
});

describe('GET /assignments/:book', () => {
  it('an active editor who is not on a book-access-limited list can still be assigned', async () => {
    // Dóra has no book-access row; Björn gets one, which holds the page's list to him.
    userService.assignBookAccess(BJORN, BOOK, 'editor', 'admin1');
    expect(userService.getEditorsForBook(BOOK).map((e) => e.id)).toEqual([BJORN]);
    const r = await assign(18, DORA);
    expect(r.status).toBe(200);
    expect(holders(18)).toEqual([DORA]);
    userService.removeBookAccess(BJORN, BOOK);
  });

  it('says whether the editor list is held to the book-access rows', async () => {
    const open = await invoke(handlers.list, { params: { book: BOOK }, user: admin });
    expect(open.status).toBe(200);
    expect(open.body.editorsLimited).toBe(false);
    expect(open.body.editors.map((e) => e.id).sort()).toEqual([ANNA, BJORN, DORA]);

    userService.assignBookAccess(ANNA, BOOK, 'editor', 'admin1');
    const limited = await invoke(handlers.list, { params: { book: BOOK }, user: admin });
    expect(limited.body.editorsLimited).toBe(true);
    expect(limited.body.editors.map((e) => e.id)).toEqual([ANNA]);
  });
});
