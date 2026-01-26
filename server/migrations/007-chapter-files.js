/**
 * Migration: Add Chapter Generated Files Table
 *
 * Adds table to track permanently stored generated files per chapter.
 * Replaces ephemeral session-based storage with permanent storage.
 *
 * Files are stored in the 02-for-mt/ directory structure and tracked
 * in the database for easy access and regeneration management.
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
    // Check if migration is already applied
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_generated_files'").get();

    if (tables) {
      console.log('Migration 007-chapter-files already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding chapter generated files table...');

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
    console.log('  Created chapter_generated_files table');

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
    console.log('  Created chapter_generation_log table');

    console.log('Migration 007-chapter-files completed successfully');
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
    console.log('Rolling back migration: Removing chapter files tables...');

    db.exec(`
      DROP TABLE IF EXISTS chapter_generation_log;
      DROP TABLE IF EXISTS chapter_generated_files;
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
