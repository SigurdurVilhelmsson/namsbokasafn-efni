#!/usr/bin/env node

/**
 * download-source.js — Download OpenStax CNXML source files from GitHub
 *
 * Downloads a tarball of the repository, extracts module CNXML files organized
 * by chapter, and copies media files. Uses collection.xml to determine the
 * book structure.
 *
 * Usage:
 *   node tools/download-source.js \
 *     --repo openstax/osbooks-chemistry-bundle \
 *     --collection chemistry-2e.collection.xml \
 *     --book efnafraedi \
 *     [--branch main] [--verbose]
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { branch: 'main', verbose: false };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--repo':
        args.repo = argv[++i];
        break;
      case '--collection':
        args.collection = argv[++i];
        break;
      case '--book':
        args.book = argv[++i];
        break;
      case '--branch':
        args.branch = argv[++i];
        break;
      case '--verbose':
        args.verbose = true;
        break;
    }
  }
  if (!args.repo || !args.collection || !args.book) {
    console.error(
      'Usage: node download-source.js --repo OWNER/REPO --collection FILE --book SLUG [--branch main] [--verbose]'
    );
    process.exit(1);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Collection XML parsing (duplicated from openstaxFetcher to avoid CJS bridge)
// ---------------------------------------------------------------------------

/**
 * Parse collection.xml to extract chapter → module mappings.
 *
 * @param {string} xml - Raw XML content of a collection.xml file
 * @returns {{ chapters: Array<{chapter: number, title: string, modules: string[]}>, preface: string|null, appendixModules: string[] }}
 */
export function parseCollectionXml(xml) {
  const chapters = [];

  const subcollectionRegex = /<col:subcollection[^>]*>([\s\S]*?)<\/col:subcollection>/g;
  const titleRegex = /<md:title>([^<]+)<\/md:title>/;

  let match;
  let chapterNum = 0;

  while ((match = subcollectionRegex.exec(xml)) !== null) {
    const subcollectionContent = match[1];
    const titleMatch = subcollectionContent.match(titleRegex);

    if (titleMatch) {
      chapterNum++;
      const chapter = {
        chapter: chapterNum,
        title: titleMatch[1].trim(),
        modules: [],
      };

      const moduleRegexLocal = /<col:module\s+document="([^"]+)"/g;
      let moduleMatch;
      while ((moduleMatch = moduleRegexLocal.exec(subcollectionContent)) !== null) {
        chapter.modules.push(moduleMatch[1]);
      }

      chapters.push(chapter);
    }
  }

  // Preface: first standalone module before any subcollection
  const beforeFirstChapter = xml.split('<col:subcollection')[0];
  const afterLastChapter = xml.split('</col:subcollection>').pop();

  const prefaceMatch = beforeFirstChapter.match(/<col:module\s+document="([^"]+)"/);
  const preface = prefaceMatch ? prefaceMatch[1] : null;

  // Appendix modules: standalone modules after all subcollections
  const appendixModules = [];
  let appendixMatch;
  const appendixRegex = /<col:module\s+document="([^"]+)"/g;
  while ((appendixMatch = appendixRegex.exec(afterLastChapter)) !== null) {
    appendixModules.push(appendixMatch[1]);
  }

  return { chapters, preface, appendixModules };
}

// ---------------------------------------------------------------------------
// File organization
// ---------------------------------------------------------------------------

/**
 * Organize extracted source files into the project's chapter directory structure.
 *
 * @param {object} params
 * @param {string} params.extractedDir - Path to the extracted tarball directory (contains modules/, media/, collections/)
 * @param {string} params.sourceDir - Target 01-source/ directory
 * @param {{ chapters: Array, preface: string|null, appendixModules: string[] }} params.structure - Parsed collection structure
 * @param {boolean} params.verbose - Whether to log progress
 * @returns {{ moduleCount: number, mediaCount: number, warnings: string[] }}
 */
