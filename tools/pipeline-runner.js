#!/usr/bin/env node

/**
 * pipeline-runner.js
 *
 * Orchestrates the translation preparation pipeline:
 * 1. Fetch/load CNXML source (from OpenStax GitHub or local file)
 * 2. Convert CNXML to Markdown with equation placeholders
 * 3. Generate XLIFF for Matecat translation
 * 4. Package outputs for download
 *
 * This is the foundation for automated pipeline processing, used by
 * the server API and as a standalone CLI tool.
 *
 * Usage:
 *   node tools/pipeline-runner.js <module-id> [options]
 *   node tools/pipeline-runner.js <path/to/file.cnxml> [options]
 *
 * Options:
 *   --output-dir <dir>   Output directory (default: ./pipeline-output)
 *   --book <name>        Book identifier for status tracking (e.g., efnafraedi)
 *   --skip-xliff         Don't generate XLIFF (only markdown + equations)
 *   --verbose            Show detailed progress
 *   -h, --help           Show help
 *
 * Output:
 *   - {section}.en.md        Markdown for Erlendur MT
 *   - {section}-equations.json  Equation mappings
 *   - {section}.en.xliff     XLIFF for Matecat (unless --skip-xliff)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OUTPUT_DIR = './pipeline-output';

// Known Chemistry 2e modules (from cnxml-to-md.js)
const CHEMISTRY_2E_MODULES = {
  'm68662': { chapter: 1, section: 'intro', title: 'Introduction' },
  'm68663': { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  'm68664': { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  'm68667': { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  'm68674': { chapter: 1, section: '1.4', title: 'Measurements' },
  'm68690': { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  'm68683': { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  'm68695': { chapter: 2, section: 'intro', title: 'Introduction' },
  'm68696': { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  'm68698': { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  'm68700': { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  'm68701': { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  'm68704': { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  'm68710': { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  'm68712': { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  'm68718': { chapter: 3, section: 'intro', title: 'Introduction' },
  'm68720': { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  'm68723': { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  'm68730': { chapter: 3, section: '3.3', title: 'Molarity' },
  'm68738': { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  'm68743': { chapter: 4, section: 'intro', title: 'Introduction' },
  'm68748': { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  'm68754': { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  'm68759': { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  'm68766': { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  'm68768': { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
};

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    outputDir: DEFAULT_OUTPUT_DIR,
    book: null,
    skipXliff: false,
    verbose: false,
    help: false,
    listModules: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--skip-xliff') {
      result.skipXliff = true;
    } else if (arg === '--list-modules') {
      result.listModules = true;
    } else if (arg === '--output-dir' && args[i + 1]) {
      result.outputDir = args[++i];
    } else if (arg === '--book' && args[i + 1]) {
      result.book = args[++i];
    } else if (!arg.startsWith('-') && !result.input) {
      result.input = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
pipeline-runner.js - Orchestrate translation preparation pipeline

Chains existing tools to prepare OpenStax content for translation:
1. CNXML → Markdown with equation placeholders
2. Markdown → XLIFF for CAT tools (optional)

Usage:
  node tools/pipeline-runner.js <module-id> [options]
  node tools/pipeline-runner.js <path/to/file.cnxml> [options]
  node tools/pipeline-runner.js --list-modules

Arguments:
  module-id       OpenStax module ID (e.g., m68690)
  file.cnxml      Local CNXML file path

Options:
  --output-dir <dir>   Output directory (default: ./pipeline-output)
  --book <name>        Book identifier (e.g., efnafraedi)
  --skip-xliff         Don't generate XLIFF (only markdown + equations)
  --list-modules       List known Chemistry 2e modules
  --verbose            Show detailed progress
  -h, --help           Show this help message

Pipeline Steps:
  1. cnxml-to-md.js:   CNXML → {section}.en.md + {section}-equations.json
  2. md-to-xliff.js:   {section}.en.md → {section}.en.xliff (unless --skip-xliff)

Output Files:
  {output-dir}/
  ├── {section}.en.md           # Markdown for Erlendur MT
  ├── {section}-equations.json  # Equation mappings for restoration
  └── {section}.en.xliff        # XLIFF for Matecat (optional)

Examples:
  # Process a module by ID
  node tools/pipeline-runner.js m68690 --output-dir ./test-output/

  # Process a local CNXML file
  node tools/pipeline-runner.js ./source.cnxml --output-dir ./output/

  # Skip XLIFF generation (only need markdown for MT)
  node tools/pipeline-runner.js m68690 --skip-xliff

  # List available modules
  node tools/pipeline-runner.js --list-modules
`);
}

function printModuleList() {
  console.log('\nKnown Chemistry 2e Modules:\n');
  console.log('| Module ID | Chapter | Section | Title |');
  console.log('|-----------|---------|---------|-------|');
  for (const [id, info] of Object.entries(CHEMISTRY_2E_MODULES)) {
    console.log(`| ${id} | ${info.chapter} | ${info.section} | ${info.title} |`);
  }
  console.log('\nTotal modules:', Object.keys(CHEMISTRY_2E_MODULES).length);
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
 * Run a Node.js script and return a promise
 * @param {string} scriptPath - Path to the script
 * @param {string[]} args - Arguments to pass
 * @param {object} options - Options for execution
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
function runTool(scriptPath, args, options = {}) {
  const { verbose } = options;

  return new Promise((resolve, reject) => {
    if (verbose) {
      console.log(`  Running: node ${path.basename(scriptPath)} ${args.join(' ')}`);
    }

    const child = spawn('node', [scriptPath, ...args], {
      stdio: verbose ? 'inherit' : 'pipe',
      cwd: getProjectRoot()
    });

    let stdout = '';
    let stderr = '';

    if (!verbose) {
      child.stdout?.on('data', data => { stdout += data; });
      child.stderr?.on('data', data => { stderr += data; });
    }

    child.on('close', code => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`Tool exited with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', err => {
      reject(err);
    });
  });
}

// ============================================================================
// Pipeline Steps
// ============================================================================

/**
 * Step 1: Convert CNXML to Markdown
 * @param {string} input - Module ID or file path
 * @param {string} outputDir - Output directory
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{mdPath: string, equationsPath: string, section: string}>}
 */
