#!/usr/bin/env node

/**
 * api-translate.js — Automated MT via Málstaður API
 *
 * Translates English segment files to Icelandic using the Miðeind Málstaður
 * API. Sends whole module files directly — no protection or splitting needed.
 * Part of the Extract-Inject-Render pipeline.
 *
 * Usage:
 *   node tools/api-translate.js --book <slug> --chapter <num> [--module <id>]
 *   node tools/api-translate.js --book <slug>
 *   node tools/api-translate.js --book <slug> --dry-run
 *
 * Options:
 *   --book <slug>       Book slug (default: efnafraedi-2e)
 *   --chapter <num>     Chapter number (omit for whole book)
 *   --module <id>       Single module ID (requires --chapter)
 *   --force             Overwrite existing output files
 *   --dry-run, -n       Show what would be translated + cost estimate
 *   --no-glossary       Don't send glossary terms with requests
 *   --rate-delay <ms>   Delay between API calls (default: 500)
 *   -v, --verbose       Detailed progress output
 *   -h, --help          Show this help
 *
 * Environment:
 *   MALSTADUR_API_KEY   API key from Miðeind (or set in .env file)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION } from './lib/parseArgs.js';
import { createClient, formatGlossary } from './lib/malstadur-api.js';

// ─── Configuration ──────────────────────────────────────────────────

let BOOKS_DIR = 'books/efnafraedi-2e';

// ─── Unicode Normalization ──────────────────────────────────────────

const SUBSCRIPT_MAP = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
};

const SUPERSCRIPT_MAP = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
};

const SUB_CHARS = Object.keys(SUBSCRIPT_MAP).join('');
const SUP_CHARS = Object.keys(SUPERSCRIPT_MAP).join('');

const SUB_REGEX = new RegExp(`[${SUB_CHARS}]+`, 'g');
const SUP_REGEX = new RegExp(`[${SUP_CHARS}]+`, 'g');

/**
 * Convert Unicode subscript/superscript characters to ~N~ / ^N^ markdown format.
 * Groups consecutive characters: ₁₂₃ → ~123~
 */
export function normalizeUnicode(text) {
  let result = text.replace(SUB_REGEX, (match) => {
    const converted = [...match].map((ch) => SUBSCRIPT_MAP[ch]).join('');
    return `~${converted}~`;
  });
  result = result.replace(SUP_REGEX, (match) => {
    const converted = [...match].map((ch) => SUPERSCRIPT_MAP[ch]).join('');
    return `^${converted}^`;
  });
  return result;
}

// ─── .env Loading ───────────────────────────────────────────────────

/**
 * Parse a .env file into a key-value object.
 * Skips comments (#) and empty lines. Strips surrounding quotes.
 */
export function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ─── Module Discovery ───────────────────────────────────────────────

/**
 * Find translatable .en.md module files in a directory.
 * Excludes split files like (b).en.md — those are artifacts of the web UI workflow.
 */
export function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.match(/^m\d+-segments\.en\.md$/))
    .sort();
  return files.map((f) => {
    const moduleId = f.match(/^(m\d+)-/)[1];
    return { moduleId, filename: f, path: path.join(dir, f) };
  });
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Validate that input and output have the same number of SEG markers.
 * Returns false if the API truncated or corrupted the output.
 */
export function validateMarkers(input, output) {
  const inputCount = (input.match(/<!-- SEG:/g) || []).length;
  const outputCount = (output.match(/<!-- SEG:/g) || []).length;
  return inputCount === outputCount;
}

// ─── Book → Domain Mapping ──────────────────────────────────────────

/**
 * Derive glossary domain from book slug.
 */
export function bookToDomain(bookSlug) {
  if (bookSlug.startsWith('efnafraedi')) return 'chemistry';
  if (bookSlug.startsWith('liffraedi')) return 'biology';
  if (bookSlug.startsWith('orverufraedi')) return 'microbiology';
  return 'science';
}

// ─── Glossary Loading ───────────────────────────────────────────────

/**
 * Load glossary from a book's glossary directory.
 * Returns API-formatted glossary object or null if unavailable.
 */
