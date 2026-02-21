#!/usr/bin/env node

/**
 * join-mt-output.js
 *
 * Joins MT output segments from 02-mt-output into complete markdown modules
 * in 03-machine-translation.
 *
 * Usage:
 *   node tools/join-mt-output.js --chapter <num> [--verbose]
 */

import fs from 'fs';
import path from 'path';

let BOOKS_DIR = 'books/efnafraedi';

function parseArgs(args) {
  const result = {
    chapter: null,
    book: 'efnafraedi',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
  }

  return result;
}

function printHelp() {
  console.log(`
Join MT output segments into markdown modules

Usage:
  node tools/join-mt-output.js --chapter <num> [--verbose]

Options:
  --chapter <num>  Chapter number to process
  --verbose        Show detailed processing information
  -h, --help       Show this help

Examples:
  node tools/join-mt-output.js --chapter 12
  node tools/join-mt-output.js --chapter 1 --verbose

Description:
  Takes segment files from 02-mt-output/ch{NN}/
  Joins them using structure from 02-structure/ch{NN}/
  Outputs complete markdown modules to 03-machine-translation/ch{NN}/
`);
}

/**
 * Parse segment file into a map of segment ID -> text
 */
function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->\s*([\s\S]*?)(?=<!-- SEG:|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const id = match[1];
    const text = match[2].trim();
    segments.set(id, text);
  }

  return segments;
}

/**
 * Get segment text by ID, with fallback message
 */
function getSegment(segments, segmentId, verbose) {
  if (!segmentId) return '';

  const text = segments.get(segmentId);
  if (!text) {
    if (verbose) {
      console.warn(`  Warning: Missing segment: ${segmentId}`);
    }
    return `[MISSING: ${segmentId}]`;
  }
  return text;
}

/**
 * Build markdown content from structure
 */
