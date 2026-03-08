/**
 * Migration 017: Chapter pipeline status
 *
 * Unified pipeline status tracking table. Replaces per-chapter status.json
 * files with a database-backed status layer.
 */

module.exports = {
  name: '017-pipeline-status',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chapter_pipeline_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_slug TEXT NOT NULL,
        chapter_num INTEGER NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_started',
        completed_at DATETIME,
        completed_by TEXT,
        notes TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_slug, chapter_num, stage)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_status_book_chapter
        ON chapter_pipeline_status(book_slug, chapter_num);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pipeline_status_stage
        ON chapter_pipeline_status(stage);
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_pipeline_status_timestamp
        AFTER UPDATE ON chapter_pipeline_status
        BEGIN
          UPDATE chapter_pipeline_status SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
    `);
  },

  down(db) {
    db.exec('DROP TRIGGER IF EXISTS update_pipeline_status_timestamp;');
    db.exec('DROP TABLE IF EXISTS chapter_pipeline_status;');
  },
};
