#!/usr/bin/env node

/**
 * fix-figure-captions.js
 *
 * Post-processes existing markdown files to wrap images with their
 * Icelandic captions into proper HTML figure elements.
 *
 * Usage:
 *   node tools/fix-figure-captions.js <file-or-directory>
 *   node tools/fix-figure-captions.js --dry-run <file-or-directory>
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Figure Caption Wrapping
// ============================================================================

/**
 * Wrap images with their Icelandic captions into HTML figure elements
 * Converts:
 *   ![alt text](./images/image.jpg)
 *
 *   Mynd 1.28 Caption text here.
 *
 * Into:
 *   <figure>
 *   <img src="./images/image.jpg" alt="alt text">
 *   <figcaption>Mynd 1.28 Caption text here.</figcaption>
 *   </figure>
 */
function wrapFiguresWithCaptions(markdown) {
  // Pattern to match: image on its own line, followed by blank line(s),
  // followed by a paragraph starting with "Mynd X.Y" (Icelandic figure caption)
  // Caption continues until we hit a blank line, heading, another image, etc.
  const figurePattern = /!\[([^\]]*)\]\(([^)]+)\)\s*\n\s*\n(Mynd\s+\d+\.\d+[^\n]+(?:\n(?!(?:\n|#|!\[|<|:::|-{3,}|\||>|\d+\.|-))[^\n]+)*)/g;

  let changeCount = 0;

  const result = markdown.replace(figurePattern, (match, altText, src, caption) => {
    changeCount++;
    // Clean up alt text and caption
    const cleanAlt = altText.trim().replace(/"/g, '&quot;');
    const cleanCaption = caption.trim();

    return `<figure>
<img src="${src}" alt="${cleanAlt}">
<figcaption>${cleanCaption}</figcaption>
</figure>`;
  });

  return { result, changeCount };
}

// ============================================================================
// File Processing
// ============================================================================

function processFile(filePath, dryRun) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { result, changeCount } = wrapFiguresWithCaptions(content);

  if (changeCount === 0) {
    return { changed: false, figures: 0 };
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, result);
  }

  return { changed: true, figures: changeCount };
}

function processDirectory(dirPath, dryRun) {
  const results = {
    filesProcessed: 0,
    filesChanged: 0,
    totalFigures: 0
  };

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const subResults = processDirectory(fullPath, dryRun);
      results.filesProcessed += subResults.filesProcessed;
      results.filesChanged += subResults.filesChanged;
      results.totalFigures += subResults.totalFigures;
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.filesProcessed++;
      const { changed, figures } = processFile(fullPath, dryRun);
      if (changed) {
        results.filesChanged++;
        results.totalFigures += figures;
        const action = dryRun ? '[DRY RUN] Would update' : 'Updated';
        console.log(`${action}: ${fullPath} (${figures} figure(s))`);
      }
    }
  }

  return results;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let target = null;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
fix-figure-captions.js - Wrap images with captions into figure elements

Usage:
  node tools/fix-figure-captions.js [--dry-run] <file-or-directory>

Options:
  --dry-run    Show what would be changed without modifying files
  -h, --help   Show this help message

Examples:
  node tools/fix-figure-captions.js path/to/chapter.md
  node tools/fix-figure-captions.js path/to/chapters/
  node tools/fix-figure-captions.js --dry-run path/to/chapters/
`);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      target = arg;
    }
  }

  if (!target) {
    console.error('Error: Please provide a file or directory path');
    process.exit(1);
  }

  const targetPath = path.resolve(target);

  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[DRY RUN MODE]\n');
  }

  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    const { changed, figures } = processFile(targetPath, dryRun);
    if (changed) {
      const action = dryRun ? '[DRY RUN] Would update' : 'Updated';
      console.log(`${action}: ${targetPath} (${figures} figure(s))`);
    } else {
      console.log('No figures to wrap found.');
    }
  } else if (stat.isDirectory()) {
    const results = processDirectory(targetPath, dryRun);
    console.log(`\nSummary:`);
    console.log(`  Files processed: ${results.filesProcessed}`);
    console.log(`  Files changed: ${results.filesChanged}`);
    console.log(`  Figures wrapped: ${results.totalFigures}`);
  }
}

main();
