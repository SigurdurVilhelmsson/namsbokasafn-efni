#!/usr/bin/env node

/**
 * md-to-xliff.js
 *
 * Converts markdown files to XLIFF 1.2 format for translation in Matecat.
 * Segments text at sentence boundaries for optimal TM alignment.
 * Preserves [[EQ:n]] placeholders as protected inline elements.
 *
 * Usage:
 *   node tools/md-to-xliff.js <markdown-file> [options]
 *
 * Output:
 *   - XLIFF 1.2 file with sentence-level segments
 *   - Inline formatting converted to XLIFF inline elements
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    sourceLang: 'en',
    targetLang: 'is',
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--source-lang' && args[i + 1]) result.sourceLang = args[++i];
    else if (arg === '--target-lang' && args[i + 1]) result.targetLang = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
md-to-xliff.js - Convert markdown to XLIFF for Matecat translation

Converts markdown files to XLIFF 1.2 format, segmenting at sentence
boundaries for optimal translation memory alignment. Preserves
[[EQ:n]] equation placeholders as locked inline elements.

Usage:
  node tools/md-to-xliff.js <markdown-file> [options]

Options:
  --output <file>       Output XLIFF file (default: stdout)
  --source-lang <lang>  Source language code (default: en)
  --target-lang <lang>  Target language code (default: is)
  --verbose             Show detailed progress
  -h, --help            Show this help message

Examples:
  node tools/md-to-xliff.js 02-for-mt/chapters/01/1-5.en.md --output 02-for-mt/chapters/01/1-5.en.xliff
  node tools/md-to-xliff.js input.md --verbose
`);
}

function parseMarkdown(content, verbose) {
  const lines = content.split('\n');
  let frontmatter = {};
  let bodyLines = lines;

  // Extract YAML frontmatter if present
  if (lines[0] === '---') {
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        endIndex = i;
        break;
      }
    }
    if (endIndex > 0) {
      const yamlContent = lines.slice(1, endIndex).join('\n');
      try {
        frontmatter = yaml.load(yamlContent) || {};
      } catch (e) {
        if (verbose) console.error('Warning: Failed to parse frontmatter: ' + e.message);
      }
      bodyLines = lines.slice(endIndex + 1);
    }
  }

  return { frontmatter, body: bodyLines.join('\n') };
}

function segmentText(text) {
  // Sentence boundary detection
  // Split on: . ! ? followed by space and capital letter, or end of string
  // But not on: abbreviations, decimals, etc.

  const segments = [];
  let current = '';

  // Common abbreviations to not split on
  const abbreviations = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'e.g.', 'i.e.', 'etc.', 'vs.', 'Fig.', 'fig.', 'eq.', 'Eq.'];

  // Replace abbreviations temporarily
  let processed = text;
  const abbrevPlaceholders = {};
  abbreviations.forEach((abbr, idx) => {
    const placeholder = `__ABBR${idx}__`;
    abbrevPlaceholders[placeholder] = abbr;
    processed = processed.split(abbr).join(placeholder);
  });

  // Don't split on decimal numbers (e.g., 3.14)
  processed = processed.replace(/(\d)\.(\d)/g, '$1__DECIMAL__$2');

  // Split on sentence boundaries
  const parts = processed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÝÞÆÖ])/);

  for (const part of parts) {
    let restored = part;
    // Restore abbreviations
    for (const [placeholder, abbr] of Object.entries(abbrevPlaceholders)) {
      restored = restored.split(placeholder).join(abbr);
    }
    // Restore decimals
    restored = restored.replace(/__DECIMAL__/g, '.');
    if (restored.trim()) {
      segments.push(restored.trim());
    }
  }

  return segments;
}

function extractSegments(body, verbose) {
  const segments = [];
  let segmentId = 0;
  const lines = body.split('\n');

  let currentParagraph = [];
  let currentType = 'paragraph';
  let inDirective = false;
  let directiveType = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle directive blocks
    if (trimmed.startsWith('::: ')) {
      if (currentParagraph.length > 0) {
        flushParagraph();
      }
      inDirective = true;
      directiveType = trimmed.replace('::: ', '');
      continue;
    }

    if (trimmed === ':::') {
      if (currentParagraph.length > 0) {
        flushParagraph();
      }
      inDirective = false;
      directiveType = null;
      continue;
    }

    // Handle headings
    if (trimmed.startsWith('#')) {
      if (currentParagraph.length > 0) {
        flushParagraph();
      }

      const match = trimmed.match(/^(#+)\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const type = level === 1 ? 'title' : level === 2 ? 'section-title' : 'subsection-title';

        segmentId++;
        segments.push({
          id: 'seg-' + segmentId,
          type: inDirective ? directiveType + '-' + type : type,
          source: text,
          note: 'Heading level ' + level
        });
      }
      continue;
    }

    // Handle list items
    if (trimmed.startsWith('- ') || trimmed.match(/^\d+\.\s/)) {
      if (currentParagraph.length > 0 && currentType !== 'list-item') {
        flushParagraph();
      }

      const itemText = trimmed.replace(/^[-\d.]+\s+/, '');
      const sentences = segmentText(itemText);

      for (const sentence of sentences) {
        segmentId++;
        segments.push({
          id: 'seg-' + segmentId,
          type: inDirective ? directiveType + '-list-item' : 'list-item',
          source: sentence,
          note: 'List item'
        });
      }
      continue;
    }

    // Handle figure captions (italic lines starting with *Figure:)
    if (trimmed.startsWith('*Figure:') && trimmed.endsWith('*')) {
      if (currentParagraph.length > 0) {
        flushParagraph();
      }

      const captionText = trimmed.slice(8, -1).trim();
      segmentId++;
      segments.push({
        id: 'seg-' + segmentId,
        type: 'figure-caption',
        source: captionText,
        note: 'Figure caption'
      });
      continue;
    }

    // Empty line ends paragraph
    if (trimmed === '') {
      if (currentParagraph.length > 0) {
        flushParagraph();
      }
      continue;
    }

    // Regular text - accumulate
    currentParagraph.push(trimmed);
    currentType = inDirective ? directiveType + '-paragraph' : 'paragraph';
  }

  // Flush any remaining paragraph
  if (currentParagraph.length > 0) {
    flushParagraph();
  }

  function flushParagraph() {
    const text = currentParagraph.join(' ');
    const sentences = segmentText(text);

    for (const sentence of sentences) {
      segmentId++;
      segments.push({
        id: 'seg-' + segmentId,
        type: currentType,
        source: sentence,
        note: currentType.includes('note') ? 'Note content' :
              currentType.includes('example') ? 'Example content' : null
      });
    }

    currentParagraph = [];
    currentType = 'paragraph';
  }

  if (verbose) {
    console.error('Extracted ' + segments.length + ' segments');
    const byType = {};
    for (const seg of segments) {
      byType[seg.type] = (byType[seg.type] || 0) + 1;
    }
    console.error('Segments by type:', byType);
  }

  return segments;
}

function convertInlineToXliff(text) {
  let result = text;
  let inlineId = 0;

  // Convert [[EQ:n]] to locked inline elements
  result = result.replace(/\[\[EQ:(\d+)\]\]/g, (match, num) => {
    inlineId++;
    return `<x id="${inlineId}" equiv-text="${escapeXml(match)}" ctype="x-equation"/>`;
  });

  // Convert **bold** to inline elements
  result = result.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="x-bold">${escapeXml(content)}</g>`;
  });

  // Convert *italic* to inline elements (but not if already in figure caption)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (match, content) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="x-italic">${escapeXml(content)}</g>`;
  });

  // Convert [text](url) links to inline elements
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="x-link" xlink:href="${escapeXml(url)}">${escapeXml(text)}</g>`;
  });

  // Convert ~subscript~ to inline elements
  result = result.replace(/~([^~]+)~/g, (match, content) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="x-sub">${escapeXml(content)}</g>`;
  });

  // Convert ^superscript^ to inline elements
  result = result.replace(/\^([^^]+)\^/g, (match, content) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="x-sup">${escapeXml(content)}</g>`;
  });

  // Escape any remaining text that isn't already in tags
  // This is tricky - we need to escape text between tags
  // For now, escape text that hasn't been processed
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/<(?!\/?(x|g)\s|\/?(x|g)>)/g, '&lt;');

  return result;
}

function generateXliff(segments, frontmatter, sourceLang, targetLang) {
  const original = frontmatter.module || frontmatter.title || 'document';
  const title = frontmatter.title || 'Untitled';
  const section = frontmatter.section || '';

  let xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${escapeXml(original)}" source-language="${sourceLang}" target-language="${targetLang}" datatype="x-markdown">
    <header>
      <note>Converted from markdown: ${escapeXml(title)}</note>
      <note>Section: ${escapeXml(section)}</note>
      <note>Inline elements marked with [[EQ:n]] are equation placeholders - do not translate</note>
    </header>
    <body>`;

  for (const seg of segments) {
    const sourceText = convertInlineToXliff(seg.source);
    const noteEl = seg.note ? `\n        <note from="developer">${escapeXml(seg.note)}</note>` : '';

    xliff += `
      <trans-unit id="${seg.id}" restype="${mapRestype(seg.type)}">
        <source>${sourceText}</source>
        <target state="new"></target>${noteEl}
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
    'title': 'x-title',
    'section-title': 'x-section-title',
    'subsection-title': 'x-subsection-title',
    'paragraph': 'x-paragraph',
    'list-item': 'x-list-item',
    'figure-caption': 'x-figure-caption',
    'note-title': 'x-note-title',
    'note-paragraph': 'x-note-paragraph',
    'note-subsection-title': 'x-note-subsection-title',
    'note-list-item': 'x-note-list-item',
    'example-title': 'x-example-title',
    'example-paragraph': 'x-example-paragraph',
    'example-subsection-title': 'x-example-subsection-title',
    'example-list-item': 'x-example-list-item',
  };
  return mapping[type] || 'x-other';
}

function escapeXml(text) {
  if (!text) return '';
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

  if (!args.input) {
    console.error('Error: Please provide a markdown file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(args.input)) {
      throw new Error('File not found: ' + args.input);
    }

    const content = fs.readFileSync(args.input, 'utf-8');
    if (args.verbose) console.error('Read ' + content.length + ' bytes from ' + args.input);

    const { frontmatter, body } = parseMarkdown(content, args.verbose);
    if (args.verbose) {
      console.error('Frontmatter:', frontmatter);
    }

    const segments = extractSegments(body, args.verbose);
    const xliff = generateXliff(segments, frontmatter, args.sourceLang, args.targetLang);

    if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, xliff);
      console.error('XLIFF written to: ' + args.output);
      console.error('Total segments: ' + segments.length);
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
