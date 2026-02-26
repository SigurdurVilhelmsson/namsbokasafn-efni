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
import { renderMathML } from './lib/mathjax-render.js';
import {
  parseCnxmlDocument,
  extractNestedElements,
  extractElements,
  parseAttributes,
  stripTags,
} from './lib/cnxml-parser.js';
import {
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

// =====================================================================
// NOTE TYPE LABELS
// =====================================================================

/**
 * Map note class names to display labels.
 * These appear as headers above the note content.
 * Icelandic translations for use in translated content.
 */
const NOTE_TYPE_LABELS = {
  'chemistry everyday-life': 'Efnafræði í daglegu lífi',
  'everyday-life': 'Efnafræði í daglegu lífi',
  'link-to-learning': 'Tengill til náms',
  'sciences-interconnect': 'Hvernig vísindagreinar tengjast',
  'chemist-portrait': 'Efnafræðingur í brennidepli',
  'chem-connections': 'Tengsl við efnafræði',
  'green-chemistry': 'Græn efnafræði',
  'safety-hazard': 'Öryggisviðvörun',
  'lab-equipment': 'Tilraunabúnaður',
  default: null, // No type label for default notes
};

/**
 * Get the display label for a note type.
 * @param {string} noteClass - The note's class attribute
 * @returns {string|null} The display label or null
 */
function getNoteTypeLabel(noteClass) {
  if (!noteClass) return null;
  // Try exact match first
  if (NOTE_TYPE_LABELS[noteClass]) {
    return NOTE_TYPE_LABELS[noteClass];
  }
  // Try partial match (for compound classes)
  for (const [key, label] of Object.entries(NOTE_TYPE_LABELS)) {
    if (noteClass.includes(key)) {
      return label;
    }
  }
  return null;
}

/**
 * Translate note/paragraph titles that remain in English after MT.
 * Maps known English titles to Icelandic equivalents.
 */
const TITLE_TRANSLATIONS = {
  'Answer:': 'Svar:',
  Answer: 'Svar',
  Solution: 'Lausn',
  'Check Your Learning': 'Prófaðu þekkingu þína',
  'CHECK YOUR LEARNING': 'Prófaðu þekkingu þína',
  'Solution: Using the Equation': 'Lausn: Notkun jöfnunnar',
  'Solution: Supporting Why the General Equation Is Valid':
    'Lausn: Rökstuðningur fyrir almennri jöfnu',
};

function translateTitle(title) {
  const trimmed = title.trim();
  return TITLE_TRANSLATIONS[trimmed] || title;
}

// =====================================================================
// CONFIGURATION
// =====================================================================

let BOOKS_DIR = 'books/efnafraedi';
let BOOK_SLUG = 'efnafraedi';

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

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
 * Build path to a translated CNXML file.
 * @param {string} track - Publication track (mt-preview, faithful, localized)
 * @param {string} chapterDir - Formatted chapter directory (e.g., "ch01", "appendices")
 * @param {string} moduleId - Module ID (e.g., "m68724")
 * @returns {string} Path to translated CNXML file
 */
function translatedCnxmlPath(track, chapterDir, moduleId) {
  return path.join(BOOKS_DIR, '03-translated', track, chapterDir, `${moduleId}.cnxml`);
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

// Module sections are built dynamically from structure + segment files
// via buildModuleSections() — see tools/lib/module-sections.js

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseArgs(args) {
  const result = {
    chapter: null,
    module: null,
    book: 'efnafraedi',
    track: 'mt-preview',
    lang: 'is',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) {
      const chapterArg = args[++i];
      // Accept either numeric chapter or "appendices"
      result.chapter = chapterArg === 'appendices' ? 'appendices' : parseInt(chapterArg, 10);
    } else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
    else if (arg === '--lang' && args[i + 1]) result.lang = args[++i];
  }

  return result;
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
    equationTextDictionary: options.equationTextDictionary || null, // equation text translations
    excludeSections: options.excludeSections !== false, // Allow disabling section exclusion
    includeSolutions: options.includeSolutions || false, // Only show solutions on answer key pages
    figureCounter: 0,
    footnoteCounter: 0,
    exampleCounter: 0,
    equationCounter: 0,
    exerciseCounter: 0, // Add exercise counter
    renderedFigureIds: new Set(), // Track rendered figures to prevent duplicates
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
    _renderStats: context.renderStats || { equations: 0, success: 0, failures: [] },
  };

  // Build HTML document
  const html = buildHtmlDocument({
    title,
    lang,
    content: contentHtml,
    pageData,
    sectionNumber,
    isIntro: sectionInfo.section === '0' || doc.documentClass === 'introduction',
    abstract: doc.metadata.abstract,
    context, // Pass context for footnotes rendering
  });

  return { html, pageData };
}

/**
 * Build complete HTML document.
 */
