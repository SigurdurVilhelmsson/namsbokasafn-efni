/**
 * I14-R1 mechanism (a) — appendix assignment rows (lead-decided 2026-07-18).
 * The admin assignment routes accept chapter -1 / 'appendices' (item-14
 * chapterLabel contract), making the assignments UI's existing Viðaukar row
 * real; hasChapterAccess then grants appendix access via the explicit row —
 * the uniform assignment model, no authz widening.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'admin-assign-app-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const USER_ID = 4242;
let BOOK;
let userService;
let assignHandler;
let unassignHandler;

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

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  const { VALID_BOOKS } = require('../config');
  if (!VALID_BOOKS.length) VALID_BOOKS.push('efnafraedi-2e');
  BOOK = VALID_BOOKS[0];

  // user_chapter_assignments.user_id has a real FK — seed the users rows
  // (post-022 schema: provider_id/provider_username).
  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);
  const ins = db.prepare(
    `INSERT INTO users (id, provider_id, provider_username, role) VALUES (?, ?, ?, 'editor')`
  );
  ins.run(USER_ID, 'test-4242', 'appendix-editor');
  ins.run(5555, 'test-5555', 'chapter-editor');
  db.close();

  userService = require('../services/userService');
  const router = require('../routes/admin');
  const find = (method) =>
    router.stack.find(
      (l) => l.route && l.route.path === '/assignments/:book/:chapter' && l.route.methods[method]
    );
  assignHandler = find('post').route.stack.at(-1).handle;
  unassignHandler = find('delete').route.stack.at(-1).handle;
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const admin = { id: 'adm1', username: 'admin1' };

describe('appendix assignment rows (I14-R1)', () => {
  it('POST accepts the word appendices and stores chapter -1', async () => {
    const r = await invoke(assignHandler, {
      params: { book: BOOK, chapter: 'appendices' },
      body: { userId: USER_ID },
      user: admin,
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const rows = userService.getBookAssignments(BOOK);
    expect(rows.some((a) => a.chapter === -1 && a.user_id === USER_ID)).toBe(true);
  });

  it('hasChapterAccess grants appendix access via the explicit -1 row', () => {
    expect(userService.hasChapterAccess(USER_ID, BOOK, -1)).toBe(true);
  });

  it('an editor with only a numbered-chapter assignment still lacks appendix access (uniform model)', () => {
    userService.assignChapter(5555, BOOK, 3, 'admin1');
    expect(userService.hasChapterAccess(5555, BOOK, -1)).toBe(false);
  });

  it('DELETE accepts -1 and removes the row', async () => {
    const r = await invoke(unassignHandler, {
      params: { book: BOOK, chapter: '-1' },
      user: admin,
    });
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(true);
    const rows = userService.getBookAssignments(BOOK);
    expect(rows.some((a) => a.chapter === -1)).toBe(false);
  });

  it('POST still rejects garbage and out-of-range chapters', async () => {
    for (const chapter of ['chappendices', '31', '-2']) {
      const r = await invoke(assignHandler, {
        params: { book: BOOK, chapter },
        body: { userId: USER_ID },
        user: admin,
      });
      expect(r.status).toBe(400);
    }
  });
});
