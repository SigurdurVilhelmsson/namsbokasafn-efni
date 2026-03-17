/**
 * Migration 027: Recover terminology_terms scrambled by buggy migration 026
 *
 * The original migration 026 used INSERT INTO ... SELECT * with mismatched
 * column order, causing all column values to shift positions.
 *
 * Handles mixed tables: rows scrambled by migration 026 (english contains
 * numeric book_id) and rows inserted correctly afterward (english contains
 * actual term text). Uses two-pass INSERT to handle each type separately.
 */

module.exports = {
  id: '027-recover-scrambled-terms',

  up(db) {
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='terminology_terms'")
      .get();

    if (!tableInfo) {
      return;
    }

    // Detect scrambled state by checking column order
    const cols = db.prepare('PRAGMA table_info(terminology_terms)').all();
    const col1 = cols.find((c) => c.cid === 1);

    if (!col1 || col1.name !== 'english') {
      console.log('Migration 027: terminology_terms column order is correct, skipping');
      return;
    }

    console.log('Migration 027: Detected scrambled column order, recovering...');

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

    // Scrambled rows: english contains old book_id (pure digits)
    // Correct rows: english contains actual terms (has letters)
    const isNumeric = "english GLOB '[0-9]*' AND english NOT GLOB '*[a-zA-Z]*'";

    // Pass 1: Scrambled rows — reverse column mapping
    db.prepare(
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
    ).run();

    // Pass 2: Correct rows — copy as-is
    db.prepare(
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
    ).run();

    // Verify row counts match
    const oldCount = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
    const newCount = db.prepare('SELECT COUNT(*) as c FROM terminology_terms_recovered').get();

    if (oldCount.c !== newCount.c) {
      db.exec('DROP TABLE terminology_terms_recovered');
      throw new Error(
        `Recovery row count mismatch: ${newCount.c} recovered vs ${oldCount.c} original`
      );
    }

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

    const total = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
    console.log(`Migration 027: Recovered ${total.c} terms successfully`);
  },
};
