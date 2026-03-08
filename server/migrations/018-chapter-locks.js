/**
 * Migration 018: Chapter locks
 *
 * Advisory lock table for chapter-level editing coordination.
 * Prevents concurrent edits to the same chapter by different users.
 */

module.exports = {
  name: '018-chapter-locks',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_locks (
        chapter_id TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );
    `);
  },

  down(db) {
    db.exec('DROP TABLE IF EXISTS chapter_locks;');
  },
};
