/**
 * Migration 027: Recover terminology_terms scrambled by migration 026
 *
 * Migration 026 used INSERT INTO ... SELECT * with mismatched column order,
 * causing all column values to shift. This migration detects the scrambled
 * state and rebuilds the table with correct column mapping.
 *
 * Detection: In the scrambled DB, the 'english' column contains old book_id
 * values (integers), not term strings. We check if english values are numeric.
 *
 * Recovery mapping (scrambled column → correct column):
 *   id             → id            (was correct)
 *   english        → book_id       (english held old book_id)
 *   icelandic      → english       (icelandic held old english)
 *   alternatives   → icelandic     (alternatives held old icelandic)
 *   category       → alternatives  (category held old alternatives)
 *   notes          → category      (notes held old category)
 *   source         → notes         (source held old notes)
 *   source_chapter → source        (source_chapter held old source)
 *   book_id        → source_chapter (book_id held old source_chapter)
 *   status         → status        (was correct)
 *   definition_en  → proposed_by
 *   definition_is  → proposed_by_name
 *   pos            → approved_by
 *   proposed_by    → approved_by_name
 *   proposed_by_name → approved_at
 *   approved_by    → definition_en
 *   approved_by_name → definition_is
 *   approved_at    → pos
 *   created_at     → created_at    (was correct)
 *   updated_at     → updated_at    (was correct)
 */

module.exports = {
  id: '027-recover-scrambled-terms',

  up(db) {
    const tableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='terminology_terms'")
      .get();

    if (!tableInfo) {
      return;
    }

    // Detect scrambled state: if english column contains numeric values,
    // the data was scrambled by the buggy migration 026
    const probe = db
      .prepare(
        `SELECT COUNT(*) as c FROM terminology_terms
         WHERE CAST(english AS INTEGER) > 0 AND CAST(english AS INTEGER) = english`
      )
      .get();

    if (!probe || probe.c === 0) {
      console.log('Migration 027: terminology_terms not scrambled, skipping');
      return;
    }

    console.log(`Migration 027: Detected ${probe.c} scrambled rows, recovering...`);

    // Rebuild with correct column order and unscrambled data
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

    // Reverse the column mapping: read from scrambled column, write to correct column
    db.exec(`
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
      FROM terminology_terms;

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

    // Verify recovery
    const check = db
      .prepare(
        `SELECT COUNT(*) as c FROM terminology_terms
         WHERE CAST(english AS INTEGER) > 0 AND CAST(english AS INTEGER) = english`
      )
      .get();

    if (check.c > 0) {
      throw new Error(
        `Recovery verification failed: ${check.c} rows still have numeric english values`
      );
    }

    const total = db.prepare('SELECT COUNT(*) as c FROM terminology_terms').get();
    console.log(`Migration 027: Recovered ${total.c} terms successfully`);
  },
};
