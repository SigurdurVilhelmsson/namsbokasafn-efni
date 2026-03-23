/**
 * Migration 030: Remove legacy tables
 *
 * Drops tables that have been superseded by newer implementations:
 * - edit_history → superseded by segment_edits (migration 008)
 * - pending_reviews → superseded by module_reviews (migration 008)
 *
 * Note: localization_logs is kept — still used by localizationSuggestions.js
 * Note: chapter_pipeline_status is kept — still used for status tracking
 */

function up(db) {
  db.exec(`
    DROP TABLE IF EXISTS edit_history;
    DROP TABLE IF EXISTS pending_reviews;
  `);
}

module.exports = { up };
