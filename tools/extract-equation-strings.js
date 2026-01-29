#!/usr/bin/env node

/**
 * extract-equation-strings.js
 *
 * Extracts translatable text from LaTeX equations (\text{...} content).
 *
 * LaTeX equations contain \text{} blocks with translatable content like:
 * - Unit labels: "14.82 g carbon", "mol K", "°C"
 * - Chemical names: "glycine", "vitamin C"
 * - Descriptive text: "specific heat", "small pan"
 *
 * This script:
 * 1. Reads equations.json sidecar files
 * 2. Extracts all \text{...} content
 * 3. Writes translatable strings to *-equation-strings.en.md
 *
 * The markdown format is compatible with Erlendur MT (malstadur.is).
 *
 * Usage:
 *   node tools/extract-equation-strings.js <file-equations.json>
 *   node tools/extract-equation-strings.js --batch <directory>
 *   node tools/extract-equation-strings.js --chapter <book> <chNN>
 *
 * Options:
 *   --batch <dir>     Process all *-equations.json files in directory
 *   --chapter <b> <c> Process all equations in a chapter
 *   --dry-run         Show what would be extracted without writing
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
extract-equation-strings.js - Extract translatable text from LaTeX equations

Extracts \\text{...} content from equations.json files and outputs
translatable strings in markdown format for Erlendur MT.

Usage:
  node tools/extract-equation-strings.js <file-equations.json> [options]
  node tools/extract-equation-strings.js --batch <directory>
  node tools/extract-equation-strings.js --chapter <book> <chNN>

Options:
  --batch <dir>       Process all *-equations.json files in directory
  --chapter <b> <c>   Process chapter (e.g., --chapter efnafraedi 01)
  --dry-run           Show what would be extracted without writing files
  --verbose, -v       Show processing details
  -h, --help          Show this help message

Output Files:
  *-equation-strings.en.md    Translatable equation text in markdown format

Examples:
  # Extract from a single file
  node tools/extract-equation-strings.js books/efnafraedi/02-for-mt/ch05/5-1-equations.json

  # Process all equations in a chapter
  node tools/extract-equation-strings.js --chapter efnafraedi 01

  # Preview extraction for a directory
  node tools/extract-equation-strings.js --batch books/efnafraedi/02-for-mt/ch05/ --dry-run
`);
}

// ============================================================================
// LaTeX Text Extraction
// ============================================================================

/**
 * Extract all \text{...} content from a LaTeX string.
 * Handles nested braces within \text{}.
 *
 * @param {string} latex - The LaTeX string
 * @returns {string[]} Array of extracted text content
 */
function extractTextContent(latex) {
  const texts = [];

  // Pattern to find \text{ and then extract the balanced content
  const textPattern = /\\text\{/g;
  let match;

  while ((match = textPattern.exec(latex)) !== null) {
    const startIndex = match.index + match[0].length;
    let depth = 1;
    let endIndex = startIndex;

    // Find matching closing brace
    while (depth > 0 && endIndex < latex.length) {
      if (latex[endIndex] === '{') depth++;
      else if (latex[endIndex] === '}') depth--;
      if (depth > 0) endIndex++;
    }

    if (depth === 0) {
      const content = latex.substring(startIndex, endIndex);
      // Only include non-trivial content (skip single symbols like Δ, ×)
      if (content.length > 1 || /[a-zA-Z0-9]/.test(content)) {
        // Clean up content: remove nested \text{} and LaTeX formatting
        const cleanContent = content
          .replace(/\\text\{([^}]*)\}/g, '$1')  // Flatten nested \text{}
          .replace(/\\\,/g, ' ')                 // \, -> space
          .replace(/\\,/g, ' ')                  // \, -> space
          .trim();

        if (cleanContent.length > 0) {
          texts.push(cleanContent);
        }
      }
    }
  }

  return texts;
}

/**
 * Check if text content is worth translating (not just symbols/numbers)
 * @param {string} text - The text content
 * @returns {boolean} True if the text has translatable content
 */
