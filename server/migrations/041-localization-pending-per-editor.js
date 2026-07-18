/**
 * Migration 041: localization_pending_edits — per-editor pendings +
 * 'superseded' (item 13, finding 7).
 *
 * The 034 table kept one pending per (book, module, segment) by service-level
 * lookup only, so a second editor's submit silently overwrote the first
 * editor's pending row (content AND author). Pass-1 parity: each editor owns
 * their pending row, enforced by a partial unique index; 'superseded' joins
 * the status vocabulary so a losing pending resolves as history, not as a
 * bogus rejection.
 *
 * SQLite cannot alter a CHECK constraint → table rebuild inside one
 * db.transaction() (pattern: migration 039 — a crash at any point rolls back
 * to the intact pre-041 table). Explicit column list in the copy INSERT.
 * Idempotent: guarded on 'superseded' being absent from the current CHECK.
 * The unique index cannot fail on legacy data: pre-041 code kept at most one
 * pending per segment overall, which is strictly tighter.
 */

module.exports = {
  name: '041-localization-pending-per-editor',

  up(db) {
    const tableInfo = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='localization_pending_edits'`
      )
      .get();

    if (!tableInfo) return;
    if (tableInfo.sql.includes("'superseded'")) return; // already rebuilt

    const rebuild = db.transaction(() => {
      db.exec(`
      DROP TABLE IF EXISTS localization_pending_edits_new;

      CREATE TABLE localization_pending_edits_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected', 'superseded'
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

      INSERT INTO localization_pending_edits_new (
        id, book, chapter, module_id, segment_id, original_content,
        edited_content, category, status, editor_id, editor_username,
        reviewer_id, reviewer_username, reviewer_note, created_at,
        reviewed_at, applied_at
      )
      SELECT
        id, book, chapter, module_id, segment_id, original_content,
        edited_content, category, status, editor_id, editor_username,
        reviewer_id, reviewer_username, reviewer_note, created_at,
        reviewed_at, applied_at
      FROM localization_pending_edits;

      DROP TABLE localization_pending_edits;

      ALTER TABLE localization_pending_edits_new RENAME TO localization_pending_edits;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_loc_pending_one_per_editor
        ON localization_pending_edits(book, module_id, segment_id, editor_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_loc_pending_module
        ON localization_pending_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_status
        ON localization_pending_edits(status);
      CREATE INDEX IF NOT EXISTS idx_loc_pending_segment
        ON localization_pending_edits(book, module_id, segment_id);
    `);
    });
    rebuild();
  },
};
