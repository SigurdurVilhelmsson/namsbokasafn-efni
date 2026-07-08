#!/usr/bin/env node

/**
 * cnxml-render.js
 *
 * Render CNXML to semantic HTML for web publication.
 * Part of the Extract-Translate-Inject pipeline.
 *
 * Takes translated CNXML and produces:
 *   - Semantic HTML5 with all IDs preserved
 *   - MathJax SVG for equation rendering
 *   - Embedded page data JSON
 *
 * Usage:
 *   node tools/cnxml-render.js --chapter <num> [--module <id>] [options]
 *
 * Options:
 *   --chapter <num>    Chapter number
 *   --module <id>      Specific module ID (default: all in chapter)
 *   --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
 *   --lang <code>      Output language code (default: is)
 *   --verbose          Show detailed progress
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import { renderMathML, resetMathJaxIds } from './lib/mathjax-render.js';
import {
  parseCnxmlDocument,
  extractNestedElements,
  extractElements,
  parseAttributes,
  stripTags,
} from './lib/cnxml-parser.js';
import { parseCnxmlFragment, serializeCnxmlFragment } from './lib/cnxml-dom.js';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';
import {
  buildCrossModuleHref,
  escapeAttr,
  escapeHtml,
  processInlineContent,
  renderFootnotesSection,
  translateLatexText,
} from './lib/cnxml-elements.js';
import {
  convertMathMLToLatex,
  localizeNumbersInMathML,
  localizeMathMLText,
} from './lib/mathml-to-latex.js';
import { buildModuleSections } from './lib/module-sections.js';
import { safeWrite, logBackup } from './lib/safeWrite.js';
import {
  getBookRenderConfig,
  generateFallbackLabel,
  getExerciseSectionClasses,
} from './lib/book-rendering-config.js';
import { loadEmbedMapping, renderEmbedHtml } from './lib/embed-mapping.js';

// Matches editor/pipeline artifact files that must never live in or sync from
// the publication dir: safeWrite backups, manual `.pre-fix-*`, `.bak`, and any
// leftover atomic-write temp files. Used by the pre-render output sweep (#9).
function isPublicationArtifact(name) {
  return /\.backup\.|\.pre-fix-|\.bak$|\.tmp\.[0-9a-f]+$/.test(name);
}

// =====================================================================
// NOTE TYPE LABELS (loaded from book config)
// =====================================================================

// These are populated by loadBookConfig() in main()
let NOTE_TYPE_LABELS = {};
let TITLE_TRANSLATIONS = {};
let BOOK_CONFIG = null;
let EMBED_MAP = {};

/**
 * Get the display label for a note type.
 * Uses the book-specific config with fallback label generation.
 * @param {string} noteClass - The note's class attribute
 * @returns {string|null} The display label or null
 */
function getNoteTypeLabel(noteClass) {
  if (!noteClass) return null;
  // Try exact match first
  if (NOTE_TYPE_LABELS[noteClass]) {
    return NOTE_TYPE_LABELS[noteClass];
  }
  // Try partial match (for compound classes like "microbiology clinical-focus")
  for (const [key, label] of Object.entries(NOTE_TYPE_LABELS)) {
    if (key !== 'default' && noteClass.includes(key)) {
      return label;
    }
  }
  // Generate a readable fallback label for unknown note types
  // (e.g., 'clinical-focus' → 'Clinical Focus')
  // Skip fallback for 'default' — these are classless notes whose <title> already identifies them
  if (NOTE_TYPE_LABELS.default === null && noteClass !== 'default') {
    return generateFallbackLabel(noteClass);
  }
  return null;
}

function translateTitle(title) {
  const trimmed = title.trim();
  return TITLE_TRANSLATIONS[trimmed] || title;
}

// A CNXML <title> may contain inline markup (<emphasis>, <sub>, <sup>, <m:math>).
// The old /<title>([^<]+)<\/title>/ pattern used `[^<]+`, which stops at the first
// child tag, so it silently failed on such titles — the WS5 residual example
// corruption (title leaked as literal text, and the next plain-text para-title
// wrongly became the example <h4>). Match the LEADING <title>…</title>
// non-greedily so the inner markup is captured whole.
const LEADING_TITLE_RE = /^\s*<title>([\s\S]*?)<\/title>\s*/;
function matchLeadingTitle(content) {
  const m = content.match(LEADING_TITLE_RE);
  if (!m) return { title: null, rest: content };
  return { title: m[1], rest: content.replace(LEADING_TITLE_RE, '') };
}

// =====================================================================
// CONFIGURATION
// =====================================================================

let BOOKS_DIR = 'books/efnafraedi-2e';
let BOOK_SLUG = 'efnafraedi-2e';

/**
 * Join a content-derived name onto a base directory, returning null if the
 * result would escape the base (e.g. a `..`-bearing exercise nickname or a
 * URL-decoded image filename). Defense-in-depth for F17 — these names come
 * from CNXML/rendered HTML, not a fully trusted source.
 */
function safeJoin(baseDir, name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const resolvedBase = path.resolve(baseDir);
  const candidate = path.resolve(resolvedBase, name);
  if (candidate !== resolvedBase && !candidate.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return candidate;
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Look up cached exercise content for an os-embed reference.
 * Returns { stimulus, questions, solutionsPublic } or null if not cached.
 */
function resolveOsEmbed(nickname) {
  // BOOKS_DIR points to books/{bookSlug}
  const exercisesDir = path.join(BOOKS_DIR, '01-source', 'exercises');
  const cachePath = safeJoin(exercisesDir, `${nickname}.json`);
  if (!cachePath || !fs.existsSync(cachePath)) return null;

  try {
    const exercise = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return {
      stimulus: exercise.stimulus_html || '',
      questions: (exercise.questions || []).map((q) => ({
        id: q.id,
        stem: q.stem_html || '',
        solutions: (q.collaborator_solutions || []).map((s) => s.content_html || ''),
      })),
      solutionsPublic: exercise.solutions_are_public || false,
    };
  } catch {
    return null;
  }
}

/**
 * Format chapter for use in directory paths.
 * @param {number|string} chapter - Chapter number or "appendices"
 * @returns {string} Formatted chapter string (e.g., "ch01", "appendices")
 */
function formatChapterDir(chapter) {
  if (chapter === 'appendices') {
    return 'appendices';
  }
  return `ch${String(chapter).padStart(2, '0')}`;
}

/**
 * Format chapter for use in output paths (without "ch" prefix).
 * @param {number|string} chapter - Chapter number or "appendices"
 * @returns {string} Formatted chapter string (e.g., "01", "appendices")
 */
function formatChapterOutput(chapter) {
  if (chapter === 'appendices') {
    return 'appendices';
  }
  return String(chapter).padStart(2, '0');
}

/**
 * Normalize an <image src=...> value to a vefur-absolute URL.
 *
 * Handles three input shapes:
 *   "../../media/foo.jpg"   — canonical CNXML form
 *   "foo.jpg" or "sub/x.jpg" — bare filename (occurs in some sources where
 *                              the path prefix was dropped, e.g. inside
 *                              commented-out solution blocks)
 *   "/…" or "http(s)://…"   — already absolute, returned unchanged
 */
function normalizeImageSrc(src, bookSlug, chapterStr) {
  if (!src) return src;
  if (/^(https?:)?\//.test(src)) return src;
  const basename = src.startsWith('../../media/')
    ? src.replace('../../media/', '')
    : src.includes('/')
      ? src.split('/').pop()
      : src;
  return `/content/${bookSlug}/chapters/${chapterStr}/images/media/${basename}`;
}

/**
 * Build path to a translated CNXML file.
 *
 * Faithful is an overlay over the complete mt-preview baseline. When a faithful
 * module hasn't been reviewed yet, fall back to its mt-preview CNXML so chapter
 * rollups (Samantekt/Lykilhugtök/Lykilformúlur/Æfingar/Svarlykill) cover the
 * whole chapter instead of just the reviewed sections (#1). Per-module section
 * pages iterate the faithful module list directly, so they always hit a real
 * faithful file and never trigger this fallback — only rollup/chapter-wide reads
 * (driven by the union `allModules`) reach unreviewed modules.
 *
 * @param {string} track - Publication track (mt-preview, faithful, localized)
 * @param {string} chapterDir - Formatted chapter directory (e.g., "ch01", "appendices")
 * @param {string} moduleId - Module ID (e.g., "m68724")
 * @returns {string} Path to translated CNXML file
 */
function translatedCnxmlPath(track, chapterDir, moduleId) {
  const primary = path.join(BOOKS_DIR, '03-translated', track, chapterDir, `${moduleId}.cnxml`);
  if (track === 'faithful' && !fs.existsSync(primary)) {
    const fallback = path.join(
      BOOKS_DIR,
      '03-translated',
      'mt-preview',
      chapterDir,
      `${moduleId}.cnxml`
    );
    if (fs.existsSync(fallback)) return fallback;
  }
  return primary;
}

/**
 * Load equation text translation dictionary for a book.
 * Returns entries sorted longest-first for correct matching priority.
 * @param {string} book - Book name (e.g., 'efnafraedi')
 * @returns {Array<[string, string]>|null} Sorted [english, icelandic] pairs, or null
 */
function loadEquationTextDictionary(book) {
  const dictPath = path.join('books', book, 'glossary', 'equation-text.json');
  try {
    const data = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    const entries = Object.entries(data.translations);
    // Sort longest-first to avoid partial matches (e.g., "mass of substance" before "mass")
    entries.sort((a, b) => b[0].length - a[0].length);
    return entries;
  } catch {
    return null;
  }
}

/**
 * Build a lookup of element ids that live in the book's appendices, each mapped
 * to its appendix letter + output basename. resolveCrossModuleHref consults it
 * to resolve a chapter→appendix cross-reference — which the chapter-scoped
 * `chapterIdToModule` can't see, because appendices render in a separate pass —
 * to the appendix landing URL (A1). Cheap: a handful of appendix modules,
 * scanned once per render. The letter formula (1→A) matches vefur's
 * `generate-toc.js`; keep the two in sync (shared contract).
 * @param {string} book - Book slug
 * @param {string} track - Publication track
 * @returns {Map<string,{letter:string,basename:string}>}
 */
function buildAppendixIdMap(book, track) {
  const map = new Map();
  let appendixSections;
  try {
    appendixSections = buildModuleSections(book, 'appendices');
  } catch {
    return map; // book has no appendices
  }
  for (const [moduleId, info] of Object.entries(appendixSections)) {
    if (moduleId.startsWith('_') || !info || info.section == null) continue;
    const n = parseInt(info.section, 10);
    if (!Number.isFinite(n) || n < 1 || n > 26) continue;
    const letter = String.fromCharCode(64 + n); // 1→A — matches vefur generate-toc.js
    const basename = `appendices-${info.section}-${info.slug}`;
    let cnxmlPath = path.join(
      'books',
      book,
      '03-translated',
      track,
      'appendices',
      `${moduleId}.cnxml`
    );
    if (!fs.existsSync(cnxmlPath) && track === 'faithful') {
      cnxmlPath = path.join(
        'books',
        book,
        '03-translated',
        'mt-preview',
        'appendices',
        `${moduleId}.cnxml`
      );
    }
    if (!fs.existsSync(cnxmlPath)) continue;
    const cnxml = fs.readFileSync(cnxmlPath, 'utf-8');
    const idPattern = /\sid="([^"]+)"/g;
    let m;
    while ((m = idPattern.exec(cnxml)) !== null) {
      if (!map.has(m[1])) map.set(m[1], { letter, basename });
    }
  }
  return map;
}

/**
 * Roll back the files written during a render pass after a mid-pass failure.
 * For each file, restore its newest `.backup.<ts>` (the pre-overwrite copy
 * safeWrite made), or delete it if it was brand-new this pass (no backup).
 * Best-effort per file — a render must never destroy previously-published
 * pages on a partial failure (QA §0.2 / remediation Unit 0).
 * @param {string[]} writtenFiles - Absolute paths written this pass
 * @returns {{restored:number, deleted:number}}
 */
function rollbackWrittenFiles(writtenFiles) {
  let restored = 0;
  let deleted = 0;
  for (const f of writtenFiles) {
    try {
      const dir = path.dirname(f);
      const prefix = `${path.basename(f)}.backup.`;
      const backups = fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter((name) => name.startsWith(prefix))
            .sort() // ISO-ish timestamp suffix sorts chronologically
        : [];

      if (backups.length > 0) {
        // Restore the most recent backup (this pass's pre-overwrite copy)
        const newest = path.join(dir, backups[backups.length - 1]);
        fs.renameSync(newest, f); // restore + consume the backup atomically
        restored++;
      } else if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        deleted++;
      }
    } catch {
      /* best-effort rollback */
    }
  }
  return { restored, deleted };
}

// Module sections are built dynamically from structure + segment files
// via buildModuleSections() — see tools/lib/module-sections.js

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseCliArgs(args) {
  return parseArgs(args, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
    { name: 'lang', flags: ['--lang'], type: 'string', default: 'is' },
  ]);
}

function printHelp() {
  console.log(`
cnxml-render.js - Render CNXML to semantic HTML

Part of the Extract-Translate-Inject pipeline for OpenStax content translation.
Produces publication-ready HTML with preserved IDs and MathJax SVG equations.

Usage:
  node tools/cnxml-render.js --chapter <num> [--module <id>]
  node tools/cnxml-render.js --chapter appendices

Options:
  --chapter <num|appendices>  Chapter number or "appendices"
  --module <id>      Specific module ID (default: all in chapter)
  --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
  --lang <code>      Output language code (default: is)
  --verbose          Show detailed progress
  -h, --help         Show this help

Input:
  03-translated/<track>/chNN/<module>.cnxml    Translated CNXML

Output:
  05-publication/<track>/chapters/NN/<section>.html    Publication HTML

Examples:
  node tools/cnxml-render.js --chapter 5
  node tools/cnxml-render.js --chapter 5 --module m68724 --track faithful
`);
}

// =====================================================================
// HTML DOCUMENT BUILDING
// =====================================================================

/**
 * Build complete HTML document from CNXML.
 * @param {string} cnxml - CNXML content
 * @param {Object} options - Render options
 * @returns {Object} { html, pageData }
 */
