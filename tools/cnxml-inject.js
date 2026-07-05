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
 *                      books/efnafraedi-2e/ (default: 02-mt-output)
 *                      Use 02-mt-output for MT preview,
 *                      03-faithful-translation for reviewed translations,
 *                      04-localized-content for localized
 *   --track <name>     Publication track: mt-preview, faithful, localized
 *                      (auto-detected from --source-dir if not specified)
 *   --verbose          Show detailed progress
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import { safeWrite, logBackup } from './lib/safeWrite.js';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';
import { compareTagCounts } from './cnxml-fidelity-check.js';
import { extractGlossary } from './lib/cnxml-parser.js';
import { resolveRestorePolicy } from './lib/provenance.js';
import { updateTranslationErrors } from './lib/update-translation-errors.js';
import { detectResidue, upsertResidueModule } from './lib/residue-check.js';
import { SEG_MARKER, parseSegmentsMap } from './lib/seg-markers.cjs';
import {
  parseCnxmlFragment,
  serializeCnxmlFragment,
  replaceParaContent as replaceParaContentDom,
  replaceListItems as replaceListItemsDom,
  removeElementsByTag,
  insertCnxmlBefore,
} from './lib/cnxml-dom.js';
import {
  loadMathLabelResolver,
  substituteMathLabels,
  reportMathLabels,
} from './lib/math-label-substitute.js';

// =====================================================================
// CONFIGURATION
// =====================================================================

let BOOKS_DIR = 'books/efnafraedi-2e';

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

function parseCliArgs(args) {
  const result = parseArgs(args, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'lang', flags: ['--lang'], type: 'string', default: 'is' },
    { name: 'sourceDir', flags: ['--source-dir'], type: 'string', default: null },
    { name: 'track', flags: ['--track'], type: 'string', default: null },
    { name: 'allowIncomplete', flags: ['--allow-incomplete'], type: 'boolean', default: false },
    { name: 'allowEnFallback', flags: ['--allow-en-fallback'], type: 'boolean', default: false },
    { name: 'noAnnotateEn', flags: ['--no-annotate-en'], type: 'boolean', default: false },
  ]);
  // Invert --no-annotate-en to annotateEn
  result.annotateEn = !result.noAnnotateEn;
  delete result.noAnnotateEn;
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
  --source-dir <dir>   Segments directory relative to books/efnafraedi-2e/
                       (default: 02-mt-output)
  --track <name>       Publication track: mt-preview, faithful, localized
                       (auto-detected from --source-dir if not specified)
  --verbose            Show detailed progress
  --allow-incomplete   Write output even if segments are missing (for diagnostics)
  --allow-en-fallback  Fall back to untranslated EN segments when a translation
                       is missing (off by default — otherwise it errors, so
                       untranslated content can't be published silently)
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
  const all = [...content.matchAll(new RegExp(SEG_MARKER.source, 'g'))].map((m) => m[1]);
  const segments = parseSegmentsMap(content); // first-wins
  const duplicateCount = all.length - segments.size;
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
  let strippedCount = 0;

  // Regex to find inline markers in order: __term__, **bold**, or {{b}}bold{{/b}}
  // Handles both legacy markdown bold and new API-safe bold markers.
  const enMarkerPattern = /(__([^_]+)__|\*\*(.+?)\*\*|\{\{b\}\}(.+?)\{\{\/b\}\})/g;
  // In IS segments from the old web UI, all markers are **text** (MT converted __ to **)
  const isStarPattern = /\*\*(.+?)\*\*/g;
  // In IS segments from the API, terms stay as __text__ (API preserves them)
  const isUnderscorePattern = /__([^_]+)__/g;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // New {{term}} format: EN uses {{term}}text{{/term}} markers.
    // Only strip __term__ from IS when IS also has {{term}} markers — this proves
    // the IS was API-translated with new extraction, and __term__ are glossary artifacts.
    // If IS has __term__ but NO {{term}}, it's a legacy translation — keep them.
    const enHasNewTerms = enText.includes('{{term}}');
    if (enHasNewTerms) {
      const isHasNewTerms = isText.includes('{{term}}');
      if (isHasNewTerms) {
        // Both use new format: any __term__ in IS is API glossary overproduction
        const legacyTerms = isText.match(/__[^_]+__/g);
        if (legacyTerms) {
          const stripped = isText.replace(/__([^_]+)__/g, '$1');
          strippedCount += legacyTerms.length;
          isSegments.set(segId, stripped);
        }
      }
      // Skip legacy logic — EN uses new format, so positional **→__ matching doesn't apply
      continue;
    }

    // Count EN term markers (__text__)
    const enTermCount = (enText.match(/__[^_]+__/g) || []).length;

    // Parse EN markers to determine the type sequence
    const enTypes = [];
    let enMatch;
    enMarkerPattern.lastIndex = 0;
    while ((enMatch = enMarkerPattern.exec(enText)) !== null) {
      if (enMatch[2] !== undefined) {
        enTypes.push('term');
      } else {
        enTypes.push('bold');
      }
    }

    // Check if IS has __text__ markers (API pipeline) or **text** markers (web UI pipeline)
    const isTermCount = (isText.match(/__[^_]+__/g) || []).length;
    const isStarCount = (isText.match(/\*\*(.+?)\*\*/g) || []).length;

    if (isTermCount > 0 && isTermCount > enTermCount) {
      // API pipeline: IS has __text__ markers, some added by the API's glossary.
      // Keep only the first N that match the EN count, strip the rest to plain text.
      let termIndex = 0;
      const restored = isText.replace(isUnderscorePattern, (match, inner) => {
        termIndex++;
        if (termIndex <= enTermCount) {
          return match; // Keep this term marker
        }
        strippedCount++;
        return inner; // Strip marker, keep text
      });
      if (restored !== isText) {
        isSegments.set(segId, restored);
      }
    } else if (isTermCount === 0 && isStarCount > 0 && enTypes.some((t) => t === 'term')) {
      // Web UI pipeline: IS has **text** (MT converted __ to **).
      // Restore terms based on EN positional order.
      let markerIndex = 0;
      const restored = isText.replace(isStarPattern, (match, inner) => {
        const type = markerIndex < enTypes.length ? enTypes[markerIndex] : 'bold';
        markerIndex++;
        if (type === 'term') {
          restoredCount++;
          return `__${inner}__`;
        }
        return match;
      });
      if (restored !== isText) {
        isSegments.set(segId, restored);
      }
    }
    // If IS term count matches EN exactly, or no terms in EN — leave as-is
  }

  return { segments: isSegments, restoredCount, strippedCount };
}

/**
 * Limit superscript (^text^) and subscript (~text~) markers in IS segments
 * to match the count found in EN segments.
 *
 * The MT API sometimes produces extra sup/sub markers (overproduction).
 * This function counts markers in EN and IS for each segment, and strips
 * excess markers from the end of IS when IS has more than EN.
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, supStripped: number, subStripped: number }}
 */
function restoreSupersubMarkers(isSegments, enSegments) {
  let supStripped = 0;
  let subStripped = 0;

  // Patterns for legacy sup (^text^) and sub (~text~)
  const supPattern = /\^([^\s^]{1,15})\^/g;
  const subPattern = /~([^\s~]{1,15})~/g;
  // Patterns for new API-safe [[sup:content]] and [[sub:content]]
  const newSupPattern = /\[\[sup:[^\]]+\]\]/g;
  const newSubPattern = /\[\[sub:[^\]]+\]\]/g;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Count sup markers in EN vs IS — include BOTH old and new formats.
    // This prevents false "excess" detection when EN uses new [[sup:...]] format
    // but IS still uses old ^text^ format from a prior translation.
    const enSupCount =
      (enText.match(supPattern) || []).length + (enText.match(newSupPattern) || []).length;
    supPattern.lastIndex = 0;
    const isSupCount =
      (isText.match(supPattern) || []).length + (isText.match(newSupPattern) || []).length;
    supPattern.lastIndex = 0;

    let result = isText;

    if (isSupCount > enSupCount) {
      // Strip excess legacy sup markers from end (keep first N matching EN count)
      // Only strip old ^text^ markers — new [[sup:...]] markers are API-safe
      const isLegacySupCount = (isText.match(supPattern) || []).length;
      supPattern.lastIndex = 0;
      const enLegacySupCount = (enText.match(supPattern) || []).length;
      supPattern.lastIndex = 0;
      if (isLegacySupCount > enLegacySupCount) {
        const target = isLegacySupCount - enLegacySupCount;
        let stripped = 0;
        const matches = [];
        let m;
        supPattern.lastIndex = 0;
        while ((m = supPattern.exec(result)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
        }
        for (let i = matches.length - 1; i >= 0 && stripped < target; i--) {
          const match = matches[i];
          result = result.substring(0, match.start) + match.inner + result.substring(match.end);
          stripped++;
          supStripped++;
        }
      }
    }

    // Count sub markers in EN vs IS — include BOTH old and new formats
    const enSubCount =
      (enText.match(subPattern) || []).length + (enText.match(newSubPattern) || []).length;
    subPattern.lastIndex = 0;
    const isSubCount =
      (result.match(subPattern) || []).length + (result.match(newSubPattern) || []).length;
    subPattern.lastIndex = 0;

    if (isSubCount > enSubCount) {
      const isLegacySubCount = (result.match(subPattern) || []).length;
      subPattern.lastIndex = 0;
      const enLegacySubCount = (enText.match(subPattern) || []).length;
      subPattern.lastIndex = 0;
      if (isLegacySubCount > enLegacySubCount) {
        const target = isLegacySubCount - enLegacySubCount;
        let stripped = 0;
        const matches = [];
        let m;
        subPattern.lastIndex = 0;
        while ((m = subPattern.exec(result)) !== null) {
          matches.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
        }
        for (let i = matches.length - 1; i >= 0 && stripped < target; i--) {
          const match = matches[i];
          result = result.substring(0, match.start) + match.inner + result.substring(match.end);
          stripped++;
          subStripped++;
        }
      }
    }

    if (result !== isText) {
      isSegments.set(segId, result);
    }
  }

  return { segments: isSegments, supStripped, subStripped };
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
    } else {
      // Warn about unrestorable newline loss — EN has [[BR]] but IS has none
      // and no anchor-based restoration was possible. This is an MT API limitation.
      const enBrCount = (enText.match(/\[\[BR\]\]/g) || []).length;
      console.error(
        `  Warning: ${segId} lost ${enBrCount} [[BR]] marker(s) — no anchors found for restoration`
      );
    }
  }

  return { segments: isSegments, restoredCount };
}

/**
 * Restore [[MEDIA:N]] placeholders that the MT service dropped entirely.
 *
 * The web UI MT service strips [[MEDIA:N]] and [[BR]] markers from segments.
 * This function compares EN and IS segments: if EN has [[MEDIA:N]] but IS has 0,
 * it appends the missing markers to the IS segment (preserving their order from EN).
 *
 * Also restores [[BR]] that precedes [[MEDIA:N]] (common pattern: "text:[[BR]] [[MEDIA:1]]").
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, restoredCount: number }}
 */
function restoreMediaMarkers(isSegments, enSegments) {
  let restoredCount = 0;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Count [[MEDIA:N]] in EN vs IS
    const enMediaMatches = enText.match(/\[\[MEDIA:\d+\]\]/g) || [];
    const isMediaCount = (isText.match(/\[\[MEDIA:\d+\]\]/g) || []).length;

    if (enMediaMatches.length === 0 || isMediaCount >= enMediaMatches.length) continue;

    // IS is missing some or all [[MEDIA:N]] markers — restore from EN
    // Strategy: extract the tail pattern from EN (everything from first [[BR]] or [[MEDIA:]]
    // near the end) and append it to IS.
    //
    // Common patterns in EN:
    //   "text:[[BR]] [[MEDIA:1]]"
    //   "(a)[[BR]][[MEDIA:1]][[BR]] (b)[[BR]][[MEDIA:2]]"
    //   "text:[[BR]] [[MEDIA:1]][[BR]] text"
    //
    // For the simple case (all media missing), we extract markers from EN and append.

    if (isMediaCount === 0) {
      // All media markers lost — extract the marker portion from EN
      // Find all [[BR]] and [[MEDIA:N]] sequences in EN, preserving order
      const markerPattern = /(\[\[BR\]\]|\[\[MEDIA:\d+\]\])/g;
      const markers = [];
      let m;
      while ((m = markerPattern.exec(enText)) !== null) {
        markers.push(m[1]);
      }

      if (markers.length > 0) {
        // Append markers to IS text
        const markerStr = markers.join('');
        const result = isText.trimEnd();
        // If EN has a pattern like "text:[[BR]][[MEDIA:1]]", the IS likely ends with "text:"
        // Just append the markers after the text
        isSegments.set(segId, result + markerStr);
        restoredCount += enMediaMatches.length;
      }
    }
    // If IS has some but not all markers, leave it — partial restoration is risky
  }

  return { segments: isSegments, restoredCount };
}

/**
 * Run the three web-UI marker restores over a segment map and report the counts.
 * Both inject policy branches call this ONE helper so they cannot drift: 'mutate'
 * passes the real `segments` map (rewrites in place); 'warn' passes a throwaway
 * `new Map(segments)` clone (reports what WOULD change without touching the real
 * segments). The restores mutate their argument map in place — isolation is purely
 * the caller's choice of which map to hand in.
 * @param {Map<string,string>} targetSegments - map the restores mutate in place
 * @param {Map<string,string>} enSegments - English source segments
 * @returns {{ supStripped:number, subStripped:number, mediaRestored:number, brRestored:number }}
 */
function runWebUiRestores(targetSegments, enSegments) {
  const { supStripped, subStripped } = restoreSupersubMarkers(targetSegments, enSegments);
  const { restoredCount: mediaRestored } = restoreMediaMarkers(targetSegments, enSegments);
  const { restoredCount: brRestored } = restoreNewlines(targetSegments, enSegments);
  return { supStripped, subStripped, mediaRestored, brRestored };
}

