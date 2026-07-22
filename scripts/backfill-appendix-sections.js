#!/usr/bin/env node
/**
 * Backfill appendix (chapter_num=-1) book_chapters + book_sections rows for
 * ALREADY-registered books (C1b, Task 2). Task 1's registerBook() fix
 * (server/services/bookRegistration.js insertAppendixSections) only covers
 * books registered from now on — a book registered before that fix has no
 * -1 rows at all, even if its 01-source/appendices content has existed on
 * disk the whole time. This script is the one-time (but safe-to-rerun)
 * catch-up for those already-registered books.
 *
 * Derivation — ALL from local, already-committed files, never network:
 *   - appendix module ids: <book>/01-source/collection-order.json
 *     `appendixModules` (a flat id list; array position i → section_num =
 *     String(i+1) — FROZEN, matches Task 1's registerBook() format exactly)
 *   - titles: <book>/02-structure/appendices/<id>-structure.json
 *     `.title.text`, or NULL if that file is absent/unreadable/malformed
 *     (parity with how a normal chapter section's title_en can be NULL —
 *     one module's missing structure file must not abort the whole book)
 *
 * Per-book gate: has a 01-source/appendices OR 02-for-mt/appendices
 * directory. A book with NEITHER is simply skipped (most books have no
 * appendices — not an error). This is NOT gated on "book_sections has no -1
 * rows yet": every qualifying book is reprocessed on every run, relying on
 * Task 1's insertAppendixSections() being itself add-only + idempotent
 * (skips a section whose (book_id, chapter_num=-1, module_id) row already
 * exists). That means a book whose committed appendix list grows between
 * runs (a new appendix module added to collection-order.json) still picks
 * up the new module(s) on the next backfill, instead of being permanently
 * skipped because it already had *some* -1 rows.
 *
 * Each book's writes (the appendix book_chapters insert-if-missing, plus the
 * insertAppendixSections call) are wrapped in ONE db.transaction(). Reason:
 * book_sections has a UNIQUE(book_id, chapter_num, section_num) constraint
 * (migration 003), and insertAppendixSections's own guard keys on
 * module_id — so if a book's committed appendix list ever changed between
 * runs in a way that collided a NEW module onto an already-occupied
 * section_num, the raw INSERT would throw SQLITE_CONSTRAINT. Wrapping in a
 * transaction makes that throw roll back the WHOLE book's writes cleanly
 * (fail-safe: no partial write) instead of leaving it half-registered.
 *
 * Fails loud (throws, aborting the whole run) for a book that HAS an
 * appendices dir but whose collection-order.json is missing or unparseable —
 * a book flagged as "has appendices" must have a readable manifest to derive
 * sections from; silently skipping would leave it perpetually
 * un-backfilled with no signal that anything is wrong.
 *
 * Dry-run by default (writes nothing — not even opening the DB for write;
 * see `runBackfill`'s readonly connection below). Pass --db to actually
 * insert.
 *
 * Usage:
 *   node scripts/backfill-appendix-sections.js                  # dry run, every registered book
 *   node scripts/backfill-appendix-sections.js --db              # actually write, every registered book
 *   node scripts/backfill-appendix-sections.js --book <slug>      # scope to one book (dry run)
 *   node scripts/backfill-appendix-sections.js --book <slug> --db # scope to one book, write
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Read `<bookDir>/01-source/collection-order.json` and return its
 * `appendixModules` array. Throws (fail-loud) if the file is missing,
 * unparseable, or lacks an array `appendixModules` field — this is only
 * called for a book that already passed the `hasAppendicesDir` gate, so a
 * broken/missing manifest here is a real data problem, not a "no
 * appendices" case.
 * @param {string} bookDir
 * @returns {string[]}
 */
function readAppendixModuleIds(bookDir) {
  const p = path.join(bookDir, '01-source', 'collection-order.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${p}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Cannot parse ${p}: ${err.message}`);
  }
  if (!Array.isArray(data.appendixModules)) {
    throw new Error(`${p}: missing or non-array "appendixModules"`);
  }
  return data.appendixModules;
}

/**
 * Read a module's EN title from its
 * 02-structure/appendices/<id>-structure.json, or null if that file is
 * absent/unreadable/malformed. NOT part of the fail-loud path — a missing
 * title for one appendix module is normal (parity with chapter sections,
 * whose title_en can also be NULL) and must not abort the whole book.
 * @param {string} bookDir
 * @param {string} moduleId
 * @returns {string|null}
 */
function readTitleEn(bookDir, moduleId) {
  const p = path.join(bookDir, '02-structure', 'appendices', `${moduleId}-structure.json`);
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data?.title?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} bookDir
 * @returns {boolean}
 */
function hasAppendicesDir(bookDir) {
  return (
    fs.existsSync(path.join(bookDir, '01-source', 'appendices')) ||
    fs.existsSync(path.join(bookDir, '02-for-mt', 'appendices'))
  );
}

/**
 * Derive the appendix sections for a book from local committed files.
 * @param {string} bookDir
 * @returns {Array<{module_id: string, section_num: string, title_en: string|null}>}
 */
function deriveAppendixSections(bookDir) {
  const ids = readAppendixModuleIds(bookDir);
  return ids.map((id, i) => ({
    module_id: id,
    section_num: String(i + 1),
    title_en: readTitleEn(bookDir, id),
  }));
}

