#!/usr/bin/env node

/**
 * cleanup-markdown.js
 *
 * Final cleanup step for publication-ready markdown.
 * Removes or converts Pandoc-style attributes and artifacts
 * that shouldn't appear in the final output.
 *
 * Transformations:
 * 1. Strip {#id} from image lines: ![alt](url){#id} → ![alt](url)
 * 2. Strip {#id} from captions: *caption*{#id} → *caption*
 * 3. Convert term IDs: **term**{#term-00001} → **term**
 * 4. Clean arrow refs: [↗](#id) → [sjá mynd X.X](#id) with figure numbers
 * 5. Strip table attributes: {id="..." summary="..."} lines
 * 6. Strip orphaned Pandoc attributes from equations
 *
 * Usage:
 *   node tools/cleanup-markdown.js <input.md> [--output <output.md>]
 *   node tools/cleanup-markdown.js <input.md> --in-place
 *   cat input.md | node tools/cleanup-markdown.js > output.md
 *
 * Options:
 *   --output <file>   Write to specified file (default: stdout)
 *   --in-place        Modify the input file in place
 *   --verbose         Show what's being cleaned
 *   --dry-run         Show changes without writing
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    figuresSidecar: null,  // Optional figures sidecar JSON path
    inPlace: false,
    verbose: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if ((arg === '--figures-sidecar' || arg === '--figures') && args[i + 1]) result.figuresSidecar = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
cleanup-markdown.js - Clean Pandoc artifacts for publication

Removes or converts Pandoc-style attributes that shouldn't appear
in the final rendered output.

Usage:
  node tools/cleanup-markdown.js <input.md> [options]
  cat input.md | node tools/cleanup-markdown.js > output.md

Options:
  --output <file>         Write to specified file (default: stdout)
  --in-place              Modify the input file in place
  --figures-sidecar <f>   Use figures sidecar JSON for authoritative numbering
  --verbose               Show what's being cleaned
  --dry-run               Show changes without writing
  -h, --help              Show this help message

Transformations:
  - ![alt](url){#id .class}  → ![alt](url)
  - *caption*{#id}           → *caption*
  - **term**{#term-00001}    → **term**
  - [↗](#id) or [↑](#id)     → [sjá mynd X.X](#id) (with figure number)
  - {id="..." summary="..."}  → (removed)
  - [[EQ:n]]{id="..."}       → [[EQ:n]]
`);
}

/**
 * Load figure numbers from a sidecar JSON file.
 * Returns a map of figure IDs to their numbers.
 * @param {string} sidecarPath - Path to the figures sidecar JSON
 * @param {boolean} verbose - Whether to output verbose info
 * @returns {Object} Map of figure ID to number
 */
function loadFiguresSidecar(sidecarPath, verbose = false) {
  const idToNumber = {};

  if (!fs.existsSync(sidecarPath)) {
    if (verbose) console.error(`  Figures sidecar not found: ${sidecarPath}`);
    return idToNumber;
  }

  try {
    const content = fs.readFileSync(sidecarPath, 'utf-8');
    const data = JSON.parse(content);

    if (data.figures) {
      for (const [id, figData] of Object.entries(data.figures)) {
        if (figData.number) {
          idToNumber[id] = figData.number;
          if (verbose) console.error(`  Sidecar: ${id} -> ${figData.number}`);
        }
      }
    }

    if (verbose) {
      console.error(`  Loaded ${Object.keys(idToNumber).length} figure numbers from sidecar`);
    }
  } catch (err) {
    if (verbose) console.error(`  Error loading sidecar: ${err.message}`);
  }

  return idToNumber;
}

/**
 * Build a map of element IDs to their numbers by scanning the content.
 * If a figures sidecar is provided, use it as the primary source.
 * Looks for patterns like:
 *   - *Mynd 1.5: caption*{#id} or *Figure 1.5: caption*{#id}
 *   - *Tafla 1.2: caption*{#id} or *Table 1.2: caption*{#id}
 *   - Image with ID followed by numbered caption
 *   - Image URL containing ID (e.g., CNX_Chem_01_01_WaterDom.jpg) with nearby caption
 * @param {string} content - The markdown content
 * @param {boolean} verbose - Whether to output verbose info
 * @param {string|null} figuresSidecarPath - Optional path to figures sidecar JSON
 */
