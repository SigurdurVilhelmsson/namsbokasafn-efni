#!/usr/bin/env node

/**
 * generate-index.js
 *
 * Generates index.json for a book by extracting glossary terms from
 * translated CNXML files and organizing them alphabetically with
 * chapter/section references.
 *
 * Output format:
 * {
 *   "generated": "2026-02-22T14:30:00Z",
 *   "termCount": 250,
 *   "entries": [
 *     {
 *       "termIs": "atóm",
 *       "termEn": "atom",
 *       "termFull": "atóm (e. atom)",
 *       "definition": "minnsta eind frumefnis sem getur tekið þátt í efnahvarfi",
 *       "chapter": 1,
 *       "section": "1.2",
 *       "sectionTitle": "Efnishamur og flokkun efnis",
 *       "sectionSlug": "1-2-efnishamur-og-flokkun-efnis",
 *       "termId": "fs-idm8143856"
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node tools/generate-index.js --book efnafraedi-2e
 *   node tools/generate-index.js --book efnafraedi-2e --chapters 9,12,13
 *   node tools/generate-index.js --book efnafraedi-2e --track mt-preview
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTermText } from './lib/glossary-term.js';

// ============================================================================
// Configuration
// ============================================================================

const BOOKS_DIR = 'books';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    track: 'faithful',
    chapters: null,
    output: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--book' && args[i + 1]) {
      result.book = args[++i];
    } else if (arg === '--track' && args[i + 1]) {
      result.track = args[++i];
    } else if (arg === '--chapters' && args[i + 1]) {
      result.chapters = args[++i].split(',').map((n) => parseInt(n.trim(), 10));
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[++i];
    } else if (arg === '--toc') {
      // §C104: --toc pointed at the sister repo's build output, which is what
      // made the index one sync stale. Fail loud — silently ignoring it would
      // leave a documented flag that does nothing (the §C83 hazard).
      throw new Error(
        '--toc was removed (§C104): section slugs and titles now come from this ' +
          "book's own 05-publication/<track>/ pages, keyed on data-module-id."
      );
    }
  }

  return result;
}

function printHelp() {
  console.log(`
generate-index.js - Generate alphabetical index from glossary terms

Extracts glossary terms from all chapters and creates an alphabetical
index with chapter/section references and IS/EN term splitting.

Usage:
  node tools/generate-index.js --book <id> [options]

Required:
  --book ID         Book identifier (e.g., efnafraedi)

Options:
  --track TRACK     Publication track: faithful, mt-preview (default: faithful)
  --chapters N,N    Comma-separated chapters to process (default: all)
  --output PATH     Output file path (default: auto-detected)
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  # Generate index for all chapters
  node tools/generate-index.js --book efnafraedi-2e --track mt-preview

  # Generate for specific chapters
  node tools/generate-index.js --book efnafraedi-2e --chapters 1,2,3
`);
}

// ============================================================================
// Term Splitting
// ============================================================================

/**
 * Split a term like "atóm (e. atom)" into IS and EN parts.
 * Uses lastIndexOf to handle nested parentheses like "vermi (H) (e. enthalpy (h))".
 */
function splitTerm(fullTerm) {
  const marker = ' (e. ';
  const idx = fullTerm.lastIndexOf(marker);
  if (idx === -1) return { termIs: fullTerm.trim(), termEn: null };
  const termIs = fullTerm.substring(0, idx).trim();
  let termEn = fullTerm.substring(idx + marker.length);
  if (termEn.endsWith(')')) termEn = termEn.slice(0, -1);
  return { termIs, termEn: termEn.trim() || null };
}

// ============================================================================
// Section Mapping
// ============================================================================

/**
 * Resolve the server/data/*.json catalogue file whose top-level `slug`
 * matches the given book. Fails loud (throws) if none matches — never
 * silently falls back to chemistry. Resolved against import.meta.url,
 * not process.cwd(), since callers (e.g. the server) may run with a
 * different working directory.
 */
function resolveBookDataFile(book) {
  const dir = path.join(REPO_ROOT, 'server', 'data');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j && j.slug === book) return path.join(dir, f);
    } catch {
      /* skip malformed catalogue file */
    }
  }
  throw new Error(`generate-index: no server/data/*.json has slug === "${book}"`);
}

/**
 * Build moduleId → { chapter, section } mapping from the book's
 * server/data/*.json catalogue file (resolved by slug).
 */
export function loadModuleMap(book) {
  const dataPath = resolveBookDataFile(book); // throws (fail loud) if none
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const map = new Map();
  for (const ch of data.chapters) {
    for (const mod of ch.modules) {
      map.set(mod.id, {
        chapter: ch.chapter,
        section: mod.section,
      });
    }
  }
  return map;
}

