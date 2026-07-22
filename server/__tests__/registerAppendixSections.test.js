/**
 * Appendix section registration (C1b, I14-R4/I16-R3).
 *
 * registerBook() historically iterated bookData.chapters only, so a book's
 * appendices (canonical chapter_num=-1, dir name 'appendices') were never
 * registered into book_chapters/book_sections. This pins:
 *  - registerBook() creates a chapter_num=-1 book_chapters row (title_is
 *    'Viðaukar') and one book_sections row per appendix entry, numbered by
 *    array order (section_num = '1', '2', ...).
 *  - en_md_path for an appendix section uses the 'appendices' directory, not
 *    the numeric chapter convention ('ch-1' would be the pre-fix bug shape).
 *  - insertAppendixSections() is exported, add-only, and idempotent: calling
 *    it again with a section that already exists inserts 0 rows.
 *
 * Harness: temp-file DB via SESSIONS_DB_PATH (set BEFORE any server
 * require), real migrations. registerBook() is driven without network by
 * inserting an openstax_catalogue row and writing a synthetic
 * server/data/<catalogueSlug>.json (fetchFromOpenstax:false reads that file
 * verbatim if present) — mirrors server/__tests__/adminBooksHonesty.test.js.
 *
 * registerBook() also has a real-filesystem side effect: it calls
 * createBookDirectories(slug), which writes books/<slug>/** against the
 * ACTUAL repo books/ dir (BOOKS_DIR is resolved from __dirname, not
 * SESSIONS_DB_PATH — there is no env override, and registerBook calls the
 * lexical binding so it can't be stubbed from here). Left around even
 * briefly, the empty books/<slug>/05-publication/ tree is picked up by
 * tools/__tests__/css-contract.test.js — it snapshots every book dir with a
 * 05-publication subfolder via a top-level fs.readdirSync(BOOKS_DIR) at
 * collection time (not inside a test) and expects >0 rendered HTML files
 * per book found. The `tools` and `server` vitest projects can run
 * concurrently (fileParallelism:false only serializes within the `server`
 * project), so an afterAll-only cleanup leaves a real race — this removes
 * the directory the instant registerBook() returns (last thing it does),
 * pre-cleans at the top of beforeAll in case a prior run crashed before its
 * own cleanup, and keeps afterAll only as a backstop.
 */
import { mkdtempSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: resolveDbPath()/JWT config load at import.
const work = mkdtempSync(path.join(tmpdir(), 'appendix-reg-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const CATALOGUE_SLUG = 'c1b-test-cat';
const SLUG = 'c1b-test-book';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE_PATH = path.join(__dirname, '..', 'data', `${CATALOGUE_SLUG}.json`);
const REAL_BOOK_DIR = path.join(__dirname, '..', '..', 'books', SLUG);

let db;
let bookRegistration;
let bookId;

beforeAll(async () => {
  // Pre-clean: a prior crashed run may have left these behind.
  if (existsSync(DATA_FILE_PATH)) unlinkSync(DATA_FILE_PATH);
  if (existsSync(REAL_BOOK_DIR)) rmSync(REAL_BOOK_DIR, { recursive: true, force: true });

  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  const Database = require('better-sqlite3');
  db = new Database(process.env.SESSIONS_DB_PATH);

  db.prepare(`INSERT INTO openstax_catalogue (slug, title, chapter_count) VALUES (?, ?, ?)`).run(
    CATALOGUE_SLUG,
    'C1b Test Catalogue Book',
    1
  );

  // Synthetic local data file read verbatim by registerBook when
  // fetchFromOpenstax is false and the file exists (no network hit).
  writeFileSync(
    DATA_FILE_PATH,
    JSON.stringify({
      book: CATALOGUE_SLUG,
      slug: SLUG,
      title: 'C1b Test Catalogue Book',
      titleIs: 'C1b Prófbók',
      chapters: [
        {
          chapter: 1,
          title: 'Chapter One',
          titleIs: null,
          modules: [{ id: 'm10001', title: 'Section One', section: '1.1' }],
        },
        {
          chapter: 2,
          title: 'Chapter Two',
          titleIs: null,
          modules: [{ id: 'm10002', title: 'Section Two', section: '2.1' }],
        },
      ],
      appendices: [
        { id: 'm90001', title: 'Periodic Table' },
        { id: 'm90002', title: 'Units' },
      ],
    }),
    'utf8'
  );

  bookRegistration = require('../services/bookRegistration');
  const result = await bookRegistration.registerBook({
    catalogueSlug: CATALOGUE_SLUG,
    slug: SLUG,
    titleIs: 'C1b Prófbók',
    registeredBy: 'u-test',
    fetchFromOpenstax: false,
  });
  bookId = result.bookId;

  // registerBook() has already synchronously read DATA_FILE_PATH and (as its
  // last step) written REAL_BOOK_DIR by this point — neither is needed again,
  // and none of this suite's assertions touch the filesystem (only the temp
  // DB), so remove both immediately rather than waiting for afterAll. This
  // closes the css-contract cross-project race described above for
  // REAL_BOOK_DIR, and removes the same class of stray-file risk for
  // DATA_FILE_PATH symmetrically.
  if (existsSync(DATA_FILE_PATH)) unlinkSync(DATA_FILE_PATH);
  if (existsSync(REAL_BOOK_DIR)) rmSync(REAL_BOOK_DIR, { recursive: true, force: true });
});

afterAll(() => {
  db.close();
  // Backstops in case an assertion below throws before the beforeAll cleanup
  // above would otherwise be the only removal (it already ran on the happy
  // path, so these are normally no-ops).
  if (existsSync(DATA_FILE_PATH)) unlinkSync(DATA_FILE_PATH);
  if (existsSync(REAL_BOOK_DIR)) rmSync(REAL_BOOK_DIR, { recursive: true, force: true });
});

describe('registerBook — appendix section registration', () => {
  it('leaves numeric-chapter paths unchanged (chapterDir(N) == old ch${padStart} shadow-fix invariant)', () => {
    const row = db
      .prepare(
        `SELECT cnxml_path, en_md_path FROM book_sections WHERE book_id = ? AND chapter_num = 1`
      )
      .get(bookId);

    expect(row.cnxml_path).toBe('01-source/ch01/m10001.cnxml');
    expect(row.en_md_path).toBe('02-for-mt/ch01/1-1.en.md');
  });

  it('registers one book_sections row per appendix, numbered by array order', () => {
    const rows = db
      .prepare(
        `SELECT chapter_num, section_num, module_id, title_en, en_md_path
         FROM book_sections WHERE book_id = ? AND chapter_num = -1 ORDER BY CAST(section_num AS INTEGER)`
      )
      .all(bookId);

    expect(rows.map((r) => r.module_id)).toEqual(['m90001', 'm90002']);
    expect(rows.map((r) => r.section_num)).toEqual(['1', '2']);
    expect(rows[0].en_md_path).toContain('02-for-mt/appendices/');
    expect(rows[0].en_md_path).not.toContain('ch-1');
  });

  it('creates the appendix chapter row with the canonical Icelandic title', () => {
    const ch = db
      .prepare(`SELECT * FROM book_chapters WHERE book_id = ? AND chapter_num = -1`)
      .get(bookId);

    expect(ch).toBeTruthy();
    expect(ch.title_is).toBe('Viðaukar');
  });

  it('getRegisteredBook orders the appendix chapter LAST, after numeric chapters ascending', () => {
    // SQLite integer-sorts -1 before 1/2 under a plain `ORDER BY chapter_num`;
    // every other read site (chapterLabel.compareChapters, status.js,
    // publication.js) treats appendices as sorting AFTER all numeric
    // chapters. getRegisteredBook's chapters array feeds admin.js's
    // GET /api/admin/books/:slug verbatim into books.html, which renders the
    // chapters grid in array order with no client re-sort — so this pins the
    // same appendices-last convention here.
    const book = bookRegistration.getRegisteredBook(SLUG);
    const nums = book.chapters.map((c) => c.chapterNum);

    expect(nums[nums.length - 1]).toBe(-1);
    const numericNums = nums.filter((n) => n !== -1);
    expect(numericNums).toEqual([...numericNums].sort((a, b) => a - b));
    expect(numericNums).toEqual([1, 2]);
  });

  it('insertAppendixSections is exported, add-only, and idempotent', () => {
    const { insertAppendixSections } = bookRegistration;
    expect(typeof insertAppendixSections).toBe('function');

    const ch = db
      .prepare(`SELECT id FROM book_chapters WHERE book_id = ? AND chapter_num = -1`)
      .get(bookId);

    const n = insertAppendixSections(db, {
      bookId,
      chapterId: ch.id,
      sections: [{ module_id: 'm90001', section_num: '1', title_en: 'x' }],
    });

    expect(n).toBe(0); // already present — add-only, no duplicate
  });
});
