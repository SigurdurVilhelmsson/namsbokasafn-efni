#!/usr/bin/env node

/**
 * cnxml-inject.js
 *
 * Inject translated segments back into CNXML structure.
 * Part of the Extract-Translate-Inject pipeline.
 *
 * Takes:
 *   - Translated segments (segments.is.md)
 *   - Document structure (structure.json)
 *   - Equations (equations.json)
 *   - Original CNXML (for reference)
 *
 * Outputs:
 *   - Complete translated CNXML file
 *
 * Usage:
 *   node tools/cnxml-inject.js --chapter <num> --module <id> [--lang is]
 *   node tools/cnxml-inject.js --chapter <num> [--lang is]
 *
 * Options:
 *   --chapter <num>    Chapter number
 *   --module <id>      Specific module ID (default: all in chapter)
 *   --lang <code>      Language code for translated segments (default: is)
 *   --output-dir <dir> Output directory (default: 03-translated/chNN/)
 *   --verbose          Show detailed progress
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';

// =====================================================================
// CONFIGURATION
// =====================================================================

const BOOKS_DIR = 'books/efnafraedi';

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseArgs(args) {
  const result = {
    chapter: null,
    module: null,
    lang: 'is',
    outputDir: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
    else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--lang' && args[i + 1]) result.lang = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) result.outputDir = args[++i];
  }

  return result;
}

function printHelp() {
  console.log(`
cnxml-inject.js - Inject translated segments into CNXML structure

Part of the Extract-Translate-Inject pipeline for OpenStax content translation.
Reconstructs complete CNXML from translated segments and preserved structure.

Usage:
  node tools/cnxml-inject.js --chapter <num> --module <id>
  node tools/cnxml-inject.js --chapter <num>

Options:
  --chapter <num>    Chapter number
  --module <id>      Specific module ID (default: all in chapter)
  --lang <code>      Language code (default: is)
  --output-dir <dir> Output directory (default: 03-translated/chNN/)
  --verbose          Show detailed progress
  -h, --help         Show this help

Input Files (read from):
  02-for-mt/chNN/<module>-segments.<lang>.md    Translated segments
  02-structure/chNN/<module>-structure.json     Document structure
  02-structure/chNN/<module>-equations.json     MathML equations
  01-source/chNN/<module>.cnxml                 Original CNXML (reference)

Output:
  03-translated/chNN/<module>.cnxml             Translated CNXML

Examples:
  node tools/cnxml-inject.js --chapter 5 --module m68724
  node tools/cnxml-inject.js --chapter 5 --lang is --verbose
`);
}

// =====================================================================
// SEGMENT PARSING
// =====================================================================

/**
 * Parse segments from markdown file.
 * @param {string} content - Segments markdown content
 * @returns {Map<string, string>} Map of segment ID to text
 */
function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const text = match[2].trim();
    segments.set(id, text);
  }

  return segments;
}

/**
 * Reverse inline markup back to CNXML.
 * Converts markdown-style markup back to CNXML inline elements.
 * @param {string} text - Text with inline markup
 * @param {Object} equations - Equations map
 * @returns {string} CNXML-compatible text
 */