/**
 * Module ids already present as appendix (chapter_num=-1) book_sections rows
 * for this book — used to preview (dry-run) or diff against the derived
 * section list.
 * @param {import('better-sqlite3').Database} db
 * @param {number} bookId
 * @returns {Set<string>}
 */
function existingAppendixModuleIds(db, bookId) {
  return new Set(
    db
      .prepare(`SELECT module_id FROM book_sections WHERE book_id = ? AND chapter_num = -1`)
      .all(bookId)
      .map((r) => r.module_id)
  );
}

/**
 * Ensure an appendix (chapter_num=-1) book_chapters row exists for bookId;
 * return its id. Insert-if-missing so re-running never violates
 * book_chapters' UNIQUE(book_id, chapter_num) constraint — this is the
 * mechanism that keeps a second `--db` run at exactly one -1 chapter row.
 * @param {import('better-sqlite3').Database} db
 * @param {number} bookId
 * @param {number} sectionCount
 * @returns {number} chapterId
 */
function ensureAppendixChapter(db, bookId, sectionCount) {
  const existing = db
    .prepare(`SELECT id FROM book_chapters WHERE book_id = ? AND chapter_num = -1`)
    .get(bookId);
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO book_chapters (book_id, chapter_num, title_en, title_is, section_count, status)
       VALUES (?, -1, 'Appendices', 'Viðaukar', ?, 'not_started')`
    )
    .run(bookId, sectionCount);
  return result.lastInsertRowid;
}

/**
 * Run the backfill. Testable entry point (imported directly, no CLI
 * spawning, mirroring scripts/validate-status.js's listChapterDirsForBook
 * pattern).
 *
 * @param {object} [opts]
 * @param {string} [opts.book] - Restrict to one registered book's slug. Omit
 *   to process every registered book. Throws if the slug isn't registered.
 * @param {boolean} [opts.db=false] - false (default) = dry run: compute and
 *   print what WOULD be inserted, write nothing at all (DB opened
 *   read-only). true = actually insert.
 * @param {string} [opts.booksDir] - Root of the books/ tree. Defaults to the
 *   real repo books/ dir, resolved via import.meta.url (never
 *   process.cwd()). Test seam.
 * @returns {Promise<Array<{slug: string, skippedNoAppendices?: boolean, wouldInsert?: number, total?: number, inserted?: number}>>}
 */
export async function runBackfill({ book, db: writeMode = false, booksDir } = {}) {
  const resolveDbPath = require(path.join(REPO_ROOT, 'server', 'lib', 'dbPath.js'));
  const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));
  const { insertAppendixSections } = require(
    path.join(REPO_ROOT, 'server', 'services', 'bookRegistration.js')
  );

  const BOOKS_DIR = booksDir || path.join(REPO_ROOT, 'books');
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No database found at ${dbPath}`);
  }

  // Dry-run opens read-only: belt-and-suspenders on top of "the code path
  // just never calls INSERT" — a readonly connection makes "dry-run writes
  // nothing" true at the SQLite layer too, not just by code review.
  const dbConn = new Database(dbPath, writeMode ? {} : { readonly: true });
  const summary = [];
  try {
    const rows = book
      ? dbConn.prepare(`SELECT id, slug FROM registered_books WHERE slug = ?`).all(book)
      : dbConn.prepare(`SELECT id, slug FROM registered_books`).all();

    if (book && rows.length === 0) {
      throw new Error(`No registered book found with slug "${book}"`);
    }

    for (const { id: bookId, slug } of rows) {
      const bookDir = path.join(BOOKS_DIR, slug);
      if (!hasAppendicesDir(bookDir)) {
        summary.push({ slug, skippedNoAppendices: true });
        continue;
      }

      // Fail-loud parse happens regardless of dry-run/--db, so a broken
      // collection-order.json is surfaced even on a read-only dry-run —
      // exactly the case this script exists to catch before it's too late.
      const sections = deriveAppendixSections(bookDir);
      const existingIds = existingAppendixModuleIds(dbConn, bookId);
      const wouldInsert = sections.filter((s) => !existingIds.has(s.module_id));

      if (!writeMode) {
        summary.push({ slug, wouldInsert: wouldInsert.length, total: sections.length });
        if (wouldInsert.length > 0) {
          console.log(
            `[dry-run] ${slug}: would insert ${wouldInsert.length} appendix section(s): ` +
              wouldInsert.map((s) => s.module_id).join(', ')
          );
        } else {
          console.log(`[dry-run] ${slug}: appendix sections already present, nothing to insert.`);
        }
        continue;
      }

      const inserted = dbConn.transaction(() => {
        const chapterId = ensureAppendixChapter(dbConn, bookId, sections.length);
        return insertAppendixSections(dbConn, { bookId, chapterId, sections });
      })();

      summary.push({ slug, inserted });
      console.log(`${slug}: inserted ${inserted} appendix section(s).`);
    }
  } finally {
    dbConn.close();
  }

  if (!writeMode) {
    console.log('\nDRY RUN — nothing was written. Re-run with --db to actually insert these rows.');
  } else {
    console.log(`\nDone. Processed ${summary.length} book(s).`);
  }

  return summary;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { db: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') opts.db = true;
    else if (argv[i] === '--book') opts.book = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  try {
    await runBackfill(opts);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

// Only run as a CLI when executed directly (`node
// scripts/backfill-appendix-sections.js`), not when imported for
// `runBackfill` (e.g. by tests) — mirrors scripts/validate-status.js.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main();
}
