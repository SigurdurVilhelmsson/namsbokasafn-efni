#!/usr/bin/env node

/**
 * compile-chapter.js
 *
 * Compiles chapter content for web publication by:
 * 1. Extracting end-of-chapter content from section files
 * 2. Creating clean section files (main content only)
 * 3. Compiling end-of-chapter pages (summary, exercises, key-terms, key-equations)
 *
 * This tool bridges the translation workflow (which preserves CNXML module structure)
 * and the publication system (which needs separate end-of-chapter pages for the web reader).
 *
 * Usage:
 *   node tools/compile-chapter.js <book> <chapter> [options]
 *   node tools/compile-chapter.js efnafraedi 1 --track mt-preview
 *
 * Options:
 *   --track <track>    Publication track: mt-preview, faithful, localized (default: faithful)
 *   --source <path>    Override source directory (default: auto-detect based on track)
 *   --output <path>    Override output directory (default: 05-publication/{track}/chapters/)
 *   --dry-run          Show what would be done without writing
 *   --verbose          Show detailed progress
 *   -h, --help         Show help
 *
 * Source Selection:
 *   - mt-preview track: Uses 02-mt-output/ (unreviewed machine translation)
 *   - faithful track: Uses 03-faithful/ (human-reviewed)
 *   - localized track: Uses 04-localized/ (culturally adapted)
 *
 * Output Structure:
 *   05-publication/{track}/chapters/{NN}/
 *   ├── {N}-0-introduction.md    Introduction section
 *   ├── {N}-1.md ... {N}-N.md    Main content sections (cleaned)
 *   ├── {N}-key-terms.md         Compiled from :::glossary or key-terms content
 *   ├── {N}-key-equations.md     Compiled from :::key-equation or key-equations content
 *   ├── {N}-summary.md           Compiled from :::summary or summary content
 *   └── {N}-exercises.md         Compiled from :::exercises or exercises content
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// Configuration
// ============================================================================

// Publication tracks and their source directories
const TRACK_SOURCES = {
  'mt-preview': '02-mt-output',
  'faithful': '03-faithful',
  'localized': '04-localized'
};

// Track labels for frontmatter
const TRACK_LABELS = {
  'mt-preview': 'Vélþýðing - ekki yfirfarin',
  'faithful': 'Ritstýrð þýðing',
  'localized': 'Staðfærð útgáfa'
};

// End-of-chapter content patterns
const EOC_PATTERNS = {
  // Heading-based patterns (## Heading)
  keyConceptsSummary: /^##\s+(?:Key Concepts and Summary|Lykilhugtök og samantekt|Samantekt)/i,
  exercises: /^##\s+(?:Chemistry End of Chapter Exercises|Æfingar|Dæmi|Exercises)/i,
  keyTerms: /^##\s+(?:Key Terms|Lykilhugtök|Hugtök)/i,
  keyEquations: /^##\s+(?:Key Equations|Lykiljöfnur|Jöfnur)/i,

  // Directive-based patterns (:::directive)
  summaryDirective: /^:::summary\b/,
  exercisesDirective: /^:::exercises\b/,
  glossaryDirective: /^:::glossary\b/,
  keyEquationsDirective: /^:::key-equations?\b/,
  practiceProblems: /^:::practice-problem\b/
};

// End-of-chapter output file configuration
const EOC_FILES = {
  summary: { filename: 'summary', titleIs: 'Samantekt', titleEn: 'Summary' },
  exercises: { filename: 'exercises', titleIs: 'Æfingar', titleEn: 'Exercises' },
  keyTerms: { filename: 'key-terms', titleIs: 'Lykilhugtök', titleEn: 'Key Terms' },
  keyEquations: { filename: 'key-equations', titleIs: 'Lykiljöfnur', titleEn: 'Key Equations' }
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    track: 'faithful',
    sourceDir: null,
    outputDir: null,
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
    } else if (arg === '--track') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.track = args[++i];
      }
    } else if (arg === '--source') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.sourceDir = args[++i];
      }
    } else if (arg === '--output') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.outputDir = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      if (!result.book) {
        result.book = arg;
      } else if (!result.chapter) {
        result.chapter = parseInt(arg, 10);
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
compile-chapter.js - Compile chapter content for web publication

Usage:
  node tools/compile-chapter.js <book> <chapter> [options]

Arguments:
  book        Book identifier (e.g., efnafraedi)
  chapter     Chapter number (e.g., 1, 2, 3)

Options:
  --track <track>    Publication track: mt-preview, faithful, localized
                     (default: faithful)
  --source <path>    Override source directory
  --output <path>    Override output directory
  --dry-run          Show what would be done without writing
  --verbose          Show detailed progress
  -h, --help         Show this help message

Source Selection (based on track):
  mt-preview   -> books/{book}/02-mt-output/
  faithful     -> books/{book}/03-faithful/
  localized    -> books/{book}/04-localized/

Output (default):
  books/{book}/05-publication/{track}/chapters/{NN}/

Examples:
  # Compile Chapter 1 for MT preview
  node tools/compile-chapter.js efnafraedi 1 --track mt-preview

  # Compile Chapter 2 for faithful publication
  node tools/compile-chapter.js efnafraedi 2 --track faithful

  # Dry run with verbose output
  node tools/compile-chapter.js efnafraedi 1 --dry-run --verbose
`);
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Find section files in source directory
 */
