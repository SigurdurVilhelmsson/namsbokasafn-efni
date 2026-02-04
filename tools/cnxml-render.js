#!/usr/bin/env node

/**
 * cnxml-render.js
 *
 * Render CNXML to semantic HTML for web publication.
 * Part of the Extract-Translate-Inject pipeline.
 *
 * Takes translated CNXML and produces:
 *   - Semantic HTML5 with all IDs preserved
 *   - KaTeX data attributes for client-side equation rendering
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
import katex from 'katex';
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
import { convertMathMLToLatex } from './lib/mathml-to-latex.js';
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

/**
 * Render LaTeX to KaTeX HTML.
 * @param {string} latex - LaTeX string
 * @param {boolean} displayMode - True for block equations, false for inline
 * @returns {string} KaTeX HTML or error fallback
 */
function renderLatex(latex, displayMode = true) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch (err) {
    console.error(`KaTeX error for: ${latex.substring(0, 50)}...`, err.message);
    // Return a placeholder with the original LaTeX for debugging
    return `<span class="katex-error" data-latex="${escapeAttr(latex)}">[Math Error]</span>`;
  }
}

// =====================================================================
// CONFIGURATION
// =====================================================================

const BOOKS_DIR = 'books/efnafraedi';

// Module sections are built dynamically from structure + segment files
// via buildModuleSections() — see tools/lib/module-sections.js

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseArgs(args) {
  const result = {
    chapter: null,
    module: null,
    track: 'mt-preview',
    lang: 'is',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
    else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
    else if (arg === '--lang' && args[i + 1]) result.lang = args[++i];
  }

  return result;
}

