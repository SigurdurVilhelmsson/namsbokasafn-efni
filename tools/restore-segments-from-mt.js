#!/usr/bin/env node

/**
 * restore-segments-from-mt.js
 *
 * Post-processing script for segment files after Erlendur MT.
 *
 * Erlendur MT escapes brackets, so we need to:
 * 1. Unescape \[\[SEG:xxx\]\] → [[SEG:xxx]] → <!-- SEG:xxx -->
 * 2. Unescape \[\[MATH:N\]\] → [[MATH:N]]
 * 3. Unescape \[#ref\] → [#ref]
 * 4. Optionally merge split files (a), (b), (c) back together
 *
 * Usage:
 *   node tools/restore-segments-from-mt.js <mt-output-file.is.md> [options]
 *   node tools/restore-segments-from-mt.js --batch <directory>
 *   node tools/restore-segments-from-mt.js --merge <base-file.is.md>
 *
 * Options:
 *   --output-dir, -o <dir>  Output directory (default: same as input)
 *   --batch <dir>           Process all *-segments*.is.md files in directory
 *   --merge                 Merge split files (a), (b), (c) into single output
 *   --dry-run, -n           Show what would be done without writing files
 *   --verbose, -v           Show detailed progress
 *   -h, --help              Show this help message
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    input: null,
    outputDir: null,
    batch: null,
    merge: false,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run' || arg === '-n') result.dryRun = true;
    else if (arg === '--merge') result.merge = true;
    else if ((arg === '--output-dir' || arg === '-o') && args[i + 1]) result.outputDir = args[++i];
    else if (arg === '--batch' && args[i + 1]) result.batch = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-segments-from-mt.js - Restore segment files after Erlendur MT

Unescapes brackets and converts segment tags back to HTML comment format.

What it does:
  1. Unescapes \\[\\[SEG:xxx\\]\\] → <!-- SEG:xxx -->
  2. Unescapes \\[\\[MATH:N\\]\\] → [[MATH:N]]
  3. Unescapes \\[#ref\\] → [#ref]
  4. Optionally merges split (a), (b), (c) files back together

Usage:
  node tools/restore-segments-from-mt.js <mt-output.is.md> [options]
  node tools/restore-segments-from-mt.js --batch <directory>
  node tools/restore-segments-from-mt.js --merge <base-file.is.md>

Options:
  --output-dir, -o <dir>  Output directory (default: same as input)
  --batch <dir>           Process all *-segments*.is.md files in directory
  --merge                 Merge split files (a), (b), (c) into single output
  --dry-run, -n           Show what would be done without writing files
  --verbose, -v           Show detailed progress
  -h, --help              Show this help message

Examples:
  # Process single file
  node tools/restore-segments-from-mt.js books/efnafraedi/02-mt-output/ch05/m68727-segments.is.md

  # Process all segment files in directory
  node tools/restore-segments-from-mt.js --batch books/efnafraedi/02-mt-output/ch05/

  # Merge split files and restore
  node tools/restore-segments-from-mt.js --merge --batch books/efnafraedi/02-mt-output/ch05/
`);
}

/**
 * Unescape Erlendur MT output
 * Handles: \{\{...\}\}, \[\[...\]\], \[...\], and general escaped brackets
 */
function unescapeContent(content) {
  let result = content;

  // Unescape curly brackets: \{\{...\}\} → {{...}}
  // This handles {{SEG:...}} segment tags
  result = result.replace(/\\\{\\\{/g, '{{');
  result = result.replace(/\\\}\\\}/g, '}}');

  // Unescape double square brackets: \[\[...\]\] → [[...]]
  // This handles [[MATH:...]] placeholders
  result = result.replace(/\\\[\\\[/g, '[[');
  result = result.replace(/\\\]\\\]/g, ']]');

  // Unescape all remaining single brackets: \[ → [ and \] → ]
  // This handles cross-references [#...], footnotes [footnote:...], etc.
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');

  return result;
}

/**
 * Convert curly bracket segment tags back to HTML comments
 * {{SEG:m68727:title:auto-1}} → <!-- SEG:m68727:title:auto-1 -->
 */
function restoreSegmentTags(content) {
  return content.replace(/\{\{SEG:([^}]+)\}\}/g, '<!-- SEG:$1 -->');
}

/**
 * Restore protected links using the links JSON file.
 * {{LINK:N}}text{{/LINK}} → [text](url)
 * {{XREF:N}} → [#ref-id]
 *
 * @param {string} content - Content with link placeholders
 * @param {Object} links - Map of link ID to URL
 * @returns {string} Content with restored markdown links
 */
