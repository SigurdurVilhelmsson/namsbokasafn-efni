#!/usr/bin/env node

/**
 * cnxml-to-md.js
 *
 * Converts OpenStax CNXML files to markdown format for Erlendur MT.
 * MathML equations are converted to LaTeX and stored as [[EQ:n]] placeholders.
 * Equations are saved to a separate JSON file for later restoration.
 *
 * Usage:
 *   node tools/cnxml-to-md.js <module-id> [options]
 *   node tools/cnxml-to-md.js <path/to/file.cnxml> [options]
 *   node tools/cnxml-to-md.js --list-modules
 *
 * Output:
 *   - Markdown file with [[EQ:n]] placeholders
 *   - JSON file with equation mappings (same basename + -equations.json)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main';
const MODULES_PATH = '/modules';

// OpenStax default license (CC BY 4.0) - used when license not in CNXML
const OPENSTAX_DEFAULT_LICENSE = {
  name: 'Creative Commons Attribution License',
  url: 'https://creativecommons.org/licenses/by/4.0/'
};

// Module mappings from OpenStax Chemistry 2e collection
// Verified against chemistry-2e.collection.xml from GitHub
const CHEMISTRY_2E_MODULES = {
  // Chapter 1: Essential Ideas
  'm68663': { chapter: 1, section: 'intro', title: 'Introduction' },
  'm68664': { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  'm68667': { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  'm68670': { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  'm68674': { chapter: 1, section: '1.4', title: 'Measurements' },
  'm68690': { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  'm68683': { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  // Chapter 2: Atoms, Molecules, and Ions
  'm68684': { chapter: 2, section: 'intro', title: 'Introduction' },
  'm68685': { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  'm68687': { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  'm68692': { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  'm68693': { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  'm68695': { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  'm68696': { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  'm68698': { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  // Chapter 3: Composition of Substances and Solutions
  'm68699': { chapter: 3, section: 'intro', title: 'Introduction' },
  'm68700': { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  'm68702': { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  'm68703': { chapter: 3, section: '3.3', title: 'Molarity' },
  'm68704': { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  // Chapter 4: Stoichiometry of Chemical Reactions
  'm68730': { chapter: 4, section: 'intro', title: 'Introduction' },
  'm68709': { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  'm68710': { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  'm68713': { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  'm68714': { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  'm68716': { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
  // Chapter 5: Thermochemistry
  'm68723': { chapter: 5, section: 'intro', title: 'Introduction' },
  'm68724': { chapter: 5, section: '5.1', title: 'Energy Basics' },
  'm68726': { chapter: 5, section: '5.2', title: 'Calorimetry' },
  'm68727': { chapter: 5, section: '5.3', title: 'Enthalpy' },
};

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    equationsOutput: null,
    verbose: false,
    listModules: false,
    help: false,
    // Chapter-based numbering options
    chapter: null,           // Override chapter number (e.g., 1)
    exampleStart: 0,         // Starting counter for examples
    figureStart: 0,          // Starting counter for figures
    tableStart: 0,           // Starting counter for tables
    outputCounters: false    // Output final counter values to stderr
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--list-modules') result.listModules = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--equations' && args[i + 1]) result.equationsOutput = args[++i];
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
    else if (arg === '--example-start' && args[i + 1]) result.exampleStart = parseInt(args[++i], 10);
    else if (arg === '--figure-start' && args[i + 1]) result.figureStart = parseInt(args[++i], 10);
    else if (arg === '--table-start' && args[i + 1]) result.tableStart = parseInt(args[++i], 10);
    else if (arg === '--output-counters') result.outputCounters = true;
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
cnxml-to-md.js - Convert OpenStax CNXML to markdown for Erlendur MT

Extracts content from CNXML, converts MathML to LaTeX placeholders [[EQ:n]],
and outputs markdown suitable for machine translation. Equations are saved
separately for later restoration.

Usage:
  node tools/cnxml-to-md.js <module-id> [options]
  node tools/cnxml-to-md.js <path/to/file.cnxml> [options]
  node tools/cnxml-to-md.js --list-modules

Options:
  --output <file>      Output markdown file (default: stdout)
  --equations <file>   Output equations JSON file (default: <output>-equations.json)
  --chapter <num>      Override chapter number for numbering (default: from module lookup)
  --example-start <n>  Starting counter for examples (default: 0)
  --figure-start <n>   Starting counter for figures (default: 0)
  --table-start <n>    Starting counter for tables (default: 0)
  --output-counters    Output final counter values to stderr (for pipeline coordination)
  --verbose            Show detailed progress
  --list-modules       List known Chemistry 2e module IDs
  -h, --help           Show this help message

Numbering:
  Elements are numbered as [chapter].[running_number] where the running number
  is continuous across all sections within a chapter. Use --example-start etc.
  when processing multiple modules in sequence to maintain correct numbering.

Examples:
  node tools/cnxml-to-md.js m68690 --output 02-for-mt/chapters/01/1-5.en.md
  node tools/cnxml-to-md.js m68690 --verbose
`);
}

function printModuleList() {
  console.log('\nKnown Chemistry 2e Modules:\n');
  console.log('| Module ID | Section | Title |');
  console.log('|-----------|---------|-------|');
  for (const [id, info] of Object.entries(CHEMISTRY_2E_MODULES)) {
    console.log(`| ${id} | ${info.section} | ${info.title} |`);
  }
}

async function fetchCnxml(input, verbose) {
  if (fs.existsSync(input)) {
    if (verbose) console.error('Reading local file: ' + input);
    return fs.readFileSync(input, 'utf-8');
  }

  if (/^m\d+$/.test(input)) {
    const url = GITHUB_RAW_BASE + MODULES_PATH + '/' + input + '/index.cnxml';
    if (verbose) console.error('Fetching from GitHub: ' + url);
    return fetchUrl(url);
  }

  throw new Error('Input not found: ' + input);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode + ': Failed to fetch ' + url));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract document metadata from CNXML metadata element.
 * Handles both prefixed (md:) and unprefixed element names.
 *
 * @param {string} cnxml - Raw CNXML content
 * @returns {Object} Metadata object with optional created, revised, license, keywords, subjects
 */
