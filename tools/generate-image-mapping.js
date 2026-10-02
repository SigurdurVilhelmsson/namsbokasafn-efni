#!/usr/bin/env node

/**
 * generate-image-mapping.js
 *
 * Generate or update a book's image mapping from a directory of translated figure files.
 * The mapping (`media/image-mapping.json`) is the producer side of the image-localization
 * mechanism that `cnxml-inject.js` consumes (`loadImageBasenameMap` / `applyImageBasenameSwaps`):
 * during injection every `<image>` whose src basename equals an entry's `originalImage` has its
 * `src` (and mime-type) swapped for the entry's `outputName`, which `cnxml-render.js` then
 * publishes from the book-level `media/` dir.
 *
 * ⚠️ A figure listed in the figure config's `retiredFigures` (§C140 ㊵) is NEVER mapped: its
 * translated copy is named and skipped, so restoring the file cannot bring its row back.
 * Retire a figure with `tools/retire-translated-figure.js`, not by deleting its row: this tool
 * re-adds the row of any figure that is not in `retiredFigures` whose translated copy is still
 * in `media/`.
 *
 * Workflow:
 *   1. Place translated figures in `books/<book>/media/` (NOT 01-source/media — that
 *      is the read-only OpenStax source). Name each one `<original-basename><suffix>.<ext>`,
 *      e.g. CNX_Chem_11_03_gasdissolv_IS.svg for the original CNX_Chem_11_03_gasdissolv.jpg.
 *   2. Run this tool to scan the source CNXML, match each translated file back to the
 *      <image> whose basename is its original, and write the mapping.
 *   3. Re-inject + re-render (CLI, or "Vista + Birta" per module) to publish the swap.
 *
 * The mapping is keyed on the original image BASENAME (`originalImage`, no extension), not on
 * a figure id: an entry carries no `figureId`, which keeps it out of the legacy figure-id
 * loader (`loadImageMapping`). `indexSourceImageBasenames` indexes every <image src> in the
 * scanned source CNXML whatever element encloses it (figure, example, exercise or standalone
 * media), so a translated file is reported as unmatched when no <image> there has its original
 * basename — it does not matter whether that image sits inside a <figure>.
 *
 * Usage:
 *   node tools/generate-image-mapping.js --book <slug> [options]
 *
 * Options:
 *   --book <slug>      Book slug (e.g. efnafraedi-2e). Required.
 *   --chapter <num>    Only scan source for this chapter (default: all chapters).
 *                      Matching is still driven by which translated files exist.
 *   --suffix <s>       Locale suffix on translated filenames (default: _IS).
 *   --dry-run          Print the mapping that would be written; write nothing.
 *   --verbose          List every matched/unmatched file.
 *   -h, --help         Show this help.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRetiredFigures } from './lib/figure-text-config.js';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

/**
 * Locale suffix on translated figure filenames: `<basename>_IS.<ext>`.
 *
 * ONE definition, because it was two and they disagreed: the CLI defaulted to
 * `_is` while every translated file on disk is `_IS`, and `deriveOriginalBasename`
 * matches case-SENSITIVELY. A bare run therefore matched 0 files, printed a
 * success line, and merged an unchanged mapping — so a newly translated figure
 * was silently never added. Pinned against the committed corpus in
 * `tools/__tests__/generate-image-mapping.test.js`.
 */
export const DEFAULT_SUFFIX = '_IS';

/** Test seam: point the tool at a fixture books/ dir. */
export function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

// =====================================================================
// PURE CORE (unit-tested)
// =====================================================================

/**
 * Index every image basename referenced by an <image src=...> in a CNXML string,
 * regardless of the enclosing element (figure / example / exercise / standalone
 * media). The from-scratch SVG route swaps on basename, so — unlike the legacy
 * figure-id mechanism — non-figure images are first-class here.
 * @param {string} cnxml
 * @returns {Set<string>} original-image basenames (no extension) present in source
 */
