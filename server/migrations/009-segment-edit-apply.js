/**
 * Migration 009: Add applied_at tracking for segment edits
 *
 * When approved segment edits are applied (written to 03-faithful/ files),
 * the applied_at timestamp is set to prevent double-application.
 */

module.exports = {
  name: '009-segment-edit-apply',

  up(db) {
    db.exec(`
      ALTER TABLE segment_edits ADD COLUMN applied_at DATETIME;
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_segment_edits_applied
        ON segment_edits(module_id, status, applied_at);
    `);
  },

  down(db) {
    // SQLite doesn't support DROP COLUMN before 3.35.0,
    // but the column is harmless if left in place.
    db.exec(`
      DROP INDEX IF EXISTS idx_segment_edits_applied;
    `);
  },
};
