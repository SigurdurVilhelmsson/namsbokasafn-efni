#!/usr/bin/env node

/**
 * cnxml-extract.js
 *
 * Extract translatable segments from CNXML files while preserving document structure.
 * Part of the Extract-Translate-Inject pipeline.
 *
 * Output:
 *   - segments.en.md - Clean text segments for machine translation
 *   - structure.json - Document skeleton with segment references
 *   - equations.json - MathML equations preserved separately
 *
 * Usage:
 *   node tools/cnxml-extract.js --input <cnxml-file> [options]
 *   node tools/cnxml-extract.js --chapter <num> [--module <id>] [options]
 *
 * Options:
 *   --input <file>     Input CNXML file path
 *   --chapter <num>    Process chapter number (finds files in 01-source/chNN/)
 *   --module <id>      Specific module ID to process (default: all in chapter)
 *   --book <slug>      Book slug (default: efnafraedi)
 *   --output-dir <dir> Output directory (default: auto-determined)
 *   --verbose          Show detailed progress
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  parseCnxmlDocument,
  extractNestedElements,
  extractElements,
  parseAttributes,
  stripTags,
  extractGlossary,
} from './lib/cnxml-parser.js';
import { convertMathMLToLatex } from './lib/mathml-to-latex.js';
import { getChapterModules } from './lib/chapter-modules.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

let BOOKS_DIR = 'books/efnafraedi';

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseArgs(args) {
  const result = {
    input: null,
    chapter: null,
    module: null,
    book: 'efnafraedi',
    outputDir: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--input' && args[i + 1]) result.input = args[++i];
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) {
      const chapterArg = args[++i];
      result.chapter = chapterArg === 'appendices' ? 'appendices' : parseInt(chapterArg, 10);
    } else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) result.outputDir = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }

  return result;
}

function printHelp() {
  console.log(`
cnxml-extract.js - Extract translatable segments from CNXML

Part of the Extract-Translate-Inject pipeline for OpenStax content translation.
Extracts text segments while preserving document structure for faithful reconstruction.

Usage:
  node tools/cnxml-extract.js --input <cnxml-file>
  node tools/cnxml-extract.js --chapter <num> [--module <id>]

Options:
  --input <file>     Input CNXML file path
  --chapter <num>    Process chapter (finds files in 01-source/chNN/)
  --module <id>      Specific module ID (default: all in chapter)
  --output-dir <dir> Output directory (default: auto)
  --verbose          Show detailed progress
  -h, --help         Show this help

Output Files:
  02-for-mt/chNN/<module>-segments.en.md   Segments for MT
  02-structure/chNN/<module>-structure.json Document structure
  02-structure/chNN/<module>-equations.json MathML equations

Examples:
  node tools/cnxml-extract.js --chapter 5
  node tools/cnxml-extract.js --input books/efnafraedi/01-source/ch05/m68724.cnxml
`);
}

// =====================================================================
// SEGMENT EXTRACTION
// =====================================================================

/**
 * Generate a unique segment ID.
 * @param {string} moduleId - Module ID (e.g., 'm68724')
 * @param {string} type - Segment type (e.g., 'para', 'title')
 * @param {string|null} elementId - Original element ID if available
 * @param {number} counter - Running counter for disambiguation
 * @returns {string} Segment ID
 */
function generateSegmentId(moduleId, type, elementId, counter) {
  if (elementId) {
    return `${moduleId}:${type}:${elementId}`;
  }
  return `${moduleId}:${type}:auto-${counter}`;
}

/**
 * Extract inline text from element content, handling nested elements.
 * Replaces MathML with [[MATH:n]] placeholders.
 * Replaces inline media with [[MEDIA:n]] placeholders.
 * Replaces embedded tables with [[TABLE:id]] placeholders.
 * @param {string} content - Element content
 * @param {Map} mathMap - Map to store extracted math
 * @param {Object} counters - Counter object with 'math', 'media' properties
 * @param {Map|null} inlineMediaMap - Optional map to store inline media metadata
 * @param {Map|null} inlineTablesMap - Optional map to store embedded table structures
 * @returns {string} Plain text with math placeholders
 */
