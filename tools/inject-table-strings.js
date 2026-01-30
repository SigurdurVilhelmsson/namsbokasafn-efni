#!/usr/bin/env node

/**
 * inject-table-strings.js
 *
 * Injects translated text back into table cells in protected.json.
 *
 * This script takes translated *-table-strings.is.md files and
 * replaces the original cell content in protected.json with
 * the translated versions.
 *
 * Usage:
 *   node tools/inject-table-strings.js <file-table-strings.is.md>
 *   node tools/inject-table-strings.js --batch <directory>
 *   node tools/inject-table-strings.js --chapter <book> <chNN>
 *
 * Options:
 *   --batch <dir>     Process all *-table-strings.is.md files in directory
 *   --chapter <b> <c> Process chapter (e.g., --chapter efnafraedi 01)
 *   --output <dir>    Output directory (default: same as input for 02-mt-output)
 *   --dry-run         Show what would change without writing
 *   --verbose, -v     Show processing details
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    batch: null,
    chapter: null,
    book: null,
    output: null,
    dryRun: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--chapter' && args[i + 1] && args[i + 2]) {
      result.book = args[++i];
      result.chapter = args[++i];
    }
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
inject-table-strings.js - Inject translated text into table cells

Takes translated *-table-strings.is.md files and replaces the original
cell content in protected.json with translated versions.

Usage:
  node tools/inject-table-strings.js <file-table-strings.is.md> [options]
  node tools/inject-table-strings.js --batch <directory>
  node tools/inject-table-strings.js --chapter <book> <chNN>

Options:
  --batch <dir>       Process all *-table-strings.is.md files in directory
  --chapter <b> <c>   Process chapter (e.g., --chapter efnafraedi 01)
  --output <dir>      Output directory (default: same directory for 02-mt-output)
  --dry-run           Show what would change without writing files
  --verbose, -v       Show processing details
  -h, --help          Show this help message

Input Files:
  *-table-strings.is.md    Translated table strings (from MT)

Output Files:
  *-protected.json         Updated protected.json with translated table content

Examples:
  # Inject translations into a single file
  node tools/inject-table-strings.js books/efnafraedi/02-mt-output/ch05/5-1-table-strings.is.md

  # Process all translated strings in a chapter
  node tools/inject-table-strings.js --chapter efnafraedi 05

  # Preview changes without writing
  node tools/inject-table-strings.js --batch books/efnafraedi/02-mt-output/ch05/ --dry-run
`);
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse translated table strings from markdown file
 *
 * Expected format:
 *   # Table Strings - Section X.X
 *   ...
 *   ## TABLE:1
 *
 *   ### Headers
 *
 *   **H1:** translated header
 *
 *   ### Cells
 *
 *   **R1C1:** translated cell
 *
 * @param {string} content - The markdown content
 * @returns {object} Map of table IDs to translated strings
 */
