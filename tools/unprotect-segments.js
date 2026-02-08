#!/usr/bin/env node

/**
 * unprotect-segments.js
 *
 * Post-processing for MT output - the reverse of protect-segments-for-mt.js
 *
 * This script prepares MT output for injection by:
 * 1. Merging split files (a), (b), (c) back together
 * 2. Converting {{SEG:xxx}} back to <!-- SEG:xxx -->
 * 3. Restoring markdown links from -links.json
 * 4. Validating output is ready for cnxml-inject.js
 *
 * Usage:
 *   node tools/unprotect-segments.js --chapter <num>
 *   node tools/unprotect-segments.js --batch <directory>
 *
 * Options:
 *   --chapter <num>      Process specific chapter from 02-mt-output/chNN/
 *   --batch <dir>        Process all segment files in directory
 *   --source-dir <dir>   Source directory (default: 02-mt-output)
 *   --output-dir <dir>   Output directory (default: same as source, overwrites)
 *   --keep-splits        Keep split files after merging (default: delete)
 *   --verbose, -v        Show detailed progress
 *   -h, --help           Show this help message
 */

import fs from 'fs';
import path from 'path';

const BOOK_DIR = 'books/efnafraedi';

function parseArgs(args) {
  const result = {
    chapter: null,
    batch: null,
    sourceDir: '02-mt-output',
    outputDir: null,
    keepSplits: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--keep-splits') result.keepSplits = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (arg === '--source-dir' && args[i + 1]) result.sourceDir = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) result.outputDir = args[++i];
  }
  return result;
}

function printHelp() {
  console.log(`
unprotect-segments.js - Prepare MT output for injection

Reverses the protection applied by protect-segments-for-mt.js:
- Merges split files (a), (b), (c) back together
- Converts {{SEG:xxx}} → <!-- SEG:xxx -->
- Restores markdown links from -links.json files

Usage:
  node tools/unprotect-segments.js --chapter <num>
  node tools/unprotect-segments.js --batch <directory>

Options:
  --chapter <num>      Process specific chapter from 02-mt-output/chNN/
  --batch <dir>        Process all segment files in directory
  --source-dir <dir>   Source directory (default: 02-mt-output)
  --output-dir <dir>   Output directory (default: same as source)
  --keep-splits        Keep split files after merging (default: delete)
  --verbose, -v        Show detailed progress
  -h, --help           Show this help message

Examples:
  # Process chapter 9 from MT output
  node tools/unprotect-segments.js --chapter 9 --verbose

  # Process specific directory
  node tools/unprotect-segments.js --batch books/efnafraedi/02-mt-output/ch12/

  # Keep split files after processing
  node tools/unprotect-segments.js --chapter 5 --keep-splits
`);
}

/**
 * Find all base segment files (without (b) or (c) suffixes)
 */
function findBaseFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  return files
    .filter((f) => {
      // Must end with .is.md
      if (!f.endsWith('.is.md')) return false;
      // Must contain -segments
      if (!f.includes('-segments')) return false;
      // Must NOT be a split file
      if (f.match(/\([a-z]\)\.is\.md$/)) return false;
      return true;
    })
    .map((f) => path.join(directory, f))
    .sort();
}

/**
 * Check if split files exist for this base file
 */
function findSplitFiles(basePath) {
  const dir = path.dirname(basePath);
  const basename = path.basename(basePath);
  const moduleId = basename.replace('-segments.is.md', '');

  const splits = [];
  const letters = 'bcdefghijklmnopqrstuvwxyz';

  for (const letter of letters) {
    const splitPath = path.join(dir, `${moduleId}-segments(${letter}).is.md`);
    if (fs.existsSync(splitPath)) {
      splits.push(splitPath);
    } else {
      break; // Stop at first missing letter
    }
  }

  return splits;
}

/**
 * Merge base file and split files
 */
function mergeFiles(basePath, splitPaths, verbose) {
  if (verbose) {
    console.log(`  Merging ${splitPaths.length + 1} parts...`);
  }

  let merged = fs.readFileSync(basePath, 'utf8');

  for (const splitPath of splitPaths) {
    const splitContent = fs.readFileSync(splitPath, 'utf8');
    merged += '\n\n' + splitContent;
  }

  return merged;
}

/**
 * Unprotect segment tags
 */
