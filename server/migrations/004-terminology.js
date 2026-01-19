/**
 * Migration: Add Terminology Database and Localization Suggestions Tables
 *
 * Adds tables to support:
 * - Terminology management (terms, discussions, imports)
 * - Localization suggestions (auto-detected changes)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

function migrate() {
  // Ensure database directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  try {
    // Check if migration is already applied
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='terminology_terms'").get();

    if (tables) {
      console.log('Migration 004-terminology already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding terminology and suggestions tables...');

    // Create terminology_terms table
    db.exec(`
      CREATE TABLE IF NOT EXISTS terminology_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        english TEXT NOT NULL,
        icelandic TEXT NOT NULL,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(english, book_id)
      );

      CREATE INDEX IF NOT EXISTS idx_terminology_terms_book
        ON terminology_terms(book_id);
      CREATE INDEX IF NOT EXISTS idx_terminology_terms_english
        ON terminology_terms(english);
      CREATE INDEX IF NOT EXISTS idx_terminology_terms_status
        ON terminology_terms(status);
      CREATE INDEX IF NOT EXISTS idx_terminology_terms_category
        ON terminology_terms(category);
    `);
    console.log('  Created terminology_terms table');

    // Create terminology_discussions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS terminology_discussions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        comment TEXT NOT NULL,
        proposed_translation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (term_id) REFERENCES terminology_terms(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_terminology_discussions_term
        ON terminology_discussions(term_id);
    `);
    console.log('  Created terminology_discussions table');

    // Create terminology_imports table
    db.exec(`
      CREATE TABLE IF NOT EXISTS terminology_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_name TEXT NOT NULL,
        file_name TEXT,
        imported_by TEXT NOT NULL,
        imported_by_name TEXT,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        terms_added INTEGER DEFAULT 0,
        terms_updated INTEGER DEFAULT 0,
        terms_skipped INTEGER DEFAULT 0,
        error_message TEXT
      );
    `);
    console.log('  Created terminology_imports table');

    // Create localization_suggestions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS localization_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        suggestion_type TEXT NOT NULL,
        original_text TEXT NOT NULL,
        suggested_text TEXT NOT NULL,
        context TEXT,
        line_number INTEGER,
        pattern_id TEXT,
        status TEXT DEFAULT 'pending',
        reviewer_modified_text TEXT,
        reviewed_by TEXT,
        reviewed_by_name TEXT,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (section_id) REFERENCES book_sections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_localization_suggestions_section
        ON localization_suggestions(section_id);
      CREATE INDEX IF NOT EXISTS idx_localization_suggestions_status
        ON localization_suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_localization_suggestions_type
        ON localization_suggestions(suggestion_type);
    `);
    console.log('  Created localization_suggestions table');

    // Create trigger to update terminology_terms.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_terminology_terms_timestamp
        AFTER UPDATE ON terminology_terms
        FOR EACH ROW
        BEGIN
          UPDATE terminology_terms SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
    console.log('  Created update timestamp trigger');

    console.log('Migration 004-terminology completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Migration failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

function rollback() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database does not exist, nothing to rollback');
    return { success: true };
  }

  const db = new Database(DB_PATH);

  try {
    console.log('Rolling back migration: Removing terminology and suggestions tables...');

    db.exec(`
      DROP TRIGGER IF EXISTS update_terminology_terms_timestamp;
      DROP TABLE IF EXISTS localization_suggestions;
      DROP TABLE IF EXISTS terminology_imports;
      DROP TABLE IF EXISTS terminology_discussions;
      DROP TABLE IF EXISTS terminology_terms;
    `);

    console.log('Rollback completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Rollback failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--rollback')) {
    rollback();
  } else {
    migrate();
  }
}

module.exports = { migrate, rollback };