function parseTranslatedStrings(content) {
  const result = {};
  let currentTable = null;
  let currentSection = null;  // 'headers' or 'cells'

  const lines = content.split('\n');

  for (const line of lines) {
    // Match table header in multiple formats:
    // - Protected: ## [[TABLE:N]]
    // - Legacy EN: ## TABLE:N
    // - Legacy IS: ## TAFLA:N (Icelandic translation of legacy format)
    const tableMatch = line.match(/^##\s+(?:\[\[)?(?:TABLE|TAFLA):(\d+)(?:\]\])?/);
    if (tableMatch) {
      currentTable = `TABLE:${tableMatch[1]}`; // Normalize to TABLE:N
      result[currentTable] = { headers: {}, cells: {} };
      currentSection = null;
      continue;
    }

    // Match section header in multiple formats:
    // - Protected: ### [[HEADERS]] / ### [[CELLS]]
    // - Legacy EN: ### Headers / ### Cells
    // - Legacy IS: ### Fyrirsagnir / ### Reitir (Icelandic translation)
    const sectionMatch = line.match(/^###\s+(?:\[\[)?(Headers|Cells|Fyrirsagnir|Reitir)(?:\]\])?/i);
    if (sectionMatch && currentTable) {
      const section = sectionMatch[1].toLowerCase();
      // Normalize Icelandic to English
      currentSection = (section === 'fyrirsagnir') ? 'headers' :
                       (section === 'reitir') ? 'cells' : section;
      continue;
    }

    // Match header entry: **H1:** translated text
    const headerMatch = line.match(/^\*\*H(\d+):\*\*\s*(.*)$/);
    if (headerMatch && currentTable && currentSection === 'headers') {
      const colIndex = parseInt(headerMatch[1], 10) - 1;  // Convert to 0-based
      const text = headerMatch[2].trim();
      result[currentTable].headers[colIndex] = text;
      continue;
    }

    // Match cell entry: **R1C1:** translated text
    const cellMatch = line.match(/^\*\*R(\d+)C(\d+):\*\*\s*(.*)$/);
    if (cellMatch && currentTable && currentSection === 'cells') {
      const rowIndex = parseInt(cellMatch[1], 10) - 1;  // Convert to 0-based
      const colIndex = parseInt(cellMatch[2], 10) - 1;
      const text = cellMatch[3].trim();
      const key = `${rowIndex},${colIndex}`;
      result[currentTable].cells[key] = text;
    }
  }

  return result;
}

// ============================================================================
// Table Text Injection
// ============================================================================

/**
 * Inject translated text into a table markdown
 *
 * @param {string} markdown - The original table markdown
 * @param {object} translations - { headers: {colIndex: text}, cells: {"row,col": text} }
 * @returns {string} Updated table markdown
 */
function injectTableContent(markdown, translations) {
  if (!translations || (Object.keys(translations.headers).length === 0 && Object.keys(translations.cells).length === 0)) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const result = [];

  let dataRowIndex = -1;  // Track data row index (excluding header and alignment rows)
  let isAlignmentRow = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (!line.trim().startsWith('|')) {
      result.push(line);
      continue;
    }

    // Parse the row into cells
    const cells = line.split('|');

    // Check if this is the alignment row (second row, contains :--- patterns)
    if (lineIndex === 1 && cells.some(c => /^[\s:]*-+[\s:]*$/.test(c))) {
      isAlignmentRow = true;
      result.push(line);
      continue;
    }

    // Header row (first row)
    if (lineIndex === 0) {
      const newCells = cells.map((cell, cellIndex) => {
        // Adjust for empty first/last cells from split
        const actualColIndex = cellIndex - 1;
        if (actualColIndex >= 0 && actualColIndex < cells.length - 2) {
          if (translations.headers[actualColIndex] !== undefined) {
            // Preserve leading/trailing whitespace
            const leadingSpace = cell.match(/^\s*/)[0];
            const trailingSpace = cell.match(/\s*$/)[0];
            return leadingSpace + translations.headers[actualColIndex] + trailingSpace;
          }
        }
        return cell;
      });
      result.push(newCells.join('|'));
      continue;
    }

    // Data rows (after alignment row)
    if (lineIndex >= 2) {
      dataRowIndex++;
      const newCells = cells.map((cell, cellIndex) => {
        const actualColIndex = cellIndex - 1;
        if (actualColIndex >= 0 && actualColIndex < cells.length - 2) {
          const key = `${dataRowIndex},${actualColIndex}`;
          if (translations.cells[key] !== undefined) {
            // Preserve leading/trailing whitespace
            const leadingSpace = cell.match(/^\s*/)[0];
            const trailingSpace = cell.match(/\s*$/)[0];
            return leadingSpace + translations.cells[key] + trailingSpace;
          }
        }
        return cell;
      });
      result.push(newCells.join('|'));
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the source protected.json path from a strings file path
 * @param {string} stringsPath - Path to the translated strings file
 * @returns {string} Path to the source protected.json file
 */
function getSourceProtectedPath(stringsPath) {
  const dir = path.dirname(stringsPath);
  const basename = path.basename(stringsPath, '-table-strings.is.md');

  // Look in same directory first (for files in 02-mt-output)
  let protectedPath = path.join(dir, `${basename}-protected.json`);
  if (fs.existsSync(protectedPath)) {
    return protectedPath;
  }

  // Try 02-for-mt directory (parallel structure)
  const forMtDir = dir.replace('02-mt-output', '02-for-mt');
  protectedPath = path.join(forMtDir, `${basename}-protected.json`);
  if (fs.existsSync(protectedPath)) {
    return protectedPath;
  }

  return null;
}

/**
 * Get the output protected.json path
 * @param {string} stringsPath - Path to the strings file
 * @param {string} outputDir - Optional output directory override
 * @returns {string} Path for output protected.json
 */
function getOutputProtectedPath(stringsPath, outputDir) {
  const dir = path.dirname(stringsPath);
  const basename = path.basename(stringsPath, '-table-strings.is.md');

  if (outputDir) {
    return path.join(outputDir, `${basename}-protected.json`);
  }

  // Default: same directory as the strings file (assumed to be 02-mt-output)
  return path.join(dir, `${basename}-protected.json`);
}

/**
 * Process a single translated strings file
 * @param {string} filePath - Path to the translated strings .is.md file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose, output } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('-table-strings.is.md')) {
    return { success: false, error: 'File must be a translated table strings file (*-table-strings.is.md)' };
  }

  // Find source protected.json
  const sourceProtectedPath = getSourceProtectedPath(filePath);
  if (!sourceProtectedPath) {
    return { success: false, error: `Could not find source protected.json for: ${filePath}` };
  }

  // Read source protected.json
  let protectedData;
  try {
    protectedData = JSON.parse(fs.readFileSync(sourceProtectedPath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to parse protected JSON: ${err.message}` };
  }

  // Read and parse translated strings
  const stringsContent = fs.readFileSync(filePath, 'utf-8');
  const translations = parseTranslatedStrings(stringsContent);

  if (Object.keys(translations).length === 0) {
    if (verbose) {
      console.log(`  No translations found in: ${filePath}`);
    }
    return { success: true, stringsInjected: 0 };
  }

  // Inject translations into tables
  let totalInjected = 0;
  const changes = [];

  for (const [tableId, table] of Object.entries(protectedData.tables || {})) {
    if (translations[tableId]) {
      const trans = translations[tableId];
      const headerCount = Object.keys(trans.headers).length;
      const cellCount = Object.keys(trans.cells).length;

      if (headerCount > 0 || cellCount > 0) {
        const originalMarkdown = table.markdown;
        const translatedMarkdown = injectTableContent(originalMarkdown, trans);

        if (translatedMarkdown !== originalMarkdown) {
          changes.push({
            tableId,
            headersReplaced: headerCount,
            cellsReplaced: cellCount
          });
          table.markdown = translatedMarkdown;
          totalInjected += headerCount + cellCount;
        }
      }
    }
  }

  if (totalInjected === 0) {
    if (verbose) {
      console.log(`  No changes needed for: ${filePath}`);
    }
    return { success: true, stringsInjected: 0 };
  }

  const outputPath = getOutputProtectedPath(filePath, output);

  if (dryRun) {
    console.log(`[DRY RUN] Would inject ${totalInjected} string(s) in: ${path.basename(filePath)}`);
    for (const change of changes) {
      console.log(`  ${change.tableId}: ${change.headersReplaced} headers, ${change.cellsReplaced} cells`);
    }
    console.log(`  Would write to: ${outputPath}`);
    return { success: true, stringsInjected: totalInjected, dryRun: true };
  }

  // Write updated protected.json
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(protectedData, null, 2));

  if (verbose) {
    console.log(`  Injected ${totalInjected} string(s): ${path.basename(filePath)} -> ${path.basename(outputPath)}`);
  }

  return {
    success: true,
    stringsInjected: totalInjected,
    outputPath
  };
}

/**
 * Find all translated table strings files in a directory
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findTranslatedStringsFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTranslatedStringsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('-table-strings.is.md')) {
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
  const files = findTranslatedStringsFiles(directory);

  if (files.length === 0) {
    console.log(`No *-table-strings.is.md files found in ${directory}`);
    return { filesProcessed: 0, totalStrings: 0 };
  }

  console.log(`Found ${files.length} translated strings file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalStrings = 0;
  let filesWithStrings = 0;

  for (const file of files) {
    const result = processFile(file, options);

    if (result.success && result.stringsInjected > 0) {
      filesWithStrings++;
      totalStrings += result.stringsInjected;
      if (!options.verbose && !options.dryRun) {
        console.log(`  Injected ${result.stringsInjected} string(s): ${path.relative(directory, file)}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Table String Injection Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with injected strings: ${filesWithStrings}`);
  console.log(`  Total strings injected: ${totalStrings}`);

  return { filesProcessed: files.length, totalStrings };
}

// ============================================================================
// Exports for programmatic use
// ============================================================================

export { processFile, processBatch, findTranslatedStringsFiles, parseTranslatedStrings, injectTableContent };

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
        '02-mt-output',
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

      if (!args.dryRun && result.stringsInjected > 0) {
        console.log(`Injected ${result.stringsInjected} translated string(s)`);
        if (result.outputPath) {
          console.log(`Output: ${result.outputPath}`);
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
