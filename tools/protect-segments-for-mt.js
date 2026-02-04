#!/usr/bin/env node

/**
 * protect-segments-for-mt.js
 *
 * Pre-processing script for segment files before Erlendur MT.
 *
 * Erlendur MT behavior:
 * - HTML comments (<!-- ... -->) are stripped completely
 * - Brackets in [#ref] and [[MATH:N]] are escaped with backslashes
 * - Markdown links [text](url) get their URLs stripped
 *
 * This script:
 * 1. Converts <!-- SEG:xxx --> to {{SEG:xxx}} (survives MT with escaping)
 * 2. Protects markdown links [text](url) → {{LINK:N}}text{{/LINK}} + stores URLs
 * 3. Splits files by VISIBLE character count (excluding tags)
 * 4. Outputs files ready for Erlendur with (a), (b), (c) suffixes if split
 * 5. Writes a -links.json file with protected link URLs
 *
 * Usage:
 *   node tools/protect-segments-for-mt.js <segments-file.en.md> [options]
 *   node tools/protect-segments-for-mt.js --batch <directory>
 *
 * Options:
 *   --output-dir, -o <dir>  Output directory (default: same as input)
 *   --batch <dir>           Process all *-segments.en.md files in directory
 *   --char-limit <n>        Visible character limit (default: 14000)
 *   --dry-run, -n           Show what would be done without writing files
 *   --verbose, -v           Show detailed progress
 *   -h, --help              Show this help message
 */

import fs from 'fs';
import path from 'path';

// Character limits
const DEFAULT_CHAR_LIMIT = 14000;
// eslint-disable-next-line no-unused-vars
const HARD_LIMIT = 20000; // Reserved for validation

// Patterns for "invisible" content (not counted toward character limit)
const INVISIBLE_PATTERNS = [
  /\{\{SEG:[^}]+\}\}/g, // Segment tags after conversion (curly brackets)
  /\[\[MATH:\d+\]\]/g, // Math placeholders
  /<!--\s*SEG:[^>]+-->/g, // Original segment tags (before conversion)
  /\{\{LINK:\d+\}\}/g, // Link placeholders (opening)
  /\{\{\/LINK\}\}/g, // Link placeholders (closing)
];

function parseArgs(args) {
  const result = {
    input: null,
    outputDir: null,
    batch: null,
    charLimit: DEFAULT_CHAR_LIMIT,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run' || arg === '-n') result.dryRun = true;
    else if ((arg === '--output-dir' || arg === '-o') && args[i + 1]) result.outputDir = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (arg === '--char-limit' && args[i + 1]) result.charLimit = parseInt(args[++i], 10);
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
protect-segments-for-mt.js - Protect segment files for Erlendur MT

Converts segment tags to MT-safe format and splits by visible character count.

What it does:
  1. Converts <!-- SEG:xxx --> to [[SEG:xxx]] (survives MT with escaping)
  2. Counts only VISIBLE characters (excludes [[SEG:...]], [[MATH:...]])
  3. Splits at paragraph boundaries if >14K visible characters
  4. Outputs files with (a), (b), (c) suffixes when split

Usage:
  node tools/protect-segments-for-mt.js <segments-file.en.md> [options]
  node tools/protect-segments-for-mt.js --batch <directory>

Options:
  --output-dir, -o <dir>  Output directory (default: same as input)
  --batch <dir>           Process all *-segments.en.md files in directory
  --char-limit <n>        Visible character limit (default: 14000)
  --dry-run, -n           Show what would be done without writing files
  --verbose, -v           Show detailed progress
  -h, --help              Show this help message

Examples:
  # Process single file
  node tools/protect-segments-for-mt.js books/efnafraedi/02-for-mt/ch05/m68727-segments.en.md

  # Process all segment files in chapter
  node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/ch05/

  # Dry run to see splits
  node tools/protect-segments-for-mt.js m68727-segments.en.md --dry-run --verbose
`);
}

/**
 * Convert HTML comment segment tags to curly bracket format
 * <!-- SEG:m68727:title:auto-1 --> becomes {{SEG:m68727:title:auto-1}}
 *
 * Note: Double square brackets [[...]] get stripped by Erlendur MT,
 * but curly brackets {{...}} survive (though may be escaped).
 */
function convertSegmentTags(content) {
  return content.replace(/<!--\s*SEG:([^>]+?)\s*-->/g, '{{SEG:$1}}');
}

/**
 * Protect markdown links from being stripped by Erlendur MT.
 * [link text](http://example.com) → {{LINK:N}}link text{{/LINK}}
 *
 * Returns { content, links } where links is a map of link ID to URL.
 *
 * Also handles:
 * - Cross-references: [#ref-id] → {{XREF:N}}
 * - Document links: [text](#anchor) → {{LINK:N}}text{{/LINK}}
 */
function protectLinks(content) {
  const links = {};
  let counter = 0;
  let result = content;

  // Protect full markdown links: [text](url)
  // Match [text](url) where text can contain anything except ]
  // and url is a full URL or relative path
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    counter++;
    links[counter] = url;
    return `{{LINK:${counter}}}${text}{{/LINK}}`;
  });

  // Protect self-closing cross-references: [#ref-id]
  // These are internal references without link text
  result = result.replace(/\[#([^\]]+)\]/g, (match, refId) => {
    counter++;
    links[counter] = `#${refId}`;
    return `{{XREF:${counter}}}`;
  });

  return { content: result, links };
}

