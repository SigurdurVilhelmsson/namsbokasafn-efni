/**
 * Migration: Add Error Recovery Columns
 *
 * Adds columns to the sessions table to support error recovery:
 * - error_log: JSON array of error events
 * - last_good_state: Snapshot of session at last successful step
 * - files_manifest: Files created during current step (for cleanup)
 * - retry_count: Number of retry attempts on current step
 * - failed_at: Timestamp when session entered failed state
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

function migrate() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database does not exist, skipping migration (will be created with new schema)');
    return { success: true, skipped: true };
  }

  const db = new Database(DB_PATH);

  try {
    // Check if migration is already applied by looking for error_log column
    const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
    const columnNames = tableInfo.map(col => col.name);

    if (columnNames.includes('error_log')) {
      console.log('Migration already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding error recovery columns...');

    // Add new columns with defaults
    db.exec(`
      ALTER TABLE sessions ADD COLUMN error_log TEXT NOT NULL DEFAULT '[]';
    `);
    console.log('  Added error_log column');

    db.exec(`
      ALTER TABLE sessions ADD COLUMN last_good_state TEXT DEFAULT NULL;
    `);
    console.log('  Added last_good_state column');

    db.exec(`
      ALTER TABLE sessions ADD COLUMN files_manifest TEXT NOT NULL DEFAULT '[]';
    `);
    console.log('  Added files_manifest column');

    db.exec(`
      ALTER TABLE sessions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    `);
    console.log('  Added retry_count column');

    db.exec(`
      ALTER TABLE sessions ADD COLUMN failed_at TEXT DEFAULT NULL;
    `);
    console.log('  Added failed_at column');

    console.log('Migration completed successfully');
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
    // SQLite doesn't support DROP COLUMN directly in older versions
    // We need to recreate the table without the new columns
    console.log('Rolling back migration: Removing error recovery columns...');

    db.exec(`
      BEGIN TRANSACTION;

      -- Create new table without the error recovery columns
      CREATE TABLE sessions_backup (
        id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        modules TEXT NOT NULL,
        source_type TEXT NOT NULL,
        user_id TEXT,
        username TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        current_step INTEGER NOT NULL DEFAULT 0,
        steps TEXT NOT NULL,
        files TEXT NOT NULL DEFAULT '{}',
        expected_files TEXT NOT NULL DEFAULT '{}',
        uploaded_files TEXT NOT NULL DEFAULT '{}',
        issues TEXT NOT NULL DEFAULT '[]',
        output_dir TEXT NOT NULL,
        cancel_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        cancelled_at TEXT,
        expires_at TEXT NOT NULL
      );

      -- Copy data from old table
      INSERT INTO sessions_backup SELECT
        id, book, chapter, modules, source_type, user_id, username,
        status, current_step, steps, files, expected_files, uploaded_files,
        issues, output_dir, cancel_reason, created_at, updated_at,
        completed_at, cancelled_at, expires_at
      FROM sessions;

      -- Drop old table and rename backup
      DROP TABLE sessions;
      ALTER TABLE sessions_backup RENAME TO sessions;

      -- Recreate indexes
      CREATE INDEX idx_sessions_book_chapter ON sessions(book, chapter);
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_status ON sessions(status);
      CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

      COMMIT;
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
