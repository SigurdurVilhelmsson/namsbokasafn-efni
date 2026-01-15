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

const fs = require('fs');
const path = require('path');

// Directives that can contain nested directives
const CONTAINER_DIRECTIVES = ['practice-problem'];

// Directives that must be nested inside a container
const NESTED_DIRECTIVES = ['answer'];

// Directives that should close after a bullet list ends
const BULLET_LIST_DIRECTIVES = ['learning-objectives'];

// Directives that close after short content (typically 1-3 paragraphs)
const SHORT_CONTENT_DIRECTIVES = ['answer', 'link-to-material'];

// All known directive types
const ALL_DIRECTIVES = [
  'learning-objectives',
  'example',
  'practice-problem',
  'answer',
  'link-to-material',
  'chemistry-everyday',
  'how-science-connects',
  'scientist-spotlight',
  'chapter-overview',
];

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
          return !isBulletPoint(nextLine);
        }
      }
      return true; // End of file after bullets
    }
  }

  // For short content directives: close after content paragraph ends
  if (SHORT_CONTENT_DIRECTIVES.includes(directiveName)) {
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

  // For practice-problem: close if we see a non-nested directive
  if (directiveName === 'practice-problem') {
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
  const lines = content.split('\n');
  const result = [];
  const stack = []; // Stack of {name, state}
  let changes = 0;

  function closeDirective(name) {
    result.push(':::');
    result.push(''); // Blank line after closing
    changes++;
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
        state: { hadBulletPoints: false, hadContent: false }
      });
      result.push(line);
    } else if (directive === 'close') {
      // Found a closing ::: marker
      if (stack.length > 0) {
        stack.pop();
      }
      result.push(line);
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
    changes,
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

  if (dryRun) {
    console.log(`[DRY RUN] Would add ${result.changes} closing marker(s): ${filePath}`);
  } else {
    fs.writeFileSync(filePath, result.content, 'utf8');
    console.log(`Added ${result.changes} closing marker(s): ${filePath}`);
  }

  return { changed: true, changes: result.changes };
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
  let filesChanged = 0;

  for (const file of files) {
    const result = processFile(file, options);
    if (result && result.changed) {
      filesChanged++;
      totalChanges += result.changes;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Files changed: ${filesChanged}`);
  console.log(`Total closing markers added: ${totalChanges}`);
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
