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
import { cleanupMarkdown } from './cleanup-markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// Image Handling
// ============================================================================

/**
 * Extract all image paths referenced in content
 * Handles patterns like: ![alt](images/media/CNX_Chem_01_01_Name.jpg)
 * @param {string} content - Markdown content
 * @returns {string[]} Array of unique image filenames
 */
function extractImageReferences(content) {
  const imagePattern = /!\[[^\]]*\]\(images\/media\/([^)]+)\)/g;
  const images = new Set();
  let match;
  while ((match = imagePattern.exec(content)) !== null) {
    images.add(match[1]);
  }
  return Array.from(images);
}

/**
 * Copy referenced images from source media to publication output
 * @param {string[]} imageFiles - Array of image filenames to copy
 * @param {string} sourceMediaDir - Path to 01-source/media/
 * @param {string} outputImagesDir - Path to output images/media/
 * @param {object} options - Processing options (dryRun, verbose)
 * @returns {object} Stats about copied images
 */
function copyImages(imageFiles, sourceMediaDir, outputImagesDir, options) {
  const stats = { copied: 0, missing: 0, skipped: 0 };

  if (imageFiles.length === 0) {
    return stats;
  }

  // Create output directory if it doesn't exist
  if (!options.dryRun && !fs.existsSync(outputImagesDir)) {
    fs.mkdirSync(outputImagesDir, { recursive: true });
  }

  for (const imageFile of imageFiles) {
    const sourcePath = path.join(sourceMediaDir, imageFile);
    const destPath = path.join(outputImagesDir, imageFile);

    if (!fs.existsSync(sourcePath)) {
      stats.missing++;
      if (options.verbose) {
        console.log(`  Warning: Image not found: ${imageFile}`);
      }
      continue;
    }

    if (fs.existsSync(destPath)) {
      stats.skipped++;
      if (options.verbose) {
        console.log(`  Skipping (exists): ${imageFile}`);
      }
      continue;
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Would copy: ${imageFile}`);
      stats.copied++;
    } else {
      fs.copyFileSync(sourcePath, destPath);
      stats.copied++;
      if (options.verbose) {
        console.log(`  Copied: ${imageFile}`);
      }
    }
  }

  return stats;
}

// ============================================================================
// Content Cleanup
// ============================================================================

/**
 * Clean Pandoc-style attributes and artifacts from markdown
 * Uses the cleanup-markdown module which handles figure number resolution
 * for cross-references.
 */
function cleanupContent(content) {
  const { result } = cleanupMarkdown(content, false);
  return result;
}

// ============================================================================
// Configuration
// ============================================================================

// Publication tracks and their source directories
const TRACK_SOURCES = {
  'mt-preview': '02-mt-output',
  faithful: '03-faithful',
  localized: '04-localized',
};

// Track labels for frontmatter
const TRACK_LABELS = {
  'mt-preview': 'Vélþýðing - ekki yfirfarin',
  faithful: 'Ritstýrð þýðing',
  localized: 'Staðfærð útgáfa',
};

// End-of-chapter content patterns
// NOTE: Directive patterns take priority over heading patterns (language-agnostic)
const EOC_PATTERNS = {
  // Directive-based patterns (:::directive) - PREFERRED, language-agnostic
  summaryDirective: /^:::(?:summary|samantekt)\b/i,
  exercisesDirective: /^:::(?:exercises|æfingar)\b/i,
  glossaryDirective: /^:::(?:glossary|ordabok|orðabók)\b/i,
  keyEquationsDirective: /^:::(?:key-equations?|lykiljöfnur)\b/i,
  keyTermsDirective: /^:::(?:key-terms?|lykilhugtök)\b/i,
  practiceProblems: /^:::practice-problem\b/,

  // Heading-based patterns (## Heading) - fallback for content without directives
  // Summary patterns (Icelandic and English)
  keyConceptsSummary:
    /^##\s+(?:Key Concepts and Summary|Lykilhugtök og samantekt|Samantekt|Yfirlit|Summary)/i,

  // Exercises patterns (Icelandic and English)
  exercises:
    /^##\s+(?:Chemistry End of Chapter Exercises|Efnafræði[\s-]+æfingar í lok kafla|Æfingar|Dæmi|Verkefni|Exercises)/i,

  // Key terms patterns (Icelandic and English)
  keyTerms: /^##\s+(?:Key Terms|Lykilhugtök|Hugtök|Helstu hugtök)/i,

  // Key equations patterns (Icelandic and English)
  keyEquations: /^##\s+(?:Key Equations|Lykiljöfnur|Jöfnur|Helstu jöfnur)/i,
};

// End-of-chapter output file configuration
const EOC_FILES = {
  summary: { filename: 'summary', titleIs: 'Samantekt', titleEn: 'Summary' },
  exercises: { filename: 'exercises', titleIs: 'Æfingar', titleEn: 'Exercises' },
  answerKey: { filename: 'answer-key', titleIs: 'Svarlykill', titleEn: 'Answer Key' },
  keyTerms: { filename: 'key-terms', titleIs: 'Lykilhugtök', titleEn: 'Key Terms' },
  keyEquations: { filename: 'key-equations', titleIs: 'Lykiljöfnur', titleEn: 'Key Equations' },
};

// Default section titles (Icelandic)
const DEFAULT_SECTION_TITLES = {
  intro: 'Inngangur',
  introduction: 'Inngangur',
  0: 'Inngangur',
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
          ...sectionInfo,
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
  if (
    baseName === 'intro' ||
    baseName.match(/^\d+-0-intro/i) ||
    baseName.match(/^\d+-introduction/i)
  ) {
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
function processSectionFile(filePath, _options) {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract end-of-chapter content from body
  const { cleanContent, extractedContent } = extractEOCContent(body);

  return {
    frontmatter,
    cleanContent: cleanContent.trim(),
    extractedContent,
    originalContent: content,
  };
}

/**
 * Extract title from markdown content (first h1 or h2 heading)
 */
function extractTitleFromContent(content) {
  // Look for first # or ## heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }
  return null;
}

/**
 * Get title for a section file, with fallbacks
 */
function getSectionTitle(frontmatter, content, sectionInfo, _filename) {
  // 1. Try frontmatter title
  const fmTitle = frontmatter?.title || frontmatter?.titleIs;
  if (fmTitle && fmTitle.trim()) {
    return fmTitle.trim();
  }

  // 2. For intro sections, use default Icelandic title
  if (sectionInfo.isIntro) {
    return DEFAULT_SECTION_TITLES['intro'];
  }

  // 3. Try extracting from content
  const contentTitle = extractTitleFromContent(content);
  if (contentTitle) {
    return contentTitle;
  }

  // 4. Return empty - let TOC handle it
  return '';
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
    keyEquations: [],
  };

  const lines = body.split('\n');
  const cleanLines = [];
  let currentSection = null;
  let currentBuffer = [];
  let directiveDepth = 0;
  let inEOCSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // DIRECTIVE-BASED PATTERNS (check first - more reliable, language-agnostic)

    // Check for practice-problem directive (belongs to exercises)
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

    // Check for summary directive
    if (EOC_PATTERNS.summaryDirective.test(line)) {
      flushBuffer();
      currentSection = 'summary';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    // Check for exercises directive
    if (EOC_PATTERNS.exercisesDirective.test(line)) {
      flushBuffer();
      currentSection = 'exercises';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    // Check for glossary/key-terms directive
    if (EOC_PATTERNS.glossaryDirective.test(line) || EOC_PATTERNS.keyTermsDirective.test(line)) {
      flushBuffer();
      currentSection = 'keyTerms';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    // Check for key-equations directive
    if (EOC_PATTERNS.keyEquationsDirective.test(line)) {
      flushBuffer();
      currentSection = 'keyEquations';
      currentBuffer = [];
      directiveDepth++;
      inEOCSection = true;
      continue;
    }

    // HEADING-BASED PATTERNS (fallback for content without directives)

    // Check for summary heading
    if (EOC_PATTERNS.keyConceptsSummary.test(line)) {
      flushBuffer();
      currentSection = 'summary';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    // Check for exercises heading
    if (EOC_PATTERNS.exercises.test(line)) {
      flushBuffer();
      currentSection = 'exercises';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    // Check for key-terms heading
    if (EOC_PATTERNS.keyTerms.test(line)) {
      flushBuffer();
      currentSection = 'keyTerms';
      currentBuffer = [line];
      inEOCSection = true;
      continue;
    }

    // Check for key-equations heading
    if (EOC_PATTERNS.keyEquations.test(line)) {
      flushBuffer();
      currentSection = 'keyEquations';
      currentBuffer = [line];
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
    // Check directive patterns first
    if (
      EOC_PATTERNS.summaryDirective.test(line) ||
      EOC_PATTERNS.exercisesDirective.test(line) ||
      EOC_PATTERNS.glossaryDirective.test(line) ||
      EOC_PATTERNS.keyTermsDirective.test(line) ||
      EOC_PATTERNS.keyEquationsDirective.test(line) ||
      EOC_PATTERNS.practiceProblems.test(line)
    ) {
      return true;
    }
    // Then check heading patterns
    return (
      EOC_PATTERNS.keyConceptsSummary.test(line) ||
      EOC_PATTERNS.exercises.test(line) ||
      EOC_PATTERNS.keyTerms.test(line) ||
      EOC_PATTERNS.keyEquations.test(line)
    );
  }

  return {
    cleanContent: cleanLines.join('\n'),
    extractedContent,
  };
}

// ============================================================================
// Output Generation
// ============================================================================

/**
 * Extract answers from exercises content and return separated exercises and answer-key
 *
 * Input format (exercises with inline answers):
 *   :::practice-problem{#fs-id123}
 *   Question text...
 *
 *   :::answer
 *   Answer text...
 *   :::
 *   :::
 *
 * Output (OpenStax style with running numbers):
 *   exercises: :::exercise{#fs-id123 number=1}
 *              Question text...
 *              :::
 *
 *   answerKey: :::answer-entry{#fs-id123 number=1}
 *              Answer text...
 *              :::
 *
 * Odd-numbered exercises have answers, even-numbered typically don't.
 */
function extractAnswersFromExercises(exercisesContent, _chapter) {
  const cleanExercises = [];
  const answerEntries = [];
  let exerciseNumber = 0;

  // Process each exercise block
  for (const block of exercisesContent) {
    const lines = block.split('\n');
    let currentProblemId = null;
    let currentExerciseNum = null;
    let inAnswer = false;
    let answerDepth = 0;
    let exerciseLines = [];
    let answerLines = [];
    let problemDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for practice-problem or exercise start (proper directive format)
      // Also handles :::exercise{#id number=N} from previous compile runs
      const problemMatch = line.match(/^:::(?:practice-problem|exercise)\{#([^}\s]+)/);
      if (problemMatch) {
        // If we had a previous problem, flush it
        if (currentProblemId && exerciseLines.length > 0) {
          // Ensure the previous exercise ends with :::
          if (!exerciseLines[exerciseLines.length - 1].trim().startsWith(':::')) {
            exerciseLines.push(':::');
          }
          cleanExercises.push(exerciseLines.join('\n'));
          if (answerLines.length > 0) {
            answerEntries.push({
              id: currentProblemId,
              number: currentExerciseNum,
              content: answerLines.join('\n'),
            });
          }
        }

        exerciseNumber++;
        currentProblemId = problemMatch[1];
        currentExerciseNum = exerciseNumber;
        // Use :::exercise directive with number attribute for cleaner rendering
        exerciseLines = [`:::exercise{#${currentProblemId} number=${exerciseNumber}}`];
        answerLines = [];
        inAnswer = false;
        problemDepth = 1;
        continue;
      }

      // Check for malformed æfingadæmi{#id} (missing ::: prefix from MT)
      const malformedMatch = line.match(/^æfingadæmi\{#([^}]+)\}\s*(.*)/);
      if (malformedMatch) {
        // Flush previous problem if any
        if (currentProblemId && exerciseLines.length > 0) {
          // Ensure the previous exercise ends with :::
          if (!exerciseLines[exerciseLines.length - 1].trim().startsWith(':::')) {
            exerciseLines.push(':::');
          }
          cleanExercises.push(exerciseLines.join('\n'));
          if (answerLines.length > 0) {
            answerEntries.push({
              id: currentProblemId,
              number: currentExerciseNum,
              content: answerLines.join('\n'),
            });
          }
        }

        exerciseNumber++;
        currentProblemId = malformedMatch[1];
        currentExerciseNum = exerciseNumber;
        const restOfLine = malformedMatch[2].trim();
        exerciseLines = [`:::exercise{#${currentProblemId} number=${exerciseNumber}}`];
        if (restOfLine) {
          exerciseLines.push(restOfLine);
        }
        answerLines = [];
        inAnswer = false;
        problemDepth = 1;
        continue;
      }

      // Check for answer/svar start within a problem
      if (currentProblemId && /^:::(?:answer|svar)\s*$/.test(line)) {
        inAnswer = true;
        answerDepth = 1;
        continue;
      }

      // Track directive closing
      if (line.trim() === ':::') {
        if (inAnswer) {
          answerDepth--;
          if (answerDepth <= 0) {
            inAnswer = false;
            // Don't add closing ::: to answer, we'll add it when writing
          }
        } else if (problemDepth > 0) {
          problemDepth--;
          if (problemDepth === 0) {
            // End of exercise - add closing
            exerciseLines.push(':::');
          }
        }
        continue;
      }

      // Accumulate lines
      if (inAnswer) {
        answerLines.push(line);
      } else if (currentProblemId) {
        exerciseLines.push(line);
      }
    }

    // Flush last problem
    if (currentProblemId && exerciseLines.length > 0) {
      // Make sure it ends with :::
      if (!exerciseLines[exerciseLines.length - 1].trim().startsWith(':::')) {
        exerciseLines.push(':::');
      }
      cleanExercises.push(exerciseLines.join('\n'));
      if (answerLines.length > 0) {
        answerEntries.push({
          id: currentProblemId,
          number: currentExerciseNum,
          content: answerLines.join('\n').trim(),
        });
      }
    }
  }

  // Format answer entries as :::answer-entry{#id number=N} directives
  const formattedAnswers = answerEntries.map((entry) => {
    return `:::answer-entry{#${entry.id} number=${entry.number}}\n${entry.content}\n:::`;
  });

  return {
    cleanExercises,
    answerKey: formattedAnswers,
  };
}

/**
 * Add links to section headers in summary content.
 * Transforms: ### 1.1 Title
 * Into:       ### [1.1 Title](../1-1)
 *
 * The relative path works from /kafli/01/1-summary to /kafli/01/1-1
 */
// eslint-disable-next-line no-unused-vars
function addLinksToSummaryHeaders(content, _chapter) {
  // Match section headers like "### 1.1 Title" or "### 1.2 Another Title"
  const headerPattern = /^(###\s*)(\d+)\.(\d+)\s+(.+)$/gm;

  return content.replace(headerPattern, (match, prefix, chNum, secNum, title) => {
    // Create relative link to section: ../1-1 (relative to summary page)
    const linkPath = `${chNum}-${secNum}`;
    return `${prefix}[${chNum}.${secNum} ${title}](${linkPath})`;
  });
}

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
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('##'));

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
    'published-at': new Date().toISOString(),
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
    forceQuotes: false,
  });

  return `---\n${yamlStr}---\n\n`;
}

