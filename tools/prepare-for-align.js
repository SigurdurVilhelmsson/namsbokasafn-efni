#!/usr/bin/env node

/**
 * prepare-for-align.js
 *
 * Prepares markdown files for Matecat Align by:
 * - Stripping Erlendur headers (## title: ... or ## titill: ...)
 * - Stripping YAML frontmatter
 * - Combining split parts (a, b, c) into single files
 * - Normalizing whitespace
 *
 * Usage:
 *   node tools/prepare-for-align.js --en <en.md> --is <is.md> --output-dir <dir>
 *   node tools/prepare-for-align.js --en-dir <dir> --is-dir <dir> --output-dir <dir>
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    en: null, // Single EN file
    is: null, // Single IS file
    enDir: null, // Directory with EN files
    isDir: null, // Directory with IS files
    outputDir: null,
    section: null, // Section to process (e.g., "5-1")
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run' || arg === '-n') result.dryRun = true;
    else if (arg === '--en' && args[i + 1]) result.en = args[++i];
    else if (arg === '--is' && args[i + 1]) result.is = args[++i];
    else if (arg === '--en-dir' && args[i + 1]) result.enDir = args[++i];
    else if (arg === '--is-dir' && args[i + 1]) result.isDir = args[++i];
    else if ((arg === '--output-dir' || arg === '-o') && args[i + 1]) result.outputDir = args[++i];
    else if (arg === '--section' && args[i + 1]) result.section = args[++i];
  }
  return result;
}

function printHelp() {
  console.log(`
prepare-for-align.js - Prepare markdown files for Matecat Align

Strips headers, normalizes whitespace, and optionally combines split parts
to create clean EN/IS markdown pairs for Matecat Align TM creation.

Usage:
  # Process single file pair
  node tools/prepare-for-align.js \\
    --en books/efnafraedi/02-for-mt/ch05/5-1.en.md \\
    --is books/efnafraedi/03-faithful-translation/ch05/5-1.is.md \\
    --output-dir ./for-align/

  # Process from directories (combines split parts)
  node tools/prepare-for-align.js \\
    --en-dir books/efnafraedi/02-for-mt/ch05/ \\
    --is-dir books/efnafraedi/02-mt-output/ch05/ \\
    --section 5-1 \\
    --output-dir ./for-align/

Options:
  --en <file>            Single English markdown file
  --is <file>            Single Icelandic markdown file
  --en-dir <dir>         Directory containing English files (use with --section)
  --is-dir <dir>         Directory containing Icelandic files (use with --section)
  --section <id>         Section to process, e.g., "5-1" (combines parts a, b, c...)
  --output-dir, -o <dir> Output directory for cleaned files (required)
  --dry-run, -n          Show what would be done without writing files
  --verbose, -v          Show detailed progress
  -h, --help             Show this help message

Output files:
  {section}.en.clean.md  - Cleaned English file (ready for Matecat Align)
  {section}.is.clean.md  - Cleaned Icelandic file (ready for Matecat Align)
`);
}

/**
 * Strip YAML frontmatter from content
 */
function stripYamlFrontmatter(content) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}

/**
 * Strip Erlendur-style headers
 * Format: ## title: "Title" chapter: "5.1" module: "m68724" language: "en" part: "a"
 * Also handles legacy Icelandic format: ## titill: "Title" kafli: "5.1" ...
 */