async function stepCnxmlToMd(input, outputDir, verbose) {
  const projectRoot = getProjectRoot();
  const scriptPath = path.join(projectRoot, 'tools', 'cnxml-to-md.js');

  // Determine output filename
  let section = 'document';
  if (/^m\d+$/.test(input)) {
    const moduleInfo = CHEMISTRY_2E_MODULES[input];
    if (moduleInfo) {
      section = moduleInfo.section.replace('.', '-');
    } else {
      section = input;
    }
  } else {
    section = path.basename(input, '.cnxml');
  }

  const mdPath = path.join(outputDir, `${section}.en.md`);
  const equationsPath = path.join(outputDir, `${section}-equations.json`);

  const args = [
    input,
    '--output', mdPath,
    '--equations', equationsPath
  ];
  if (verbose) args.push('--verbose');

  await runTool(scriptPath, args, { verbose });

  return { mdPath, equationsPath, section };
}

/**
 * Step 2: Convert Markdown to XLIFF
 * @param {string} mdPath - Path to markdown file
 * @param {string} outputDir - Output directory
 * @param {string} section - Section identifier
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{xliffPath: string}>}
 */
async function stepMdToXliff(mdPath, outputDir, section, verbose) {
  const projectRoot = getProjectRoot();
  const scriptPath = path.join(projectRoot, 'tools', 'md-to-xliff.js');

  const xliffPath = path.join(outputDir, `${section}.en.xliff`);

  const args = [
    mdPath,
    '--output', xliffPath
  ];
  if (verbose) args.push('--verbose');

  await runTool(scriptPath, args, { verbose });

  return { xliffPath };
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Run the complete pipeline
 * @param {object} options - Pipeline options
 * @returns {Promise<{outputs: object[], steps: object[]}>}
 */
async function runPipeline(options) {
  const { input, outputDir, skipXliff, verbose } = options;

  const results = {
    input,
    outputDir,
    steps: [],
    outputs: [],
    success: false
  };

  console.log('');
  console.log('═'.repeat(60));
  console.log('Translation Pipeline Runner');
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Input: ${input}`);
    console.log(`  Output directory: ${outputDir}`);
    console.log(`  Skip XLIFF: ${skipXliff}`);
    console.log('');
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    if (verbose) {
      console.log(`Created output directory: ${outputDir}`);
    }
  }

  try {
    // Step 1: CNXML → Markdown + Equations
    console.log('Step 1/2: Converting CNXML to Markdown...');
    const step1Start = Date.now();
    const { mdPath, equationsPath, section } = await stepCnxmlToMd(input, outputDir, verbose);
    const step1Time = Date.now() - step1Start;

    results.steps.push({
      name: 'cnxml-to-md',
      success: true,
      timeMs: step1Time,
      outputs: [mdPath, equationsPath]
    });
    results.outputs.push(
      { type: 'markdown', path: mdPath, description: 'Markdown for Erlendur MT' },
      { type: 'equations', path: equationsPath, description: 'Equation mappings (JSON)' }
    );

    console.log(`  ✓ Generated: ${path.basename(mdPath)}`);
    console.log(`  ✓ Generated: ${path.basename(equationsPath)}`);
    console.log('');

    // Step 2: Markdown → XLIFF (optional)
    if (!skipXliff) {
      console.log('Step 2/2: Generating XLIFF for Matecat...');
      const step2Start = Date.now();
      const { xliffPath } = await stepMdToXliff(mdPath, outputDir, section, verbose);
      const step2Time = Date.now() - step2Start;

      results.steps.push({
        name: 'md-to-xliff',
        success: true,
        timeMs: step2Time,
        outputs: [xliffPath]
      });
      results.outputs.push(
        { type: 'xliff', path: xliffPath, description: 'XLIFF for Matecat translation' }
      );

      console.log(`  ✓ Generated: ${path.basename(xliffPath)}`);
      console.log('');
    } else {
      console.log('Step 2/2: Skipped XLIFF generation (--skip-xliff)');
      console.log('');
    }

    results.success = true;

  } catch (err) {
    results.error = err.message;
    console.error(`\n✗ Error: ${err.message}`);
    if (verbose) {
      console.error(err.stack);
    }
  }

  // Summary
  console.log('═'.repeat(60));
  console.log(results.success ? 'Pipeline Complete' : 'Pipeline Failed');
  console.log('═'.repeat(60));
  console.log('');

  if (results.success) {
    console.log('Output files:');
    for (const output of results.outputs) {
      console.log(`  ${output.path}`);
      console.log(`    → ${output.description}`);
    }
    console.log('');

    console.log('Next steps:');
    console.log('  1. Send .md file to Erlendur MT (malstadur.is)');
    if (!skipXliff) {
      console.log('  2. Upload .xliff to Matecat for TM alignment');
    }
    console.log('');
  }

  return results;
}

// ============================================================================
// Programmatic API
// ============================================================================

/**
 * Run pipeline programmatically (for use by server API)
 * @param {object} options - Pipeline options
 * @returns {Promise<object>} Pipeline results
 */
async function run(options) {
  const finalOptions = {
    input: options.input || options.moduleId,
    outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
    book: options.book || null,
    skipXliff: options.skipXliff || false,
    verbose: options.verbose || false
  };

  if (!finalOptions.input) {
    throw new Error('Input (module ID or file path) is required');
  }

  return runPipeline(finalOptions);
}

// Export for programmatic use
module.exports = { run, CHEMISTRY_2E_MODULES };

// ============================================================================
// CLI Execution
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.listModules) {
    printModuleList();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: Please provide a module ID or CNXML file path');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    const results = await runPipeline(args);
    process.exit(results.success ? 0 : 1);
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Only run CLI if executed directly
if (require.main === module) {
  main();
}