function extractMetadata(cnxml) {
  const metadata = {};

  // Extract metadata section
  const metadataMatch = cnxml.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/);
  if (!metadataMatch) return metadata;
  const metadataContent = metadataMatch[1];

  // Helper to extract element content (handles md: prefix or unprefixed)
  const extractElement = (name) => {
    const prefixedMatch = metadataContent.match(new RegExp('<md:' + name + '[^>]*>([^<]*)<\\/md:' + name + '>'));
    const unprefixedMatch = metadataContent.match(new RegExp('<' + name + '[^>]*>([^<]*)<\\/' + name + '>'));
    return prefixedMatch ? prefixedMatch[1].trim() : (unprefixedMatch ? unprefixedMatch[1].trim() : null);
  };

  // Helper to extract attribute from element
  const extractAttribute = (name, attr) => {
    const prefixedMatch = metadataContent.match(new RegExp('<md:' + name + '[^>]*' + attr + '="([^"]*)"'));
    const unprefixedMatch = metadataContent.match(new RegExp('<' + name + '[^>]*' + attr + '="([^"]*)"'));
    return prefixedMatch ? prefixedMatch[1] : (unprefixedMatch ? unprefixedMatch[1] : null);
  };

  // Extract created date (md:created)
  const created = extractElement('created');
  if (created) metadata.created = created;

  // Extract revised date (md:revised)
  const revised = extractElement('revised');
  if (revised) metadata.revised = revised;

  // Extract license - try url attribute first, then element content
  const licenseUrl = extractAttribute('license', 'url');
  const licenseText = extractElement('license');
  if (licenseUrl) {
    metadata.license_url = licenseUrl;
  } else if (licenseText) {
    metadata.license = licenseText;
  }

  // Extract keywords (md:keyword) - multiple elements
  const keywordPattern = /<md:keyword>([^<]*)<\/md:keyword>|<keyword>([^<]*)<\/keyword>/g;
  const keywords = [];
  let keywordMatch;
  while ((keywordMatch = keywordPattern.exec(metadataContent)) !== null) {
    const keyword = (keywordMatch[1] || keywordMatch[2]).trim();
    if (keyword) keywords.push(keyword);
  }
  if (keywords.length > 0) metadata.keywords = keywords;

  // Extract subjects (md:subject) - multiple elements
  const subjectPattern = /<md:subject>([^<]*)<\/md:subject>|<subject>([^<]*)<\/subject>/g;
  const subjects = [];
  let subjectMatch;
  while ((subjectMatch = subjectPattern.exec(metadataContent)) !== null) {
    const subject = (subjectMatch[1] || subjectMatch[2]).trim();
    if (subject) subjects.push(subject);
  }
  if (subjects.length > 0) metadata.subjects = subjects;

  // Extract abstract (learning objectives) - contains para and list elements
  const abstractMatch = metadataContent.match(/<md:abstract[^>]*>([\s\S]*?)<\/md:abstract>|<abstract[^>]*>([\s\S]*?)<\/abstract>/);
  if (abstractMatch) {
    const abstractContent = abstractMatch[1] || abstractMatch[2];
    const abstract = { intro: null, items: [] };

    // Extract intro paragraph
    const paraMatch = abstractContent.match(/<para[^>]*>([\s\S]*?)<\/para>/);
    if (paraMatch) {
      abstract.intro = paraMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Extract list items
    const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/g;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(abstractContent)) !== null) {
      const itemText = itemMatch[1].replace(/<[^>]+>/g, '').trim();
      if (itemText) abstract.items.push(itemText);
    }

    if (abstract.intro || abstract.items.length > 0) {
      metadata.abstract = abstract;
    }
  }

  return metadata;
}

