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

module.exports = {
  name: '001-add-error-recovery',

  up(db) {
    // Check if migration is already applied by looking for error_log column
    const tableInfo = db.prepare('PRAGMA table_info(sessions)').all();
    const columnNames = tableInfo.map((col) => col.name);

    if (columnNames.includes('error_log')) {
      return; // Already applied — runner counts as "applied"
    }

    // Add new columns with defaults
    db.exec(`
      ALTER TABLE sessions ADD COLUMN error_log TEXT NOT NULL DEFAULT '[]';
    `);

    db.exec(`
      ALTER TABLE sessions ADD COLUMN last_good_state TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE sessions ADD COLUMN files_manifest TEXT NOT NULL DEFAULT '[]';
    `);

    db.exec(`
      ALTER TABLE sessions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
    `);

    db.exec(`
      ALTER TABLE sessions ADD COLUMN failed_at TEXT DEFAULT NULL;
    `);
  },
};
