#!/usr/bin/env node

/**
 * restore-strings.js
 *
 * Post-MT processing script that updates sidecar JSON with translated strings.
 *
 * After machine translation, this script:
 * 1. Finds the translated strings file (*-strings.is.txt)
 * 2. Parses [[KEY]] value format
 * 3. Updates the sidecar JSON with translated values
 * 4. Optionally updates table titles in the markdown file
 *
 * Usage:
 *   node tools/restore-strings.js <file.is.md> [options]
 *   node tools/restore-strings.js --batch <directory>
 *
 * Options:
 *   --in-place         Update files in place (default behavior)
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
    batch: null,
    inPlace: true, // Default to in-place for pipeline use
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
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-strings.js - Update sidecar with translated strings after MT

Reads translated strings file (*-strings.is.txt) and updates the sidecar
JSON with translated frontmatter titles, table titles, and summaries.

Usage:
  node tools/restore-strings.js <file.is.md> [options]
  node tools/restore-strings.js --batch <directory>

Options:
  --in-place         Update sidecar in place (default)
  --batch <dir>      Process all .is.md files in directory
  --dry-run          Show what would change without writing
  --verbose, -v      Show processing details
  -h, --help         Show this help message

File Resolution:
  For file.is.md, looks for:
  - file-strings.is.txt (translated strings)
  - file-protected.json (sidecar to update)

Strings File Format:
  [[FRONTMATTER:title]] Translated title here

  [[TABLE:1:title]] Translated table title

  [[TABLE:1:summary]] Translated table summary text

Examples:
  # Preview string restoration
  node tools/restore-strings.js books/efnafraedi/02-mt-output/ch01/1-5.is.md --dry-run

  # Update sidecar with translated strings
  node tools/restore-strings.js books/efnafraedi/02-mt-output/ch01/1-5.is.md

  # Process all translated files
  node tools/restore-strings.js --batch books/efnafraedi/02-mt-output/ch01/
`);
}

// ============================================================================
// File Resolution
// ============================================================================

/**
 * Find the strings file for a translated markdown file.
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to strings file, or null if not found
 */
function findStringsFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name, handling .is.md suffix
  let baseName = basename.replace(/\.is\.md$/, '').replace(/\.md$/, '');

  // Remove split file suffix like (a), (b), etc.
  baseName = baseName.replace(/\([a-z]\)$/, '');

  // Look for translated strings file
  const possiblePaths = [
    // Same directory - translated strings
    path.join(dir, `${baseName}-strings.is.txt`),
    // Source directory (02-for-mt instead of 02-mt-output)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-strings.is.txt`)
  ];

  for (const stringsPath of possiblePaths) {
    if (fs.existsSync(stringsPath)) {
      return stringsPath;
    }
  }

  return null;
}

/**
 * Find the sidecar file for a translated markdown file.
 *
 * @param {string} mdPath - Path to the translated markdown file
 * @returns {string|null} Path to sidecar file, or null if not found
 */
function findSidecarFile(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath);

  // Extract base name
  let baseName = basename.replace(/\.is\.md$/, '').replace(/\.md$/, '');
  baseName = baseName.replace(/\([a-z]\)$/, '');

  const possiblePaths = [
    // Same directory
    path.join(dir, `${baseName}-protected.json`),
    // Source directory (02-for-mt instead of 02-mt-output)
    path.join(dir.replace('02-mt-output', '02-for-mt'), `${baseName}-protected.json`)
  ];

  for (const sidecarPath of possiblePaths) {
    if (fs.existsSync(sidecarPath)) {
      return sidecarPath;
    }
  }

  return null;
}

// ============================================================================
// Strings Parsing
// ============================================================================

/**
 * Parse a strings file into key-value pairs.
 *
 * Format:
 *   [[KEY]] Value text that can span
 *   multiple lines until the next marker
 *
 *   [[ANOTHER:KEY]] Another value
 *
 * @param {string} content - The strings file content
 * @returns {Map<string, string>} Map of key to value
 */
