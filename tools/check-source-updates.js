#!/usr/bin/env node

/**
 * check-source-updates.js
 *
 * Compare local 01-source/ CNXML files against upstream OpenStax GitHub
 * repository to detect content changes that may need to be propagated
 * through the translation pipeline.
 *
 * Commands:
 *   check [--chapter <N>]        Compare local source against upstream
 *   status                       Show last comparison results
 *   diff <moduleId>              Show diff for a changed module
 *   update <moduleId>            Download upstream version to 01-source/
 *
 * Options:
 *   --chapter <num>              Filter to specific chapter
 *   --book <book>                Book identifier (default: chemistry-2e)
 *   --verbose                    Show detailed output
 *   --json                       Output as JSON
 *   -h, --help                   Show this help
 *
 * The tool fetches CNXML from GitHub raw content URLs and compares SHA-256
 * hashes against local files. Rate-limited to respect GitHub's 60 req/hour
 * limit for unauthenticated requests.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books', 'efnafraedi');
const SOURCE_DIR = path.join(BOOKS_DIR, '01-source');
const STRUCTURE_DIR = path.join(BOOKS_DIR, '02-structure');
const LOG_DIR = path.join(BOOKS_DIR, 'source-updates');
const LOG_PATH = path.join(LOG_DIR, 'update-log.json');

// GitHub configuration
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax';

// Known book repositories (mirrored from openstax-fetch.cjs)
const BOOKS = {
  'chemistry-2e': {
    repo: 'osbooks-chemistry-bundle',
    branch: 'main',
    title: 'Chemistry 2e',
  },
};

// ============================================================================
// HTTP Utilities
// ============================================================================

function fetchUrl(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'namsbokasafn-efni/1.0',
      },
    };

    https
      .get(requestOptions, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetchUrl(res.headers.location, retries).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode === 404) {
          resolve({ status: 404, data: null });
          return;
        }

        if (res.statusCode === 403) {
          if (retries > 0) {
            const retryAfter = res.headers['retry-after'];
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
            console.error(`  Rate limited. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
            setTimeout(() => {
              fetchUrl(url, retries - 1)
                .then(resolve)
                .catch(reject);
            }, waitMs);
            return;
          }
          reject(new Error(`Rate limited (403) after all retries: ${url}`));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: 200, data }));
        res.on('error', reject);
      })
      .on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => {
            fetchUrl(url, retries - 1)
              .then(resolve)
              .catch(reject);
          }, 2000);
          return;
        }
        reject(err);
      });
  });
}

/**
 * Rate-limited sequential fetch with delay between requests
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Book Data
// ============================================================================

function loadBookData(book) {
  const dataPath = path.join(PROJECT_ROOT, 'server', 'data', `${book}.json`);
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Book data not found: ${dataPath}`);
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function getModuleList(bookData, chapterFilter = null) {
  const modules = [];

  for (const chapter of bookData.chapters) {
    if (chapterFilter !== null && chapter.chapter !== chapterFilter) continue;

    for (const mod of chapter.modules) {
      modules.push({
        id: mod.id,
        chapter: chapter.chapter,
        section: mod.section,
        title: mod.title,
      });
    }
  }

  // Include appendices if no chapter filter
  if (chapterFilter === null && bookData.appendices) {
    for (const app of bookData.appendices) {
      modules.push({
        id: app.id,
        chapter: 'appendix',
        section: null,
        title: app.title,
      });
    }
  }

  return modules;
}

// ============================================================================
// Hash Utilities
// ============================================================================

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

function getLocalSourcePath(moduleId, bookData) {
  // Find chapter for this module
  for (const chapter of bookData.chapters) {
    for (const mod of chapter.modules) {
      if (mod.id === moduleId) {
        const chDir = `ch${String(chapter.chapter).padStart(2, '0')}`;
        return path.join(SOURCE_DIR, chDir, `${moduleId}.cnxml`);
      }
    }
  }

  // Check appendices
  if (bookData.appendices) {
    for (const app of bookData.appendices) {
      if (app.id === moduleId) {
        return path.join(SOURCE_DIR, 'appendices', `${moduleId}.cnxml`);
      }
    }
  }

  return null;
}

function getUpstreamUrl(moduleId, book) {
  const bookInfo = BOOKS[book];
  if (!bookInfo) throw new Error(`Unknown book: ${book}`);
  return `${GITHUB_RAW_BASE}/${bookInfo.repo}/${bookInfo.branch}/modules/${moduleId}/index.cnxml`;
}

// ============================================================================
// Update Log Management
// ============================================================================

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return {
      bookTitle: null,
      bookSlug: null,
      lastChecked: null,
      modules: {},
    };
  }
  return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
}

function saveLog(log) {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2) + '\n');
}

// ============================================================================
// Manifest Integration
// ============================================================================

function loadManifest(moduleId, chapter) {
  const chDir = typeof chapter === 'number' ? `ch${String(chapter).padStart(2, '0')}` : chapter;
  const manifestPath = path.join(STRUCTURE_DIR, chDir, `${moduleId}-manifest.json`);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

// ============================================================================
// Comparison Logic
// ============================================================================

async function compareModule(moduleId, book, bookData, verbose) {
  const localPath = getLocalSourcePath(moduleId, bookData);
  const result = {
    moduleId,
    localExists: false,
    upstreamExists: false,
    localHash: null,
    upstreamHash: null,
    status: 'unknown', // unchanged, modified, missing-local, missing-upstream, error
    localSize: null,
    upstreamSize: null,
    manifestHash: null,
    manifestStale: false,
    error: null,
  };

  // Check local file
  if (localPath && fs.existsSync(localPath)) {
    const localContent = fs.readFileSync(localPath, 'utf8');
    result.localExists = true;
    result.localHash = hashContent(localContent);
    result.localSize = localContent.length;
  }

  // Check manifest (if exists)
  const moduleInfo = getModuleList(bookData).find((m) => m.id === moduleId);
  if (moduleInfo && typeof moduleInfo.chapter === 'number') {
    const manifest = loadManifest(moduleId, moduleInfo.chapter);
    if (manifest) {
      result.manifestHash = manifest.sourceHash;
      if (result.localHash && result.manifestHash !== result.localHash) {
        result.manifestStale = true;
      }
    }
  }

  // Fetch upstream
  const url = getUpstreamUrl(moduleId, book);
  try {
    if (verbose) console.error(`  Fetching ${moduleId}...`);
    const response = await fetchUrl(url);

    if (response.status === 404) {
      result.upstreamExists = false;
      result.status = result.localExists ? 'missing-upstream' : 'missing-both';
    } else if (response.data) {
      result.upstreamExists = true;
      result.upstreamHash = hashContent(response.data);
      result.upstreamSize = response.data.length;

      if (!result.localExists) {
        result.status = 'missing-local';
      } else if (result.localHash === result.upstreamHash) {
        result.status = 'unchanged';
      } else {
        result.status = 'modified';
      }
    }
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
  }

  return result;
}

// ============================================================================
// Simple unified diff
// ============================================================================

function simpleDiff(localLines, upstreamLines) {
  const output = [];

  // Simple line-by-line comparison (not a proper LCS diff, but useful for
  // spotting changes in CNXML which tends to be structurally aligned)
  let localIdx = 0;
  let upstreamIdx = 0;
  let contextBefore = [];
  let pendingChunk = [];
  let hasChanges = false;

  while (localIdx < localLines.length || upstreamIdx < upstreamLines.length) {
    const localLine = localIdx < localLines.length ? localLines[localIdx] : undefined;
    const upstreamLine =
      upstreamIdx < upstreamLines.length ? upstreamLines[upstreamIdx] : undefined;

    if (localLine === upstreamLine) {
      // Same line
      if (pendingChunk.length > 0) {
        output.push(...pendingChunk);
        pendingChunk = [];
        // Add context after
        output.push(` ${localLine}`);
      } else {
        contextBefore.push(` ${localLine}`);
        if (contextBefore.length > 3) contextBefore.shift();
      }
      localIdx++;
      upstreamIdx++;
    } else {
      hasChanges = true;
      if (pendingChunk.length === 0 && contextBefore.length > 0) {
        output.push('---');
        output.push(...contextBefore);
        contextBefore = [];
      }

      // Try to find the local line in upcoming upstream lines (added upstream)
      // or the upstream line in upcoming local lines (removed upstream)
      // Simple heuristic: show both as changed
      if (localLine !== undefined) {
        pendingChunk.push(`-${localLine}`);
        localIdx++;
      }
      if (upstreamLine !== undefined) {
        pendingChunk.push(`+${upstreamLine}`);
        upstreamIdx++;
      }
    }
  }

  if (pendingChunk.length > 0) {
    if (output.length === 0 && contextBefore.length > 0) {
      output.push('---');
      output.push(...contextBefore);
    }
    output.push(...pendingChunk);
  }

  return { hasChanges, lines: output };
}

// ============================================================================
// Commands
// ============================================================================

async function cmdCheck(args) {
  const bookData = loadBookData(args.book);
  const modules = getModuleList(bookData, args.chapter);
  const log = loadLog();

  console.log(
    `\nChecking ${modules.length} modules against upstream (${BOOKS[args.book].repo})...\n`
  );

  const results = [];
  const DELAY_MS = 1200; // ~50 requests/minute to stay under GitHub's 60/hour limit

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const progress = `[${i + 1}/${modules.length}]`;

    const result = await compareModule(mod.id, args.book, bookData, args.verbose);
    result.chapter = mod.chapter;
    result.section = mod.section;
    result.title = mod.title;
    results.push(result);

    // Update log
    log.modules[mod.id] = {
      ...result,
      checkedAt: new Date().toISOString(),
    };

    // Display progress
    const icon =
      {
        unchanged: '  ',
        modified: '!!',
        'missing-local': '??',
        'missing-upstream': '--',
        error: 'XX',
      }[result.status] || '??';

    if (result.status !== 'unchanged' || args.verbose) {
      const label = mod.section || mod.id;
      console.log(`${progress} ${icon} ${label} - ${mod.title} [${result.status}]`);
    } else {
      process.stderr.write(`\r${progress} ${mod.id}...`);
    }

    // Rate limiting
    if (i < modules.length - 1) {
      await delay(DELAY_MS);
    }
  }

  // Clear progress line
  process.stderr.write('\r' + ' '.repeat(40) + '\r');

  // Save log
  log.bookTitle = bookData.title;
  log.bookSlug = bookData.slug;
  log.lastChecked = new Date().toISOString();
  saveLog(log);

  // Summary
  const unchanged = results.filter((r) => r.status === 'unchanged').length;
  const modified = results.filter((r) => r.status === 'modified').length;
  const missingLocal = results.filter((r) => r.status === 'missing-local').length;
  const missingUpstream = results.filter((r) => r.status === 'missing-upstream').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n--- Summary ---');
  console.log(`  Checked:           ${results.length} modules`);
  console.log(`  Unchanged:         ${unchanged}`);
  if (modified > 0) console.log(`  MODIFIED:          ${modified}`);
  if (missingLocal > 0) console.log(`  Missing locally:   ${missingLocal}`);
  if (missingUpstream > 0) console.log(`  Missing upstream:  ${missingUpstream}`);
  if (errors > 0) console.log(`  Errors:            ${errors}`);

  if (modified > 0) {
    console.log('\nModified modules:');
    for (const r of results.filter((r) => r.status === 'modified')) {
      const label = r.section ? `${r.section} (${r.moduleId})` : r.moduleId;
      const sizeDiff = r.upstreamSize - r.localSize;
      const sizeStr = sizeDiff > 0 ? `+${sizeDiff}` : `${sizeDiff}`;
      console.log(`  ${label}: ${r.title}  [${sizeStr} bytes]`);
    }
    console.log(`\nUse 'node tools/check-source-updates.js diff <moduleId>' to see changes.`);
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  }

  return results;
}

async function cmdStatus(args) {
  const log = loadLog();

  if (!log.lastChecked) {
    console.log('\nNo source comparison has been run yet.');
    console.log("Run 'node tools/check-source-updates.js check' to compare against upstream.");
    return;
  }

  console.log(`\nSource Update Status for ${log.bookTitle || 'unknown book'}`);
  console.log(`Last checked: ${log.lastChecked}\n`);

  const entries = Object.values(log.modules);
  const unchanged = entries.filter((e) => e.status === 'unchanged').length;
  const modified = entries.filter((e) => e.status === 'modified').length;
  const missingLocal = entries.filter((e) => e.status === 'missing-local').length;
  const missingUpstream = entries.filter((e) => e.status === 'missing-upstream').length;
  const errors = entries.filter((e) => e.status === 'error').length;

  console.log(`  Total modules:     ${entries.length}`);
  console.log(`  Unchanged:         ${unchanged}`);
  if (modified > 0) console.log(`  MODIFIED:          ${modified}`);
  if (missingLocal > 0) console.log(`  Missing locally:   ${missingLocal}`);
  if (missingUpstream > 0) console.log(`  Missing upstream:  ${missingUpstream}`);
  if (errors > 0) console.log(`  Errors:            ${errors}`);

  if (modified > 0) {
    console.log('\nModified modules:');
    for (const entry of entries.filter((e) => e.status === 'modified')) {
      const label = entry.section ? `${entry.section} (${entry.moduleId})` : entry.moduleId;
      console.log(`  ${label}: ${entry.title || ''}`);
      console.log(`    Local hash:    ${entry.localHash}`);
      console.log(`    Upstream hash: ${entry.upstreamHash}`);
      if (entry.checkedAt) console.log(`    Checked:       ${entry.checkedAt}`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify(log, null, 2));
  }
}

async function cmdDiff(args) {
  if (!args.input) {
    console.error('Error: Please provide a module ID.');
    console.error('Usage: node tools/check-source-updates.js diff <moduleId>');
    process.exit(1);
  }

  const moduleId = args.input;
  const bookData = loadBookData(args.book);
  const localPath = getLocalSourcePath(moduleId, bookData);

  if (!localPath || !fs.existsSync(localPath)) {
    console.error(`Error: Local source file not found for ${moduleId}`);
    process.exit(1);
  }

  const localContent = fs.readFileSync(localPath, 'utf8');

  console.log(`Fetching upstream ${moduleId}...`);
  const url = getUpstreamUrl(moduleId, args.book);
  const response = await fetchUrl(url);

  if (response.status === 404) {
    console.error(`Error: Module ${moduleId} not found upstream`);
    process.exit(1);
  }

  const upstreamContent = response.data;
  const localHash = hashContent(localContent);
  const upstreamHash = hashContent(upstreamContent);

  console.log(`\nModule: ${moduleId}`);
  console.log(`Local hash:    ${localHash} (${localContent.length} bytes)`);
  console.log(`Upstream hash: ${upstreamHash} (${upstreamContent.length} bytes)`);

  if (localHash === upstreamHash) {
    console.log('\nNo differences found. Files are identical.');
    return;
  }

  console.log('\n--- Differences ---\n');

  const localLines = localContent.split('\n');
  const upstreamLines = upstreamContent.split('\n');

  const diff = simpleDiff(localLines, upstreamLines);

  if (!diff.hasChanges) {
    console.log('Hashes differ but line-by-line comparison shows no changes.');
    console.log('This may be due to trailing whitespace or line ending differences.');
  } else {
    for (const line of diff.lines) {
      if (line.startsWith('+')) {
        console.log(`\x1b[32m${line}\x1b[0m`); // green
      } else if (line.startsWith('-')) {
        console.log(`\x1b[31m${line}\x1b[0m`); // red
      } else {
        console.log(line);
      }
    }
  }

  // Save upstream content for potential external diff tools
  const tmpPath = path.join(LOG_DIR, `${moduleId}-upstream.cnxml`);
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fs.writeFileSync(tmpPath, upstreamContent);
  console.log(`\nUpstream version saved to: ${tmpPath}`);
  console.log(`For a full diff, run:`);
  console.log(`  diff ${localPath} ${tmpPath}`);
}

async function cmdUpdate(args) {
  if (!args.input) {
    console.error('Error: Please provide a module ID.');
    console.error('Usage: node tools/check-source-updates.js update <moduleId>');
    process.exit(1);
  }

  const moduleId = args.input;
  const bookData = loadBookData(args.book);
  const localPath = getLocalSourcePath(moduleId, bookData);

  if (!localPath) {
    console.error(`Error: Cannot determine local path for ${moduleId}`);
    process.exit(1);
  }

  // Fetch upstream
  console.log(`Fetching upstream ${moduleId}...`);
  const url = getUpstreamUrl(moduleId, args.book);
  const response = await fetchUrl(url);

  if (response.status === 404) {
    console.error(`Error: Module ${moduleId} not found upstream`);
    process.exit(1);
  }

  const upstreamContent = response.data;
  const upstreamHash = hashContent(upstreamContent);

  // Backup existing file if it exists
  if (fs.existsSync(localPath)) {
    const localContent = fs.readFileSync(localPath, 'utf8');
    const localHash = hashContent(localContent);

    if (localHash === upstreamHash) {
      console.log(`Module ${moduleId} is already up to date.`);
      return;
    }

    // Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16);
    const backupPath = `${localPath}.${timestamp}.bak`;
    fs.copyFileSync(localPath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  // Write upstream content
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localPath, upstreamContent);
  console.log(`Updated: ${localPath}`);
  console.log(`New hash: ${upstreamHash} (${upstreamContent.length} bytes)`);

  // Update log
  const log = loadLog();
  if (log.modules[moduleId]) {
    log.modules[moduleId].localHash = upstreamHash;
    log.modules[moduleId].localSize = upstreamContent.length;
    log.modules[moduleId].status = 'unchanged';
    log.modules[moduleId].updatedAt = new Date().toISOString();
    saveLog(log);
  }

  console.log(`\nIMPORTANT: Re-run extraction to update segments and manifests:`);
  console.log(`  node tools/cnxml-extract.js ${localPath}`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    command: null,
    input: null,
    book: 'chemistry-2e',
    chapter: null,
    verbose: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i]);
    else if (!arg.startsWith('-') && !result.command) result.command = arg;
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }

  return result;
}

function printHelp() {
  console.log(`
check-source-updates.js - Compare local source against upstream OpenStax

Compares CNXML files in 01-source/ against the upstream OpenStax GitHub
repository to detect content changes that may need to be propagated
through the translation pipeline.

Usage:
  node tools/check-source-updates.js check [--chapter <N>]
  node tools/check-source-updates.js status
  node tools/check-source-updates.js diff <moduleId>
  node tools/check-source-updates.js update <moduleId>

Commands:
  check                Compare local source against upstream GitHub
  status               Show results from last comparison
  diff <moduleId>      Show differences for a specific module
  update <moduleId>    Download upstream version (creates backup first)

Options:
  --book <book>        Book identifier (default: chemistry-2e)
  --chapter <num>      Filter to specific chapter (for check command)
  --verbose            Show detailed progress
  --json               Output as JSON
  -h, --help           Show this help message

Examples:
  # Check all modules against upstream
  node tools/check-source-updates.js check

  # Check only chapter 5
  node tools/check-source-updates.js check --chapter 5

  # See what changed in a specific module
  node tools/check-source-updates.js diff m68724

  # Update a module from upstream
  node tools/check-source-updates.js update m68724

Rate Limiting:
  GitHub allows 60 unauthenticated requests per hour. The check command
  adds a 1.2s delay between requests (~50/minute). A full book check
  (~120 modules) takes about 2.5 minutes.
`);
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

  if (!args.command) {
    console.error('Error: Please provide a command (check, status, diff, update)');
    console.error('Use --help for usage information.');
    process.exit(1);
  }

  if (!BOOKS[args.book]) {
    console.error(
      `Error: Unknown book '${args.book}'. Known books: ${Object.keys(BOOKS).join(', ')}`
    );
    process.exit(1);
  }

  switch (args.command) {
    case 'check':
      await cmdCheck(args);
      break;
    case 'status':
      await cmdStatus(args);
      break;
    case 'diff':
      await cmdDiff(args);
      break;
    case 'update':
      await cmdUpdate(args);
      break;
    default:
      console.error(`Error: Unknown command '${args.command}'`);
      console.error('Valid commands: check, status, diff, update');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
