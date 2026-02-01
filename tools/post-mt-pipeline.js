#!/usr/bin/env node

/**
 * post-mt-pipeline.js
 *
 * Chains post-MT cleanup tools to process translated markdown files.
 * Runs after receiving output from Erlendur MT (malstadur.is).
 *
 * Pipeline sequence (order matters):
 * 1. restore-links.js  - Convert MT-safe syntax back to standard markdown links
 * 2. repair-directives.js - Add missing ::: closing markers
 *
 * Usage:
 *   node tools/post-mt-pipeline.js <file.is.md> [options]
 *   node tools/post-mt-pipeline.js --chapter <book> <chNN> [options]
 *   node tools/post-mt-pipeline.js --batch <directory> [options]
 *
 * Options:
 *   --dry-run       Show changes without writing
 *   --verbose       Detailed output
 *   --skip <step>   Skip specific step (links|directives)
 *   --json          Output results as JSON
 *   -h, --help      Show help
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const PIPELINE_STEPS = [
  {
    id: 'images',
    name: 'Restore Images',
    script: 'restore-images.js',
    description: 'Reconstruct image markdown from MT-stripped attribute blocks',
  },
  {
    id: 'figures',
    name: 'Restore Figures',
    script: 'restore-figures.js',
    description: 'Restore correct figure numbers and cross-references from sidecar',
  },
  {
    id: 'links',
    name: 'Restore Links',
    script: 'restore-links.js',
    description: 'Convert MT-safe [text]{url="..."} syntax back to standard markdown links',
  },
  {
    id: 'strings',
    name: 'Restore Strings',
    script: 'restore-strings.js',
    description: 'Update sidecar with translated frontmatter titles, table titles, and summaries',
  },
  {
    id: 'table-strings',
    name: 'Inject Table Strings',
    script: 'inject-table-strings.js',
    description: 'Inject translated table headers and cells from table-strings.is.md',
  },
  {
    id: 'tables',
    name: 'Restore Tables',
    script: 'restore-tables.js',
    description: 'Restore tables from sidecar JSON files',
  },
  {
    id: 'equation-strings',
    name: 'Inject Equation Strings',
    script: 'inject-equation-strings.js',
    description: 'Inject translated text into LaTeX equations from equation-strings.is.md',
  },
  {
    id: 'equations',
    name: 'Apply Equations',
    script: 'apply-equations.js',
    description: 'Replace [[EQ:n]] placeholders with LaTeX from sidecar JSON',
  },
  {
    id: 'directives',
    name: 'Repair Directives',
    script: 'repair-directives.js',
    description: 'Add missing ::: closing markers to directive blocks',
  },
];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    chapter: null,
    book: null,
    batch: null,
    dryRun: false,
    verbose: false,
    json: false,
    skip: [],
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--skip' && args[i + 1]) {
      result.skip.push(args[++i]);
    } else if (arg === '--chapter' && args[i + 1] && args[i + 2]) {
      result.book = args[++i];
      result.chapter = args[++i];
    } else if (arg === '--batch' && args[i + 1]) {
      result.batch = args[++i];
    } else if (!arg.startsWith('-') && !result.input) {
      result.input = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
post-mt-pipeline.js - Post-MT processing pipeline

Chains cleanup tools to process translated markdown files after MT output.

Pipeline Steps:
  1. restore-images.js          Reconstruct images from MT-stripped attribute blocks
  2. restore-figures.js         Restore correct figure numbers and cross-refs from sidecar
  3. restore-links.js           Convert MT-safe link syntax back to standard markdown
  4. restore-strings.js         Update sidecar with translated titles and summaries
  5. restore-tables.js          Restore tables from sidecar JSON files
  6. inject-equation-strings.js Inject translated text into LaTeX equations
  7. apply-equations.js         Replace [[EQ:n]] placeholders with LaTeX
  8. repair-directives.js       Add missing ::: closing markers

Usage:
  node tools/post-mt-pipeline.js <file.is.md> [options]
  node tools/post-mt-pipeline.js --chapter <book> <chNN> [options]
  node tools/post-mt-pipeline.js --batch <directory> [options]

Arguments:
  file.is.md      Single markdown file to process

Options:
  --chapter <book> <ch>  Process a chapter (e.g., --chapter efnafraedi ch01)
  --batch <directory>    Process all .md files in directory recursively
  --dry-run              Show changes without writing files
  --verbose, -v          Show detailed processing information
  --skip <step>          Skip a step (images|figures|links|strings|tables|equations|directives|merge). Can be used multiple times.
  --json                 Output results as JSON
  -h, --help             Show this help message

Examples:
  # Process a single file
  node tools/post-mt-pipeline.js books/efnafraedi/02-mt-output/ch01/1-1.is.md

  # Process a chapter (dry-run)
  node tools/post-mt-pipeline.js --chapter efnafraedi ch01 --dry-run

  # Process directory
  node tools/post-mt-pipeline.js --batch books/efnafraedi/02-mt-output/ch02/

  # Skip link restoration
  node tools/post-mt-pipeline.js file.is.md --skip links
`);
}

// ============================================================================
// Tool Execution
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

/**
 * Run a tool and capture its output
 * @param {string} scriptPath - Path to the script
 * @param {string[]} args - Arguments to pass
 * @param {object} options - Options for execution
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
function runTool(scriptPath, args, options = {}) {
  const { verbose } = options;

  return new Promise((resolve) => {
    if (verbose) {
      console.log(`    Running: node ${path.basename(scriptPath)} ${args.join(' ')}`);
    }

    const child = spawn('node', [scriptPath, ...args], {
      cwd: getProjectRoot(),
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

// ============================================================================
// Sidecar Path Resolution
// ============================================================================

/**
 * Get the path to a sidecar file in 02-for-mt/ for a file in 02-mt-output/
 *
 * MT output files are in 02-mt-output/ but their sidecar files (equations,
 * protected content) remain in 02-for-mt/ since they don't go through translation.
 *
 * @param {string} filePath - Path to the MT output file (e.g., .../02-mt-output/ch01/1-2.is.md)
 * @param {string} sidecarType - Type of sidecar: 'equations' or 'protected'
 * @returns {string|null} Path to the sidecar file, or null if not found
 */
