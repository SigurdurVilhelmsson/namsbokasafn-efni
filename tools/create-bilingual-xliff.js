#!/usr/bin/env node

/**
 * @deprecated This tool is deprecated. Use Matecat Align instead.
 * See docs/workflow/simplified-workflow.md for the new 5-step workflow.
 *
 * create-bilingual-xliff.js
 *
 * Creates bilingual XLIFF from aligned EN source and IS translation markdown.
 * Uses sentence-level segmentation consistent with md-to-xliff.js for optimal
 * TM building and Matecat review.
 *
 * Segmentation spec (from md-to-xliff.js):
 * - Split on sentence boundaries: . ! ? followed by space + capital letter
 * - Preserve abbreviations: Mr., Dr., e.g., i.e., etc., vs., Fig., eq.
 * - Protect decimals: 3.14 doesn't split
 * - Support Icelandic capitals: ÁÉÍÓÚÝÞÆÖ
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
    help: false,
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

Uses sentence-level segmentation (same as md-to-xliff.js) for optimal
TM building and CAT tool compatibility.

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
 * Parse markdown frontmatter (YAML or Erlendur format)
 */
function parseFrontmatter(content) {
  // Try YAML frontmatter first
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const frontmatter = {};
    const lines = yamlMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
      if (m) frontmatter[m[1]] = m[2];
    }
    return {
      frontmatter,
      body: content.substring(yamlMatch[0].length).trim(),
    };
  }

  // Try Erlendur header format (English)
  const erlendurMatchEn = content.match(
    /^##\s*title:\s*"([^"]+)"\s*chapter:\s*"([^"]+)"\s*module:\s*"([^"]+)"\s*language:\s*"([^"]+)".*?\n\n/
  );
  if (erlendurMatchEn) {
    return {
      frontmatter: {
        title: erlendurMatchEn[1],
        section: erlendurMatchEn[2],
        module: erlendurMatchEn[3],
        lang: erlendurMatchEn[4],
      },
      body: content.substring(erlendurMatchEn[0].length).trim(),
    };
  }

  // Try Erlendur header format (legacy Icelandic)
  const erlendurMatch = content.match(
    /^##\s*titill:\s*„([^"]+)"\s*kafli:\s*„([^"]+)"\s*eining:\s*„([^"]+)"\s*tungumál:\s*„([^"]+)".*?\n\n/
  );
  if (erlendurMatch) {
    return {
      frontmatter: {
        title: erlendurMatch[1],
        section: erlendurMatch[2],
        module: erlendurMatch[3],
        lang: erlendurMatch[4],
      },
      body: content.substring(erlendurMatch[0].length).trim(),
    };
  }

  return { frontmatter: {}, body: content };
}

/**
 * Segment text at sentence boundaries
 * Matches spec from md-to-xliff.js lines 96-136
 */