function extractInlineText(
  content,
  mathMap,
  counters,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  let text = content;

  // Replace MathML with placeholders
  const mathPattern = /<m:math[^>]*>[\s\S]*?<\/m:math>/g;
  text = text.replace(mathPattern, (match) => {
    counters.math++;
    const placeholder = `[[MATH:${counters.math}]]`;
    mathMap.set(placeholder, match);
    return placeholder;
  });

  // Handle inline media elements (images within paragraphs)
  if (inlineMediaMap) {
    const mediaPattern = /<media([^>]*)>([\s\S]*?)<\/media>/g;
    text = text.replace(mediaPattern, (match, attrs, mediaContent) => {
      counters.media = (counters.media || 0) + 1;
      const placeholder = `[[MEDIA:${counters.media}]]`;

      // Extract media attributes
      const parsedAttrs = parseAttributes(attrs);
      const imageMatch = mediaContent.match(/<image([^>]*)>/);
      const imageAttrs = imageMatch ? parseAttributes(imageMatch[1]) : {};

      inlineMediaMap.set(placeholder, {
        id: parsedAttrs.id || null,
        class: parsedAttrs.class || null,
        alt: parsedAttrs.alt || imageAttrs.alt || '',
        src: imageAttrs.src || '',
        mimeType: imageAttrs['mime-type'] || null,
      });

      return placeholder;
    });
  }

  // Handle embedded table elements (tables within paragraphs)
  // Note: Full table processing happens later; this just creates placeholders
  if (inlineTablesMap) {
    const tablePattern = /<table\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/table>/g;
    text = text.replace(tablePattern, (match, tableId) => {
      const placeholder = `[[TABLE:${tableId}]]`;
      // Store the full table match for later processing
      inlineTablesMap.set(tableId, { fullMatch: match, processed: false });
      return placeholder;
    });
  }

  // Convert <newline/> and <space/> to placeholders before stripTags()
  text = text.replace(/<newline\s*\/>/g, '[[BR]]');
  text = text.replace(/<space[^>]*\/>/g, '[[SPACE]]');

  // Convert leaf-level inline markup to markdown FIRST, before processing
  // outer tags like <term>, <link>, <footnote>. This prevents stripTags()
  // from discarding nested inline markup (e.g., <sup> inside <term>).
  text = text.replace(/<sub>([^<]*)<\/sub>/g, '~$1~');
  text = text.replace(/<sup>([^<]*)<\/sup>/g, '^$1^');
  text = text.replace(
    /<emphasis\s+effect="([^"]*)"[^>]*>([\s\S]*?)<\/emphasis>/g,
    (match, effect, inner) => {
      if (effect === 'italics') return `*${inner}*`;
      if (effect === 'bold') return `**${inner}**`;
      return inner;
    }
  );

  // Handle terms - inner markup is already markdown at this point
  text = text.replace(/<term[^>]*>([\s\S]*?)<\/term>/g, (match, inner) => {
    return `__${stripTags(inner).trim()}__`;
  });

  // Handle links - preserve URL context
  text = text.replace(/<link[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g, (match, url, inner) => {
    return `[${stripTags(inner)}](${url})`;
  });

  // Handle self-closing cross-references (e.g., <link target-id="CNX_Chem_05_02_Fig"/>)
  text = text.replace(/<link[^>]*target-id="([^"]*)"[^>]*\/>/g, (match, targetId) => {
    return `[#${targetId}]`;
  });

  // Handle cross-references with content
  text = text.replace(
    /<link[^>]*target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, targetId, inner) => {
      const linkText = stripTags(inner).trim();
      return linkText ? `[${linkText}](#${targetId})` : `[#${targetId}]`;
    }
  );

  // Handle document links
  text = text.replace(
    /<link[^>]*document="([^"]*)"[^>]*target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, doc, targetId, inner) => {
      const linkText = stripTags(inner).trim();
      return linkText ? `[${linkText}](${doc}#${targetId})` : `[${doc}#${targetId}]`;
    }
  );

  // Handle footnotes - extract as inline
  text = text.replace(/<footnote[^>]*>([\s\S]*?)<\/footnote>/g, (match, inner) => {
    return ` [footnote: ${stripTags(inner).trim()}]`;
  });

  // Strip remaining tags
  text = stripTags(text);

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Extract all segments from a CNXML document.
 * @param {string} cnxml - Raw CNXML content
 * @param {Object} options - Extraction options
 * @returns {Object} { segments, structure, equations }
 */
