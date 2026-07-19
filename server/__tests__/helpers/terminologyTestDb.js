/**
 * Shared in-memory terminology schema for unit tests.
 * Hand-maintained copy of migration 032's tables (+ registered_books /
 * book_subject_mapping seed) — keep in sync with the real migrations.
 * Extracted from terminologyService.test.js in item 19 so the route harness
 * doesn't become a third hand-copied DDL.
 */
// Plain CJS so both ESM vitest files can load it via their createRequire.
const Database = require('better-sqlite3');

function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  testDb.exec(`
    CREATE TABLE registered_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title_is TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE terminology_headwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english TEXT NOT NULL,
      pos TEXT,
      definition_en TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(english, pos)
    );

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

    CREATE TABLE terminology_translation_subjects (
      translation_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      PRIMARY KEY (translation_id, subject),
      FOREIGN KEY (translation_id) REFERENCES terminology_translations(id) ON DELETE CASCADE
    );

    CREATE TABLE book_subject_mapping (
      book_id INTEGER NOT NULL,
      primary_subject TEXT NOT NULL,
      PRIMARY KEY (book_id),
      FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
    );

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

    INSERT INTO registered_books (slug, title_is) VALUES ('efnafraedi-2e', 'Efnafræði 2e');
    INSERT INTO registered_books (slug, title_is) VALUES ('liffraedi-2e', 'Líffræði 2e');

    INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (1, 'chemistry');
    INSERT INTO book_subject_mapping (book_id, primary_subject) VALUES (2, 'biology');
  `);

  return testDb;
}

module.exports = { createTestDb };