function convertMathMLToLatex(mathml) {
  let latex = mathml.replace(/m:/g, '');

  // Handle fractions first (before removing tags)
  latex = latex.replace(/<mfrac>([\s\S]*?)<\/mfrac>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const num = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const den = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '\\frac{' + num + '}{' + den + '}';
    }
    return match;
  });

  // Handle superscripts
  latex = latex.replace(/<msup>([\s\S]*?)<\/msup>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const exp = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '{' + base + '}^{' + exp + '}';
    }
    return match;
  });

  // Handle subscripts
  latex = latex.replace(/<msub>([\s\S]*?)<\/msub>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const sub = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      return '{' + base + '}_{' + sub + '}';
    }
    return match;
  });

  // Handle subsup (both subscript and superscript)
  latex = latex.replace(/<msubsup>([\s\S]*?)<\/msubsup>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 3) {
      const base = convertMathMLToLatex('<math>' + parts[0] + '</math>');
      const sub = convertMathMLToLatex('<math>' + parts[1] + '</math>');
      const sup = convertMathMLToLatex('<math>' + parts[2] + '</math>');
      return '{' + base + '}_{' + sub + '}^{' + sup + '}';
    }
    return match;
  });

  // Handle square roots
  latex = latex.replace(/<msqrt>([\s\S]*?)<\/msqrt>/g, (match, content) => {
    const inner = convertMathMLToLatex('<math>' + content + '</math>');
    return '\\sqrt{' + inner + '}';
  });

  const conversions = [
    [/<math[^>]*>/g, ''],
    [/<\/math>/g, ''],
    [/<mrow>/g, '{'],
    [/<\/mrow>/g, '}'],
    [/<semantics>/g, ''],
    [/<\/semantics>/g, ''],
    [/<annotation[^>]*>[\s\S]*?<\/annotation>/g, ''],
    [/<mn>([^<]+)<\/mn>/g, '$1'],
    [/<mi mathvariant="normal">([^<]+)<\/mi>/g, '\\mathrm{$1}'],
    [/<mi>([^<]+)<\/mi>/g, '$1'],
    [/<mtext>([^<]+)<\/mtext>/g, '\\text{$1}'],
    [/<mo>×<\/mo>/g, '\\times '],
    [/<mo>−<\/mo>/g, '-'],
    [/<mo>\+<\/mo>/g, '+'],
    [/<mo>=<\/mo>/g, '='],
    [/<mo>⟶<\/mo>/g, '\\longrightarrow '],
    [/<mo stretchy="false">⟶<\/mo>/g, '\\longrightarrow '],
    [/<mo>→<\/mo>/g, '\\rightarrow '],
    [/<mo stretchy="false">\(<\/mo>/g, '('],
    [/<mo stretchy="false">\)<\/mo>/g, ')'],
    [/<mo>\(<\/mo>/g, '('],
    [/<mo>\)<\/mo>/g, ')'],
    [/<mo>±<\/mo>/g, '\\pm '],
    [/<mo>≈<\/mo>/g, '\\approx '],
    [/<mo>≤<\/mo>/g, '\\leq '],
    [/<mo>≥<\/mo>/g, '\\geq '],
    [/<mo>°<\/mo>/g, '^{\\circ}'],
    [/<mo>([^<]+)<\/mo>/g, '$1'],
    [/<mspace[^>]*\/>/g, '\\,'],
    [/<mspace[^>]*><\/mspace>/g, '\\,'],
    [/<[^>]+>/g, ''],
    [/\s+/g, ' '],
    [/\{\s*\}/g, ''],
  ];

  for (const [pattern, replacement] of conversions) {
    latex = latex.replace(pattern, replacement);
  }

  return latex.trim();
}

