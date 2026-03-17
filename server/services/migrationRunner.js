/**
 * Migration Runner
 *
 * Runs all pending database migrations on server startup.
 * Handles both legacy migrate() pattern (001-007) and modern up(db) pattern (008+).
 * Idempotent: migrations that use CREATE IF NOT EXISTS / ALTER TABLE with
 * duplicate-column detection are safe to re-run.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

/**
 * Run all pending migrations.
 * Called automatically on server startup.
 *
 * @returns {{ applied: number, skipped: number, errors: string[] }}
 */
function runAllMigrations() {
  if (!fs.existsSync(DB_PATH)) {
    // DB created by sessionCore.js on first request — nothing to migrate yet
    return { applied: 0, skipped: 0, errors: [] };
  }

  const migrations = [
    require('../migrations/001-add-error-recovery'),
    require('../migrations/002-editor-tables'),
    require('../migrations/003-book-catalogue'),
    require('../migrations/004-terminology'),
    require('../migrations/005-feedback'),
    require('../migrations/006-user-management'),
    require('../migrations/007-chapter-files'),
    require('../migrations/008-segment-editing'),
    require('../migrations/009-segment-edit-apply'),
    require('../migrations/010-chapter-assignments'),
    require('../migrations/011-localization-edits'),
    require('../migrations/012-chapter-assignments'),
    require('../migrations/013-catalogue-subject'),
    require('../migrations/014-source-tracking'),
    require('../migrations/015-rename-book-slugs'),
    require('../migrations/016-cleanup-book-slugs'),
    require('../migrations/017-pipeline-status'),
    require('../migrations/018-chapter-locks'),
    require('../migrations/019-register-new-books'),
    require('../migrations/020-glossary-definitions'),
    require('../migrations/021-drop-dead-tables'),
    require('../migrations/022-provider-auth'),
    require('../migrations/023-merge-contributor-role'),
    require('../migrations/024-fix-discussions-fk'),
    require('../migrations/025-approve-efnafelag-terms'),
    require('../migrations/026-nullable-icelandic'),
    require('../migrations/027-recover-scrambled-terms'),
  ];

  let applied = 0;
  let skipped = 0;
  const errors = [];
  let db;

  for (const migration of migrations) {
    if (typeof migration.migrate === 'function') {
      // Legacy pattern (001-007): self-contained with own DB connection
      const result = migration.migrate();
      if (result && result.alreadyApplied) {
        skipped++;
      } else if (result && result.success) {
        applied++;
      } else if (result && !result.success && !result.skipped) {
        errors.push(`${migration.name || 'unknown'}: ${result.error}`);
      }
    } else if (typeof migration.up === 'function') {
      // Modern pattern (008+): expects a DB instance
      try {
        if (!db) {
          db = new Database(DB_PATH);
        }
        migration.up(db);
        applied++;
      } catch (err) {
        if (err.message && err.message.includes('duplicate column')) {
          skipped++;
        } else if (err.message && err.message.includes('already exists')) {
          skipped++;
        } else {
          errors.push(`${migration.name || 'unknown'}: ${err.message}`);
        }
      }
    }
  }

  if (db) {
    db.close();
  }

  return { applied, skipped, errors };
}

module.exports = { runAllMigrations };
