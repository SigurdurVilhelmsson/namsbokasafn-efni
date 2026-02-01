#!/usr/bin/env node

/**
 * integrate-translated-tables.js
 *
 * Integrates translated table markdown files into the MT output and publication content.
 *
 * Usage:
 *   node tools/integrate-translated-tables.js --chapter efnafraedi ch01
 *
 * Expected input:
 *   books/{book}/02-for-mt/{chapter}/tables-for-mt/{section}-tables.is.md
 *
 * What it does:
 *   1. Reads translated table files (*-tables.is.md)
 *   2. Parses TABLE:N markers to extract individual tables
 *   3. Updates the corresponding MT output files with translated tables
 *   4. Re-runs compile-chapter to regenerate publication content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--chapter' && args[i + 1] && args[i + 2]) {
      result.book = args[++i];
      result.chapter = args[++i];
    }
  }
  return result;
}

function printHelp() {
  console.log(`
integrate-translated-tables.js - Integrate translated tables into content

Usage:
  node tools/integrate-translated-tables.js --chapter <book> <chapter>

Options:
  --chapter <book> <ch>  Book and chapter to process (e.g., efnafraedi ch01)
  --dry-run              Show what would change without writing
  --verbose, -v          Show processing details
  -h, --help             Show this help

Expected workflow:
  1. Run MT on tables-for-mt/*.en.md files
  2. Save translated files as tables-for-mt/*.is.md
  3. Run this script to integrate

Example:
  node tools/integrate-translated-tables.js --chapter efnafraedi ch01
`);
}

/**
 * Parse a translated tables file and extract individual tables
 */
