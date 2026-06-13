#!/usr/bin/env node

/**
 * One-off backfill: seed content-version history for already-applied modules.
 *
 * Context: before the apply-snapshot connection fix, applyApprovedEdits could
 * not record its pre-overwrite snapshot (it wrote on a second DB connection and
 * deadlocked on SQLITE_BUSY inside the apply's IMMEDIATE transaction, then
 * swallowed the error). So modules applied before that fix have a faithful file
 * but an empty `content_versions` history — nothing to revert to.
 *
 * This script seeds **version 1 from the machine-translation baseline**
 * (`02-mt-output/`) for every module that has a faithful file but no snapshots,
 * giving editors a restorable pre-edit baseline. It is:
 *   - idempotent: modules that already have any content_versions rows are
 *     skipped (so re-running is safe, and it never clobbers a real snapshot);
 *   - non-destructive: only inserts; never edits faithful files or the DB's
 *     existing rows;
 *   - dry-run-able: --dry-run reports what it would do without writing.
 *
 * Usage:
 *   node server/scripts/backfill-content-versions.js [--book <slug>] [--dry-run] [-v]
 */

const fs = require('fs');
const path = require('path');

const segmentParser = require('../services/segmentParser');
const contentVersionService = require('../services/contentVersionService');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

function parseArgs(argv) {
  const args = { book: null, dryRun: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '-v' || a === '--verbose') args.verbose = true;
    else if (a === '--book') args.book = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: node server/scripts/backfill-content-versions.js [--book <slug>] [--dry-run] [-v]'
      );
      process.exit(0);
    }
  }
  return args;
}

/** chapter dir name → chapter number used in content_versions (appendices = -1). */
function chapterNumFromDir(chDir) {
  if (chDir === 'appendices') return -1;
  const m = /^ch(\d+)$/.exec(chDir);
  return m ? parseInt(m[1], 10) : null;
}

/** List { chDir, chapter, moduleId } for every faithful module in a book. */
function findFaithfulModules(book, booksDir = BOOKS_DIR) {
  const faithfulRoot = path.join(booksDir, book, '03-faithful-translation');
  if (!fs.existsSync(faithfulRoot)) return [];

  const out = [];
  for (const chDir of fs.readdirSync(faithfulRoot)) {
    const chapter = chapterNumFromDir(chDir);
    if (chapter === null) continue;
    const chPath = path.join(faithfulRoot, chDir);
    if (!fs.statSync(chPath).isDirectory()) continue;
    for (const file of fs.readdirSync(chPath)) {
      const m = /^(m\d+)-segments\.is\.md$/.exec(file);
      if (m) out.push({ chDir, chapter, moduleId: m[1] });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const books = args.book
    ? [args.book]
    : fs.existsSync(BOOKS_DIR)
      ? fs.readdirSync(BOOKS_DIR).filter((b) => fs.statSync(path.join(BOOKS_DIR, b)).isDirectory())
      : [];

  let seeded = 0;
  let skippedExisting = 0;
  let skippedNoMt = 0;
  let segmentsTotal = 0;

  for (const book of books) {
    for (const { chDir, chapter, moduleId } of findFaithfulModules(book)) {
      // Idempotent: never touch a module that already has snapshots.
      if (contentVersionService.getModuleVersions(book, moduleId).length > 0) {
        skippedExisting++;
        if (args.verbose) console.log(`  skip (has history): ${book}/${chDir}/${moduleId}`);
        continue;
      }

      const mtPath = path.join(
        BOOKS_DIR,
        book,
        '02-mt-output',
        chDir,
        `${moduleId}-segments.is.md`
      );
      if (!fs.existsSync(mtPath)) {
        skippedNoMt++;
        if (args.verbose) console.log(`  skip (no MT baseline): ${book}/${chDir}/${moduleId}`);
        continue;
      }

      // Seed version 1 from the MT baseline, unescaping markers to match the
      // editor-facing form a live snapshot would have stored.
      const segments = segmentParser
        .parseSegments(fs.readFileSync(mtPath, 'utf-8'))
        .map((s) => ({
          segmentId: s.segmentId,
          content: segmentParser.unescapeMtMarkers(s.content),
        }))
        .filter((s) => s.content && s.content.trim());

      if (segments.length === 0) {
        skippedNoMt++;
        if (args.verbose) console.log(`  skip (empty MT): ${book}/${chDir}/${moduleId}`);
        continue;
      }

      if (args.dryRun) {
        console.log(`  would seed v1: ${book}/${chDir}/${moduleId} (${segments.length} segments)`);
      } else {
        const { version, segmentsSnapshotted } = contentVersionService.snapshotModule(
          book,
          chapter,
          moduleId,
          segments,
          'backfill'
        );
        console.log(
          `  seeded v${version}: ${book}/${chDir}/${moduleId} (${segmentsSnapshotted} segments)`
        );
        segmentsTotal += segmentsSnapshotted;
      }
      seeded++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`${args.dryRun ? '[DRY RUN] ' : ''}Backfill complete`);
  console.log(`  Modules seeded:            ${seeded}`);
  console.log(`  Skipped (already had history): ${skippedExisting}`);
  console.log(`  Skipped (no MT baseline):  ${skippedNoMt}`);
  if (!args.dryRun) console.log(`  Segments written:          ${segmentsTotal}`);
}

if (require.main === module) {
  main();
}

module.exports = { findFaithfulModules, chapterNumFromDir };
