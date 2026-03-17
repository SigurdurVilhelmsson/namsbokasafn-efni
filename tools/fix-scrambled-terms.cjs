#!/usr/bin/env node
/**
 * Diagnostic + fix script for scrambled terminology_terms table.
 *
 * Run: node tools/fix-scrambled-terms.cjs
 *
 * The buggy migration 026 used INSERT INTO ... SELECT * with mismatched
 * column order, scrambling all data. This script detects and fixes it.
 *
 * Handles mixed tables: rows scrambled by migration 026 (english contains
 * numeric book_id) and rows inserted correctly afterward (english contains
 * actual term text).
 */

const path = require('path');
const Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));

const DB_PATH = path.join(__dirname, '..', 'pipeline-output', 'sessions.db');

console.log('=== Terminology Table Diagnostic ===\n');
console.log('DB path:', DB_PATH);

const fs = require('fs');
if (!fs.existsSync(DB_PATH)) {
  console.log('ERROR: Database file not found');
  process.exit(1);
}

const db = new Database(DB_PATH);

// 1. Check if table exists
const tableInfo = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='terminology_terms'")
  .get();

if (!tableInfo) {
  console.log('ERROR: terminology_terms table does not exist');
  db.close();
  process.exit(1);
}

// 2. Check column order
const cols = db.prepare('PRAGMA table_info(terminology_terms)').all();
console.log('Column order:');
cols.forEach((c) =>
  console.log(`  ${c.cid}: ${c.name} (${c.type}${c.notnull ? ' NOT NULL' : ''})`)
);

const col1 = cols.find((c) => c.cid === 1);
const isScrambled = col1 && col1.name === 'english';

console.log(`\nColumn 1 is "${col1?.name}" → ${isScrambled ? 'SCRAMBLED' : 'CORRECT'}`);

// 3. Check for leftover recovery table
const recoveredExists = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='terminology_terms_recovered'"
  )
  .get();
if (recoveredExists) {
  console.log(
    'WARNING: terminology_terms_recovered table exists (leftover from failed migration)'
  );
}

// 4. Sample data
console.log('\nSample data (first 3 rows):');
const sample = db.prepare('SELECT * FROM terminology_terms LIMIT 3').all();
sample.forEach((row) => {
  console.log(
    `  id=${row.id} english="${row.english}" icelandic="${row.icelandic}" alternatives="${row.alternatives}" book_id=${row.book_id} source="${row.source}"`
  );
});

// 5. Total counts
const total = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
console.log(`\nTotal terms: ${total.c}`);

// Detect scrambled vs correct rows
// Scrambled rows: english contains old book_id (pure digits like "1", "4")
// Correct rows: english contains actual terms (has letters)
const scrambledCount = db
  .prepare(
    "SELECT COUNT(*) as c FROM terminology_terms WHERE english GLOB '[0-9]*' AND english NOT GLOB '*[a-zA-Z]*'"
  )
  .get();
const correctCount = db
  .prepare(
    "SELECT COUNT(*) as c FROM terminology_terms WHERE NOT (english GLOB '[0-9]*' AND english NOT GLOB '*[a-zA-Z]*')"
  )
  .get();

console.log(`\nScrambled rows (numeric english): ${scrambledCount.c}`);
console.log(`Correct rows (text english): ${correctCount.c}`);

if (!isScrambled) {
  console.log('\nTable is NOT scrambled. No fix needed.');
  db.close();
  process.exit(0);
}

// === FIX SCRAMBLED DATA ===

console.log('\n=== FIXING SCRAMBLED DATA ===\n');

// Clean up leftover table
db.exec('DROP TABLE IF EXISTS terminology_terms_recovered');

db.exec(`
  CREATE TABLE terminology_terms_recovered (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER,
    english TEXT NOT NULL,
    icelandic TEXT,
    alternatives TEXT,
    category TEXT,
    notes TEXT,
    source TEXT,
    source_chapter INTEGER,
    status TEXT DEFAULT 'proposed',
    proposed_by TEXT,
    proposed_by_name TEXT,
    approved_by TEXT,
    approved_by_name TEXT,
    approved_at DATETIME,
    definition_en TEXT,
    definition_is TEXT,
    pos TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(english, pos, book_id),
    FOREIGN KEY (book_id) REFERENCES registered_books(id)
  );
`);