/**
 * Restore [[MATH:N]] placeholders that the MT API resolved to plain text.
 *
 * The API sometimes "helpfully" replaces simple math placeholders (especially
 * chemical formulas like NH₄⁺, CO₃²⁻) with their text equivalents instead of
 * preserving the opaque [[MATH:N]] marker.
 *
 * For each segment where EN has more [[MATH:N]] than IS, this function attempts
 * to re-insert the missing placeholders by matching the EN segment structure.
 *
 * Strategy: for segments where IS has FEWER [[MATH:N]] than EN, find the missing
 * placeholder positions in EN and splice them back into IS at matching positions.
 * For simple cases (short segments where the API inlined the formula), we replace
 * the inlined text with the original placeholder.
 *
 * @param {Map<string, string>} isSegments - Translated (IS) segments (mutated in place)
 * @param {Map<string, string>} enSegments - Original English segments
 * @returns {{ segments: Map<string, string>, restoredCount: number }}
 */
function restoreMathMarkers(isSegments, enSegments) {
  let restoredCount = 0;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    const enMathMatches = enText.match(/\[\[MATH:\d+\]\]/g) || [];
    const isMathMatches = isText.match(/\[\[MATH:\d+\]\]/g) || [];

    if (enMathMatches.length === 0 || isMathMatches.length >= enMathMatches.length) continue;

    // IS is missing some [[MATH:N]] markers.
    const isMathIds = new Set(isMathMatches);
    const missingMaths = enMathMatches.filter((m) => !isMathIds.has(m));
    if (missingMaths.length === 0) continue;

    let result = isText;
    let modified = false;

    // Strategy 1: Separator-based restoration for (a), (b), (c) labeled segments.
    // Try this FIRST because it's more precise — it scopes each replacement to
    // its labeled chunk, preventing anchor-based greedy replacement from
    // overwriting text in adjacent chunks.
    const hasSeparators = /\([a-z]\)/.test(enText);
    if (hasSeparators) {
      const separatorRestored = restoreMathBySeparators(isText, enText);
      if (separatorRestored !== null) {
        const newMathCount = (separatorRestored.match(/\[\[MATH:\d+\]\]/g) || []).length;
        if (newMathCount > isMathMatches.length) {
          restoredCount += newMathCount - isMathMatches.length;
          result = separatorRestored;
          modified = true;
        }
      }
    }

    // Strategy 2: Anchor-based restoration (fallback for non-separator segments)
    const currentMathCount = (result.match(/\[\[MATH:\d+\]\]/g) || []).length;
    if (currentMathCount < enMathMatches.length) {
      const currentMissing = enMathMatches.filter((m) => !result.includes(m));
      for (const missing of currentMissing) {
        if (result.includes(missing)) continue;

        const mathIdx = enText.indexOf(missing);
        if (mathIdx < 0) continue;

        const beforeInEn = enText.substring(Math.max(0, mathIdx - 30), mathIdx);
        const anchor = beforeInEn
          .replace(/\[\[(MATH|BR|MEDIA):[^\]]*\]\]/g, '')
          .trim()
          .slice(-15);

        if (anchor.length < 2) continue;

        const anchorIdx = result.indexOf(anchor);
        if (anchorIdx >= 0) {
          const insertPos = anchorIdx + anchor.length;
          const nextMathInIs = result.indexOf('[[MATH:', insertPos);
          // Also use label separators as boundaries to avoid greedy replacement
          const nextSepInIs = result.slice(insertPos).search(/\([a-z]\)/);
          let nextAnchorEnd = result.length;
          if (nextMathInIs >= 0) nextAnchorEnd = Math.min(nextAnchorEnd, nextMathInIs);
          if (nextSepInIs >= 0) nextAnchorEnd = Math.min(nextAnchorEnd, insertPos + nextSepInIs);
          const inlinedText = result.substring(insertPos, nextAnchorEnd).trim();

          if (inlinedText.length > 0 && inlinedText.length < 40) {
            const before = result.substring(0, insertPos);
            const after = result.substring(nextAnchorEnd);
            result = `${before} ${missing}${after}`;
            modified = true;
            restoredCount++;
          }
        }
      }
    }

    if (modified) {
      isSegments.set(segId, result);
    }
  }

  return { segments: isSegments, restoredCount };
}

/**
 * Restore MATH markers by splitting segments at letter-label separators.
 *
 * Handles cases like "(b) [[MATH:39]] [[MATH:40]]" where the API replaced
 * the markers with inline chemical formulas. Splits both EN and IS by
 * (a), (b), (c), etc. and restores within each chunk.
 *
 * @param {string} isText - Current IS text (possibly partially restored)
 * @param {string} enText - Original EN text with [[MATH:N]] markers
 * @returns {string|null} Restored text, or null if no restoration possible
 */
function restoreMathBySeparators(isText, enText) {
  const sepRegex = /(\([a-z]\))/g;

  const enParts = enText.split(sepRegex);
  const isParts = isText.split(sepRegex);

  // Must have same number of parts (same separator structure)
  if (enParts.length !== isParts.length || enParts.length < 3) return null;

  // Verify separators match
  for (let i = 0; i < enParts.length; i++) {
    const enIsSep = /^\([a-z]\)$/.test(enParts[i]);
    const isIsSep = /^\([a-z]\)$/.test(isParts[i]);
    if (enIsSep !== isIsSep) return null;
    if (enIsSep && enParts[i] !== isParts[i]) return null;
  }

  const resultParts = [];
  let anyRestored = false;

  for (let i = 0; i < enParts.length; i++) {
    const enPart = enParts[i];
    const isPart = isParts[i];

    // Separator — keep as-is
    if (/^\([a-z]\)$/.test(enPart)) {
      resultParts.push(isPart);
      continue;
    }

    // Content chunk — check for missing MATH
    const chunkMaths = enPart.match(/\[\[MATH:\d+\]\]/g) || [];
    const isChunkMathCount = (isPart.match(/\[\[MATH:\d+\]\]/g) || []).length;

    if (chunkMaths.length === 0 || isChunkMathCount >= chunkMaths.length) {
      resultParts.push(isPart);
      continue;
    }

    // Missing MATH markers in this chunk — attempt restoration
    const firstMathIdx = enPart.indexOf(chunkMaths[0]);
    const enPrefix = enPart.substring(0, firstMathIdx);
    const lastMath = chunkMaths[chunkMaths.length - 1];
    const lastMathEnd = enPart.lastIndexOf(lastMath) + lastMath.length;
    const enSuffix = enPart.substring(lastMathEnd);

    if (enPrefix.trim().length === 0) {
      // No meaningful text before MATHs — replace IS content with MATH markers
      const leading = isPart.match(/^(\s*)/)[1];
      const suffixTrimmed = enSuffix.trim();
      if (suffixTrimmed) {
        const suffixIdx = isPart.lastIndexOf(suffixTrimmed);
        if (suffixIdx > leading.length) {
          resultParts.push(leading + chunkMaths.join(' ') + isPart.substring(suffixIdx));
        } else {
          resultParts.push(leading + chunkMaths.join(' ') + enSuffix);
        }
      } else {
        resultParts.push(leading + chunkMaths.join(' '));
      }
      anyRestored = true;
    } else {
      // Has text before MATHs — use shared punctuation as anchor
      const punctMatch = enPrefix.match(/[,;:]\s*$/);
      if (punctMatch) {
        const punct = punctMatch[0].trimEnd();
        const punctIdx = isPart.indexOf(punct);
        if (punctIdx >= 0) {
          const insertPos = punctIdx + punct.length;
          const mathStr = ' ' + chunkMaths.join(' ');
          const suffixTrimmed = enSuffix.trim();
          if (suffixTrimmed) {
            const suffixIdx = isPart.indexOf(suffixTrimmed, insertPos);
            if (suffixIdx >= 0) {
              resultParts.push(
                isPart.substring(0, insertPos) + mathStr + isPart.substring(suffixIdx)
              );
            } else {
              resultParts.push(isPart.substring(0, insertPos) + mathStr);
            }
          } else {
            resultParts.push(isPart.substring(0, insertPos) + mathStr);
          }
          anyRestored = true;
          continue;
        }
      }
      // Fallback: can't find anchor — keep IS text
      resultParts.push(isPart);
    }
  }

  return anyRestored ? resultParts.join('') : null;
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

  // EN markers: {{term}}text{{/term}}, __term__, **bold**, {{b}}bold{{/b}}
  const enMarkerPattern =
    /(\{\{term\}\}([\s\S]*?)\{\{\/term\}\}|__([^_]+)__|\*\*(.+?)\*\*|\{\{b\}\}(.+?)\{\{\/b\}\})/g;
  // IS: both new {{term}} and legacy __term__ formats
  const isTermPattern = /(\{\{term\}\}([\s\S]*?)\{\{\/term\}\}|__([^_]+)__)/g;

  for (const [segId, isText] of isSegments) {
    const enText = enSegments.get(segId);
    if (!enText) continue;

    // Extract EN term texts in order (skip bold markers)
    const enTermTexts = [];
    let enMatch;
    enMarkerPattern.lastIndex = 0;
    while ((enMatch = enMarkerPattern.exec(enText)) !== null) {
      if (enMatch[2] !== undefined) {
        // {{term}}text{{/term}} match
        enTermTexts.push(enMatch[2]);
      } else if (enMatch[3] !== undefined) {
        // __term__ match
        enTermTexts.push(enMatch[3]);
      }
      // **bold** or {{b}} — skip
    }

    if (enTermTexts.length === 0) continue;

    // Replace IS term markers positionally (handles both {{term}} and __term__ formats)
    let termIndex = 0;
    const annotated = isText.replace(isTermPattern, (match, _full, newInner, legacyInner) => {
      const inner = newInner !== undefined ? newInner : legacyInner;
      const isNewFormat = newInner !== undefined;
      if (termIndex >= enTermTexts.length) return match;

      // Strip inline markers from EN term text to plain text for annotations.
      // Annotations are reference hints "(e. english term)" — they don't exist in
      // source CNXML, so any CNXML tags (sub, sup, emphasis) inside them would be
      // overcounted by the fidelity check. Plain text avoids this side-effect and
      // also prevents raw API markers from leaking into IS segments.
      const enTermRaw = enTermTexts[termIndex];
      const enTerm = enTermRaw
        .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
        .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
        .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
        .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
        .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '') // F6: drop MATH/MEDIA/any remaining placeholder
        .toLowerCase();
      termIndex++;

      // Skip if IS and EN terms are the same (case-insensitive)
      if (inner.toLowerCase() === enTerm) return match;

      annotatedCount++;
      if (isNewFormat) {
        return `{{term}}${inner} (e. ${enTerm}){{/term}}`;
      }
      return `__${inner} (e. ${enTerm})__`;
    });

    if (annotated !== isText) {
      isSegments.set(segId, annotated);
    }
  }

  return { segments: isSegments, annotatedCount };
}

/**
 * Restore inline emphasis/sub/sup markup in a translated glossary term
 * by matching against the original CNXML term element.
 *
 * The extraction strips inline markup from glossary terms (e.g., "heat (q)"
 * instead of "heat ([[i:q]])"). This function restores the markup by finding
 * the same text in the translated term (mathematical variables like q, C, m
 * are preserved exactly in translation).
 *
 * @param {string} translatedTerm - Translated term text (from getSeg)
 * @param {string} originalRawTerm - Original CNXML term content (with markup)
 * @returns {string} Term with inline markup restored
 */
function restoreGlossaryTermMarkup(translatedTerm, originalRawTerm) {
  if (!originalRawTerm || !originalRawTerm.includes('<')) return translatedTerm;

  let result = translatedTerm;

  // Restore MathML elements from original term. The extraction strips these,
  // losing formulas like (ΔG°f) from glossary terms. We append them to the
  // translated term since they're notation that should be language-independent.
  const mathBlocks = originalRawTerm.match(/<m:math[\s\S]*?<\/m:math>/g);
  if (mathBlocks) {
    // Count existing math in result to avoid duplicates
    const existingMath = (result.match(/<m:math/g) || []).length;
    for (let i = existingMath; i < mathBlocks.length; i++) {
      result = result + ' ' + mathBlocks[i];
    }
  }

  // Collect all inline markup from original term
  const inlinePattern =
    /<(emphasis)\s+effect="([^"]+)">([^<]+)<\/emphasis>|<(sub|sup)>([^<]+)<\/\4>/g;
  let match;

  while ((match = inlinePattern.exec(originalRawTerm)) !== null) {
    const isEmphasis = !!match[1];
    const tag = isEmphasis ? 'emphasis' : match[4];
    const effect = isEmphasis ? match[2] : null;
    const text = isEmphasis ? match[3] : match[5];

    // Build the CNXML replacement
    const replacement = isEmphasis
      ? `<emphasis effect="${effect}">${text}</emphasis>`
      : `<${tag}>${text}</${tag}>`;

    // Only restore if the exact text appears in the translated term
    // and isn't already wrapped (prevents double-wrapping)
    if (result.includes(text) && !result.includes(replacement)) {
      result = result.replace(text, replacement);
    }
  }

  return result;
}

/**
 * Load image mapping from a book's media directory.
 * Maps figureId → translated image info for swapping original images
 * with translated variants (e.g., from docx-import).
 * @param {string} bookDir - Book directory (e.g., 'books/liffraedi-2e')
 * @returns {Map<string, {outputName: string, extension: string}>} Map from figureId to image info
 */
function loadImageMapping(bookDir) {
  const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
  const map = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    for (const entry of data) {
      if (entry.figureId && entry.outputName) {
        map.set(entry.figureId, entry);
      }
    }
  } catch {
    // No mapping file — nothing to swap
  }
  return map;
}

/**
 * Swap an image src path with a translated variant if one exists in the mapping.
 * Preserves the relative directory prefix (e.g., '../../media/').
 * @param {string} src - Original image src (e.g., '../../media/Figure_03_03_01.jpg')
 * @param {string} figureId - Figure element ID (e.g., 'fig-ch03_03_01')
 * @param {Map} imageMapping - Map from figureId to translated image info
 * @returns {{src: string, mimeType: string|null}} Swapped src and optional mime type
 */
