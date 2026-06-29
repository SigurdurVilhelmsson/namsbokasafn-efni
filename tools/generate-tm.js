#!/usr/bin/env node

/**
 * generate-tm.js — In-house TMX generation from paired segment files
 *
 * The EN source segments (02-for-mt/) and the human-reviewed IS segments
 * (03-faithful-translation/) are already aligned 1:1 by their
 * `<!-- SEG:module:type:elementId -->` markers. This tool pairs them and
 * emits a TMX 1.4b translation memory — no Matecat Align, no manual step.
 *
 * Only *faithful* segments are emitted: they are the human-verified ★ asset.
 * Raw MT output (02-mt-output/) is never used as a TM source.
 *
 * Inline bracket/legacy markers ([[i:]], [[sub:]], [[link:|]], …) are stripped
 * to plain text — most CAT tools want clean text in the TM. `[[MATH:N]]`
 * equation placeholders are preserved verbatim (they align on both sides and
 * carry no plain-text rendering). HTML entities in the source (e.g. `&amp;`,
 * `&#8201;`) are decoded before the TMX is re-escaped, so the TM holds real
 * characters rather than double-escaped entities.
 *
 * Usage:
 *   node tools/generate-tm.js --book efnafraedi-2e
 *   node tools/generate-tm.js --book efnafraedi-2e --chapter 3
 *   node tools/generate-tm.js --book efnafraedi-2e --dry-run --verbose
 *   node tools/generate-tm.js --book efnafraedi-2e --out /tmp/efna.tmx
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';

const TOOL_NAME = 'generate-tm.js';
const TOOL_VERSION = '1.0';

let BOOKS_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'books');

// ─── Segment parsing ─────────────────────────────────────────────────

// Capture the full segment id (module:type:elementId) as one token.
const SEG_MARKER_REGEX = /<!--\s*SEG:([\w]+:[\w-]+:[\w-]+)\s*-->/g;

/**
 * Parse a segment file into a Map of segmentId → text.
 *
 * Marker-based (not line-based): a segment's content runs from its marker to
 * the next marker regardless of newlines, matching segmentParser.js (post-#96)
 * and tolerating MT output that glues a marker onto the previous line.
 * First occurrence of a duplicate id wins.
 *
 * @param {string} content - Raw file content
 * @returns {Map<string, string>}
 */
function parseSegments(content) {
  const segments = new Map();
  if (!content) return segments;

  let currentId = null;
  let contentStart = 0;

  for (const match of content.matchAll(SEG_MARKER_REGEX)) {
    if (currentId !== null && !segments.has(currentId)) {
      segments.set(currentId, content.slice(contentStart, match.index).trim());
    }
    currentId = match[1];
    contentStart = match.index + match[0].length;
  }
  if (currentId !== null && !segments.has(currentId)) {
    segments.set(currentId, content.slice(contentStart).trim());
  }

  return segments;
}

// ─── Marker stripping & text cleanup ──────────────────────────────────

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode HTML/XML entities to their real characters.
 * Named (`&amp;`), decimal (`&#8201;`), and hex (`&#x2009;`) forms.
 * Unknown named entities are left untouched.
 *
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  if (!text) return text || '';
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      return whole;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body)
      ? NAMED_ENTITIES[body]
      : whole;
  });
}

/**
 * Strip inline bracket/legacy markers to plain text.
 *
 *   [[link:text|url]] / [[xref:text|id]] / [[docref:text|id]] → text
 *   [[xref:id]] / [[docref:doc#target]]   → '' (reference-only, no display)
 *   [[i:t]] / [[b:t]] / [[sub:t]] / [[sup:t]] → t
 *   ++t++                                 → t
 *   {{term}}t{{/term}} / {{fn}}t{{/fn}}   → t  (legacy paired)
 *   [[MATH:N]]                            → kept verbatim
 *
 * Single-char legacy markers (*…*, ~…~, ^…^, __…__) are intentionally left
 * alone: they collide with literal math/chemistry text and are ambiguous to
 * strip safely.
 *
 * @param {string} text
 * @returns {string}
 */