function renderCnxmlToHtml(cnxml, options = {}) {
  const verbose = options.verbose || false;
  const lang = options.lang || 'is';
  const chapter = options.chapter;
  const moduleId = options.moduleId;

  // D6: honor a per-call book config so inline AND server renders resolve
  // per-book note labels instead of the module-global default. No-op for the
  // CLI path, which sets these globals in main() and passes no options.bookConfig.
  if (options.bookConfig) {
    BOOK_CONFIG = options.bookConfig;
    NOTE_TYPE_LABELS = options.bookConfig.noteTypeLabels || {};
  }

  // D4: accept a caller-supplied map (test path, server preview path, future callers).
  // CLI path loads it in main() via loadEmbedMapping(BOOK_SLUG).
  // Server preview path (renderService.js) now loads it via loadEmbedMapping(book)
  // and passes it as options.embedMap, so the module global is never left empty
  // for a book that has a committed embed-mapping.json.
  if (options.embedMap) EMBED_MAP = options.embedMap;

  // Parse CNXML
  const doc = parseCnxmlDocument(cnxml);
  const title = options.titleOverride || doc.title;

  // Pre-scan: collect all figure IDs and assign numbers
  // This enables forward references like "(Figure 5.3)" before the figure appears
  const figureNumbers = new Map();
  const figureIdPattern = /<figure\s+id="([^"]+)"/g;
  let figMatch;
  let figCounter = 0;
  while ((figMatch = figureIdPattern.exec(cnxml)) !== null) {
    figCounter++;
    figureNumbers.set(figMatch[1], `${chapter}.${figCounter}`);
  }

  // Pre-scan: collect all table IDs and assign numbers
  const tableNumbers = new Map();
  const tableIdPattern = /<table\s+[^>]*id="([^"]+)"/g;
  let tableMatch;
  let tableCounter = 0;
  while ((tableMatch = tableIdPattern.exec(cnxml)) !== null) {
    tableCounter++;
    tableNumbers.set(tableMatch[1], `${chapter}.${tableCounter}`);
  }

  // Pre-scan: collect all numbered equation IDs and assign numbers
  // Skip equations with class="unnumbered"
  const equationNumbers = new Map();
  const equationPattern = /<equation\s+([^>]*?)>/g;
  let eqMatch;
  let eqCounter = 0;
  while ((eqMatch = equationPattern.exec(cnxml)) !== null) {
    const attrs = eqMatch[1];
    // Skip if unnumbered
    if (attrs.includes('class="unnumbered"')) continue;
    // Extract id
    const idMatch = attrs.match(/id="([^"]+)"/);
    if (idMatch) {
      eqCounter++;
      equationNumbers.set(idMatch[1], `${chapter}.${eqCounter}`);
    }
  }

  // Context for rendering
  const context = {
    chapter,
    bookSlug: BOOK_SLUG,
    embedMap: EMBED_MAP,
    moduleId,
    equations: [],
    terms: {},
    figures: [],
    figureNumbers, // Map of figure ID -> "Chapter.Number" (this module only)
    tableNumbers, // Map of table ID -> "Chapter.Number" (this module only)
    equationNumbers, // Map of equation ID -> "Chapter.Number" (this module only)
    chapterFigureNumbers: options.chapterFigureNumbers || figureNumbers, // chapter-wide
    chapterTableNumbers: options.chapterTableNumbers || tableNumbers, // chapter-wide
    chapterEquationNumbers: options.chapterEquationNumbers || equationNumbers, // chapter-wide
    chapterExampleNumbers: options.chapterExampleNumbers || new Map(), // chapter-wide
    chapterExerciseNumbers: options.chapterExerciseNumbers || new Map(), // chapter-wide
    chapterSectionTitles: options.chapterSectionTitles || new Map(), // section ID -> title
    chapterIdToModule: options.chapterIdToModule || new Map(), // elementId -> moduleId[]
    appendixIdMap: options.appendixIdMap || new Map(), // appendix elementId -> { letter, basename } (A1)
    relocatedIds: options.relocatedIds || new Map(), // elementId -> compiled-page basename (#3)
    currentPageBasename: options.currentPageBasename || null, // set when rendering a compiled page (#3)
    moduleSections: options.moduleSections || {}, // for cross-module href resolution
    crossModuleSections: options.crossModuleSections || null, // fallback used by answer-key etc.
    verbose, // propagate verbose flag for link warnings
    equationTextDictionary: options.equationTextDictionary || null, // equation text translations
    excludeSections: options.excludeSections !== false, // Allow disabling section exclusion
    includeSolutions: options.includeSolutions || false, // Only show solutions on answer key pages
    figureCounter: 0,
    footnoteCounter: 0,
    exampleCounter: 0,
    equationCounter: 0,
    exerciseCounter: 0, // Add exercise counter
    renderedFigureIds: new Set(), // Track rendered figures to prevent duplicates
    renderedTableIds: new Set(), // Track rendered tables (example-child vs section pass)
    undispatchedBlocks: [], // Loud seam: block elements no dispatch map handled
  };

  // Render content
  const contentHtml = renderContent(doc.rawContent, context, verbose);

  // Get section info from dynamically built module sections
  const moduleSections = options.moduleSections || {};
  const sectionInfo = moduleSections[moduleId] || { section: '0', titleEn: title };
  const sectionNumber = `${chapter}.${sectionInfo.section}`;

  // Build page data
  const pageData = {
    moduleId,
    chapter,
    section: sectionNumber,
    title,
    equations: context.equations,
    terms: context.terms,
    // Learning objectives as structured data (same source as the rendered
    // .learning-objectives block). Lets vefur drive objective tracking without
    // scraping HTML; empty array when the module declares no abstract.
    objectives: (doc.metadata.abstract && doc.metadata.abstract.items) || [],
    _renderStats: context.renderStats || { equations: 0, success: 0, failures: [] },
  };

  // Build chapter outline for intro pages (not end-of-chapter sections)
  const isIntro =
    (sectionInfo.section === '0' || doc.documentClass === 'introduction') &&
    !options.isEndOfChapter;
  let chapterOutline = null;
  if (isIntro && moduleSections) {
    chapterOutline = Object.entries(moduleSections)
      .filter(([key, info]) => info.section !== '0' && !key.startsWith('_')) // Exclude intro and metadata
      .sort((a, b) => Number(a[1].section) - Number(b[1].section))
      .map(([, info]) => {
        const section = `${chapter}.${info.section}`;
        // Absolute reader URL (e.g. /efnafraedi-2e/kafli/01/1-1-foo), built
        // through the same helper as cross-module xrefs. Relative hrefs broke
        // here because the intro page is served at a trailing-slash URL
        // (trailingSlash='always' in vefur), making sections resolve as
        // subpages of the intro instead of siblings.
        const basename = `${section.replace('.', '-')}-${info.slug}`;
        return {
          section,
          title: info.titleIs || info.titleEn,
          slug: info.slug,
          href: buildCrossModuleHref(`${basename}.html`, null, context),
        };
      });

    // Add translated chapter title to page data
    if (moduleSections._chapterTitle) {
      pageData.chapterTitle = moduleSections._chapterTitle;
    }
  }

  // Build HTML document
  const html = buildHtmlDocument({
    title,
    lang,
    content: contentHtml,
    pageData,
    sectionNumber,
    isIntro,
    abstract: doc.metadata.abstract,
    context, // Pass context for footnotes rendering
    chapterOutline,
  });

  return { html, pageData, undispatchedBlocks: context.undispatchedBlocks };
}

/**
 * Escape a JSON string for safe embedding inside a <script> block.
 *
 * The page-data JSON carries translated titles/terms; a value containing
 * "</script>" (or any "<") would otherwise close the
 * <script type="application/json"> element early and inject markup into the
 * published page. Escaping "<" as "<" keeps the JSON valid and inert.
 */
function escapeJsonForScript(jsonStr) {
  return jsonStr.replace(/</g, '\\u003c');
}

/**
 * Build complete HTML document.
 */