function printHelp() {
  console.log(`
cnxml-render.js - Render CNXML to semantic HTML

Part of the Extract-Translate-Inject pipeline for OpenStax content translation.
Produces publication-ready HTML with preserved IDs and KaTeX math placeholders.

Usage:
  node tools/cnxml-render.js --chapter <num> [--module <id>]

Options:
  --chapter <num>    Chapter number
  --module <id>      Specific module ID (default: all in chapter)
  --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
  --lang <code>      Output language code (default: is)
  --verbose          Show detailed progress
  -h, --help         Show this help

Input:
  03-translated/chNN/<module>.cnxml    Translated CNXML

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
  const title = doc.title;

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

  // Context for rendering
  const context = {
    chapter,
    moduleId,
    equations: [],
    terms: {},
    figures: [],
    figureNumbers, // Map of figure ID -> "Chapter.Number" (this module only)
    tableNumbers, // Map of table ID -> "Chapter.Number" (this module only)
    chapterFigureNumbers: options.chapterFigureNumbers || figureNumbers, // chapter-wide
    chapterTableNumbers: options.chapterTableNumbers || tableNumbers, // chapter-wide
    figureCounter: 0,
    footnoteCounter: 0,
    exampleCounter: 0,
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

  // Page data script
  lines.push(`  <script type="application/json" id="page-data">`);
  lines.push(JSON.stringify(pageData, null, 2));
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
    const shouldExclude = EXCLUDED_SECTION_CLASSES.some((cls) => sectionClass.includes(cls));
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

  lines.push(
    `<figure${id ? ` id="${escapeAttr(id)}"` : ''}${className ? ` class="${escapeAttr(className)}"` : ''}>`
  );

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
      const chapterStr = String(context.chapter).padStart(2, '0');
      const normalizedSrc = src.replace(
        /^\.\.\/\.\.\/media\//,
        `/content/efnafraedi/chapters/${chapterStr}/images/media/`
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
    const figNum = id && context.figureNumbers ? context.figureNumbers.get(id) : null;
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

  // Increment example counter and generate example number
  context.exampleCounter = (context.exampleCounter || 0) + 1;
  const exampleNumber = `${context.chapter}.${context.exampleCounter}`;

  lines.push(`<aside${id ? ` id="${escapeAttr(id)}"` : ''} class="example">`);

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

  lines.push(`<div${id ? ` id="${escapeAttr(id)}"` : ''} class="exercise">`);

  // Problem
  const problemMatch = exercise.content.match(/<problem([^>]*)>([\s\S]*?)<\/problem>/);
  if (problemMatch) {
    const problemId = parseAttributes(problemMatch[1]).id;
    lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);

    const paras = extractElements(problemMatch[2], 'para');
    for (const para of paras) {
      lines.push(`    ${renderPara(para, context)}`);
    }

    lines.push('  </div>');
  }

  // Solution
  const solutionMatch = exercise.content.match(/<solution([^>]*)>([\s\S]*?)<\/solution>/);
  if (solutionMatch) {
    const solutionId = parseAttributes(solutionMatch[1]).id;
    lines.push(`  <div${solutionId ? ` id="${escapeAttr(solutionId)}"` : ''} class="solution">`);

    const paras = extractElements(solutionMatch[2], 'para');
    for (const para of paras) {
      lines.push(`    ${renderPara(para, context)}`);
    }

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

  lines.push(
    `<table${id ? ` id="${escapeAttr(id)}"` : ''}${className ? ` class="${escapeAttr(className)}"` : ''}>`
  );

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
    return `<div${id ? ` id="${escapeAttr(id)}"` : ''} class="equation">${eq.content}</div>`;
  }

  const mathml = mathMatch[0];
  const latex = translateLatexText(convertMathMLToLatex(mathml));

  // Track equation
  context.equations.push({ id, latex });

  // Pre-render KaTeX HTML (keep data-latex for copy functionality)
  const katexHtml = renderLatex(latex, true);
  const eqContent = `<span class="katex-display" data-latex="${escapeAttr(latex)}">${katexHtml}</span>`;
  const numberSpan = isUnnumbered ? '' : '<span class="equation-number"></span>';

  return `<div${id ? ` id="${escapeAttr(id)}"` : ''} class="equation${isUnnumbered ? ' unnumbered' : ''}">${eqContent}${numberSpan}</div>`;
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
function findChapterModules(chapter, moduleId = null) {
  const chapterStr = String(chapter).padStart(2, '0');
  const translatedDir = path.join(BOOKS_DIR, '03-translated', `ch${chapterStr}`);

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
  const chapterStr = String(chapter).padStart(2, '0');
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

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

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
    const modules = findChapterModules(args.chapter, args.module);
    const chapterStr = String(args.chapter).padStart(2, '0');

    // Build module sections map from structure + segment files
    const moduleSections = buildModuleSections('efnafraedi', args.chapter);

    // Build chapter-wide figure/table number maps across ALL modules
    // This enables cross-module references (e.g., 5-2 referencing a table in 5-1)
    const chapterFigureNumbers = new Map();
    const chapterTableNumbers = new Map();
    const allModules = findChapterModules(args.chapter); // all modules, even if rendering one
    let chapterFigCounter = 0;
    let chapterTableCounter = 0;

    for (const modId of allModules) {
      const modPath = path.join(BOOKS_DIR, '03-translated', `ch${chapterStr}`, `${modId}.cnxml`);
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
    }

    if (args.verbose) {
      console.error(
        `Chapter-wide maps: ${chapterFigureNumbers.size} figures, ${chapterTableNumbers.size} tables`
      );
    }

    for (const moduleId of modules) {
      if (args.verbose) {
        console.error(`Rendering: ${moduleId}`);
      }

      const cnxmlPath = path.join(
        BOOKS_DIR,
        '03-translated',
        `ch${chapterStr}`,
        `${moduleId}.cnxml`
      );
      const cnxml = fs.readFileSync(cnxmlPath, 'utf-8');

      const { html } = renderCnxmlToHtml(cnxml, {
        verbose: args.verbose,
        lang: args.lang,
        chapter: args.chapter,
        moduleId,
        moduleSections,
        chapterFigureNumbers,
        chapterTableNumbers,
      });

      const outputPath = writeOutput(args.chapter, moduleId, args.track, html, moduleSections);

      console.log(`${moduleId}: Rendered to HTML`);
      console.log(`  → ${outputPath}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