function buildElementNumberMap(content, verbose = false, figuresSidecarPath = null) {
  // Start with sidecar data if provided (authoritative source)
  const idToNumber = figuresSidecarPath
    ? loadFiguresSidecar(figuresSidecarPath, verbose)
    : {};

  // Pattern 1a: Numbered captions with {#id} attributes
  // Matches: *Mynd 1.5: caption text*{#some-id}
  // Note: Skip if already in map (sidecar takes precedence)
  const captionWithHashIdPattern = /\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):?\s+[^*]*\*\{#([^}]+)\}/gi;
  let match;
  while ((match = captionWithHashIdPattern.exec(content)) !== null) {
    const number = match[1];
    const id = match[2];
    if (!idToNumber[id]) {
      idToNumber[id] = number;
      if (verbose) console.error(`  Found caption with {#id}: ${id} -> ${number}`);
    }
  }

  // Pattern 1b: Numbered captions with {id="..."} attributes
  // Matches: *Figure 1.5: caption text*{id="some-id"}
  const captionWithIdAttrPattern = /\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):?\s+[^*]*\*\{id="([^"]+)"/gi;
  while ((match = captionWithIdAttrPattern.exec(content)) !== null) {
    const number = match[1];
    const id = match[2];
    if (!idToNumber[id]) {
      idToNumber[id] = number;
      if (verbose) console.error(`  Found caption with {id="..."}: ${id} -> ${number}`);
    }
  }

  // Pattern 2a: Image with {#id} followed by numbered caption
  const imageHashIdCaptionPattern = /!\[[^\]]*\]\([^)]+\)\{#([^}]+)[^}]*\}\s*\n+\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):/gi;
  while ((match = imageHashIdCaptionPattern.exec(content)) !== null) {
    const id = match[1];
    const number = match[2];
    if (!idToNumber[id]) {
      idToNumber[id] = number;
      if (verbose) console.error(`  Found image {#id}+caption: ${id} -> ${number}`);
    }
  }

  // Pattern 2b: Image with {id="..."} followed by numbered caption
  const imageIdAttrCaptionPattern = /!\[[^\]]*\]\([^)]+\)\{id="([^"]+)"[^}]*\}\s*\n+\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):/gi;
  while ((match = imageIdAttrCaptionPattern.exec(content)) !== null) {
    const id = match[1];
    const number = match[2];
    if (!idToNumber[id]) {
      idToNumber[id] = number;
      if (verbose) console.error(`  Found image {id="..."}+caption: ${id} -> ${number}`);
    }
  }

  // Pattern 3: Extract IDs from image URLs and match to nearby numbered captions
  // This handles already-cleaned content where IDs are only in URLs
  // e.g., ![alt](images/media/CNX_Chem_01_01_WaterDom.jpg) followed by *Mynd 1.3:*
  // Look ahead up to 10 lines because alt text can span multiple lines
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Look for image with ID in URL (CNX_Chem_XX_XX_Name pattern)
    const imageUrlMatch = lines[i].match(/!\[[^\]]*\]\([^)]*\/(CNX_[A-Za-z0-9_]+)\.[a-z]+\)/i);
    if (imageUrlMatch) {
      const id = imageUrlMatch[1];
      // Look ahead up to 10 lines for a numbered caption (alt text can be long)
      for (let j = i + 1; j <= i + 10 && j < lines.length; j++) {
        const captionMatch = lines[j].match(/^\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):/i);
        if (captionMatch && !idToNumber[id]) {
          idToNumber[id] = captionMatch[1];
          if (verbose) console.error(`  Found URL ID + nearby caption: ${id} -> ${captionMatch[1]}`);
          break;
        }
        // Stop if we hit another image (we've gone too far)
        if (lines[j].match(/^!\[/)) break;
      }
    }

    // Also look for image with explicit ID attribute
    const imageIdMatch = lines[i].match(/!\[[^\]]*\]\([^)]+\)\{(?:#|id=")([^}"]+)/);
    if (imageIdMatch) {
      const id = imageIdMatch[1];
      // Look ahead up to 10 lines for a numbered caption
      for (let j = i + 1; j <= i + 10 && j < lines.length; j++) {
        const captionMatch = lines[j].match(/^\*(?:Mynd|Figure|Tafla|Table)\s+(\d+\.?\d*):/i);
        if (captionMatch && !idToNumber[id]) {
          idToNumber[id] = captionMatch[1];
          if (verbose) console.error(`  Found image ID + nearby caption: ${id} -> ${captionMatch[1]}`);
          break;
        }
        // Stop if we hit another image
        if (lines[j].match(/^!\[/)) break;
      }
    }
  }

  // Pattern 4: Table ID from {id="..." summary="..."} followed by title
  const tableAttrPattern = /\{id="([^"]+)"[^}]*\}\s*\n+\*?\*?(?:Tafla|Table)\s+(\d+\.?\d*)/gi;
  while ((match = tableAttrPattern.exec(content)) !== null) {
    const id = match[1];
    const number = match[2];
    if (!idToNumber[id]) {
      idToNumber[id] = number;
      if (verbose) console.error(`  Found table ID: ${id} -> ${number}`);
    }
  }

  // Pattern 5: Auto-number unnumbered figures based on document order
  // This handles figures with *Figure:* or *Mynd:* captions (no number)
  // First, find all figures in order (both numbered and unnumbered)
  // Then assign numbers to unnumbered ones based on their position

  // Extract chapter number from existing numbered figures (e.g., "1" from "1.5")
  let chapterNum = null;
  for (const num of Object.values(idToNumber)) {
    const chapterMatch = num.match(/^(\d+)\./);
    if (chapterMatch) {
      chapterNum = chapterMatch[1];
      break;
    }
  }

  if (chapterNum) {
    // Find all figures in order by scanning for image URLs followed by any caption
    let figureOrder = [];
    for (let i = 0; i < lines.length; i++) {
      const imageUrlMatch = lines[i].match(/!\[[^\]]*\]\([^)]*\/(CNX_[A-Za-z0-9_]+)\.[a-z]+\)/i);
      if (imageUrlMatch) {
        const id = imageUrlMatch[1];
        // Check if this figure has an unnumbered caption nearby
        for (let j = i + 1; j <= i + 10 && j < lines.length; j++) {
          // Check for unnumbered caption: *Mynd:* or *Figure:*
          const unnumberedCaption = lines[j].match(/^\*(?:Mynd|Figure):\s/i);
          if (unnumberedCaption && !idToNumber[id]) {
            figureOrder.push({ id, line: i, hasNumber: false });
            break;
          }
          // Check for numbered caption
          const numberedCaption = lines[j].match(/^\*(?:Mynd|Figure)\s+(\d+\.?\d*):/i);
          if (numberedCaption) {
            figureOrder.push({ id, line: i, hasNumber: true, number: numberedCaption[1] });
            break;
          }
          // Stop if we hit another image
          if (lines[j].match(/^!\[/)) break;
        }
      }
    }

    // Sort by line number to get document order
    figureOrder.sort((a, b) => a.line - b.line);

    // Find the index of the first numbered figure
    // Unnumbered figures before this are intro/decorative and should NOT be auto-numbered
    const firstNumberedIdx = figureOrder.findIndex(f => f.hasNumber);

    // Assign sequential numbers based on position
    // Start with the first explicit number, or 1 if none exists
    let nextNum = 1;
    for (let i = 0; i < figureOrder.length; i++) {
      const fig = figureOrder[i];
      if (fig.hasNumber) {
        // Update nextNum based on existing numbers
        const existingNum = parseFloat(fig.number.split('.').pop());
        if (existingNum >= nextNum) {
          nextNum = Math.floor(existingNum) + 1;
        }
      } else if (!idToNumber[fig.id]) {
        // Only auto-number figures that appear AFTER the first numbered figure
        // Figures before the first numbered one are intro/decorative figures
        if (firstNumberedIdx >= 0 && i < firstNumberedIdx) {
          if (verbose) console.error(`  Skipping intro figure (no auto-number): ${fig.id}`);
          continue; // Skip intro figures
        }
        // Assign next number to unnumbered figure
        idToNumber[fig.id] = `${chapterNum}.${nextNum}`;
        if (verbose) console.error(`  Auto-numbered figure: ${fig.id} -> ${chapterNum}.${nextNum}`);
        nextNum++;
      }
    }
  }

  return idToNumber;
}

