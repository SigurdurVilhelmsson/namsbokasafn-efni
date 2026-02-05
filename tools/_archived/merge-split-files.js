#!/usr/bin/env node

/**
 * merge-split-files.js
 *
 * Merges split Erlendur MT files back into single files.
 * Looks for files like 1-2(a).is.md, 1-2(b).is.md and merges them into 1-2.is.md
 *
 * Usage:
 *   node tools/merge-split-files.js --batch <directory>
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    batch: null,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run' || arg === '-n') result.dryRun = true;
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
  }
  return result;
}

function printHelp() {
  console.log(`
merge-split-files.js - Merge Erlendur split files back together

Finds split files like 1-2(a).is.md, 1-2(b).is.md and merges them into 1-2.is.md.
Removes the Erlendur part headers during merge.

Usage:
  node tools/merge-split-files.js --batch <directory>

Options:
  --batch <dir>     Process all split .is.md files in directory
  --dry-run, -n     Show what would be done without writing files
  --verbose, -v     Show detailed progress
  -h, --help        Show this help message

Examples:
  node tools/merge-split-files.js --batch books/efnafraedi/02-mt-output/ch01/
`);
}

/**
 * Remove Erlendur header from content
 * Headers look like: ## title: "..." chapter: "..." module: "..." language: "..." part: "..."
 * Also handles legacy Icelandic: ## titill: „..." kafli: „..." eining: „..." tungumál: „..." hluti: „..."
 */
function removeErlendurHeader(content) {
  // Match various versions of the header (English and legacy Icelandic)
  // Use multiline flag and remove anywhere in content (not just at start)
  const headerPatterns = [
    /^##\s*titill:.*?hluti:.*?$\n?\n?/gim,
    /^##\s*title:.*?part:.*?$\n?\n?/gim,
  ];

  let result = content;
  for (const pattern of headerPatterns) {
    result = result.replace(pattern, '');
  }

  return result;
}

/**
 * Find all split file groups in a directory
 * Returns: { '1-2': ['1-2(a).is.md', '1-2(b).is.md', '1-2(c).is.md'], ... }
 */
function findSplitGroups(directory) {
  const files = fs.readdirSync(directory);
  const groups = {};

  // Find files with (a), (b), etc. pattern
  const splitPattern = /^(.+)\(([a-z])\)\.is\.md$/;

  for (const file of files) {
    const match = file.match(splitPattern);
    if (match) {
      const base = match[1];
      if (!groups[base]) {
        groups[base] = [];
      }
      groups[base].push(file);
    }
  }

  // Sort each group alphabetically (a, b, c order)
  for (const base of Object.keys(groups)) {
    groups[base].sort();
  }

  return groups;
}

/**
 * Merge a group of split files
 */
function mergeSplitGroup(directory, baseName, files, options) {
  const { verbose, dryRun } = options;

  if (verbose) {
    console.log(`\nMerging ${baseName}:`);
    for (const f of files) {
      console.log(`  - ${f}`);
    }
  }

  let mergedContent = '';

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(directory, files[i]);
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove Erlendur header
    content = removeErlendurHeader(content);

    // Add content (with spacing between parts)
    if (i > 0 && mergedContent && !mergedContent.endsWith('\n\n')) {
      mergedContent += '\n\n';
    }
    mergedContent += content.trim();
  }

  const outputFile = `${baseName}.is.md`;
  const outputPath = path.join(directory, outputFile);

  if (!dryRun) {
    fs.writeFileSync(outputPath, mergedContent + '\n', 'utf-8');

    // Remove split files after successful merge
    for (const f of files) {
      fs.unlinkSync(path.join(directory, f));
    }
  }

  if (verbose || dryRun) {
    const action = dryRun ? 'Would write' : 'Wrote';
    console.log(`  ${action}: ${outputFile} (${mergedContent.length} chars)`);
    if (!dryRun) {
      console.log(`  Removed: ${files.join(', ')}`);
    }
  }

  return { outputFile, chars: mergedContent.length, partsCount: files.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.batch) {
    console.error('Error: Please provide --batch <directory>');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(args.batch)) {
      throw new Error('Directory not found: ' + args.batch);
    }

    const groups = findSplitGroups(args.batch);
    const groupCount = Object.keys(groups).length;

    if (groupCount === 0) {
      console.log('No split files found to merge.');
      process.exit(0);
    }

    console.log(`Found ${groupCount} split file group(s) to merge`);

    const results = [];
    for (const [baseName, files] of Object.entries(groups)) {
      const result = mergeSplitGroup(args.batch, baseName, files, args);
      results.push(result);
    }

    // Summary
    console.log('\n' + '─'.repeat(50));
    if (args.dryRun) {
      console.log('DRY RUN - No files written');
    }
    console.log('Merge Complete');
    console.log('─'.repeat(50));
    console.log(`  Groups merged: ${results.length}`);
    console.log(`  Total parts merged: ${results.reduce((sum, r) => sum + r.partsCount, 0)}`);
  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