function extractSegments(cnxml, options = {}) {
  const verbose = options.verbose || false;
  const doc = parseCnxmlDocument(cnxml);
  const moduleId = doc.moduleId || 'unknown';

  const segments = [];
  const structure = {
    moduleId,
    title: null,
    documentClass: doc.documentClass,
    metadata: doc.metadata,
    content: [],
  };
  const equations = {};

  const counters = { segment: 0, math: 0, equation: 0, media: 0 };
  const mathMap = new Map();
  const inlineMediaMap = new Map();
  const inlineTablesMap = new Map();

  // Helper to add a segment
  function addSegment(type, text, elementId = null, extra = {}) {
    if (!text || !text.trim()) return null;

    counters.segment++;
    const segmentId = generateSegmentId(moduleId, type, elementId, counters.segment);

    segments.push({
      id: segmentId,
      type,
      text: text.trim(),
      ...extra,
    });

    return segmentId;
  }

  // Extract document title
  const titleSegmentId = addSegment('title', doc.title);
  structure.title = { segmentId: titleSegmentId, text: doc.title };

  // Extract abstract/learning objectives
  if (doc.metadata.abstract) {
    const abstract = doc.metadata.abstract;
    const abstractStructure = { intro: null, items: [] };

    if (abstract.intro) {
      const introId = addSegment('abstract', abstract.intro);
      abstractStructure.intro = { segmentId: introId };
    }

    for (let i = 0; i < abstract.items.length; i++) {
      const itemId = addSegment('abstract-item', abstract.items[i], `abstract-item-${i + 1}`);
      abstractStructure.items.push({ segmentId: itemId });
    }

    structure.abstract = abstractStructure;
  }

  // Extract content
  const content = doc.rawContent;

  // Process sections and top-level elements in document order
  const sections = extractNestedElements(content, 'section');
  const topLevelContent = removeNestedElements(content, 'section');
  const topLevelElements = processTopLevelContent(
    topLevelContent,
    moduleId,
    addSegment,
    mathMap,
    counters,
    verbose,
    inlineMediaMap,
    inlineTablesMap
  );

  // Collect all items with positions for document order
  const itemsWithPositions = [];

  // Add sections with positions
  for (const section of sections) {
    const sectionStructure = processSection(
      section,
      moduleId,
      addSegment,
      mathMap,
      counters,
      verbose,
      inlineMediaMap,
      inlineTablesMap
    );
    const position = section.fullMatch ? content.indexOf(section.fullMatch) : 0;
    itemsWithPositions.push({ item: sectionStructure, position });
  }

  // Add top-level elements with positions
  for (const element of topLevelElements) {
    // Find position using element id
    const idStr = element.id ? `id="${element.id}"` : null;
    const position = idStr ? content.indexOf(idStr) : 0;
    itemsWithPositions.push({ item: element, position: position !== -1 ? position : 0 });
  }

  // Sort by position to preserve document order
  itemsWithPositions.sort((a, b) => a.position - b.position);

  // Add to structure in document order
  for (const { item } of itemsWithPositions) {
    structure.content.push(item);
  }

  // Extract glossary
  const glossaryTerms = extractGlossary(cnxml);
  if (glossaryTerms.length > 0) {
    const glossaryStructure = { type: 'glossary', items: [] };
    for (const term of glossaryTerms) {
      const termSegId = addSegment('glossary-term', term.term, `${term.id}-term`);
      const defSegId = addSegment('glossary-def', term.meaning, `${term.id}-def`);
      glossaryStructure.items.push({
        id: term.id,
        termSegmentId: termSegId,
        definitionSegmentId: defSegId,
      });
    }
    structure.glossary = glossaryStructure;
  }

  // Convert math placeholders to equations
  for (const [placeholder, mathml] of mathMap) {
    const match = placeholder.match(/\[\[MATH:(\d+)\]\]/);
    if (match) {
      const mathId = `math-${match[1]}`;
      equations[mathId] = {
        mathml,
        latex: convertMathMLToLatex(mathml),
      };
    }
  }

  // Extract standalone equations
  const equationElements = extractElements(content, 'equation');
  for (const eq of equationElements) {
    if (eq.id && eq.content) {
      const mathMatch = eq.content.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
      if (mathMatch) {
        equations[eq.id] = {
          mathml: mathMatch[0],
          latex: convertMathMLToLatex(mathMatch[0]),
          isBlock: true,
        };
      }
    }
  }

  // Process embedded tables that were marked during extraction
  // These need full table processing to extract their structure
  for (const [tableId, tableData] of inlineTablesMap) {
    if (!tableData.processed) {
      // Parse the table element to extract its structure
      const tableAttrsMatch = tableData.fullMatch.match(/<table([^>]*)>/);
      const tableAttrs = tableAttrsMatch ? parseAttributes(tableAttrsMatch[1]) : {};

      const tableElement = {
        id: tableId,
        content: tableData.fullMatch,
        attributes: tableAttrs,
        fullMatch: tableData.fullMatch,
      };

      // Process the table using the existing processTable function
      const tableStructure = processTable(tableElement, moduleId, addSegment, mathMap, counters);

      // Store the processed structure
      inlineTablesMap.set(tableId, {
        structure: tableStructure,
        processed: true,
      });
    }
  }

  // Add inline media and tables to structure
  if (inlineMediaMap.size > 0) {
    structure.inlineMedia = Array.from(inlineMediaMap.entries()).map(([placeholder, data]) => ({
      placeholder,
      ...data,
    }));
  }

  if (inlineTablesMap.size > 0) {
    structure.inlineTables = Array.from(inlineTablesMap.entries())
      .filter(([_, data]) => data.processed)
      .map(([tableId, data]) => ({
        tableId,
        structure: data.structure,
      }));
  }

  if (verbose) {
    console.error(
      `Extracted ${segments.length} segments, ${Object.keys(equations).length} equations, ` +
        `${inlineMediaMap.size} inline media, ${inlineTablesMap.size} embedded tables`
    );
  }

  return { segments, structure, equations };
}

/**
 * Process a section element and extract its content.
 */
