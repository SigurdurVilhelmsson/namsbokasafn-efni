#!/usr/bin/env node

/**
 * cnxml-math-extract.js
 *
 * Extracts MathML equations from OpenStax CNXML files and converts them to LaTeX.
 * Use this to recover editable math from CNXML sources when DOCX files only contain images.
 *
 * Usage:
 *   node tools/cnxml-math-extract.js <module-id>           # Fetch from GitHub
 *   node tools/cnxml-math-extract.js <path/to/file.cnxml>  # Read local file
 *   node tools/cnxml-math-extract.js --list-modules        # List Chemistry 2e modules
 *
 * Options:
 *   --output <file>    Write output to file (default: stdout)
 *   --format <fmt>     Output format: json, markdown, latex (default: markdown)
 *   --context          Include surrounding text context
 *   --verbose          Show detailed progress
 *   -h, --help         Show help
 *
 * Examples:
 *   node tools/cnxml-math-extract.js m68690                    # Section 1.5
 *   node tools/cnxml-math-extract.js m68690 --format json      # JSON output
 *   node tools/cnxml-math-extract.js m68690 --context          # Include context
 */

const fs = require('fs');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main';
const MODULES_PATH = '/modules';

// Chemistry 2e module mapping (Chapter 1 as example - can be extended)
const CHEMISTRY_2E_MODULES = {
  // Chapter 1: Essential Ideas
  m68662: { chapter: 1, section: 'intro', title: 'Introduction' },
  m68663: { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  m68664: { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  m68667: { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  m68674: { chapter: 1, section: '1.4', title: 'Measurements' },
  m68690: { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  m68683: { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    format: 'markdown',
    context: false,
    verbose: false,
    listModules: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--context') {
      result.context = true;
    } else if (arg === '--list-modules') {
      result.listModules = true;
    } else if (arg === '--output') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.output = args[++i];
      }
    } else if (arg === '--format') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.format = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      if (!result.input) {
        result.input = arg;
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
cnxml-math-extract.js - Extract MathML from OpenStax CNXML and convert to LaTeX

Usage:
  node tools/cnxml-math-extract.js <module-id>           # Fetch from GitHub
  node tools/cnxml-math-extract.js <path/to/file.cnxml>  # Read local file
  node tools/cnxml-math-extract.js --list-modules        # List known modules

Arguments:
  module-id     OpenStax module ID (e.g., m68690 for section 1.5)
  file.cnxml    Path to local CNXML file

Options:
  --output <file>    Write output to file (default: stdout)
  --format <fmt>     Output format: json, markdown, latex (default: markdown)
  --context          Include surrounding text for each equation
  --verbose          Show detailed progress
  -h, --help         Show this help message

Output Formats:
  markdown    Human-readable with LaTeX in code blocks
  json        Machine-readable with all metadata
  latex       Just the LaTeX equations, one per line

Examples:
  # Extract math from section 1.5 (Measurement Uncertainty)
  node tools/cnxml-math-extract.js m68690

  # Save JSON output for processing
  node tools/cnxml-math-extract.js m68690 --format json --output math-1.5.json

  # Include context to help identify equations
  node tools/cnxml-math-extract.js m68690 --context

Module IDs for Chemistry 2e Chapter 1:
  m68662  Introduction
  m68663  1.1 Chemistry in Context
  m68664  1.2 Phases and Classification of Matter
  m68667  1.3 Physical and Chemical Properties
  m68674  1.4 Measurements
  m68690  1.5 Measurement Uncertainty, Accuracy, and Precision
  m68683  1.6 Mathematical Treatment of Measurement Results
`);
}

function printModuleList() {
  console.log('\nKnown Chemistry 2e Modules:\n');
  console.log('| Module ID | Section | Title |');
  console.log('|-----------|---------|-------|');
  for (const [id, info] of Object.entries(CHEMISTRY_2E_MODULES)) {
    console.log(`| ${id} | ${info.section} | ${info.title} |`);
  }
  console.log('\nTo find other module IDs, check:');
  console.log('https://github.com/openstax/osbooks-chemistry-bundle/tree/main/modules\n');
}

// ============================================================================
// CNXML Fetching
// ============================================================================

/**
 * Fetch CNXML content from GitHub or local file
 */
async function fetchCnxml(input, verbose) {
  // Check if it's a local file
  if (fs.existsSync(input)) {
    if (verbose) console.log(`Reading local file: ${input}`);
    return fs.readFileSync(input, 'utf-8');
  }

  // Check if it looks like a module ID
  if (/^m\d+$/.test(input)) {
    const url = `${GITHUB_RAW_BASE}${MODULES_PATH}/${input}/index.cnxml`;
    if (verbose) console.log(`Fetching from GitHub: ${url}`);
    return fetchUrl(url);
  }

  throw new Error(
    `Input not found: ${input}\nProvide a module ID (e.g., m68690) or path to a .cnxml file`
  );
}

/**
 * Fetch content from URL using https
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: Failed to fetch ${url}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

// ============================================================================
// MathML Extraction
// ============================================================================

/**
 * Extract all MathML elements from CNXML content
 */
function extractMathML(cnxml, includeContext) {
  const equations = [];

  // Extract document title
  const titleMatch = cnxml.match(/<title>([^<]+)<\/title>/);
  const documentTitle = titleMatch ? titleMatch[1] : 'Unknown';

  // Find all m:math elements (MathML with namespace prefix)
  // We need to handle nested structures carefully
  const mathPattern = /<m:math[^>]*>([\s\S]*?)<\/m:math>/g;

  let match;
  let index = 0;

  while ((match = mathPattern.exec(cnxml)) !== null) {
    index++;
    const fullMatch = match[0];
    const mathContent = match[1];
    const position = match.index;

    // Get context if requested
    let context = null;
    if (includeContext) {
      context = extractContext(cnxml, position);
    }

    // Determine equation type
    const eqType = classifyEquation(fullMatch, cnxml, position);

    equations.push({
      index,
      mathml: fullMatch,
      mathmlContent: mathContent,
      latex: convertMathMLToLatex(fullMatch),
      type: eqType,
      context,
      position,
    });
  }

  return {
    documentTitle,
    moduleId: extractModuleId(cnxml),
    equationCount: equations.length,
    equations,
  };
}

/**
 * Extract module ID from CNXML
 */
function extractModuleId(cnxml) {
  const match = cnxml.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  return match ? match[1] : null;
}

/**
 * Extract surrounding text context for an equation
 */
function extractContext(cnxml, position) {
  // Look for the enclosing paragraph or example
  const beforeText = cnxml.substring(Math.max(0, position - 500), position);
  const afterText = cnxml.substring(position, Math.min(cnxml.length, position + 500));

  // Find the start of the enclosing element
  let contextStart = beforeText.lastIndexOf('<para');
  if (contextStart === -1) contextStart = beforeText.lastIndexOf('<example');
  if (contextStart === -1) contextStart = beforeText.lastIndexOf('<equation');

  // Extract a snippet of surrounding text (strip XML tags)
  const before = stripXmlTags(beforeText.substring(contextStart !== -1 ? contextStart : 0))
    .trim()
    .slice(-100);

  const after = stripXmlTags(afterText.substring(afterText.indexOf('</m:math>') + 9))
    .trim()
    .slice(0, 100);

  return {
    before: before || '...',
    after: after || '...',
  };
}

/**
 * Strip XML tags from text
 */
function stripXmlTags(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify the type of equation based on context
 */
function classifyEquation(mathml, cnxml, position) {
  // Check if it's inside an example
  const before = cnxml.substring(Math.max(0, position - 1000), position);

  if (before.includes('<example') && !before.includes('</example>')) {
    return 'example';
  }

  // Check if it's a display equation
  if (cnxml.substring(position - 50, position).includes('<equation')) {
    return 'display';
  }

  // Check content to classify
  if (mathml.includes('<m:mtable') && mathml.includes('<m:mfrac')) {
    return 'calculation'; // Likely a stacked calculation like addition/subtraction
  }

  if (mathml.includes('<m:mfrac>') && !mathml.includes('<m:mtable')) {
    return 'fraction';
  }

  // Simple inline math (like the times symbol)
  if (mathml.length < 100) {
    return 'inline-symbol';
  }

  return 'inline';
}

// ============================================================================
// MathML to LaTeX Conversion
// ============================================================================

/**
 * Convert MathML to LaTeX
 * This is a simplified converter that handles common patterns
 */
function convertMathMLToLatex(mathml) {
  let latex = mathml;

  // Remove namespace prefixes for easier processing
  latex = latex.replace(/m:/g, '');

  // Handle common MathML elements
  const conversions = [
    // Basic structure
    [/<math[^>]*>/g, ''],
    [/<\/math>/g, ''],
    [/<mrow>/g, '{'],
    [/<\/mrow>/g, '}'],

    // Numbers and text
    [/<mn>([^<]+)<\/mn>/g, '$1'],
    [/<mi>([^<]+)<\/mi>/g, '$1'],
    [/<mtext>([^<]+)<\/mtext>/g, '\\text{$1}'],
    [/<mo>×<\/mo>/g, ' \\times '],
    [/<mo>−<\/mo>/g, ' - '],
    [/<mo>\+<\/mo>/g, ' + '],
    [/<mo>=<\/mo>/g, ' = '],
    [/<mo>⟶<\/mo>/g, ' \\rightarrow '],
    [/<mo stretchy="false">⟶<\/mo>/g, ' \\rightarrow '],
    [/<mo stretchy="false">\(<\/mo>/g, '('],
    [/<mo stretchy="false">\)<\/mo>/g, ')'],
    [/<mo>\(<\/mo>/g, '('],
    [/<mo>\)<\/mo>/g, ')'],
    [/<mo>([^<]+)<\/mo>/g, '$1'],

    // Fractions
    [/<mfrac>\s*{([^}]*)}\s*{([^}]*)}\s*<\/mfrac>/g, '\\frac{$1}{$2}'],
    [
      /<mfrac>([\s\S]*?)<\/mfrac>/g,
      (match, content) => {
        // Split content into numerator and denominator
        const parts = splitFractionParts(content);
        if (parts.length === 2) {
          return `\\frac{${cleanLatex(parts[0])}}{${cleanLatex(parts[1])}}`;
        }
        return match;
      },
    ],

    // Superscripts and subscripts
    [/<msup>\s*{([^}]*)}\s*{([^}]*)}\s*<\/msup>/g, '{$1}^{$2}'],
    [
      /<msup>([\s\S]*?)<\/msup>/g,
      (match, content) => {
        const parts = splitMathParts(content, 2);
        if (parts.length === 2) {
          return `{${cleanLatex(parts[0])}}^{${cleanLatex(parts[1])}}`;
        }
        return match;
      },
    ],
    [/<msub>\s*{([^}]*)}\s*{([^}]*)}\s*<\/msub>/g, '{$1}_{$2}'],
    [
      /<msub>([\s\S]*?)<\/msub>/g,
      (match, content) => {
        const parts = splitMathParts(content, 2);
        if (parts.length === 2) {
          return `{${cleanLatex(parts[0])}}_{${cleanLatex(parts[1])}}`;
        }
        return match;
      },
    ],

    // Square root
    [/<msqrt>([\s\S]*?)<\/msqrt>/g, '\\sqrt{$1}'],

    // Tables (often used for aligned equations or stacked calculations)
    [/<mtable[^>]*>/g, '\\begin{array}{l}'],
    [/<\/mtable>/g, '\\end{array}'],
    [/<mtr[^>]*>/g, ''],
    [/<\/mtr>/g, ' \\\\ '],
    [/<mtd[^>]*>/g, ''],
    [/<\/mtd>/g, ''],

    // Spacing
    [/<mspace[^>]*\/>/g, '\\;'],
    [/<mspace[^>]*><\/mspace>/g, '\\;'],

    // Clean up remaining tags
    [/<[^>]+>/g, ''],

    // Clean up whitespace
    [/\s+/g, ' '],
    [/\{\s+/g, '{'],
    [/\s+\}/g, '}'],
    [/\\\\\s*$/g, ''], // Remove trailing \\
  ];

  for (const [pattern, replacement] of conversions) {
    if (typeof replacement === 'function') {
      latex = latex.replace(pattern, replacement);
    } else {
      latex = latex.replace(pattern, replacement);
    }
  }

  return latex.trim();
}

/**
 * Split fraction content into numerator and denominator
 */
function splitFractionParts(content) {
  // Remove outer whitespace and look for two main parts
  content = content.trim();

  // Count tags to find the split point
  const parts = [];
  let depth = 0;
  let current = '';
  let inTag = false;
  let tagBuffer = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '<') {
      inTag = true;
      tagBuffer = '<';
    } else if (char === '>' && inTag) {
      inTag = false;
      tagBuffer += '>';

      // Check if opening or closing tag
      if (tagBuffer.startsWith('</')) {
        depth--;
      } else if (!tagBuffer.endsWith('/>')) {
        depth++;
      }

      current += tagBuffer;
      tagBuffer = '';

      // If we're back to depth 0 and have content, it's a part
      if (depth === 0 && current.trim()) {
        parts.push(current.trim());
        current = '';
      }
    } else if (inTag) {
      tagBuffer += char;
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Split math content into N parts
 */
function splitMathParts(content, n) {
  return splitFractionParts(content).slice(0, n);
}

/**
 * Clean up LaTeX string
 */
function cleanLatex(latex) {
  return latex
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format output based on requested format
 */
function formatOutput(data, format, includeContext) {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);

    case 'latex':
      return data.equations
        .map((eq) => eq.latex)
        .filter((l) => l && l.length > 3) // Skip trivial ones
        .join('\n');

    case 'markdown':
    default:
      return formatMarkdown(data, includeContext);
  }
}

/**
 * Format as markdown
 */
function formatMarkdown(data, includeContext) {
  const lines = [];

  lines.push(`# Math Equations from ${data.documentTitle}`);
  lines.push(`**Module:** ${data.moduleId}`);
  lines.push(`**Total equations found:** ${data.equationCount}`);
  lines.push('');

  // Group by type
  const byType = {};
  for (const eq of data.equations) {
    if (!byType[eq.type]) byType[eq.type] = [];
    byType[eq.type].push(eq);
  }

  // Summary
  lines.push('## Summary by Type');
  lines.push('| Type | Count |');
  lines.push('|------|-------|');
  for (const [type, eqs] of Object.entries(byType)) {
    lines.push(`| ${type} | ${eqs.length} |`);
  }
  lines.push('');

  // List significant equations (skip inline symbols)
  const significant = data.equations.filter(
    (eq) => eq.type !== 'inline-symbol' && eq.latex.length > 5
  );

  if (significant.length > 0) {
    lines.push('## Equations');
    lines.push('');

    for (const eq of significant) {
      lines.push(`### Equation ${eq.index} (${eq.type})`);

      if (includeContext && eq.context) {
        lines.push(`> ...${eq.context.before}... **[EQUATION]** ...${eq.context.after}...`);
        lines.push('');
      }

      lines.push('**LaTeX:**');
      lines.push('```latex');
      lines.push(eq.latex);
      lines.push('```');
      lines.push('');
    }
  }

  // List inline symbols separately
  const symbols = data.equations.filter((eq) => eq.type === 'inline-symbol');
  if (symbols.length > 0) {
    lines.push('## Inline Symbols');
    lines.push('| # | LaTeX |');
    lines.push('|---|-------|');
    for (const eq of symbols) {
      lines.push(`| ${eq.index} | \`${eq.latex}\` |`);
    }
    lines.push('');
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

  if (args.listModules) {
    printModuleList();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide a module ID or file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    // Fetch CNXML content
    const cnxml = await fetchCnxml(args.input, args.verbose);

    if (args.verbose) {
      console.log(`Fetched ${cnxml.length} bytes of CNXML`);
    }

    // Extract equations
    const data = extractMathML(cnxml, args.context);

    if (args.verbose) {
      console.log(`Found ${data.equationCount} equations`);
    }

    // Format output
    const output = formatOutput(data, args.format, args.context);

    // Write or print output
    if (args.output) {
      fs.writeFileSync(args.output, output);
      console.log(`Output written to: ${args.output}`);
    } else {
      console.log(output);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