function splitMathParts(content) {
  content = content.trim();
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

function extractContent(cnxml, options = {}) {
  const verbose = options.verbose || false;
  const equations = {};
  let equationCounter = 0;

  const titleMatch = cnxml.match(/<title>([^<]+)<\/title>/);
  const moduleIdMatch = cnxml.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  const documentTitle = titleMatch ? titleMatch[1].trim() : 'Untitled';
  const moduleId = moduleIdMatch ? moduleIdMatch[1] : 'unknown';

  const moduleInfo = CHEMISTRY_2E_MODULES[moduleId] || {};
  const section = moduleInfo.section || '';

  // Determine chapter number: from options, module lookup, or section string
  let chapter = options.chapter;
  if (chapter === null || chapter === undefined) {
    chapter = moduleInfo.chapter;
  }
  if (chapter === null || chapter === undefined) {
    // Try to extract from section (e.g., "1.6" → 1)
    const sectionChapterMatch = section.match(/^(\d+)\./);
    chapter = sectionChapterMatch ? parseInt(sectionChapterMatch[1], 10) : null;
  }

  // Extract optional metadata (dates, license, keywords)
  const docMetadata = extractMetadata(cnxml);

  const contentMatch = cnxml.match(/<content>([\s\S]*)<\/content>/);
  if (!contentMatch) throw new Error('No <content> element found in CNXML');
  let content = contentMatch[1];

  // Replace MathML with placeholders
  const mathPattern = /<m:math[^>]*>[\s\S]*?<\/m:math>/g;
  content = content.replace(mathPattern, (mathml) => {
    equationCounter++;
    const latex = convertMathMLToLatex(mathml);
    equations['EQ:' + equationCounter] = latex;
    return '[[EQ:' + equationCounter + ']]';
  });

  // Build markdown
  const lines = [];

  // Frontmatter with enhanced metadata
  lines.push('---');
  lines.push('title: "' + documentTitle + '"');
  if (section) lines.push('section: "' + section + '"');
  lines.push('module: "' + moduleId + '"');
  lines.push('lang: "en"');

  // Add dates if available
  if (docMetadata.created) {
    lines.push('created: "' + docMetadata.created + '"');
  }
  if (docMetadata.revised) {
    lines.push('revised: "' + docMetadata.revised + '"');
  }

  // Add license (from metadata or OpenStax default)
  if (docMetadata.license_url) {
    lines.push('license_url: "' + docMetadata.license_url + '"');
  } else if (docMetadata.license) {
    lines.push('license: "' + docMetadata.license + '"');
  } else {
    // Apply OpenStax default license for Chemistry 2e content
    lines.push('license_url: "' + OPENSTAX_DEFAULT_LICENSE.url + '"');
  }

  // Add keywords as YAML array if available
  if (docMetadata.keywords && docMetadata.keywords.length > 0) {
    lines.push('keywords:');
    for (const keyword of docMetadata.keywords) {
      lines.push('  - "' + keyword + '"');
    }
  }

  // Add subjects as YAML array if available
  if (docMetadata.subjects && docMetadata.subjects.length > 0) {
    lines.push('subjects:');
    for (const subject of docMetadata.subjects) {
      lines.push('  - "' + subject + '"');
    }
  }

  lines.push('---');
  lines.push('');

  // Document title as H1
  lines.push('# ' + documentTitle);
  lines.push('');

  // Add learning objectives from abstract if available
  if (docMetadata.abstract) {
    lines.push(':::learning-objectives');
    lines.push('## Learning Objectives');
    lines.push('');
    if (docMetadata.abstract.intro) {
      lines.push(docMetadata.abstract.intro);
      lines.push('');
    }
    for (const item of docMetadata.abstract.items) {
      lines.push('- ' + item);
    }
    lines.push(':::');
    lines.push('');
  }

  // Process top-level content BEFORE sections (introductory paragraphs and equations)
  const firstSectionIndex = content.search(/<section[^>]*>/);
  const preSectionContent = firstSectionIndex > 0 ? content.substring(0, firstSectionIndex) : '';

  if (preSectionContent) {
    // Find all paragraphs and equations in document order
    const topLevelPattern = /<(para|equation)([^>]*)>([\s\S]*?)<\/\1>/g;
    let topMatch;
    while ((topMatch = topLevelPattern.exec(preSectionContent)) !== null) {
      const elementType = topMatch[1];
      const elementContent = topMatch[3];

      if (elementType === 'para') {
        const paraText = processInlineContent(elementContent);
        if (paraText.trim()) {
          lines.push(paraText);
          lines.push('');
        }
      } else if (elementType === 'equation') {
        // Equations already have MathML replaced with [[EQ:n]] placeholders
        const eqText = processInlineContent(elementContent);
        if (eqText.trim()) {
          lines.push(eqText);
          lines.push('');
        }
      }
    }
  }

  // Counters for examples, figures, and tables (chapter-based numbering)
  // Initialize from options to support running counters across modules
  let exampleCounter = options.exampleStart || 0;
  let figureCounter = options.figureStart || 0;
  let tableCounter = options.tableStart || 0;

  // Process sections
  const sectionPattern = /<section[^>]*>([\s\S]*?)<\/section>/g;
  let sectionMatch;

  while ((sectionMatch = sectionPattern.exec(content)) !== null) {
    const sectionContent = sectionMatch[1];
    const sectionTitleMatch = sectionContent.match(/<title>([^<]+)<\/title>/);

    if (sectionTitleMatch) {
      lines.push('## ' + processInlineContent(sectionTitleMatch[1]));
      lines.push('');
    }

    // Find all top-level elements with their positions for document-order processing
    const elements = [];

    // Find paragraphs and equations (excluding those inside nested elements)
    // We need to track which para/equation are inside nested elements
    const nestedRanges = [];
    const nestedPatterns = [
      /<note[^>]*>[\s\S]*?<\/note>/g,
      /<example[^>]*>[\s\S]*?<\/example>/g,
      /<exercise[^>]*>[\s\S]*?<\/exercise>/g,
      /<figure[^>]*>[\s\S]*?<\/figure>/g,
      /<table[^>]*>[\s\S]*?<\/table>/g,
      /<list[^>]*>[\s\S]*?<\/list>/g
    ];
    for (const pattern of nestedPatterns) {
      let m;
      while ((m = pattern.exec(sectionContent)) !== null) {
        nestedRanges.push({ start: m.index, end: m.index + m[0].length });
      }
    }

    const isInsideNested = (pos) => nestedRanges.some(r => pos >= r.start && pos < r.end);

    // Find top-level paragraphs
    const paraPattern = /<para([^>]*)>([\s\S]*?)<\/para>/g;
    let paraMatch;
    while ((paraMatch = paraPattern.exec(sectionContent)) !== null) {
      if (!isInsideNested(paraMatch.index)) {
        elements.push({ type: 'para', pos: paraMatch.index, content: paraMatch[2], attrs: paraMatch[1] });
      }
    }

    // Find top-level equations
    const eqPattern = /<equation([^>]*)>([\s\S]*?)<\/equation>/g;
    let eqMatch;
    while ((eqMatch = eqPattern.exec(sectionContent)) !== null) {
      if (!isInsideNested(eqMatch.index)) {
        elements.push({ type: 'equation', pos: eqMatch.index, content: eqMatch[2], attrs: eqMatch[1] });
      }
    }

    // Find lists
    const listPattern = /<list([^>]*)>([\s\S]*?)<\/list>/g;
    let listMatch;
    while ((listMatch = listPattern.exec(sectionContent)) !== null) {
      if (!isInsideNested(listMatch.index)) {
        elements.push({ type: 'list', pos: listMatch.index, content: listMatch[2], attrs: listMatch[1] });
      }
    }

    // Find notes
    const notePattern = /<note([^>]*)>([\s\S]*?)<\/note>/g;
    let noteMatch;
    while ((noteMatch = notePattern.exec(sectionContent)) !== null) {
      elements.push({ type: 'note', pos: noteMatch.index, content: noteMatch[2], attrs: noteMatch[1] });
    }

    // Find examples
    const examplePattern = /<example([^>]*)>([\s\S]*?)<\/example>/g;
    let exampleMatch;
    while ((exampleMatch = examplePattern.exec(sectionContent)) !== null) {
      elements.push({ type: 'example', pos: exampleMatch.index, content: exampleMatch[2], attrs: exampleMatch[1] });
    }

    // Find figures
    const figurePattern = /<figure([^>]*)>([\s\S]*?)<\/figure>/g;
    let figureMatch;
    while ((figureMatch = figurePattern.exec(sectionContent)) !== null) {
      elements.push({ type: 'figure', pos: figureMatch.index, content: figureMatch[2], attrs: figureMatch[1] });
    }

    // Find exercises
    const exercisePattern = /<exercise([^>]*)>([\s\S]*?)<\/exercise>/g;
    let exerciseMatch;
    while ((exerciseMatch = exercisePattern.exec(sectionContent)) !== null) {
      elements.push({ type: 'exercise', pos: exerciseMatch.index, content: exerciseMatch[2], attrs: exerciseMatch[1] });
    }

    // Find tables
    const tablePattern = /<table([^>]*)>([\s\S]*?)<\/table>/g;
    let tableMatch;
    while ((tableMatch = tablePattern.exec(sectionContent)) !== null) {
      elements.push({ type: 'table', pos: tableMatch.index, content: tableMatch[2], attrs: tableMatch[1] });
    }

    // Sort elements by position in document
    elements.sort((a, b) => a.pos - b.pos);

    // Process elements in document order
    for (const elem of elements) {
      if (elem.type === 'para') {
        const paraText = processInlineContent(elem.content);
        if (paraText.trim()) {
          lines.push(paraText);
          lines.push('');
        }
      } else if (elem.type === 'equation') {
        const eqText = processInlineContent(elem.content);
        if (eqText.trim()) {
          lines.push(eqText);
          lines.push('');
        }
      } else if (elem.type === 'list') {
        const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/g;
        let itemMatch;
        while ((itemMatch = itemPattern.exec(elem.content)) !== null) {
          const itemText = processInlineContent(itemMatch[1]);
          if (itemText.trim()) {
            lines.push('- ' + itemText);
          }
        }
        lines.push('');
      } else if (elem.type === 'note') {
        const noteTitleMatch = elem.content.match(/<title>([^<]+)<\/title>/);
        const classMatch = elem.attrs.match(/class="([^"]*)"/);
        const noteClass = classMatch ? classMatch[1] : '';

        let directive = ':::note';
        if (noteClass.includes('link-to-learning')) {
          directive = ':::note{.link-to-learning}';
        } else if (noteClass.includes('everyday-life')) {
          directive = ':::note{.everyday-life}';
        } else if (noteClass.includes('chemist-portrait')) {
          directive = ':::note{.chemist-portrait}';
        } else if (noteClass.includes('sciences-interconnect')) {
          directive = ':::note{.sciences-interconnect}';
        }

        lines.push(directive);
        if (noteTitleMatch) {
          lines.push('### ' + processInlineContent(noteTitleMatch[1]));
          lines.push('');
        }

        const noteContentPattern = /<(para|equation)([^>]*)>([\s\S]*?)<\/\1>/g;
        let noteContentMatch;
        while ((noteContentMatch = noteContentPattern.exec(elem.content)) !== null) {
          const elementType = noteContentMatch[1];
          const elementContent = noteContentMatch[3];
          if (elementType === 'para') {
            const paraText = processInlineContent(elementContent);
            if (paraText.trim()) {
              lines.push(paraText);
              lines.push('');
            }
          } else if (elementType === 'equation') {
            const eqText = processInlineContent(elementContent);
            if (eqText.trim()) {
              lines.push(eqText);
              lines.push('');
            }
          }
        }
        lines.push(':::');
        lines.push('');
      } else if (elem.type === 'example') {
        exampleCounter++;
        const exampleTitleMatch = elem.content.match(/<title>([^<]+)<\/title>/);
        const exampleTitle = exampleTitleMatch ? exampleTitleMatch[1] : null;
        // Use chapter-based numbering: [chapter].[running_number]
        const exampleNumber = chapter ? `${chapter}.${exampleCounter}` : String(exampleCounter);

        lines.push('::: example');
        if (exampleTitle) {
          lines.push('### Example ' + exampleNumber + ': ' + processInlineContent(exampleTitle));
          lines.push('');
        } else {
          lines.push('### Example ' + exampleNumber);
          lines.push('');
        }

        const exContentPattern = /<(para|equation)([^>]*)>([\s\S]*?)<\/\1>/g;
        let exContentMatch;
        while ((exContentMatch = exContentPattern.exec(elem.content)) !== null) {
          const elementType = exContentMatch[1];
          let elementContent = exContentMatch[3];

          // Check for title inside this element
          const innerTitleMatch = elementContent.match(/<title>([^<]+)<\/title>/);
          if (innerTitleMatch) {
            const innerTitle = innerTitleMatch[1];
            // Strip the title tag
            elementContent = elementContent.replace(/<title>[^<]*<\/title>/g, '');
            // If this is the main example title, skip outputting it again
            // Otherwise output it as a bold label (e.g., "Solution")
            if (innerTitle !== exampleTitle) {
              lines.push('**' + processInlineContent(innerTitle) + '**');
              lines.push('');
            }
          }

          if (elementType === 'para') {
            const paraText = processInlineContent(elementContent);
            if (paraText.trim()) {
              lines.push(paraText);
              lines.push('');
            }
          } else if (elementType === 'equation') {
            const eqText = processInlineContent(elementContent);
            if (eqText.trim()) {
              lines.push(eqText);
              lines.push('');
            }
          }
        }
        lines.push(':::');
        lines.push('');
      } else if (elem.type === 'figure') {
        figureCounter++;
        const captionMatch = elem.content.match(/<caption>([\s\S]*?)<\/caption>/);
        const idMatch = elem.attrs.match(/id="([^"]*)"/);
        const figureId = idMatch ? idMatch[1] : null;
        // Use chapter-based numbering: [chapter].[running_number]
        const figureNumber = chapter ? `${chapter}.${figureCounter}` : String(figureCounter);

        if (captionMatch) {
          const captionText = processInlineContent(captionMatch[1]);
          if (figureId) {
            lines.push('*Figure ' + figureNumber + ': ' + captionText + '*{#' + figureId + '}');
          } else {
            lines.push('*Figure ' + figureNumber + ': ' + captionText + '*');
          }
          lines.push('');
        }
      } else if (elem.type === 'exercise') {
        const idMatch = elem.attrs.match(/id="([^"]*)"/);
        const exerciseId = idMatch ? idMatch[1] : null;
        const problemMatch = elem.content.match(/<problem[^>]*>([\s\S]*?)<\/problem>/);
        const solutionMatch = elem.content.match(/<solution[^>]*>([\s\S]*?)<\/solution>/);

        if (problemMatch) {
          if (exerciseId) {
            lines.push(':::practice-problem{#' + exerciseId + '}');
          } else {
            lines.push(':::practice-problem');
          }

          const problemContentPattern = /<(para|equation)([^>]*)>([\s\S]*?)<\/\1>/g;
          let problemContentMatch;
          while ((problemContentMatch = problemContentPattern.exec(problemMatch[1])) !== null) {
            const elementType = problemContentMatch[1];
            const elementContent = problemContentMatch[3];
            if (elementType === 'para') {
              const paraText = processInlineContent(elementContent);
              if (paraText.trim()) {
                lines.push(paraText);
                lines.push('');
              }
            } else if (elementType === 'equation') {
              const eqText = processInlineContent(elementContent);
              if (eqText.trim()) {
                lines.push(eqText);
                lines.push('');
              }
            }
          }

          if (solutionMatch) {
            lines.push(':::answer');
            const solutionContentPattern = /<(para|equation)([^>]*)>([\s\S]*?)<\/\1>/g;
            let solutionContentMatch;
            while ((solutionContentMatch = solutionContentPattern.exec(solutionMatch[1])) !== null) {
              const elementType = solutionContentMatch[1];
              const elementContent = solutionContentMatch[3];
              if (elementType === 'para') {
                const paraText = processInlineContent(elementContent);
                if (paraText.trim()) {
                  lines.push(paraText);
                  lines.push('');
                }
              } else if (elementType === 'equation') {
                const eqText = processInlineContent(elementContent);
                if (eqText.trim()) {
                  lines.push(eqText);
                  lines.push('');
                }
              }
            }
            lines.push(':::');
          }

          lines.push(':::');
          lines.push('');
        }
      } else if (elem.type === 'table') {
        // Process table (inline, will be handled below)
        processTable(elem.attrs, elem.content, lines, processInlineContent);
      }
    }
  }

  if (verbose) {
    console.error('Extracted from ' + moduleId + ': ' + documentTitle);
    console.error('Chapter: ' + (chapter || 'unknown'));
    console.error('Equations found: ' + equationCounter);
    console.error('Examples: ' + exampleCounter + ', Figures: ' + figureCounter + ', Tables: ' + tableCounter);
    console.error('Output lines: ' + lines.length);
    if (docMetadata.created) console.error('Created: ' + docMetadata.created);
    if (docMetadata.revised) console.error('Revised: ' + docMetadata.revised);
    if (docMetadata.keywords) console.error('Keywords: ' + docMetadata.keywords.join(', '));
  }

  return {
    moduleId,
    section,
    chapter,
    documentTitle,
    metadata: docMetadata,
    markdown: lines.join('\n'),
    equations,
    // Final counter values for pipeline coordination
    counters: {
      examples: exampleCounter,
      figures: figureCounter,
      tables: tableCounter
    }
  };
}