function parseStringsFile(content) {
  const strings = new Map();

  // Pattern: [[KEY]] followed by value until next [[ or end
  const pattern = /\[\[([^\]]+)\]\]\s*([\s\S]*?)(?=\[\[|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();

    if (key && value) {
      strings.set(key, value);
    }
  }

  return strings;
}

/**
 * Also handle common MT mangling of markers
 * @param {string} content - The potentially mangled strings content
 * @returns {string} Cleaned content
 */
function cleanMTMangling(content) {
  // Handle escaped brackets from MT: \[\[ -> [[
  let cleaned = content.replace(/\\\[\\\[/g, '[[');
  cleaned = cleaned.replace(/\\\]\\\]/g, ']]');

  // Handle space-separated brackets: [ [ -> [[
  cleaned = cleaned.replace(/\[\s+\[/g, '[[');
  cleaned = cleaned.replace(/\]\s+\]/g, ']]');

  return cleaned;
}

// ============================================================================
// Sidecar Updating
// ============================================================================

/**
 * Update sidecar with translated strings
 *
 * @param {object} sidecar - The sidecar data
 * @param {Map<string, string>} strings - Translated strings
 * @param {boolean} verbose - Whether to log details
 * @returns {{sidecar: object, updates: number}}
 */
function updateSidecar(sidecar, strings, verbose) {
  let updates = 0;

  // Update frontmatter title
  if (strings.has('FRONTMATTER:title') && sidecar.frontmatter) {
    const translatedTitle = strings.get('FRONTMATTER:title');
    if (sidecar.frontmatter.title !== translatedTitle) {
      if (verbose) {
        console.error(`  Updating frontmatter title: "${sidecar.frontmatter.title}" -> "${translatedTitle}"`);
      }
      sidecar.frontmatter.title = translatedTitle;
      updates++;
    }
  }

  // Update table titles and summaries
  if (sidecar.tables) {
    for (const [tableKey, tableData] of Object.entries(sidecar.tables)) {
      // Update table title
      const titleKey = `${tableKey}:title`;
      if (strings.has(titleKey)) {
        const translatedTitle = strings.get(titleKey);
        if (tableData.title !== translatedTitle) {
          if (verbose) {
            const oldTitle = tableData.title || '(none)';
            console.error(`  Updating ${tableKey} title: "${oldTitle}" -> "${translatedTitle}"`);
          }
          tableData.title = translatedTitle;
          updates++;
        }
      }

      // Update table summary
      const summaryKey = `${tableKey}:summary`;
      if (strings.has(summaryKey)) {
        const translatedSummary = strings.get(summaryKey);
        if (tableData.summary !== translatedSummary) {
          if (verbose) {
            const oldSummary = tableData.summary ? tableData.summary.substring(0, 40) + '...' : '(none)';
            const newSummary = translatedSummary.substring(0, 40) + '...';
            console.error(`  Updating ${tableKey} summary: "${oldSummary}" -> "${newSummary}"`);
          }
          tableData.summary = translatedSummary;
          updates++;
        }
      }
    }
  }

  return { sidecar, updates };
}

/**
 * Update markdown file with translated table titles
 *
 * The markdown contains **English Title** before [[TABLE:N]] placeholders.
 * This function replaces them with translated titles from the sidecar.
 *
 * @param {string} content - The markdown content
 * @param {object} sidecar - The updated sidecar with translated titles
 * @param {boolean} verbose - Whether to log details
 * @returns {{content: string, updates: number}}
 */
function updateMarkdownTitles(content, sidecar, verbose) {
  if (!sidecar.tables) {
    return { content, updates: 0 };
  }

  let updates = 0;
  let updatedContent = content;

  for (const [tableKey, tableData] of Object.entries(sidecar.tables)) {
    if (!tableData.title) continue;

    // Pattern: **Any Title**\n\n[[TABLE:N]] or \[\[TABLE:N\]\]
    // We need to replace the title line with the translated one
    const tableNum = tableKey.replace('TABLE:', '');
    const pattern = new RegExp(
      `\\*\\*([^*]+)\\*\\*\\s*\\n\\n((?:\\\\\\[\\\\\\[|\\[\\[)TABLE:${tableNum}(?:\\\\\\]\\\\\\]|\\]\\]))`,
      'g'
    );

    updatedContent = updatedContent.replace(pattern, (match, oldTitle, placeholder) => {
      if (oldTitle.trim() !== tableData.title) {
        updates++;
        if (verbose) {
          console.error(`  Updated markdown title for ${tableKey}`);
        }
      }
      return `**${tableData.title}**\n\n${placeholder}`;
    });
  }

  return { content: updatedContent, updates };
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
  const { dryRun, verbose } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  // Find strings file
  const stringsPath = findStringsFile(filePath);

  if (!stringsPath) {
    if (verbose) {
      console.error(`  No strings file found for: ${filePath}`);
    }
    return { success: true, updates: 0, noStringsFile: true };
  }

  // Find sidecar file
  const sidecarPath = findSidecarFile(filePath);

  if (!sidecarPath) {
    if (verbose) {
      console.error(`  No sidecar file found for: ${filePath}`);
    }
    return { success: true, updates: 0, noSidecar: true };
  }

  // Load and parse strings file
  let stringsContent = fs.readFileSync(stringsPath, 'utf-8');
  stringsContent = cleanMTMangling(stringsContent);
  const strings = parseStringsFile(stringsContent);

  if (strings.size === 0) {
    if (verbose) {
      console.error(`  No valid strings found in: ${stringsPath}`);
    }
    return { success: true, updates: 0, emptyStrings: true };
  }

  // Load sidecar
  let sidecar;
  try {
    sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
  } catch (err) {
    return { success: false, error: `Failed to parse sidecar: ${sidecarPath}` };
  }

  // Update sidecar with translated strings
  const { sidecar: updatedSidecar, updates: sidecarUpdates } = updateSidecar(sidecar, strings, verbose);

  // Update markdown file with translated table titles
  const mdContent = fs.readFileSync(filePath, 'utf-8');
  const { content: updatedMdContent, updates: mdUpdates } = updateMarkdownTitles(mdContent, updatedSidecar, verbose);

  const totalUpdates = sidecarUpdates + mdUpdates;

  if (totalUpdates === 0) {
    if (verbose) {
      console.error(`  No updates needed (strings already applied)`);
    }
    return { success: true, updates: 0 };
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would update ${totalUpdates} string(s) for: ${filePath}`);
    console.log(`  Strings file: ${stringsPath}`);
    console.log(`  Sidecar updates: ${sidecarUpdates}`);
    console.log(`  Markdown title updates: ${mdUpdates}`);
    return { success: true, updates: totalUpdates, dryRun: true };
  }

  // Write updated sidecar
  fs.writeFileSync(sidecarPath, JSON.stringify(updatedSidecar, null, 2));

  // Write updated markdown if titles changed
  if (mdUpdates > 0) {
    fs.writeFileSync(filePath, updatedMdContent);
  }

  if (verbose) {
    console.error(`  Updated sidecar: ${sidecarPath}`);
    if (mdUpdates > 0) {
      console.error(`  Updated markdown: ${filePath}`);
    }
  }

  return {
    success: true,
    updates: totalUpdates,
    sidecarUpdates,
    mdUpdates,
    stringsPath,
    sidecarPath
  };
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

  let totalUpdates = 0;
  let filesUpdated = 0;
  let filesNoStrings = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, options);

    if (result.success) {
      if (result.updates > 0) {
        filesUpdated++;
        totalUpdates += result.updates;
        if (!options.verbose && !options.dryRun) {
          console.log(`  Updated ${result.updates} string(s): ${path.relative(directory, file)}`);
        }
      }
      if (result.noStringsFile) {
        filesNoStrings++;
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('String Restoration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files updated: ${filesUpdated}`);
  console.log(`  Files without strings: ${filesNoStrings}`);
  console.log(`  Total strings restored: ${totalUpdates}`);
}

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

      if (args.verbose && result.updates > 0) {
        console.error(`Restored ${result.updates} string(s)`);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
