#!/usr/bin/env node

/**
 * generate-glossary.js
 *
 * Generates glossary.json for a book by:
 * 1. Extracting English terms + definitions from CNXML <glossary> elements
 * 2. Finding Icelandic terms from translated markdown (**term**{#term-id})
 * 3. Matching by term ID
 *
 * Output format matches the GlossaryTerm interface in namsbokasafn-vefur:
 * {
 *   "terms": [
 *     {
 *       "term": "efnafræði",
 *       "definition": "rannsóknir á samsetningu, eiginleikum og samspili efnis",
 *       "english": "chemistry",
 *       "chapter": 1,
 *       "section": "1.1"
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node tools/generate-glossary.js --book efnafraedi
 *   node tools/generate-glossary.js --book efnafraedi --track mt-preview
 *   node tools/generate-glossary.js --book efnafraedi --chapters 1,2,3
 *
 * Options:
 *   --book ID         Book identifier (required)
 *   --track TRACK     Publication track: mt-preview, faithful (default: mt-preview)
 *   --chapters N,N    Comma-separated list of chapters to process (default: all)
 *   --output PATH     Output file path (default: auto-detected)
 *   --dry-run         Show what would be done without writing
 *   --verbose         Show detailed progress
 *   -h, --help        Show help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    track: 'mt-preview',
    chapters: null,
    output: null,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
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
generate-glossary.js - Generate glossary.json from CNXML sources and translations

Extracts English glossary terms from CNXML files and matches them with
Icelandic translations to create a comprehensive glossary.json file.

Usage:
  node tools/generate-glossary.js --book <id> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)

Options:
  --track TRACK     Publication track: mt-preview, faithful (default: mt-preview)
  --chapters N,N    Comma-separated chapters to process (default: all)
  --output PATH     Output file path (default: 05-publication/{track}/glossary.json)
  --dry-run         Preview without writing
  --verbose         Show detailed progress
  -h, --help        Show this help message

Output Format:
  {
    "terms": [
      {
        "term": "efnafræði",
        "definition": "rannsóknir á samsetningu...",
        "english": "chemistry",
        "chapter": 1,
        "section": "1.1"
      }
    ]
  }

Examples:
  # Generate glossary for all chapters
  node tools/generate-glossary.js --book efnafraedi

  # Generate for specific chapters
  node tools/generate-glossary.js --book efnafraedi --chapters 1,2,3

  # Use faithful track instead of mt-preview
  node tools/generate-glossary.js --book efnafraedi --track faithful
`);
}

// ============================================================================
// Path Resolution
// ============================================================================

function getProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveSourceDir(projectRoot, book) {
  return path.join(projectRoot, 'books', book, '01-source');
}

function resolveTranslationDir(projectRoot, book, track) {
  return path.join(projectRoot, 'books', book, '05-publication', track, 'chapters');
}

function resolveOutputPath(projectRoot, book, track) {
  return path.join(projectRoot, 'books', book, '05-publication', track, 'glossary.json');
}

// ============================================================================
// CNXML Glossary Extraction
// ============================================================================

/**
 * Extract glossary terms from a CNXML file
 * Returns array of { id, englishTerm, englishDefinition }
 */
function extractGlossaryFromCnxml(cnxmlPath, verbose) {
  const terms = [];

  if (!fs.existsSync(cnxmlPath)) {
    if (verbose) console.log(`  Skipping (not found): ${cnxmlPath}`);
    return terms;
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  // Find glossary section
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
    const englishTerm = termMatch ? termMatch[1].trim() : null;

    // Extract meaning
    const meaningMatch = defContent.match(/<meaning[^>]*>([^<]+)<\/meaning>/);
    const englishDefinition = meaningMatch ? meaningMatch[1].trim() : null;

    if (englishTerm && englishDefinition) {
      terms.push({
        id: termId,
        englishTerm,
        englishDefinition,
      });
    }
  }

  return terms;
}

/**
 * Get module info (chapter, section) from CNXML metadata
 */