function buildHtmlDocument(options) {
  const {
    title,
    lang,
    content,
    pageData,
    sectionNumber,
    isIntro,
    abstract,
    context,
    chapterOutline,
  } = options;

  const lines = [];

  lines.push('<!DOCTYPE html>');
  lines.push(`<html lang="${lang}">`);
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>${escapeHtml(sectionNumber ? `${sectionNumber} ${title}` : title)}</title>`);
  lines.push('  <link rel="stylesheet" href="/styles/content.css">');
  lines.push('</head>');
  lines.push('<body>');

  // Article wrapper
  lines.push(
    `  <article class="cnx-module${isIntro ? ' introduction' : ''}" data-module-id="${escapeAttr(pageData.moduleId)}">`
  );

  // Header with title and learning objectives
  lines.push('    <header>');
  lines.push(`      <h1 id="title">${escapeHtml(title)}</h1>`);

  // Learning objectives (from abstract)
  if (abstract && abstract.items && abstract.items.length > 0) {
    lines.push('      <div class="learning-objectives">');
    lines.push('        <h2>Námsmarkmið</h2>');
    if (abstract.intro) {
      lines.push(`        <p>${escapeHtml(abstract.intro)}</p>`);
    }
    lines.push('        <ul>');
    for (const item of abstract.items) {
      lines.push(`          <li>${escapeHtml(item)}</li>`);
    }
    lines.push('        </ul>');
    lines.push('      </div>');
  }

  lines.push('    </header>');

  // Main content — for intro pages, insert chapter outline after splash figure
  lines.push('    <main>');
  if (isIntro && chapterOutline && chapterOutline.length > 0) {
    // Insert chapter outline after the first </figure> (the splash image)
    const figureEndIdx = content.indexOf('</figure>');
    if (figureEndIdx !== -1) {
      const insertPos = figureEndIdx + '</figure>'.length;
      const beforeOutline = content.slice(0, insertPos);
      const afterOutline = content.slice(insertPos);

      lines.push(beforeOutline);
      lines.push('      <nav class="chapter-outline">');
      lines.push('        <h2>Yfirlit kafla</h2>');
      lines.push('        <ul>');
      for (const item of chapterOutline) {
        lines.push(
          `          <li><a href="${item.href}">${item.section} ${escapeHtml(item.title)}</a></li>`
        );
      }
      lines.push('        </ul>');
      lines.push('      </nav>');
      lines.push(afterOutline);
    } else {
      // No splash figure found — put outline before all content
      lines.push('      <nav class="chapter-outline">');
      lines.push('        <h2>Yfirlit kafla</h2>');
      lines.push('        <ul>');
      for (const item of chapterOutline) {
        lines.push(
          `          <li><a href="${item.href}">${item.section} ${escapeHtml(item.title)}</a></li>`
        );
      }
      lines.push('        </ul>');
      lines.push('      </nav>');
      lines.push(content);
    }
  } else {
    lines.push(content);
  }
  lines.push('    </main>');

  // Footnotes section (if any)
  if (context && context.footnotes && context.footnotes.length > 0) {
    lines.push(renderFootnotesSection(context));
  }

  lines.push('  </article>');

  // Page data script (strip internal fields prefixed with _)
  const publicPageData = Object.fromEntries(
    Object.entries(pageData).filter(([key]) => !key.startsWith('_'))
  );
  lines.push(`  <script type="application/json" id="page-data">`);
  lines.push(escapeJsonForScript(JSON.stringify(publicPageData, null, 2)));
  lines.push('  </script>');

  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

// =====================================================================
// CONTENT RENDERING
// =====================================================================

/**
 * Render CNXML content to HTML.
 * Preserves document order by interleaving sections and top-level content.
 */
function renderContent(content, context, _verbose) {
  const lines = renderChildrenInDocumentOrder(content, context, {
    excludeSections: context.excludeSections,
    sectionLevel: 2,
  });

  // Process glossary (always at end)
  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (glossaryMatch) {
    lines.push(renderGlossary(glossaryMatch[1], context));
  }

  return lines.join('\n');
}

/**
 * Render the direct children of a content block (sections + loose elements)
 * in document order. Returns one rendered HTML string per child.
 *
 * Shared by renderContent (top-level content) and renderSection (nested
 * sections), so both preserve document order the same way.
 */
function renderChildrenInDocumentOrder(content, context, { excludeSections, sectionLevel }) {
  const lines = [];

  // Sections to exclude from main content (they have their own pages)
  // Loaded from book config — varies by book (e.g., Biology uses multiple-choice, critical-thinking)
  let EXCLUDED_SECTION_CLASSES = BOOK_CONFIG
    ? [...BOOK_CONFIG.excludedSectionClasses]
    : ['summary', 'key-equations', 'exercises'];

  // If sectionExercises is 'both', keep section-exercises inline (don't exclude them)
  if (BOOK_CONFIG && BOOK_CONFIG.sectionExercises === 'both') {
    EXCLUDED_SECTION_CLASSES = EXCLUDED_SECTION_CLASSES.filter(
      (cls) => cls !== 'section-exercises'
    );
  }

  // Extract sections
  const sections = extractNestedElements(content, 'section');

  // Get content without sections for top-level elements
  const contentWithoutSections = removeNestedElements(content, 'section');

  // Collect all renderable items with their positions
  const itemsWithPositions = [];

  // Add sections with their positions
  for (const section of sections) {
    const sectionClass = section.attributes.class || '';
    // Only exclude sections if excludeSections flag is true (default)
    // When rendering standalone sections, excludeSections will be false
    const shouldExclude =
      excludeSections && EXCLUDED_SECTION_CLASSES.some((cls) => sectionClass.includes(cls));
    if (shouldExclude) {
      continue;
    }
    const position = section.fullMatch ? content.indexOf(section.fullMatch) : 0;
    itemsWithPositions.push({
      type: 'section',
      item: section,
      position,
    });
  }

  // Add top-level elements with their positions
  // Extract and position each top-level element type
  const figures = extractNestedElements(contentWithoutSections, 'figure');
  const notes = extractNestedElements(contentWithoutSections, 'note');
  const examples = extractNestedElements(contentWithoutSections, 'example');
  const exercises = extractNestedElements(contentWithoutSections, 'exercise');
  const tables = extractNestedElements(contentWithoutSections, 'table');

  // For simple elements, strip containers first
  // IMPORTANT: Strip examples and exercises BEFORE notes, because examples/exercises
  // can contain nested notes. If we strip notes first, the example.fullMatch won't
  // match anymore (the note inside it was already removed from simpleContent).
  let simpleContent = contentWithoutSections;
  for (const e of examples) if (e.fullMatch) simpleContent = simpleContent.replace(e.fullMatch, '');
  for (const e of exercises) {
    if (e.fullMatch) simpleContent = simpleContent.replace(e.fullMatch, '');
  }
  for (const n of notes) if (n.fullMatch) simpleContent = simpleContent.replace(n.fullMatch, '');
  for (const f of figures) if (f.fullMatch) simpleContent = simpleContent.replace(f.fullMatch, '');
  for (const t of tables) if (t.fullMatch) simpleContent = simpleContent.replace(t.fullMatch, '');

  // Extract standalone media elements (not inside figures — those are already stripped)
  const medias = extractNestedElements(simpleContent, 'media');
  for (const m of medias) if (m.fullMatch) simpleContent = simpleContent.replace(m.fullMatch, '');

  const lists = extractNestedElements(simpleContent, 'list');
  for (const lst of lists)
    if (lst.fullMatch) simpleContent = simpleContent.replace(lst.fullMatch, '');
  const equations = extractElements(simpleContent, 'equation');
  const paras = extractElements(simpleContent, 'para');

  // Add all top-level elements with positions (use original content for position finding)
  for (const fig of figures) {
    const pos = fig.fullMatch ? content.indexOf(fig.fullMatch) : content.indexOf(`id="${fig.id}"`);
    itemsWithPositions.push({ type: 'figure', item: fig, position: pos !== -1 ? pos : 0 });
  }

  // Only add notes that are NOT inside examples or exercises
  // (notes inside examples/exercises will be rendered by renderExample/renderExercise)
  for (const note of notes) {
    const notePos = note.fullMatch
      ? content.indexOf(note.fullMatch)
      : content.indexOf(`id="${note.id}"`);

    // Check if this note is inside any example
    const isInsideExample = examples.some((ex) => {
      if (!ex.fullMatch || !note.fullMatch) return false;
      const exPos = content.indexOf(ex.fullMatch);
      return notePos >= exPos && notePos < exPos + ex.fullMatch.length;
    });

    // Check if this note is inside any exercise
    const isInsideExercise = exercises.some((ex) => {
      if (!ex.fullMatch || !note.fullMatch) return false;
      const exPos = content.indexOf(ex.fullMatch);
      return notePos >= exPos && notePos < exPos + ex.fullMatch.length;
    });

    if (!isInsideExample && !isInsideExercise) {
      itemsWithPositions.push({ type: 'note', item: note, position: notePos !== -1 ? notePos : 0 });
    }
  }

  for (const ex of examples) {
    const pos = ex.fullMatch ? content.indexOf(ex.fullMatch) : content.indexOf(`id="${ex.id}"`);
    itemsWithPositions.push({ type: 'example', item: ex, position: pos !== -1 ? pos : 0 });
  }
  for (const ex of exercises) {
    const pos = ex.fullMatch ? content.indexOf(ex.fullMatch) : content.indexOf(`id="${ex.id}"`);
    itemsWithPositions.push({ type: 'exercise', item: ex, position: pos !== -1 ? pos : 0 });
  }
  for (const tbl of tables) {
    const pos = tbl.fullMatch ? content.indexOf(tbl.fullMatch) : content.indexOf(`id="${tbl.id}"`);
    itemsWithPositions.push({ type: 'table', item: tbl, position: pos !== -1 ? pos : 0 });
  }
  for (const media of medias) {
    const pos = media.fullMatch
      ? content.indexOf(media.fullMatch)
      : content.indexOf(`id="${media.id}"`);
    itemsWithPositions.push({ type: 'media', item: media, position: pos !== -1 ? pos : 0 });
  }
  for (const lst of lists) {
    const pos = lst.fullMatch ? content.indexOf(lst.fullMatch) : content.indexOf(`id="${lst.id}"`);
    itemsWithPositions.push({ type: 'list', item: lst, position: pos !== -1 ? pos : 0 });
  }
  for (const eq of equations) {
    const pos = eq.fullMatch ? content.indexOf(eq.fullMatch) : content.indexOf(`id="${eq.id}"`);
    itemsWithPositions.push({ type: 'equation', item: eq, position: pos !== -1 ? pos : 0 });
  }
  for (const para of paras) {
    const pos = para.id ? content.indexOf(`id="${para.id}"`) : content.indexOf('<para');
    itemsWithPositions.push({ type: 'para', item: para, position: pos !== -1 ? pos : 0 });
  }

  // Sort by position to preserve document order
  itemsWithPositions.sort((a, b) => a.position - b.position);

  // Render in document order
  for (const { type, item } of itemsWithPositions) {
    switch (type) {
      case 'section':
        lines.push(renderSection(item, context, sectionLevel));
        break;
      case 'figure':
        lines.push(renderFigure(item, context));
        break;
      case 'note':
        lines.push(renderNote(item, context));
        break;
      case 'example':
        lines.push(renderExample(item, context));
        break;
      case 'exercise':
        lines.push(renderExercise(item, context));
        break;
      case 'table':
        lines.push(renderTable(item, context));
        break;
      case 'media':
        lines.push(renderMedia(item, context));
        break;
      case 'list':
        lines.push(renderList(item, context));
        break;
      case 'equation':
        lines.push(renderEquation(item, context));
        break;
      case 'para':
        lines.push(renderPara(item, context));
        break;
    }
  }

  return lines;
}

/**
 * Render a section element.
 */
function renderSection(section, context, level) {
  const lines = [];
  const id = section.id || null;
  const className = section.attributes.class || null;

  lines.push(
    `<section${id ? ` id="${escapeAttr(id)}"` : ''}${className ? ` class="${escapeAttr(className)}"` : ''}>`
  );

  // Extract and render title. [\s\S]*? (not [^<]+) so a section <title> carrying
  // inline markup (<sub>/<em>/math) is captured whole and not leaked — same bug
  // class fixed for examples via matchLeadingTitle. h-level already renders markup
  // via processInlineContent, so this is output-neutral for plain titles.
  const titleMatch = section.content.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    lines.push(`  <h${level}>${processInlineContent(titleMatch[1], context)}</h${level}>`);
  }

  // Remove title from content
  const contentWithoutTitle = section.content.replace(/<title>[\s\S]*?<\/title>/, '');

  // Render children (loose content + nested subsections) in document order.
  // excludeSections:false preserves the prior behaviour of rendering all nested
  // subsections; sectionLevel deepens the heading for nested sections (capped at 6).
  lines.push(
    ...renderChildrenInDocumentOrder(contentWithoutTitle, context, {
      excludeSections: false,
      sectionLevel: Math.min(level + 1, 6),
    })
  );

  lines.push('</section>');
  return lines.join('\n');
}

/**
 * Render a paragraph.
 */
function renderPara(para, context) {
  const id = para.id || null;
  const processedContent = processInlineContent(para.content, context);
  return `<p${id ? ` id="${escapeAttr(id)}"` : ''}>${processedContent}</p>`;
}

/**
 * Render a figure.
 * Skips rendering if the figure has already been rendered (tracked in context.renderedFigureIds).
 */
function renderFigure(figure, context) {
  const id = figure.id || null;

  // Skip if this figure was already rendered (e.g., inside a note)
  if (id && context.renderedFigureIds && context.renderedFigureIds.has(id)) {
    return '';
  }

  // Mark this figure as rendered
  if (id && context.renderedFigureIds) {
    context.renderedFigureIds.add(id);
  }

  const lines = [];
  const className = figure.attributes.class || null;

  // Get figure number from chapter-wide map for data attribute
  const compositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
  const figNum =
    id && context.chapterFigureNumbers
      ? context.chapterFigureNumbers.get(compositeKey) || context.chapterFigureNumbers.get(id)
      : null;

  // Build attributes array (like exercise pattern)
  const attrs = [];
  if (id) attrs.push(`id="${escapeAttr(id)}"`);
  if (className) attrs.push(`class="${escapeAttr(className)}"`);
  if (figNum) attrs.push(`data-figure-number="${figNum}"`);

  lines.push(`<figure ${attrs.join(' ')}>`);

  // Extract media/image
  const mediaMatch = figure.content.match(/<media([^>]*)>([\s\S]*?)<\/media>/);
  if (mediaMatch) {
    const mediaAttrs = parseAttributes(mediaMatch[1]);
    const mediaContent = mediaMatch[2];

    // D4: render <iframe> embeds (PhET/YouTube) as resolved responsive iframes
    const iframeMatch = mediaContent.match(/<iframe([^>]*)\/?>/);
    if (iframeMatch) {
      const a = parseAttributes(iframeMatch[1]);
      lines.push(
        renderEmbedHtml({
          embedSrc: a.src || '',
          width: a.width || '',
          height: a.height || '',
          title: (mediaAttrs.alt || '').replace(/[_-]+/g, ' '),
          embedMap: context.embedMap || EMBED_MAP,
        })
      );
    } else {
      const imageMatch = mediaContent.match(/<image([^>]*)\/?>(?:<\/image>)?/);
      if (imageMatch) {
        const imageAttrs = parseAttributes(imageMatch[1]);
        const src = imageAttrs.src || '';
        // Use absolute path for vefur content serving
        const chapterStr = formatChapterOutput(context.chapter);
        const normalizedSrc = normalizeImageSrc(src, BOOK_SLUG, chapterStr);
        const alt = mediaAttrs.alt || '';

        lines.push(
          `  <img src="${escapeAttr(normalizedSrc)}" alt="${escapeAttr(alt)}" loading="lazy">`
        );
      }
    }
  }

  // Extract caption
  const captionMatch = figure.content.match(/<caption>([\s\S]*?)<\/caption>/);
  if (captionMatch) {
    const captionContent = processInlineContent(captionMatch[1], context);
    // Add figure number if available (composite key for cross-module uniqueness)
    const capCompositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
    const figNum =
      id && context.chapterFigureNumbers
        ? context.chapterFigureNumbers.get(capCompositeKey) || context.chapterFigureNumbers.get(id)
        : null;
    if (figNum) {
      lines.push(
        `  <figcaption><span class="figure-label">Mynd ${figNum}</span> ${captionContent}</figcaption>`
      );
    } else {
      lines.push(`  <figcaption>${captionContent}</figcaption>`);
    }
  }

  lines.push('</figure>');
  return lines.join('\n');
}

/**
 * Render a standalone media element (not inside a figure).
 * Produces a simple img wrapped in a div.
 */
function renderMedia(media, context) {
  const id = media.id || null;
  const className = media.attributes.class || null;
  const alt = media.attributes.alt || '';

  // D4: render <iframe> embeds (PhET/YouTube) as resolved responsive iframes
  const iframeMatch = media.content.match(/<iframe([^>]*)\/?>/);
  if (iframeMatch) {
    const a = parseAttributes(iframeMatch[1]);
    return renderEmbedHtml({
      embedSrc: a.src || '',
      width: a.width || '',
      height: a.height || '',
      title: alt.replace(/[_-]+/g, ' '),
      embedMap: context.embedMap || EMBED_MAP,
    });
  }

  // Extract image src from content
  const imageMatch = media.content.match(/<image([^>]*)\/?>(?:<\/image>)?/);
  let normalizedSrc = '';
  if (imageMatch) {
    const imageAttrs = parseAttributes(imageMatch[1]);
    const src = imageAttrs.src || '';
    const chapterStr = formatChapterOutput(context.chapter);
    normalizedSrc = normalizeImageSrc(src, BOOK_SLUG, chapterStr);
  }

  const classValue = className ? `media-inline ${className}` : 'media-inline';
  return `<div${id ? ` id="${escapeAttr(id)}"` : ''} class="${escapeAttr(classValue)}">\n  <img src="${escapeAttr(normalizedSrc)}" alt="${escapeAttr(alt)}" loading="lazy">\n</div>`;
}

/**
 * Render a note.
 * Renders paragraphs and figures in document order to preserve content flow.
 */
/**
 * Render a container's block children in document order via a DOM walk
 * (Track C leaf-seam). Replaces fragile global string-position sorting: walks
 * the parsed CNXML in source order and dispatches each block element to the
 * caller-supplied renderer, so ordering is correct by construction (no
 * `indexOf` collapse for id-less elements, no `id="X"`/`target-id="X"` collision).
 *
 * HTML emission stays in the existing string renderers — only traversal/ordering
 * moves to DOM. A block nested inside a <para> is HOISTED: renderPara drops its
 * block children, so the walk descends into paras and emits their nested
 * list/figure/media after the para (preserving prior behavior). Figures/lists/
 * media are leaves here — their own renderers handle their internals.
 *
 * A block nested inside a <para> is HOISTED out and rendered after the para
 * (renderPara does not strip block children, so they would otherwise leak as raw
 * CNXML). Which child types hoist is configurable via `options.hoistTags`:
 * notes hoist every block; examples hoist only <list> (their figures/equations
 * render inline via renderPara). Children NOT hoisted stay inside the para.
 *
 * @param {string} content - CNXML fragment (a container's inner content)
 * @param {object} context - Render context passed through to each renderer
 * @param {Record<string, function(object, object): string>} dispatch
 *   Map of block localName → renderer(elementObject, context) → HTML string.
 * @param {object} [options]
 * @param {string[]} [options.hoistTags] - localNames to hoist out of a <para>
 *   and render after it. Defaults to every key in `dispatch`.
 * @returns {string[]} Rendered HTML strings, one per emitted block, in order
 */
// Tags that legitimately appear as element children inside a container but are
// handled outside the block seam (container metadata) or are inline content that
// flows within text — NOT silently-dropped block content. Excluded from the
// loud-seam record so the diagnostic carries signal (a real undispatched block
// like <equation>/<table>/<figure>) not noise.
const LOUD_SEAM_IGNORE = new Set([
  'title',
  'label',
  'caption',
  'meta',
  'newline',
  'sub',
  'sup',
  'emphasis',
  'term',
  'link',
  'math',
  'footnote',
]);

function renderBlockChildrenInOrder(content, context, dispatch, options = {}) {
  const out = [];
  const { root } = parseCnxmlFragment(content);
  const hoistTags = options.hoistTags || Object.keys(dispatch);

  // Process one block element: render it via its dispatcher. For a <para>, first
  // detach the block children flagged for hoisting (so renderPara does not emit
  // them as raw CNXML), then render those after the para, in source order. Other
  // block types are leaves: their own renderers emit their descendants.
  const processBlock = (node) => {
    const name = node.localName;
    if (!dispatch[name]) {
      // Loud seam: record (don't silently drop) a block element no dispatcher
      // handles, so a future dispatch-map gap is visible instead of a silent
      // content loss. Output is unchanged — the element is still not emitted.
      if (!LOUD_SEAM_IGNORE.has(name) && context.undispatchedBlocks) {
        context.undispatchedBlocks.push({
          tag: name,
          id: (node.getAttribute && node.getAttribute('id')) || null,
        });
      }
      return;
    }

    if (name === 'para') {
      const hoisted = Array.from(node.childNodes).filter(
        (c) => c.nodeType === 1 && hoistTags.includes(c.localName)
      );
      for (const child of hoisted) node.removeChild(child);
      const obj = extractElements(serializeCnxmlFragment(node), 'para')[0];
      if (obj) {
        const html = dispatch.para(obj, context);
        if (html) out.push(html);
      }
      for (const child of hoisted) processBlock(child);
      return;
    }

    const obj = extractNestedElements(serializeCnxmlFragment(node), name)[0];
    if (obj) {
      const html = dispatch[name](obj, context);
      if (html) out.push(html);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 1) processBlock(child);
  }
  return out;
}

function renderNote(note, context, extraClass = '') {
  const lines = [];
  const id = note.id || null;
  const noteClass = note.attributes.class || 'default';
  const classAttr = `note note-${escapeAttr(noteClass)}${
    extraClass ? ` ${escapeAttr(extraClass)}` : ''
  }`;

  lines.push(`<aside${id ? ` id="${escapeAttr(id)}"` : ''} class="${classAttr}">`);

  // Note type label (e.g., "Chemistry in Everyday Life", "Link to Learning")
  const typeLabel = getNoteTypeLabel(noteClass);
  if (typeLabel) {
    lines.push(`  <p class="note-type">${escapeHtml(typeLabel)}</p>`);
  }

  // Title. [\s\S]*? (not [^<]+) so a note <title> with inline markup is captured
  // whole and not leaked (same bug class fixed for examples). Dormant on current
  // chem note titles ("Svar:"/"Answer:") but hardens for biology (species/sub/sup);
  // the h4 already renders markup via processInlineContent — output-neutral today.
  const titleMatch = note.content.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    lines.push(`  <h4>${processInlineContent(translateTitle(titleMatch[1]), context)}</h4>`);
  }

  // Render block children (paras, figures, lists, standalone media) in document
  // order via the DOM seam. Standalone <media> not wrapped in a <figure> — e.g.
  // the "Check Your Learning" answer image — is handled because the walk visits
  // it as its own block child (figures render their own media, so no double-count).
  const contentWithoutTitle = note.content.replace(/<title>[\s\S]*?<\/title>/, '');
  const blocks = renderBlockChildrenInOrder(contentWithoutTitle, context, {
    para: renderPara,
    figure: renderFigure,
    list: renderList,
    media: renderMedia,
    // A direct-child <equation> in a note (between paras) was silently dropped
    // before this dispatcher existed (m68849 lost 2 reaction equations).
    equation: renderEquation,
    // A <table> in a note — direct child or nested in a <para> — must render via
    // renderTable, not leak raw <row>/<entry> through renderPara. renderNote
    // passes no hoistTags, so it defaults to Object.keys(dispatch): adding table
    // here both dispatches it and hoists it out of a para (F1b).
    table: renderTable,
  });
  for (const block of blocks) {
    lines.push(`  ${block}`);
  }

  lines.push('</aside>');
  return lines.join('\n');
}

/**
 * Render an example.
 *
 * OpenStax CNXML examples have a specific structure where:
 * - The example title is in the FIRST paragraph's <title> child
 * - Subsequent paragraphs may have section titles (Solution, Check Your Learning)
 * - All content should be rendered in document order
 */
function renderExample(example, context) {
  const lines = [];
  const id = example.id || null;

  // Use chapter-wide example number if available, otherwise fall back to per-module counter
  const exCompositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
  const chapterExNum =
    id && context.chapterExampleNumbers
      ? context.chapterExampleNumbers.get(exCompositeKey) || context.chapterExampleNumbers.get(id)
      : null;
  context.exampleCounter = (context.exampleCounter || 0) + 1;
  const exampleNumber = chapterExNum || `${context.chapter}.${context.exampleCounter}`;

  // Build attributes array (like exercise pattern)
  const attrs = [];
  if (id) attrs.push(`id="${escapeAttr(id)}"`);
  attrs.push('class="example"');
  if (exampleNumber) attrs.push(`data-example-number="${exampleNumber}"`);

  lines.push(`<aside ${attrs.join(' ')}>`);

  // Extract all paragraphs to find the example title from the FIRST one with a title
  const allParas = extractElements(example.content, 'para');
  let exampleTitle = null;

  for (const para of allParas) {
    // The leading <title> may carry inline markup (E<sub>a</sub>); matchLeadingTitle
    // captures it whole — the old [^<]+ pattern skipped such titles and fell through
    // to the next plain-text para-title.
    const { title } = matchLeadingTitle(para.content);
    if (title) {
      exampleTitle = title;
      break;
    }
  }

  // Fallback: first standalone <title> anywhere in the example content.
  if (!exampleTitle) {
    const standaloneTitle = example.content.match(/<title>([\s\S]*?)<\/title>/);
    if (standaloneTitle) {
      exampleTitle = standaloneTitle[1];
    }
  }

  // Example header with number and title
  lines.push(`  <p class="example-label">Dæmi ${exampleNumber}</p>`);
  if (exampleTitle) {
    lines.push(`  <h4>${processInlineContent(exampleTitle, context)}</h4>`);
  }

  // Render block children in document order via the DOM seam. A top-level walk
  // means a figure that is a direct child of the example dispatches to
  // renderFigure, while a figure nested in a para is rendered inline by
  // renderPara — so the old `isInsidePara` xref-collision guard is retired (the
  // DOM distinguishes structurally). Only <list> is hoisted out of paras
  // (matching the prior list-strip); figures/equations/media stay inline.
  let exampleTitleStripped = false;

  const paraHandler = (para, ctx) => {
    // matchLeadingTitle handles a <title> that carries inline markup; the old
    // [^<]+ pattern left such a title un-stripped, leaking it as literal text.
    const { title, rest } = matchLeadingTitle(para.content);
    let paraTitle = null;
    let contentWithoutTitle = para.content;

    if (title) {
      if (!exampleTitleStripped && exampleTitle && title === exampleTitle) {
        // The example title — already rendered as the <h4> header; strip it.
        contentWithoutTitle = rest;
        exampleTitleStripped = true;
      } else {
        // A section title (e.g. "Lausn", "Athugaðu þekkingu") — render as a heading.
        paraTitle = title;
        contentWithoutTitle = rest;
      }
    }

    // Register figures inside this para so section-level renderFigure skips them.
    if (ctx.renderedFigureIds) {
      const figPattern = /<figure[^>]*\sid="([^"]+)"/g;
      let figMatch;
      while ((figMatch = figPattern.exec(contentWithoutTitle)) !== null) {
        ctx.renderedFigureIds.add(figMatch[1]);
      }
    }

    const parts = [];
    if (paraTitle) {
      // processInlineContent (not escapeHtml) so a para-title carrying inline
      // markup renders it; plain titles ("Lausn", "Svar") are unchanged.
      parts.push(
        `<p class="para-title"><strong>${processInlineContent(translateTitle(paraTitle), ctx)}</strong></p>`
      );
    }
    if (contentWithoutTitle.trim()) {
      parts.push(renderPara({ ...para, content: contentWithoutTitle }, ctx));
    }
    return parts.join('\n  ');
  };

  const noteHandler = (note, ctx) => {
    // A classless note inside a worked example is the "Check Your Learning"
    // answer; tag it so the reader can hide it behind a "Sýna svar" toggle.
    const answerClass = note.attributes && !note.attributes.class ? 'check-knowledge-answer' : '';
    return renderNote(note, ctx, answerClass);
  };

  const blocks = renderBlockChildrenInOrder(
    example.content,
    context,
    {
      para: paraHandler,
      note: noteHandler,
      list: renderList,
      equation: renderEquation,
      figure: renderFigure,
      media: renderMedia,
      // A <table> that is a direct child of the example renders in place here;
      // renderTable registers its id in context.renderedTableIds so the later
      // section-level pass skips the duplicate (m68793 tables 12.31/12.32).
      table: renderTable,
    },
    // Hoist block-level <equation> out of a <para> so it renders ONCE as a
    // centered display block, not as a cramped inline <span class="math-inline">
    // copy at its natural position. CNXML <equation> is block-level; the inline
    // render was a renderPara artifact that, combined with the old position-sort's
    // separate block, produced a visible duplicate (verified live on
    // namsbokasafn.is, ch14 Dæmi 14.4/14.5).
    { hoistTags: ['list', 'equation', 'table'] }
  );
  for (const block of blocks) {
    lines.push(`  ${block}`);
  }

  lines.push('</aside>');
  return lines.join('\n');
}

/**
 * Render an exercise.
 */
function renderExercise(exercise, context) {
  const lines = [];
  const id = exercise.id || null;

  // Use pre-assigned number from chapter-wide map if available (like figures/tables)
  // This ensures sequential numbering across compiled exercises sections
  const exerCompositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
  let exerciseNumber;
  if (
    id &&
    context.chapterExerciseNumbers &&
    (context.chapterExerciseNumbers.has(exerCompositeKey) || context.chapterExerciseNumbers.has(id))
  ) {
    exerciseNumber =
      context.chapterExerciseNumbers.get(exerCompositeKey) ||
      context.chapterExerciseNumbers.get(id);
  } else {
    // Fallback: increment counter for exercises without pre-assigned numbers
    context.exerciseCounter++;
    exerciseNumber = context.exerciseCounter;
    if (id && context.chapterExerciseNumbers) {
      context.chapterExerciseNumbers.set(id, exerciseNumber);
    }
  }

  // Build attributes for eoc-exercise (end-of-chapter exercise)
  // Extract just the exercise number (without chapter prefix) for display
  // e.g., "2.1" -> "1", or if no dot, use as-is
  const displayNumber = exerciseNumber.toString().includes('.')
    ? exerciseNumber.toString().split('.')[1]
    : exerciseNumber.toString();

  const attrs = [];
  if (id) attrs.push(`id="${escapeAttr(id)}"`);
  attrs.push('class="eoc-exercise"');
  attrs.push(`data-exercise-id="${escapeAttr(id || '')}"`);
  attrs.push(`data-exercise-number="${displayNumber}"`);
  // Ground-truth answer signal for the reader: true iff this exercise will have
  // an `.answer-entry` on the answer-key page. Uses the SAME predicate as the
  // answer-key generator (`<solution id="…">` present) so the two never diverge.
  // The reader keys "Sjá svar" off this, NOT off number parity (which drifts in
  // ch12–17 — see docs/handoffs/2026-07-01-exercise-answer-has-answer-signal.md).
  const hasAnswer = /<solution\s+id="[^"]*">/.test(exercise.content || '');
  attrs.push(`data-has-answer="${hasAnswer}"`);

  lines.push(`<div ${attrs.join(' ')}>`);

  // Helper: render problem/solution section content (paras, media, figures,
  // lists) in document order via the DOM seam. Only <list> is hoisted out of a
  // <para> (matching the prior list-strip); figures render inline via renderPara.
  function renderSectionContent(sectionContent) {
    const blocks = renderBlockChildrenInOrder(
      sectionContent,
      context,
      {
        para: renderPara,
        media: renderMedia,
        figure: renderFigure,
        list: renderList,
        equation: renderEquation,
        // A <table> in a problem/solution — direct child or nested in a <para> —
        // renders via renderTable instead of leaking raw <row>/<entry> through
        // renderPara (F1b). Hoisted below so a para-nested table is detached.
        table: renderTable,
      },
      // Hoist block-level <equation> out of a <para> so it renders once as a
      // centered display block (parity with renderExample). A direct-child
      // <equation> of <problem>/<solution> also needs the dispatcher above —
      // without it the DOM seam skipped the node entirely and dropped the
      // equation (e.g. m68670's density formula d = m/V).
      { hoistTags: ['list', 'equation', 'table'] }
    );
    for (const block of blocks) {
      lines.push(`    ${block}`);
    }
  }

  // Problem
  const problemMatch = exercise.content.match(/<problem([^>]*)>([\s\S]*?)<\/problem>/);
  if (problemMatch) {
    const problemId = parseAttributes(problemMatch[1]).id;
    const problemContent = problemMatch[2];

    // Check for os-embed exercise reference
    const osEmbedMatch = problemContent.match(/url="#exercise\/([^"]+)"/);
    if (osEmbedMatch) {
      const resolved = resolveOsEmbed(osEmbedMatch[1]);
      if (resolved) {
        lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);
        if (resolved.stimulus) {
          lines.push(`    <p>${resolved.stimulus}</p>`);
        }
        const partLabels = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)', '(g)', '(h)'];
        for (let i = 0; i < resolved.questions.length; i++) {
          const q = resolved.questions[i];
          const label =
            resolved.questions.length > 1
              ? `<strong>${partLabels[i] || '(' + (i + 1) + ')'}</strong> `
              : '';
          lines.push(`    <div class="exercise-part">${label}${q.stem}</div>`);
        }
        lines.push('  </div>');

        // Render solutions if public
        if (resolved.solutionsPublic && resolved.questions.some((q) => q.solutions.length > 0)) {
          lines.push('  <div class="solution">');
          for (let i = 0; i < resolved.questions.length; i++) {
            const q = resolved.questions[i];
            if (q.solutions.length > 0) {
              const label =
                resolved.questions.length > 1
                  ? `<strong>${partLabels[i] || '(' + (i + 1) + ')'}</strong> `
                  : '';
              lines.push(`    <p>${label}${q.solutions[0]}</p>`);
            }
          }
          lines.push('  </div>');
        }

        lines.push('</div>');
        return lines.join('\n');
      }
    }

    // Normal rendering (no os-embed or not resolved)
    lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);
    renderSectionContent(problemContent);
    lines.push('  </div>');
  }

  // Solution (only render if context.includeSolutions is true, e.g., for answer key pages)
  const solutionMatch = exercise.content.match(/<solution([^>]*)>([\s\S]*?)<\/solution>/);
  if (solutionMatch && context.includeSolutions) {
    const solutionId = parseAttributes(solutionMatch[1]).id;
    lines.push(`  <div${solutionId ? ` id="${escapeAttr(solutionId)}"` : ''} class="solution">`);
    renderSectionContent(solutionMatch[2]);
    lines.push('  </div>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

/**
 * Render a table.
 */
function renderTable(table, context) {
  const lines = [];
  const id = table.id || null;

  // A table that is a direct child of an example/note renders in place via that
  // block's dispatcher; skip the later section-level pass so it renders once
  // (mirrors renderFigure / context.renderedFigureIds).
  if (id && context.renderedTableIds && context.renderedTableIds.has(id)) {
    return '';
  }
  if (id && context.renderedTableIds) {
    context.renderedTableIds.add(id);
  }

  const className = table.attributes.class || null;

  // Get table number from chapter-wide map for data attribute (composite key for cross-module uniqueness)
  const tblCompositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
  const tableNum =
    id && context.chapterTableNumbers
      ? context.chapterTableNumbers.get(tblCompositeKey) || context.chapterTableNumbers.get(id)
      : null;

  // Build attributes array (like exercise pattern)
  const attrs = [];
  if (id) attrs.push(`id="${escapeAttr(id)}"`);
  if (className) attrs.push(`class="${escapeAttr(className)}"`);
  if (tableNum) attrs.push(`data-table-number="${tableNum}"`);

  lines.push(`<table ${attrs.join(' ')}>`);
  if (tableNum) {
    lines.push(`  <caption><span class="table-label">Tafla ${tableNum}</span></caption>`);
  }

  // Process tgroup
  const tgroupMatch = table.content.match(/<tgroup[^>]*>([\s\S]*?)<\/tgroup>/);
  if (tgroupMatch) {
    const tgroupContent = tgroupMatch[1];

    // Header
    const theadMatch = tgroupContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
    if (theadMatch) {
      lines.push('  <thead>');
      const rows = extractElements(theadMatch[1], 'row');
      for (const row of rows) {
        lines.push(`    <tr>${renderTableCells(row.content, context, true)}</tr>`);
      }
      lines.push('  </thead>');
    }

    // Body
    const tbodyMatch = tgroupContent.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (tbodyMatch) {
      lines.push('  <tbody>');
      const rows = extractElements(tbodyMatch[1], 'row');
      for (const row of rows) {
        lines.push(`    <tr>${renderTableCells(row.content, context, false)}</tr>`);
      }
      lines.push('  </tbody>');
    }
  }

  lines.push('</table>');
  return lines.join('\n');
}

/**
 * Render table cells.
 */
function renderTableCells(rowContent, context, isHeader) {
  const cells = [];
  const entries = extractElements(rowContent, 'entry');

  for (const entry of entries) {
    const tag = isHeader ? 'th' : 'td';
    const attrs = entry.attributes;

    let attrStr = '';
    if (attrs.namest && attrs.nameend) {
      const colspan = calculateColspan(attrs.namest, attrs.nameend);
      if (colspan > 1) attrStr += ` colspan="${colspan}"`;
    }
    if (attrs.morerows) {
      const rowspan = parseInt(attrs.morerows, 10) + 1; // morerows="5" means 6 total rows
      attrStr += ` rowspan="${rowspan}"`;
    }
    if (attrs.align) {
      attrStr += ` style="text-align: ${escapeAttr(attrs.align)}"`;
    }

    const content = processInlineContent(entry.content, context);
    cells.push(`<${tag}${attrStr}>${content}</${tag}>`);
  }

  return cells.join('');
}

/**
 * Calculate colspan from column names.
 */
function calculateColspan(namest, nameend) {
  const startMatch = namest.match(/c?(\d+)/);
  const endMatch = nameend.match(/c?(\d+)/);
  if (startMatch && endMatch) {
    return parseInt(endMatch[1]) - parseInt(startMatch[1]) + 1;
  }
  return 1;
}

/**
 * Render a list.
 */
function renderList(list, context) {
  const lines = [];
  const id = list.id || null;
  const listType = list.attributes['list-type'] || 'bulleted';
  const tag = listType === 'enumerated' ? 'ol' : 'ul';
  const bulletStyle = list.attributes['bullet-style'];

  let styleAttr = '';
  if (bulletStyle === 'bullet') styleAttr = ' style="list-style-type: disc"';
  else if (bulletStyle === 'open-circle') styleAttr = ' style="list-style-type: circle"';

  const classAttr = list.attributes.class ? ` class="${escapeAttr(list.attributes.class)}"` : '';
  lines.push(`<${tag}${id ? ` id="${escapeAttr(id)}"` : ''}${classAttr}${styleAttr}>`);

  const items = extractNestedElements(list.content, 'item');
  for (const item of items) {
    const itemId = item.id ? ` id="${escapeAttr(item.id)}"` : '';

    // Check for nested lists inside items
    const nestedLists = extractNestedElements(item.content, 'list');
    if (nestedLists.length > 0) {
      // Strip nested lists from item content before processing text
      let textContent = item.content;
      for (const nl of nestedLists)
        if (nl.fullMatch) textContent = textContent.replace(nl.fullMatch, '');
      const nestedParas = extractElements(textContent, 'para');
      const text =
        nestedParas.length > 0
          ? nestedParas.map((p) => processInlineContent(p.content, context)).join('<br>')
          : processInlineContent(textContent, context);
      lines.push(`  <li${itemId}>${text}`);
      for (const nl of nestedLists) lines.push(renderList(nl, context));
      lines.push('  </li>');
    } else {
      // Simple items: check for nested paragraphs
      const nestedParas = extractElements(item.content, 'para');
      if (nestedParas.length > 0) {
        // Use the DOM to check for DIRECT-CHILD equation/media siblings — extractElements
        // is not depth-aware (it matches equations nested inside <para> content too),
        // which would cause false-positives and lose the inter-para <br> separator for
        // pure-para items that merely have inline equations in their para text.
        const { root: itemRoot } = parseCnxmlFragment(item.content);
        const directBlocks = Array.from(itemRoot.childNodes).filter((n) => n.nodeType === 1);
        const hasDirectBlockSiblings = directBlocks.some(
          (n) => n.localName === 'equation' || n.localName === 'media'
        );
        if (hasDirectBlockSiblings) {
          // DOM-walk: render all direct block children (para, equation, media) in source
          // order. Equations/media that are top-level siblings of <para> inside an <item>
          // were previously dropped by the para-only branch. Worked-solution pattern:
          // stepwise <list> inside <example> — <item> has <para>+<equation>+<media>.
          const parts = [];
          for (const node of directBlocks) {
            const name = node.localName;
            const serialized = serializeCnxmlFragment(node);
            if (name === 'para') {
              const objs = extractElements(serialized, 'para');
              if (objs[0]) parts.push(processInlineContent(objs[0].content, context));
            } else if (name === 'equation') {
              const objs = extractElements(serialized, 'equation');
              if (objs[0]) parts.push(renderEquation(objs[0], context));
            } else if (name === 'media') {
              const objs = extractNestedElements(serialized, 'media');
              if (objs[0]) parts.push(renderMedia(objs[0], context));
            } else {
              // Loud seam: record unhandled block child type rather than drop silently
              if (context.undispatchedBlocks) {
                context.undispatchedBlocks.push({
                  tag: name,
                  id: (node.getAttribute && node.getAttribute('id')) || null,
                  location: 'renderList-item',
                });
              }
            }
          }
          lines.push(`  <li${itemId}>${parts.join('')}</li>`);
        } else {
          // Pure para case (no direct-child equation/media): preserve existing byte-identical output
          const content = nestedParas
            .map((p) => processInlineContent(p.content, context))
            .join('<br>');
          lines.push(`  <li${itemId}>${content}</li>`);
        }
      } else {
        // Check for nested block-level <equation> elements. Source pattern, e.g.
        // ch21-2 historical-milestones bullets: each <item> contains text +
        // <newline/> + <equation>. Previously the top-level extraction pass
        // pulled these equations out of the list and rendered them as siblings
        // AFTER </ul>. Keep them inline here so they stay inside their <li>.
        const nestedEquations = extractElements(item.content, 'equation');
        if (nestedEquations.length > 0) {
          let working = item.content;
          const placeholders = [];
          nestedEquations.forEach((eq, i) => {
            if (!eq.fullMatch) return;
            const ph = `\u0000EQ_PLACEHOLDER_${i}\u0000`;
            working = working.replace(eq.fullMatch, ph);
            placeholders.push({ ph, html: renderEquation(eq, context) });
          });
          let rendered = processInlineContent(working, context);
          for (const { ph, html } of placeholders) {
            rendered = rendered.replace(ph, html);
          }
          lines.push(`  <li${itemId}>${rendered}</li>`);
        } else {
          const content = processInlineContent(item.content, context);
          lines.push(`  <li${itemId}>${content}</li>`);
        }
      }
    }
  }

  lines.push(`</${tag}>`);
  return lines.join('\n');
}

/**
 * Render an equation.
 */
function renderEquation(eq, context) {
  const id = eq.id || null;
  const isUnnumbered = eq.attributes.class === 'unnumbered';

  // Extract MathML
  const mathMatch = eq.content.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
  if (!mathMatch) {
    // Track render failure: no MathML found
    if (!context.renderStats) context.renderStats = { equations: 0, success: 0, failures: [] };
    context.renderStats.equations++;
    context.renderStats.failures.push({ id, reason: 'no-mathml' });
    return `<div${id ? ` id="${escapeAttr(id)}"` : ''} class="equation">${eq.content}</div>`;
  }

  let localizedMathml = localizeNumbersInMathML(mathMatch[0]);
  localizedMathml = localizeMathMLText(localizedMathml, context.equationTextDictionary);
  const latex = translateLatexText(
    convertMathMLToLatex(localizedMathml),
    context.equationTextDictionary
  );

  // Track equation
  context.equations.push({ id, latex });

  // Render MathML directly via MathJax (lossless — no MathML→LaTeX conversion needed for visual)
  const mathHtml = renderMathML(localizedMathml, true);

  // Validate render result
  if (!context.renderStats) context.renderStats = { equations: 0, success: 0, failures: [] };
  context.renderStats.equations++;

  const renderFailed =
    !mathHtml ||
    mathHtml.trim() === '' ||
    mathHtml.includes('merror') ||
    mathHtml.includes('data-mjx-error');

  if (renderFailed) {
    context.renderStats.failures.push({
      id,
      reason: !mathHtml ? 'empty-result' : 'mathjax-error',
      latex: latex.substring(0, 80),
    });
  } else {
    context.renderStats.success++;
  }

  const eqContent = `<span class="mathjax-display" data-latex="${escapeAttr(latex)}">${mathHtml}</span>`;
  const numberSpan = isUnnumbered ? '' : '<span class="equation-number"></span>';

  // Get equation number from chapter-wide map for numbered equations only
  const eqCompositeKey = context.moduleId ? `${context.moduleId}:${id}` : id;
  const eqNum =
    !isUnnumbered && id && context.chapterEquationNumbers
      ? context.chapterEquationNumbers.get(eqCompositeKey) || context.chapterEquationNumbers.get(id)
      : null;

  // Build attributes array
  const attrs = [];
  if (id) attrs.push(`id="${escapeAttr(id)}"`);
  attrs.push(`class="equation${isUnnumbered ? ' unnumbered' : ''}"`);
  if (eqNum) attrs.push(`data-equation-number="${eqNum}"`);

  return `<div ${attrs.join(' ')}>${eqContent}${numberSpan}</div>`;
}

/**
 * Render glossary.
 */
function renderGlossary(content, context) {
  const lines = [];
  lines.push('<section class="glossary">');
  lines.push('  <h2>Orðalisti</h2>');
  lines.push('  <dl>');

  const definitions = extractNestedElements(content, 'definition');
  for (const def of definitions) {
    const id = def.id || null;
    // Use [\s\S]*? so terms containing <m:math> children are captured.
    const termMatch = def.content.match(/<term>([\s\S]*?)<\/term>/);
    const meaningMatch = def.content.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);

    if (termMatch && meaningMatch) {
      const termInner = termMatch[1].trim();
      const termHtml = processInlineContent(termInner, context);
      const meaning = processInlineContent(meaningMatch[1], context);

      // Plain-text key for context.terms (used by reader for tooltips)
      const termKey = stripTags(termInner).trim();
      context.terms[termKey] = stripTags(meaningMatch[1]).trim();

      lines.push(`    <dt${id ? ` id="${escapeAttr(id)}"` : ''}>${termHtml}</dt>`);
      lines.push(`    <dd>${meaning}</dd>`);
    }
  }

  lines.push('  </dl>');
  lines.push('</section>');
  return lines.join('\n');
}

/**
 * Remove nested elements of a given type from content.
 */
function removeNestedElements(content, tagName) {
  const openTag = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g');
  const closeTag = `</${tagName}>`;

  let result = content;
  let match;

  while ((match = openTag.exec(result)) !== null) {
    const startIdx = match.index;
    let depth = 1;
    let idx = startIdx + match[0].length;

    while (depth > 0 && idx < result.length) {
      const nextOpen = result.indexOf(`<${tagName}`, idx);
      const nextClose = result.indexOf(closeTag, idx);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        idx = nextOpen + tagName.length + 1;
      } else {
        depth--;
        if (depth === 0) {
          const endIdx = nextClose + closeTag.length;
          result = result.substring(0, startIdx) + result.substring(endIdx);
          openTag.lastIndex = startIdx;
        }
        idx = nextClose + closeTag.length;
      }
    }
  }

  return result;
}

// =====================================================================
// FILE I/O
// =====================================================================

/**
 * Find modules to process.
 */
function findChapterModules(chapter, track, moduleId = null) {
  const chapterDir = formatChapterDir(chapter);
  const translatedDir = path.join(BOOKS_DIR, '03-translated', track, chapterDir);

  if (!fs.existsSync(translatedDir)) {
    throw new Error(`Translated directory not found: ${translatedDir}`);
  }

  if (moduleId) {
    const cnxmlPath = path.join(translatedDir, `${moduleId}.cnxml`);
    if (!fs.existsSync(cnxmlPath)) {
      throw new Error(`Translated CNXML not found: ${cnxmlPath}`);
    }
    return [moduleId];
  }

  const files = fs.readdirSync(translatedDir).filter((f) => f.endsWith('.cnxml'));
  return files.map((f) => f.replace('.cnxml', '')).sort();
}

/**
 * Ensure output directory exists.
 */
function ensureOutputDir(chapter, track) {
  const chapterStr = formatChapterOutput(chapter);
  const outputDir = path.join(BOOKS_DIR, '05-publication', track, 'chapters', chapterStr);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Also ensure images directory
  const imagesDir = path.join(outputDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  return outputDir;
}

/**
 * Generate output filename.
 */
function getOutputFilename(moduleId, chapter, moduleSections) {
  const sectionInfo = moduleSections?.[moduleId];
  if (sectionInfo) {
    return `${chapter}-${sectionInfo.section}-${sectionInfo.slug}.html`;
  }
  return `${moduleId}.html`;
}

/**
 * Write output HTML.
 */
function writeOutput(chapter, moduleId, track, html, moduleSections) {
  const outputDir = ensureOutputDir(chapter, track);
  const filename = getOutputFilename(moduleId, chapter, moduleSections);
  const outputPath = path.join(outputDir, filename);
  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);
  return outputPath;
}

/**
 * Copy referenced images from source media to publication directory.
 */
function copyChapterImages(chapter, track, _verbose) {
  const chapterStr = formatChapterOutput(chapter);
  // Search the canonical OpenStax media dir first, then the book-level media
  // dir that holds Icelandic-localized figure variants (e.g. *_is.jpg). The
  // latter is where injection's image-localization map points figures, so its
  // files must be published too (handoff #5).
  const sourceMediaDirs = [
    path.join(BOOKS_DIR, '01-source', 'media'),
    path.join(BOOKS_DIR, 'media'),
  ].filter((d) => fs.existsSync(d));
  const chapterDir = path.join(BOOKS_DIR, '05-publication', track, 'chapters', chapterStr);
  const targetMediaDir = path.join(chapterDir, 'images', 'media');

  if (sourceMediaDirs.length === 0) {
    console.error(
      `Warning: No source media directory found (${path.join(BOOKS_DIR, '01-source', 'media')} or ${path.join(BOOKS_DIR, 'media')})`
    );
    return;
  }

  if (!fs.existsSync(targetMediaDir)) {
    fs.mkdirSync(targetMediaDir, { recursive: true });
  }

  // Scan rendered HTML files to find all referenced image filenames.
  // This is more robust than prefix matching — it copies exactly the
  // files that the HTML actually references, regardless of naming convention.
  const referencedFiles = new Set();
  const imgSrcPattern = /src="\/content\/[^"]*\/images\/media\/([^"]+)"/g;

  const htmlFiles = fs.readdirSync(chapterDir).filter((f) => f.endsWith('.html'));
  for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(path.join(chapterDir, htmlFile), 'utf-8');
    let match;
    while ((match = imgSrcPattern.exec(content)) !== null) {
      referencedFiles.add(decodeURIComponent(match[1]));
    }
  }

  let copied = 0;
  let missing = 0;
  for (const file of referencedFiles) {
    const dest = safeJoin(targetMediaDir, file);
    if (!dest) {
      console.error(`Warning: Skipping unsafe image filename: ${file}`);
      continue;
    }
    // First source dir that has the file wins (01-source/media, then media/).
    let src = null;
    for (const dir of sourceMediaDirs) {
      const candidate = safeJoin(dir, file);
      if (candidate && fs.existsSync(candidate)) {
        src = candidate;
        break;
      }
    }
    if (src) {
      fs.copyFileSync(src, dest);
      copied++;
    } else {
      console.error(`Warning: Referenced image not found in source: ${file}`);
      missing++;
    }
  }

  console.log(
    `Images: Copied ${copied} files to ${targetMediaDir}${missing ? ` (${missing} missing from source)` : ''}`
  );
}

// =====================================================================
// MAIN
// =====================================================================

// =====================================================================
// END-OF-CHAPTER SECTION RENDERING
// =====================================================================

/**
 * Get end-of-chapter section definitions from book config.
 * Filters out exercise types (they are handled by the compiled exercise extractor).
 * Returns only non-exercise end-of-chapter sections for standalone page rendering.
 */
function getEndOfChapterSections() {
  if (!BOOK_CONFIG) {
    // Fallback for testing without config loaded
    return {
      summary: { titleIs: 'Samantekt', titleEn: 'Key Concepts and Summary', slug: 'summary' },
      glossary: { titleIs: 'Lykilhugtök', titleEn: 'Key Terms', slug: 'key-terms' },
    };
  }
  // Return only non-exercise sections (exercises are compiled separately)
  const result = {};
  for (const [cls, cfg] of Object.entries(BOOK_CONFIG.endOfChapterSections)) {
    if (!cfg.exerciseType) {
      result[cls] = cfg;
    }
  }
  return result;
}

/**
 * Extract end-of-chapter sections from CNXML.
 * Returns array of { class, content, title } objects.
 */
function extractEndOfChapterSections(cnxml) {
  const sections = [];
  const endOfChapterSections = getEndOfChapterSections();

  for (const [sectionClass, config] of Object.entries(endOfChapterSections)) {
    // Special handling for glossary - look for <glossary> element instead of <section class="glossary">
    if (sectionClass === 'glossary') {
      const glossaryPattern = /<glossary>([\s\S]*?)<\/glossary>/g;
      let glossaryMatch;
      while ((glossaryMatch = glossaryPattern.exec(cnxml)) !== null) {
        // Wrap glossary in a section element with title for consistent rendering
        const wrappedContent = `<section class="glossary">
  <title>${config.titleIs}</title>
  ${glossaryMatch[0]}
</section>`;

        sections.push({
          class: sectionClass,
          content: wrappedContent,
          title: config.titleEn,
          titleIs: config.titleIs,
          slug: config.slug,
        });
      }
      continue;
    }

    // Match sections with this class
    const pattern = new RegExp(
      `<section\\s+[^>]*class="${sectionClass}"[^>]*>([\\s\\S]*?)<\\/section>`,
      'g'
    );
    let match;
    while ((match = pattern.exec(cnxml)) !== null) {
      const sectionContent = match[1];

      // Extract title if present. [\s\S]*? (not [^<]+) for the same markup-title
      // bug class; here the value is a fallback that titleIs overrides downstream,
      // so it is not reader-facing, but kept consistent.
      const titleMatch = sectionContent.match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch ? titleMatch[1] : config.titleEn;

      sections.push({
        class: sectionClass,
        content: match[0], // Full section XML
        title,
        titleIs: config.titleIs,
        slug: config.slug,
      });
    }
  }

  return sections;
}

/**
 * Render an end-of-chapter section as a standalone HTML page.
 */
function renderEndOfChapterSection(section, context) {
  const { renderCnxmlToHtml } = context;

  // Wrap section in minimal CNXML document structure for rendering
  const cnxmlDoc = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml">
  <content>
    ${section.content}
  </content>
</document>`;

  // Render using existing render function
  // Set excludeSections: false to prevent the section from being skipped
  // Override title with configured Icelandic title
  // Set isEndOfChapter to suppress the chapter outline (which is for intro pages only)
  const { html } = renderCnxmlToHtml(cnxmlDoc, {
    ...context.options,
    excludeSections: false,
    titleOverride: section.titleIs,
    isEndOfChapter: true,
  });

  return html;
}

