'use strict';
/**
 * Stray MT edit-lock sweep for the E2E run (§C118 (9)).
 *
 * The Playwright suite saves segment edits against the REAL book efnafraedi-2e,
 * and segmentEditorService's first-edit hook writes a "<module>-segments.locked"
 * marker beside that module's MT output (tools/lib/mt-lock.cjs). Each run seeds a
 * fresh DB, so "first edit" fires on every run. Left behind, that marker makes
 * api-translate's mtRunDecision return "locked-skip" for the module -- silently
 * excluding it from a paid re-MT with every exit code green. Worse,
 * scripts/git-backup.sh deliberately stages these markers, so on a tree running
 * both the suite and that cron the stray gets COMMITTED and excludes the module
 * for everyone.
 *
 * TWO RULES, AND THE SECOND IS THE ONE THAT MATTERS:
 *   1. Sweep what THIS RUN created, anywhere under books/.
 *   2. Never delete a marker this run did not create. A pre-existing marker is a
 *      real editorial lock, and clobbering an edited baseline is precisely what
 *      the marker exists to prevent -- isMtLocked treats even an UNREADABLE
 *      marker as locked rather than risk it.
 *
 * WHY THE SNAPSHOT CARRIES A RUN TOKEN. An adversarial review of the first
 * version found the fail-safe did not engage: the snapshot lived at one fixed
 * path that OUTLIVED the run, so "global-setup never ran" yielded the PREVIOUS
 * run's list rather than null -- and a lock a human created between the two runs
 * was absent from it, hence classified as this run's litter and DELETED. Exactly
 * the destructive direction rule 2 exists to forbid. So setup mints a token,
 * puts it in the payload AND in the environment, and teardown accepts the
 * snapshot only if the two agree, then consumes the file. Any disagreement --
 * no setup, stale file, separate process -- yields null, and null means
 * "sweep the fixture book only". The failure mode of every assumption here is
 * the SAFE direction, which is the property to preserve if you change this.
 *
 * The fixture book is exempt from rule 2 -- no human edits it, so an
 * unconditional sweep there loses nothing and preserves global-teardown's
 * documented cleanup of markers stranded by a previous ABORTED run.
 */
const fs = require('fs');
const path = require('path');
const { mtLockPathFor } = require('../../../tools/lib/mt-lock.cjs');

// DERIVED, never restated: tools/lib/mt-lock.cjs owns the marker convention, and
// a sweep that hard-codes the suffix goes blind the day the owner renames it.
const LOCK_PROBE = '__probe__';
const LOCK_SUFFIX = mtLockPathFor(`${LOCK_PROBE}-segments.is.md`).slice(LOCK_PROBE.length);

const MT_OUTPUT_DIR = '02-mt-output';
const FIXTURE_BOOK = '__e2e-fixture__';
const RUN_TOKEN_ENV = 'E2E_MT_LOCK_RUN';

/** Recursively collect absolute paths of lock markers under `dir`. */
function collect(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a book with no 02-mt-output is ordinary, not an error
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(abs, out);
    else if (entry.isFile() && entry.name.endsWith(LOCK_SUFFIX)) out.push(abs);
  }
}

/**
 * Every MT edit-lock marker under `booksDir`, as booksDir-relative POSIX paths,
 * sorted. Depth-agnostic beneath each book's 02-mt-output/ on purpose: the
 * chapter-dir convention is not this module's business to enumerate.
 *
 * THROWS if `booksDir` itself cannot be enumerated. That is deliberate and it is
 * the difference between "no markers exist" and "I could not look" -- the former
 * authorizes deletion, the latter must not. Returning [] for both was a
 * fail-OPEN bug the review caught.
 * @param {string} booksDir
 * @returns {string[]}
 */
function listLockFiles(booksDir) {
  const books = fs.readdirSync(booksDir, { withFileTypes: true }); // may throw -- see above
  const abs = [];
  for (const book of books) {
    if (!book.isDirectory()) continue;
    collect(path.join(booksDir, book.name, MT_OUTPUT_DIR), abs);
  }
  // Normalise to POSIX so a snapshot is comparable regardless of who wrote it.
  return abs.map((p) => path.relative(booksDir, p).split(path.sep).join('/')).sort();
}

/** True for a booksDir-relative path inside the E2E fixture book. */
function isFixturePath(rel) {
  return rel.split('/')[0] === FIXTURE_BOOK;
}

/**
 * Remove markers this run created; keep the rest.
 * @param {string} booksDir
 * @param {string[]|null} snapshot booksDir-relative paths present BEFORE the run.
 *   `null` means "unknown" -- fail safe, sweep the fixture book only.
 * @returns {{removed: string[], kept: string[], failed: string[]}}
 */
function sweepStrayLocks(booksDir, snapshot) {
  const known = Array.isArray(snapshot) ? new Set(snapshot) : null;
  const removed = [];
  const kept = [];
  const failed = [];
  let present;
  try {
    present = listLockFiles(booksDir);
  } catch {
    return { removed, kept, failed }; // cannot look => nothing to do, and nothing deleted
  }
  for (const rel of present) {
    // Unknown snapshot => we cannot prove we created it => keep it.
    const ourLitter = known !== null && !known.has(rel);
    if (!isFixturePath(rel) && !ourLitter) {
      kept.push(rel);
      continue;
    }
    try {
      fs.unlinkSync(path.join(booksDir, rel));
      removed.push(rel);
    } catch {
      // A marker we MEANT to remove and could not is its own outcome. Reporting
      // it as "kept" would label a failed cleanup as a deliberate one.
      failed.push(rel);
    }
  }
  return { removed, kept, failed };
}

/** Where the pre-run snapshot is persisted. Gitignored; survives across processes. */
function snapshotPathFor(projectRoot) {
  return path.join(projectRoot, 'pipeline-output', '.e2e-mt-lock-snapshot.json');
}

/** A token identifying one run. Uniqueness only has to hold between consecutive runs. */
function mintRunToken() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Persist the pre-run snapshot, stamped with the run token. */
function saveSnapshot(file, lockFiles, token) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token, files: lockFiles }, null, 2) + '\n', 'utf8');
}

/**
 * Read the pre-run snapshot, but ONLY if it belongs to `expectedToken`.
 * Returns `null` when absent, unusable, or from another run -- which
 * sweepStrayLocks reads as "keep everything outside the fixture book".
 * Consumes the file either way: a snapshot is valid for exactly one teardown.
 * @returns {string[]|null}
 */
function loadSnapshot(file, expectedToken) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* nothing to consume */
    }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) return null;
  if (!expectedToken || parsed.token !== expectedToken) return null;
  return parsed.files;
}

module.exports = {
  LOCK_SUFFIX,
  FIXTURE_BOOK,
  RUN_TOKEN_ENV,
  listLockFiles,
  isFixturePath,
  sweepStrayLocks,
  snapshotPathFor,
  mintRunToken,
  saveSnapshot,
  loadSnapshot,
};