function findSectionFiles(sourceDir, chapter) {
  const chapterPadded = chapter.toString().padStart(2, '0');
  const chapterDir = path.join(sourceDir, `ch${chapterPadded}`);

  if (!fs.existsSync(chapterDir)) {
    // Try without padding
    const altChapterDir = path.join(sourceDir, `ch${chapter}`);
    if (fs.existsSync(altChapterDir)) {
      return findFilesInDir(altChapterDir, chapter);
    }
    return { files: [], chapterDir: null };
  }

  return findFilesInDir(chapterDir, chapter);
}

function findFilesInDir(dir, chapter) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const filePath = path.join(dir, entry.name);
      const sectionInfo = parseSectionFilename(entry.name, chapter);
      if (sectionInfo) {
        files.push({
          path: filePath,
          filename: entry.name,
          ...sectionInfo
        });
      }
    }
  }

  // Sort by section number
  files.sort((a, b) => {
    if (a.isIntro && !b.isIntro) return -1;
    if (!a.isIntro && b.isIntro) return 1;
    return a.sectionNum - b.sectionNum;
  });

  return { files, chapterDir: dir };
}

/**
 * Parse section filename to extract section info
 * Handles patterns like: 1-1.en.md, 1-1.is.md, intro.en.md, 1-key-terms.md
 */
function parseSectionFilename(filename, chapter) {
  const baseName = filename.replace(/\.(en|is)?\.md$/, '').replace(/\.md$/, '');

  // Introduction pattern
  if (baseName === 'intro' || baseName.match(/^\d+-0-intro/i) || baseName.match(/^\d+-introduction/i)) {
    return { sectionNum: 0, isIntro: true, isEOC: false, eocType: null };
  }

  // End-of-chapter patterns
  if (baseName.match(/key-terms$/i) || baseName.match(/lykilhugtok/i)) {
    return { sectionNum: 100, isIntro: false, isEOC: true, eocType: 'keyTerms' };
  }
  if (baseName.match(/key-equations$/i) || baseName.match(/lykiljofnur/i)) {
    return { sectionNum: 101, isIntro: false, isEOC: true, eocType: 'keyEquations' };
  }
  if (baseName.match(/summary$/i) || baseName.match(/samantekt/i)) {
    return { sectionNum: 102, isIntro: false, isEOC: true, eocType: 'summary' };
  }
  if (baseName.match(/exercises$/i) || baseName.match(/aefingar/i) || baseName.match(/daemi/i)) {
    return { sectionNum: 103, isIntro: false, isEOC: true, eocType: 'exercises' };
  }

  // Regular section pattern: 1-1, 1-2, etc.
  const sectionMatch = baseName.match(/^(\d+)-(\d+)/);
  if (sectionMatch) {
    const fileChapter = parseInt(sectionMatch[1], 10);
    const section = parseInt(sectionMatch[2], 10);
    if (fileChapter === chapter) {
      return { sectionNum: section, isIntro: false, isEOC: false, eocType: null };
    }
  }

  // Just number pattern: 1, 2, etc.
  const numMatch = baseName.match(/^(\d+)$/);
  if (numMatch) {
    return { sectionNum: parseInt(numMatch[1], 10), isIntro: false, isEOC: false, eocType: null };
  }

  return null;
}