/**
 * Write output file with optional cleanup
 */
function writeOutput(filePath, content, options) {
  // Apply cleanup to remove Pandoc artifacts before writing
  const cleanedContent = cleanupContent(content);

  if (options.dryRun) {
    console.log(`[DRY RUN] Would write: ${filePath}`);
    if (options.verbose) {
      console.log(`  Content length: ${cleanedContent.length} chars`);
    }
    return;
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, cleanedContent);
  console.log(`  Written: ${path.basename(filePath)}`);
}

// ============================================================================
// Main Compilation
// ============================================================================

async function compileChapter(book, chapter, options) {
  const { track, dryRun } = options;

  // Determine source directory
  let sourceDir = options.sourceDir;
  if (!sourceDir) {
    const sourceFolder = TRACK_SOURCES[track];
    if (!sourceFolder) {
      throw new Error(
        `Unknown track: ${track}. Valid tracks: ${Object.keys(TRACK_SOURCES).join(', ')}`
      );
    }
    sourceDir = path.join(PROJECT_ROOT, 'books', book, sourceFolder);
  }

  // Determine output directory
  let outputDir = options.outputDir;
  if (!outputDir) {
    const chapterPadded = chapter.toString().padStart(2, '0');
    outputDir = path.join(
      PROJECT_ROOT,
      'books',
      book,
      '05-publication',
      track,
      'chapters',
      chapterPadded
    );
  }

  console.log(`\nCompiling Chapter ${chapter} for ${book}`);
  console.log(`  Track: ${track} (${TRACK_LABELS[track] || track})`);
  console.log(`  Source: ${sourceDir}`);
  console.log(`  Output: ${outputDir}`);
  if (dryRun) console.log('  [DRY RUN MODE]');
  console.log('');

  // Find section files
  const { files } = findSectionFiles(sourceDir, chapter);

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
  const { track, verbose } = options;

  console.log(`Found ${files.length} source file(s)`);
  if (verbose) {
    files.forEach((f) =>
      console.log(`  - ${f.filename} (section: ${f.sectionNum}, EOC: ${f.isEOC})`)
    );
  }
  console.log('');

  // Separate regular sections from pre-existing EOC files
  const regularFiles = files.filter((f) => !f.isEOC);
  const existingEOCFiles = files.filter((f) => f.isEOC);

  // Collected EOC content from all sections
  // Each entry can have { content, sectionNum, sectionTitle } for tracking source
  const collectedEOC = {
    summary: [],
    exercises: [],
    answerKey: [],
    keyTerms: [],
    keyEquations: [],
  };

  // Track section titles for linking (populated during processing)
  const sectionTitles = new Map(); // sectionNum -> title

  // Process regular section files
  console.log('Processing section files...');
  for (const file of regularFiles) {
    if (verbose) {
      console.log(`  Processing: ${file.filename}`);
    }

    const result = processSectionFile(file.path, options);

    // Track section title for linking
    const sectionTitle = getSectionTitle(
      result.frontmatter,
      result.cleanContent,
      { isIntro: file.isIntro, sectionNum: file.sectionNum },
      file.filename
    );
    if (!file.isIntro && file.sectionNum > 0) {
      sectionTitles.set(file.sectionNum, sectionTitle);
    }

    // Collect extracted EOC content with source section info
    for (const [type, content] of Object.entries(result.extractedContent)) {
      if (content.length > 0) {
        // For exercises and summary, track source section
        if (type === 'exercises' || type === 'summary') {
          for (const block of content) {
            collectedEOC[type].push({
              content: block,
              sectionNum: file.sectionNum,
              sectionTitle: sectionTitle,
            });
          }
        } else {
          collectedEOC[type].push(...content);
        }
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

    // sectionTitle was already computed above for tracking
    const frontmatter = generateFrontmatter({
      title: sectionTitle,
      chapter: chapter,
      section: file.isIntro ? 0 : file.sectionNum,
      track: track,
    });

    const outputContent = frontmatter + result.cleanContent;
    writeOutput(path.join(outputDir, outputFilename), outputContent, options);
  }

  // Process pre-existing EOC files (if any)
  for (const file of existingEOCFiles) {
    const content = fs.readFileSync(file.path, 'utf8');
    const { body } = parseFrontmatter(content);

    if (file.eocType && body.trim()) {
      collectedEOC[file.eocType].push(body.trim());
      if (verbose) {
        console.log(`  Included existing EOC file: ${file.filename} as ${file.eocType}`);
      }
    }
  }

  // Extract answers from exercises into separate answer-key
  // This must happen AFTER all exercises are collected but BEFORE writing
  if (collectedEOC.exercises.length > 0) {
    console.log('\nExtracting answers from exercises...');
    // Extract just the content strings for processing, keeping section info
    const exerciseBlocks = collectedEOC.exercises.map((e) =>
      typeof e === 'string' ? e : e.content
    );
    const { cleanExercises, answerKey } = extractAnswersFromExercises(exerciseBlocks, chapter);

    // Rebuild exercises with section info and section headers
    const exercisesWithSections = [];
    let exerciseIndex = 0;
    let currentSection = null;

    for (const original of collectedEOC.exercises) {
      const sectionNum = typeof original === 'string' ? null : original.sectionNum;
      const sectionTitle = typeof original === 'string' ? null : original.sectionTitle;

      // Count exercises in this block
      const blockContent = typeof original === 'string' ? original : original.content;
      const exerciseCount = (blockContent.match(/:::(?:practice-problem|exercise)\{/g) || [])
        .length;

      // Add section header if section changed and we have section info
      if (sectionNum && sectionNum !== currentSection && sectionTitle) {
        const sectionId = `${chapter}.${sectionNum}`;
        // Create linked header: ### [1.1 Title](/bookSlug/kafli/01/1-1)
        // Note: bookSlug will be replaced at render time or we use relative path
        exercisesWithSections.push(`### ${sectionId} ${sectionTitle}\n`);
        currentSection = sectionNum;
      }

      // Add exercises from this block
      for (let i = 0; i < exerciseCount && exerciseIndex < cleanExercises.length; i++) {
        exercisesWithSections.push(cleanExercises[exerciseIndex]);
        exerciseIndex++;
      }
    }

    // Add any remaining exercises (shouldn't happen normally)
    while (exerciseIndex < cleanExercises.length) {
      exercisesWithSections.push(cleanExercises[exerciseIndex]);
      exerciseIndex++;
    }

    collectedEOC.exercises = exercisesWithSections;
    collectedEOC.answerKey = answerKey;
    if (verbose) {
      console.log(
        `  Extracted ${answerKey.length} answer(s) from ${cleanExercises.length} exercise(s)`
      );
    }
  }

  // Write compiled EOC files
  console.log('\nWriting end-of-chapter files...');
  for (const [type, config] of Object.entries(EOC_FILES)) {
    const content = collectedEOC[type];
    if (!content || content.length === 0) {
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
      type: type === 'answerKey' ? 'answer-key' : type,
    });

    // Combine all content blocks
    // For summary, extract content from objects and add section headers with links
    let rawContent;
    if (type === 'summary') {
      const summaryParts = [];
      for (const item of content) {
        const itemContent = typeof item === 'string' ? item : item.content;
        const sectionNum = typeof item === 'string' ? null : item.sectionNum;
        const sectionTitle = typeof item === 'string' ? null : item.sectionTitle;

        // Add section header with link if we have section info
        if (sectionNum && sectionTitle) {
          const sectionId = `${chapter}.${sectionNum}`;
          // Remove any existing "## Lykilhugtök og samantekt" or similar headers
          const cleanedContent = itemContent
            .replace(
              /^##\s+(?:Key Concepts and Summary|Lykilhugtök og samantekt|Samantekt|Summary)\s*\n*/im,
              ''
            )
            .trim();
          // Add linked section header
          summaryParts.push(
            `### [${sectionId} ${sectionTitle}](${chapter}-${sectionNum})\n\n${cleanedContent}`
          );
        } else {
          summaryParts.push(itemContent);
        }
      }
      rawContent = summaryParts.join('\n\n');
    } else {
      rawContent = content.join('\n\n');
    }

    // Clean up extra closing tags (:::) that may appear between exercises
    rawContent = rawContent.replace(/:::\s*\n\s*:::\s*\n/g, ':::\n\n');

    // Special formatting for key-terms: convert to definition list syntax
    if (type === 'keyTerms') {
      rawContent = formatKeyTermsContent(rawContent);
    }

    // Remove existing heading if it matches the title (to prevent duplicates)
    // This handles cases where content already has "## Samantekt" etc.
    const headingPattern = new RegExp(`^##\\s+(${title}|${config.titleEn})[\\s\\n]*`, 'i');
    rawContent = rawContent.replace(headingPattern, '');

    // Build final content with single heading
    let combinedContent = `## ${title}\n\n`;
    combinedContent += rawContent.trim();

    const outputContent = frontmatter + combinedContent;
    writeOutput(path.join(outputDir, outputFilename), outputContent, options);
  }

  // Copy images from source media to publication output
  console.log('\nCopying images...');

  // Collect all image references from the written markdown files
  const allImages = new Set();
  const writtenFiles = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(outputDir, f));

  for (const file of writtenFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      const images = extractImageReferences(content);
      images.forEach((img) => allImages.add(img));
    }
  }

  // Determine source media directory (01-source/media/)
  const sourceMediaDir = path.join(PROJECT_ROOT, 'books', book, '01-source', 'media');
  const outputImagesDir = path.join(outputDir, 'images', 'media');

  const imageStats = copyImages(Array.from(allImages), sourceMediaDir, outputImagesDir, options);

  if (verbose) {
    console.log(`  Images found in content: ${allImages.size}`);
  }
  console.log(`  Images copied: ${imageStats.copied}`);
  if (imageStats.missing > 0) {
    console.log(`  Images missing: ${imageStats.missing}`);
  }
  if (imageStats.skipped > 0) {
    console.log(`  Images skipped (already exist): ${imageStats.skipped}`);
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Compilation complete');
  console.log(`  Sections processed: ${regularFiles.length}`);
  console.log(`  Existing EOC files: ${existingEOCFiles.length}`);
  console.log(`  Summary blocks: ${collectedEOC.summary.length}`);
  console.log(`  Exercise blocks: ${collectedEOC.exercises.length}`);
  console.log(`  Answer entries: ${collectedEOC.answerKey.length}`);
  console.log(`  Key Terms blocks: ${collectedEOC.keyTerms.length}`);
  console.log(`  Key Equations blocks: ${collectedEOC.keyEquations.length}`);
  console.log(
    `  Images: ${imageStats.copied} copied, ${imageStats.missing} missing, ${imageStats.skipped} skipped`
  );

  return {
    success: true,
    stats: {
      sectionsProcessed: regularFiles.length,
      existingEOCFiles: existingEOCFiles.length,
      summary: collectedEOC.summary.length,
      exercises: collectedEOC.exercises.length,
      answerKey: collectedEOC.answerKey.length,
      keyTerms: collectedEOC.keyTerms.length,
      keyEquations: collectedEOC.keyEquations.length,
      imagesCopied: imageStats.copied,
      imagesMissing: imageStats.missing,
      imagesSkipped: imageStats.skipped,
    },
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
