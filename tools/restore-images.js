#!/usr/bin/env node

/**
 * restore-images.js
 *
 * Post-MT processing script that reconstructs image markdown from attribute blocks.
 *
 * The MT process (Erlendur/malstadur.is) strips the ![](path) portion of images,
 * leaving only the attribute block with translated alt text:
 *
 *   Before MT: ![](CNX_Chem_01_01_Name.jpg){id="..." class="..." alt="English alt"}
 *   After MT:  {id="CNX_Chem_01_01_Name" class="..." alt="Icelandic alt"}
 *
 * This script reconstructs the full image markdown:
 *   {id="CNX_Chem_01_01_Name" class="..." alt="..."}
 *   → ![Icelandic alt](images/media/CNX_Chem_01_01_Name.jpg){#CNX_Chem_01_01_Name .class}
 *
 * Usage:
 *   node tools/restore-images.js <input.md> [--output <output.md>]
 *   node tools/restore-images.js <input.md> --in-place
 *   cat input.md | node tools/restore-images.js > output.md
 *
 * Options:
 *   --output <file>   Write to specified file (default: stdout)
 *   --in-place        Modify the input file in place
 *   --dry-run         Show what would change without writing
 *   --verbose         Show processing details
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    inPlace: false,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-images.js - Reconstruct image markdown from MT-stripped attribute blocks

After machine translation, this script converts standalone attribute blocks
back to full image markdown with translated alt text:

  {id="CNX_Chem_01_01_Name" class="scaled-down" alt="Þýddur texti..."}
  → ![Þýddur texti...](images/media/CNX_Chem_01_01_Name.jpg){#CNX_Chem_01_01_Name .scaled-down}

Usage:
  node tools/restore-images.js <input.md> [options]
  cat input.md | node tools/restore-images.js > output.md

Options:
  --output <file>   Write to specified file (default: stdout)
  --in-place        Modify the input file in place
  --dry-run         Show what would change without writing
  --verbose         Show processing details
  -h, --help        Show this help message

Examples:
  node tools/restore-images.js translated.md --output restored.md
  node tools/restore-images.js translated.md --in-place
  node tools/restore-images.js translated.md --dry-run --verbose
`);
}

/**
 * Known image extensions by figure ID
 * Most OpenStax Chemistry 2e images are .jpg, but some are .png
 */
const IMAGE_EXTENSIONS = {
  // Add known exceptions here (images that aren't .jpg)
  // 'CNX_Chem_01_01_Example': 'png'
};

/**
 * Get the file extension for a figure ID
 * @param {string} figureId - The figure ID (e.g., CNX_Chem_01_01_Name)
 * @returns {string} The file extension (without dot)
 */
function getImageExtension(figureId) {
  return IMAGE_EXTENSIONS[figureId] || 'jpg';
}

/**
 * Restore images from standalone attribute blocks
 * @param {string} content - The markdown content
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {{content: string, count: number}} Restored content and count
 */
function restoreImages(content, verbose) {
  let count = 0;

  // Pattern to match standalone figure attribute blocks
  // These start with {id="CNX_Chem_... and contain class and/or alt attributes
  // The block can span multiple lines (alt text often wraps)
  //
  // Match pattern: {id="CNX_Chem_XX_XX_Name" followed by optional attrs ending with }
  // This uses a non-greedy match to handle multiline alt text
  // Note: Pattern defined inline below due to multiline limitations

  // First, we need to handle multiline attribute blocks
  // The regex above doesn't work well with multiline, so we need a different approach

  // Replace multiline attribute blocks by first normalizing them
  // Find blocks that start with {id="CNX_Chem_ and end with "}
  const lines = content.split('\n');
  const result = [];
  let inAttrBlock = false;
  let attrBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line starts a figure attribute block
    if (!inAttrBlock && line.match(/^\{id="CNX_Chem_\d+_\d+_[^"]+"/)) {
      // Check if it's a complete block on one line
      if (line.match(/"\}$/)) {
        // Complete single-line block
        const restored = processAttributeBlock(line, verbose);
        if (restored) {
          result.push(restored);
          count++;
        } else {
          result.push(line);
        }
      } else {
        // Start of multiline block
        inAttrBlock = true;
        attrBlockLines = [line];
      }
    } else if (inAttrBlock) {
      attrBlockLines.push(line);

      // Check if this line ends the block
      if (line.match(/"\}$/)) {
        // End of multiline block - join and process
        const fullBlock = attrBlockLines.join('\n');
        const restored = processAttributeBlock(fullBlock, verbose);
        if (restored) {
          result.push(restored);
          count++;
        } else {
          // Keep original if we couldn't process it
          result.push(...attrBlockLines);
        }
        inAttrBlock = false;
        attrBlockLines = [];
      }
    } else {
      result.push(line);
    }
  }

  // Handle case where file ends in the middle of an attr block (shouldn't happen)
  if (inAttrBlock) {
    result.push(...attrBlockLines);
  }

  return {
    content: result.join('\n'),
    count,
  };
}

/**
 * Process a single attribute block and convert it to image markdown
 * @param {string} block - The attribute block (may be multiline)
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {string|null} The image markdown, or null if not processable
 */
function processAttributeBlock(block, verbose) {
  // Extract figure ID
  const idMatch = block.match(/id="(CNX_Chem_\d+_\d+_[^"]+)"/);
  if (!idMatch) {
    return null;
  }
  const figureId = idMatch[1];

  // Extract class (optional)
  const classMatch = block.match(/class="([^"]*)"/);
  const className = classMatch ? classMatch[1] : '';

  // Extract alt text (may span multiple lines)
  const altMatch = block.match(/alt="([\s\S]*?)"\}/);
  const alt = altMatch ? altMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Build image path
  const ext = getImageExtension(figureId);
  const imagePath = `images/media/${figureId}.${ext}`;

  // Build pandoc-style attributes
  const attrs = [];
  attrs.push(`#${figureId}`);
  if (className) {
    // Convert space-separated classes to pandoc format
    className.split(/\s+/).forEach((cls) => {
      if (cls) attrs.push(`.${cls}`);
    });
  }
  const attrStr = `{${attrs.join(' ')}}`;

  if (verbose) {
    console.error(
      `  Restored: ${figureId} (alt: ${alt.substring(0, 50)}${alt.length > 50 ? '...' : ''})`
    );
  }

  return `![${alt}](${imagePath})${attrStr}`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let content;

  if (args.input) {
    if (!fs.existsSync(args.input)) {
      console.error(`Error: File not found: ${args.input}`);
      process.exit(1);
    }
    content = fs.readFileSync(args.input, 'utf-8');
  } else if (!process.stdin.isTTY) {
    content = await readStdin();
  } else {
    console.error('Error: No input provided. Use --help for usage.');
    process.exit(1);
  }

  const { content: restored, count } = restoreImages(content, args.verbose);

  if (args.verbose || args.dryRun) {
    console.error(`Restored ${count} image(s)`);
  }

  if (args.dryRun) {
    // In dry-run mode, just show what would be changed
    if (count > 0) {
      console.log(restored);
    } else {
      console.error('No images to restore');
    }
  } else if (args.inPlace && args.input) {
    fs.writeFileSync(args.input, restored);
    if (args.verbose) {
      console.error(`Updated: ${args.input}`);
    }
  } else if (args.output) {
    const outputDir = path.dirname(args.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(args.output, restored);
    if (args.verbose) {
      console.error(`Written to: ${args.output}`);
    }
  } else {
    console.log(restored);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