function restoreLinks(content, links) {
  if (!links || Object.keys(links).length === 0) {
    return content;
  }

  let result = content;

  // Restore full links: {{LINK:N}}text{{/LINK}} → [text](url)
  result = result.replace(/\{\{LINK:(\d+)\}\}([^{]*)\{\{\/LINK\}\}/g, (match, id, text) => {
    const url = links[id];
    if (url) {
      return `[${text}](${url})`;
    }
    // Fallback: return just the text if URL not found
    return text;
  });

  // Restore cross-references: {{XREF:N}} → [#ref-id]
  result = result.replace(/\{\{XREF:(\d+)\}\}/g, (match, id) => {
    const ref = links[id];
    if (ref) {
      // ref is already in format "#ref-id"
      return `[${ref}]`;
    }
    return match; // Keep placeholder if not found
  });

  return result;
}

/**
 * Find and load the links JSON file for a segment file.
 * @param {string} segmentFilePath - Path to segment file
 * @returns {Object|null} Links map or null if not found
 */
function loadLinksFile(segmentFilePath) {
  const dir = path.dirname(segmentFilePath);
  const filename = path.basename(segmentFilePath);

  // Convert m68724-segments.is.md or m68724-segments.en.md to m68724-segments-links.json
  const linksFilename = filename.replace(/\.[a-z]{2}\.md$/, '-links.json');
  const linksPath = path.join(dir, linksFilename);

  if (fs.existsSync(linksPath)) {
    try {
      return JSON.parse(fs.readFileSync(linksPath, 'utf8'));
    } catch (e) {
      console.error(`Warning: Could not parse ${linksFilename}: ${e.message}`);
    }
  }

  return null;
}

/**
 * Get the language extension (e.g., '.is.md' or '.en.md')
 */
function getLangExtension(filename) {
  const match = filename.match(/(\.[a-z]{2}\.md)$/);
  return match ? match[1] : path.extname(filename);
}

/**
 * Find all parts of a split file
 * Given m68727-segments.is.md, finds:
 *   - m68727-segments.is.md (part 1, no suffix)
 *   - m68727-segments(b).is.md (part 2)
 *   - m68727-segments(c).is.md (part 3)
 *   etc.
 *
 * Note: The first part has NO suffix, subsequent parts have (b), (c), etc.
 */
function findSplitParts(basePath) {
  const dir = path.dirname(basePath);
  const filename = path.basename(basePath);
  const ext = getLangExtension(filename); // e.g., '.is.md'
  const base = filename.slice(0, -ext.length); // e.g., 'm68727-segments'

  // Check if this is already a part file (has suffix like (b), (c))
  const partMatch = base.match(/^(.+)\(([a-z])\)$/);
  const actualBase = partMatch ? partMatch[1] : base;

  // Find all files matching the pattern
  const files = fs.readdirSync(dir);
  const parts = [];

  // First part: no suffix (e.g., m68727-segments.is.md)
  const firstPartName = `${actualBase}${ext}`;
  if (files.includes(firstPartName)) {
    parts.push(path.join(dir, firstPartName));
  }

  // Subsequent parts: (b), (c), (d), etc. (skip 'a' since first part has no suffix)
  for (let i = 1; i < 26; i++) {
    const suffix = String.fromCharCode(97 + i); // b, c, d, ...
    const partName = `${actualBase}(${suffix})${ext}`;

    if (files.includes(partName)) {
      parts.push(path.join(dir, partName));
    } else {
      // Stop looking once we hit a missing part
      break;
    }
  }

  return {
    baseName: actualBase,
    parts: parts,
  };
}

/**
 * Merge multiple file parts into one
 */
function mergeFiles(parts) {
  const contents = parts.map((p) => fs.readFileSync(p, 'utf8'));
  return contents.join('\n\n');
}

/**
 * Process a single file (or set of split files)
 */
function processFile(inputPath, outputDir, options) {
  const { verbose, dryRun, merge } = options;

  const basename = path.basename(inputPath);

  if (verbose) {
    console.log(`\nProcessing: ${basename}`);
  }

  let content;
  let sourceFiles;

  if (merge) {
    // Find and merge all parts
    const { parts } = findSplitParts(inputPath);
    if (parts.length === 0) {
      console.error(`  No files found for: ${inputPath}`);
      return null;
    }

    sourceFiles = parts;
    content = mergeFiles(parts);

    if (verbose) {
      console.log(`  Merging ${parts.length} part(s):`);
      for (const p of parts) {
        console.log(`    - ${path.basename(p)}`);
      }
    }
  } else {
    // Single file
    if (!fs.existsSync(inputPath)) {
      console.error(`  File not found: ${inputPath}`);
      return null;
    }
    sourceFiles = [inputPath];
    content = fs.readFileSync(inputPath, 'utf8');
  }

  const originalLength = content.length;

  // Step 1: Unescape brackets
  content = unescapeContent(content);

  // Step 2: Restore segment tags to HTML comments
  content = restoreSegmentTags(content);

  // Step 3: Restore protected links
  // Try to find links JSON file (based on EN filename pattern)
  const links = loadLinksFile(inputPath);
  let linksRestored = 0;
  if (links) {
    content = restoreLinks(content, links);
    // Count how many links were restored
    linksRestored = Object.keys(links).length;
    if (verbose && linksRestored > 0) {
      console.log(`  Links restored: ${linksRestored}`);
    }
  }

  // Count changes
  const segmentTagsRestored = (content.match(/<!-- SEG:/g) || []).length;
  const mathTagsFound = (content.match(/\[\[MATH:\d+\]\]/g) || []).length;
  const crossRefsFound = (content.match(/\[#[^\]]+\]/g) || []).length;
  const markdownLinksFound = (content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;

  if (verbose) {
    console.log(`  Segment tags restored: ${segmentTagsRestored}`);
    console.log(`  Math placeholders found: ${mathTagsFound}`);
    console.log(`  Cross-references found: ${crossRefsFound}`);
    console.log(`  Markdown links found: ${markdownLinksFound}`);
  }

  // Determine output path
  const effectiveOutputDir = outputDir || path.dirname(inputPath);
  let outputPath;

  if (merge) {
    // Use base name without part suffix
    const { baseName } = findSplitParts(inputPath);
    const ext = getLangExtension(path.basename(inputPath));
    outputPath = path.join(effectiveOutputDir, `${baseName}${ext}`);
  } else {
    outputPath = path.join(effectiveOutputDir, basename);
  }

  // Write output
  if (!dryRun) {
    if (!fs.existsSync(effectiveOutputDir)) {
      fs.mkdirSync(effectiveOutputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content, 'utf8');
    if (verbose) {
      console.log(`  Wrote: ${path.basename(outputPath)}`);
    }
  } else {
    console.log(`  [dry-run] Would write: ${path.basename(outputPath)}`);
  }

  return {
    sourceFiles,
    outputPath,
    segmentTagsRestored,
    mathTagsFound,
    crossRefsFound,
    linksRestored,
    markdownLinksFound,
    originalLength,
    finalLength: content.length,
  };
}

/**
 * Find all segment MT output files in a directory
 */
function findMtOutputFiles(directory, merge) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory);
  const segmentFiles = files
    .filter((f) => f.includes('-segments') && f.endsWith('.is.md'))
    .map((f) => path.join(directory, f));

  if (merge) {
    // Group by base name, prefer the base file (no suffix) as representative
    const groups = new Map();
    for (const file of segmentFiles) {
      const filename = path.basename(file);
      const ext = getLangExtension(filename);
      const basename = filename.slice(0, -ext.length);
      const baseMatch = basename.match(/^(.+-segments)(?:\([a-z]\))?$/);
      if (baseMatch) {
        const baseName = baseMatch[1];
        const hasSuffix = basename !== baseName;

        // Prefer base file (no suffix) over suffixed files
        if (!groups.has(baseName) || !hasSuffix) {
          groups.set(baseName, file);
        }
      }
    }
    return Array.from(groups.values()).sort();
  }

  return segmentFiles.sort();
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
    verbose: args.verbose,
    dryRun: args.dryRun,
    merge: args.merge,
  };

  let files;
  if (args.batch) {
    files = findMtOutputFiles(args.batch, args.merge);
    if (files.length === 0) {
      console.error(`No *-segments*.is.md files found in: ${args.batch}`);
      process.exit(1);
    }
    console.log(`Found ${files.length} file(s) to process${args.merge ? ' (with merging)' : ''}`);
  } else {
    files = [args.input];
  }

  const results = [];
  const processedBases = new Set();

  for (const file of files) {
    // Skip if we've already processed this base file (when merging)
    if (args.merge) {
      const { baseName } = findSplitParts(file);
      if (processedBases.has(baseName)) {
        continue;
      }
      processedBases.add(baseName);
    }

    const result = processFile(file, args.outputDir, options);
    if (result) {
      results.push(result);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Files processed: ${results.length}`);

  const totalSegmentTags = results.reduce((sum, r) => sum + r.segmentTagsRestored, 0);
  console.log(`  Segment tags restored: ${totalSegmentTags}`);

  const totalMathTags = results.reduce((sum, r) => sum + r.mathTagsFound, 0);
  console.log(`  Math placeholders found: ${totalMathTags}`);

  const totalCrossRefs = results.reduce((sum, r) => sum + r.crossRefsFound, 0);
  console.log(`  Cross-references found: ${totalCrossRefs}`);

  const totalLinksRestored = results.reduce((sum, r) => sum + r.linksRestored, 0);
  console.log(`  Links restored: ${totalLinksRestored}`);

  const totalMarkdownLinks = results.reduce((sum, r) => sum + r.markdownLinksFound, 0);
  console.log(`  Markdown links found: ${totalMarkdownLinks}`);

  if (args.dryRun) {
    console.log('\n  [dry-run] No files were written');
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
