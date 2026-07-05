#!/usr/bin/env node

/**
 * inventory-math-labels.js — WS4 math-label inventory tool (read-only scan).
 *
 * generate (default): scan a book's 01-source math text nodes → write a ranked
 *   two-bucket report (math-label-inventory.md) + a fill-in skeleton
 *   (math-label-map.json, Bucket-1 keys, empty values). Non-destructive: an
 *   existing map's filled values are preserved; new keys added empty; keys no
 *   longer in source are kept and reported (never deleted).
 * --validate: re-read the filled map and fail loud (exit 1) on any value that
 *   breaks the length/token/charset/emptiness rules.
 *
 * Never writes under 01-source/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import {
  collectMathTokens,
  aggregate,
  mergeSkeleton,
  validateMap,
  renderReport,
} from './lib/math-label-inventory.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Recursively collect *.cnxml paths under a directory. */
function findCnxml(dir) {
  const out = [];
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findCnxml(full));
    else if (entry.name.endsWith('.cnxml')) out.push(full);
  }
  return out;
}

/** Serialize a map object with keys sorted alphabetically + trailing newline. */
function serializeMap(mapObj) {
  const sorted = {};
  for (const key of Object.keys(mapObj).sort()) sorted[key] = mapObj[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    { name: 'validate', flags: ['--validate'], type: 'boolean', default: false },
    { name: 'pending', flags: ['--pending'], type: 'boolean', default: false },
  ]);
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const mapPath = path.join(bookDir, 'math-label-map.json');
  const reportPath = path.join(bookDir, 'math-label-inventory.md');
  const srcDir = path.join(bookDir, '01-source');

  if (args.pending) return runPending(mapPath, srcDir);
  if (args.validate) return runValidate(mapPath, srcDir);
  return runGenerate(args.book, bookDir, mapPath, reportPath);
}

/** Parse a JSON file, exiting with a friendly message on parse failure. */
function readJsonOrExit(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`ERROR: ${file} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
}

function runGenerate(book, bookDir, mapPath, reportPath) {
  const srcDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: no 01-source/ under ${bookDir}`);
    process.exit(2);
  }
  const tokens = [];
  for (const file of findCnxml(srcDir)) {
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  }
  const { labels, others } = aggregate(tokens);
  const existing = fs.existsSync(mapPath) ? readJsonOrExit(mapPath) : {};
  const { merged, addedKeys, orphanKeys } = mergeSkeleton(existing, labels);

  fs.writeFileSync(mapPath, serializeMap(merged));
  fs.writeFileSync(reportPath, renderReport({ book, labels, others, currentMap: merged }));

  console.log(`Math-label inventory — ${book}`);
  console.log(`  likely labels: ${labels.size}   also-review: ${others.size}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, reportPath)}`);
  console.log(`  wrote ${path.relative(REPO_ROOT, mapPath)} (${Object.keys(merged).length} keys)`);
  if (addedKeys.length) console.log(`  new keys (empty): ${addedKeys.join(', ')}`);
  if (orphanKeys.length) {
    console.log(`  ⚠ keys in map but not in source (kept — verify): ${orphanKeys.join(', ')}`);
  }
}

function runValidate(mapPath, srcDir) {
  if (!fs.existsSync(mapPath)) {
    console.error(`ERROR: ${mapPath} not found — run generate first (without --validate).`);
    process.exit(1);
  }
  const map = readJsonOrExit(mapPath);

  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: no 01-source/ under ${srcDir}`);
    process.exit(1);
  }

  // Re-derive each key's position class by re-scanning source.
  const tokens = [];
  for (const file of findCnxml(srcDir)) {
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  }
  const { labels, others } = aggregate(tokens);
  const classes = {};
  for (const [k, v] of [...labels, ...others]) classes[k] = v.klass;

  const { hard, warnings, pending, finalEnglish } = validateMap(map, classes);
  const translated = Object.keys(map).length - pending.length - finalEnglish.length - hard.length;

  if (warnings.length) {
    console.log(`⚠ ${warnings.length} advisory (not blocking):`);
    for (const { key, value, warning } of warnings) {
      console.log(`  '${key}' → '${value}' : ${warning}`);
    }
  }
  console.log(
    `Pending (render English, auto-upgrade from glossary): ${pending.length}` +
      (pending.length ? ` — ${pending.join(', ')}` : '')
  );
  console.log(
    `Final-English (kept, no auto-replace): ${finalEnglish.length}` +
      (finalEnglish.length ? ` — ${finalEnglish.join(', ')}` : '')
  );

  if (hard.length === 0) {
    console.log(`✓ no correctness errors. ${translated} translated, ${warnings.length} advisory.`);
    return;
  }
  console.error(`✗ ${hard.length} correctness error(s) — must fix:`);
  for (const { key, value, reason } of hard) {
    console.error(`  '${key}' → '${value}' : ${reason}`);
  }
  process.exit(1);
}

/**
 * Print the pending work-list — labels currently rendering English, grouped by class,
 * plus the final-English (self-mapped) set for reference. Read-only; exits 0.
 */
function runPending(mapPath, srcDir) {
  if (!fs.existsSync(mapPath)) {
    console.error(`ERROR: ${mapPath} not found — run generate first.`);
    process.exit(1);
  }
  if (!fs.existsSync(srcDir)) {
    console.error(`ERROR: no 01-source/ under ${srcDir}`);
    process.exit(1);
  }
  const map = readJsonOrExit(mapPath);
  const tokens = [];
  for (const file of findCnxml(srcDir))
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  const { labels, others } = aggregate(tokens);
  const classes = {};
  for (const [k, v] of [...labels, ...others]) classes[k] = v.klass;

  const { pending, finalEnglish } = validateMap(map, classes);
  const sub = pending.filter((k) => classes[k] === 'subscript');
  const inl = pending.filter((k) => classes[k] !== 'subscript');
  console.log(
    `Pending labels — render English now, auto-upgrade when a glossary term lands: ${pending.length}`
  );
  console.log(`  subscript (${sub.length}): ${sub.join(', ') || '—'}`);
  console.log(`  inline    (${inl.length}): ${inl.join(', ') || '—'}`);
  console.log(`\nFinal-English (self-mapped, kept as-is): ${finalEnglish.length}`);
  console.log(`  ${finalEnglish.join(', ') || '—'}`);
}

main();
