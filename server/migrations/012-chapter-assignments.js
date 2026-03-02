/**
 * Migration 012: Chapter task assignments
 *
 * Tracks which user is assigned to work on a specific chapter/stage.
 * Different from user_chapter_assignments (010) which controls ACCESS;
 * this table tracks WORK assignments with due dates and notes.
 */

module.exports = {
  name: '012-chapter-assignments',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        stage TEXT NOT NULL,
        assigned_to INTEGER NOT NULL REFERENCES users(id),
        assigned_by INTEGER NOT NULL REFERENCES users(id),
        due_date TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chapter_assignments_book_chapter
        ON chapter_assignments(book, chapter);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chapter_assignments_assigned_to
        ON chapter_assignments(assigned_to, status);
    `);
  },

  down(db) {
    db.exec(`DROP TABLE IF EXISTS chapter_assignments;`);
  },
};