function stripMarkers(text) {
  if (!text) return text || '';
  return (
    text
      // pipe-form link/xref/docref: keep the display text (left of the pipe)
      .replace(/\[\[(?:link|xref|docref):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      // reference-only xref/docref (no display text): drop, eating one leading space
      .replace(/ ?\[\[(?:xref|docref):[^\]]*\]\]/g, '')
      // inline formatting: keep the inner content
      .replace(/\[\[(?:i|b|sub|sup):([^\]]*)\]\]/g, '$1')
      // legacy underline
      .replace(/\+\+([^+]+)\+\+/g, '$1')
      // legacy paired markers {{x}}…{{/x}}
      .replace(/\{\{([a-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, '$2')
  );
}

/**
 * Produce clean, single-line TM text from a raw segment:
 * strip markers → decode entities → flatten newlines → collapse ASCII runs.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanSegmentText(raw) {
  let t = stripMarkers(raw);
  t = decodeEntities(t);
  t = t.replace(/\s*\n\s*/g, ' '); // flatten hard wraps & paragraph breaks
  t = t.replace(/[ \t]{2,}/g, ' '); // collapse runs left by dropped markers
  return t.trim();
}

// ─── TMX serialization ────────────────────────────────────────────────

/**
 * Escape text for inclusion in XML element content.
 * @param {string} s
 * @returns {string}
 */
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Format a Date as a TMX `creationdate` value: YYYYMMDDTHHMMSSZ (UTC).
 * @param {Date} d
 * @returns {string}
 */
function tmxDate(d) {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Build a TMX 1.4b document from translation units.
 *
 * @param {Array<{book:string, chapter:string, module:string, segmentId:string, en:string, is:string}>} tus
 * @param {{ date?: Date, srclang?: string }} [opts]
 * @returns {string} TMX document
 */
function buildTmx(tus, opts = {}) {
  const date = tmxDate(opts.date || new Date());
  const srclang = opts.srclang || 'en';

  const header =
    `  <header creationtool="${TOOL_NAME}" creationtoolversion="${TOOL_VERSION}" ` +
    `segtype="paragraph" o-tmf="namsbokasafn" adminlang="en" srclang="${srclang}" ` +
    `datatype="plaintext" creationdate="${date}"/>`;

  const body = tus
    .map((tu) => {
      const props = [
        ['book', tu.book],
        ['chapter', tu.chapter],
        ['module', tu.module],
        ['segment-id', tu.segmentId],
      ]
        .map(([type, val]) => `      <prop type="${type}">${xmlEscape(val)}</prop>`)
        .join('\n');
      return [
        '    <tu>',
        props,
        `      <tuv xml:lang="en"><seg>${xmlEscape(tu.en)}</seg></tuv>`,
        `      <tuv xml:lang="is"><seg>${xmlEscape(tu.is)}</seg></tuv>`,
        '    </tu>',
      ].join('\n');
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE tmx SYSTEM "tmx14.dtd">\n' +
    '<tmx version="1.4">\n' +
    header +
    '\n  <body>\n' +
    (body ? body + '\n' : '') +
    '  </body>\n' +
    '</tmx>\n'
  );
}

// ─── Pairing ──────────────────────────────────────────────────────────

/**
 * Convert a chapter directory name to its display label.
 * @param {string} dirName - e.g. 'ch03' or 'appendices'
 * @returns {string} e.g. '3' or 'appendices'
 */
function chapterLabel(dirName) {
  const m = dirName.match(/^ch0*(\d+)$/);
  return m ? m[1] : dirName;
}

/**
 * Pair one module's EN and IS faithful segments into translation units.
 *
 * @param {string} enContent - 02-for-mt source file content
 * @param {string} isContent - 03-faithful-translation file content
 * @param {{book:string, chapter:string, module:string}} meta
 * @returns {{ tus: Array, stats: object }}
 */
function pairModule(enContent, isContent, meta) {
  const enMap = parseSegments(enContent);
  const isMap = parseSegments(isContent);

  const tus = [];
  const stats = { pairs: 0, missingIs: 0, emptyAfterStrip: 0, identical: 0, orphanIs: 0 };

  for (const [segmentId, enRaw] of enMap) {
    if (!isMap.has(segmentId)) {
      stats.missingIs++;
      continue;
    }
    const en = cleanSegmentText(enRaw);
    const is = cleanSegmentText(isMap.get(segmentId));
    if (!en || !is) {
      stats.emptyAfterStrip++;
      continue;
    }
    if (en === is) {
      stats.identical++; // kept, but reported — likely untranslated or a bare token
    }
    tus.push({ book: meta.book, chapter: meta.chapter, module: meta.module, segmentId, en, is });
    stats.pairs++;
  }

  // IS segments with no EN counterpart (faithful drifted from extraction)
  for (const segmentId of isMap.keys()) {
    if (!enMap.has(segmentId)) stats.orphanIs++;
  }

  return { tus, stats };
}

// ─── Collection over the book ─────────────────────────────────────────

/**
 * List faithful chapter directories for a book, optionally filtered.
 *
 * @param {string} book
 * @param {number|string|null} chapterFilter - chapter number, 'appendices', or null for all
 * @returns {string[]} directory names (e.g. ['ch03', 'appendices'])
 */
function listFaithfulChapterDirs(book, chapterFilter) {
  const faithfulRoot = path.join(BOOKS_DIR, book, '03-faithful-translation');
  if (!fs.existsSync(faithfulRoot)) return [];

  let dirs = fs
    .readdirSync(faithfulRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (/^ch\d+$/.test(d.name) || d.name === 'appendices'))
    .map((d) => d.name)
    .sort();

  if (chapterFilter !== null && chapterFilter !== undefined) {
    const want =
      chapterFilter === 'appendices' ? 'appendices' : `ch${String(chapterFilter).padStart(2, '0')}`;
    dirs = dirs.filter((d) => d === want);
  }
  return dirs;
}

/**
 * Generate translation units for a whole book (or one chapter).
 *
 * @param {string} book
 * @param {{ chapter?: number|string|null }} [opts]
 * @returns {{ tus: Array, modules: Array, totals: object }}
 */
function generateTm(book, opts = {}) {
  const chapterFilter = opts.chapter ?? null;
  const dirs = listFaithfulChapterDirs(book, chapterFilter);

  const tus = [];
  const modules = [];
  const totals = {
    modules: 0,
    pairs: 0,
    missingIs: 0,
    emptyAfterStrip: 0,
    identical: 0,
    orphanIs: 0,
    skippedNoEn: 0,
  };

  for (const dir of dirs) {
    const chapter = chapterLabel(dir);
    const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful-translation', dir);
    const enDir = path.join(BOOKS_DIR, book, '02-for-mt', dir);

    const files = fs
      .readdirSync(faithfulDir)
      .filter((f) => f.endsWith('-segments.is.md'))
      .sort();

    for (const file of files) {
      const moduleId = file.replace('-segments.is.md', '');
      const enPath = path.join(enDir, `${moduleId}-segments.en.md`);
      if (!fs.existsSync(enPath)) {
        totals.skippedNoEn++;
        modules.push({ chapter, module: moduleId, skipped: 'no EN source' });
        continue;
      }

      const enContent = fs.readFileSync(enPath, 'utf-8');
      const isContent = fs.readFileSync(path.join(faithfulDir, file), 'utf-8');
      const { tus: moduleTus, stats } = pairModule(enContent, isContent, {
        book,
        chapter,
        module: moduleId,
      });

      tus.push(...moduleTus);
      modules.push({ chapter, module: moduleId, ...stats });
      totals.modules++;
      totals.pairs += stats.pairs;
      totals.missingIs += stats.missingIs;
      totals.emptyAfterStrip += stats.emptyAfterStrip;
      totals.identical += stats.identical;
      totals.orphanIs += stats.orphanIs;
    }
  }

  return { tus, modules, totals };
}

// ─── CLI ──────────────────────────────────────────────────────────────

const OUT_OPTION = { name: 'out', flags: ['--out', '-o'], type: 'string', default: null };
const DRY_RUN_OPTION = {
  name: 'dryRun',
  flags: ['--dry-run', '-n'],
  type: 'boolean',
  default: false,
};

function defaultOutPath(book) {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(BOOKS_DIR, book, 'tm', `${book}-${date}.tmx`);
}

function printHelp() {
  console.log(`
${TOOL_NAME} - Generate a TMX translation memory from paired segment files

Pairs EN source segments (02-for-mt/) with human-reviewed IS segments
(03-faithful-translation/) by their SEG marker id, strips inline markers,
and emits a TMX 1.4b file. No Matecat Align, no manual alignment step.

Usage:
  node tools/generate-tm.js --book <book> [--chapter N] [--out <path>] [--dry-run]

Options:
  --book <slug>      Book slug (default: efnafraedi-2e)
  --chapter <N>      Limit to one chapter (number or 'appendices'); default all
  --out, -o <path>   Output TMX path (default: books/<book>/tm/<book>-<date>.tmx)
  --dry-run, -n      Report what would be written without writing
  --verbose, -v      Show per-module pairing stats
  -h, --help         Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    OUT_OPTION,
    DRY_RUN_OPTION,
  ]);

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);

  const book = args.book;
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const { tus, modules, totals } = generateTm(book, { chapter: args.chapter });

  if (args.verbose) {
    console.log(`\nPer-module pairing (${book}):`);
    for (const m of modules) {
      if (m.skipped) {
        console.log(`  ch${m.chapter} ${m.module}: SKIPPED (${m.skipped})`);
        continue;
      }
      const extras = [];
      if (m.missingIs) extras.push(`missingIs=${m.missingIs}`);
      if (m.emptyAfterStrip) extras.push(`empty=${m.emptyAfterStrip}`);
      if (m.identical) extras.push(`identical=${m.identical}`);
      if (m.orphanIs) extras.push(`orphanIs=${m.orphanIs}`);
      console.log(
        `  ch${m.chapter} ${m.module}: ${m.pairs} TU${extras.length ? '  [' + extras.join(' ') + ']' : ''}`
      );
    }
  }

  console.log('\n' + '='.repeat(56));
  console.log(`Book:               ${book}`);
  console.log(`Chapter filter:     ${args.chapter ?? '(all)'}`);
  console.log(`Modules paired:     ${totals.modules}`);
  console.log(`Translation units:  ${totals.pairs}`);
  if (totals.missingIs) console.log(`  segments missing IS side:     ${totals.missingIs}`);
  if (totals.emptyAfterStrip)
    console.log(`  empty after stripping:        ${totals.emptyAfterStrip}`);
  if (totals.identical) console.log(`  identical EN/IS (kept):       ${totals.identical}`);
  if (totals.orphanIs) console.log(`  IS segments with no EN match: ${totals.orphanIs}`);
  if (totals.skippedNoEn) console.log(`  modules skipped (no EN):      ${totals.skippedNoEn}`);

  if (totals.pairs === 0) {
    console.error(
      '\nNo translation units produced. Is there reviewed content in 03-faithful-translation/?'
    );
    process.exit(1);
  }

  const outPath = args.out || defaultOutPath(book);
  const tmx = buildTmx(tus, { date: new Date() });

  if (args.dryRun) {
    console.log(
      `\nDRY RUN — would write ${tus.length} TUs (${tmx.length} bytes) to:\n  ${outPath}`
    );
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, tmx, 'utf-8');
  console.log(`\nWrote ${tus.length} TUs to:\n  ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  parseSegments,
  decodeEntities,
  stripMarkers,
  cleanSegmentText,
  xmlEscape,
  tmxDate,
  buildTmx,
  chapterLabel,
  pairModule,
  listFaithfulChapterDirs,
  generateTm,
};

/** @internal Test-only: override the books directory root. */
export function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}
