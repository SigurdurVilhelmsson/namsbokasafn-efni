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
 * Also handles MT escaping of brackets: \[\[ → [[ and \]\] → ]]
 *
 * @param {string} content - Markdown content
 * @param {boolean} verbose - Whether to log restoration details
 * @returns {{content: string, directivesRestored: number, stats: object}}
 */
function restoreDirectives(content, verbose) {
  let directivesRestored = 0;
  let bracketsUnescaped = 0;
  let closingDirectivesFixed = 0;
  let linksUnescaped = 0;

  let result = content;

  // Step 1: Unescape MT-escaped brackets in directive markers
  // MT converts [[DIRECTIVE:name]] to \[\[DIRECTIVE:name\]\]
  const escapedDirectivePattern =
    /^(:::)\\?\[\\?\[DIRECTIVE:(\w+(?:-\w+)*)\\?\]\\?\]((?:\{[^}]*\})?)/gm;

  result = result.replace(escapedDirectivePattern, (match, prefix, name, attrs) => {
    directivesRestored++;
    if (verbose) {
      console.error(`  Restored directive: :::${name}`);
    }
    return `${prefix}${name}${attrs}`;
  });

  // Step 2: Unescape equation placeholders: \[\[EQ:N\]\] → [[EQ:N]]
  const escapedEqPattern = /\\?\[\\?\[EQ:(\d+)\\?\]\\?\]/g;
  result = result.replace(escapedEqPattern, (match, num) => {
    bracketsUnescaped++;
    return `[[EQ:${num}]]`;
  });

  // Step 3: Unescape table placeholders: \[\[TABLE:N\]\] → [[TABLE:N]]
  const escapedTablePattern = /\\?\[\\?\[TABLE:(\d+)\\?\]\\?\]/g;
  result = result.replace(escapedTablePattern, (match, num) => {
    bracketsUnescaped++;
    return `[[TABLE:${num}]]`;
  });

  // Step 4: Fix directive closing on same line as content
  // Pattern: "content :::" at end of line → "content\n:::"
  const closingOnSameLinePattern = /^(.+[^\s])\s+:::$/gm;
  result = result.replace(closingOnSameLinePattern, (match, content) => {
    closingDirectivesFixed++;
    if (verbose) {
      console.error(`  Fixed closing directive on same line`);
    }
    return `${content}\n:::`;
  });

  // Step 5: Unescape escaped brackets in links: \[ → [ and \] → ]
  // MT escapes brackets in link text, e.g., \[text\]{url="..."} → [text]{url="..."}
  // This is safe to do globally since \[ and \] only appear in MT-escaped contexts
  const escapedOpenMatches = result.match(/\\\[/g);
  const escapedCloseMatches = result.match(/\\]/g);
  if (escapedOpenMatches || escapedCloseMatches) {
    result = result.replace(/\\\[/g, '[');
    result = result.replace(/\\]/g, ']');
    linksUnescaped = (escapedOpenMatches?.length || 0) + (escapedCloseMatches?.length || 0);
    if (verbose) {
      console.error(`  Unescaped ${linksUnescaped} bracket(s) in links`);
    }
  }

  return {
    content: result,
    directivesRestored,
    stats: {
      bracketsUnescaped,
      closingDirectivesFixed,
      linksUnescaped,
    },
  };
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

  // Restore directives and fix MT artifacts
  const {
    content: restoredContent,
    directivesRestored,
    stats,
  } = restoreDirectives(content, verbose);

  if (directivesRestored === 0 && stats.bracketsUnescaped === 0 && verbose) {
    console.error(`  No MT artifacts found in: ${filePath}`);
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
    stats,
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
  let totalBrackets = 0;
  let totalClosings = 0;
  let totalLinks = 0;
  let filesModified = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      const totalChanges =
        result.directivesRestored +
        (result.stats?.bracketsUnescaped || 0) +
        (result.stats?.closingDirectivesFixed || 0) +
        (result.stats?.linksUnescaped || 0);

      if (totalChanges > 0) {
        filesModified++;
        totalDirectives += result.directivesRestored;
        totalBrackets += result.stats?.bracketsUnescaped || 0;
        totalClosings += result.stats?.closingDirectivesFixed || 0;
        totalLinks += result.stats?.linksUnescaped || 0;

        if (!options.verbose) {
          const changes = [];
          if (result.directivesRestored > 0)
            changes.push(`${result.directivesRestored} directives`);
          if (result.stats?.bracketsUnescaped > 0) {
            changes.push(`${result.stats.bracketsUnescaped} brackets`);
          }
          if (result.stats?.closingDirectivesFixed > 0) {
            changes.push(`${result.stats.closingDirectivesFixed} closings`);
          }
          if (result.stats?.linksUnescaped > 0)
            changes.push(`${result.stats.linksUnescaped} links`);
          console.log(`  Fixed ${changes.join(', ')}: ${path.relative(directory, file)}`);
        }
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('MT Artifact Restoration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files modified: ${filesModified}`);
  console.log(`  Directives restored: ${totalDirectives}`);
  console.log(`  Brackets unescaped: ${totalBrackets}`);
  console.log(`  Closings fixed: ${totalClosings}`);
  console.log(`  Links unescaped: ${totalLinks}`);
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

      const totalChanges =
        result.directivesRestored +
        (result.stats?.bracketsUnescaped || 0) +
        (result.stats?.closingDirectivesFixed || 0) +
        (result.stats?.linksUnescaped || 0);

      if (totalChanges > 0) {
        console.error(`MT artifacts fixed:`);
        if (result.directivesRestored > 0) {
          console.error(`  Directives restored: ${result.directivesRestored}`);
        }
        if (result.stats?.bracketsUnescaped > 0) {
          console.error(`  Brackets unescaped: ${result.stats.bracketsUnescaped}`);
        }
        if (result.stats?.closingDirectivesFixed > 0) {
          console.error(`  Closings fixed: ${result.stats.closingDirectivesFixed}`);
        }
        if (result.stats?.linksUnescaped > 0) {
          console.error(`  Links unescaped: ${result.stats.linksUnescaped}`);
        }
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