function processSection(
  section,
  moduleId,
  addSegment,
  mathMap,
  counters,
  verbose,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  const sectionStructure = {
    type: 'section',
    id: section.id,
    class: section.attributes.class || null,
    title: null,
    content: [],
  };

  // Extract section title
  const titleMatch = section.content.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const titleId = addSegment('title', titleMatch[1], section.id ? `${section.id}-title` : null);
    sectionStructure.title = { segmentId: titleId, text: titleMatch[1] };
  }

  // Remove title from content for further processing
  const contentWithoutTitle = section.content.replace(/<title>[^<]*<\/title>/, '');

  // Process nested sections first
  const nestedSections = extractNestedElements(contentWithoutTitle, 'section');
  for (const nested of nestedSections) {
    const nestedStructure = processSection(
      nested,
      moduleId,
      addSegment,
      mathMap,
      counters,
      verbose,
      inlineMediaMap,
      inlineTablesMap
    );
    sectionStructure.content.push(nestedStructure);
  }

  // Process other content (excluding nested sections)
  const contentWithoutSections = removeNestedElements(contentWithoutTitle, 'section');
  const elements = processTopLevelContent(
    contentWithoutSections,
    moduleId,
    addSegment,
    mathMap,
    counters,
    verbose,
    inlineMediaMap,
    inlineTablesMap
  );
  sectionStructure.content.push(...elements);

  return sectionStructure;
}

/**
 * Process top-level content elements (paragraphs, figures, examples, etc.)
 * IMPORTANT: Preserves document order by finding all elements with their positions first.
 */
function processTopLevelContent(
  content,
  moduleId,
  addSegment,
  mathMap,
  counters,
  _verbose,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  // Collect all elements with their positions in the content string
  const elementsWithPositions = [];

  // Extract container elements first (these contain other elements like paragraphs)
  const figures = extractNestedElements(content, 'figure');
  const tables = extractNestedElements(content, 'table');
  const examples = extractNestedElements(content, 'example');
  const exercises = extractNestedElements(content, 'exercise');
  const notes = extractNestedElements(content, 'note');

  // For simple elements (paras, lists, equations) - only extract those NOT inside containers
  // Remove container content to avoid extracting nested elements as top-level
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

  const standaloneMedia = extractNestedElements(contentForSimpleElements, 'media');

  const paras = extractElements(contentForSimpleElements, 'para');
  const equations = extractElements(contentForSimpleElements, 'equation');
  const lists = extractNestedElements(contentForSimpleElements, 'list');

  // Add all elements with their positions
  // For elements without fullMatch, find by id attribute
  for (const para of paras) {
    const idPattern = para.id ? `id="${para.id}"` : null;
    const position = idPattern ? content.indexOf(idPattern) : content.indexOf('<para');
    elementsWithPositions.push({ ...para, type: 'para', position: position !== -1 ? position : 0 });
  }

  for (const figure of figures) {
    const position = figure.fullMatch
      ? content.indexOf(figure.fullMatch)
      : content.indexOf(`id="${figure.id}"`);
    elementsWithPositions.push({
      ...figure,
      type: 'figure',
      position: position !== -1 ? position : 0,
    });
  }

  for (const table of tables) {
    const position = table.fullMatch
      ? content.indexOf(table.fullMatch)
      : content.indexOf(`id="${table.id}"`);
    elementsWithPositions.push({
      ...table,
      type: 'table',
      position: position !== -1 ? position : 0,
    });
  }

  for (const example of examples) {
    const position = example.fullMatch
      ? content.indexOf(example.fullMatch)
      : content.indexOf(`id="${example.id}"`);
    elementsWithPositions.push({
      ...example,
      type: 'example',
      position: position !== -1 ? position : 0,
    });
  }

  for (const exercise of exercises) {
    const position = exercise.fullMatch
      ? content.indexOf(exercise.fullMatch)
      : content.indexOf(`id="${exercise.id}"`);
    elementsWithPositions.push({
      ...exercise,
      type: 'exercise',
      position: position !== -1 ? position : 0,
    });
  }

  // Only add notes that are NOT inside examples or exercises
  // (notes inside examples/exercises will be processed by processExample/processExercise)
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
        ...note,
        type: 'note',
        position: notePosition !== -1 ? notePosition : 0,
      });
    }
  }

  for (const eq of equations) {
    const idPattern = eq.id ? `id="${eq.id}"` : null;
    const position = idPattern ? content.indexOf(idPattern) : content.indexOf('<equation');
    elementsWithPositions.push({
      ...eq,
      type: 'equation',
      position: position !== -1 ? position : 0,
    });
  }

  for (const list of lists) {
    const position = list.fullMatch
      ? content.indexOf(list.fullMatch)
      : content.indexOf(`id="${list.id}"`);
    elementsWithPositions.push({ ...list, type: 'list', position: position !== -1 ? position : 0 });
  }

  for (const media of standaloneMedia) {
    const position = media.fullMatch
      ? content.indexOf(media.fullMatch)
      : content.indexOf(`id="${media.id}"`);
    elementsWithPositions.push({
      ...media,
      type: 'media',
      position: position !== -1 ? position : 0,
    });
  }

  // Sort by position to preserve document order
  elementsWithPositions.sort((a, b) => a.position - b.position);

  // Process elements in document order
  const elements = [];
  for (const item of elementsWithPositions) {
    switch (item.type) {
      case 'para': {
        // Check if para has a title (e.g., "Check Your Learning", "Solution")
        const titleMatch = item.content.match(/^\s*<title>([^<]+)<\/title>/);
        let paraTitle = null;
        let contentWithoutTitle = item.content;

        if (titleMatch) {
          // Extract and store the para title separately
          const titleText = titleMatch[1].trim();
          const titleSegId = addSegment(
            'para-title',
            titleText,
            item.id ? `${item.id}-title` : null
          );
          paraTitle = { segmentId: titleSegId, text: titleText };
          // Remove title from content before extracting text
          contentWithoutTitle = item.content.replace(/^\s*<title>[^<]+<\/title>\s*/, '');
        }

        const text = extractInlineText(
          contentWithoutTitle,
          mathMap,
          counters,
          inlineMediaMap,
          inlineTablesMap
        );
        if (text || paraTitle) {
          const paraElement = {
            type: 'para',
            id: item.id,
          };
          if (paraTitle) {
            paraElement.title = paraTitle;
          }
          if (text) {
            paraElement.segmentId = addSegment('para', text, item.id);
          }
          elements.push(paraElement);
        }
        break;
      }
      case 'figure': {
        const figStructure = processFigure(item, moduleId, addSegment, mathMap, counters);
        elements.push(figStructure);
        break;
      }
      case 'table': {
        const tableStructure = processTable(item, moduleId, addSegment, mathMap, counters);
        elements.push(tableStructure);
        break;
      }
      case 'example': {
        const exampleStructure = processExample(
          item,
          moduleId,
          addSegment,
          mathMap,
          counters,
          inlineMediaMap,
          inlineTablesMap
        );
        elements.push(exampleStructure);
        break;
      }
      case 'exercise': {
        const exerciseStructure = processExercise(
          item,
          moduleId,
          addSegment,
          mathMap,
          counters,
          inlineMediaMap,
          inlineTablesMap
        );
        elements.push(exerciseStructure);
        break;
      }
      case 'note': {
        const noteStructure = processNote(
          item,
          moduleId,
          addSegment,
          mathMap,
          counters,
          inlineMediaMap,
          inlineTablesMap
        );
        elements.push(noteStructure);
        break;
      }
      case 'equation': {
        elements.push({
          type: 'equation',
          id: item.id,
          class: item.attributes.class,
        });
        break;
      }
      case 'list': {
        const listStructure = processList(
          item,
          moduleId,
          addSegment,
          mathMap,
          counters,
          inlineMediaMap,
          inlineTablesMap
        );
        elements.push(listStructure);
        break;
      }
      case 'media': {
        const mediaAttrs = item.attributes;
        const imageMatch = item.content.match(/<image[^>]*>/);
        const imageAttrs = imageMatch
          ? parseAttributes(imageMatch[0].match(/<image([^>]*)>/)[1])
          : {};
        elements.push({
          type: 'media',
          id: item.id,
          class: mediaAttrs.class || null,
          alt: mediaAttrs.alt || imageAttrs.alt || '',
          src: imageAttrs.src || '',
        });
        break;
      }
    }
  }

  return elements;
}