/**
 * Write end-of-chapter section HTML to file.
 */
function writeEndOfChapterSection(chapter, section, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use single-digit naming for consistency with ch1-5
  const filename = `${chapter}-${section.slug}.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

// =====================================================================
// KEY EQUATIONS COMPILATION
// =====================================================================

/**
 * Extract key equations from explicit <section class="key-equations"> sections
 * across all modules in a chapter.
 * Returns array of { mathml, moduleId, sectionId }
 */
function extractKeyEquations(chapter, modules, track) {
  const chapterDir = formatChapterDir(chapter);
  const equations = [];

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    const cnxml = fs.readFileSync(modulePath, 'utf-8');

    // Find all <section class="key-equations"> sections
    const sectionPattern = /<section\s+[^>]*class="key-equations"[^>]*>([\s\S]*?)<\/section>/g;
    let sectionMatch;

    while ((sectionMatch = sectionPattern.exec(cnxml)) !== null) {
      const sectionContent = sectionMatch[1];
      const sectionId = sectionMatch[0].match(/id="([^"]+)"/)?.[1] || '';

      // Extract content from table rows in this section
      // Pattern: <row><entry>CONTENT</entry></row>
      // Content can be MathML or inline HTML (emphasis, sub, sup tags)
      const rowPattern = /<row>\s*<entry>([\s\S]*?)<\/entry>\s*<\/row>/g;
      let rowMatch;

      while ((rowMatch = rowPattern.exec(sectionContent)) !== null) {
        const entryContent = rowMatch[1].trim();

        // Only add non-empty entries
        if (entryContent) {
          equations.push({
            mathml: entryContent, // Keep the name 'mathml' for consistency, but it may contain HTML
            moduleId,
            sectionId,
          });
        }
      }
    }
  }

  return equations;
}

/**
 * Render key equations as HTML table.
 */
function renderKeyEquations(chapter, equations, equationTextDictionary) {
  const lines = [];
  const context = {
    chapter,
    bookSlug: BOOK_SLUG,
    embedMap: EMBED_MAP,
    figures: {},
    tables: {},
    examples: {},
    terms: {},
    footnotes: [],
    equationTextDictionary,
  };

  lines.push('<section class="key-equations">');

  if (equations.length === 0) {
    lines.push('  <p>Engar lykiljöfnur í þessum kafla.</p>');
  } else {
    lines.push('  <table class="key-equations-table unnumbered unstyled">');
    lines.push('    <tbody>');

    for (const eq of equations) {
      let renderedMath;

      // Check if this is MathML (starts with <m:math>) or inline HTML/CNXML
      if (eq.mathml.trim().startsWith('<m:math')) {
        // Entry may contain multiple <m:math> blocks (e.g., equation + units).
        // Render each separately since MathJax requires a single root element.
        const mathBlocks = eq.mathml.match(/<m:math[\s\S]*?<\/m:math>/g) || [];
        const parts = [];
        let remaining = eq.mathml;
        for (const block of mathBlocks) {
          const idx = remaining.indexOf(block);
          if (idx > 0) {
            const textBefore = remaining.substring(0, idx).trim();
            if (textBefore) parts.push(processInlineContent(textBefore, context));
          }
          let localizedBlock = localizeNumbersInMathML(block);
          localizedBlock = localizeMathMLText(localizedBlock, equationTextDictionary);
          parts.push(renderMathML(localizedBlock, true));
          remaining = remaining.substring(idx + block.length);
        }
        if (remaining.trim()) {
          parts.push(processInlineContent(remaining.trim(), context));
        }
        renderedMath = parts.join(' ');
      } else {
        // Process inline CNXML content (e.g., <emphasis>, <sub>, <sup>)
        renderedMath = processInlineContent(eq.mathml, context);
      }

      lines.push('      <tr>');
      lines.push(`        <td>${renderedMath}</td>`);
      lines.push('      </tr>');
    }

    lines.push('    </tbody>');
    lines.push('  </table>');
  }

  lines.push('</section>');

  return lines.join('\n');
}

/**
 * Write key equations HTML to file.
 */
function writeKeyEquations(chapter, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${chapter}-key-equations.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

// =====================================================================
// CHAPTER GLOSSARY COMPILATION
// =====================================================================

/**
 * Extract glossary definitions from all modules in a chapter.
 * Returns array of { id, term, meaningContent, moduleId } sorted alphabetically (Icelandic).
 */
function extractChapterGlossary(chapter, modules, track) {
  const chapterDir = formatChapterDir(chapter);
  const definitions = [];

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    const cnxml = fs.readFileSync(modulePath, 'utf-8');

    const glossaryMatch = cnxml.match(/<glossary>([\s\S]*?)<\/glossary>/);
    if (!glossaryMatch) continue;

    const defs = extractNestedElements(glossaryMatch[1], 'definition');
    for (const def of defs) {
      // Use [\s\S]*? so terms containing <m:math> or <emphasis> children are captured.
      const termMatch = def.content.match(/<term>([\s\S]*?)<\/term>/);
      const meaningMatch = def.content.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);

      if (termMatch && meaningMatch) {
        definitions.push({
          id: def.id || null,
          term: stripTags(termMatch[1]).trim(), // plain text for sort / termsMap key
          termContent: termMatch[1].trim(), // raw inner HTML for rendering
          meaningContent: meaningMatch[1],
          moduleId,
        });
      }
    }
  }

  // Sort alphabetically using Icelandic collation
  const collator = new Intl.Collator('is');
  definitions.sort((a, b) => collator.compare(a.term, b.term));

  return definitions;
}

/**
 * Render compiled glossary as HTML definition list.
 */
function renderCompiledGlossary(chapter, definitions, context) {
  const lines = [];

  lines.push('<section class="glossary">');

  if (definitions.length === 0) {
    lines.push('  <p>Engin lykilhugtök í þessum kafla.</p>');
  } else {
    lines.push('  <dl>');

    for (const def of definitions) {
      const termHtml = processInlineContent(def.termContent || def.term, context);
      const meaning = processInlineContent(def.meaningContent, context);
      lines.push(`    <dt${def.id ? ` id="${escapeAttr(def.id)}"` : ''}>${termHtml}</dt>`);
      lines.push(`    <dd>${meaning}</dd>`);
    }

    lines.push('  </dl>');
  }

  lines.push('</section>');

  return lines.join('\n');
}

/**
 * Write compiled glossary HTML to file.
 */
function writeCompiledGlossary(chapter, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${chapter}-key-terms.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

// =====================================================================
// SECTION SUMMARY COMPILATION
// =====================================================================

/**
 * Extract section summaries from all modules in a chapter.
 * Returns array of { moduleId, sectionNumber, sectionTitle, summaryContent }
 */
function extractSectionSummaries(chapter, modules, moduleSections, track) {
  const chapterDir = formatChapterDir(chapter);
  const summariesByModule = [];

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    const cnxml = fs.readFileSync(modulePath, 'utf-8');

    // Extract summary section (avoid end-of-chapter summary by looking for non-EOC summaries)
    // Section summaries are within the main content, not at the end as separate sections
    const summaryPattern = /<section\s+[^>]*class="summary"[^>]*>([\s\S]*?)<\/section>/g;
    let summaryMatch;
    let foundSummary = false;

    while ((summaryMatch = summaryPattern.exec(cnxml)) !== null) {
      const summaryContent = summaryMatch[0]; // Full section tag

      // Skip if this looks like an end-of-chapter summary (usually the last module)
      // Section summaries have specific IDs and are in the middle of modules
      // We can distinguish by checking if there are other sections after this one
      const remainingContent = cnxml.substring(summaryMatch.index + summaryMatch[0].length);
      const hasMoreSections = /<section/.test(remainingContent);

      // Only include if this is likely a section summary (not EOC summary)
      // Section summaries typically come before other sections like key-equations, exercises
      if (hasMoreSections || !foundSummary) {
        const sectionInfo = moduleSections[moduleId];
        if (sectionInfo) {
          summariesByModule.push({
            moduleId,
            sectionNumber: `${chapter}.${sectionInfo.section}`,
            sectionTitle: sectionInfo.titleIs || sectionInfo.titleEn || '',
            summaryContent,
          });
          foundSummary = true;
          break; // Only take the first summary from each module
        }
      }
    }
  }

  return summariesByModule;
}

/**
 * Render compiled summary HTML (matching chapters 1-5 format).
 * Takes summaries from all sections and compiles them into one page.
 */
function renderCompiledSummary(chapter, summariesByModule, context) {
  const lines = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="is">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>Kafli ${chapter} - Samantekt</title>`);
  lines.push('  <link rel="stylesheet" href="/styles/content.css">');
  lines.push('</head>');
  lines.push('<body>');
  lines.push('  <article class="chapter-resource summary">');
  lines.push('    <header>');
  lines.push('      <h1>Samantekt</h1>');
  lines.push('    </header>');
  lines.push('    <main>');

  for (const summary of summariesByModule) {
    // Render the summary section content
    const { html } = context.renderCnxmlToHtml(
      `<?xml version="1.0"?><document xmlns="http://cnx.rice.edu/cnxml"><content>${summary.summaryContent}</content></document>`,
      { ...context.options, excludeSections: false }
    );

    // Extract just the section content (remove wrapper HTML)
    const sectionMatch = html.match(/<section[\s\S]*?<\/section>/);
    if (sectionMatch) {
      let sectionHtml = sectionMatch[0];

      // Replace the section class and add module ID
      sectionHtml = sectionHtml.replace(
        /<section([^>]*)class="summary"([^>]*)>/,
        `<section class="summary-section" id="summary-${summary.moduleId}">`
      );

      // Replace the h2 title with section number + title
      // If there's only one summary for the whole chapter (e.g., organic chemistry),
      // it's a chapter-wide summary — use generic header instead of section-specific
      if (summariesByModule.length === 1) {
        sectionHtml = sectionHtml.replace(/<h2[^>]*>.*?<\/h2>/, '');
      } else {
        sectionHtml = sectionHtml.replace(
          /<h2[^>]*>.*?<\/h2>/,
          `<h2>${summary.sectionNumber} ${summary.sectionTitle}</h2>`
        );
      }

      lines.push('      ' + sectionHtml);
    }
  }

  lines.push('    </main>');
  lines.push('  </article>');
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

