#!/usr/bin/env node

/**
 * protect-for-mt.js
 *
 * Pre-MT protection script that extracts frontmatter and tables before
 * sending content to Erlendur machine translation (malstadur.is).
 *
 * The MT process destroys these structures:
 * - YAML frontmatter: converted to `## titill:...` heading
 * - Tables: line breaks removed, pipes merged
 *
 * This script:
 * 1. Extracts YAML frontmatter
 * 2. Finds all markdown tables
 * 3. Replaces tables with [[TABLE:N]]{id="..."} placeholders
 * 4. Writes sidecar JSON file (*-protected.json)
 * 5. Outputs modified markdown
 *
 * Usage:
 *   node tools/protect-for-mt.js <file.en.md> [--in-place]
 *   node tools/protect-for-mt.js --batch <directory>
 *   node tools/protect-for-mt.js <file.en.md> --dry-run
 *
 * Options:
 *   --in-place        Modify the input file in place
 *   --batch <dir>     Process all .en.md files in directory
 *   --dry-run         Show what would change without writing
 *   --verbose         Show processing details
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
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
protect-for-mt.js - Pre-MT protection for tables and frontmatter

Extracts content that would be destroyed by MT and saves to sidecar JSON.
Tables are replaced with [[TABLE:N]]{id="..."} placeholders.

Also generates a strings file (*-strings.en.txt) with translatable content:
- Frontmatter titles
- Table titles
- Table summaries (accessibility text)

The strings file should be sent to MT alongside the main content.

Usage:
  node tools/protect-for-mt.js <file.en.md> [options]
  node tools/protect-for-mt.js --batch <directory>

Options:
  --in-place        Modify the input file in place
  --batch <dir>     Process all .en.md files in directory recursively
  --dry-run         Show what would change without writing files
  --verbose, -v     Show processing details
  -h, --help        Show this help message

Output Files:
  *-protected.json  Sidecar with extracted tables and frontmatter
  *-strings.en.txt  Translatable strings for MT

Examples:
  # Preview protection for a single file
  node tools/protect-for-mt.js books/efnafraedi/02-for-mt/ch01/1-5.en.md --dry-run

  # Protect a file in place (writes sidecar and modifies file)
  node tools/protect-for-mt.js books/efnafraedi/02-for-mt/ch01/1-5.en.md --in-place

  # Process all files in a chapter
  node tools/protect-for-mt.js --batch books/efnafraedi/02-for-mt/ch01/
`);
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

/**
 * Extract YAML frontmatter from markdown content
 * @param {string} content - The markdown content
 * @returns {{frontmatter: object|null, contentWithoutFrontmatter: string}}
 */
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

  if (!frontmatterMatch) {
    return { frontmatter: null, contentWithoutFrontmatter: content };
  }

  const frontmatterText = frontmatterMatch[1];
  const frontmatter = {};

  // Parse YAML-like frontmatter (simple key: value pairs)
  for (const line of frontmatterText.split('\n')) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }

  const contentWithoutFrontmatter = content.slice(frontmatterMatch[0].length);

  return { frontmatter, contentWithoutFrontmatter };
}

// ============================================================================
// Table Detection and Protection
// ============================================================================

/**
 * Match a markdown table with optional preceding title and trailing attributes.
 *
 * Pattern matches:
 * - Optional bolded title: **Title Text**
 * - Table: rows starting with |
 * - Optional trailing attributes: {id="..." summary="..."}
 */
const TABLE_PATTERN = /(?:^\*\*([^*\n]+)\*\*\s*\n\n)?((?:^\|[^\n]+\|\s*\n)+)(?:\{([^}]+)\})?/gm;

/**
 * Extract tables from markdown and replace with placeholders
 * @param {string} content - Markdown content (without frontmatter)
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {{content: string, tables: object}}
 */
