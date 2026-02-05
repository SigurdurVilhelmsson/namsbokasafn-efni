/**
 * Migration 008: Segment-level editing and review tables
 *
 * Adds tables for tracking edits and reviews at the individual
 * segment level (<!-- SEG:xxx --> blocks in segment files).
 *
 * This supports the linguistic editor workflow where editors
 * suggest changes per segment and head editors approve/reject.
 */

module.exports = {
  name: '008-segment-editing',

  up(db) {
    // Segment edits: individual segment changes made by editors
    db.exec(`
      CREATE TABLE IF NOT EXISTS segment_edits (
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
          'pending', 'approved', 'rejected', 'discuss'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        UNIQUE(book, module_id, segment_id, status, editor_id)
      );

      CREATE INDEX IF NOT EXISTS idx_segment_edits_module
        ON segment_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_status
        ON segment_edits(status);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_editor
        ON segment_edits(editor_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_segment
        ON segment_edits(module_id, segment_id);
    `);

    // Module review sessions: track when a module is submitted for review
    db.exec(`
      CREATE TABLE IF NOT EXISTS module_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        submitted_by_username TEXT NOT NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'in_review', 'approved', 'changes_requested'
        )),
        reviewed_by TEXT,
        reviewed_by_username TEXT,
        reviewed_at DATETIME,
        review_notes TEXT,
        total_segments INTEGER DEFAULT 0,
        edited_segments INTEGER DEFAULT 0,
        approved_segments INTEGER DEFAULT 0,
        rejected_segments INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_module_reviews_status
        ON module_reviews(status);
      CREATE INDEX IF NOT EXISTS idx_module_reviews_book_module
        ON module_reviews(book, module_id);
    `);

    // Discussion threads on individual segments
    db.exec(`
      CREATE TABLE IF NOT EXISTS segment_discussions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        segment_edit_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (segment_edit_id) REFERENCES segment_edits(id)
      );

      CREATE INDEX IF NOT EXISTS idx_segment_discussions_edit
        ON segment_discussions(segment_edit_id);
    `);
  },

  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS segment_discussions;
      DROP TABLE IF EXISTS module_reviews;
      DROP TABLE IF EXISTS segment_edits;
    `);
  },
};
