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
 * 4. Clean arrow refs: [↗](#id) → (sjá mynd) or similar
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
  --output <file>   Write to specified file (default: stdout)
  --in-place        Modify the input file in place
  --verbose         Show what's being cleaned
  --dry-run         Show changes without writing
  -h, --help        Show this help message

Transformations:
  - ![alt](url){#id .class}  → ![alt](url)
  - *caption*{#id}           → *caption*
  - **term**{#term-00001}    → **term**
  - [↗](#id) or [↑](#id)     → (sjá mynd/töflu)
  - {id="..." summary="..."}  → (removed)
  - [[EQ:n]]{id="..."}       → [[EQ:n]]
`);
}

/**
 * Clean Pandoc-style attributes and artifacts from markdown
 */
function cleanupMarkdown(content, verbose = false) {
  let result = content;
  const stats = {
    imageAttrs: 0,
    captionAttrs: 0,
    termAttrs: 0,
    arrowRefs: 0,
    tableAttrs: 0,
    equationAttrs: 0
  };

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

  // 4. Convert arrow cross-references to cleaner text
  // [↗](#CNX_Chem...) or [↑](#...) → keep as link but note it needs resolution
  // Distinguish between table and figure references based on ID patterns

  // Helper to detect table IDs (vs figure IDs)
  // Table IDs: fs-idm... prefix (OpenStax), -table suffix, key-equations-table, etc.
  // Figure IDs: CNX_Chem_... prefix (OpenStax images)
  const isTableRef = (id) => {
    return id.startsWith('fs-') || id.endsWith('-table') || id.includes('table');
  };

  const getRefText = (id) => isTableRef(id) ? 'sjá töflu' : 'sjá mynd';

  result = result.replace(/\[↗\]\(#([^)]+)\)/g, (match, id) => {
    stats.arrowRefs++;
    if (verbose) console.error(`  Arrow ref: ${id} -> ${getRefText(id)}`);
    return `[${getRefText(id)}](#${id})`;
  });

  result = result.replace(/\[↑\]\(#([^)]+)\)/g, (match, id) => {
    stats.arrowRefs++;
    if (verbose) console.error(`  Arrow ref: ${id} -> ${getRefText(id)}`);
    return `[${getRefText(id)}](#${id})`;
  });

  // Also handle parenthesized arrows: ([↗](#id)) → (sjá mynd/töflu)
  result = result.replace(/\(\[↗\]\(#([^)]+)\)\)/g, (match, id) => {
    stats.arrowRefs++;
    if (verbose) console.error(`  Parenthesized arrow ref: ${id}`);
    return `([${getRefText(id)}](#${id}))`;
  });

  result = result.replace(/\(\[↑\]\(#([^)]+)\)\)/g, (match, id) => {
    stats.arrowRefs++;
    if (verbose) console.error(`  Parenthesized arrow ref: ${id}`);
    return `([${getRefText(id)}](#${id}))`;
  });

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

  const { result, stats } = cleanupMarkdown(content, options.verbose);

  const totalChanges = Object.values(stats).reduce((a, b) => a + b, 0);

  if (options.verbose || options.dryRun) {
    console.error(`\nCleanup statistics:`);
    console.error(`  Image attributes removed: ${stats.imageAttrs}`);
    console.error(`  Caption attributes removed: ${stats.captionAttrs}`);
    console.error(`  Term attributes removed: ${stats.termAttrs}`);
    console.error(`  Arrow references converted: ${stats.arrowRefs}`);
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

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