/**
 * Process a CNXML table element into markdown
 */
function processTable(tableAttrs, tableContent, lines, processInlineContent) {
  // Extract table ID and class
  const idMatch = tableAttrs.match(/id="([^"]*)"/);
  const tableId = idMatch ? idMatch[1] : null;
  const classMatch = tableAttrs.match(/class="([^"]*)"/);
  const tableClass = classMatch ? classMatch[1] : '';

  // Check if it's a key-equations table (special handling)
  const isKeyEquations = tableId === 'key-equations-table' || tableClass.includes('key-equations');

  // Extract and remove footnotes from content, collect them for later
  const footnotes = [];
  const footnotePattern = /<footnote[^>]*>([\s\S]*?)<\/footnote>/g;
  let footnoteMatch;
  let cleanedContent = tableContent;
  while ((footnoteMatch = footnotePattern.exec(tableContent)) !== null) {
    const footnoteText = processInlineContent(footnoteMatch[1]);
    footnotes.push(footnoteText);
    cleanedContent = cleanedContent.replace(footnoteMatch[0], '');
  }

  // Helper to extract cells from a row, detecting spanning entries
  const extractRowCells = (rowContent) => {
    const cells = [];
    let isSpanning = false;
    const entryPattern = /<entry([^>]*)>([\s\S]*?)<\/entry>/g;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(rowContent)) !== null) {
      const entryAttrs = entryMatch[1];
      const cellText = processInlineContent(entryMatch[2]);
      // Check if entry spans multiple columns (namest/nameend attributes)
      if (entryAttrs.includes('namest=') && entryAttrs.includes('nameend=')) {
        isSpanning = true;
      }
      cells.push(cellText);
    }
    return { cells, isSpanning };
  };

  // Extract header rows from thead
  const headerRows = [];
  let tableTitle = null;
  const theadMatch = cleanedContent.match(/<thead>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(theadMatch[1])) !== null) {
      const { cells, isSpanning } = extractRowCells(rowMatch[1]);
      if (cells.length > 0) {
        // If first row has single spanning cell, treat as table title
        if (headerRows.length === 0 && cells.length === 1 && isSpanning) {
          tableTitle = cells[0];
        } else {
          headerRows.push(cells);
        }
      }
    }
  }

  // Extract body rows from tbody (or entire table if no tbody)
  const bodyRows = [];
  const tbodyMatch = cleanedContent.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const bodyContent = tbodyMatch ? tbodyMatch[1] : cleanedContent;
  const bodyRowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let bodyRowMatch;
  while ((bodyRowMatch = bodyRowPattern.exec(bodyContent)) !== null) {
    // Skip rows already processed in thead
    if (theadMatch && theadMatch[1].includes(bodyRowMatch[0])) continue;

    const { cells } = extractRowCells(bodyRowMatch[1]);
    if (cells.length > 0) {
      bodyRows.push(cells);
    }
  }

  // Output table title if present
  if (tableTitle) {
    lines.push('**' + tableTitle + '**');
    lines.push('');
  }

  // Output markdown table
  if (headerRows.length > 0 || bodyRows.length > 0) {
    // Use header row if available, otherwise use first body row as header
    const header = headerRows.length > 0 ? headerRows[0] : (bodyRows.length > 0 ? bodyRows.shift() : []);
    if (header.length > 0) {
      lines.push('| ' + header.join(' | ') + ' |');
      lines.push('| ' + header.map(() => '---').join(' | ') + ' |');

      // Add remaining header rows (if multi-row header) and body rows
      const dataRows = [...headerRows.slice(1), ...bodyRows];
      for (const row of dataRows) {
        // Pad row to match header length
        while (row.length < header.length) row.push('');
        lines.push('| ' + row.join(' | ') + ' |');
      }
      lines.push('');
    }
  }

  // Output footnotes if present
  if (footnotes.length > 0) {
    for (const footnote of footnotes) {
      lines.push('*' + footnote + '*');
    }
    lines.push('');
  }
}

