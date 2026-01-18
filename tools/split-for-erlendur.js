#!/usr/bin/env node

/**
 * split-for-erlendur.js
 *
 * Splits markdown files into parts that fit within Erlendur MT character limits.
 * Files >18,000 characters are split at paragraph boundaries.
 *
 * Usage:
 *   node tools/split-for-erlendur.js <markdown-file> [options]
 *
 * Output:
 *   - For small files: no change
 *   - For large files: creates {section}(a).en.md, {section}(b).en.md, etc.
 */

import fs from 'fs';
import path from 'path';

// Erlendur MT character limits
const ERLENDUR_HARD_LIMIT = 20000;
const ERLENDUR_SOFT_LIMIT = 18000;

function parseArgs(args) {
  const result = {
    input: null,
    outputDir: null,
    verbose: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--dry-run' || arg === '-n') result.dryRun = true;
    else if ((arg === '--output-dir' || arg === '-o') && args[i + 1]) result.outputDir = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
split-for-erlendur.js - Split markdown for Erlendur MT character limits

Splits files >18,000 characters at paragraph boundaries. Each part gets
a header with section/part metadata for reassembly after translation.

Usage:
  node tools/split-for-erlendur.js <markdown-file> [options]

Options:
  --output-dir, -o <dir>  Output directory (default: same as input)
  --dry-run, -n           Show what would be done without writing files
  --verbose, -v           Show detailed progress
  -h, --help              Show this help message

Output:
  - Files ≤18K characters: unchanged (or copied to output-dir)
  - Files >18K characters: split into {section}(a).en.md, {section}(b).en.md, etc.

Examples:
  node tools/split-for-erlendur.js books/efnafraedi/02-for-mt/ch05/5-1.en.md
  node tools/split-for-erlendur.js 5-1.en.md -o ./split-output/ --verbose
`);
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseMarkdownFrontmatter(content) {
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!yamlMatch) return null;

  const frontmatter = yamlMatch[1];
  const result = {};
  const lines = frontmatter.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Generate Erlendur-format header for a split part
 */
function makeErlendurHeader(metadata, partLetter) {
  const title = metadata.title || 'Unknown';
  const section = metadata.section || 'unknown';
  const module = metadata.module || 'unknown';
  const lang = metadata.lang || 'en';

  return `## titill: „${title}" kafli: „${section}" eining: „${module}" tungumál: „${lang}" hluti: „${partLetter}"\n\n`;
}

/**
 * Split content at paragraph boundaries to stay under character limit
 */
function splitContent(content, metadata, verbose) {
  if (content.length <= ERLENDUR_SOFT_LIMIT) {
    if (verbose) {
      console.log(`  Content is ${content.length} chars, no splitting needed`);
    }
    return [{ content, part: null }];
  }

  const parts = [];
  const paragraphs = content.split(/\n\n+/);
  let currentPart = [];
  let currentLength = 0;
  let partIndex = 0;

  if (verbose) {
    console.log(`  Content is ${content.length} chars, splitting at paragraph boundaries`);
    console.log(`  Found ${paragraphs.length} paragraphs`);
  }

  for (const para of paragraphs) {
    const paraLength = para.length + 2; // +2 for \n\n

    // Check if adding this paragraph would exceed the soft limit
    if (currentLength + paraLength > ERLENDUR_SOFT_LIMIT && currentPart.length > 0) {
      // Save current part
      const partLetter = String.fromCharCode(97 + partIndex); // a, b, c, ...
      const header = makeErlendurHeader(metadata, partLetter);
      parts.push({
        content: header + currentPart.join('\n\n'),
        part: partLetter
      });

      if (verbose) {
        console.log(`  Part ${partLetter}: ${currentLength} chars, ${currentPart.length} paragraphs`);
      }

      // Start new part
      currentPart = [para];
      currentLength = paraLength;
      partIndex++;
    } else {
      currentPart.push(para);
      currentLength += paraLength;
    }
  }

  // Add final part
  if (currentPart.length > 0) {
    const partLetter = String.fromCharCode(97 + partIndex);
    const header = makeErlendurHeader(metadata, partLetter);
    parts.push({
      content: header + currentPart.join('\n\n'),
      part: partLetter
    });

    if (verbose) {
      console.log(`  Part ${partLetter}: ${currentLength} chars, ${currentPart.length} paragraphs`);
    }
  }

  return parts;
}

/**
 * Split a markdown file for Erlendur MT
 */
function splitFile(inputPath, outputDir, options) {
  const { verbose, dryRun } = options;

  // Read input file
  const content = fs.readFileSync(inputPath, 'utf-8');
  const charCount = content.length;

  if (verbose) {
    console.log(`\nProcessing: ${inputPath}`);
    console.log(`  Total characters: ${charCount}`);
  }

  // Parse metadata
  const metadata = parseMarkdownFrontmatter(content) || {};

  // Remove frontmatter from content
  let bodyContent = content;
  const yamlMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (yamlMatch) {
    bodyContent = content.substring(yamlMatch[0].length);
  }

  // Also remove Erlendur-style headers if present
  const erlendurMatch = bodyContent.match(/^##\s*titill:.*?\n\n/);
  if (erlendurMatch) {
    bodyContent = bodyContent.substring(erlendurMatch[0].length);
  }

  // Split content
  const parts = splitContent(bodyContent.trim(), metadata, verbose);

  // Determine section base for filenames
  const sectionBase = metadata.section ? metadata.section.replace('.', '-') :
                      path.basename(inputPath, '.en.md').replace('.', '-');

  // Ensure output directory exists
  if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];

  if (parts.length === 1 && parts[0].part === null) {
    // No splitting needed - copy with Erlendur header if not already present
    const header = makeErlendurHeader(metadata, null).replace(' hluti: „null"', '');
    const outputContent = header + bodyContent.trim();
    const filename = `${sectionBase}.en.md`;
    const outputPath = path.join(outputDir, filename);

    if (!dryRun) {
      fs.writeFileSync(outputPath, outputContent, 'utf-8');
    }

    results.push({ filename, path: outputPath, part: null, chars: outputContent.length });

    if (verbose || dryRun) {
      const action = dryRun ? 'Would write' : 'Wrote';
      console.log(`  ${action}: ${filename} (${outputContent.length} chars)`);
    }
  } else {
    // Write split parts
    for (const { content: partContent, part } of parts) {
      const filename = `${sectionBase}(${part}).en.md`;
      const outputPath = path.join(outputDir, filename);

      if (!dryRun) {
        fs.writeFileSync(outputPath, partContent, 'utf-8');
      }

      results.push({ filename, path: outputPath, part, chars: partContent.length });

      if (verbose || dryRun) {
        const action = dryRun ? 'Would write' : 'Wrote';
        console.log(`  ${action}: ${filename} (${partContent.length} chars)`);
      }
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide a markdown file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(args.input)) {
      throw new Error('File not found: ' + args.input);
    }

    const outputDir = args.outputDir || path.dirname(args.input);
    const results = splitFile(args.input, outputDir, args);

    // Summary
    console.log('\n' + '='.repeat(50));
    if (args.dryRun) {
      console.log('DRY RUN - No files written');
    }
    console.log(`Output directory: ${outputDir}`);
    console.log(`Files: ${results.length}`);

    for (const r of results) {
      const partInfo = r.part ? ` (part ${r.part})` : '';
      console.log(`  ${r.filename}${partInfo} - ${r.chars} chars`);
    }

    if (results.some(r => r.chars > ERLENDUR_HARD_LIMIT)) {
      console.log('\nWARNING: Some files still exceed the 20,000 character hard limit!');
      process.exit(1);
    }

  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
