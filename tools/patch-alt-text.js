#!/usr/bin/env node

/**
 * patch-alt-text.js
 *
 * Patches missing alt text in publication files using alt text from MT output.
 *
 * The MT output files (after restore-images.js) have translated alt text:
 *   ![Icelandic alt](images/media/CNX_Chem_01_01_Name.jpg){#CNX_Chem_01_01_Name .class}
 *
 * But publication files (assembled earlier) may have empty alt text:
 *   ![](images/media/CNX_Chem_01_01_Name.jpg){#CNX_Chem_01_01_Name}
 *
 * This script:
 * 1. Extracts figure IDs and alt text from MT output files
 * 2. Updates publication files to add alt text where missing
 *
 * Usage:
 *   node tools/patch-alt-text.js <book> <chapter> [options]
 *   node tools/patch-alt-text.js efnafraedi 1 --verbose
 *
 * Options:
 *   --track <track>    Publication track (default: mt-preview)
 *   --dry-run          Show what would change without writing
 *   --verbose          Show detailed progress
 *   -h, --help         Show help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    track: 'mt-preview',
    dryRun: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
    else if (!arg.startsWith('-') && !result.book) result.book = arg;
    else if (!arg.startsWith('-') && !result.chapter) result.chapter = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
patch-alt-text.js - Patch missing alt text in publication files

Extracts translated alt text from MT output and patches it into
publication files that have images with empty alt text.

Usage:
  node tools/patch-alt-text.js <book> <chapter> [options]

Arguments:
  book      Book slug (e.g., efnafraedi)
  chapter   Chapter number (e.g., 1 or 01)

Options:
  --track <track>    Publication track (default: mt-preview)
  --dry-run          Show what would change without writing
  --verbose          Show detailed progress
  -h, --help         Show this help message

Examples:
  node tools/patch-alt-text.js efnafraedi 1 --verbose
  node tools/patch-alt-text.js efnafraedi 1 --dry-run
`);
}

/**
 * Extract figure alt text from MT output files
 * @param {string} mtDir - Path to MT output directory
 * @returns {Map<string, string>} Map of figure ID to alt text
 */
function extractAltText(mtDir, verbose) {
  const altTextMap = new Map();

  if (!fs.existsSync(mtDir)) {
    console.error(`MT output directory not found: ${mtDir}`);
    return altTextMap;
  }

  const files = fs.readdirSync(mtDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(mtDir, file), 'utf-8');

    // Match images with alt text: ![alt text](path){#id ...}
    const imagePattern = /!\[([^\]]+)\]\([^)]+\)\{#(CNX_Chem_\d+_\d+_[^\s}]+)/g;
    let match;

    while ((match = imagePattern.exec(content)) !== null) {
      const altText = match[1].trim();
      const figureId = match[2];

      if (altText && !altTextMap.has(figureId)) {
        altTextMap.set(figureId, altText);
        if (verbose) {
          console.log(`  Found: ${figureId} -> "${altText.substring(0, 50)}${altText.length > 50 ? '...' : ''}"`);
        }
      }
    }
  }

  return altTextMap;
}

/**
 * Patch alt text in a publication file
 * @param {string} filePath - Path to publication file
 * @param {Map<string, string>} altTextMap - Map of figure ID to alt text
 * @param {boolean} dryRun - If true, don't write changes
 * @param {boolean} verbose - If true, show detailed progress
 * @returns {number} Number of images patched
 */
function patchFile(filePath, altTextMap, dryRun, verbose) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let patchCount = 0;

  // Match images with empty alt text: ![](path){#id}
  // Pattern: ![](any-path){#CNX_Chem_XX_XX_Name optional-stuff}
  const emptyAltPattern = /!\[\]\(([^)]+)\)\{#(CNX_Chem_\d+_\d+_[^\s}]+)([^}]*)\}/g;

  content = content.replace(emptyAltPattern, (match, imgPath, figureId, rest) => {
    const altText = altTextMap.get(figureId);

    if (altText) {
      patchCount++;
      if (verbose) {
        console.log(`    Patched: ${figureId}`);
      }
      return `![${altText}](${imgPath}){#${figureId}${rest}}`;
    }

    if (verbose) {
      console.log(`    No alt text found for: ${figureId}`);
    }
    return match;
  });

  if (patchCount > 0 && !dryRun) {
    fs.writeFileSync(filePath, content);
  }

  return patchCount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book || !args.chapter) {
    console.error('Error: Please provide book and chapter arguments');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const chapterNum = String(args.chapter).padStart(2, '0');
  const mtDir = path.join(PROJECT_ROOT, 'books', args.book, '02-mt-output', `ch${chapterNum}`);
  const pubDir = path.join(PROJECT_ROOT, 'books', args.book, '05-publication', args.track, 'chapters', chapterNum);

  console.log(`Patching alt text for ${args.book} chapter ${args.chapter}`);
  console.log(`  MT source: ${mtDir}`);
  console.log(`  Publication: ${pubDir}`);
  if (args.dryRun) {
    console.log('  [DRY RUN MODE]');
  }
  console.log('');

  // Extract alt text from MT output
  console.log('Extracting alt text from MT output...');
  const altTextMap = extractAltText(mtDir, args.verbose);
  console.log(`  Found ${altTextMap.size} images with alt text\n`);

  if (altTextMap.size === 0) {
    console.log('No alt text found in MT output. Run restore-images.js first.');
    process.exit(1);
  }

  // Patch publication files
  console.log('Patching publication files...');
  if (!fs.existsSync(pubDir)) {
    console.error(`Publication directory not found: ${pubDir}`);
    process.exit(1);
  }

  const pubFiles = fs.readdirSync(pubDir).filter(f => f.endsWith('.md'));
  let totalPatched = 0;

  for (const file of pubFiles) {
    const filePath = path.join(pubDir, file);
    if (args.verbose) {
      console.log(`  Processing: ${file}`);
    }
    const patched = patchFile(filePath, altTextMap, args.dryRun, args.verbose);
    totalPatched += patched;
  }

  console.log(`\nComplete: Patched ${totalPatched} image(s) in ${pubFiles.length} file(s)`);
  if (args.dryRun) {
    console.log('(Dry run - no files were modified)');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
