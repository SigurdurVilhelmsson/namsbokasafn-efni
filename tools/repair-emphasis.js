#!/usr/bin/env node

/**
 * repair-emphasis.js — Post-injection emphasis repair
 *
 * Compares EN and IS segment files to find segments where the MT API dropped
 * {{i}}...{{/i}} emphasis markers. For each lost emphasis, identifies the
 * specific word(s) and patches <emphasis effect="italics"> tags into the
 * translated CNXML.
 *
 * Strategy:
 *   1. For each module, compare EN and IS emphasis marker counts per segment
 *   2. For segments with loss, extract the emphasized words from EN
 *   3. Find the corresponding translated words in the IS segment
 *   4. Patch the translated CNXML file with missing <emphasis> tags
 *
 * Usage:
 *   node tools/repair-emphasis.js --book efnafraedi-2e --chapter 5
 *   node tools/repair-emphasis.js --book efnafraedi-2e --chapter 5 --module m68724
 *   node tools/repair-emphasis.js --book efnafraedi-2e              # whole book
 *   node tools/repair-emphasis.js --book efnafraedi-2e --dry-run    # preview only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';
import { compareTagCounts } from './cnxml-fidelity-check.js';
import { updateTranslationErrors } from './lib/update-translation-errors.js';

let BOOKS_DIR = 'books/efnafraedi-2e';

// ─── Segment parsing ─────────────────────────────────────────────

function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const text = match[2].trim();
    if (!segments.has(id)) {
      segments.set(id, text);
    }
  }
  return segments;
}

// ─── Emphasis analysis ───────────────────────────────────────────

/**
 * Extract emphasized words from a segment using {{i}}...{{/i}} markers.
 * @param {string} text - Segment text with markers
 * @returns {string[]} Array of emphasized text spans
 */
function extractEmphasisSpans(text) {
  const spans = [];
  const pattern = /\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    spans.push(match[1]);
  }
  return spans;
}

/**
 * Find segments with emphasis loss between EN and IS.
 * @param {Map} enSegments - EN segments
 * @param {Map} isSegments - IS segments
 * @returns {Array} Segments with emphasis loss: { segId, enCount, isCount, lostSpans }
 */
function findEmphasisLoss(enSegments, isSegments) {
  const losses = [];

  for (const [segId, enText] of enSegments) {
    const isText = isSegments.get(segId);
    if (!isText) continue;

    const enSpans = extractEmphasisSpans(enText);
    const isSpans = extractEmphasisSpans(isText);

    if (enSpans.length > isSpans.length) {
      // IS has fewer emphasis markers than EN — some were lost by the API
      // The lost spans are the EN spans that don't have corresponding IS spans.
      // Since markers are positional, the surviving ones are at the start.
      const lostSpans = enSpans.slice(isSpans.length);

      losses.push({
        segId,
        enCount: enSpans.length,
        isCount: isSpans.length,
        lostCount: enSpans.length - isSpans.length,
        lostSpans,
        isText,
      });
    }
  }

  return losses;
}

// ─── CNXML patching ──────────────────────────────────────────────

/**
 * Attempt to repair emphasis in a translated CNXML file.
 *
 * For each lost emphasis span, we know the EN emphasized text.
 * We search the translated CNXML for the corresponding text position
 * and wrap it in <emphasis effect="italics">.
 *
 * This is a best-effort heuristic — not all losses can be repaired:
 * - Single-char emphasis (like state notation l/s/g) may be ambiguous
 * - If the word was translated differently, positional matching fails
 *
 * @param {string} cnxml - Translated CNXML content
 * @param {Array} losses - Segments with emphasis loss
 * @returns {{ cnxml: string, repairedCount: number, skippedCount: number }}
 */
function repairEmphasis(cnxml, losses, maxRepairs = Infinity) {
  let result = cnxml;
  let repairedCount = 0;
  let skippedCount = 0;

  for (const loss of losses) {
    for (const enSpan of loss.lostSpans) {
      if (repairedCount >= maxRepairs) {
        skippedCount++;
        continue;
      }
      // Strategy 1: The EN emphasized text survives untranslated in IS
      // (common for scientific terms, chemical state notation like l/s/g/aq)
      if (enSpan.length >= 2) {
        // Look for the text in the CNXML, not already inside <emphasis>
        const escaped = enSpan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(
          `(?<!<emphasis[^>]*>)(?<!effect="[^"]*)(\\b)(${escaped})(\\b)(?![^<]*</emphasis>)`,
          'g'
        );

        let found = false;
        result = result.replace(pattern, (match, pre, content, post) => {
          if (!found) {
            found = true;
            repairedCount++;
            return `${pre}<emphasis effect="italics">${content}</emphasis>${post}`;
          }
          return match; // Only repair first occurrence
        });

        if (!found) {
          // Strategy 2: For single-character state notation (l, s, g, aq),
          // look for the pattern in parentheses: (l), (s), (g), (aq)
          if (/^[lsgaq]{1,2}$/.test(enSpan)) {
            const statePattern = new RegExp(`\\((?!<emphasis)${escaped}(?!</emphasis>)\\)`, 'g');
            let stateFound = false;
            result = result.replace(statePattern, (match) => {
              if (!stateFound) {
                stateFound = true;
                repairedCount++;
                return `(<emphasis effect="italics">${enSpan}</emphasis>)`;
              }
              return match;
            });
            if (!stateFound) skippedCount++;
          } else {
            skippedCount++;
          }
        }
      } else {
        // Single char — too ambiguous for general repair
        skippedCount++;
      }
    }
  }

  return { cnxml: result, repairedCount, skippedCount };
}

