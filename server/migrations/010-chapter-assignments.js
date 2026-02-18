/**
 * Migration 010: Add chapter assignments for per-chapter access control
 *
 * Allows admins to assign specific chapters to contributors/editors.
 * Backward compat: if a user has NO chapter assignments for a book,
 * they can access all chapters in that book.
 */

module.exports = {
  name: '010-chapter-assignments',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_chapter_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_slug TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        assigned_by TEXT,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, book_slug, chapter)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chapter_assignments_user_book
        ON user_chapter_assignments(user_id, book_slug);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS user_chapter_assignments;
    `);
  },
};