function reverseInlineMarkup(text, equations) {
  let result = text;

  // Restore math placeholders
  result = result.replace(/\[\[MATH:(\d+)\]\]/g, (match, num) => {
    const mathId = `math-${num}`;
    if (equations[mathId]) {
      return equations[mathId].mathml;
    }
    return match;
  });

  // Convert emphasis markers back to CNXML
  result = result.replace(/\*\*([^*]+)\*\*/g, '<emphasis effect="bold">$1</emphasis>');
  result = result.replace(/\*([^*]+)\*/g, '<emphasis effect="italics">$1</emphasis>');

  // Convert term markers back to CNXML (simplified - without IDs)
  result = result.replace(/__([^_]+)__/g, '<term>$1</term>');

  // Convert self-closing cross-references (e.g., [#CNX_Chem_05_02_Fig])
  result = result.replace(/\[#([^\]]+)\]/g, '<link target-id="$1"/>');

  // Convert links with text back to CNXML
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    if (url.startsWith('#')) {
      // Internal reference
      return `<link target-id="${url.substring(1)}">${linkText}</link>`;
    } else if (url.includes('#')) {
      // Cross-document reference
      const [doc, target] = url.split('#');
      return `<link document="${doc}" target-id="${target}">${linkText}</link>`;
    } else {
      // External URL
      return `<link url="${url}">${linkText}</link>`;
    }
  });

  // Convert sub/sup back
  result = result.replace(/~([^~]+)~/g, '<sub>$1</sub>');
  result = result.replace(/\^([^^]+)\^/g, '<sup>$1</sup>');

  // Convert footnotes back (simplified)
  result = result.replace(/ \[footnote: ([^\]]+)\]/g, '<footnote>$1</footnote>');

  // Escape XML entities that might have been introduced
  // (but be careful not to double-escape)
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/<(?!\/?\w)/g, '&lt;');

  return result;
}

// =====================================================================
// CNXML RECONSTRUCTION
// =====================================================================

/**
 * Build CNXML from structure and segments.
 * @param {Object} structure - Document structure from structure.json
 * @param {Map<string, string>} segments - Translated segments
 * @param {Object} equations - Equations from equations.json
 * @param {string} originalCnxml - Original CNXML content for reference
 * @param {Object} options - Build options
 * @returns {string} Complete CNXML document
 */
function buildCnxml(structure, segments, equations, originalCnxml, options = {}) {
  const verbose = options.verbose || false;

  // Helper to get segment text
  const getSeg = (segmentId) => {
    if (!segmentId) return null;
    const text = segments.get(segmentId);
    if (!text) {
      if (verbose) {
        console.error(`Warning: Missing segment ${segmentId}`);
      }
      return null;
    }
    return reverseInlineMarkup(text, equations);
  };

  // Extract metadata section from original
  const metadataMatch = originalCnxml.match(/<metadata[^>]*>[\s\S]*?<\/metadata>/);
  const metadata = metadataMatch ? metadataMatch[0] : '';

  // Extract document attributes from original
  const documentAttrsMatch = originalCnxml.match(/<document([^>]*)>/);
  const documentAttrs = documentAttrsMatch ? documentAttrsMatch[1] : '';

  // Build document
  const lines = [];
  lines.push(`<document${documentAttrs}>`);

  // Add title
  const titleText = getSeg(structure.title?.segmentId) || structure.title?.text || 'Untitled';
  lines.push(`<title>${titleText}</title>`);

  // Add metadata (with translated abstract if present)
  if (metadata) {
    let translatedMetadata = metadata;

    // Translate abstract if we have segments for it
    if (structure.abstract) {
      const abstractLines = [];

      // Build abstract content
      if (structure.abstract.intro && structure.abstract.intro.segmentId) {
        const introText = getSeg(structure.abstract.intro.segmentId);
        if (introText) {
          abstractLines.push(`<para id="para-00001">${introText}</para>`);
        }
      }

      if (structure.abstract.items && structure.abstract.items.length > 0) {
        abstractLines.push('<list id="list-00001">');
        for (const item of structure.abstract.items) {
          const itemText = getSeg(item.segmentId);
          if (itemText) {
            abstractLines.push(`<item>${itemText}</item>`);
          }
        }
        abstractLines.push('</list>');
      }

      if (abstractLines.length > 0) {
        const abstractContent = abstractLines.join('');
        translatedMetadata = translatedMetadata.replace(
          /<md:abstract[^>]*>[\s\S]*?<\/md:abstract>/,
          `<md:abstract>${abstractContent}</md:abstract>`
        );
      }
    }

    lines.push(translatedMetadata);
  }

  // Build content
  lines.push('');
  lines.push('<content>');

  for (const element of structure.content) {
    const elementCnxml = buildElement(element, getSeg, equations, originalCnxml);
    if (elementCnxml) {
      lines.push(elementCnxml);
    }
  }

  lines.push('</content>');

  // Add glossary if present
  if (structure.glossary) {
    lines.push('<glossary>');
    for (const item of structure.glossary.items) {
      const termText = getSeg(item.termSegmentId);
      const defText = getSeg(item.definitionSegmentId);
      if (termText && defText) {
        lines.push(`<definition id="${item.id}">`);
        lines.push(`<term>${termText}</term>`);
        lines.push(`<meaning id="${item.id}-meaning">${defText}</meaning>`);
        lines.push('</definition>');
      }
    }
    lines.push('</glossary>');
  }

  lines.push('</document>');

  return lines.join('\n');
}