// ─── CLI ─────────────────────────────────────────────────────────

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function discoverChapters(bookDir) {
  const sourceDir = path.join(bookDir, '01-source');
  if (!fs.existsSync(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir)
    .filter((d) => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.match(/^m\d+-segments\.en\.md$/))
    .map((f) => f.replace('-segments.en.md', ''))
    .sort();
}

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'track', flags: ['--track'], type: 'string', default: 'mt-preview' },
    { name: 'dryRun', flags: ['--dry-run'], type: 'boolean', default: false },
  ]);
}

function printHelp() {
  console.log(`
repair-emphasis.js — Post-injection emphasis repair

Compares EN/IS segments to find dropped {{i}} emphasis markers,
then patches <emphasis> tags into translated CNXML.

Usage:
  node tools/repair-emphasis.js --book <slug> --chapter <num>
  node tools/repair-emphasis.js --book <slug>                    # whole book
  node tools/repair-emphasis.js --book <slug> --dry-run          # preview only

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID
  --track <name>      Translation track (default: mt-preview)
  --dry-run           Show what would be repaired without writing
  -v, --verbose       Show details
  -h, --help          Show this help
`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = args.chapter ? [formatChapter(args.chapter)] : discoverChapters(BOOKS_DIR);

  let totalRepaired = 0;
  let totalSkipped = 0;
  let totalLost = 0;
  let modulesProcessed = 0;
  let modulesRepaired = 0;

  for (const chapterDir of chapters) {
    const enDir = path.join(BOOKS_DIR, '02-for-mt', chapterDir);
    const isDir = path.join(BOOKS_DIR, '02-mt-output', chapterDir);
    const transDir = path.join(BOOKS_DIR, '03-translated', args.track, chapterDir);

    let modules = discoverModules(enDir);
    if (args.module) {
      modules = modules.filter((m) => m === args.module);
    }

    for (const moduleId of modules) {
      const enPath = path.join(enDir, `${moduleId}-segments.en.md`);
      const isPath = path.join(isDir, `${moduleId}-segments.is.md`);
      const transPath = path.join(transDir, `${moduleId}.cnxml`);

      if (!fs.existsSync(enPath) || !fs.existsSync(isPath) || !fs.existsSync(transPath)) {
        continue;
      }

      const enSegments = parseSegments(fs.readFileSync(enPath, 'utf8'));
      const isSegments = parseSegments(fs.readFileSync(isPath, 'utf8'));

      const losses = findEmphasisLoss(enSegments, isSegments);
      if (losses.length === 0) continue;

      const lostCount = losses.reduce((s, l) => s + l.lostCount, 0);
      totalLost += lostCount;
      modulesProcessed++;

      if (args.dryRun || args.verbose) {
        console.log(
          `${chapterDir}/${moduleId}: ${lostCount} emphasis marker(s) lost in ${losses.length} segment(s)`
        );
        if (args.verbose) {
          for (const loss of losses) {
            console.log(
              `  ${loss.segId}: EN=${loss.enCount} IS=${loss.isCount} lost=${loss.lostCount}`
            );
            for (const span of loss.lostSpans) {
              console.log(`    "${span}"`);
            }
          }
        }
      }

      if (!args.dryRun) {
        const cnxml = fs.readFileSync(transPath, 'utf8');

        // Fidelity guard: only repair if the CNXML actually has fewer emphasis tags
        // than the source. Some emphasis may already be recovered by other injection paths.
        const sourcePath = path.join(BOOKS_DIR, '01-source', chapterDir, `${moduleId}.cnxml`);
        if (fs.existsSync(sourcePath)) {
          const sourceCnxml = fs.readFileSync(sourcePath, 'utf8');
          const diffs = compareTagCounts(sourceCnxml, cnxml);
          const emphasisDiff = diffs.find((d) => d.tag === 'emphasis');
          if (!emphasisDiff || emphasisDiff.diff >= 0) {
            // No emphasis loss in CNXML — skip repair (would cause overcounting)
            if (args.verbose) {
              console.log(
                `${chapterDir}/${moduleId}: skipping — CNXML emphasis count OK (${emphasisDiff ? 'diff=' + emphasisDiff.diff : 'none'})`
              );
            }
            continue;
          }
          // Cap repairs at the actual CNXML emphasis deficit
          const maxRepairs = Math.abs(emphasisDiff.diff);
          const {
            cnxml: repaired,
            repairedCount,
            skippedCount,
          } = repairEmphasis(cnxml, losses, maxRepairs);

          if (repairedCount > 0) {
            fs.writeFileSync(transPath, repaired, 'utf8');
            modulesRepaired++;
            console.log(
              `${chapterDir}/${moduleId}: repaired ${repairedCount}/${lostCount} emphasis (CNXML deficit: ${Math.abs(emphasisDiff.diff)}), skipped ${skippedCount}`
            );
          } else if (args.verbose) {
            console.log(`${chapterDir}/${moduleId}: no repairable emphasis found`);
          }

          totalRepaired += repairedCount;
          totalSkipped += skippedCount;
        }
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Emphasis lost: ${totalLost} across ${modulesProcessed} modules`);
  if (!args.dryRun) {
    console.log(`Repaired: ${totalRepaired}`);
    console.log(`Skipped: ${totalSkipped}`);
    console.log(`Modules patched: ${modulesRepaired}`);

    // Update translation-errors.json if any repairs were made
    if (modulesRepaired > 0) {
      const { perfect, withDiscrepancies, totalDiscrepancies } = updateTranslationErrors(
        BOOKS_DIR,
        { track: args.track, verbose: args.verbose }
      );
      console.log(
        `\nFidelity summary: ${perfect} PERFECT, ${withDiscrepancies} with discrepancies (${totalDiscrepancies} total)`
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { parseSegments, extractEmphasisSpans, findEmphasisLoss, repairEmphasis };
