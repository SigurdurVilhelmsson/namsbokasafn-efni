/**
 * The immediate deletion at withdrawal (G1.1 + G1.2 spec §5.15 "When they run", §5.16; PR4
 * decision 14).
 *
 * The withdraw route, and a declined consent during a live interval (§5.14: declining while
 * consented is a withdrawal), call deleteIntervalRowsNow after their own commit. It deletes the
 * interval's events and their items by its key, and its loss rows. The key row stays:
 * research-withdrawal.js completes the deletion (compaction, byte scan, the key row last) and
 * records it, and until it does the interval stays due.
 *
 * Write-only to routes (§5.16): it reads the key only to delete by it, and returns statuses, never
 * a key or a count. Routes reach research data only through this module and researchLog.
 *
 * Never throws, and logs only an error code: a failure here never changes a route's response.
 * Call it bare: a test bans a try-wrapped call (activityLogCallsiteGuard.test.js).
 */
const log = require('../lib/logger');
const researchDb = require('./researchDb');
const researchConsent = require('./researchConsent');

/**
 * @param {number} intervalId the withdrawn interval
 * @returns {{ research: 'deleted' | 'no-key' | 'failed', losses: 'deleted' | 'failed' }}
 */
function deleteIntervalRowsNow(intervalId) {
  const result = { research: 'failed', losses: 'failed' };
  if (!Number.isSafeInteger(intervalId) || intervalId < 1) return result;
  try {
    const db = researchDb.getHandle();
    result.research = db
      .transaction(() => {
        const row = db
          .prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?')
          .get(intervalId);
        if (!row) return 'no-key';
        db.prepare(
          'DELETE FROM research_event_items WHERE event_id IN (SELECT id FROM research_events WHERE editor_key = ?)'
        ).run(row.editor_key);
        db.prepare('DELETE FROM research_events WHERE editor_key = ?').run(row.editor_key);
        return 'deleted';
      })
      .immediate();
  } catch (err) {
    // research-withdrawal.js completes the deletion; the interval stays due until it does (spec §5.15).
    log.error(
      { errorCode: err.code || err.name },
      'research rows not deleted at withdrawal (spec §5.15)'
    );
    researchDb.noteFailure(err);
  }
  try {
    researchConsent
      .getSessionsDb()
      .prepare('DELETE FROM research_capture_losses WHERE interval_id = ?')
      .run(intervalId);
    result.losses = 'deleted';
  } catch (err) {
    log.error(
      { errorCode: err.code || err.name },
      'loss rows not deleted at withdrawal (spec §5.15)'
    );
  }
  return result;
}

module.exports = { deleteIntervalRowsNow };
