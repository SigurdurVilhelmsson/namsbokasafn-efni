/**
 * Register C15 (b): `GET /api/status/:book/editorial-progress` must read its
 * discuss edits for ONE book.
 *
 * The route took `getDiscussEdits(50)`, the newest 50 discuss edits across every
 * book, and then filtered that page to the requested book. So a book's edits in
 * discussion vanished from its own view once 50 newer ones existed elsewhere.
 * The count it reported was the length of that filtered page, so it was also
 * capped at 50 for a book holding more (the C10-R4 class: a page used as a set).
 *
 * Fixture: book A holds 3 discuss edits, book B holds 60 NEWER ones. Before the
 * fix, book A's view showed none and book B's view counted 50.
 *
 * Harness idiom: handler extracted from the router stack, on a migrated
 * temporary database (cf. statusChapterRoute.test.js). The books directory is
 * redirected to an empty folder, so the chapter list is empty and only the
 * attention block is tested.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(join(tmpdir(), 'discuss-scope-'));
process.env.SESSIONS_DB_PATH = join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const service = require('../services/segmentEditorService');
const segmentParser = require('../services/segmentParser');
const { VALID_BOOKS } = require('../config');

const BOOK_A = 'c15b-book-a';
const BOOK_B = 'c15b-book-b';
const A_COUNT = 3;
const B_COUNT = 60; // deliberately > the route's old page of 50

let db;
let handler;
let realBooksDir;

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

async function attention(book) {
  const { status, body } = await invoke(handler, { params: { book }, query: {}, user: {} });
  expect(status).toBe(200);
  return body.attention;
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  db = new Database(process.env.SESSIONS_DB_PATH);

  const booksDir = join(work, 'books');
  mkdirSync(booksDir, { recursive: true });
  realBooksDir = segmentParser.BOOKS_DIR;
  segmentParser._setTestBooksDir(booksDir);
  VALID_BOOKS.push(BOOK_A, BOOK_B);

  const insert = db.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        editor_id, editor_username, editor_note, status, created_at)
     VALUES (?, 1, ?, ?, 'original', 'breytt', 'editor-1', 'editor1', ?, ?, ?)`
  );
  // Book A first and OLDER, so book B's 60 fill any newest-first page of 50.
  for (let i = 0; i < A_COUNT; i++) {
    insert.run(BOOK_A, 'mA', `mA:para:fs-id${i}`, `a${i}`, 'discuss', `2026-01-01 00:00:0${i}`);
  }
  for (let i = 0; i < B_COUNT; i++) {
    const sec = String(i).padStart(2, '0');
    insert.run(BOOK_B, 'mB', `mB:para:fs-id${i}`, `b${i}`, 'discuss', `2026-06-01 00:00:${sec}`);
  }
  // Not in discussion: must not be counted for book A.
  insert.run(BOOK_A, 'mA', 'mA:para:fs-id-pending', 'p', 'pending', '2026-07-01 00:00:00');

  const router = require('../routes/status');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/:book/editorial-progress' && l.route.methods.get
  );
  handler = layer.route.stack[layer.route.stack.length - 1].handle;
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  for (const b of [BOOK_A, BOOK_B]) {
    const idx = VALID_BOOKS.indexOf(b);
    if (idx !== -1) VALID_BOOKS.splice(idx, 1);
  }
  db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('editorial progress reads discuss edits for one book (C15 b)', () => {
  it("counts a book's discuss edits although 60 newer ones exist in another book", async () => {
    expect((await attention(BOOK_A)).discussEdits).toBe(A_COUNT);
  });

  it("lists a book's discuss edits although 60 newer ones exist in another book", async () => {
    expect((await attention(BOOK_A)).items.map((i) => i.note)).toEqual(['a2', 'a1', 'a0']);
  });

  it('counts every discuss edit of a book holding more than a page', async () => {
    expect((await attention(BOOK_B)).discussEdits).toBe(B_COUNT);
  });
});

describe('control: what already held', () => {
  it('lists at most ten items', async () => {
    expect((await attention(BOOK_B)).items).toHaveLength(10);
  });

  it('lists the newest first', async () => {
    expect((await attention(BOOK_B)).items[0].note).toBe('b59');
  });

  it("lists only the requested book's edits", async () => {
    const modules = new Set((await attention(BOOK_B)).items.map((i) => i.moduleId));
    expect([...modules]).toEqual(['mB']);
  });

  it('leaves the global page used by the dashboard and the meeting agenda unscoped', () => {
    expect(new Set(service.getDiscussEdits(200).map((e) => e.book))).toEqual(
      new Set([BOOK_A, BOOK_B])
    );
  });
});