/**
 * Build a moduleId → { title, slug, chapter } map from this book's own rendered
 * publication pages.
 *
 * §C104 — this REPLACES a lookup that keyed on section number ("20.3") against
 * `../namsbokasafn-vefur/static/content/<book>/toc.json`. That file is the
 * SISTER REPO'S GITIGNORED BUILD OUTPUT, regenerated by vefur's `generate-toc`
 * from content vefur received in the *previous* sync — while `index.json` is
 * written into `05-publication/` and ships in the *next* one. The subject index
 * was therefore derived from a vintage one sync older than the pages it shipped
 * beside, so every corrected section title left the index citing a slug that no
 * longer existed. (That is why §C9's regeneration did not clear ch20's five
 * danglers: it read a toc describing the pre-§C56 world.)
 *
 * Keying on `data-module-id` rather than on the rendered filename is deliberate:
 * `generateIndex` already iterates modules by id, and every section/intro page
 * carries exactly one such attribute, so the mapping is 1:1 with no
 * section-number indirection and no filename parsing. It also subsumes GI-1 —
 * a chapter intro page carries its own intro module's id, so intro terms
 * resolve directly with no `${chapter}.0` special case.
 *
 * Pages carrying no `data-module-id` (answer-key, exercises, summary) are
 * skipped, matching the old map's deliberate exclusion of those rollups.
 *
 * @param {{slug: string, chapter: number|null, html: string}[]} pages
 * @returns {Map<string, {title: string|null, slug: string, chapter: number|null}>}
 */
export function buildPublicationMap(pages) {
  const map = new Map();
  for (const { slug, chapter, html } of pages) {
    const idMatch = html.match(/data-module-id="([^"]+)"/);
    if (!idMatch) continue; // rollup page — no single owning module
    const moduleId = idMatch[1];

    if (map.has(moduleId)) {
      // The §C9 duplicate-page condition. Picking a winner silently is exactly
      // how a superseded page kept being served; refuse instead.
      throw new Error(
        `generate-index: two publication pages claim module "${moduleId}" ` +
          `("${map.get(moduleId).slug}" and "${slug}"). Resolve the duplicate before indexing.`
      );
    }

    const h1 = html.match(/<h1 id="title">([\s\S]*?)<\/h1>/);
    // <h1 id="title"> carries the bare title; the <title> tag prefixes a section
    // number ("20.3 …"). The bare form is what the replaced toc map supplied.
    const title = h1
      ? h1[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim() || null
      : null;

    map.set(moduleId, { title, slug, chapter });
  }
  return map;
}

/**
 * Read this book's rendered publication pages off disk for buildPublicationMap.
 * Fails loud if the track has not been rendered — a silently empty map would
 * null every slug in the index and read as "no terms have sections".
 */
export function loadPublicationPages(book, track) {
  const pubDir = path.join(BOOKS_DIR, book, '05-publication', track, 'chapters');
  if (!fs.existsSync(pubDir)) {
    throw new Error(
      `generate-index: no rendered pages at ${pubDir} — render the ${track} track before indexing`
    );
  }
  const pages = [];
  for (const dir of fs.readdirSync(pubDir).sort()) {
    const chDir = path.join(pubDir, dir);
    if (!fs.statSync(chDir).isDirectory()) continue;
    const chapter = /^\d+$/.test(dir) ? parseInt(dir, 10) : null; // "appendices" → null
    for (const name of fs.readdirSync(chDir).sort()) {
      if (!name.endsWith('.html')) continue;
      pages.push({
        slug: name.slice(0, -'.html'.length),
        chapter,
        html: fs.readFileSync(path.join(chDir, name), 'utf8'),
      });
    }
  }
  return pages;
}

// ============================================================================
// Module Discovery
// ============================================================================

/**
 * Find all modules for specified chapters
 */
function findChapterModules(book, chapters, track) {
  const translatedDir = path.join(BOOKS_DIR, book, '03-translated', track);

  if (!fs.existsSync(translatedDir)) {
    throw new Error(`Translated directory not found: ${translatedDir}`);
  }

  const modulesByChapter = new Map();

  // Find all chapter directories
  const chapterDirs = fs
    .readdirSync(translatedDir)
    .filter((name) => name.startsWith('ch'))
    .map((name) => parseInt(name.replace('ch', ''), 10))
    .filter((num) => !isNaN(num) && (!chapters || chapters.includes(num)))
    .sort((a, b) => a - b);

  for (const chapterNum of chapterDirs) {
    const chapterStr = String(chapterNum).padStart(2, '0');
    const chapterDir = path.join(translatedDir, `ch${chapterStr}`);

    if (!fs.existsSync(chapterDir)) {
      continue;
    }

    // Find all CNXML files
    const modules = fs
      .readdirSync(chapterDir)
      .filter((name) => name.endsWith('.cnxml'))
      .map((name) => name.replace('.cnxml', ''))
      .sort();

    if (modules.length > 0) {
      modulesByChapter.set(chapterNum, modules);
    }
  }

  return modulesByChapter;
}

