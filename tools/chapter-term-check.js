#!/usr/bin/env node
/**
 * chapter-term-check.js — the per-chapter review [USER] ruled on 2026-09-19
 * (docs/decisions/2026-09-19-glossary-subset-standard-per-chapter.md). Free, read-only.
 *
 * Run it AFTER a chapter's text is bought (loop Step 2), before inject. It prints:
 *   (a) glossary SUBSET CANDIDATES — approved terms the chapter's MT renders
 *       inconsistently, with the other terms it used instead; and
 *   (b) SHORT MATH LABELS the book's map translates but the short-label default keeps
 *       English, with the ones the 2026-09-04 ruling already decided marked as ruled.
 * Both are questions for [USER], not verdicts. See tools/lib/chapter-term-check.js.
 * "also present" lists other glossary targets over-represented in a term's uncovered
 * segments: a hint at what replaced the term, not proof (a short stem such as `hver`
 * also matches ordinary words).
 *
 * Exit: 0 = the report was produced; 2 = usage or input error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { parseSegmentsMap } from './lib/seg-markers.cjs';
import { loadGlossary } from './api-translate.js';
import { bookToDomain } from './lib/book-rendering-config.js';
import { loadMathLabelResolver } from './lib/math-label-substitute.js';
import {
  glossaryCoverage,
  findSuppressedShortLabels,
  chapterMathTokens,
} from './lib/chapter-term-check.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Module segment files only: not chapter-metadata, not the *.backup.* copies beside them.
const EN_FILE = /^m\d+-segments\.en\.md$/;
const IS_FILE = /^m\d+-segments\.is\.md$/;

function chapterDirName(chapter) {
  return chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

function help() {
  console.log(`chapter-term-check.js — per-chapter glossary-subset and short-label review (free)

Usage:
  node tools/chapter-term-check.js --book <slug> --chapter <N> [options]

Options:
  --min-segments <n>  Segments a term needs before it can be a candidate (default 5)
  --threshold <x>     Coverage below which a term is a candidate (default 0.5)
  --top <n>           Candidates to print (default 20; 0 = all)
  --json              Print the full result as JSON
  -h, --help          Show this help`);
}

/** Merge every module's segment map in one chapter directory, for files matching `re`. */
function readChapterSegments(dir, re) {
  const merged = new Map();
  if (!fs.existsSync(dir)) return merged;
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()) {
    for (const [k, v] of parseSegmentsMap(fs.readFileSync(path.join(dir, f), 'utf8')))
      merged.set(k, v);
  }
  return merged;
}

/** The glossary arm(s) the chapter's committed MT was bought under, from provenance. */
function mtArms(mtDir) {
  const arms = {};
  if (!fs.existsSync(mtDir)) return arms;
  for (const f of fs.readdirSync(mtDir).filter((f) => f.endsWith('-provenance.json'))) {
    try {
      const arm =
        JSON.parse(fs.readFileSync(path.join(mtDir, f), 'utf8'))?.run?.glossary?.arm ??
        'unrecorded';
      arms[arm] = (arms[arm] || 0) + 1;
    } catch {
      arms.unreadable = (arms.unreadable || 0) + 1;
    }
  }
  return arms;
}

function main() {
  process.exitCode = 2; // overwritten only when a report is produced
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    { name: 'minSegments', flags: ['--min-segments'], type: 'number', default: 5 },
    { name: 'threshold', flags: ['--threshold'], type: 'number', default: 0.5 },
    { name: 'top', flags: ['--top'], type: 'number', default: 20 },
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
  ]);
  if (args.help) {
    help();
    process.exitCode = 0;
    return;
  }
  requireBook(args);
  if (args.chapter === null || Number.isNaN(args.chapter)) {
    console.error('Error: --chapter is required');
    return;
  }

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const ch = chapterDirName(args.chapter);
  const mtDir = path.join(bookDir, '02-mt-output', ch);
  const en = readChapterSegments(path.join(bookDir, '02-for-mt', ch), EN_FILE);
  const is = readChapterSegments(mtDir, IS_FILE);
  if (en.size === 0 || is.size === 0) {
    console.error(`Error: no segments for ${args.book} ${ch} (EN ${en.size}, IS ${is.size})`);
    return;
  }

  const glossary = loadGlossary(path.join(bookDir, 'glossary'), bookToDomain(args.book));
  const coverage = glossaryCoverage({
    en,
    is,
    terms: glossary?.terms ?? [],
    minSegments: args.minSegments,
    threshold: args.threshold,
  });
  const candidates = coverage.filter((r) => r.candidate);

  const sourceDir = path.join(bookDir, '01-source', ch);
  const { overlay, glossaryMap } = loadMathLabelResolver(bookDir);
  const labels = fs.existsSync(sourceDir)
    ? findSuppressedShortLabels(chapterMathTokens(sourceDir), { overlay, glossaryMap })
    : [];

  const arms = mtArms(mtDir);
  if (args.json) {
    console.log(JSON.stringify({ book: args.book, chapter: ch, arms, coverage, labels }, null, 2));
    process.exitCode = 0;
    return;
  }

  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`chapter-term-check — ${args.book} ${ch}`);
  console.log(
    `MT arm(s): ${
      Object.entries(arms)
        .map(([a, n]) => `${a} ×${n}`)
        .join(', ') || 'none recorded'
    }  ·  segments EN ${en.size} / IS ${is.size}`
  );
  console.log(
    `\n(a) glossary subset candidates — ${candidates.length} of ${coverage.length} terms seen ` +
      `(≥ ${args.minSegments} segments, coverage < ${pct(args.threshold)})`
  );
  console.log(
    '    low coverage = a mirror case (subset candidate) OR a glossary entry the MT rightly overrides'
  );
  const shown = args.top > 0 ? candidates.slice(0, args.top) : candidates;
  for (const r of shown) {
    const used = r.collisions
      .map((c) => `${c.targetWord} (${c.sourceWord}) ×${c.count}`)
      .join(', ');
    console.log(
      `  ${r.sourceWord} → ${r.targetWord}  [stem ${r.stem}]  ${r.covered + r.kept}/${r.total}` +
        (r.kept ? ` (${r.kept} kept verbatim)` : '') +
        `\n      also present: ${used || '—'}\n      e.g. ${r.uncovered.join('  ')}`
    );
  }
  if (shown.length < candidates.length)
    console.log(`  … ${candidates.length - shown.length} more (--top 0)`);

  const open = labels.filter((l) => !l.ruled);
  console.log(
    `\n(b) short math labels kept English though a map translates them — ${open.length} unruled, ` +
      `${labels.length - open.length} already ruled`
  );
  for (const l of labels) {
    console.log(
      `  ${l.ruled ? '  ruled  ' : '❓ ASK   '} ${l.label} → ${l.value}  (via ${l.via}, ×${l.count})  in: ${l.context}`
    );
  }
  if (open.length)
    console.log(
      '  → [USER] rules each ❓; localizing means adding it to LOCALIZABLE_SHORT_LABELS, then re-INJECT.'
    );
  process.exitCode = 0;
}

main();