/**
 * Process a figure element.
 */
function processFigure(figure, moduleId, addSegment, mathMap, counters) {
  const figStructure = {
    type: 'figure',
    id: figure.id,
    class: figure.attributes.class,
    caption: null,
    media: null,
  };

  // Extract caption
  const captionMatch = figure.content.match(/<caption>([\s\S]*?)<\/caption>/);
  if (captionMatch) {
    const captionText = extractInlineText(captionMatch[1], mathMap, counters);
    const captionId = addSegment('caption', captionText, figure.id ? `${figure.id}-caption` : null);
    figStructure.caption = { segmentId: captionId };
  }

  // Extract media info
  const mediaMatch = figure.content.match(/<media[^>]*>([\s\S]*?)<\/media>/);
  if (mediaMatch) {
    const mediaAttrs = parseAttributes(mediaMatch[0].match(/<media([^>]*)>/)[1]);
    const imageMatch = mediaMatch[1].match(/<image[^>]*>/);
    if (imageMatch) {
      const imageAttrs = parseAttributes(imageMatch[0]);
      figStructure.media = {
        id: mediaAttrs.id,
        alt: mediaAttrs.alt || imageAttrs.alt,
        src: imageAttrs.src,
        mimeType: imageAttrs['mime-type'],
      };
    }
  }

  return figStructure;
}

/**
 * Process a table element.
 */
