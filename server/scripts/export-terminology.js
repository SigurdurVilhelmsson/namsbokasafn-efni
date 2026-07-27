#!/usr/bin/env node

/**
 * Export each book's glossary from the terminology DB to
 * books/<book>/glossary/glossary-unified.json — the file tools/api-translate.js
 * feeds to Málstaður as the MT glossary (Unit 6.1).
 *
 * WIRING (register C14, 2026-07-27). This script had ZERO callers, and its
 * previous header claimed "the 2h git-backup already stages books/, so the
 * refreshed export reaches git for free". That was FALSE — git-backup.sh's
 * PATHSPECS had no books/*\/glossary/ entry — so even a scheduled run would
 * have written to production's disk and never reached the dev checkout where
 * api-translate.js actually primes MT.
 *
 * ⚠️ So this script's output reaches a reader ONLY if scripts/git-backup.sh
 * both invokes it AND stages books/*\/glossary/. Making this script correct is
 * half the job; check that file for the other half. (Stated as the standing
 * requirement rather than as "already done" on purpose — the sentence this
 * replaces was a status claim that went stale and hid the gap for months.)
 *
 * SAFE TO RUN UNATTENDED because of two rules in lib/glossaryExportDecision.js:
 * write-if-changed (the `generated` stamp alone must not dirty the file every
 * 2h) and a shrink guard (the committed exports came from merge-glossary.js,
 * so this exporter SWAPS producers; a catastrophic drop in approved terms is
 * refused rather than committed).
 *
 * Exit code is the health contract: 0 only when every book resolved
 * healthily, which is also exactly when the heartbeat is written.
 *
 *   node server/scripts/export-terminology.js              # all glossary-bearing books
 *   node server/scripts/export-terminology.js --book efnafraedi-2e
 *   node server/scripts/export-terminology.js --dry-run
 *   node server/scripts/export-terminology.js --force      # accept a shrink
 */

const fs = require('fs');
const path = require('path');
const terminologyService = require('../services/terminologyService');
const { countApproved, sameTerms, shrinkVerdict } = require('../lib/glossaryExportDecision');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/** Heartbeat consumed by GET /api/health — see server/lib/glossaryExportHealth.js. */
const HEARTBEAT_REL = path.join('pipeline-output', '.last-glossary-export');

function listBooks(booksDir = BOOKS_DIR) {
  try {
    return fs
      .readdirSync(booksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Existing export, or null when there is genuinely no baseline to protect.
 *
 * ⚠️ Only ENOENT and a parse failure may return null. Every other read error —
 * EACCES above all — MUST propagate. A null baseline tells shrinkVerdict there
 * is nothing to lose, so it permits the write: swallowing a permissions fault
 * here would stand the shrink guard down on exactly the file it exists to
 * protect, overwrite it, and still write the heartbeat, leaving /api/health
 * green. That is the catastrophe the guard was built for, arriving through the
 * one door it was not watching.
 */
function readExisting(outPath) {
  let raw;
  try {
    raw = fs.readFileSync(outPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null; // no file yet — writing is correct
    throw err; // caught per-book by the caller, counted as a failure
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null; // corrupt file — no usable baseline, and replacing it is an improvement
  }
}

function writeHeartbeat(projectRoot) {
  const p = path.join(projectRoot, HEARTBEAT_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, new Date().toISOString() + '\n', 'utf-8');
}

/**
 * @param {object} [options]
 * @param {string} [options.booksDir]
 * @param {string} [options.projectRoot]
 * @param {(bookSlug: string) => object} [options.exportFn] - injected in tests
 * @param {string|null} [options.book] - a single book, else all glossary-bearing ones
 * @param {boolean} [options.force] - write even when the shrink guard objects
 * @param {boolean} [options.dryRun] - write neither export nor heartbeat
 * @returns {number} exit code: 0 iff every book resolved healthily
 */
function runGlossaryExport({
  booksDir = BOOKS_DIR,
  projectRoot = PROJECT_ROOT,
  exportFn = terminologyService.exportBookGlossary,
  book = null,
  force = false,
  dryRun = false,
  log = console.log,
  logError = console.error,
} = {}) {
  // Only export books that already have a glossary directory — i.e. registered,
  // glossary-bearing books.
  //
  // The named-book path is filtered TOO, not exempted: the write path below
  // mkdirSync's recursively, so a typo'd slug would otherwise CREATE
  // books/<typo>/glossary/ and write an empty export into it, with the shrink
  // guard powerless because a brand new path has no baseline to compare
  // against.
  const hasGlossaryDir = (b) => fs.existsSync(path.join(booksDir, b, 'glossary'));
  const books = book ? [book].filter(hasGlossaryDir) : listBooks(booksDir).filter(hasGlossaryDir);

  if (book && books.length === 0) {
    logError(
      `${book}: no glossary directory at ${path.join(booksDir, book, 'glossary')} — refusing`
    );
    return 1;
  }

  if (books.length === 0) {
    // Not vacuously healthy: an empty set means book discovery is broken.
    // Reporting success here would let a mis-resolved booksDir read green
    // forever, which is precisely what the health check exists to catch.
    logError(
      'No glossary-bearing books found — book discovery is broken, refusing to report healthy'
    );
    return 1;
  }

  let failures = 0;

  for (const b of books) {
    const outDir = path.join(booksDir, b, 'glossary');
    const outPath = path.join(outDir, 'glossary-unified.json');

    let next;
    try {
      next = exportFn(b);
    } catch (err) {
      logError(`${b}: export failed — ${err.message}`);
      failures++;
      continue;
    }

    let prev;
    try {
      prev = readExisting(outPath);
    } catch (err) {
      logError(`${b}: could not read existing export — ${err.message}`);
      failures++;
      continue;
    }

    if (sameTerms(prev, next)) {
      log(`${b}: unchanged (${countApproved(next)} approved) — not rewritten`);
      continue;
    }

    const verdict = shrinkVerdict(prev, next);
    if (verdict.refuse && !force) {
      logError(
        `${b}: REFUSING to write — approved terms would fall ${verdict.prevApproved} → ` +
          `${verdict.nextApproved}. The committed file may come from a different producer ` +
          `(tools/merge-glossary.js). Investigate, then pass --force if the shrink is intended.`
      );
      failures++;
      continue;
    }

    if (dryRun) {
      log(
        `[dry-run] ${b}: would write ${next.terms.length} terms ` +
          `(${verdict.nextApproved} approved, was ${verdict.prevApproved})`
      );
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    log(
      `${b}: wrote ${next.terms.length} terms (${verdict.nextApproved} approved, ` +
        `was ${verdict.prevApproved}) → ${outPath}`
    );
  }

  if (failures > 0) return 1;
  if (!dryRun) writeHeartbeat(projectRoot);
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  let book = null;
  let dryRun = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') book = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--force') force = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        'Usage: node server/scripts/export-terminology.js [--book <slug>] [--dry-run] [--force]'
      );
      process.exit(0);
    }
  }

  process.exit(runGlossaryExport({ book, dryRun, force }));
}

if (require.main === module) {
  main();
}

module.exports = { listBooks, runGlossaryExport };
