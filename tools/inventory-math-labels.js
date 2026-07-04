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
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
  ]);
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const mapPath = path.join(bookDir, 'math-label-map.json');
  const reportPath = path.join(bookDir, 'math-label-inventory.md');

  if (args.validate) return runValidate(mapPath, path.join(bookDir, '01-source'));
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

  // Re-derive each key's position class by re-scanning source.
  const tokens = [];
  for (const file of findCnxml(srcDir)) {
    tokens.push(...collectMathTokens(fs.readFileSync(file, 'utf8')));
  }
  const { labels, others } = aggregate(tokens);
  const classes = {};
  for (const [k, v] of [...labels, ...others]) classes[k] = v.klass;

  const violations = validateMap(map, classes);
  if (violations.length === 0) {
    console.log(`✓ ${Object.keys(map).length} label values valid.`);
    return;
  }
  console.error(`✗ ${violations.length} invalid value(s):`);
  for (const { key, value, reason } of violations) {
    console.error(`  '${key}' → '${value}' : ${reason}`);
  }
  process.exit(1);
}

main();
