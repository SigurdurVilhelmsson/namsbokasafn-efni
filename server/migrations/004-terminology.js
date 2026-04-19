/**
 * Migration: Add Terminology Database and Localization Suggestions Tables
 *
 * Adds tables to support:
 * - Terminology management (terms, discussions, imports)
 * - Localization suggestions (auto-detected changes)
 */

module.exports = {
  name: '004-terminology',

  up(db) {
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

    // Create trigger to update terminology_terms.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_terminology_terms_timestamp
        AFTER UPDATE ON terminology_terms
        FOR EACH ROW
        BEGIN
          UPDATE terminology_terms SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
  },
};
