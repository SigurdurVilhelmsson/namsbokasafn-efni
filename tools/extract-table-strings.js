#!/usr/bin/env node

/**
 * extract-table-strings.js
 *
 * Extracts translatable text from table cells for MT translation.
 *
 * Tables contain translatable content like:
 * - Headers: "Substance", "Symbol", "Specific Heat"
 * - Cell values: "helium", "water", "ethanol", "ice"
 *
 * This script:
 * 1. Reads *-protected.json sidecar files
 * 2. Extracts translatable text from table markdown
 * 3. Writes strings to *-table-strings.en.md
 *
 * The markdown format is compatible with Erlendur MT (malstadur.is).
 *
 * Usage:
 *   node tools/extract-table-strings.js <file-protected.json>
 *   node tools/extract-table-strings.js --batch <directory>
 *   node tools/extract-table-strings.js --chapter <book> <chNN>
 *
 * Options:
 *   --batch <dir>     Process all *-protected.json files in directory
 *   --chapter <b> <c> Process chapter (e.g., --chapter efnafraedi 01)
 *   --dry-run         Show what would be extracted without writing
 *   --verbose, -v     Show processing details
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    batch: null,
    chapter: null,
    book: null,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (arg === '--chapter' && args[i + 1] && args[i + 2]) {
      result.book = args[++i];
      result.chapter = args[++i];
    } else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
extract-table-strings.js - Extract translatable text from table cells

Extracts headers and cell values from tables in *-protected.json files
and outputs translatable strings in markdown format for Erlendur MT.

Usage:
  node tools/extract-table-strings.js <file-protected.json> [options]
  node tools/extract-table-strings.js --batch <directory>
  node tools/extract-table-strings.js --chapter <book> <chNN>

Options:
  --batch <dir>       Process all *-protected.json files in directory
  --chapter <b> <c>   Process chapter (e.g., --chapter efnafraedi 01)
  --dry-run           Show what would be extracted without writing files
  --verbose, -v       Show processing details
  -h, --help          Show this help message

Output Files:
  *-table-strings.en.md    Translatable table text in markdown format

Examples:
  # Extract from a single file
  node tools/extract-table-strings.js books/efnafraedi/02-for-mt/ch05/5-1-protected.json

  # Process all tables in a chapter
  node tools/extract-table-strings.js --chapter efnafraedi 05

  # Preview extraction for a directory
  node tools/extract-table-strings.js --batch books/efnafraedi/02-for-mt/ch05/ --dry-run
`);
}

// ============================================================================
// Table Text Extraction
// ============================================================================

/**
 * Check if a cell value is translatable (not just numbers, formulas, or symbols)
 * @param {string} text - The cell text
 * @returns {boolean} True if the text should be translated
 */
function isTranslatable(text) {
  if (!text || text.trim().length === 0) return false;

  const trimmed = text.trim();

  // Skip pure numbers (including decimals and negatives)
  if (/^-?[\d,.\s]+$/.test(trimmed)) return false;

  // Skip chemical formulas: He, H~2~O, CO~2~, etc.
  // These typically have format like X~n~Y or just element symbols
  if (/^[A-Z][a-z]?\d*(\([a-z]\))?$/.test(trimmed)) return false; // Simple: He, Al, Fe
  if (/^[A-Z][a-z]?~\d+~[A-Z]?[a-z]?(\([a-z]\))?$/.test(trimmed)) return false; // H~2~O
  if (/^[A-Z]~?\d*~?[A-Z]?~?\d*~?[A-Z]?~?\d*~?\([a-z]\)$/.test(trimmed)) return false; // Complex formulas

  // Skip state indicators in parentheses: (*g*), (*l*), (*s*)
  if (/^\(\*[a-z]\*\)$/.test(trimmed)) return false;

  // Skip alignment markers
  if (/^:?-+:?$/.test(trimmed)) return false;

  // Skip equation placeholders
  if (/^\[\[EQ:\d+\]\]$/.test(trimmed)) return false;

  // Skip cells that are mostly chemical notation
  // Pattern: optional element, subscript notation, optional state
  if (/^[A-Z][a-z]?(?:~\d+~)?(?:[A-Z][a-z]?(?:~\d+~)?)*(?:\(\*?[a-z]\*?\))?$/.test(trimmed))
    return false;

  // Keep anything with lowercase letters that aren't part of chemical notation
  // Words like "helium", "water", "ethanol" have multiple lowercase letters
  if (/[a-z]{2,}/.test(trimmed) && !/^[A-Z][a-z]$/.test(trimmed)) return true;

  // Keep anything with spaces (multi-word content)
  if (/\s/.test(trimmed)) return true;

  return false;
}

