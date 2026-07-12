/**
 * Canonical segment_edits schema for test fixtures — POST-migration-039 shape.
 *
 * Keep in lockstep with server/migrations/039-segment-edit-exit-path.js
 * (same columns, same CHECK, same indexes). The pre-039 fixtures hand-rolled
 * this DDL and silently omitted the table-level UNIQUE constraint — which is
 * exactly why the transition-collision bug class (stranded discuss/rejected
 * rows) never showed in the suite. Fixtures must enforce what production
 * enforces.
 */
function createSegmentEditsSchema(db) {
  db.exec(`
    CREATE TABLE segment_edits (
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
      -- No REFERENCES module_reviews(id): most fixtures don't create
      -- module_reviews, and better-sqlite3 leaves foreign_keys off, so the
      -- reference is inert in tests anyway — a simplification, not drift.
      review_id INTEGER
    );

    CREATE UNIQUE INDEX idx_segment_edits_one_pending
      ON segment_edits(book, module_id, segment_id, editor_id)
      WHERE status = 'pending';
    CREATE INDEX idx_segment_edits_module ON segment_edits(book, module_id);
    CREATE INDEX idx_segment_edits_status ON segment_edits(status);
    CREATE INDEX idx_segment_edits_editor ON segment_edits(editor_id);
    CREATE INDEX idx_segment_edits_segment ON segment_edits(module_id, segment_id);
    CREATE INDEX idx_segment_edits_applied ON segment_edits(module_id, status, applied_at);
    CREATE INDEX idx_segment_edits_review ON segment_edits(review_id);
  `);
}

module.exports = { createSegmentEditsSchema };
