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
 * 5. Pandoc attributes ({#term-00001}, {#fs-idp...}, {id="..." summary="..."})
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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * A truly orphan ::: is one that appears without a matching opening directive.
 * Valid directives look like: :::name or :::name{attrs}
 * Closing markers (:::) that follow an opening directive should be preserved.
 *
 * NOTE: This function now tracks directive state to avoid removing valid
 * closing markers. Only removes ::: that appear outside any directive block.
 */
function removeOrphanDirectiveMarkers(content) {
  const lines = content.split('\n');
  const result = [];
  let count = 0;
  let directiveDepth = 0; // Track nested directive depth

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line opens a directive (:::name or :::name{attrs})
    if (/^:::[a-zA-Z]/.test(trimmed)) {
      directiveDepth++;
      result.push(line);
      continue;
    }

    // Check if this line is ONLY ::: (closing marker or orphan)
    if (trimmed === ':::') {
      if (directiveDepth > 0) {
        // This is a valid closing marker - keep it
        directiveDepth--;
        result.push(line);
      } else {
        // This is truly orphan (no opening directive) - skip it
        count++;
      }
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
      if (
        nextLine.startsWith('|') ||
        prevLine.startsWith('|') ||
        (prevLine === '' && nextLine === '')
      ) {
        count++;
        continue;
      }
    }

    cleanedLines.push(line);
  }

  result = cleanedLines.join('\n');

  // Also handle inline decorative borders within table context
  // Pattern: long dashes inside content that aren't HR
  result = result.replace(/^(-{50,})$/gm, () => {
    count++;
    return '';
  });

  return { content: result, count };
}

/**
 * Remove orphaned table separator rows
 *
 * In markdown tables, the separator row (| :--- | :--- |) should immediately follow
 * the header row. Orphaned separator rows that appear without a header above them
 * should be removed.
 */
function removeOrphanedTableSeparators(content) {
  const lines = content.split('\n');
  const result = [];
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this is a table separator row (only contains |, :, -, and spaces)
    if (/^\|[\s:|-]+\|$/.test(trimmed) && /:-+/.test(trimmed)) {
      // Check if previous non-empty line is a table header row (starts and ends with |)
      let prevLineIndex = i - 1;
      while (prevLineIndex >= 0 && lines[prevLineIndex].trim() === '') {
        prevLineIndex--;
      }

      const prevLine = prevLineIndex >= 0 ? lines[prevLineIndex].trim() : '';

      // A valid header row should have | delimiters with content between them
      const isValidHeader =
        prevLine.startsWith('|') && prevLine.endsWith('|') && !/^[|\s:-]+$/.test(prevLine); // Not another separator row

      if (!isValidHeader) {
        // This separator row is orphaned - skip it
        count++;
        continue;
      }
    }

    result.push(line);
  }

  return { content: result.join('\n'), count };
}

/**
 * Strip Pandoc-style attributes from content
 *
 * Removes:
 * 1. Inline span IDs: {#term-00005}, {#fs-idp1234567}
 * 2. Table attributes: {#key-equations-table}, {id="..." summary="..."}
 * 3. Figure/equation IDs after $...$ blocks: ${equation}${#fs-id...}
 *
 * These are Pandoc-specific syntax that most markdown renderers don't understand.
 */
