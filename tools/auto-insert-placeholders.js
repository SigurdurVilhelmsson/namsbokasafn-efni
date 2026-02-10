#!/usr/bin/env node

/**
 * auto-insert-placeholders.js
 *
 * Automatically insert [[MEDIA:n]] and [[TABLE:id]] placeholders into Icelandic segments
 * where the position is unambiguous (beginning, end, or standalone).
 *
 * Usage:
 *   node tools/auto-insert-placeholders.js --chapter <num> [--dry-run]
 */

import fs from 'fs';
import path from 'path';

const BOOKS_DIR = 'books/efnafraedi';

function parseArgs(args) {
  const result = {
    chapter: null,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
  }

  return result;
}

function printHelp() {
  console.log(`
Auto-insert placeholders into translated segments

Usage:
  node tools/auto-insert-placeholders.js --chapter <num> [--dry-run]

Options:
  --chapter <num>  Chapter number to process
  --dry-run        Show what would be changed without modifying files
  -h, --help       Show this help

Examples:
  node tools/auto-insert-placeholders.js --chapter 12 --dry-run
  node tools/auto-insert-placeholders.js --chapter 12
`);
}

/**
 * Parse segment file into a map of segment ID -> text
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
 * Analyze placeholder position in English text
 */
function analyzePlaceholderPosition(text) {
  const placeholders = [];
  const pattern = /\[\[(MEDIA|TABLE):[^\]]+\]\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    placeholders.push({
      placeholder: match[0],
      position: match.index,
      type: match[1],
    });
  }

  if (placeholders.length === 0) {
    return { type: 'none', placeholders: [] };
  }

  // Remove all placeholders to see what's left
  const textWithoutPlaceholders = text.replace(/\[\[(MEDIA|TABLE):[^\]]+\]\]/g, '').trim();

  // Check if segment is ONLY placeholders
  if (textWithoutPlaceholders === '') {
    return { type: 'standalone', placeholders };
  }

  // Check if all placeholders are at the beginning
  const startsWithPlaceholder = /^\[\[(MEDIA|TABLE):[^\]]+\]\]/.test(text);
  const restAfterFirst = text.replace(/^\[\[(MEDIA|TABLE):[^\]]+\]\]\s*/, '');
  const hasMorePlaceholders = /\[\[(MEDIA|TABLE):[^\]]+\]\]/.test(restAfterFirst);

  if (startsWithPlaceholder && !hasMorePlaceholders) {
    return { type: 'beginning', placeholders };
  }

  // Check if all placeholders are at the end
  const endsWithPlaceholder = /\[\[(MEDIA|TABLE):[^\]]+\]\]$/.test(text);
  const textBeforeLast = text.replace(/\s*\[\[(MEDIA|TABLE):[^\]]+\]\]$/, '');
  const hasEarlierPlaceholders = /\[\[(MEDIA|TABLE):[^\]]+\]\]/.test(textBeforeLast);

  if (endsWithPlaceholder && !hasEarlierPlaceholders) {
    return { type: 'end', placeholders };
  }

  // Check if pattern is "(a)[[MEDIA:n]] (b)[[MEDIA:n]]..." (multiple choice with inline images)
  // This is unambiguous - each placeholder goes right after the choice letter
  const choicePattern = /^\([a-f]\)\[\[(MEDIA|TABLE):[^\]]+\]\]\s*/;
  const isMultipleChoice = choicePattern.test(text);
  if (isMultipleChoice) {
    // Verify all placeholders follow this pattern
    const withoutChoices = text.replace(/\([a-f]\)\[\[(MEDIA|TABLE):[^\]]+\]\]\s*/g, '');
    const hasRemainingPlaceholders = /\[\[(MEDIA|TABLE):[^\]]+\]\]/.test(withoutChoices);
    if (!hasRemainingPlaceholders) {
      return { type: 'afterChoice', placeholders };
    }
  }

  // Must be mid-sentence or complex pattern
  return { type: 'manual', placeholders };
}

/**
 * Process a chapter's segments
 */
