#!/usr/bin/env node

/**
 * replace-math-images.js
 *
 * Replaces equation images in markdown files with LaTeX from CNXML sources.
 * Works with cnxml-math-extract.js to recover editable math from OpenStax content.
 *
 * Usage:
 *   node tools/replace-math-images.js --scan <file.md>              # Find equation images
 *   node tools/replace-math-images.js --generate <file.md> <module> # Generate mapping file
 *   node tools/replace-math-images.js --apply <file.md> <mapping>   # Apply replacements
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main';
const MODULES_PATH = '/modules';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    mode: null,
    input: null,
    module: null,
    mapping: null,
    output: null,
    verbose: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--scan') {
      result.mode = 'scan';
    } else if (arg === '--generate') {
      result.mode = 'generate';
    } else if (arg === '--apply') {
      result.mode = 'apply';
    } else if (arg === '--output' || arg === '-o') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.output = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      if (!result.input) {
        result.input = arg;
      } else if (result.mode === 'generate' && !result.module) {
        result.module = arg;
      } else if (result.mode === 'apply' && !result.mapping) {
        result.mapping = arg;
      }
    }
  }

  return result;
}

function printHelp() {
  const helpText = `
replace-math-images.js - Replace equation images with LaTeX

MODES:

  --scan <file.md>
      Scan markdown file to identify images that are likely equations.

  --generate <file.md> <module-id> [--output mapping.json]
      Generate a mapping file template combining markdown images and CNXML equations.

  --apply <file.md> <mapping.json> [--dry-run]
      Apply a mapping file to replace images with LaTeX.

OPTIONS:

  --output, -o <file>   Output file path
  --dry-run             Preview changes without modifying files
  --verbose, -v         Show detailed progress
  -h, --help            Show this help

WORKFLOW:

  1. Scan: node tools/replace-math-images.js --scan chapters/01/1-5.md
  2. Generate: node tools/replace-math-images.js --generate chapters/01/1-5.md m68690 -o mapping.json
  3. Edit mapping.json to connect images to equations
  4. Apply: node tools/replace-math-images.js --apply chapters/01/1-5.md mapping.json
`;
  console.log(helpText);
}

// ============================================================================
// Markdown Scanning
// ============================================================================

function scanMarkdown(content, _filePath, _verbose) {
  const images = [];
  const lines = content.split('\n');
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    imagePattern.lastIndex = 0;

    let match;
    while ((match = imagePattern.exec(line)) !== null) {
      const altText = match[1];
      const imagePath = match[2];
      const isEquation = checkIfEquationImage(altText, imagePath, lines, i);

      if (isEquation.likely) {
        const context = extractImageContext(lines, i);
        images.push({
          path: imagePath,
          altText: altText || '(empty)',
          lineNumber,
          context,
          reason: isEquation.reason,
          equationIndex: null,
          latex: null,
          displayMode: true,
        });
      }
    }
  }

  return images;
}

function checkIfEquationImage(altText, imagePath, lines, lineIndex) {
  const reasons = [];

  if (!altText || altText.trim() === '') {
    reasons.push('empty alt text');
  } else if (altText.toLowerCase() === 'none') {
    reasons.push('alt text is None');
  } else if (/^Figure [A-Z] shows/i.test(altText)) {
    reasons.push('alt describes calculation');
  }

  if (/rId\d+\.(png|jpg|jpeg)/i.test(imagePath)) {
    reasons.push('Word rId filename');
  }

  const contextBefore = lines.slice(Math.max(0, lineIndex - 3), lineIndex).join('\n');
  const contextPatterns = [/Lausn/i, /Solution/i, /\(a\)\s*$/m, /\(b\)\s*$/m, /Dæmi \d+\.\d+/i];

  for (const pattern of contextPatterns) {
    if (pattern.test(contextBefore)) {
      reasons.push('context suggests equation');
      break;
    }
  }

  return { likely: reasons.length > 0, reason: reasons.join(', ') };
}

function extractImageContext(lines, lineIndex) {
  const before = lines
    .slice(Math.max(0, lineIndex - 2), lineIndex)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-80);
  const after = lines
    .slice(lineIndex + 1, Math.min(lines.length, lineIndex + 3))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .trim()
    .slice(0, 80);
  return `...${before}...[IMAGE]...${after}...`;
}

function displayScanResults(images, filePath) {
  console.log(`\n# Equation Images in ${path.basename(filePath)}\n`);
  console.log(`Found **${images.length}** potential equation images:\n`);

  if (images.length === 0) {
    console.log('No equation images detected.');
    return;
  }

  console.log('| # | Line | Image Path | Reason |');
  console.log('|---|------|------------|--------|');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const shortPath = img.path.length > 30 ? '...' + img.path.slice(-27) : img.path;
    console.log(`| ${i + 1} | ${img.lineNumber} | \`${shortPath}\` | ${img.reason} |`);
  }

  console.log('\n## Context Details\n');
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`### Image ${i + 1} (line ${img.lineNumber})`);
    console.log(`**Path:** \`${img.path}\``);
    console.log(`**Alt:** ${img.altText}`);
    console.log(`**Context:** ${img.context}\n`);
  }
}

// ============================================================================
// CNXML Fetching
// ============================================================================

async function fetchCnxml(moduleId, verbose) {
  const url = `${GITHUB_RAW_BASE}${MODULES_PATH}/${moduleId}/index.cnxml`;
  if (verbose) console.log(`Fetching CNXML from: ${url}`);
  return fetchUrl(url);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
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

function extractEquations(cnxml) {
  const equations = [];
  const mathPattern = /<m:math[^>]*>([\s\S]*?)<\/m:math>/g;
  let match;
  let index = 0;

  while ((match = mathPattern.exec(cnxml)) !== null) {
    index++;
    const fullMatch = match[0];
    const position = match.index;

    if (fullMatch.length < 100) continue;

    const latex = convertMathMLToLatex(fullMatch);
    const context = extractCnxmlContext(cnxml, position);
    const type = classifyEquation(fullMatch);

    equations.push({ index, type, latex, context });
  }

  return equations;
}

function extractCnxmlContext(cnxml, position) {
  const before = cnxml
    .substring(Math.max(0, position - 200), position)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-60);
  const after = cnxml
    .substring(position, Math.min(cnxml.length, position + 500))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `...${before}...[EQUATION]...${after}...`;
}

function classifyEquation(mathml) {
  if (mathml.includes('<m:mtable') && mathml.includes('<m:mfrac')) return 'calculation';
  if (mathml.includes('<m:mfrac>')) return 'fraction';
  if (mathml.includes('<m:mtable')) return 'display';
  return 'inline';
}

function convertMathMLToLatex(mathml) {
  let latex = mathml.replace(/m:/g, '');

  const conversions = [
    [/<math[^>]*>/g, ''],
    [/<\/math>/g, ''],
    [/<mrow>/g, '{'],
    [/<\/mrow>/g, '}'],
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
    [
      /<msup>([\s\S]*?)<\/msup>/g,
      (m, c) => {
        const p = splitParts(c);
        return p.length >= 2 ? `{${clean(p[0])}}^{${clean(p[1])}}` : m;
      },
    ],
    [
      /<msub>([\s\S]*?)<\/msub>/g,
      (m, c) => {
        const p = splitParts(c);
        return p.length >= 2 ? `{${clean(p[0])}}_{${clean(p[1])}}` : m;
      },
    ],
    [
      /<mfrac>([\s\S]*?)<\/mfrac>/g,
      (m, c) => {
        const p = splitParts(c);
        return p.length >= 2 ? `\\frac{${clean(p[0])}}{${clean(p[1])}}` : m;
      },
    ],
    [/<msqrt>([\s\S]*?)<\/msqrt>/g, '\\sqrt{$1}'],
    [/<mtable[^>]*>/g, '\\begin{array}{l}'],
    [/<\/mtable>/g, '\\end{array}'],
    [/<mtr[^>]*>/g, ''],
    [/<\/mtr>/g, ' \\\\ '],
    [/<mtd[^>]*>/g, ''],
    [/<\/mtd>/g, ''],
    [/<mspace[^>]*\/>/g, '\\;'],
    [/<mspace[^>]*><\/mspace>/g, '\\;'],
    [/<[^>]+>/g, ''],
    [/\s+/g, ' '],
    [/\{\s+/g, '{'],
    [/\s+\}/g, '}'],
    [/\\\\\s*$/g, ''],
  ];

  for (const [pattern, replacement] of conversions) {
    latex = latex.replace(pattern, replacement);
  }

  return latex.trim();
}

function splitParts(content) {
  const parts = [];
  let depth = 0,
    current = '',
    inTag = false,
    tagBuffer = '';

  for (const char of content) {
    if (char === '<') {
      inTag = true;
      tagBuffer = '<';
    } else if (char === '>' && inTag) {
      inTag = false;
      tagBuffer += '>';
      if (tagBuffer.startsWith('</')) depth--;
      else if (!tagBuffer.endsWith('/>')) depth++;
      current += tagBuffer;
      tagBuffer = '';
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
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function clean(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Mapping Generation
// ============================================================================

async function generateMapping(mdPath, moduleId, verbose) {
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const images = scanMarkdown(mdContent, mdPath, verbose);
  const cnxml = await fetchCnxml(moduleId, verbose);
  const equations = extractEquations(cnxml);

  return {
    _comment:
      'Edit this file to map images to equations. Set equationIndex or latex for each image.',
    source: path.basename(mdPath),
    module: moduleId,
    generatedAt: new Date().toISOString(),
    images: images.map((img, i) => ({
      ...img,
      _hint: `Image ${i + 1}: Review context and match to an equation below`,
      equationIndex: null,
      latex: null,
      displayMode: true,
    })),
    equations: equations.map((eq) => ({
      ...eq,
      _preview: eq.latex.slice(0, 60) + (eq.latex.length > 60 ? '...' : ''),
    })),
  };
}

// ============================================================================
// Mapping Application
// ============================================================================

function applyMapping(mdPath, mappingPath, dryRun, verbose) {
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

  let result = mdContent;
  const replacements = [];

  const equationLookup = {};
  for (const eq of mapping.equations || []) {
    equationLookup[eq.index] = eq;
  }

  for (const img of mapping.images || []) {
    if (!img.equationIndex && !img.latex) {
      if (verbose) console.log(`Skipping ${img.path} (no mapping)`);
      continue;
    }

    let latex = img.latex;
    if (!latex && img.equationIndex) {
      const eq = equationLookup[img.equationIndex];
      if (eq) latex = eq.latex;
      else {
        console.warn(`Warning: Equation index ${img.equationIndex} not found`);
        continue;
      }
    }

    if (!latex) {
      console.warn(`Warning: No LaTeX for ${img.path}`);
      continue;
    }

    const escapedPath = img.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const altPattern =
      img.altText === '(empty)' ? '' : img.altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const imagePattern = new RegExp(`!\\[${altPattern}\\]\\(${escapedPath}\\)`, 'g');

    const latexFormatted = img.displayMode !== false ? `$$\n${latex}\n$$` : `$${latex}$`;

    const matches = result.match(imagePattern);
    if (matches) {
      replacements.push({
        image: img.path,
        latex: latex.slice(0, 40) + '...',
        count: matches.length,
      });
      result = result.replace(imagePattern, latexFormatted);
    } else {
      console.warn(`Warning: Image pattern not found: ${img.path}`);
    }
  }

  return { result, replacements };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.mode) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    switch (args.mode) {
      case 'scan': {
        if (!args.input) {
          console.error('Error: --scan requires a markdown file');
          process.exit(1);
        }
        const content = fs.readFileSync(args.input, 'utf-8');
        const images = scanMarkdown(content, args.input, args.verbose);
        displayScanResults(images, args.input);
        break;
      }

      case 'generate': {
        if (!args.input || !args.module) {
          console.error('Error: --generate requires <file.md> <module-id>');
          process.exit(1);
        }
        console.log(`Generating mapping for ${args.input} using module ${args.module}...`);
        const mapping = await generateMapping(args.input, args.module, args.verbose);
        const output = args.output || `mapping-${args.module}.json`;
        fs.writeFileSync(output, JSON.stringify(mapping, null, 2));
        console.log(`\nMapping file created: ${output}`);
        console.log(`  - Found ${mapping.images.length} potential equation images`);
        console.log(`  - Extracted ${mapping.equations.length} equations from CNXML`);
        console.log(`\nNext: Edit ${output} to set equationIndex, then run --apply`);
        break;
      }

      case 'apply': {
        if (!args.input || !args.mapping) {
          console.error('Error: --apply requires <file.md> <mapping.json>');
          process.exit(1);
        }
        console.log(`Applying mapping from ${args.mapping}...`);
        const { result, replacements } = applyMapping(
          args.input,
          args.mapping,
          args.dryRun,
          args.verbose
        );

        if (replacements.length === 0) {
          console.log('No replacements made. Check your mapping file.');
          process.exit(0);
        }

        console.log(`\nReplacements:`);
        for (const r of replacements) console.log(`  - ${r.image} -> ${r.latex} (${r.count}x)`);

        if (args.dryRun) {
          console.log('\n[DRY RUN] No files modified.');
        } else {
          const backupPath = args.input + '.bak';
          fs.copyFileSync(args.input, backupPath);
          console.log(`\nBackup: ${backupPath}`);
          fs.writeFileSync(args.input, result);
          console.log(`Updated: ${args.input}`);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
