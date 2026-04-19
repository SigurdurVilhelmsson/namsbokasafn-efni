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
  let normalized = cnxml.replace(/<m:math[\s\S]*?<\/m:math>/g, '<m:math/>');
  // Collapse nested emphasis of same type: <emphasis X><emphasis X> → <emphasis X>
  // OpenStax source occasionally has redundant nesting that flattens during translation.
  // Renders identically — not a real fidelity difference.
  normalized = normalized.replace(/<emphasis([^>]*)><emphasis\1>/g, '<emphasis$1>');
  normalized = normalized.replace(/<\/emphasis><\/emphasis>/g, '</emphasis>');
  const counts = new Map();
  const matches = normalized.matchAll(/<([a-zA-Z][a-zA-Z0-9:]*?)[\s>/]/g);
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
    { name: 'report', flags: ['--report'], type: 'boolean', default: false },
    { name: 'annotate', flags: ['--annotate'], type: 'boolean', default: false },
  ]);
}

/**
 * Write a fidelity report JSON file for a module.
 * Stored alongside the translated CNXML for the editor interface to read.
 */
function writeReport(transPath, moduleId, chapterDir, diffs) {
  const reportPath = transPath.replace('.cnxml', '-fidelity.json');
  const report = {
    moduleId,
    chapter: chapterDir,
    timestamp: new Date().toISOString(),
    perfect: diffs.length === 0,
    discrepancies: diffs.map((d) => ({
      tag: d.tag,
      source: d.source,
      translated: d.translated,
      diff: d.diff,
      direction: d.diff > 0 ? 'overproduction' : 'loss',
    })),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

/**
 * Add XML comment annotation to the translated CNXML with fidelity warnings.
 * Inserted after the opening <document> tag so it's visible at the top of the file.
 */
function annotateTranslatedCnxml(transPath, moduleId, diffs) {
  let cnxml = fs.readFileSync(transPath, 'utf8');

  // Remove any existing fidelity annotation
  cnxml = cnxml.replace(/\n<!-- FIDELITY-WARNING:[\s\S]*?-->\n/g, '');

  if (diffs.length > 0) {
    const lines = [
      `<!-- FIDELITY-WARNING: ${moduleId} has ${diffs.length} structural discrepancy(ies)`,
    ];
    for (const d of diffs) {
      const dir = d.diff > 0 ? 'overproduction' : 'loss';
      lines.push(
        `  ${d.tag}: source=${d.source} translated=${d.translated} (${d.diff > 0 ? '+' : ''}${d.diff} ${dir})`
      );
    }
    lines.push('  Review needed before publication. Run cnxml-fidelity-check.js for details.');
    lines.push('-->');
    const annotation = lines.join('\n');

    // Insert after <document ...>
    cnxml = cnxml.replace(/(<document[^>]*>)/, `$1\n${annotation}`);
    fs.writeFileSync(transPath, cnxml, 'utf8');
  }
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
  --report            Write per-module JSON fidelity reports alongside translated CNXML
  --annotate          Add XML comment warnings to translated CNXML files with discrepancies
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

      // Write per-module fidelity report if requested
      if (args.report) {
        writeReport(transPath, mod.moduleId, chapterDir, diffs);
      }

      // Annotate translated CNXML with fidelity warnings if requested
      if (args.annotate) {
        annotateTranslatedCnxml(transPath, mod.moduleId, diffs);
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
