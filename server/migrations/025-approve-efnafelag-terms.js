/**
 * Migration 025: Bulk approve Efnafræðifélag Íslands terms
 *
 * ~580 chemistry terms were imported from the Chemistry Society of Iceland
 * via CSV. The import function hardcodes source='imported-csv', so we first
 * re-tag those terms as 'chemistry-society-csv' for proper attribution,
 * then approve them all.
 *
 * Identification: book_id = 'efnafraedi-2e' AND source = 'imported-csv'
 * (no other CSV imports exist for this book).
 *
 * Finds the admin user to attribute approval to. Falls back to a
 * system placeholder if no admin exists (e.g. local dev).
 */

module.exports = {
  id: '025-approve-efnafelag-terms',

  up(db) {
    // Step 1: Re-tag imported-csv terms for efnafraedi-2e as chemistry-society-csv
    const retagged = db
      .prepare(
        `UPDATE terminology_terms
         SET source = 'chemistry-society-csv'
         WHERE book_id = 'efnafraedi-2e' AND source = 'imported-csv'`
      )
      .run();

    if (retagged.changes > 0) {
      console.log(
        `Migration 025: Re-tagged ${retagged.changes} terms from imported-csv → chemistry-society-csv`
      );
    }

    // Step 2: Approve all chemistry-society-csv terms that aren't already approved
    const pending = db
      .prepare(
        "SELECT COUNT(*) as count FROM terminology_terms WHERE source = 'chemistry-society-csv' AND status != 'approved'"
      )
      .get();

    if (pending.count === 0) {
      console.log('Migration 025: No chemistry-society-csv terms need approval');
      return;
    }

    // Find admin user for attribution
    const admin = db
      .prepare("SELECT id, display_name FROM users WHERE role = 'admin' LIMIT 1")
      .get();

    const approvedBy = admin ? admin.id : 'system';
    const approvedByName = admin ? admin.display_name : 'Kerfi (sjálfvirkt)';

    const result = db
      .prepare(
        `UPDATE terminology_terms
         SET status = 'approved',
             approved_by = ?,
             approved_by_name = ?,
             approved_at = CURRENT_TIMESTAMP
         WHERE source = 'chemistry-society-csv' AND status != 'approved'`
      )
      .run(approvedBy, approvedByName);

    console.log(
      `Migration 025: Approved ${result.changes} terms from Efnafræðifélag Íslands (by ${approvedByName})`
    );
  },
};