function isTranslatable(text) {
  // Skip pure symbols
  if (/^[Δ×°]+$/.test(text)) return false;

  // Skip pure numbers with units like "50.0", "18,140"
  if (/^[\d,.\s]+$/.test(text)) return false;

  // Skip very short content that's just punctuation/symbols
  if (text.length <= 1) return false;

  // Keep anything with letters (words to translate)
  if (/[a-zA-Z]/.test(text)) return true;

  // Keep numbers with text (like "14.82 g carbon")
  return false;
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the strings output file path for an equations.json file
 * @param {string} jsonPath - Path to the equations.json file
 * @returns {string} Path to the strings .en.md file
 */
function getStringsPath(jsonPath) {
  const dir = path.dirname(jsonPath);
  const basename = path.basename(jsonPath, '-equations.json');
  return path.join(dir, `${basename}-equation-strings.en.md`);
}

/**
 * Generate translatable strings content in markdown format
 *
 * @param {object} data - The equations.json data
 * @param {object} extractedStrings - Map of equation IDs to extracted strings
 * @returns {string} Formatted markdown content for MT
 */
function generateStringsContent(data, extractedStrings) {
  const lines = [];
  const section = data.section || 'unknown';

  lines.push(`# Equation Strings - Section ${section}`);
  lines.push('');
  lines.push('Translatable text extracted from LaTeX equations.');
  lines.push('Translate the text content while preserving the structure.');
  lines.push('');

  let hasContent = false;

  for (const [eqId, strings] of Object.entries(extractedStrings)) {
    const translatableStrings = strings.filter(isTranslatable);
    if (translatableStrings.length === 0) continue;

    hasContent = true;
    lines.push(`## ${eqId}`);
    lines.push('');

    translatableStrings.forEach((text, index) => {
      const textId = `TEXT:${index + 1}`;
      lines.push(`**${textId}:** ${text}`);
      lines.push('');
    });
  }

  if (!hasContent) {
    return '';
  }

  return lines.join('\n');
}

/**
 * Process a single equations.json file
 * @param {string} filePath - Path to the equations.json file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('-equations.json')) {
    return { success: false, error: 'File must be an equations.json file' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to parse JSON: ${err.message}` };
  }

  if (!data.equations || Object.keys(data.equations).length === 0) {
    if (verbose) {
      console.log(`  No equations in: ${filePath}`);
    }
    return { success: true, stringsExtracted: 0 };
  }

  // Extract strings from each equation
  const extractedStrings = {};
  let totalStrings = 0;

  for (const [eqId, eq] of Object.entries(data.equations)) {
    const texts = extractTextContent(eq.latex || '');
    if (texts.length > 0) {
      extractedStrings[eqId] = texts;
      totalStrings += texts.filter(isTranslatable).length;
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
    console.log(`[DRY RUN] Would extract ${totalStrings} string(s) from: ${path.basename(filePath)}`);
    for (const [eqId, strings] of Object.entries(extractedStrings)) {
      const translatableStrings = strings.filter(isTranslatable);
      if (translatableStrings.length > 0) {
        console.log(`  ${eqId}:`);
        translatableStrings.forEach((text, i) => {
          console.log(`    TEXT:${i + 1}: "${text}"`);
        });
      }
    }
    return { success: true, stringsExtracted: totalStrings, dryRun: true };
  }

  // Write strings file
  fs.writeFileSync(stringsPath, stringsContent);

  if (verbose) {
    console.log(`  Extracted ${totalStrings} string(s): ${path.basename(filePath)} -> ${path.basename(stringsPath)}`);
  }

  return {
    success: true,
    stringsExtracted: totalStrings,
    stringsPath
  };
}

/**
 * Find all equations.json files in a directory
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findEquationsFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findEquationsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('-equations.json')) {
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
  const files = findEquationsFiles(directory);

  if (files.length === 0) {
    console.log(`No *-equations.json files found in ${directory}`);
    return { filesProcessed: 0, totalStrings: 0 };
  }

  console.log(`Found ${files.length} equations file(s) in ${directory}`);
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
        console.log(`  Extracted ${result.stringsExtracted} string(s): ${path.relative(directory, file)}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Equation String Extraction Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with translatable strings: ${filesWithStrings}`);
  console.log(`  Total strings extracted: ${totalStrings}`);

  return { filesProcessed: files.length, totalStrings };
}

// ============================================================================
// Exports for programmatic use
// ============================================================================

export { processFile, processBatch, findEquationsFiles, extractTextContent, isTranslatable };

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
