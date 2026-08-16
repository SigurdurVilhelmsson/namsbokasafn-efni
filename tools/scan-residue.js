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
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';
import { scanSegmentsForResidue } from './lib/residue-scan.js';
import { loadResidueAllowlist, classifyResidue } from './lib/residue-allowlist.js';

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

/**
 * List the residue-scannable {moduleId, file} pairs in one 02-mt-output
 * chapter dir. Skips `exercises-segments.is.md` BY EXACT NAME — item 9/D3:
 * every chapter has one such file, and the naive `moduleId = file.slice(...)`
 * below would fold them all to the SAME key ('exercises'), so a later
 * chapter's entry silently overwrote an earlier chapter's in the `modules`
 * map, and allowlist entries (keyed by nickname, not 'exercises') never
 * matched. `exercise-assemble.js` is the authoritative residue gate for
 * os-embed exercise content (nickname-keyed, per-chapter, already wired into
 * the inject-stage exit code) — this scanner only covers CNXML-extracted
 * modules. Mirrors the same-name guard in verify-extraction-coverage.js's
 * `collectModuleFiles` and server/services/segmentParser.js's listing filter
 * (I1, final review).
 * @param {string} isDir
 * @returns {{moduleId: string, file: string}[]}
 */
export function collectResidueFiles(isDir) {
  return fs
    .readdirSync(isDir)
    .filter((file) => file.endsWith('-segments.is.md')) // exclude .backup.* and .json
    .filter((file) => file !== 'exercises-segments.is.md')
    .map((file) => ({ moduleId: file.slice(0, -'-segments.is.md'.length), file }));
}

const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv, [BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION, JSON_OPTION]);

  if (args.help) {
    console.log(
      'Usage: node tools/scan-residue.js --book <slug> [--chapter N|appendices] [--module ID] [--json]\n' +
        'Read-only EN-residue scan over 02-for-mt x 02-mt-output. Prints a report; --json for machine output.'
    );
    return;
  }

  // §C82 review finding: a bare `--module` with no following value is
  // silently undetected by parseArgs' generic string-option handling
  // (`if (nextArg === undefined) continue` — tools/lib/parseArgs.js) so
  // `args.module` stays null, exactly as if the flag were never passed. Left
  // unchecked, that produces a whole-chapter scan the caller believes is
  // scoped to one module — the loop this exists to serve would consume those
  // results as a per-module verdict. Fixed HERE ONLY: cnxml-render-fidelity-
  // check and validate-chapter reject --module outright regardless of its
  // value, so a missing value there degrades to "runs the whole chapter"
  // either way (which is what they'd do for --module at all) — no separate
  // check needed there, and this is not an oversight.
  if (argv.includes('--module') && !args.module) {
    console.error('Error: --module requires a value (e.g. --module m68823).');
    process.exit(2);
  }

  requireBook(args);

  if (args.chapter !== null && args.chapter !== 'appendices' && Number.isNaN(args.chapter)) {
    console.error('Error: --chapter must be a number or "appendices"');
    process.exit(1);
  }

  const forMtRoot = path.join(REPO_ROOT, 'books', args.book, '02-for-mt');
  const mtOutRoot = path.join(REPO_ROOT, 'books', args.book, '02-mt-output');
  if (!fs.existsSync(mtOutRoot)) {
    console.error(`Error: no 02-mt-output for ${args.book}`);
    process.exit(1);
  }

  const residueAllowlist = loadResidueAllowlist(path.join(REPO_ROOT, 'books', args.book));

  const modules = {};
  let modulesMissingEn = 0;
  let modulesExamined = 0;
  for (const dir of chapterDirs(mtOutRoot, args.chapter)) {
    const isDir = path.join(mtOutRoot, dir);
    if (!fs.existsSync(isDir)) continue;
    let files = collectResidueFiles(isDir);
    if (args.module) {
      files = files.filter((f) => f.moduleId === args.module);
    }
    for (const { moduleId, file } of files) {
      modulesExamined++;
      const enFile = path.join(forMtRoot, dir, `${moduleId}-segments.en.md`);
      if (!fs.existsSync(enFile)) {
        modulesMissingEn++;
        modules[moduleId] = { chapter: dir, exact: [], warnings: [], missingEn: true };
        continue;
      }
      const enContent = fs.readFileSync(enFile, 'utf8');
      const isContent = fs.readFileSync(path.join(isDir, file), 'utf8');
      const { exact: exactAll, warnings } = scanSegmentsForResidue(enContent, isContent);
      const tolerated = [];
      const exact = [];
      for (const segId of exactAll) {
        const c = classifyResidue(moduleId, segId, residueAllowlist);
        if (c.tolerated) tolerated.push({ segmentId: segId, reason: c.reason });
        else exact.push(segId);
      }
      if (exact.length || warnings.length || tolerated.length)
        modules[moduleId] = { chapter: dir, exact, warnings, tolerated };
    }
  }

  // §C82: a --module that matches nothing is an ERROR, never a silent empty
  // scan — an empty result set and a clean result set are indistinguishable in
  // the output, so a typo'd module id would read as "no residue found".
  //
  // Checked against `modulesExamined` (files actually opened), NOT
  // `Object.keys(modules).length` — `modules` only gains an entry for a
  // residue-related finding or a missing EN sibling, so a matched module with
  // zero residue legitimately produces no `modules` entry. Keying the error on
  // `modules` would misreport every healthy scoped module (the common case for
  // Task 9's per-module loop) as "matched no module".
  if (args.module && modulesExamined === 0) {
    console.error(
      `Error: --module ${args.module} matched no module in ${args.book}` +
        (args.chapter !== null ? ` chapter ${args.chapter}` : '') +
        '.'
    );
    process.exit(2);
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithResidue: ids.filter((m) => modules[m].exact.length).length,
    exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
    ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    toleratedResidues: ids.reduce((s, m) => s + (modules[m].tolerated || []).length, 0),
    modulesMissingEn,
    // §C82/§C60: every check emits the number of units it examined. Counted at
    // the {moduleId, file} pair actually opened for comparison — NOT
    // `ids.length` (modules with a residue-related entry in `modules`), which
    // undercounts: a clean module with its EN sibling present never gets a
    // `modules` entry at all, so on a clean chapter that count would be 0
    // regardless of whether 1 module or the whole chapter was scanned.
    modulesExamined,
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

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