/**
 * Write compiled summary HTML to file.
 */
function writeCompiledSummary(chapter, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use single-digit naming for consistency with ch1-5
  const filename = `${chapter}-summary.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

// =====================================================================
// SECTION EXERCISES EXTRACTION AND RENDERING
// =====================================================================

/**
 * Extract exercise sections from all modules in a chapter.
 * Supports multiple exercise types per book (Chemistry has 'exercises',
 * Biology has 'multiple-choice'/'critical-thinking'/'visual-exercise',
 * Microbiology has 6 different types).
 *
 * Returns object keyed by exercise class:
 * {
 *   'multiple-choice': [{ moduleId, sectionNumber, sectionTitle, exercisesContent }, ...],
 *   'critical-thinking': [{ moduleId, sectionNumber, sectionTitle, exercisesContent }, ...],
 * }
 */
function extractSectionExercises(chapter, modules, moduleSections, track) {
  const chapterDir = formatChapterDir(chapter);

  // Determine which exercise section classes to look for
  const exerciseClasses = BOOK_CONFIG ? getExerciseSectionClasses(BOOK_SLUG) : [];
  // Fallback: always include 'exercises' for Chemistry-style books
  if (exerciseClasses.length === 0) {
    exerciseClasses.push('exercises');
  }

  const exercisesByType = {};
  for (const cls of exerciseClasses) {
    exercisesByType[cls] = [];
  }

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);
    if (!fs.existsSync(modulePath)) continue;

    const cnxml = fs.readFileSync(modulePath, 'utf-8');
    const sectionInfo = moduleSections[moduleId];
    if (!sectionInfo || sectionInfo.section === '0') continue;

    for (const exerciseClass of exerciseClasses) {
      const pattern = new RegExp(
        `<section\\s+[^>]*class="${exerciseClass}"[^>]*>[\\s\\S]*?<\\/section>`,
        'g'
      );
      let match;
      while ((match = pattern.exec(cnxml)) !== null) {
        exercisesByType[exerciseClass].push({
          moduleId,
          sectionNumber: `${chapter}.${sectionInfo.section}`,
          sectionTitle: sectionInfo.titleIs || sectionInfo.titleEn || '',
          exercisesContent: match[0],
          exerciseClass,
        });
        break; // Only take the first match per module per type
      }
    }
  }

  return exercisesByType;
}

/**
 * Check if exercise types in a book use separate slugs (separate files per type)
 * vs a single shared slug (combined file).
 *
 * @param {object} exercisesByType - Object keyed by exercise class
 * @returns {boolean} true if types should be rendered as separate files
 */
function exerciseTypesHaveSeparateSlugs(exercisesByType) {
  const slugs = new Set();
  for (const exerciseClass of Object.keys(exercisesByType)) {
    const cfg = BOOK_CONFIG?.endOfChapterSections?.[exerciseClass];
    if (cfg?.slug) slugs.add(cfg.slug);
  }
  return slugs.size > 1;
}

/**
 * Build a map of element ids that get relocated off their source module's
 * section page into a compiled end-of-chapter exercises page. The exercise
 * sections (and every id inside them — exercise/problem/solution/para ids) are
 * stripped from the module's section page and rendered onto `N-exercises`
 * (or `N-<type-slug>` for books with separate exercise files). Without this,
 * cross-references to that content resolve to the now-stripped section page and
 * 404 as dead anchors (handoff #3).
 *
 * Mirrors extractSectionExercises' classification (same class set, first-match
 * per module, section!=='0' guard) and writeCompiledExercises' slug choice so
 * the basenames match the files actually written.
 *
 * @returns {Map<string,string>} elementId → compiled page basename (e.g. "5-exercises")
 */
function buildRelocatedExerciseIds(chapter, modules, moduleSections, track) {
  const relocated = new Map();
  const chapterDir = formatChapterDir(chapter);

  const exerciseClasses = BOOK_CONFIG ? getExerciseSectionClasses(BOOK_SLUG) : [];
  if (exerciseClasses.length === 0) exerciseClasses.push('exercises');

  // Separate-slug books write one file per type; combined books share a single
  // "exercises" file. Match exerciseTypesHaveSeparateSlugs / writeCompiledExercises.
  const slugSet = new Set();
  for (const cls of exerciseClasses) {
    const cfg = BOOK_CONFIG?.endOfChapterSections?.[cls];
    if (cfg?.slug) slugSet.add(cfg.slug);
  }
  const separateSlugs = slugSet.size > 1;

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);
    if (!fs.existsSync(modulePath)) continue;
    const sectionInfo = moduleSections[moduleId];
    if (!sectionInfo || sectionInfo.section === '0') continue;

    const cnxml = fs.readFileSync(modulePath, 'utf-8');
    for (const exerciseClass of exerciseClasses) {
      const pattern = new RegExp(
        `<section\\s+[^>]*class="${exerciseClass}"[^>]*>[\\s\\S]*?<\\/section>`,
        'g'
      );
      const match = pattern.exec(cnxml); // first match only — mirrors extractSectionExercises
      if (!match) continue;

      const cfg = BOOK_CONFIG?.endOfChapterSections?.[exerciseClass];
      const slug = separateSlugs ? cfg?.slug || exerciseClass : 'exercises';
      const basename = `${chapter}-${slug}`;

      for (const m of match[0].matchAll(/\sid="([^"]+)"/g)) {
        relocated.set(m[1], basename);
      }
    }
  }

  return relocated;
}

/**
 * Render a single exercise type as a standalone page.
 * Used when exercise types have separate slugs (e.g., microbiology).
 *
 * @param {number} chapter - Chapter number
 * @param {string} exerciseClass - Exercise class name (e.g., 'multiple-choice')
 * @param {Array} exercisesForType - Array of module exercises for this type
 * @param {Map} chapterExerciseNumbers - Exercise numbering map
 * @param {object} context - Render context
 * @returns {string} Full HTML document for this exercise type
 */
function renderSingleTypeExercises(
  chapter,
  exerciseClass,
  exercisesForType,
  chapterExerciseNumbers,
  context
) {
  const typeConfig = BOOK_CONFIG?.endOfChapterSections?.[exerciseClass];
  const typeTitle = typeConfig?.titleIs || generateFallbackLabel(exerciseClass);
  const slug = typeConfig?.slug || exerciseClass;

  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="is">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>Kafli ${chapter} - ${typeTitle}</title>`);
  lines.push('  <link rel="stylesheet" href="/styles/content.css">');
  lines.push('</head>');
  lines.push('<body>');
  lines.push(
    `  <article class="chapter-resource exercises" data-exercise-type="${exerciseClass}">`
  );
  lines.push('    <header>');
  lines.push(`      <h1>${typeTitle}</h1>`);
  lines.push('    </header>');
  lines.push('    <main>');

  for (const exercises of exercisesForType) {
    const { html } = renderCnxmlToHtml(
      `<?xml version="1.0"?><document xmlns="http://cnx.rice.edu/cnxml"><content>${exercises.exercisesContent}</content></document>`,
      {
        ...context,
        verbose: false,
        lang: 'is',
        chapter,
        moduleId: exercises.moduleId,
        // Renders onto this type's standalone N-<slug> page (#3).
        currentPageBasename: `${chapter}-${slug}`,
        chapterExerciseNumbers,
        excludeSections: false,
        includeSolutions: false,
      }
    );

    const sectionMatch = html.match(/<section[\s\S]*?<\/section>/);
    if (sectionMatch) {
      let sectionHtml = sectionMatch[0];

      // Remove the original section title
      sectionHtml = sectionHtml.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '');

      // Replace the section class and add module info
      const classRegex = new RegExp(`<section([^>]*)class="${exerciseClass}"([^>]*)>`);
      sectionHtml = sectionHtml.replace(
        classRegex,
        `<section class="exercises-section" id="exercises-${exercises.moduleId}" data-section="${exercises.sectionNumber}">`
      );

      // Add section title as h2 (top-level heading under the page h1)
      const titleHtml = `      <h2>${exercises.sectionNumber} ${exercises.sectionTitle}</h2>\n`;
      sectionHtml = sectionHtml.replace(/<section([^>]*)>/, `$&\n${titleHtml}`);

      lines.push(sectionHtml);
    }
  }

  lines.push('    </main>');
  lines.push('  </article>');
  lines.push('');
  lines.push('  <script type="application/json" id="page-data">');
  lines.push(
    escapeJsonForScript(`{
  "moduleId": "${chapter}-${slug}",
  "chapter": ${chapter},
  "section": "${chapter}.0",
  "title": "${typeTitle}",
  "equations": [],
  "terms": {}
}`)
  );
  lines.push('  </script>');
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

