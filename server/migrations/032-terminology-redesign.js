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
 */

function up(db) {
  // --- Drop old tables ---
  // Order matters: drop child tables first (FK constraints)
  db.exec(`
    DROP TABLE IF EXISTS terminology_discussions;
    DROP TABLE IF EXISTS terminology_imports;
    DROP TABLE IF EXISTS terminology_terms;
  `);

  // Drop old trigger if it exists
  db.exec(`
    DROP TRIGGER IF EXISTS update_terminology_terms_timestamp;
  `);

  // --- Create new tables ---

  // Headword: one per English term
  db.exec(`
    CREATE TABLE terminology_headwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL,
      pos TEXT,
      definition_en TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(english, pos)
    );

    CREATE INDEX idx_headwords_english
      ON terminology_headwords(english);
  `);

  // Translation: one per Icelandic rendering of a headword
  db.exec(`
    CREATE TABLE terminology_translations (
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

    CREATE INDEX idx_translations_headword
      ON terminology_translations(headword_id);
    CREATE INDEX idx_translations_status
      ON terminology_translations(status);
    CREATE INDEX idx_translations_icelandic
      ON terminology_translations(icelandic);
    CREATE INDEX idx_translations_idordabanki
      ON terminology_translations(idordabanki_id);
  `);

  // Subject tags for translations (many-to-many)
  db.exec(`
    CREATE TABLE terminology_translation_subjects (
      translation_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (translation_id, subject),
      FOREIGN KEY (translation_id) REFERENCES terminology_translations(id) ON DELETE CASCADE
    );
  `);

  // Map books to their primary subject domain
  db.exec(`
    CREATE TABLE book_subject_mapping (
      book_id INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      PRIMARY KEY (book_id),
      FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
    );
  `);

  // Discussions now reference headwords
  db.exec(`
    CREATE TABLE terminology_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headword_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      proposed_translation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_discussions_headword
      ON terminology_discussions(headword_id);
  `);

  // --- Update triggers ---
  db.exec(`
    CREATE TRIGGER update_headwords_timestamp
      AFTER UPDATE ON terminology_headwords
      FOR EACH ROW
      BEGIN
        UPDATE terminology_headwords SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

    CREATE TRIGGER update_translations_timestamp
      AFTER UPDATE ON terminology_translations
      FOR EACH ROW
      BEGIN
        UPDATE terminology_translations SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
  `);

  // --- Seed book_subject_mapping ---
  // Only insert for books that exist in registered_books
  const books = db.prepare('SELECT id, slug FROM registered_books').all();
  const subjectMap = {
    'efnafraedi-2e': 'chemistry',
    'liffraedi-2e': 'biology',
    'orverufraedi': 'microbiology',
    'lifraen-efnafraedi': 'organic-chemistry',
    'edlisfraedi-2e': 'physics',
  };

  const insertMapping = db.prepare(
    'INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (?, ?)'
  );

  for (const book of books) {
    const subject = subjectMap[book.slug];
    if (subject) {
      insertMapping.run(book.id, subject);
    }
  }
}

module.exports = { name: '032-terminology-redesign', up };
