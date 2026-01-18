/**
 * Migration: Add Editor Tables
 *
 * Adds tables to support the web-based markdown editor:
 * - edit_history: Version history for edited files
 * - pending_reviews: Review queue for submitted edits
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

function migrate() {
  // Ensure database directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  try {
    // Check if migration is already applied by looking for edit_history table
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='edit_history'").get();

    if (tables) {
      console.log('Migration 002-editor-tables already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding editor tables...');

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
    console.log('  Created edit_history table');

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
    console.log('  Created pending_reviews table');

    console.log('Migration 002-editor-tables completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Migration failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

function rollback() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database does not exist, nothing to rollback');
    return { success: true };
  }

  const db = new Database(DB_PATH);

  try {
    console.log('Rolling back migration: Removing editor tables...');

    db.exec(`
      DROP TABLE IF EXISTS pending_reviews;
      DROP TABLE IF EXISTS edit_history;
    `);

    console.log('Rollback completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Rollback failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--rollback')) {
    rollback();
  } else {
    migrate();
  }
}

module.exports = { migrate, rollback };
