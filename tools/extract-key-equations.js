#!/usr/bin/env node

/**
 * extract-key-equations.js
 *
 * Extracts key equations from OpenStax CNXML source files and outputs markdown
 * with LaTeX equations.
 *
 * Finds <section class="key-equations"> in CNXML files and extracts equations
 * from the table rows, converting MathML to LaTeX.
 *
 * Usage:
 *   node tools/extract-key-equations.js --book efnafraedi --chapter 1
 *   node tools/extract-key-equations.js --book efnafraedi --chapter 1 --output path/to/output.md
 *
 * Options:
 *   --book ID         Book identifier (required)
 *   --chapter N       Chapter number (required)
 *   --output PATH     Output file path (default: auto-generated in 05-publication)
 *   --dry-run         Show what would be done without writing
 *   --verbose         Show detailed progress
 *   -h, --help        Show help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    output: null,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--book' && args[i + 1]) {
      result.book = args[++i];
    } else if (arg === '--chapter' && args[i + 1]) {
      result.chapter = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[++i];
    }
  }

  return result;
}

function printHelp() {
  console.log(`
extract-key-equations.js - Extract key equations from CNXML to markdown

Extracts equations from <section class="key-equations"> in CNXML files
and outputs a markdown file with LaTeX-formatted equations.

Usage:
  node tools/extract-key-equations.js --book <id> --chapter <n> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)
  --chapter N       Chapter number to extract

Options:
  --output PATH     Output file path (default: 05-publication/mt-preview/chapters/XX/X-key-equations.md)
  --dry-run         Preview without writing
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Extract chapter 1 key equations
  node tools/extract-key-equations.js --book efnafraedi --chapter 1

  # Extract with custom output path
  node tools/extract-key-equations.js --book efnafraedi --chapter 1 --output my-equations.md
`);
}

// ============================================================================
// Path Resolution
// ============================================================================

function getProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

// ============================================================================
// MathML to LaTeX Conversion
// ============================================================================

/**
 * Convert MathML to LaTeX using recursive processing
 */
function convertMathMLToLatex(mathml) {
  // Remove namespace prefixes
  let content = mathml.replace(/m:/g, '');

  // Remove outer math tags
  content = content.replace(/<math[^>]*>/g, '').replace(/<\/math>/g, '');

  // Process recursively
  return processNode(content).trim();
}

/**
 * Process MathML content recursively
 */
function processNode(content) {
  let result = content;

  // Process fractions first (before mrow is converted)
  result = result.replace(/<mfrac>([\s\S]*?)<\/mfrac>/g, (match, inner) => {
    const parts = extractTwoChildren(inner);
    if (parts.length === 2) {
      return `\\frac{${processNode(parts[0])}}{${processNode(parts[1])}}`;
    }
    return match;
  });

  // Process subscripts
  result = result.replace(/<msub>([\s\S]*?)<\/msub>/g, (match, inner) => {
    const parts = extractTwoChildren(inner);
    if (parts.length === 2) {
      return `{${processNode(parts[0])}}_{${processNode(parts[1])}}`;
    }
    return match;
  });

  // Process superscripts
  result = result.replace(/<msup>([\s\S]*?)<\/msup>/g, (match, inner) => {
    const parts = extractTwoChildren(inner);
    if (parts.length === 2) {
      return `{${processNode(parts[0])}}^{${processNode(parts[1])}}`;
    }
    return match;
  });

  // Process square root
  result = result.replace(/<msqrt>([\s\S]*?)<\/msqrt>/g, (match, inner) => {
    return `\\sqrt{${processNode(inner)}}`;
  });

  // Now process simple elements
  // mrow - just extract content (grouping handled by braces where needed)
  result = result.replace(/<mrow>([\s\S]*?)<\/mrow>/g, (match, inner) => processNode(inner));

  // Numbers
  result = result.replace(/<mn>([^<]+)<\/mn>/g, '$1');

  // Identifiers
  result = result.replace(/<mi>([^<]+)<\/mi>/g, '$1');

  // Text
  result = result.replace(/<mtext>([^<]+)<\/mtext>/g, '\\text{$1}');

  // Operators
  result = result.replace(/<mo>×<\/mo>/g, ' \\times ');
  result = result.replace(/<mo>−<\/mo>/g, ' - ');
  result = result.replace(/<mo>\+<\/mo>/g, ' + ');
  result = result.replace(/<mo>=<\/mo>/g, ' = ');
  result = result.replace(/<mo>⟶<\/mo>/g, ' \\rightarrow ');
  result = result.replace(/<mo stretchy="false">⟶<\/mo>/g, ' \\rightarrow ');
  result = result.replace(/<mo stretchy="false">\(<\/mo>/g, '(');
  result = result.replace(/<mo stretchy="false">\)<\/mo>/g, ')');
  result = result.replace(/<mo>\(<\/mo>/g, '(');
  result = result.replace(/<mo>\)<\/mo>/g, ')');
  result = result.replace(/<mo>([^<]+)<\/mo>/g, '$1');

  // Spacing
  result = result.replace(/<mspace[^>]*\/>/g, ' ');
  result = result.replace(/<mspace[^>]*><\/mspace>/g, ' ');

  // Table elements (strip them)
  result = result.replace(/<mtable[^>]*>/g, '');
  result = result.replace(/<\/mtable>/g, '');
  result = result.replace(/<mtr[^>]*>/g, '');
  result = result.replace(/<\/mtr>/g, '');
  result = result.replace(/<mtd[^>]*>/g, '');
  result = result.replace(/<\/mtd>/g, '');

  // Clean up any remaining tags
  result = result.replace(/<[^>]+>/g, '');

  // Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Extract two child elements from MathML content
 * Handles nested elements properly
 */
function extractTwoChildren(content) {
  content = content.trim();
  const children = [];
  let depth = 0;
  let current = '';
  let inTag = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '<') {
      inTag = true;
      current += char;

      // Check if it's a closing tag
      if (content[i + 1] === '/') {
        depth--;
      }
    } else if (char === '>' && inTag) {
      inTag = false;
      current += char;

      // Check if we just closed an opening tag (not self-closing)
      const lastTag = current.match(/<(\/?[a-z]+)[^>]*>$/i);
      if (lastTag) {
        if (!lastTag[1].startsWith('/') && !current.endsWith('/>')) {
          depth++;
        }
      }

      // If we're back to depth 0, we have a complete child
      if (depth === 0 && current.trim()) {
        children.push(current.trim());
        current = '';
        if (children.length === 2) break;
      }
    } else {
      current += char;
    }
  }

  // Add any remaining content
  if (current.trim() && children.length < 2) {
    children.push(current.trim());
  }

  return children;
}

