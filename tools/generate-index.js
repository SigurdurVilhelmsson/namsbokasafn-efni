#!/usr/bin/env node

/**
 * generate-index.js
 *
 * Generates index.json for a book by extracting glossary terms from
 * translated CNXML files and organizing them alphabetically with
 * chapter/section references.
 *
 * Output format:
 * {
 *   "entries": [
 *     {
 *       "term": "efnafræði",
 *       "definition": "rannsóknir á samsetningu, eiginleikum og samspili efnis",
 *       "chapters": [
 *         {
 *           "chapter": 1,
 *           "section": "1.1",
 *           "moduleId": "m68664"
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node tools/generate-index.js --book efnafraedi
 *   node tools/generate-index.js --book efnafraedi --chapters 9,12,13
 *   node tools/generate-index.js --book efnafraedi --track faithful
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
    track: 'faithful',
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
generate-index.js - Generate alphabetical index from glossary terms

Extracts glossary terms from all chapters and creates an alphabetical
index with chapter/section references.

Usage:
  node tools/generate-index.js --book <id> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)

Options:
  --track TRACK     Publication track: faithful, mt-preview (default: faithful)
  --chapters N,N    Comma-separated chapters to process (default: all)
  --output PATH     Output file path (default: auto-detected)
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Generate index for all chapters
  node tools/generate-index.js --book efnafraedi

  # Generate for specific chapters
  node tools/generate-index.js --book efnafraedi --chapters 9,12,13
`);
}

// ============================================================================
// Module Discovery
// ============================================================================

/**
 * Find all modules for specified chapters
 */
function findChapterModules(book, chapters, track) {
  const translatedDir = path.join(BOOKS_DIR, book, '03-translated', track);

  if (!fs.existsSync(translatedDir)) {
    throw new Error(`Translated directory not found: ${translatedDir}`);
  }

  const modulesByChapter = new Map();

  // Find all chapter directories
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

    // Find all CNXML files
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
 * Extract glossary terms from a CNXML file
 * Returns array of { term, definition, termId }
 */
function extractGlossaryFromCnxml(cnxmlPath, verbose) {
  const terms = [];

  if (!fs.existsSync(cnxmlPath)) {
    if (verbose) console.log(`  Skipping (not found): ${cnxmlPath}`);
    return terms;
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  // Find glossary element
  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) {
    return terms;
  }

  const glossaryContent = glossaryMatch[1];

  // Extract each definition
  const definitionPattern = /<definition\s+id="([^"]+)">([\s\S]*?)<\/definition>/g;
  let defMatch;

  while ((defMatch = definitionPattern.exec(glossaryContent)) !== null) {
    const termId = defMatch[1];
    const defContent = defMatch[2];

    // Extract term
    const termMatch = defContent.match(/<term>([^<]+)<\/term>/);
    const term = termMatch ? termMatch[1].trim() : null;

    // Extract meaning (handle nested elements)
    const meaningMatch = defContent.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);
    let definition = null;

    if (meaningMatch) {
      // Strip XML tags but keep text content
      definition = meaningMatch[1]
        .replace(/<[^>]+>/g, '') // Remove tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }

    if (term && definition) {
      terms.push({
        term,
        definition,
        termId,
      });
    }
  }

  return terms;
}

// ============================================================================
// Index Generation
// ============================================================================

/**
 * Build index from all glossary terms
 */
function generateIndex(options) {
  const { book, chapters, track, verbose } = options;

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Generating Index for ${book}`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Book: ${book}`);
    console.log(`  Chapters: ${chapters ? chapters.join(', ') : 'all'}`);
    console.log('');
  }

  // Find all modules
  const modulesByChapter = findChapterModules(book, chapters, track);

  if (verbose) {
    console.log('Found chapters:');
    for (const [chapterNum, modules] of modulesByChapter.entries()) {
      console.log(`  Chapter ${chapterNum}: ${modules.length} modules`);
    }
    console.log('');
  }

  // Collect all terms with their locations
  console.log('Extracting glossary terms...');
  const termMap = new Map(); // term (normalized) -> entry object

  for (const [chapterNum, modules] of modulesByChapter.entries()) {
    const chapterStr = String(chapterNum).padStart(2, '0');

    // Process only the last module (where glossary typically appears)
    const lastModule = modules[modules.length - 1];
    const cnxmlPath = path.join(
      BOOKS_DIR,
      book,
      '03-translated',
      track,
      `ch${chapterStr}`,
      `${lastModule}.cnxml`
    );

    const terms = extractGlossaryFromCnxml(cnxmlPath, verbose);

    if (verbose && terms.length > 0) {
      console.log(`  Chapter ${chapterNum}: ${terms.length} terms`);
    }

    // Add terms to index
    for (const { term, definition, termId } of terms) {
      const normalizedTerm = term.toLowerCase().trim();

      if (!termMap.has(normalizedTerm)) {
        termMap.set(normalizedTerm, {
          term, // Use original case
          definition,
          chapters: [],
        });
      }

      // Add chapter reference
      const entry = termMap.get(normalizedTerm);
      entry.chapters.push({
        chapter: chapterNum,
        moduleId: lastModule,
        termId,
      });
    }
  }

  console.log(`  Total unique terms: ${termMap.size}`);
  console.log('');

  // Convert to array and sort alphabetically
  console.log('Sorting entries...');
  const entries = Array.from(termMap.values()).sort((a, b) =>
    a.term.toLowerCase().localeCompare(b.term.toLowerCase(), 'is')
  );

  console.log(`Total index entries: ${entries.length}`);

  return { entries };
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
    const index = generateIndex(args);

    // Determine output path
    const outputPath =
      args.output || path.join(BOOKS_DIR, args.book, '05-publication', args.track, 'index.json');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

    console.log('');
    console.log('═'.repeat(60));
    console.log('Index Generated Successfully');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath}`);
    console.log(`Entries: ${index.entries.length}`);
    console.log('');

    // Show sample entries
    if (index.entries.length > 0) {
      console.log('Sample entries (first 5):');
      for (const entry of index.entries.slice(0, 5)) {
        console.log(`  - ${entry.term} (appears in ${entry.chapters.length} chapter(s))`);
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
