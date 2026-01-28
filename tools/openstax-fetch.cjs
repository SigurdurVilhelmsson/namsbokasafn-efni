#!/usr/bin/env node

/**
 * openstax-fetch.js
 *
 * Fetches OpenStax modules and collections from GitHub.
 * Can fetch individual modules or entire book collections.
 *
 * Usage:
 *   node tools/openstax-fetch.js <module-id> [options]
 *   node tools/openstax-fetch.js --collection <book> [options]
 *   node tools/openstax-fetch.js --list-books
 *
 * Output:
 *   - Individual module: Downloads index.cnxml
 *   - Collection: Downloads collection.xml and lists all modules
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/openstax';
const GITHUB_API_BASE = 'https://api.github.com/repos/openstax';

// Known OpenStax book repositories
const BOOKS = {
  'chemistry-2e': {
    repo: 'osbooks-chemistry-bundle',
    branch: 'main',
    title: 'Chemistry 2e',
    collection: 'chemistry-2e/collection.xml'
  },
  'biology-2e': {
    repo: 'osbooks-biology-bundle',
    branch: 'main',
    title: 'Biology 2e',
    collection: 'biology-2e/collection.xml'
  },
  'physics': {
    repo: 'osbooks-physics',
    branch: 'main',
    title: 'College Physics for AP Courses',
    collection: 'collection.xml'
  },
  'anatomy-physiology': {
    repo: 'osbooks-anatomy-physiology',
    branch: 'main',
    title: 'Anatomy and Physiology',
    collection: 'collection.xml'
  }
};

// Module ID to metadata mapping - loaded dynamically from chemistry-2e.json
// This replaces the old hardcoded (and incomplete/incorrect) mapping
let CHEMISTRY_MODULES = null;

/**
 * Load Chemistry 2e modules from the JSON data file (single source of truth)
 * @returns {object} Module ID to metadata mapping
 */
function loadChemistryModules() {
  if (CHEMISTRY_MODULES) return CHEMISTRY_MODULES;

  try {
    const dataPath = path.join(__dirname, '..', 'server', 'data', 'chemistry-2e.json');
    const bookData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    CHEMISTRY_MODULES = {};
    for (const chapter of bookData.chapters) {
      for (const mod of chapter.modules) {
        CHEMISTRY_MODULES[mod.id] = {
          chapter: chapter.chapter,
          section: mod.section,
          title: mod.title
        };
      }
    }
    return CHEMISTRY_MODULES;
  } catch (err) {
    console.warn('Failed to load chemistry-2e.json, using empty mapping:', err.message);
    CHEMISTRY_MODULES = {};
    return CHEMISTRY_MODULES;
  }
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    input: null,
    collection: null,
    output: null,
    outputDir: null,
    book: 'chemistry-2e',
    listBooks: false,
    listModules: false,
    fetchAll: false,
    chapter: null,
    verbose: false,
    json: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--json') result.json = true;
    else if (arg === '--list-books') result.listBooks = true;
    else if (arg === '--list-modules') result.listModules = true;
    else if (arg === '--fetch-all') result.fetchAll = true;
    else if (arg === '--collection' && args[i + 1]) result.collection = args[++i];
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--output-dir' && args[i + 1]) result.outputDir = args[++i];
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i]);
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
openstax-fetch.js - Fetch OpenStax content from GitHub

Downloads modules and collections from OpenStax GitHub repositories.
Supports fetching individual modules or entire book structures.

Usage:
  node tools/openstax-fetch.js <module-id> [options]
  node tools/openstax-fetch.js --collection <book> [options]
  node tools/openstax-fetch.js --list-books
  node tools/openstax-fetch.js --list-modules [--book <book>]

Commands:
  <module-id>            Fetch a single module (e.g., m68690)
  --collection <book>    Fetch collection.xml and list modules
  --fetch-all            Download all modules in collection
  --list-books           List known book repositories
  --list-modules         List known modules for a book

Options:
  --book <book>          Book identifier (default: chemistry-2e)
  --chapter <n>          Filter modules to specific chapter
  --output <file>        Output file for single module
  --output-dir <dir>     Output directory for multiple files
  --json                 Output module list as JSON
  --verbose              Show detailed progress
  -h, --help             Show this help message

Books Available:
  chemistry-2e           Chemistry 2e (default)
  biology-2e             Biology 2e
  physics                College Physics for AP Courses
  anatomy-physiology     Anatomy and Physiology

