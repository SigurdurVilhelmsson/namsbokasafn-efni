#!/usr/bin/env node

/**
 * generate-glossary.js
 *
 * Generates glossary.json for a book by extracting glossary terms from
 * translated CNXML files. Produces a book-wide glossary sorted by
 * Icelandic collation with English equivalents extracted.
 *
 * Output format matches the vefur's Glossary type:
 * {
 *   "terms": [
 *     {
 *       "term": "atóm",
 *       "definition": "minnsta eining frumefnis sem getur...",
 *       "english": "atom",
 *       "chapter": 2
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node tools/generate-glossary.js --book efnafraedi
 *   node tools/generate-glossary.js --book efnafraedi --track mt-preview
 *   node tools/generate-glossary.js --book efnafraedi --chapters 1,2,3
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const BOOKS_DIR = 'books';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    track: 'mt-preview',
    chapters: null,
    output: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--book' && args[i + 1]) {
      result.book = args[++i];
    } else if (arg === '--track' && args[i + 1]) {
      result.track = args[++i];
    } else if (arg === '--chapters' && args[i + 1]) {
      result.chapters = args[++i].split(',').map((n) => parseInt(n.trim(), 10));
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[++i];
    }
  }

  return result;
}

function printHelp() {
  console.log(`
generate-glossary.js - Generate book-wide glossary.json from CNXML sources

Extracts glossary terms from translated CNXML files and produces a
combined glossary.json sorted by Icelandic collation.

Usage:
  node tools/generate-glossary.js --book <id> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)

Options:
  --track TRACK     Publication track: mt-preview, faithful (default: mt-preview)
  --chapters N,N    Comma-separated chapters to process (default: all)
  --output PATH     Output file path (default: books/<book>/05-publication/<track>/glossary.json)
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Generate glossary for all chapters
  node tools/generate-glossary.js --book efnafraedi

  # Generate for specific chapters only
  node tools/generate-glossary.js --book efnafraedi --chapters 1,2,3
`);
}

// ============================================================================
// Term Splitting
// ============================================================================

/**
 * Split a term like "atóm (e. atom)" into Icelandic and English parts.
 * Uses lastIndexOf to handle nested parentheses like "vermi (H) (e. enthalpy (h))".
 */
function splitTerm(fullTerm) {
  const marker = ' (e. ';
  const idx = fullTerm.lastIndexOf(marker);
  if (idx === -1) return { termIs: fullTerm.trim(), termEn: null };
  const termIs = fullTerm.substring(0, idx).trim();
  let termEn = fullTerm.substring(idx + marker.length);
  if (termEn.endsWith(')')) termEn = termEn.slice(0, -1);
  return { termIs, termEn: termEn.trim() || null };
}

// ============================================================================
// Module Discovery
// ============================================================================

/**
 * Find all CNXML modules for each chapter in the translated directory.
 * Returns Map<chapterNum, moduleId[]>.
 */
function findChapterModules(book, chapters, track) {
  const translatedDir = path.join(BOOKS_DIR, book, '03-translated', track);

  if (!fs.existsSync(translatedDir)) {
    throw new Error(`Translated directory not found: ${translatedDir}`);
  }

  const modulesByChapter = new Map();

  const chapterDirs = fs
    .readdirSync(translatedDir)
    .filter((name) => name.startsWith('ch'))
    .map((name) => parseInt(name.replace('ch', ''), 10))
    .filter((num) => !isNaN(num) && (!chapters || chapters.includes(num)))
    .sort((a, b) => a - b);

  for (const chapterNum of chapterDirs) {
    const chapterStr = String(chapterNum).padStart(2, '0');
    const chapterDir = path.join(translatedDir, `ch${chapterStr}`);

    if (!fs.existsSync(chapterDir)) {
      continue;
    }

    const modules = fs
      .readdirSync(chapterDir)
      .filter((name) => name.endsWith('.cnxml'))
      .map((name) => name.replace('.cnxml', ''))
      .sort();

    if (modules.length > 0) {
      modulesByChapter.set(chapterNum, modules);
    }
  }

  return modulesByChapter;
}

// ============================================================================
// Glossary Extraction
// ============================================================================

/**
 * Extract glossary terms from a single CNXML file.
 * Returns array of { term, definition }.
 */