/**
 * Clean Pandoc-style attributes and artifacts from markdown
 * @param {string} content - The markdown content
 * @param {boolean} verbose - Whether to output verbose info
 * @param {string|null} figuresSidecarPath - Optional path to figures sidecar JSON
 */
function cleanupMarkdown(content, verbose = false, figuresSidecarPath = null) {
  let result = content;
  const stats = {
    imageAttrs: 0,
    captionAttrs: 0,
    termAttrs: 0,
    arrowRefs: 0,
    arrowRefsNumbered: 0,
    tableAttrs: 0,
    equationAttrs: 0,
    sidecarFigures: 0
  };

  // Build element ID to number map BEFORE stripping IDs
  // Use sidecar data if provided (authoritative), otherwise scan content
  const idToNumber = buildElementNumberMap(content, verbose, figuresSidecarPath);
  if (figuresSidecarPath) {
    stats.sidecarFigures = Object.keys(idToNumber).length;
  }
  if (verbose) {
    console.error(`\nBuilt element number map with ${Object.keys(idToNumber).length} entries`);
  }

  // 1. Strip Pandoc attributes from images: ![alt](url){#id .class} → ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)\{[^}]+\}/g, (match, alt, url) => {
    stats.imageAttrs++;
    if (verbose) console.error(`  Image attr: ${match.substring(0, 60)}...`);
    return `![${alt}](${url})`;
  });

  // 2. Strip Pandoc attributes from italics/captions: *text*{#id} → *text*
  // Handles both *text*{#id} and text ending with *{#id} (where * closes italic)
  // Be careful not to match **bold**{#id} (handled separately)
  result = result.replace(/(?<!\*)\*([^*\n]+)\*\{#[^}]+\}/g, (match, text) => {
    stats.captionAttrs++;
    if (verbose) console.error(`  Caption attr: ${match.substring(0, 50)}...`);
    return `*${text}*`;
  });

  // Also handle captions where the ID is at very end of line after closing *
  // Pattern: text*{#id} at end of line (the * closes the italic started earlier)
  result = result.replace(/(\S)\*\{#[^}]+\}$/gm, (match, lastChar) => {
    stats.captionAttrs++;
    if (verbose) console.error(`  Caption end attr: ...${lastChar}*`);
    return `${lastChar}*`;
  });

  // 3. Strip term IDs from bold: **term**{#term-00001} → **term**
  result = result.replace(/\*\*([^*]+)\*\*\{#[^}]+\}/g, (match, term) => {
    stats.termAttrs++;
    if (verbose) console.error(`  Term attr: **${term}**`);
    return `**${term}**`;
  });

  // 4. Convert arrow cross-references to cleaner text WITH FIGURE/TABLE NUMBERS
  // [↗](#CNX_Chem...) or [↑](#...) → [sjá mynd X.X](#id)
  // Distinguish between table and figure references based on ID patterns

  // Helper to detect table IDs (vs figure IDs)
  // Table IDs: fs-idm... prefix (OpenStax), -table suffix, key-equations-table, etc.
  // Figure IDs: CNX_Chem_... prefix (OpenStax images)
  const isTableRef = (id) => {
    return id.startsWith('fs-') || id.endsWith('-table') || id.includes('table');
  };

  // Get reference text with number if available
  const getRefText = (id) => {
    const baseText = isTableRef(id) ? 'sjá töflu' : 'sjá mynd';
    const number = idToNumber[id];
    if (number) {
      return `${baseText} ${number}`;
    }
    return baseText;
  };

  result = result.replace(/\[↗\]\(#([^)]+)\)/g, (match, id) => {
    stats.arrowRefs++;
    const refText = getRefText(id);
    if (idToNumber[id]) stats.arrowRefsNumbered++;
    if (verbose) console.error(`  Arrow ref: ${id} -> ${refText}`);
    return `[${refText}](#${id})`;
  });

  result = result.replace(/\[↑\]\(#([^)]+)\)/g, (match, id) => {
    stats.arrowRefs++;
    const refText = getRefText(id);
    if (idToNumber[id]) stats.arrowRefsNumbered++;
    if (verbose) console.error(`  Arrow ref: ${id} -> ${refText}`);
    return `[${refText}](#${id})`;
  });

  // Also handle parenthesized arrows: ([↗](#id)) → ([sjá mynd X.X](#id))
  result = result.replace(/\(\[↗\]\(#([^)]+)\)\)/g, (match, id) => {
    stats.arrowRefs++;
    const refText = getRefText(id);
    if (idToNumber[id]) stats.arrowRefsNumbered++;
    if (verbose) console.error(`  Parenthesized arrow ref: ${id} -> ${refText}`);
    return `([${refText}](#${id}))`;
  });

  result = result.replace(/\(\[↑\]\(#([^)]+)\)\)/g, (match, id) => {
    stats.arrowRefs++;
    const refText = getRefText(id);
    if (idToNumber[id]) stats.arrowRefsNumbered++;
    if (verbose) console.error(`  Parenthesized arrow ref: ${id} -> ${refText}`);
    return `([${refText}](#${id}))`;
  });

  // 4b. Update existing [sjá mynd](#id) references to include figure numbers
  // This handles content that has already been through cleanup but lacks numbers
  result = result.replace(/\[sjá mynd\]\(#([^)]+)\)/g, (match, id) => {
    const number = idToNumber[id];
    if (number) {
      stats.arrowRefs++;
      stats.arrowRefsNumbered++;
      if (verbose) console.error(`  Added number to figure ref: ${id} -> sjá mynd ${number}`);
      return `[sjá mynd ${number}](#${id})`;
    }
    return match; // Keep unchanged if no number found
  });

  result = result.replace(/\[sjá töflu\]\(#([^)]+)\)/g, (match, id) => {
    const number = idToNumber[id];
    if (number) {
      stats.arrowRefs++;
      stats.arrowRefsNumbered++;
      if (verbose) console.error(`  Added number to table ref: ${id} -> sjá töflu ${number}`);
      return `[sjá töflu ${number}](#${id})`;
    }
    return match; // Keep unchanged if no number found
  });

  // 4c. Update unnumbered figure captions to include numbers
  // This converts *Mynd: caption* to *Mynd X.X: caption* based on preceding image IDs
  // We need to work line-by-line to match images with their captions
  const resultLines = result.split('\n');
  let lastImageId = null;
  for (let i = 0; i < resultLines.length; i++) {
    // Check for image with ID in URL (CNX_Chem_XX_XX_Name pattern)
    const imageUrlMatch = resultLines[i].match(/!\[[^\]]*\]\([^)]*\/(CNX_[A-Za-z0-9_]+)\.[a-z]+\)/i);
    if (imageUrlMatch) {
      lastImageId = imageUrlMatch[1];
      continue;
    }

    // Check for unnumbered caption that follows an image
    if (lastImageId && resultLines[i].match(/^\*(?:Mynd|Figure):\s/i)) {
      const number = idToNumber[lastImageId];
      if (number) {
        // Replace *Mynd: with *Mynd X.X:
        resultLines[i] = resultLines[i].replace(
          /^\*(?:Mynd|Figure):\s/i,
          `*Mynd ${number}: `
        );
        if (verbose) console.error(`  Updated caption: Mynd ${number}: (for ${lastImageId})`);
        stats.captionAttrs++;
      }
      lastImageId = null; // Reset after processing caption
    }

    // Reset if we hit a blank line or non-caption content after image
    if (resultLines[i].trim() === '' || (!resultLines[i].startsWith('*') && !resultLines[i].startsWith('!'))) {
      // Don't reset too quickly - captions can follow blank lines
      if (i > 0 && resultLines[i - 1].trim() === '' && resultLines[i].trim() === '') {
        lastImageId = null;
      }
    }
  }
  result = resultLines.join('\n');

  // 5. Remove standalone table/element attribute lines
  // Handles both {id="..." summary="..."} and {#id} formats
  result = result.replace(/^\{id="[^"]*"(?:\s+summary="[^"]*")?\}\s*$/gm, (match) => {
    stats.tableAttrs++;
    if (verbose) console.error(`  Table attr line removed`);
    return '';
  });
  result = result.replace(/^\{#[^}]+\}\s*$/gm, (match) => {
    stats.tableAttrs++;
    if (verbose) console.error(`  Standalone ID line removed: ${match.trim()}`);
    return '';
  });

  // 6. Strip attributes from equation placeholders: [[EQ:n]]{id="..."} → [[EQ:n]]
  result = result.replace(/\[\[EQ:(\d+)\]\]\{[^}]+\}/g, (match, num) => {
    stats.equationAttrs++;
    if (verbose) console.error(`  Equation attr: [[EQ:${num}]]`);
    return `[[EQ:${num}]]`;
  });

  // 6b. Strip Pandoc attributes from display math: $$...$${ #id} → $$...$$
  result = result.replace(/(\$\$[^$]+\$\$)\{#[^}]+\}/g, (match, equation) => {
    stats.equationAttrs++;
    if (verbose) console.error(`  Display math attr removed`);
    return equation;
  });

  // 6c. Strip Pandoc attributes from inline math: $...${ #id} → $...$
  // Be careful not to match display math ($$)
  result = result.replace(/(?<!\$)(\$[^$]+\$)\{#[^}]+\}/g, (match, equation) => {
    stats.equationAttrs++;
    if (verbose) console.error(`  Inline math attr removed`);
    return equation;
  });

  // 7. Clean up any remaining .{id="..."} patterns attached to text
  result = result.replace(/\.\{id="[^"]*"\}/g, (match) => {
    stats.tableAttrs++;
    if (verbose) console.error(`  Inline ID attr removed`);
    return '.';
  });

  // 8. Remove lines that contain only a period (orphaned from ID cleanup)
  result = result.replace(/^\.\s*$/gm, '');

  // Clean up multiple blank lines (common after removing attribute lines)
  result = result.replace(/\n{3,}/g, '\n\n');

  return { result, stats };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  let content;

  if (options.input) {
    if (!fs.existsSync(options.input)) {
      console.error(`Error: File not found: ${options.input}`);
      process.exit(1);
    }
    content = fs.readFileSync(options.input, 'utf-8');
  } else {
    // Read from stdin
    const chunks = [];
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    content = chunks.join('');
  }

  const { result, stats } = cleanupMarkdown(content, options.verbose, options.figuresSidecar);

  const totalChanges = Object.values(stats).reduce((a, b) => a + b, 0);

  if (options.verbose || options.dryRun) {
    console.error(`\nCleanup statistics:`);
    if (stats.sidecarFigures > 0) {
      console.error(`  Figures from sidecar: ${stats.sidecarFigures}`);
    }
    console.error(`  Image attributes removed: ${stats.imageAttrs}`);
    console.error(`  Caption attributes removed: ${stats.captionAttrs}`);
    console.error(`  Term attributes removed: ${stats.termAttrs}`);
    console.error(`  Arrow references converted: ${stats.arrowRefs} (${stats.arrowRefsNumbered} with numbers)`);
    console.error(`  Table attribute lines removed: ${stats.tableAttrs}`);
    console.error(`  Equation attributes removed: ${stats.equationAttrs}`);
    console.error(`  Total changes: ${totalChanges}`);
  }

  if (options.dryRun) {
    console.error('\n[DRY RUN] No files modified');
    process.exit(0);
  }

  if (options.inPlace && options.input) {
    fs.writeFileSync(options.input, result, 'utf-8');
    if (options.verbose) {
      console.error(`\nWrote changes to: ${options.input}`);
    }
  } else if (options.output) {
    fs.writeFileSync(options.output, result, 'utf-8');
    if (options.verbose) {
      console.error(`\nWrote output to: ${options.output}`);
    }
  } else {
    process.stdout.write(result);
  }
}

// Export for use by other modules
export { cleanupMarkdown, buildElementNumberMap };

// Only run main() if this is the entry point
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('cleanup-markdown.js') ||
  process.argv[1].includes('cleanup-markdown')
);

if (isMainModule) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
