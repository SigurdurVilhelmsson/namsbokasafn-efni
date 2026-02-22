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
 *   "generated": "2026-02-22T14:30:00Z",
 *   "termCount": 250,
 *   "entries": [
 *     {
 *       "termIs": "atóm",
 *       "termEn": "atom",
 *       "termFull": "atóm (e. atom)",
 *       "definition": "minnsta eind frumefnis sem getur tekið þátt í efnahvarfi",
 *       "chapter": 1,
 *       "section": "1.2",
 *       "sectionTitle": "Efnishamur og flokkun efnis",
 *       "sectionSlug": "1-2-efnishamur-og-flokkun-efnis",
 *       "termId": "fs-idm8143856"
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node tools/generate-index.js --book efnafraedi
 *   node tools/generate-index.js --book efnafraedi --chapters 9,12,13
 *   node tools/generate-index.js --book efnafraedi --track mt-preview
 *   node tools/generate-index.js --book efnafraedi --toc ../namsbokasafn-vefur/static/content/efnafraedi/toc.json
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
    toc: null,
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
    } else if (arg === '--toc' && args[i + 1]) {
      result.toc = args[++i];
    }
  }

  return result;
}

function printHelp() {
  console.log(`
generate-index.js - Generate alphabetical index from glossary terms

Extracts glossary terms from all chapters and creates an alphabetical
index with chapter/section references and IS/EN term splitting.

Usage:
  node tools/generate-index.js --book <id> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)

Options:
  --track TRACK     Publication track: faithful, mt-preview (default: faithful)
  --chapters N,N    Comma-separated chapters to process (default: all)
  --output PATH     Output file path (default: auto-detected)
  --toc PATH        Path to toc.json for section slug/title info
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Generate index for all chapters
  node tools/generate-index.js --book efnafraedi --track mt-preview

  # Generate for specific chapters with toc
  node tools/generate-index.js --book efnafraedi --chapters 1,2,3 --toc ../namsbokasafn-vefur/static/content/efnafraedi/toc.json
`);
}

// ============================================================================
// Term Splitting
// ============================================================================

/**
 * Split a term like "atóm (e. atom)" into IS and EN parts.
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
// Section Mapping
// ============================================================================

/**
 * Build moduleId → { chapter, section } mapping from chemistry-2e.json
 */
function loadModuleMap(_book) {
  const dataPath = path.join('server', 'data', 'chemistry-2e.json');
  if (!fs.existsSync(dataPath)) {
    return null;
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const map = new Map();
  for (const ch of data.chapters) {
    for (const mod of ch.modules) {
      map.set(mod.id, {
        chapter: ch.chapter,
        section: mod.section,
      });
    }
  }
  return map;
}

/**
 * Load toc.json and build section number → { title, slug } mapping.
 * Tries multiple auto-detection paths if no explicit path given.
 */
function loadTocMap(tocPath, book) {
  // Auto-detect toc.json location
  const candidates = tocPath
    ? [tocPath]
    : [path.join('..', 'namsbokasafn-vefur', 'static', 'content', book, 'toc.json')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const toc = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const map = new Map();
      for (const ch of toc.chapters || []) {
        for (const sec of ch.sections || []) {
          if (sec.number && sec.file) {
            const slug = sec.file.replace('.html', '');
            map.set(sec.number, {
              title: sec.title,
              slug,
              chapter: ch.number,
            });
          }
        }
      }
      return map;
    }
  }
  return null;
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
  const { book, chapters, track, toc: tocPath, verbose } = options;

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Generating Index for ${book}`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Book: ${book}`);
    console.log(`  Track: ${track}`);
    console.log(`  Chapters: ${chapters ? chapters.join(', ') : 'all'}`);
    console.log('');
  }

  // Load module → section mapping
  const moduleMap = loadModuleMap(book);
  if (verbose) {
    console.log(`Module map: ${moduleMap ? moduleMap.size + ' modules' : 'not loaded'}`);
  }

  // Load toc for section titles and slugs
  const tocMap = loadTocMap(tocPath, book);
  if (verbose) {
    console.log(`TOC map: ${tocMap ? tocMap.size + ' sections' : 'not loaded'}`);
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

  // Collect all terms — one entry per term occurrence
  console.log('Extracting glossary terms...');
  const entries = [];

  for (const [chapterNum, modules] of modulesByChapter.entries()) {
    const chapterStr = String(chapterNum).padStart(2, '0');
    let chapterTermCount = 0;

    // Process ALL modules in the chapter (bug fix: was only processing last module)
    for (const moduleId of modules) {
      const cnxmlPath = path.join(
        BOOKS_DIR,
        book,
        '03-translated',
        track,
        `ch${chapterStr}`,
        `${moduleId}.cnxml`
      );

      const terms = extractGlossaryFromCnxml(cnxmlPath, verbose);

      for (const { term, definition, termId } of terms) {
        const { termIs, termEn } = splitTerm(term);

        // Look up section info from module map
        const modInfo = moduleMap?.get(moduleId);
        const section = modInfo?.section || null;

        // Look up slug and title from toc map
        const tocInfo = section ? tocMap?.get(section) : null;

        const entry = {
          termIs,
          termEn,
          termFull: term,
          definition,
          chapter: chapterNum,
          section: section || null,
          sectionTitle: tocInfo?.title || null,
          sectionSlug: tocInfo?.slug || null,
          termId,
        };

        entries.push(entry);
        chapterTermCount++;
      }
    }

    if (verbose && chapterTermCount > 0) {
      console.log(`  Chapter ${chapterNum}: ${chapterTermCount} terms`);
    }
  }

  console.log(`  Total term entries: ${entries.length}`);
  console.log('');

  // Sort alphabetically by Icelandic term
  console.log('Sorting entries...');
  entries.sort((a, b) => a.termIs.toLowerCase().localeCompare(b.termIs.toLowerCase(), 'is'));

  // Count unique IS terms
  const uniqueTerms = new Set(entries.map((e) => e.termIs.toLowerCase()));
  console.log(`Total entries: ${entries.length} (${uniqueTerms.size} unique terms)`);

  return {
    generated: new Date().toISOString(),
    termCount: entries.length,
    entries,
  };
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
        const en = entry.termEn ? ` (${entry.termEn})` : '';
        const sec = entry.section ? ` — ${entry.section}` : '';
        console.log(`  - ${entry.termIs}${en}${sec}`);
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