Examples:
  # Fetch a single module
  node tools/openstax-fetch.js m68690 --output ./source/1-5.cnxml

  # List all modules in Chemistry 2e
  node tools/openstax-fetch.js --list-modules --book chemistry-2e

  # Fetch collection structure
  node tools/openstax-fetch.js --collection chemistry-2e

  # Fetch all chapter 1 modules
  node tools/openstax-fetch.js --fetch-all --chapter 1 --output-dir ./source/ch01/
`);
}

// ============================================================================
// HTTP Utilities
// ============================================================================

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'namsbokasafn-efni/1.0'
      }
    };

    if (options.verbose) {
      console.error(`Fetching: ${url}`);
    }

    https.get(requestOptions, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchUrl(res.headers.location, options).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode === 404) {
        reject(new Error(`Not found: ${url}`));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: Failed to fetch ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================================================
// Module Operations
// ============================================================================

/**
 * Get module URL for a given book and module ID
 */
function getModuleUrl(book, moduleId) {
  const bookInfo = BOOKS[book];
  if (!bookInfo) {
    throw new Error(`Unknown book: ${book}. Use --list-books to see available books.`);
  }

  return `${GITHUB_RAW_BASE}/${bookInfo.repo}/${bookInfo.branch}/modules/${moduleId}/index.cnxml`;
}

/**
 * Get collection URL for a given book
 */
function getCollectionUrl(book) {
  const bookInfo = BOOKS[book];
  if (!bookInfo) {
    throw new Error(`Unknown book: ${book}. Use --list-books to see available books.`);
  }

  return `${GITHUB_RAW_BASE}/${bookInfo.repo}/${bookInfo.branch}/${bookInfo.collection}`;
}

/**
 * Fetch a single module
 */
async function fetchModule(moduleId, book, options) {
  const url = getModuleUrl(book, moduleId);
  const cnxml = await fetchUrl(url, options);

  if (options.output) {
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(options.output, cnxml);
    console.error(`Written to: ${options.output}`);
  }

  return cnxml;
}

/**
 * Parse collection.xml to extract module list
 */
function parseCollection(collectionXml) {
  const modules = [];
  const chapters = [];

  // Extract title
  const titleMatch = collectionXml.match(/<md:title>([^<]+)<\/md:title>/);
  const title = titleMatch ? titleMatch[1] : 'Unknown';

  // Parse subcollections (chapters) and modules
  // This is a simplified parser - collection.xml structure varies
  const subcollPattern = /<col:subcollection[^>]*>([\s\S]*?)<\/col:subcollection>/g;
  let subcollMatch;
  let chapterNum = 0;

  while ((subcollMatch = subcollPattern.exec(collectionXml)) !== null) {
    const subcollContent = subcollMatch[1];
    const chapterTitleMatch = subcollContent.match(/<md:title>([^<]+)<\/md:title>/);

    if (chapterTitleMatch) {
      chapterNum++;
      const chapterTitle = chapterTitleMatch[1];

      chapters.push({
        number: chapterNum,
        title: chapterTitle,
        modules: []
      });

      // Find modules within this chapter
      const modulePattern = /<col:module[^>]+document="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/col:module>)/g;
      let moduleMatch;

      while ((moduleMatch = modulePattern.exec(subcollContent)) !== null) {
        const moduleId = moduleMatch[1];
        modules.push({
          id: moduleId,
          chapter: chapterNum,
          chapterTitle: chapterTitle
        });
        chapters[chapters.length - 1].modules.push(moduleId);
      }
    }
  }

  // Also look for top-level modules (intro modules)
  const topModulePattern = /<col:module[^>]+document="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/col:module>)/g;
  let topModuleMatch;
  const collectionContent = collectionXml.replace(/<col:subcollection[\s\S]*?<\/col:subcollection>/g, '');

  while ((topModuleMatch = topModulePattern.exec(collectionContent)) !== null) {
    const moduleId = topModuleMatch[1];
    if (!modules.find(m => m.id === moduleId)) {
      modules.unshift({
        id: moduleId,
        chapter: 0,
        chapterTitle: 'Preface/Introduction'
      });
    }
  }

  return { title, chapters, modules };
}

/**
 * Fetch and parse collection
 */
async function fetchCollection(book, options) {
  const url = getCollectionUrl(book);
  const collectionXml = await fetchUrl(url, options);

  if (options.verbose) {
    console.error(`Fetched ${collectionXml.length} bytes of collection XML`);
  }

  return parseCollection(collectionXml);
}

/**
 * Get modules for a specific book (from JSON data or collection)
 */
function getModulesForBook(book, chapter = null) {
  if (book === 'chemistry-2e') {
    const chemModules = loadChemistryModules();
    let modules = Object.entries(chemModules).map(([id, info]) => ({
      id,
      chapter: info.chapter,
      section: info.section,
      title: info.title
    }));

    if (chapter !== null) {
      modules = modules.filter(m => m.chapter === chapter);
    }

    // Sort by chapter, then by section
    modules.sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      if (a.section === 'intro') return -1;
      if (b.section === 'intro') return 1;
      const aNum = parseFloat(a.section.split('.')[1]) || 0;
      const bNum = parseFloat(b.section.split('.')[1]) || 0;
      return aNum - bNum;
    });

    return modules;
  }

  // For other books, we'd need to fetch the collection
  return [];
}

// ============================================================================
// Output Functions
// ============================================================================

function printBookList() {
  console.log('\nKnown OpenStax Book Repositories:\n');
  console.log('| Book ID | Title | Repository |');
  console.log('|---------|-------|------------|');
  for (const [id, info] of Object.entries(BOOKS)) {
    console.log(`| ${id} | ${info.title} | ${info.repo} |`);
  }
  console.log('');
}

function printModuleList(modules, asJson) {
  if (asJson) {
    console.log(JSON.stringify(modules, null, 2));
    return;
  }

  console.log('\n| Module ID | Chapter | Section | Title |');
  console.log('|-----------|---------|---------|-------|');
  for (const m of modules) {
    const section = m.section || '-';
    const title = m.title || m.chapterTitle || '-';
    console.log(`| ${m.id} | ${m.chapter} | ${section} | ${title} |`);
  }
  console.log(`\nTotal modules: ${modules.length}`);
}

function printCollectionInfo(collection, asJson) {
  if (asJson) {
    console.log(JSON.stringify(collection, null, 2));
    return;
  }

  console.log(`\nCollection: ${collection.title}`);
  console.log(`Chapters: ${collection.chapters.length}`);
  console.log(`Total modules: ${collection.modules.length}\n`);

  for (const chapter of collection.chapters) {
    console.log(`Chapter ${chapter.number}: ${chapter.title}`);
    console.log(`  Modules: ${chapter.modules.join(', ')}`);
    console.log('');
  }
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

  if (args.listBooks) {
    printBookList();
    process.exit(0);
  }

  if (args.listModules) {
    const modules = getModulesForBook(args.book, args.chapter);
    if (modules.length === 0) {
      console.error(`No hardcoded modules for book: ${args.book}`);
      console.error('Try fetching the collection: --collection ' + args.book);
      process.exit(1);
    }
    printModuleList(modules, args.json);
    process.exit(0);
  }

  if (args.collection) {
    try {
      const collection = await fetchCollection(args.collection, args);
      printCollectionInfo(collection, args.json);

      if (args.fetchAll && args.outputDir) {
        console.log(`\nFetching ${collection.modules.length} modules to ${args.outputDir}...\n`);

        let fetched = 0;
        let failed = 0;

        for (const module of collection.modules) {
          if (args.chapter !== null && module.chapter !== args.chapter) {
            continue;
          }

          try {
            const chapterDir = path.join(args.outputDir, `ch${String(module.chapter).padStart(2, '0')}`);
            const outputPath = path.join(chapterDir, `${module.id}.cnxml`);

            if (!fs.existsSync(chapterDir)) {
              fs.mkdirSync(chapterDir, { recursive: true });
            }

            await fetchModule(module.id, args.collection, {
              ...args,
              output: outputPath
            });

            fetched++;
            console.log(`  ✓ ${module.id}`);
          } catch (err) {
            failed++;
            console.error(`  ✗ ${module.id}: ${err.message}`);
          }
        }

        console.log(`\nFetched: ${fetched}, Failed: ${failed}`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (args.input) {
    // Fetch single module
    if (!/^m\d+$/.test(args.input)) {
      console.error('Error: Module ID should be in format mXXXXX (e.g., m68690)');
      process.exit(1);
    }

    try {
      const cnxml = await fetchModule(args.input, args.book, args);

      if (!args.output) {
        console.log(cnxml);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  // No command given
  console.error('Error: Please provide a module ID or use --collection, --list-books, or --list-modules');
  console.error('Use --help for usage information');
  process.exit(1);
}

// Export for programmatic use
module.exports = {
  fetchModule,
  fetchCollection,
  getModulesForBook,
  getModuleUrl,
  getCollectionUrl,
  BOOKS,
  loadChemistryModules,
  // Getter for backward compatibility (returns loaded modules)
  get CHEMISTRY_MODULES() { return loadChemistryModules(); }
};

// CLI execution
if (require.main === module) {
  main();
}