function buildMarkdown(structure, segments, verbose) {
  const lines = [];

  // Add title as h1
  if (structure.title && structure.title.segmentId) {
    const titleText = getSegment(segments, structure.title.segmentId, verbose);
    lines.push(`# ${titleText}`);
    lines.push('');
  }

  // Add abstract/learning objectives if present
  if (structure.abstract && structure.abstract.items && structure.abstract.items.length > 0) {
    lines.push('## Námsmarkmið');
    lines.push('');
    lines.push('Í lok þessa kafla geturðu:');
    lines.push('');
    for (const item of structure.abstract.items) {
      const itemText = getSegment(segments, item.segmentId, verbose);
      lines.push(`- ${itemText}`);
    }
    lines.push('');
  }

  // Process content elements
  if (structure.content && Array.isArray(structure.content)) {
    for (const element of structure.content) {
      const elementMd = buildElement(element, segments, 2, verbose);
      if (elementMd) {
        lines.push(elementMd);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build markdown for a single content element
 */
function buildElement(element, segments, headingLevel, verbose) {
  const lines = [];

  switch (element.type) {
    case 'para':
      if (element.segmentId) {
        const text = getSegment(segments, element.segmentId, verbose);
        lines.push(text);
      }
      break;

    case 'section': {
      // Section with title and nested content
      if (element.title && element.title.segmentId) {
        const titleText = getSegment(segments, element.title.segmentId, verbose);
        const heading = '#'.repeat(headingLevel);
        lines.push(`${heading} ${titleText}`);
        lines.push('');
      }

      if (element.content && Array.isArray(element.content)) {
        for (const child of element.content) {
          const childMd = buildElement(child, segments, headingLevel + 1, verbose);
          if (childMd) {
            lines.push(childMd);
            lines.push('');
          }
        }
      }
      break;
    }

    case 'figure': {
      // Figure with caption
      lines.push('---');
      lines.push('**Mynd:**');
      if (element.caption && element.caption.segmentId) {
        const caption = getSegment(segments, element.caption.segmentId, verbose);
        lines.push(caption);
      }
      if (element.media && element.media.src) {
        lines.push(`![${element.media.alt || ''}](${element.media.src})`);
      }
      lines.push('---');
      break;
    }

    case 'example': {
      // Example with title and content
      lines.push('---');
      lines.push('**Dæmi:**');
      if (element.title && element.title.segmentId) {
        const titleText = getSegment(segments, element.title.segmentId, verbose);
        lines.push(`**${titleText}**`);
        lines.push('');
      }
      if (element.content && Array.isArray(element.content)) {
        for (const child of element.content) {
          const childMd = buildElement(child, segments, headingLevel, verbose);
          if (childMd) {
            lines.push(childMd);
            lines.push('');
          }
        }
      }
      lines.push('---');
      break;
    }

    case 'note': {
      // Note/callout box
      lines.push('> **Athugið:**');
      if (element.title && element.title.segmentId) {
        const titleText = getSegment(segments, element.title.segmentId, verbose);
        lines.push(`> **${titleText}**`);
        lines.push('>');
      }
      if (element.content && Array.isArray(element.content)) {
        for (const child of element.content) {
          const childMd = buildElement(child, segments, headingLevel, verbose);
          if (childMd) {
            // Prefix each line with '> ' for blockquote
            const quotedLines = childMd.split('\n').map((line) => `> ${line}`);
            lines.push(quotedLines.join('\n'));
          }
        }
      }
      break;
    }

    case 'list': {
      // List items
      if (element.items && Array.isArray(element.items)) {
        for (const item of element.items) {
          if (item.segmentId) {
            const text = getSegment(segments, item.segmentId, verbose);
            lines.push(`- ${text}`);
          }
        }
      }
      break;
    }

    case 'equation': {
      // Equation (skip for now, will be handled by MathML in rendering)
      lines.push('[EQUATION]');
      break;
    }

    case 'table': {
      // Table (skip for now, complex structure)
      lines.push('[TABLE]');
      break;
    }

    case 'exercise': {
      // Exercise (skip for now, complex structure with problem/solution)
      lines.push('[EXERCISE]');
      break;
    }

    case 'media': {
      // Standalone media element
      if (element.media && element.media.src) {
        lines.push(`![${element.media.alt || ''}](${element.media.src})`);
      }
      break;
    }

    default:
      if (verbose) {
        console.warn(`  Warning: Unknown element type: ${element.type}`);
      }
  }

  return lines.join('\n');
}

/**
 * Generate frontmatter for the markdown file
 */
function generateFrontmatter(structure, chapter) {
  const frontmatter = {
    moduleId: structure.moduleId,
    title: structure.title ? structure.title.text : 'Untitled',
    chapter,
    documentClass: structure.documentClass || 'module',
    version: 'machine-translation',
    generatedDate: new Date().toISOString().split('T')[0],
  };

  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'string') {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Process a single chapter
 */
function processChapter(chapter, verbose) {
  const chapterStr = String(chapter).padStart(2, '0');

  // Input directories
  const mtOutputDir = path.join(BOOKS_DIR, '02-mt-output', `ch${chapterStr}`);
  const structureDir = path.join(BOOKS_DIR, '02-structure', `ch${chapterStr}`);

  // Output directory
  const outputDir = path.join(BOOKS_DIR, '03-machine-translation', `ch${chapterStr}`);

  // Check input directories exist
  if (!fs.existsSync(mtOutputDir)) {
    console.error(`Error: MT output directory not found: ${mtOutputDir}`);
    return;
  }

  if (!fs.existsSync(structureDir)) {
    console.error(`Error: Structure directory not found: ${structureDir}`);
    return;
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Find all segment files
  const segmentFiles = fs.readdirSync(mtOutputDir).filter((f) => f.endsWith('-segments.is.md'));

  console.log(`Processing chapter ${chapter}: ${segmentFiles.length} modules`);

  for (const segmentFile of segmentFiles) {
    const moduleId = segmentFile.replace('-segments.is.md', '');

    if (verbose) {
      console.log(`\nProcessing: ${moduleId}`);
    }

    // Read segment file
    const segmentPath = path.join(mtOutputDir, segmentFile);
    const segmentContent = fs.readFileSync(segmentPath, 'utf-8');
    const segments = parseSegments(segmentContent);

    if (verbose) {
      console.log(`  Segments: ${segments.size}`);
    }

    // Read structure file
    const structurePath = path.join(structureDir, `${moduleId}-structure.json`);
    if (!fs.existsSync(structurePath)) {
      console.warn(`  Warning: Structure file not found: ${structurePath}`);
      console.warn(`  Skipping ${moduleId}`);
      continue;
    }

    const structure = JSON.parse(fs.readFileSync(structurePath, 'utf-8'));

    // Build markdown
    const frontmatter = generateFrontmatter(structure, chapter);
    const content = buildMarkdown(structure, segments, verbose);
    const markdown = frontmatter + content;

    // Write output
    const outputPath = path.join(outputDir, `${moduleId}.md`);
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`  ✓ ${moduleId}.md`);
  }

  console.log(`\nComplete! Files written to: ${outputDir}`);
}

// Main
const args = parseArgs(process.argv.slice(2));
BOOKS_DIR = `books/${args.book}`;

if (args.help || !args.chapter) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

try {
  processChapter(args.chapter, args.verbose);
} catch (err) {
  console.error('Error:', err.message);
  if (args.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
}
