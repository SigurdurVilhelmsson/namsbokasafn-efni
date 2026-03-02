/**
 * Migration 014: Add source tracking columns to registered_books
 *
 * Tracks which commit was fetched, when, and from which repo.
 * Populated by the download-source.js tool after book registration.
 */

module.exports = {
  name: '014-source-tracking',

  up(db) {
    db.exec(`ALTER TABLE registered_books ADD COLUMN source_commit_hash TEXT`);
    db.exec(`ALTER TABLE registered_books ADD COLUMN source_fetched_at DATETIME`);
    db.exec(`ALTER TABLE registered_books ADD COLUMN source_repo TEXT`);
  },

  down(_db) {
    // SQLite doesn't support DROP COLUMN easily; recreate table if needed
  },
};
