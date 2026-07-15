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
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, JSON_OPTION]);
  if (args.help) {
    console.log(
      'Usage: node tools/verify-extraction-coverage.js --book <slug> [--chapter N|appendices] [--json]\n' +
        'Read-only pre-freeze coverage checkpoint over 02-for-mt x 01-source. Exits 1 on any flag.'
    );
    return;
  }
  requireBook(args);
  if (args.chapter !== null && args.chapter !== 'appendices' && Number.isNaN(args.chapter)) {
    console.error('Error: --chapter must be a number or "appendices"');
    process.exit(1);
  }

  const forMtRoot = path.join(REPO_ROOT, 'books', args.book, '02-for-mt');
  const srcRoot = path.join(REPO_ROOT, 'books', args.book, '01-source');
  if (!fs.existsSync(forMtRoot)) {
    console.error(`Error: no 02-for-mt for ${args.book}`);
    process.exit(1);
  }

  const modules = {};
  let missingSource = 0;
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
      const r = analyzeModule(
        fs.readFileSync(srcFile, 'utf8'),
        fs.readFileSync(path.join(segDir, file), 'utf8')
      );
      if (r.hasFindings) modules[moduleId] = { chapter: dir, ...r };
    }
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithFindings: ids.length,
    listsWithDroppedItems: ids.reduce((s, m) => s + modules[m].listFindings.length, 0),
    duplicateSegIds: ids.reduce(
      (s, m) => s + modules[m].dupFindings.sourceDup.length + modules[m].dupFindings.rawDup.length,
      0
    ),
    modulesMissingSource: missingSource,
  };

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, summary, modules }, null, 2));
  } else {
    console.log(`Extraction-coverage checkpoint — ${args.book}\n`);
    for (const m of ids.sort()) {
      const e = modules[m];
      for (const lf of e.listFindings) {
        console.log(
          `  ${m} (${e.chapter}): list ${lf.listId} — ${lf.present}/${lf.items} items emitted; ` +
            `dropped e.g. ${JSON.stringify(lf.missing.slice(0, 3))}`
        );
      }
      for (const d of e.dupFindings.sourceDup) {
        console.log(`  ${m} (${e.chapter}): duplicate source id ${d.id} (${d.count}×)`);
      }
      for (const d of e.dupFindings.rawDup) {
        console.log(`  ${m} (${e.chapter}): duplicate seg-id ${d.segId} (${d.count}×)`);
      }
    }
    console.log(
      `\nSummary: ${summary.listsWithDroppedItems} list(s) with dropped items + ` +
        `${summary.duplicateSegIds} duplicate seg-id(s) across ${summary.modulesWithFindings} module(s).`
    );
  }
  process.exit(ids.length ? 1 : 0);
}

main();
