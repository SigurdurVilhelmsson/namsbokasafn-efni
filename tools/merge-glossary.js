#!/usr/bin/env node

/**
 * merge-glossary.js
 *
 * Three-source glossary merge tool. Combines:
 *   1. Chemistry Society CSV (highest authority)
 *   2. OpenStax CNXML glossary (EN definitions + MT IS translations)
 *   3. Curated glossary CSV (manually vetted terms)
 *
 * Produces:
 *   - JSON file:  books/{book}/glossary/glossary-unified.json
 *   - CSV file:   books/{book}/glossary/glossary-unified.csv
 *   - DB upserts: terminology_terms table
 *
 * Usage:
 *   node tools/merge-glossary.js --book efnafraedi-2e [--csv path/to/society.csv] [--dry-run] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { extractEnglishGlossary, extractTranslatedGlossary } from './lib/glossary-extract.js';

const BOOKS_DIR = 'books';

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args) {
  const result = {
    book: null,
    csv: null,
    track: 'mt-preview',
    dryRun: false,
    outputJson: true,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--output-json') result.outputJson = true;
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--csv' && args[i + 1]) result.csv = args[++i];
    else if (arg === '--track' && args[i + 1]) result.track = args[++i];
  }

  return result;
}

function printHelp() {
  console.log(`
merge-glossary.js — Three-source glossary merge

Merges Chemistry Society CSV, OpenStax CNXML glossary, and curated
terminology CSV into a unified glossary with definitions and provenance.

Usage:
  node tools/merge-glossary.js --book <slug> [options]

Required:
  --book SLUG       Book identifier (e.g., efnafraedi-2e)

Options:
  --csv PATH        Path to Chemistry Society CSV (default: auto-detect Efnafræði_en_is.csv)
  --track TRACK     Translation track for OpenStax (default: mt-preview)
  --dry-run         Report what would change without writing files or DB
  --verbose         Show detailed progress
  -h, --help        Show this help message

Examples:
  node tools/merge-glossary.js --book efnafraedi-2e --verbose
  node tools/merge-glossary.js --book efnafraedi-2e --csv Efnafræði_en_is.csv --dry-run
  node tools/merge-glossary.js --book liffraedi-2e
`);
}

// ============================================================================
// Source 1: Chemistry Society CSV
// ============================================================================

/**
 * Parse the Chemistry Society CSV.
 * Format: first line is "↗,↗" (header marker), then "english,icelandic" pairs.
 * Some terms may appear twice (homographs with different IS translations).
 *
 * Returns Map<lowercasedEn, { term, icelandic, duplicates? }>
 */
function loadSocietyCSV(csvPath) {
  const terms = new Map();

  if (!csvPath || !fs.existsSync(csvPath)) {
    return terms;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '↗,↗') continue;

    // Split on first comma only (IS term might contain commas in rare cases)
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;

    const en = line.substring(0, commaIdx).trim();
    const is = line.substring(commaIdx + 1).trim();

    if (!en || !is) continue;

    const key = en.toLowerCase();

    if (terms.has(key)) {
      // Duplicate EN term — potential homograph
      const existing = terms.get(key);
      if (!existing.duplicates) {
        existing.duplicates = [{ term: existing.term, icelandic: existing.icelandic }];
      }
      existing.duplicates.push({ term: en, icelandic: is });
    } else {
      terms.set(key, { term: en, icelandic: is });
    }
  }

  return terms;
}

// ============================================================================
// Source 3: Curated Glossary CSV
// ============================================================================

/**
 * Parse the curated terminology-en-is.csv.
 * Has column headers: english,icelandic,category,notes,source,status
 */
function loadCuratedCSV(bookSlug) {
  const csvPath = path.join(BOOKS_DIR, bookSlug, 'glossary', 'terminology-en-is.csv');
  const terms = new Map();

  if (!fs.existsSync(csvPath)) {
    return terms;
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse (no quoted fields expected in this file)
    const parts = line.split(',');
    if (parts.length < 2) continue;

    const en = parts[0].trim();
    const is = parts[1].trim();
    const category = (parts[2] || '').trim() || 'other';
    const notes = (parts[3] || '').trim() || null;
    const source = (parts[4] || '').trim() || null;
    const status = (parts[5] || '').trim() || 'approved';

    if (!en || !is) continue;

    terms.set(en.toLowerCase(), {
      term: en,
      icelandic: is,
      category,
      notes,
      source,
      status,
    });
  }

  return terms;
}

// ============================================================================
// Alternatives Parsing
// ============================================================================

/**
 * Parse "Also: frumeind (older usage)" from curated CSV notes field.
 * Returns array of { term, note, source } or empty array.
 */