function extractGlossaryFromCnxml(cnxmlPath, verbose) {
  const terms = [];

  if (!fs.existsSync(cnxmlPath)) {
    if (verbose) console.log(`  Skipping (not found): ${cnxmlPath}`);
    return terms;
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) {
    return terms;
  }

  const glossaryContent = glossaryMatch[1];

  const definitionPattern = /<definition\s+id="([^"]+)">([\s\S]*?)<\/definition>/g;
  let defMatch;

  while ((defMatch = definitionPattern.exec(glossaryContent)) !== null) {
    const defContent = defMatch[2];

    // Extract term text
    const termMatch = defContent.match(/<term>([^<]+)<\/term>/);
    const term = termMatch ? termMatch[1].replace(/\s+/g, ' ').trim() : null;

    // Extract meaning and strip XML tags
    const meaningMatch = defContent.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);
    let definition = null;

    if (meaningMatch) {
      definition = meaningMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (term && definition) {
      terms.push({ term, definition });
    }
  }

  return terms;
}

// ============================================================================
// Glossary Generation
// ============================================================================

/**
 * Build the book-wide glossary from all chapters.
 */
function generateGlossary(options) {
  const { book, chapters, track, verbose } = options;

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Generating Glossary for ${book}`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Book: ${book}`);
    console.log(`  Track: ${track}`);
    console.log(`  Chapters: ${chapters ? chapters.join(', ') : 'all'}`);
    console.log('');
  }

  const modulesByChapter = findChapterModules(book, chapters, track);

  if (verbose) {
    console.log('Found chapters:');
    for (const [chapterNum, modules] of modulesByChapter.entries()) {
      console.log(`  Chapter ${chapterNum}: ${modules.length} modules`);
    }
    console.log('');
  }

  // Collect all terms, deduplicating by lowercase Icelandic term (keep first occurrence)
  console.log('Extracting glossary terms...');
  const allTerms = [];
  const seen = new Map(); // lowercase termIs → index in allTerms

  for (const [chapterNum, modules] of modulesByChapter.entries()) {
    const chapterStr = String(chapterNum).padStart(2, '0');
    let chapterTermCount = 0;

    for (const moduleId of modules) {
      const cnxmlPath = path.join(
        BOOKS_DIR,
        book,
        '03-translated',
        track,
        `ch${chapterStr}`,
        `${moduleId}.cnxml`
      );

      const rawTerms = extractGlossaryFromCnxml(cnxmlPath, verbose);

      for (const { term, definition } of rawTerms) {
        const { termIs, termEn } = splitTerm(term);
        const key = termIs.toLowerCase();

        if (seen.has(key)) {
          if (verbose) {
            console.log(
              `  Duplicate skipped: "${termIs}" (ch${chapterStr}, first in ch${allTerms[seen.get(key)].chapter})`
            );
          }
          continue;
        }

        const entry = { term: termIs, definition, chapter: chapterNum };
        if (termEn) {
          entry.english = termEn;
        }

        seen.set(key, allTerms.length);
        allTerms.push(entry);
        chapterTermCount++;
      }
    }

    console.log(`  Chapter ${chapterNum}: ${chapterTermCount} terms`);
  }

  console.log(`  Total: ${allTerms.length} unique terms`);
  console.log('');

  // Sort by Icelandic collation
  const collator = new Intl.Collator('is');
  allTerms.sort((a, b) => collator.compare(a.term, b.term));

  return { terms: allTerms };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book) {
    console.error('Error: --book is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    const glossary = generateGlossary(args);

    const outputPath =
      args.output || path.join(BOOKS_DIR, args.book, '05-publication', args.track, 'glossary.json');

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(glossary, null, 2) + '\n');

    console.log('═'.repeat(60));
    console.log('Glossary Generated Successfully');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath}`);
    console.log(`Terms:  ${glossary.terms.length}`);
    console.log('');

    // Show chapter breakdown
    const byChapter = new Map();
    for (const t of glossary.terms) {
      byChapter.set(t.chapter, (byChapter.get(t.chapter) || 0) + 1);
    }
    console.log('Per chapter:');
    for (const [ch, count] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  Chapter ${ch}: ${count} terms`);
    }
    console.log('');

    // Show sample terms
    if (glossary.terms.length > 0) {
      console.log('Sample terms (first 5):');
      for (const entry of glossary.terms.slice(0, 5)) {
        const en = entry.english ? ` (${entry.english})` : '';
        console.log(`  - ${entry.term}${en} — ch.${entry.chapter}`);
      }
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