export function indexSourceImageBasenames(cnxml) {
  const set = new Set();
  if (!cnxml) return set;
  const imageRe = /<image\b[^>]*\bsrc="([^"]+)"/g;
  let img;
  while ((img = imageRe.exec(cnxml)) !== null) {
    const file = img[1].split('/').pop();
    set.add(file.replace(/\.[^.]+$/, ''));
  }
  return set;
}

/**
 * Recover the original image basename from a translated filename.
 * @param {string} filename e.g. "CNX_Chem_11_03_gasdissolv_IS.svg"
 * @param {string} suffix   e.g. "_IS"
 * @returns {string|null} original basename, or null if the suffix is absent
 */
export function deriveOriginalBasename(filename, suffix) {
  const stem = filename.replace(/\.[^.]+$/, '');
  if (!stem.endsWith(suffix)) return null;
  return stem.slice(0, -suffix.length);
}

/**
 * Build image-mapping entries for a list of translated filenames.
 * Each entry is basename-keyed (`originalImage`) — no `figureId`, which keeps
 * these new-route entries out of the legacy figure-id loader by construction.
 * @param {string[]} translatedFiles  filenames present in media/ (already filtered to suffix)
 * @param {Set<string>} basenameSet  from indexSourceImageBasenames
 * @param {string} suffix
 * @param {{retired?: Set<string>}} [options]  §C140 ㊵: names never to map, matched EXACTLY
 * @returns {{entries: object[], unmatched: string[], skippedRetired: string[]}}
 */
export function buildMappingEntries(
  translatedFiles,
  basenameSet,
  suffix,
  { retired = new Set() } = {}
) {
  const entries = [];
  const unmatched = [];
  const skippedRetired = [];
  for (const outputName of translatedFiles) {
    const original = deriveOriginalBasename(outputName, suffix);
    // §C140 ㊵ — a retired figure is never mapped again, even when its translated copy is
    // restored to media/: tools/retire-translated-figure.js removes the row, and this function
    // is the other writer of rows.
    if (original && retired.has(original)) {
      skippedRetired.push(outputName);
      continue;
    }
    if (!original || !basenameSet.has(original)) {
      unmatched.push(outputName);
      continue;
    }
    entries.push({
      originalImage: original,
      outputName,
      extension: path.extname(outputName),
    });
  }
  return { entries, unmatched, skippedRetired };
}

/**
 * Merge fresh entries into an existing mapping array, keyed on originalImage.
 * Fresh entries overwrite same-image existing ones; other images are preserved.
 * @param {object[]} existing
 * @param {object[]} fresh
 * @returns {object[]}
 */
export function mergeMapping(existing, fresh) {
  const byImage = new Map();
  for (const e of existing || []) byImage.set(e.originalImage, e);
  for (const e of fresh) byImage.set(e.originalImage, e);
  return [...byImage.values()];
}

// =====================================================================
// IO ORCHESTRATION
// =====================================================================

/** Recursively collect *.cnxml under a directory. */
function collectCnxml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collectCnxml(full));
    else if (name.endsWith('.cnxml')) out.push(full);
  }
  return out;
}

/**
 * Every image basename the book's source CNXML references, for the whole book or one chapter.
 * The ONE walk this generator, `tools/retire-translated-figure.js` and the figure-config
 * validator share.
 * @param {string} bookDir  `books/<slug>`
 * @param {string|number} [chapter]
 * @returns {Set<string>}
 */
export function indexBookSourceBasenames(bookDir, chapter) {
  const sourceRoot = path.join(bookDir, '01-source');
  const scanDir = chapter
    ? path.join(sourceRoot, `ch${String(chapter).padStart(2, '0')}`)
    : sourceRoot;
  const basenameSet = new Set();
  for (const file of collectCnxml(scanDir)) {
    for (const basename of indexSourceImageBasenames(fs.readFileSync(file, 'utf-8'))) {
      basenameSet.add(basename);
    }
  }
  return basenameSet;
}

/**
 * Generate (or update) books/<book>/media/image-mapping.json.
 * @param {object} [options]
 * @param {Set<string>} [options.retired]  §C140 ㊵: figure basenames never to map. When
 *   undefined, the figure config's `retiredFigures` is read (`loadRetiredFigures`).
 * @returns {{entries: object[], unmatched: string[], skippedRetired: string[], merged: object[],
 *   mappingPath: string, written: boolean}}
 */
