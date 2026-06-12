/**
 * Migration 034: Localization (Pass 2) review tier
 *
 * Brings the student-facing localized asset up to Pass 1's checks-and-balances:
 * a submit → approve/reject workflow so localized content gets a second pair of
 * eyes before it overwrites 04-localized-content/.
 *
 *   - localization_pending_edits: segment-level proposed edits with review state.
 *   - book_settings: per-book toggles. `enforce_localization_review` gates the
 *     new flow (OFF by default, so existing books keep saving directly).
 *
 * Both are CREATE IF NOT EXISTS so the migration is idempotent.
 */

module.exports = {
  name: '034-localization-review',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS localization_pending_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        applied_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_loc_pending_module
        ON localization_pending_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_status
        ON localization_pending_edits(status);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_segment
        ON localization_pending_edits(book, module_id, segment_id);

      CREATE TABLE IF NOT EXISTS book_settings (
        book TEXT PRIMARY KEY,
        enforce_localization_review INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS localization_pending_edits;
      DROP TABLE IF EXISTS book_settings;
    `);
  },
};