// eslint-disable-next-line no-unused-vars
function getModuleInfo(cnxmlPath) {
  if (!fs.existsSync(cnxmlPath)) {
    return { chapter: null, section: null };
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  // Extract module ID
  const moduleIdMatch = content.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  const moduleId = moduleIdMatch ? moduleIdMatch[1] : null;

  // We could map module IDs to chapters/sections here
  // For now, we'll determine this from the file path
  return { moduleId };
}

// ============================================================================
// Translated Markdown Term Extraction
// ============================================================================

/**
 * Extract Icelandic terms from translated markdown files
 * Looks for pattern: **term**{#term-id}
 * Returns Map of termId -> { icelandicTerm, chapter, section }
 */
function extractTermsFromMarkdown(translationDir, chapters, verbose) {
  const termMap = new Map();

  if (!fs.existsSync(translationDir)) {
    console.warn(`Warning: Translation directory not found: ${translationDir}`);
    return termMap;
  }

  // List chapter directories
  const chapterDirs = fs
    .readdirSync(translationDir)
    .filter((name) => /^\d+$/.test(name))
    .map((name) => parseInt(name, 10))
    .filter((num) => !chapters || chapters.includes(num))
    .sort((a, b) => a - b);

  for (const chapterNum of chapterDirs) {
    const chapterDir = path.join(translationDir, chapterNum.toString().padStart(2, '0'));

    if (!fs.existsSync(chapterDir)) {
      continue;
    }

    // Find markdown files in chapter directory
    const mdFiles = fs
      .readdirSync(chapterDir)
      .filter((name) => name.endsWith('.md'))
      .sort();

    for (const mdFile of mdFiles) {
      const mdPath = path.join(chapterDir, mdFile);
      const content = fs.readFileSync(mdPath, 'utf8');

      // Determine section from filename (e.g., 1-1-chemistry-in-context.md -> 1.1)
      const sectionMatch = mdFile.match(/^(\d+)-(\d+)/);
      const section = sectionMatch ? `${sectionMatch[1]}.${sectionMatch[2]}` : null;

      // Find all term patterns: **term**{#term-id} or **term**{#fs-idXXXX}
      // Pattern handles both term-NNNNN and fs-idNNNNNNN formats
      const termPattern = /\*\*([^*]+)\*\*\{#((?:term-\d+|fs-id[a-z0-9]+))\}/gi;
      let termMatch;

      while ((termMatch = termPattern.exec(content)) !== null) {
        const icelandicTerm = termMatch[1].trim();
        const termId = termMatch[2];

        // Store with chapter and section info
        termMap.set(termId, {
          icelandicTerm,
          chapter: chapterNum,
          section,
        });

        if (verbose) {
          console.log(`    Found: "${icelandicTerm}" -> ${termId}`);
        }
      }
    }
  }

  return termMap;
}

/**
 * Extract Icelandic term/definition pairs from key-terms.md files
 * These files have format:
 *   Term
 *
 *   definition text
 *
 * Returns Map of normalizedTerm -> { icelandicTerm, icelandicDefinition }
 */
function extractDefinitionsFromKeyTerms(translationDir, chapters, verbose) {
  const defMap = new Map();

  if (!fs.existsSync(translationDir)) {
    return defMap;
  }

  const chapterDirs = fs
    .readdirSync(translationDir)
    .filter((name) => /^\d+$/.test(name))
    .map((name) => parseInt(name, 10))
    .filter((num) => !chapters || chapters.includes(num))
    .sort((a, b) => a - b);

  for (const chapterNum of chapterDirs) {
    const chapterDir = path.join(translationDir, chapterNum.toString().padStart(2, '0'));

    // Look for key-terms file
    const keyTermsFiles = fs
      .readdirSync(chapterDir)
      .filter((name) => name.includes('key-terms') && name.endsWith('.md'));

    for (const keyTermsFile of keyTermsFiles) {
      const keyTermsPath = path.join(chapterDir, keyTermsFile);
      const content = fs.readFileSync(keyTermsPath, 'utf8');

      // Remove frontmatter
      let cleanContent = content;
      if (content.startsWith('---')) {
        const endMatch = content.substring(3).match(/\n---\s*\n/);
        if (endMatch) {
          cleanContent = content.substring(3 + endMatch.index + endMatch[0].length);
        }
      }

      // Remove header lines (## Lykilhugtök, etc.)
      cleanContent = cleanContent.replace(/^##\s+.*$/gm, '');

      // Split into non-empty paragraphs (blocks separated by blank lines)
      const paragraphs = cleanContent
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // Parse pairs: term is usually short (1-3 words), definition is longer
      for (let i = 0; i < paragraphs.length - 1; i += 2) {
        const term = paragraphs[i];
        const definition = paragraphs[i + 1];

        // Validate: term should be relatively short and not look like a sentence
        // Definition should be longer or at least different
        if (
          term &&
          definition &&
          !term.includes('.') && // Terms don't end with periods
          term.length < 100 && // Terms are short
          definition !== term
        ) {
          // Normalize term for matching (lowercase, remove parentheticals)
          const normalizedTerm = term
            .toLowerCase()
            .replace(/\s*\([^)]*\)\s*/g, '')
            .trim();

          defMap.set(normalizedTerm, {
            icelandicTerm: term,
            icelandicDefinition: definition,
            chapter: chapterNum,
          });

          if (verbose) {
            console.log(`    KeyTerm: "${term}" -> "${definition.substring(0, 40)}..."`);
          }
        }
      }
    }
  }

  return defMap;
}

// ============================================================================
// Glossary Generation
// ============================================================================

/**
 * Build combined glossary from CNXML sources and translations
 */
async function generateGlossary(options) {
  const { book, track, chapters, verbose } = options;

  const projectRoot = getProjectRoot();
  const sourceDir = resolveSourceDir(projectRoot, book);
  const translationDir = resolveTranslationDir(projectRoot, book, track);

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
    console.log(`  Source: ${sourceDir}`);
    console.log(`  Translations: ${translationDir}`);
    console.log('');
  }

  // Step 1: Extract English glossary terms from CNXML
  console.log('Step 1: Extracting English terms from CNXML sources...');
  const englishTerms = [];

  // Find all chapter source directories
  const chapterSourceDirs = fs
    .readdirSync(sourceDir)
    .filter((name) => name.startsWith('ch'))
    .map((name) => parseInt(name.replace('ch', ''), 10))
    .filter((num) => !isNaN(num) && (!chapters || chapters.includes(num)))
    .sort((a, b) => a - b);

  for (const chapterNum of chapterSourceDirs) {
    const chapterSourceDir = path.join(sourceDir, `ch${chapterNum.toString().padStart(2, '0')}`);

    if (!fs.existsSync(chapterSourceDir)) {
      continue;
    }

    // Find all CNXML files in chapter
    const cnxmlFiles = fs
      .readdirSync(chapterSourceDir)
      .filter((name) => name.endsWith('.cnxml'))
      .sort();

    if (verbose) {
      console.log(`  Chapter ${chapterNum}: ${cnxmlFiles.length} CNXML files`);
    }

    for (const cnxmlFile of cnxmlFiles) {
      const cnxmlPath = path.join(chapterSourceDir, cnxmlFile);
      const terms = extractGlossaryFromCnxml(cnxmlPath, verbose);

      // Add chapter info to terms
      for (const term of terms) {
        term.chapter = chapterNum;
        englishTerms.push(term);
      }

      if (verbose && terms.length > 0) {
        console.log(`    ${cnxmlFile}: ${terms.length} glossary terms`);
      }
    }
  }

  console.log(`  Total English terms: ${englishTerms.length}`);
  console.log('');

  // Step 2: Extract Icelandic terms from translations
  console.log('Step 2: Extracting Icelandic terms from translations...');

  // Get terms with IDs from markdown content
  const icelandicTermMap = extractTermsFromMarkdown(translationDir, chapters, verbose);
  console.log(`  Terms with IDs from content: ${icelandicTermMap.size}`);

  // Get term/definition pairs from key-terms files
  const icelandicDefMap = extractDefinitionsFromKeyTerms(translationDir, chapters, verbose);
  console.log(`  Term definitions from key-terms: ${icelandicDefMap.size}`);
  console.log('');

  // Step 3: Build glossary from Icelandic key-terms
  // The key-terms.md files already have the translated term/definition pairs,
  // which is what we need. English matching would require a dictionary.
  console.log('Step 3: Building glossary from Icelandic terms...');

  const glossaryTerms = [];

  // Use Icelandic key-terms as the primary source
  for (const icEntry of icelandicDefMap.values()) {
    glossaryTerms.push({
      term: icEntry.icelandicTerm,
      definition: icEntry.icelandicDefinition,
      chapter: icEntry.chapter,
    });
  }

  console.log(`  Glossary terms from key-terms: ${glossaryTerms.length}`);
  console.log('');

  // Sort alphabetically by term (Icelandic collation)
  glossaryTerms.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase(), 'is'));

  console.log(`Total glossary entries: ${glossaryTerms.length}`);

  return { terms: glossaryTerms };
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
    const glossary = await generateGlossary(args);

    // Determine output path
    const projectRoot = getProjectRoot();
    const outputPath = args.output || resolveOutputPath(projectRoot, args.book, args.track);

    // Write output
    if (args.dryRun) {
      console.log('');
      console.log('[DRY RUN] Would write to:', outputPath);
      console.log('');
      console.log('Sample output (first 5 entries):');
      console.log(JSON.stringify({ terms: glossary.terms.slice(0, 5) }, null, 2));
    } else {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(glossary, null, 2));
      console.log('');
      console.log('═'.repeat(60));
      console.log('Glossary Generated Successfully');
      console.log('═'.repeat(60));
      console.log(`Output: ${outputPath}`);
      console.log(`Terms: ${glossary.terms.length}`);
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
