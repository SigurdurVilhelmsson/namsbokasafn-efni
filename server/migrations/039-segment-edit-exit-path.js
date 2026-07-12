/**
 * Migration 039: segment_edits exit path — partial unique index + 'superseded'.
 *
 * The 008 table-level UNIQUE(book, module_id, segment_id, status, editor_id)
 * made every repeat transition into an occupied status collide with a raw
 * SQLite error (re-discuss was live-reproduced; re-reject/re-approve/unapprove
 * and the apply-time supersede hit the same wall). The only load-bearing
 * invariant is one PENDING edit per (book, module, segment, editor) — keep
 * exactly that as a partial unique index. 'superseded' joins the status
 * vocabulary so a stale discuss/rejected row can be resolved by a newer save
 * without deleting history.
 *
 * SQLite cannot alter constraints → table rebuild (pattern: migration 026).
 * Explicit column mapping in the copy INSERT — never SELECT * (026 lesson).
 * Idempotent: guarded on the old UNIQUE still being present in sqlite_master
 * (belt-and-braces on top of the runner's applied-migrations tracking).
 */

module.exports = {
  name: '039-segment-edit-exit-path',

  up(db) {
    const tableInfo = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get();

    if (!tableInfo) return;
    if (!tableInfo.sql.includes('UNIQUE(book, module_id, segment_id, status, editor_id)')) {
      return; // already rebuilt
    }

    db.exec(`
      CREATE TABLE segment_edits_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT CHECK(category IN (
          'terminology', 'accuracy', 'readability', 'style', 'omission'
        )),
        editor_note TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected', 'discuss', 'superseded'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        applied_at DATETIME,
        review_id INTEGER REFERENCES module_reviews(id)
      );

      INSERT INTO segment_edits_new (
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      )
      SELECT
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      FROM segment_edits;

      DROP TABLE segment_edits;

      ALTER TABLE segment_edits_new RENAME TO segment_edits;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_edits_one_pending
        ON segment_edits(book, module_id, segment_id, editor_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_segment_edits_module
        ON segment_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_status
        ON segment_edits(status);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_editor
        ON segment_edits(editor_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_segment
        ON segment_edits(module_id, segment_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_applied
        ON segment_edits(module_id, status, applied_at);
    `);
  },
};