function extractTables(content, verbose) {
  const tables = {};
  let tableCount = 0;

  const protectedContent = content.replace(TABLE_PATTERN, (match, title, tableMarkdown, attributes) => {
    tableCount++;
    const key = `TABLE:${tableCount}`;

    // Parse attributes to extract id
    let id = null;
    let summary = null;

    if (attributes) {
      const idMatch = attributes.match(/id="([^"]+)"/);
      if (idMatch) id = idMatch[1];

      const summaryMatch = attributes.match(/summary="([^"]+)"/);
      if (summaryMatch) summary = summaryMatch[1];
    }

    // Store the table data
    tables[key] = {
      markdown: tableMarkdown.trim(),
      ...(title && { title: title.trim() }),
      ...(id && { id }),
      ...(summary && { summary })
    };

    if (verbose) {
      console.error(`  Protected ${key}: ${title || '(no title)'} ${id ? `(id="${id}")` : ''}`);
    }

    // Create placeholder with optional id attribute
    let placeholder = `[[${key}]]`;
    if (id) {
      placeholder += `{id="${id}"}`;
    }

    // If there was a title, preserve it before the placeholder
    if (title) {
      return `**${title.trim()}**\n\n${placeholder}`;
    }

    return placeholder;
  });

  return { content: protectedContent, tables };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Get the sidecar file path for a markdown file
 * @param {string} mdPath - Path to the markdown file
 * @returns {string} Path to the sidecar JSON file
 */
function getSidecarPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.en.md');
  return path.join(dir, `${basename}-protected.json`);
}

/**
 * Get the strings file path for a markdown file
 * @param {string} mdPath - Path to the markdown file
 * @returns {string} Path to the strings .en.txt file
 */
function getStringsPath(mdPath) {
  const dir = path.dirname(mdPath);
  const basename = path.basename(mdPath, '.en.md');
  return path.join(dir, `${basename}-strings.en.txt`);
}

/**
 * Generate translatable strings content from sidecar data
 * @param {object} sidecar - The sidecar data with frontmatter and tables
 * @returns {string} Formatted strings content for MT
 */
function generateStringsContent(sidecar) {
  const lines = [];

  // Add frontmatter title if present
  if (sidecar.frontmatter?.title) {
    lines.push(`[[FRONTMATTER:title]] ${sidecar.frontmatter.title}`);
  }

  // Add table titles and summaries
  if (sidecar.tables) {
    for (const [key, table] of Object.entries(sidecar.tables)) {
      if (table.title) {
        lines.push(`[[${key}:title]] ${table.title}`);
      }
      if (table.summary) {
        lines.push(`[[${key}:summary]] ${table.summary}`);
      }
    }
  }

  return lines.join('\n\n');
}

/**
 * Process a single file
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {object} Processing result
 */