function stripErlendurHeader(content) {
  // Match various forms of the Erlendur header (English or Icelandic)
  return content.replace(/^##\s*(?:titill|title):.*?\n\n?/i, '');
}

/**
 * Normalize whitespace: consistent line endings, trim extra blank lines
 */
function normalizeWhitespace(content) {
  return (
    content
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      // Remove trailing whitespace from lines
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      // Collapse multiple blank lines to two newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim start and end
      .trim()
  );
}

/**
 * Clean a markdown file: strip headers, normalize whitespace
 */
function cleanMarkdown(content) {
  let cleaned = content;
  cleaned = stripYamlFrontmatter(cleaned);
  cleaned = stripErlendurHeader(cleaned);
  cleaned = normalizeWhitespace(cleaned);
  return cleaned;
}

/**
 * Find and combine split parts for a section
 * Returns combined content sorted by part letter (a, b, c, ...)
 */
function findAndCombineParts(dir, section, lang, verbose) {
  const files = fs.readdirSync(dir);
  const pattern = new RegExp(`^${section.replace('.', '-')}(?:\\(([a-z])\\))?\\.${lang}\\.md$`);

  const parts = [];

  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      const partLetter = match[1] || null;
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      parts.push({
        file,
        path: filePath,
        part: partLetter,
        content: cleanMarkdown(content),
      });

      if (verbose) {
        console.log(`  Found: ${file}${partLetter ? ` (part ${partLetter})` : ''}`);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  // Check if we have an unsplit combined file (no part letter)
  const combinedFile = parts.find((p) => p.part === null);
  const splitParts = parts.filter((p) => p.part !== null);

  // Prefer the combined file if it exists
  if (combinedFile) {
    if (verbose && splitParts.length > 0) {
      console.log(`  Using combined file (ignoring ${splitParts.length} split parts)`);
    }
    return combinedFile.content;
  }

  // Otherwise, combine split parts in order (a, b, c...)
  splitParts.sort((a, b) => a.part.localeCompare(b.part));

  if (verbose) {
    console.log(
      `  Combining ${splitParts.length} parts: ${splitParts.map((p) => p.part).join(', ')}`
    );
  }

  return splitParts.map((p) => p.content).join('\n\n');
}

/**
 * Process a single file pair
 */
function processSinglePair(enPath, isPath, outputDir, options) {
  const { verbose, dryRun } = options;

  if (verbose) {
    console.log(`Processing single file pair:`);
    console.log(`  EN: ${enPath}`);
    console.log(`  IS: ${isPath}`);
  }

  const enContent = fs.readFileSync(enPath, 'utf-8');
  const isContent = fs.readFileSync(isPath, 'utf-8');

  const enCleaned = cleanMarkdown(enContent);
  const isCleaned = cleanMarkdown(isContent);

  // Derive section from filename
  const basename = path.basename(enPath);
  const sectionMatch = basename.match(/^([\d]+-[\d]+)/);
  const section = sectionMatch ? sectionMatch[1] : 'section';

  const results = [];

  // Write cleaned files
  if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const enOutPath = path.join(outputDir, `${section}.en.clean.md`);
  const isOutPath = path.join(outputDir, `${section}.is.clean.md`);

  if (!dryRun) {
    fs.writeFileSync(enOutPath, enCleaned, 'utf-8');
    fs.writeFileSync(isOutPath, isCleaned, 'utf-8');
  }

  results.push({ type: 'en', path: enOutPath, chars: enCleaned.length });
  results.push({ type: 'is', path: isOutPath, chars: isCleaned.length });

  return { section, results };
}

/**
 * Process from directories with section ID
 */
function processFromDirs(enDir, isDir, section, outputDir, options) {
  const { verbose, dryRun } = options;

  if (verbose) {
    console.log(`Processing section ${section}:`);
    console.log(`  EN dir: ${enDir}`);
    console.log(`  IS dir: ${isDir}`);
  }

  // Find and combine EN parts
  if (verbose) console.log('\nEnglish files:');
  const enCombined = findAndCombineParts(enDir, section, 'en', verbose);
  if (!enCombined) {
    throw new Error(`No English files found for section ${section} in ${enDir}`);
  }

  // Find and combine IS parts
  if (verbose) console.log('\nIcelandic files:');
  const isCombined = findAndCombineParts(isDir, section, 'is', verbose);
  if (!isCombined) {
    throw new Error(`No Icelandic files found for section ${section} in ${isDir}`);
  }

  const results = [];

  // Write cleaned files
  if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const enOutPath = path.join(outputDir, `${section}.en.clean.md`);
  const isOutPath = path.join(outputDir, `${section}.is.clean.md`);

  if (!dryRun) {
    fs.writeFileSync(enOutPath, enCombined, 'utf-8');
    fs.writeFileSync(isOutPath, isCombined, 'utf-8');
  }

  results.push({ type: 'en', path: enOutPath, chars: enCombined.length });
  results.push({ type: 'is', path: isOutPath, chars: isCombined.length });

  return { section, results };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate arguments
  const hasSinglePair = args.en && args.is;
  const hasDirs = args.enDir && args.isDir && args.section;

  if (!hasSinglePair && !hasDirs) {
    console.error('Error: Provide either --en and --is, or --en-dir, --is-dir, and --section');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (!args.outputDir) {
    console.error('Error: --output-dir is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    let result;

    if (hasSinglePair) {
      if (!fs.existsSync(args.en)) {
        throw new Error('EN file not found: ' + args.en);
      }
      if (!fs.existsSync(args.is)) {
        throw new Error('IS file not found: ' + args.is);
      }
      result = processSinglePair(args.en, args.is, args.outputDir, args);
    } else {
      if (!fs.existsSync(args.enDir)) {
        throw new Error('EN directory not found: ' + args.enDir);
      }
      if (!fs.existsSync(args.isDir)) {
        throw new Error('IS directory not found: ' + args.isDir);
      }
      result = processFromDirs(args.enDir, args.isDir, args.section, args.outputDir, args);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    if (args.dryRun) {
      console.log('DRY RUN - No files written');
    }
    console.log(`Section: ${result.section}`);
    console.log(`Output directory: ${args.outputDir}`);
    console.log('');

    for (const r of result.results) {
      const filename = path.basename(r.path);
      const action = args.dryRun ? 'Would write' : 'Wrote';
      console.log(`${action}: ${filename} (${r.chars} chars)`);
    }

    console.log('\nFiles ready for Matecat Align upload.');
    console.log('Upload the EN and IS files as a pair to create TM.');
  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