function buildHtmlDocument(options) {
  const { title, lang, content, pageData, sectionNumber, isIntro, abstract, context } = options;

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

  // Main content
  lines.push('    <main>');
  lines.push(content);
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
  lines.push(JSON.stringify(publicPageData, null, 2));
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
  const lines = [];

  // Sections to exclude from main content (they have their own pages)
  const EXCLUDED_SECTION_CLASSES = ['summary', 'key-equations', 'exercises'];

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
      context.excludeSections && EXCLUDED_SECTION_CLASSES.some((cls) => sectionClass.includes(cls));
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
        lines.push(renderSection(item, context, 2));
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

  // Process glossary (always at end)
  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (glossaryMatch) {
    const glossaryHtml = renderGlossary(glossaryMatch[1], context);
    lines.push(glossaryHtml);
  }

  return lines.join('\n');
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

  // Extract and render title
  const titleMatch = section.content.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    lines.push(`  <h${level}>${processInlineContent(titleMatch[1], context)}</h${level}>`);
  }

  // Remove title from content
  const contentWithoutTitle = section.content.replace(/<title>[^<]*<\/title>/, '');

  // Process nested sections
  const nestedSections = extractNestedElements(contentWithoutTitle, 'section');
  for (const nested of nestedSections) {
    const nestedHtml = renderSection(nested, context, Math.min(level + 1, 6));
    lines.push(nestedHtml);
  }

  // Process other content
  const contentWithoutNestedSections = removeNestedElements(contentWithoutTitle, 'section');
  const contentHtml = renderTopLevelContent(contentWithoutNestedSections, context);
  if (contentHtml) {
    lines.push(contentHtml);
  }

  lines.push('</section>');
  return lines.join('\n');
}

/**
 * Render top-level content elements in document order.
 */
