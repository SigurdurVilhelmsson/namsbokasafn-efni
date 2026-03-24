/**
 * Migration: Add Chapter Generated Files Table
 *
 * Adds table to track permanently stored generated files per chapter.
 * Replaces ephemeral session-based storage with permanent storage.
 *
 * Files are stored in the 02-for-mt/ directory structure and tracked
 * in the database for easy access and regeneration management.
 */

module.exports = {
  name: '007-chapter-files',

  up(db) {
    // Create chapter_generated_files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_generated_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug TEXT NOT NULL,
        chapter_num INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        file_hash TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        generated_by TEXT,
        superseded_at DATETIME DEFAULT NULL,
        source_modules TEXT,
        metadata TEXT DEFAULT '{}',
        UNIQUE(book_slug, chapter_num, file_type, superseded_at)
      );

      CREATE INDEX IF NOT EXISTS idx_chapter_files_book_chapter
        ON chapter_generated_files(book_slug, chapter_num);
      CREATE INDEX IF NOT EXISTS idx_chapter_files_type
        ON chapter_generated_files(file_type);
      CREATE INDEX IF NOT EXISTS idx_chapter_files_current
        ON chapter_generated_files(superseded_at) WHERE superseded_at IS NULL;
    `);

    // Create chapter_generation_log table for tracking generation history
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_generation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug TEXT NOT NULL,
        chapter_num INTEGER NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        details TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_generation_log_book_chapter
        ON chapter_generation_log(book_slug, chapter_num);
      CREATE INDEX IF NOT EXISTS idx_generation_log_created
        ON chapter_generation_log(created_at);
    `);
  },
};