console.log('Created recovery table');

// Step 1: Insert SCRAMBLED rows with reverse column mapping
// These have numeric english (old book_id) — apply the reverse mapping
const isNumeric = "english GLOB '[0-9]*' AND english NOT GLOB '*[a-zA-Z]*'";

const insertScrambled = db
  .prepare(
    `
  INSERT INTO terminology_terms_recovered (
    id, book_id, english, icelandic, alternatives, category,
    notes, source, source_chapter, status,
    proposed_by, proposed_by_name, approved_by, approved_by_name, approved_at,
    definition_en, definition_is, pos,
    created_at, updated_at
  )
  SELECT
    id,
    CAST(english AS INTEGER),
    icelandic,
    alternatives,
    category,
    notes,
    source,
    source_chapter,
    CAST(book_id AS INTEGER),
    status,
    definition_en,
    definition_is,
    pos,
    proposed_by,
    proposed_by_name,
    approved_by,
    approved_by_name,
    approved_at,
    created_at,
    updated_at
  FROM terminology_terms
  WHERE ${isNumeric}
`
  )
  .run();

console.log(`Recovered ${insertScrambled.changes} scrambled rows`);

// Step 2: Insert CORRECT rows as-is (inserted after buggy migration)
// These have real english terms — copy without remapping
const insertCorrect = db
  .prepare(
    `
  INSERT INTO terminology_terms_recovered (
    id, book_id, english, icelandic, alternatives, category,
    notes, source, source_chapter, status,
    proposed_by, proposed_by_name, approved_by, approved_by_name, approved_at,
    definition_en, definition_is, pos,
    created_at, updated_at
  )
  SELECT
    id, book_id, english, icelandic, alternatives, category,
    notes, source, source_chapter, status,
    proposed_by, proposed_by_name, approved_by, approved_by_name, approved_at,
    definition_en, definition_is, pos,
    created_at, updated_at
  FROM terminology_terms
  WHERE NOT (${isNumeric})
`
  )
  .run();

console.log(`Copied ${insertCorrect.changes} correct rows as-is`);

// Verify
const recoveredTotal = db
  .prepare('SELECT COUNT(*) as c FROM terminology_terms_recovered')
  .get();

console.log(
  `\nTotal recovered: ${recoveredTotal.c} (expected: ${total.c})`
);

if (recoveredTotal.c !== total.c) {
  console.log('ERROR: Row count mismatch! Aborting.');
  db.exec('DROP TABLE terminology_terms_recovered');
  db.close();
  process.exit(1);
}

// Swap tables
db.exec(`
  DROP TABLE terminology_terms;
  ALTER TABLE terminology_terms_recovered RENAME TO terminology_terms;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_terminology_terms_unique
    ON terminology_terms(english, pos, book_id);
  CREATE INDEX IF NOT EXISTS idx_terminology_terms_english
    ON terminology_terms(english);
  CREATE INDEX IF NOT EXISTS idx_terminology_terms_status
    ON terminology_terms(status);
  CREATE INDEX IF NOT EXISTS idx_terminology_terms_book
    ON terminology_terms(book_id);
  CREATE INDEX IF NOT EXISTS idx_terminology_terms_category
    ON terminology_terms(category);
`);

console.log('Swapped tables and recreated indexes');

// Final verification
const after = db.prepare('SELECT * FROM terminology_terms LIMIT 3').all();
console.log('\nRecovered data (first 3 rows):');
after.forEach((row) => {
  console.log(
    `  id=${row.id} english="${row.english}" icelandic="${row.icelandic}" book_id=${row.book_id} source="${row.source}"`
  );
});

const colsAfter = db.prepare('PRAGMA table_info(terminology_terms)').all();
const col1After = colsAfter.find((c) => c.cid === 1);
console.log(`\nColumn 1 is now "${col1After?.name}" (should be "book_id")`);

const totalAfter = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
console.log(`Total terms: ${totalAfter.c}`);

db.close();
console.log('\n=== DONE ===');
