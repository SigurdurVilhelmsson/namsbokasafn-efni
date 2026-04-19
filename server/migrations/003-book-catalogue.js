/**
 * Migration: Add Book Catalogue and Translation Management Tables
 *
 * Adds tables to support the book-centric translation management system:
 * - openstax_catalogue: Available OpenStax books
 * - registered_books: Books registered for translation
 * - book_chapters: Chapters within registered books
 * - book_sections: Sections (atomic translation units)
 * - localization_logs: Change logs for localization pass
 */

module.exports = {
  name: '003-book-catalogue',

  up(db) {
    // Create openstax_catalogue table
    db.exec(`
      CREATE TABLE IF NOT EXISTS openstax_catalogue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        repo_url TEXT,
        chapter_count INTEGER DEFAULT 0,
        has_appendices INTEGER DEFAULT 0,
        last_synced DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_openstax_catalogue_slug
        ON openstax_catalogue(slug);
    `);

    // Create registered_books table
    db.exec(`
      CREATE TABLE IF NOT EXISTS registered_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogue_id INTEGER REFERENCES openstax_catalogue(id),
        slug TEXT UNIQUE NOT NULL,
        title_is TEXT NOT NULL,
        registered_by TEXT NOT NULL,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (catalogue_id) REFERENCES openstax_catalogue(id)
      );

      CREATE INDEX IF NOT EXISTS idx_registered_books_slug
        ON registered_books(slug);
      CREATE INDEX IF NOT EXISTS idx_registered_books_status
        ON registered_books(status);
      CREATE INDEX IF NOT EXISTS idx_registered_books_catalogue
        ON registered_books(catalogue_id);
    `);

    // Create book_chapters table
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        chapter_num INTEGER NOT NULL,
        title_en TEXT,
        title_is TEXT,
        section_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'not_started',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES registered_books(id),
        UNIQUE(book_id, chapter_num)
      );

      CREATE INDEX IF NOT EXISTS idx_book_chapters_book
        ON book_chapters(book_id);
      CREATE INDEX IF NOT EXISTS idx_book_chapters_status
        ON book_chapters(status);
    `);

    // Create book_sections table (the main translation tracking table)
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        chapter_id INTEGER NOT NULL,
        chapter_num INTEGER NOT NULL,
        section_num TEXT NOT NULL,
        module_id TEXT,
        title_en TEXT,
        title_is TEXT,

        -- File paths (relative to books/{slug}/)
        cnxml_path TEXT,
        en_md_path TEXT,
        mt_output_path TEXT,
        faithful_path TEXT,
        localized_path TEXT,

        -- Status tracking (see plan for state machine)
        status TEXT DEFAULT 'not_started',

        -- Linguistic review assignment
        linguistic_reviewer TEXT,
        linguistic_reviewer_name TEXT,
        linguistic_assigned_at DATETIME,
        linguistic_submitted_at DATETIME,
        linguistic_approved_at DATETIME,
        linguistic_approved_by TEXT,
        linguistic_approved_by_name TEXT,

        -- Localization assignment
        localizer TEXT,
        localizer_name TEXT,
        localization_assigned_at DATETIME,
        localization_submitted_at DATETIME,
        localization_approved_at DATETIME,
        localization_approved_by TEXT,
        localization_approved_by_name TEXT,

        -- Publication tracking
        faithful_published_at DATETIME,
        localized_published_at DATETIME,
        tm_created_at DATETIME,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (book_id) REFERENCES registered_books(id),
        FOREIGN KEY (chapter_id) REFERENCES book_chapters(id),
        UNIQUE(book_id, chapter_num, section_num)
      );

      CREATE INDEX IF NOT EXISTS idx_book_sections_book
        ON book_sections(book_id);
      CREATE INDEX IF NOT EXISTS idx_book_sections_chapter
        ON book_sections(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_book_sections_status
        ON book_sections(status);
      CREATE INDEX IF NOT EXISTS idx_book_sections_reviewer
        ON book_sections(linguistic_reviewer);
      CREATE INDEX IF NOT EXISTS idx_book_sections_localizer
        ON book_sections(localizer);
      CREATE INDEX IF NOT EXISTS idx_book_sections_module
        ON book_sections(module_id);
    `);

    // Create localization_logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS localization_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        localizer TEXT NOT NULL,
        entries TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (section_id) REFERENCES book_sections(id)
      );

      CREATE INDEX IF NOT EXISTS idx_localization_logs_section
        ON localization_logs(section_id);
      CREATE INDEX IF NOT EXISTS idx_localization_logs_localizer
        ON localization_logs(localizer);
    `);

    // Create trigger to update book_sections.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_book_sections_timestamp
        AFTER UPDATE ON book_sections
        FOR EACH ROW
        BEGIN
          UPDATE book_sections SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
  },
};