function processChapter(chapter, dryRun) {
  const chapterStr = String(chapter).padStart(2, '0');

  // Find all modules in the chapter
  const enDir = path.join(BOOKS_DIR, '02-for-mt', `ch${chapterStr}`);
  const faithfulDir = path.join(BOOKS_DIR, '03-faithful', `ch${chapterStr}`);

  // Determine which directory structure is used
  // New chapters (9+): EN in 02-for-mt/, IS in 03-faithful/
  // Old chapters (1-5): both EN and IS in 02-for-mt/
  const isDir = fs.existsSync(faithfulDir) ? faithfulDir : enDir;

  if (!fs.existsSync(enDir)) {
    console.error(`Error: Chapter ${chapter} directory not found: ${enDir}`);
    return;
  }

  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith('-segments.en.md'));

  const stats = {
    modulesProcessed: 0,
    segmentsChecked: 0,
    automatic: 0,
    manual: 0,
    skipped: 0,
  };

  const manualReview = [];

  for (const enFile of enFiles) {
    const moduleId = enFile.replace('-segments.en.md', '');
    const enPath = path.join(enDir, enFile);
    const isPath = path.join(isDir, enFile.replace('.en.md', '.is.md'));

    if (!fs.existsSync(isPath)) {
      console.log(`Skipping ${moduleId}: No Icelandic translation found`);
      stats.skipped++;
      continue;
    }

    // Parse both files
    const enContent = fs.readFileSync(enPath, 'utf-8');
    const isContent = fs.readFileSync(isPath, 'utf-8');

    const enSegments = parseSegments(enContent);
    const isSegments = parseSegments(isContent);

    let modified = false;
    const newIsSegments = new Map(isSegments);

    // Process each English segment with placeholders
    for (const [segId, enText] of enSegments) {
      stats.segmentsChecked++;

      const analysis = analyzePlaceholderPosition(enText);

      if (analysis.type === 'none') continue;

      const isText = isSegments.get(segId);
      if (!isText) {
        console.log(`Warning: Segment ${segId} not found in Icelandic file`);
        continue;
      }

      // Check if placeholder already exists in Icelandic
      if (/\[\[(MEDIA|TABLE):[^\]]+\]\]/.test(isText)) {
        console.log(`Skipping ${segId}: Already has placeholders`);
        continue;
      }

      let newIsText = isText;
      let action = '';

      switch (analysis.type) {
        case 'standalone':
          // Replace entire segment with placeholders
          newIsText = analysis.placeholders.map((p) => p.placeholder).join(' ');
          action = 'AUTOMATIC (standalone)';
          stats.automatic++;
          modified = true;
          break;

        case 'beginning': {
          // Prepend placeholder
          const placeholder = analysis.placeholders[0].placeholder;
          newIsText = `${placeholder} ${isText}`;
          action = 'AUTOMATIC (beginning)';
          stats.automatic++;
          modified = true;
          break;
        }

        case 'end': {
          // Append placeholder(s) - need to handle multiple at end
          const endPlaceholders = analysis.placeholders.map((p) => p.placeholder).join(' ');
          newIsText = `${isText} ${endPlaceholders}`;
          action = 'AUTOMATIC (end)';
          stats.automatic++;
          modified = true;
          break;
        }

        case 'afterChoice': {
          // Pattern: "(a)[[MEDIA:1]] (b)[[MEDIA:2]]..."
          // Insert placeholders after each choice letter in Icelandic text
          newIsText = isText.replace(/\(([a-f])\)\s*/g, (match, letter) => {
            // Find the placeholder for this choice from the English text
            const choiceRegex = new RegExp(`\\(${letter}\\)\\[\\[(MEDIA|TABLE):[^\\]]+\\]\\]`);
            const enMatch = enText.match(choiceRegex);
            if (enMatch) {
              return `(${letter})${enMatch[0].match(/\[\[(MEDIA|TABLE):[^\]]+\]\]/)[0]} `;
            }
            return match;
          });
          action = 'AUTOMATIC (after choice)';
          stats.automatic++;
          modified = true;
          break;
        }

        case 'manual':
          action = 'MANUAL REVIEW NEEDED';
          stats.manual++;
          manualReview.push({
            module: moduleId,
            segmentId: segId,
            enText,
            isText,
            placeholders: analysis.placeholders,
          });
          break;
      }

      if (modified) {
        newIsSegments.set(segId, newIsText);
        console.log(`${action}: ${segId}`);
        if (!dryRun) {
          console.log(`  EN: ${enText.substring(0, 80)}...`);
          console.log(`  IS: ${newIsText.substring(0, 80)}...`);
        }
      } else if (action === 'MANUAL REVIEW NEEDED') {
        console.log(`${action}: ${segId}`);
      }
    }

    // Write modified file
    if (modified && !dryRun) {
      // Reconstruct the file with updated segments
      let newContent = '';
      for (const [segId, text] of newIsSegments) {
        newContent += `<!-- SEG:${segId} -->\n${text}\n\n`;
      }

      fs.writeFileSync(isPath, newContent, 'utf-8');
      console.log(`✓ Updated: ${isPath}\n`);
    }

    stats.modulesProcessed++;
  }

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Modules processed: ${stats.modulesProcessed}`);
  console.log(`Segments checked: ${stats.segmentsChecked}`);
  console.log(`Automatically inserted: ${stats.automatic}`);
  console.log(`Need manual review: ${stats.manual}`);
  console.log(`Skipped: ${stats.skipped}`);

  if (dryRun) {
    console.log('\n(DRY RUN - no files modified)');
  }

  // Print manual review list
  if (manualReview.length > 0) {
    console.log('\n=== MANUAL REVIEW NEEDED ===');
    manualReview.forEach((item) => {
      console.log(`\nModule: ${item.module}`);
      console.log(`Segment: ${item.segmentId}`);
      console.log(`English: ${item.enText}`);
      console.log(`Icelandic: ${item.isText}`);
      console.log(`Placeholders: ${item.placeholders.map((p) => p.placeholder).join(', ')}`);
    });
  }
}

// Main
const args = parseArgs(process.argv.slice(2));

if (args.help || !args.chapter) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

try {
  processChapter(args.chapter, args.dryRun);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