/**
 * Calculate visible character count (excluding invisible tags)
 */
function getVisibleCharCount(content) {
  let visible = content;
  for (const pattern of INVISIBLE_PATTERNS) {
    visible = visible.replace(pattern, '');
  }
  return visible.length;
}

/**
 * Split content at paragraph boundaries to fit within character limit
 * Returns array of content parts
 */
function splitByVisibleChars(content, charLimit, verbose = false) {
  // Split into paragraphs (double newline separated)
  const paragraphs = content.split(/\n\n+/);
  const parts = [];
  let currentPart = [];
  let currentVisibleCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraVisible = getVisibleCharCount(para);

    // If adding this paragraph would exceed limit, start new part
    // But always include at least one paragraph per part
    if (currentPart.length > 0 && currentVisibleCount + paraVisible + 2 > charLimit) {
      parts.push(currentPart.join('\n\n'));
      currentPart = [];
      currentVisibleCount = 0;

      if (verbose) {
        console.log(`  Split at paragraph ${i}, starting part ${parts.length + 1}`);
      }
    }

    currentPart.push(para);
    currentVisibleCount += paraVisible + 2; // +2 for \n\n separator
  }

  // Don't forget the last part
  if (currentPart.length > 0) {
    parts.push(currentPart.join('\n\n'));
  }

  return parts;
}

/**
 * Get the language extension (e.g., '.is.md' or '.en.md')
 */
function getLangExtension(filename) {
  const match = filename.match(/(\.[a-z]{2}\.md)$/);
  return match ? match[1] : path.extname(filename);
}

/**
 * Generate output filename with part suffix
 * First part has no suffix, subsequent parts have (b), (c), etc.
 */
function getPartFilename(basePath, partIndex, totalParts) {
  if (totalParts === 1) {
    return basePath;
  }

  const dir = path.dirname(basePath);
  const filename = path.basename(basePath);
  const ext = getLangExtension(filename); // e.g., '.en.md'
  const base = filename.slice(0, -ext.length); // e.g., 'm68727-segments'

  if (partIndex === 0) {
    // First part: no suffix
    return basePath;
  }

  // Subsequent parts: (b), (c), (d), ... (skip 'a')
  const suffix = String.fromCharCode(97 + partIndex); // b, c, d, ...
  return path.join(dir, `${base}(${suffix})${ext}`);
}

/**
 * Process a single segment file
 */
