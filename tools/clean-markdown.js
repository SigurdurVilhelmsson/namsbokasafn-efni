#!/usr/bin/env node

/**
 * clean-markdown.js
 *
 * Post-processing script to clean markdown files from Pandoc artifacts
 * for the Chemistry Reader publication system.
 *
 * Fixes:
 * 1. LaTeX \mspace{Xmu} commands -> KaTeX equivalents
 * 2. Orphan ::: directive markers
 * 3. Escaped tildes meant for subscripts
 * 4. Pandoc table border artifacts
 *
 * Usage:
 *   node tools/clean-markdown.js <file.md>
 *   node tools/clean-markdown.js --batch <directory>
 *   node tools/clean-markdown.js --all    # Process all mt-preview files
 *
 * Options:
 *   --dry-run   Show changes without writing
 *   --verbose   Show detailed processing info
 *   -h, --help  Show help
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Replace LaTeX \mspace{Xmu} commands with KaTeX-compatible equivalents
 *
 * | Pandoc          | KaTeX   | Description        |
 * |-----------------|---------|-------------------|
 * | \mspace{3mu}    | \,      | thin space        |
 * | \mspace{4mu}    | \:      | medium space      |
 * | \mspace{5mu}    | \;      | thick space       |
 * | \mspace{6mu}    | \;\,    | thick + thin      |
 * | \mspace{18mu}   | \quad   | quad space        |
 */
function fixMspaceCommands(content) {
  const replacements = {
    '\\mspace{3mu}': '\\,',
    '\\mspace{4mu}': '\\:',
    '\\mspace{5mu}': '\\;',
    '\\mspace{6mu}': '\\;\\,',
    '\\mspace{18mu}': '\\quad',
  };

  let result = content;
  let count = 0;

  // Replace known mspace values
  for (const [pandoc, katex] of Object.entries(replacements)) {
    const regex = new RegExp(escapeRegex(pandoc), 'g');
    const matches = result.match(regex);
    if (matches) {
      count += matches.length;
      result = result.replace(regex, katex);
    }
  }

  // Handle any remaining \mspace{Xmu} patterns with approximate replacement
  // Default to thin space for unknown values
  const remainingPattern = /\\mspace\{(\d+)mu\}/g;
  let match;
  while ((match = remainingPattern.exec(result)) !== null) {
    const muValue = parseInt(match[1], 10);
    let replacement;

    if (muValue <= 3) {
      replacement = '\\,';
    } else if (muValue <= 5) {
      replacement = '\\;';
    } else if (muValue <= 9) {
      replacement = '\\;\\,';
    } else {
      replacement = '\\quad';
    }

    count++;
    result = result.replace(match[0], replacement);
    remainingPattern.lastIndex = 0; // Reset after replacement
  }

  return { content: result, count };
}

/**
 * Remove orphan ::: directive markers
 *
 * A ::: on its own line that doesn't open a new directive should be removed.
 * Valid directives look like: :::name or :::name{attrs}
 * Orphan markers are just ::: with possible whitespace.
 */
function removeOrphanDirectiveMarkers(content) {
  const lines = content.split('\n');
  const result = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line is ONLY ::: (with possible whitespace)
    // A valid directive would be :::name or :::name{...}
    if (trimmed === ':::') {
      // This is an orphan marker - skip it
      count++;
      continue;
    }

    result.push(line);
  }

  return { content: result.join('\n'), count };
}

/**
 * Fix escaped tildes that should be subscript markers
 *
 * \~ followed by alphanumeric content should be ~ for subscript syntax
 */
function fixEscapedTildes(content) {
  let count = 0;

  // Pattern: \~ followed by word character (should be subscript)
  // This handles cases like (\~10^−3^) -> (~10^−3^)
  const result = content.replace(/\\~(\w)/g, (match, char) => {
    count++;
    return `~${char}`;
  });

  return { content: result, count };
}

/**
 * Clean Pandoc table border artifacts
 *
 * Removes decorative horizontal rules around tables and normalizes table format
 */
function cleanTableArtifacts(content) {
  let result = content;
  let count = 0;

  // Remove lines that are just dashes (50+ chars) often used as table borders
  // But preserve valid markdown horizontal rules (--- alone on a line)
  const lines = result.split('\n');
  const cleanedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this is a long dash line (likely a Pandoc table border)
    if (/^-{20,}$/.test(trimmed)) {
      // Check context - is this near a table?
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';

      // If next line starts with | it's a table header border - remove
      // If prev line starts with | it's a table footer border - remove
      if (nextLine.startsWith('|') || prevLine.startsWith('|') || prevLine === '' && nextLine === '') {
        count++;
        continue;
      }
    }

    cleanedLines.push(line);
  }

  result = cleanedLines.join('\n');

  // Also handle inline decorative borders within table context
  // Pattern: long dashes inside content that aren't HR
  result = result.replace(/^(-{50,})$/gm, (match) => {
    count++;
    return '';
  });

  return { content: result, count };
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process a single markdown file
 */
