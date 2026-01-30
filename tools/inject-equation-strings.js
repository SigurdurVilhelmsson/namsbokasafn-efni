#!/usr/bin/env node

/**
 * inject-equation-strings.js
 *
 * Injects translated text back into LaTeX equations.
 *
 * This script takes translated *-equation-strings.is.md files and
 * replaces the original \text{...} content in equations.json with
 * the translated versions.
 *
 * Usage:
 *   node tools/inject-equation-strings.js <file-equation-strings.is.md>
 *   node tools/inject-equation-strings.js --batch <directory>
 *   node tools/inject-equation-strings.js --chapter <book> <chNN>
 *
 * Options:
 *   --batch <dir>     Process all *-equation-strings.is.md files in directory
 *   --chapter <b> <c> Process chapter (e.g., --chapter efnafraedi 01)
 *   --output <dir>    Output directory (default: 02-mt-output parallel to input)
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
inject-equation-strings.js - Inject translated text into LaTeX equations

Takes translated *-equation-strings.is.md files and replaces the original
\\text{...} content in equations.json with translated versions.

Usage:
  node tools/inject-equation-strings.js <file-equation-strings.is.md> [options]
  node tools/inject-equation-strings.js --batch <directory>
  node tools/inject-equation-strings.js --chapter <book> <chNN>

Options:
  --batch <dir>       Process all *-equation-strings.is.md files in directory
  --chapter <b> <c>   Process chapter (e.g., --chapter efnafraedi 01)
  --output <dir>      Output directory (default: 02-mt-output parallel to input)
  --dry-run           Show what would change without writing files
  --verbose, -v       Show processing details
  -h, --help          Show this help message

Input Files:
  *-equation-strings.is.md    Translated equation strings (from MT)

Output Files:
  *-equations.json            Updated equations.json with translated text

Examples:
  # Inject translations into a single file
  node tools/inject-equation-strings.js books/efnafraedi/02-mt-output/ch05/5-1-equation-strings.is.md

  # Process all translated strings in a chapter
  node tools/inject-equation-strings.js --chapter efnafraedi 01

  # Preview changes without writing
  node tools/inject-equation-strings.js --batch books/efnafraedi/02-mt-output/ch05/ --dry-run
`);
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse translated equation strings from markdown file
 *
 * Expected format:
 *   # Equation Strings - Section X.X
 *   ...
 *   ## EQ:1
 *
 *   **TEXT:1:** translated text
 *
 *   **TEXT:2:** another translated text
 *
 *   ## EQ:2
 *   ...
 *
 * @param {string} content - The markdown content
 * @returns {object} Map of equation IDs to arrays of translated strings
 */
