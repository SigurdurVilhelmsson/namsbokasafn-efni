#!/usr/bin/env node

/**
 * cnxml-fidelity-check.js — Compare source vs translated CNXML tag structure
 *
 * Counts opening tags by element name in both source and translated CNXML
 * files, reports any differences. Used to verify that the extract→translate→inject
 * pipeline preserves all CNXML structural elements.
 *
 * Usage:
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --module m68664
 *   node tools/cnxml-fidelity-check.js --book efnafraedi-2e
 *
 * Exit code 0 if identical, 1 if discrepancies found.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';

let BOOKS_DIR = 'books/efnafraedi-2e';

// ─── Core Comparison ────────────────────────────────────────────────

/**
 * Count opening tags by element name in CNXML content.
 * Excludes content inside MathML blocks (which are opaque and should
 * be compared separately, not as individual tags).
 */
function countTags(cnxml) {
  // Strip MathML blocks before counting — they are preserved as-is
  // and contain m:math, m:mrow, m:mo etc. that inflate counts
  const withoutMath = cnxml.replace(/<m:math[\s\S]*?<\/m:math>/g, '<m:math/>');
  const counts = new Map();
  const matches = withoutMath.matchAll(/<([a-zA-Z][a-zA-Z0-9:]*?)[\s>/]/g);
  for (const m of matches) {
    const tag = m[1];
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}

/**
 * Compare tag counts between source and translated CNXML.
 * Returns array of { tag, source, translated, diff } for differences.
 */
export function compareTagCounts(sourceCnxml, translatedCnxml) {
  const sourceCounts = countTags(sourceCnxml);
  const translatedCounts = countTags(translatedCnxml);

  const allTags = new Set([...sourceCounts.keys(), ...translatedCounts.keys()]);
  const diffs = [];

  for (const tag of [...allTags].sort()) {
    const s = sourceCounts.get(tag) || 0;
    const t = translatedCounts.get(tag) || 0;
    if (s !== t) {
      diffs.push({ tag, source: s, translated: t, diff: t - s });
    }
  }

  return diffs;
}

// ─── CLI ────────────────────────────────────────────────────────────

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function discoverChapters(bookDir) {
  const sourceDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((d) => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.match(/^m\d+\.cnxml$/))
    .sort()
    .map((f) => ({ moduleId: f.replace('.cnxml', ''), filename: f }));
}

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
  ]);
}

function printHelp() {
  console.log(`
cnxml-fidelity-check.js — Compare source vs translated CNXML structure

Counts XML elements in source and translated files, reports differences.
Exit code 0 if identical, 1 if discrepancies found.

Usage:
  node tools/cnxml-fidelity-check.js --book <slug> --chapter <num>
  node tools/cnxml-fidelity-check.js --book <slug> --chapter <num> --module <id>
  node tools/cnxml-fidelity-check.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --track <name>      Translation track (default: mt-preview)
  -v, --verbose       Show perfect modules too
  -h, --help          Show this help
`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.module && !args.chapter) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = args.chapter ? [formatChapter(args.chapter)] : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${BOOKS_DIR}/01-source/`);
    process.exit(1);
  }

  let totalDiscrepancies = 0;
  let modulesChecked = 0;
  let modulesWithDiffs = 0;
  let modulesPerfect = 0;
  let modulesSkipped = 0;

  for (const chapterDir of chapters) {
    const sourceDir = path.join(BOOKS_DIR, '01-source', chapterDir);
    const transDir = path.join(BOOKS_DIR, '03-translated', args.track, chapterDir);

    let modules = discoverModules(sourceDir);
    if (args.module) {
      modules = modules.filter((m) => m.moduleId === args.module);
    }

    for (const mod of modules) {
      const sourcePath = path.join(sourceDir, mod.filename);
      const transPath = path.join(transDir, mod.filename);

      if (!fs.existsSync(transPath)) {
        modulesSkipped++;
        if (args.verbose)
          console.log(`${chapterDir}/${mod.moduleId}: SKIPPED (no translated file)`);
        continue;
      }

      const sourceCnxml = fs.readFileSync(sourcePath, 'utf8');
      const translatedCnxml = fs.readFileSync(transPath, 'utf8');
      const diffs = compareTagCounts(sourceCnxml, translatedCnxml);

      modulesChecked++;

      if (diffs.length === 0) {
        modulesPerfect++;
        if (args.verbose) console.log(`${chapterDir}/${mod.moduleId}: PERFECT`);
      } else {
        modulesWithDiffs++;
        const totalDiff = diffs.reduce((s, d) => s + Math.abs(d.diff), 0);
        totalDiscrepancies += totalDiff;
        console.log(`${chapterDir}/${mod.moduleId}: ${diffs.length} discrepancy(ies)`);
        for (const d of diffs) {
          console.log(
            `  ${d.tag}: ${d.source} → ${d.translated} (${d.diff > 0 ? '+' : ''}${d.diff})`
          );
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Checked: ${modulesChecked} modules`);
  console.log(`Perfect: ${modulesPerfect}`);
  console.log(`With discrepancies: ${modulesWithDiffs}`);
  console.log(`Skipped: ${modulesSkipped}`);
  console.log(`Total discrepancies: ${totalDiscrepancies}`);

  process.exit(totalDiscrepancies > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
