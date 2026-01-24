#!/usr/bin/env node

/**
 * repair-directives.js
 *
 * Repairs markdown files that have unclosed directive blocks by adding
 * missing ::: closing markers.
 *
 * The directive structure in these files follows these patterns:
 * - :::learning-objectives -> closes after bullet list ends
 * - :::example -> closes before :::practice-problem or next example
 * - :::practice-problem -> contains :::answer, closes after answer ends
 * - :::answer -> closes at end of its content
 * - :::link-to-material -> closes after its content
 * - :::chemistry-everyday, :::how-science-connects -> closes before next directive or section
 * - :::chapter-overview -> closes after its content
 * - :::scientist-spotlight -> closes before next directive or section
 *
 * Usage:
 *   node tools/repair-directives.js <file.md>
 *   node tools/repair-directives.js --batch <directory>
 *   node tools/repair-directives.js --all
 *   node tools/repair-directives.js --all --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directives that can contain nested directives
// Includes æfingadæmi (Icelandic alias for practice-problem)
const CONTAINER_DIRECTIVES = ['practice-problem', 'æfingadæmi'];

// Directives that must be nested inside a container
// Includes svar (Icelandic alias for answer)
const NESTED_DIRECTIVES = ['answer', 'svar'];

// Directives that should close after a bullet list ends
const BULLET_LIST_DIRECTIVES = ['learning-objectives'];

// Directives that close after short content (typically 1-3 paragraphs)
// Includes svar (Icelandic alias for answer)
const SHORT_CONTENT_DIRECTIVES = ['answer', 'svar', 'link-to-material'];

// All known directive types (includes Icelandic aliases)
const ALL_DIRECTIVES = [
  'learning-objectives',
  'example',
  'practice-problem',
  'æfingadæmi',  // Icelandic alias for practice-problem
  'answer',
  'svar',         // Icelandic alias for answer
  'link-to-material',
  'chemistry-everyday',
  'how-science-connects',
  'scientist-spotlight',
  'chapter-overview',
];

/**
 * Pre-process content to fix MT artifacts where ::: markers are merged with content.
 * Erlendur MT often puts closing ::: on the same line as content.
 * Examples:
 *   "Some content :::" → "Some content\n:::"
 *   "::: :::" → ":::\n:::"
 *   "content ::: :::" → "content\n:::\n:::"
 *   ":::note content :::" → ":::note content\n:::"
 *   ":::note ::: " → ":::note\n:::"
 *   ":::note content ::: :::warning more :::" → multiple lines
 */
function fixMergedDirectiveMarkers(content, verbose = false) {
  let fixCount = 0;
  const lines = content.split('\n');
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      result.push(line);
      continue;
    }

    // Check if line has any ::: markers
    if (!trimmed.includes(':::')) {
      result.push(line);
      continue;
    }

    // Split line by ::: and process each part
    // This handles all cases: opening directives, content, closing markers
    const parts = trimmed.split(/(\s*:::)/);
    const outputParts = [];
    let currentPart = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      if (part === ':::') {
        // This is a ::: marker
        // Check if next part is a directive name (e.g., "note", "example")
        const nextPart = parts[i + 1] ? parts[i + 1].trim() : '';
        const directiveMatch = nextPart.match(/^([a-zA-Z][-a-zA-Z0-9]*)(\{[^}]*\})?(.*)/);

        if (directiveMatch) {
          // This is an opening directive
          if (currentPart) {
            // Output any accumulated content first
            outputParts.push(currentPart);
            currentPart = '';
            fixCount++;
          }

          const directiveName = directiveMatch[1];
          const directiveAttrs = directiveMatch[2] || '';
          const afterDirective = directiveMatch[3] ? directiveMatch[3].trim() : '';

          if (afterDirective) {
            // Content follows the directive opening on the same line
            outputParts.push(`:::${directiveName}${directiveAttrs}`);
            currentPart = afterDirective;
            fixCount++;
          } else {
            // Just the directive opening
            outputParts.push(`:::${directiveName}${directiveAttrs}`);
          }
          i++; // Skip the next part since we consumed it
        } else {
          // This is a closing :::
          if (currentPart) {
            // Output any accumulated content first
            outputParts.push(currentPart);
            currentPart = '';
            fixCount++;
          }
          outputParts.push(':::');
        }
      } else if (part) {
        // This is content
        if (currentPart) {
          currentPart += ' ' + part;
        } else {
          currentPart = part;
        }
      }
    }

    // Don't forget any remaining content
    if (currentPart) {
      outputParts.push(currentPart);
    }

    // Add all output parts as separate lines
    for (const part of outputParts) {
      result.push(part);
    }
  }

  if (verbose && fixCount > 0) {
    console.log(`  Fixed ${fixCount} merged ::: marker(s)`);
  }

  return {
    content: result.join('\n'),
    fixCount
  };
}

