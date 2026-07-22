/**
 * GET /api/admin/books/:slug/chapters/:chapter — appendices (C1b task 3a).
 *
 * DB-sourced chapter-detail route (drives the books.html "Sections" panel —
 * this is the LIVE UI path, unlike the disk-sourced sibling in books.js).
 * Pre-fix it does `parseInt(chapter, 10)`, which NaN's 'appendices' and
 * 404s even when the DB holds a real chapter_num=-1 row (Task 1/2 already
 * make that possible via insertAppendixSections/registerBook). This pins
 * that the route resolves 'appendices' to the DB row and returns its
 * sections, while '0'/garbage still 404 and a numeric chapter is unchanged.
 *
 * Harness: temp-file DB via SESSIONS_DB_PATH (set BEFORE any server
 * require), real migrations, one openstax_catalogue + registered_books row,
 * a numeric chapter_num=1 book_chapters/book_sections pair, and an
 * appendix chapter_num=-1 book_chapters row + its sections inserted via the
 * exported insertAppendixSections (mirrors registerAppendixSections.test.js
 * and adminBooksHonesty.test.js). The route handler is invoked directly via
 * router introspection (auth middlewares bypassed), same idiom as
 * adminAssignAppendices.test.js / books-routes.test.js.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'admin-appendix-chapter-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const SLUG = 'c1b-admin-chapter-fixture';

let handler;

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

  const Database = require('better-sqlite3');
  const db = new Database(process.env.SESSIONS_DB_PATH);

  const catalogueResult = db
    .prepare(`INSERT INTO openstax_catalogue (slug, title) VALUES (?, ?)`)
    .run(`${SLUG}-cat`, 'C1b Admin Chapter Catalogue Book');

  const bookResult = db
    .prepare(
      `INSERT INTO registered_books (catalogue_id, slug, title_is, registered_by, status)
       VALUES (?, ?, ?, 'u-test', 'active')`
    )
    .run(catalogueResult.lastInsertRowid, SLUG, 'C1b Prófbók');
  const bookId = bookResult.lastInsertRowid;

  // A normal numeric chapter, so the fix's numeric path is regression-checked
  // alongside the appendices path.
  const numChapterResult = db
    .prepare(
      `INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count)
       VALUES (?, 1, 'Chapter One', NULL, 1)`
    )
    .run(bookId);
  db.prepare(
    `INSERT INTO book_sections (book_id, chapter_id, chapter_num, section_num, module_id, title_en)
     VALUES (?, ?, 1, '1.1', 'm10001', 'Section One')`
  ).run(bookId, numChapterResult.lastInsertRowid);

  // The appendix chapter_num=-1 row + sections, via the exported helper
  // (mirrors registerAppendixSections.test.js / Task 1's registerBook wiring).
  const { insertAppendixSections } = require('../services/bookRegistration');
  const apxChapterResult = db
    .prepare(
      `INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count)
       VALUES (?, -1, 'Appendices', 'Viðaukar', 2)`
    )
    .run(bookId);
  insertAppendixSections(db, {
    bookId,
    chapterId: apxChapterResult.lastInsertRowid,
    sections: [
      { module_id: 'm90001', section_num: '1', title_en: 'Periodic Table' },
      { module_id: 'm90002', section_num: '2', title_en: 'Units' },
    ],
  });

  const router = require('../routes/admin');
  const layer = router.stack.find(
    (l) => l.route && l.route.path === '/books/:slug/chapters/:chapter' && l.route.methods.get
  );
  handler = layer.route.stack.at(-1).handle;

  db.close();
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('GET /api/admin/books/:slug/chapters/:chapter — appendices', () => {
  it('resolves "appendices" (not 404) and returns the appendix sections', async () => {
    const r = await invoke(handler, { params: { slug: SLUG, chapter: 'appendices' } });
    expect(r.status).toBe(200);
    expect(r.body.chapter.chapterNum).toBe(-1);
    expect(r.body.chapter.sections.map((s) => s.moduleId).sort()).toEqual(['m90001', 'm90002']);
  });

  it('still 404s on chapter "0"', async () => {
    const r = await invoke(handler, { params: { slug: SLUG, chapter: '0' } });
    expect(r.status).toBe(404);
  });

  it('still 404s on garbage', async () => {
    const r = await invoke(handler, { params: { slug: SLUG, chapter: 'xyz' } });
    expect(r.status).toBe(404);
  });

  it('leaves a numeric chapter unchanged', async () => {
    const r = await invoke(handler, { params: { slug: SLUG, chapter: '1' } });
    expect(r.status).toBe(200);
    expect(r.body.chapter.chapterNum).toBe(1);
    expect(r.body.chapter.sections.map((s) => s.moduleId)).toEqual(['m10001']);
  });
});