function parseAlternativesFromNotes(notes) {
  if (!notes) return [];
  const alternatives = [];

  // Match "Also: word (context)" or "Also: word"
  const alsoMatch = notes.match(/Also:\s*(.+?)(?:\s*\(([^)]+)\))?$/i);
  if (alsoMatch) {
    alternatives.push({
      term: alsoMatch[1].trim(),
      note: alsoMatch[2] || null,
      source: 'curated',
    });
  }

  return alternatives;
}

// ============================================================================
// Homograph / POS Inference
// ============================================================================

/**
 * Infer part of speech from an Icelandic term.
 * Heuristic — returns null when ambiguous.
 */
function inferPos(icelandicTerm) {
  if (!icelandicTerm) return null;
  const t = icelandicTerm.trim().toLowerCase();

  // Verb indicators: reflexive -ast, infinitive -a
  if (t.endsWith('ast') || t.endsWith('a')) {
    // Check it's not a noun ending in -a (many IS nouns do)
    // Multi-word terms ending in a verb pattern are likely verbs
    if (t.includes(' ') && (t.endsWith('ast') || t.endsWith('a'))) {
      return 'verb';
    }
    if (t.endsWith('ast')) return 'verb';
  }

  // Most single-word chemistry terms are nouns
  return null;
}

// ============================================================================
// Merge Algorithm
// ============================================================================

/**
 * Perform the three-source merge.
 *
 * Priority for IS term: Society > Curated > OpenStax MT
 * Status: approved if from Society or Curated, proposed if only from OpenStax MT
 */
function mergeGlossaries(societyTerms, curatedTerms, enGlossary, translatedGlossary, verbose) {
  // Build union of all EN terms
  const allKeys = new Set([
    ...societyTerms.keys(),
    ...curatedTerms.keys(),
    ...enGlossary.keys(),
    ...translatedGlossary.keys(),
  ]);

  const merged = [];
  const stats = { total: 0, approved: 0, proposed: 0, needs_review: 0 };

  for (const key of [...allKeys].sort()) {
    const society = societyTerms.get(key);
    const curated = curatedTerms.get(key);
    const enDef = enGlossary.get(key);
    const isDef = translatedGlossary.get(key);

    // Handle homographs from society CSV (duplicate EN keys with different IS translations)
    if (society && society.duplicates) {
      if (verbose) {
        console.log(`  Homograph: "${society.term}" → ${society.duplicates.length} entries`);
      }

      for (const dup of society.duplicates) {
        const pos = inferPos(dup.icelandic);
        const entry = buildEntry({
          key,
          english: society.term,
          icelandic: dup.icelandic,
          pos,
          definitionEn: enDef?.definition || null,
          definitionIs: isDef?.definitionIs || null,
          status: 'approved',
          source: 'chemistry-society-csv',
          category: curated?.category || 'other',
          chapter: enDef?.chapter || isDef?.chapter || null,
          alternatives: [],
          notes: curated?.notes || null,
        });
        merged.push(entry);
        stats.total++;
        stats.approved++;
      }
      continue;
    }

    // Determine primary IS translation by priority
    let icelandic = null;
    let source = null;
    let status = 'needs_review';
    const alternatives = [];

    if (society) {
      icelandic = society.icelandic;
      source = 'chemistry-society-csv';
      status = 'approved';
    }

    if (curated) {
      if (!icelandic) {
        icelandic = curated.icelandic;
        source = mapCuratedSource(curated.source);
        status = curated.status || 'approved';
      } else if (curated.icelandic.toLowerCase() !== icelandic.toLowerCase()) {
        // Curated disagrees with society — curated becomes alternative
        alternatives.push({
          term: curated.icelandic,
          note: `from curated glossary (${curated.source || 'manual'})`,
          source: 'curated',
        });
      }

      // Parse "Also:" from curated notes
      const notesAlts = parseAlternativesFromNotes(curated.notes);
      for (const alt of notesAlts) {
        if (alt.term.toLowerCase() !== (icelandic || '').toLowerCase()) {
          alternatives.push(alt);
        }
      }
    }

    if (isDef) {
      if (!icelandic) {
        icelandic = isDef.termIs;
        source = 'openstax-mt';
        status = 'proposed';
      } else if (isDef.termIs && isDef.termIs.toLowerCase() !== icelandic.toLowerCase()) {
        // OpenStax MT disagrees — becomes alternative
        alternatives.push({
          term: isDef.termIs,
          note: 'OpenStax MT translation',
          source: 'openstax-mt',
        });
      }
    }

    // English term (prefer original casing from sources)
    const english = society?.term || curated?.term || enDef?.term || isDef?.termIs || key;

    // If no IS translation at all
    if (!icelandic) {
      status = 'needs_review';
      icelandic = '';
    }

    const entry = buildEntry({
      key,
      english,
      icelandic,
      pos: null,
      definitionEn: enDef?.definition || null,
      definitionIs: isDef?.definitionIs || null,
      status,
      source: source || 'openstax-glossary',
      category: curated?.category || 'other',
      chapter: enDef?.chapter || isDef?.chapter || null,
      alternatives,
      notes: curated?.notes || null,
    });

    merged.push(entry);
    stats.total++;
    stats[status]++;
  }

  return { terms: merged, stats };
}

