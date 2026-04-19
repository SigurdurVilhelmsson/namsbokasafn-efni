/**
 * Migration: Add Editor Tables
 *
 * Adds tables to support the web-based markdown editor:
 * - edit_history: Version history for edited files
 * - pending_reviews: Review queue for submitted edits
 */

module.exports = {
  name: '002-editor-tables',

  up(db) {
    // Create edit_history table
    db.exec(`
      CREATE TABLE IF NOT EXISTS edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        section TEXT NOT NULL,
        content TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_submission INTEGER DEFAULT 0,
        file_path TEXT,
        content_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_edit_history_book_chapter_section
        ON edit_history(book, chapter, section);
      CREATE INDEX IF NOT EXISTS idx_edit_history_user_id
        ON edit_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_edit_history_created_at
        ON edit_history(created_at);
    `);

    // Create pending_reviews table
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        section TEXT NOT NULL,
        edit_history_id INTEGER NOT NULL,
        submitted_by TEXT NOT NULL,
        submitted_by_username TEXT NOT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_by_username TEXT,
        reviewed_at DATETIME,
        review_notes TEXT,
        commit_sha TEXT,
        FOREIGN KEY (edit_history_id) REFERENCES edit_history(id)
      );

      CREATE INDEX IF NOT EXISTS idx_pending_reviews_status
        ON pending_reviews(status);
      CREATE INDEX IF NOT EXISTS idx_pending_reviews_book_chapter
        ON pending_reviews(book, chapter);
      CREATE INDEX IF NOT EXISTS idx_pending_reviews_submitted_by
        ON pending_reviews(submitted_by);
    `);
  },
};
