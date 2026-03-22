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
import { safeWrite, logBackup } from './lib/safeWrite.js';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

let BOOKS_DIR = 'books/efnafraedi-2e';

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseCliArgs(args) {
  return parseArgs(
    args,
    [
      BOOK_OPTION,
      CHAPTER_OPTION,
      MODULE_OPTION,
      { name: 'input', flags: ['--input'], type: 'string', default: null },
      { name: 'outputDir', flags: ['--output-dir'], type: 'string', default: null },
    ],
    { positional: { name: 'input' } }
  );
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
  node tools/cnxml-extract.js --input books/efnafraedi-2e/01-source/ch05/m68724.cnxml
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
 * Side-channel for inline attribute collection.
 * Populated by extractInlineText() on each call with { terms: [...], footnotes: [...] }.
 * Read by callers after extractInlineText() returns to associate attrs with segment IDs.
 * Only contains entries when the segment has non-default attributes.
 */
let lastInlineAttrs = null;

/**
 * Extract inline text from element content, handling nested elements.
 * Replaces MathML with [[MATH:n]] placeholders.
 * Replaces inline media with [[MEDIA:n]] placeholders.
 * Replaces embedded tables with [[TABLE:id]] placeholders.
 * Also populates lastInlineAttrs with term/footnote attribute data.
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

  // Initialize inline attribute collectors for this call
  const collectedTermAttrs = [];
  const collectedFootnoteAttrs = [];
  const collectedEmphasisAttrs = [];

  // Replace MathML with placeholders
  // First handle <equation> wrappers around <m:math> — preserve wrapper metadata in mathMap
  text = text.replace(/<equation\s+([^>]*)>([\s\S]*?)<\/equation>/g, (match, attrs, inner) => {
    const mathMatch = inner.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
    if (mathMatch) {
      counters.math++;
      const placeholder = `[[MATH:${counters.math}]]`;
      const parsedAttrs = parseAttributes(attrs);
      mathMap.set(placeholder, mathMatch[0]);
      // Store equation wrapper metadata for later restoration
      mathMap.set(`${placeholder}:equation`, {
        id: parsedAttrs.id || null,
        class: parsedAttrs.class || null,
      });
      return placeholder;
    }
    return match;
  });
  // Then handle remaining standalone <m:math> (not wrapped in <equation>)
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
  text = text.replace(/<space([^>]*)\/>/g, (match, attrs) => {
    const parsedAttrs = parseAttributes(attrs);
    const count = parsedAttrs.count ? parseInt(parsedAttrs.count, 10) : 1;
    return count > 1 ? `[[SPACE:${count}]]` : '[[SPACE]]';
  });

  // Collapse redundantly nested identical emphasis tags from source CNXML.
  // OpenStax has bugs like <emphasis effect="italics"><emphasis effect="italics">l</emphasis></emphasis>
  // which would produce doubled markers {{i}}{{i}}l{{/i}}{{/i}} that fail to round-trip.
  let changed = true;
  while (changed) {
    const before = text;
    text = text.replace(
      /<emphasis(\s+effect="[^"]*")([^>]*)>\s*<emphasis\1[^>]*>([\s\S]*?)<\/emphasis>\s*<\/emphasis>/g,
      '<emphasis$1$2>$3</emphasis>'
    );
    changed = text !== before;
  }

  // Convert leaf-level inline markup to API-safe placeholders FIRST,
  // before processing outer tags like <term>, <link>, <footnote>.
  //
  // Sub/sup use [[sub:content]] / [[sup:content]] bracket placeholders.
  // These follow the proven [[MATH:N]] pattern that survives the Málstaður API.
  // Content is non-translatable (chemical formulas, numbers, charges).
  //
  // Emphasis uses {{i}}text{{/i}} / {{b}}text{{/b}} paired markers.
  // The double-curly-brace pattern doesn't look like standard markdown,
  // so the API should pass it through instead of "helpfully" stripping it.
  text = text.replace(/<sub>([\s\S]*?)<\/sub>/g, (match, inner) => {
    if (inner.includes('<')) {
      let c = inner
        .replace(/<emphasis\s+effect="italics"[^>]*>([\s\S]*?)<\/emphasis>/g, '[[i:$1]]')
        .replace(/<emphasis\s+effect="bold"[^>]*>([\s\S]*?)<\/emphasis>/g, '[[b:$1]]');
      c = stripTags(c).trim();
      return `[[sub:${c}]]`;
    }
    return `[[sub:${inner}]]`;
  });
  text = text.replace(/<sup>([\s\S]*?)<\/sup>/g, (match, inner) => {
    if (inner.includes('<')) {
      let c = inner
        .replace(/<emphasis\s+effect="italics"[^>]*>([\s\S]*?)<\/emphasis>/g, '[[i:$1]]')
        .replace(/<emphasis\s+effect="bold"[^>]*>([\s\S]*?)<\/emphasis>/g, '[[b:$1]]');
      c = stripTags(c).trim();
      return `[[sup:${c}]]`;
    }
    return `[[sup:${inner}]]`;
  });
  // Handle emphasis with effect= attribute (italics, bold, underline)
  // Uses [[i:text]] and [[b:text]] bracket markers matching the proven
  // [[sup:]]/[[sub:]] pattern that has ~0% API loss rate.
  // Backward compat: injection also handles legacy {{i}}...{{/i}} format.
  text = text.replace(
    /<emphasis\s+effect="([^"]*)"[^>]*>([\s\S]*?)<\/emphasis>/g,
    (match, effect, inner) => {
      if (effect === 'italics') return `[[i:${inner}]]`;
      if (effect === 'bold') return `[[b:${inner}]]`;
      if (effect === 'underline') return `++${inner}++`;
      return inner;
    }
  );
  // Handle emphasis with class= but no effect= (e.g., <emphasis class="emphasis-one">)
  // Uses {{text}} marker and stores class in sidecar for restoration
  text = text.replace(/<emphasis([^>]*)>([\s\S]*?)<\/emphasis>/g, (match, attrs, inner) => {
    const parsedAttrs = parseAttributes(attrs);
    if (parsedAttrs.class) {
      collectedEmphasisAttrs.push({ class: parsedAttrs.class });
      return `{=${inner}=}`;
    }
    // No class, no effect — default to italic (common in CNXML for bare emphasis)
    return `[[i:${inner}]]`;
  });

  // Handle terms - inner markup is already markdown at this point
  // Collect attributes (class, id) for sidecar metadata
  text = text.replace(/<term([^>]*)>([\s\S]*?)<\/term>/g, (match, attrs, inner) => {
    const parsedAttrs = parseAttributes(attrs);
    const termAttrs = {};
    if (parsedAttrs.class) termAttrs.class = parsedAttrs.class;
    if (parsedAttrs.id) termAttrs.id = parsedAttrs.id;
    if (Object.keys(termAttrs).length > 0) {
      collectedTermAttrs.push(termAttrs);
    } else {
      collectedTermAttrs.push(null);
    }
    return `{{term}}${stripTags(inner).trim()}{{/term}}`;
  });

  // Handle links using API-safe bracket format [[type:content]].
  // All link types use a consistent pattern that survives MT APIs.
  // The | separator divides link text from the reference target.
  // Backward compat: injection also handles legacy [text](url) format.

  // External URL links
  text = text.replace(/<link[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g, (match, url, inner) => {
    return `[[link:${stripTags(inner)}|${url}]]`;
  });

  // Document links (must come before generic target-id to avoid being consumed)
  // Self-closing document links first
  text = text.replace(/<link\s([^>]*)\/>/g, (match, attrs) => {
    const parsedAttrs = parseAttributes(attrs);
    if (parsedAttrs.document && parsedAttrs['target-id']) {
      return `[[docref:${parsedAttrs.document}#${parsedAttrs['target-id']}]]`;
    }
    return match; // Not a document link — leave for later regexes
  });
  // Document links with content
  text = text.replace(/<link\s([^>]*)>([\s\S]*?)<\/link>/g, (match, attrs, inner) => {
    const parsedAttrs = parseAttributes(attrs);
    if (parsedAttrs.document && parsedAttrs['target-id']) {
      const linkText = stripTags(inner).trim();
      return linkText
        ? `[[docref:${linkText}|${parsedAttrs.document}#${parsedAttrs['target-id']}]]`
        : `[[docref:${parsedAttrs.document}#${parsedAttrs['target-id']}]]`;
    }
    // Document link without target-id (links to entire module)
    if (parsedAttrs.document && !parsedAttrs['target-id']) {
      const linkText = stripTags(inner).trim();
      return linkText
        ? `[[docref:${linkText}|${parsedAttrs.document}]]`
        : `[[docref:${parsedAttrs.document}]]`;
    }
    return match; // Not a document link — leave for later regexes
  });

  // Self-closing cross-references (e.g., <link target-id="CNX_Chem_05_02_Fig"/>)
  text = text.replace(/<link[^>]*target-id="([^"]*)"[^>]*\/>/g, (match, targetId) => {
    return `[[xref:${targetId}]]`;
  });

  // Cross-references with content
  text = text.replace(
    /<link[^>]*target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, targetId, inner) => {
      const linkText = stripTags(inner).trim();
      return linkText ? `[[xref:${linkText}|${targetId}]]` : `[[xref:${targetId}]]`;
    }
  );

  // Handle footnotes - extract as inline
  // Collect attributes (id) for sidecar metadata
  text = text.replace(/<footnote([^>]*)>([\s\S]*?)<\/footnote>/g, (match, attrs, inner) => {
    const parsedAttrs = parseAttributes(attrs);
    if (parsedAttrs.id) {
      collectedFootnoteAttrs.push({ id: parsedAttrs.id });
    } else {
      collectedFootnoteAttrs.push(null);
    }
    return ` {{fn}}${stripTags(inner).trim()}{{/fn}}`;
  });

  // Strip remaining tags
  text = stripTags(text);

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Populate side-channel with collected inline attributes (sparse — only non-null entries)
  const hasTermAttrs = collectedTermAttrs.some((a) => a !== null);
  const hasFootnoteAttrs = collectedFootnoteAttrs.some((a) => a !== null);
  const hasEmphasisAttrs = collectedEmphasisAttrs.length > 0;
  if (hasTermAttrs || hasFootnoteAttrs || hasEmphasisAttrs) {
    lastInlineAttrs = {};
    if (hasTermAttrs) lastInlineAttrs.terms = collectedTermAttrs;
    if (hasFootnoteAttrs) lastInlineAttrs.footnotes = collectedFootnoteAttrs;
    if (hasEmphasisAttrs) lastInlineAttrs.emphases = collectedEmphasisAttrs;
  } else {
    lastInlineAttrs = null;
  }

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
  const inlineAttrsMap = {}; // segmentId → { terms: [...], footnotes: [...] }

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

    // Capture inline attributes from the most recent extractInlineText() call
    if (lastInlineAttrs) {
      inlineAttrsMap[segmentId] = lastInlineAttrs;
      lastInlineAttrs = null;
    }

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

  // Extract content — normalize self-closing paras to prevent extraction errors.
  // Self-closing <para id="..."/> causes the extraction regex to consume content
  // up to the next </para>, absorbing the following real paragraph.
  const content = doc.rawContent.replace(/<para\s+id="([^"]+)"\s*\/>/g, '<para id="$1"></para>');

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
      // Process meaning through extractInlineText to preserve emphasis, links, etc.
      const meaningText = term.rawMeaning
        ? extractInlineText(term.rawMeaning, mathMap, counters)
        : term.meaning;
      const defSegId = addSegment('glossary-def', meaningText, `${term.id}-def`);
      glossaryStructure.items.push({
        id: term.id,
        termSegmentId: termSegId,
        definitionSegmentId: defSegId,
      });
    }
    structure.glossary = glossaryStructure;
  }

  // Convert math placeholders to equations
  for (const [placeholder, value] of mathMap) {
    const match = placeholder.match(/\[\[MATH:(\d+)\]\]$/);
    if (match && typeof value === 'string') {
      const mathId = `math-${match[1]}`;
      const eqMeta = mathMap.get(`${placeholder}:equation`);
      equations[mathId] = {
        mathml: value,
        latex: convertMathMLToLatex(value),
        ...(eqMeta && { equationId: eqMeta.id, equationClass: eqMeta.class }),
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

  return { segments, structure, equations, inlineAttrs: inlineAttrsMap };
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

  // Extract section title (allow inline markup like <emphasis>, <sup> inside titles)
  const titleMatch = section.content.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    const titleText = extractInlineText(titleMatch[1], mathMap, counters);
    const titleId = addSegment('title', titleText, section.id ? `${section.id}-title` : null);
    sectionStructure.title = { segmentId: titleId, text: titleText };
  }

  // Remove title from content for further processing
  const contentWithoutTitle = section.content.replace(/<title>[\s\S]*?<\/title>/, '');

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
        const titleMatch = item.content.match(/^\s*<title>([\s\S]*?)<\/title>/);
        let paraTitle = null;
        let contentWithoutTitle = item.content;

        if (titleMatch) {
          // Extract and store the para title separately
          const titleText = extractInlineText(titleMatch[1], mathMap, counters).trim();
          const titleSegId = addSegment(
            'para-title',
            titleText,
            item.id ? `${item.id}-title` : null
          );
          paraTitle = { segmentId: titleSegId, text: titleText };
          // Remove title from content before extracting text
          contentWithoutTitle = item.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
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
      // Check for multi-para cells (entries containing multiple <para> elements)
      const cellParas = extractElements(entry.content, 'para');
      if (cellParas.length > 1) {
        // Multi-para cell: extract each para as a separate segment
        const parasArray = [];
        for (const para of cellParas) {
          const text = extractInlineText(para.content, mathMap, counters);
          if (text) {
            const segId = addSegment('entry', text, para.id);
            parasArray.push({ segmentId: segId, paraId: para.id });
          }
        }
        rowStructure.cells.push({
          paras: parasArray,
          attributes: entry.attributes,
        });
      } else {
        // Single-content cell: original behavior
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
    const titleMatch = para.content.match(/^\s*<title>([\s\S]*?)<\/title>/);
    if (titleMatch && !exampleTitleFound) {
      // This is the example's main title (e.g., "Measuring Heat")
      const titleText = extractInlineText(titleMatch[1], mathMap, counters);
      const titleId = addSegment(
        'example-title',
        titleText,
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: titleText };
      exampleTitleFound = true;
    }
  }

  // Fallback: look for standalone title element
  if (!exampleTitleFound) {
    const standaloneTitle = example.content.match(/<title>([\s\S]*?)<\/title>/);
    if (standaloneTitle) {
      const titleText = extractInlineText(standaloneTitle[1], mathMap, counters);
      const titleId = addSegment(
        'example-title',
        titleText,
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: titleText };
    }
  }

  // Process all paragraphs
  // The first para's title was already used as the example title, so strip it
  // Other para titles (like "Check Your Learning") should be preserved
  let firstParaWithTitleProcessed = false;
  for (const para of paras) {
    const titleMatch = para.content.match(/^\s*<title>([\s\S]*?)<\/title>/);
    let paraTitle = null;
    let contentWithoutTitle = para.content;

    if (titleMatch) {
      if (!firstParaWithTitleProcessed && exampleTitleFound) {
        // This is the first para whose title was used as the example title - strip it
        contentWithoutTitle = para.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
        firstParaWithTitleProcessed = true;
      } else {
        // This is a different para with its own title (e.g., "Check Your Learning")
        // Preserve this title in the structure
        const titleText = extractInlineText(titleMatch[1], mathMap, counters).trim();
        const titleSegId = addSegment('para-title', titleText, para.id ? `${para.id}-title` : null);
        paraTitle = { segmentId: titleSegId, text: titleText };
        contentWithoutTitle = para.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
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
      // Check for nested lists inside the paragraph
      const nestedLists = extractElements(para.content, 'list');

      if (nestedLists.length > 0) {
        // Extract text part (before/between nested lists)
        let textContent = para.content;
        for (const nl of nestedLists) {
          textContent = textContent.replace(nl.fullMatch, '');
        }
        textContent = textContent.trim();

        if (textContent) {
          const text = extractInlineText(
            textContent,
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

        // Process nested lists as separate structure entries
        for (const nl of nestedLists) {
          const listStructure = processList(
            nl,
            moduleId,
            addSegment,
            mathMap,
            counters,
            inlineMediaMap,
            inlineTablesMap
          );
          exerciseStructure.solution.content.push(listStructure);
        }
      } else {
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

  // Extract title (allow inline markup like <emphasis>, <sup> inside titles)
  const titleMatch = note.content.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    const titleText = extractInlineText(titleMatch[1], mathMap, counters);
    const titleId = addSegment('note-title', titleText, note.id ? `${note.id}-title` : null);
    noteStructure.title = { segmentId: titleId, text: titleText };
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

  // Use extractNestedElements for items because items can contain nested
  // items via sublists (e.g., <item>text<list><item>...</item></list></item>).
  // The non-greedy regex in extractElements would match the inner </item> first.
  const items = extractNestedElements(list.content, 'item');
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Check for nested lists inside this item
    const nestedLists = extractNestedElements(item.content, 'list');

    if (nestedLists.length > 0) {
      // Split: extract text part (before/between nested lists)
      let textContent = item.content;
      for (const nl of nestedLists) {
        textContent = textContent.replace(nl.fullMatch, '');
      }
      textContent = textContent.trim();

      const text = extractInlineText(
        textContent,
        mathMap,
        counters,
        inlineMediaMap,
        inlineTablesMap
      );
      const itemSegId = text
        ? addSegment('item', text, item.id || `${list.id}-item-${i + 1}`)
        : null;

      // Recursively process nested lists
      const children = nestedLists.map((nl) =>
        processList(nl, moduleId, addSegment, mathMap, counters, inlineMediaMap, inlineTablesMap)
      );

      listStructure.items.push({
        id: item.id,
        segmentId: itemSegId,
        children,
      });
    } else {
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
  const bookSlug = path.basename(BOOKS_DIR);

  // Write segments markdown
  const segmentsPath = path.join(mtDir, `${moduleId}-segments.en.md`);
  const segBackup = safeWrite(segmentsPath, formatSegmentsMarkdown(result.segments));
  if (segBackup) logBackup(bookSlug, chapter, 'extract', segmentsPath, segBackup);

  // Write structure JSON
  const structurePath = path.join(structDir, `${moduleId}-structure.json`);
  const structBackup = safeWrite(structurePath, JSON.stringify(result.structure, null, 2));
  if (structBackup) logBackup(bookSlug, chapter, 'extract', structurePath, structBackup);

  // Write equations JSON
  if (Object.keys(result.equations).length > 0) {
    const equationsPath = path.join(structDir, `${moduleId}-equations.json`);
    const eqBackup = safeWrite(equationsPath, JSON.stringify(result.equations, null, 2));
    if (eqBackup) logBackup(bookSlug, chapter, 'extract', equationsPath, eqBackup);
  }

  // Write inline attributes JSON (term class, footnote id, etc.)
  if (result.inlineAttrs && Object.keys(result.inlineAttrs).length > 0) {
    const inlineAttrsPath = path.join(structDir, `${moduleId}-inline-attrs.json`);
    const attrBackup = safeWrite(inlineAttrsPath, JSON.stringify(result.inlineAttrs, null, 2));
    if (attrBackup) logBackup(bookSlug, chapter, 'extract', inlineAttrsPath, attrBackup);
  }

  // Write extraction manifest
  const manifest = buildManifest(result, sourceContent);
  const manifestPath = path.join(structDir, `${moduleId}-manifest.json`);
  const manBackup = safeWrite(manifestPath, JSON.stringify(manifest, null, 2));
  if (manBackup) logBackup(bookSlug, chapter, 'extract', manifestPath, manBackup);

  return { segmentsPath, structurePath, manifestPath };
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
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
      // Validate input path is within the project directory
      const resolvedInput = path.resolve(args.input);
      const projectRoot = path.resolve(path.join(BOOKS_DIR, '..', '..'));
      if (!resolvedInput.startsWith(projectRoot + path.sep) && resolvedInput !== projectRoot) {
        console.error(`Error: --input path must be within the project directory`);
        process.exit(1);
      }
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

// Only run main when executed directly (not imported for testing)
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { generateSegmentId, extractInlineText, extractSegments, formatSegmentsMarkdown };
