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
 *   node tools/cnxml-inject.js --chapter <num> --source-dir 03-faithful-translation
 *
 * Options:
 *   --chapter <num>    Chapter number
 *   --module <id>      Specific module ID (default: all in chapter)
 *   --lang <code>      Language code for translated segments (default: is)
 *   --source-dir <dir> Directory containing translated segments, relative to
 *                      books/efnafraedi/ (default: 02-machine-translated)
 *                      Use 02-machine-translated for MT preview,
 *                      03-faithful-translation for reviewed translations,
 *                      04-localized-content for localized
 *   --track <name>     Publication track: mt-preview, faithful, localized
 *                      (auto-detected from --source-dir if not specified)
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
// HELPER FUNCTIONS
// =====================================================================

/**
 * Format chapter for use in directory paths.
 * @param {number|string} chapter - Chapter number or "appendices"
 * @returns {string} Formatted chapter string (e.g., "ch01", "appendices")
 */
function formatChapter(chapter) {
  if (chapter === 'appendices') {
    return 'appendices';
  }
  return `ch${String(chapter).padStart(2, '0')}`;
}

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

/**
 * Derive publication track from source directory.
 * @param {string} sourceDir - Source directory name
 * @returns {string} Track name: mt-preview, faithful, or localized
 */
function trackFromSourceDir(sourceDir) {
  if (sourceDir.includes('faithful')) return 'faithful';
  if (sourceDir.includes('localized')) return 'localized';
  return 'mt-preview';
}

