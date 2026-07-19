/**
 * Migration 043: segment_acceptances — per-segment MT-acceptance record
 * ("Staðfesta vélþýðingu", campaign item 20b).
 *
 * An acceptance attests that a human read a segment's IS draft and confirmed
 * SPECIFIC bytes (accepted_content). One ACTIVE acceptance per segment —
 * the partial unique index makes it a segment-level fact, unlike
 * segment_edits' per-editor pending index. Revoked/superseded rows are kept
 * (status flip, never DELETE): the history is provenance.
 *
 * chapter uses the item-14 chapterLabel contract: -1 = appendices.
 * Sibling-table pattern (034/041 precedent); idempotent via IF NOT EXISTS.
 */

module.exports = {
  name: '043-segment-acceptances',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS segment_acceptances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        accepted_content TEXT NOT NULL,
        accepted_by TEXT NOT NULL,
        accepted_by_username TEXT NOT NULL,
        accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
        superseded_at DATETIME,
        superseded_reason TEXT,
        applied_at DATETIME
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_acceptances_one_active
        ON segment_acceptances(book, module_id, segment_id) WHERE status = 'active';

      CREATE INDEX IF NOT EXISTS idx_segment_acceptances_module
        ON segment_acceptances(book, module_id);
    `);
  },
};
