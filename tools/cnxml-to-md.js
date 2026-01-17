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

const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main';
const MODULES_PATH = '/modules';

const CHEMISTRY_2E_MODULES = {
  'm68662': { chapter: 1, section: 'intro', title: 'Introduction' },
  'm68663': { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  'm68664': { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  'm68667': { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  'm68674': { chapter: 1, section: '1.4', title: 'Measurements' },
  'm68690': { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  'm68683': { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  'm68695': { chapter: 2, section: 'intro', title: 'Introduction' },
  'm68696': { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  'm68698': { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  'm68700': { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  'm68701': { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  'm68704': { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  'm68710': { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  'm68712': { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  'm68718': { chapter: 3, section: 'intro', title: 'Introduction' },
  'm68720': { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  'm68723': { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  'm68730': { chapter: 3, section: '3.3', title: 'Molarity' },
  'm68738': { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  'm68743': { chapter: 4, section: 'intro', title: 'Introduction' },
  'm68748': { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  'm68754': { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  'm68759': { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  'm68766': { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  'm68768': { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
};

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    equationsOutput: null,
    verbose: false,
    listModules: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--list-modules') result.listModules = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--equations' && args[i + 1]) result.equationsOutput = args[++i];
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
  --verbose            Show detailed progress
  --list-modules       List known Chemistry 2e module IDs
  -h, --help           Show this help message

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

function extractContent(cnxml, verbose) {
  const equations = {};
  let equationCounter = 0;

  const titleMatch = cnxml.match(/<title>([^<]+)<\/title>/);
  const moduleIdMatch = cnxml.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  const documentTitle = titleMatch ? titleMatch[1].trim() : 'Untitled';
  const moduleId = moduleIdMatch ? moduleIdMatch[1] : 'unknown';

  const moduleInfo = CHEMISTRY_2E_MODULES[moduleId] || {};
  const section = moduleInfo.section || '';

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

  // Frontmatter
  lines.push('---');
  lines.push('title: "' + documentTitle + '"');
  if (section) lines.push('section: "' + section + '"');
  lines.push('module: "' + moduleId + '"');
  lines.push('lang: "en"');
  lines.push('---');
  lines.push('');

  // Document title as H1
  lines.push('# ' + documentTitle);
  lines.push('');

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

    // Process paragraphs within section
    const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
    let paraMatch;
    while ((paraMatch = paraPattern.exec(sectionContent)) !== null) {
      const paraText = processInlineContent(paraMatch[1]);
      if (paraText.trim()) {
        lines.push(paraText);
        lines.push('');
      }
    }

    // Process lists
    const listPattern = /<list[^>]*>([\s\S]*?)<\/list>/g;
    let listMatch;
    while ((listMatch = listPattern.exec(sectionContent)) !== null) {
      const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/g;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(listMatch[1])) !== null) {
        const itemText = processInlineContent(itemMatch[1]);
        if (itemText.trim()) {
          lines.push('- ' + itemText);
        }
      }
      lines.push('');
    }

    // Process notes
    const notePattern = /<note[^>]*>([\s\S]*?)<\/note>/g;
    let noteMatch;
    while ((noteMatch = notePattern.exec(sectionContent)) !== null) {
      const noteContent = noteMatch[1];
      const noteTitleMatch = noteContent.match(/<title>([^<]+)<\/title>/);

      lines.push('::: note');
      if (noteTitleMatch) {
        lines.push('### ' + processInlineContent(noteTitleMatch[1]));
        lines.push('');
      }

      const noteParaPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
      let noteParaMatch;
      while ((noteParaMatch = noteParaPattern.exec(noteContent)) !== null) {
        const paraText = processInlineContent(noteParaMatch[1]);
        if (paraText.trim()) {
          lines.push(paraText);
          lines.push('');
        }
      }
      lines.push(':::');
      lines.push('');
    }

    // Process examples
    const examplePattern = /<example[^>]*>([\s\S]*?)<\/example>/g;
    let exampleMatch;
    while ((exampleMatch = examplePattern.exec(sectionContent)) !== null) {
      const exampleContent = exampleMatch[1];
      const exampleTitleMatch = exampleContent.match(/<title>([^<]+)<\/title>/);

      lines.push('::: example');
      if (exampleTitleMatch) {
        lines.push('### ' + processInlineContent(exampleTitleMatch[1]));
        lines.push('');
      }

      const exParaPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
      let exParaMatch;
      while ((exParaMatch = exParaPattern.exec(exampleContent)) !== null) {
        const paraText = processInlineContent(exParaMatch[1]);
        if (paraText.trim()) {
          lines.push(paraText);
          lines.push('');
        }
      }
      lines.push(':::');
      lines.push('');
    }

    // Process figures
    const figurePattern = /<figure[^>]*>([\s\S]*?)<\/figure>/g;
    let figureMatch;
    while ((figureMatch = figurePattern.exec(sectionContent)) !== null) {
      const figureContent = figureMatch[1];
      const captionMatch = figureContent.match(/<caption>([\s\S]*?)<\/caption>/);

      if (captionMatch) {
        const captionText = processInlineContent(captionMatch[1]);
        lines.push('*Figure: ' + captionText + '*');
        lines.push('');
      }
    }
  }

  // Process any remaining paragraphs not in sections
  const topLevelParaPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  let topParaMatch;
  const processedContent = content.replace(/<section[^>]*>[\s\S]*?<\/section>/g, '');
  while ((topParaMatch = topLevelParaPattern.exec(processedContent)) !== null) {
    const paraText = processInlineContent(topParaMatch[1]);
    if (paraText.trim() && !lines.includes(paraText)) {
      lines.push(paraText);
      lines.push('');
    }
  }

  if (verbose) {
    console.error('Extracted from ' + moduleId + ': ' + documentTitle);
    console.error('Equations found: ' + equationCounter);
    console.error('Output lines: ' + lines.length);
  }

  return {
    moduleId,
    section,
    documentTitle,
    markdown: lines.join('\n'),
    equations
  };
}

function processInlineContent(content) {
  return content
    .replace(/<emphasis[^>]*>([^<]*)<\/emphasis>/g, '**$1**')
    .replace(/<term[^>]*>([^<]*)<\/term>/g, '**$1**')
    .replace(/<link[^>]*url="([^"]*)"[^>]*>([^<]*)<\/link>/g, '[$2]($1)')
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

    const data = extractContent(cnxml, args.verbose);

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

  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