function parseArgs(args) {
  const result = {
    chapter: null,
    module: null,
    lang: 'is',
    sourceDir: null,
    track: null,
    verbose: false,
    allowIncomplete: false,
    annotateEn: true,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--allow-incomplete') result.allowIncomplete = true;
    else if (arg === '--no-annotate-en') result.annotateEn = false;
    else if (arg === '--chapter' && args[i + 1]) {
      const chapterArg = args[++i];
      // Accept either numeric chapter or "appendices"
      result.chapter = chapterArg === 'appendices' ? 'appendices' : parseInt(chapterArg, 10);
    } else if (arg === '--module' && args[i + 1]) result.module = args[++i];
    else if (arg === '--lang' && args[i + 1]) result.lang = args[++i];
    else if (arg === '--source-dir' && args[i + 1]) result.sourceDir = args[++i];
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
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
  node tools/cnxml-inject.js --chapter appendices

Options:
  --chapter <num|appendices>  Chapter number or "appendices"
  --module <id>        Specific module ID (default: all in chapter)
  --lang <code>        Language code (default: is)
  --source-dir <dir>   Segments directory relative to books/efnafraedi/
                       (default: 02-machine-translated)
  --track <name>       Publication track: mt-preview, faithful, localized
                       (auto-detected from --source-dir if not specified)
  --verbose            Show detailed progress
  --allow-incomplete   Write output even if segments are missing (for diagnostics)
  --no-annotate-en     Disable English term annotations (e. term) in output
  -h, --help           Show this help

Input Files (read from):
  <source-dir>/chNN/<module>-segments.<lang>.md  Translated segments
  02-structure/chNN/<module>-structure.json       Document structure
  02-structure/chNN/<module>-equations.json       MathML equations
  01-source/chNN/<module>.cnxml                   Original CNXML (reference)

Output:
  03-translated/<track>/chNN/<module>.cnxml       Translated CNXML

Examples:
  node tools/cnxml-inject.js --chapter 5 --module m68724
  node tools/cnxml-inject.js --chapter 5 --lang is --verbose
  node tools/cnxml-inject.js --chapter 5 --source-dir 03-faithful-translation
  node tools/cnxml-inject.js --chapter 5 --source-dir 04-localized-content
`);
}

// =====================================================================
// SEGMENT PARSING
// =====================================================================

/**
 * Parse segments from markdown file.
 * Uses first-match-wins: if a segment ID appears multiple times (e.g., from
 * overlapping MT file splits), the first occurrence is kept because it has
 * the correct MATH placeholder numbering from the original extraction.
 * @param {string} content - Segments markdown content
 * @returns {Map<string, string>} Map of segment ID to text
 */
function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let duplicateCount = 0;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const text = match[2].trim();
    if (segments.has(id)) {
      duplicateCount++;
    } else {
      segments.set(id, text);
    }
  }

  if (duplicateCount > 0) {
    console.error(`  Note: ${duplicateCount} duplicate segment(s) skipped (first-match-wins)`);
  }

  return segments;
}

/**
 * Restore __term__ markers in IS segments by comparing with EN segment marker positions.
 *
 * The MT service converts __term__ to **term**, making terms indistinguishable from
 * bold text. This function compares the EN source (which has distinct __term__ and
 * **bold** markers) with the IS translation to restore the correct marker type.
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, restoredCount: number }}
 */
function restoreTermMarkers(isSegments, enSegments) {
  let restoredCount = 0;

  // Regex to find inline markers in order: __term__ or **bold**
  // Uses lazy .+? for bold to handle content with single * inside (e.g., **work (*w*)**)
  const enMarkerPattern = /(__([^_]+)__|\*\*(.+?)\*\*)/g;
  // In IS segments, all markers are **text** (MT converted __ to **)
  const isMarkerPattern = /\*\*(.+?)\*\*/g;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Parse EN markers to determine the type sequence
    const enTypes = [];
    let enMatch;
    enMarkerPattern.lastIndex = 0;
    while ((enMatch = enMarkerPattern.exec(enText)) !== null) {
      if (enMatch[2] !== undefined) {
        // __text__ match — this is a term
        enTypes.push('term');
      } else {
        // **text** match — this is bold
        enTypes.push('bold');
      }
    }

    // Skip if no terms in EN (nothing to restore)
    if (!enTypes.some((t) => t === 'term')) continue;

    // Replace IS **text** markers positionally based on EN types
    let markerIndex = 0;
    const restored = isText.replace(isMarkerPattern, (match, inner) => {
      const type = markerIndex < enTypes.length ? enTypes[markerIndex] : 'bold';
      markerIndex++;
      if (type === 'term') {
        restoredCount++;
        return `__${inner}__`;
      }
      return match; // Keep as **bold**
    });

    if (restored !== isText) {
      isSegments.set(segId, restored);
    }
  }

  return { segments: isSegments, restoredCount };
}

/**
 * Restore [[BR]] placeholders in IS segments by matching EN segment positions.
 *
 * For already-processed IS segments that went through MT without [[BR]]:
 * looks at what follows [[BR]] in EN (the "anchor" pattern) and inserts
 * [[BR]] before the same anchor in IS.
 *
 * Common anchors: (a), (b), (c), [[MEDIA:N]], start-of-text after break.
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, restoredCount: number }}
 */
function restoreNewlines(isSegments, enSegments) {
  let restoredCount = 0;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Skip if EN has no [[BR]] or IS already has [[BR]]
    if (!enText.includes('[[BR]]') || isText.includes('[[BR]]')) continue;

    // Split EN text by [[BR]] to find anchor patterns after each break
    const enParts = enText.split('[[BR]]');
    if (enParts.length < 2) continue;

    let result = isText;
    let modified = false;

    // For each [[BR]] in EN, find the anchor (start of the next part) in IS
    for (let i = 1; i < enParts.length; i++) {
      const afterBreak = enParts[i].trimStart();

      // Extract anchor pattern: (a), (b), [[MEDIA:N]], [[MATH:N]], or first few words
      let anchor = null;

      // Try parenthesized letter/number: (a), (b), (1), etc.
      const parenMatch = afterBreak.match(/^\(([a-z0-9]+)\)/);
      if (parenMatch) {
        anchor = `(${parenMatch[1]})`;
      }

      // Try [[MEDIA:N]] or [[MATH:N]] placeholder
      if (!anchor) {
        const placeholderMatch = afterBreak.match(/^(\[\[(MEDIA|MATH):\d+\]\])/);
        if (placeholderMatch) {
          anchor = placeholderMatch[1];
        }
      }

      if (!anchor) continue; // No recognizable anchor — skip this break

      // Find anchor in IS text and insert [[BR]] before it
      const anchorIdx = result.indexOf(anchor);
      if (anchorIdx > 0) {
        // Insert [[BR]] before the anchor, trimming trailing space before it
        const before = result.substring(0, anchorIdx).replace(/\s+$/, '');
        const after = result.substring(anchorIdx);
        result = `${before} [[BR]]${after}`;
        modified = true;
        restoredCount++;
      }
    }

    if (modified) {
      isSegments.set(segId, result);
    }
  }

  return { segments: isSegments, restoredCount };
}

/**
 * Annotate inline __term__ markers in IS segments with the English original.
 *
 * For each segment present in both maps, extracts __term__ texts from the EN
 * source in order and inserts `(e. en_term)` after the IS term inside the
 * markers: `__IS_term (e. en_term)__`.
 *
 * Skips annotation when IS and EN terms are identical (case-insensitive),
 * e.g. "pH", "ATP".
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, annotatedCount: number }}
 */
function annotateInlineTerms(isSegments, enSegments) {
  let annotatedCount = 0;

  // Same regex strategy as restoreTermMarkers():
  // EN has distinct __term__ and **bold** — extract only __term__ texts
  const enMarkerPattern = /(__([^_]+)__|\*\*(.+?)\*\*)/g;
  // IS already has __term__ restored (after restoreTermMarkers)
  const isTermPattern = /__([^_]+)__/g;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Extract EN term texts in order (skip bold markers)
    const enTermTexts = [];
    let enMatch;
    enMarkerPattern.lastIndex = 0;
    while ((enMatch = enMarkerPattern.exec(enText)) !== null) {
      if (enMatch[2] !== undefined) {
        // __term__ match — record the term text
        enTermTexts.push(enMatch[2]);
      }
      // **bold** — skip
    }

    if (enTermTexts.length === 0) continue;

    // Replace IS __term__ markers positionally
    let termIndex = 0;
    const annotated = isText.replace(isTermPattern, (match, inner) => {
      if (termIndex >= enTermTexts.length) return match;

      const enTerm = enTermTexts[termIndex].toLowerCase();
      termIndex++;

      // Skip if IS and EN terms are the same (case-insensitive)
      if (inner.toLowerCase() === enTerm) return match;

      annotatedCount++;
      return `__${inner} (e. ${enTerm})__`;
    });

    if (annotated !== isText) {
      isSegments.set(segId, annotated);
    }
  }

  return { segments: isSegments, annotatedCount };
}

/**
 * Infer MIME type from file extension.
 * @param {string} src - Image source filename
 * @returns {string} MIME type
 */
function inferMimeType(src) {
  const ext = src.split('.').pop().toLowerCase();
  const mimeTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * Escape XML special characters.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a media element from metadata.
 * @param {Object} media - Media metadata
 * @returns {string} CNXML media element
 */
function buildMediaElement(media) {
  const idAttr = media.id ? ` id="${media.id}"` : '';
  const classAttr = media.class ? ` class="${media.class}"` : '';
  const altAttr = media.alt ? ` alt="${escapeXml(media.alt)}"` : '';

  const mimeType = media.mimeType || inferMimeType(media.src);

  return `<media${idAttr}${classAttr}${altAttr}><image mime-type="${mimeType}" src="${media.src}"/></media>`;
}

/**
 * Reverse inline markup back to CNXML.
 * Converts markdown-style markup back to CNXML inline elements.
 * @param {string} text - Text with inline markup
 * @param {Object} equations - Equations map
 * @param {Array} inlineMedia - Inline media metadata
 * @param {Array} inlineTables - Inline table structures
 * @returns {string} CNXML-compatible text
 */
function reverseInlineMarkup(text, equations, inlineMedia = [], inlineTables = []) {
  let result = text;

  // Remove backslash escapes from MT (e.g., \[\[MATH:1\]\] → [[MATH:1]])
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');

  // Remove backslash escapes from emphasis markers (e.g., \*text\* → *text*)
  result = result.replace(/\\\*/g, '*');

  // Restore newline and space placeholders to CNXML
  result = result.replace(/\[\[BR\]\]/g, '<newline/>');
  result = result.replace(/\[\[SPACE\]\]/g, '<space/>');

  // Restore math placeholders
  result = result.replace(/\[\[MATH:(\d+)\]\]/g, (match, num) => {
    const mathId = `math-${num}`;
    if (equations[mathId]) {
      return equations[mathId].mathml;
    }
    console.error(
      `  Warning: Unresolved math placeholder ${match} (no ${mathId} in equations.json)`
    );
    return match;
  });

  // Restore inline media placeholders
  result = result.replace(/\[\[MEDIA:(\d+)\]\]/g, (match, num) => {
    const placeholder = `[[MEDIA:${num}]]`;
    const media = inlineMedia.find((m) => m.placeholder === placeholder);
    if (media) {
      return buildMediaElement(media);
    }
    return match; // Keep placeholder if not found
  });

  // Restore embedded table placeholders
  // Note: buildTable function is defined later in the file
  result = result.replace(/\[\[TABLE:([^\]]+)\]\]/g, (match, tableId) => {
    const tableData = inlineTables.find((t) => t.tableId === tableId);
    if (tableData && tableData.structure) {
      // We'll build the table inline - this is handled after we have access to getSeg
      // For now, keep the placeholder and handle it in buildPara
      return match;
    }
    return match; // Keep placeholder if not found
  });

  // IMPORTANT: Extract MathML blocks before applying term wrapping to prevent
  // term markers from being applied inside MathML (which causes malformed XML)
  const mathBlocks = [];
  result = result.replace(/<m:math>[\s\S]*?<\/m:math>/g, (match) => {
    mathBlocks.push(match);
    return `{{MATHBLOCK:${mathBlocks.length - 1}}}`;
  });

  // Convert emphasis markers back to CNXML
  result = result.replace(/\*\*([^*]+)\*\*/g, '<emphasis effect="bold">$1</emphasis>');
  result = result.replace(/\*([^*]+)\*/g, '<emphasis effect="italics">$1</emphasis>');

  // Convert term markers back to CNXML (simplified - without IDs)
  // Handle both normal (__term__) and MT-escaped (\_\_term\_\_) markers
  result = result.replace(/\\_\\_([^_]+)\\_\\_/g, '<term>$1</term>');
  result = result.replace(/__([^_]+)__/g, '<term>$1</term>');

  // Restore MathML blocks after term wrapping
  result = result.replace(/\{\{MATHBLOCK:(\d+)\}\}/g, (match, index) => {
    return mathBlocks[parseInt(index)];
  });

  // Restore sup/sub inside terms (from ^..^ and ~..~ markdown)
  result = result.replace(/<term>([\s\S]*?)<\/term>/g, (match, inner) => {
    const restored = inner
      .replace(/\^([^^]{1,15})\^/g, '<sup>$1</sup>')
      .replace(/~([^~]{1,15})~/g, '<sub>$1</sub>');
    return `<term>${restored}</term>`;
  });

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

  // Convert sub/sup back (only match when part of a word, not standalone approximations)
  // First handle isotope notations specifically: space + ^number^ + letter (e.g., " ^14^C")
  result = result.replace(/\s\^([0-9]+)\^([A-Z][a-z]?)/g, ' <sup>$1</sup>$2');

  // Then handle general sub/sup that are part of words
  // Requires non-whitespace before tilde/caret and no whitespace in capture to avoid greedy matching
  result = result.replace(/(?<=[^\s~])~([^\s~]{1,15})~/g, '<sub>$1</sub>');
  result = result.replace(/(?<=[^\s^])\^([^\s^]{1,15})\^/g, '<sup>$1</sup>');

  // Convert footnotes back — handle both English marker and MT-translated Icelandic
  // Use lazy [\s\S]+? with lookahead to handle footnotes containing ] (e.g., math placeholders)
  result = result.replace(
    / \[(?:footnote|neðanmálsgrein): ([\s\S]+?)\](?=\s|$|[.,;:])/g,
    '<footnote>$1</footnote>'
  );

  // Escape XML entities that might have been introduced
  // (but be careful not to double-escape, and don't escape HTML comments)
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/<(?!\/?\w|!--)/g, '&lt;'); // Don't escape <!-- comments -->

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

/**
 * Recursively collect figure IDs and their caption segment IDs from the structure.
 * Used to translate figure captions inside notes.
 */
function collectFigureCaptions(elements, map) {
  for (const el of elements) {
    if (el.type === 'figure' && el.id && el.caption && el.caption.segmentId) {
      map[el.id] = el.caption.segmentId;
    }
    if (el.content) {
      collectFigureCaptions(el.content, map);
    }
  }
}

function buildCnxml(structure, segments, equations, originalCnxml, options = {}) {
  const verbose = options.verbose || false;

  // Injection tracking
  const stats = {
    segmentsRequested: 0,
    segmentsFound: 0,
    segmentsMissing: [],
    mathPlaceholders: 0,
    mathResolved: 0,
    mathUnresolved: [],
  };

  // Helper to get segment text
  const getSeg = (segmentId) => {
    if (!segmentId) return '';
    stats.segmentsRequested++;
    const text = segments.get(segmentId);
    if (!text) {
      stats.segmentsMissing.push(segmentId);
      if (verbose) {
        console.error(`Warning: Missing segment ${segmentId}`);
      }
      return '';
    }
    stats.segmentsFound++;
    return reverseInlineMarkup(
      text,
      equations,
      structure.inlineMedia || [],
      structure.inlineTables || []
    );
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

  // Build context for tracking figures handled inside notes (to avoid duplicates)
  const figureCaptions = {};
  collectFigureCaptions(structure.content, figureCaptions);
  const figuresHandledInNotes = new Set();
  const ctx = {
    figureCaptions,
    figuresHandledInNotes,
    inlineMedia: structure.inlineMedia || [],
    inlineTables: structure.inlineTables || [],
  };

  for (const element of structure.content) {
    const elementCnxml = buildElement(element, getSeg, equations, originalCnxml, ctx);
    if (elementCnxml) {
      lines.push(elementCnxml);
    }
  }

  lines.push('</content>');

  // Add glossary if present
  if (structure.glossary) {
    const enSegments = options.enSegments;
    const annotateEn = options.annotateEn !== false;

    lines.push('<glossary>');
    for (const item of structure.glossary.items) {
      const termText = getSeg(item.termSegmentId);
      const defText = getSeg(item.definitionSegmentId);
      if (termText && defText) {
        // Annotate glossary term with English original
        let annotatedTerm = termText;
        if (annotateEn && enSegments && item.termSegmentId) {
          const enTermRaw = enSegments.get(item.termSegmentId);
          if (enTermRaw) {
            // EN glossary terms may have __term__ markers — strip them
            const enTerm = enTermRaw
              .replace(/__([^_]+)__/g, '$1')
              .trim()
              .toLowerCase();
            // Strip any __term__ markers from IS text for comparison
            const isTermClean = annotatedTerm
              .replace(/__([^_]+)__/g, '$1')
              .replace(/<term>([^<]*)<\/term>/g, '$1')
              .trim();
            if (isTermClean.toLowerCase() !== enTerm) {
              // Insert annotation before closing </term> if it's a CNXML term element,
              // or append if plain text
              if (annotatedTerm.includes('</term>')) {
                annotatedTerm = annotatedTerm.replace(/<\/term>/, ` (e. ${enTerm})</term>`);
              } else {
                annotatedTerm = `${annotatedTerm} (e. ${enTerm})`;
              }
            }
          }
        }

        lines.push(`<definition id="${item.id}">`);
        lines.push(`<term>${annotatedTerm}</term>`);
        lines.push(`<meaning id="${item.id}-meaning">${defText}</meaning>`);
        lines.push('</definition>');
      }
    }
    lines.push('</glossary>');
  }

  lines.push('</document>');

  const output = lines.join('\n');

  // Verify: check for unresolved [[MATH:N]] placeholders in output
  const unresolvedMath = output.match(/\[\[MATH:(\d+)\]\]/g) || [];
  stats.mathUnresolved = unresolvedMath.map((m) => m.match(/\d+/)[0]);
  stats.mathPlaceholders = stats.mathUnresolved.length;

  // Build completeness report
  const report = {
    segmentsInFile: segments.size,
    segmentsRequested: stats.segmentsRequested,
    segmentsFound: stats.segmentsFound,
    segmentsMissing: stats.segmentsMissing,
    unresolvedMathPlaceholders: stats.mathUnresolved,
    complete: stats.segmentsMissing.length === 0 && stats.mathUnresolved.length === 0,
  };

  // Always report missing segments (not just verbose)
  if (stats.segmentsMissing.length > 0) {
    console.error(`  WARNING: ${stats.segmentsMissing.length} missing segment(s):`);
    for (const id of stats.segmentsMissing.slice(0, 10)) {
      console.error(`    - ${id}`);
    }
    if (stats.segmentsMissing.length > 10) {
      console.error(`    ... and ${stats.segmentsMissing.length - 10} more`);
    }
  }

  if (stats.mathUnresolved.length > 0) {
    console.error(
      `  WARNING: ${stats.mathUnresolved.length} unresolved [[MATH:N]] placeholder(s) in output`
    );
  }

  if (verbose) {
    console.error(
      `  Injection: ${stats.segmentsFound}/${stats.segmentsRequested} segments resolved`
    );
    console.error(`  Translation file has ${segments.size} segments total`);
    const unused = segments.size - stats.segmentsFound;
    if (unused > 0) {
      console.error(`  Note: ${unused} segments in translation file not referenced by structure`);
    }
  }

  return { cnxml: output, report };
}

/**
 * Build CNXML for a single element from structure.
 * @param {Object} element - Element structure
 * @param {Function} getSeg - Function to get segment text
 * @param {Object} equations - Equations map
 * @param {string} originalCnxml - Original CNXML for extracting complex elements
 * @param {Object} ctx - Context for tracking figures in notes
 * @returns {string} CNXML string for this element
 */
function buildElement(element, getSeg, equations, originalCnxml, ctx) {
  switch (element.type) {
    case 'para':
      return buildPara(element, getSeg, equations, originalCnxml, ctx);
    case 'section':
      return buildSection(element, getSeg, equations, originalCnxml, ctx);
    case 'figure':
      return buildFigure(element, getSeg, originalCnxml, ctx);
    case 'table':
      return buildTable(element, getSeg, originalCnxml);
    case 'example':
      return buildExample(element, getSeg, equations, originalCnxml);
    case 'exercise':
      return buildExercise(element, getSeg, equations, originalCnxml);
    case 'note':
      return buildNote(element, getSeg, equations, originalCnxml, ctx);
    case 'equation':
      return buildEquation(element, equations, originalCnxml);
    case 'list':
      return buildList(element, getSeg);
    case 'media':
      return buildMedia(element);
    default:
      return null;
  }
}

/**
 * Build a paragraph element.
 */
function buildPara(element, getSeg, equations, originalCnxml, ctx) {
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
  let text = element.segmentId ? getSeg(element.segmentId) || '' : '';

  // Restore embedded table placeholders if present
  // This needs to happen after getSeg because the placeholder is in the translated segment
  if (text && ctx && ctx.inlineTables) {
    text = text.replace(/\[\[TABLE:([^\]]+)\]\]/g, (match, tableId) => {
      const tableData = ctx.inlineTables.find((t) => t.tableId === tableId);
      if (tableData && tableData.structure) {
        return buildTable(tableData.structure, getSeg, originalCnxml);
      }
      return match; // Keep placeholder if not found
    });
  }

  // Return null only if neither title nor content
  if (!titleElement && !text) return null;

  return `<para${idAttr}>${titleElement}${text}</para>`;
}

/**
 * Build a section element.
 */
function buildSection(element, getSeg, equations, originalCnxml, ctx) {
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
    const childCnxml = buildElement(child, getSeg, equations, originalCnxml, ctx);
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
function buildFigure(element, getSeg, originalCnxml, ctx) {
  // Skip figures that were already translated in-place inside a note
  if (ctx && ctx.figuresHandledInNotes && ctx.figuresHandledInNotes.has(element.id)) {
    return null;
  }

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
    // Match table by ID - id attribute can appear anywhere in the opening tag
    const tablePattern = new RegExp(
      `<table[^>]*\\sid="${element.id}"[^>]*>[\\s\\S]*?<\\/table>`,
      'g'
    );
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
 * Replace list items within CNXML extracted from an example, exercise, or note.
 * Items are matched by position within the list element.
 */
function replaceListItems(cnxml, listElement, getSeg) {
  if (!listElement || !listElement.id || !listElement.items) return cnxml;

  const listPattern = new RegExp(`(<list\\s+id="${listElement.id}"[^>]*>)([\\s\\S]*?)(</list>)`);
  const listMatch = listPattern.exec(cnxml);
  if (!listMatch) return cnxml;

  let listContent = listMatch[2];
  let itemIndex = 0;

  // Replace each <item> in order with translated text
  listContent = listContent.replace(/<item[^>]*>[\s\S]*?<\/item>/g, (originalItem) => {
    if (itemIndex < listElement.items.length) {
      const item = listElement.items[itemIndex];
      itemIndex++;
      if (item.segmentId) {
        const translatedText = getSeg(item.segmentId);
        if (translatedText) {
          const itemIdAttr = item.id ? ` id="${item.id}"` : '';
          return `<item${itemIdAttr}>${translatedText}</item>`;
        }
      }
    }
    return originalItem;
  });

  return cnxml.replace(listPattern, `${listMatch[1]}${listContent}${listMatch[3]}`);
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
        // Replace list items
        if (child.type === 'list') {
          exampleCnxml = replaceListItems(exampleCnxml, child, getSeg);
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

      // Replace problem paragraphs and lists
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
          if (child.type === 'list') {
            exerciseCnxml = replaceListItems(exerciseCnxml, child, getSeg);
          }
        }
      }

      // Replace solution paragraphs and lists
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
          if (child.type === 'list') {
            exerciseCnxml = replaceListItems(exerciseCnxml, child, getSeg);
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
function buildNote(element, getSeg, equations, originalCnxml, ctx) {
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

      // Replace paragraphs and lists
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
        if (child.type === 'list') {
          noteCnxml = replaceListItems(noteCnxml, child, getSeg);
        }
      }

      // Replace figure captions inside the note with translated versions.
      // Figures nested inside notes are kept in-place to preserve layout,
      // and the standalone figure build is skipped via ctx.figuresHandledInNotes.
      if (ctx && ctx.figureCaptions) {
        const figIdPattern = /<figure\s+id="([^"]+)"/g;
        let figMatch;
        while ((figMatch = figIdPattern.exec(noteCnxml)) !== null) {
          const figId = figMatch[1];
          const captionSegId = ctx.figureCaptions[figId];
          if (captionSegId) {
            const captionText = getSeg(captionSegId);
            if (captionText) {
              // Replace the caption for this specific figure within the note
              const figureBlockPattern = new RegExp(
                `(<figure\\s+id="${figId}"[^>]*>[\\s\\S]*?)<caption>[\\s\\S]*?</caption>([\\s\\S]*?</figure>)`
              );
              noteCnxml = noteCnxml.replace(
                figureBlockPattern,
                `$1<caption>${captionText}</caption>$2`
              );
            }
            // Mark this figure as handled so standalone buildFigure skips it
            ctx.figuresHandledInNotes.add(figId);
          }
        }
      }

      // Note: We do NOT strip equations or figures - they pass through with translated
      // captions to preserve document order. Only strip elements that cause nesting issues.
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
  const numberStyleAttr = element.numberStyle ? ` number-style="${element.numberStyle}"` : '';
  const bulletStyleAttr = element.bulletStyle ? ` bullet-style="${element.bulletStyle}"` : '';

  lines.push(`<list${idAttr} list-type="${listType}"${numberStyleAttr}${bulletStyleAttr}>`);

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
 * Build a standalone media element (not nested inside a figure).
 * Infers mime-type from the file extension of the src attribute.
 * @param {Object} element - Media element structure
 * @returns {string} CNXML string for this media element
 */
function buildMedia(element) {
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';
  const alt = element.alt ? ` alt="${escapeXml(element.alt)}"` : '';

  const lines = [];
  lines.push(`<media${idAttr}${classAttr}${alt}>`);

  if (element.src) {
    const mimeType = inferMimeType(element.src);
    lines.push(`<image mime-type="${mimeType}" src="${element.src}"/>`);
  }

  lines.push('</media>');
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
  const chapterDir = formatChapter(chapter);
  const structDir = path.join(BOOKS_DIR, '02-structure', chapterDir);

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
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID (e.g., m68724)
 * @param {string} lang - Language code (e.g., 'is')
 * @param {string} sourceDir - Directory containing segments, relative to BOOKS_DIR (e.g., '02-for-mt', '03-faithful-translation')
 */
function loadModuleInputs(chapter, moduleId, lang, sourceDir) {
  const chapterDir = formatChapter(chapter);

  // Load structure
  const structPath = path.join(BOOKS_DIR, '02-structure', chapterDir, `${moduleId}-structure.json`);
  const structure = JSON.parse(fs.readFileSync(structPath, 'utf-8'));

  // Load segments from specified source directory
  const segmentsPath = path.join(
    BOOKS_DIR,
    sourceDir,
    chapterDir,
    `${moduleId}-segments.${lang}.md`
  );
  let segments;
  if (!fs.existsSync(segmentsPath)) {
    // Fall back to English segments in 02-for-mt if translation not available
    const enPath = path.join(BOOKS_DIR, '02-for-mt', chapterDir, `${moduleId}-segments.en.md`);
    if (!fs.existsSync(enPath)) {
      throw new Error(`Segments file not found: ${segmentsPath} or ${enPath}`);
    }
    console.error(
      `Warning: Using English segments for ${moduleId} (translation not found in ${sourceDir})`
    );
    const content = fs.readFileSync(enPath, 'utf-8');
    segments = parseSegments(content);
  } else {
    const content = fs.readFileSync(segmentsPath, 'utf-8');
    segments = parseSegments(content);
  }

  // Load equations
  const eqPath = path.join(BOOKS_DIR, '02-structure', chapterDir, `${moduleId}-equations.json`);
  const equations = fs.existsSync(eqPath) ? JSON.parse(fs.readFileSync(eqPath, 'utf-8')) : {};

  // Load EN segments (for term marker restoration)
  const enSegPath = path.join(BOOKS_DIR, '02-for-mt', chapterDir, `${moduleId}-segments.en.md`);
  const enSegments = fs.existsSync(enSegPath)
    ? parseSegments(fs.readFileSync(enSegPath, 'utf-8'))
    : new Map();

  // Load original CNXML
  const originalPath = path.join(BOOKS_DIR, '01-source', chapterDir, `${moduleId}.cnxml`);
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Original CNXML not found: ${originalPath}`);
  }
  const originalCnxml = fs.readFileSync(originalPath, 'utf-8');

  return { structure, segments, equations, originalCnxml, enSegments };
}