function parseTranslatedTables(content) {
  const tables = {};
  const lines = content.split('\n');

  let currentTableKey = null;
  let currentTableLines = [];

  for (const line of lines) {
    // Match TABLE:N header
    const tableMatch = line.match(/^##\s+TABLE:(\d+)/);

    if (tableMatch) {
      // Save previous table if any
      if (currentTableKey && currentTableLines.length > 0) {
        tables[currentTableKey] = currentTableLines.join('\n').trim();
      }

      currentTableKey = `TABLE:${tableMatch[1]}`;
      currentTableLines = [];
    } else if (currentTableKey) {
      // Skip the title line (starts with ## TABLE) and empty lines before table
      if (line.startsWith('|') || currentTableLines.length > 0) {
        currentTableLines.push(line);
      }
    }
  }

  // Save last table
  if (currentTableKey && currentTableLines.length > 0) {
    tables[currentTableKey] = currentTableLines.join('\n').trim();
  }

  return tables;
}

/**
 * Replace a table in content with translated version
 */
function replaceTableInContent(content, tableId, translatedTable, sidecar) {
  // Find the table data in sidecar to get the ID
  const tableData = sidecar.tables[tableId];
  if (!tableData || !tableData.id) {
    return { content, replaced: false };
  }

  const id = tableData.id;

  // Pattern to find the table by its ID attribute
  // Tables end with {id="..."} or {#id}
  const patterns = [
    // Multi-line table ending with {id="..."}
    new RegExp(`(\\|[^\\n]*\\n(?:[^\\n]*\\n)*?)\\{id="${id}"[^}]*\\}`, 'g'),
    // Multi-line table ending with {#id}
    new RegExp(`(\\|[^\\n]*\\n(?:[^\\n]*\\n)*?)\\{#${id}\\}`, 'g'),
  ];

  let replaced = false;
  let result = content;

  for (const pattern of patterns) {
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, (match) => {
        replaced = true;
        // Preserve the ID attribute
        const idAttr = match.match(/\{[^}]+\}$/)?.[0] || `{id="${id}"}`;
        return translatedTable + '\n' + idAttr;
      });
      break;
    }
  }

  return { content: result, replaced };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book || !args.chapter) {
    console.error('Error: --chapter <book> <chapter> is required');
    process.exit(1);
  }

  const booksDir = path.join(__dirname, '..', 'books');
  // Check both possible locations for translated table files
  let tablesDir = path.join(booksDir, args.book, '02-mt-output', args.chapter);
  if (!fs.readdirSync(tablesDir).some((f) => f.endsWith('-tables.is.md'))) {
    tablesDir = path.join(booksDir, args.book, '02-for-mt', args.chapter, 'tables-for-mt');
  }
  const mtOutputDir = path.join(booksDir, args.book, '02-mt-output', args.chapter);
  const sidecarDir = path.join(booksDir, args.book, '02-for-mt', args.chapter);

  if (!fs.existsSync(tablesDir)) {
    console.error(`Error: Tables directory not found: ${tablesDir}`);
    process.exit(1);
  }

  // Find translated table files
  const tableFiles = fs
    .readdirSync(tablesDir)
    .filter((f) => f.endsWith('-tables.is.md'))
    .sort();

  if (tableFiles.length === 0) {
    console.error('No translated table files (*-tables.is.md) found');
    console.error(`Expected in: ${tablesDir}`);
    process.exit(1);
  }

  console.log(`Found ${tableFiles.length} translated table file(s)`);
  if (args.dryRun) console.log('[DRY RUN MODE]');
  console.log('');

  let totalTables = 0;
  let filesUpdated = 0;

  for (const tableFile of tableFiles) {
    // Extract section from filename (e.g., "1-2" from "1-2-tables.is.md")
    const section = tableFile.replace('-tables.is.md', '');
    const mtOutputFile = path.join(mtOutputDir, `${section}.is.md`);
    const sidecarFile = path.join(sidecarDir, `${section}-protected.json`);

    console.log(`Processing: ${tableFile}`);

    if (!fs.existsSync(mtOutputFile)) {
      console.error(`  Warning: MT output file not found: ${mtOutputFile}`);
      continue;
    }

    if (!fs.existsSync(sidecarFile)) {
      console.error(`  Warning: Sidecar file not found: ${sidecarFile}`);
      continue;
    }

    // Read files
    const translatedContent = fs.readFileSync(path.join(tablesDir, tableFile), 'utf-8');
    const mtContent = fs.readFileSync(mtOutputFile, 'utf-8');
    const sidecar = JSON.parse(fs.readFileSync(sidecarFile, 'utf-8'));

    // Parse translated tables
    const translatedTables = parseTranslatedTables(translatedContent);

    if (args.verbose) {
      console.log(`  Found ${Object.keys(translatedTables).length} table(s)`);
    }

    // Replace tables in MT output
    let updatedContent = mtContent;
    let tablesReplaced = 0;

    for (const [tableKey, tableMarkdown] of Object.entries(translatedTables)) {
      const { content: newContent, replaced } = replaceTableInContent(
        updatedContent,
        tableKey,
        tableMarkdown,
        sidecar
      );

      if (replaced) {
        updatedContent = newContent;
        tablesReplaced++;
        if (args.verbose) {
          console.log(`  Replaced: ${tableKey}`);
        }
      } else {
        console.error(`  Warning: Could not find ${tableKey} in ${mtOutputFile}`);
      }
    }

    if (tablesReplaced > 0) {
      totalTables += tablesReplaced;
      filesUpdated++;

      if (!args.dryRun) {
        fs.writeFileSync(mtOutputFile, updatedContent);
        console.log(`  Updated: ${path.basename(mtOutputFile)} (${tablesReplaced} tables)`);
      } else {
        console.log(
          `  [DRY RUN] Would update: ${path.basename(mtOutputFile)} (${tablesReplaced} tables)`
        );
      }
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log('Table Integration Complete');
  console.log('─'.repeat(50));
  console.log(`  Files updated: ${filesUpdated}`);
  console.log(`  Tables integrated: ${totalTables}`);

  if (!args.dryRun && filesUpdated > 0) {
    console.log('');
    console.log('Next steps:');
    console.log(
      `  1. Run: node tools/compile-chapter.js ${args.book} ${args.chapter.replace('ch', '')} --track mt-preview`
    );
    console.log(`  2. Sync: node scripts/sync-content.js --source ../namsbokasafn-efni`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