function processFile(inputPath, outputDir, options) {
  const { charLimit, verbose, dryRun } = options;

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    return null;
  }

  const content = fs.readFileSync(inputPath, 'utf8');
  const basename = path.basename(inputPath);

  if (verbose) {
    console.log(`\nProcessing: ${basename}`);
    console.log(`  Total characters: ${content.length}`);
  }

  // Step 1: Convert segment tags
  let protectedContent = convertSegmentTags(content);

  // Step 2: Protect markdown links
  const { content: linkProtectedContent, links } = protectLinks(protectedContent);
  protectedContent = linkProtectedContent;
  const linkCount = Object.keys(links).length;

  if (verbose && linkCount > 0) {
    console.log(`  Links protected: ${linkCount}`);
  }

  const visibleCount = getVisibleCharCount(protectedContent);

  if (verbose) {
    console.log(`  Visible characters: ${visibleCount}`);
  }

  // Step 3: Split if needed
  const parts = splitByVisibleChars(protectedContent, charLimit, verbose);

  if (verbose) {
    console.log(`  Parts: ${parts.length}`);
    for (let i = 0; i < parts.length; i++) {
      const partVisible = getVisibleCharCount(parts[i]);
      console.log(
        `    Part ${String.fromCharCode(97 + i)}: ${partVisible} visible chars, ${parts[i].length} total`
      );
    }
  }

  // Step 4: Determine output paths
  const effectiveOutputDir = outputDir || path.dirname(inputPath);
  const baseOutputPath = path.join(effectiveOutputDir, basename);

  const outputFiles = [];

  for (let i = 0; i < parts.length; i++) {
    const outputPath = getPartFilename(baseOutputPath, i, parts.length);
    outputFiles.push({
      path: outputPath,
      content: parts[i],
      visibleChars: getVisibleCharCount(parts[i]),
      totalChars: parts[i].length,
    });
  }

  // Step 5: Write files (unless dry run)
  if (!dryRun) {
    if (!fs.existsSync(effectiveOutputDir)) {
      fs.mkdirSync(effectiveOutputDir, { recursive: true });
    }

    for (const file of outputFiles) {
      fs.writeFileSync(file.path, file.content, 'utf8');
      if (verbose) {
        console.log(`  Wrote: ${path.basename(file.path)}`);
      }
    }

    // Write links JSON if any links were protected
    if (linkCount > 0) {
      const linksBasename = basename.replace(/\.en\.md$/, '-links.json');
      const linksPath = path.join(effectiveOutputDir, linksBasename);
      fs.writeFileSync(linksPath, JSON.stringify(links, null, 2), 'utf8');
      if (verbose) {
        console.log(`  Wrote: ${linksBasename}`);
      }
    }
  } else {
    console.log(`  [dry-run] Would write ${outputFiles.length} file(s):`);
    for (const file of outputFiles) {
      console.log(`    - ${path.basename(file.path)} (${file.visibleChars} visible chars)`);
    }
  }

  return {
    input: inputPath,
    outputs: outputFiles,
    segmentTagsConverted: (content.match(/<!--\s*SEG:/g) || []).length,
    linksProtected: linkCount,
  };
}

/**
 * Find all segment files in a directory
 */
function findSegmentFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  return files
    .filter((f) => f.endsWith('-segments.en.md'))
    .map((f) => path.join(directory, f))
    .sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input && !args.batch) {
    console.error('Error: No input file or --batch directory specified');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const options = {
    charLimit: args.charLimit,
    verbose: args.verbose,
    dryRun: args.dryRun,
  };

  let files;
  if (args.batch) {
    files = findSegmentFiles(args.batch);
    if (files.length === 0) {
      console.error(`No *-segments.en.md files found in: ${args.batch}`);
      process.exit(1);
    }
    console.log(`Found ${files.length} segment file(s) to process`);
  } else {
    files = [args.input];
  }

  const results = [];
  for (const file of files) {
    const result = processFile(file, args.outputDir, options);
    if (result) {
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Files processed: ${results.length}`);

  const totalOutputs = results.reduce((sum, r) => sum + r.outputs.length, 0);
  console.log(`  Output files: ${totalOutputs}`);

  const totalSegmentTags = results.reduce((sum, r) => sum + r.segmentTagsConverted, 0);
  console.log(`  Segment tags converted: ${totalSegmentTags}`);

  const totalLinksProtected = results.reduce((sum, r) => sum + r.linksProtected, 0);
  console.log(`  Links protected: ${totalLinksProtected}`);

  if (args.dryRun) {
    console.log('\n  [dry-run] No files were written');
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
