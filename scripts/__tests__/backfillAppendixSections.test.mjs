/**
 * scripts/backfill-appendix-sections.js — add-only, idempotent backfill of
 * appendix (chapter_num=-1) book_chapters/book_sections rows for
 * ALREADY-registered books (C1b, Task 2). Task 1's registerBook() fix only
 * covers FUTURE registrations; this script covers books registered before
 * that fix landed.
 *
 * Harness mirrors scripts/__tests__/backfill-mt-locks.test.mjs /
 * server/__tests__/adminBooksHonesty.test.js: temp SESSIONS_DB_PATH set
 * BEFORE requiring migrationRunner, real migrations run once, better-sqlite3
 * resolved from server/node_modules (root has no dependency on it — the repo
 * is ESM at the root but the DB driver + bookRegistration.js are CJS under
 * server/).
 *
 * runBackfill() is imported directly (like scripts/validate-status.js's
 * listChapterDirsForBook), not spawned as a subprocess — the brief's Step 2
 * sample calls `await runBackfill({...})` directly.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// Unique temp DB path set BEFORE any server require, mirroring
// adminBooksHonesty.test.js — resolveDbPath() reads this env var at call
// time (not just at module load), but migrationRunner/bookRegistration both
// resolve it once via `resolveDbPath()` internally, so the env var must be
// in place before those modules' functions are first invoked.
const work = mkdtempSync(path.join(tmpdir(), 'backfill-apx-'));
const dbPath = path.join(work, 'sessions.db');
process.env.SESSIONS_DB_PATH = dbPath;

const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));

const SLUG = 'prufubok-apx';
const BROKEN = 'brotin-bok-apx';
const ROLLBACK = 'aftur-baka-bok-apx';

let db;
let tmpBooks;

function countSections(database, slug, chapterNum) {
  return database
    .prepare(
      `SELECT COUNT(*) n FROM book_sections bs
       JOIN registered_books rb ON rb.id = bs.book_id
       WHERE rb.slug = ? AND bs.chapter_num = ?`
    )
    .get(slug, chapterNum).n;
}

function countAppendixChapters(database, slug) {
  return database
    .prepare(
      `SELECT COUNT(*) n FROM book_chapters bc
       JOIN registered_books rb ON rb.id = bc.book_id
       WHERE rb.slug = ? AND bc.chapter_num = -1`
    )
    .get(slug).n;
}

beforeAll(() => {
  const { runAllMigrations } = require(
    path.join(REPO_ROOT, 'server', 'services', 'migrationRunner.js')
  );
  runAllMigrations();

  db = new Database(dbPath);

  // Two registered books, no catalogue join needed (the script queries
  // registered_books directly per the curated-context guidance — NOT
  // listRegisteredBooks(), which INNER JOINs openstax_catalogue and can hide
  // books). catalogue_id is nullable, so no openstax_catalogue row required.
  db.prepare(
    `INSERT INTO registered_books (slug, title_is, registered_by, status)
     VALUES (?, 'Prufubók', 'u-test', 'active')`
  ).run(SLUG);
  db.prepare(
    `INSERT INTO registered_books (slug, title_is, registered_by, status)
     VALUES (?, 'Brotin bók', 'u-test', 'active')`
  ).run(BROKEN);
  const rollbackResult = db
    .prepare(
      `INSERT INTO registered_books (slug, title_is, registered_by, status)
       VALUES (?, 'Aftur bók', 'u-test', 'active')`
    )
    .run(ROLLBACK);
  const rollbackBookId = rollbackResult.lastInsertRowid;

  // Temp books/ tree. SLUG gets a real appendices source dir + a valid
  // collection-order.json with 2 appendix modules (one has a structure.json
  // for title_en, the other doesn't — NULL parity check). BROKEN has an
  // appendices dir too (so the "has appendices" gate fires) but its
  // collection-order.json is unparseable JSON — must fail loud.
  tmpBooks = path.join(work, 'books');

  const slugSourceDir = path.join(tmpBooks, SLUG, '01-source');
  mkdirSync(path.join(slugSourceDir, 'appendices'), { recursive: true });
  writeFileSync(
    path.join(slugSourceDir, 'collection-order.json'),
    JSON.stringify({ appendixModules: ['m90001', 'm90002'] })
  );
  const slugStructDir = path.join(tmpBooks, SLUG, '02-structure', 'appendices');
  mkdirSync(slugStructDir, { recursive: true });
  writeFileSync(
    path.join(slugStructDir, 'm90001-structure.json'),
    JSON.stringify({ moduleId: 'm90001', title: { text: 'Test Appendix One' } })
  );
  // m90002 deliberately has NO structure.json — title_en must come back NULL.

  const brokenSourceDir = path.join(tmpBooks, BROKEN, '01-source');
  mkdirSync(path.join(brokenSourceDir, 'appendices'), { recursive: true });
  writeFileSync(path.join(brokenSourceDir, 'collection-order.json'), '{ not valid json');

  // ROLLBACK book: has an appendices dir + a VALID collection-order.json
  // whose sole module ('mNEW') would land on section_num='1' — but a
  // book_sections row for section_num='1' with a DIFFERENT module_id
  // ('mOLD') is pre-seeded directly (no appendix book_chapters row yet).
  // insertAppendixSections's dedup guard keys on module_id, so 'mNEW' !=
  // 'mOLD' looks like a fresh insert to it — the raw INSERT then collides
  // with book_sections' UNIQUE(book_id, chapter_num, section_num) and
  // throws SQLITE_CONSTRAINT *inside* the per-book transaction, after the
  // chapter-row insert-if-missing has already run in the same transaction.
  // This pins the transaction-wrapping requirement for real: it proves the
  // chapter-row insert is rolled back too, not left as a stray -1 chapter
  // row with no matching sections.
  const rollbackSourceDir = path.join(tmpBooks, ROLLBACK, '01-source');
  mkdirSync(path.join(rollbackSourceDir, 'appendices'), { recursive: true });
  writeFileSync(
    path.join(rollbackSourceDir, 'collection-order.json'),
    JSON.stringify({ appendixModules: ['mNEW'] })
  );
  // book_sections.chapter_id has a real FK to book_chapters(id) (foreign_keys
  // is ON in this environment), so the pre-seeded row needs a valid target —
  // an UNRELATED placeholder chapter (chapter_num=0), deliberately NOT the
  // appendix chapter (chapter_num=-1), so "0 appendix chapter rows exist yet"
  // still holds for this book before the backfill runs.
  const placeholderChapterId = db
    .prepare(
      `INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count, status)
       VALUES (?, 0, 'Placeholder', 'Staðgengill', 1, 'not_started')`
    )
    .run(rollbackBookId).lastInsertRowid;
  db.prepare(
    `INSERT INTO book_sections (book_id, chapter_id, chapter_num, section_num, module_id, status)
     VALUES (?, ?, -1, '1', 'mOLD', 'not_started')`
  ).run(rollbackBookId, placeholderChapterId);
});

afterAll(() => {
  if (db) db.close();
  rmSync(work, { recursive: true, force: true });
});

describe('backfill-appendix-sections runBackfill()', () => {
  it('dry-run writes nothing, --db inserts, second --db run is idempotent, broken book fails loud', async () => {
    const { runBackfill } = await import('../backfill-appendix-sections.js');

    // dry-run: writes nothing
    await runBackfill({ book: SLUG, db: false, booksDir: tmpBooks });
    expect(countSections(db, SLUG, -1)).toBe(0);
    expect(countAppendixChapters(db, SLUG)).toBe(0);

    // --db: inserts 2 sections + 1 appendix chapter row
    await runBackfill({ book: SLUG, db: true, booksDir: tmpBooks });
    expect(countSections(db, SLUG, -1)).toBe(2);
    expect(countAppendixChapters(db, SLUG)).toBe(1);

    // Title parity check: m90001 has a structure.json → title_en set;
    // m90002 has none → NULL.
    const rows = db
      .prepare(
        `SELECT module_id, title_en, section_num FROM book_sections
         WHERE book_id = (SELECT id FROM registered_books WHERE slug = ?) AND chapter_num = -1
         ORDER BY module_id`
      )
      .all(SLUG);
    expect(rows).toEqual([
      { module_id: 'm90001', title_en: 'Test Appendix One', section_num: '1' },
      { module_id: 'm90002', title_en: null, section_num: '2' },
    ]);

    // idempotent second --db run: sections NOT duplicated AND the appendix
    // chapter row NOT duplicated (insert-if-missing guard).
    await runBackfill({ book: SLUG, db: true, booksDir: tmpBooks });
    expect(countSections(db, SLUG, -1)).toBe(2);
    expect(countAppendixChapters(db, SLUG)).toBe(1);

    // fail-loud on unreadable collection-order.json
    await expect(runBackfill({ book: BROKEN, db: true, booksDir: tmpBooks })).rejects.toThrow();
    // ... and the failure must not have written a partial row for BROKEN.
    expect(countAppendixChapters(db, BROKEN)).toBe(0);
    expect(countSections(db, BROKEN, -1)).toBe(0);
  });

  it('rolls back the whole book atomically when a section INSERT collides mid-transaction', async () => {
    const { runBackfill } = await import('../backfill-appendix-sections.js');

    // Before: 1 pre-seeded section row ('mOLD' @ section_num='1'), NO
    // appendix chapter row yet.
    expect(countAppendixChapters(db, ROLLBACK)).toBe(0);
    expect(countSections(db, ROLLBACK, -1)).toBe(1);

    // 'mNEW' also wants section_num='1' (its collection-order.json position
    // is 0-indexed → String(0+1) = '1'), colliding with the pre-seeded
    // 'mOLD' row on book_sections' UNIQUE(book_id, chapter_num, section_num).
    await expect(runBackfill({ book: ROLLBACK, db: true, booksDir: tmpBooks })).rejects.toThrow();

    // If the chapter-row insert-if-missing were NOT wrapped in the same
    // transaction as the colliding section insert, it would have committed
    // on its own (autocommit) before the section INSERT threw, leaving a
    // stray -1 chapter row. Asserting it's still 0 proves the whole book's
    // writes rolled back atomically, not just "nothing was attempted."
    expect(countAppendixChapters(db, ROLLBACK)).toBe(0);
    // The pre-seeded row survives (it was never part of this transaction);
    // the failed 'mNEW' insert did not get committed either.
    expect(countSections(db, ROLLBACK, -1)).toBe(1);
  });
});
