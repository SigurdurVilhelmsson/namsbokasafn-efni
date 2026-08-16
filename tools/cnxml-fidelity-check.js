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
 * Exit code 0 if no UNEXPLAINED discrepancies remain (allowlisted discrepancies
 * — see tools/lib/fidelity-allowlist.js and books/<book>/fidelity-allowlist.json
 * — don't block a green exit), 1 otherwise.
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
  chapterProvided,
} from './lib/parseArgs.js';
import { loadAllowlist, classifyDiff } from './lib/fidelity-allowlist.js';
import { loadMathLabelResolver, substituteMathLabels } from './lib/math-label-substitute.js';
import { decodeEntities } from './lib/math-label-inventory.js';
import { formatCollisionReport } from './lib/glossary-collisions.js';

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

/**
 * Every element-definition id="..." in document order, first occurrence per id.
 * Skips `target-id="..."` cross-references (they are not element definitions). (OC-C)
 * @param {string} cnxml
 * @returns {string[]}
 */
export function extractIdSequence(cnxml) {
  const seq = [];
  const seen = new Set();
  // (?<![\w-]) excludes the tail of `target-id="…"` (and any `*-id="…"`) so a
  // cross-reference is never counted as an element id in the order sequence. (OC-C)
  const re = /(?<![\w-])id="([^"]+)"/g;
  let m;
  while ((m = re.exec(cnxml)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      seq.push(m[1]);
    }
  }
  return seq;
}

/**
 * Compare the relative document order of ids common to source and translated CNXML.
 * Add/drop (ids in only one side) is the tag-count check's job and is ignored here.
 * Orthogonal to the tag-count/green/allowlist machinery (F1; do not wire into green).
 *
 * @param {string} sourceCnxml
 * @param {string} translatedCnxml
 * @returns {{ ok: boolean, moved: string[] }}
 */
export function compareElementOrder(sourceCnxml, translatedCnxml) {
  const srcSeq = extractIdSequence(sourceCnxml);
  const transSeq = extractIdSequence(translatedCnxml);
  const srcSet = new Set(srcSeq);
  const transSet = new Set(transSeq);

  const srcCommon = srcSeq.filter((id) => transSet.has(id));
  const transCommon = transSeq.filter((id) => srcSet.has(id));

  const moved = [];
  for (let i = 0; i < srcCommon.length; i++) {
    if (srcCommon[i] !== transCommon[i]) moved.push(srcCommon[i]);
  }
  return { ok: moved.length === 0, moved };
}

/**
 * Every <m:math>…</m:math> block in document order (verbatim substrings).
 * @param {string} cnxml
 * @returns {string[]}
 */
export function extractMathBlocks(cnxml) {
  return cnxml.match(/<m:math[\s\S]*?<\/m:math>/g) || [];
}

/**
 * F8 (warn-only): does substitute(source math) equal the translated math on disk?
 * Runs the SAME substitution on the source side so intended label substitutions
 * cancel; any other difference (corruption, or stale/never-re-injected math) is a
 * mismatch. A block-count difference counts each unpaired block as a mismatch.
 * @param {string} sourceCnxml
 * @param {string} translatedCnxml
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {{ok:boolean, mismatched:number, sourceBlocks:number, translatedBlocks:number}}
 */
