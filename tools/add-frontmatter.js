#!/usr/bin/env node

/**
 * add-frontmatter.js
 *
 * Adds or updates YAML frontmatter in Markdown files for the Chemistry Reader
 * publication system.
 *
 * Features:
 * - Extracts title from first heading
 * - Auto-detects book, chapter, section from file path
 * - Loads book metadata from books/{book}/metadata.json
 * - Loads section titles from books/{book}/chapters/ch{NN}/status.json
 * - Supports update mode to preserve existing frontmatter fields
 * - Batch processing for entire directories
 *
 * Usage:
 *   node tools/add-frontmatter.js <input.md> [options]
 *   node tools/add-frontmatter.js --batch <directory>
 *
 * Options:
 *   --chapter N       Chapter number (auto-detected if not specified)
 *   --section N       Section number (auto-detected if not specified)
 *   --book ID         Book ID (auto-detected if not specified)
 *   --title "Title"   Override title (default: extracted from first heading)
 *   --track TRACK     Publication track: mt-preview, faithful, localized
 *   --mt-preview      Shortcut for --track mt-preview
 *   --update          Update existing frontmatter instead of replacing
 *   --dry-run         Show what would be done without writing
 *   --verbose         Show detailed progress
 *   -h, --help        Show help
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// ============================================================================
// Argument Parsing
// ============================================================================

// Publication track labels (Icelandic)
const TRACK_LABELS = {
  'mt-preview': 'Vélþýðing - ekki yfirfarin',
  faithful: 'Ritstýrð þýðing',
  localized: 'Staðfærð útgáfa',
};

// Valid publication tracks
const VALID_TRACKS = ['mt-preview', 'faithful', 'localized'];

function parseArgs(args) {
  const result = {
    input: null,
    batch: false,
    batchDir: null,
    chapter: null,
    section: null,
    book: null,
    title: null,
    track: null,
    update: false,
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
    } else if (arg === '--update') {
      result.update = true;
    } else if (arg === '--batch') {
      result.batch = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.batchDir = args[++i];
      }
    } else if (arg === '--chapter') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.chapter = parseInt(args[++i], 10);
      }
    } else if (arg === '--section') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.section = parseInt(args[++i], 10);
      }
    } else if (arg === '--book') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.book = args[++i];
      }
    } else if (arg === '--title') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.title = args[++i];
      }
    } else if (arg === '--track') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        const track = args[++i];
        if (VALID_TRACKS.includes(track)) {
          result.track = track;
        } else {
          console.warn(`Warning: Invalid track '${track}'. Valid: ${VALID_TRACKS.join(', ')}`);
        }
      }
    } else if (arg === '--mt-preview') {
      result.track = 'mt-preview';
    } else if (!arg.startsWith('-')) {
      if (!result.input) {
        result.input = arg;
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`
add-frontmatter.js - Add YAML frontmatter to Markdown files

Usage:
  node tools/add-frontmatter.js <input.md> [options]
  node tools/add-frontmatter.js --batch <directory>

Arguments:
  input.md      Path to the Markdown file

Options:
  --chapter N       Chapter number (auto-detected from path/filename)
  --section N       Section number (auto-detected from path/filename)
  --book ID         Book ID: efnafraedi, liffraedi (auto-detected from path)
  --title "Title"   Override title (default: extracted from first heading)
  --track TRACK     Publication track: mt-preview, faithful, localized
  --mt-preview      Shortcut for --track mt-preview (labels as machine translation)
  --update          Merge with existing frontmatter instead of replacing
  --batch <dir>     Process all .md files in directory
  --dry-run         Show what would be done without writing
  --verbose         Show detailed progress
  -h, --help        Show this help message

Publication Tracks:
  mt-preview   Vélþýðing - ekki yfirfarin  (unreviewed machine translation)
  faithful     Ritstýrð þýðing              (human-reviewed linguistic translation)
  localized    Staðfærð útgáfa              (culturally adapted for Iceland)

Auto-Detection:
  The script automatically detects book, chapter, and section from file paths:
  - books/efnafraedi/05-publication/chapters/ch01-sec02.md
    -> book: efnafraedi, chapter: 1, section: 2

Examples:
  # Add frontmatter to a single file
  node tools/add-frontmatter.js books/efnafraedi/05-publication/chapters/ch01-sec01.md

  # Override chapter and section
  node tools/add-frontmatter.js file.md --chapter 3 --section 2

  # Label as MT preview (unreviewed machine translation)
  node tools/add-frontmatter.js file.md --mt-preview

  # Specify publication track
  node tools/add-frontmatter.js file.md --track faithful

  # Update existing frontmatter (preserve custom fields)
  node tools/add-frontmatter.js file.md --update

  # Batch process all files in a directory with MT preview label
  node tools/add-frontmatter.js --batch books/efnafraedi/05-publication/mt-preview/ --mt-preview

  # Dry run to preview changes
  node tools/add-frontmatter.js file.md --dry-run --verbose
`);
}

// ============================================================================
// Path Detection
// ============================================================================

/**
 * Auto-detect book, chapter, section from file path
 */
