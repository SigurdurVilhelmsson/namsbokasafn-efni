#!/usr/bin/env node

/**
 * generate-image-mapping.js
 *
 * Generate (or update) a book's `media/image-mapping.json` from a directory of
 * translated figure files. This is the producer side of the image-localization
 * mechanism that `cnxml-inject.js` consumes (`loadImageMapping` /
 * `resolveTranslatedImage`): during injection each `<figure id>` whose id appears
 * in the mapping has its `<image src>` (and mime-type) swapped for the translated
 * variant, which `cnxml-render.js` then publishes from the book-level `media/` dir.
 *
 * Workflow:
 *   1. Place translated figures in `books/<book>/media/` (NOT 01-source/media — that
 *      is the read-only OpenStax source). Name each one `<original-basename><suffix>.<ext>`,
 *      e.g. CNX_Chem_11_03_gasdissolv_is.svg for the original CNX_Chem_11_03_gasdissolv.jpg.
 *   2. Run this tool to scan the source CNXML, match each translated file back to the
 *      figure that references its original image, and write the mapping.
 *   3. Re-inject + re-render (CLI, or "Vista + Birta" per module) to publish the swap.
 *
 * The mapping is keyed on the *figure id*, because that is what injection swaps on —
 * a translated file whose original image is not inside a <figure> is reported as
 * unmatched (injection cannot place it).
 *
 * Usage:
 *   node tools/generate-image-mapping.js --book <slug> [options]
 *
 * Options:
 *   --book <slug>      Book slug (e.g. efnafraedi-2e). Required.
 *   --chapter <num>    Only scan source for this chapter (default: all chapters).
 *                      Matching is still driven by which translated files exist.
 *   --suffix <s>       Locale suffix on translated filenames (default: _is).
 *   --dry-run          Print the mapping that would be written; write nothing.
 *   --verbose          List every matched/unmatched file.
 *   -h, --help         Show this help.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

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
 * @param {string} filename e.g. "CNX_Chem_11_03_gasdissolv_is.svg"
 * @param {string} suffix   e.g. "_is"
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
 * @returns {{entries: object[], unmatched: string[]}}
 */
export function buildMappingEntries(translatedFiles, basenameSet, suffix) {
  const entries = [];
  const unmatched = [];
  for (const outputName of translatedFiles) {
    const original = deriveOriginalBasename(outputName, suffix);
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
  return { entries, unmatched };
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
 * Generate (or update) books/<book>/media/image-mapping.json.
 * @returns {{entries: object[], unmatched: string[], mappingPath: string, written: boolean}}
 */
export function generateImageMapping({ book, chapter, suffix = '_is', dryRun = false } = {}) {
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

  // 2. Find translated files in media/ that carry the locale suffix.
  const translatedFiles = fs.readdirSync(mediaDir).filter((f) => {
    const stem = f.replace(/\.[^.]+$/, '');
    return stem.endsWith(suffix) && f !== 'image-mapping.json';
  });

  // 3. Match and merge.
  const { entries, unmatched } = buildMappingEntries(translatedFiles, basenameSet, suffix);
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

  return { entries, unmatched, merged, mappingPath, written: !dryRun };
}

// =====================================================================
// CLI
// =====================================================================

function parseArgs(argv) {
  const result = { book: null, chapter: null, suffix: '_is', dryRun: false, verbose: false };
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
      `  node tools/generate-image-mapping.js --book <slug> [--chapter N] [--suffix _is] [--dry-run] [--verbose]\n`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.book) {
    printHelp();
    process.exit(args.book ? 0 : 1);
  }

  const { entries, unmatched, merged, mappingPath, written } = generateImageMapping(args);

  console.log(
    `Matched ${entries.length} translated image(s) → ${merged.length} total entr${
      merged.length === 1 ? 'y' : 'ies'
    } in mapping.`
  );
  if (args.verbose) {
    for (const e of entries) console.log(`  ${e.outputName}  →  ${e.originalImage}`);
  }
  if (unmatched.length) {
    console.error(
      `\nWarning: ${unmatched.length} translated file(s) had no matching <figure> in source` +
        `${args.chapter ? ` (chapter ${args.chapter})` : ''}:`
    );
    for (const f of unmatched) console.error(`  ${f}`);
    console.error(
      `  → Check the basename matches the original <image src>, or that the image sits inside a <figure id>.`
    );
  }
  console.log(written ? `\nWrote ${mappingPath}` : `\n(dry-run) Would write ${mappingPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