// ============================================================================
// Glossary Extraction
// ============================================================================

/**
 * Extract glossary terms from a CNXML file
 * Returns array of { term, definition, termId }
 */
function extractGlossaryFromCnxml(cnxmlPath, verbose) {
  const terms = [];

  if (!fs.existsSync(cnxmlPath)) {
    if (verbose) console.log(`  Skipping (not found): ${cnxmlPath}`);
    return terms;
  }

  const content = fs.readFileSync(cnxmlPath, 'utf8');

  // Find glossary element
  const glossaryMatch = content.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) {
    return terms;
  }

  const glossaryContent = glossaryMatch[1];

  // Extract each definition
  const definitionPattern = /<definition\s+id="([^"]+)">([\s\S]*?)<\/definition>/g;
  let defMatch;

  while ((defMatch = definitionPattern.exec(glossaryContent)) !== null) {
    const termId = defMatch[1];
    const defContent = defMatch[2];

    // Extract term — markup-tolerant (symbols wrapped in <emphasis>/<m:math>);
    // a naive `<term>([^<]+)</term>` silently drops symbol-annotated terms.
    const term = extractTermText(defContent);

    // Extract meaning (handle nested elements)
    const meaningMatch = defContent.match(/<meaning[^>]*>([\s\S]*?)<\/meaning>/);
    let definition = null;

    if (meaningMatch) {
      // Strip XML tags but keep text content
      definition = meaningMatch[1]
        .replace(/<[^>]+>/g, '') // Remove tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }

    if (term && definition) {
      terms.push({
        term,
        definition,
        termId,
      });
    }
  }

  return terms;
}

// ============================================================================
// Index Generation
// ============================================================================

/**
 * Build index from all glossary terms
 */