/**
 * Build CNXML for a single element from structure.
 * @param {Object} element - Element structure
 * @param {Function} getSeg - Function to get segment text
 * @param {Object} equations - Equations map
 * @param {string} originalCnxml - Original CNXML for extracting complex elements
 * @returns {string} CNXML string for this element
 */
function buildElement(element, getSeg, equations, originalCnxml) {
  switch (element.type) {
    case 'para':
      return buildPara(element, getSeg);
    case 'section':
      return buildSection(element, getSeg, equations, originalCnxml);
    case 'figure':
      return buildFigure(element, getSeg, originalCnxml);
    case 'table':
      return buildTable(element, getSeg, originalCnxml);
    case 'example':
      return buildExample(element, getSeg, equations, originalCnxml);
    case 'exercise':
      return buildExercise(element, getSeg, equations, originalCnxml);
    case 'note':
      return buildNote(element, getSeg, equations, originalCnxml);
    case 'equation':
      return buildEquation(element, equations, originalCnxml);
    case 'list':
      return buildList(element, getSeg);
    default:
      return null;
  }
}

/**
 * Build a paragraph element.
 */
function buildPara(element, getSeg) {
  const idAttr = element.id ? ` id="${element.id}"` : '';

  // Handle para title if present (e.g., "Check Your Learning", "Solution")
  let titleElement = '';
  if (element.title) {
    const titleText = getSeg(element.title.segmentId) || element.title.text;
    if (titleText) {
      titleElement = `<title>${titleText}</title>`;
    }
  }

  // Get para content (coerce null to empty string to avoid "null" in output)
  const text = element.segmentId ? getSeg(element.segmentId) || '' : '';

  // Return null only if neither title nor content
  if (!titleElement && !text) return null;

  return `<para${idAttr}>${titleElement}${text}</para>`;
}

/**
 * Build a section element.
 */
function buildSection(element, getSeg, equations, originalCnxml) {
  const lines = [];
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';

  lines.push(`<section${idAttr}${classAttr}>`);

  // Add title
  if (element.title) {
    const titleText = getSeg(element.title.segmentId) || element.title.text;
    if (titleText) {
      lines.push(`<title>${titleText}</title>`);
    }
  }

  // Add content
  for (const child of element.content || []) {
    const childCnxml = buildElement(child, getSeg, equations, originalCnxml);
    if (childCnxml) {
      lines.push(childCnxml);
    }
  }

  lines.push('</section>');
  return lines.join('\n');
}

/**
 * Build a figure element.
 */
