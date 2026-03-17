/**
 * Migration 025: Bulk approve Efnafræðifélag Íslands terms
 *
 * ~580 chemistry terms were imported from the Chemistry Society of Iceland.
 * They are stored with source='chemistry-association' and status='proposed'.
 *
 * This migration:
 * 1. Re-tags them to 'chemistry-society-csv' (the canonical source key)
 * 2. Approves them all under the admin user
 *
 * Finds the admin user to attribute approval to. Falls back to a
 * system placeholder if no admin exists (e.g. local dev).
 */

module.exports = {
  id: '025-approve-efnafelag-terms',

  up(db) {
    // Step 1: Re-tag chemistry-association → chemistry-society-csv
    const retagged = db
      .prepare(
        `UPDATE terminology_terms
         SET source = 'chemistry-society-csv'
         WHERE source = 'chemistry-association'`
      )
      .run();

    if (retagged.changes > 0) {
      console.log(
        `Migration 025: Re-tagged ${retagged.changes} terms from chemistry-association → chemistry-society-csv`
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
