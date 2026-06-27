/**
 * Migration 038: Link segment edits to their review cycle.
 *
 * `segment_edits` previously had no link to `module_reviews`; the review tally
 * (completeModuleReview, getReviewQueue) attributed edits to a review by the
 * time window `segment_edits.created_at >= module_reviews.submitted_at`. That is
 * wrong: editors create their edits BEFORE submitting for review, so a review's
 * own edits fall before its submitted_at and were excluded — a review with
 * unreviewed edits could auto-approve with 0 segments counted, and edits from
 * later activity could leak into an earlier review's tally.
 *
 * This adds an explicit `review_id` FK. `submitModuleForReview` now stamps the
 * module's live edits with the new review id, and the tallies key off
 * `review_id` instead of the time window.
 *
 * Backfill is scoped to reviews that are still OPEN at deploy time. Completed
 * reviews freeze approved_segments/rejected_segments into their row, so they
 * need no attribution. But an open (pending/in_review) review whose edits all
 * have review_id=NULL would show 0 edits in the queue and could be completed as
 * "approved" with 0 segments — and the one-open-review-per-module guard blocks
 * re-submitting to recover. So we attribute each open review's live (non-rejected)
 * edits to it. This anchors on review STATUS, not the buggy created_at window,
 * and the guard means at most one open review per module, so it's unambiguous.
 * Idempotent via a column-existence check (backfill runs once, when the column
 * is first added).
 */

module.exports = {
  name: '038-segment-edit-review-id',

  up(db) {
    const hasColumn = db
      .prepare(`PRAGMA table_info(segment_edits)`)
      .all()
      .some((c) => c.name === 'review_id');

    if (!hasColumn) {
      db.exec(
        `ALTER TABLE segment_edits ADD COLUMN review_id INTEGER REFERENCES module_reviews(id);`
      );
      // Attribute the edits of any review open across this deploy (see header).
      db.exec(`
        UPDATE segment_edits SET review_id = (
          SELECT mr.id FROM module_reviews mr
           WHERE mr.book = segment_edits.book
             AND mr.module_id = segment_edits.module_id
             AND mr.status IN ('pending', 'in_review')
           LIMIT 1
        )
        WHERE review_id IS NULL
          AND status != 'rejected'
          AND EXISTS (
            SELECT 1 FROM module_reviews mr2
             WHERE mr2.book = segment_edits.book
               AND mr2.module_id = segment_edits.module_id
               AND mr2.status IN ('pending', 'in_review')
          );
      `);
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_segment_edits_review ON segment_edits(review_id);`);
  },

  down(db) {
    // SQLite can't easily DROP COLUMN on old versions; drop the index only.
    db.exec(`DROP INDEX IF EXISTS idx_segment_edits_review;`);
  },
};