export function compareMathBlocks(sourceCnxml, translatedCnxml, resolve) {
  // #2: the DOM builders (example/exercise/note) round-trip math through xmldom, which
  // decodes numeric charrefs and re-escapes raw '>'. substituteMathLabels leaves the
  // source raw, so decode entities on BOTH sides before comparing — otherwise F8 flags
  // correct math permanently and masks real corruption. Comparison-only normalization.
  const src = extractMathBlocks(sourceCnxml).map((b) =>
    decodeEntities(substituteMathLabels(b, resolve))
  );
  const trans = extractMathBlocks(translatedCnxml).map((b) => decodeEntities(b));
  let mismatched = 0;
  const n = Math.max(src.length, trans.length);
  for (let i = 0; i < n; i++) {
    if (src[i] !== trans[i]) mismatched += 1;
  }
  return {
    ok: mismatched === 0,
    mismatched,
    sourceBlocks: src.length,
    translatedBlocks: trans.length,
  };
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
Exit code 0 if no UNEXPLAINED discrepancies remain (allowlisted ones don't
block green — see books/<book>/fidelity-allowlist.json), 1 otherwise.

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
  requireBook(args);
  if (args.module && !chapterProvided(args)) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = chapterProvided(args)
    ? [formatChapter(args.chapter)]
    : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${BOOKS_DIR}/01-source/`);
    process.exit(1);
  }

  const allowlist = loadAllowlist(BOOKS_DIR);
  // C18: already once-per-book by structure — this call sits before the
  // per-chapter loop, so no cache is needed. It previously discarded the
  // collision report, which made the tool whose job is reporting
  // discrepancies silent about this one.
  const { resolve: mathResolve, collisions: mathCollisions } = loadMathLabelResolver(BOOKS_DIR);
  const collisionReport = formatCollisionReport(path.basename(BOOKS_DIR), mathCollisions);
  if (collisionReport) console.warn(collisionReport);

  let totalDiscrepancies = 0;
  let unexplainedDiscrepancies = 0;
  let modulesChecked = 0;
  let modulesWithDiffs = 0;
  let modulesPerfect = 0;
  let modulesSkipped = 0;
  const orderMismatchModules = []; // F1: warn-only, never affects exit code
  const mathMismatchModules = []; // F8: warn-only, never affects exit code (pre-WS5 noise)

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

      // F1: orthogonal, warn-only document-order check (not routed through green/allowlist).
      const order = compareElementOrder(sourceCnxml, translatedCnxml);
      if (!order.ok) {
        orderMismatchModules.push(mod.moduleId);
        const shown = order.moved.slice(0, 8).join(', ');
        const more = order.moved.length > 8 ? ` …(+${order.moved.length - 8})` : '';
        console.log(
          `  ORDER [warn-only]: ${mod.moduleId} — ${order.moved.length} id(s) out of document order: ${shown}${more}`
        );
      }

      // F8: math-content check (warn-only until WS5 re-inject; committed 03-translated
      // is stale English pre-WS5, so mismatches are expected noise until then).
      const mathCmp = compareMathBlocks(sourceCnxml, translatedCnxml, mathResolve);
      if (!mathCmp.ok) {
        mathMismatchModules.push(mod.moduleId);
        console.log(
          `  MATH [warn-only]: ${mod.moduleId} — ${mathCmp.mismatched} math block(s) differ from substituted source`
        );
      }

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
          const classification = classifyDiff(mod.moduleId, d.tag, d.diff, allowlist);
          if (classification.status === 'unexplained') {
            unexplainedDiscrepancies += Math.abs(d.diff);
          }
          const statusSuffix =
            classification.status === 'unexplained'
              ? ' [UNEXPLAINED]'
              : ` [${classification.status}]`;
          console.log(
            `  ${d.tag}: ${d.source} → ${d.translated} (${d.diff > 0 ? '+' : ''}${d.diff})${statusSuffix}`
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
  console.log(
    `Total discrepancies: ${totalDiscrepancies} (${unexplainedDiscrepancies} unexplained)`
  );
  console.log(
    `Order check (warn-only): ${orderMismatchModules.length} module(s) with reordered content`
  );
  console.log(
    `Math check (warn-only): ${mathMismatchModules.length} module(s) with math differing from substituted source`
  );

  // Exit code is driven ONLY by unexplained tag-count discrepancies — the order
  // check is warn-only until the affected modules are re-extracted/re-injected (WS5).
  process.exit(unexplainedDiscrepancies > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