function buildFigure(element, getSeg, originalCnxml) {
  // Try to extract original figure from CNXML and just replace caption
  if (element.id) {
    const figurePattern = new RegExp(
      `<figure\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/figure>`,
      'g'
    );
    const match = figurePattern.exec(originalCnxml);
    if (match) {
      let figureCnxml = match[0];

      // Replace caption if we have a translation
      if (element.caption && element.caption.segmentId) {
        const captionText = getSeg(element.caption.segmentId);
        if (captionText) {
          figureCnxml = figureCnxml.replace(
            /<caption>[\s\S]*?<\/caption>/,
            `<caption>${captionText}</caption>`
          );
        }
      }

      return figureCnxml;
    }
  }

  // Fallback: build from structure
  const lines = [];
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';

  lines.push(`<figure${idAttr}${classAttr}>`);

  // Add media
  if (element.media) {
    const mediaId = element.media.id ? ` id="${element.media.id}"` : '';
    const alt = element.media.alt ? ` alt="${escapeXml(element.media.alt)}"` : '';
    lines.push(`<media${mediaId}${alt}>`);
    if (element.media.src) {
      const mimeType = element.media.mimeType || 'image/jpeg';
      lines.push(`<image mime-type="${mimeType}" src="${element.media.src}"/>`);
    }
    lines.push('</media>');
  }

  // Add caption
  if (element.caption && element.caption.segmentId) {
    const captionText = getSeg(element.caption.segmentId);
    if (captionText) {
      lines.push(`<caption>${captionText}</caption>`);
    }
  }

  lines.push('</figure>');
  return lines.join('\n');
}

/**
 * Build a table element.
 */
function buildTable(element, getSeg, originalCnxml) {
  // For tables, extract from original and replace cell content
  if (element.id) {
    const tablePattern = new RegExp(`<table\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/table>`, 'g');
    const match = tablePattern.exec(originalCnxml);
    if (match) {
      let tableCnxml = match[0];

      // Replace entry content with translations
      // This is simplified - a full implementation would need to match entries by position
      let rowIdx = 0;
      tableCnxml = tableCnxml.replace(
        /<row([^>]*)>([\s\S]*?)<\/row>/g,
        (rowMatch, rowAttrs, rowContent) => {
          if (element.rows && element.rows[rowIdx]) {
            const row = element.rows[rowIdx];
            let cellIdx = 0;
            rowContent = rowContent.replace(
              /<entry([^>]*)>([\s\S]*?)<\/entry>/g,
              (entryMatch, entryAttrs, _entryContent) => {
                if (row.cells && row.cells[cellIdx] && row.cells[cellIdx].segmentId) {
                  const cellText = getSeg(row.cells[cellIdx].segmentId);
                  if (cellText) {
                    cellIdx++;
                    return `<entry${entryAttrs}>${cellText}</entry>`;
                  }
                }
                cellIdx++;
                return entryMatch;
              }
            );
          }
          rowIdx++;
          return `<row${rowAttrs}>${rowContent}</row>`;
        }
      );

      return tableCnxml;
    }
  }

  return null; // Fallback not implemented for tables
}

/**
 * Build an example element.
 */
function buildExample(element, getSeg, equations, originalCnxml) {
  // Extract from original and replace translatable content
  if (element.id) {
    const examplePattern = new RegExp(
      `<example\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/example>`,
      'g'
    );
    const match = examplePattern.exec(originalCnxml);
    if (match) {
      let exampleCnxml = match[0];

      // Replace title if present
      if (element.title && element.title.segmentId) {
        const titleText = getSeg(element.title.segmentId);
        if (titleText) {
          exampleCnxml = exampleCnxml.replace(
            /<title>([^<]*)<\/title>/,
            `<title>${titleText}</title>`
          );
        }
      }

      // Replace paragraph content
      // Note: The example title is often inside the FIRST paragraph's <title> child element.
      // When we replace paragraph content, we need to preserve this title.
      // Other paras may have their own titles (e.g., "Check Your Learning") which should also be preserved.
      let isFirstPara = true;
      for (const child of element.content || []) {
        if (child.type === 'para' && child.id) {
          const paraText = child.segmentId ? getSeg(child.segmentId) : '';
          const paraPattern = new RegExp(`<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`, 'g');

          let titleText = '';
          // First para: use the example title
          if (isFirstPara && element.title && element.title.segmentId) {
            titleText = getSeg(element.title.segmentId) || '';
          }
          // Non-first paras: use their own title if present (e.g., "Check Your Learning")
          else if (child.title && child.title.segmentId) {
            titleText = getSeg(child.title.segmentId) || child.title.text || '';
          }

          const titleElement = titleText ? `<title>${titleText}</title>` : '';
          const replacementText = `<para id="${child.id}">${titleElement}${paraText}</para>`;
          exampleCnxml = exampleCnxml.replace(paraPattern, replacementText);

          isFirstPara = false;
        }
      }

      // Note: We do NOT strip equations - they should pass through unchanged
      // Only strip figures and tables that may need special handling
      exampleCnxml = stripNestedElements(exampleCnxml, ['figure', 'table']);

      return exampleCnxml;
    }
  }

  return buildGenericElement('example', element, getSeg, equations, originalCnxml);
}

