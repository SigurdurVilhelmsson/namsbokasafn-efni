#!/usr/bin/env node

/**
 * cnxml-linguistic-check.js — Compare text content between source and translated CNXML
 *
 * Complements cnxml-fidelity-check.js (which checks structural tag counts) by
 * checking whether the TEXT CONTENT was actually translated. Flags leaf-level
 * elements where the plain text is identical between source and translated,
 * indicating the text was likely never translated.
 *
 * Motivation: a bug in the extraction tool meant list items inside <note>
 * elements were never extracted for translation. The structural fidelity check
 * couldn't detect this because the tag counts matched (the untranslated English
 * lists were preserved as-is). This tool catches that class of bug.
 *
 * Usage:
 *   node tools/cnxml-linguistic-check.js --book efnafraedi-2e --chapter 1
 *   node tools/cnxml-linguistic-check.js --book efnafraedi-2e --chapter 1 --module m68664
 *   node tools/cnxml-linguistic-check.js --book efnafraedi-2e
 *
 * Exit code 0 if all translated, 1 if untranslated content found.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';

let BOOKS_DIR = 'books/efnafraedi-2e';

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_MIN_LENGTH = 15;
const LEAF_TAGS = ['para', 'item', 'caption'];

// ─── Pre-processing ─────────────────────────────────────────────────

/**
 * Strip metadata and MathML blocks from CNXML before extraction.
 * These contain content that is legitimately identical in both languages.
 */
function preprocess(cnxml) {
  let result = cnxml;
  // Strip <metadata>...</metadata> blocks
  result = result.replace(/<metadata[\s\S]*?<\/metadata>/g, '');
  // Strip <m:math>...</m:math> blocks
  result = result.replace(/<m:math[\s\S]*?<\/m:math>/g, '');
  return result;
}

// ─── Element Extraction ─────────────────────────────────────────────

/**
 * Extract leaf-level elements from CNXML.
 * Returns a Map of key → { tag, text } where text is the plain text
 * content with all inner XML tags stripped.
 *
 * Elements with id attributes use the id as key.
 * Elements without ids use a positional key like "item#3" (tag + occurrence index).
 * This handles OpenStax content where items inside <note> or <exercise>
 * elements often lack id attributes.
 *
 * Limitation: positional keys are fragile if the source and translated
 * files have different counts of id-less elements of the same type.
 * In that case, keys misalign and detection may miss untranslated items.
 * In practice this risk is low because OpenStax CNXML is structurally
 * preserved during injection — untranslated elements are copied as-is.
 */
function extractLeafElements(cnxml) {
  const elements = new Map();

  for (const tag of LEAF_TAGS) {
    // Match elements both with and without id attributes
    const regex = new RegExp(`<(${tag})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g');
    const idRegex = /id="([^"]+)"/;
    let match;
    let positionalIndex = 0;
    while ((match = regex.exec(cnxml)) !== null) {
      const [fullMatch, tagName, rawContent] = match;
      // Strip all inner XML tags to get plain text
      const text = rawContent.replace(/<[^>]+>/g, '').trim();
      // Try to extract id from the opening tag
      const idMatch = fullMatch.match(idRegex);
      const key = idMatch ? idMatch[1] : `${tag}#${positionalIndex}`;
      elements.set(key, { tag: tagName, text });
      positionalIndex++;
    }
  }

  return elements;
}

// ─── Skip Rules ─────────────────────────────────────────────────────

/**
 * Determine whether a text string should be skipped (legitimate English).
 * Returns true if the text should NOT be flagged as untranslated.
 */
function shouldSkip(text, minLength) {
  // Too short
  if (text.length < minLength) return true;

  // Purely numeric, whitespace, or punctuation
  if (/^[\s\d\p{P}]*$/u.test(text)) return true;

  // URL patterns
  if (/^https?:\/\//.test(text)) return true;

  // DOI patterns
  if (/^10\.\d+\//.test(text)) return true;

  return false;
}

// ─── Core Function ──────────────────────────────────────────────────

/**
 * Compare text content between source and translated CNXML.
 * Returns array of { id, tag, text } for untranslated blocks.
 *
 * @param {string} sourceCnxml - Original English CNXML
 * @param {string} translatedCnxml - Translated CNXML
 * @param {object} options
 * @param {number} options.minLength - Minimum text length to check (default: 15)
 * @returns {Array<{id: string, tag: string, text: string}>}
 */
export function findUntranslatedText(sourceCnxml, translatedCnxml, options = {}) {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;

  // Pre-process: strip metadata and MathML
  const sourceClean = preprocess(sourceCnxml);
  const translatedClean = preprocess(translatedCnxml);

  // Extract leaf elements with IDs
  const sourceTexts = extractLeafElements(sourceClean);
  const translatedTexts = extractLeafElements(translatedClean);

  // Compare text for IDs present in both maps
  const flagged = [];

  for (const [id, sourceEntry] of sourceTexts) {
    const translatedEntry = translatedTexts.get(id);
    if (!translatedEntry) continue;

    // Skip if text should be excluded
    if (shouldSkip(sourceEntry.text, minLength)) continue;

    // Flag if text is identical
    if (sourceEntry.text === translatedEntry.text) {
      flagged.push({
        id,
        tag: sourceEntry.tag,
        text: sourceEntry.text,
      });
    }
  }

  return flagged;
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

function truncate(text, maxLen = 60) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
  ]);
}

function printHelp() {
  console.log(`
cnxml-linguistic-check.js — Find untranslated text in translated CNXML

Compares leaf-level text content between source and translated CNXML files.
Flags elements where the text is identical, indicating it was never translated.
Exit code 0 if all translated, 1 if untranslated content found.

Usage:
  node tools/cnxml-linguistic-check.js --book <slug> --chapter <num>
  node tools/cnxml-linguistic-check.js --book <slug> --chapter <num> --module <id>
  node tools/cnxml-linguistic-check.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --track <name>      Translation track (default: mt-preview)
  -v, --verbose       Show modules with all content translated
  -h, --help          Show this help
`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.module && !args.chapter) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = args.chapter ? [formatChapter(args.chapter)] : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${BOOKS_DIR}/01-source/`);
    process.exit(1);
  }

  let modulesChecked = 0;
  let modulesAllTranslated = 0;
  let modulesWithUntranslated = 0;
  let modulesSkipped = 0;
  let totalUntranslatedBlocks = 0;

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
      const flagged = findUntranslatedText(sourceCnxml, translatedCnxml);

      modulesChecked++;

      if (flagged.length === 0) {
        modulesAllTranslated++;
        if (args.verbose) console.log(`${chapterDir}/${mod.moduleId}: ALL TRANSLATED`);
      } else {
        modulesWithUntranslated++;
        totalUntranslatedBlocks += flagged.length;
        console.log(`${chapterDir}/${mod.moduleId}: ${flagged.length} untranslated text block(s)`);
        for (const item of flagged) {
          console.log(`  ${item.tag}[${item.id}]: "${truncate(item.text)}"`);
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Checked: ${modulesChecked} modules`);
  console.log(`All translated: ${modulesAllTranslated}`);
  console.log(`With untranslated content: ${modulesWithUntranslated}`);
  if (modulesSkipped > 0) console.log(`Skipped: ${modulesSkipped}`);
  console.log(`Total untranslated blocks: ${totalUntranslatedBlocks}`);

  process.exit(totalUntranslatedBlocks > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
