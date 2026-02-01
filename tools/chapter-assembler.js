#!/usr/bin/env node

/**
 * chapter-assembler.js
 *
 * Assembles 7 module files into 12 publication files for the Chemistry Reader website.
 * This tool takes faithful translations (or MT output) and produces:
 *
 * 1. 7 stripped module content files (without exercises, summary, key terms sections)
 * 2. 1 aggregated key terms file (alphabetized definitions)
 * 3. 1 aggregated key equations file
 * 4. 1 aggregated summary file (organized by section)
 * 5. 1 aggregated exercises file (running numbers with section headers)
 *
 * Answers are collected for a separate appendix file.
 *
 * Usage:
 *   node tools/chapter-assembler.js --chapter 1 --input 03-faithful/ch01 --output 05-publication/ch01
 *   node tools/chapter-assembler.js --chapter 1 --book efnafraedi
 *   node tools/chapter-assembler.js --chapter 1 --book efnafraedi --track mt-preview
 *
 * Options:
 *   --chapter N       Chapter number (required)
 *   --book ID         Book ID (default: efnafraedi)
 *   --input DIR       Input directory with module files (auto-detected from book)
 *   --output DIR      Output directory for publication files (auto-detected from book)
 *   --track TRACK     Publication track: mt-preview, faithful, localized (default: faithful)
 *   --lang LANG       Language code for output files (default: is)
 *   --dry-run         Show what would be done without writing
 *   --verbose         Show detailed progress
 *   -h, --help        Show help
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const SECTION_TITLES = {
  en: {
    keyTerms: 'Key Terms',
    keyEquations: 'Key Equations',
    summary: 'Summary',
    exercises: 'Exercises',
  },
  is: {
    keyTerms: 'Lykilhugtök',
    keyEquations: 'Lykiljöfnur',
    summary: 'Samantekt',
    exercises: 'Æfingar',
  },
};

const TRACK_LABELS = {
  'mt-preview': 'Vélþýðing - ekki yfirfarin',
  faithful: 'Ritstýrð þýðing',
  localized: 'Staðfærð útgáfa',
};

// Module file patterns (order matters) - reserved for future use
// eslint-disable-next-line no-unused-vars
const MODULE_PATTERNS = [
  { pattern: /^intro\./, section: 'intro', order: 0 },
  { pattern: /^(\d+)-(\d+)\./, section: null, order: null }, // Dynamic: 1-1, 1-2, etc.
];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    chapter: null,
    book: 'efnafraedi',
    inputDir: null,
    outputDir: null,
    track: 'faithful',
    lang: 'is',
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
    } else if (arg === '--chapter' && args[i + 1]) {
      result.chapter = parseInt(args[++i], 10);
    } else if (arg === '--book' && args[i + 1]) {
      result.book = args[++i];
    } else if (arg === '--input' && args[i + 1]) {
      result.inputDir = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      result.outputDir = args[++i];
    } else if (arg === '--track' && args[i + 1]) {
      result.track = args[++i];
    } else if (arg === '--lang' && args[i + 1]) {
      result.lang = args[++i];
    }
  }

  return result;
}

function printHelp() {
  console.log(`
chapter-assembler.js - Assemble module files into publication structure

Takes 7 module files and produces 12 publication files:
  - 7 stripped module content files (intro, 1.1-1.6)
  - 1 aggregated key terms file (alphabetized)
  - 1 aggregated key equations file
  - 1 aggregated summary file (by section)
  - 1 aggregated exercises file (running numbers)

Usage:
  node tools/chapter-assembler.js --chapter N [options]

Required:
  --chapter N       Chapter number to process

Options:
  --book ID         Book identifier (default: efnafraedi)
  --input DIR       Input directory with module files
  --output DIR      Output directory for publication files
  --track TRACK     Publication track: mt-preview, faithful, localized
  --lang LANG       Language code for output files (default: is)
  --dry-run         Show what would be done without writing
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Process chapter 1 from faithful translations
  node tools/chapter-assembler.js --chapter 1 --book efnafraedi

  # Process from MT output with mt-preview track
  node tools/chapter-assembler.js --chapter 1 --book efnafraedi --track mt-preview

  # Custom input/output directories
  node tools/chapter-assembler.js --chapter 1 --input ./my-input --output ./my-output

Output Structure:
  {output}/
  ├── {ch}-0-introduction.{lang}.md     # stripped intro
  ├── {ch}-1-section-name.{lang}.md     # stripped section 1
  ├── ...
  ├── {ch}-key-terms.{lang}.md          # aggregated, alphabetized
  ├── {ch}-key-equations.{lang}.md      # aggregated
  ├── {ch}-summary.{lang}.md            # aggregated by section
  └── {ch}-exercises.{lang}.md          # aggregated, running numbers
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

function resolveInputDir(options) {
  if (options.inputDir) {
    return path.resolve(options.inputDir);
  }

  const projectRoot = getProjectRoot();
  const chapterPadded = options.chapter.toString().padStart(2, '0');

  // Determine source directory based on track
  let sourceDir;
  if (options.track === 'mt-preview') {
    sourceDir = '02-mt-output';
  } else if (options.track === 'faithful') {
    sourceDir = '03-faithful';
  } else {
    sourceDir = '04-localized';
  }

  return path.join(projectRoot, 'books', options.book, sourceDir, `ch${chapterPadded}`);
}

function resolveOutputDir(options) {
  if (options.outputDir) {
    return path.resolve(options.outputDir);
  }

  const projectRoot = getProjectRoot();
  const chapterPadded = options.chapter.toString().padStart(2, '0');

  // Output goes to 05-publication/{track}/chapters/{NN}
  return path.join(
    projectRoot,
    'books',
    options.book,
    '05-publication',
    options.track,
    'chapters',
    chapterPadded
  );
}

// ============================================================================
// File Discovery
// ============================================================================

function findModuleFiles(inputDir, chapter, lang) {
  const files = [];

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const entries = fs.readdirSync(inputDir);

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    // Match intro.{lang}.md or {ch}-{sec}.{lang}.md
    const introMatch = entry.match(new RegExp(`^intro\\.${lang}\\.md$`));
    const sectionMatch = entry.match(new RegExp(`^(\\d+)-(\\d+)\\.${lang}\\.md$`));

    // Also try without language suffix for backwards compatibility
    const introMatchNoLang = entry.match(/^intro\.(?:en|is)\.md$/);
    const sectionMatchNoLang = entry.match(/^(\d+)-(\d+)\.(?:en|is)\.md$/);

    if (introMatch || introMatchNoLang) {
      files.push({
        filename: entry,
        path: path.join(inputDir, entry),
        section: 'intro',
        sectionNum: 0,
        sectionId: `${chapter}.0`,
        order: 0,
      });
    } else if (sectionMatch) {
      const chNum = parseInt(sectionMatch[1], 10);
      const secNum = parseInt(sectionMatch[2], 10);
      if (chNum === chapter) {
        files.push({
          filename: entry,
          path: path.join(inputDir, entry),
          section: `${chNum}.${secNum}`,
          sectionNum: secNum,
          sectionId: `${chNum}.${secNum}`,
          order: secNum,
        });
      }
    } else if (sectionMatchNoLang) {
      const chNum = parseInt(sectionMatchNoLang[1], 10);
      const secNum = parseInt(sectionMatchNoLang[2], 10);
      if (chNum === chapter) {
        files.push({
          filename: entry,
          path: path.join(inputDir, entry),
          section: `${chNum}.${secNum}`,
          sectionNum: secNum,
          sectionId: `${chNum}.${secNum}`,
          order: secNum,
        });
      }
    }
  }

  // Sort by order
  files.sort((a, b) => a.order - b.order);

  return files;
}

// ============================================================================
// Content Parsing
// ============================================================================

/**
 * Parse markdown file into frontmatter and content
 */