function unprotectTags(content) {
  let result = content;

  // Convert {{SEG:...}} → <!-- SEG:... -->
  result = result.replace(/\{\{SEG:([^}]+)\}\}/g, '<!-- SEG:$1 -->');

  // Convert {{LINK:N}} → <!-- LINK:N -->
  result = result.replace(/\{\{LINK:(\d+)\}\}/g, '<!-- LINK:$1 -->');

  // Convert {{/LINK}} → <!-- /LINK -->
  result = result.replace(/\{\{\/LINK\}\}/g, '<!-- /LINK -->');

  // Convert {{XREF:N}} → <!-- XREF:N -->
  result = result.replace(/\{\{XREF:(\d+)\}\}/g, '<!-- XREF:$1 -->');

  return result;
}

/**
 * Restore markdown links from -links.json file
 */
function restoreLinks(content, linksPath, verbose) {
  if (!fs.existsSync(linksPath)) {
    return content;
  }

  const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
  let result = content;

  // Restore full links: <!-- LINK:N -->text<!-- /LINK --> → [text](url)
  Object.entries(links).forEach(([id, url]) => {
    const regex = new RegExp(`<!-- LINK:${id} -->([^<]+)<!-- /LINK -->`, 'g');
    result = result.replace(regex, `[$1](${url})`);
  });

  // Restore cross-references: <!-- XREF:N --> → [#ref-id]
  Object.entries(links).forEach(([id, url]) => {
    if (url.startsWith('#')) {
      const regex = new RegExp(`<!-- XREF:${id} -->`, 'g');
      result = result.replace(regex, `[${url}]`);
    }
  });

  if (verbose) {
    console.log(`  Restored ${Object.keys(links).length} links`);
  }

  return result;
}

/**
 * Process a single base file
 */
function processFile(basePath, options) {
  const { outputDir, keepSplits, verbose } = options;
  const basename = path.basename(basePath);
  const moduleId = basename.replace('-segments.is.md', '');
  const dir = path.dirname(basePath);

  if (verbose) {
    console.log(`\nProcessing: ${moduleId}`);
  }

  // Check for split files
  const splitPaths = findSplitFiles(basePath);

  // Read and merge content
  let content;
  if (splitPaths.length > 0) {
    content = mergeFiles(basePath, splitPaths, verbose);
  } else {
    content = fs.readFileSync(basePath, 'utf8');
    if (verbose) {
      console.log(`  Single file (no splits)`);
    }
  }

  // Unprotect tags
  content = unprotectTags(content);

  // Restore links
  const linksPath = path.join(dir, `${moduleId}-segments-links.json`);
  content = restoreLinks(content, linksPath, verbose);

  // Determine output path
  const effectiveOutputDir = outputDir || dir;
  const outputPath = path.join(effectiveOutputDir, basename);

  // Write output
  if (!fs.existsSync(effectiveOutputDir)) {
    fs.mkdirSync(effectiveOutputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf8');

  if (verbose) {
    console.log(`  Wrote: ${basename}`);
  }

  // Delete split files if requested
  if (splitPaths.length > 0 && !keepSplits) {
    for (const splitPath of splitPaths) {
      fs.unlinkSync(splitPath);
      if (verbose) {
        console.log(`  Deleted: ${path.basename(splitPath)}`);
      }
    }
  }

  return {
    module: moduleId,
    splits: splitPaths.length,
    output: outputPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Determine input directory
  let inputDir;
  if (args.chapter) {
    const chNum = args.chapter.toString().padStart(2, '0');
    inputDir = path.join(BOOK_DIR, args.sourceDir, `ch${chNum}`);
  } else if (args.batch) {
    inputDir = args.batch;
  } else {
    console.error('Error: Must specify --chapter or --batch');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Find all base files
  const baseFiles = findBaseFiles(inputDir);

  if (baseFiles.length === 0) {
    console.error(`No segment files found in: ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${baseFiles.length} segment file(s) to process`);

  // Process each file
  const results = [];
  for (const basePath of baseFiles) {
    const result = processFile(basePath, args);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Files processed: ${results.length}`);

  const totalSplits = results.reduce((sum, r) => sum + r.splits, 0);
  console.log(`  Split files merged: ${totalSplits}`);

  if (totalSplits > 0 && !args.keepSplits) {
    console.log(`  Split files deleted: ${totalSplits}`);
  }

  console.log('\nFiles are now ready for cnxml-inject.js');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
