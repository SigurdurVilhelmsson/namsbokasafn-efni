#!/usr/bin/env node

/**
 * create-bilingual-xliff.js
 *
 * Creates bilingual XLIFF from aligned EN source and IS translation markdown.
 * Segments both files and aligns them for Matecat review.
 *
 * Usage:
 *   node tools/create-bilingual-xliff.js --source <en.md> --target <is.md> --output <xliff>
 */

import fs from 'fs';
import path from 'path';

function parseArgs(args) {
  const result = {
    source: null,
    target: null,
    output: null,
    sourceLang: 'en',
    targetLang: 'is',
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose' || arg === '-v') result.verbose = true;
    else if (arg === '--source' && args[i + 1]) result.source = args[++i];
    else if (arg === '--target' && args[i + 1]) result.target = args[++i];
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--source-lang' && args[i + 1]) result.sourceLang = args[++i];
    else if (arg === '--target-lang' && args[i + 1]) result.targetLang = args[++i];
  }
  return result;
}

function printHelp() {
  console.log(`
create-bilingual-xliff.js - Create bilingual XLIFF from EN/IS markdown pair

Aligns segments from source (EN) and target (IS) markdown files to create
a bilingual XLIFF suitable for review in Matecat.

Usage:
  node tools/create-bilingual-xliff.js --source <en.md> --target <is.md> --output <xliff>

Options:
  --source <file>       Source (English) markdown file
  --target <file>       Target (Icelandic) markdown file
  --output <file>       Output XLIFF file
  --source-lang <lang>  Source language code (default: en)
  --target-lang <lang>  Target language code (default: is)
  --verbose, -v         Show detailed progress
  -h, --help            Show this help message

Example:
  node tools/create-bilingual-xliff.js \\
    --source books/efnafraedi/02-for-mt/ch05/5-1.en.md \\
    --target books/efnafraedi/03-faithful/ch05/5-1.is.md \\
    --output books/efnafraedi/03-faithful/xliff/ch05/5-1.xliff
`);
}

/**
 * Parse markdown frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) frontmatter[m[1]] = m[2];
  }

  return {
    frontmatter,
    body: content.substring(match[0].length).trim()
  };
}

/**
 * Remove Erlendur-style headers
 */
function removeErlendurHeader(content) {
  return content.replace(/^##\s*titill:.*?\n\n/, '').trim();
}

/**
 * Extract segments from markdown body
 */
function extractSegments(body) {
  const segments = [];
  const lines = body.split('\n');
  let currentPara = [];
  let inDirective = false;
  let directiveType = null;

  function flushPara(type = 'paragraph') {
    if (currentPara.length > 0) {
      const text = currentPara.join(' ').trim();
      if (text) {
        segments.push({ type, text });
      }
      currentPara = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Directive start
    if (trimmed.startsWith('::: ')) {
      flushPara();
      inDirective = true;
      directiveType = trimmed.replace('::: ', '');
      continue;
    }

    // Directive end
    if (trimmed === ':::') {
      flushPara(directiveType ? directiveType + '-content' : 'paragraph');
      inDirective = false;
      directiveType = null;
      continue;
    }

    // Headings
    if (trimmed.startsWith('#')) {
      flushPara();
      const match = trimmed.match(/^(#+)\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const type = level === 1 ? 'title' : level === 2 ? 'section' : 'subsection';
        segments.push({ type, text: match[2] });
      }
      continue;
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.match(/^\d+\.\s/)) {
      flushPara();
      const itemText = trimmed.replace(/^[-\d.]+\s+/, '');
      segments.push({ type: 'list-item', text: itemText });
      continue;
    }

    // Figure captions
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 2) {
      flushPara();
      segments.push({ type: 'caption', text: trimmed.slice(1, -1) });
      continue;
    }

    // Empty line ends paragraph
    if (trimmed === '') {
      flushPara(inDirective && directiveType ? directiveType + '-content' : 'paragraph');
      continue;
    }

    // Regular text
    currentPara.push(trimmed);
  }

  flushPara();
  return segments;
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate bilingual XLIFF
 */
function generateXliff(sourceSegs, targetSegs, metadata, sourceLang, targetLang) {
  const original = metadata.module || metadata.section || 'document';

  let xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${escapeXml(original)}" source-language="${sourceLang}" target-language="${targetLang}" datatype="x-markdown">
    <header>
      <note>Bilingual XLIFF for Matecat review</note>
      <note>Section: ${escapeXml(metadata.section || '')}</note>
      <note>Title: ${escapeXml(metadata.title || '')}</note>
    </header>
    <body>`;

  const maxSegs = Math.max(sourceSegs.length, targetSegs.length);

  for (let i = 0; i < maxSegs; i++) {
    const src = sourceSegs[i];
    const tgt = targetSegs[i];

    const sourceText = src ? escapeXml(src.text) : '';
    const targetText = tgt ? escapeXml(tgt.text) : '';
    const segType = src?.type || tgt?.type || 'paragraph';
    const state = targetText ? 'translated' : 'new';

    xliff += `
      <trans-unit id="seg-${i + 1}" restype="x-${segType}">
        <source>${sourceText}</source>
        <target state="${state}">${targetText}</target>
      </trans-unit>`;
  }

  xliff += `
    </body>
  </file>
</xliff>`;

  return xliff;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.source || !args.target) {
    console.error('Error: Please provide both --source and --target files');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    // Read source file
    const sourceContent = fs.readFileSync(args.source, 'utf-8');
    let sourceBody = parseFrontmatter(sourceContent).body;
    sourceBody = removeErlendurHeader(sourceBody);

    // Read target file
    const targetContent = fs.readFileSync(args.target, 'utf-8');
    const { frontmatter, body: targetBodyRaw } = parseFrontmatter(targetContent);
    const targetBody = removeErlendurHeader(targetBodyRaw);

    if (args.verbose) {
      console.error(`Source: ${args.source} (${sourceContent.length} chars)`);
      console.error(`Target: ${args.target} (${targetContent.length} chars)`);
    }

    // Extract segments
    const sourceSegs = extractSegments(sourceBody);
    const targetSegs = extractSegments(targetBody);

    if (args.verbose) {
      console.error(`Source segments: ${sourceSegs.length}`);
      console.error(`Target segments: ${targetSegs.length}`);
      if (sourceSegs.length !== targetSegs.length) {
        console.error(`WARNING: Segment count mismatch!`);
      }
    }

    // Generate XLIFF
    const xliff = generateXliff(sourceSegs, targetSegs, frontmatter, args.sourceLang, args.targetLang);

    // Output
    if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, xliff);
      console.error(`XLIFF written to: ${args.output}`);
      console.error(`Aligned segments: ${Math.min(sourceSegs.length, targetSegs.length)}`);
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