/**
 * Parse a markdown table into rows and cells
 * @param {string} markdown - The table markdown
 * @returns {object} { headers: string[], rows: string[][] }
 */
function parseTable(markdown) {
  const lines = markdown.split('\n').filter((line) => line.trim().startsWith('|'));

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  // Parse a row into cells
  const parseRow = (line) => {
    return line
      .split('|')
      .slice(1, -1) // Remove empty first/last from split
      .map((cell) => cell.trim());
  };

  const headers = parseRow(lines[0]);

  // Skip alignment row (second line with :--- patterns)
  const dataRows = lines.slice(2).map(parseRow);

  return { headers, rows: dataRows };
}

/**
 * Extract translatable strings from a table
 * @param {object} table - Table object from protected.json
 * @param {string} tableId - The table ID (e.g., "TABLE:1")
 * @returns {object} Extracted strings with cell references
 */
function extractTableStrings(table, _tableId) {
  const strings = {
    headers: [],
    cells: [],
  };

  const { headers, rows } = parseTable(table.markdown);

  // Extract translatable headers
  headers.forEach((header, colIndex) => {
    if (isTranslatable(header)) {
      strings.headers.push({
        col: colIndex,
        text: header,
      });
    }
  });

  // Extract translatable cell values
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (isTranslatable(cell)) {
        strings.cells.push({
          row: rowIndex,
          col: colIndex,
          text: cell,
        });
      }
    });
  });

  return strings;
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the strings output file path for a protected.json file
 * @param {string} jsonPath - Path to the protected.json file
 * @returns {string} Path to the strings .en.md file
 */
function getStringsPath(jsonPath) {
  const dir = path.dirname(jsonPath);
  const basename = path.basename(jsonPath, '-protected.json');
  return path.join(dir, `${basename}-table-strings.en.md`);
}

/**
 * Generate translatable strings content in markdown format
 *
 * @param {object} data - The protected.json data
 * @param {object} extractedStrings - Map of table IDs to extracted strings
 * @returns {string} Formatted markdown content for MT
 */
function generateStringsContent(data, extractedStrings) {
  const lines = [];
  const section = data.section || 'unknown';

  lines.push(`# Table Strings - Section ${section}`);
  lines.push('');
  lines.push('Translatable text extracted from tables.');
  lines.push('Translate the text content while preserving the [[markers]].');
  lines.push('');

  let hasContent = false;

  for (const [tableId, strings] of Object.entries(extractedStrings)) {
    if (strings.headers.length === 0 && strings.cells.length === 0) continue;

    hasContent = true;
    // Use [[TABLE:N]] format - double brackets signal MT to not translate
    lines.push(`## [[${tableId}]]`);
    lines.push('');

    // Output headers
    if (strings.headers.length > 0) {
      // Use [[HEADERS]] to protect section marker
      lines.push('### [[HEADERS]]');
      lines.push('');
      strings.headers.forEach((h, _index) => {
        lines.push(`**H${h.col + 1}:** ${h.text}`);
        lines.push('');
      });
    }

    // Output cells
    if (strings.cells.length > 0) {
      // Use [[CELLS]] to protect section marker
      lines.push('### [[CELLS]]');
      lines.push('');
      strings.cells.forEach((c, _index) => {
        // Use R{row}C{col} format for cell reference
        lines.push(`**R${c.row + 1}C${c.col + 1}:** ${c.text}`);
        lines.push('');
      });
    }
  }

  if (!hasContent) {
    return '';
  }

  return lines.join('\n');
}

