#!/usr/bin/env node
/**
 * preintake-probe.js — read-only pre-intake structural probe (D2).
 *
 * Scans a candidate book's raw CNXML and prints a go/no-go fitness checklist:
 *   os-embed exercises (BLOCK), iframe embeds, empty key-terms risk,
 *   unconfigured note classes, unrecognized inline elements (WARN).
 *
 * Usage:
 *   node tools/preintake-probe.js --book <slug>     # books/<slug>/01-source
 *   node tools/preintake-probe.js --source <dir>    # arbitrary candidate dir
 *   [--json] [--verbose] [-h|--help]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION } from './lib/parseArgs.js';
import { runFileChecks, evaluateBook } from './lib/preintake-checks.js';

const SOURCE_OPTION = { name: 'source', flags: ['--source'], type: 'string', default: null };
const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

/**
 * Walk dir for *.cnxml, run per-file checks, aggregate, and evaluate.
 * @param {string} dir
 * @param {object|null} bookConfig
 */
export function probeDir(dir, bookConfig) {
  const entries = fs.readdirSync(dir, { recursive: true });
  const files = entries.map(String).filter((f) => f.endsWith('.cnxml'));
  const agg = {
    osEmbed: 0,
    iframe: 0,
    anyTerm: false,
    anyGlossary: false,
    noteClasses: new Set(),
    unrecognizedInline: new Map(),
    fileCount: 0,
  };
  for (const rel of files) {
    const cnxml = fs.readFileSync(path.join(dir, rel), 'utf-8');
    const r = runFileChecks(cnxml);
    agg.osEmbed += r.osEmbed;
    agg.iframe += r.iframe;
    if (r.hasTerm) agg.anyTerm = true;
    if (r.hasGlossary) agg.anyGlossary = true;
    for (const c of r.noteClasses) agg.noteClasses.add(c);
    for (const [tag, n] of Object.entries(r.unrecognizedInline)) {
      agg.unrecognizedInline.set(tag, (agg.unrecognizedInline.get(tag) || 0) + n);
    }
    agg.fileCount++;
  }
  return { ...evaluateBook(agg, bookConfig), agg };
}

function loadBookConfig(dir) {
  // book-config.json lives at the book root (parent of 01-source) for --book,
  // or in the source dir itself for --source. Try both; null if neither.
  for (const p of [path.join(dir, '..', 'book-config.json'), path.join(dir, 'book-config.json')]) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const ICON = { ok: '✓ ok   ', warn: '⚠ WARN ', block: '✗ BLOCK' };

function printReport(label, result) {
  const { checks, verdict, agg } = result;
  console.log(`\nPre-intake probe: ${label} (${agg.fileCount} files)`);
  console.log(`  [${ICON[checks.osEmbed.status]}] os-embed exercises: ${checks.osEmbed.count}`);
  console.log(`  [${ICON[checks.iframe.status]}] iframe / embeds: ${checks.iframe.count}`);
  console.log(
    `  [${ICON[checks.glossary.status]}] empty key-terms risk: ${
      checks.glossary.status === 'warn' ? '<term> present, no <glossary>' : 'ok'
    }`
  );
  console.log(
    `  [${ICON[checks.noteClass.status]}] unconfigured note classes: ${checks.noteClass.items.length}`
  );
  if (checks.noteClass.items.length) console.log(`        ${checks.noteClass.items.join(', ')}`);
  console.log(
    `  [${ICON[checks.inline.status]}] unrecognized inline elements: ${checks.inline.items.length}`
  );
  if (checks.inline.items.length) console.log(`        ${checks.inline.items.join(', ')}`);
  console.log(`Verdict: ${verdict}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, SOURCE_OPTION, JSON_OPTION]);
  if (args.help) {
    console.log('Usage: preintake-probe.js (--book <slug> | --source <dir>) [--json] [--verbose]');
    process.exit(0);
  }
  if ((!args.book && !args.source) || (args.book && args.source)) {
    console.error('Error: provide exactly one of --book <slug> or --source <dir>');
    process.exit(1);
  }

  const dir = args.source || path.join('books', args.book, '01-source');
  if (!fs.existsSync(dir)) {
    console.error(`Error: source directory not found: ${dir}`);
    process.exit(1);
  }

  const label = args.source || args.book;
  const result = probeDir(dir, loadBookConfig(dir));

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          source: label,
          verdict: result.verdict,
          fileCount: result.agg.fileCount,
          checks: result.checks,
        },
        null,
        2
      )
    );
  } else {
    printReport(label, result);
  }
  process.exit(result.verdict === 'NO-GO' ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