export function generateImageMapping({
  book,
  chapter,
  suffix = DEFAULT_SUFFIX,
  dryRun = false,
  retired,
} = {}) {
  if (!book) throw new Error('--book is required');

  const bookDir = path.join(BOOKS_DIR, book);
  const mediaDir = path.join(bookDir, 'media');
  if (!fs.existsSync(mediaDir)) {
    throw new Error(
      `No media dir at ${mediaDir}. Create it and place translated figures there ` +
        `(named e.g. CNX_..._${suffix.replace(/^_/, '')}.svg).`
    );
  }

  // 1. Index every image basename in source CNXML (whole book, or one chapter).
  const basenameSet = indexBookSourceBasenames(bookDir, chapter);

  // 2. Find translated files in media/ that carry the locale suffix.
  const translatedFiles = fs.readdirSync(mediaDir).filter((f) => {
    const stem = f.replace(/\.[^.]+$/, '');
    return stem.endsWith(suffix) && f !== 'image-mapping.json';
  });

  // 3. Match and merge.
  const { entries, unmatched, skippedRetired } = buildMappingEntries(
    translatedFiles,
    basenameSet,
    suffix,
    { retired: retired ?? loadRetiredFigures() }
  );
  const mappingPath = path.join(mediaDir, 'image-mapping.json');
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  } catch {
    existing = [];
  }
  const merged = mergeMapping(existing, entries);

  if (!dryRun) {
    fs.writeFileSync(mappingPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  }

  return { entries, unmatched, skippedRetired, merged, mappingPath, written: !dryRun };
}

// =====================================================================
// CLI
// =====================================================================

function parseArgs(argv) {
  const result = {
    book: null,
    chapter: null,
    suffix: DEFAULT_SUFFIX,
    dryRun: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--book') result.book = argv[++i];
    else if (a === '--chapter') result.chapter = argv[++i];
    else if (a === '--suffix') result.suffix = argv[++i];
    else if (a === '--dry-run') result.dryRun = true;
    else if (a === '--verbose') result.verbose = true;
    else if (a === '-h' || a === '--help') result.help = true;
  }
  return result;
}

function printHelp() {
  console.log(
    `\nGenerate books/<book>/media/image-mapping.json from translated figures.\n\n` +
      `  node tools/generate-image-mapping.js --book <slug> [--chapter N] [--suffix ${DEFAULT_SUFFIX}] [--dry-run] [--verbose]\n` +
      `\n  A figure listed in the figure config's retiredFigures is skipped, never mapped (§C140 ㊵).\n`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.book) {
    printHelp();
    process.exit(args.book ? 0 : 1);
  }

  const { entries, unmatched, skippedRetired, merged, mappingPath, written } =
    generateImageMapping(args);

  console.log(
    `Matched ${entries.length} translated image(s) → ${merged.length} total entr${
      merged.length === 1 ? 'y' : 'ies'
    } in mapping.`
  );
  if (args.verbose) {
    for (const e of entries) console.log(`  ${e.outputName}  →  ${e.originalImage}`);
  }
  if (skippedRetired.length) {
    console.log(
      `\nSkipped ${skippedRetired.length} retired figure(s), never mapped again ` +
        `(retiredFigures in the figure config, §C140 ㊵):`
    );
    for (const f of skippedRetired) console.log(`  ${f}`);
  }
  if (unmatched.length) {
    console.error(
      `\nWarning: ${unmatched.length} translated file(s) match no <image src> basename in the source CNXML` +
        `${args.chapter ? ` (chapter ${args.chapter})` : ''}:`
    );
    for (const f of unmatched) console.error(`  ${f}`);
    console.error(
      `  → Name each <original-basename>${args.suffix}.<ext>, where <original-basename> is the basename of an <image src> in the source, whatever element encloses that image.`
    );
  }
  console.log(written ? `\nWrote ${mappingPath}` : `\n(dry-run) Would write ${mappingPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