// ============================================================================
// Key Equations Extraction
// ============================================================================

/**
 * Extract key equations from a CNXML file
 * Returns array of { latex, section }
 */
function extractKeyEquationsFromCnxml(cnxmlPath, verbose) {
  const equations = [];

  if (!fs.existsSync(cnxmlPath)) {
    if (verbose) console.log(`  Skipping (not found): ${cnxmlPath}`);
    return equations;
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  // Get section info from filename
  const moduleId = path.basename(cnxmlPath, '.cnxml');

  // Find key-equations section
  const keyEqMatch = content.match(/<section[^>]+class="key-equations"[^>]*>([\s\S]*?)<\/section>/);
  if (!keyEqMatch) {
    return equations;
  }

  const keyEqSection = keyEqMatch[1];

  // Find all table rows containing equations
  const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(keyEqSection)) !== null) {
    const rowContent = rowMatch[1];

    // Extract MathML from row
    const mathMatch = rowContent.match(/<m:math[^>]*>([\s\S]*?)<\/m:math>/);
    if (mathMatch) {
      const mathml = mathMatch[0];
      const latex = convertMathMLToLatex(mathml);

      if (latex && latex.length > 3) {
        equations.push({
          latex,
          moduleId,
          mathml,
        });
      }
    }
  }

  return equations;
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * Generate markdown content for key-equations page
 */
function generateMarkdown(equations, chapter) {
  const lines = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: Lykiljöfnur`);
  lines.push(`chapter: ${chapter}`);
  lines.push(`type: equations`);
  lines.push('---');
  lines.push('');
  lines.push('## Lykiljöfnur');
  lines.push('');

  if (equations.length === 0) {
    lines.push('*Engar lykiljöfnur í þessum kafla.*');
    lines.push('');
  } else {
    // Output equations in a table format
    lines.push('| Jafna |');
    lines.push('|-------|');

    for (const eq of equations) {
      // Escape pipe characters in LaTeX
      const escapedLatex = eq.latex.replace(/\|/g, '\\|');
      lines.push(`| $${escapedLatex}$ |`);
    }

    lines.push('');

    // Also list equations with display math for clarity
    lines.push('### Jöfnur');
    lines.push('');

    for (let i = 0; i < equations.length; i++) {
      lines.push(`$$${equations[i].latex}$$`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book) {
    console.error('Error: --book is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (args.chapter === null || isNaN(args.chapter)) {
    console.error('Error: --chapter is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const projectRoot = getProjectRoot();
  const chapterPadded = args.chapter.toString().padStart(2, '0');
  const sourceDir = path.join(projectRoot, 'books', args.book, '01-source', `ch${chapterPadded}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Extracting Key Equations for ${args.book} Chapter ${args.chapter}`);
  console.log('═'.repeat(60));
  console.log('');

  // Find all CNXML files in chapter
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const cnxmlFiles = fs
    .readdirSync(sourceDir)
    .filter((name) => name.endsWith('.cnxml'))
    .sort();

  console.log(`Found ${cnxmlFiles.length} CNXML files in chapter ${args.chapter}`);

  // Extract key equations from all modules
  const allEquations = [];
  for (const cnxmlFile of cnxmlFiles) {
    const cnxmlPath = path.join(sourceDir, cnxmlFile);
    const equations = extractKeyEquationsFromCnxml(cnxmlPath, args.verbose);

    if (equations.length > 0) {
      console.log(`  ${cnxmlFile}: ${equations.length} key equations`);
      allEquations.push(...equations);
    }
  }

  console.log('');
  console.log(`Total key equations extracted: ${allEquations.length}`);

  // Generate markdown
  const markdown = generateMarkdown(allEquations, args.chapter);

  // Determine output path
  const outputPath =
    args.output ||
    path.join(
      projectRoot,
      'books',
      args.book,
      '05-publication',
      'mt-preview',
      'chapters',
      chapterPadded,
      `${args.chapter}-key-equations.md`
    );

  if (args.dryRun) {
    console.log('');
    console.log('[DRY RUN] Would write to:', outputPath);
    console.log('');
    console.log('Content:');
    console.log(markdown);
  } else {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, markdown);
    console.log('');
    console.log('═'.repeat(60));
    console.log('Key Equations Extracted Successfully');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath}`);
    console.log(`Equations: ${allEquations.length}`);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
