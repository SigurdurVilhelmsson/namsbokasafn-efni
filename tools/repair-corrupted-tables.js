#!/usr/bin/env node

/**
 * repair-corrupted-tables.js
 *
 * Repairs corrupted tables in MT output that were translated without protection.
 *
 * When tables are sent to MT without [[TABLE:N]] placeholders, the MT system
 * corrupts the table formatting by collapsing multi-row tables into single
 * or few lines. This script:
 *
 * 1. Finds corrupted tables by looking for patterns like:
 *    | col | col | | :--- | :--- | | cell | cell | ... {id="table-id" summary="..."}
 *
 * 2. Extracts the table ID from the {id="..."} attribute
 *
 * 3. Looks up the correct table markdown from the sidecar file
 *
 * 4. Replaces the corrupted table with the properly formatted original
 *
 * Usage:
 *   node tools/repair-corrupted-tables.js <file.is.md> [--in-place]
 *   node tools/repair-corrupted-tables.js --batch <directory>
 *
 * Options:
 *   --in-place         Modify the input file in place
 *   --output <file>    Write to specified file (default: stdout)
 *   --sidecar <file>   Specify sidecar file path explicitly
 *   --batch <dir>      Process all .is.md files in directory
 *   --dry-run          Show what would change without writing
 *   --verbose          Show processing details
 *   -h, --help         Show help message
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
    output: null,
    sidecar: null,
    batch: null,
    inPlace: false,
    dryRun: false,
    verbose: false,
    help: false
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
repair-corrupted-tables.js - Repair tables corrupted by MT

Fixes tables that were sent to machine translation without protection.
Identifies corrupted tables by their {id="..."} attribute and replaces
them with the original table markdown from the sidecar JSON file.

Usage:
  node tools/repair-corrupted-tables.js <file.is.md> [options]
  node tools/repair-corrupted-tables.js --batch <directory>

Options:
  --in-place         Modify the input file in place
  --output <file>    Write to specified file (default: stdout)
  --sidecar <file>   Specify sidecar file path explicitly
  --batch <dir>      Process all .is.md files in directory
  --dry-run          Show what would change without writing
  --verbose, -v      Show processing details
  -h, --help         Show this help message

Sidecar Resolution:
  For file.is.md, looks for file-protected.json in 02-for-mt directory.

Examples:
  # Preview repairs
  node tools/repair-corrupted-tables.js books/efnafraedi/02-mt-output/ch01/1-4.is.md --dry-run --verbose

  # Repair in place
  node tools/repair-corrupted-tables.js books/efnafraedi/02-mt-output/ch01/1-4.is.md --in-place

  # Process all translated files
  node tools/repair-corrupted-tables.js --batch books/efnafraedi/02-mt-output/ch01/
`);
}

// ============================================================================
// Sidecar Resolution
// ============================================================================

/**
 * Find the sidecar file for a translated markdown file.
 */
function findSidecarFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name, handling .is.md and split files
  let baseName = basename;
  baseName = baseName.replace(/\.is\.md$/, '');
  baseName = baseName.replace(/\.md$/, '');
  baseName = baseName.replace(/\([a-z]\)$/, '');

  // Build possible sidecar paths
  const possiblePaths = [
    path.join(dir, `${baseName}-protected.json`),
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-protected.json`),
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}.en-protected.json`)
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
// Corrupted Table Detection and Repair
// ============================================================================

/**
 * Find corrupted tables in content.
 *
 * Corrupted tables have this structure:
 * - Lines starting with | containing many pipe characters
 * - Alignment markers (:---) mixed into the content (not on separate row)
 * - Followed by {id="table-id" summary="..."} which may span multiple lines
 * - The attribute block ends with "}
 *
 * Example:
 * | Col1 | Col2 | | :--- | :--- | | cell | cell | {id="table-id"
 * summary="Long summary that spans
 * multiple lines until it ends with a quote and brace."}
 */