function resolveTranslatedImage(src, figureId, imageMapping) {
  if (!imageMapping || !figureId || !imageMapping.has(figureId)) {
    return { src, mimeType: null };
  }
  const entry = imageMapping.get(figureId);
  // Preserve directory prefix from original src
  const lastSlash = src.lastIndexOf('/');
  const prefix = lastSlash >= 0 ? src.substring(0, lastSlash + 1) : '';
  const newSrc = prefix + entry.outputName;
  const mimeType = inferMimeType(entry.outputName);
  return { src: newSrc, mimeType };
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
 * "From-scratch SVG" image-localization route (distinct from the legacy
 * figure-id mechanism in resolveTranslatedImage). Swap any <image> whose src
 * basename matches a translated variant, regardless of the enclosing element
 * (figure / example / exercise / standalone media). The figure-id mechanism
 * only reaches <figure> images; this pass reaches all of them because it keys
 * on the image basename, which render emits uniformly.
 *
 * Entries are matched by an exact `originalImage` basename (no extension); the
 * presence of that field is what distinguishes new-route entries from legacy
 * figure-id entries (which carry `figureId` and are left untouched here).
 *
 * @param {string} cnxml - Assembled module CNXML
 * @param {Array<{originalImage:string,outputName:string}>} basenameMap
 * @returns {string} CNXML with matching <image> srcs (and mime-types) swapped
 */
function applyImageBasenameSwaps(cnxml, basenameMap) {
  if (!cnxml || !Array.isArray(basenameMap) || basenameMap.length === 0) return cnxml;
  const byBasename = new Map();
  for (const e of basenameMap) {
    if (e && e.originalImage && e.outputName) byBasename.set(e.originalImage, e);
  }
  if (byBasename.size === 0) return cnxml;

  return cnxml.replace(/<image\b[^>]*?\/?>/g, (tag) => {
    const srcMatch = tag.match(/\ssrc="([^"]*)"/);
    if (!srcMatch) return tag;
    const file = srcMatch[1].split('/').pop();
    const basename = file.replace(/\.[^.]+$/, '');
    const entry = byBasename.get(basename);
    if (!entry) return tag;
    const prefix = srcMatch[1].slice(0, srcMatch[1].length - file.length);
    const newSrc = prefix + entry.outputName;
    const mimeType = inferMimeType(entry.outputName);
    let updated = tag.replace(/\ssrc="[^"]*"/, ` src="${newSrc}"`);
    updated = /\smime-type="[^"]*"/.test(updated)
      ? updated.replace(/\smime-type="[^"]*"/, ` mime-type="${mimeType}"`)
      : updated.replace(/<image\b/, `<image mime-type="${mimeType}"`);
    return updated;
  });
}

/**
 * Load the new-route (basename-keyed) image map from a book's media dir.
 * Returns only entries that carry `originalImage` — legacy figure-id entries
 * (and the docx-import route) are intentionally excluded.
 * @param {string} bookDir - Book directory
 * @returns {Array<{originalImage:string,outputName:string,extension?:string}>}
 */
