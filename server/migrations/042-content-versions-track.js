/**
 * Migration 042: content_versions — track discriminator (item 15, rem-2.2).
 *
 * Unit 1 (031) built version snapshots for faithful content only; the table
 * had no track column, so localized (Pass-2) snapshots would interleave with
 * faithful ones under a single version counter. Adds
 * track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful','localized'))
 * and widens the UNIQUE constraint to include it.
 *
 * SQLite cannot alter a UNIQUE constraint → table rebuild inside one
 * db.transaction() (pattern: migration 041 — a crash rolls back to the intact
 * pre-042 table). Existing rows copy through as track='faithful' via the
 * column default. Idempotent: guarded on 'track' being absent from the
 * current table SQL.
 */

module.exports = {
  name: '042-content-versions-track',

  up(db) {
    const tableInfo = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='content_versions'`)
      .get();

    if (!tableInfo) return;
    if (tableInfo.sql.includes("'localized'")) return; // already rebuilt

    const rebuild = db.transaction(() => {
      db.exec(`
      DROP TABLE IF EXISTS content_versions_new;

      CREATE TABLE content_versions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        track TEXT NOT NULL DEFAULT 'faithful' CHECK(track IN ('faithful', 'localized')),
        applied_by TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(book, track, module_id, segment_id, version)
      );

      INSERT INTO content_versions_new (
        id, book, chapter, module_id, segment_id, content, version, applied_by, applied_at
      )
      SELECT
        id, book, chapter, module_id, segment_id, content, version, applied_by, applied_at
      FROM content_versions;

      DROP TABLE content_versions;

      ALTER TABLE content_versions_new RENAME TO content_versions;

      CREATE INDEX IF NOT EXISTS idx_content_versions_module
        ON content_versions(book, track, module_id);
      CREATE INDEX IF NOT EXISTS idx_content_versions_segment
        ON content_versions(book, track, module_id, segment_id);
    `);
    });
    rebuild();
  },
};
