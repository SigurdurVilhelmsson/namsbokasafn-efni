/**
 * Canonical segment_edits schema for test fixtures — POST-migration-039 shape,
 * plus the columns migration 053 (053-served-text-versions.js) adds.
 *
 * Keep in lockstep with server/migrations/039-segment-edit-exit-path.js
 * (same columns, same CHECK, same indexes) and every later migration that adds
 * a column; segmentEditsSchemaDrift.test.js fails when a column, its type, its
 * NOT NULL or its key drifts from the migrated table. The pre-039 fixtures hand-rolled
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
      -- No REFERENCES on review_id or served_version_id: most fixtures create
      -- neither module_reviews nor served_text_versions, and with foreign keys
      -- ON a reference to a missing table makes any non-NULL insert fail with
      -- "no such table". The drift guard (segmentEditsSchemaDrift.test.js)
      -- compares name, type, NOT NULL and key, which a REFERENCES clause does
      -- not change.
      review_id INTEGER,
      served_version_id INTEGER,
      occurrence INTEGER,
      origin TEXT,
      displayed_edit_id INTEGER,
      displayed_edit_sha256 TEXT
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

/**
 * segment_discussions, as migration 008 creates it (008-segment-editing.js). A fixture
 * whose code path deletes or withdraws an edit needs it: since §C210 those paths read it
 * to refuse deleting an edit that carries a discussion thread.
 */
function createSegmentDiscussionsSchema(db) {
  db.exec(`
    CREATE TABLE segment_discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_edit_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (segment_edit_id) REFERENCES segment_edits(id)
    );
  `);
}

module.exports = { createSegmentEditsSchema, createSegmentDiscussionsSchema };
