#!/usr/bin/env node

/**
 * process-chapter.js
 *
 * Orchestrates the complete publication pipeline for a chapter:
 * 1. Find all .docx files in the chapter (from 03-faithful or 04-localized)
 * 2. Convert each .docx to .md using docx-to-md.js
 * 3. Add frontmatter to each .md using add-frontmatter.js
 * 4. Update toc.json with chapter structure
 * 5. Update chapter status.json
 * 6. Generate processing report
 *
 * Usage:
 *   node tools/process-chapter.js <book> <chapter> [options]
 *
 * Options:
 *   --source <stage>   Source stage: faithful (03) or localized (04). Default: localized
 *   --dry-run          Show what would be done without making changes
 *   --verbose          Show detailed progress
 *   --skip-toc         Don't update toc.json
 *   --skip-status      Don't update chapter status
 *   -h, --help         Show help
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const VALID_BOOKS = ['efnafraedi', 'liffraedi'];
const SOURCE_STAGES = {
  faithful: '03-faithful',
  localized: '04-localized',
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    chapter: null,
    source: 'localized',
    dryRun: false,
    verbose: false,
    skipToc: false,
    skipStatus: false,
    help: false,
  };

  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--skip-toc') {
      result.skipToc = true;
    } else if (arg === '--skip-status') {
      result.skipStatus = true;
    } else if (arg === '--source') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.source = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length >= 1) result.book = positional[0];
  if (positional.length >= 2) result.chapter = parseInt(positional[1], 10);

  return result;
}

function printHelp() {
  console.log(`
process-chapter.js - Orchestrate complete chapter publication pipeline

Usage:
  node tools/process-chapter.js <book> <chapter> [options]

Arguments:
  book      Book ID: efnafraedi, liffraedi
  chapter   Chapter number (e.g., 1, 2, 3)

Options:
  --source <stage>   Source stage to process from:
                     - faithful: Use 03-faithful/ (Pass 1 complete)
                     - localized: Use 04-localized/ (Pass 2 complete, default)
  --dry-run          Show what would be done without making changes
  --verbose          Show detailed progress information
  --skip-toc         Don't update toc.json
  --skip-status      Don't update chapter status.json
  -h, --help         Show this help message

Pipeline Steps:
  1. Find all .docx files in books/{book}/{source}/docx/ch{NN}/
  2. Convert each to Markdown (docx-to-md.js)
  3. Add frontmatter to each (add-frontmatter.js)
  4. Update books/{book}/05-publication/toc.json
  5. Update books/{book}/chapters/ch{NN}/status.json
  6. Generate processing report

Examples:
  # Process chapter 1 from localized source (default)
  node tools/process-chapter.js efnafraedi 1

  # Process from faithful translation (Pass 1)
  node tools/process-chapter.js efnafraedi 3 --source faithful

  # Dry run to see what would happen
  node tools/process-chapter.js efnafraedi 1 --dry-run --verbose

  # Process without updating status files
  node tools/process-chapter.js efnafraedi 2 --skip-status --skip-toc

Output:
  - Markdown files in books/{book}/05-publication/chapters/
  - Images in books/{book}/05-publication/images/ch{NN}/
  - Updated toc.json and status.json
`);
}

// ============================================================================
// Path Helpers
// ============================================================================

function getProjectRoot() {
  // Find project root by looking for package.json
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function getChapterPaths(projectRoot, book, chapter, sourceStage) {
  const chapterPadded = chapter.toString().padStart(2, '0');
  const sourceDir = SOURCE_STAGES[sourceStage] || SOURCE_STAGES['localized'];

  return {
    sourceDocx: path.join(projectRoot, 'books', book, sourceDir, 'docx', `ch${chapterPadded}`),
    outputChapters: path.join(projectRoot, 'books', book, '05-publication', 'chapters'),
    outputImages: path.join(
      projectRoot,
      'books',
      book,
      '05-publication',
      'images',
      `ch${chapterPadded}`
    ),
    tocJson: path.join(projectRoot, 'books', book, '05-publication', 'toc.json'),
    statusJson: path.join(
      projectRoot,
      'books',
      book,
      'chapters',
      `ch${chapterPadded}`,
      'status.json'
    ),
    chapterPadded,
  };
}

// ============================================================================
// File Discovery
// ============================================================================

function findDocxFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.docx')) {
      // Skip temporary Word files
      if (!entry.name.startsWith('~$')) {
        files.push(path.join(directory, entry.name));
      }
    }
  }

  // Sort by section number if possible
  return files.sort((a, b) => {
    const aMatch = path.basename(a).match(/^(\d+)\.(\d+)/);
    const bMatch = path.basename(b).match(/^(\d+)\.(\d+)/);

    if (aMatch && bMatch) {
      const aNum = parseFloat(`${aMatch[1]}.${aMatch[2]}`);
      const bNum = parseFloat(`${bMatch[1]}.${bMatch[2]}`);
      return aNum - bNum;
    }
    return a.localeCompare(b);
  });
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Run a Node.js script and return a promise
 */
