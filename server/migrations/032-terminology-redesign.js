/**
 * Migration 032: Terminology Redesign — Multi-Subject Domains
 *
 * Replaces the flat terminology_terms table with a normalized model:
 *   terminology_headwords  — one per English term
 *   terminology_translations — one per Icelandic rendering, with inflections
 *   terminology_translation_subjects — many-to-many subject tags
 *   book_subject_mapping — maps books to their primary subject domain
 *   terminology_discussions — fresh table referencing headwords
 *
 * Clean start: drops old terminology_terms, terminology_discussions,
 * terminology_imports tables. The only existing data is one Íðorðabankinn
 * chemistry import that will be re-imported into the new schema.
 *
 * IMPORTANT: Must be idempotent — the migration runner re-runs all migrations
 * on every server restart (no applied-tracking). Uses IF NOT EXISTS / IF EXISTS
 * / OR IGNORE throughout.
 */

function up(db) {
  // --- Drop old tables (safe on re-run: IF EXISTS) ---
  db.exec(`
    DROP TABLE IF EXISTS terminology_imports;
    DROP TABLE IF EXISTS terminology_terms;
    DROP TRIGGER IF EXISTS update_terminology_terms_timestamp;
  `);

  // --- Create new tables (safe on re-run: IF NOT EXISTS) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS terminology_headwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL,
      pos TEXT,
      definition_en TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(english, pos)
    );

    CREATE INDEX IF NOT EXISTS idx_headwords_english
      ON terminology_headwords(english);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS terminology_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL,
      icelandic TEXT NOT NULL,
      definition_is TEXT,
      inflections TEXT,
      source TEXT,
      idordabanki_id INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'proposed',
      proposed_by TEXT,
      proposed_by_name TEXT,
      approved_by TEXT,
      approved_by_name TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE,
      UNIQUE(headword_id, icelandic)
    );

    CREATE INDEX IF NOT EXISTS idx_translations_headword
      ON terminology_translations(headword_id);
    CREATE INDEX IF NOT EXISTS idx_translations_status
      ON terminology_translations(status);
    CREATE INDEX IF NOT EXISTS idx_translations_icelandic
      ON terminology_translations(icelandic);
    CREATE INDEX IF NOT EXISTS idx_translations_idordabanki
      ON terminology_translations(idordabanki_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS terminology_translation_subjects (
      translation_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (translation_id, subject),
      FOREIGN KEY (translation_id) REFERENCES terminology_translations(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS book_subject_mapping (
      book_id INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      PRIMARY KEY (book_id),
      FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
    );
  `);

  // Drop the OLD terminology_discussions (references term_id) and recreate
  // with the new schema (references headword_id). Only drop if it has the
  // old schema (term_id column).
  const columns = db.pragma('table_info(terminology_discussions)');
  const hasTermId = columns.some((c) => c.name === 'term_id');
  const hasHeadwordId = columns.some((c) => c.name === 'headword_id');

  if (hasTermId && !hasHeadwordId) {
    // Old schema — drop and recreate
    db.exec('DROP TABLE terminology_discussions');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS terminology_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      proposed_translation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_discussions_headword
      ON terminology_discussions(headword_id);
  `);

  // --- Triggers (safe on re-run: IF NOT EXISTS) ---
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_headwords_timestamp
      AFTER UPDATE ON terminology_headwords
      FOR EACH ROW
      BEGIN
        UPDATE terminology_headwords SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

    CREATE TRIGGER IF NOT EXISTS update_translations_timestamp
      AFTER UPDATE ON terminology_translations
      FOR EACH ROW
      BEGIN
        UPDATE terminology_translations SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
  `);

  // --- Seed book_subject_mapping (safe on re-run: INSERT OR IGNORE) ---
  const books = db.prepare('SELECT id, slug FROM registered_books').all();
  const subjectMap = {
    'efnafraedi-2e': 'chemistry',
    'liffraedi-2e': 'biology',
    orverufraedi: 'microbiology',
    'lifraen-efnafraedi': 'organic-chemistry',
    'edlisfraedi-2e': 'physics',
  };

  const insertMapping = db.prepare(
    'INSERT OR IGNORE INTO book_subject_mapping (book_id, primary_subject) VALUES (?, ?)'
  );

  for (const book of books) {
    const subject = subjectMap[book.slug];
    if (subject) {
      insertMapping.run(book.id, subject);
    }
  }
}

module.exports = { name: '032-terminology-redesign', up };