/**
 * Render compiled exercises HTML.
 * Supports both single-type (Chemistry: 'exercises') and multi-type
 * (Biology/Microbiology: 'multiple-choice', 'critical-thinking', etc.).
 *
 * For multi-type books, each exercise type gets its own subsection with heading.
 *
 * @param {number} chapter - Chapter number
 * @param {object} exercisesByType - Object keyed by exercise class, each an array of module exercises
 * @param {Map} chapterExerciseNumbers - Exercise numbering map
 * @param {object} context - Render context
 */
function renderCompiledExercises(chapter, exercisesByType, chapterExerciseNumbers, context) {
  const lines = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="is">');
  lines.push('<head>');
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push(`  <title>Kafli ${chapter} - Æfingar í lok kafla</title>`);
  lines.push('  <link rel="stylesheet" href="/styles/content.css">');
  lines.push('</head>');
  lines.push('<body>');
  lines.push('  <article class="chapter-resource exercises">');
  lines.push('    <header>');
  lines.push('      <h1>Æfingar í lok kafla</h1>');
  lines.push('    </header>');
  lines.push('    <main>');

  // Get ordered list of exercise types that have content
  const exerciseTypes = Object.entries(exercisesByType).filter(
    ([, exercises]) => exercises.length > 0
  );
  const hasMultipleTypes = exerciseTypes.length > 1;

  // Footnote bodies live in a separate <section class="footnotes"> that
  // renderCnxmlToHtml appends AFTER the exercise <section>. The single-section
  // slice below keeps the marker but drops that body, so collect the bodies
  // here and re-emit them once before </article> (otherwise the in-text
  // footnote refs become dead anchors — efnafraedi-2e 7/12-exercises).
  const footnoteItems = [];

  for (const [exerciseClass, exercisesForType] of exerciseTypes) {
    // Add type heading for multi-type books
    if (hasMultipleTypes) {
      const typeConfig = BOOK_CONFIG?.endOfChapterSections?.[exerciseClass];
      const typeTitle = typeConfig?.titleIs || generateFallbackLabel(exerciseClass);
      lines.push(`    <section class="exercise-type-group" data-exercise-type="${exerciseClass}">`);
      lines.push(`      <h2 class="exercise-type-heading">${typeTitle}</h2>`);
    }

    for (const exercises of exercisesForType) {
      // Render the exercises section content
      const { html } = renderCnxmlToHtml(
        `<?xml version="1.0"?><document xmlns="http://cnx.rice.edu/cnxml"><content>${exercises.exercisesContent}</content></document>`,
        {
          ...context,
          verbose: false,
          lang: 'is',
          chapter,
          moduleId: exercises.moduleId,
          // This content renders onto the combined N-exercises page, not the
          // source module's section page — so body refs (figures, sections)
          // resolve cross-page while sibling exercise refs stay same-page (#3).
          currentPageBasename: `${chapter}-exercises`,
          chapterExerciseNumbers,
          excludeSections: false,
          includeSolutions: false,
        }
      );

      // Salvage any footnote bodies before slicing out the exercise section
      // (they render in a trailing <section class="footnotes"> that the slice
      // would otherwise discard).
      const footnotesMatch = html.match(/<section class="footnotes">[\s\S]*?<\/section>/);
      if (footnotesMatch) {
        const itemPattern = /<li id="[^"]*"[\s\S]*?<\/li>/g;
        let liMatch;
        while ((liMatch = itemPattern.exec(footnotesMatch[0])) !== null) {
          footnoteItems.push(liMatch[0]);
        }
      }

      // Extract just the section content (remove wrapper HTML)
      const sectionMatch = html.match(/<section[\s\S]*?<\/section>/);
      if (sectionMatch) {
        let sectionHtml = sectionMatch[0];

        // Remove the original section title (we'll add our own with section number)
        sectionHtml = sectionHtml.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '');

        // Replace the section class and add module info
        const classRegex = new RegExp(`<section([^>]*)class="${exerciseClass}"([^>]*)>`);
        sectionHtml = sectionHtml.replace(
          classRegex,
          `<section class="exercises-section" id="exercises-${exercises.moduleId}" data-section="${exercises.sectionNumber}">`
        );

        // For single-type books, add section title as h3; for multi-type, use h3 under the type h2
        const headingTag = hasMultipleTypes ? 'h3' : 'h2';
        const titleHtml = `      <${headingTag}>${exercises.sectionNumber} ${exercises.sectionTitle}</${headingTag}>\n`;
        sectionHtml = sectionHtml.replace(/<section([^>]*)>/, `$&\n${titleHtml}`);

        lines.push(sectionHtml);
      }
    }

    if (hasMultipleTypes) {
      lines.push('    </section>');
    }
  }

  lines.push('    </main>');

  if (footnoteItems.length > 0) {
    lines.push('<section class="footnotes">');
    lines.push('  <h2>Neðanmálsgreinar</h2>');
    lines.push('  <ol class="footnotes-list">');
    for (const item of footnoteItems) lines.push(`    ${item}`);
    lines.push('  </ol>');
    lines.push('</section>');
  }

  lines.push('  </article>');
  lines.push('');
  lines.push(`  <script type="application/json" id="page-data">`);
  lines.push(
    escapeJsonForScript(`{
  "moduleId": "${chapter}-exercises",
  "chapter": ${chapter},
  "section": "${chapter}.0",
  "title": "Æfingar í lok kafla",
  "equations": [],
  "terms": {}
}`)
  );
  lines.push('  </script>');
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