function processFile(filePath, options) {
  const { verbose, dryRun } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!filePath.endsWith('.md')) {
    if (verbose) {
      console.log(`Skipping non-markdown file: ${filePath}`);
    }
    return null;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  const stats = {
    mspace: 0,
    orphanDirectives: 0,
    escapedTildes: 0,
    tableArtifacts: 0,
  };

  // Apply all fixes
  let result;

  result = fixMspaceCommands(content);
  content = result.content;
  stats.mspace = result.count;

  result = removeOrphanDirectiveMarkers(content);
  content = result.content;
  stats.orphanDirectives = result.count;

  result = fixEscapedTildes(content);
  content = result.content;
  stats.escapedTildes = result.count;

  result = cleanTableArtifacts(content);
  content = result.content;
  stats.tableArtifacts = result.count;

  const totalChanges = stats.mspace + stats.orphanDirectives + stats.escapedTildes + stats.tableArtifacts;

  if (totalChanges === 0) {
    if (verbose) {
      console.log(`No changes needed: ${filePath}`);
    }
    return { changed: false, stats };
  }

  if (verbose || dryRun) {
    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Processing: ${filePath}`);
    if (stats.mspace > 0) console.log(`  - \\mspace commands: ${stats.mspace}`);
    if (stats.orphanDirectives > 0) console.log(`  - Orphan ::: markers: ${stats.orphanDirectives}`);
    if (stats.escapedTildes > 0) console.log(`  - Escaped tildes: ${stats.escapedTildes}`);
    if (stats.tableArtifacts > 0) console.log(`  - Table artifacts: ${stats.tableArtifacts}`);
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, content, 'utf8');
    if (!verbose) {
      console.log(`Fixed ${totalChanges} issue(s): ${filePath}`);
    }
  }

  return { changed: true, stats };
}

/**
 * Find all markdown files in a directory recursively
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
function processBatch(directory, options) {
  const { verbose, dryRun } = options;

  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
  }

  const files = findMarkdownFiles(directory);

  if (files.length === 0) {
    console.log(`No markdown files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} markdown file(s) in ${directory}`);
  if (dryRun) {
    console.log('[DRY RUN MODE]');
  }

  const totals = {
    filesProcessed: 0,
    filesChanged: 0,
    mspace: 0,
    orphanDirectives: 0,
    escapedTildes: 0,
    tableArtifacts: 0,
  };

  for (const file of files) {
    try {
      const result = processFile(file, options);
      if (result) {
        totals.filesProcessed++;
        if (result.changed) {
          totals.filesChanged++;
          totals.mspace += result.stats.mspace;
          totals.orphanDirectives += result.stats.orphanDirectives;
          totals.escapedTildes += result.stats.escapedTildes;
          totals.tableArtifacts += result.stats.tableArtifacts;
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Processing Complete');
  console.log(`  Files processed: ${totals.filesProcessed}`);
  console.log(`  Files changed: ${totals.filesChanged}`);
  console.log(`  Total fixes:`);
  console.log(`    - \\mspace commands: ${totals.mspace}`);
  console.log(`    - Orphan ::: markers: ${totals.orphanDirectives}`);
  console.log(`    - Escaped tildes: ${totals.escapedTildes}`);
  console.log(`    - Table artifacts: ${totals.tableArtifacts}`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

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
    } else if (!arg.startsWith('-')) {
      if (!result.input) {
        result.input = arg;
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
clean-markdown.js - Clean Pandoc artifacts from markdown files

Usage:
  node tools/clean-markdown.js <file.md>
  node tools/clean-markdown.js --batch <directory>
  node tools/clean-markdown.js --all

Arguments:
  file.md       Path to a single markdown file to process

Options:
  --batch <dir>  Process all .md files in directory recursively
  --all          Process all files in books/*/05-publication/mt-preview/
  --dry-run      Show what would be changed without writing files
  --verbose, -v  Show detailed processing information
  -h, --help     Show this help message

Fixes Applied:
  1. LaTeX \\mspace{Xmu} -> KaTeX equivalents (\\, \\: \\; \\quad)
  2. Orphan ::: directive markers removed
  3. Escaped tildes (\\~) fixed for subscript syntax
  4. Pandoc table border artifacts cleaned

Examples:
  # Single file
  node tools/clean-markdown.js books/efnafraedi/05-publication/mt-preview/ch02/2.1.md

  # Preview changes without writing
  node tools/clean-markdown.js --batch ./content --dry-run

  # Process all mt-preview files across all books
  node tools/clean-markdown.js --all --verbose
`);
}

// ============================================================================
// Main
// ============================================================================

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
      // Find all books and process their mt-preview folders
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
      if (!batchDir) {
        console.error('Error: --batch requires a directory path');
        process.exit(1);
      }
      processBatch(path.resolve(batchDir), args);
    } else {
      const result = processFile(path.resolve(args.input), args);
      if (!result) {
        console.log('File skipped (not a markdown file)');
      } else if (!result.changed) {
        console.log('No changes needed');
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
