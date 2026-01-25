#!/usr/bin/env node

/**
 * restore-figures.js
 *
 * Post-MT processing script that restores correct figure numbers from sidecar.
 *
 * After machine translation, figure numbers may be corrupted or missing.
 * This script uses the figures sidecar (created during CNXML extraction) to:
 * - Update figure captions: *Mynd:* → *Mynd 1.3:*
 * - Update cross-references: [↑](#id) → [sjá mynd 1.3](#id)
 * - Update arrow references: [sjá mynd](#id) → [sjá mynd 1.3](#id)
 *
 * Usage:
 *   node tools/restore-figures.js <input.md> --figures <figures.json> [options]
 *   node tools/restore-figures.js <input.md> [options]  # Auto-detect sidecar
 *
 * Options:
 *   --figures <file>  Path to figures sidecar JSON
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
    figures: null,
    output: null,
    inPlace: false,
    dryRun: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--figures' && args[i + 1]) result.figures = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-figures.js - Restore figure numbers from sidecar metadata

After machine translation, this script uses the figures sidecar to ensure
correct figure numbers in captions and cross-references:

  [↑](#CNX_Chem_01_01_Name) → [sjá mynd 1.2](#CNX_Chem_01_01_Name)
  *Mynd: caption* → *Mynd 1.2: caption*

Usage:
  node tools/restore-figures.js <input.md> [options]
  node tools/restore-figures.js <input.md> --figures <sidecar.json>

Options:
  --figures <file>  Path to figures sidecar JSON (auto-detected if not specified)
  --output <file>   Write to specified file (default: stdout)
  --in-place        Modify the input file in place
  --dry-run         Show what would change without writing
  --verbose         Show processing details
  -h, --help        Show this help message

Auto-detection:
  If --figures is not specified, the script looks for a sidecar file by:
  1. Converting the input path from 02-mt-output/ to 02-for-mt/
  2. Finding the matching *-figures.json file

Examples:
  node tools/restore-figures.js 1-1.is.md --figures 1-1-figures.json --output 1-1-restored.md
  node tools/restore-figures.js books/efnafraedi/02-mt-output/ch01/1-1.is.md --in-place
  node tools/restore-figures.js translated.md --dry-run --verbose
`);
}

/**
 * Try to auto-detect the figures sidecar path
 * @param {string} inputPath - Path to the input markdown file
 * @returns {string|null} Path to the sidecar file, or null if not found
 */
function autoDetectSidecar(inputPath) {
  // Convert 02-mt-output path to 02-for-mt path
  const forMtPath = inputPath.replace(/02-mt-output/, '02-for-mt');

  // Get the base name without language suffix and extension
  const dir = path.dirname(forMtPath);
  const basename = path.basename(forMtPath)
    .replace(/\.is\.md$/, '')
    .replace(/\.en\.md$/, '')
    .replace(/\.md$/, '');

  const sidecarPath = path.join(dir, `${basename}-figures.json`);

  if (fs.existsSync(sidecarPath)) {
    return sidecarPath;
  }

  return null;
}

/**
 * Load figures data from sidecar JSON
 * @param {string} sidecarPath - Path to the sidecar JSON file
 * @returns {Object} Figures data object
 */
function loadFiguresSidecar(sidecarPath) {
  if (!fs.existsSync(sidecarPath)) {
    throw new Error(`Figures sidecar not found: ${sidecarPath}`);
  }

  const content = fs.readFileSync(sidecarPath, 'utf-8');
  const data = JSON.parse(content);

  if (!data.figures) {
    throw new Error(`Invalid figures sidecar: missing 'figures' key`);
  }

  return data.figures;
}

/**
 * Restore figure numbers in markdown content
 * @param {string} content - The markdown content
 * @param {Object} figures - Figure metadata keyed by ID
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {{content: string, stats: Object}} Restored content and statistics
 */
