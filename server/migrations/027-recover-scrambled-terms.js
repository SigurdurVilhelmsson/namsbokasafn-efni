/**
 * Migration 027: Recover terminology_terms scrambled by buggy migration 026
 *
 * The original migration 026 used INSERT INTO ... SELECT * with mismatched
 * column order, causing all column values to shift positions.
 *
 * Detection: Uses PRAGMA table_info to check if the second column (cid=1)
 * is 'english' (scrambled) vs 'book_id' (correct).
 *
 * Recovery: Reads from the scrambled column positions and writes to the
 * correct columns in a new table, then swaps.
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

    // Detect scrambled state by checking column order.
    // Correct order: id(0), book_id(1), english(2), ...
    // Scrambled order: id(0), english(1), icelandic(2), ...
    const cols = db.prepare('PRAGMA table_info(terminology_terms)').all();
    const col1 = cols.find((c) => c.cid === 1);

    if (!col1 || col1.name !== 'english') {
      console.log('Migration 027: terminology_terms column order is correct, skipping');
      return;
    }

    console.log('Migration 027: Detected scrambled column order, recovering...');

    // Clean up any leftover table from a previous failed run
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

    // Reverse the column mapping:
    //   Current column → actually contains old column's data
    //   english        → book_id
    //   icelandic      → english
    //   alternatives   → icelandic
    //   category       → alternatives
    //   notes          → category
    //   source         → notes
    //   source_chapter → source
    //   book_id        → source_chapter
    //   definition_en  → proposed_by
    //   definition_is  → proposed_by_name
    //   pos            → approved_by
    //   proposed_by    → approved_by_name
    //   proposed_by_name → approved_at
    //   approved_by    → definition_en
    //   approved_by_name → definition_is
    //   approved_at    → pos
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
    `
    ).run();

    // Verify recovery before dropping old table
    const check = db
      .prepare(
        `SELECT COUNT(*) as c FROM terminology_terms_recovered
         WHERE typeof(english) = 'text' AND LENGTH(english) > 0`
      )
      .get();

    const total = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();

    if (check.c !== total.c) {
      // Recovery didn't preserve all rows — abort
      db.exec('DROP TABLE terminology_terms_recovered');
      throw new Error(`Recovery verification failed: ${check.c} valid rows vs ${total.c} total`);
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

    const recovered = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
    console.log(`Migration 027: Recovered ${recovered.c} terms successfully`);
  },
};
