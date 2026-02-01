#!/usr/bin/env node

/**
 * restore-tables.js
 *
 * Post-MT processing script that restores tables from sidecar JSON files.
 *
 * After machine translation, this script:
 * 1. Finds the sidecar file (*-protected.json) for the input markdown
 * 2. Locates [[TABLE:N]] or \[\[TABLE:N\]\] placeholders (MT may escape brackets)
 * 3. Replaces placeholders with original table markdown from sidecar
 *
 * The sidecar file is located by:
 * - Same directory as the input file
 * - Matching base name (e.g., 1-5.is.md looks for 1-5-protected.json)
 *
 * Usage:
 *   node tools/restore-tables.js <file.is.md> [--in-place]
 *   node tools/restore-tables.js --batch <directory>
 *   cat translated.md | node tools/restore-tables.js --sidecar <file-protected.json>
 *
 * Options:
 *   --in-place         Modify the input file in place
 *   --output <file>    Write to specified file (default: stdout)
 *   --sidecar <file>   Specify sidecar file path (for stdin input)
 *   --batch <dir>      Process all .is.md files in directory
 *   --dry-run          Show what would change without writing
 *   --verbose          Show processing details
 *   -h, --help         Show help message
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
    sidecar: null,
    batch: null,
    inPlace: false,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--sidecar' && args[i + 1]) result.sidecar = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-tables.js - Restore tables from sidecar after MT

Reads [[TABLE:N]] or \\[\\[TABLE:N\\]\\] placeholders and replaces them
with the original table markdown from the sidecar JSON file.

Usage:
  node tools/restore-tables.js <file.is.md> [options]
  node tools/restore-tables.js --batch <directory>

Options:
  --in-place         Modify the input file in place
  --output <file>    Write to specified file (default: stdout)
  --sidecar <file>   Specify sidecar file path explicitly
  --batch <dir>      Process all .is.md files in directory
  --dry-run          Show what would change without writing
  --verbose, -v      Show processing details
  -h, --help         Show this help message

Sidecar Resolution:
  For file.is.md, looks for file-protected.json in the same directory.
  For file(a).is.md (split files), looks for file-protected.json.

Examples:
  # Preview restoration
  node tools/restore-tables.js books/efnafraedi/02-mt-output/ch01/1-5.is.md --dry-run

  # Restore in place
  node tools/restore-tables.js books/efnafraedi/02-mt-output/ch01/1-5.is.md --in-place

  # Process all translated files
  node tools/restore-tables.js --batch books/efnafraedi/02-mt-output/ch01/
`);
}

// ============================================================================
// Sidecar Resolution
// ============================================================================

/**
 * Find the sidecar file for a translated markdown file.
 *
 * Handles various naming patterns:
 * - file.is.md -> file-protected.json
 * - file(a).is.md -> file-protected.json (split files share same sidecar)
 * - file(b).is.md -> file-protected.json
 *
 * Also checks in the corresponding source directory (02-for-mt instead of 02-mt-output)
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to sidecar file, or null if not found
 */
function findSidecarFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name, handling .is.md and split files like (a).is.md
  let baseName = basename;

  // Remove .is.md or similar suffix
  baseName = baseName.replace(/\.is\.md$/, '');
  baseName = baseName.replace(/\.md$/, '');

  // Remove split file suffix like (a), (b), etc.
  baseName = baseName.replace(/\([a-z]\)$/, '');

  // Build possible sidecar paths
  const possiblePaths = [
    // Same directory
    path.join(dir, `${baseName}-protected.json`),
    // Source directory (02-for-mt instead of 02-mt-output)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-protected.json`),
    // With .en suffix (in case sidecar was created from .en.md)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}.en-protected.json`),
  ];

  for (const sidecarPath of possiblePaths) {
    if (fs.existsSync(sidecarPath)) {
      return sidecarPath;
    }
  }

  return null;
}

/**
 * Load sidecar data from JSON file
 * @param {string} sidecarPath - Path to sidecar file
 * @returns {object|null} Sidecar data or null if invalid
 */