function detectFromPath(filePath) {
  const absPath = path.resolve(filePath);
  const result = {
    book: null,
    chapter: null,
    section: null,
    projectRoot: null,
  };

  // Try to match book structure path
  const bookMatch = absPath.match(/books\/([^/]+)\//);
  if (bookMatch) {
    result.book = bookMatch[1];

    // Find project root
    const booksIndex = absPath.indexOf('/books/');
    result.projectRoot = absPath.substring(0, booksIndex);
  }

  // Try to extract chapter from path or filename
  const chapterMatch = absPath.match(/ch(\d+)/i);
  if (chapterMatch) {
    result.chapter = parseInt(chapterMatch[1], 10);
  }

  // Try to extract section from filename
  const filename = path.basename(absPath, '.md');

  // Pattern: ch01-sec02 or sec02
  const secMatch = filename.match(/sec(\d+)/i);
  if (secMatch) {
    result.section = parseInt(secMatch[1], 10);
  }

  // Pattern: 1.2-something or just 1.2
  const dotMatch = filename.match(/^(\d+)\.(\d+)/);
  if (dotMatch) {
    if (!result.chapter) result.chapter = parseInt(dotMatch[1], 10);
    if (!result.section) result.section = parseInt(dotMatch[2], 10);
  }

  return result;
}

// ============================================================================
// Metadata Loading
// ============================================================================

/**
 * Load book metadata from books/{book}/metadata.json
 */
function loadBookMetadata(projectRoot, bookId) {
  const metadataPath = path.join(projectRoot, 'books', bookId, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not parse ${metadataPath}: ${err.message}`);
    return null;
  }
}

/**
 * Load chapter status from books/{book}/chapters/ch{NN}/status.json
 */
function loadChapterStatus(projectRoot, bookId, chapter) {
  const chapterPadded = chapter.toString().padStart(2, '0');
  const statusPath = path.join(
    projectRoot,
    'books',
    bookId,
    'chapters',
    `ch${chapterPadded}`,
    'status.json'
  );

  if (!fs.existsSync(statusPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not parse ${statusPath}: ${err.message}`);
    return null;
  }
}

/**
 * Get section title from chapter status
 */
function getSectionTitle(chapterStatus, chapter, section) {
  if (!chapterStatus || !chapterStatus.sections) {
    return null;
  }

  const sectionId = `${chapter}.${section}`;
  const sectionInfo = chapterStatus.sections.find((s) => s.id === sectionId);

  return sectionInfo ? sectionInfo.titleIs : null;
}

// ============================================================================
// Markdown Parsing
// ============================================================================

/**
 * Parse existing frontmatter and content from markdown
 */