/**
 * Parse a directive line and extract the directive name
 */
function parseDirective(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^:::([a-zA-Z][-a-zA-Z0-9]*)/);
  if (match) {
    return match[1];
  }
  if (trimmed === ':::') {
    return 'close';
  }
  return null;
}

/**
 * Check if a line is a bullet point
 */
function isBulletPoint(line) {
  return /^\s*[-*+]\s+/.test(line);
}

/**
 * Check if a line is a heading
 */
function isHeading(line) {
  return /^#{1,6}\s+/.test(line.trim());
}

/**
 * Check if a line is empty or whitespace only
 */
function isEmptyLine(line) {
  return line.trim() === '';
}

/**
 * Check if a line contains a hyperlink
 */
function containsLink(line) {
  return /\[([^\]]+)\]\(https?:\/\/[^)]+\)/.test(line);
}

/**
 * Check if a line looks like a figure caption (Mynd X.Y)
 */
function isFigureCaption(line) {
  return /^Mynd\s+\d+\.\d+/.test(line.trim());
}

/**
 * Check if a line is a section heading (### level, indicating main content)
 */
function isSectionHeading(line) {
  return /^###\s+(?!Dæmi|Lausn)/.test(line.trim());
}

/**
 * Detect natural end of directive content
 */
function shouldCloseDirective(directiveName, currentLine, nextLines, state) {
  const trimmed = currentLine.trim();

  // Check if next line is a new directive (except for nested ones)
  if (nextLines.length > 0) {
    const nextDirective = parseDirective(nextLines[0]);
    if (nextDirective && nextDirective !== 'close') {
      // If next is a nested directive and we're in a container, don't close
      if (NESTED_DIRECTIVES.includes(nextDirective) &&
          CONTAINER_DIRECTIVES.includes(directiveName)) {
        return false;
      }
      return true;
    }
  }

  // For learning-objectives: close when bullet list ends
  if (BULLET_LIST_DIRECTIVES.includes(directiveName)) {
    if (state.hadBulletPoints && isEmptyLine(currentLine)) {
      // Check if next non-empty line is NOT a bullet
      for (const nextLine of nextLines) {
        if (!isEmptyLine(nextLine)) {
          // If already has a closing marker, don't add another
          const nextDirective = parseDirective(nextLine);
          if (nextDirective === 'close') {
            return false;
          }
          return !isBulletPoint(nextLine);
        }
      }
      return true; // End of file after bullets
    }
  }

  // For link-to-material: close after paragraph with a link ends
  // These boxes are meant to contain a link encouraging readers to learn more
  if (directiveName === 'link-to-material') {
    if (state.hadLinkContent && isEmptyLine(currentLine)) {
      // Check if next non-empty line is regular body content (no link)
      for (const nextLine of nextLines) {
        if (!isEmptyLine(nextLine)) {
          const nextDirective = parseDirective(nextLine);
          // If already has a closing marker, don't add another
          if (nextDirective === 'close') {
            break;
          }
          if (nextDirective) {
            return true;
          }
          if (isHeading(nextLine)) {
            return true;
          }
          // If next paragraph doesn't contain a link, we've left the box
          if (!containsLink(nextLine)) {
            return true;
          }
          break;
        }
      }
    }
  }

  // For chemistry-everyday and similar boxes: close before main section headings or other directives
  // Note: Figure captions (Mynd X.Y) can be INSIDE these boxes, so don't close before them
  if (directiveName === 'chemistry-everyday' || directiveName === 'how-science-connects') {
    if (state.hadContent && isEmptyLine(currentLine)) {
      for (const nextLine of nextLines) {
        if (!isEmptyLine(nextLine)) {
          const nextDirective = parseDirective(nextLine);
          // If already has a closing marker, don't add another
          if (nextDirective === 'close') {
            break;
          }
          if (nextDirective) {
            return true;
          }
          // Close before main section headings (### but not #### subsection headings)
          if (isSectionHeading(nextLine)) {
            return true;
          }
          break;
        }
      }
    }
  }

  // For other short content directives (answer/svar): close after content paragraph ends
  if (directiveName === 'answer' || directiveName === 'svar') {
    if (state.hadContent && isEmptyLine(currentLine)) {
      // Check if next non-empty line is regular paragraph (not indented, not bullet)
      for (const nextLine of nextLines) {
        if (!isEmptyLine(nextLine)) {
          const nextDirective = parseDirective(nextLine);
          if (nextDirective && nextDirective !== 'close') {
            return true;
          }
          // If it's a heading, close
          if (isHeading(nextLine)) {
            return true;
          }
          break;
        }
      }
    }
  }

  // For practice-problem/æfingadæmi: close if we see a non-nested directive
  if (directiveName === 'practice-problem' || directiveName === 'æfingadæmi') {
    if (nextLines.length > 0) {
      const nextDirective = parseDirective(nextLines[0]);
      if (nextDirective && nextDirective !== 'close' && !NESTED_DIRECTIVES.includes(nextDirective)) {
        return true;
      }
    }
  }

  // For example: close before practice-problem or another example
  if (directiveName === 'example') {
    if (nextLines.length > 0) {
      const nextDirective = parseDirective(nextLines[0]);
      if (nextDirective === 'practice-problem' || nextDirective === 'example') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Repair unclosed directives in content
 */
function repairDirectives(content, verbose = false) {
  // First, fix any merged ::: markers from MT
  const mergeResult = fixMergedDirectiveMarkers(content, verbose);
  content = mergeResult.content;
  const mergedMarkersFixes = mergeResult.fixCount;

  const lines = content.split('\n');
  const result = [];
  const stack = []; // Stack of {name, state}
  let addedClosings = 0;
  let removedOrphans = 0;

  function closeDirective(name) {
    result.push(':::');
    result.push(''); // Blank line after closing
    addedClosings++;
    if (verbose) {
      console.log(`  + Added closing ::: for :::${name} at line ${result.length - 1}`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const directive = parseDirective(line);
    const nextLines = lines.slice(i + 1);

    // Update state for current directive
    if (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (isBulletPoint(line)) {
        current.state.hadBulletPoints = true;
      }
      if (!isEmptyLine(line) && !parseDirective(line)) {
        current.state.hadContent = true;
        if (containsLink(line)) {
          current.state.hadLinkContent = true;
        }
      }
    }

    if (directive && directive !== 'close') {
      // Opening a new directive
      const isNested = NESTED_DIRECTIVES.includes(directive);

      if (!isNested) {
        // Close all open directives before opening a non-nested one
        while (stack.length > 0) {
          const open = stack.pop();
          closeDirective(open.name);
        }
      } else {
        // For nested directives like :::answer, close other nested ones but keep container
        while (stack.length > 0 && NESTED_DIRECTIVES.includes(stack[stack.length - 1].name)) {
          const open = stack.pop();
          closeDirective(open.name);
        }
      }

      stack.push({
        name: directive,
        state: { hadBulletPoints: false, hadContent: false, hadLinkContent: false }
      });
      result.push(line);
    } else if (directive === 'close') {
      // Found a closing ::: marker
      if (stack.length > 0) {
        stack.pop();
        result.push(line);
      } else {
        // Orphaned closing - skip it
        removedOrphans++;
        if (verbose) {
          console.log(`  - Removed orphaned ::: at line ${i + 1}`);
        }
      }
    } else {
      // Regular line - check if we should close the current directive
      result.push(line);

      if (stack.length > 0) {
        const current = stack[stack.length - 1];

        // Update state after adding the line
        if (isBulletPoint(line)) {
          current.state.hadBulletPoints = true;
        }
        if (!isEmptyLine(line)) {
          current.state.hadContent = true;
        }

        if (shouldCloseDirective(current.name, line, nextLines, current.state)) {
          const open = stack.pop();
          closeDirective(open.name);
        }
      }
    }
  }

  // Close any remaining open directives at end of file
  while (stack.length > 0) {
    const open = stack.pop();
    closeDirective(open.name);
  }

  return {
    content: result.join('\n'),
    changes: addedClosings + removedOrphans + mergedMarkersFixes,
    addedClosings,
    removedOrphans,
    mergedMarkersFixes,
  };
}

/**
 * Process a single file
 */
function processFile(filePath, options = {}) {
  const { verbose, dryRun } = options;

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  if (!filePath.endsWith('.md')) {
    if (verbose) {
      console.log(`Skipping non-markdown file: ${filePath}`);
    }
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  if (verbose) {
    console.log(`\nProcessing: ${filePath}`);
  }

  const result = repairDirectives(content, verbose);

  if (result.changes === 0) {
    if (verbose) {
      console.log('  No repairs needed');
    }
    return { changed: false, changes: 0 };
  }

  const parts = [];
  if (result.mergedMarkersFixes > 0) {
    parts.push(`${result.mergedMarkersFixes} merged marker(s) split`);
  }
  if (result.addedClosings > 0) {
    parts.push(`${result.addedClosings} closing marker(s) added`);
  }
  if (result.removedOrphans > 0) {
    parts.push(`${result.removedOrphans} orphan(s) removed`);
  }
  const changeDesc = parts.join(', ');

  if (dryRun) {
    console.log(`[DRY RUN] ${changeDesc}: ${filePath}`);
  } else {
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`${changeDesc}: ${filePath}`);
  }

  return { changed: true, changes: result.changes, addedClosings: result.addedClosings, removedOrphans: result.removedOrphans, mergedMarkersFixes: result.mergedMarkersFixes };
}

/**
 * Find all markdown files recursively
 */
function findMarkdownFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process all files in a directory
 */
function processBatch(directory, options = {}) {
  const files = findMarkdownFiles(directory);

  if (files.length === 0) {
    console.log(`No markdown files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} markdown file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }

  let totalChanges = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalMergedSplit = 0;
  let filesChanged = 0;

  for (const file of files) {
    const result = processFile(file, options);
    if (result && result.changed) {
      filesChanged++;
      totalChanges += result.changes;
      totalAdded += result.addedClosings || 0;
      totalRemoved += result.removedOrphans || 0;
      totalMergedSplit += result.mergedMarkersFixes || 0;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Files changed: ${filesChanged}`);
  console.log(`Total merged markers split: ${totalMergedSplit}`);
  console.log(`Total closing markers added: ${totalAdded}`);
  console.log(`Total orphaned markers removed: ${totalRemoved}`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const result = {
    input: null,
    batch: false,
    batchDir: null,
    all: false,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--all') {
      result.all = true;
    } else if (arg === '--batch') {
      result.batch = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.batchDir = args[++i];
      }
    } else if (!arg.startsWith('-') && !result.input) {
      result.input = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
repair-directives.js - Add missing closing ::: markers to directive blocks

Usage:
  node tools/repair-directives.js <file.md>
  node tools/repair-directives.js --batch <directory>
  node tools/repair-directives.js --all

Options:
  --batch <dir>  Process all .md files in directory recursively
  --all          Process all files in books/*/05-publication/mt-preview/
  --dry-run      Show what would be changed without writing files
  --verbose, -v  Show detailed processing information
  -h, --help     Show this help message

Examples:
  # Single file
  node tools/repair-directives.js file.md

  # Preview all changes
  node tools/repair-directives.js --all --dry-run

  # Fix all files
  node tools/repair-directives.js --all
`);
}

// Main
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.batch && !args.all) {
    printHelp();
    process.exit(1);
  }

  try {
    if (args.all) {
      const projectRoot = path.resolve(__dirname, '..');
      const booksDir = path.join(projectRoot, 'books');

      if (!fs.existsSync(booksDir)) {
        console.error('Error: books/ directory not found');
        process.exit(1);
      }

      const books = fs.readdirSync(booksDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const book of books) {
        const mtPreviewDir = path.join(booksDir, book, '05-publication', 'mt-preview');
        if (fs.existsSync(mtPreviewDir)) {
          console.log(`\n${'='.repeat(50)}`);
          console.log(`Processing: ${book}`);
          console.log(`${'='.repeat(50)}`);
          processBatch(mtPreviewDir, args);
        }
      }
    } else if (args.batch) {
      const batchDir = args.batchDir || args.input;
      processBatch(path.resolve(batchDir), args);
    } else {
      processFile(path.resolve(args.input), args);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
