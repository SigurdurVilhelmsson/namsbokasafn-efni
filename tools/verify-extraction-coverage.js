#!/usr/bin/env node
/**
 * Read-only pre-freeze extraction-coverage checkpoint (campaign item 6b).
 *
 * Walks a book's 02-for-mt × 01-source and, per module, flags dropped `<list>` items
 * (the BIO-EX3 `processExercise` multiple-choice option-drop bug) and duplicate seg-ids.
 * Prints a report; NEVER writes any books/ file. Exits 1 on any flag.
 *
 * Run AFTER extraction and BEFORE the MT/Pass-1 freeze — a flagged list means the module
 * needs the extractor fix + re-extract while it is still free (0-faithful).
 *
 * Usage: node tools/verify-extraction-coverage.js --book liffraedi-2e [--chapter 3] [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { analyzeModule } from './lib/extraction-coverage.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };
// --root overrides the repo root for the books/ tree — for hermetic tests only. Production
// runs resolve against import.meta.url (never process.cwd()).
const ROOT_OPTION = { name: 'root', flags: ['--root'], type: 'string', default: null };

/** chapter arg (int | 'appendices' | null) -> dir name(s) to scan. */
function chapterDirs(root, chapter) {
  if (chapter === 'appendices') return ['appendices'];
  if (typeof chapter === 'number' && !Number.isNaN(chapter)) {
    return ['ch' + String(chapter).padStart(2, '0')];
  }
  return fs
    .readdirSync(root)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    JSON_OPTION,
    ROOT_OPTION,
  ]);
  if (args.help) {
    console.log(
      'Usage: node tools/verify-extraction-coverage.js --book <slug> [--chapter N|appendices] [--json]\n' +
        'Read-only pre-freeze coverage checkpoint over 02-for-mt x 01-source. Exits 1 on any flag.'
    );
    return;
  }
  // requireBook validates books/<slug> under the real repo root; when --root overrides the
  // tree (hermetic tests) do a lighter presence check and let the forMtRoot guard below verify.
  if (args.root) {
    if (!args.book) {
      console.error('Error: --book is required');
      process.exit(1);
    }
  } else {
    requireBook(args);
  }
  if (args.chapter !== null && args.chapter !== 'appendices' && Number.isNaN(args.chapter)) {
    console.error('Error: --chapter must be a number or "appendices"');
    process.exit(1);
  }

  const root = args.root ? path.resolve(args.root) : REPO_ROOT;
  const forMtRoot = path.join(root, 'books', args.book, '02-for-mt');
  const srcRoot = path.join(root, 'books', args.book, '01-source');
  if (!fs.existsSync(forMtRoot)) {
    console.error(`Error: no 02-for-mt for ${args.book}`);
    process.exit(1);
  }
  if (!fs.existsSync(srcRoot)) {
    // Absent 01-source would silently analyze 0 modules and exit "clean" — fail loud instead.
    console.error(`Error: no 01-source for ${args.book} (cannot check coverage)`);
    process.exit(1);
  }

  const modules = {};
  let missingSource = 0;
  let parseErrors = 0;
  let benignDupTotal = 0;
  for (const dir of chapterDirs(forMtRoot, args.chapter)) {
    const segDir = path.join(forMtRoot, dir);
    if (!fs.existsSync(segDir)) continue;
    for (const file of fs.readdirSync(segDir)) {
      if (!file.endsWith('-segments.en.md')) continue;
      const moduleId = file.slice(0, -'-segments.en.md'.length);
      const srcFile = path.join(srcRoot, dir, `${moduleId}.cnxml`);
      if (!fs.existsSync(srcFile)) {
        missingSource++; // e.g. chapter-metadata has no source cnxml
        continue;
      }
      // Per-module isolation: a malformed cnxml must not abort the whole batch (A2 lesson).
      try {
        const r = analyzeModule(
          fs.readFileSync(srcFile, 'utf8'),
          fs.readFileSync(path.join(segDir, file), 'utf8')
        );
        benignDupTotal += r.dupFindings.rawDup.filter((d) => d.kind === 'benign').length;
        if (r.hasFindings) modules[moduleId] = { chapter: dir, ...r };
      } catch (e) {
        parseErrors++;
        modules[moduleId] = { chapter: dir, parseError: e.message };
      }
    }
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithFindings: ids.length,
    listsWithDroppedItems: ids.reduce(
      (s, m) => s + (modules[m].listFindings ? modules[m].listFindings.length : 0),
      0
    ),
    duplicateSegIds: ids.reduce(
      (s, m) =>
        s +
        (modules[m].dupFindings
          ? modules[m].dupFindings.sourceDup.length +
            modules[m].dupFindings.rawDup.filter((d) => d.kind === 'real').length
          : 0),
      0
    ),
    parseErrors,
    modulesMissingSource: missingSource,
    benignDuplicateSegIds: benignDupTotal,
  };

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, summary, modules }, null, 2));
  } else {
    console.log(`Extraction-coverage checkpoint — ${args.book}\n`);
    for (const m of ids.sort()) {
      const e = modules[m];
      if (e.parseError) {
        console.log(`  ${m} (${e.chapter}): ⚠ parse error — ${e.parseError}`);
        continue;
      }
      for (const lf of e.listFindings) {
        console.log(
          `  ${m} (${e.chapter}): list ${lf.listId} — ${lf.present}/${lf.items} items emitted; ` +
            `dropped e.g. ${JSON.stringify(lf.missing.slice(0, 3))}`
        );
      }
      for (const d of e.dupFindings.sourceDup) {
        console.log(`  ${m} (${e.chapter}): duplicate source id ${d.id} (${d.count}×)`);
      }
      for (const d of e.dupFindings.rawDup.filter((x) => x.kind === 'real')) {
        console.log(
          `  ${m} (${e.chapter}): duplicate seg-id ${d.segId} (${d.count}×) — DIFFERENT visible text ` +
            `[A: ${JSON.stringify(d.sampleA)} | B: ${JSON.stringify(d.sampleB)}]`
        );
      }
    }
    console.log(
      `\nSummary: ${summary.listsWithDroppedItems} list(s) with dropped items + ` +
        `${summary.duplicateSegIds} duplicate seg-id(s) across ${summary.modulesWithFindings} module(s)` +
        (summary.parseErrors ? `; ${summary.parseErrors} parse error(s)` : '') +
        '.'
    );
    if (benignDupTotal > 0) {
      console.log(
        `Note: ${benignDupTotal} benign duplicate seg-id(s) (identical visible text — depth-blind ` +
          `duplicate emission; non-blocking).`
      );
    }
  }
  // process.exitCode (not process.exit) so a large --json payload fully flushes to a pipe
  // before the process exits. Exit 1 on any finding (drops, dups, or parse errors).
  process.exitCode = ids.length ? 1 : 0;
}

main();