export function loadGlossary(glossaryDir, domain) {
  const glossaryPath = path.join(glossaryDir, 'glossary-unified.json');
  if (!fs.existsSync(glossaryPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    const glossary = formatGlossary(data.terms || [], { domain, approvedOnly: true });
    if (glossary.terms.length === 0) return null;
    return glossary;
  } catch {
    return null;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'force', flags: ['--force'], type: 'boolean', default: false },
    { name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean', default: false },
    { name: 'noGlossary', flags: ['--no-glossary'], type: 'boolean', default: false },
    { name: 'rateDelay', flags: ['--rate-delay'], type: 'number', default: 500 },
    { name: 'updateStatus', flags: ['--update-status'], type: 'boolean', default: false },
  ]);
}

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function printHelp() {
  console.log(`
api-translate.js — Automated MT via Málstaður API

Translates English segment files to Icelandic using the Miðeind Málstaður API.
Sends whole module files directly — no protection or splitting needed.

Usage:
  node tools/api-translate.js --book <slug> --chapter <num> [--module <id>]
  node tools/api-translate.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --force             Overwrite existing output files
  --dry-run, -n       Show what would be translated + cost estimate
  --no-glossary       Don't send glossary terms with requests
  --rate-delay <ms>   Delay between API calls (default: 500)
  --update-status     Mark mtOutput stage as complete in pipeline DB
  -v, --verbose       Detailed progress output
  -h, --help          Show this help

Environment:
  MALSTADUR_API_KEY   API key (or set in .env file)

Examples:
  node tools/api-translate.js --book efnafraedi-2e --chapter 1
  node tools/api-translate.js --book efnafraedi-2e --dry-run
  node tools/api-translate.js --book liffraedi-2e --chapter 3 --module m71234
`);
}

// ─── Chapter Discovery ──────────────────────────────────────────────

/**
 * Discover chapter directories for a book.
 * Returns sorted list: ['ch01', 'ch02', ..., 'appendices']
 */