function buildEntry({
  english,
  icelandic,
  pos,
  definitionEn,
  definitionIs,
  status,
  source,
  category,
  chapter,
  alternatives,
  notes,
}) {
  return {
    english,
    icelandic,
    pos: pos || null,
    definitionEn: definitionEn || null,
    definitionIs: definitionIs || null,
    status,
    source,
    alternatives: alternatives || [],
    category: category || 'other',
    chapter: chapter || null,
    notes: notes || null,
  };
}

/**
 * Map curated CSV source names to our source constants.
 */
function mapCuratedSource(src) {
  if (!src) return 'manual';
  const lower = src.toLowerCase();
  if (lower.includes('íðorðabank')) return 'idordabankinn';
  if (lower.includes('icelandic naming')) return 'manual';
  if (lower.includes('international')) return 'manual';
  return 'manual';
}

// ============================================================================
// Output: JSON
// ============================================================================

function writeJSON(bookSlug, merged) {
  const outputPath = path.join(BOOKS_DIR, bookSlug, 'glossary', 'glossary-unified.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const output = {
    generated: new Date().toISOString(),
    book: bookSlug,
    stats: merged.stats,
    terms: merged.terms,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  return outputPath;
}

// ============================================================================
// Output: CSV
// ============================================================================

function writeCSV(bookSlug, merged) {
  const outputPath = path.join(BOOKS_DIR, bookSlug, 'glossary', 'glossary-unified.csv');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const header =
    'english,icelandic,pos,definition_en,definition_is,status,source,alternatives,category,chapter,notes';
  const lines = [header];

  for (const term of merged.terms) {
    const alts = term.alternatives.map((a) => a.term).join('; ');
    lines.push(
      [
        csvEscape(term.english),
        csvEscape(term.icelandic),
        csvEscape(term.pos || ''),
        csvEscape(term.definitionEn || ''),
        csvEscape(term.definitionIs || ''),
        term.status,
        term.source,
        csvEscape(alts),
        term.category,
        term.chapter || '',
        csvEscape(term.notes || ''),
      ].join(',')
    );
  }

  fs.writeFileSync(outputPath, lines.join('\n') + '\n');
  return outputPath;
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================================================
// Output: DB Upserts
// ============================================================================

async function upsertToDb(bookSlug, merged, _verbose) {
  // Dynamic import for better-sqlite3 (CJS module installed in server/node_modules/)
  let Database;
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    // Try server's node_modules first (where better-sqlite3 is installed)
    try {
      Database = require(path.resolve('server/node_modules/better-sqlite3'));
    } catch {
      Database = require('better-sqlite3');
    }
  } catch {
    console.warn('  Warning: better-sqlite3 not available — skipping DB upserts');
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const dbPath = path.join('pipeline-output', 'sessions.db');
  if (!fs.existsSync(dbPath)) {
    console.warn('  Warning: Database not found at', dbPath, '— skipping DB upserts');
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const db = new Database(dbPath);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // Get book_id
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      console.warn(
        `  Warning: Book "${bookSlug}" not found in registered_books — skipping DB upserts`
      );
      db.close();
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    const bookId = book.id;

    const checkStmt = db.prepare(
      'SELECT id, status FROM terminology_terms WHERE english = ? AND (pos = ? OR (pos IS NULL AND ? IS NULL)) AND (book_id = ? OR (book_id IS NULL AND ? IS NULL))'
    );

    const insertStmt = db.prepare(`
      INSERT INTO terminology_terms
        (english, icelandic, alternatives, category, notes, source, source_chapter, book_id, status, definition_en, definition_is, pos, proposed_by, proposed_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'merge-glossary', 'Sjálfvirkt sameinað')
    `);

    const updateStmt = db.prepare(`
      UPDATE terminology_terms
      SET icelandic = ?, alternatives = ?, category = COALESCE(?, category), notes = COALESCE(?, notes),
          source = ?, source_chapter = ?, definition_en = COALESCE(?, definition_en),
          definition_is = COALESCE(?, definition_is), pos = COALESCE(?, pos)
      WHERE id = ?
    `);

    const upsertAll = db.transaction(() => {
      for (const term of merged.terms) {
        const altsJson = term.alternatives.length > 0 ? JSON.stringify(term.alternatives) : null;

        const existing = checkStmt.get(term.english, term.pos, term.pos, bookId, bookId);

        if (existing) {
          // Don't downgrade approved terms to proposed
          if (existing.status === 'approved' && term.status !== 'approved') {
            skipped++;
            continue;
          }

          updateStmt.run(
            term.icelandic,
            altsJson,
            term.category !== 'other' ? term.category : null,
            term.notes,
            term.source,
            term.chapter,
            term.definitionEn,
            term.definitionIs,
            term.pos,
            existing.id
          );
          updated++;
        } else {
          insertStmt.run(
            term.english,
            term.icelandic,
            altsJson,
            term.category,
            term.notes,
            term.source,
            term.chapter,
            bookId,
            term.status,
            term.definitionEn,
            term.definitionIs,
            term.pos
          );
          inserted++;
        }
      }
    });

    upsertAll();

    // Log the import
    db.prepare(
      `
      INSERT INTO terminology_imports (source_name, file_name, imported_by, imported_by_name, terms_added, terms_updated, terms_skipped)
      VALUES ('merge-glossary', ?, 'merge-glossary', 'Sjálfvirkt sameinað', ?, ?, ?)
    `
    ).run(bookSlug, inserted, updated, skipped);

    db.close();
  } catch (err) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    throw err;
  }

  return { inserted, updated, skipped };
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

  if (!args.book) {
    console.error('Error: --book is required');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const bookSlug = args.book;

  console.log('');
  console.log('═'.repeat(60));
  console.log(`Unified Glossary Merge — ${bookSlug}`);
  console.log('═'.repeat(60));
  console.log('');

  // ── Source 1: Chemistry Society CSV ──
  // Only auto-detect the society CSV for chemistry books; other books must specify --csv
  const societyCsvPath =
    args.csv || (bookSlug.startsWith('efnafraedi') ? 'Efnafræði_en_is.csv' : null);
  const societyTerms = loadSocietyCSV(societyCsvPath);
  console.log(
    `Source 1 — Chemistry Society CSV: ${societyTerms.size} terms${societyCsvPath ? '' : ' (no CSV specified)'}`
  );
  if (societyTerms.size === 0 && args.csv) {
    console.warn(`  Warning: CSV file not found at ${args.csv}`);
  }

  // ── Source 2: OpenStax CNXML ──
  let enGlossary, translatedGlossary;
  try {
    enGlossary = extractEnglishGlossary(bookSlug);
    console.log(`Source 2a — OpenStax EN definitions: ${enGlossary.size} terms`);
  } catch (err) {
    console.warn(`  Warning: Could not extract EN glossary: ${err.message}`);
    enGlossary = new Map();
  }

  try {
    translatedGlossary = extractTranslatedGlossary(bookSlug, args.track);
    console.log(`Source 2b — OpenStax IS translations: ${translatedGlossary.size} terms`);
  } catch (err) {
    console.warn(`  Warning: Could not extract IS glossary: ${err.message}`);
    translatedGlossary = new Map();
  }

  // ── Source 3: Curated CSV ──
  const curatedTerms = loadCuratedCSV(bookSlug);
  console.log(`Source 3 — Curated glossary: ${curatedTerms.size} terms`);
  console.log('');

  // ── Merge ──
  console.log('Merging...');
  const merged = mergeGlossaries(
    societyTerms,
    curatedTerms,
    enGlossary,
    translatedGlossary,
    args.verbose
  );

  console.log('');
  console.log('─'.repeat(40));
  console.log(`Total terms:    ${merged.stats.total}`);
  console.log(`  Approved:     ${merged.stats.approved}`);
  console.log(`  Proposed:     ${merged.stats.proposed}`);
  console.log(`  Needs review: ${merged.stats.needs_review}`);
  console.log('─'.repeat(40));
  console.log('');

  if (args.dryRun) {
    console.log('DRY RUN — no files written, no DB changes made.');

    if (args.verbose) {
      console.log('');
      console.log('Sample terms (first 10):');
      for (const term of merged.terms.slice(0, 10)) {
        const alts =
          term.alternatives.length > 0
            ? ` [alts: ${term.alternatives.map((a) => a.term).join(', ')}]`
            : '';
        console.log(`  ${term.english} → ${term.icelandic} (${term.status})${alts}`);
      }
    }

    process.exit(0);
  }

  // ── Write outputs ──
  const jsonPath = writeJSON(bookSlug, merged);
  console.log(`JSON written: ${jsonPath}`);

  const csvPath = writeCSV(bookSlug, merged);
  console.log(`CSV written:  ${csvPath}`);

  // ── DB upserts ──
  try {
    const dbResult = await upsertToDb(bookSlug, merged, args.verbose);
    console.log(
      `DB upserts:   ${dbResult.inserted} inserted, ${dbResult.updated} updated, ${dbResult.skipped} skipped`
    );
  } catch (err) {
    console.error(`DB upsert error: ${err.message}`);
    if (args.verbose) console.error(err.stack);
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('Merge complete!');
  console.log('═'.repeat(60));
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