// ============================================================================
// Content Processing
// ============================================================================

/**
 * Process a section file - extract EOC content and clean main content
 */
function processSectionFile(filePath, options) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract end-of-chapter content from body
  const { cleanContent, extractedContent } = extractEOCContent(body);

  return {
    frontmatter,
    cleanContent: cleanContent.trim(),
    extractedContent,
    originalContent: content
  };
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseFrontmatter(content) {
  const result = { frontmatter: null, body: content };

  if (content.startsWith('---')) {
    const endMatch = content.substring(3).match(/\n---\s*\n/);
    if (endMatch) {
      const frontmatterEnd = 3 + endMatch.index + endMatch[0].length;
      const frontmatterYaml = content.substring(4, 3 + endMatch.index);

      try {
        result.frontmatter = yaml.load(frontmatterYaml);
        result.body = content.substring(frontmatterEnd);
      } catch (err) {
        console.warn(`Warning: Could not parse frontmatter: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Extract end-of-chapter content from markdown body
 */
function extractEOCContent(body) {
  const extractedContent = {
    summary: [],
    exercises: [],
    keyTerms: [],
    keyEquations: []
  };

  const lines = body.split('\n');
  let cleanLines = [];
  let currentSection = null;
  let currentBuffer = [];
  let directiveDepth = 0;
  let inEOCSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for heading-based EOC sections
    if (EOC_PATTERNS.keyConceptsSummary.test(line)) {
      flushBuffer();
      currentSection = 'summary';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    if (EOC_PATTERNS.exercises.test(line)) {
      flushBuffer();
      currentSection = 'exercises';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    if (EOC_PATTERNS.keyTerms.test(line)) {
      flushBuffer();
      currentSection = 'keyTerms';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    if (EOC_PATTERNS.keyEquations.test(line)) {
      flushBuffer();
      currentSection = 'keyEquations';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    // Check for directive-based content
    if (EOC_PATTERNS.practiceProblems.test(line)) {
      if (!currentSection) {
        currentSection = 'exercises';
        currentBuffer = [];
        inEOCSection = true;
      }
      directiveDepth++;
      currentBuffer.push(line);
      continue;
    }

    if (EOC_PATTERNS.summaryDirective.test(line)) {
      flushBuffer();
      currentSection = 'summary';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    if (EOC_PATTERNS.glossaryDirective.test(line)) {
      flushBuffer();
      currentSection = 'keyTerms';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    if (EOC_PATTERNS.keyEquationsDirective.test(line)) {
      flushBuffer();
      currentSection = 'keyEquations';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    // Track directive closing
    if (line.trim() === ':::' && directiveDepth > 0) {
      currentBuffer.push(line);
      directiveDepth--;
      if (directiveDepth === 0 && currentSection === 'exercises') {
        // Keep collecting exercises until next section or end
      }
      continue;
    }

    // Check if we hit a new main heading (## Something else)
    // that indicates end of EOC section
    if (inEOCSection && /^##\s+/.test(line) && !isEOCHeading(line)) {
      flushBuffer();
      currentSection = null;
      inEOCSection = false;
      cleanLines.push(line);
      continue;
    }

    // Accumulate content
    if (currentSection) {
      currentBuffer.push(line);
    } else {
      cleanLines.push(line);
    }
  }

  // Flush any remaining buffer
  flushBuffer();

  function flushBuffer() {
    if (currentSection && currentBuffer.length > 0) {
      extractedContent[currentSection].push(currentBuffer.join('\n'));
    }
    currentBuffer = [];
  }

  function isEOCHeading(line) {
    return EOC_PATTERNS.keyConceptsSummary.test(line) ||
           EOC_PATTERNS.exercises.test(line) ||
           EOC_PATTERNS.keyTerms.test(line) ||
           EOC_PATTERNS.keyEquations.test(line);
  }

  return {
    cleanContent: cleanLines.join('\n'),
    extractedContent
  };
}

// ============================================================================
// Output Generation
// ============================================================================

/**
 * Format key-terms content to use markdown definition list syntax.
 * Input format (current):
 *   Term
 *
 *   definition
 *
 * Output format (improved):
 *   **Term**
 *   : definition
 *
 * This uses proper definition list syntax which can be styled by the reader.
 */
function formatKeyTermsContent(content) {
  // Split into paragraphs (blocks separated by blank lines)
  const paragraphs = content
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('##'));

  const formatted = [];

  // Process pairs of paragraphs (term, definition)
  for (let i = 0; i < paragraphs.length; i += 2) {
    const term = paragraphs[i];
    const definition = paragraphs[i + 1];

    if (!term) continue;

    // Term: wrap in bold if not already
    const formattedTerm = term.startsWith('**') ? term : `**${term}**`;

    if (definition) {
      // Add definition list syntax (colon prefix on new line)
      formatted.push(`${formattedTerm}\n: ${definition}`);
    } else {
      // No definition - just output the term
      formatted.push(formattedTerm);
    }
  }

  return formatted.join('\n\n');
}

/**
 * Generate frontmatter for output file
 */
function generateFrontmatter(options) {
  const { title, chapter, section, track, type } = options;

  const fm = {
    title: title || '',
    chapter: chapter,
    'translation-status': TRACK_LABELS[track] || track,
    'publication-track': track,
    'published-at': new Date().toISOString()
  };

  if (section !== undefined && section !== null) {
    fm.section = `${chapter}.${section}`;
  }

  if (type) {
    fm.type = type;
  }

  const yamlStr = yaml.dump(fm, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });

  return `---\n${yamlStr}---\n\n`;
}

/**
 * Write output file
 */
function writeOutput(filePath, content, options) {
  if (options.dryRun) {
    console.log(`[DRY RUN] Would write: ${filePath}`);
    if (options.verbose) {
      console.log(`  Content length: ${content.length} chars`);
    }
    return;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, content);
  console.log(`  Written: ${path.basename(filePath)}`);
}

// ============================================================================
// Main Compilation
// ============================================================================

async function compileChapter(book, chapter, options) {
  const { track, verbose, dryRun } = options;

  // Determine source directory
  let sourceDir = options.sourceDir;
  if (!sourceDir) {
    const sourceFolder = TRACK_SOURCES[track];
    if (!sourceFolder) {
      throw new Error(`Unknown track: ${track}. Valid tracks: ${Object.keys(TRACK_SOURCES).join(', ')}`);
    }
    sourceDir = path.join(PROJECT_ROOT, 'books', book, sourceFolder);
  }

  // Determine output directory
  let outputDir = options.outputDir;
  if (!outputDir) {
    const chapterPadded = chapter.toString().padStart(2, '0');
    outputDir = path.join(
      PROJECT_ROOT, 'books', book, '05-publication', track, 'chapters', chapterPadded
    );
  }

  console.log(`\nCompiling Chapter ${chapter} for ${book}`);
  console.log(`  Track: ${track} (${TRACK_LABELS[track] || track})`);
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Output: ${outputDir}`);
  if (dryRun) console.log('  [DRY RUN MODE]');
  console.log('');

  // Find section files
  const { files, chapterDir } = findSectionFiles(sourceDir, chapter);

  if (files.length === 0) {
    console.log(`No section files found in ${sourceDir}`);

    // Check for DOCX-based structure
    const docxDir = path.join(sourceDir, 'docx');
    if (fs.existsSync(docxDir)) {
      console.log(`Trying DOCX-based structure: ${docxDir}`);
      const docxResult = findSectionFiles(docxDir, chapter);
      if (docxResult.files.length > 0) {
        return compileFromFiles(book, chapter, docxResult.files, outputDir, options);
      }
    }

    return { success: false, message: 'No source files found' };
  }

  return compileFromFiles(book, chapter, files, outputDir, options);
}

async function compileFromFiles(book, chapter, files, outputDir, options) {
  const { track, verbose, dryRun } = options;

  console.log(`Found ${files.length} source file(s)`);
  if (verbose) {
    files.forEach(f => console.log(`  - ${f.filename} (section: ${f.sectionNum}, EOC: ${f.isEOC})`));
  }
  console.log('');

  // Separate regular sections from pre-existing EOC files
  const regularFiles = files.filter(f => !f.isEOC);
  const existingEOCFiles = files.filter(f => f.isEOC);

  // Collected EOC content from all sections
  const collectedEOC = {
    summary: [],
    exercises: [],
    keyTerms: [],
    keyEquations: []
  };

  // Process regular section files
  console.log('Processing section files...');
  for (const file of regularFiles) {
    if (verbose) {
      console.log(`  Processing: ${file.filename}`);
    }

    const result = processSectionFile(file.path, options);

    // Collect extracted EOC content
    for (const [type, content] of Object.entries(result.extractedContent)) {
      if (content.length > 0) {
        collectedEOC[type].push(...content);
        if (verbose) {
          console.log(`    Extracted ${type}: ${content.length} block(s)`);
        }
      }
    }

    // Write cleaned section file
    let outputFilename;
    if (file.isIntro) {
      outputFilename = `${chapter}-0-introduction.md`;
    } else {
      outputFilename = `${chapter}-${file.sectionNum}.md`;
    }

    const frontmatter = generateFrontmatter({
      title: result.frontmatter?.title || result.frontmatter?.titleIs || '',
      chapter: chapter,
      section: file.isIntro ? 0 : file.sectionNum,
      track: track
    });

    const outputContent = frontmatter + result.cleanContent;
    writeOutput(path.join(outputDir, outputFilename), outputContent, options);
  }

  // Process pre-existing EOC files (if any)
  for (const file of existingEOCFiles) {
    const content = fs.readFileSync(file.path, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (file.eocType && body.trim()) {
      collectedEOC[file.eocType].push(body.trim());
      if (verbose) {
        console.log(`  Included existing EOC file: ${file.filename} as ${file.eocType}`);
      }
    }
  }

  // Write compiled EOC files
  console.log('\nWriting end-of-chapter files...');
  for (const [type, config] of Object.entries(EOC_FILES)) {
    const content = collectedEOC[type];
    if (content.length === 0) {
      if (verbose) {
        console.log(`  Skipping ${config.filename} (no content)`);
      }
      continue;
    }

    const outputFilename = `${chapter}-${config.filename}.md`;
    const title = config.titleIs;

    const frontmatter = generateFrontmatter({
      title: title,
      chapter: chapter,
      track: track,
      type: type
    });

    // Combine all content blocks
    let combinedContent = `## ${title}\n\n`;
    let rawContent = content.join('\n\n');

    // Special formatting for key-terms: convert to definition list syntax
    if (type === 'keyTerms') {
      rawContent = formatKeyTermsContent(rawContent);
    }

    combinedContent += rawContent;

    const outputContent = frontmatter + combinedContent;
    writeOutput(path.join(outputDir, outputFilename), outputContent, options);
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Compilation complete');
  console.log(`  Sections processed: ${regularFiles.length}`);
  console.log(`  Existing EOC files: ${existingEOCFiles.length}`);
  console.log(`  Summary blocks: ${collectedEOC.summary.length}`);
  console.log(`  Exercise blocks: ${collectedEOC.exercises.length}`);
  console.log(`  Key Terms blocks: ${collectedEOC.keyTerms.length}`);
  console.log(`  Key Equations blocks: ${collectedEOC.keyEquations.length}`);

  return {
    success: true,
    stats: {
      sectionsProcessed: regularFiles.length,
      existingEOCFiles: existingEOCFiles.length,
      summary: collectedEOC.summary.length,
      exercises: collectedEOC.exercises.length,
      keyTerms: collectedEOC.keyTerms.length,
      keyEquations: collectedEOC.keyEquations.length
    }
  };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.book || !args.chapter) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    const result = await compileChapter(args.book, args.chapter, args);

    if (!result.success) {
      console.error(`\nError: ${result.message}`);
      process.exit(1);
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
