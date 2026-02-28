/**
 * Migration 011: Add localization_edits table for audit trail
 *
 * Logs every localization edit (Pass 2) with who/when/what history.
 * Write-only audit log — no review workflow needed.
 */

module.exports = {
  name: '011-localization-edits',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS localization_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        previous_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        category TEXT CHECK(category IN (
          'unit-conversion', 'cultural-adaptation', 'example-replacement',
          'formatting', 'unchanged'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_loc_edits_module
        ON localization_edits(book, module_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_loc_edits_segment
        ON localization_edits(module_id, segment_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS localization_edits;
    `);
  },
};
