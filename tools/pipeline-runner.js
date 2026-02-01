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

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { assembleChapter } from './chapter-assembler.js';
import { processBatch as protectForMT } from './protect-for-mt.js';
import { splitDirectory as splitForErlendur, ERLENDUR_SOFT_LIMIT } from './split-for-erlendur.js';
import { processBatch as extractTableStrings } from './extract-table-strings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OUTPUT_DIR = './pipeline-output';

// Module mappings from OpenStax Chemistry 2e collection
// Verified against chemistry-2e.collection.xml from GitHub
const CHEMISTRY_2E_MODULES = {
  // Chapter 1: Essential Ideas
  m68663: { chapter: 1, section: 'intro', title: 'Introduction' },
  m68664: { chapter: 1, section: '1.1', title: 'Chemistry in Context' },
  m68667: { chapter: 1, section: '1.2', title: 'Phases and Classification of Matter' },
  m68670: { chapter: 1, section: '1.3', title: 'Physical and Chemical Properties' },
  m68674: { chapter: 1, section: '1.4', title: 'Measurements' },
  m68690: { chapter: 1, section: '1.5', title: 'Measurement Uncertainty, Accuracy, and Precision' },
  m68683: { chapter: 1, section: '1.6', title: 'Mathematical Treatment of Measurement Results' },
  // Chapter 2: Atoms, Molecules, and Ions
  m68684: { chapter: 2, section: 'intro', title: 'Introduction' },
  m68685: { chapter: 2, section: '2.1', title: 'Early Ideas in Atomic Theory' },
  m68687: { chapter: 2, section: '2.2', title: 'Evolution of Atomic Theory' },
  m68692: { chapter: 2, section: '2.3', title: 'Atomic Structure and Symbolism' },
  m68693: { chapter: 2, section: '2.4', title: 'Chemical Formulas' },
  m68695: { chapter: 2, section: '2.5', title: 'The Periodic Table' },
  m68696: { chapter: 2, section: '2.6', title: 'Ionic and Molecular Compounds' },
  m68698: { chapter: 2, section: '2.7', title: 'Chemical Nomenclature' },
  // Chapter 3: Composition of Substances and Solutions
  m68699: { chapter: 3, section: 'intro', title: 'Introduction' },
  m68700: { chapter: 3, section: '3.1', title: 'Formula Mass and the Mole Concept' },
  m68702: { chapter: 3, section: '3.2', title: 'Determining Empirical and Molecular Formulas' },
  m68703: { chapter: 3, section: '3.3', title: 'Molarity' },
  m68704: { chapter: 3, section: '3.4', title: 'Other Units for Solution Concentrations' },
  // Chapter 4: Stoichiometry of Chemical Reactions
  m68730: { chapter: 4, section: 'intro', title: 'Introduction' },
  m68709: { chapter: 4, section: '4.1', title: 'Writing and Balancing Chemical Equations' },
  m68710: { chapter: 4, section: '4.2', title: 'Classifying Chemical Reactions' },
  m68713: { chapter: 4, section: '4.3', title: 'Reaction Stoichiometry' },
  m68714: { chapter: 4, section: '4.4', title: 'Reaction Yields' },
  m68716: { chapter: 4, section: '4.5', title: 'Quantitative Chemical Analysis' },
  // Chapter 5: Thermochemistry
  m68723: { chapter: 5, section: 'intro', title: 'Introduction' },
  m68724: { chapter: 5, section: '5.1', title: 'Energy Basics' },
  m68726: { chapter: 5, section: '5.2', title: 'Calorimetry' },
  m68727: { chapter: 5, section: '5.3', title: 'Enthalpy' },
  // Chapter 9: Gases
  m68748: { chapter: 9, section: 'intro', title: 'Introduction' },
  m68750: { chapter: 9, section: '9.1', title: 'Gas Pressure' },
  m68751: {
    chapter: 9,
    section: '9.2',
    title: 'Relating Pressure, Volume, Amount, and Temperature: The Ideal Gas Law',
  },
  m68752: {
    chapter: 9,
    section: '9.3',
    title: 'Stoichiometry of Gaseous Substances, Mixtures, and Reactions',
  },
  m68754: { chapter: 9, section: '9.4', title: 'Effusion and Diffusion of Gases' },
  m68758: { chapter: 9, section: '9.5', title: 'The Kinetic-Molecular Theory' },
  m68759: { chapter: 9, section: '9.6', title: 'Non-Ideal Gas Behavior' },
  // Chapter 12: Kinetics
  m68785: { chapter: 12, section: 'intro', title: 'Introduction' },
  m68786: { chapter: 12, section: '12.1', title: 'Chemical Reaction Rates' },
  m68787: { chapter: 12, section: '12.2', title: 'Factors Affecting Reaction Rates' },
  m68789: { chapter: 12, section: '12.3', title: 'Rate Laws' },
  m68791: { chapter: 12, section: '12.4', title: 'Integrated Rate Laws' },
  m68793: { chapter: 12, section: '12.5', title: 'Collision Theory' },
  m68794: { chapter: 12, section: '12.6', title: 'Reaction Mechanisms' },
  m68795: { chapter: 12, section: '12.7', title: 'Catalysis' },
  // Chapter 13: Fundamental Equilibrium Concepts
  m68796: { chapter: 13, section: 'intro', title: 'Introduction' },
  m68797: { chapter: 13, section: '13.1', title: 'Chemical Equilibria' },
  m68798: { chapter: 13, section: '13.2', title: 'Equilibrium Constants' },
  m68799: { chapter: 13, section: '13.3', title: "Shifting Equilibria: Le Châtelier's Principle" },
  m68801: { chapter: 13, section: '13.4', title: 'Equilibrium Calculations' },
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
    skipProtect: false, // Skip the pre-MT protection step
    skipSplit: false, // Skip the file splitting step
    verbose: false,
    help: false,
    listModules: false,
    chapter: null, // Process entire chapter with correct numbering
    assemble: false, // Run chapter assembly after conversion
    assembleTrack: 'faithful', // Publication track for assembly: mt-preview, faithful, localized
    assembleOnly: false, // Only run assembly (skip conversion)
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
    } else if (arg === '--chapter' && args[i + 1]) {
      result.chapter = parseInt(args[++i], 10);
    } else if (arg === '--assemble') {
      result.assemble = true;
    } else if (arg === '--assemble-only') {
      result.assembleOnly = true;
      result.assemble = true;
    } else if (arg === '--assemble-track' && args[i + 1]) {
      result.assembleTrack = args[++i];
    } else if (arg === '--skip-protect') {
      result.skipProtect = true;
    } else if (arg === '--skip-split') {
      result.skipSplit = true;
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
3. Assembly → 12-file publication structure (optional)

Usage:
  node tools/pipeline-runner.js <module-id> [options]
  node tools/pipeline-runner.js <path/to/file.cnxml> [options]
  node tools/pipeline-runner.js --chapter <num> [options]
  node tools/pipeline-runner.js --list-modules

Arguments:
  module-id       OpenStax module ID (e.g., m68690)
  file.cnxml      Local CNXML file path

Options:
  --output-dir <dir>   Output directory (default: ./pipeline-output)
  --book <name>        Book identifier (e.g., efnafraedi)
  --chapter <num>      Process all modules in a chapter with correct numbering
  --skip-xliff         Don't generate XLIFF (only markdown + equations)
  --skip-protect       Skip pre-MT protection (for manual workflows)
  --skip-split         Skip file splitting for Erlendur 18k limit
  --assemble           Run chapter assembly after conversion (requires --chapter)
  --assemble-only      Only run assembly, skip conversion (requires --chapter)
  --assemble-track T   Publication track for assembly: mt-preview, faithful, localized
  --list-modules       List known Chemistry 2e modules
  --verbose            Show detailed progress
  -h, --help           Show this help message

Pipeline Steps:
  1. cnxml-to-md.js:               CNXML → {section}.en.md + {section}-equations.json
  1b. extract-equation-strings.js: Extract translatable text from equations
  1c. protect-for-mt.js:           Protect tables/frontmatter → {section}-protected.json
  1d. split-for-erlendur.js:       Split files >18k chars → {section}(a).en.md, etc.
  2. md-to-xliff.js:               {section}.en.md → {section}.en.xliff (unless --skip-xliff)
  3. chapter-assembler.js:         7 modules → 12 publication files (with --assemble)

Output Files:
  {output-dir}/
  ├── {section}.en.md                   # Markdown for Erlendur MT (tables protected)
  ├── {section}-equations.json          # Equation mappings for restoration
  ├── {section}-equation-strings.en.md  # Translatable equation text (for MT)
  ├── {section}-protected.json          # Protected tables/frontmatter for restoration
  ├── {section}-strings.en.md           # Translatable titles/summaries (for MT)
  └── {section}.en.xliff                # XLIFF for Matecat (optional)

  With --assemble:
  05-publication/{track}/chapters/{NN}/
  ├── {ch}-0-introduction.is.md     # Stripped module files
  ├── {ch}-1-*.is.md                # ...
  ├── {ch}-key-terms.is.md          # Aggregated, alphabetized
  ├── {ch}-key-equations.is.md      # Aggregated
  ├── {ch}-summary.is.md            # Aggregated by section
  └── {ch}-exercises.is.md          # Aggregated, running numbers

Examples:
  # Process a module by ID
  node tools/pipeline-runner.js m68690 --output-dir ./test-output/

  # Process a local CNXML file
  node tools/pipeline-runner.js ./source.cnxml --output-dir ./output/

  # Process entire chapter with assembly
  node tools/pipeline-runner.js --chapter 1 --book efnafraedi --assemble

  # Assembly only (after manual translation work)
  node tools/pipeline-runner.js --chapter 1 --book efnafraedi --assemble-only --assemble-track faithful

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
  const { verbose, captureStderr } = options;

  return new Promise((resolve, reject) => {
    if (verbose) {
      console.log(`  Running: node ${path.basename(scriptPath)} ${args.join(' ')}`);
    }

    // If captureStderr is true, always capture stderr even in verbose mode
    const stdioConfig =
      verbose && !captureStderr
        ? 'inherit'
        : captureStderr
          ? ['pipe', verbose ? 'inherit' : 'pipe', 'pipe']
          : 'pipe';

    const child = spawn('node', [scriptPath, ...args], {
      stdio: stdioConfig,
      cwd: getProjectRoot(),
    });

    let stdout = '';
    let stderr = '';

    if (stdioConfig !== 'inherit') {
      child.stdout?.on('data', (data) => {
        stdout += data;
      });
      child.stderr?.on('data', (data) => {
        stderr += data;
        // In captureStderr + verbose mode, also print stderr to console
        if (captureStderr && verbose) {
          process.stderr.write(data);
        }
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
// Pipeline Steps
// ============================================================================

/**
 * Step 1: Convert CNXML to Markdown
 * @param {string} input - Module ID or file path
 * @param {string} outputDir - Output directory
 * @param {boolean} verbose - Verbose output
 * @param {object} counters - Optional starting counters {examples, figures, tables}
 * @param {number} chapter - Optional chapter number override
 * @param {string} sectionOverride - Optional section from caller (e.g., "1.5" or "intro")
 * @returns {Promise<{mdPath: string, equationsPath: string, section: string, counters: object}>}
 */
async function stepCnxmlToMd(
  input,
  outputDir,
  verbose,
  counters = null,
  chapter = null,
  sectionOverride = null
) {
  const projectRoot = getProjectRoot();
  const scriptPath = path.join(projectRoot, 'tools', 'cnxml-to-md.js');

  // Determine output filename
  let section = 'document';

  if (sectionOverride) {
    // Use provided section (from workflow JSON data) - THIS IS THE PRIMARY PATH
    section = sectionOverride.replace('.', '-');
  } else if (/^m\d+$/.test(input)) {
    // Fallback to hardcoded lookup (for CLI use, backward compatibility)
    const moduleInfo = CHEMISTRY_2E_MODULES[input];
    if (moduleInfo) {
      section = moduleInfo.section.replace('.', '-');
    } else {
      // Last resort: use module ID as section
      section = input;
    }
  } else {
    section = path.basename(input, '.cnxml');
  }

  const mdPath = path.join(outputDir, `${section}.en.md`);
  const equationsPath = path.join(outputDir, `${section}-equations.json`);

  const args = [
    input,
    '--output',
    mdPath,
    '--equations',
    equationsPath,
    '--output-counters', // Request counter output for pipeline coordination
  ];

  // Add counter starting values if provided
  if (counters) {
    if (counters.examples > 0) args.push('--example-start', String(counters.examples));
    if (counters.figures > 0) args.push('--figure-start', String(counters.figures));
    if (counters.tables > 0) args.push('--table-start', String(counters.tables));
  }

  // Add chapter override if provided
  if (chapter !== null) {
    args.push('--chapter', String(chapter));
  }

  if (verbose) args.push('--verbose');

  const output = await runTool(scriptPath, args, { verbose, captureStderr: true });

  // Parse counter output from stderr
  let finalCounters = { examples: 0, figures: 0, tables: 0 };
  if (output && output.stderr) {
    const counterMatch = output.stderr.match(/COUNTERS:(\{.*\})/);
    if (counterMatch) {
      try {
        finalCounters = JSON.parse(counterMatch[1]);
      } catch (e) {
        // Ignore parse errors, use default counters
      }
    }
  }

  return { mdPath, equationsPath, section, counters: finalCounters };
}

/**
 * Step 1b: Extract translatable text from equations
 * @param {string} equationsPath - Path to equations.json file
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{stringsPath: string|null, stringsExtracted: number}>}
 */
async function stepExtractEquationStrings(equationsPath, verbose) {
  const projectRoot = getProjectRoot();
  const scriptPath = path.join(projectRoot, 'tools', 'extract-equation-strings.js');

  if (!fs.existsSync(scriptPath)) {
    if (verbose) {
      console.log('  [SKIP] extract-equation-strings.js not found');
    }
    return { stringsPath: null, stringsExtracted: 0 };
  }

  const args = [equationsPath];
  if (verbose) args.push('--verbose');

  try {
    const output = await runTool(scriptPath, args, { verbose, captureStderr: true });

    // Parse output to get extraction count
    let stringsExtracted = 0;
    const countMatch = output.stdout?.match(/Extracted (\d+) translatable string/);
    if (countMatch) {
      stringsExtracted = parseInt(countMatch[1], 10);
    }

    // Determine output file path
    const dir = path.dirname(equationsPath);
    const basename = path.basename(equationsPath, '-equations.json');
    const stringsPath = path.join(dir, `${basename}-equation-strings.en.md`);

    return {
      stringsPath: fs.existsSync(stringsPath) ? stringsPath : null,
      stringsExtracted,
    };
  } catch (err) {
    if (verbose) {
      console.log(`  [WARN] Equation string extraction failed: ${err.message}`);
    }
    return { stringsPath: null, stringsExtracted: 0 };
  }
}

/**
 * Step 1c: Run pre-MT protection on output directory
 * Protects tables and frontmatter by replacing with placeholders
 * @param {string} outputDir - Directory containing .en.md files
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{tablesProtected: number, filesProtected: number}>}
 */
async function stepProtectForMT(outputDir, verbose) {
  if (verbose) {
    console.log(`  Running pre-MT protection on: ${outputDir}`);
  }

  // Capture console output to count results
  let tablesProtected = 0;
  let filesProtected = 0;

  // Use the imported protectForMT (processBatch) function
  // It processes all .en.md files in the directory
  const originalLog = console.log;
  const originalError = console.error;

  // Temporarily capture output to parse results
  const capturedOutput = [];
  console.log = (...args) => {
    capturedOutput.push(args.join(' '));
    if (verbose) originalLog(...args);
  };
  console.error = (...args) => {
    capturedOutput.push(args.join(' '));
    if (verbose) originalError(...args);
  };

  try {
    protectForMT(outputDir, { inPlace: true, verbose, dryRun: false });

    // Parse output to count results
    for (const line of capturedOutput) {
      const tableMatch = line.match(/Total tables protected:\s*(\d+)/);
      if (tableMatch) {
        tablesProtected = parseInt(tableMatch[1], 10);
      }
      const filesMatch = line.match(/Files with tables:\s*(\d+)/);
      if (filesMatch) {
        filesProtected = parseInt(filesMatch[1], 10);
      }
    }
  } finally {
    // Restore console
    console.log = originalLog;
    console.error = originalError;
  }

  return { tablesProtected, filesProtected };
}

/**
 * Step 1c2: Extract translatable strings from tables
 * Reads protected.json files and extracts headers/cell values for MT
 * @param {string} outputDir - Directory containing *-protected.json files
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{tableStringsExtracted: number, filesWithTableStrings: number}>}
 */
async function stepExtractTableStrings(outputDir, verbose) {
  if (verbose) {
    console.log(`  Extracting table strings from: ${outputDir}`);
  }

  // Capture console output to count results
  let tableStringsExtracted = 0;
  let filesWithTableStrings = 0;

  const originalLog = console.log;
  const originalError = console.error;

  const capturedOutput = [];
  console.log = (...args) => {
    capturedOutput.push(args.join(' '));
    if (verbose) originalLog(...args);
  };
  console.error = (...args) => {
    capturedOutput.push(args.join(' '));
    if (verbose) originalError(...args);
  };

  try {
    extractTableStrings(outputDir, { verbose, dryRun: false });

    // Parse output to count results
    for (const line of capturedOutput) {
      const stringsMatch = line.match(/Total strings extracted:\s*(\d+)/);
      if (stringsMatch) {
        tableStringsExtracted = parseInt(stringsMatch[1], 10);
      }
      const filesMatch = line.match(/Files with translatable strings:\s*(\d+)/);
      if (filesMatch) {
        filesWithTableStrings = parseInt(filesMatch[1], 10);
      }
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { tableStringsExtracted, filesWithTableStrings };
}

/**
 * Step 1d: Split large files for Erlendur MT character limits
 * Files >18,000 characters are split at paragraph boundaries
 * @param {string} outputDir - Directory containing .en.md files
 * @param {boolean} verbose - Verbose output
 * @returns {Promise<{filesSplit: number, partsCreated: number, filesUnchanged: number}>}
 */
async function stepSplitForErlendur(outputDir, verbose) {
  if (verbose) {
    console.log(`  Splitting large files (>${ERLENDUR_SOFT_LIMIT} chars) in: ${outputDir}`);
  }

  // Use the imported splitForErlendur (splitDirectory) function
  const result = splitForErlendur(outputDir, { verbose, dryRun: false });

  return result;
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

  const args = [mdPath, '--output', xliffPath];
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
  const {
    input,
    section: sectionOverride,
    outputDir,
    skipXliff,
    skipProtect,
    skipSplit,
    verbose,
  } = options;

  const results = {
    input,
    outputDir,
    steps: [],
    outputs: [],
    success: false,
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

  // Determine total steps for progress display
  const totalSteps = (skipXliff ? 0 : 1) + 3; // Convert + Protect + Split + optionally XLIFF
  let currentStep = 0;

  try {
    // Step 1: CNXML → Markdown + Equations
    currentStep++;
    console.log(`Step ${currentStep}/${totalSteps}: Converting CNXML to Markdown...`);
    const step1Start = Date.now();
    const { mdPath, equationsPath, section } = await stepCnxmlToMd(
      input,
      outputDir,
      verbose,
      null,
      null,
      sectionOverride
    );
    const step1Time = Date.now() - step1Start;

    results.steps.push({
      name: 'cnxml-to-md',
      success: true,
      timeMs: step1Time,
      outputs: [mdPath, equationsPath],
    });
    results.outputs.push(
      { type: 'markdown', path: mdPath, description: 'Markdown for Erlendur MT' },
      { type: 'equations', path: equationsPath, description: 'Equation mappings (JSON)' }
    );

    console.log(`  ✓ Generated: ${path.basename(mdPath)}`);
    console.log(`  ✓ Generated: ${path.basename(equationsPath)}`);

    // Step 1b: Extract translatable text from equations
    const { stringsPath, stringsExtracted } = await stepExtractEquationStrings(
      equationsPath,
      verbose
    );
    if (stringsPath) {
      results.outputs.push({
        type: 'equation-strings',
        path: stringsPath,
        description: 'Equation text for translation',
      });
      console.log(`  ✓ Generated: ${path.basename(stringsPath)} (${stringsExtracted} strings)`);
    }
    console.log('');

    // Step 2: Pre-MT protection (tables and frontmatter)
    currentStep++;
    if (!skipProtect) {
      console.log(`Step ${currentStep}/${totalSteps}: Protecting tables and frontmatter for MT...`);
      const step2Start = Date.now();
      const { tablesProtected, filesProtected } = await stepProtectForMT(outputDir, verbose);
      const step2Time = Date.now() - step2Start;

      results.steps.push({
        name: 'protect-for-mt',
        success: true,
        timeMs: step2Time,
        tablesProtected,
        filesProtected,
      });

      console.log(`  ✓ Protected ${tablesProtected} table(s) in ${filesProtected} file(s)`);
      console.log('');
    } else {
      console.log(`Step ${currentStep}/${totalSteps}: Skipped pre-MT protection (--skip-protect)`);
      console.log('');
    }

    // Step 3: Split large files for Erlendur 18k character limit
    currentStep++;
    if (!skipSplit) {
      console.log(`Step ${currentStep}/${totalSteps}: Splitting large files for Erlendur...`);
      const step3Start = Date.now();
      const { filesSplit, partsCreated } = await stepSplitForErlendur(outputDir, verbose);
      const step3Time = Date.now() - step3Start;

      results.steps.push({
        name: 'split-for-erlendur',
        success: true,
        timeMs: step3Time,
        filesSplit,
        partsCreated,
      });

      if (filesSplit > 0) {
        console.log(`  ✓ Split ${filesSplit} file(s) into ${partsCreated} parts`);
      } else {
        console.log(`  ✓ No files needed splitting (all under 18k chars)`);
      }
      console.log('');
    } else {
      console.log(`Step ${currentStep}/${totalSteps}: Skipped file splitting (--skip-split)`);
      console.log('');
    }

    // Step 4: Markdown → XLIFF (optional)
    if (!skipXliff) {
      currentStep++;
      console.log(`Step ${currentStep}/${totalSteps}: Generating XLIFF for Matecat...`);
      const step3Start = Date.now();
      const { xliffPath } = await stepMdToXliff(mdPath, outputDir, section, verbose);
      const step3Time = Date.now() - step3Start;

      results.steps.push({
        name: 'md-to-xliff',
        success: true,
        timeMs: step3Time,
        outputs: [xliffPath],
      });
      results.outputs.push({
        type: 'xliff',
        path: xliffPath,
        description: 'XLIFF for Matecat translation',
      });

      console.log(`  ✓ Generated: ${path.basename(xliffPath)}`);
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
// Chapter Pipeline
// ============================================================================

/**
 * Get all modules for a specific chapter in order
 * @param {number} chapter - Chapter number
 * @returns {Array<{moduleId: string, section: string, title: string}>}
 */
function getChapterModules(chapter) {
  const modules = [];
  for (const [moduleId, info] of Object.entries(CHEMISTRY_2E_MODULES)) {
    if (info.chapter === chapter) {
      modules.push({ moduleId, ...info });
    }
  }
  // Sort by section: intro first, then numerically
  modules.sort((a, b) => {
    if (a.section === 'intro') return -1;
    if (b.section === 'intro') return 1;
    const aNum = parseFloat(a.section.split('.')[1]) || 0;
    const bNum = parseFloat(b.section.split('.')[1]) || 0;
    return aNum - bNum;
  });
  return modules;
}

/**
 * Run pipeline for an entire chapter with correct running numbering
 * @param {object} options - Pipeline options including chapter number
 * @returns {Promise<{outputs: object[], steps: object[]}>}
 */
async function runChapterPipeline(options) {
  const { chapter, outputDir, skipXliff, skipProtect, skipSplit, verbose } = options;

  const modules = getChapterModules(chapter);
  if (modules.length === 0) {
    throw new Error(`No modules found for chapter ${chapter}`);
  }

  const results = {
    chapter,
    outputDir,
    modules: [],
    steps: [],
    outputs: [],
    success: false,
  };

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Chapter ${chapter} Pipeline Runner`);
  console.log('═'.repeat(60));
  console.log('');

  console.log(`Processing ${modules.length} modules:`);
  for (const mod of modules) {
    console.log(`  • ${mod.moduleId} (${mod.section}): ${mod.title}`);
  }
  console.log('');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    if (verbose) {
      console.log(`Created output directory: ${outputDir}`);
    }
  }

  // Track running counters across modules
  let counters = { examples: 0, figures: 0, tables: 0 };

  try {
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      const stepNum = i + 1;
      const totalSteps = modules.length;

      console.log(`─`.repeat(60));
      console.log(`Module ${stepNum}/${totalSteps}: ${mod.section} - ${mod.title}`);
      console.log(
        `  Counters: examples=${counters.examples}, figures=${counters.figures}, tables=${counters.tables}`
      );
      console.log('');

      // Step 1: CNXML → Markdown + Equations
      console.log('  Converting CNXML to Markdown...');
      const step1Start = Date.now();
      const {
        mdPath,
        equationsPath,
        section,
        counters: newCounters,
      } = await stepCnxmlToMd(mod.moduleId, outputDir, verbose, counters, chapter);
      const step1Time = Date.now() - step1Start;

      // Update counters for next module
      counters = newCounters;

      results.steps.push({
        name: `cnxml-to-md:${mod.moduleId}`,
        success: true,
        timeMs: step1Time,
        outputs: [mdPath, equationsPath],
      });
      results.outputs.push(
        { type: 'markdown', path: mdPath, section, description: `${mod.section} Markdown` },
        { type: 'equations', path: equationsPath, section, description: `${mod.section} Equations` }
      );
      // Step 1b: Extract translatable text from equations
      const { stringsPath: eqStringsPath, stringsExtracted } = await stepExtractEquationStrings(
        equationsPath,
        verbose
      );
      if (eqStringsPath) {
        results.outputs.push({
          type: 'equation-strings',
          path: eqStringsPath,
          section,
          description: `${mod.section} Equation Strings`,
        });
      }

      results.modules.push({
        moduleId: mod.moduleId,
        section: mod.section,
        title: mod.title,
        mdPath,
        equationsPath,
        equationStringsPath: eqStringsPath,
        counters: { ...newCounters },
      });

      console.log(`    ✓ ${path.basename(mdPath)}`);
      console.log(`    ✓ ${path.basename(equationsPath)}`);
      if (eqStringsPath) {
        console.log(`    ✓ ${path.basename(eqStringsPath)} (${stringsExtracted} strings)`);
      }

      // Step 2: Markdown → XLIFF (optional)
      if (!skipXliff) {
        console.log('  Generating XLIFF...');
        const step2Start = Date.now();
        const { xliffPath } = await stepMdToXliff(mdPath, outputDir, section, verbose);
        const step2Time = Date.now() - step2Start;

        results.steps.push({
          name: `md-to-xliff:${mod.moduleId}`,
          success: true,
          timeMs: step2Time,
          outputs: [xliffPath],
        });
        results.outputs.push({
          type: 'xliff',
          path: xliffPath,
          section,
          description: `${mod.section} XLIFF`,
        });

        console.log(`    ✓ ${path.basename(xliffPath)}`);
      }

      console.log('');
    }

    // After all modules processed, run pre-MT protection on the entire directory
    console.log(`─`.repeat(60));
    if (!skipProtect) {
      console.log('Running pre-MT protection on all files...');
      const protectStart = Date.now();
      const { tablesProtected, filesProtected } = await stepProtectForMT(outputDir, verbose);
      const protectTime = Date.now() - protectStart;

      results.steps.push({
        name: 'protect-for-mt',
        success: true,
        timeMs: protectTime,
        tablesProtected,
        filesProtected,
      });

      console.log(`  ✓ Protected ${tablesProtected} table(s) in ${filesProtected} file(s)`);

      // Extract table strings for MT (only if tables were protected)
      if (tablesProtected > 0) {
        const tableStringsStart = Date.now();
        const { tableStringsExtracted, filesWithTableStrings } = await stepExtractTableStrings(
          outputDir,
          verbose
        );
        const tableStringsTime = Date.now() - tableStringsStart;

        results.steps.push({
          name: 'extract-table-strings',
          success: true,
          timeMs: tableStringsTime,
          tableStringsExtracted,
          filesWithTableStrings,
        });

        if (tableStringsExtracted > 0) {
          console.log(
            `  ✓ Extracted ${tableStringsExtracted} table string(s) from ${filesWithTableStrings} file(s)`
          );
        }
      }
      console.log('');
    } else {
      console.log('Skipped pre-MT protection (--skip-protect)');
      console.log('');
    }

    // Split large files for Erlendur 18k character limit
    console.log(`─`.repeat(60));
    if (!skipSplit) {
      console.log('Splitting large files for Erlendur...');
      const splitStart = Date.now();
      const { filesSplit, partsCreated } = await stepSplitForErlendur(outputDir, verbose);
      const splitTime = Date.now() - splitStart;

      results.steps.push({
        name: 'split-for-erlendur',
        success: true,
        timeMs: splitTime,
        filesSplit,
        partsCreated,
      });

      if (filesSplit > 0) {
        console.log(`  ✓ Split ${filesSplit} file(s) into ${partsCreated} parts`);
      } else {
        console.log(`  ✓ No files needed splitting (all under 18k chars)`);
      }
      console.log('');
    } else {
      console.log('Skipped file splitting (--skip-split)');
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
  console.log(results.success ? 'Chapter Pipeline Complete' : 'Chapter Pipeline Failed');
  console.log('═'.repeat(60));
  console.log('');

  if (results.success) {
    console.log(`Final counters for Chapter ${chapter}:`);
    console.log(`  Examples: ${counters.examples}`);
    console.log(`  Figures: ${counters.figures}`);
    console.log(`  Tables: ${counters.tables}`);
    console.log('');

    console.log(`Generated ${results.outputs.length} files in ${outputDir}`);
    console.log('');

    console.log('Next steps:');
    console.log('  1. Send .md files to Erlendur MT (malstadur.is)');
    if (!skipXliff) {
      console.log('  2. Upload .xliff files to Matecat for TM alignment');
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
    section: options.section || null, // Accept section from caller (e.g., "1.5" or "intro")
    title: options.title || null, // Accept title for metadata
    outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
    book: options.book || null,
    skipXliff: options.skipXliff || false,
    skipProtect: options.skipProtect || false,
    skipSplit: options.skipSplit || false,
    verbose: options.verbose || false,
  };

  if (!finalOptions.input) {
    throw new Error('Input (module ID or file path) is required');
  }

  return runPipeline(finalOptions);
}

// Export for programmatic use
export { run, runChapterPipeline, CHEMISTRY_2E_MODULES, assembleChapter };

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

  // Handle chapter mode
  if (args.chapter !== null) {
    try {
      let conversionSuccess = true;

      // Run conversion pipeline unless --assemble-only
      if (!args.assembleOnly) {
        const results = await runChapterPipeline(args);
        conversionSuccess = results.success;
      }

      // Run assembly if requested and conversion succeeded (or skipped)
      if (args.assemble && conversionSuccess) {
        const assemblyOptions = {
          chapter: args.chapter,
          book: args.book || 'efnafraedi',
          track: args.assembleTrack,
          verbose: args.verbose,
          dryRun: false,
          lang: 'is',
        };

        console.log('\n');
        const assemblyResult = await assembleChapter(assemblyOptions);

        if (!assemblyResult.success) {
          console.error('Assembly failed');
          process.exit(1);
        }
      }

      process.exit(conversionSuccess ? 0 : 1);
    } catch (err) {
      console.error(`\nFatal error: ${err.message}`);
      if (args.verbose) {
        console.error(err.stack);
      }
      process.exit(1);
    }
    return;
  }

  // Handle single module mode
  if (!args.input) {
    console.error('Error: Please provide a module ID, CNXML file path, or --chapter <num>');
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
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  main();
}