/**
 * Build an exercise element.
 */
function buildExercise(element, getSeg, equations, originalCnxml) {
  // Extract from original and replace content
  if (element.id) {
    const exercisePattern = new RegExp(
      `<exercise\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/exercise>`,
      'g'
    );
    const match = exercisePattern.exec(originalCnxml);
    if (match) {
      let exerciseCnxml = match[0];

      // Replace problem paragraphs
      if (element.problem) {
        for (const child of element.problem.content || []) {
          if (child.type === 'para' && child.id && child.segmentId) {
            const paraText = getSeg(child.segmentId);
            if (paraText) {
              const paraPattern = new RegExp(
                `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
                'g'
              );
              exerciseCnxml = exerciseCnxml.replace(
                paraPattern,
                `<para id="${child.id}">${paraText}</para>`
              );
            }
          }
        }
      }

      // Replace solution paragraphs
      if (element.solution) {
        for (const child of element.solution.content || []) {
          if (child.type === 'para' && child.id && child.segmentId) {
            const paraText = getSeg(child.segmentId);
            if (paraText) {
              const paraPattern = new RegExp(
                `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
                'g'
              );
              exerciseCnxml = exerciseCnxml.replace(
                paraPattern,
                `<para id="${child.id}">${paraText}</para>`
              );
            }
          }
        }
      }

      // Note: We do NOT strip equations - they should pass through unchanged
      exerciseCnxml = stripNestedElements(exerciseCnxml, ['figure', 'table']);

      return exerciseCnxml;
    }
  }

  return null;
}

/**
 * Build a note element.
 */