function parseMarkdown(content) {
  const result = {
    frontmatter: {},
    content: content,
  };

  if (content.startsWith('---')) {
    const endMatch = content.substring(3).match(/\n---\s*\n/);
    if (endMatch) {
      const frontmatterEnd = 3 + endMatch.index + endMatch[0].length;
      const frontmatterYaml = content.substring(4, 3 + endMatch.index);

      try {
        result.frontmatter = yaml.load(frontmatterYaml) || {};
        result.content = content.substring(frontmatterEnd);
      } catch (err) {
        console.warn(`Warning: Could not parse frontmatter: ${err.message}`);
      }
    }
  }

  return result;
}

/**
 * Extract Key Concepts and Summary section
 */
function extractSummary(content) {
  // Match "## Key Concepts and Summary" or similar
  const summaryMatch = content.match(
    /^##\s+(?:Key Concepts and Summary|Lykilhugtök og samantekt|Samantekt)\s*\n([\s\S]*?)(?=^##\s+(?:Key Equations|Chemistry End of Chapter|Lykiljöfnur|Lykiljafna|Æfingar|Efnafræði\s*[–-]\s*verkefni)|$)/m
  );

  if (summaryMatch) {
    return {
      found: true,
      content: summaryMatch[1].trim(),
      fullMatch: summaryMatch[0],
    };
  }

  return { found: false, content: '', fullMatch: '' };
}