export function organizeSourceFiles({ extractedDir, sourceDir, structure, verbose }) {
  const modulesDir = path.join(extractedDir, 'modules');
  const mediaDir = path.join(extractedDir, 'media');
  const warnings = [];
  let moduleCount = 0;

  const log = verbose ? (msg) => process.stderr.write(msg + '\n') : () => {};

  // Copy preface module → ch00/
  if (structure.preface) {
    const prefaceDir = path.join(sourceDir, 'ch00');
    fs.mkdirSync(prefaceDir, { recursive: true });
    const src = path.join(modulesDir, structure.preface, 'index.cnxml');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(prefaceDir, `${structure.preface}.cnxml`));
      moduleCount++;
    } else {
      warnings.push(`Preface module ${structure.preface} not found in tarball`);
    }
  }

  // Copy chapter modules → ch{NN}/
  for (const ch of structure.chapters) {
    const chDir = path.join(sourceDir, `ch${String(ch.chapter).padStart(2, '0')}`);
    fs.mkdirSync(chDir, { recursive: true });
    log(
      `Copying modules: ch${String(ch.chapter).padStart(2, '0')} (${ch.modules.length} modules)...`
    );

    for (const moduleId of ch.modules) {
      const src = path.join(modulesDir, moduleId, 'index.cnxml');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(chDir, `${moduleId}.cnxml`));
        moduleCount++;
      } else {
        warnings.push(`Module ${moduleId} (ch${ch.chapter}) not found in tarball`);
      }
    }
  }

  // Copy appendix modules → appendices/
  if (structure.appendixModules.length > 0) {
    const appendixDir = path.join(sourceDir, 'appendices');
    fs.mkdirSync(appendixDir, { recursive: true });
    log(`Copying appendix modules (${structure.appendixModules.length})...`);

    for (const moduleId of structure.appendixModules) {
      const src = path.join(modulesDir, moduleId, 'index.cnxml');
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(appendixDir, `${moduleId}.cnxml`));
        moduleCount++;
      } else {
        warnings.push(`Appendix module ${moduleId} not found in tarball`);
      }
    }
  }

  // Copy media files
  let mediaCount = 0;
  if (fs.existsSync(mediaDir)) {
    const targetMediaDir = path.join(sourceDir, 'media');
    fs.mkdirSync(targetMediaDir, { recursive: true });

    const mediaFiles = fs.readdirSync(mediaDir);
    log(`Copying ${mediaFiles.length} media files...`);

    for (const file of mediaFiles) {
      const srcFile = path.join(mediaDir, file);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(targetMediaDir, file));
        mediaCount++;
      }
    }
  }

  return { moduleCount, mediaCount, warnings };
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

/**
 * Get the latest commit SHA for a branch using the GitHub API.
 * Uses GITHUB_BOT_TOKEN env var for authentication if available.
 */
function getCommitSha(repo, branch) {
  const token = process.env.GITHUB_BOT_TOKEN;
  const url = `https://api.github.com/repos/${repo}/git/ref/heads/${branch}`;

  const args = [
    '-sf',
    '-H',
    'Accept: application/vnd.github.v3+json',
    '-H',
    'User-Agent: namsbokasafn-pipeline',
  ];
  if (token) {
    args.push('-H', `Authorization: Bearer ${token}`);
  }
  args.push(url);

  try {
    const result = execFileSync('curl', args, { encoding: 'utf8', timeout: 30000 });
    const data = JSON.parse(result);
    return data.object.sha;
  } catch (err) {
    if (err.status === 22) {
      // curl exit code 22 = HTTP error (with -f flag)
      if (!token) {
        throw new Error(
          `GitHub API request failed for ${repo}. ` +
            'Without GITHUB_BOT_TOKEN, the rate limit is 60 requests/hour. ' +
            'Set GITHUB_BOT_TOKEN in server/.env for 5000 requests/hour.'
        );
      }
      throw new Error(`GitHub API request failed: repository ${repo} not found or access denied`);
    }
    throw err;
  }
}

/**
 * Download and extract the repository tarball.
 * Returns the path to the extracted directory.
 */
