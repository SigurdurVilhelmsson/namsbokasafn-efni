#!/usr/bin/env node

/**
 * init-faithful-review.js
 *
 * Initialize 03-faithful/ with complete MT output from 02-mt-output/
 * This ensures reviewers start with complete content and injection has no English fallback.
 *
 * Usage:
 *   node tools/init-faithful-review.js --chapter <num>
 *   node tools/init-faithful-review.js --batch <directory>
 *
 * Options:
 *   --chapter <num>      Initialize chapter from 02-mt-output/chNN/
 *   --batch <dir>        Initialize from specific directory
 *   --force              Overwrite existing files in 03-faithful
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
    force: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--force') result.force = true;
    else if (arg === '--chapter' && args[i + 1]) result.chapter = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
  }
  return result;
}

function printHelp() {
  console.log(`
init-faithful-review.js - Initialize 03-faithful with complete MT output

After MT translation is complete (02-mt-output/), this script prepares the
faithful review directory (03-faithful/) by copying complete segment files.

This ensures:
- Reviewers start with complete content (no missing segments)
- Injection from 03-faithful has no English fallback
- All subsequent processing works with complete translations

Usage:
  node tools/init-faithful-review.js --chapter <num>
  node tools/init-faithful-review.js --batch <directory>

Options:
  --chapter <num>      Initialize chapter from 02-mt-output/chNN/
  --batch <dir>        Initialize from specific directory
  --force              Overwrite existing files in 03-faithful
  --verbose, -v        Show detailed progress
  -h, --help           Show this help message

Examples:
  # Initialize chapter 9 for review
  node tools/init-faithful-review.js --chapter 9 --verbose

  # Initialize specific directory
  node tools/init-faithful-review.js --batch books/efnafraedi/02-mt-output/ch12/

  # Force overwrite existing files
  node tools/init-faithful-review.js --chapter 5 --force
`);
}

/**
 * Find all segment files in directory
 */
function findSegmentFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  return files
    .filter((f) => f.endsWith('-segments.is.md'))
    .map((f) => path.join(directory, f))
    .sort();
}

/**
 * Initialize one segment file
 */
function initializeFile(sourcePath, targetPath, force, verbose) {
  const filename = path.basename(sourcePath);

  // Check if target exists
  if (fs.existsSync(targetPath) && !force) {
    if (verbose) {
      console.log(`  ⊘ ${filename} (already exists, use --force to overwrite)`);
    }
    return { status: 'skipped', filename };
  }

  // Ensure target directory exists
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(sourcePath, targetPath);

  // Get stats
  const stats = fs.statSync(targetPath);
  const lines = fs.readFileSync(targetPath, 'utf8').split('\n').length;
  const segments = (fs.readFileSync(targetPath, 'utf8').match(/<!-- SEG:/g) || []).length;

  if (verbose) {
    console.log(
      `  ✓ ${filename} (${segments} segments, ${lines} lines, ${(stats.size / 1024).toFixed(1)}KB)`
    );
  }

  return {
    status: 'copied',
    filename,
    segments,
    lines,
    size: stats.size,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Determine source and target directories
  let sourceDir, targetDir;

  if (args.chapter) {
    const chNum = args.chapter.toString().padStart(2, '0');
    sourceDir = path.join(BOOK_DIR, '02-mt-output', `ch${chNum}`);
    targetDir = path.join(BOOK_DIR, '03-faithful', `ch${chNum}`);
  } else if (args.batch) {
    sourceDir = args.batch;
    // Determine target by replacing 02-mt-output with 03-faithful
    if (sourceDir.includes('02-mt-output')) {
      targetDir = sourceDir.replace('02-mt-output', '03-faithful');
    } else {
      console.error('Error: --batch directory must be in 02-mt-output/');
      process.exit(1);
    }
  } else {
    console.error('Error: Must specify --chapter or --batch');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  // Validate source directory
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  console.log('\nInitializing 03-faithful with MT output');
  console.log('========================================\n');
  console.log(`Source: ${sourceDir}`);
  console.log(`Target: ${targetDir}\n`);

  // Find all segment files
  const segmentFiles = findSegmentFiles(sourceDir);

  if (segmentFiles.length === 0) {
    console.error(`No segment files found in: ${sourceDir}`);
    process.exit(1);
  }

  console.log(`Found ${segmentFiles.length} segment file(s)\n`);

  // Process each file
  const results = [];
  for (const sourcePath of segmentFiles) {
    const filename = path.basename(sourcePath);
    const targetPath = path.join(targetDir, filename);

    const result = initializeFile(sourcePath, targetPath, args.force, args.verbose);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');

  const copied = results.filter((r) => r.status === 'copied');
  const skipped = results.filter((r) => r.status === 'skipped');

  console.log(`  Files copied: ${copied.length}`);
  console.log(`  Files skipped: ${skipped.length}`);

  if (copied.length > 0) {
    const totalSegments = copied.reduce((sum, r) => sum + r.segments, 0);
    console.log(`  Total segments: ${totalSegments}`);
  }

  console.log(`\n03-faithful is now ready for review and injection`);

  // Validation check
  console.log('\n' + '='.repeat(60));
  console.log('Validation:');
  console.log(`  Source: ${segmentFiles.length} files`);
  console.log(`  Target: ${results.length} files`);

  if (copied.length > 0) {
    console.log(`  ✓ Successfully initialized ${copied.length} file(s) for faithful review`);
  }
  if (skipped.length > 0) {
    console.log(`  ⊘ Skipped ${skipped.length} existing file(s) (use --force to overwrite)`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
