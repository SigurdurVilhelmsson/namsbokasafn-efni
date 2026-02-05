#!/usr/bin/env node

/**
 * apply-equations.js
 *
 * Replaces [[EQ:n]] placeholders in markdown files with actual LaTeX.
 * This is the final step before publication, restoring equations that
 * were protected during the translation process.
 *
 * Usage:
 *   node tools/apply-equations.js <markdown-file> --equations <json-file> [options]
 *   node tools/apply-equations.js <markdown-file> --auto [options]
 *
 * The --auto flag looks for an equations file with the same basename:
 *   input.md → input-equations.json
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    equationsFile: null,
    auto: false,
    inlineDelimiter: '$',
    displayDelimiter: '$$',
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--auto') result.auto = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--equations' && args[i + 1]) result.equationsFile = args[++i];
    else if (arg === '--inline-delimiter' && args[i + 1]) result.inlineDelimiter = args[++i];
    else if (arg === '--display-delimiter' && args[i + 1]) result.displayDelimiter = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
apply-equations.js - Replace equation placeholders with LaTeX

Restores [[EQ:n]] placeholders in markdown files with their LaTeX
equivalents. This is the final step before publication.

Usage:
  node tools/apply-equations.js <markdown-file> --equations <json-file> [options]
  node tools/apply-equations.js <markdown-file> --auto [options]

Options:
  --equations <file>    JSON file with equation mappings
  --auto                Auto-detect equations file (input-equations.json)
  --output <file>       Output file (default: stdout, or in-place with --auto)
  --inline-delimiter    Delimiter for inline math (default: $)
  --display-delimiter   Delimiter for display math (default: $$)
  --dry-run             Show what would be replaced without writing
  --verbose             Show detailed progress
  -h, --help            Show this help message

Equations JSON format:
  {
    "equations": {
      "EQ:1": "\\\\times",
      "EQ:2": "\\\\frac{m}{V}"
    }
  }

Examples:
  node tools/apply-equations.js 05-faithful/1-5.md --equations equations/1-5-equations.json
  node tools/apply-equations.js 05-faithful/1-5.md --auto --verbose
  node tools/apply-equations.js input.md --equations eq.json --output output.md
`);
}

function loadEquations(filePath, verbose) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Equations file not found: ' + filePath);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  // Support both { equations: {...} } and direct { EQ:1: ..., EQ:2: ... }
  const equations = data.equations || data;

  if (verbose) {
    console.error('Loaded equations from: ' + filePath);
    console.error('Total equations: ' + Object.keys(equations).length);
  }

  return equations;
}

function findPlaceholders(content) {
  // Match both plain placeholders and those with MT-safe ID attributes
  // Pattern: [[EQ:n]] or [[EQ:n]]{id="..."}
  // Also match escaped brackets from MT: \[\[EQ:n\]\]
  const pattern = /\\?\[\\?\[EQ:(\d+)\\?\]\\?\](?:\{id="([^"]*)"\})?/g;
  const found = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    found.push({
      placeholder: match[0],
      key: 'EQ:' + match[1],
      num: parseInt(match[1]),
      index: match.index,
      id: match[2] || null, // ID from MT-safe attribute if present
    });
  }

  return found;
}

function applyEquations(content, equations, options, verbose) {
  const placeholders = findPlaceholders(content);
  let result = content;
  let replacements = 0;
  const missing = [];

  // Sort by position descending so we can replace without affecting indices
  placeholders.sort((a, b) => b.index - a.index);

  for (const p of placeholders) {
    const eqData = equations[p.key];

    if (eqData === undefined) {
      missing.push(p.key);
      continue;
    }

    // Handle both old format (string) and new format (object with latex and id)
    const latex = typeof eqData === 'string' ? eqData : eqData.latex;
    // ID can come from placeholder attribute or equation data
    const equationId = p.id || (typeof eqData === 'object' ? eqData.id : null);

    // Determine if this should be inline or display math
    // Display math: placeholder is on its own line or is a large equation
    const isDisplay = isDisplayEquation(result, p.index, latex);
    const delimiter = isDisplay ? options.displayDelimiter : options.inlineDelimiter;

    // Build replacement with optional Pandoc ID attribute
    let replacement = delimiter + latex + delimiter;
    if (equationId) {
      // Add Pandoc-style ID attribute for cross-referencing
      replacement += '{#' + equationId + '}';
    }

    if (verbose) {
      console.error(
        `  ${p.placeholder} → ${replacement.substring(0, 50)}${replacement.length > 50 ? '...' : ''}`
      );
    }

    result =
      result.substring(0, p.index) + replacement + result.substring(p.index + p.placeholder.length);
    replacements++;
  }

  if (verbose) {
    console.error('Replacements made: ' + replacements);
    if (missing.length > 0) {
      console.error('Missing equations: ' + missing.join(', '));
    }
  }

  return { result, replacements, missing };
}

function isDisplayEquation(content, index, latex) {
  // Check if the placeholder is on its own line
  const before = content.substring(Math.max(0, index - 50), index);
  const after = content.substring(index + 10, Math.min(content.length, index + 60));

  const lineStart = before.lastIndexOf('\n');
  const lineEnd = after.indexOf('\n');

  const textBefore = lineStart >= 0 ? before.substring(lineStart + 1) : before;
  const textAfter = lineEnd >= 0 ? after.substring(0, lineEnd) : after;

  // If the line only contains whitespace + placeholder + whitespace, it's display
  if (textBefore.trim() === '' && textAfter.trim() === '') {
    return true;
  }

  // Large equations (fractions, sums, matrices) are typically display
  if (
    latex.includes('\\frac') ||
    latex.includes('\\sum') ||
    latex.includes('\\int') ||
    latex.includes('\\prod') ||
    latex.includes('\\begin{') ||
    latex.includes('\\matrix')
  ) {
    // But only if not embedded in text
    if (textBefore.trim() === '' || textAfter.trim() === '') {
      return true;
    }
  }

  return false;
}

function autoDetectEquationsFile(inputPath) {
  // Try: input.md → input-equations.json
  // Also handle language suffixes: input.is.md → input-equations.json
  const basename = inputPath.replace(/\.md$/, '');
  const basenameNoLang = basename.replace(/\.(is|en)$/, ''); // Strip language suffix
  const dir = path.dirname(inputPath);

  const candidates = [
    // With full basename (e.g., 5-1.is-equations.json)
    basename + '-equations.json',
    basename + '.equations.json',
    // Without language suffix (e.g., 5-1-equations.json)
    basenameNoLang + '-equations.json',
    basenameNoLang + '.equations.json',
    // In equations subdirectory
    path.join(dir, 'equations', path.basename(basename) + '-equations.json'),
    path.join(dir, 'equations', path.basename(basenameNoLang) + '-equations.json'),
    // In parent equations directory
    path.join(dir, '..', 'equations', path.basename(basename) + '-equations.json'),
    path.join(dir, '..', 'equations', path.basename(basenameNoLang) + '-equations.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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

    // Determine equations file
    let equationsFile = args.equationsFile;
    if (!equationsFile && args.auto) {
      equationsFile = autoDetectEquationsFile(args.input);
      if (!equationsFile) {
        throw new Error('Could not auto-detect equations file for: ' + args.input);
      }
      if (args.verbose) {
        console.error('Auto-detected equations file: ' + equationsFile);
      }
    }

    if (!equationsFile) {
      throw new Error('Please provide --equations <file> or use --auto');
    }

    // Load files
    const content = fs.readFileSync(args.input, 'utf-8');
    if (args.verbose) console.error('Read ' + content.length + ' bytes from ' + args.input);

    const equations = loadEquations(equationsFile, args.verbose);

    // Find placeholders first
    const placeholders = findPlaceholders(content);
    if (args.verbose) {
      console.error('Found ' + placeholders.length + ' placeholders in markdown');
    }

    if (placeholders.length === 0) {
      console.error('No [[EQ:n]] placeholders found in input file');
      if (!args.output) {
        console.log(content);
      }
      process.exit(0);
    }

    // Apply equations
    const { result, replacements, missing } = applyEquations(
      content,
      equations,
      args,
      args.verbose
    );

    // Handle missing equations
    if (missing.length > 0) {
      console.error(
        'Warning: ' + missing.length + ' equation(s) not found in JSON: ' + missing.join(', ')
      );
    }

    // Output
    if (args.dryRun) {
      console.error('Dry run - no changes written');
      console.error('Would replace ' + replacements + ' placeholder(s)');
    } else if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, result);
      console.error('Output written to: ' + args.output);
      console.error('Equations restored: ' + replacements);
    } else {
      console.log(result);
    }
  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