function discoverChapters(bookDir) {
  const mtDir = path.join(bookDir, '02-for-mt');
  if (!fs.existsSync(mtDir)) return [];
  return fs
    .readdirSync(mtDir)
    .filter((d) => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

// ─── Translation ────────────────────────────────────────────────────

/**
 * Translate a single module file via the API.
 */
async function translateModule(client, inputPath, outputPath, glossary) {
  const input = fs.readFileSync(inputPath, 'utf8');

  const translateOpts = { targetLanguage: 'is' };
  if (glossary) {
    translateOpts.glossaries = [glossary];
  }

  const result = await client.translateAuto(input, translateOpts);
  let output = result.text;

  // Post-process: normalize Unicode sub/superscripts
  output = normalizeUnicode(output);

  // Validate marker count
  if (!validateMarkers(input, output)) {
    const inputCount = (input.match(/<!-- SEG:/g) || []).length;
    const outputCount = (output.match(/<!-- SEG:/g) || []).length;
    throw new Error(
      `Segment marker mismatch: input has ${inputCount}, output has ${outputCount}. ` +
        `API may have truncated the response.`
    );
  }

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, output, 'utf8');

  // Copy -links.json if it exists
  const linksFilename = path.basename(inputPath).replace('-segments.en.md', '-segments-links.json');
  const linksSource = path.join(path.dirname(inputPath), linksFilename);
  if (fs.existsSync(linksSource)) {
    const linksDest = path.join(outputDir, linksFilename);
    fs.copyFileSync(linksSource, linksDest);
  }

  return { chars: input.length, usage: result.usage };
}

// ─── Pipeline Status ────────────────────────────────────────────────

/**
 * Update pipeline status for translated chapters.
 * Uses the server's pipelineStatusService directly (standalone, no server needed).
 * Fails silently — status updates should never block translation.
 */
async function updatePipelineStatus(bookSlug, chapters) {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    let pipelineStatus;
    try {
      pipelineStatus = require('../server/services/pipelineStatusService.js');
    } catch {
      console.warn('  Warning: Could not load pipeline status service (server not set up?)');
      return;
    }

    for (const chapterDir of chapters) {
      const chapterNum = chapterDir === 'appendices' ? -1 : parseInt(chapterDir.slice(2), 10);
      try {
        pipelineStatus.transitionStage(
          bookSlug,
          chapterNum,
          'mtOutput',
          'complete',
          'api-translate'
        );
        console.log(`  ${chapterDir}: mtOutput → complete`);
      } catch (err) {
        console.warn(`  ${chapterDir}: status update failed — ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Warning: Pipeline status update skipped — ${err.message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate: --module requires --chapter
  if (args.module && !args.chapter) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const mtInputDir = path.join(BOOKS_DIR, '02-for-mt');
  const mtOutputDir = path.join(BOOKS_DIR, '02-mt-output');

  // Load .env if API key not in environment
  if (!process.env.MALSTADUR_API_KEY) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const envVars = loadEnvFile(path.join(projectRoot, '.env'));
    if (envVars.MALSTADUR_API_KEY) {
      process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
    }
  }

  // Load glossary
  let glossary = null;
  if (!args.noGlossary) {
    const domain = bookToDomain(args.book);
    glossary = loadGlossary(path.join(BOOKS_DIR, 'glossary'), domain);
    if (glossary) {
      console.log(`Glossary: ${glossary.terms.length} approved ${glossary.domain} terms`);
    } else {
      console.log('Glossary: none available (continuing without)');
    }
  }

  // Discover modules to translate
  const chapters = args.chapter ? [formatChapter(args.chapter)] : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${mtInputDir}`);
    process.exit(1);
  }

  // Build work list
  const workList = [];
  for (const chapterDir of chapters) {
    const inputDir = path.join(mtInputDir, chapterDir);
    const outputDir = path.join(mtOutputDir, chapterDir);
    let modules = discoverModules(inputDir);

    // Filter to specific module if requested
    if (args.module) {
      modules = modules.filter((m) => m.moduleId === args.module);
    }

    for (const mod of modules) {
      const outputPath = path.join(outputDir, mod.filename.replace('.en.md', '.is.md'));
      const exists = fs.existsSync(outputPath);

      workList.push({
        ...mod,
        chapterDir,
        outputPath,
        skip: exists && !args.force,
      });
    }
  }

  const toTranslate = workList.filter((m) => !m.skip);
  const toSkip = workList.filter((m) => m.skip);

  if (workList.length === 0) {
    console.error('No modules found for the specified scope.');
    process.exit(1);
  }

  // Dry run
  if (args.dryRun) {
    console.log(`\nDry run — ${workList.length} modules found:`);
    console.log(`  To translate: ${toTranslate.length}`);
    console.log(`  Already done:  ${toSkip.length} (use --force to re-translate)`);

    let totalChars = 0;
    for (const mod of toTranslate) {
      const content = fs.readFileSync(mod.path, 'utf8');
      totalChars += content.length;
      if (args.verbose) {
        console.log(
          `  ${mod.chapterDir}/${mod.moduleId}: ${content.length.toLocaleString()} chars`
        );
      }
    }
    console.log(`\n  Estimated characters: ${totalChars.toLocaleString()}`);
    console.log(`  Estimated cost: ~${((totalChars * 5) / 1000).toFixed(0)} ISK`);
    process.exit(0);
  }

  // Create API client
  let client;
  try {
    client = createClient({ rateDelayMs: args.rateDelay });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log(`\nTranslating ${toTranslate.length} module(s), skipping ${toSkip.length}...`);
  console.log('');

  // Translate
  const results = { translated: 0, skipped: toSkip.length, failed: 0, errors: [] };

  for (const mod of workList) {
    if (mod.skip) {
      if (args.verbose) console.log(`  ⏭  ${mod.chapterDir}/${mod.moduleId} (exists)`);
      continue;
    }

    process.stdout.write(`  ${mod.chapterDir}/${mod.moduleId}... `);

    try {
      const { chars } = await translateModule(client, mod.path, mod.outputPath, glossary);
      console.log(`✅ (${chars.toLocaleString()} chars)`);
      results.translated++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.failed++;
      results.errors.push({ module: mod.moduleId, chapter: mod.chapterDir, error: err.message });
    }
  }

  // Summary
  const usage = client.getUsage();
  console.log('\n' + '═'.repeat(50));
  console.log('Summary:');
  console.log(`  Translated: ${results.translated}`);
  console.log(`  Skipped:    ${results.skipped}`);
  console.log(`  Failed:     ${results.failed}`);
  console.log(`  API usage:  ${usage.totalChars.toLocaleString()} chars`);
  console.log(`  Est. cost:  ~${usage.estimatedISK.toFixed(0)} ISK`);
  console.log(`  Time:       ${(usage.elapsedMs / 1000).toFixed(1)}s`);

  if (results.errors.length > 0) {
    console.log('\nFailed modules:');
    for (const err of results.errors) {
      console.log(`  ${err.chapter}/${err.module}: ${err.error}`);
    }
  }

  // Update pipeline status if requested
  if (args.updateStatus && results.translated > 0) {
    console.log('\nUpdating pipeline status...');
    const translatedChapters = [
      ...new Set(workList.filter((m) => !m.skip).map((m) => m.chapterDir)),
    ];
    await updatePipelineStatus(args.book, translatedChapters);
  }

  if (results.failed > 0) process.exit(1);
}

// Only run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
