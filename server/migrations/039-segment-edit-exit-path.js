/**
 * Migration 039: segment_edits exit path — partial unique index + 'superseded'.
 *
 * The 008 table-level UNIQUE(book, module_id, segment_id, status, editor_id)
 * made every repeat transition into an occupied status collide with a raw
 * SQLite error (re-discuss was live-reproduced; re-reject/re-approve/unapprove
 * and the apply-time supersede hit the same wall). The only load-bearing
 * invariant is one PENDING edit per (book, module, segment, editor) — keep
 * exactly that as a partial unique index. 'superseded' joins the status
 * vocabulary so a stale discuss/rejected row can be resolved by a newer save
 * without deleting history.
 *
 * SQLite cannot alter constraints → table rebuild (pattern: migration 026).
 * Explicit column mapping in the copy INSERT — never SELECT * (026 lesson).
 * Idempotent: guarded on the old UNIQUE still being present in sqlite_master
 * (belt-and-braces on top of the runner's applied-migrations tracking). The
 * whole rebuild runs inside a single db.transaction() so a crash at any point
 * rolls back to the intact pre-039 table — see the inline comment above the
 * transaction for why that's safe on the shared migration-runner connection.
 *
 * After the rebuild, one targeted UPDATE relabels rows the pre-039
 * apply-time supersede path stamped 'rejected' (the only status it could
 * spell) with the superseded NOTE — see the inline comment above that
 * statement for the exact 3-condition predicate and why it can't match a
 * genuine editorial rejection.
 */

module.exports = {
  name: '039-segment-edit-exit-path',

  up(db) {
    const tableInfo = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get();

    if (!tableInfo) return;
    if (!tableInfo.sql.includes('UNIQUE(book, module_id, segment_id, status, editor_id)')) {
      return; // already rebuilt
    }

    // The whole rebuild is one transaction: a crash at ANY point rolls back to
    // the intact pre-039 table (SQLite DDL is transactional; better-sqlite3's
    // db.transaction() wrapper ROLLBACKs on throw, and a process kill mid-
    // transaction rolls back via the journal on the next open — no open
    // transaction is left on the shared connection, which was the concern
    // that previously ruled out a raw BEGIN/COMMIT here). That closes the
    // window a re-review demonstrated: outside a transaction, a crash between
    // DROP TABLE segment_edits and ALTER TABLE ... RENAME left ALL data only
    // in segment_edits_new; on the retry boot, migration 008's
    // CREATE TABLE IF NOT EXISTS segment_edits resurrected an EMPTY old-schema
    // table, this migration's guard saw the old UNIQUE and proceeded, and the
    // DROP TABLE IF EXISTS below then destroyed the only copy of the data
    // before copying 0 rows across. Inside the transaction that statement can
    // never be destructive again — it stays purely as belt-and-braces for an
    // orphan segment_edits_new left by a crash of the PRE-transactional
    // version of this migration.
    const rebuild = db.transaction(() => {
      db.exec(`
      DROP TABLE IF EXISTS segment_edits_new;

      CREATE TABLE segment_edits_new (
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
        review_id INTEGER REFERENCES module_reviews(id)
      );

      INSERT INTO segment_edits_new (
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      )
      SELECT
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      FROM segment_edits;

      DROP TABLE segment_edits;

      ALTER TABLE segment_edits_new RENAME TO segment_edits;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_edits_one_pending
        ON segment_edits(book, module_id, segment_id, editor_id)
        WHERE status = 'pending';

      CREATE INDEX IF NOT EXISTS idx_segment_edits_module
        ON segment_edits(book, module_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_status
        ON segment_edits(status);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_editor
        ON segment_edits(editor_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_segment
        ON segment_edits(module_id, segment_id);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_applied
        ON segment_edits(module_id, status, applied_at);
      CREATE INDEX IF NOT EXISTS idx_segment_edits_review
        ON segment_edits(review_id);

      -- The one deliberate data rewrite in this migration: relabel rows the
      -- PRE-039 apply-time supersede path wrote. That old code stamped the
      -- superseded NOTE ('Leyst úr gildi af nýrri samþykktri breytingu') but
      -- could only spell the STATUS as 'rejected' — 'superseded' didn't exist
      -- in the CHECK constraint yet. Those rows are semantically superseded
      -- (a losing approved edit at apply time, not an editorial rejection)
      -- and, mislabelled 'rejected', they count forever as needs-response in
      -- dashboardReadModel/my-work even though applied_at proves they were
      -- resolved by the apply itself. The predicate is exact: this note
      -- string was only ever written by that one code path (see
      -- applyApprovedEdits' markSuperseded statement, pre-039), combined with
      -- applied_at IS NOT NULL (an editorial rejection never sets applied_at)
      -- — together they can't match a genuine editorial rejection.
      UPDATE segment_edits SET status = 'superseded'
       WHERE status = 'rejected'
         AND applied_at IS NOT NULL
         AND reviewer_note = 'Leyst úr gildi af nýrri samþykktri breytingu';
    `);
    });
    rebuild();
  },
};