function processFile(filePath, options) {
  const { dryRun, verbose, inPlace } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  if (!filePath.endsWith('.en.md')) {
    return { success: false, error: 'File must have .en.md extension' };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Extract frontmatter
  const { frontmatter, contentWithoutFrontmatter } = extractFrontmatter(content);

  // Extract tables
  const { content: protectedContent, tables } = extractTables(contentWithoutFrontmatter, verbose);

  const tableCount = Object.keys(tables).length;
  const hasFrontmatter = frontmatter !== null;

  if (tableCount === 0 && !hasFrontmatter) {
    if (verbose) {
      console.log(`  No tables or frontmatter to protect in: ${filePath}`);
    }
    return { success: true, tablesProtected: 0, hasFrontmatter: false };
  }

  // Build sidecar data
  const sidecar = {
    sourceFile: path.basename(filePath),
    ...(frontmatter?.module && { module: frontmatter.module }),
    ...(frontmatter?.section && { section: frontmatter.section }),
    ...(hasFrontmatter && { frontmatter }),
    ...(tableCount > 0 && { tables })
  };

  // Determine outputs
  const sidecarPath = getSidecarPath(filePath);
  const stringsPath = getStringsPath(filePath);
  const stringsContent = generateStringsContent(sidecar);
  const hasStrings = stringsContent.length > 0;

  if (dryRun) {
    console.log(`[DRY RUN] Would protect ${tableCount} table(s) in: ${filePath}`);
    if (hasFrontmatter) {
      console.log(`  Frontmatter keys: ${Object.keys(frontmatter).join(', ')}`);
    }
    if (tableCount > 0) {
      console.log(`  Tables: ${Object.keys(tables).join(', ')}`);
      for (const [key, table] of Object.entries(tables)) {
        const preview = table.markdown.split('\n')[0].substring(0, 60);
        console.log(`    ${key}: ${table.title || '(no title)'} - ${preview}...`);
      }
    }
    console.log(`  Would write sidecar: ${sidecarPath}`);
    if (hasStrings) {
      console.log(`  Would write strings: ${stringsPath}`);
      console.log(`  Translatable strings:`);
      for (const line of stringsContent.split('\n\n')) {
        if (line.trim()) {
          const preview = line.length > 80 ? line.substring(0, 77) + '...' : line;
          console.log(`    ${preview}`);
        }
      }
    }
    return { success: true, tablesProtected: tableCount, hasFrontmatter, hasStrings, dryRun: true };
  }

  // Write sidecar file
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));

  if (verbose) {
    console.log(`  Wrote sidecar: ${sidecarPath}`);
  }

  // Write strings file if there's translatable content
  if (hasStrings) {
    fs.writeFileSync(stringsPath, stringsContent);
    if (verbose) {
      console.log(`  Wrote strings: ${stringsPath}`);
    }
  }

  // Write protected content (without frontmatter, tables replaced with placeholders)
  if (inPlace) {
    fs.writeFileSync(filePath, protectedContent);
    if (verbose) {
      console.log(`  Modified: ${filePath}`);
    }
  } else {
    console.log(protectedContent);
  }

  return {
    success: true,
    tablesProtected: tableCount,
    hasFrontmatter,
    hasStrings,
    sidecarPath,
    stringsPath: hasStrings ? stringsPath : null
  };
}

/**
 * Find all .en.md files in a directory recursively
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findEnglishMarkdownFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findEnglishMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.en.md')) {
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
  const files = findEnglishMarkdownFiles(directory);

  if (files.length === 0) {
    console.log(`No .en.md files found in ${directory}`);
    return;
  }

  console.log(`Found ${files.length} .en.md file(s) in ${directory}`);
  if (options.dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  let totalTables = 0;
  let filesWithTables = 0;
  let filesWithFrontmatter = 0;
  let filesWithStrings = 0;

  for (const file of files) {
    if (options.verbose) {
      console.log(`Processing: ${path.relative(directory, file)}`);
    }

    const result = processFile(file, { ...options, inPlace: true });

    if (result.success) {
      if (result.tablesProtected > 0) {
        filesWithTables++;
        totalTables += result.tablesProtected;
        if (!options.verbose && !options.dryRun) {
          console.log(`  Protected ${result.tablesProtected} table(s): ${path.relative(directory, file)}`);
        }
      }
      if (result.hasFrontmatter) {
        filesWithFrontmatter++;
      }
      if (result.hasStrings) {
        filesWithStrings++;
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Pre-MT Protection Complete');
  console.log('─'.repeat(50));
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Files with frontmatter: ${filesWithFrontmatter}`);
  console.log(`  Files with tables: ${filesWithTables}`);
  console.log(`  Total tables protected: ${totalTables}`);
  console.log(`  Files with translatable strings: ${filesWithStrings}`);
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

      if (!args.dryRun && (result.tablesProtected > 0 || result.hasFrontmatter)) {
        console.error(`Protected ${result.tablesProtected} table(s)`);
        if (result.sidecarPath) {
          console.error(`Sidecar: ${result.sidecarPath}`);
        }
        if (result.stringsPath) {
          console.error(`Strings: ${result.stringsPath}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