function findCorruptedTables(content) {
  const corrupted = [];
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if this line starts a corrupted table
    // It should start with | and have many pipe characters
    if (!line.startsWith('|')) {
      i++;
      continue;
    }

    const pipeCount = (line.match(/\|/g) || []).length;

    // A corrupted table line will have multiple pipes
    // Even small tables have at least header + alignment collapsed
    // Pattern: | content | | :--- | means at least 4 pipes
    if (pipeCount < 4) {
      i++;
      continue;
    }

    // Also require the :--- alignment marker to be present (indicates collapsed structure)
    // If :--- is on the same line as |, the table was corrupted
    if (!line.includes(':---') && !line.includes('---:')) {
      // Check next line - maybe alignment is there
      const nextLine = lines[i + 1];
      if (!nextLine || (!nextLine.includes(':---') && !nextLine.includes('---:'))) {
        i++;
        continue;
      }
    }

    // Accumulate lines until we find the end of the {id="..." ...} block
    let tableContent = line;
    let endIndex = i;
    let foundId = false;
    let tableId = null;

    // Check if {id="..."} or {#id} starts on this line
    // Two formats: {id="table-id"} or {#table-id}
    const idStartMatch = line.match(/\{id="([^"]+)"/) || line.match(/\{#([^}\s]+)/);
    if (idStartMatch) {
      tableId = idStartMatch[1];
      foundId = true;
    }

    // Look for more lines that are part of this corrupted table + attributes
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const nextLine = lines[j];

      // Check if we've reached the end of the attribute block
      if (foundId) {
        tableContent += '\n' + nextLine;
        endIndex = j;

        // The attribute block ends with "} or just }
        // Formats: {id="..."} or {#id}
        if (nextLine.includes('"}') || nextLine.match(/\{#[^}\s]+\}\s*$/)) {
          break;
        }
      } else {
        // Still looking for the {id="..."} or {#id} start
        // Include lines that are part of the table or that start the attribute block
        if (nextLine.match(/^\|/) || nextLine.match(/^\{(id="|#)/)) {
          tableContent += '\n' + nextLine;
          endIndex = j;

          const idMatch = nextLine.match(/\{id="([^"]+)"/) || nextLine.match(/\{#([^}\s]+)/);
          if (idMatch) {
            tableId = idMatch[1];
            foundId = true;
            // If it's the short form {#id}, we're done
            if (nextLine.match(/\{#[^}\s]+\}\s*$/)) {
              break;
            }
          }
        } else if (nextLine.trim() === '' || nextLine.startsWith('#') || nextLine.startsWith(':::') || nextLine.startsWith('*')) {
          // Hit a clear boundary - not a corrupted table with attributes
          break;
        } else {
          // Could be continuation of table content
          tableContent += '\n' + nextLine;
          endIndex = j;

          const idMatch = nextLine.match(/\{id="([^"]+)"/) || nextLine.match(/\{#([^}\s]+)/);
          if (idMatch) {
            tableId = idMatch[1];
            foundId = true;
            // If it's the short form {#id}, we're done
            if (nextLine.match(/\{#[^}\s]+\}\s*$/)) {
              break;
            }
          }
        }
      }
    }

    // Verify this is a corrupted table
    if (tableId && tableContent.includes(':---')) {
      // Now look for "garbage" text after the attribute block
      // This is text that continues after "} or } and represents corrupted summary spillover
      // Continue consuming lines until we hit a clear markdown boundary

      // First check if there's garbage on the same line as the closing }
      const lastLineOfContent = tableContent.split('\n').pop();
      const closingMatch = lastLineOfContent.match(/"\}\s*\.?\s*(.+)$/);
      if (closingMatch && closingMatch[1].trim()) {
        // There's garbage after "} on the same line - we need to continue capturing
        for (let j = endIndex + 1; j < lines.length; j++) {
          const nextLine = lines[j];

          // Stop at clear markdown boundaries
          if (nextLine.match(/^#{1,6}\s/) ||     // Heading
              nextLine.startsWith(':::') ||      // Directive
              nextLine.startsWith('**') ||       // Bold (likely table title)
              nextLine.startsWith('![') ||       // Image
              nextLine.match(/^\*[^*]/) ||       // Italic/figure caption
              nextLine.startsWith('|') ||        // Another table
              (nextLine.trim() === '' && j + 1 < lines.length &&
               (lines[j + 1].match(/^#{1,6}\s/) || lines[j + 1].startsWith(':::') ||
                lines[j + 1].startsWith('**') || lines[j + 1].startsWith('![')))) {
            break;
          }

          // Also stop if we see end of sentence followed by clear structural change
          if (nextLine.trim().match(/[.?!]["']?\s*$/) &&
              j + 1 < lines.length &&
              (lines[j + 1].trim() === '' || lines[j + 1].match(/^#{1,6}\s/))) {
            endIndex = j;
            break;
          }

          endIndex = j;
        }
      }

      corrupted.push({
        startLine: i,
        endLine: endIndex,
        content: tableContent,
        id: tableId
      });
      i = endIndex + 1;
    } else {
      i++;
    }
  }

  return corrupted;
}

/**
 * Build a mapping from table IDs to TABLE:N keys in the sidecar
 */
function buildTableIdMap(sidecar) {
  const map = {};

  if (!sidecar.tables) return map;

  for (const [key, data] of Object.entries(sidecar.tables)) {
    if (data.id) {
      map[data.id] = { key, data };
    }
  }

  return map;
}

/**
 * Repair corrupted tables in content using sidecar data
 */
function repairTables(content, sidecar, verbose) {
  if (!sidecar.tables || Object.keys(sidecar.tables).length === 0) {
    return { content, count: 0 };
  }

  const tableIdMap = buildTableIdMap(sidecar);
  const corrupted = findCorruptedTables(content);

  if (corrupted.length === 0) {
    return { content, count: 0 };
  }

  let count = 0;
  const lines = content.split('\n');
  const result = [];
  let skipUntil = -1;

  for (let i = 0; i < lines.length; i++) {
    if (i <= skipUntil) {
      continue;
    }

    // Check if this line is the start of a corrupted table
    const corrupted_entry = corrupted.find(c => c.startLine === i);

    if (corrupted_entry) {
      const tableInfo = tableIdMap[corrupted_entry.id];

      if (tableInfo) {
        count++;

        if (verbose) {
          console.error(`  Repaired table: ${tableInfo.data.title || corrupted_entry.id}`);
        }

        // Add the properly formatted table
        result.push(tableInfo.data.markdown);

        // Add the ID attribute
        const attrs = [];
        if (tableInfo.data.id) attrs.push(`id="${tableInfo.data.id}"`);
        if (tableInfo.data.summary) {
          // Escape quotes in summary and keep it on one line
          const escapedSummary = tableInfo.data.summary.replace(/\n/g, ' ').replace(/"/g, '\\"');
          attrs.push(`summary="${escapedSummary}"`);
        }

        if (attrs.length > 0) {
          result.push(`{${attrs.join(' ')}}`);
        }

        skipUntil = corrupted_entry.endLine;
      } else {
        // No sidecar data for this table, keep original
        if (verbose) {
          console.error(`  Warning: No sidecar data for table ID: ${corrupted_entry.id}`);
        }
        result.push(lines[i]);
      }
    } else {
      result.push(lines[i]);
    }
  }

  return { content: result.join('\n'), count };
}

// ============================================================================
// File Processing
// ============================================================================

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

  const { content: repaired, count } = repairTables(content, sidecar, verbose);

  if (count === 0) {
    if (verbose) {
      console.error(`  No corrupted tables found in: ${filePath}`);
    }
    return { success: true, count: 0 };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would repair ${count} table(s) in: ${filePath}`);
    console.log(`  Sidecar: ${sidecarPath}`);
    return { success: true, count, dryRun: true };
  }

  // Write output
  if (inPlace) {
    fs.writeFileSync(filePath, repaired);
    if (verbose) {
      console.error(`  Updated: ${filePath}`);
    }
  } else if (output) {
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(output, repaired);
    if (verbose) {
      console.error(`  Written to: ${output}`);
    }
  } else {
    console.log(repaired);
  }

  return { success: true, count, sidecarPath };
}

/**
 * Find all .is.md files in a directory recursively
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
  let filesRepaired = 0;
  let filesNoSidecar = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      if (result.count > 0) {
        filesRepaired++;
        totalTables += result.count;
        if (!options.verbose && !options.dryRun) {
          console.log(`  Repaired ${result.count} table(s): ${path.relative(directory, file)}`);
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
  console.log('Table Repair Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with tables repaired: ${filesRepaired}`);
  console.log(`  Files without sidecar: ${filesNoSidecar}`);
  console.log(`  Total tables repaired: ${totalTables}`);
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
        console.error(`Repaired ${result.count} table(s)`);
      }
    } else {
      console.error('Error: Please provide a file or --batch option');
      console.error('Use --help for usage information');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