/**
 * Extract Key Equations section
 * Supports:
 *   - "## Key Equations" (English)
 *   - "## Lykiljöfnur" (Icelandic plural)
 *   - "## Lykiljafna" (Icelandic singular, from MT)
 */
function extractKeyEquations(content) {
  // Match "## Key Equations" / "## Lykiljöfnur" / "## Lykiljafna" section
  const eqMatch = content.match(
    /^##\s+(?:Key Equations|Lykiljöfnur|Lykiljafna)\s*\n([\s\S]*?)(?=^##\s+(?:Chemistry End of Chapter|Æfingar|Efnafræði\s*[–-]\s*verkefni)|$)/m
  );

  if (eqMatch) {
    // Extract equation references - supports [[EQ:n]] and [[TABLE:n]] formats
    // Also handles escaped versions \[\[EQ:n\]\] from MT output
    const equations = [];
    const eqRefPattern = /\\?\[\\?\[(?:EQ|TABLE):(\d+)\\?\]\\?\]/g;
    let match;
    while ((match = eqRefPattern.exec(eqMatch[1])) !== null) {
      equations.push({
        id: match[1],
        ref: match[0],
      });
    }

    return {
      found: true,
      content: eqMatch[1].trim(),
      equations,
      fullMatch: eqMatch[0],
    };
  }

  return { found: false, content: '', equations: [], fullMatch: '' };
}

/**
 * Extract practice problems (exercises)
 * Supports multiple directive formats:
 *   - :::practice-problem{#id} - original format
 *   - :::æfingadæmi{#id} - Icelandic alias
 *   - :::exercise{id="id"} - MT output format (with id= attribute)
 *   - :::exercise{#id} - shorthand format
 */
function extractExercises(content) {
  const exercises = [];

  // Pattern 1: :::practice-problem{#id} or :::æfingadæmi{#id} format
  const problemPattern1 =
    /:::(?:practice-problem|æfingadæmi)\{#([^}]+)\}([\s\S]*?)(?=:::(?:practice-problem|æfingadæmi|exercise)|$)/g;

  // Pattern 2: :::exercise{id="id"} format (MT output - content may be on same line)
  const problemPattern2 =
    /:::exercise\{id="([^"]+)"\}\s*([\s\S]*?)(?=:::exercise\{|:::(?:practice-problem|æfingadæmi)|$)/g;

  // Pattern 3: :::exercise{#id} shorthand format
  const problemPattern3 =
    /:::exercise\{#([^}]+)\}([\s\S]*?)(?=:::exercise\{|:::(?:practice-problem|æfingadæmi)|$)/g;

  // Process all patterns
  for (const pattern of [problemPattern1, problemPattern2, problemPattern3]) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const problemId = match[1];
      let problemContent = match[2];

      // Extract answer if present (supports :::answer and :::svar - Icelandic alias)
      // Handle both block format and inline format (content on same line as :::answer)
      let answer = null;

      // Try block format first: :::answer\ncontent\n:::
      let answerMatch = problemContent.match(/:::(?:answer|svar)\s*\n([\s\S]*?)(?::::|$)/);
      if (answerMatch) {
        answer = answerMatch[1].trim();
      } else {
        // Try inline format: :::answer content (no closing :::)
        answerMatch = problemContent.match(/:::(?:answer|svar)\s+([^\n]+(?:\n(?!:::)[^\n]*)*)/);
        if (answerMatch) {
          answer = answerMatch[1].trim();
        }
      }

      if (answer) {
        // Remove answer block from problem content
        problemContent = problemContent.replace(/:::(?:answer|svar)[\s\S]*$/m, '').trim();
      }

      // Clean up trailing ::: from problem content
      problemContent = problemContent.replace(/:::\s*$/m, '').trim();

      // Skip if we already have this exercise (avoid duplicates from overlapping patterns)
      if (exercises.some((e) => e.id === problemId)) {
        continue;
      }

      exercises.push({
        id: problemId,
        content: problemContent,
        answer: answer,
        fullMatch: match[0],
      });
    }
  }

  return exercises;
}