function parseTranslatedStrings(content) {
  const result = {};
  let currentEq = null;

  const lines = content.split('\n');

  for (const line of lines) {
    // Match equation header: ## EQ:N or ## JAFNA:N (Icelandic translation)
    const eqMatch = line.match(/^##\s+(?:EQ|JAFNA):(\d+)/);
    if (eqMatch) {
      currentEq = `EQ:${eqMatch[1]}`; // Normalize to EQ:N
      result[currentEq] = {};
      continue;
    }

    // Match text entry: **TEXT:N:** or **TEXTI:N:** (Icelandic translation)
    const textMatch = line.match(/^\*\*(?:TEXT|TEXTI):(\d+):\*\*\s*(.*)$/);
    if (textMatch && currentEq) {
      const textId = parseInt(textMatch[1], 10);
      const text = textMatch[2].trim();
      result[currentEq][textId] = text;
    }
  }

  return result;
}

// ============================================================================
// LaTeX Text Injection
// ============================================================================

/**
 * Replace \text{...} content in LaTeX with translated versions
 *
 * @param {string} latex - The original LaTeX string
 * @param {object} translations - Map of text indices to translated strings
 * @returns {string} LaTeX with translated text
 */
function injectTextContent(latex, translations) {
  // If no translations provided, return original
  if (!translations || Object.keys(translations).length === 0) {
    return latex;
  }

  // Track which \text{} occurrence we're on
  let textIndex = 0;
  let result = '';
  let i = 0;

  while (i < latex.length) {
    // Check if we're at the start of \text{
    if (latex.slice(i, i + 6) === '\\text{') {
      const startIndex = i + 6;
      let depth = 1;
      let endIndex = startIndex;

      // Find matching closing brace
      while (depth > 0 && endIndex < latex.length) {
        if (latex[endIndex] === '{') depth++;
        else if (latex[endIndex] === '}') depth--;
        if (depth > 0) endIndex++;
      }

      const originalContent = latex.substring(startIndex, endIndex);

      // Check if this is a translatable text (not just symbols)
      const isTranslatableText = originalContent.length > 1 || /[a-zA-Z0-9]/.test(originalContent);
      const isNotJustSymbols = !/^[Δ×°]+$/.test(originalContent) && !/^[\d,.\s]+$/.test(originalContent);

      if (isTranslatableText && isNotJustSymbols && /[a-zA-Z]/.test(originalContent)) {
        textIndex++;

        // Check if we have a translation for this text
        if (translations[textIndex]) {
          result += '\\text{' + translations[textIndex] + '}';
        } else {
          // No translation, keep original
          result += '\\text{' + originalContent + '}';
        }
      } else {
        // Non-translatable text, keep original
        result += '\\text{' + originalContent + '}';
      }

      i = endIndex + 1;
    } else {
      result += latex[i];
      i++;
    }
  }

  return result;
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the source equations.json path from a strings file path
 * @param {string} stringsPath - Path to the translated strings file
 * @returns {string} Path to the source equations.json file
 */
function getSourceEquationsPath(stringsPath) {
  const dir = path.dirname(stringsPath);
  const basename = path.basename(stringsPath, '-equation-strings.is.md');

  // Look in same directory first (for files in 02-mt-output)
  let equationsPath = path.join(dir, `${basename}-equations.json`);
  if (fs.existsSync(equationsPath)) {
    return equationsPath;
  }

  // Try 02-for-mt directory (parallel structure)
  const forMtDir = dir.replace('02-mt-output', '02-for-mt');
  equationsPath = path.join(forMtDir, `${basename}-equations.json`);
  if (fs.existsSync(equationsPath)) {
    return equationsPath;
  }

  return null;
}

/**
 * Get the output equations.json path
 * @param {string} stringsPath - Path to the strings file
 * @param {string} outputDir - Optional output directory override
 * @returns {string} Path for output equations.json
 */
function getOutputEquationsPath(stringsPath, outputDir) {
  const dir = path.dirname(stringsPath);
  const basename = path.basename(stringsPath, '-equation-strings.is.md');

  if (outputDir) {
    return path.join(outputDir, `${basename}-equations.json`);
  }

  // Default: same directory as the strings file (assumed to be 02-mt-output)
  return path.join(dir, `${basename}-equations.json`);
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

  if (!filePath.endsWith('-equation-strings.is.md')) {
    return { success: false, error: 'File must be a translated equation strings file (*-equation-strings.is.md)' };
  }

  // Find source equations.json
  const sourceEquationsPath = getSourceEquationsPath(filePath);
  if (!sourceEquationsPath) {
    return { success: false, error: `Could not find source equations.json for: ${filePath}` };
  }

  // Read source equations.json
  let equationsData;
  try {
    equationsData = JSON.parse(fs.readFileSync(sourceEquationsPath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to parse equations JSON: ${err.message}` };
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

  // Inject translations into equations
  let totalInjected = 0;
  const changes = [];

  for (const [eqId, eq] of Object.entries(equationsData.equations || {})) {
    if (translations[eqId]) {
      const originalLatex = eq.latex;
      const translatedLatex = injectTextContent(originalLatex, translations[eqId]);

      if (translatedLatex !== originalLatex) {
        changes.push({
          eqId,
          original: originalLatex,
          translated: translatedLatex,
          stringsReplaced: Object.keys(translations[eqId]).length
        });
        eq.latex = translatedLatex;
        totalInjected += Object.keys(translations[eqId]).length;
      }
    }
  }

  if (totalInjected === 0) {
    if (verbose) {
      console.log(`  No changes needed for: ${filePath}`);
    }
    return { success: true, stringsInjected: 0 };
  }

  const outputPath = getOutputEquationsPath(filePath, output);

  if (dryRun) {
    console.log(`[DRY RUN] Would inject ${totalInjected} string(s) in: ${path.basename(filePath)}`);
    for (const change of changes) {
      console.log(`  ${change.eqId}: ${change.stringsReplaced} string(s)`);
      if (verbose) {
        console.log(`    Before: ${change.original.substring(0, 80)}...`);
        console.log(`    After:  ${change.translated.substring(0, 80)}...`);
      }
    }
    console.log(`  Would write to: ${outputPath}`);
    return { success: true, stringsInjected: totalInjected, dryRun: true };
  }

  // Write updated equations.json
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(equationsData, null, 2));

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
 * Find all translated equation strings files in a directory
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
    } else if (entry.isFile() && entry.name.endsWith('-equation-strings.is.md')) {
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
    console.log(`No *-equation-strings.is.md files found in ${directory}`);
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
  console.log('Equation String Injection Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with injected strings: ${filesWithStrings}`);
  console.log(`  Total strings injected: ${totalStrings}`);

  return { filesProcessed: files.length, totalStrings };
}

// ============================================================================
// Exports for programmatic use
// ============================================================================

export { processFile, processBatch, findTranslatedStringsFiles, parseTranslatedStrings, injectTextContent };

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
