/**
 * The research service routes may call (spec §5.16). Write-only: nothing here returns a
 * research key or reads research data back. `record` follows in Task 11.
 */
const crypto = require('crypto');
const log = require('../lib/logger');
const researchDb = require('./researchDb');

/**
 * Mint the editor key for a consent interval (spec §5.16). Write-only: never returns the key.
 * Never throws.
 * @param {number} intervalId the id of the interval's starting research_consent row
 * @returns {{status: 'minted' | 'exists' | 'failed'}}
 */
function ensureKey(intervalId) {
  try {
    if (!Number.isSafeInteger(intervalId) || intervalId < 1) return { status: 'failed' };
    const db = researchDb.getHandle();
    return db
      .transaction(() => {
        if (db.prepare('SELECT 1 FROM editor_keys WHERE interval_id = ?').get(intervalId)) {
          return { status: 'exists' };
        }
        db.prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)').run(
          intervalId,
          crypto.randomBytes(16).toString('hex')
        );
        return { status: 'minted' };
      })
      .immediate();
  } catch (err) {
    // record() mints the key at the interval's first event when this fails (spec §5.16).
    log.error({ errorCode: err.code || err.name }, 'Editor key not minted at consent (spec §5.16)');
    researchDb.noteFailure(err);
    return { status: 'failed' };
  }
}

module.exports = { ensureKey };
