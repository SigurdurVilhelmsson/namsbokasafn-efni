/**
 * Migration 020: Glossary definitions
 *
 * Adds definition_en, definition_is, and pos columns to terminology_terms.
 * Updates the unique constraint from UNIQUE(english, book_id) to
 * UNIQUE(english, pos, book_id) so the same English term can appear with
 * different parts of speech.
 *
 * Uses the rename-recreate pattern because SQLite does not support
 * DROP CONSTRAINT.
 */

module.exports = {
  name: '020-glossary-definitions',

  up(db) {
    // Check if migration was already applied (pos column exists)
    const columns = db.pragma('table_info(terminology_terms)');
    const hasPos = columns.some((c) => c.name === 'pos');

    if (hasPos) {
      console.log('Migration 020-glossary-definitions already applied (pos column exists)');
      return;
    }

    db.exec('BEGIN TRANSACTION');

    try {
      // 1. Rename existing table
      db.exec('ALTER TABLE terminology_terms RENAME TO terminology_terms_old;');

      // 2. Create new table with updated schema
      db.exec(`
        CREATE TABLE terminology_terms (
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
          definition_en TEXT,
          definition_is TEXT,
          pos TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(english, pos, book_id)
        );
      `);

      // 3. Copy data from old table (new columns get NULL defaults)
      db.exec(`
        INSERT INTO terminology_terms (
          id, book_id, english, icelandic, alternatives, category, notes,
          source, source_chapter, status, proposed_by, proposed_by_name,
          approved_by, approved_by_name, approved_at, created_at, updated_at
        )
        SELECT
          id, book_id, english, icelandic, alternatives, category, notes,
          source, source_chapter, status, proposed_by, proposed_by_name,
          approved_by, approved_by_name, approved_at, created_at, updated_at
        FROM terminology_terms_old;
      `);

      // 4. Drop old table
      db.exec('DROP TABLE terminology_terms_old;');

      // 5. Recreate indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_terminology_terms_book
          ON terminology_terms(book_id);
        CREATE INDEX IF NOT EXISTS idx_terminology_terms_english
          ON terminology_terms(english);
        CREATE INDEX IF NOT EXISTS idx_terminology_terms_status
          ON terminology_terms(status);
        CREATE INDEX IF NOT EXISTS idx_terminology_terms_category
          ON terminology_terms(category);
      `);

      // 6. Recreate update trigger
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS update_terminology_terms_timestamp
          AFTER UPDATE ON terminology_terms
          FOR EACH ROW
          BEGIN
            UPDATE terminology_terms SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
          END;
      `);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
};
