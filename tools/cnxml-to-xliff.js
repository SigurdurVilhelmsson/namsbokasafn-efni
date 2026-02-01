#!/usr/bin/env node

/**
 * @deprecated This tool is deprecated. Use cnxml-to-md.js + Matecat Align instead.
 * See docs/workflow/simplified-workflow.md for the new 5-step workflow.
 *
 * cnxml-to-xliff.js
 *
 * Converts OpenStax CNXML files to XLIFF 1.2 format for translation in Matecat.
 * MathML equations are converted to LaTeX and protected as inline elements.
 *
 * Usage:
 *   node tools/cnxml-to-xliff.js <module-id> [options]
 *   node tools/cnxml-to-xliff.js <path/to/file.cnxml> [options]
 *   node tools/cnxml-to-xliff.js --list-modules
 */

const fs = require('fs');
const https = require('https');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main';
const MODULES_PATH = '/modules';

const CHEMISTRY_2E_MODULES = {
  m68662: { chapter: 1, section: 'intro', title: 'Introduction' },
  m68663: { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  m68664: { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  m68667: { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  m68674: { chapter: 1, section: '1.4', title: 'Measurements' },
  m68690: { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  m68683: { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  m68695: { chapter: 2, section: 'intro', title: 'Introduction' },
  m68696: { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  m68698: { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  m68700: { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  m68701: { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  m68704: { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  m68710: { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  m68712: { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  m68718: { chapter: 3, section: 'intro', title: 'Introduction' },
  m68720: { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  m68723: { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  m68730: { chapter: 3, section: '3.3', title: 'Molarity' },
  m68738: { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  m68743: { chapter: 4, section: 'intro', title: 'Introduction' },
  m68748: { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  m68754: { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  m68759: { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  m68766: { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  m68768: { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
};

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    sourceLang: 'en',
    targetLang: 'is',
    verbose: false,
    listModules: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--list-modules') result.listModules = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--source-lang' && args[i + 1]) result.sourceLang = args[++i];
    else if (arg === '--target-lang' && args[i + 1]) result.targetLang = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
cnxml-to-xliff.js - Convert OpenStax CNXML to XLIFF for Matecat translation

Usage:
  node tools/cnxml-to-xliff.js <module-id> [options]
  node tools/cnxml-to-xliff.js --list-modules

Options:
  --output <file>       Output XLIFF file (default: stdout)
  --source-lang <lang>  Source language code (default: en)
  --target-lang <lang>  Target language code (default: is)
  --verbose             Show detailed progress
  -h, --help            Show this help message
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
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetchUrl(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ': Failed to fetch ' + url));
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

function convertMathMLToLatex(mathml) {
  let latex = mathml.replace(/m:/g, '');

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
    [/<mo>×<\/mo>/g, ' \\times '],
    [/<mo>−<\/mo>/g, ' - '],
    [/<mo>\+<\/mo>/g, ' + '],
    [/<mo>=<\/mo>/g, ' = '],
    [/<mo>⟶<\/mo>/g, ' \\longrightarrow '],
    [/<mo stretchy="false">⟶<\/mo>/g, ' \\longrightarrow '],
    [/<mo>→<\/mo>/g, ' \\rightarrow '],
    [/<mo stretchy="false">\(<\/mo>/g, '('],
    [/<mo stretchy="false">\)<\/mo>/g, ')'],
    [/<mo>\(<\/mo>/g, '('],
    [/<mo>\)<\/mo>/g, ')'],
    [/<mo>±<\/mo>/g, ' \\pm '],
    [/<mo>([^<]+)<\/mo>/g, '$1'],
    [/<mspace[^>]*\/>/g, '\\;'],
    [/<mspace[^>]*><\/mspace>/g, '\\;'],
    [/<[^>]+>/g, ''],
    [/\s+/g, ' '],
  ];

  for (const [pattern, replacement] of conversions) {
    latex = latex.replace(pattern, replacement);
  }

  // Handle fractions
  latex = latex.replace(/<mfrac>([\s\S]*?)<\/mfrac>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) return '\\frac{' + parts[0] + '}{' + parts[1] + '}';
    return match;
  });

  // Handle subscripts/superscripts
  latex = latex.replace(/<msup>([\s\S]*?)<\/msup>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) return '{' + parts[0] + '}^{' + parts[1] + '}';
    return match;
  });

  latex = latex.replace(/<msub>([\s\S]*?)<\/msub>/g, (match, content) => {
    const parts = splitMathParts(content);
    if (parts.length === 2) return '{' + parts[0] + '}_{' + parts[1] + '}';
    return match;
  });

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

function extractSegments(cnxml, verbose) {
  const segments = [];
  let segmentId = 0;

  const titleMatch = cnxml.match(/<title>([^<]+)<\/title>/);
  const moduleIdMatch = cnxml.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  const documentTitle = titleMatch ? titleMatch[1] : 'Unknown';
  const moduleId = moduleIdMatch ? moduleIdMatch[1] : 'unknown';

  if (documentTitle && documentTitle !== 'Unknown') {
    segments.push({
      id: 'seg-' + ++segmentId,
      type: 'title',
      source: documentTitle,
      note: 'Document title',
    });
  }

  const contentMatch = cnxml.match(/<content>([\s\S]*)<\/content>/);
  if (!contentMatch) throw new Error('No <content> element found in CNXML');
  const content = contentMatch[1];

  // Extract section titles
  const sectionTitlePattern = /<section[^>]*>[\s\S]*?<title>([^<]+)<\/title>/g;
  let match;
  while ((match = sectionTitlePattern.exec(content)) !== null) {
    segments.push({
      id: 'seg-' + ++segmentId,
      type: 'section-title',
      source: match[1].trim(),
      note: 'Section title',
    });
  }

  // Extract paragraphs
  const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  while ((match = paraPattern.exec(content)) !== null) {
    const processed = processSegmentWithMath(match[1]);
    if (processed.text.trim()) {
      segments.push({
        id: 'seg-' + ++segmentId,
        type: 'paragraph',
        source: processed.text,
        inlineElements: processed.inlineElements,
        note:
          processed.inlineElements.length > 0
            ? 'Contains ' + processed.inlineElements.length + ' equation(s)'
            : null,
      });
    }
  }

  // Extract notes
  const notePattern = /<note[^>]*>([\s\S]*?)<\/note>/g;
  while ((match = notePattern.exec(content)) !== null) {
    const noteContent = match[1];
    const noteTitleMatch = noteContent.match(/<title>([^<]+)<\/title>/);
    if (noteTitleMatch) {
      segments.push({
        id: 'seg-' + ++segmentId,
        type: 'note-title',
        source: noteTitleMatch[1].trim(),
        note: 'Note title',
      });
    }
    const noteParagraphs = noteContent.match(/<para[^>]*>([\s\S]*?)<\/para>/g) || [];
    for (const para of noteParagraphs) {
      const paraMatch = para.match(/<para[^>]*>([\s\S]*?)<\/para>/);
      if (paraMatch) {
        const processed = processSegmentWithMath(paraMatch[1]);
        if (processed.text.trim()) {
          segments.push({
            id: 'seg-' + ++segmentId,
            type: 'note-paragraph',
            source: processed.text,
            inlineElements: processed.inlineElements,
            note: 'Note content',
          });
        }
      }
    }
  }

  // Extract examples
  const examplePattern = /<example[^>]*>([\s\S]*?)<\/example>/g;
  while ((match = examplePattern.exec(content)) !== null) {
    const exampleContent = match[1];
    const exampleTitleMatch = exampleContent.match(/<title>([^<]+)<\/title>/);
    if (exampleTitleMatch) {
      segments.push({
        id: 'seg-' + ++segmentId,
        type: 'example-title',
        source: exampleTitleMatch[1].trim(),
        note: 'Example title',
      });
    }
  }

  // Extract list items
  const listItemPattern = /<item[^>]*>([\s\S]*?)<\/item>/g;
  while ((match = listItemPattern.exec(content)) !== null) {
    const processed = processSegmentWithMath(match[1]);
    if (processed.text.trim() && processed.text.length > 2) {
      segments.push({
        id: 'seg-' + ++segmentId,
        type: 'list-item',
        source: processed.text,
        inlineElements: processed.inlineElements,
        note: 'List item',
      });
    }
  }

  // Extract figure captions
  const figurePattern = /<figure[^>]*>([\s\S]*?)<\/figure>/g;
  while ((match = figurePattern.exec(content)) !== null) {
    const captionMatch = match[1].match(/<caption>([\s\S]*?)<\/caption>/);
    if (captionMatch) {
      const processed = processSegmentWithMath(captionMatch[1]);
      if (processed.text.trim()) {
        segments.push({
          id: 'seg-' + ++segmentId,
          type: 'figure-caption',
          source: processed.text,
          inlineElements: processed.inlineElements,
          note: 'Figure caption',
        });
      }
    }
  }

  // Extract table cells
  const tableCellPattern = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  while ((match = tableCellPattern.exec(content)) !== null) {
    const cellContent = match[1].trim();
    if (cellContent && !cellContent.match(/^<media/)) {
      const processed = processSegmentWithMath(cellContent);
      if (processed.text.trim() && processed.text.length > 1) {
        segments.push({
          id: 'seg-' + ++segmentId,
          type: 'table-cell',
          source: processed.text,
          inlineElements: processed.inlineElements,
          note: 'Table cell',
        });
      }
    }
  }

  if (verbose) {
    console.error('Extracted ' + segments.length + ' segments from ' + moduleId);
    const byType = {};
    for (const seg of segments) {
      byType[seg.type] = (byType[seg.type] || 0) + 1;
    }
    console.error('Segments by type:', byType);
  }

  return { moduleId, documentTitle, segments };
}

function processSegmentWithMath(content) {
  const inlineElements = [];
  let inlineId = 0;
  let text = content;

  const mathPattern = /<m:math[^>]*>[\s\S]*?<\/m:math>/g;
  text = text.replace(mathPattern, (mathml) => {
    inlineId++;
    const latex = convertMathMLToLatex(mathml);
    inlineElements.push({
      id: inlineId,
      type: 'math',
      latex: latex,
      original: mathml,
    });
    return '[[EQ:' + inlineId + ']]';
  });

  text = text
    .replace(/<emphasis[^>]*>([^<]*)<\/emphasis>/g, '$1')
    .replace(/<link[^>]*>([^<]*)<\/link>/g, '$1')
    .replace(/<term[^>]*>([^<]*)<\/term>/g, '$1')
    .replace(/<sub>([^<]*)<\/sub>/g, '_{$1}')
    .replace(/<sup>([^<]*)<\/sup>/g, '^{$1}')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { text, inlineElements };
}

function generateXliff(data, sourceLang, targetLang) {
  const { moduleId, documentTitle, segments } = data;

  let xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${moduleId}" source-language="${sourceLang}" target-language="${targetLang}" datatype="x-cnxml">
    <header>
      <note>Generated from OpenStax CNXML: ${documentTitle}</note>
      <note>Inline elements marked with [[EQ:n]] are equations - do not translate</note>
    </header>
    <body>`;

  for (const seg of segments) {
    const sourceText = escapeXml(seg.source);

    let inlineNotes = '';
    if (seg.inlineElements && seg.inlineElements.length > 0) {
      const noteContent = seg.inlineElements
        .map((el) => '[[EQ:' + el.id + ']]: $' + el.latex + '$')
        .join(' | ');
      inlineNotes =
        '\n        <note from="developer">Equations: ' + escapeXml(noteContent) + '</note>';
    }

    const typeNote = seg.note
      ? '\n        <note from="developer">' + escapeXml(seg.note) + '</note>'
      : '';

    xliff += `
      <trans-unit id="${seg.id}" restype="${mapRestype(seg.type)}">
        <source>${sourceText}</source>
        <target state="new"></target>${typeNote}${inlineNotes}
      </trans-unit>`;
  }

  xliff += `
    </body>
  </file>
</xliff>`;

  return xliff;
}

function mapRestype(type) {
  const mapping = {
    title: 'x-title',
    'section-title': 'x-section-title',
    paragraph: 'x-paragraph',
    'note-title': 'x-note-title',
    'note-paragraph': 'x-note-paragraph',
    'example-title': 'x-example-title',
    'example-paragraph': 'x-example-paragraph',
    'list-item': 'x-list-item',
    'figure-caption': 'x-figure-caption',
    'table-cell': 'x-table-cell',
  };
  return mapping[type] || 'x-other';
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

    const data = extractSegments(cnxml, args.verbose);
    const xliff = generateXliff(data, args.sourceLang, args.targetLang);

    if (args.output) {
      fs.writeFileSync(args.output, xliff);
      console.error('XLIFF written to: ' + args.output);
      console.error('Segments: ' + data.segments.length);
    } else {
      console.log(xliff);
    }
  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
