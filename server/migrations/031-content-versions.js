/**
 * Migration 031: Content versions table
 *
 * Stores per-segment content snapshots taken before applyApprovedEdits
 * overwrites the faithful translation file. Enables rollback to any
 * previous version without git knowledge.
 */

function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(book, module_id, segment_id, version)
    );

    CREATE INDEX IF NOT EXISTS idx_content_versions_module
      ON content_versions(book, module_id);
    CREATE INDEX IF NOT EXISTS idx_content_versions_segment
      ON content_versions(book, module_id, segment_id);
  `);
}

module.exports = { name: '031-content-versions', up };