/**
 * Process a single protected.json file
 * @param {string} filePath - Path to the protected.json file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('-protected.json')) {
    return { success: false, error: 'File must be a protected.json file' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to parse JSON: ${err.message}` };
  }

  if (!data.tables || Object.keys(data.tables).length === 0) {
    if (verbose) {
      console.log(`  No tables in: ${filePath}`);
    }
    return { success: true, stringsExtracted: 0 };
  }

  // Extract strings from each table
  const extractedStrings = {};
  let totalStrings = 0;

  for (const [tableId, table] of Object.entries(data.tables)) {
    const strings = extractTableStrings(table, tableId);
    const count = strings.headers.length + strings.cells.length;
    if (count > 0) {
      extractedStrings[tableId] = strings;
      totalStrings += count;
    }
  }

  if (totalStrings === 0) {
    if (verbose) {
      console.log(`  No translatable text in: ${filePath}`);
    }
    return { success: true, stringsExtracted: 0 };
  }

  const stringsContent = generateStringsContent(data, extractedStrings);
  const stringsPath = getStringsPath(filePath);

  if (dryRun) {
    console.log(
      `[DRY RUN] Would extract ${totalStrings} string(s) from: ${path.basename(filePath)}`
    );
    for (const [tableId, strings] of Object.entries(extractedStrings)) {
      console.log(`  ${tableId}:`);
      if (strings.headers.length > 0) {
        console.log(`    Headers: ${strings.headers.map((h) => `"${h.text}"`).join(', ')}`);
      }
      if (strings.cells.length > 0) {
        const preview = strings.cells
          .slice(0, 5)
          .map((c) => `"${c.text}"`)
          .join(', ');
        const more = strings.cells.length > 5 ? ` (+${strings.cells.length - 5} more)` : '';
        console.log(`    Cells: ${preview}${more}`);
      }
    }
    return { success: true, stringsExtracted: totalStrings, dryRun: true };
  }

  // Write strings file
  fs.writeFileSync(stringsPath, stringsContent);

  if (verbose) {
    console.log(
      `  Extracted ${totalStrings} string(s): ${path.basename(filePath)} -> ${path.basename(stringsPath)}`
    );
  }

  return {
    success: true,
    stringsExtracted: totalStrings,
    stringsPath,
  };
}

/**
 * Find all protected.json files in a directory
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findProtectedFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findProtectedFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('-protected.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process multiple files in batch mode
 * @param {string} directory - Directory to process
 * @param {object} options - Processing options
 */
function processBatch(directory, options) {
  const files = findProtectedFiles(directory);

  if (files.length === 0) {
    console.log(`No *-protected.json files found in ${directory}`);
    return { filesProcessed: 0, totalStrings: 0 };
  }

  console.log(`Found ${files.length} protected file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalStrings = 0;
  let filesWithStrings = 0;

  for (const file of files) {
    const result = processFile(file, options);

    if (result.success && result.stringsExtracted > 0) {
      filesWithStrings++;
      totalStrings += result.stringsExtracted;
      if (!options.verbose && !options.dryRun) {
        console.log(
          `  Extracted ${result.stringsExtracted} string(s): ${path.relative(directory, file)}`
        );
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Table String Extraction Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with translatable strings: ${filesWithStrings}`);
  console.log(`  Total strings extracted: ${totalStrings}`);

  return { filesProcessed: files.length, totalStrings };
}

// ============================================================================
// Exports for programmatic use
// ============================================================================

export {
  processFile,
  processBatch,
  findProtectedFiles,
  extractTableStrings,
  isTranslatable,
  parseTable,
};

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.batch && !args.chapter) {
    console.error('Error: Please provide a file, --batch, or --chapter option');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (args.chapter) {
      const chapterDir = path.join(
        process.cwd(),
        'books',
        args.book,
        '02-for-mt',
        `ch${args.chapter.padStart(2, '0')}`
      );
      processBatch(chapterDir, args);
    } else if (args.batch) {
      processBatch(path.resolve(args.batch), args);
    } else {
      const result = processFile(path.resolve(args.input), args);

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (!args.dryRun && result.stringsExtracted > 0) {
        console.log(`Extracted ${result.stringsExtracted} translatable string(s)`);
        if (result.stringsPath) {
          console.log(`Output: ${result.stringsPath}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Only run main if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
