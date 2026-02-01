#!/usr/bin/env node

/**
 * restore-directives.js
 *
 * Post-MT processing script that restores directive names from protected markers.
 *
 * The protect-for-mt.js script converts directive names to [[markers]] to prevent
 * machine translation from translating them:
 *   :::example{id="..."} → :::[[DIRECTIVE:example]]{id="..."}
 *
 * This script converts them back:
 *   :::[[DIRECTIVE:example]]{id="..."} → :::example{id="..."}
 *
 * Usage:
 *   node tools/restore-directives.js <input.md> [--output <output.md>]
 *   node tools/restore-directives.js <input.md> --in-place
 *   node tools/restore-directives.js --batch <directory>
 *
 * Options:
 *   --output <file>   Write to specified file (default: stdout)
 *   --in-place        Modify the input file in place
 *   --batch <dir>     Process all .is.md files in directory recursively
 *   --verbose         Show processing details
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
    output: null,
    batch: null,
    inPlace: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }

  return result;
}

function printHelp() {
  console.log(`
restore-directives.js - Restore directive names from MT-protected markers

Converts [[DIRECTIVE:name]] markers back to standard directive names.

Usage:
  node tools/restore-directives.js <input.md> [options]
  node tools/restore-directives.js --batch <directory>

Options:
  --output <file>   Write to specified file (default: stdout)
  --in-place        Modify the input file in place
  --batch <dir>     Process all .is.md files in directory recursively
  --verbose, -v     Show processing details
  -h, --help        Show this help message

Examples:
  # Preview restoration (outputs to stdout)
  node tools/restore-directives.js books/efnafraedi/02-mt-output/ch05/5-1.is.md

  # Restore in place
  node tools/restore-directives.js books/efnafraedi/02-mt-output/ch05/5-1.is.md --in-place

  # Process all files in a chapter
  node tools/restore-directives.js --batch books/efnafraedi/02-mt-output/ch05/
`);
}

// ============================================================================
// Directive Restoration
// ============================================================================

/**
 * Restore directive names from [[DIRECTIVE:name]] markers
 *
 * @param {string} content - Markdown content
 * @param {boolean} verbose - Whether to log restoration details
 * @returns {{content: string, directivesRestored: number}}
 */
function restoreDirectives(content, verbose) {
  let directivesRestored = 0;

  // Pattern matches: :::[[DIRECTIVE:name]] or :::[[DIRECTIVE:name]]{attributes}
  // Captures: (1) directive name, (2) optional attributes
  const protectedPattern = /^(:::)\[\[DIRECTIVE:(\w+(?:-\w+)*)\]\]((?:\{[^}]*\})?)/gm;

  const restoredContent = content.replace(protectedPattern, (match, prefix, name, attrs) => {
    directivesRestored++;
    if (verbose) {
      console.error(`  Restored directive: :::${name}`);
    }
    return `${prefix}${name}${attrs}`;
  });

  return { content: restoredContent, directivesRestored };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Process a single file
 *
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { verbose, inPlace, output } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Restore directives
  const { content: restoredContent, directivesRestored } = restoreDirectives(content, verbose);

  if (directivesRestored === 0 && verbose) {
    console.error(`  No protected directives found in: ${filePath}`);
  }

  // Output result
  if (inPlace) {
    fs.writeFileSync(filePath, restoredContent);
    if (verbose) {
      console.error(`  Modified: ${filePath}`);
    }
  } else if (output) {
    fs.writeFileSync(output, restoredContent);
    if (verbose) {
      console.error(`  Wrote: ${output}`);
    }
  } else {
    console.log(restoredContent);
  }

  return {
    success: true,
    directivesRestored,
  };
}

/**
 * Find all .is.md files in a directory recursively
 *
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findIcelandicMarkdownFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findIcelandicMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.is.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process multiple files in batch mode
 *
 * @param {string} directory - Directory to process
 * @param {object} options - Processing options
 */
function processBatch(directory, options) {
  const files = findIcelandicMarkdownFiles(directory);

  if (files.length === 0) {
    console.log(`No .is.md files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} .is.md file(s) in ${directory}`);
  console.log('');

  let totalDirectives = 0;
  let filesWithDirectives = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      if (result.directivesRestored > 0) {
        filesWithDirectives++;
        totalDirectives += result.directivesRestored;
        if (!options.verbose) {
          console.log(
            `  Restored ${result.directivesRestored} directive(s): ${path.relative(directory, file)}`
          );
        }
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Directive Restoration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with directives: ${filesWithDirectives}`);
  console.log(`  Total directives restored: ${totalDirectives}`);
}

// ============================================================================
// Exports
// ============================================================================

export { processFile, processBatch, restoreDirectives };

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.batch) {
    console.error('Error: Please provide a file or --batch option');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (args.batch) {
      processBatch(path.resolve(args.batch), args);
    } else {
      const result = processFile(path.resolve(args.input), args);

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (result.directivesRestored > 0) {
        console.error(`Directives restored: ${result.directivesRestored}`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Only run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
