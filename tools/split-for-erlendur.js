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
 * Load metadata from sidecar JSON file (e.g., 5-1-protected.json for 5-1.en.md)
 */
function loadSidecarMetadata(inputPath) {
  const dir = path.dirname(inputPath);
  const basename = path.basename(inputPath, '.en.md');

  // Try different sidecar file patterns
  const sidecarPatterns = [
    `${basename}-protected.json`,
    `${basename}-equations.json`,
    `${basename}-figures.json`
  ];

  for (const pattern of sidecarPatterns) {
    const sidecarPath = path.join(dir, pattern);
    if (fs.existsSync(sidecarPath)) {
      try {
        const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
        // Extract metadata from sidecar
        const metadata = {};
        if (sidecar.frontmatter) {
          metadata.title = sidecar.frontmatter.title;
          metadata.section = sidecar.frontmatter.section;
          metadata.module = sidecar.frontmatter.module;
          metadata.lang = sidecar.frontmatter.lang || 'en';
        } else {
          // Fallback to top-level fields
          metadata.title = sidecar.title;
          metadata.section = sidecar.section;
          metadata.module = sidecar.module;
          metadata.lang = 'en';
        }
        return metadata;
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  return null;
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

  // Parse metadata from YAML frontmatter or sidecar JSON
  let metadata = parseMarkdownFrontmatter(content) || {};

  // If no YAML frontmatter or missing key fields, try sidecar JSON
  if (!metadata.title || !metadata.section) {
    const sidecarMetadata = loadSidecarMetadata(inputPath);
    if (sidecarMetadata) {
      metadata = { ...sidecarMetadata, ...metadata }; // YAML takes precedence
      if (verbose) {
        console.log(`  Loaded metadata from sidecar: title="${metadata.title}", section="${metadata.section}"`);
      }
    }
  }

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

// ============================================================================
// Exports for programmatic use
// ============================================================================

export { splitFile, ERLENDUR_SOFT_LIMIT, ERLENDUR_HARD_LIMIT };

/**
 * Split all .en.md files in a directory for Erlendur MT
 * @param {string} directory - Directory containing .en.md files
 * @param {object} options - Options for splitting
 * @returns {{filesSplit: number, partsCreated: number, filesUnchanged: number}}
 */
export function splitDirectory(directory, options = {}) {
  const { verbose, dryRun } = options;

  // Find all .en.md files (excluding already-split files with (a), (b) etc.)
  const files = fs.readdirSync(directory)
    .filter(f => f.endsWith('.en.md') && !f.match(/\([a-z]\)\.en\.md$/))
    .map(f => path.join(directory, f));

  if (files.length === 0) {
    return { filesSplit: 0, partsCreated: 0, filesUnchanged: 0 };
  }

  let filesSplit = 0;
  let partsCreated = 0;
  let filesUnchanged = 0;

  for (const file of files) {
    const results = splitFile(file, directory, { verbose, dryRun });

    if (results.length > 1) {
      filesSplit++;
      partsCreated += results.length;

      // Remove the original file after splitting (unless dry run)
      if (!dryRun) {
        fs.unlinkSync(file);
      }
    } else {
      filesUnchanged++;
    }
  }

  return { filesSplit, partsCreated, filesUnchanged };
}

// ============================================================================
// CLI
// ============================================================================

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

// Only run main if executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
