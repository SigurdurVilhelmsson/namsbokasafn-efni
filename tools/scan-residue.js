#!/usr/bin/env node
/**
 * Read-only EN-residue scanner. Walks a book's 02-for-mt × 02-mt-output segment
 * trees, pairs each module's EN/IS files, and reports segments the API left in
 * English. Never writes 03-translated or any tracked file (prints to stdout).
 *
 * Usage: node tools/scan-residue.js --book efnafraedi-2e [--chapter 5] [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { scanSegmentsForResidue } from './lib/residue-scan.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** chapter arg (int | 'appendices' | null) -> dir name(s) to scan. */
function chapterDirs(mtOutRoot, chapter) {
  if (chapter === 'appendices') return ['appendices'];
  if (typeof chapter === 'number' && !Number.isNaN(chapter)) {
    return ['ch' + String(chapter).padStart(2, '0')];
  }
  return fs
    .readdirSync(mtOutRoot)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort();
}

const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, JSON_OPTION]);
  requireBook(args);

  const forMtRoot = path.join(REPO_ROOT, 'books', args.book, '02-for-mt');
  const mtOutRoot = path.join(REPO_ROOT, 'books', args.book, '02-mt-output');
  if (!fs.existsSync(mtOutRoot)) {
    console.error(`Error: no 02-mt-output for ${args.book}`);
    process.exit(1);
  }

  const modules = {};
  let modulesMissingEn = 0;
  for (const dir of chapterDirs(mtOutRoot, args.chapter)) {
    const isDir = path.join(mtOutRoot, dir);
    if (!fs.existsSync(isDir)) continue;
    for (const file of fs.readdirSync(isDir)) {
      if (!file.endsWith('-segments.is.md')) continue; // exclude .backup.* and .json
      const moduleId = file.slice(0, -'-segments.is.md'.length);
      const enFile = path.join(forMtRoot, dir, `${moduleId}-segments.en.md`);
      if (!fs.existsSync(enFile)) {
        modulesMissingEn++;
        modules[moduleId] = { chapter: dir, exact: [], warnings: [], missingEn: true };
        continue;
      }
      const enContent = fs.readFileSync(enFile, 'utf8');
      const isContent = fs.readFileSync(path.join(isDir, file), 'utf8');
      const { exact, warnings } = scanSegmentsForResidue(enContent, isContent);
      if (exact.length || warnings.length) modules[moduleId] = { chapter: dir, exact, warnings };
    }
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithResidue: ids.filter((m) => modules[m].exact.length).length,
    exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
    ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    modulesMissingEn,
  };

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, summary, modules }, null, 2));
    return;
  }

  console.log(`EN-residue scan — ${args.book}\n`);
  for (const m of ids.sort()) {
    const e = modules[m];
    if (e.missingEn) {
      console.log(`  ${m} (${e.chapter}): ⚠ no EN sibling`);
      continue;
    }
    if (e.exact.length)
      console.log(`  ${m} (${e.chapter}): ${e.exact.length} verbatim-EN → ${e.exact.join(', ')}`);
    if (e.warnings.length)
      console.log(`  ${m} (${e.chapter}): ${e.warnings.length} mostly-EN warning(s)`);
  }
  console.log(
    `\nSummary: ${summary.exactResidues} verbatim-EN residues in ${summary.modulesWithResidue} module(s); ` +
      `${summary.ratioWarnings} ratio warning(s); ${summary.modulesMissingEn} module(s) missing an EN sibling.`
  );
}

main();
