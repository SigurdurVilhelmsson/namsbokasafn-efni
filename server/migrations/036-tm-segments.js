/**
 * Migration 036: Concordance index (tm_segments)
 *
 * A searchable index of applied EN↔IS faithful segment pairs, populated on
 * apply (and via a backfill CLI). Powers:
 *   - concordance search ("how did we translate this before?") and
 *   - exact-match review deduplication (a human-approved translation of the
 *     same EN sentence elsewhere outranks the MT draft).
 *
 * `tm_segments` holds the canonical rows; `tm_segments_fts` is an FTS5
 * external-content mirror used only for full-text search. `en_norm` is the
 * normalized EN (lowercased, markers stripped, whitespace collapsed) used for
 * exact-match lookups.
 *
 * All statements are idempotent (the runner re-runs every boot).
 */

module.exports = {
  name: '036-tm-segments',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tm_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        en_text TEXT NOT NULL,
        is_text TEXT NOT NULL,
        en_norm TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book, module_id, segment_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tm_segments_norm ON tm_segments(en_norm);
      CREATE INDEX IF NOT EXISTS idx_tm_segments_module ON tm_segments(book, module_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS tm_segments_fts USING fts5(
        en_text,
        is_text,
        content='tm_segments',
        content_rowid='id'
      );
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS tm_segments_fts;
      DROP TABLE IF EXISTS tm_segments;
    `);
  },
};
