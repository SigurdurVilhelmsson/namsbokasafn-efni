'use strict';
/**
 * Stray MT edit-lock sweep for the E2E run (§C118 ⑨).
 *
 * The Playwright suite saves segment edits against the REAL `efnafraedi-2e`
 * book, and segmentEditorService's first-edit hook writes a `-segments.locked`
 * marker beside that module's MT output (tools/lib/mt-lock.cjs). Each run seeds
 * a fresh DB, so "first edit" fires on every run. Left behind, that marker makes
 * `mtRunDecision` return `locked-skip` for the module — silently excluding it
 * from a paid re-MT, with every exit code green.
 *
 * TWO RULES, AND THE SECOND IS THE ONE THAT MATTERS:
 *   1. Sweep what THIS RUN created, anywhere under books/.
 *   2. Never delete a marker this run did not create. A pre-existing marker is a
 *      real editorial lock, and clobbering an edited baseline is precisely what
 *      the marker exists to prevent — `isMtLocked` treats even an UNREADABLE
 *      marker as locked rather than risk it.
 *
 * Hence the snapshot rather than a blanket delete, and hence the fail-safe: if
 * the snapshot is unavailable (`null`), we cannot prove authorship of anything,
 * so nothing outside the fixture book is touched.
 *
 * The fixture book is exempt from rule 2 — no human edits it, so an
 * unconditional sweep there loses nothing and preserves global-teardown's
 * documented cleanup of markers stranded by a previous ABORTED run (teardown
 * does not execute on a hard kill).
 */
const fs = require('fs');
const path = require('path');

const LOCK_SUFFIX = '-segments.locked';
const MT_OUTPUT_DIR = '02-mt-output';
const FIXTURE_BOOK = '__e2e-fixture__';

/** Recursively collect absolute paths of lock markers under `dir`. */
function collect(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // vanished or unreadable — nothing to sweep
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(abs, out);
    else if (entry.isFile() && entry.name.endsWith(LOCK_SUFFIX)) out.push(abs);
  }
}

/**
 * Every MT edit-lock marker under `booksDir`, as booksDir-relative paths, sorted.
 * Depth-agnostic beneath each book's 02-mt-output/ on purpose: the chapter-dir
 * convention is not this module's business to enumerate.
 * @param {string} booksDir
 * @returns {string[]}
 */
function listLockFiles(booksDir) {
  let books;
  try {
    books = fs.readdirSync(booksDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const abs = [];
  for (const book of books) {
    if (!book.isDirectory()) continue;
    collect(path.join(booksDir, book.name, MT_OUTPUT_DIR), abs);
  }
  return abs.map((p) => path.relative(booksDir, p)).sort();
}

/**
 * Remove markers this run created; keep the rest.
 * @param {string} booksDir
 * @param {string[]|null} snapshot booksDir-relative paths present BEFORE the run.
 *   `null` means "unknown" — fail safe, sweep the fixture book only.
 * @returns {{removed: string[], kept: string[]}}
 */
function sweepStrayLocks(booksDir, snapshot) {
  const known = snapshot === null || snapshot === undefined ? null : new Set(snapshot);
  const removed = [];
  const kept = [];
  for (const rel of listLockFiles(booksDir)) {
    const isFixture = rel.split(path.sep)[0] === FIXTURE_BOOK;
    // Unknown snapshot => we cannot prove we created it => keep it.
    const ourLitter = known !== null && !known.has(rel);
    if (isFixture || ourLitter) {
      try {
        fs.unlinkSync(path.join(booksDir, rel));
        removed.push(rel);
      } catch {
        kept.push(rel); // could not remove; report it rather than lie
      }
    } else {
      kept.push(rel);
    }
  }
  return { removed, kept };
}

/** Where the pre-run snapshot is persisted. Gitignored; survives across processes. */
function snapshotPathFor(projectRoot) {
  return path.join(projectRoot, 'pipeline-output', '.e2e-mt-lock-snapshot.json');
}

/** Persist the pre-run snapshot. Best-effort: never break the run. */
function saveSnapshot(file, lockFiles) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(lockFiles, null, 2) + '\n', 'utf8');
}

/**
 * Read the pre-run snapshot. Returns `null` when absent or unusable, which
 * sweepStrayLocks reads as "keep everything outside the fixture book".
 * @returns {string[]|null}
 */
function loadSnapshot(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = {
  LOCK_SUFFIX,
  FIXTURE_BOOK,
  listLockFiles,
  sweepStrayLocks,
  snapshotPathFor,
  saveSnapshot,
  loadSnapshot,
};