function generateIndex(options) {
  const { book, chapters, track, verbose } = options;

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Generating Index for ${book}`);
  console.log('═'.repeat(60));
  console.log('');

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Book: ${book}`);
    console.log(`  Track: ${track}`);
    console.log(`  Chapters: ${chapters ? chapters.join(', ') : 'all'}`);
    console.log('');
  }

  // Load module → section mapping
  const moduleMap = loadModuleMap(book);
  if (verbose) {
    console.log(`Module map: ${moduleMap ? moduleMap.size + ' modules' : 'not loaded'}`);
  }

  // Load section titles and slugs from THIS repo's rendered pages (§C104).
  const publicationMap = buildPublicationMap(loadPublicationPages(book, track));
  if (verbose) {
    console.log(`Publication map: ${publicationMap.size} pages with a module id`);
    console.log('');
  }

  // Find all modules
  const modulesByChapter = findChapterModules(book, chapters, track);

  if (verbose) {
    console.log('Found chapters:');
    for (const [chapterNum, modules] of modulesByChapter.entries()) {
      console.log(`  Chapter ${chapterNum}: ${modules.length} modules`);
    }
    console.log('');
  }

  // Collect all terms — one entry per term occurrence
  console.log('Extracting glossary terms...');
  const entries = [];
  // Modules that carry glossary terms but have no rendered page. Their entries
  // get a null slug (the "dangle" §C9 counts); say so rather than pass silently.
  const unresolved = new Set();
  // §C104 left this tool with TWO sources: `section` comes from the
  // server/data catalogue, `sectionSlug`/`sectionTitle` from the rendered page.
  // They can silently disagree — measured 2026-08-19: chemistry 0/763,
  // edlisfraedi-2e 20/22, because that book's catalogue disagrees with both
  // its OpenStax collection-order manifest and its own rendered pages (§C108).
  // (Naming that manifest by its full path here would trip the PROV-1 guard in
  // source-write-guard.test.js, which matches file CONTENT and cannot tell a
  // comment from an access. This tool reads neither the manifest nor any
  // source file — it reads 03-translated/ and 05-publication/ only.)
  // Warn rather than fail: the rendered page is authoritative for the link, so
  // the index is still correct where it matters, and the catalogue is a
  // separate fix. Silence is what let this sit unnoticed in a shipped file.
  const sectionMismatch = [];

  for (const [chapterNum, modules] of modulesByChapter.entries()) {
    const chapterStr = String(chapterNum).padStart(2, '0');
    let chapterTermCount = 0;

    // Process ALL modules in the chapter (bug fix: was only processing last module)
    for (const moduleId of modules) {
      const cnxmlPath = path.join(
        BOOKS_DIR,
        book,
        '03-translated',
        track,
        `ch${chapterStr}`,
        `${moduleId}.cnxml`
      );

      const terms = extractGlossaryFromCnxml(cnxmlPath, verbose);

      for (const { term, definition, termId } of terms) {
        const { termIs, termEn } = splitTerm(term);

        // Look up section info from module map
        const modInfo = moduleMap?.get(moduleId);
        // Intro modules carry section "intro"; normalize to `${chapter}.0`.
        // §C104: this is now COSMETIC — it shapes the emitted `section` display
        // field only. Slug/title resolution no longer goes through the section
        // number at all, so GI-1 no longer depends on this normalization.
        const section =
          modInfo?.section === 'intro' && modInfo?.chapter != null
            ? `${modInfo.chapter}.0`
            : modInfo?.section || null;

        // Look up slug and title from this book's own rendered page (§C104).
        // Keyed on the module id, so no section-number indirection is needed
        // and GI-1 (intro modules) resolves without a `${chapter}.0` special case.
        const pubInfo = publicationMap.get(moduleId) || null;
        if (!pubInfo) unresolved.add(moduleId);

        const entry = {
          termIs,
          termEn,
          termFull: term,
          definition,
          chapter: chapterNum,
          section: section || null,
          sectionTitle: pubInfo?.title || null,
          sectionSlug: pubInfo?.slug || null,
          termId,
        };

        if (section && pubInfo?.slug && !pubInfo.slug.startsWith(`${section.replace('.', '-')}-`)) {
          sectionMismatch.push(`${moduleId} (section ${section} vs page ${pubInfo.slug})`);
        }

        entries.push(entry);
        chapterTermCount++;
      }
    }

    if (verbose && chapterTermCount > 0) {
      console.log(`  Chapter ${chapterNum}: ${chapterTermCount} terms`);
    }
  }

  console.log(`  Total term entries: ${entries.length}`);
  if (unresolved.size > 0) {
    console.log(
      `  ⚠️  ${unresolved.size} module(s) have glossary terms but no rendered page ` +
        `in 05-publication/${track}/ — their entries carry a null sectionSlug: ` +
        `${[...unresolved].sort().join(', ')}`
    );
  }
  if (sectionMismatch.length > 0) {
    const distinct = [...new Set(sectionMismatch)];
    console.log(
      `  ⚠️  ${distinct.length} module(s) whose catalogue section disagrees with the ` +
        `rendered page (§C108). The page wins — links are correct, the \`section\` ` +
        `display field is not: ${distinct.slice(0, 5).join('; ')}` +
        (distinct.length > 5 ? `; …and ${distinct.length - 5} more` : '')
    );
  }
  console.log('');

  // Sort alphabetically by Icelandic term
  console.log('Sorting entries...');
  entries.sort((a, b) => a.termIs.toLowerCase().localeCompare(b.termIs.toLowerCase(), 'is'));

  // Count unique IS terms
  const uniqueTerms = new Set(entries.map((e) => e.termIs.toLowerCase()));
  console.log(`Total entries: ${entries.length} (${uniqueTerms.size} unique terms)`);

  return {
    generated: new Date().toISOString(),
    termCount: entries.length,
    entries,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    // A retired flag must read as a usage error, not an unhandled rejection.
    console.error(`\nError: ${err.message}`);
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.book) {
    console.error('Error: --book is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  try {
    const index = generateIndex(args);

    // Determine output path
    const outputPath =
      args.output || path.join(BOOKS_DIR, args.book, '05-publication', args.track, 'index.json');

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

    console.log('');
    console.log('═'.repeat(60));
    console.log('Index Generated Successfully');
    console.log('═'.repeat(60));
    console.log(`Output: ${outputPath}`);
    console.log(`Entries: ${index.entries.length}`);
    console.log('');

    // Show sample entries
    if (index.entries.length > 0) {
      console.log('Sample entries (first 5):');
      for (const entry of index.entries.slice(0, 5)) {
        const en = entry.termEn ? ` (${entry.termEn})` : '';
        const sec = entry.section ? ` — ${entry.section}` : '';
        console.log(`  - ${entry.termIs}${en}${sec}`);
      }
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (args.verbose) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