function buildNote(element, getSeg, equations, originalCnxml) {
  // Extract from original and replace content
  if (element.id) {
    // Check if this note is nested inside an example or exercise in the original
    // If so, skip it - it's already included via buildExample/buildExercise
    // Use position-based check to avoid matching across element boundaries
    const noteMatch = originalCnxml.match(new RegExp(`<note\\s+id="${element.id}"`));
    if (noteMatch) {
      const notePos = noteMatch.index;

      // Check if note is inside any example
      const examplePattern = /<example[^>]*>[\s\S]*?<\/example>/g;
      let exMatch;
      let isInsideExample = false;
      while ((exMatch = examplePattern.exec(originalCnxml)) !== null) {
        const exStart = exMatch.index;
        const exEnd = exStart + exMatch[0].length;
        if (notePos > exStart && notePos < exEnd) {
          isInsideExample = true;
          break;
        }
      }

      // Check if note is inside any exercise
      const exercisePattern = /<exercise[^>]*>[\s\S]*?<\/exercise>/g;
      let exerMatch;
      let isInsideExercise = false;
      while ((exerMatch = exercisePattern.exec(originalCnxml)) !== null) {
        const exerStart = exerMatch.index;
        const exerEnd = exerStart + exerMatch[0].length;
        if (notePos > exerStart && notePos < exerEnd) {
          isInsideExercise = true;
          break;
        }
      }

      if (isInsideExample || isInsideExercise) {
        // This note is nested inside an example/exercise, skip standalone creation
        return null;
      }
    }

    const notePattern = new RegExp(`<note\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/note>`, 'g');
    const match = notePattern.exec(originalCnxml);
    if (match) {
      let noteCnxml = match[0];

      // Replace title
      if (element.title && element.title.segmentId) {
        const titleText = getSeg(element.title.segmentId);
        if (titleText) {
          noteCnxml = noteCnxml.replace(/<title>([^<]*)<\/title>/, `<title>${titleText}</title>`);
        }
      }

      // Replace paragraphs
      for (const child of element.content || []) {
        if (child.type === 'para' && child.id && child.segmentId) {
          const paraText = getSeg(child.segmentId);
          if (paraText) {
            const paraPattern = new RegExp(
              `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
              'g'
            );
            noteCnxml = noteCnxml.replace(paraPattern, `<para id="${child.id}">${paraText}</para>`);
          }
        }
      }

      // Note: We do NOT strip equations or figures - they should pass through unchanged
      // to preserve document order. Only strip elements that would cause nesting issues.
      noteCnxml = stripNestedElements(noteCnxml, ['table', 'example', 'exercise']);

      return noteCnxml;
    }
  }

  return buildGenericElement('note', element, getSeg, equations, originalCnxml);
}

/**
 * Build an equation element.
 */
function buildEquation(element, equations, originalCnxml) {
  // Extract from original (equations should remain unchanged)
  if (element.id) {
    const equationPattern = new RegExp(
      `<equation\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/equation>`,
      'g'
    );
    const match = equationPattern.exec(originalCnxml);
    if (match) {
      return match[0];
    }

    // Try to build from equations JSON
    if (equations[element.id]) {
      const eq = equations[element.id];
      const classAttr = element.class ? ` class="${element.class}"` : '';
      return `<equation id="${element.id}"${classAttr}>${eq.mathml}</equation>`;
    }
  }

  return null;
}

/**
 * Build a list element.
 */
function buildList(element, getSeg) {
  const lines = [];
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const listType = element.listType || 'bulleted';

  lines.push(`<list${idAttr} list-type="${listType}">`);

  for (const item of element.items || []) {
    const itemText = getSeg(item.segmentId);
    if (itemText) {
      const itemIdAttr = item.id ? ` id="${item.id}"` : '';
      lines.push(`<item${itemIdAttr}>${itemText}</item>`);
    }
  }

  lines.push('</list>');
  return lines.join('\n');
}

/**
 * Build a generic element with title and content.
 */
function buildGenericElement(tagName, element, getSeg, equations, originalCnxml) {
  const lines = [];
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';

  lines.push(`<${tagName}${idAttr}${classAttr}>`);

  // Add title
  if (element.title && element.title.segmentId) {
    const titleText = getSeg(element.title.segmentId) || element.title.text;
    if (titleText) {
      lines.push(`<title>${titleText}</title>`);
    }
  }

  // Add content
  for (const child of element.content || []) {
    const childCnxml = buildElement(child, getSeg, equations, originalCnxml);
    if (childCnxml) {
      lines.push(childCnxml);
    }
  }

  lines.push(`</${tagName}>`);
  return lines.join('\n');
}

/**
 * Escape XML special characters.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip nested elements from CNXML content.
 * Used to remove figures, tables, etc. that are handled separately.
 * @param {string} cnxml - CNXML content
 * @param {string[]} tagNames - Array of tag names to strip
 * @returns {string} CNXML with nested elements removed
 */
function stripNestedElements(cnxml, tagNames) {
  let result = cnxml;

  for (const tagName of tagNames) {
    // Match opening and closing tags with proper nesting
    const openTag = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g');
    const closeTag = `</${tagName}>`;

    let match;
    while ((match = openTag.exec(result)) !== null) {
      const startIdx = match.index;
      let depth = 1;
      let idx = startIdx + match[0].length;

      // Find matching close tag
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
            // Remove the element and leave a comment placeholder
            result =
              result.substring(0, startIdx) +
              `<!-- ${tagName} handled separately -->` +
              result.substring(endIdx);
            // Reset regex since we modified the string
            openTag.lastIndex = 0;
            break;
          }
          idx = nextClose + closeTag.length;
        }
      }
    }
  }

  return result;
}

// =====================================================================
// FILE I/O
// =====================================================================

/**
 * Find modules to process for a chapter.
 */
function findChapterModules(chapter, moduleId = null) {
  const chapterStr = String(chapter).padStart(2, '0');
  const structDir = path.join(BOOKS_DIR, '02-structure', `ch${chapterStr}`);

  if (!fs.existsSync(structDir)) {
    throw new Error(`Structure directory not found: ${structDir}`);
  }

  if (moduleId) {
    const structPath = path.join(structDir, `${moduleId}-structure.json`);
    if (!fs.existsSync(structPath)) {
      throw new Error(`Structure file not found: ${structPath}`);
    }
    return [moduleId];
  }

  const files = fs.readdirSync(structDir).filter((f) => f.endsWith('-structure.json'));
  return files.map((f) => f.replace('-structure.json', '')).sort();
}

/**
 * Load input files for a module.
 */
function loadModuleInputs(chapter, moduleId, lang) {
  const chapterStr = String(chapter).padStart(2, '0');

  // Load structure
  const structPath = path.join(
    BOOKS_DIR,
    '02-structure',
    `ch${chapterStr}`,
    `${moduleId}-structure.json`
  );
  const structure = JSON.parse(fs.readFileSync(structPath, 'utf-8'));

  // Load segments
  const segmentsPath = path.join(
    BOOKS_DIR,
    '02-for-mt',
    `ch${chapterStr}`,
    `${moduleId}-segments.${lang}.md`
  );
  let segments;
  if (!fs.existsSync(segmentsPath)) {
    // Fall back to English if translation not available
    const enPath = path.join(
      BOOKS_DIR,
      '02-for-mt',
      `ch${chapterStr}`,
      `${moduleId}-segments.en.md`
    );
    if (!fs.existsSync(enPath)) {
      throw new Error(`Segments file not found: ${segmentsPath} or ${enPath}`);
    }
    console.error(`Warning: Using English segments for ${moduleId} (translation not found)`);
    const content = fs.readFileSync(enPath, 'utf-8');
    segments = parseSegments(content);
  } else {
    const content = fs.readFileSync(segmentsPath, 'utf-8');
    segments = parseSegments(content);
  }

  // Load equations
  const eqPath = path.join(
    BOOKS_DIR,
    '02-structure',
    `ch${chapterStr}`,
    `${moduleId}-equations.json`
  );
  const equations = fs.existsSync(eqPath) ? JSON.parse(fs.readFileSync(eqPath, 'utf-8')) : {};

  // Load original CNXML
  const originalPath = path.join(BOOKS_DIR, '01-source', `ch${chapterStr}`, `${moduleId}.cnxml`);
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Original CNXML not found: ${originalPath}`);
  }
  const originalCnxml = fs.readFileSync(originalPath, 'utf-8');

  return { structure, segments, equations, originalCnxml };
}

/**
 * Ensure output directory exists.
 */
function ensureOutputDir(chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const outputDir = path.join(BOOKS_DIR, '03-translated', `ch${chapterStr}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * Write output CNXML.
 */
function writeOutput(chapter, moduleId, cnxml) {
  const outputDir = ensureOutputDir(chapter);
  const outputPath = path.join(outputDir, `${moduleId}.cnxml`);
  fs.writeFileSync(outputPath, cnxml, 'utf-8');
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

    for (const moduleId of modules) {
      if (args.verbose) {
        console.error(`Processing: ${moduleId}`);
      }

      const { structure, segments, equations, originalCnxml } = loadModuleInputs(
        args.chapter,
        moduleId,
        args.lang
      );

      const cnxml = buildCnxml(structure, segments, equations, originalCnxml, {
        verbose: args.verbose,
      });

      const outputPath = writeOutput(args.chapter, moduleId, cnxml);

      console.log(`${moduleId}: Translated CNXML written`);
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
