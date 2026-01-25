#!/usr/bin/env node

/**
 * extract-glossary.js
 *
 * Extracts glossary terms from CNXML source files and outputs markdown
 * with Icelandic translations from terminology-en-is.csv.
 *
 * Output format: Markdown file with term definitions suitable for key-terms pages
 *
 * Usage:
 *   node tools/extract-glossary.js --book efnafraedi --chapter 1
 *   node tools/extract-glossary.js --book efnafraedi --chapter 1 --output path/to/output.md
 *
 * Options:
 *   --book ID         Book identifier (required)
 *   --chapter N       Chapter number (required)
 *   --output PATH     Output file path (default: auto-generated in 05-publication)
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
    chapter: null,
    output: null,
    dryRun: false,
    verbose: false,
    help: false
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
    } else if (arg === '--chapter' && args[i + 1]) {
      result.chapter = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[++i];
    }
  }

  return result;
}

function printHelp() {
  console.log(`
extract-glossary.js - Extract glossary terms from CNXML to markdown

Extracts English glossary terms from CNXML files and matches them with
Icelandic translations to create a key-terms markdown file.

Usage:
  node tools/extract-glossary.js --book <id> --chapter <n> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)
  --chapter N       Chapter number to extract

Options:
  --output PATH     Output file path (default: 05-publication/mt-preview/chapters/XX/X-key-terms.md)
  --dry-run         Preview without writing
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Extract chapter 1 glossary
  node tools/extract-glossary.js --book efnafraedi --chapter 1

  # Extract with custom output path
  node tools/extract-glossary.js --book efnafraedi --chapter 1 --output my-terms.md
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

// ============================================================================
// Terminology Loading
// ============================================================================

/**
 * Load English-Icelandic terminology from CSV
 * Returns Map of lowercase english term -> { icelandic, category, notes }
 */
function loadTerminology(projectRoot, book) {
  const csvPath = path.join(projectRoot, 'books', book, 'glossary', 'terminology-en-is.csv');
  const termMap = new Map();

  if (!fs.existsSync(csvPath)) {
    console.warn(`Warning: Terminology file not found: ${csvPath}`);
    return termMap;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parsing (handles basic cases)
    const parts = line.split(',');
    if (parts.length >= 2) {
      const english = parts[0].trim().toLowerCase();
      const icelandic = parts[1].trim();
      const category = parts[2]?.trim() || '';
      const notes = parts[3]?.trim() || '';

      termMap.set(english, { icelandic, category, notes });
    }
  }

  return termMap;
}

// ============================================================================
// CNXML Glossary Extraction
// ============================================================================

/**
 * Extract glossary terms from a CNXML file
 * Returns array of { id, term, definition }
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

    // Extract term (may include HTML like <sup>)
    const termMatch = defContent.match(/<term>([\s\S]*?)<\/term>/);
    let term = termMatch ? termMatch[1].trim() : null;

    // Clean up HTML in term
    if (term) {
      term = cleanHtml(term);
    }

    // Extract meaning
    const meaningMatch = defContent.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);
    let definition = meaningMatch ? meaningMatch[1].trim() : null;

    // Clean up HTML in definition
    if (definition) {
      definition = cleanHtml(definition);
    }

    if (term && definition) {
      terms.push({
        id: termId,
        term,
        definition
      });
    }
  }

  return terms;
}

/**
 * Clean HTML tags from text, converting to markdown where appropriate
 */
function cleanHtml(text) {
  return text
    .replace(/<sup>([^<]*)<\/sup>/g, '^$1^')  // Superscript
    .replace(/<sub>([^<]*)<\/sub>/g, '~$1~')  // Subscript
    .replace(/<emphasis[^>]*>([^<]*)<\/emphasis>/g, '*$1*')  // Emphasis
    .replace(/<[^>]+>/g, '')  // Remove remaining tags
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
}

/**
 * Get section number from CNXML module ID
 */
