// tools/lib/tm-export.cjs
'use strict';

/**
 * tm-export.cjs — Pairing + TMX serialization for TM export.
 *
 * The EN source segments (02-for-mt/) and the human-reviewed IS segments
 * (03-faithful-translation/) are already aligned 1:1 by their
 * `<!-- SEG:module:type:elementId -->` markers. This lib pairs them and
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
 * CommonJS boundary lib: extracted from tools/generate-tm.js (ESM CLI) so a
 * CommonJS server route can share the same code path (CJS cannot `require`
 * an ESM file; it can `require` a `.cjs`). generate-tm.js imports these
 * names and re-exports them for the existing CLI + tests.
 */

const fs = require('fs');
const path = require('path');
const { parseSegmentsMap } = require('./seg-markers.cjs');

const TOOL_NAME = 'generate-tm.js';
const TOOL_VERSION = '1.0';

// Books root: intrinsic (__dirname), never process.cwd() — server runs cwd=server/.
// tools/lib/../../books == repo-root/books.
let BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/** @internal Test-only: override the books directory root. */
function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

// ─── Segment parsing ─────────────────────────────────────────────────

/**
 * Parse a segment file into a Map of segmentId → text (first-wins).
 * Delegates to shared seg-markers.cjs (audit #14).
 * @param {string} content - Raw file content
 * @returns {Map<string, string>}
 */
function parseSegments(content) {
  return parseSegmentsMap(content);
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
 *   [[term:t|id]] / [[fn:t|id]] / [[em:t|class]] / [[u:t]] → t  (B4 id-anchored)
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
      // B4 id-anchored markers: keep the display text (left of the pipe).
      // Placed AFTER the inline rule so nested [[sub:]] inside term text is
      // already unwrapped when this runs. M1/M4: the text group tolerates a
      // [[MATH:n]] placeholder (kept verbatim) or one level of nested [[x:y]]
      // so the wrapper never leaks its id/pipe when term text carries math.
      .replace(
        /\[\[(?:term|fn|em):((?:\[\[MATH:\d+\]\]|\[\[[a-z]+:[^\]]*\]\]|[^\]|])*)\|[^\]]*\]\]/g,
        '$1'
      )
      .replace(/\[\[(?:term|fn|u):((?:\[\[MATH:\d+\]\]|\[\[[a-z]+:[^\]]*\]\]|[^\]])*)\]\]/g, '$1')
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
 * @param {{ date?: Date, srclang?: string, licence?: string }} [opts]
 * @returns {string} TMX document
 */
function buildTmx(tus, opts = {}) {
  const date = tmxDate(opts.date || new Date());
  const srclang = opts.srclang || 'en';

  const licenceProp = opts.licence
    ? `\n    <prop type="licence">${xmlEscape(opts.licence)}</prop>\n  `
    : '';
  const headerOpen =
    `  <header creationtool="${TOOL_NAME}" creationtoolversion="${TOOL_VERSION}" ` +
    `segtype="paragraph" o-tmf="namsbokasafn" adminlang="en" srclang="${srclang}" ` +
    `datatype="plaintext" creationdate="${date}"`;
  const header = licenceProp ? `${headerOpen}>${licenceProp}</header>` : `${headerOpen}/>`;

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

// ─── Multi-format serialization ───────────────────────────────────────

const FORMATS = ['tmx', 'csv', 'json'];

/**
 * RFC-4180 CSV field escape: quote fields with comma/quote/CR/LF; double inner quotes.
 * @param {*} value
 * @returns {string}
 */
function csvEscapeField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Serialize TUs as CSV: header + one row per TU. Every row carries the same
 * per-export licence (opts.licence), row-stamped like the corpus TSV.
 * @param {Array<{book,chapter,module,segmentId,en,is}>} tus
 * @param {{licence?:string}} [opts]
 * @returns {string}
 */
function serializeCsv(tus, opts = {}) {
  const licence = opts.licence || '';
  const rows = ['book,chapter,module,segment_id,en,is,licence'];
  for (const tu of tus) {
    rows.push(
      [tu.book, tu.chapter, tu.module, tu.segmentId, tu.en, tu.is, licence]
        .map(csvEscapeField)
        .join(',')
    );
  }
  return rows.join('\n') + '\n';
}

/**
 * Serialize TUs as a pretty JSON document with per-book licence in the manifest.
 * @param {Array} tus
 * @param {{date?:Date, book?:string, licence?:string, obtained?:string}} [opts]
 * @returns {string}
 */
function serializeJson(tus, opts = {}) {
  const doc = {
    generated: (opts.date || new Date()).toISOString(),
    tool: TOOL_NAME,
    version: TOOL_VERSION,
    book: opts.book || (tus[0] && tus[0].book) || null,
    licence: opts.licence || null,
    obtained: opts.obtained || null,
    stats: { units: tus.length },
    units: tus.map((tu) => ({
      book: tu.book,
      chapter: tu.chapter,
      module: tu.module,
      segmentId: tu.segmentId,
      en: tu.en,
      is: tu.is,
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

/**
 * Dispatch serialization by format. Passes opts (incl. licence/obtained) through
 * unchanged. Throws on unknown format. Licence LOOKUP is the caller's job.
 * @param {Array} tus
 * @param {'tmx'|'csv'|'json'} [format]
 * @param {{date?:Date, book?:string, srclang?:string, licence?:string, obtained?:string}} [opts]
 * @returns {string}
 */
function serializeTm(tus, format = 'tmx', opts = {}) {
  switch (format) {
    case 'tmx':
      return buildTmx(tus, opts);
    case 'csv':
      return serializeCsv(tus, opts);
    case 'json':
      return serializeJson(tus, opts);
    default:
      throw new Error(`Unknown TM format: ${format} (valid: ${FORMATS.join(', ')})`);
  }
}

module.exports = {
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
  TOOL_NAME,
  TOOL_VERSION,
  _setTestBooksDir,
  FORMATS,
  serializeCsv,
  serializeJson,
  serializeTm,
};