function parseMarkdown(content) {
  const result = {
    frontmatter: null,
    content: content,
  };

  // Check for YAML frontmatter (starts with ---)
  if (content.startsWith('---')) {
    const endMatch = content.substring(3).match(/\n---\s*\n/);
    if (endMatch) {
      const frontmatterEnd = 3 + endMatch.index + endMatch[0].length;
      const frontmatterYaml = content.substring(4, 3 + endMatch.index);

      try {
        result.frontmatter = yaml.load(frontmatterYaml);
        result.content = content.substring(frontmatterEnd);
      } catch (err) {
        console.warn(`Warning: Could not parse existing frontmatter: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Extract title from first heading in content
 */
function extractTitle(content) {
  // Match # Heading or ## Heading (first one found)
  const headingMatch = content.match(/^#{1,2}\s+(.+)$/m);
  return headingMatch ? headingMatch[1].trim() : null;
}

/**
 * Extract learning objectives if marked in content
 * Looks for patterns like "Learning Objectives:" or "Markmið:"
 */
function extractObjectives(content) {
  const objectives = [];

  // Look for objectives section
  const objectivesMatch = content.match(
    /(?:learning objectives|markmið|objectives|námsmarkmið)[:\s]*\n((?:[-*]\s+.+\n?)+)/i
  );

  if (objectivesMatch) {
    const listContent = objectivesMatch[1];
    const items = listContent.match(/[-*]\s+(.+)/g);

    if (items) {
      items.forEach((item) => {
        const text = item.replace(/^[-*]\s+/, '').trim();
        if (text) objectives.push(text);
      });
    }
  }

  return objectives;
}

// ============================================================================
// Frontmatter Generation
// ============================================================================

/**
 * Generate frontmatter object
 */
function generateFrontmatter(options) {
  const {
    title,
    chapter,
    section,
    objectives,
    bookMetadata,
    existingFrontmatter,
    updateMode,
    track,
  } = options;

  // Start with existing frontmatter if in update mode
  const frontmatter = updateMode && existingFrontmatter ? { ...existingFrontmatter } : {};

  // Required fields
  frontmatter.title = title || frontmatter.title || '';
  frontmatter.section = section ? `${chapter}.${section}` : frontmatter.section || '';
  frontmatter.chapter = chapter || frontmatter.chapter || 0;

  // Publication track and translation status
  if (track) {
    frontmatter['translation-status'] = TRACK_LABELS[track] || track;
    frontmatter['publication-track'] = track;
    frontmatter['published-at'] = new Date().toISOString();
  }

  // Optional fields - only add if we have data
  if (objectives && objectives.length > 0) {
    frontmatter.objectives = objectives;
  }

  // Preserve keywords from existing frontmatter (these come from CNXML metadata)
  if (
    existingFrontmatter &&
    existingFrontmatter.keywords &&
    existingFrontmatter.keywords.length > 0
  ) {
    frontmatter.keywords = existingFrontmatter.keywords;
  }

  // Preserve subjects from existing frontmatter
  if (
    existingFrontmatter &&
    existingFrontmatter.subjects &&
    existingFrontmatter.subjects.length > 0
  ) {
    frontmatter.subjects = existingFrontmatter.subjects;
  }

  // Source information from book metadata
  if (bookMetadata && bookMetadata.source) {
    frontmatter.source = {
      original: `${bookMetadata.source.title} by ${bookMetadata.source.publisher}`,
      authors: bookMetadata.source.authors.join(', '),
      license: bookMetadata.source.license,
      licenseUrl: bookMetadata.source.licenseUrl,
      originalUrl: bookMetadata.source.url,
      translator: bookMetadata.translation?.translator || 'Unknown',
      translationYear: new Date().getFullYear(),
      modifications: 'Translated to Icelandic, adapted for Icelandic secondary school students',
    };
  }

  return frontmatter;
}

/**
 * Convert frontmatter object to YAML string
 */
function frontmatterToYaml(frontmatter) {
  // Custom dump options for clean output
  const yamlStr = yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  return `---\n${yamlStr}---\n\n`;
}

// ============================================================================
// File Processing
// ============================================================================

async function processFile(filePath, options) {
  const { verbose, dryRun, update, track } = options;

  const absPath = path.resolve(filePath);

  if (verbose) {
    console.log(`\nProcessing: ${absPath}`);
  }

  // Check file exists
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  // Read file content
  const content = fs.readFileSync(absPath, 'utf8');

  // Parse existing frontmatter and content
  const parsed = parseMarkdown(content);

  // Auto-detect from path
  const detected = detectFromPath(absPath);

  // Merge options with detected values (explicit options take precedence)
  const chapter = options.chapter || detected.chapter;
  const section = options.section || detected.section;
  const book = options.book || detected.book;
  const projectRoot = detected.projectRoot || process.cwd();

  if (verbose) {
    console.log(`  Book: ${book || '(unknown)'}`);
    console.log(`  Chapter: ${chapter || '(unknown)'}`);
    console.log(`  Section: ${section || '(unknown)'}`);
  }

  // Load metadata
  let bookMetadata = null;
  let chapterStatus = null;

  if (book && projectRoot) {
    bookMetadata = loadBookMetadata(projectRoot, book);
    if (chapter) {
      chapterStatus = loadChapterStatus(projectRoot, book, chapter);
    }
  }

  // Determine title
  let title = options.title;
  if (!title && chapter && section && chapterStatus) {
    title = getSectionTitle(chapterStatus, chapter, section);
  }
  if (!title) {
    title = extractTitle(parsed.content);
  }

  if (verbose) {
    console.log(`  Title: ${title || '(none found)'}`);
  }

  // Extract objectives from content
  const objectives = extractObjectives(parsed.content);
  if (verbose && objectives.length > 0) {
    console.log(`  Objectives found: ${objectives.length}`);
  }

  // Log track if verbose
  if (verbose && track) {
    console.log(`  Track: ${track} (${TRACK_LABELS[track]})`);
  }

  // Generate frontmatter
  const frontmatter = generateFrontmatter({
    title,
    chapter,
    section,
    objectives,
    bookMetadata,
    existingFrontmatter: parsed.frontmatter,
    updateMode: update,
    track,
  });

  // Generate output
  const yamlHeader = frontmatterToYaml(frontmatter);
  const output = yamlHeader + parsed.content;

  // Write or show dry run
  if (!dryRun) {
    fs.writeFileSync(absPath, output);
    console.log(`Updated: ${absPath}`);
  } else {
    console.log(`[DRY RUN] Would update: ${absPath}`);
    if (verbose) {
      console.log('\nGenerated frontmatter:');
      console.log(yamlHeader);
    }
  }

  return { filePath: absPath, title, chapter, section };
}

// ============================================================================
// Batch Processing
// ============================================================================

async function processBatch(directory, options) {
  const { dryRun } = options;

  const absDir = path.resolve(directory);

  if (!fs.existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

  // Find all .md files
  const files = findMarkdownFiles(absDir);

  if (files.length === 0) {
    console.log(`No .md files found in ${absDir}`);
    return;
  }

  console.log(`Found ${files.length} .md file(s) in ${absDir}`);
  if (dryRun) {
    console.log('[DRY RUN MODE]');
  }
  console.log('');

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const file of files) {
    try {
      await processFile(file, options);
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ file, error: err.message });
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Batch Processing Complete');
  console.log(`  Successful: ${results.success}`);
  console.log(`  Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(({ file, error }) => {
      console.log(`  ${path.basename(file)}: ${error}`);
    });
  }
}

/**
 * Find all .md files in directory (non-recursive for safety)
 */
function findMarkdownFiles(dir) {
  const files = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files.sort();
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.input && !args.batch)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  try {
    if (args.batch) {
      const batchDir = args.batchDir || args.input;
      if (!batchDir) {
        console.error('Error: --batch requires a directory path');
        process.exit(1);
      }
      await processBatch(batchDir, args);
    } else {
      await processFile(args.input, args);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