function loadSidecar(sidecarPath) {
  try {
    const content = fs.readFileSync(sidecarPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

// ============================================================================
// Table Restoration
// ============================================================================

/**
 * Pattern to match table placeholders.
 * Handles both:
 * - [[TABLE:N]]{id="..."} (unescaped)
 * - \[\[TABLE:N\]\]{id="..."} (MT-escaped)
 * - [[TABLE:N]] (without attributes)
 */
const TABLE_PLACEHOLDER_PATTERN = /(?:\\\[\\\[|\[\[)(TABLE:\d+)(?:\\\]\\\]|\]\])(?:\{[^}]*\})?/g;

/**
 * Restore tables from placeholders using sidecar data
 * @param {string} content - The markdown content with placeholders
 * @param {object} sidecar - The sidecar data with table content
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {{content: string, count: number}}
 */
function restoreTables(content, sidecar, verbose) {
  if (!sidecar.tables || Object.keys(sidecar.tables).length === 0) {
    return { content, count: 0 };
  }

  let count = 0;

  const restored = content.replace(TABLE_PLACEHOLDER_PATTERN, (match, key) => {
    const tableData = sidecar.tables[key];

    if (!tableData) {
      if (verbose) {
        console.error(`  Warning: No sidecar data for ${key}`);
      }
      return match; // Leave placeholder if no data
    }

    count++;

    if (verbose) {
      console.error(`  Restored ${key}: ${tableData.title || '(no title)'}`);
    }

    // Reconstruct the full table markdown
    let restored = tableData.markdown;

    // Add trailing attributes if they exist
    const attrs = [];
    if (tableData.id) attrs.push(`id="${tableData.id}"`);
    if (tableData.summary) attrs.push(`summary="${tableData.summary}"`);

    if (attrs.length > 0) {
      restored += `\n{${attrs.join(' ')}}`;
    }

    return restored;
  });

  return { content: restored, count };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Process a single file
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose, inPlace, output, sidecar: sidecarOverride } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  // Find sidecar file
  const sidecarPath = sidecarOverride || findSidecarFile(filePath);

  if (!sidecarPath) {
    if (verbose) {
      console.error(`  No sidecar file found for: ${filePath}`);
    }
    return { success: true, count: 0, noSidecar: true };
  }

  const sidecar = loadSidecar(sidecarPath);

  if (!sidecar) {
    return { success: false, error: `Failed to load sidecar: ${sidecarPath}` };
  }

  if (!sidecar.tables || Object.keys(sidecar.tables).length === 0) {
    if (verbose) {
      console.error(`  No tables in sidecar: ${sidecarPath}`);
    }
    return { success: true, count: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if there are any placeholders to restore
  const hasPlaceholders = TABLE_PLACEHOLDER_PATTERN.test(content);
  TABLE_PLACEHOLDER_PATTERN.lastIndex = 0; // Reset regex state

  if (!hasPlaceholders) {
    if (verbose) {
      console.error(`  No table placeholders found in: ${filePath}`);
    }
    return { success: true, count: 0 };
  }

  const { content: restored, count } = restoreTables(content, sidecar, verbose);

  if (count === 0) {
    return { success: true, count: 0 };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would restore ${count} table(s) in: ${filePath}`);
    console.log(`  Sidecar: ${sidecarPath}`);
    return { success: true, count, dryRun: true };
  }

  // Write output
  if (inPlace) {
    fs.writeFileSync(filePath, restored);
    if (verbose) {
      console.error(`  Updated: ${filePath}`);
    }
  } else if (output) {
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(output, restored);
    if (verbose) {
      console.error(`  Written to: ${output}`);
    }
  } else {
    console.log(restored);
  }

  return { success: true, count, sidecarPath };
}

/**
 * Find all .is.md files in a directory recursively
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findTranslatedFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTranslatedFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.is.md')) {
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
  const files = findTranslatedFiles(directory);

  if (files.length === 0) {
    console.log(`No .is.md files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} .is.md file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalTables = 0;
  let filesRestored = 0;
  let filesNoSidecar = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      if (result.count > 0) {
        filesRestored++;
        totalTables += result.count;
        if (!options.verbose && !options.dryRun) {
          console.log(`  Restored ${result.count} table(s): ${path.relative(directory, file)}`);
        }
      }
      if (result.noSidecar) {
        filesNoSidecar++;
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Table Restoration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with tables restored: ${filesRestored}`);
  console.log(`  Files without sidecar: ${filesNoSidecar}`);
  console.log(`  Total tables restored: ${totalTables}`);
}

// ============================================================================
// Stdin Processing
// ============================================================================

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
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

  try {
    if (args.batch) {
      processBatch(path.resolve(args.batch), args);
    } else if (args.input) {
      const result = processFile(path.resolve(args.input), args);

      if (!result.success) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (args.verbose && result.count > 0) {
        console.error(`Restored ${result.count} table(s)`);
      }
    } else if (!process.stdin.isTTY && args.sidecar) {
      // Stdin mode requires explicit sidecar
      const content = await readStdin();
      const sidecar = loadSidecar(args.sidecar);

      if (!sidecar) {
        console.error(`Error: Failed to load sidecar: ${args.sidecar}`);
        process.exit(1);
      }

      const { content: restored, count } = restoreTables(content, sidecar, args.verbose);
      console.log(restored);

      if (args.verbose) {
        console.error(`Restored ${count} table(s)`);
      }
    } else {
      console.error('Error: Please provide a file, --batch option, or pipe content with --sidecar');
      console.error('Use --help for usage information');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