function loadImageBasenameMap(bookDir) {
  const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
  try {
    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    return Array.isArray(data) ? data.filter((e) => e && e.originalImage && e.outputName) : [];
  } catch {
    return [];
  }
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

  if (media.embedSrc) {
    const w = media.width ? ` width="${escapeXml(media.width)}"` : '';
    const h = media.height ? ` height="${escapeXml(media.height)}"` : '';
    return `<media${idAttr}${classAttr}${altAttr}><iframe${w}${h} src="${escapeXml(media.embedSrc)}"/></media>`;
  }

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
function reverseInlineMarkup(
  text,
  equations,
  inlineMedia = [],
  inlineTables = [],
  inlineAttrs = null,
  blockEquationIds = null,
  blockMediaIds = null
) {
  let result = text;

  // Detect if this segment was API-translated by looking for new-format markers.
  // API segments use {{i}}, {{b}}, {{term}}, {{fn}}, [[sub:]], [[sup:]] — so legacy
  // patterns (*text*, ~text~, ^text^) would be false positives from translated content.
  const hasApiMarkers =
    /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:/.test(text);

  // Remove backslash escapes from MT (e.g., \[\[MATH:1\]\] → [[MATH:1]])
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');

  // Remove backslash escapes from emphasis markers (e.g., \*text\* → *text*)
  result = result.replace(/\\\*/g, '*');

  // Restore newline and space placeholders to CNXML
  result = result.replace(/\[\[BR\]\]/g, '<newline/>');
  result = result.replace(/\[\[SPACE(?::(\d+))?\]\]/g, (match, count) => {
    return count && parseInt(count, 10) > 1 ? `<space count="${count}"/>` : '<space/>';
  });

  // Restore math placeholders (with equation wrappers if present)
  result = result.replace(/\[\[MATH:(\d+)\]\]/g, (match, num) => {
    const mathId = `math-${num}`;
    if (equations[mathId]) {
      const eq = equations[mathId];
      // Skip entirely if this equation is already handled as a block-level element
      // by buildEquation() — otherwise we'd produce a duplicate <equation>+<m:math>.
      if (eq.equationId && blockEquationIds && blockEquationIds.has(eq.equationId)) {
        return '';
      }
      // Wrap in <equation> if the original had one (equationId stored during extraction)
      if (eq.equationId) {
        const classAttr = eq.equationClass ? ` class="${eq.equationClass}"` : '';
        return `<equation id="${eq.equationId}"${classAttr}>${eq.mathml}</equation>`;
      }
      return eq.mathml;
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
      // OC-E Layer 2: suppress if this media is a list-item block child re-emitted
      // in place by buildList (avoid a duplicate <media>).
      if (media.id && blockMediaIds && blockMediaIds.has(media.id)) {
        return '';
      }
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

  // ── Bracket markers: innermost-first resolution ───────────────────
  // Nested bracket markers like [[sup:[[i:x]]−1]] and [[i:[[sub:p]]]]
  // require processing from the inside out. Each iteration converts
  // leaf-level markers — those whose content has no [[ or ]] sequences.
  // Single brackets are allowed (e.g., chemical notation [NO], [O₃]).
  // After conversion, outer markers become leaf-level for the next iteration.
  // Resolve leaf-level emphasis/sub/sup markers to a fixpoint, innermost-first.
  // Called again after link conversion so [[i:[[link:…]]]] (emphasis wrapping a
  // link) resolves once the inner link becomes a leaf (F5).
  function resolveBracketEmphasis(s) {
    let changed = true;
    while (changed) {
      const before = s;

      // Leaf-level emphasis: [[i:text]] and [[b:text]] where text has no [[ or ]]
      s = s.replace(
        /\[\[i:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g,
        '<emphasis effect="italics">$1</emphasis>'
      );
      s = s.replace(
        /\[\[b:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g,
        '<emphasis effect="bold">$1</emphasis>'
      );

      // Leaf-level sub/sup: [[sub:content]] and [[sup:content]] where content has no [[ or ]].
      // Inner legacy {{i}}/{{b}} handled for backward compat with older segments.
      s = s.replace(/\[\[sub:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, (match, content) => {
        const inner = content
          .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
          .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
        return `<sub>${inner}</sub>`;
      });
      s = s.replace(/\[\[sup:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, (match, content) => {
        const inner = content
          .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '<emphasis effect="bold">$1</emphasis>')
          .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '<emphasis effect="italics">$1</emphasis>');
        return `<sup>${inner}</sup>`;
      });

      changed = s !== before;
    }
    return s;
  }

  result = resolveBracketEmphasis(result);

  // Restore API-safe {{i}}text{{/i}} and {{b}}text{{/b}} emphasis markers to CNXML.
  // Legacy paired marker format — kept for backward compatibility.
  // (Runs after bracket loop since bracket content may contain legacy markers)
  result = result.replace(
    /\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g,
    '<emphasis effect="bold">$1</emphasis>'
  );
  result = result.replace(
    /\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g,
    '<emphasis effect="italics">$1</emphasis>'
  );

  // Handle hybrid {{i:text}} format — API occasionally converts [[brackets]]
  // to {{braces}}. Same self-contained pattern, different delimiters.
  result = result.replace(/\{\{i:([^}]+)\}\}/g, '<emphasis effect="italics">$1</emphasis>');
  result = result.replace(/\{\{b:([^}]+)\}\}/g, '<emphasis effect="bold">$1</emphasis>');

  // IMPORTANT: Extract MathML blocks before applying term wrapping to prevent
  // term markers from being applied inside MathML (which causes malformed XML)
  const mathBlocks = [];
  result = result.replace(/<m:math>[\s\S]*?<\/m:math>/g, (match) => {
    mathBlocks.push(match);
    return `{{MATHBLOCK:${mathBlocks.length - 1}}}`;
  });

  // Convert ++text++ underline markers — used by current extraction for ALL segments
  // (underline has no API-safe {{u}} variant, so ++text++ is always the format)
  result = result.replace(/\+\+(.+?)\+\+/g, '<emphasis effect="underline">$1</emphasis>');

  // BACKWARD COMPAT: Legacy patterns only for non-API segments.
  // API segments use {{i}}/{{b}}/[[sub:]]/[[sup:]] — legacy *text*, ~text~, ^text^
  // would create false-positive markup from translated content (chemical formulas, etc.)
  if (!hasApiMarkers) {
    // Convert legacy combined sub/sup + emphasis patterns.
    // Old extraction used ~*t*~ for <sub><emphasis>t</emphasis></sub>.
    // Bold variants first (** before *) to avoid partial matching.
    result = result.replace(
      /~\*\*([^*~]+)\*\*~/g,
      '<sub><emphasis effect="bold">$1</emphasis></sub>'
    );
    result = result.replace(
      /~\*([^*~]+)\*~/g,
      '<sub><emphasis effect="italics">$1</emphasis></sub>'
    );
    result = result.replace(
      /\^\*\*([^*^]+)\*\*\^/g,
      '<sup><emphasis effect="bold">$1</emphasis></sup>'
    );
    result = result.replace(
      /\^\*([^*^]+)\*\^/g,
      '<sup><emphasis effect="italics">$1</emphasis></sup>'
    );

    // Convert legacy markdown emphasis markers to CNXML
    result = result.replace(/\*\*([^*]+)\*\*/g, '<emphasis effect="bold">$1</emphasis>');
    result = result.replace(/\*([^*]+)\*/g, '<emphasis effect="italics">$1</emphasis>');
  }

  // Convert class-only emphasis markers {=text=} back to CNXML
  // Restore class from sidecar by occurrence index
  if (inlineAttrs && inlineAttrs.emphases) {
    let emphasisIndex = 0;
    result = result.replace(/\{=(.+?)=\}/g, (match, inner) => {
      const attrs = inlineAttrs.emphases[emphasisIndex] || null;
      emphasisIndex++;
      if (attrs && attrs.class) {
        return `<emphasis class="${attrs.class}">${inner}</emphasis>`;
      }
      return `<emphasis>${inner}</emphasis>`;
    });
  } else {
    // No sidecar — convert to plain emphasis
    result = result.replace(/\{=(.+?)=\}/g, '<emphasis>$1</emphasis>');
  }

  // API-safe term markers: {{term}}text{{/term}} → <term>text</term>
  // Must come BEFORE legacy __term__ handler so new format takes priority
  result = result.replace(/\{\{term\}\}([\s\S]*?)\{\{\/term\}\}/g, '<term>$1</term>');

  // BACKWARD COMPAT: Convert legacy term markers back to CNXML (non-API only).
  // API segments use {{term}} (already converted above); any remaining __text__
  // would be false positives from translated content.
  if (!hasApiMarkers) {
    // Handle both normal (__term__) and MT-escaped (\_\_term\_\_) markers
    result = result.replace(/\\_\\_([^_]+)\\_\\_/g, '<term>$1</term>');
    result = result.replace(/__([^_]+)__/g, '<term>$1</term>');
  }

  // Restore MathML blocks after term wrapping
  result = result.replace(/\{\{MATHBLOCK:(\d+)\}\}/g, (match, index) => {
    return mathBlocks[parseInt(index)];
  });

  // Restore sup/sub inside terms — handle both new [[sub:...]] and legacy ~..~ formats
  result = result.replace(/<term>([\s\S]*?)<\/term>/g, (match, inner) => {
    const restored = inner
      .replace(/\[\[sub:([^\]]+)\]\]/g, '<sub>$1</sub>')
      .replace(/\[\[sup:([^\]]+)\]\]/g, '<sup>$1</sup>')
      .replace(/\^([^^]{1,15})\^/g, '<sup>$1</sup>')
      .replace(/~([^~]{1,15})~/g, '<sub>$1</sub>');
    return `<term>${restored}</term>`;
  });

  // API-safe bracket link formats — unambiguous, no false positives
  // [[xref:target-id]] or [[xref:text|target-id]]
  result = result.replace(/\[\[xref:([^\]|]+)\|([^\]]+)\]\]/g, '<link target-id="$2">$1</link>');
  result = result.replace(/\[\[xref:([^\]]+)\]\]/g, '<link target-id="$1"/>');

  // [[docref:doc#target]] or [[docref:text|doc#target]] or [[docref:text|doc]]
  result = result.replace(
    /\[\[docref:([^\]|]+)\|([^\]#]+)#([^\]]+)\]\]/g,
    '<link document="$2" target-id="$3">$1</link>'
  );
  result = result.replace(/\[\[docref:([^\]|]+)\|([^\]]+)\]\]/g, '<link document="$2">$1</link>');
  result = result.replace(
    /\[\[docref:([^\]#]+)#([^\]]+)\]\]/g,
    '<link document="$1" target-id="$2"/>'
  );
  result = result.replace(/\[\[docref:([^\]]+)\]\]/g, '<link document="$1"/>');

  // [[link:text|url]]
  result = result.replace(/\[\[link:([^\]|]+)\|([^\]]+)\]\]/g, '<link url="$2">$1</link>');

  // F5: an emphasis marker that wrapped a link (e.g. [[i:[[link:…]]]]) is only now
  // leaf-level (its inner link became a <link>). Re-resolve emphasis to catch it.
  result = resolveBracketEmphasis(result);

  // BACKWARD COMPAT: Legacy link formats (for segments not yet re-translated)
  // Self-closing document cross-references (e.g., [m68674#fs-idm81346144])
  result = result.replace(/\[(m\d+)#([^\]]+)\]/g, '<link document="$1" target-id="$2"/>');

  // Self-closing document links without target-id (e.g., [doc:m68860])
  result = result.replace(/\[doc:(m\d+)\]/g, '<link document="$1"/>');

  // Self-closing cross-references (e.g., [#CNX_Chem_05_02_Fig])
  result = result.replace(/\[#([A-Za-z_][\w.-]+)\]/g, '<link target-id="$1"/>');

  // Links with text — only match valid reference patterns
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    if (url.startsWith('doc:m')) {
      return `<link document="${url.substring(4)}">${linkText}</link>`;
    } else if (url.startsWith('#') && /^#[A-Za-z_][\w.-]+$/.test(url)) {
      return `<link target-id="${url.substring(1)}">${linkText}</link>`;
    } else if (/^m\d+#/.test(url)) {
      const [doc, target] = url.split('#');
      return `<link document="${doc}" target-id="${target}">${linkText}</link>`;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      return `<link url="${url}">${linkText}</link>`;
    }
    return match;
  });

  // Convert legacy sub/sup back — only for non-API segments.
  // API segments already use [[sub:]] and [[sup:]] (converted above).
  if (!hasApiMarkers) {
    // First handle isotope notations: space + ^number^ + letter (e.g., " ^14^C")
    result = result.replace(/\s\^([0-9]+)\^([A-Z][a-z]?)/g, ' <sup>$1</sup>$2');

    // General sub/sup that are part of words
    // Requires non-whitespace before tilde/caret and no whitespace in capture
    result = result.replace(/(?<=[^\s~])~([^\s~]{1,15})~/g, '<sub>$1</sub>');
    result = result.replace(/(?<=[^\s^])\^([^\s^]{1,15})\^/g, '<sup>$1</sup>');
  }

  // API-safe footnote markers: {{fn}}text{{/fn}} → <footnote>text</footnote>
  // Must come BEFORE legacy [footnote:] handler so new format takes priority
  result = result.replace(/\{\{fn\}\}([\s\S]*?)\{\{\/fn\}\}/g, '<footnote>$1</footnote>');

  // BACKWARD COMPAT: Convert legacy footnotes back — handle both English and MT-translated Icelandic
  // Use lazy [\s\S]+? with lookahead to handle footnotes containing ] (e.g., math placeholders)
  result = result.replace(
    / \[(?:footnote|neðanmálsgrein): ([\s\S]+?)\](?=\s|$|[.,;:<\[])/g,
    '<footnote>$1</footnote>'
  );

  // Restore inline attributes from sidecar metadata (term class, footnote id, etc.)
  if (inlineAttrs) {
    // Restore term attributes by occurrence index
    if (inlineAttrs.terms) {
      let termIndex = 0;
      result = result.replace(/<term>/g, () => {
        const attrs = inlineAttrs.terms[termIndex] || null;
        termIndex++;
        if (attrs) {
          const parts = ['<term'];
          if (attrs.class) parts.push(` class="${attrs.class}"`);
          if (attrs.id) parts.push(` id="${attrs.id}"`);
          parts.push('>');
          return parts.join('');
        }
        return '<term>';
      });
    }
    // Restore footnote attributes by occurrence index
    if (inlineAttrs.footnotes) {
      let footnoteIndex = 0;
      result = result.replace(/<footnote>/g, () => {
        const attrs = inlineAttrs.footnotes[footnoteIndex] || null;
        footnoteIndex++;
        if (attrs && attrs.id) {
          return `<footnote id="${attrs.id}">`;
        }
        return '<footnote>';
      });
    }
  }

  // Safely escape XML entities: protect known-good CNXML tags with placeholders,
  // escape ALL remaining < and &, then restore the placeholders.
  // This prevents user-typed HTML (e.g. <script>, <div>) from passing through unescaped.
  const cnxmlTags = [];
  result = result.replace(
    /<(\/?)(term|emphasis|sup|sub|newline|space|footnote|link|equation|media|image|m:math|m:[a-z]+)([\s>\/])/g,
    (match) => {
      cnxmlTags.push(match);
      return `\x00CNXML:${cnxmlTags.length - 1}\x00`;
    }
  );
  // Also protect self-closing tags like <newline/>, <space/>, <link ... />, <iframe ... />
  result = result.replace(/<(newline|space|link|image|iframe)\s[^>]*\/>/g, (match) => {
    cnxmlTags.push(match);
    return `\x00CNXML:${cnxmlTags.length - 1}\x00`;
  });
  // Protect full MathML blocks (already restored from placeholders above)
  result = result.replace(/<m:math>[\s\S]*?<\/m:math>/g, (match) => {
    cnxmlTags.push(match);
    return `\x00CNXML:${cnxmlTags.length - 1}\x00`;
  });

  // Now safely escape ALL remaining < and &
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/</g, '&lt;');

  // Restore CNXML tags
  result = result.replace(/\x00CNXML:(\d+)\x00/g, (_, i) => cnxmlTags[parseInt(i)]);

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

/**
 * Recursively collect equation IDs from block-level elements in the structure tree.
 * These are equations handled by buildEquation() from the original CNXML — if the
 * same equationId appears in a [[MATH:N]] placeholder, reverseInlineMarkup() should
 * NOT wrap it in an <equation> tag (to avoid duplication).
 *
 * IMPORTANT: We do NOT recurse into examples or exercises because their equations
 * are preserved from the original CNXML by buildExample()/buildExercise() — they
 * are never built separately by buildEquation(). The [[MATH:N]] placeholders inside
 * example/exercise paragraphs should still produce equation wrappers.
 */
function collectBlockEquationIds(elements, idSet) {
  for (const el of elements) {
    if (el.type === 'equation' && el.id) {
      idSet.add(el.id);
    }
    // Recurse into sections and notes, but NOT examples/exercises
    // (their equations are handled by original CNXML extraction, not buildEquation)
    if (el.type === 'example' || el.type === 'exercise') {
      continue;
    }
    // List-item block children (OC-E Layer 2): a leading-<para> item's trailing
    // block <equation> is re-emitted in place by buildList, so its in-item
    // [[MATH:N]] placeholder must be suppressed to avoid a duplicate.
    for (const item of el.items || []) {
      for (const bc of item.blockChildren || []) {
        if (bc.type === 'equation' && bc.id) idSet.add(bc.id);
      }
      for (const child of item.children || []) collectBlockEquationIds([child], idSet);
    }
    if (el.content) {
      collectBlockEquationIds(el.content, idSet);
    }
  }
}

/**
 * OC-E Layer 2 companion to collectBlockEquationIds for list-item block <media>
 * children. Their in-item [[MEDIA:N]] placeholder is suppressed in reverseInlineMarkup
 * because buildList re-emits the media element in place.
 */
function collectBlockMediaIds(elements, idSet) {
  for (const el of elements) {
    if (el.type === 'example' || el.type === 'exercise') continue;
    for (const item of el.items || []) {
      for (const bc of item.blockChildren || []) {
        if (bc.type === 'media' && bc.id) idSet.add(bc.id);
      }
      for (const child of item.children || []) collectBlockMediaIds([child], idSet);
    }
    if (el.content) collectBlockMediaIds(el.content, idSet);
  }
}

/**
 * F5/F6 gate: fail loud if any marker-form placeholder [[TYPE:…]] survived into
 * injected output. Marker-form (requires `word:`) so legit nested chemistry brackets
 * like [[Ag(NH3)2]+] are not flagged.
 *
 * Carve-outs (all case-sensitive):
 *  - [[MATH:N]] / [[MEDIA:N]] — pre-existing tolerant soft-report path (line ~1720).
 *
 * As of F4, [[TABLE:…]] is NOT carved out — it hard-fails like any other unconverted
 * marker. TABLE expansion is handled upstream by buildExerciseDom/buildExampleDom/
 * buildNoteDom, so a surviving [[TABLE:…]] here means a real inject-path miss.
 *
 * @param {string} cnxml - assembled module output
 * @param {string} moduleId
 */
function assertNoMarkerResidue(cnxml, moduleId) {
  const residue = cnxml.match(/\[\[(?!MATH:|MEDIA:)[A-Za-z][\w]*:[^\]]*\]\]/g);
  if (residue) {
    const shown = [...new Set(residue)].slice(0, 10).join(', ');
    throw new Error(
      `Marker residue in injected output for ${moduleId}: ${shown} — a [[TYPE:…]] placeholder ` +
        `was not converted. Fix the inject path before publishing.`
    );
  }
}

function buildCnxml(structure, segments, equations, originalCnxml, options = {}, inlineAttrs = {}) {
  const verbose = options.verbose || false;

  // Normalize self-closing entries in original CNXML for pattern matching.
  // Self-closing <entry align="left"/> doesn't match the <entry...>...</entry>
  // replacement regex used by buildTable().
  // Note: self-closing <para/> is NOT normalized here — it requires re-extraction
  // (Fix F in cnxml-extract.js) to align the structure.json with the normalized content.
  originalCnxml = originalCnxml.replace(/<entry([^>]*)\/>/g, '<entry$1></entry>');

  // Collect block-level equation IDs to prevent duplication in reverseInlineMarkup
  const blockEquationIds = new Set();
  collectBlockEquationIds(structure.content, blockEquationIds);
  // OC-E Layer 2: list-item block <media> children re-emitted in place by buildList —
  // suppress their in-item [[MEDIA:N]] placeholder to avoid a duplicate.
  const blockMediaIds = new Set();
  collectBlockMediaIds(structure.content, blockMediaIds);

  // Injection tracking
  const stats = {
    segmentsRequested: 0,
    segmentsFound: 0,
    segmentsMissing: [],
    mathPlaceholders: 0,
    mathResolved: 0,
    mathUnresolved: [],
    residues: [], // exact untranslated-EN (gates complete)
    residueWarnings: [], // ratio "mostly English" (non-gating)
    _residueSeen: new Set(), // de-dupe segments referenced more than once
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

    // A2: flag segments left as untranslated English. Compare the raw
    // marker-form IS text against the EN source (same marker form). Only
    // when an EN counterpart exists and we haven't already judged this id.
    const enText = options.enSegments && options.enSegments.get(segmentId);
    const checkResidue = options.checkResidue !== false; // default on when EN is present
    if (checkResidue && enText && !stats._residueSeen.has(segmentId)) {
      stats._residueSeen.add(segmentId);
      const r = detectResidue(enText, text);
      if (r.exact) {
        stats.residues.push(segmentId);
      } else if (r.warn) {
        stats.residueWarnings.push({ segmentId, ratio: Number(r.ratio.toFixed(2)) });
      }
    }

    return reverseInlineMarkup(
      text,
      equations,
      structure.inlineMedia || [],
      structure.inlineTables || [],
      inlineAttrs[segmentId] || null,
      blockEquationIds,
      blockMediaIds
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

    // Replace md:title with translated document title
    const translatedTitle = getSeg(structure.title?.segmentId) || structure.title?.text;
    if (translatedTitle) {
      translatedMetadata = translatedMetadata.replace(
        /<md:title>[^<]*<\/md:title>/,
        `<md:title>${translatedTitle}</md:title>`
      );
    }

    lines.push(translatedMetadata);
  }

  // Build content
  lines.push('');
  lines.push('<content>');

  // Build context for tracking figures handled inside notes/examples (to avoid duplicates)
  const figureCaptions = {};
  collectFigureCaptions(structure.content, figureCaptions);
  const figuresHandledInNotes = new Set();
  const figuresHandledInContainers = new Set();
  const tablesHandledInContainers = new Set();
  const ctx = {
    figureCaptions,
    figuresHandledInNotes,
    figuresHandledInContainers,
    tablesHandledInContainers,
    inlineMedia: structure.inlineMedia || [],
    inlineTables: structure.inlineTables || [],
    imageMapping: options.imageMapping || new Map(),
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

    // Build map of original glossary term markup for restoring emphasis/sub/sup.
    // The extraction strips inline markup from glossary terms; this recovers it
    // from the original CNXML so translated terms have matching tag counts.
    const originalGlossaryTerms = new Map();
    const originalGlossary = extractGlossary(originalCnxml);
    for (const g of originalGlossary) {
      if (g.rawTerm) originalGlossaryTerms.set(g.id, g.rawTerm);
    }

    lines.push('<glossary>');
    for (const item of structure.glossary.items) {
      const termText = getSeg(item.termSegmentId);
      const defText = getSeg(item.definitionSegmentId);
      if (termText && defText) {
        // Restore inline markup (emphasis, sub, sup) from original glossary term.
        // Mathematical variables (q, C, m, v) are preserved in translation,
        // so matching by text content is reliable.
        let annotatedTerm = restoreGlossaryTermMarkup(termText, originalGlossaryTerms.get(item.id));
        if (annotateEn && enSegments && item.termSegmentId) {
          const enTermRaw = enSegments.get(item.termSegmentId);
          if (enTermRaw) {
            // Strip markers from EN glossary term text to plain text for annotations.
            // Same rationale as annotateInlineTerms(): annotations are reference hints,
            // not structural content, so they shouldn't add CNXML tags.
            const enTerm = enTermRaw
              .replace(/__([^_]+)__/g, '$1')
              .replace(/\{\{term\}\}([\s\S]*?)\{\{\/term\}\}/g, '$1')
              .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
              .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
              .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
              .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
              .replace(/\[\[[A-Za-z][\w]*:[^\]]*\]\]/g, '') // F6: drop remaining placeholder
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

  let output = lines.join('\n');

  // Deduplicate media elements at the document level.
  // Examples/exercises preserve original CNXML (with inline media), and the
  // structure tree may also emit standalone media blocks for the same IDs.
  output = deduplicateMedia(output);

  // F5/F6 gate: no [[TYPE:…]] marker residue may reach output (fail loud).
  // Marker-residue gate: any unconverted [[TYPE:…]] (incl. [[TABLE:]]) hard-fails. (F4)
  assertNoMarkerResidue(output, structure.moduleId);

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
    residues: stats.residues.slice().sort(),
    residueWarnings: stats.residueWarnings,
    complete:
      stats.segmentsMissing.length === 0 &&
      stats.mathUnresolved.length === 0 &&
      stats.residues.length === 0,
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
      if (ctx && ctx.tablesHandledInContainers && ctx.tablesHandledInContainers.has(element.id)) {
        return null;
      }
      return buildTable(element, getSeg, originalCnxml);
    case 'example':
      return buildExampleDom(element, getSeg, equations, originalCnxml, ctx);
    case 'exercise':
      return buildExerciseDom(element, getSeg, equations, originalCnxml, ctx);
    case 'note':
      return buildNoteDom(element, getSeg, equations, originalCnxml, ctx);
    case 'equation':
      return buildEquation(element, equations, originalCnxml);
    case 'list':
      return buildList(element, getSeg, equations, ctx);
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

  // Skip figures kept inside examples/exercises (same pattern as notes)
  if (ctx && ctx.figuresHandledInContainers && ctx.figuresHandledInContainers.has(element.id)) {
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

      // Swap image src with translated variant if available
      const imageMapping = ctx && ctx.imageMapping;
      if (imageMapping && imageMapping.has(element.id)) {
        figureCnxml = figureCnxml.replace(
          /<image([^>]*)\ssrc="([^"]*)"([^>]*)\/>/,
          (imgMatch, before, origSrc, after) => {
            const { src: newSrc, mimeType } = resolveTranslatedImage(
              origSrc,
              element.id,
              imageMapping
            );
            // Also update mime-type if it changed
            let updated = `<image${before} src="${newSrc}"${after}/>`;
            if (mimeType) {
              updated = updated.replace(/mime-type="[^"]*"/, `mime-type="${mimeType}"`);
            }
            return updated;
          }
        );
      }

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
      const imageMapping = ctx && ctx.imageMapping;
      const { src: imageSrc, mimeType: resolvedMime } = resolveTranslatedImage(
        element.media.src,
        element.id,
        imageMapping
      );
      const mimeType = resolvedMime || element.media.mimeType || 'image/jpeg';
      lines.push(`<image mime-type="${mimeType}" src="${imageSrc}"/>`);
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

      // Expand self-closing <entry.../> to <entry...></entry> so the
      // replacement regex can match all entries and cellIdx stays aligned.
      // Without this, <entry align="left"/> gets mismatched by the regex
      // (the / becomes part of attributes), consuming the NEXT entry's
      // </entry> and causing cell misalignment + content duplication.
      tableCnxml = tableCnxml.replace(/<entry([^>]*?)\/>/g, '<entry$1></entry>');

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
              (entryMatch, entryAttrs, entryContent) => {
                const cell = row.cells && row.cells[cellIdx];
                if (cell && cell.paras) {
                  // Multi-para cell: replace each <para> content individually
                  let newContent = entryContent;
                  for (const paraInfo of cell.paras) {
                    const paraText = getSeg(paraInfo.segmentId);
                    if (paraText && paraInfo.paraId) {
                      // Replace para content by matching its ID
                      const paraPattern = new RegExp(
                        `(<para\\s+id="${paraInfo.paraId}"[^>]*>)[\\s\\S]*?(</para>)`
                      );
                      newContent = newContent.replace(paraPattern, `$1${paraText}$2`);
                    }
                  }
                  cellIdx++;
                  return `<entry${entryAttrs}>${newContent}</entry>`;
                } else if (cell && cell.segmentId) {
                  const cellText = getSeg(cell.segmentId);
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
 * Expand [[TABLE:id]] placeholders in a para's translated text into full <table>
 * markup, recording each expanded id so the container's post-strip pass keeps it.
 * Mirrors buildPara's inline-table restoration (cnxml-inject.js ~1853). (F4)
 * @param {string} text - translated para text possibly containing [[TABLE:id]]
 * @param {object} ctx - inject context; ctx.inlineTables = [{ tableId, structure }]
 * @param {Function} getSeg - segment resolver
 * @param {string} originalCnxml - original module CNXML (buildTable dependency)
 * @param {Set<string>} keptTableIds - mutated: ids that were expanded inline
 * @returns {string} text with known [[TABLE:id]] replaced by <table> markup
 */
function expandInlineTables(text, ctx, getSeg, originalCnxml, keptTableIds) {
  if (!text || !ctx || !ctx.inlineTables) return text;
  return text.replace(/\[\[TABLE:([^\]]+)\]\]/g, (match, tableId) => {
    const tableData = ctx.inlineTables.find((t) => t.tableId === tableId);
    if (tableData && tableData.structure) {
      keptTableIds.add(tableId);
      return buildTable(tableData.structure, getSeg, originalCnxml);
    }
    return match; // unknown id → leave placeholder; the gate will catch it
  });
}

/**
 * Remove every <table> descendant of parentElement whose id is NOT in keptTableIds.
 * Mirrors the keep-unless-kept figure loop (cnxml-inject.js ~2727). (F4)
 *
 * Invariant (F4 review fix): a table whose id is in inlineTableIds was
 * inline-referenced by extraction (a `[[TABLE:id]]` placeholder exists in some
 * para's segment). Such a table must never be stripped unless it was actually
 * expanded (i.e. its id is in keptTableIds) — if its containing para's
 * translation was empty/missing, `expandInlineTables` never ran for it, so
 * stripping it here would silently delete the table with no `[[TABLE:]]`
 * residue for `assertNoMarkerResidue` to catch. Fail loud instead of
 * publishing a silently-vanished table.
 * @param {Element} parentElement
 * @param {Set<string>} keptTableIds
 * @param {Set<string>} [inlineTableIds] - ids extraction inline-referenced via [[TABLE:id]]
 */
function removeTablesExceptKept(parentElement, keptTableIds, inlineTableIds = new Set()) {
  const tables = Array.from(parentElement.getElementsByTagName('table'));
  for (const table of tables) {
    const id = table.getAttribute('id');
    if (keptTableIds.has(id)) continue;
    if (inlineTableIds.has(id)) {
      const containerId = parentElement.getAttribute('id') || '(unknown)';
      throw new Error(
        `removeTablesExceptKept: table id="${id}" inside <${parentElement.nodeName} id="${containerId}"> was inline-referenced ([[TABLE:${id}]]) by extraction but never expanded — its containing para's translation was likely empty/missing, so expandInlineTables never ran. Refusing to silently strip the table (would delete it from the published output with no [[TABLE:]] residue for assertNoMarkerResidue to catch). Fix the missing translation for that para, or investigate why the table wasn't expanded.`
      );
    }
    table.parentNode.removeChild(table);
  }
}

/**
 * Remove the pre-existing untranslated <table> node(s) from paraElement whose id
 * was just re-expanded (added to keptTableIds by expandInlineTables during this
 * call). CNXML nests container-embedded tables as a block child of the para
 * (same shape as figures), and replaceParaContent deliberately preserves block
 * children — so without this, the stale original survives alongside the newly
 * built translated <table> string inserted as inline content. (F4)
 * @param {Element} paraElement
 * @param {Set<string>} keptTableIds - ids kept after this para's expansion
 * @param {Set<string>} idsBefore - snapshot of keptTableIds before this para's expansion
 */
function removeStaleExpandedTables(paraElement, keptTableIds, idsBefore) {
  const tables = Array.from(paraElement.getElementsByTagName('table'));
  for (const table of tables) {
    const id = table.getAttribute('id');
    if (id && keptTableIds.has(id) && !idsBefore.has(id)) {
      table.parentNode.removeChild(table);
    }
  }
}

/**
 * Check if a list in the CNXML contains any already-replaced para IDs.
 * Used to prevent replaceListItems from overwriting paras that were
 * already individually translated in buildExample/buildExercise.
 *
 * Root cause: when a list's <item> elements contain <para> children,
 * the para-replacement pass (step 1) translates them individually.
 * If replaceListItems then replaces the entire <item> content (step 2),
 * it overwrites the already-translated paras with flat text, destroying
 * the <para> wrappers and their translated content.
 */
function listContainsReplacedParas(cnxml, listElement, replacedParaIds) {
  if (!listElement || !listElement.id || replacedParaIds.size === 0) return false;

  // Find the list's content in the CNXML
  const listPattern = new RegExp(`<list\\s+id="${listElement.id}"[^>]*>[\\s\\S]*?</list>`);
  const match = listPattern.exec(cnxml);
  if (!match) return false;

  const listContent = match[0];
  for (const paraId of replacedParaIds) {
    if (listContent.includes(`id="${paraId}"`)) {
      return true;
    }
  }
  return false;
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
          // If the original item wraps content in a <para>, preserve that wrapper.
          // (paras inside list items are extracted as item segments, not standalone
          // para segments, but the <para> element must remain in the CNXML.)
          const paraWrapMatch = originalItem.match(
            /^<item[^>]*>\s*(<para[^>]*>)[\s\S]*?<\/para>\s*<\/item>$/
          );
          if (paraWrapMatch) {
            const paraOpenTag = paraWrapMatch[1];
            return `<item${itemIdAttr}>${paraOpenTag}${translatedText}</para></item>`;
          }
          return `<item${itemIdAttr}>${translatedText}</item>`;
        }
      }
    }
    return originalItem;
  });

  return cnxml.replace(listPattern, `${listMatch[1]}${listContent}${listMatch[3]}`);
}

/**
 * Replace a para's text content while preserving nested block elements.
 *
 * The non-greedy regex `<para id="X">[\s\S]*?</para>` stops at the first
 * inner `</para>` when a para contains nested lists/equations with inner paras.
 * This function uses depth-aware matching to find the full outer para, then
 * replaces only the text portion (before nested block elements) while keeping
 * nested lists, equations, figures, etc. intact.
 *
 * @param {string} cnxml - CNXML content
 * @param {string} paraId - ID of the para to replace
 * @param {string} newText - New text content (already processed through reverseInlineMarkup)
 * @param {string} titleElement - Title CNXML to insert (e.g., `<title>...</title>` or '')
 * @param {string[]} stripFromNested - Tag names to strip from preserved nested content
 *   (elements that were extracted as sibling structure entries, e.g., equations)
 * @returns {string} Modified CNXML, or original if para not found
 */
function replaceParaPreservingNested(cnxml, paraId, newText, titleElement, stripFromNested = []) {
  const openPattern = new RegExp(`<para\\s+id="${paraId}"[^>]*>`);
  const openMatch = openPattern.exec(cnxml);
  if (!openMatch) return cnxml;

  const paraStart = openMatch.index;
  const openEnd = paraStart + openMatch[0].length;

  // Find the matching </para> with depth tracking
  let depth = 1;
  let pos = openEnd;
  let closeStart = -1;
  while (depth > 0 && pos < cnxml.length) {
    const nextOpen = cnxml.indexOf('<para', pos);
    const nextClose = cnxml.indexOf('</para>', pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 5;
    } else {
      depth--;
      if (depth === 0) {
        closeStart = nextClose;
      }
      pos = nextClose + 7;
    }
  }

  if (closeStart === -1) return cnxml; // Couldn't find matching close

  const innerContent = cnxml.substring(openEnd, closeStart);

  // Only activate when the para contains a nested <para> — this is the specific
  // condition that breaks the non-greedy regex (it stops at the inner </para>).
  // For paras with other nested block elements but no inner paras, the non-greedy
  // regex works fine and produces better results.
  if (!/<para\s/.test(innerContent)) {
    return cnxml; // Signal to caller to use the fallback regex
  }

  // Find the first nested block element (list, equation, figure, table, note)
  const firstBlockMatch = innerContent.match(
    /^([\s\S]*?)(<(?:list|equation|figure|table|note|media)\s)/
  );

  if (!firstBlockMatch) {
    // No nested block elements — replace entirely (same as current behavior)
    return cnxml.substring(0, openEnd) + titleElement + newText + cnxml.substring(closeStart);
  }

  // Replace only the text before the first block element, keep blocks intact
  let blocksAndAfter = innerContent.substring(firstBlockMatch[1].length);

  // Strip elements from the preserved nested content that were extracted as
  // sibling structure entries (they'll be output separately by the build pipeline).
  // Without this, equations/figures/tables inside the preserved list would be
  // duplicated — once from the preserved content and once from buildEquation() etc.
  if (stripFromNested.length > 0) {
    blocksAndAfter = stripNestedElements(blocksAndAfter, stripFromNested);
  }

  return (
    cnxml.substring(0, openEnd) +
    titleElement +
    newText +
    '\n' +
    blocksAndAfter +
    cnxml.substring(closeStart)
  );
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
      const replacedParaIds = new Set();
      for (const child of element.content || []) {
        if (child.type === 'para' && child.id) {
          const paraText = child.segmentId ? getSeg(child.segmentId) : '';

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

          // Collect sibling element types that the extraction pulled out of this
          // para as separate structure entries (equations, figures, tables).
          // These need to be stripped from preserved nested content to avoid
          // duplication with their standalone build outputs.
          const siblingBlockTypes = new Set();
          for (const sibling of element.content || []) {
            if (sibling !== child && sibling.type) {
              siblingBlockTypes.add(sibling.type);
            }
          }
          // Map structure types to CNXML tag names
          const stripTags = [...siblingBlockTypes].filter((t) =>
            ['equation', 'figure', 'table'].includes(t)
          );

          // Try nested-preserving replacement first: if the para contains nested
          // block elements (lists, equations), replace only the text portion while
          // keeping nested content intact. Falls back to non-greedy regex for
          // simple paras (which is equivalent and slightly faster).
          const preserved = replaceParaPreservingNested(
            exampleCnxml,
            child.id,
            paraText,
            titleElement,
            stripTags
          );
          if (preserved !== exampleCnxml) {
            exampleCnxml = preserved;
          } else {
            // Fallback: non-greedy regex for paras not matched by depth-aware method
            const paraPattern = new RegExp(
              `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
              'g'
            );
            exampleCnxml = exampleCnxml.replace(
              paraPattern,
              `<para id="${child.id}">${titleElement}${paraText}</para>`
            );
          }
          replacedParaIds.add(child.id);

          isFirstPara = false;
        }
        // Replace list items — but skip if the list contains paras already
        // replaced above (they'd be overwritten with flat text, losing <para> wrappers)
        if (child.type === 'list') {
          if (!listContainsReplacedParas(exampleCnxml, child, replacedParaIds)) {
            exampleCnxml = replaceListItems(exampleCnxml, child, getSeg);
          }
        }
      }

      // Note: We do NOT strip equations - they should pass through unchanged.
      // Strip figures (handled by buildFigure) and tables (handled by buildTable
      // from the structure tree — keeping them here would produce duplicates).
      exampleCnxml = stripNestedElements(exampleCnxml, ['figure', 'table']);

      // Remove duplicate media elements — the original CNXML has media inside
      // items/paras, and the translated segments may also generate media from
      // [[MEDIA:N]] markers, producing two copies with the same ID.
      exampleCnxml = deduplicateMedia(exampleCnxml);

      return exampleCnxml;
    }
  }

  return buildGenericElement('example', element, getSeg, equations, originalCnxml);
}

/**
 * DOM-based shadow of buildExample.
 * Same signature, same behavior, but uses DOM manipulation instead of regex.
 * Comparison-tested against the regex version before deployment.
 */
function buildExampleDom(element, getSeg, equations, originalCnxml, ctx) {
  if (!element.id) {
    return buildGenericElement('example', element, getSeg, equations, originalCnxml);
  }

  // Step 1: Extract example from original CNXML (same regex as buildExample)
  const examplePattern = new RegExp(
    `<example\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/example>`,
    'g'
  );
  const match = examplePattern.exec(originalCnxml);
  if (!match) {
    return buildGenericElement('example', element, getSeg, equations, originalCnxml);
  }

  // Step 2: Parse into DOM
  const { doc } = parseCnxmlFragment(match[0]);
  const exampleEl = doc.getElementById(element.id);
  if (!exampleEl) return match[0]; // fallback

  // Step 3: Replace para content and list items via DOM.
  // Track replaced para IDs: if a list contains an already-replaced para,
  // skip list-item replacement to avoid destroying the para content
  // (paras are not block-level in the DOM util, so replaceListItems would remove them).
  const replacedParaIds = new Set();

  // Detect paras that contain <figure> elements in the DOM. These figures were
  // extracted as [[MEDIA:N]] placeholders during extraction AND as top-level
  // structure entries. To avoid duplication, we keep the figure in the DOM and
  // strip the expanded <media> from the segment text before injection.
  const keptFigureIds = new Set();
  const keptTableIds = new Set();
  const parasWithFigures = new Map(); // paraId → Set of figure IDs

  for (const child of element.content || []) {
    if (child.type !== 'para' || !child.id || !child.segmentId) continue;
    const paraEl = doc.getElementById(child.id);
    if (!paraEl) continue;
    const figures = paraEl.getElementsByTagName('figure');
    if (figures.length === 0) continue;

    const figIds = new Set();
    for (let i = 0; i < figures.length; i++) {
      const figId = figures[i].getAttribute('id');
      if (figId) {
        figIds.add(figId);
        keptFigureIds.add(figId);
      }
    }
    if (figIds.size > 0) parasWithFigures.set(child.id, figIds);
  }

  let isFirstPara = true;

  for (const child of element.content || []) {
    if (child.type === 'para' && child.id) {
      const paraEl = doc.getElementById(child.id);
      if (!paraEl) {
        isFirstPara = false;
        continue;
      }

      // For paras that contain figures: strip expanded <media> from segment text
      // so the figure (already in the DOM) isn't duplicated. If the para is
      // media-only (no other text), skip text injection entirely.
      if (parasWithFigures.has(child.id)) {
        const paraText = child.segmentId ? getSeg(child.segmentId) : '';
        // Strip expanded <media>...</media> from segment text
        const textWithoutMedia = paraText.replace(/<media\s[^>]*>[\s\S]*?<\/media>/g, '').trim();

        let titleText = '';
        if (isFirstPara && element.title?.segmentId) {
          titleText = getSeg(element.title.segmentId) || '';
        } else if (child.title?.segmentId) {
          titleText = getSeg(child.title.segmentId) || child.title.text || '';
        }
        const titleCnxml = titleText ? `<title>${titleText}</title>` : '';
        const idsBefore = new Set(keptTableIds);
        const expandedText = expandInlineTables(
          textWithoutMedia,
          ctx,
          getSeg,
          originalCnxml,
          keptTableIds
        );
        removeStaleExpandedTables(paraEl, keptTableIds, idsBefore);
        replaceParaContentDom(doc, paraEl, expandedText, titleCnxml);
        replacedParaIds.add(child.id);
        isFirstPara = false;
        continue;
      }

      const paraText = child.segmentId ? getSeg(child.segmentId) : '';

      // Check if this para contains a sibling list whose content is already
      // included in the para's segment (the extraction flattens nested lists
      // into the para text). Preserve the list for the list handler — only
      // inject the title. (audit #33: unified via paraHasFlattenedList)
      const skipParaText = paraHasFlattenedList(child, paraEl, element.content, paraText, doc);

      let titleText = '';
      if (isFirstPara && element.title?.segmentId) {
        titleText = getSeg(element.title.segmentId) || '';
      } else if (child.title?.segmentId) {
        titleText = getSeg(child.title.segmentId) || child.title.text || '';
      }

      const titleCnxml = titleText ? `<title>${titleText}</title>` : '';
      const idsBefore = new Set(keptTableIds);
      const expandedParaText = skipParaText
        ? ''
        : expandInlineTables(paraText, ctx, getSeg, originalCnxml, keptTableIds);
      removeStaleExpandedTables(paraEl, keptTableIds, idsBefore);
      replaceParaContentDom(doc, paraEl, expandedParaText, titleCnxml);
      replacedParaIds.add(child.id);
      isFirstPara = false;
    }

    if (child.type === 'list' && child.id) {
      const listEl = doc.getElementById(child.id);
      if (listEl && child.items) {
        // Guard: skip if list contains paras we already replaced
        const listHasReplacedParas = [...replacedParaIds].some((paraId) => {
          const paraEl = doc.getElementById(paraId);
          return paraEl && isDescendantOf(paraEl, listEl);
        });
        if (!listHasReplacedParas) {
          replaceListItemsDom(doc, listEl, child.items, getSeg);
        }
      }
    }
  }

  // Step 4a: keep figures AND non-inline tables that are direct children of the example.
  const exampleInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const child of Array.from(exampleEl.childNodes)) {
    if (child.nodeName === 'figure') {
      const figId = child.getAttribute('id');
      if (figId) keptFigureIds.add(figId);
    } else if (child.nodeName === 'table') {
      const tId = child.getAttribute('id');
      if (tId && !exampleInlineTableIds.has(tId)) keptTableIds.add(tId);
    }
  }

  // Step 4b: Remove tables UNLESS they were kept (expanded inline / already in DOM);
  // remove figures UNLESS they were kept.
  // Equations are NOT removed — they pass through unchanged inside examples.
  removeTablesExceptKept(
    exampleEl,
    keptTableIds,
    new Set((ctx?.inlineTables || []).map((t) => t.tableId))
  );
  const allFigures = Array.from(exampleEl.getElementsByTagName('figure'));
  for (const fig of allFigures) {
    const figId = fig.getAttribute('id');
    if (!keptFigureIds.has(figId)) {
      fig.parentNode.removeChild(fig);
    }
  }

  // Mark kept figures so buildFigure skips the standalone copy
  if (ctx && ctx.figuresHandledInContainers) {
    for (const figId of keptFigureIds) {
      ctx.figuresHandledInContainers.add(figId);
    }
  }

  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }

  // Step 5: Serialize
  let result = serializeCnxmlFragment(exampleEl);

  // Step 6: Deduplicate media and equations.
  // The DOM preserves block children (equations) inside list items, but the
  // translated text also includes them via expanded [[MATH:N]] markers,
  // producing duplicates. Same pattern as deduplicateMedia.
  result = deduplicateMedia(result);
  result = deduplicateElementsById(result, 'equation');

  return result;
}

/**
 * Check if a node is a descendant of a given ancestor element.
 */
function isDescendantOf(node, ancestor) {
  let current = node.parentNode;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * True iff `child` (a para) has a sibling <list> that extraction flattened into
 * the para's segment text. Detected by: the para's (restored) segment text
 * contains <m:math> AND a sibling <list> (with id) is a DOM descendant of paraEl.
 * When true, callers inject only the para title and leave the list for the list
 * handler to preserve — they must NOT removeChild the list. (audit #33)
 */
function paraHasFlattenedList(child, paraEl, contentArray, paraText, doc) {
  if (!paraText || !/<m:math/.test(paraText)) return false;
  for (const sibling of contentArray || []) {
    if (sibling !== child && sibling.type === 'list' && sibling.id) {
      const siblingEl = doc.getElementById(sibling.id);
      if (siblingEl && isDescendantOf(siblingEl, paraEl)) return true;
    }
  }
  return false;
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

      // Replace problem and solution paragraphs and lists.
      // Track replaced para IDs to prevent list replacement from overwriting them.
      const replacedParaIds = new Set();

      if (element.problem) {
        for (const child of element.problem.content || []) {
          if (child.type === 'para' && child.id && child.segmentId) {
            const paraText = getSeg(child.segmentId);
            if (paraText) {
              // Use nested-preserving replacement to handle paras containing lists
              const preserved = replaceParaPreservingNested(exerciseCnxml, child.id, paraText, '');
              if (preserved !== exerciseCnxml) {
                exerciseCnxml = preserved;
              } else {
                const paraPattern = new RegExp(
                  `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
                  'g'
                );
                exerciseCnxml = exerciseCnxml.replace(
                  paraPattern,
                  `<para id="${child.id}">${paraText}</para>`
                );
              }
              replacedParaIds.add(child.id);
            }
          }
          if (child.type === 'list') {
            if (!listContainsReplacedParas(exerciseCnxml, child, replacedParaIds)) {
              exerciseCnxml = replaceListItems(exerciseCnxml, child, getSeg);
            }
          }
        }
      }

      if (element.solution) {
        const solContent = element.solution.content || [];
        for (let ci = 0; ci < solContent.length; ci++) {
          const child = solContent[ci];
          if (child.type === 'para' && child.id && child.segmentId) {
            const paraText = getSeg(child.segmentId);
            if (paraText) {
              // Check if the next content entry is a list that was originally
              // nested inside this para (extracted as a sibling by the extractor).
              // If so, build the list and embed it inside the para.
              let embeddedListCnxml = '';
              while (ci + 1 < solContent.length && solContent[ci + 1].type === 'list') {
                const listChild = solContent[ci + 1];
                // buildExercise has no `ctx` param (unlike buildExerciseDom, the
                // production dispatch path) — pass null explicitly. buildList
                // treats a null 4th arg as "no blockChildren context", which is
                // the correct legacy behavior for this dead/comparison-only path.
                embeddedListCnxml += '\n' + buildList(listChild, getSeg, equations, null);
                ci++;
              }

              const paraPattern = new RegExp(
                `<para\\s+id="${child.id}"[^>]*>[\\s\\S]*?<\\/para>`,
                'g'
              );
              exerciseCnxml = exerciseCnxml.replace(
                paraPattern,
                `<para id="${child.id}">${paraText}${embeddedListCnxml}</para>`
              );
              replacedParaIds.add(child.id);
            }
          }
          if (child.type === 'list') {
            if (!listContainsReplacedParas(exerciseCnxml, child, replacedParaIds)) {
              exerciseCnxml = replaceListItems(exerciseCnxml, child, getSeg);
            }
          }
        }
      }

      // Note: We do NOT strip equations - they should pass through unchanged.
      // Strip figures (handled by buildFigure) and tables (handled by buildTable
      // from the structure tree — keeping them here would produce duplicates).
      exerciseCnxml = stripNestedElements(exerciseCnxml, ['figure', 'table']);

      // Remove duplicate media elements (same issue as buildExample)
      exerciseCnxml = deduplicateMedia(exerciseCnxml);

      return exerciseCnxml;
    }
  }

  return null;
}

/**
 * DOM-based shadow of buildExercise.
 * Same signature, same behavior, but uses DOM manipulation instead of regex.
 */
function buildExerciseDom(element, getSeg, equations, originalCnxml, ctx) {
  if (!element.id) return null;

  const exercisePattern = new RegExp(
    `<exercise\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/exercise>`,
    'g'
  );
  const match = exercisePattern.exec(originalCnxml);
  if (!match) return null;

  const { doc } = parseCnxmlFragment(match[0]);
  const exerciseEl = doc.getElementById(element.id);
  if (!exerciseEl) return match[0];

  // Process problem and solution content via DOM
  const replacedParaIds = new Set();
  const keptFigureIds = new Set();
  const keptTableIds = new Set();

  function processContent(contentArray) {
    for (const child of contentArray || []) {
      if (child.type === 'para' && child.id && child.segmentId) {
        const paraEl = doc.getElementById(child.id);
        if (!paraEl) continue;

        const paraText = getSeg(child.segmentId);
        if (!paraText) continue;

        // For paras that contain figures: strip expanded <media> from segment text
        // so the figure (already in the DOM) isn't duplicated.
        const figures = paraEl.getElementsByTagName('figure');
        if (figures.length > 0) {
          for (let i = 0; i < figures.length; i++) {
            const figId = figures[i].getAttribute('id');
            if (figId) keptFigureIds.add(figId);
          }
          const tableIdsBefore = new Set(keptTableIds);
          const textWithoutMedia = expandInlineTables(
            paraText.replace(/<media\s[^>]*>[\s\S]*?<\/media>/g, '').trim(),
            ctx,
            getSeg,
            originalCnxml,
            keptTableIds
          );
          // The original CNXML nests <table> as a block child of this para (same
          // pattern as figures); replaceParaContentDom preserves block children,
          // so remove the stale untranslated node for any id just re-expanded from
          // text, or the translated + original copies would both survive. (F4)
          removeStaleExpandedTables(paraEl, keptTableIds, tableIdsBefore);
          replaceParaContentDom(doc, paraEl, textWithoutMedia, '');
          replacedParaIds.add(child.id);
          continue;
        }

        // Preserve a list flattened into this para's segment (audit #33): inject
        // only text the list handler won't duplicate, and never removeChild the list.
        const skipParaText = paraHasFlattenedList(child, paraEl, contentArray, paraText, doc);
        const tableIdsBeforeExpand = new Set(keptTableIds);
        const expandedParaText = skipParaText
          ? ''
          : expandInlineTables(paraText, ctx, getSeg, originalCnxml, keptTableIds);
        // See comment above: strip the stale nested <table> this para's text just
        // re-expanded, so replaceParaContentDom's block-preservation doesn't leave
        // a duplicate untranslated copy behind. (F4)
        removeStaleExpandedTables(paraEl, keptTableIds, tableIdsBeforeExpand);
        replaceParaContentDom(doc, paraEl, expandedParaText, '');
        replacedParaIds.add(child.id);
      }

      if (child.type === 'list' && child.id) {
        const listEl = doc.getElementById(child.id);
        if (listEl && child.items) {
          const listHasReplacedParas = [...replacedParaIds].some((paraId) => {
            const pEl = doc.getElementById(paraId);
            return pEl && isDescendantOf(pEl, listEl);
          });
          if (!listHasReplacedParas) {
            replaceListItemsDom(doc, listEl, child.items, getSeg);
          }
        }
      }
    }
  }

  if (element.problem) processContent(element.problem.content);
  if (element.solution) processContent(element.solution.content);

  // Also keep figures that are direct children of the exercise, problem, or solution elements.
  const containers = [exerciseEl];
  const problems = exerciseEl.getElementsByTagName('problem');
  const solutions = exerciseEl.getElementsByTagName('solution');
  for (let i = 0; i < problems.length; i++) containers.push(problems[i]);
  for (let i = 0; i < solutions.length; i++) containers.push(solutions[i]);
  const exerciseInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const container of containers) {
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeName === 'figure') {
        const figId = child.getAttribute('id');
        if (figId) keptFigureIds.add(figId);
      } else if (child.nodeName === 'table') {
        const tId = child.getAttribute('id');
        if (tId && !exerciseInlineTableIds.has(tId)) keptTableIds.add(tId);
      }
    }
  }

  // Remove tables and figures UNLESS they were kept (expanded inline / already in DOM).
  removeTablesExceptKept(
    exerciseEl,
    keptTableIds,
    new Set((ctx?.inlineTables || []).map((t) => t.tableId))
  );
  const allFigures = Array.from(exerciseEl.getElementsByTagName('figure'));
  for (const fig of allFigures) {
    const figId = fig.getAttribute('id');
    if (!keptFigureIds.has(figId)) {
      fig.parentNode.removeChild(fig);
    }
  }

  // Mark kept figures so buildFigure skips the standalone copy
  if (ctx && ctx.figuresHandledInContainers) {
    for (const figId of keptFigureIds) {
      ctx.figuresHandledInContainers.add(figId);
    }
  }

  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }

  let result = serializeCnxmlFragment(exerciseEl);
  result = deduplicateMedia(result);
  result = deduplicateElementsById(result, 'equation');

  return result;
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
 * DOM-based shadow of buildNote.
 * Same signature, same behavior, but uses DOM manipulation instead of regex.
 * Keeps the regex nesting check (note inside example/exercise) since it
 * operates on the full originalCnxml, not the note fragment.
 */
