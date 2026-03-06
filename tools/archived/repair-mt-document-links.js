#!/usr/bin/env node

/**
 * repair-mt-document-links.js
 *
 * One-time repair script to add document= prefixes to cross-document links
 * in 02-mt-output IS segment files.
 *
 * The extraction regex ordering bug caused document links like
 *   <link document="m68674" target-id="fs-id123"/>
 * to be extracted as [#fs-id123] instead of [m68674#fs-id123].
 *
 * MT translated these segments with the broken format. This script patches
 * the IS segments by comparing against the corrected EN segments.
 *
 * Usage:
 *   node tools/repair-mt-document-links.js [--dry-run] [--book <slug>]
 *
 * Options:
 *   --dry-run   Show what would be changed without writing files
 *   --book      Book slug (default: efnafraedi-2e)
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bookIdx = args.indexOf('--book');
const book = bookIdx !== -1 ? args[bookIdx + 1] : 'efnafraedi-2e';
const BOOKS_DIR = `books/${book}`;

/**
 * Parse segment file into a Map of segmentId → text.
 */
function parseSegments(content) {
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->\s*([\s\S]*?)(?=<!-- SEG:|$)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    segments.set(match[1], match[2].trim());
  }
  return segments;
}

/**
 * Find all document link references in a text.
 * Returns array of { doc, targetId } objects.
 */
function findDocLinks(text) {
  const links = [];
  // Self-closing: [doc#target]
  const selfClosing = /\[([A-Za-z0-9_.-]+)#([A-Za-z0-9_.-]+)\]/g;
  let m;
  while ((m = selfClosing.exec(text)) !== null) {
    // Skip if the first capture starts with # (that's an internal ref [#target])
    if (!m[1].startsWith('#')) {
      links.push({ doc: m[1], targetId: m[2], format: 'self-closing' });
    }
  }
  // With text: [text](doc#target)
  const withText = /\[([^\]]+)\]\(([A-Za-z0-9_.-]+)#([A-Za-z0-9_.-]+)\)/g;
  while ((m = withText.exec(text)) !== null) {
    links.push({ doc: m[2], targetId: m[3], format: 'with-text' });
  }
  return links;
}

// Scan all chapter directories
const enDir = path.join(BOOKS_DIR, '02-for-mt');
const isDir = path.join(BOOKS_DIR, '02-mt-output');

const chapters = fs.readdirSync(enDir).filter((d) => {
  return fs.statSync(path.join(enDir, d)).isDirectory();
});

let totalFixed = 0;
let totalFiles = 0;
const report = [];

for (const chapterDir of chapters.sort()) {
  const enChapterPath = path.join(enDir, chapterDir);
  const isChapterPath = path.join(isDir, chapterDir);

  if (!fs.existsSync(isChapterPath)) continue;

  const enFiles = fs.readdirSync(enChapterPath).filter((f) => f.endsWith('.en.md'));

  for (const enFile of enFiles) {
    const moduleId = enFile.replace('-segments.en.md', '');
    const isFile = `${moduleId}-segments.is.md`;
    const isFilePath = path.join(isChapterPath, isFile);

    if (!fs.existsSync(isFilePath)) continue;

    const enContent = fs.readFileSync(path.join(enChapterPath, enFile), 'utf-8');
    const enSegments = parseSegments(enContent);

    let isContent = fs.readFileSync(isFilePath, 'utf-8');
    let fileFixed = 0;

    for (const [segId, enText] of enSegments) {
      const docLinks = findDocLinks(enText);
      if (docLinks.length === 0) continue;

      for (const link of docLinks) {
        // In the IS file, find [#targetId] and replace with [doc#targetId]
        const oldSelfClosing = `[#${link.targetId}]`;
        const newSelfClosing = `[${link.doc}#${link.targetId}]`;

        if (isContent.includes(oldSelfClosing)) {
          isContent = isContent.replace(oldSelfClosing, newSelfClosing);
          fileFixed++;
        }

        // Also fix [text](#targetId) → [text](doc#targetId) for with-text links
        const oldWithText = new RegExp(
          `\\[([^\\]]+)\\]\\(#${link.targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
          'g'
        );
        const replacement = `[$1](${link.doc}#${link.targetId})`;
        const before = isContent;
        isContent = isContent.replace(oldWithText, replacement);
        if (isContent !== before) {
          fileFixed++;
        }
      }
    }

    if (fileFixed > 0) {
      totalFixed += fileFixed;
      totalFiles++;
      report.push(`  ${chapterDir}/${isFile}: ${fileFixed} link(s) fixed`);

      if (!dryRun) {
        fs.writeFileSync(isFilePath, isContent, 'utf-8');
      }
    }
  }
}

console.log(dryRun ? '=== DRY RUN ===' : '=== REPAIR COMPLETE ===');
console.log(`Fixed ${totalFixed} document link(s) in ${totalFiles} file(s)\n`);
if (report.length > 0) {
  console.log(report.join('\n'));
} else {
  console.log('No repairs needed.');
}
