#!/usr/bin/env node
/**
 * generate-tm.js — thin ESM CLI over tools/lib/tm-export.cjs.
 * Pairing + serialization live in the boundary lib so the server route
 * (CommonJS) can share one code path. See docs/superpowers/specs/2026-07-20-item21-*.
 *
 * Usage:
 *   node tools/generate-tm.js --book efnafraedi-2e
 *   node tools/generate-tm.js --book efnafraedi-2e --chapter 3
 *   node tools/generate-tm.js --book efnafraedi-2e --dry-run --verbose
 *   node tools/generate-tm.js --book efnafraedi-2e --out /tmp/efna.tmx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  TOOL_NAME,
  _setTestBooksDir,
} from './lib/tm-export.cjs';

// CLI-local default write location only (not the lib's BOOKS_DIR). Task 3
// removes this once defaultOutPath moves to the lib and runExport takes
// over writing.
const BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

// ─── CLI ──────────────────────────────────────────────────────────────

const OUT_OPTION = { name: 'out', flags: ['--out', '-o'], type: 'string', default: null };
const DRY_RUN_OPTION = {
  name: 'dryRun',
  flags: ['--dry-run', '-n'],
  type: 'boolean',
  default: false,
};

function defaultOutPath(book) {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(BOOKS_DIR, book, 'tm', `${book}-${date}.tmx`);
}

function printHelp() {
  console.log(`
${TOOL_NAME} - Generate a TMX translation memory from paired segment files

Pairs EN source segments (02-for-mt/) with human-reviewed IS segments
(03-faithful-translation/) by their SEG marker id, strips inline markers,
and emits a TMX 1.4b file. No Matecat Align, no manual alignment step.

Usage:
  node tools/generate-tm.js --book <book> [--chapter N] [--out <path>] [--dry-run]

Options:
  --book <slug>      Book slug (default: efnafraedi-2e)
  --chapter <N>      Limit to one chapter (number or 'appendices'); default all
  --out, -o <path>   Output TMX path (default: books/<book>/tm/<book>-<date>.tmx)
  --dry-run, -n      Report what would be written without writing
  --verbose, -v      Show per-module pairing stats
  -h, --help         Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    OUT_OPTION,
    DRY_RUN_OPTION,
  ]);

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);

  const book = args.book;
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const { tus, modules, totals } = generateTm(book, { chapter: args.chapter });

  if (args.verbose) {
    console.log(`\nPer-module pairing (${book}):`);
    for (const m of modules) {
      if (m.skipped) {
        console.log(`  ch${m.chapter} ${m.module}: SKIPPED (${m.skipped})`);
        continue;
      }
      const extras = [];
      if (m.missingIs) extras.push(`missingIs=${m.missingIs}`);
      if (m.emptyAfterStrip) extras.push(`empty=${m.emptyAfterStrip}`);
      if (m.identical) extras.push(`identical=${m.identical}`);
      if (m.orphanIs) extras.push(`orphanIs=${m.orphanIs}`);
      console.log(
        `  ch${m.chapter} ${m.module}: ${m.pairs} TU${extras.length ? '  [' + extras.join(' ') + ']' : ''}`
      );
    }
  }

  console.log('\n' + '='.repeat(56));
  console.log(`Book:               ${book}`);
  console.log(`Chapter filter:     ${args.chapter ?? '(all)'}`);
  console.log(`Modules paired:     ${totals.modules}`);
  console.log(`Translation units:  ${totals.pairs}`);
  if (totals.missingIs) console.log(`  segments missing IS side:     ${totals.missingIs}`);
  if (totals.emptyAfterStrip)
    console.log(`  empty after stripping:        ${totals.emptyAfterStrip}`);
  if (totals.identical) console.log(`  identical EN/IS (kept):       ${totals.identical}`);
  if (totals.orphanIs) console.log(`  IS segments with no EN match: ${totals.orphanIs}`);
  if (totals.skippedNoEn) console.log(`  modules skipped (no EN):      ${totals.skippedNoEn}`);

  if (totals.pairs === 0) {
    console.error(
      '\nNo translation units produced. Is there reviewed content in 03-faithful-translation/?'
    );
    process.exit(1);
  }

  const outPath = args.out || defaultOutPath(book);
  const tmx = buildTmx(tus, { date: new Date() });

  if (args.dryRun) {
    console.log(
      `\nDRY RUN — would write ${tus.length} TUs (${tmx.length} bytes) to:\n  ${outPath}`
    );
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, tmx, 'utf-8');
  console.log(`\nWrote ${tus.length} TUs to:\n  ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
  _setTestBooksDir,
};