function getSidecarPath(filePath, sidecarType) {
  // Convert 02-mt-output path to 02-for-mt path
  const forMtPath = filePath.replace(/02-mt-output/, '02-for-mt');

  // Get the base name without language suffix and extension
  // e.g., "1-2.is.md" -> "1-2" or "intro.is.md" -> "intro"
  // Also handles split files: "1-2(a).is.md" -> "1-2"
  const dir = path.dirname(forMtPath);
  const basename = path
    .basename(forMtPath)
    .replace(/\.is\.md$/, '') // Remove .is.md
    .replace(/\.en\.md$/, '') // Remove .en.md (shouldn't happen but be safe)
    .replace(/\([a-z]\)$/, '') // Remove split file suffix like (a), (b), etc.
    .replace(/\.md$/, ''); // Remove plain .md

  const sidecarPath = path.join(dir, `${basename}-${sidecarType}.json`);

  if (fs.existsSync(sidecarPath)) {
    return sidecarPath;
  }

  return null;
}

// ============================================================================
// Pipeline Processing
// ============================================================================

/**
 * Process a single file through the pipeline
 * @param {string} filePath - Path to the markdown file
 * @param {object} options - Processing options
 * @returns {Promise<object>} Processing result
 */
async function processFile(filePath, options) {
  const { dryRun, verbose, skip } = options;
  const projectRoot = getProjectRoot();

  const result = {
    file: filePath,
    success: true,
    steps: {},
  };

  if (!fs.existsSync(filePath)) {
    result.success = false;
    result.error = `File not found: ${filePath}`;
    return result;
  }

  if (!filePath.endsWith('.md')) {
    result.success = false;
    result.error = 'Not a markdown file';
    return result;
  }

  for (const step of PIPELINE_STEPS) {
    // Check if step should be skipped
    if (skip.includes(step.id)) {
      result.steps[step.id] = { skipped: true };
      if (verbose) {
        console.log(`  [SKIP] ${step.name}`);
      }
      continue;
    }

    const scriptPath = path.join(projectRoot, 'tools', step.script);

    if (!fs.existsSync(scriptPath)) {
      result.steps[step.id] = {
        success: false,
        error: `Script not found: ${step.script}`,
      };
      result.success = false;
      continue;
    }

    // Build arguments based on step
    const args = [];

    if (step.id === 'images') {
      args.push(filePath);
      if (!dryRun) {
        args.push('--in-place');
      }
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'figures') {
      // Find figures sidecar in 02-for-mt/ (not in 02-mt-output/)
      const figuresSidecar = getSidecarPath(filePath, 'figures');

      if (!figuresSidecar) {
        // No figures file - skip this step (script handles gracefully anyway)
        result.steps[step.id] = {
          skipped: true,
          reason: 'No figures sidecar found',
        };
        if (verbose) {
          console.log(`  [SKIP] ${step.name}: No figures sidecar found`);
        }
        continue;
      }

      args.push(filePath);
      args.push('--figures', figuresSidecar);
      if (!dryRun) {
        args.push('--in-place');
      }
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'links') {
      args.push(filePath);
      if (!dryRun) {
        args.push('--in-place');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'strings') {
      args.push(filePath);
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'table-strings') {
      // Find translated table strings file in same directory
      const dir = path.dirname(filePath);
      const basename = path
        .basename(filePath)
        .replace(/\.is\.md$/, '')
        .replace(/\([a-z]\)$/, ''); // Handle split files
      const tableStringsPath = path.join(dir, `${basename}-table-strings.is.md`);

      if (!fs.existsSync(tableStringsPath)) {
        // No translated table strings - skip this step
        result.steps[step.id] = {
          skipped: true,
          reason: 'No translated table strings found',
        };
        if (verbose) {
          console.log(`  [SKIP] ${step.name}: No table-strings.is.md found`);
        }
        continue;
      }

      args.push(tableStringsPath);
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'tables') {
      // Check for translated protected.json in 02-mt-output (created by inject-table-strings)
      const dir = path.dirname(filePath);
      const basename = path
        .basename(filePath)
        .replace(/\.is\.md$/, '')
        .replace(/\([a-z]\)$/, ''); // Handle split files
      const translatedProtectedPath = path.join(dir, `${basename}-protected.json`);

      // If translated protected.json exists in mt-output, restore-tables will use it
      // Otherwise it falls back to the original in 02-for-mt
      if (fs.existsSync(translatedProtectedPath) && verbose) {
        console.log(`  Using translated tables: ${path.basename(translatedProtectedPath)}`);
      }

      args.push(filePath);
      if (!dryRun) {
        args.push('--in-place');
      }
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'equation-strings') {
      // Find translated equation strings file in same directory
      const dir = path.dirname(filePath);
      const basename = path
        .basename(filePath)
        .replace(/\.is\.md$/, '')
        .replace(/\([a-z]\)$/, ''); // Handle split files
      const equationStringsPath = path.join(dir, `${basename}-equation-strings.is.md`);

      if (!fs.existsSync(equationStringsPath)) {
        // No translated equation strings - skip this step
        result.steps[step.id] = {
          skipped: true,
          reason: 'No translated equation strings found',
        };
        if (verbose) {
          console.log(`  [SKIP] ${step.name}: No equation-strings.is.md found`);
        }
        continue;
      }

      args.push(equationStringsPath);
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'equations') {
      // First check for translated equations.json in 02-mt-output (created by inject-equation-strings)
      const dir = path.dirname(filePath);
      const basename = path
        .basename(filePath)
        .replace(/\.is\.md$/, '')
        .replace(/\([a-z]\)$/, ''); // Handle split files
      const translatedEquationsPath = path.join(dir, `${basename}-equations.json`);

      let equationsSidecar;
      if (fs.existsSync(translatedEquationsPath)) {
        // Use translated equations from 02-mt-output
        equationsSidecar = translatedEquationsPath;
        if (verbose) {
          console.log(`  Using translated equations: ${path.basename(translatedEquationsPath)}`);
        }
      } else {
        // Fall back to original equations in 02-for-mt/
        equationsSidecar = getSidecarPath(filePath, 'equations');
      }

      if (!equationsSidecar) {
        // No equations file - skip this step
        result.steps[step.id] = {
          skipped: true,
          reason: 'No equations sidecar found',
        };
        if (verbose) {
          console.log(`  [SKIP] ${step.name}: No equations sidecar found`);
        }
        continue;
      }

      args.push(filePath);
      args.push('--equations', equationsSidecar); // Use explicit path
      if (!dryRun) {
        args.push('--output', filePath); // Write in-place
      }
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    } else if (step.id === 'directives') {
      args.push(filePath);
      if (dryRun) {
        args.push('--dry-run');
      }
      if (verbose) {
        args.push('--verbose');
      }
    }

    const toolResult = await runTool(scriptPath, args, { verbose });

    // Parse output to extract counts
    const stepResult = {
      success: toolResult.success,
      output: toolResult.stdout,
    };

    // Extract statistics from output
    if (step.id === 'images' && toolResult.stderr) {
      // restore-images.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Restored (\d+) image/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      }
    } else if (step.id === 'figures' && toolResult.stderr) {
      // restore-figures.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Figures restored: (\d+) cross-refs, (\d+) captions/);
      if (match) {
        stepResult.crossRefs = parseInt(match[1], 10);
        stepResult.captions = parseInt(match[2], 10);
      }
    } else if (step.id === 'links' && toolResult.stderr) {
      // restore-links.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Restored links: (\d+) URLs, (\d+) refs, (\d+) docs/);
      if (match) {
        stepResult.urlCount = parseInt(match[1], 10);
        stepResult.refCount = parseInt(match[2], 10);
        stepResult.docCount = parseInt(match[3], 10);
      }
    } else if (step.id === 'strings' && toolResult.stderr) {
      // restore-strings.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Restored (\d+) string/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      }
    } else if (step.id === 'tables' && toolResult.stderr) {
      // restore-tables.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Restored (\d+) table/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      }
    } else if (step.id === 'equation-strings' && toolResult.stdout) {
      // inject-equation-strings.js outputs counts
      const match = toolResult.stdout.match(/Injected (\d+) translated string/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      }
    } else if (step.id === 'equations' && toolResult.stderr) {
      // apply-equations.js outputs to stderr in verbose mode
      const match = toolResult.stderr.match(/Equations restored: (\d+)/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      } else if (toolResult.stderr.includes('No [[EQ:n]] placeholders')) {
        stepResult.count = 0;
      }
    } else if (step.id === 'directives' && toolResult.stdout) {
      // repair-directives.js outputs counts in stdout
      const match = toolResult.stdout.match(/Added (\d+) closing marker/);
      if (match) {
        stepResult.count = parseInt(match[1], 10);
      } else if (toolResult.stdout.includes('No repairs needed')) {
        stepResult.count = 0;
      }
    }

    result.steps[step.id] = stepResult;

    if (!toolResult.success) {
      result.success = false;
      stepResult.error = toolResult.stderr || 'Unknown error';
    }

    if (verbose && !dryRun) {
      console.log(`  [${toolResult.success ? 'OK' : 'FAIL'}] ${step.name}`);
    }
  }

  return result;
}

/**
 * Find all markdown files in a directory
 * @param {string} dir - Directory path
 * @returns {string[]} Array of file paths
 */
function findMarkdownFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process multiple files
 * @param {string[]} files - Array of file paths
 * @param {object} options - Processing options
 * @returns {Promise<object>} Aggregated results
 */
async function processMultipleFiles(files, options) {
  const { verbose, dryRun, json } = options;

  const results = {
    totalFiles: files.length,
    processed: 0,
    successful: 0,
    failed: 0,
    steps: {
      images: { total: 0, count: 0 },
      figures: { total: 0, crossRefs: 0, captions: 0 },
      links: { total: 0, urls: 0, refs: 0, docs: 0 },
      strings: { total: 0, count: 0 },
      'table-strings': { total: 0, count: 0 },
      tables: { total: 0, count: 0 },
      'equation-strings': { total: 0, count: 0 },
      equations: { total: 0, count: 0 },
      directives: { total: 0, count: 0 },
    },
    files: [],
  };

  if (!json) {
    console.log(`Processing ${files.length} file(s)...`);
    if (dryRun) {
      console.log('[DRY RUN MODE]');
    }
    console.log('');
  }

  for (const file of files) {
    if (verbose && !json) {
      console.log(`Processing: ${path.relative(getProjectRoot(), file)}`);
    }

    const fileResult = await processFile(file, options);
    results.files.push(fileResult);
    results.processed++;

    if (fileResult.success) {
      results.successful++;
    } else {
      results.failed++;
    }

    // Aggregate step statistics
    if (fileResult.steps.images && !fileResult.steps.images.skipped) {
      results.steps.images.total++;
      results.steps.images.count += fileResult.steps.images.count || 0;
    }

    if (fileResult.steps.figures && !fileResult.steps.figures.skipped) {
      results.steps.figures.total++;
      results.steps.figures.crossRefs += fileResult.steps.figures.crossRefs || 0;
      results.steps.figures.captions += fileResult.steps.figures.captions || 0;
    }

    if (fileResult.steps.links && !fileResult.steps.links.skipped) {
      results.steps.links.total++;
      results.steps.links.urls += fileResult.steps.links.urlCount || 0;
      results.steps.links.refs += fileResult.steps.links.refCount || 0;
      results.steps.links.docs += fileResult.steps.links.docCount || 0;
    }

    if (fileResult.steps.strings && !fileResult.steps.strings.skipped) {
      results.steps.strings.total++;
      results.steps.strings.count += fileResult.steps.strings.count || 0;
    }

    if (fileResult.steps['table-strings'] && !fileResult.steps['table-strings'].skipped) {
      results.steps['table-strings'].total++;
      results.steps['table-strings'].count += fileResult.steps['table-strings'].count || 0;
    }

    if (fileResult.steps.tables && !fileResult.steps.tables.skipped) {
      results.steps.tables.total++;
      results.steps.tables.count += fileResult.steps.tables.count || 0;
    }

    if (fileResult.steps['equation-strings'] && !fileResult.steps['equation-strings'].skipped) {
      results.steps['equation-strings'].total++;
      results.steps['equation-strings'].count += fileResult.steps['equation-strings'].count || 0;
    }

    if (fileResult.steps.equations && !fileResult.steps.equations.skipped) {
      results.steps.equations.total++;
      results.steps.equations.count += fileResult.steps.equations.count || 0;
    }

    if (fileResult.steps.directives && !fileResult.steps.directives.skipped) {
      results.steps.directives.total++;
      results.steps.directives.count += fileResult.steps.directives.count || 0;
    }

    if (!verbose && !json && !fileResult.success) {
      console.log(`  FAILED: ${path.relative(getProjectRoot(), file)}`);
      if (fileResult.error) {
        console.log(`    Error: ${fileResult.error}`);
      }
    }
  }

  return results;
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

  const projectRoot = getProjectRoot();
  let files = [];

  // Determine files to process
  if (args.chapter && args.book) {
    // Process a chapter
    const chapterDir = path.join(projectRoot, 'books', args.book, '02-mt-output', args.chapter);
    if (!fs.existsSync(chapterDir)) {
      console.error(`Error: Chapter directory not found: ${chapterDir}`);
      process.exit(1);
    }
    files = findMarkdownFiles(chapterDir);
  } else if (args.batch) {
    // Process a directory
    const batchDir = path.resolve(args.batch);
    if (!fs.existsSync(batchDir)) {
      console.error(`Error: Directory not found: ${batchDir}`);
      process.exit(1);
    }
    files = findMarkdownFiles(batchDir);
  } else if (args.input) {
    // Process a single file
    files = [path.resolve(args.input)];
  } else {
    console.error('Error: Please provide a file, --chapter, or --batch option');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No markdown files found to process');
    process.exit(1);
  }

  const results = await processMultipleFiles(files, args);

  // Merge split files if processing a directory (chapter or batch)
  const mergeResult = { merged: 0, parts: 0 };
  if ((args.chapter || args.batch) && !args.skip.includes('merge')) {
    const targetDir = args.chapter
      ? path.join(
          process.cwd(),
          'books',
          args.book,
          '02-mt-output',
          `ch${args.chapter.padStart(2, '0')}`
        )
      : path.resolve(args.batch);

    if (fs.existsSync(targetDir)) {
      const mergeScript = path.join(__dirname, 'merge-split-files.js');
      if (fs.existsSync(mergeScript)) {
        const mergeArgs = ['--batch', targetDir];
        if (args.dryRun) mergeArgs.push('--dry-run');
        if (args.verbose) mergeArgs.push('--verbose');

        if (!args.json) {
          console.log('');
          console.log('Merging split files...');
        }

        const mergeToolResult = runTool(mergeScript, mergeArgs, args.verbose);
        if (mergeToolResult.success) {
          // Parse merge output for statistics
          const groupsMatch = mergeToolResult.stderr?.match(/Groups merged: (\d+)/);
          const partsMatch = mergeToolResult.stderr?.match(/Total parts merged: (\d+)/);
          mergeResult.merged = groupsMatch ? parseInt(groupsMatch[1], 10) : 0;
          mergeResult.parts = partsMatch ? parseInt(partsMatch[1], 10) : 0;
          if (!args.json && args.verbose) {
            console.log(`  Merged ${mergeResult.merged} groups (${mergeResult.parts} parts)`);
          }
        }
      }
    }
  }
  results.steps.merge = mergeResult;

  // Output results
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('');
    console.log('─'.repeat(50));
    console.log('Post-MT Pipeline Complete');
    console.log('─'.repeat(50));
    console.log(`  Files processed: ${results.processed}`);
    console.log(`  Successful: ${results.successful}`);
    console.log(`  Failed: ${results.failed}`);
    console.log('');
    console.log('Step Statistics:');
    console.log(`  Images restored: ${results.steps.images.count}`);
    console.log(
      `  Figures restored: ${results.steps.figures.crossRefs} cross-refs, ${results.steps.figures.captions} captions`
    );
    console.log(
      `  Links restored: ${results.steps.links.urls} URLs, ${results.steps.links.refs} refs, ${results.steps.links.docs} docs`
    );
    console.log(`  Strings restored: ${results.steps.strings.count}`);
    console.log(`  Table strings injected: ${results.steps['table-strings'].count}`);
    console.log(`  Tables restored: ${results.steps.tables.count}`);
    console.log(`  Equation strings injected: ${results.steps['equation-strings'].count}`);
    console.log(`  Equations applied: ${results.steps.equations.count}`);
    console.log(`  Directives repaired: ${results.steps.directives.count} closing markers added`);
    if (results.steps.merge && results.steps.merge.merged > 0) {
      console.log(
        `  Split files merged: ${results.steps.merge.merged} groups (${results.steps.merge.parts} parts)`
      );
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
