/**
 * Migration 021: Drop dead tables
 *
 * Removes legacy tables that have no active consumers:
 * - edit_history (migration 002) — replaced by segment_edits (migration 008)
 * - pending_reviews (migration 002) — replaced by module_reviews (migration 008)
 *
 * These tables were part of the original markdown editor system (editorHistory.js)
 * which has been archived in favour of the segment editor.
 */

module.exports = {
  name: '021-drop-dead-tables',

  up(db) {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('edit_history', 'pending_reviews')"
      )
      .all();

    if (tables.length === 0) {
      console.log('Migration 021: tables already dropped or never existed');
      return;
    }

    db.exec(`
      DROP TABLE IF EXISTS pending_reviews;
      DROP TABLE IF EXISTS edit_history;
    `);

    console.log(`Migration 021: dropped ${tables.map((t) => t.name).join(', ')}`);
  },
};