function processTable(table, moduleId, addSegment, mathMap, counters) {
  const tableStructure = {
    type: 'table',
    id: table.id,
    class: table.attributes.class,
    summary: table.attributes.summary,
    rows: [],
  };

  // Process rows
  const rows = extractNestedElements(table.content, 'row');
  for (const row of rows) {
    const rowStructure = { cells: [] };
    const entries = extractElements(row.content, 'entry');
    for (const entry of entries) {
      const text = extractInlineText(entry.content, mathMap, counters);
      if (text) {
        const cellId = addSegment('entry', text, entry.id);
        rowStructure.cells.push({
          segmentId: cellId,
          attributes: entry.attributes,
        });
      } else {
        rowStructure.cells.push({ segmentId: null, attributes: entry.attributes });
      }
    }
    tableStructure.rows.push(rowStructure);
  }

  return tableStructure;
}

/**
 * Process an example element.
 *
 * OpenStax CNXML examples have a specific structure where:
 * - The example title is in the FIRST paragraph's <title> child
 * - Subsequent paragraphs may have section titles (Solution, Check Your Learning)
 * - All paragraphs should be included, with titles stripped from content
 */
function processExample(
  example,
  moduleId,
  addSegment,
  mathMap,
  counters,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  const exampleStructure = {
    type: 'example',
    id: example.id,
    title: null,
    content: [],
  };

  // Extract all paragraphs first to find the example title
  const paras = extractElements(example.content, 'para');

  // The example title comes from the FIRST paragraph that has a <title> child
  // Use regex that allows whitespace between para tag and title
  let exampleTitleFound = false;
  for (const para of paras) {
    const titleMatch = para.content.match(/^\s*<title>([^<]+)<\/title>/);
    if (titleMatch && !exampleTitleFound) {
      // This is the example's main title (e.g., "Measuring Heat")
      const titleId = addSegment(
        'example-title',
        titleMatch[1],
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: titleMatch[1] };
      exampleTitleFound = true;
    }
  }

  // Fallback: look for standalone title element
  if (!exampleTitleFound) {
    const standaloneTitle = example.content.match(/<title>([^<]+)<\/title>/);
    if (standaloneTitle) {
      const titleId = addSegment(
        'example-title',
        standaloneTitle[1],
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: standaloneTitle[1] };
    }
  }

  // Process all paragraphs
  // The first para's title was already used as the example title, so strip it
  // Other para titles (like "Check Your Learning") should be preserved
  let firstParaWithTitleProcessed = false;
  for (const para of paras) {
    const titleMatch = para.content.match(/^\s*<title>([^<]+)<\/title>/);
    let paraTitle = null;
    let contentWithoutTitle = para.content;

    if (titleMatch) {
      if (!firstParaWithTitleProcessed && exampleTitleFound) {
        // This is the first para whose title was used as the example title - strip it
        contentWithoutTitle = para.content.replace(/^\s*<title>[^<]+<\/title>\s*/, '');
        firstParaWithTitleProcessed = true;
      } else {
        // This is a different para with its own title (e.g., "Check Your Learning")
        // Preserve this title in the structure
        const titleText = titleMatch[1].trim();
        const titleSegId = addSegment('para-title', titleText, para.id ? `${para.id}-title` : null);
        paraTitle = { segmentId: titleSegId, text: titleText };
        contentWithoutTitle = para.content.replace(/^\s*<title>[^<]+<\/title>\s*/, '');
      }
    }

    const text = extractInlineText(
      contentWithoutTitle,
      mathMap,
      counters,
      inlineMediaMap,
      inlineTablesMap
    );
    if (text && text.trim()) {
      const paraElement = {
        type: 'para',
        id: para.id,
        segmentId: addSegment('para', text, para.id),
      };
      if (paraTitle) {
        paraElement.title = paraTitle;
      }
      exampleStructure.content.push(paraElement);
    } else if (paraTitle) {
      // Para has only a title, no other content
      exampleStructure.content.push({
        type: 'para',
        id: para.id,
        title: paraTitle,
      });
    }
  }

  // Process lists in example
  const lists = extractNestedElements(example.content, 'list');
  for (const list of lists) {
    const listStructure = processList(
      list,
      moduleId,
      addSegment,
      mathMap,
      counters,
      inlineMediaMap,
      inlineTablesMap
    );
    exampleStructure.content.push(listStructure);
  }

  // Process equations in example
  const equations = extractElements(example.content, 'equation');
  for (const eq of equations) {
    exampleStructure.content.push({
      type: 'equation',
      id: eq.id,
    });
  }

  // Process notes within example (like Answer notes)
  const notes = extractNestedElements(example.content, 'note');
  for (const note of notes) {
    const noteStructure = processNote(note, moduleId, addSegment, mathMap, counters);
    exampleStructure.content.push(noteStructure);
  }

  return exampleStructure;
}

/**
 * Process an exercise element.
 */
