#!/usr/bin/env node

/**
 * xliff-to-md.js
 *
 * Converts translated XLIFF files to Chemistry Reader markdown format.
 * Replaces equation placeholders with actual LaTeX and structures the content.
 *
 * Usage:
 *   node tools/xliff-to-md.js <xliff-file> [options]
 */

const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    section: null,
    title: null,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--section' && args[i + 1]) result.section = args[++i];
    else if (arg === '--title' && args[i + 1]) result.title = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
xliff-to-md.js - Convert translated XLIFF to Chemistry Reader markdown

Usage:
  node tools/xliff-to-md.js <xliff-file> [options]

Options:
  --output <file>    Output markdown file (default: stdout)
  --section <num>    Section number (e.g., "1.5") for header
  --title <text>     Override document title
  --verbose          Show detailed progress
  -h, --help         Show this help message
`);
}

function parseXliff(xliffContent, verbose) {
  const units = [];

  const fileMatch = xliffContent.match(/<file[^>]+original="([^"]+)"[^]*>/);
  const moduleId = fileMatch ? fileMatch[1] : 'unknown';

  const headerNoteMatch = xliffContent.match(/<header>[\s\S]*?<note>Generated from OpenStax CNXML: ([^<]+)<\/note>/);
  const documentTitle = headerNoteMatch ? headerNoteMatch[1] : 'Untitled';

  const unitPattern = /<trans-unit[^>]+id="([^"]+)"[^>]+restype="([^"]+)">([\s\S]*?)<\/trans-unit>/g;
  let match;

  while ((match = unitPattern.exec(xliffContent)) !== null) {
    const id = match[1];
    const restype = match[2];
    const content = match[3];

    const sourceMatch = content.match(/<source>([\s\S]*?)<\/source>/);
    const source = sourceMatch ? unescapeXml(sourceMatch[1]) : '';

    const targetMatch = content.match(/<target[^>]*>([\s\S]*?)<\/target>/);
    const target = targetMatch ? unescapeXml(targetMatch[1]) : '';

    const equationsMatch = content.match(/<note from="developer">Equations: ([^<]+)<\/note>/);
    const equations = [];

    if (equationsMatch) {
      const equationParts = equationsMatch[1].split(' | ');
      for (const part of equationParts) {
        const eqMatch = part.match(/\[\[EQ:(\d+)\]\]: \$([^$]+)\$/);
        if (eqMatch) {
          equations.push({
            id: parseInt(eqMatch[1]),
            latex: eqMatch[2]
          });
        }
      }
    }

    units.push({
      id,
      type: restype.replace('x-', ''),
      source,
      target: target || source,
      equations
    });
  }

  if (verbose) {
    console.error('Parsed ' + units.length + ' translation units from ' + moduleId);
    const translated = units.filter(u => u.target && u.target !== u.source).length;
    console.error('Translated: ' + translated + ' / ' + units.length);
  }

  return { moduleId, documentTitle, units };
}

function applyEquations(text, equations) {
  let result = text;
  for (const eq of equations) {
    const placeholder = '[[EQ:' + eq.id + ']]';
    const latex = '$' + eq.latex + '$';
    result = result.replace(placeholder, latex);
  }
  return result;
}

function generateMarkdown(data, options) {
  const { moduleId, documentTitle, units } = data;
  const lines = [];

  const title = options.title || documentTitle;
  const section = options.section || '';

  lines.push('---');
  lines.push('title: "' + title + '"');
  if (section) lines.push('section: "' + section + '"');
  lines.push('original_module: "' + moduleId + '"');
  lines.push('---');
  lines.push('');

  let inNote = false;
  let inExample = false;
  let listItems = [];

  for (const unit of units) {
    const text = applyEquations(unit.target, unit.equations);

    switch (unit.type) {
      case 'title':
        lines.push('# ' + text);
        lines.push('');
        break;

      case 'section-title':
        if (listItems.length > 0) {
          for (const item of listItems) lines.push('- ' + item);
          lines.push('');
          listItems = [];
        }
        if (inNote) { lines.push(':::'); lines.push(''); inNote = false; }
        if (inExample) { lines.push(':::'); lines.push(''); inExample = false; }
        lines.push('## ' + text);
        lines.push('');
        break;

      case 'paragraph':
        if (listItems.length > 0) {
          for (const item of listItems) lines.push('- ' + item);
          lines.push('');
          listItems = [];
        }
        lines.push(text);
        lines.push('');
        break;

      case 'note-title':
        if (listItems.length > 0) {
          for (const item of listItems) lines.push('- ' + item);
          lines.push('');
          listItems = [];
        }
        if (inExample) { lines.push(':::'); lines.push(''); inExample = false; }
        inNote = true;
        lines.push('::: note');
        lines.push('### ' + text);
        lines.push('');
        break;

      case 'note-paragraph':
        lines.push(text);
        lines.push('');
        break;

      case 'example-title':
        if (listItems.length > 0) {
          for (const item of listItems) lines.push('- ' + item);
          lines.push('');
          listItems = [];
        }
        if (inNote) { lines.push(':::'); lines.push(''); inNote = false; }
        inExample = true;
        lines.push('::: example');
        lines.push('### ' + text);
        lines.push('');
        break;

      case 'example-paragraph':
        lines.push(text);
        lines.push('');
        break;

      case 'list-item':
        listItems.push(text);
        break;

      case 'figure-caption':
        if (listItems.length > 0) {
          for (const item of listItems) lines.push('- ' + item);
          lines.push('');
          listItems = [];
        }
        lines.push('*' + text + '*');
        lines.push('');
        break;

      case 'table-cell':
        lines.push(text);
        lines.push('');
        break;

      default:
        lines.push(text);
        lines.push('');
    }
  }

  if (listItems.length > 0) {
    for (const item of listItems) lines.push('- ' + item);
    lines.push('');
  }
  if (inNote) lines.push(':::');
  if (inExample) lines.push(':::');

  return lines.join('\n');
}

function unescapeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide an XLIFF file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(args.input)) {
      throw new Error('File not found: ' + args.input);
    }

    const xliffContent = fs.readFileSync(args.input, 'utf-8');
    if (args.verbose) console.error('Read ' + xliffContent.length + ' bytes from ' + args.input);

    const data = parseXliff(xliffContent, args.verbose);
    const markdown = generateMarkdown(data, {
      title: args.title,
      section: args.section
    });

    if (args.output) {
      fs.writeFileSync(args.output, markdown);
      console.error('Markdown written to: ' + args.output);
    } else {
      console.log(markdown);
    }

  } catch (err) {
    console.error('Error: ' + err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