function segmentText(text) {
  if (!text || !text.trim()) return [];

  // Common abbreviations to not split on
  const abbreviations = [
    'Mr.',
    'Mrs.',
    'Ms.',
    'Dr.',
    'Prof.',
    'e.g.',
    'i.e.',
    'etc.',
    'vs.',
    'Fig.',
    'fig.',
    'eq.',
    'Eq.',
  ];

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

  // Split on sentence boundaries: . ! ? followed by space and capital letter
  // Includes Icelandic capitals: ÁÉÍÓÚÝÞÆÖ
  // Also handles parenthetical labels like "(b) If..." or "(a) Water..."
  const parts = processed.split(/(?<=[.!?])\s+(?=(?:\([a-z]\)\s+)?[A-ZÁÉÍÓÚÝÞÆÖ])/);

  const segments = [];
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

/**
 * Extract segments from markdown body with sentence-level granularity
 * Matches spec from md-to-xliff.js extractSegments()
 */
function extractSegments(body, verbose) {
  const segments = [];
  const lines = body.split('\n');

  let currentParagraph = [];
  let currentType = 'paragraph';
  let inDirective = false;
  let directiveType = null;

  function flushParagraph() {
    if (currentParagraph.length === 0) return;

    const text = currentParagraph.join(' ');
    const sentences = segmentText(text);

    for (const sentence of sentences) {
      segments.push({
        type: currentType,
        text: sentence,
        note: currentType.includes('note')
          ? 'Note content'
          : currentType.includes('example')
            ? 'Example content'
            : null,
      });
    }

    currentParagraph = [];
    currentType = inDirective && directiveType ? directiveType + '-paragraph' : 'paragraph';
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle directive blocks
    if (trimmed.startsWith('::: ')) {
      flushParagraph();
      inDirective = true;
      directiveType = trimmed.replace('::: ', '');
      continue;
    }

    if (trimmed === ':::') {
      flushParagraph();
      inDirective = false;
      directiveType = null;
      continue;
    }

    // Handle headings
    if (trimmed.startsWith('#')) {
      flushParagraph();

      const match = trimmed.match(/^(#+)\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const type = level === 1 ? 'title' : level === 2 ? 'section-title' : 'subsection-title';

        segments.push({
          type: inDirective ? directiveType + '-' + type : type,
          text: text,
          note: 'Heading level ' + level,
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
        segments.push({
          type: inDirective ? directiveType + '-list-item' : 'list-item',
          text: sentence,
          note: 'List item',
        });
      }
      continue;
    }

    // Handle figure captions (*Figure: text* or just *italic caption*)
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 2) {
      flushParagraph();

      let captionText = trimmed.slice(1, -1);
      if (captionText.startsWith('Figure:')) {
        captionText = captionText.slice(7).trim();
      } else if (captionText.startsWith('Mynd:')) {
        captionText = captionText.slice(5).trim();
      }

      // Apply sentence segmentation to figure captions
      const sentences = segmentText(captionText);
      for (const sentence of sentences) {
        segments.push({
          type: 'figure-caption',
          text: sentence,
          note: 'Figure caption',
        });
      }
      continue;
    }

    // Empty line ends paragraph
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    // Regular text - accumulate
    currentParagraph.push(trimmed);
    currentType = inDirective && directiveType ? directiveType + '-paragraph' : 'paragraph';
  }

  // Flush remaining
  flushParagraph();

  if (verbose) {
    console.error(`Extracted ${segments.length} segments`);
    const byType = {};
    for (const seg of segments) {
      byType[seg.type] = (byType[seg.type] || 0) + 1;
    }
    console.error('Segments by type:', byType);
  }

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
 * Convert inline markdown to XLIFF inline elements
 * Matches spec from md-to-xliff.js convertInlineToXliff()
 */
function convertInlineToXliff(text) {
  let result = text;
  let inlineId = 0;

  // Convert [[EQ:n]] to locked inline elements
  result = result.replace(/\[\[EQ:(\d+)\]\]/g, (match, _num) => {
    inlineId++;
    return `<x id="${inlineId}" equiv-text="${escapeXml(match)}" ctype="x-equation"/>`;
  });

  // Convert $..$ math to inline elements (already restored equations)
  result = result.replace(/\$([^$]+)\$/g, (match, _content) => {
    inlineId++;
    return `<x id="${inlineId}" equiv-text="${escapeXml(match)}" ctype="x-math"/>`;
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
  // Store URL in equiv-text for Matecat compatibility (xlink:href not universally supported)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, _url) => {
    inlineId++;
    return `<g id="${inlineId}" ctype="link" equiv-text="${escapeXml(match)}">${escapeXml(text)}</g>`;
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

  // Escape remaining XML special chars (that aren't already in tags)
  result = result.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  result = result.replace(/<(?!\/?(x|g)\s|\/?(x|g)>)/g, '&lt;');

  return result;
}

/**
 * Map segment type to XLIFF restype
 * Matches spec from md-to-xliff.js mapRestype()
 */
// eslint-disable-next-line no-unused-vars
function mapRestype(type) {
  const mapping = {
    title: 'x-title',
    'section-title': 'x-section-title',
    'subsection-title': 'x-subsection-title',
    paragraph: 'x-paragraph',
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
  return mapping[type] || 'x-' + type;
}

/**
 * Generate bilingual XLIFF 1.2
 */
function generateXliff(sourceSegs, targetSegs, metadata, sourceLang, targetLang, verbose) {
  const original = metadata.module || metadata.section || 'document';

  let xliff = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${escapeXml(original)}" source-language="${sourceLang}" target-language="${targetLang}" datatype="plaintext">
    <header>
      <note>Bilingual XLIFF for Matecat review</note>
      <note>Section: ${escapeXml(metadata.section || '')}</note>
      <note>Title: ${escapeXml(metadata.title || '')}</note>
    </header>
    <body>`;

  const maxSegs = Math.max(sourceSegs.length, targetSegs.length);
  let alignedCount = 0;
  let mismatchCount = 0;

  for (let i = 0; i < maxSegs; i++) {
    const src = sourceSegs[i];
    const tgt = targetSegs[i];

    const sourceText = src ? convertInlineToXliff(src.text) : '';
    const targetText = tgt ? convertInlineToXliff(tgt.text) : '';
    const segType = src?.type || tgt?.type || 'paragraph';
    const state = targetText ? 'translated' : 'new';
    // Store segment type in note for reference (removed custom restype for Matecat compatibility)
    const typeNote = `<note from="tool">type:${segType}</note>`;
    const devNote = src?.note
      ? `\n        <note from="developer">${escapeXml(src.note)}</note>`
      : '';

    if (src && tgt) alignedCount++;
    else mismatchCount++;

    xliff += `
      <trans-unit id="seg-${i + 1}">
        <source>${sourceText}</source>
        <target state="${state}">${targetText}</target>
        ${typeNote}${devNote}
      </trans-unit>`;
  }

  xliff += `
    </body>
  </file>
</xliff>`;

  if (verbose) {
    console.error(`Aligned segments: ${alignedCount}`);
    if (mismatchCount > 0) {
      console.error(`Unaligned segments: ${mismatchCount}`);
    }
  }

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
    const { frontmatter: srcFm, body: sourceBody } = parseFrontmatter(sourceContent);

    // Read target file
    const targetContent = fs.readFileSync(args.target, 'utf-8');
    const { frontmatter: tgtFm, body: targetBody } = parseFrontmatter(targetContent);

    // Use target frontmatter (Icelandic title) if available, fall back to source
    const metadata = { ...srcFm, ...tgtFm };

    if (args.verbose) {
      console.error(`Source: ${args.source} (${sourceContent.length} chars)`);
      console.error(`Target: ${args.target} (${targetContent.length} chars)`);
    }

    // Extract segments with sentence-level granularity
    const sourceSegs = extractSegments(sourceBody, args.verbose);
    const targetSegs = extractSegments(targetBody, args.verbose);

    if (args.verbose) {
      console.error(`Source segments: ${sourceSegs.length}`);
      console.error(`Target segments: ${targetSegs.length}`);
      if (sourceSegs.length !== targetSegs.length) {
        console.error(`WARNING: Segment count mismatch - alignment may be imperfect`);
      }
    }

    // Generate XLIFF
    const xliff = generateXliff(
      sourceSegs,
      targetSegs,
      metadata,
      args.sourceLang,
      args.targetLang,
      args.verbose
    );

    // Output
    if (args.output) {
      const outputDir = path.dirname(args.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(args.output, xliff);
      console.error(`XLIFF written to: ${args.output}`);
      console.error(`Total trans-units: ${Math.max(sourceSegs.length, targetSegs.length)}`);
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