function getModuleSection(moduleId, chapter) {
  // Module ID to section mapping for Chemistry 2e
  const sectionMap = {
    // Chapter 1
    'm68663': 'intro',
    'm68664': '1.1',
    'm68667': '1.2',
    'm68670': '1.3',
    'm68674': '1.4',
    'm68690': '1.5',
    'm68683': '1.6',
    // Add more as needed
  };

  return sectionMap[moduleId] || null;
}

// ============================================================================
// Markdown Generation
// ============================================================================

/**
 * Generate markdown content for key-terms page
 */
function generateMarkdown(terms, chapter, terminology, verbose) {
  const lines = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: Lykilhugtök`);
  lines.push(`chapter: ${chapter}`);
  lines.push(`type: glossary`);
  lines.push('---');
  lines.push('');
  lines.push('## Lykilhugtök');
  lines.push('');

  // Sort terms alphabetically (use Icelandic if available, else English)
  const sortedTerms = [...terms].sort((a, b) => {
    const aIce = terminology.get(a.term.toLowerCase())?.icelandic || a.term;
    const bIce = terminology.get(b.term.toLowerCase())?.icelandic || b.term;
    return aIce.localeCompare(bIce, 'is');
  });

  for (const entry of sortedTerms) {
    const translation = terminology.get(entry.term.toLowerCase());

    if (translation) {
      // Use Icelandic term with English in parentheses
      lines.push(`**${translation.icelandic}** (*${entry.term}*)`);
      lines.push('');
      // Definition in English (would need translation for production)
      lines.push(entry.definition);
      lines.push('');
    } else {
      // No translation found, use English
      if (verbose) {
        console.log(`  No translation found for: "${entry.term}"`);
      }
      lines.push(`**${entry.term}**`);
      lines.push('');
      lines.push(entry.definition);
      lines.push('');
    }
  }

  return lines.join('\n');
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

  if (args.chapter === null || isNaN(args.chapter)) {
    console.error('Error: --chapter is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const projectRoot = getProjectRoot();
  const chapterPadded = args.chapter.toString().padStart(2, '0');
  const sourceDir = path.join(projectRoot, 'books', args.book, '01-source', `ch${chapterPadded}`);

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Extracting Glossary for ${args.book} Chapter ${args.chapter}`);
  console.log('═'.repeat(60));
  console.log('');

  // Load terminology
  console.log('Loading terminology...');
  const terminology = loadTerminology(projectRoot, args.book);
  console.log(`  Loaded ${terminology.size} term translations`);
  console.log('');

  // Find all CNXML files in chapter
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const cnxmlFiles = fs.readdirSync(sourceDir)
    .filter(name => name.endsWith('.cnxml'))
    .sort();

  console.log(`Found ${cnxmlFiles.length} CNXML files in chapter ${args.chapter}`);

  // Extract glossary terms from all modules
  const allTerms = [];
  for (const cnxmlFile of cnxmlFiles) {
    const cnxmlPath = path.join(sourceDir, cnxmlFile);
    const terms = extractGlossaryFromCnxml(cnxmlPath, args.verbose);

    if (terms.length > 0) {
      console.log(`  ${cnxmlFile}: ${terms.length} terms`);
      allTerms.push(...terms);
    }
  }

  console.log('');
  console.log(`Total terms extracted: ${allTerms.length}`);

  // Generate markdown
  const markdown = generateMarkdown(allTerms, args.chapter, terminology, args.verbose);

  // Determine output path
  const outputPath = args.output || path.join(
    projectRoot,
    'books',
    args.book,
    '05-publication',
    'mt-preview',
    'chapters',
    chapterPadded,
    `${args.chapter}-key-terms.md`
  );

  if (args.dryRun) {
    console.log('');
    console.log('[DRY RUN] Would write to:', outputPath);
    console.log('');
    console.log('Preview (first 30 lines):');
    console.log(markdown.split('\n').slice(0, 30).join('\n'));
    console.log('...');
  } else {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, markdown);
    console.log('');
    console.log('═'.repeat(60));
    console.log('Glossary Extracted Successfully');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath}`);
    console.log(`Terms: ${allTerms.length}`);
  }
}

main().catch(err => {
  console.error(`\nError: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