/**
 * Extract term definitions from content
 * Terms are marked as **term**{#term-NNNNN} in the content
 */
function extractTerms(content) {
  const terms = [];

  // Match **term**{#term-NNNNN} pattern
  const termPattern = /\*\*([^*]+)\*\*\{#(term-\d+)\}/g;

  let match;
  while ((match = termPattern.exec(content)) !== null) {
    const term = match[1];
    const termId = match[2];

    // Try to extract definition from context
    // Usually the definition follows immediately or is in the surrounding sentence
    terms.push({
      term: term,
      id: termId,
      fullMatch: match[0],
    });
  }

  return terms;
}

/**
 * Remove extracted sections from content
 */
function stripSections(content) {
  let stripped = content;

  // Remove "## Key Concepts and Summary" section
  stripped = stripped.replace(
    /^##\s+(?:Key Concepts and Summary|Lykilhugtök og samantekt|Samantekt)\s*\n[\s\S]*?(?=^##\s+(?:Key Equations|Chemistry End of Chapter|Lykiljöfnur|Lykiljafna|Æfingar|Efnafræði\s*[–-]\s*verkefni)|$)/m,
    ''
  );

  // Remove "## Key Equations" section (supports singular and plural Icelandic)
  stripped = stripped.replace(
    /^##\s+(?:Key Equations|Lykiljöfnur|Lykiljafna)\s*\n[\s\S]*?(?=^##\s+(?:Chemistry End of Chapter|Æfingar|Efnafræði\s*[–-]\s*verkefni)|$)/m,
    ''
  );

  // Remove "## Chemistry End of Chapter Exercises" section and all practice problems
  // Supports multiple heading formats:
  //   - "## Chemistry End of Chapter Exercises" (English)
  //   - "## Æfingar" (Icelandic short)
  //   - "## Efnafræði – verkefni í lok kafla" (Icelandic long from MT)
  stripped = stripped.replace(
    /^##\s+(?:Chemistry End of Chapter Exercises|Æfingar|Efnafræði\s*[–-]\s*verkefni í lok kafla)\s*\n[\s\S]*/m,
    ''
  );

  // Also remove any standalone :::exercise blocks that might be scattered in content
  stripped = stripped.replace(
    /:::exercise\{(?:id="[^"]+"|#[^}]+)\}[\s\S]*?(?=:::exercise\{|:::(?:practice-problem|æfingadæmi)|^##\s+|$)/gm,
    ''
  );

  // Remove :::practice-problem and :::æfingadæmi blocks
  stripped = stripped.replace(
    /:::(?:practice-problem|æfingadæmi)\{#[^}]+\}[\s\S]*?(?=:::(?:practice-problem|æfingadæmi|exercise)|^##\s+|$)/gm,
    ''
  );

  // Clean up multiple blank lines
  stripped = stripped.replace(/\n{3,}/g, '\n\n');

  return stripped.trim();
}

// ============================================================================
// Output Generation
// ============================================================================

/**
 * Generate YAML frontmatter string
 */
function generateFrontmatter(data) {
  const yamlStr = yaml.dump(data, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  return `---\n${yamlStr}---\n\n`;
}

/**
 * Generate output filename for module content
 */
function getModuleOutputFilename(chapter, section, title, lang) {
  const chapterStr = chapter.toString();

  if (section === 'intro') {
    return `${chapterStr}-0-introduction.${lang}.md`;
  }

  // Convert title to slug
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

  const sectionNum = section.split('.')[1];
  return `${chapterStr}-${sectionNum}-${slug}.${lang}.md`;
}

/**
 * Write aggregated key terms file
 * Uses markdown definition list syntax for better styling:
 *   **Term**
 *   : definition text
 */
function writeKeyTermsFile(outputDir, chapter, terms, options) {
  const titles = SECTION_TITLES[options.lang] || SECTION_TITLES.en;

  // Sort terms alphabetically (case-insensitive)
  const sortedTerms = [...terms].sort((a, b) =>
    a.term.toLowerCase().localeCompare(b.term.toLowerCase(), options.lang)
  );

  // Generate content with definition list syntax
  let content = `## ${titles.keyTerms}\n\n`;

  for (const term of sortedTerms) {
    // Format term with ID if available
    const termText = term.id ? `**${term.term}**{#${term.id}}` : `**${term.term}**`;

    content += `${termText}\n`;
    if (term.definition) {
      // Use definition list syntax (colon prefix)
      content += `: ${term.definition}\n`;
    }
    content += '\n';
  }

  const frontmatter = {
    title: titles.keyTerms,
    chapter: chapter,
    'translation-status': TRACK_LABELS[options.track] || options.track,
    'publication-track': options.track,
    'published-at': new Date().toISOString(),
    type: 'keyTerms',
  };

  const outputPath = path.join(outputDir, `${chapter}-key-terms.${options.lang}.md`);
  const output = generateFrontmatter(frontmatter) + content;

  if (!options.dryRun) {
    fs.writeFileSync(outputPath, output);
  }

  return { path: outputPath, termCount: sortedTerms.length };
}

/**
 * Write aggregated key equations file
 */
function writeKeyEquationsFile(outputDir, chapter, equations, options) {
  const titles = SECTION_TITLES[options.lang] || SECTION_TITLES.en;

  // Generate content
  let content = `## ${titles.keyEquations}\n\n`;

  for (const eq of equations) {
    content += `- ${eq.ref}\n`;
  }

  const frontmatter = {
    title: titles.keyEquations,
    chapter: chapter,
    'translation-status': TRACK_LABELS[options.track] || options.track,
    'publication-track': options.track,
    'published-at': new Date().toISOString(),
    type: 'keyEquations',
  };

  const outputPath = path.join(outputDir, `${chapter}-key-equations.${options.lang}.md`);
  const output = generateFrontmatter(frontmatter) + content;

  if (!options.dryRun) {
    fs.writeFileSync(outputPath, output);
  }

  return { path: outputPath, equationCount: equations.length };
}

/**
 * Write aggregated summary file
 */
function writeSummaryFile(outputDir, chapter, summaries, options) {
  const titles = SECTION_TITLES[options.lang] || SECTION_TITLES.en;

  // Generate content
  let content = `## ${titles.summary}\n\n`;

  for (const summary of summaries) {
    content += `### ${summary.sectionId} ${summary.title}\n\n`;
    content += summary.content + '\n\n';
  }

  const frontmatter = {
    title: titles.summary,
    chapter: chapter,
    'translation-status': TRACK_LABELS[options.track] || options.track,
    'publication-track': options.track,
    'published-at': new Date().toISOString(),
    type: 'summary',
  };

  const outputPath = path.join(outputDir, `${chapter}-summary.${options.lang}.md`);
  const output = generateFrontmatter(frontmatter) + content;

  if (!options.dryRun) {
    fs.writeFileSync(outputPath, output);
  }

  return { path: outputPath, sectionCount: summaries.length };
}

/**
 * Write aggregated exercises file
 */
function writeExercisesFile(outputDir, chapter, exercisesBySection, options) {
  const titles = SECTION_TITLES[options.lang] || SECTION_TITLES.en;

  // Generate content with running numbers and section headers
  let content = `## ${titles.exercises}\n\n`;
  let exerciseNumber = 1;
  const answers = [];

  for (const section of exercisesBySection) {
    if (section.exercises.length === 0) continue;

    content += `### ${section.sectionId} ${section.title}\n\n`;

    for (const exercise of section.exercises) {
      // Add exercise number
      content += `**${exerciseNumber}.**\n\n`;
      content += exercise.content + '\n\n';

      // Collect answer for appendix
      if (exercise.answer) {
        answers.push({
          number: exerciseNumber,
          chapter: chapter,
          answer: exercise.answer,
        });
      }

      exerciseNumber++;
    }
  }

  const frontmatter = {
    title: titles.exercises,
    chapter: chapter,
    'translation-status': TRACK_LABELS[options.track] || options.track,
    'publication-track': options.track,
    'published-at': new Date().toISOString(),
    type: 'exercises',
  };

  const outputPath = path.join(outputDir, `${chapter}-exercises.${options.lang}.md`);
  const output = generateFrontmatter(frontmatter) + content;

  if (!options.dryRun) {
    fs.writeFileSync(outputPath, output);
  }

  return {
    path: outputPath,
    exerciseCount: exerciseNumber - 1,
    answers: answers,
  };
}

/**
 * Write stripped module content file
 */
function writeModuleFile(outputDir, moduleData, options) {
  const { chapter, section, title, strippedContent, frontmatter } = moduleData;

  const outputFilename = getModuleOutputFilename(chapter, section, title, options.lang);
  const outputPath = path.join(outputDir, outputFilename);

  // Update frontmatter
  const newFrontmatter = {
    ...frontmatter,
    'translation-status': TRACK_LABELS[options.track] || options.track,
    'publication-track': options.track,
    'published-at': new Date().toISOString(),
  };

  const output = generateFrontmatter(newFrontmatter) + strippedContent;

  if (!options.dryRun) {
    fs.writeFileSync(outputPath, output);
  }

  return { path: outputPath, filename: outputFilename };
}

// ============================================================================
// Main Processing
// ============================================================================

async function assembleChapter(options) {
  const { chapter, verbose, dryRun, lang } = options;

  const inputDir = resolveInputDir(options);
  const outputDir = resolveOutputDir(options);

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Chapter ${chapter} Assembly`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Chapter: ${chapter}`);
    console.log(`  Book: ${options.book}`);
    console.log(`  Track: ${options.track}`);
    console.log(`  Language: ${lang}`);
    console.log(`  Input: ${inputDir}`);
    console.log(`  Output: ${outputDir}`);
    console.log('');
  }

  // Find module files
  const moduleFiles = findModuleFiles(inputDir, chapter, lang);

  if (moduleFiles.length === 0) {
    throw new Error(`No module files found in ${inputDir}`);
  }

  console.log(`Found ${moduleFiles.length} module files:`);
  for (const file of moduleFiles) {
    console.log(`  • ${file.filename} (${file.section})`);
  }
  console.log('');

  // Ensure output directory exists
  if (!dryRun && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    if (verbose) {
      console.log(`Created output directory: ${outputDir}`);
    }
  }

  // Aggregation buffers
  const allTerms = [];
  const allEquations = [];
  const allSummaries = [];
  const allExercisesBySection = [];

  // Process each module file
  console.log('Processing modules...');
  console.log('');

  for (const moduleFile of moduleFiles) {
    console.log(`─`.repeat(60));
    console.log(`Processing: ${moduleFile.filename}`);

    // Read and parse file
    const content = fs.readFileSync(moduleFile.path, 'utf8');
    const parsed = parseMarkdown(content);

    // Extract title from frontmatter or content
    let title = parsed.frontmatter.title || '';
    if (!title) {
      const headingMatch = parsed.content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].trim();
      }
    }

    if (verbose) {
      console.log(`  Title: ${title}`);
      console.log(`  Section: ${moduleFile.section}`);
    }

    // Extract sections
    const summary = extractSummary(parsed.content);
    const keyEquations = extractKeyEquations(parsed.content);
    const exercises = extractExercises(parsed.content);
    const terms = extractTerms(parsed.content);

    if (verbose) {
      console.log(`  Summary: ${summary.found ? 'found' : 'not found'}`);
      console.log(`  Key Equations: ${keyEquations.equations.length} found`);
      console.log(`  Exercises: ${exercises.length} found`);
      console.log(`  Terms: ${terms.length} found`);
    }

    // Aggregate
    if (summary.found && moduleFile.section !== 'intro') {
      allSummaries.push({
        sectionId: moduleFile.sectionId,
        title: title,
        content: summary.content,
      });
    }

    allEquations.push(...keyEquations.equations);

    if (exercises.length > 0) {
      allExercisesBySection.push({
        sectionId: moduleFile.sectionId,
        title: title,
        exercises: exercises,
      });
    }

    allTerms.push(...terms);

    // Strip sections and write module file
    const strippedContent = stripSections(parsed.content);

    const moduleResult = writeModuleFile(
      outputDir,
      {
        chapter,
        section: moduleFile.section,
        title,
        strippedContent,
        frontmatter: parsed.frontmatter,
      },
      options
    );

    console.log(`  → ${moduleResult.filename}`);
    console.log('');
  }

  // Write aggregated files
  console.log('─'.repeat(60));
  console.log('Writing aggregated files...');
  console.log('');

  // Key Terms
  const termsResult = writeKeyTermsFile(outputDir, chapter, allTerms, options);
  console.log(`  Key Terms: ${termsResult.termCount} terms → ${path.basename(termsResult.path)}`);

  // Key Equations
  const equationsResult = writeKeyEquationsFile(outputDir, chapter, allEquations, options);
  console.log(
    `  Key Equations: ${equationsResult.equationCount} equations → ${path.basename(equationsResult.path)}`
  );

  // Summary
  const summaryResult = writeSummaryFile(outputDir, chapter, allSummaries, options);
  console.log(
    `  Summary: ${summaryResult.sectionCount} sections → ${path.basename(summaryResult.path)}`
  );

  // Exercises
  const exercisesResult = writeExercisesFile(outputDir, chapter, allExercisesBySection, options);
  console.log(
    `  Exercises: ${exercisesResult.exerciseCount} exercises → ${path.basename(exercisesResult.path)}`
  );
  console.log(`  Answers collected: ${exercisesResult.answers.length}`);

  // Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log(dryRun ? 'Assembly Complete (DRY RUN)' : 'Assembly Complete');
  console.log('═'.repeat(60));
  console.log('');

  console.log('Output files:');
  console.log(`  Module files: ${moduleFiles.length}`);
  console.log(`  Key Terms: ${termsResult.termCount} terms`);
  console.log(`  Key Equations: ${equationsResult.equationCount} equations`);
  console.log(`  Summary: ${summaryResult.sectionCount} sections`);
  console.log(`  Exercises: ${exercisesResult.exerciseCount} exercises`);
  console.log('');

  console.log(`Output directory: ${outputDir}`);
  console.log('');

  return {
    success: true,
    chapter,
    outputDir,
    moduleCount: moduleFiles.length,
    termCount: termsResult.termCount,
    equationCount: equationsResult.equationCount,
    summaryCount: summaryResult.sectionCount,
    exerciseCount: exercisesResult.exerciseCount,
    answers: exercisesResult.answers,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.chapter) {
    console.error('Error: --chapter N is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    await assembleChapter(args);
    process.exit(0);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Only run CLI if executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  main();
}

// Export for programmatic use
export {
  assembleChapter,
  findModuleFiles,
  parseMarkdown,
  // Exports for testing
  parseArgs,
  extractSummary,
  extractKeyEquations,
  extractExercises,
  extractTerms,
  stripSections,
  getModuleOutputFilename,
  SECTION_TITLES,
  TRACK_LABELS,
};