function processExercise(
  exercise,
  moduleId,
  addSegment,
  mathMap,
  counters,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  const exerciseStructure = {
    type: 'exercise',
    id: exercise.id,
    problem: null,
    solution: null,
  };

  // Extract problem
  const problemMatch = exercise.content.match(/<problem[^>]*>([\s\S]*?)<\/problem>/);
  if (problemMatch) {
    const problemParas = extractElements(problemMatch[1], 'para');
    exerciseStructure.problem = { content: [] };
    for (const para of problemParas) {
      const text = extractInlineText(
        para.content,
        mathMap,
        counters,
        inlineMediaMap,
        inlineTablesMap
      );
      if (text) {
        const segId = addSegment('problem', text, para.id);
        exerciseStructure.problem.content.push({
          type: 'para',
          id: para.id,
          segmentId: segId,
        });
      }
    }
  }

  // Extract solution
  const solutionMatch = exercise.content.match(/<solution[^>]*>([\s\S]*?)<\/solution>/);
  if (solutionMatch) {
    const solutionParas = extractElements(solutionMatch[1], 'para');
    exerciseStructure.solution = { content: [] };
    for (const para of solutionParas) {
      const text = extractInlineText(
        para.content,
        mathMap,
        counters,
        inlineMediaMap,
        inlineTablesMap
      );
      if (text) {
        const segId = addSegment('solution', text, para.id);
        exerciseStructure.solution.content.push({
          type: 'para',
          id: para.id,
          segmentId: segId,
        });
      }
    }
  }

  return exerciseStructure;
}

/**
 * Process a note element.
 */
function processNote(
  note,
  moduleId,
  addSegment,
  mathMap,
  counters,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  const noteStructure = {
    type: 'note',
    id: note.id,
    class: note.attributes.class,
    title: null,
    content: [],
  };

  // Extract title
  const titleMatch = note.content.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const titleId = addSegment('note-title', titleMatch[1], note.id ? `${note.id}-title` : null);
    noteStructure.title = { segmentId: titleId, text: titleMatch[1] };
  }

  // Process paragraphs in note
  const paras = extractElements(note.content, 'para');
  for (const para of paras) {
    const text = extractInlineText(
      para.content,
      mathMap,
      counters,
      inlineMediaMap,
      inlineTablesMap
    );
    if (text) {
      const segId = addSegment('para', text, para.id);
      noteStructure.content.push({
        type: 'para',
        id: para.id,
        segmentId: segId,
      });
    }
  }

  return noteStructure;
}

/**
 * Process a list element.
 */
function processList(
  list,
  moduleId,
  addSegment,
  mathMap,
  counters,
  inlineMediaMap = null,
  inlineTablesMap = null
) {
  const listStructure = {
    type: 'list',
    id: list.id,
    listType: list.attributes['list-type'] || 'bulleted',
    numberStyle: list.attributes['number-style'] || null,
    bulletStyle: list.attributes['bullet-style'] || null,
    items: [],
  };

  const items = extractElements(list.content, 'item');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = extractInlineText(
      item.content,
      mathMap,
      counters,
      inlineMediaMap,
      inlineTablesMap
    );
    if (text) {
      const itemId = addSegment('item', text, item.id || `${list.id}-item-${i + 1}`);
      listStructure.items.push({
        id: item.id,
        segmentId: itemId,
      });
    }
  }

  return listStructure;
}

/**
 * Remove nested elements of a given type from content.
 */