function downloadAndExtract(repo, branch, tmpDir) {
  const token = process.env.GITHUB_BOT_TOKEN;
  const url = `https://api.github.com/repos/${repo}/tarball/${branch}`;

  fs.mkdirSync(tmpDir, { recursive: true });

  // Build curl command — streams to tar, handles redirects
  const curlParts = [
    'curl',
    '-sL',
    '-H',
    '"Accept: application/vnd.github.v3+json"',
    '-H',
    '"User-Agent: namsbokasafn-pipeline"',
  ];
  if (token) {
    curlParts.push('-H', `"Authorization: Bearer ${token}"`);
  }
  curlParts.push(`"${url}"`);

  const cmd = `${curlParts.join(' ')} | tar xzf - -C "${tmpDir}"`;

  execSync(cmd, {
    shell: '/bin/bash',
    timeout: 600000, // 10 minutes for large repos
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Find the extracted directory (GitHub names it {owner}-{repo}-{shortsha})
  const entries = fs.readdirSync(tmpDir);
  const extractedDir = entries.find((e) => fs.statSync(path.join(tmpDir, e)).isDirectory());

  if (!extractedDir) {
    throw new Error('Tarball extraction failed: no directory found in temp directory');
  }

  return path.join(tmpDir, extractedDir);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const { repo, collection, book, branch, verbose } = args;

  const log = verbose ? (msg) => process.stderr.write(msg + '\n') : () => {};

  const sourceDir = path.join(BOOKS_DIR, book, '01-source');
  const tmpDir = path.join(PROJECT_ROOT, '.tmp', `download-source-${Date.now()}`);

  try {
    // Step 1: Get commit SHA
    log(`Fetching commit info for ${repo}...`);
    const commitHash = getCommitSha(repo, branch);
    const shortHash = commitHash.substring(0, 7);
    log(`Downloading tarball (branch: ${branch}, commit: ${shortHash})...`);

    // Step 2: Download and extract
    log('Extracting archive...');
    const extractedDir = downloadAndExtract(repo, branch, tmpDir);

    // Step 3: Parse collection.xml
    const collectionPath = path.join(extractedDir, 'collections', collection);
    if (!fs.existsSync(collectionPath)) {
      // List available collections to help the user
      const collectionsDir = path.join(extractedDir, 'collections');
      if (fs.existsSync(collectionsDir)) {
        const available = fs.readdirSync(collectionsDir).filter((f) => f.endsWith('.xml'));
        throw new Error(
          `Collection file '${collection}' not found. Available: ${available.join(', ')}`
        );
      }
      throw new Error(
        `Collection file '${collection}' not found and no collections/ directory exists`
      );
    }

    const collectionXml = fs.readFileSync(collectionPath, 'utf8');
    const structure = parseCollectionXml(collectionXml);

    const totalModules =
      (structure.preface ? 1 : 0) +
      structure.chapters.reduce((sum, ch) => sum + ch.modules.length, 0) +
      structure.appendixModules.length;

    log(
      `Found ${totalModules} modules in ${structure.chapters.length} chapters` +
        (structure.appendixModules.length > 0
          ? ` + ${structure.appendixModules.length} appendices`
          : '') +
        (structure.preface ? ' + preface' : '')
    );

    // Step 4: Organize files into 01-source/
    fs.mkdirSync(sourceDir, { recursive: true });
    const result = organizeSourceFiles({ extractedDir, sourceDir, structure, verbose });

    // Log warnings for missing modules
    for (const warning of result.warnings) {
      log(`WARNING: ${warning}`);
    }

    // Step 5: Write metadata
    const metadata = {
      commitHash,
      repo,
      branch,
      collection,
      fetchedAt: new Date().toISOString(),
      moduleCount: result.moduleCount,
      mediaCount: result.mediaCount,
    };

    fs.writeFileSync(
      path.join(sourceDir, '.source-info.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    log(
      `Done. ${result.moduleCount} modules + ${result.mediaCount} media files → books/${book}/01-source/`
    );

    // Output summary to stdout (captured by job system)
    console.log(
      JSON.stringify({
        success: true,
        ...metadata,
        warnings: result.warnings,
      })
    );
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
