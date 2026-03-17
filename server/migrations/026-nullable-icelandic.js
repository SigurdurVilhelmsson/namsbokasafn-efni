/**
 * Migration 026: Make icelandic column nullable
 *
 * Allows importing glossary terms as placeholders (English only, needing translation).
 * SQLite doesn't support ALTER COLUMN, so we rebuild the table.
 */

module.exports = {
  id: '026-nullable-icelandic',

  up(db) {
    // Check current schema — if icelandic is already nullable, skip
    const tableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='terminology_terms'")
      .get();

    if (!tableInfo) {
      // Table doesn't exist yet — nothing to do
      return;
    }

    // If the column definition has NOT NULL, we need to rebuild
    if (!tableInfo.sql.includes('icelandic TEXT NOT NULL')) {
      console.log('Migration 026: icelandic column is already nullable');
      return;
    }

    console.log('Applying migration 026: Making icelandic column nullable...');

    db.exec(`
      CREATE TABLE terminology_terms_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        english TEXT NOT NULL,
        icelandic TEXT,
        alternatives TEXT,
        category TEXT DEFAULT 'other',
        notes TEXT,
        source TEXT DEFAULT 'manual',
        source_chapter TEXT,
        book_id INTEGER,
        status TEXT DEFAULT 'proposed',
        definition_en TEXT,
        definition_is TEXT,
        pos TEXT,
        proposed_by TEXT,
        proposed_by_name TEXT,
        approved_by TEXT,
        approved_by_name TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES registered_books(id)
      );

      INSERT INTO terminology_terms_new
        SELECT * FROM terminology_terms;

      DROP TABLE terminology_terms;

      ALTER TABLE terminology_terms_new RENAME TO terminology_terms;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_terminology_terms_unique
        ON terminology_terms(english, book_id);

      CREATE INDEX IF NOT EXISTS idx_terminology_terms_english
        ON terminology_terms(english);

      CREATE INDEX IF NOT EXISTS idx_terminology_terms_status
        ON terminology_terms(status);

      CREATE INDEX IF NOT EXISTS idx_terminology_terms_book
        ON terminology_terms(book_id);
    `);

    console.log('Migration 026: icelandic column is now nullable');
  },
};