function removeNestedElements(content, tagName) {
  const openTag = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g');
  const closeTag = `</${tagName}>`;

  let result = content;
  let match;

  // Find and remove each top-level element of this type
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
// OUTPUT FORMATTING
// =====================================================================

/**
 * Format segments as markdown for MT.
 * @param {Array} segments - Array of segment objects
 * @returns {string} Markdown content
 */
function formatSegmentsMarkdown(segments) {
  const lines = [];

  for (const seg of segments) {
    lines.push(`<!-- SEG:${seg.id} -->`);
    lines.push(seg.text);
    lines.push('');
  }

  return lines.join('\n');
}

// =====================================================================
// FILE I/O
// =====================================================================

/**
 * Find CNXML files for a chapter.
 * @param {number} chapter - Chapter number
 * @param {string|null} moduleId - Optional specific module ID
 * @returns {Array<string>} Array of file paths
 */
function findChapterFiles(chapter, moduleId = null) {
  const chapterDirName =
    chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
  const chapterDir = path.join(BOOKS_DIR, '01-source', chapterDirName);

  if (!fs.existsSync(chapterDir)) {
    throw new Error(`Chapter directory not found: ${chapterDir}`);
  }

  if (moduleId) {
    const filePath = path.join(chapterDir, `${moduleId}.cnxml`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Module file not found: ${filePath}`);
    }
    return [filePath];
  }

  const files = fs.readdirSync(chapterDir).filter((f) => f.endsWith('.cnxml'));
  return files.map((f) => path.join(chapterDir, f)).sort();
}

/**
 * Ensure output directories exist.
 * @param {number} chapter - Chapter number
 */
function ensureOutputDirs(chapter) {
  const chapterDir =
    chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
  const dirs = [
    path.join(BOOKS_DIR, '02-for-mt', chapterDir),
    path.join(BOOKS_DIR, '02-structure', chapterDir),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Build an extraction manifest with element counts, segment IDs, and source hash.
 * This manifest serves as a reference for downstream pipeline stages to verify
 * completeness and detect source changes.
 * @param {Object} result - Extraction result { segments, structure, equations }
 * @param {string} sourceContent - Original CNXML content for hashing
 * @returns {Object} Manifest object
 */
function buildManifest(result, sourceContent) {
  const { segments, structure, equations } = result;

  // Count element types from structure
  const elementCounts = {
    para: 0,
    section: 0,
    figure: 0,
    table: 0,
    example: 0,
    exercise: 0,
    note: 0,
    equation: 0,
    list: 0,
    media: 0,
    glossary: 0,
  };
  const elementIds = {
    figure: [],
    table: [],
    example: [],
    exercise: [],
    note: [],
    equation: [],
    section: [],
  };

  function countElements(elements) {
    for (const el of elements || []) {
      if (el.type && elementCounts[el.type] !== undefined) {
        elementCounts[el.type]++;
      }
      if (el.id && elementIds[el.type]) {
        elementIds[el.type].push(el.id);
      }
      // Recurse into nested content
      if (el.content && Array.isArray(el.content)) {
        countElements(el.content);
      }
      // Count problem/solution contents for exercises
      if (el.problem?.content) countElements(el.problem.content);
      if (el.solution?.content) countElements(el.solution.content);
    }
  }

  countElements(structure.content);

  if (structure.glossary?.items) {
    elementCounts.glossary = structure.glossary.items.length;
  }

  return {
    version: 1,
    moduleId: structure.moduleId,
    extractedAt: new Date().toISOString(),
    sourceHash: crypto.createHash('sha256').update(sourceContent).digest('hex').substring(0, 16),
    segmentCount: segments.length,
    segmentIds: segments.map((s) => s.id),
    equationCount: Object.keys(equations).length,
    equationIds: Object.keys(equations),
    elementCounts,
    elementIds,
  };
}

/**
 * Write extraction output files.
 * @param {Object} result - Extraction result { segments, structure, equations }
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @param {string} sourceContent - Original CNXML content for manifest hashing
 */
function writeOutput(result, chapter, moduleId, sourceContent) {
  const chapterDir =
    chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
  const mtDir = path.join(BOOKS_DIR, '02-for-mt', chapterDir);
  const structDir = path.join(BOOKS_DIR, '02-structure', chapterDir);

  // Write segments markdown
  const segmentsPath = path.join(mtDir, `${moduleId}-segments.en.md`);
  fs.writeFileSync(segmentsPath, formatSegmentsMarkdown(result.segments), 'utf-8');

  // Write structure JSON
  const structurePath = path.join(structDir, `${moduleId}-structure.json`);
  fs.writeFileSync(structurePath, JSON.stringify(result.structure, null, 2), 'utf-8');

  // Write equations JSON
  if (Object.keys(result.equations).length > 0) {
    const equationsPath = path.join(structDir, `${moduleId}-equations.json`);
    fs.writeFileSync(equationsPath, JSON.stringify(result.equations, null, 2), 'utf-8');
  }

  // Write extraction manifest
  const manifest = buildManifest(result, sourceContent);
  const manifestPath = path.join(structDir, `${moduleId}-manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return { segmentsPath, structurePath, manifestPath };
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  BOOKS_DIR = `books/${args.book}`;

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.chapter) {
    console.error('Error: Either --input or --chapter is required');
    printHelp();
    process.exit(1);
  }

  try {
    let files;
    let chapter;

    if (args.input) {
      files = [args.input];
      // Try to extract chapter from path
      const chapterMatch = args.input.match(/ch(\d+)/);
      chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;
    } else {
      chapter = args.chapter;
      files = findChapterFiles(chapter, args.module);
    }

    ensureOutputDirs(chapter);

    // Build canonical module ordering map for sectionOrder
    // When processing a chapter, getChapterModules gives the correct order
    let moduleOrderMap = null;
    if (args.chapter) {
      const orderedModules = getChapterModules(args.chapter);
      moduleOrderMap = new Map();
      orderedModules.forEach((mod, index) => {
        moduleOrderMap.set(mod.moduleId, index);
      });
    }

    for (const file of files) {
      if (args.verbose) {
        console.error(`Processing: ${file}`);
      }

      const cnxml = fs.readFileSync(file, 'utf-8');
      const result = extractSegments(cnxml, { verbose: args.verbose });

      const moduleId = result.structure.moduleId;

      // Add sectionOrder from canonical module ordering
      if (moduleOrderMap && moduleOrderMap.has(moduleId)) {
        result.structure.sectionOrder = moduleOrderMap.get(moduleId);
      } else {
        result.structure.sectionOrder = null;
      }

      const output = writeOutput(result, chapter, moduleId, cnxml);

      console.log(
        `${moduleId}: ${result.segments.length} segments, ${Object.keys(result.equations).length} equations extracted`
      );
      console.log(`  → ${output.segmentsPath}`);
      console.log(`  → ${output.structurePath}`);
      console.log(`  → ${output.manifestPath}`);
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