function renderTopLevelContent(content, context) {
  // Collect all elements with their positions
  const elementsWithPositions = [];

  // Extract container elements first (notes, examples, exercises contain other elements)
  const figures = extractNestedElements(content, 'figure');
  const notes = extractNestedElements(content, 'note');
  const examples = extractNestedElements(content, 'example');
  const exercises = extractNestedElements(content, 'exercise');
  const tables = extractNestedElements(content, 'table');

  // For paragraphs, lists, equations - only extract those NOT inside container elements
  // Remove container element content before extracting to avoid duplicates
  // IMPORTANT: Strip examples and exercises BEFORE notes, because examples/exercises
  // can contain nested notes. If we strip notes first, the example.fullMatch won't
  // match anymore (the note inside it was already removed from contentForSimpleElements).
  let contentForSimpleElements = content;
  for (const example of examples) {
    if (example.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(example.fullMatch, '');
    }
  }
  for (const exercise of exercises) {
    if (exercise.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(exercise.fullMatch, '');
    }
  }
  for (const note of notes) {
    if (note.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(note.fullMatch, '');
    }
  }
  for (const figure of figures) {
    if (figure.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(figure.fullMatch, '');
    }
  }
  for (const table of tables) {
    if (table.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(table.fullMatch, '');
    }
  }

  // Extract standalone media elements (not inside figures — those are already stripped)
  const medias = extractNestedElements(contentForSimpleElements, 'media');
  for (const media of medias) {
    if (media.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(media.fullMatch, '');
    }
  }

  const lists = extractNestedElements(contentForSimpleElements, 'list');
  const equations = extractElements(contentForSimpleElements, 'equation');
  const paras = extractElements(contentForSimpleElements, 'para');

  // Add all elements with their positions in the content string
  for (const figure of figures) {
    const position = figure.fullMatch
      ? content.indexOf(figure.fullMatch)
      : content.indexOf(`id="${figure.id}"`);
    elementsWithPositions.push({
      item: figure,
      type: 'figure',
      position: position !== -1 ? position : 0,
    });
  }

  // Only add notes that are NOT inside examples or exercises
  // (notes inside examples/exercises will be rendered by renderExample/renderExercise)
  for (const note of notes) {
    const notePosition = note.fullMatch
      ? content.indexOf(note.fullMatch)
      : content.indexOf(`id="${note.id}"`);

    // Check if this note is inside any example
    const isInsideExample = examples.some((ex) => {
      if (!ex.fullMatch || !note.fullMatch) return false;
      const exPosition = content.indexOf(ex.fullMatch);
      return notePosition >= exPosition && notePosition < exPosition + ex.fullMatch.length;
    });

    // Check if this note is inside any exercise
    const isInsideExercise = exercises.some((ex) => {
      if (!ex.fullMatch || !note.fullMatch) return false;
      const exPosition = content.indexOf(ex.fullMatch);
      return notePosition >= exPosition && notePosition < exPosition + ex.fullMatch.length;
    });

    if (!isInsideExample && !isInsideExercise) {
      elementsWithPositions.push({
        item: note,
        type: 'note',
        position: notePosition !== -1 ? notePosition : 0,
      });
    }
  }

  for (const example of examples) {
    const position = example.fullMatch
      ? content.indexOf(example.fullMatch)
      : content.indexOf(`id="${example.id}"`);
    elementsWithPositions.push({
      item: example,
      type: 'example',
      position: position !== -1 ? position : 0,
    });
  }

  for (const exercise of exercises) {
    const position = exercise.fullMatch
      ? content.indexOf(exercise.fullMatch)
      : content.indexOf(`id="${exercise.id}"`);
    elementsWithPositions.push({
      item: exercise,
      type: 'exercise',
      position: position !== -1 ? position : 0,
    });
  }

  for (const table of tables) {
    const position = table.fullMatch
      ? content.indexOf(table.fullMatch)
      : content.indexOf(`id="${table.id}"`);
    elementsWithPositions.push({
      item: table,
      type: 'table',
      position: position !== -1 ? position : 0,
    });
  }

  for (const media of medias) {
    const position = media.fullMatch
      ? content.indexOf(media.fullMatch)
      : content.indexOf(`id="${media.id}"`);
    elementsWithPositions.push({
      item: media,
      type: 'media',
      position: position !== -1 ? position : 0,
    });
  }

  for (const list of lists) {
    const position = list.fullMatch
      ? content.indexOf(list.fullMatch)
      : content.indexOf(`id="${list.id}"`);
    elementsWithPositions.push({
      item: list,
      type: 'list',
      position: position !== -1 ? position : 0,
    });
  }

  for (const eq of equations) {
    const position = eq.fullMatch
      ? content.indexOf(eq.fullMatch)
      : content.indexOf(`id="${eq.id}"`);
    elementsWithPositions.push({
      item: eq,
      type: 'equation',
      position: position !== -1 ? position : 0,
    });
  }

  for (const para of paras) {
    const idPattern = para.id ? `id="${para.id}"` : null;
    const position = idPattern ? content.indexOf(idPattern) : content.indexOf('<para');
    elementsWithPositions.push({
      item: para,
      type: 'para',
      position: position !== -1 ? position : 0,
    });
  }

  // Sort by position to preserve document order
  elementsWithPositions.sort((a, b) => a.position - b.position);

  // Render elements in document order
  const lines = [];
  for (const { item, type } of elementsWithPositions) {
    switch (type) {
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
  const figNum = id && context.chapterFigureNumbers ? context.chapterFigureNumbers.get(id) : null;

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
    const imageMatch = mediaContent.match(/<image([^>]*)\/?>(?:<\/image>)?/);

    if (imageMatch) {
      const imageAttrs = parseAttributes(imageMatch[1]);
      const src = imageAttrs.src || '';
      // Use absolute path for vefur content serving
      const chapterStr = formatChapterOutput(context.chapter);
      const normalizedSrc = src.replace(
        /^\.\.\/\.\.\/media\//,
        `/content/${BOOK_SLUG}/chapters/${chapterStr}/images/media/`
      );
      const alt = mediaAttrs.alt || '';

      lines.push(
        `  <img src="${escapeAttr(normalizedSrc)}" alt="${escapeAttr(alt)}" loading="lazy">`
      );
    }
  }

  // Extract caption
  const captionMatch = figure.content.match(/<caption>([\s\S]*?)<\/caption>/);
  if (captionMatch) {
    const captionContent = processInlineContent(captionMatch[1], context);
    // Add figure number if available
    const figNum = id && context.chapterFigureNumbers ? context.chapterFigureNumbers.get(id) : null;
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

  // Extract image src from content
  const imageMatch = media.content.match(/<image([^>]*)\/?>(?:<\/image>)?/);
  let normalizedSrc = '';
  if (imageMatch) {
    const imageAttrs = parseAttributes(imageMatch[1]);
    const src = imageAttrs.src || '';
    const chapterStr = formatChapterOutput(context.chapter);
    normalizedSrc = src.replace(
      /^\.\.\/\.\.\/media\//,
      `/content/${BOOK_SLUG}/chapters/${chapterStr}/images/media/`
    );
  }

  const classValue = className ? `media-inline ${className}` : 'media-inline';
  return `<div${id ? ` id="${escapeAttr(id)}"` : ''} class="${escapeAttr(classValue)}">\n  <img src="${escapeAttr(normalizedSrc)}" alt="${escapeAttr(alt)}" loading="lazy">\n</div>`;
}

/**
 * Render a note.
 * Renders paragraphs and figures in document order to preserve content flow.
 */
function renderNote(note, context) {
  const lines = [];
  const id = note.id || null;
  const noteClass = note.attributes.class || 'default';

  lines.push(
    `<aside${id ? ` id="${escapeAttr(id)}"` : ''} class="note note-${escapeAttr(noteClass)}">`
  );

  // Note type label (e.g., "Chemistry in Everyday Life", "Link to Learning")
  const typeLabel = getNoteTypeLabel(noteClass);
  if (typeLabel) {
    lines.push(`  <p class="note-type">${escapeHtml(typeLabel)}</p>`);
  }

  // Title
  const titleMatch = note.content.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    lines.push(`  <h4>${processInlineContent(translateTitle(titleMatch[1]), context)}</h4>`);
  }

  // Extract paragraphs and figures, then render in document order
  const contentWithoutTitle = note.content.replace(/<title>[^<]*<\/title>/, '');

  // Collect all elements with their positions
  const elementsWithPositions = [];

  const paras = extractElements(contentWithoutTitle, 'para');
  for (const para of paras) {
    const pos = para.id
      ? contentWithoutTitle.indexOf(`id="${para.id}"`)
      : contentWithoutTitle.indexOf('<para');
    elementsWithPositions.push({ type: 'para', item: para, position: pos !== -1 ? pos : 0 });
  }

  const figures = extractNestedElements(contentWithoutTitle, 'figure');
  for (const figure of figures) {
    const pos = figure.id
      ? contentWithoutTitle.indexOf(`id="${figure.id}"`)
      : contentWithoutTitle.indexOf('<figure');
    elementsWithPositions.push({ type: 'figure', item: figure, position: pos !== -1 ? pos : 0 });
  }

  // Sort by position to preserve document order
  elementsWithPositions.sort((a, b) => a.position - b.position);

  // Render in order
  for (const elem of elementsWithPositions) {
    if (elem.type === 'para') {
      lines.push(`  ${renderPara(elem.item, context)}`);
    } else if (elem.type === 'figure') {
      lines.push(`  ${renderFigure(elem.item, context)}`);
    }
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
  const chapterExNum =
    id && context.chapterExampleNumbers ? context.chapterExampleNumbers.get(id) : null;
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
    // Check if this paragraph starts with a <title> element (allowing whitespace)
    const titleMatch = para.content.match(/^\s*<title>([^<]+)<\/title>/);
    if (titleMatch && !exampleTitle) {
      exampleTitle = titleMatch[1];
      break;
    }
  }

  // Fallback: look for standalone title
  if (!exampleTitle) {
    const standaloneTitle = example.content.match(/<title>([^<]+)<\/title>/);
    if (standaloneTitle) {
      exampleTitle = standaloneTitle[1];
    }
  }

  // Example header with number and title
  lines.push(`  <p class="example-label">Dæmi ${exampleNumber}</p>`);
  if (exampleTitle) {
    lines.push(`  <h4>${processInlineContent(exampleTitle, context)}</h4>`);
  }

  // Collect all elements with their positions for document order rendering
  const elementsWithPositions = [];

  // Extract notes first (they contain other elements)
  const notes = extractNestedElements(example.content, 'note');
  for (const note of notes) {
    const pos = note.fullMatch
      ? example.content.indexOf(note.fullMatch)
      : example.content.indexOf(`id="${note.id}"`);
    elementsWithPositions.push({
      type: 'note',
      item: note,
      position: pos !== -1 ? pos : 0,
    });
  }

  // Strip notes from content before extracting simple elements to avoid duplicates
  let contentForSimpleElements = example.content;
  for (const note of notes) {
    if (note.fullMatch) {
      contentForSimpleElements = contentForSimpleElements.replace(note.fullMatch, '');
    }
  }

  // Extract paragraphs from content WITHOUT notes (we'll strip titles from content when rendering)
  const parasOutsideNotes = extractElements(contentForSimpleElements, 'para');
  for (const para of parasOutsideNotes) {
    const pos = para.id
      ? example.content.indexOf(`id="${para.id}"`)
      : example.content.indexOf('<para');
    elementsWithPositions.push({
      type: 'para',
      item: para,
      position: pos !== -1 ? pos : 0,
    });
  }

  // Extract lists from content WITHOUT notes
  const lists = extractNestedElements(contentForSimpleElements, 'list');
  for (const list of lists) {
    const pos = list.fullMatch
      ? example.content.indexOf(list.fullMatch)
      : example.content.indexOf(`id="${list.id}"`);
    elementsWithPositions.push({
      type: 'list',
      item: list,
      position: pos !== -1 ? pos : 0,
    });
  }

  // Extract equations from content WITHOUT notes
  const equations = extractElements(contentForSimpleElements, 'equation');
  for (const eq of equations) {
    const pos = eq.fullMatch
      ? example.content.indexOf(eq.fullMatch)
      : example.content.indexOf(`id="${eq.id}"`);
    elementsWithPositions.push({
      type: 'equation',
      item: eq,
      position: pos !== -1 ? pos : 0,
    });
  }

  // Extract standalone media from content WITHOUT notes
  const standaloneMedia = extractNestedElements(contentForSimpleElements, 'media');
  for (const media of standaloneMedia) {
    const pos = media.fullMatch
      ? example.content.indexOf(media.fullMatch)
      : example.content.indexOf(`id="${media.id}"`);
    elementsWithPositions.push({
      type: 'media',
      item: media,
      position: pos !== -1 ? pos : 0,
    });
  }

  // Sort by position
  elementsWithPositions.sort((a, b) => a.position - b.position);

  // Track if we've stripped the example title (from the first para)
  let exampleTitleStripped = false;

  // Render in document order
  for (const { type, item } of elementsWithPositions) {
    switch (type) {
      case 'para': {
        // Check if this para has a title
        const titleMatch = item.content.match(/^\s*<title>([^<]+)<\/title>/);
        let paraTitle = null;
        let contentWithoutTitle = item.content;

        if (titleMatch) {
          if (!exampleTitleStripped && exampleTitle && titleMatch[1] === exampleTitle) {
            // This is the example title - strip it (already rendered as h3)
            contentWithoutTitle = item.content.replace(/^\s*<title>[^<]+<\/title>\s*/, '');
            exampleTitleStripped = true;
          } else {
            // This is a different para title (e.g., "Check Your Learning", "Solution")
            // Preserve it and render as a strong heading
            paraTitle = titleMatch[1];
            contentWithoutTitle = item.content.replace(/^\s*<title>[^<]+<\/title>\s*/, '');
          }
        }

        if (paraTitle || contentWithoutTitle.trim()) {
          const paraWithCleanContent = { ...item, content: contentWithoutTitle };
          if (paraTitle) {
            // Render para title as a strong element, then the para content
            lines.push(
              `  <p class="para-title"><strong>${escapeHtml(translateTitle(paraTitle))}</strong></p>`
            );
          }
          if (contentWithoutTitle.trim()) {
            lines.push(`  ${renderPara(paraWithCleanContent, context)}`);
          }
        }
        break;
      }
      case 'list':
        lines.push(`  ${renderList(item, context)}`);
        break;
      case 'equation':
        lines.push(`  ${renderEquation(item, context)}`);
        break;
      case 'note':
        lines.push(`  ${renderNote(item, context)}`);
        break;
      case 'media':
        lines.push(`  ${renderMedia(item, context)}`);
        break;
    }
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
  let exerciseNumber;
  if (id && context.chapterExerciseNumbers && context.chapterExerciseNumbers.has(id)) {
    exerciseNumber = context.chapterExerciseNumbers.get(id);
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

  lines.push(`<div ${attrs.join(' ')}>`);

  // Helper: render problem/solution section content with paras, media, and figures in order
  function renderSectionContent(sectionContent) {
    const paras = extractElements(sectionContent, 'para');
    // Strip figures before extracting standalone media
    const contentWithoutFigures = sectionContent.replace(/<figure[\s\S]*?<\/figure>/g, '');
    const medias = extractNestedElements(contentWithoutFigures, 'media');
    const figures = extractNestedElements(sectionContent, 'figure');

    const elementsWithPositions = [];
    for (const para of paras) {
      const pos = sectionContent.indexOf(`id="${para.id}"`);
      elementsWithPositions.push({ type: 'para', item: para, position: pos !== -1 ? pos : 0 });
    }
    for (const media of medias) {
      const pos = media.fullMatch
        ? sectionContent.indexOf(media.fullMatch)
        : sectionContent.indexOf(`id="${media.id}"`);
      elementsWithPositions.push({ type: 'media', item: media, position: pos !== -1 ? pos : 0 });
    }
    for (const figure of figures) {
      const pos = sectionContent.indexOf(`id="${figure.id}"`);
      elementsWithPositions.push({ type: 'figure', item: figure, position: pos !== -1 ? pos : 0 });
    }

    elementsWithPositions.sort((a, b) => a.position - b.position);

    for (const { type, item } of elementsWithPositions) {
      switch (type) {
        case 'para':
          lines.push(`    ${renderPara(item, context)}`);
          break;
        case 'media':
          lines.push(`    ${renderMedia(item, context)}`);
          break;
        case 'figure':
          lines.push(`    ${renderFigure(item, context)}`);
          break;
      }
    }
  }

  // Problem
  const problemMatch = exercise.content.match(/<problem([^>]*)>([\s\S]*?)<\/problem>/);
  if (problemMatch) {
    const problemId = parseAttributes(problemMatch[1]).id;
    lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);
    renderSectionContent(problemMatch[2]);
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
  const className = table.attributes.class || null;

  // Get table number from chapter-wide map for data attribute
  const tableNum = id && context.chapterTableNumbers ? context.chapterTableNumbers.get(id) : null;

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
    const theadMatch = tgroupContent.match(/<thead>([\s\S]*?)<\/thead>/);
    if (theadMatch) {
      lines.push('  <thead>');
      const rows = extractElements(theadMatch[1], 'row');
      for (const row of rows) {
        lines.push(`    <tr>${renderTableCells(row.content, context, true)}</tr>`);
      }
      lines.push('  </thead>');
    }

    // Body
    const tbodyMatch = tgroupContent.match(/<tbody>([\s\S]*?)<\/tbody>/);
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

  lines.push(`<${tag}${id ? ` id="${escapeAttr(id)}"` : ''}${styleAttr}>`);

  const items = extractElements(list.content, 'item');
  for (const item of items) {
    const itemId = item.id ? ` id="${escapeAttr(item.id)}"` : '';

    // Check for nested content
    const nestedParas = extractElements(item.content, 'para');
    if (nestedParas.length > 0) {
      const content = nestedParas.map((p) => processInlineContent(p.content, context)).join('<br>');
      lines.push(`  <li${itemId}>${content}</li>`);
    } else {
      const content = processInlineContent(item.content, context);
      lines.push(`  <li${itemId}>${content}</li>`);
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
  const eqNum =
    !isUnnumbered && id && context.chapterEquationNumbers
      ? context.chapterEquationNumbers.get(id)
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
    const termMatch = def.content.match(/<term>([^<]*)<\/term>/);
    const meaningMatch = def.content.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);

    if (termMatch && meaningMatch) {
      const term = termMatch[1].trim();
      const meaning = processInlineContent(meaningMatch[1], context);

      context.terms[term] = stripTags(meaningMatch[1]).trim();

      lines.push(`    <dt${id ? ` id="${escapeAttr(id)}"` : ''}>${escapeHtml(term)}</dt>`);
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
  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

/**
 * Copy referenced images from source media to publication directory.
 */
function copyChapterImages(chapter, track, _verbose) {
  const chapterStr = formatChapterOutput(chapter);
  const sourceMediaDir = path.join(BOOKS_DIR, '01-source', 'media');
  const targetMediaDir = path.join(
    BOOKS_DIR,
    '05-publication',
    track,
    'chapters',
    chapterStr,
    'images',
    'media'
  );

  if (!fs.existsSync(sourceMediaDir)) {
    console.error(`Warning: Source media directory not found: ${sourceMediaDir}`);
    return;
  }

  if (!fs.existsSync(targetMediaDir)) {
    fs.mkdirSync(targetMediaDir, { recursive: true });
  }

  // Copy all images matching this chapter's pattern (CNX_Chem_NN_*)
  // Appendix images use CNX_Chem_00_ prefix in OpenStax naming convention
  const chapterPrefix = chapter === 'appendices' ? 'CNX_Chem_00_' : `CNX_Chem_${chapterStr}_`;
  const sourceFiles = fs.readdirSync(sourceMediaDir).filter((f) => f.startsWith(chapterPrefix));

  let copied = 0;
  for (const file of sourceFiles) {
    const src = path.join(sourceMediaDir, file);
    const dest = path.join(targetMediaDir, file);
    fs.copyFileSync(src, dest);
    copied++;
  }

  console.log(`Images: Copied ${copied} files to ${targetMediaDir}`);
}

// =====================================================================
// MAIN
// =====================================================================

// =====================================================================
// END-OF-CHAPTER SECTION RENDERING
// =====================================================================

/**
 * Map special section classes to Icelandic titles and URL slugs.
 */
const END_OF_CHAPTER_SECTIONS = {
  summary: {
    titleIs: 'Samantekt',
    titleEn: 'Key Concepts and Summary',
    slug: 'summary',
  },
  'key-equations': {
    titleIs: 'Lykiljöfnur',
    titleEn: 'Key Equations',
    slug: 'key-equations',
  },
  exercises: {
    titleIs: 'Dæmi í lok kafla',
    titleEn: 'Chemistry End of Chapter Exercises',
    slug: 'exercises',
  },
  glossary: {
    titleIs: 'Lykilhugtök',
    titleEn: 'Key Terms',
    slug: 'key-terms',
  },
};

/**
 * Extract end-of-chapter sections from CNXML.
 * Returns array of { class, content, title } objects.
 */
function extractEndOfChapterSections(cnxml) {
  const sections = [];

  for (const [sectionClass, config] of Object.entries(END_OF_CHAPTER_SECTIONS)) {
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

      // Extract title if present
      const titleMatch = sectionContent.match(/<title>([^<]+)<\/title>/);
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
  const { html } = renderCnxmlToHtml(cnxmlDoc, {
    ...context.options,
    excludeSections: false,
    titleOverride: section.titleIs,
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

  fs.writeFileSync(outputPath, html, 'utf-8');

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
        // Process MathML: localize numbers and text, then render to SVG
        let localizedMathml = localizeNumbersInMathML(eq.mathml);
        localizedMathml = localizeMathMLText(localizedMathml, equationTextDictionary);
        renderedMath = renderMathML(localizedMathml, true);
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

  fs.writeFileSync(outputPath, html, 'utf-8');

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
      const termMatch = def.content.match(/<term>([^<]*)<\/term>/);
      const meaningMatch = def.content.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);

      if (termMatch && meaningMatch) {
        definitions.push({
          id: def.id || null,
          term: termMatch[1].trim(),
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
      const meaning = processInlineContent(def.meaningContent, context);
      lines.push(
        `    <dt${def.id ? ` id="${escapeAttr(def.id)}"` : ''}>${escapeHtml(def.term)}</dt>`
      );
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

  fs.writeFileSync(outputPath, html, 'utf-8');

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
      sectionHtml = sectionHtml.replace(
        /<h2[^>]*>.*?<\/h2>/,
        `<h2>${summary.sectionNumber} ${summary.sectionTitle}</h2>`
      );

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

  fs.writeFileSync(outputPath, html, 'utf-8');

  return outputPath;
}

// =====================================================================
// SECTION EXERCISES EXTRACTION AND RENDERING
// =====================================================================

/**
 * Extract exercise sections from all modules in a chapter.
 * Returns array of { moduleId, sectionNumber, sectionTitle, exercisesContent }
 */
function extractSectionExercises(chapter, modules, moduleSections, track) {
  const chapterDir = formatChapterDir(chapter);
  const exercisesByModule = [];

  for (const moduleId of modules) {
    const modulePath = translatedCnxmlPath(track, chapterDir, moduleId);

    if (!fs.existsSync(modulePath)) {
      continue;
    }

    const cnxml = fs.readFileSync(modulePath, 'utf-8');

    // Extract exercises section
    const exercisesPattern = /<section\s+[^>]*class="exercises"[^>]*>([\s\S]*?)<\/section>/g;
    let exercisesMatch;

    while ((exercisesMatch = exercisesPattern.exec(cnxml)) !== null) {
      const exercisesContent = exercisesMatch[0]; // Full section tag

      // Only include if this module has section info (not intro modules)
      const sectionInfo = moduleSections[moduleId];
      if (sectionInfo && sectionInfo.section !== '0') {
        exercisesByModule.push({
          moduleId,
          sectionNumber: `${chapter}.${sectionInfo.section}`,
          sectionTitle: sectionInfo.titleIs || sectionInfo.titleEn || '',
          exercisesContent,
        });
        break; // Only take the first exercises section from each module
      }
    }
  }

  return exercisesByModule;
}

/**
 * Render compiled exercises HTML (matching chapters 1-5 format).
 * Takes exercises from all sections and compiles them into one page.
 */
function renderCompiledExercises(chapter, exercisesByModule, chapterExerciseNumbers, context) {
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

  for (const exercises of exercisesByModule) {
    // Render the exercises section content
    const { html } = renderCnxmlToHtml(
      `<?xml version="1.0"?><document xmlns="http://cnx.rice.edu/cnxml"><content>${exercises.exercisesContent}</content></document>`,
      {
        verbose: false,
        lang: 'is',
        chapter,
        moduleId: exercises.moduleId,
        chapterExerciseNumbers,
        excludeSections: false, // Don't exclude exercises section when rendering standalone
        includeSolutions: false, // Don't render solutions on exercises page (only on answer key)
        ...context,
      }
    );

    // Extract just the section content (remove wrapper HTML)
    const sectionMatch = html.match(/<section[\s\S]*?<\/section>/);
    if (sectionMatch) {
      let sectionHtml = sectionMatch[0];

      // Remove the original section title (we'll add our own with section number)
      sectionHtml = sectionHtml.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '');

      // Replace the section class and add module info
      sectionHtml = sectionHtml.replace(
        /<section([^>]*)class="exercises"([^>]*)>/,
        `<section class="exercises-section" id="exercises-${exercises.moduleId}" data-section="${exercises.sectionNumber}">`
      );

      // Add section title as h2 (after opening section tag)
      const titleHtml = `      <h2>${exercises.sectionNumber} ${exercises.sectionTitle}</h2>\n`;
      sectionHtml = sectionHtml.replace(/<section([^>]*)>/, `$&\n${titleHtml}`);

      lines.push(sectionHtml);
    }
  }

  lines.push('    </main>');
  lines.push('  </article>');
  lines.push('');
  lines.push(`  <script type="application/json" id="page-data">`);
  lines.push(`{
  "moduleId": "${chapter}-exercises",
  "chapter": ${chapter},
  "section": "${chapter}.0",
  "title": "Æfingar í lok kafla",
  "equations": [],
  "terms": {}
}
  </script>`);
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

/**
 * Write compiled exercises HTML to file.
 */
function writeCompiledExercises(chapter, track, html) {
  const chapterStr = formatChapterOutput(chapter);
  const trackDir = track === 'faithful' ? 'faithful' : 'mt-preview';
  const outputDir = path.join(BOOKS_DIR, '05-publication', trackDir, 'chapters', chapterStr);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use single-digit naming for consistency with ch1-5
  const filename = `${chapter}-exercises.html`;
  const outputPath = path.join(outputDir, filename);

  fs.writeFileSync(outputPath, html, 'utf-8');

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

  html += `    </main>
  </article>
  <script type="application/json" id="page-data">
{
  "moduleId": "${chapterStr}-answer-key",
  "chapter": ${chapter},
  "section": "${chapter}.0",
  "title": "Svör við æfingum",
  "equations": [],
  "terms": {}
}
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

  fs.writeFileSync(outputPath, html, 'utf-8');

  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  BOOK_SLUG = args.book;
  BOOKS_DIR = `books/${args.book}`;

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.chapter) {
    console.error('Error: --chapter is required');
    printHelp();
    process.exit(1);
  }

  try {
    const modules = findChapterModules(args.chapter, args.track, args.module);
    const chapterDir = formatChapterDir(args.chapter);
    const chapterStr = formatChapterOutput(args.chapter);

    // Build module sections map from structure + segment files
    const moduleSections = buildModuleSections(BOOK_SLUG, args.chapter);

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
    // Sort modules by section number so numbering follows chapter order, not filename order
    const allModules = findChapterModules(args.chapter, args.track).sort((a, b) => {
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

      const figPattern = /<figure\s+id="([^"]+)"/g;
      let fm;
      while ((fm = figPattern.exec(modCnxml)) !== null) {
        chapterFigCounter++;
        chapterFigureNumbers.set(fm[1], `${args.chapter}.${chapterFigCounter}`);
      }

      const tblPattern = /<table\s+[^>]*id="([^"]+)"/g;
      let tm;
      while ((tm = tblPattern.exec(modCnxml)) !== null) {
        chapterTableCounter++;
        chapterTableNumbers.set(tm[1], `${args.chapter}.${chapterTableCounter}`);
      }

      const examplePattern = /<example\s+id="([^"]+)"/g;
      let exm2;
      while ((exm2 = examplePattern.exec(modCnxml)) !== null) {
        chapterExampleCounter++;
        chapterExampleNumbers.set(exm2[1], `${args.chapter}.${chapterExampleCounter}`);
      }

      // Build numbered equation map (skip unnumbered)
      const eqPattern = /<equation\s+([^>]*?)>/g;
      let eqm;
      while ((eqm = eqPattern.exec(modCnxml)) !== null) {
        const attrs = eqm[1];
        // Skip if unnumbered
        if (attrs.includes('class="unnumbered"')) continue;
        // Extract id
        const idMatch = attrs.match(/id="([^"]+)"/);
        if (idMatch) {
          chapterEquationCounter++;
          chapterEquationNumbers.set(idMatch[1], `${args.chapter}.${chapterEquationCounter}`);
        }
      }

      // Build section title map for cross-reference resolution
      const secPattern = /<section\s+id="([^"]+)"[^>]*>\s*<title>([\s\S]*?)<\/title>/g;
      let sm;
      while ((sm = secPattern.exec(modCnxml)) !== null) {
        // Strip any inline markup from the title text
        const titleText = sm[2].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(sm[1], titleText);
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
      }

      const notePattern = /<note\s+[^>]*id="([^"]+)"[^>]*>\s*<title>([\s\S]*?)<\/title>/g;
      let nm;
      while ((nm = notePattern.exec(modCnxml)) !== null) {
        const titleText = nm[2].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(nm[1], titleText);
      }

      // Build chapter-wide exercise number map
      const exerPattern = /<exercise\s+id="([^"]+)"/g;
      let exm;
      while ((exm = exerPattern.exec(modCnxml)) !== null) {
        chapterExerciseCounter++;
        chapterExerciseNumbers.set(exm[1], `${args.chapter}.${chapterExerciseCounter}`);
      }
    }

    if (args.verbose) {
      console.error(
        `Chapter-wide maps: ${chapterFigureNumbers.size} figures, ${chapterTableNumbers.size} tables, ${chapterEquationNumbers.size} equations, ${chapterExampleNumbers.size} examples, ${chapterExerciseNumbers.size} exercises`
      );
    }

    for (const moduleId of modules) {
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
        equationTextDictionary,
      });
      let html = renderResult.html;
      const pageData = renderResult.pageData;

      // Special handling for Periodic Table appendix (m68859)
      // Replace static image with link to interactive periodic table
      if (moduleId === 'm68859') {
        const mainContentMatch = html.match(/(<main>)([\s\S]*?)(<\/main>)/);
        if (mainContentMatch) {
          const newMainContent = `<main>
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
            equationTextDictionary,
          },
        });

        const outputPath = writeEndOfChapterSection(args.chapter, section, args.track, html);

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

      console.log(`Lykilhugtök: Rendered ${chapterGlossary.length} definitions to HTML`);
      console.log(`  → ${glossaryPath}`);
    } else if (args.verbose) {
      console.log('No glossary definitions found in this chapter');
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
          equationTextDictionary,
        },
      });

      const summaryPath = writeCompiledSummary(args.chapter, args.track, compiledSummaryHtml);

      console.log('Samantekt: Rendered compiled summary to HTML');
      console.log(`  → ${summaryPath}`);
    } else if (args.verbose) {
      console.log('No section summaries found in this chapter');
    }

    // Extract and render answer key from all modules
    if (args.verbose) {
      console.log('\nExtracting answer key...');
    }

    const answersByModule = extractAnswerKey(args.chapter, allModules, moduleSections, args.track);

    if (answersByModule.length > 0) {
      const totalAnswers = answersByModule.reduce((sum, m) => sum + m.answers.length, 0);

      if (args.verbose) {
        console.log(`Found ${totalAnswers} answer(s) across ${answersByModule.length} section(s)`);
      }

      const answerKeyHtml = renderAnswerKey(args.chapter, answersByModule, {
        renderCnxmlToHtml,
        options: {
          verbose: args.verbose,
          lang: args.lang,
          chapter: args.chapter,
          moduleId: `${chapterStr}-answer-key`,
          moduleSections,
          chapterFigureNumbers,
          chapterTableNumbers,
          chapterExampleNumbers,
          chapterExerciseNumbers,
          chapterSectionTitles,
          equationTextDictionary,
        },
      });

      const answerKeyPath = writeAnswerKey(args.chapter, args.track, answerKeyHtml);

      console.log('Svör við æfingum: Rendered to HTML');
      console.log(`  → ${answerKeyPath}`);
    } else if (args.verbose) {
      console.log('No answers found in this chapter');
    }

    // Extract and render compiled exercises from all modules
    if (args.verbose) {
      console.log('\nExtracting section exercises...');
    }

    const exercisesByModule = extractSectionExercises(
      args.chapter,
      allModules,
      moduleSections,
      args.track
    );

    if (exercisesByModule.length > 0) {
      if (args.verbose) {
        console.log(`Found ${exercisesByModule.length} section(s) with exercises`);
      }

      const compiledExercisesHtml = renderCompiledExercises(
        args.chapter,
        exercisesByModule,
        chapterExerciseNumbers,
        {
          verbose: args.verbose,
          lang: args.lang,
          chapter: args.chapter,
          moduleId: `${chapterStr}-exercises`,
          moduleSections,
          chapterFigureNumbers,
          chapterTableNumbers,
          chapterEquationNumbers,
          chapterExampleNumbers,
          chapterExerciseNumbers,
          chapterSectionTitles,
          equationTextDictionary,
        }
      );

      const compiledExercisesPath = writeCompiledExercises(
        args.chapter,
        args.track,
        compiledExercisesHtml
      );

      console.log('Æfingar í lok kafla: Rendered compiled exercises to HTML');
      console.log(`  → ${compiledExercisesPath}`);
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

      console.log('Lykiljöfnur: Rendered key equations to HTML');
      console.log(`  → ${keyEquationsPath}`);
    } else if (args.verbose) {
      console.log('No numbered equations found in this chapter');
    }

    // Copy referenced images from source media to publication directory
    copyChapterImages(args.chapter, args.track, args.verbose);
  } catch (error) {
    console.error('Error:', error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