function runTool(scriptPath, args, options = {}) {
  const { verbose, dryRun } = options;

  return new Promise((resolve, reject) => {
    if (dryRun) {
      console.log(`[DRY RUN] Would run: node ${scriptPath} ${args.join(' ')}`);
      resolve({ success: true, dryRun: true });
      return;
    }

    if (verbose) {
      console.log(`  Running: node ${path.basename(scriptPath)} ${args.join(' ')}`);
    }

    const child = spawn('node', [scriptPath, ...args], {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: getProjectRoot(),
    });

    let stdout = '';
    let stderr = '';

    if (!verbose) {
      child.stdout?.on('data', (data) => {
        stdout += data;
      });
      child.stderr?.on('data', (data) => {
        stderr += data;
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`Tool exited with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================================================
// TOC Management
// ============================================================================

function loadToc(tocPath) {
  if (!fs.existsSync(tocPath)) {
    return { chapters: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(tocPath, 'utf8'));
  } catch (err) {
    console.warn(`Warning: Could not parse toc.json: ${err.message}`);
    return { chapters: [] };
  }
}

function updateToc(tocPath, chapter, sections, options) {
  const { dryRun, verbose } = options;

  const toc = loadToc(tocPath);

  // Build chapter entry
  const chapterEntry = {
    chapter: chapter,
    sections: sections.map((s) => ({
      id: s.sectionId,
      title: s.title || `Section ${s.sectionId}`,
      file: s.outputFile,
    })),
  };

  // Find or add chapter
  const existingIndex = toc.chapters.findIndex((c) => c.chapter === chapter);
  if (existingIndex >= 0) {
    toc.chapters[existingIndex] = chapterEntry;
  } else {
    toc.chapters.push(chapterEntry);
    // Sort chapters by number
    toc.chapters.sort((a, b) => a.chapter - b.chapter);
  }

  if (verbose) {
    console.log(`  TOC: Chapter ${chapter} with ${sections.length} section(s)`);
  }

  if (!dryRun) {
    fs.writeFileSync(tocPath, JSON.stringify(toc, null, 2) + '\n');
    console.log(`Updated: ${tocPath}`);
  } else {
    console.log(`[DRY RUN] Would update: ${tocPath}`);
  }
}

// ============================================================================
// Status Management
// ============================================================================

function updateChapterStatus(statusPath, options) {
  const { dryRun, verbose } = options;

  if (!fs.existsSync(statusPath)) {
    if (verbose) {
      console.log(`  Status file not found: ${statusPath}`);
    }
    return;
  }

  try {
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

    // Update publication status
    const today = new Date().toISOString().split('T')[0];

    if (!status.status) {
      status.status = {};
    }

    status.status.publication = {
      complete: true,
      date: today,
      version: status.status.publication?.version || 'v1.0',
      notes: `Processed via process-chapter.js on ${today}`,
    };

    if (verbose) {
      console.log(`  Status: publication marked complete`);
    }

    if (!dryRun) {
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
      console.log(`Updated: ${statusPath}`);
    } else {
      console.log(`[DRY RUN] Would update: ${statusPath}`);
    }
  } catch (err) {
    console.warn(`Warning: Could not update status: ${err.message}`);
  }
}

// ============================================================================
// Section Info Extraction
// ============================================================================

function extractSectionInfo(docxPath, chapter) {
  const filename = path.basename(docxPath, '.docx');

  // Try to extract section number from filename
  // Patterns: "1.2-localized.docx", "1.2.docx", "section-1.2.docx"
  const sectionMatch = filename.match(/(\d+)\.(\d+)/);

  let sectionNum = null;
  let sectionId = null;

  if (sectionMatch) {
    sectionNum = parseInt(sectionMatch[2], 10);
    sectionId = `${chapter}.${sectionNum}`;
  }

  // Determine output filename
  const chapterPadded = chapter.toString().padStart(2, '0');
  const sectionPadded = sectionNum ? sectionNum.toString().padStart(2, '0') : '00';
  const outputFile = `ch${chapterPadded}-sec${sectionPadded}.md`;

  return {
    docxPath,
    filename,
    sectionNum,
    sectionId,
    outputFile,
    title: null, // Will be filled after frontmatter processing
  };
}

// ============================================================================
// Main Processing
// ============================================================================

async function processChapter(options) {
  const { book, chapter, source, dryRun, verbose, skipToc, skipStatus } = options;

  const projectRoot = getProjectRoot();
  const paths = getChapterPaths(projectRoot, book, chapter, source);

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Processing Chapter ${chapter} of ${book}`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Project root: ${projectRoot}`);
    console.log(`  Source: ${source} (${SOURCE_STAGES[source]})`);
    console.log(`  Source DOCX: ${paths.sourceDocx}`);
    console.log(`  Output: ${paths.outputChapters}`);
    console.log('');
  }

  if (dryRun) {
    console.log('[DRY RUN MODE - No files will be modified]');
    console.log('');
  }

  // Step 1: Find DOCX files
  console.log('Step 1: Finding source files...');
  const docxFiles = findDocxFiles(paths.sourceDocx);

  if (docxFiles.length === 0) {
    console.error(`\nError: No .docx files found in ${paths.sourceDocx}`);
    console.error(
      '\nMake sure the chapter has been processed through the earlier workflow stages.'
    );
    console.error(
      `Expected location: books/${book}/${SOURCE_STAGES[source]}/docx/ch${paths.chapterPadded}/`
    );
    process.exit(1);
  }

  console.log(`  Found ${docxFiles.length} file(s):`);
  docxFiles.forEach((f) => console.log(`    - ${path.basename(f)}`));
  console.log('');

  // Extract section info
  const sections = docxFiles.map((f) => extractSectionInfo(f, chapter));

  // Step 2: Convert DOCX to Markdown
  console.log('Step 2: Converting DOCX to Markdown...');
  const docxToMdScript = path.join(projectRoot, 'tools', 'docx-to-md.js');

  const conversionResults = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const section of sections) {
    try {
      const args = [section.docxPath];
      if (verbose) args.push('--verbose');

      await runTool(docxToMdScript, args, { verbose, dryRun });
      conversionResults.success++;

      if (!verbose) {
        console.log(`  Converted: ${section.filename}`);
      }
    } catch (err) {
      conversionResults.failed++;
      conversionResults.errors.push({ file: section.filename, error: err.message });
      console.error(`  Failed: ${section.filename} - ${err.message}`);
    }
  }
  console.log('');

  // Step 3: Add frontmatter
  console.log('Step 3: Adding frontmatter...');
  const addFrontmatterScript = path.join(projectRoot, 'tools', 'add-frontmatter.js');

  const frontmatterResults = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // Ensure output directory exists
  if (!dryRun) {
    fs.mkdirSync(paths.outputChapters, { recursive: true });
  }

  for (const section of sections) {
    try {
      const mdPath = path.join(paths.outputChapters, section.outputFile);

      // Only process if the file exists (was successfully converted)
      if (!dryRun && !fs.existsSync(mdPath)) {
        // Try alternative naming patterns
        const altPatterns = [
          `ch${paths.chapterPadded}-${section.filename}.md`,
          `${section.filename}.md`,
        ];

        let found = false;
        for (const alt of altPatterns) {
          const altPath = path.join(paths.outputChapters, alt);
          if (fs.existsSync(altPath)) {
            // Rename to standard naming
            fs.renameSync(altPath, mdPath);
            found = true;
            break;
          }
        }

        if (!found && conversionResults.success > 0) {
          // File might be in different location, skip frontmatter for now
          if (verbose) {
            console.log(`  Skipping: ${section.outputFile} (file not found)`);
          }
          continue;
        }
      }

      const args = [mdPath, '--book', book, '--chapter', chapter.toString()];
      if (section.sectionNum) {
        args.push('--section', section.sectionNum.toString());
      }
      if (verbose) args.push('--verbose');

      await runTool(addFrontmatterScript, args, { verbose, dryRun });
      frontmatterResults.success++;

      if (!verbose) {
        console.log(`  Updated: ${section.outputFile}`);
      }
    } catch (err) {
      frontmatterResults.failed++;
      frontmatterResults.errors.push({ file: section.outputFile, error: err.message });
      console.error(`  Failed: ${section.outputFile} - ${err.message}`);
    }
  }
  console.log('');

  // Step 4: Update TOC
  if (!skipToc) {
    console.log('Step 4: Updating table of contents...');
    updateToc(paths.tocJson, chapter, sections, { dryRun, verbose });
    console.log('');
  } else {
    console.log('Step 4: Skipping TOC update (--skip-toc)');
    console.log('');
  }

  // Step 5: Update chapter status
  if (!skipStatus) {
    console.log('Step 5: Updating chapter status...');
    updateChapterStatus(paths.statusJson, { dryRun, verbose });
    console.log('');
  } else {
    console.log('Step 5: Skipping status update (--skip-status)');
    console.log('');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('Processing Complete');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  DOCX files found:    ${docxFiles.length}`);
  console.log(
    `  Conversions:         ${conversionResults.success} success, ${conversionResults.failed} failed`
  );
  console.log(
    `  Frontmatter:         ${frontmatterResults.success} success, ${frontmatterResults.failed} failed`
  );
  console.log('');

  if (conversionResults.errors.length > 0 || frontmatterResults.errors.length > 0) {
    console.log('Errors:');
    [...conversionResults.errors, ...frontmatterResults.errors].forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
    console.log('');
  }

  console.log('Output locations:');
  console.log(`  Chapters: ${paths.outputChapters}`);
  console.log(`  Images:   ${paths.outputImages}`);
  if (!skipToc) console.log(`  TOC:      ${paths.tocJson}`);
  if (!skipStatus) console.log(`  Status:   ${paths.statusJson}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] No files were actually modified.');
    console.log('');
  }

  // Return exit code based on results
  const totalErrors = conversionResults.failed + frontmatterResults.failed;
  return totalErrors > 0 ? 1 : 0;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate arguments
  if (!args.book || args.chapter === null || isNaN(args.chapter)) {
    console.error('Error: Book and chapter are required.\n');
    printHelp();
    process.exit(1);
  }

  if (!VALID_BOOKS.includes(args.book)) {
    console.error(`Error: Invalid book "${args.book}". Must be one of: ${VALID_BOOKS.join(', ')}`);
    process.exit(1);
  }

  if (args.chapter < 1) {
    console.error('Error: Chapter must be a positive number');
    process.exit(1);
  }

  if (!SOURCE_STAGES[args.source]) {
    console.error(`Error: Invalid source "${args.source}". Must be: faithful, localized`);
    process.exit(1);
  }

  try {
    const exitCode = await processChapter(args);
    process.exit(exitCode);
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