function processInlineContent(content) {
  return content
    .replace(/<emphasis[^>]*>([^<]*)<\/emphasis>/g, '**$1**')
    // Term with ID preservation: <term id="term-00001">chemistry</term> → **chemistry**{#term-00001}
    .replace(/<term\s+id="([^"]*)"[^>]*>([^<]*)<\/term>/g, '**$2**{#$1}')
    .replace(/<term[^>]*>([^<]*)<\/term>/g, '**$1**')
    // External URL links: <link url="http://...">text</link> → [text]{url="http://..."}
    // Uses {url=""} syntax to survive MT (parentheses get stripped)
    .replace(/<link[^>]*url="([^"]*)"[^>]*>([^<]*)<\/link>/g, '[$2]{url="$1"}')
    // Internal cross-references: <link target-id="CNX_Chem_01_01_SciMethod"/> → [↗]{ref="CNX_Chem_01_01_SciMethod"}
    // Uses {ref=""} syntax to survive MT
    .replace(/<link\s+target-id="([^"]*)"[^>]*\/>/g, '[↗]{ref="$1"}')
    .replace(/<link\s+target-id="([^"]*)"[^>]*>([^<]*)<\/link>/g, '[$2]{ref="$1"}')
    // Document cross-references: <link document="m68778"/> → [Section]{doc="m68778"}
    // Uses {doc=""} syntax to survive MT
    .replace(/<link\s+document="([^"]*)"[^>]*\/>/g, '[Section]{doc="$1"}')
    .replace(/<link\s+document="([^"]*)"[^>]*>([^<]*)<\/link>/g, '[$2]{doc="$1"}')
    // Fallback for other links
    .replace(/<link[^>]*>([^<]*)<\/link>/g, '$1')
    .replace(/<sub>([^<]*)<\/sub>/g, '~$1~')
    .replace(/<sup>([^<]*)<\/sup>/g, '^$1^')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
    const cnxml = await fetchCnxml(args.input, args.verbose);
    if (args.verbose) console.error('Fetched ' + cnxml.length + ' bytes of CNXML');

    // Pass all relevant options to extractContent
    const extractOptions = {
      verbose: args.verbose,
      chapter: args.chapter,
      exampleStart: args.exampleStart,
      figureStart: args.figureStart,
      tableStart: args.tableStart
    };
    const data = extractContent(cnxml, extractOptions);

    // Write markdown
    if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, data.markdown);
      console.error('Markdown written to: ' + args.output);

      // Write equations JSON
      const equationsPath = args.equationsOutput ||
        args.output.replace(/\.md$/, '-equations.json');
      const equationsData = {
        module: data.moduleId,
        section: data.section,
        chapter: data.chapter,
        title: data.documentTitle,
        equations: data.equations
      };
      fs.writeFileSync(equationsPath, JSON.stringify(equationsData, null, 2));
      console.error('Equations written to: ' + equationsPath);
      console.error('Total equations: ' + Object.keys(data.equations).length);
    } else {
      console.log(data.markdown);
      console.error('\n--- Equations (not saved - use --output to save) ---');
      console.error(JSON.stringify(data.equations, null, 2));
    }

    // Output final counter values for pipeline coordination
    if (args.outputCounters) {
      console.error('COUNTERS:' + JSON.stringify(data.counters));
    }

  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