function stripPandocAttributes(content) {
  let result = content;
  let count = 0;

  // Pattern 1: Inline span IDs like {#term-00005} or {#fs-idp1234567}
  // These appear after bold terms or inline content
  // Match: {#identifier} where identifier is alphanumeric with hyphens
  const inlineIdPattern = /\{#[a-zA-Z][a-zA-Z0-9_-]*\}/g;
  const inlineMatches = result.match(inlineIdPattern);
  if (inlineMatches) {
    count += inlineMatches.length;
    result = result.replace(inlineIdPattern, '');
  }

  // Pattern 1b: Inline id attributes like {id="term-00014"}
  // These appear after bold terms or inline content
  const inlineIdAttrPattern = /\{id="[^"]*"\}/g;
  const inlineIdAttrMatches = result.match(inlineIdAttrPattern);
  if (inlineIdAttrMatches) {
    count += inlineIdAttrMatches.length;
    result = result.replace(inlineIdAttrPattern, '');
  }

  // Pattern 2: Table attributes like {id="..." summary="..."} or {#id}
  // These appear on a line by themselves after tables
  // Match standalone attribute lines
  const tableAttrPattern =
    /^\{(?:id="[^"]*"(?:\s+summary="[^"]*")?|#[a-zA-Z][a-zA-Z0-9_-]*)\}\s*$/gm;
  const tableMatches = result.match(tableAttrPattern);
  if (tableMatches) {
    count += tableMatches.length;
    result = result.replace(tableAttrPattern, '');
  }

  // Pattern 3: Duplicate equation IDs - ${equation}${#fs-id...}
  // The second $ block with just an ID should be removed
  // Match: $}{#fs-id...} at the end of an equation
  const eqIdPattern = /\$\{#[a-zA-Z][a-zA-Z0-9_-]*\}/g;
  const eqMatches = result.match(eqIdPattern);
  if (eqMatches) {
    count += eqMatches.length;
    result = result.replace(eqIdPattern, '$');
  }

  // Clean up any resulting double blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return { content: result, count };
}

/**
 * Simplify and fix braces in LaTeX display equations
 *
 * The CNXML-to-markdown conversion sometimes generates equations with:
 * 1. Redundant outer braces like $${{C}_{...}=...}}$$
 * 2. Extra closing braces that cause KaTeX parse errors
 *
 * This function:
 * - Removes one layer of outer braces when equation starts with {{ and ends with }}
 * - Removes extra closing braces when equation has more closes than opens
 */
function simplifyEquationBraces(content) {
  let count = 0;

  // Match display math blocks: $$...$$
  const result = content.replace(/\$\$([^$]+)\$\$/g, (match, eqContent) => {
    let modified = eqContent;
    let changed = false;

    // Step 1: Remove redundant outer braces ({{...}} → {...})
    if (modified.startsWith('{{') && modified.endsWith('}}')) {
      modified = modified.slice(1, -1);
      changed = true;
    }

    // Step 2: Count and fix unbalanced braces
    // Count braces, ignoring escaped ones (\{ \})
    let opens = 0;
    let closes = 0;
    let i = 0;
    while (i < modified.length) {
      if (
        modified[i] === '\\' &&
        i + 1 < modified.length &&
        (modified[i + 1] === '{' || modified[i + 1] === '}')
      ) {
        // Skip escaped brace
        i += 2;
        continue;
      }
      if (modified[i] === '{') opens++;
      if (modified[i] === '}') closes++;
      i++;
    }

    // If there are extra closing braces, remove them from the end
    if (closes > opens) {
      const excess = closes - opens;
      // Remove excess closing braces from the end
      let trimCount = 0;
      for (let j = modified.length - 1; j >= 0 && trimCount < excess; j--) {
        if (modified[j] === '}') {
          // Check it's not escaped
          let escapeCount = 0;
          let k = j - 1;
          while (k >= 0 && modified[k] === '\\') {
            escapeCount++;
            k--;
          }
          if (escapeCount % 2 === 0) {
            // Not escaped, remove it
            modified = modified.substring(0, j) + modified.substring(j + 1);
            trimCount++;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      count++;
      return `$$${modified}$$`;
    }

    return match;
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

  const stats = {
    mspace: 0,
    orphanDirectives: 0,
    escapedTildes: 0,
    tableArtifacts: 0,
    orphanedTableSeparators: 0,
    pandocAttributes: 0,
    simplifiedEquations: 0,
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

  result = removeOrphanedTableSeparators(content);
  content = result.content;
  stats.orphanedTableSeparators = result.count;

  result = stripPandocAttributes(content);
  content = result.content;
  stats.pandocAttributes = result.count;

  result = simplifyEquationBraces(content);
  content = result.content;
  stats.simplifiedEquations = result.count;

  const totalChanges =
    stats.mspace +
    stats.orphanDirectives +
    stats.escapedTildes +
    stats.tableArtifacts +
    stats.orphanedTableSeparators +
    stats.pandocAttributes +
    stats.simplifiedEquations;

  if (totalChanges === 0) {
    if (verbose) {
      console.log(`No changes needed: ${filePath}`);
    }
    return { changed: false, stats };
  }

  if (verbose || dryRun) {
    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Processing: ${filePath}`);
    if (stats.mspace > 0) console.log(`  - \\mspace commands: ${stats.mspace}`);
    if (stats.orphanDirectives > 0)
      console.log(`  - Orphan ::: markers: ${stats.orphanDirectives}`);
    if (stats.escapedTildes > 0) console.log(`  - Escaped tildes: ${stats.escapedTildes}`);
    if (stats.tableArtifacts > 0) console.log(`  - Table artifacts: ${stats.tableArtifacts}`);
    if (stats.orphanedTableSeparators > 0)
      console.log(`  - Orphaned table separators: ${stats.orphanedTableSeparators}`);
    if (stats.pandocAttributes > 0) console.log(`  - Pandoc attributes: ${stats.pandocAttributes}`);
    if (stats.unbalancedBraces > 0)
      console.log(`  - Simplified equations: ${stats.unbalancedBraces}`);
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
  const { dryRun } = options;

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
    orphanedTableSeparators: 0,
    pandocAttributes: 0,
    simplifiedEquations: 0,
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
          totals.orphanedTableSeparators += result.stats.orphanedTableSeparators;
          totals.pandocAttributes += result.stats.pandocAttributes;
          totals.simplifiedEquations += result.stats.simplifiedEquations;
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
  console.log(`    - Orphaned table separators: ${totals.orphanedTableSeparators}`);
  console.log(`    - Pandoc attributes: ${totals.pandocAttributes}`);
  console.log(`    - Simplified equations: ${totals.simplifiedEquations}`);
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
  5. Pandoc attributes stripped ({#term-00001}, {#fs-idp...}, {id="..." summary="..."})

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

      const books = fs
        .readdirSync(booksDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

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