function buildNoteDom(element, getSeg, equations, originalCnxml, ctx) {
  if (!element.id) {
    return buildGenericElement('note', element, getSeg, equations, originalCnxml);
  }

  // Nesting check: skip notes inside examples/exercises (same regex as old version)
  const noteMatch = originalCnxml.match(new RegExp(`<note\\s+id="${element.id}"`));
  if (noteMatch) {
    const notePos = noteMatch.index;

    const examplePattern = /<example[^>]*>[\s\S]*?<\/example>/g;
    let exMatch;
    while ((exMatch = examplePattern.exec(originalCnxml)) !== null) {
      if (notePos > exMatch.index && notePos < exMatch.index + exMatch[0].length) {
        return null;
      }
    }

    const exercisePattern = /<exercise[^>]*>[\s\S]*?<\/exercise>/g;
    let exerMatch;
    while ((exerMatch = exercisePattern.exec(originalCnxml)) !== null) {
      if (notePos > exerMatch.index && notePos < exerMatch.index + exerMatch[0].length) {
        return null;
      }
    }
  }

  // Extract note from original CNXML
  const notePattern = new RegExp(`<note\\s+id="${element.id}"[^>]*>[\\s\\S]*?<\\/note>`, 'g');
  const match = notePattern.exec(originalCnxml);
  if (!match) {
    return buildGenericElement('note', element, getSeg, equations, originalCnxml);
  }

  // Parse into DOM
  const { doc } = parseCnxmlFragment(match[0]);
  const noteEl = doc.getElementById(element.id);
  if (!noteEl) return match[0];

  // Replace title
  if (element.title && element.title.segmentId) {
    const titleText = getSeg(element.title.segmentId);
    if (titleText) {
      const titleEls = noteEl.getElementsByTagName('title');
      if (titleEls.length > 0) {
        const titleEl = titleEls[0];
        // Clear existing content and insert translated text as CNXML
        // (title text from getSeg may contain inline markup like <sub>, <sup>)
        while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
        insertCnxmlBefore(doc, titleEl, titleText, null);
      }
    }
  }

  // Replace paragraphs and lists via DOM
  const replacedParaIds = new Set();
  const keptTableIds = new Set();
  for (const child of element.content || []) {
    if (child.type === 'para' && child.id && child.segmentId) {
      const paraEl = doc.getElementById(child.id);
      if (!paraEl) continue;

      const paraText = getSeg(child.segmentId);
      if (!paraText) continue;

      const skipParaText = paraHasFlattenedList(child, paraEl, element.content, paraText, doc);
      const idsBefore = new Set(keptTableIds);
      const expandedParaText = skipParaText
        ? ''
        : expandInlineTables(paraText, ctx, getSeg, originalCnxml, keptTableIds);
      removeStaleExpandedTables(paraEl, keptTableIds, idsBefore);
      replaceParaContentDom(doc, paraEl, expandedParaText, '');
      replacedParaIds.add(child.id);
    }

    if (child.type === 'list' && child.id) {
      const listEl = doc.getElementById(child.id);
      if (listEl && child.items) {
        const listHasReplacedParas = [...replacedParaIds].some((paraId) => {
          const pEl = doc.getElementById(paraId);
          return pEl && isDescendantOf(pEl, listEl);
        });
        if (!listHasReplacedParas) {
          replaceListItemsDom(doc, listEl, child.items, getSeg);
        }
      }
    }
  }

  // Replace figure captions inside the note (figures are kept, not stripped).
  if (ctx && ctx.figureCaptions) {
    const figures = noteEl.getElementsByTagName('figure');
    for (let i = 0; i < figures.length; i++) {
      const figEl = figures[i];
      const figId = figEl.getAttribute('id');
      if (!figId) continue;

      const captionSegId = ctx.figureCaptions[figId];
      if (captionSegId) {
        const captionText = getSeg(captionSegId);
        if (captionText) {
          // Find and replace caption content
          const captions = figEl.getElementsByTagName('caption');
          if (captions.length > 0) {
            const captionEl = captions[0];
            while (captionEl.firstChild) captionEl.removeChild(captionEl.firstChild);
            insertCnxmlBefore(doc, captionEl, captionText, null);
          }
        }
        ctx.figuresHandledInNotes.add(figId);
      }
    }
  }

  // Keep + register non-inline tables that are direct children of the note (OC-B).
  const noteInlineTableIds = new Set((ctx?.inlineTables || []).map((t) => t.tableId));
  for (const child of Array.from(noteEl.childNodes)) {
    if (child.nodeName === 'table') {
      const tId = child.getAttribute('id');
      if (tId && !noteInlineTableIds.has(tId)) keptTableIds.add(tId);
    }
  }
  if (ctx && ctx.tablesHandledInContainers) {
    for (const tId of keptTableIds) ctx.tablesHandledInContainers.add(tId);
  }

  // Strip examples, exercises (figures and equations are kept); tables are kept
  // unless not re-expanded inline (F4).
  removeElementsByTag(noteEl, ['example', 'exercise']);
  removeTablesExceptKept(
    noteEl,
    keptTableIds,
    new Set((ctx?.inlineTables || []).map((t) => t.tableId))
  );

  return serializeCnxmlFragment(noteEl);
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
function buildList(element, getSeg, equations = {}, ctx = null) {
  const lines = [];
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const listType = element.listType || 'bulleted';
  const numberStyleAttr = element.numberStyle ? ` number-style="${element.numberStyle}"` : '';
  const bulletStyleAttr = element.bulletStyle ? ` bullet-style="${element.bulletStyle}"` : '';

  lines.push(`<list${idAttr} list-type="${listType}"${numberStyleAttr}${bulletStyleAttr}>`);

  // OC-E Layer 2: re-emit a list item's block <equation>/<media> children in place
  // (their in-item [[MATH:N]]/[[MEDIA:N]] placeholder was suppressed at getSeg time).
  const buildBlockChildren = (item) =>
    (item.blockChildren || [])
      .map((bc) => {
        if (bc.type === 'equation') {
          const eq = equations && equations[bc.id];
          if (!eq || !eq.mathml) return '';
          // The equation's class lives on the [[MATH:N]] placeholder meta entry
          // (equationId === bc.id), NOT on the id-keyed standalone entry — look it
          // up so class="unnumbered" etc. is preserved (no test-visible attr otherwise).
          const meta = Object.values(equations).find((e) => e && e.equationId === bc.id);
          const cls = (meta && meta.equationClass) || eq.equationClass;
          const classAttr = cls ? ` class="${cls}"` : '';
          return `<equation id="${bc.id}"${classAttr}>${eq.mathml}</equation>`;
        }
        if (bc.type === 'media') {
          const m = (ctx && ctx.inlineMedia ? ctx.inlineMedia : []).find((x) => x.id === bc.id);
          return m ? buildMedia({ ...m }) : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

  for (const item of element.items || []) {
    const itemText = getSeg(item.segmentId);
    const itemIdAttr = item.id ? ` id="${item.id}"` : '';
    const blockChildXml = buildBlockChildren(item);

    if (item.children && item.children.length > 0) {
      // Item has nested lists — build them recursively
      const head = item.wrapsPara
        ? `${item.wrapsPara.openTag}${(itemText || '').trimEnd()}</para>`
        : itemText || '';
      lines.push(`<item${itemIdAttr}>${head}`);
      for (const child of item.children) {
        if (child.type === 'list') {
          lines.push(buildList(child, getSeg, equations, ctx));
        }
      }
      if (blockChildXml) lines.push(blockChildXml);
      lines.push('</item>');
    } else if (item.wrapsPara && blockChildXml) {
      // Leading <para> followed by block <equation>/<media> siblings (OC-E Layer 2).
      // trimEnd() the para text: the suppressed placeholder left a trailing space
      // that the source <para> did not have.
      lines.push(
        `<item${itemIdAttr}>${item.wrapsPara.openTag}${itemText.trimEnd()}</para>\n${blockChildXml}</item>`
      );
    } else if (itemText) {
      if (item.wrapsPara) {
        // Original item content was wrapped in a <para> — preserve that element
        lines.push(`<item${itemIdAttr}>${item.wrapsPara.openTag}${itemText}</para></item>`);
      } else {
        lines.push(`<item${itemIdAttr}>${itemText}</item>`);
      }
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

  if (element.embedSrc) {
    const w = element.width ? ` width="${escapeXml(element.width)}"` : '';
    const h = element.height ? ` height="${escapeXml(element.height)}"` : '';
    lines.push(`<iframe${w}${h} src="${escapeXml(element.embedSrc)}"/>`);
  } else if (element.src) {
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

/**
 * Remove duplicate media elements from CNXML.
 * When buildExample/buildExercise preserves original CNXML (which has <media>
 * elements) AND the translated segment text also generates <media> from
 * [[MEDIA:N]] markers, both copies appear in the output. This function keeps
 * only the first occurrence of each media ID.
 * @param {string} cnxml - CNXML content
 * @returns {string} CNXML with duplicate media removed
 */
function deduplicateMedia(cnxml) {
  const seenMediaIds = new Set();
  // Match <media id="xxx" ...>...</media> blocks
  return cnxml.replace(
    /<media\s+([^>]*\bid="([^"]+)"[^>]*)>[\s\S]*?<\/media>/g,
    (match, attrs, id) => {
      if (seenMediaIds.has(id)) {
        return ''; // Remove duplicate
      }
      seenMediaIds.add(id);
      return match;
    }
  );
}

/**
 * Remove duplicate elements of a given tag name, keeping the first occurrence.
 * Used to deduplicate equations that appear both as preserved block children
 * in the DOM and as expanded [[MATH:N]] markers in the translated text.
 * @param {string} cnxml - CNXML content
 * @param {string} tagName - Tag name to deduplicate (e.g., 'equation')
 * @returns {string} CNXML with duplicates removed
 */
function deduplicateElementsById(cnxml, tagName) {
  const seenIds = new Set();
  const pattern = new RegExp(
    `<${tagName}\\s+[^>]*\\bid="([^"]+)"[^>]*>[\\s\\S]*?<\\/${tagName}>`,
    'g'
  );
  return cnxml.replace(pattern, (match, id) => {
    if (seenIds.has(id)) return '';
    seenIds.add(id);
    return match;
  });
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
function loadModuleInputs(chapter, moduleId, lang, sourceDir, allowEnFallback = false) {
  const chapterDir = formatChapter(chapter);
  const mtOutputChapterDir = path.join(BOOKS_DIR, '02-mt-output', chapterDir);
  const restorePolicy = resolveRestorePolicy({ mtOutputChapterDir, moduleId });

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
    // The translation is missing. Falling back to English would publish
    // untranslated content, so refuse unless explicitly opted in (F20).
    if (!allowEnFallback) {
      throw new Error(
        `Translation not found for ${moduleId} in ${sourceDir} (${segmentsPath}). ` +
          'Refusing to publish untranslated content. Pass --allow-en-fallback to inject English instead.'
      );
    }
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

  // WS4 item 5: substitute English math labels before any emit site reads eq.mathml.
  const { resolve: resolveMathLabel, overlay: mathLabelOverlay } = getMathLabelResolver(BOOKS_DIR);
  applyMathLabelSubstitution(equations, resolveMathLabel);

  // Load inline attributes (term class, footnote id, etc.)
  const inlineAttrsPath = path.join(
    BOOKS_DIR,
    '02-structure',
    chapterDir,
    `${moduleId}-inline-attrs.json`
  );
  const inlineAttrs = fs.existsSync(inlineAttrsPath)
    ? JSON.parse(fs.readFileSync(inlineAttrsPath, 'utf-8'))
    : {};

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
  // WS4 item 5: substitute math labels in the raw source too. Standalone <equation>
  // blocks and example/exercise/note math are sliced verbatim from originalCnxml by
  // the builders and never touch the `equations` object, so the equations-object
  // substitution above does not reach them. substituteMathLabels only rewrites leaf
  // <m:mtext>/<m:mi> label text; ids/tags/structure (and thus the builders' slicing
  // regexes) are unaffected. Idempotent, so math also covered via equations is safe.
  //
  // WS4 #3: report unmapped labels + subscript advisories on the RAW source, which
  // contains ALL math (inline, standalone <equation>, note/example/exercise) — the
  // equations object misses the second-seam classes. Must run pre-substitution so
  // Icelandic fills don't pollute token collection.
  const rawOriginalCnxml = fs.readFileSync(originalPath, 'utf-8');
  const mathLabelReport = reportMathLabels(rawOriginalCnxml, resolveMathLabel, {
    overlay: mathLabelOverlay,
  });
  if (mathLabelReport.unmapped.length) {
    console.error(
      `  ⚠ ${moduleId}: ${mathLabelReport.unmapped.length} unmapped math label(s): ${mathLabelReport.unmapped.join(', ')}`
    );
  }
  for (const a of mathLabelReport.longSubscriptFills) {
    console.error(
      `  ⚠ ${moduleId}: glossary term "${a.value}" is ${a.cp} chars in a subscript (label "${a.token}") — consider a compact overlay override`
    );
  }
  const originalCnxml = substituteMathLabels(rawOriginalCnxml, resolveMathLabel);

  return { structure, segments, equations, originalCnxml, enSegments, inlineAttrs, restorePolicy };
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
  const backup = safeWrite(outputPath, cnxml);
  if (backup) logBackup(path.basename(BOOKS_DIR), chapter, 'inject', outputPath, backup);
  return outputPath;
}

// WS4 item 5 — math-label substitution. Resolver (overlay + glossary) is per-book;
// cache it so a whole-book inject run builds it once.
const _mathLabelResolverCache = new Map();
function getMathLabelResolver(bookDir) {
  if (!_mathLabelResolverCache.has(bookDir)) {
    _mathLabelResolverCache.set(bookDir, loadMathLabelResolver(bookDir));
  }
  return _mathLabelResolverCache.get(bookDir);
}

/**
 * Substitute English math labels → Icelandic across a loaded equations object,
 * mutating each eq.mathml in place. Byte-minimal (see substituteMathLabels).
 * @param {Record<string,{mathml?:string}>} equations
 * @param {(label:string)=>{value:string,source:string}} resolve
 * @returns {{modulesSubstituted:number}}
 */
function applyMathLabelSubstitution(equations, resolve) {
  let modulesSubstituted = 0;
  for (const eq of Object.values(equations)) {
    if (eq && typeof eq.mathml === 'string') {
      const before = eq.mathml;
      eq.mathml = substituteMathLabels(eq.mathml, resolve);
      if (eq.mathml !== before) modulesSubstituted += 1;
    }
  }
  return { modulesSubstituted };
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
  requireBook(args);

  if (args.chapter == null) {
    // NB: `== null` (not `!args.chapter`) so chapter 0 (the preface / ch00) is valid.
    console.error('Error: --chapter is required');
    printHelp();
    process.exit(1);
  }

  const sourceDir = args.sourceDir || '02-mt-output';
  const track = args.track || trackFromSourceDir(sourceDir);

  // A2: per-book, track-qualified residue manifest. Read-merge-preserve so a
  // per-chapter inject doesn't clobber other chapters' records.
  let residueReport = { track };
  const residueReportPath = path.join(BOOKS_DIR, `residue-report.${track}.json`);
  if (fs.existsSync(residueReportPath)) {
    try {
      residueReport = JSON.parse(fs.readFileSync(residueReportPath, 'utf-8'));
      residueReport.track = track; // keep authoritative
    } catch {
      residueReport = { track }; // tolerate a corrupt prior manifest
    }
  }

  // Load translated image mapping (from docx-import) if available
  const imageMapping = loadImageMapping(BOOKS_DIR);
  if (imageMapping.size > 0 && args.verbose) {
    console.error(`Loaded image mapping: ${imageMapping.size} translated image(s)`);
  }
  // New-route (from-scratch SVG) basename-keyed swaps — applied as a post-pass
  // over each assembled module so it reaches example/exercise/standalone images
  // the figure-id mechanism cannot.
  const imageBasenameMap = loadImageBasenameMap(BOOKS_DIR);
  if (imageBasenameMap.length > 0 && args.verbose) {
    console.error(`Loaded basename image swaps: ${imageBasenameMap.length} translated image(s)`);
  }

  try {
    const modules = findChapterModules(args.chapter, args.module);

    for (const moduleId of modules) {
      if (args.verbose) {
        console.error(`Processing: ${moduleId} (source: ${sourceDir}, track: ${track})`);
      }

      const {
        structure,
        segments,
        equations,
        originalCnxml,
        enSegments,
        inlineAttrs,
        restorePolicy,
      } = loadModuleInputs(args.chapter, moduleId, args.lang, sourceDir, args.allowEnFallback);

      // Restore/strip term markers (needed for both pipelines):
      // - New {{term}} format: strips any __term__ glossary artifacts from IS
      // - Legacy __term__ format: restores **bold** → __term__ from web UI MT
      const { restoredCount, strippedCount } = restoreTermMarkers(segments, enSegments);
      if (args.verbose && restoredCount > 0) {
        console.error(`  Restored ${restoredCount} term marker(s) from EN source`);
      }
      if (strippedCount > 0) {
        console.error(`  Note: ${strippedCount} API-added term marker(s) stripped`);
      }

      // B2: web-UI marker restoration is gated on recorded producer provenance,
      // not a content sniff. 'mutate' (docx) rewrites segments as before; 'warn'
      // (api-translate / human-authored) detects-and-reports without mutating —
      // which doubles as a mis-stamped-backfill detector.
      if (restorePolicy.policy === 'mutate') {
        const { supStripped, subStripped, mediaRestored, brRestored } = runWebUiRestores(
          segments,
          enSegments
        );
        if (supStripped > 0 || subStripped > 0) {
          console.error(
            `  Note: stripped ${supStripped} excess sup + ${subStripped} excess sub marker(s)`
          );
        }
        if (mediaRestored > 0) {
          console.error(`  Restored ${mediaRestored} [[MEDIA:N]] placeholder(s) from EN source`);
        }
        if (args.verbose && brRestored > 0) {
          console.error(`  Restored ${brRestored} newline placeholder(s) from EN source`);
        }
      } else {
        // warn-only: run on a throwaway clone so the real segments are never mutated.
        const { supStripped, subStripped, mediaRestored, brRestored } = runWebUiRestores(
          new Map(segments),
          enSegments
        );
        if (supStripped || subStripped || mediaRestored || brRestored) {
          console.error(
            `  Note [warn-only, provenance=${restorePolicy.tool || 'human-authored'}]: ` +
              `would have stripped ${supStripped} sup/${subStripped} sub and restored ` +
              `${mediaRestored} media/${brRestored} BR marker(s) — not mutating`
          );
        }
      }

      // Restore [[MATH:N]] placeholders that the API resolved to plain text (both pipelines)
      const { restoredCount: mathRestoredCount } = restoreMathMarkers(segments, enSegments);
      if (mathRestoredCount > 0) {
        console.error(`  Restored ${mathRestoredCount} [[MATH:N]] placeholder(s) from EN source`);
      }

      // Annotate inline terms with English originals: __IS (e. en)__ or {{term}}IS (e. en){{/term}}
      if (args.annotateEn) {
        const { annotatedCount } = annotateInlineTerms(segments, enSegments);
        if (args.verbose && annotatedCount > 0) {
          console.error(`  Annotated ${annotatedCount} inline term(s) with EN originals`);
        }
      }

      const result = buildCnxml(
        structure,
        segments,
        equations,
        originalCnxml,
        {
          verbose: args.verbose,
          enSegments,
          annotateEn: args.annotateEn,
          imageMapping,
          // A2: residue detection only makes sense when injecting a translation.
          // Skip when deliberately injecting the EN source as content (--lang en
          // round-trip) or under the explicit EN-fallback escape hatch.
          checkResidue: args.lang !== 'en' && !args.allowEnFallback,
        },
        inlineAttrs
      );

      // New-route image localization: swap any <image> (figure or not) whose
      // basename has a translated SVG variant. No-op when the map is empty.
      result.cnxml = applyImageBasenameSwaps(result.cnxml, imageBasenameMap);

      // A2: record/clear this module's residue BEFORE the skip check below, so
      // a residue-blocked module is still recorded in the manifest, and surface
      // it on the console.
      residueReport = upsertResidueModule(residueReport, moduleId, {
        exact: result.report.residues,
        warnings: result.report.residueWarnings,
      });
      if (result.report.residues.length > 0) {
        console.error(
          `  WARNING: ${result.report.residues.length} untranslated-EN residue segment(s):`
        );
        for (const id of result.report.residues.slice(0, 10)) {
          console.error(`    - ${id}`);
        }
        if (result.report.residues.length > 10) {
          console.error(`    ... and ${result.report.residues.length - 10} more`);
        }
      }
      if (result.report.residueWarnings.length > 0) {
        console.error(
          `  NOTE: ${result.report.residueWarnings.length} "mostly English" segment(s) (warn-only)`
        );
      }

      if (!result.report.complete && !args.allowIncomplete) {
        console.error(`${moduleId}: SKIPPED — incomplete injection`);
        if (result.report.segmentsMissing.length > 0) {
          console.error(`  Missing segments: ${result.report.segmentsMissing.length}`);
        }
        if (result.report.unresolvedMathPlaceholders.length > 0) {
          console.error(`  Unresolved math: ${result.report.unresolvedMathPlaceholders.length}`);
        }
        if (result.report.residues.length > 0) {
          console.error(`  Untranslated-EN residue: ${result.report.residues.length}`);
        }
        console.error('  Use --allow-incomplete to write anyway');
        process.exitCode = 1;
        continue;
      }

      // Round-trip validation: compare source vs translated tag counts
      const fidelityDiffs = compareTagCounts(originalCnxml, result.cnxml);
      if (fidelityDiffs.length > 0 && args.verbose) {
        const totalDiff = fidelityDiffs.reduce((s, d) => s + Math.abs(d.diff), 0);
        console.error(
          `  Fidelity: ${fidelityDiffs.length} tag discrepancy(ies) (${totalDiff} total)`
        );
        for (const d of fidelityDiffs) {
          console.error(
            `    ${d.tag}: ${d.source} → ${d.translated} (${d.diff > 0 ? '+' : ''}${d.diff})`
          );
        }
      }

      const outputPath = writeOutput(args.chapter, moduleId, result.cnxml, track);

      const status = result.report.complete ? 'COMPLETE' : 'INCOMPLETE';
      const fidelityStatus = fidelityDiffs.length === 0 ? ' [PERFECT fidelity]' : '';
      console.log(`${moduleId}: Translated CNXML written [${status}]${fidelityStatus}`);
      console.log(`  → ${outputPath}`);
      if (!result.report.complete) {
        console.log(`  Missing segments: ${result.report.segmentsMissing.length}`);
        console.log(`  Unresolved math: ${result.report.unresolvedMathPlaceholders.length}`);
      }
    }

    // A2: persist the per-book, track-qualified residue manifest.
    fs.writeFileSync(residueReportPath, JSON.stringify(residueReport, null, 2) + '\n');
    if (residueReport.summary && residueReport.summary.modulesWithResidue > 0) {
      console.log(
        `Residue: ${residueReport.summary.exactResidues} untranslated-EN segment(s) across ` +
          `${residueReport.summary.modulesWithResidue} module(s), ` +
          `${residueReport.summary.ratioWarnings} warning(s) → ${residueReportPath}`
      );
    }

    // Update translation-errors.json with full-book fidelity state
    const { perfect, withDiscrepancies, totalDiscrepancies, skippedUntranslated } =
      updateTranslationErrors(BOOKS_DIR, {
        track,
        verbose: args.verbose,
      });
    const skippedNote =
      skippedUntranslated > 0 ? `, ${skippedUntranslated} skipped (untranslated)` : '';
    console.log(
      `\nFidelity summary: ${perfect} PERFECT, ${withDiscrepancies} with discrepancies${skippedNote} (${totalDiscrepancies} total)`
    );
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

export {
  restoreTermMarkers,
  restoreSupersubMarkers,
  restoreMediaMarkers,
  restoreMathMarkers,
  restoreMathBySeparators,
  restoreNewlines,
  annotateInlineTerms,
  assertNoMarkerResidue,
  parseSegments,
  reverseInlineMarkup,
  buildCnxml,
  // Exported for comparison testing (DOM vs regex refactor)
  buildExample,
  buildExampleDom,
  buildExercise,
  buildExerciseDom,
  buildNote,
  buildNoteDom,
  applyImageBasenameSwaps,
  loadImageBasenameMap,
  buildMediaElement,
  buildMedia,
  applyMathLabelSubstitution,
};