function restoreFigures(content, figures, verbose) {
  const stats = {
    crossRefsUpdated: 0,
    captionsUpdated: 0,
    captionsVerified: 0
  };

  // Build ID to number map
  const idToNumber = {};
  for (const [id, data] of Object.entries(figures)) {
    idToNumber[id] = data.number;
  }

  if (verbose) {
    console.error(`  Loaded ${Object.keys(idToNumber).length} figure mappings`);
  }

  // 1. Update cross-references: [↑](#id) → [sjá mynd X.X](#id)
  // Pattern: [↑](#figure-id) or [sjá mynd](#figure-id) without number
  content = content.replace(
    /\[↑\]\(#([^)]+)\)/g,
    (match, id) => {
      const number = idToNumber[id];
      if (number) {
        stats.crossRefsUpdated++;
        if (verbose) {
          console.error(`    Cross-ref: [↑](#${id}) → [sjá mynd ${number}](#${id})`);
        }
        return `[sjá mynd ${number}](#${id})`;
      }
      // If ID not in sidecar, leave as is but still convert to Icelandic
      return `[sjá mynd](#${id})`;
    }
  );

  // 2. Update unnumbered cross-refs: [sjá mynd](#id) → [sjá mynd X.X](#id)
  content = content.replace(
    /\[sjá mynd\]\(#([^)]+)\)/g,
    (match, id) => {
      const number = idToNumber[id];
      if (number) {
        stats.crossRefsUpdated++;
        if (verbose) {
          console.error(`    Cross-ref: [sjá mynd](#${id}) → [sjá mynd ${number}](#${id})`);
        }
        return `[sjá mynd ${number}](#${id})`;
      }
      return match;
    }
  );

  // 3. Update table cross-refs similarly: [sjá töflu](#id) when we have table support
  // (For now, focus on figures)

  // 4. Update captions without numbers: *Mynd: caption*{id="..."} → *Mynd X.X: caption*{id="..."}
  content = content.replace(
    /\*Mynd:\s*([^*]+)\*\{id="([^"]+)"\}/g,
    (match, caption, id) => {
      const number = idToNumber[id];
      if (number) {
        stats.captionsUpdated++;
        if (verbose) {
          console.error(`    Caption: *Mynd:* → *Mynd ${number}:* for ${id}`);
        }
        return `*Mynd ${number}: ${caption.trim()}*{id="${id}"}`;
      }
      return match;
    }
  );

  // 5. Also handle English format in case it wasn't translated: *Figure: caption*{id="..."}
  content = content.replace(
    /\*Figure:\s*([^*]+)\*\{id="([^"]+)"\}/g,
    (match, caption, id) => {
      const number = idToNumber[id];
      if (number) {
        stats.captionsUpdated++;
        if (verbose) {
          console.error(`    Caption (en): *Figure:* → *Mynd ${number}:* for ${id}`);
        }
        return `*Mynd ${number}: ${caption.trim()}*{id="${id}"}`;
      }
      return match;
    }
  );

  // 6. Verify existing numbered captions match sidecar
  // Pattern: *Mynd X.X: caption*{id="..."}
  const captionPattern = /\*Mynd (\d+\.?\d*):([^*]+)\*\{id="([^"]+)"\}/g;
  let captionMatch;
  while ((captionMatch = captionPattern.exec(content)) !== null) {
    const [, currentNumber, , id] = captionMatch;
    const expectedNumber = idToNumber[id];
    if (expectedNumber && currentNumber !== expectedNumber) {
      if (verbose) {
        console.error(`    Warning: Mismatched caption number for ${id}: ${currentNumber} vs expected ${expectedNumber}`);
      }
    } else {
      stats.captionsVerified++;
    }
  }

  return { content, stats };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: No input file provided. Use --help for usage.');
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    console.error(`Error: File not found: ${args.input}`);
    process.exit(1);
  }

  // Find figures sidecar
  let sidecarPath = args.figures;
  if (!sidecarPath) {
    sidecarPath = autoDetectSidecar(args.input);
    if (!sidecarPath) {
      if (args.verbose) {
        console.error('No figures sidecar found - skipping figure restoration');
      }
      // Just pass through the content unchanged
      const content = fs.readFileSync(args.input, 'utf-8');
      if (args.output) {
        fs.writeFileSync(args.output, content);
      } else if (!args.inPlace) {
        console.log(content);
      }
      process.exit(0);
    }
    if (args.verbose) {
      console.error(`Auto-detected sidecar: ${sidecarPath}`);
    }
  }

  // Load figures data
  let figures;
  try {
    figures = loadFiguresSidecar(sidecarPath);
  } catch (err) {
    console.error(`Error loading sidecar: ${err.message}`);
    process.exit(1);
  }

  // Read input
  const content = fs.readFileSync(args.input, 'utf-8');

  // Restore figures
  const { content: restored, stats } = restoreFigures(content, figures, args.verbose);

  if (args.verbose || args.dryRun) {
    console.error(`Figures restored: ${stats.crossRefsUpdated} cross-refs, ${stats.captionsUpdated} captions updated, ${stats.captionsVerified} verified`);
  }

  // Output
  if (args.dryRun) {
    if (stats.crossRefsUpdated > 0 || stats.captionsUpdated > 0) {
      console.log(restored);
    } else {
      console.error('No figure updates needed');
    }
  } else if (args.inPlace) {
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

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