/**
 * Ensure output directory exists.
 */
function ensureOutputDir(chapter, track) {
  const chapterDir = formatChapter(chapter);
  const outputDir = path.join(BOOKS_DIR, '03-translated', track, chapterDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

/**
 * Write output CNXML.
 */
function writeOutput(chapter, moduleId, cnxml, track) {
  const outputDir = ensureOutputDir(chapter, track);
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

  const sourceDir = args.sourceDir || '02-machine-translated';
  const track = args.track || trackFromSourceDir(sourceDir);

  try {
    const modules = findChapterModules(args.chapter, args.module);

    for (const moduleId of modules) {
      if (args.verbose) {
        console.error(`Processing: ${moduleId} (source: ${sourceDir}, track: ${track})`);
      }

      const { structure, segments, equations, originalCnxml, enSegments } = loadModuleInputs(
        args.chapter,
        moduleId,
        args.lang,
        sourceDir
      );

      // Restore __term__ markers that MT converted to **bold**
      const { restoredCount } = restoreTermMarkers(segments, enSegments);
      if (args.verbose && restoredCount > 0) {
        console.error(`  Restored ${restoredCount} term marker(s) from EN source`);
      }

      // Restore [[BR]] placeholders from EN source into IS segments
      const { restoredCount: brRestoredCount } = restoreNewlines(segments, enSegments);
      if (args.verbose && brRestoredCount > 0) {
        console.error(`  Restored ${brRestoredCount} newline placeholder(s) from EN source`);
      }

      // Annotate inline terms with English originals: __IS (e. en)__
      if (args.annotateEn) {
        const { annotatedCount } = annotateInlineTerms(segments, enSegments);
        if (args.verbose && annotatedCount > 0) {
          console.error(`  Annotated ${annotatedCount} inline term(s) with EN originals`);
        }
      }

      const result = buildCnxml(structure, segments, equations, originalCnxml, {
        verbose: args.verbose,
        enSegments,
        annotateEn: args.annotateEn,
      });

      if (!result.report.complete && !args.allowIncomplete) {
        console.error(`${moduleId}: SKIPPED — incomplete injection`);
        if (result.report.segmentsMissing.length > 0) {
          console.error(`  Missing segments: ${result.report.segmentsMissing.length}`);
        }
        if (result.report.unresolvedMathPlaceholders.length > 0) {
          console.error(`  Unresolved math: ${result.report.unresolvedMathPlaceholders.length}`);
        }
        console.error('  Use --allow-incomplete to write anyway');
        process.exitCode = 1;
        continue;
      }

      const outputPath = writeOutput(args.chapter, moduleId, result.cnxml, track);

      const status = result.report.complete ? 'COMPLETE' : 'INCOMPLETE';
      console.log(`${moduleId}: Translated CNXML written [${status}]`);
      console.log(`  → ${outputPath}`);
      if (!result.report.complete) {
        console.log(`  Missing segments: ${result.report.segmentsMissing.length}`);
        console.log(`  Unresolved math: ${result.report.unresolvedMathPlaceholders.length}`);
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

export { restoreTermMarkers, restoreNewlines, annotateInlineTerms, parseSegments };