/**
 * Write compiled exercises HTML to file.
 * @param {number} chapter - Chapter number
 * @param {string} track - Track name ('faithful' or 'mt-preview')
 * @param {string} html - HTML content
 * @param {string} [slug='exercises'] - Filename slug (e.g., 'exercises', 'multiple-choice')
 */
function writeCompiledExercises(chapter, track, html, slug = 'exercises') {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use single-digit naming for consistency with ch1-5
  const filename = `${chapter}-${slug}.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

// =====================================================================
// ANSWER KEY EXTRACTION AND RENDERING
// =====================================================================

/**
 * Extract all solutions from exercises across all chapter modules.
 * Returns array of { moduleId, sectionTitle, answers: [{ id, number, content }] }
 */
function extractAnswerKey(chapter, modules, moduleSections, track) {
  const chapterDir = formatChapterDir(chapter);
  const answersByModule = [];
  let exerciseNumber = 0;

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    const cnxml = fs.readFileSync(modulePath, 'utf-8');
    const moduleAnswers = [];

    // Extract all exercises with solutions
    const exercisePattern = /<exercise\s+id="([^"]+)">([\s\S]*?)<\/exercise>/g;
    let exerciseMatch;

    while ((exerciseMatch = exercisePattern.exec(cnxml)) !== null) {
      exerciseNumber++;
      const exerciseId = exerciseMatch[1];
      const exerciseContent = exerciseMatch[2];

      // Check if this exercise has a solution
      const solutionMatch = exerciseContent.match(/<solution\s+id="[^"]*">([\s\S]*?)<\/solution>/);

      if (solutionMatch) {
        const solutionContent = solutionMatch[1];

        moduleAnswers.push({
          id: exerciseId,
          number: exerciseNumber,
          content: solutionContent,
        });
      }
    }

    // Only add module if it has answers
    if (moduleAnswers.length > 0) {
      const sectionInfo = moduleSections[moduleId];
      const sectionTitle = sectionInfo
        ? `${chapter}.${sectionInfo.section} ${sectionInfo.titleIs}`
        : `Module ${moduleId}`;

      answersByModule.push({
        moduleId,
        sectionTitle,
        answers: moduleAnswers,
      });
    }
  }

  return answersByModule;
}

/**
 * Render answer key HTML.
 */
function renderAnswerKey(chapter, answersByModule, context) {
  const { renderCnxmlToHtml } = context;
  const chapterStr = formatChapterOutput(chapter);

  let html = `<!DOCTYPE html>
<html lang="is">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kafli ${chapter} - Svör við æfingum</title>
  <link rel="stylesheet" href="/styles/content.css">
</head>
<body>
  <article class="chapter-resource answer-key">
    <header>
      <h1>Svör við æfingum</h1>
    </header>
    <main>
`;

  for (const module of answersByModule) {
    html += `      <section class="answers-section">
        <h2>${module.sectionTitle}</h2>
        <div class="answers-list">
`;

    for (const answer of module.answers) {
      // Wrap solution content in minimal CNXML document for rendering
      const cnxmlDoc = `<?xml version="1.0"?>
<document xmlns="http://cnx.rice.edu/cnxml">
  <content>
    ${answer.content}
  </content>
</document>`;

      // Render solution content to HTML
      const { html: answerHtml } = renderCnxmlToHtml(cnxmlDoc, context.options);

      // Extract just the content (remove wrapper tags)
      const contentMatch = answerHtml.match(/<main>([\s\S]*?)<\/main>/);
      const answerContent = contentMatch ? contentMatch[1].trim() : answerHtml;

      html += `          <div class="answer-entry" id="${answer.id}" data-exercise-id="${answer.id}" data-exercise-number="${answer.number}">
            ${answerContent}
          </div>
`;
    }

    html += `        </div>
      </section>
`;
  }

  const answerKeyPageData = escapeJsonForScript(`{
  "moduleId": "${chapterStr}-answer-key",
  "chapter": ${chapter},
  "section": "${chapter}.0",
  "title": "Svör við æfingum",
  "equations": [],
  "terms": {}
}`);
  html += `    </main>
  </article>
  <script type="application/json" id="page-data">
${answerKeyPageData}
  </script>
</body>
</html>
`;

  return html;
}

/**
 * Write answer key HTML to file.
 */
function writeAnswerKey(chapter, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use single-digit naming for consistency with ch1-5
  const filename = `${chapter}-answer-key.html`;
  const outputPath = path.join(outputDir, filename);

  const backup = safeWrite(outputPath, html);
  if (backup) logBackup(BOOK_SLUG, chapter, 'render', outputPath, backup);

  return outputPath;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  BOOK_SLUG = args.book;
  BOOKS_DIR = `books/${args.book}`;

  // Load book-specific rendering config
  BOOK_CONFIG = getBookRenderConfig(BOOK_SLUG);
  NOTE_TYPE_LABELS = BOOK_CONFIG.noteTypeLabels;
  TITLE_TRANSLATIONS = BOOK_CONFIG.titleTranslations;
  EMBED_MAP = loadEmbedMapping(BOOK_SLUG);

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);

  if (args.chapter == null) {
    // NB: `== null` (not `!args.chapter`) so chapter 0 (the preface / ch00) is valid.
    console.error('Error: --chapter is required');
    printHelp();
    process.exit(1);
  }

  try {
    const modules = findChapterModules(args.chapter, args.track, args.module);
    const chapterDir = formatChapterDir(args.chapter);
    const chapterStr = formatChapterOutput(args.chapter);

    // Clean stale HTML files before rendering (full chapter only, not single-module).
    // Also sweep editor/pipeline artifacts (safeWrite `.backup.*`, stray `.pre-fix-*`,
    // `.bak`, leftover `.tmp.*`) so they never accumulate in — or get synced from —
    // the publication directory (handoff #9).
    if (!args.module) {
      const outputDir = path.join(BOOKS_DIR, '05-publication', args.track, 'chapters', chapterStr);
      if (fs.existsSync(outputDir)) {
        const all = fs.readdirSync(outputDir);
        const html = all.filter((f) => f.endsWith('.html'));
        const artifacts = all.filter((f) => isPublicationArtifact(f));
        for (const f of [...html, ...artifacts]) {
          fs.unlinkSync(path.join(outputDir, f));
        }
        if (html.length > 0) {
          console.log(`Cleaned ${html.length} existing HTML file(s) from ${chapterStr}/`);
        }
        if (artifacts.length > 0) {
          console.log(`Cleaned ${artifacts.length} stale artifact file(s) from ${chapterStr}/`);
        }
      }
    }

    // Build module sections map from structure + segment files
    const moduleSections = buildModuleSections(BOOK_SLUG, args.chapter);

    // Appendix id → { letter, basename } lookup, so a chapter→appendix cross-ref
    // resolves to the appendix landing URL (A1). Skipped while rendering the
    // appendices themselves (within-appendix links stay same-page).
    const appendixIdMap =
      args.chapter === 'appendices' ? new Map() : buildAppendixIdMap(BOOK_SLUG, args.track);

    // Load equation text translation dictionary
    const equationTextDictionary = loadEquationTextDictionary(BOOK_SLUG);

    // Build chapter-wide figure/table/example/equation number maps across ALL modules
    // This enables cross-module references (e.g., 5-2 referencing a table in 5-1)
    const chapterFigureNumbers = new Map();
    const chapterTableNumbers = new Map();
    const chapterEquationNumbers = new Map();
    const chapterExampleNumbers = new Map();
    const chapterExerciseNumbers = new Map();
    const chapterSectionTitles = new Map(); // section ID -> title text
    // Map<elementId, moduleId[]> — registry of every id-bearing element across the chapter.
    // Used by cnxml-elements.js to rewrite cross-module fragment-only links (e.g. <link target-id="X"/>
    // where X lives in a different module than the one currently rendering). Stores arrays because
    // some books (e.g. lifraen-efnafraedi) reuse element ids across modules within one chapter.
    const chapterIdToModule = new Map();
    const addId = (id, modId) => {
      if (!id) return;
      const owners = chapterIdToModule.get(id);
      if (owners) {
        if (!owners.includes(modId)) owners.push(modId);
      } else {
        chapterIdToModule.set(id, [modId]);
      }
    };
    // Chapter-wide module set for numbering maps and rollups. For the faithful
    // track this is the UNION of reviewed modules and the complete mt-preview
    // baseline, so rollups and cross-chapter numbering cover every section, not
    // just the reviewed ones (#1). translatedCnxmlPath supplies the mt-preview
    // CNXML for the unreviewed members. Per-module section pages still iterate
    // the faithful-only `modules` list, so the overlay model is preserved.
    const allModuleSet = new Set(findChapterModules(args.chapter, args.track));
    if (args.track === 'faithful') {
      try {
        for (const m of findChapterModules(args.chapter, 'mt-preview')) allModuleSet.add(m);
      } catch {
        /* no mt-preview baseline for this chapter — faithful stands alone */
      }
    }
    // Sort modules by section number so numbering follows chapter order, not filename order
    const allModules = [...allModuleSet].sort((a, b) => {
      const secA = moduleSections[a] ? moduleSections[a].section : 999;
      const secB = moduleSections[b] ? moduleSections[b].section : 999;
      return secA - secB;
    });
    let chapterFigCounter = 0;
    let chapterTableCounter = 0;
    let chapterEquationCounter = 0;
    let chapterExampleCounter = 0;
    let chapterExerciseCounter = 0;

    for (const modId of allModules) {
      const modPath = translatedCnxmlPath(args.track, chapterDir, modId);
      const modCnxml = fs.readFileSync(modPath, 'utf-8');

      // Use composite keys (moduleId:elementId) because some books (e.g., lifraen-efnafraedi)
      // reuse IDs like fig-00001, exam-00001 across modules within the same chapter.
      const figPattern = /<figure\s+id="([^"]+)"/g;
      let fm;
      while ((fm = figPattern.exec(modCnxml)) !== null) {
        chapterFigCounter++;
        chapterFigureNumbers.set(`${modId}:${fm[1]}`, `${args.chapter}.${chapterFigCounter}`);
        addId(fm[1], modId);
      }

      const tblPattern = /<table\s+[^>]*id="([^"]+)"/g;
      let tm;
      while ((tm = tblPattern.exec(modCnxml)) !== null) {
        chapterTableCounter++;
        chapterTableNumbers.set(`${modId}:${tm[1]}`, `${args.chapter}.${chapterTableCounter}`);
        addId(tm[1], modId);
      }

      const examplePattern = /<example\s+id="([^"]+)"/g;
      let exm2;
      while ((exm2 = examplePattern.exec(modCnxml)) !== null) {
        chapterExampleCounter++;
        chapterExampleNumbers.set(
          `${modId}:${exm2[1]}`,
          `${args.chapter}.${chapterExampleCounter}`
        );
        addId(exm2[1], modId);
      }

      // Build numbered equation map (skip unnumbered)
      const eqPattern = /<equation\s+([^>]*?)>/g;
      let eqm;
      while ((eqm = eqPattern.exec(modCnxml)) !== null) {
        const attrs = eqm[1];
        const idMatch = attrs.match(/id="([^"]+)"/);
        // Register every equation id (numbered or not) so cross-page links to unnumbered
        // equations also resolve.
        if (idMatch) addId(idMatch[1], modId);
        // Skip numbering for unnumbered
        if (attrs.includes('class="unnumbered"')) continue;
        if (idMatch) {
          chapterEquationCounter++;
          chapterEquationNumbers.set(
            `${modId}:${idMatch[1]}`,
            `${args.chapter}.${chapterEquationCounter}`
          );
        }
      }

      // Build section title map for cross-reference resolution
      const secPattern = /<section\s+id="([^"]+)"[^>]*>\s*<title>([\s\S]*?)<\/title>/g;
      let sm;
      while ((sm = secPattern.exec(modCnxml)) !== null) {
        // Strip any inline markup from the title text
        const titleText = sm[2].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(sm[1], titleText);
        addId(sm[1], modId);
      }

      // Also capture example/note IDs with titles
      // OpenStax CNXML has titles either directly under <example> or inside a nested <para>:
      //   <example id="..."><title>...</title>            (direct)
      //   <example id="..."><para id="..."><title>...</title>  (nested in para)
      const exPattern = /<example\s+id="([^"]+)"[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
      let em;
      while ((em = exPattern.exec(modCnxml)) !== null) {
        const titleText = em[2].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(em[1], titleText);
        // (id already registered by the example loop above)
      }

      const notePattern = /<note\s+[^>]*id="([^"]+)"[^>]*>\s*<title>([\s\S]*?)<\/title>/g;
      let nm;
      while ((nm = notePattern.exec(modCnxml)) !== null) {
        const titleText = nm[2].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(nm[1], titleText);
        addId(nm[1], modId);
      }

      // Build chapter-wide exercise number map
      const exerPattern = /<exercise\s+id="([^"]+)"/g;
      let exm;
      while ((exm = exerPattern.exec(modCnxml)) !== null) {
        chapterExerciseCounter++;
        chapterExerciseNumbers.set(
          `${modId}:${exm[1]}`,
          `${args.chapter}.${chapterExerciseCounter}`
        );
        addId(exm[1], modId);
      }

      // Also register para ids (used as anchor targets in some cross-references).
      const paraPattern = /<para\s+[^>]*id="([^"]+)"/g;
      let pm;
      while ((pm = paraPattern.exec(modCnxml)) !== null) {
        addId(pm[1], modId);
      }
    }

    if (args.verbose) {
      console.error(
        `Chapter-wide maps: ${chapterFigureNumbers.size} figures, ${chapterTableNumbers.size} tables, ${chapterEquationNumbers.size} equations, ${chapterExampleNumbers.size} examples, ${chapterExerciseNumbers.size} exercises`
      );
    }

    // Ids relocated into compiled end-of-chapter pages (exercises). Chapter-wide:
    // a reference in one module may point at an exercise compiled from another,
    // so this must be built across all modules before any page renders (#3).
    const relocatedIds = buildRelocatedExerciseIds(
      args.chapter,
      allModules,
      moduleSections,
      args.track
    );
    if (args.verbose && relocatedIds.size > 0) {
      console.error(`Relocated exercise ids: ${relocatedIds.size}`);
    }

    const writtenFiles = []; // Track files written in this render pass for cleanup on failure

    try {
      for (const moduleId of modules) {
        // Fresh MJX-N id space per page so an edit to one module doesn't churn
        // the equation ids on every later page in the chapter (#14).
        resetMathJaxIds();
        if (args.verbose) {
          console.error(`Rendering: ${moduleId}`);
        }

        const cnxmlPath = translatedCnxmlPath(args.track, chapterDir, moduleId);
        const cnxml = fs.readFileSync(cnxmlPath, 'utf-8');

        const renderResult = renderCnxmlToHtml(cnxml, {
          verbose: args.verbose,
          lang: args.lang,
          chapter: args.chapter,
          moduleId,
          moduleSections,
          chapterFigureNumbers,
          chapterTableNumbers,
          chapterEquationNumbers,
          chapterExampleNumbers,
          chapterExerciseNumbers,
          chapterSectionTitles,
          chapterIdToModule,
          appendixIdMap,
          relocatedIds,
          equationTextDictionary,
        });
        let html = renderResult.html;
        const pageData = renderResult.pageData;

        // Special handling for Periodic Table appendix
        // Replace static image with link to interactive periodic table
        if (BOOK_CONFIG?.specialModules?.[moduleId] === 'periodic-table') {
          const mainContentMatch = html.match(/(<main>)([\s\S]*?)(<\/main>)/);
          if (mainContentMatch) {
            // Preserve any element ids from the original rendered content so
            // cross-references from chapter text (e.g. <a href="#fs-idm…">viðauka A</a>)
            // still resolve to a real anchor on this page.
            const preservedIds = Array.from(
              new Set(Array.from(mainContentMatch[2].matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]))
            ).filter((id) => id !== 'title' && id !== 'page-data');
            const anchors = preservedIds
              .map((id) => `<span id="${id}" class="preserved-anchor"></span>`)
              .join('');
            const newMainContent = `<main>
${anchors}
<div style="text-align: center; padding: 2rem;">
  <h2>Gagnavirkt lotukerfi frumefna</h2>
  <p style="font-size: 1.1rem; margin: 1.5rem 0;">
    Skoðaðu gagnavirkt lotukerfi okkar þar sem þú getur séð nákvæmar upplýsingar um öll frumefni.
  </p>
  <a href="/${BOOK_SLUG}/lotukerfi" class="periodic-table-link" style="display: inline-block; padding: 1rem 2rem; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; font-size: 1.1rem; margin-top: 1rem;">
    Opna gagnavirka lotukerfið
  </a>
  <p style="margin-top: 2rem; color: #666;">
    <em>Einnig er hægt að nálgast lotukerfið beint á: <a href="/${BOOK_SLUG}/lotukerfi">/${BOOK_SLUG}/lotukerfi</a></em>
  </p>
</div>
</main>`;
            html = html.replace(/(<main>)[\s\S]*?(<\/main>)/, newMainContent);
          }
        }

        // Validate output is non-empty
        if (!html || html.trim().length < 100) {
          console.error(
            `  ERROR: Rendered HTML for ${moduleId} is empty or too short (${html?.length || 0} chars)`
          );
        }

        const outputPath = writeOutput(args.chapter, moduleId, args.track, html, moduleSections);
        writtenFiles.push(outputPath);

        console.log(`${moduleId}: Rendered to HTML`);
        console.log(`  → ${outputPath}`);

        // Report equation render stats from pageData context
        // Extract render stats from the context that was used
        const renderStats = pageData._renderStats;
        if (renderStats && renderStats.equations > 0) {
          if (renderStats.failures.length > 0) {
            console.error(
              `  Equations: ${renderStats.success}/${renderStats.equations} rendered OK, ${renderStats.failures.length} FAILED`
            );
            for (const f of renderStats.failures.slice(0, 3)) {
              console.error(
                `    - ${f.id || 'unknown'}: ${f.reason}${f.latex ? ` (${f.latex})` : ''}`
              );
            }
          } else if (args.verbose) {
            console.log(`  Equations: ${renderStats.success}/${renderStats.equations} rendered OK`);
          }
        }
      }

      // Extract and render end-of-chapter sections from the last module
      if (modules.length > 0) {
        const lastModuleId = modules[modules.length - 1];
        const lastModulePath = translatedCnxmlPath(args.track, chapterDir, lastModuleId);
        const lastModuleCnxml = fs.readFileSync(lastModulePath, 'utf-8');

        const endOfChapterSections = extractEndOfChapterSections(lastModuleCnxml);

        if (endOfChapterSections.length > 0 && args.verbose) {
          console.log(`\nFound ${endOfChapterSections.length} end-of-chapter section(s)`);
        }

        for (const section of endOfChapterSections) {
          if (section.class === 'glossary') continue; // compiled from all modules below
          if (args.verbose) {
            console.log(`Rendering: ${section.titleIs} (${section.slug})`);
          }

          const html = renderEndOfChapterSection(section, {
            renderCnxmlToHtml,
            options: {
              verbose: args.verbose,
              lang: args.lang,
              chapter: args.chapter,
              moduleId: `${chapterStr}-${section.slug}`,
              moduleSections,
              chapterFigureNumbers,
              chapterTableNumbers,
              chapterExampleNumbers,
              chapterExerciseNumbers,
              chapterSectionTitles,
              chapterIdToModule,
              equationTextDictionary,
            },
          });

          const outputPath = writeEndOfChapterSection(args.chapter, section, args.track, html);
          writtenFiles.push(outputPath);

          console.log(`${section.titleIs}: Rendered to HTML`);
          console.log(`  → ${outputPath}`);
        }
      }

      // Extract and render compiled glossary from all modules
      if (args.verbose) {
        console.log('\nExtracting glossary definitions...');
      }

      const chapterGlossary = extractChapterGlossary(args.chapter, allModules, args.track);

      if (chapterGlossary.length > 0) {
        if (args.verbose) {
          console.log(
            `Found ${chapterGlossary.length} definition(s) across ${allModules.length} module(s)`
          );
        }

        const glossaryContext = {
          chapter: args.chapter,
          figures: {},
          tables: {},
          examples: {},
          terms: {},
          footnotes: [],
          equationTextDictionary,
        };

        const glossaryContentHtml = renderCompiledGlossary(
          args.chapter,
          chapterGlossary,
          glossaryContext
        );

        // Build terms map for pageData
        const termsMap = {};
        for (const def of chapterGlossary) {
          termsMap[def.term] = stripTags(def.meaningContent).trim();
        }

        const fullGlossaryHtml = buildHtmlDocument({
          title: 'Lykilhugtök',
          lang: args.lang,
          content: glossaryContentHtml,
          pageData: {
            moduleId: `${chapterStr}-key-terms`,
            chapter: args.chapter,
            section: `${args.chapter}.0`,
            title: 'Lykilhugtök',
            equations: [],
            terms: termsMap,
          },
          sectionNumber: `${args.chapter}.0`,
          isIntro: true,
        });

        const glossaryPath = writeCompiledGlossary(args.chapter, args.track, fullGlossaryHtml);
        writtenFiles.push(glossaryPath);

        console.log(`Lykilhugtök: Rendered ${chapterGlossary.length} definitions to HTML`);
        console.log(`  → ${glossaryPath}`);
      } else if (args.verbose) {
        console.log('No glossary definitions found in this chapter');
      }

      // Fallback: if no <glossary> definitions found, check for <section class="key-terms">
      // (used by newer OpenStax books like Organic Chemistry)
      if (chapterGlossary.length === 0) {
        const lastModuleId = allModules[allModules.length - 1];
        const lastModulePath = translatedCnxmlPath(args.track, chapterDir, lastModuleId);

        if (fs.existsSync(lastModulePath)) {
          const lastCnxml = fs.readFileSync(lastModulePath, 'utf-8');
          const keyTermsMatch = lastCnxml.match(
            /<section\s+[^>]*class="key-terms"[^>]*>([\s\S]*?)<\/section>/
          );

          if (keyTermsMatch) {
            const items = extractNestedElements(keyTermsMatch[1], 'item');
            const termLines = [];

            for (const item of items) {
              // item.content is like: <link document="m00032" target-id="term-00006">alcohol</link>
              const linkMatch = item.content.match(
                /<link\s+document="([^"]+)"(?:\s+target-id="([^"]+)")?[^>]*>([^<]+)<\/link>/
              );
              if (linkMatch) {
                const termText = linkMatch[3].trim();
                const moduleId = linkMatch[1];
                const sectionInfo = moduleSections[moduleId];
                const sectionSlug = sectionInfo
                  ? getOutputFilename(moduleId, args.chapter, moduleSections).replace('.html', '')
                  : moduleId;
                termLines.push(
                  `<li><a href="/content/${BOOK_SLUG}/chapters/${chapterStr}/${sectionSlug}.html">${escapeHtml(termText)}</a></li>`
                );
              } else {
                const plainText = item.content.replace(/<[^>]+>/g, '').trim();
                if (plainText) {
                  termLines.push(`<li>${escapeHtml(plainText)}</li>`);
                }
              }
            }

            if (termLines.length > 0) {
              const keyTermsContentHtml =
                '<section class="key-terms-section">\n<h2>Lykilhugtök</h2>\n<ul class="key-terms-list">\n' +
                termLines.join('\n') +
                '\n</ul>\n</section>';

              const fullKeyTermsHtml = buildHtmlDocument({
                title: 'Lykilhugtök',
                lang: args.lang,
                content: keyTermsContentHtml,
                pageData: {
                  moduleId: `${chapterStr}-key-terms`,
                  chapter: args.chapter,
                  section: `${args.chapter}.0`,
                  title: 'Lykilhugtök',
                  equations: [],
                  terms: {},
                },
                sectionNumber: `${args.chapter}.0`,
                isIntro: true,
              });

              const keyTermsPath = writeCompiledGlossary(
                args.chapter,
                args.track,
                fullKeyTermsHtml
              );
              writtenFiles.push(keyTermsPath);
              console.log(
                `Lykilhugtök: Rendered ${termLines.length} linked terms to HTML (section-based fallback)`
              );
              console.log(`  → ${keyTermsPath}`);
            }
          }
        }
      }

      // Extract and render compiled summary (matching chapters 1-5 format)
      if (args.verbose) {
        console.log('\nExtracting section summaries...');
      }

      const summariesByModule = extractSectionSummaries(
        args.chapter,
        allModules,
        moduleSections,
        args.track
      );

      if (summariesByModule.length > 0) {
        const totalSummaries = summariesByModule.length;

        if (args.verbose) {
          console.log(`Found ${totalSummaries} section summary/summaries`);
        }

        const compiledSummaryHtml = renderCompiledSummary(args.chapter, summariesByModule, {
          renderCnxmlToHtml,
          options: {
            verbose: args.verbose,
            lang: args.lang,
            chapter: args.chapter,
            moduleId: `${chapterStr}-summary`,
            moduleSections,
            chapterFigureNumbers,
            chapterTableNumbers,
            chapterExampleNumbers,
            chapterExerciseNumbers,
            chapterSectionTitles,
            chapterIdToModule,
            equationTextDictionary,
          },
        });

        const summaryPath = writeCompiledSummary(args.chapter, args.track, compiledSummaryHtml);
        writtenFiles.push(summaryPath);

        console.log('Samantekt: Rendered compiled summary to HTML');
        console.log(`  → ${summaryPath}`);
      } else if (args.verbose) {
        console.log('No section summaries found in this chapter');
      }

      // Extract and render answer key from all modules
      if (args.verbose) {
        console.log('\nExtracting answer key...');
      }

      const answersByModule = extractAnswerKey(
        args.chapter,
        allModules,
        moduleSections,
        args.track
      );

      if (answersByModule.length > 0) {
        const totalAnswers = answersByModule.reduce((sum, m) => sum + m.answers.length, 0);

        if (args.verbose) {
          console.log(
            `Found ${totalAnswers} answer(s) across ${answersByModule.length} section(s)`
          );
        }

        const answerKeyHtml = renderAnswerKey(args.chapter, answersByModule, {
          renderCnxmlToHtml,
          options: {
            verbose: args.verbose,
            lang: args.lang,
            chapter: args.chapter,
            moduleId: `${chapterStr}-answer-key`,
            moduleSections: {}, // Empty: prevent chapter outline insertion in answer key
            crossModuleSections: moduleSections, // For cross-page link resolution
            chapterFigureNumbers,
            chapterTableNumbers,
            chapterExampleNumbers,
            chapterExerciseNumbers,
            chapterSectionTitles,
            chapterIdToModule,
            equationTextDictionary,
          },
        });

        const answerKeyPath = writeAnswerKey(args.chapter, args.track, answerKeyHtml);
        writtenFiles.push(answerKeyPath);

        console.log('Svör við æfingum: Rendered to HTML');
        console.log(`  → ${answerKeyPath}`);
      } else if (args.verbose) {
        console.log('No answers found in this chapter');
      }

      // Extract and render compiled exercises from all modules
      if (args.verbose) {
        console.log('\nExtracting section exercises...');
      }

      const exercisesByType = extractSectionExercises(
        args.chapter,
        allModules,
        moduleSections,
        args.track
      );

      // Check if any exercise type has content
      const totalExerciseSections = Object.values(exercisesByType).reduce(
        (sum, arr) => sum + arr.length,
        0
      );

      if (totalExerciseSections > 0) {
        if (args.verbose) {
          for (const [type, exercises] of Object.entries(exercisesByType)) {
            if (exercises.length > 0) {
              console.log(`  ${type}: ${exercises.length} section(s)`);
            }
          }
        }

        const renderContext = {
          verbose: args.verbose,
          lang: args.lang,
          chapter: args.chapter,
          bookSlug: BOOK_SLUG,
          embedMap: EMBED_MAP,
          moduleSections,
          chapterFigureNumbers,
          chapterTableNumbers,
          chapterEquationNumbers,
          chapterExampleNumbers,
          chapterExerciseNumbers,
          chapterSectionTitles,
          chapterIdToModule,
          relocatedIds,
          equationTextDictionary,
        };

        if (exerciseTypesHaveSeparateSlugs(exercisesByType)) {
          // Separate file per exercise type (e.g., microbiology)
          for (const [exerciseClass, exercisesForType] of Object.entries(exercisesByType)) {
            if (exercisesForType.length === 0) continue;

            const typeConfig = BOOK_CONFIG?.endOfChapterSections?.[exerciseClass];
            const slug = typeConfig?.slug || exerciseClass;

            const typeHtml = renderSingleTypeExercises(
              args.chapter,
              exerciseClass,
              exercisesForType,
              chapterExerciseNumbers,
              { ...renderContext, moduleId: `${chapterStr}-${slug}` }
            );

            const typePath = writeCompiledExercises(args.chapter, args.track, typeHtml, slug);
            writtenFiles.push(typePath);
            console.log(`  → ${typePath}`);
          }

          console.log(
            `Æfingar í lok kafla: Rendered ${totalExerciseSections} exercise section(s) to ${writtenFiles.length} file(s)`
          );
        } else {
          // Combined file (e.g., chemistry, biology)
          const compiledExercisesHtml = renderCompiledExercises(
            args.chapter,
            exercisesByType,
            chapterExerciseNumbers,
            { ...renderContext, moduleId: `${chapterStr}-exercises` }
          );

          const compiledExercisesPath = writeCompiledExercises(
            args.chapter,
            args.track,
            compiledExercisesHtml
          );
          writtenFiles.push(compiledExercisesPath);

          console.log(
            `Æfingar í lok kafla: Rendered ${totalExerciseSections} exercise section(s) to HTML`
          );
          console.log(`  → ${compiledExercisesPath}`);
        }
      } else if (args.verbose) {
        console.log('No section exercises found in this chapter');
      }

      // Extract and render key equations from all modules (dynamic generation)
      if (args.verbose) {
        console.log('\nExtracting key equations...');
      }

      const keyEquations = extractKeyEquations(args.chapter, allModules, args.track);

      if (keyEquations.length > 0) {
        if (args.verbose) {
          console.log(
            `Found ${keyEquations.length} equation(s) across ${allModules.length} module(s)`
          );
        }

        const keyEquationsHtml = renderKeyEquations(
          args.chapter,
          keyEquations,
          equationTextDictionary
        );

        // Wrap in full HTML document
        const fullHtml = buildHtmlDocument({
          title: 'Lykiljöfnur',
          lang: args.lang,
          content: keyEquationsHtml,
          pageData: {
            moduleId: `${chapterStr}-key-equations`,
            chapter: args.chapter,
            section: `${args.chapter}.0`,
            title: 'Lykiljöfnur',
            equations: [],
            terms: {},
          },
          sectionNumber: `${args.chapter}.0`,
          isIntro: true,
        });

        const keyEquationsPath = writeKeyEquations(args.chapter, args.track, fullHtml);
        writtenFiles.push(keyEquationsPath);

        console.log('Lykiljöfnur: Rendered key equations to HTML');
        console.log(`  → ${keyEquationsPath}`);
      } else if (args.verbose) {
        console.log('No numbered equations found in this chapter');
      }
    } catch (renderErr) {
      // Roll back this render pass. safeWrite() backed up any file that already
      // existed before it was overwritten (`<file>.backup.<timestamp>`); restore
      // the newest such backup per file, or delete brand-new partials (QA §0.2).
      const { restored, deleted } = rollbackWrittenFiles(writtenFiles);
      throw new Error(
        `Render failed: ${renderErr.message} — rolled back ${writtenFiles.length} file(s) from this pass ` +
          `(${restored} restored to previous version, ${deleted} newly-created file(s) removed).`
      );
    }

    // Render succeeded: the per-file `.backup.<timestamp>` copies safeWrite() made
    // (only present on single-module renders, where the pre-render sweep is skipped)
    // are now dead weight — the rollback path above is the only consumer. Prune them
    // so they don't accumulate in / get synced from the publication dir (handoff #9).
    for (const f of writtenFiles) {
      try {
        const dir = path.dirname(f);
        const prefix = `${path.basename(f)}.backup.`;
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
          if (name.startsWith(prefix)) fs.unlinkSync(path.join(dir, name));
        }
      } catch {
        /* best-effort cleanup */
      }
    }

    // Copy referenced images from source media to publication directory
    copyChapterImages(args.chapter, args.track, args.verbose);

    // Signal that faithful rollups are assembled from the full chapter (reviewed
    // overlay + mt-preview fallback), so vefur serves the faithful compilations
    // even on partially-reviewed chapters (#1, pairs with vefur PR #144). The
    // mt-preview warning banner stays until the whole chapter is reviewed.
    if (args.track === 'faithful' && !args.module) {
      const marker = path.join(BOOKS_DIR, '05-publication', 'faithful', 'rollups-complete');
      try {
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(
          marker,
          `Faithful rollups assembled with mt-preview fallback for unreviewed modules.\nLast updated: ${new Date().toISOString()}\n`
        );
      } catch (err) {
        console.error(`Warning: could not write rollups-complete marker: ${err.message}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Only run main when executed directly (not imported for testing)
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

/**
 * Load book config for testing purposes.
 * Call this before using getNoteTypeLabel() or other config-dependent functions.
 */
function _loadBookConfigForTest(bookSlug) {
  BOOK_CONFIG = getBookRenderConfig(bookSlug);
  NOTE_TYPE_LABELS = BOOK_CONFIG.noteTypeLabels;
  TITLE_TRANSLATIONS = BOOK_CONFIG.titleTranslations;
}

export {
  getNoteTypeLabel,
  translateTitle,
  formatChapterDir,
  calculateColspan,
  renderPara,
  renderBlockChildrenInOrder,
  renderCnxmlToHtml,
  renderCompiledExercises,
  renderCompiledGlossary,
  buildAppendixIdMap,
  rollbackWrittenFiles,
  escapeJsonForScript,
  _loadBookConfigForTest,
};
