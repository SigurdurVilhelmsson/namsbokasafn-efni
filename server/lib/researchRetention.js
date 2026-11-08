/**
 * The research retention date (G1.1 + G1.2 spec §5.15, §15 SD6; PR4 decision 12).
 *
 * An enforceable value, changed with its test (researchRetention.test.js) in one reviewed commit
 * that cites SD6's record. SD6 sets it. While it is null, research-retention.js finds nothing due,
 * so the research backup job's every-cycle call changes nothing.
 *
 * No seam and no flag sets it: research-retention.js has no date option and refuses an unknown
 * one, and its pure functions take the date as a parameter that only main fills from here. A
 * writable switch on a value that deletes every research row is the danger PR3 decision 2 names.
 */
const RETENTION_DATE = null;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string | null} date
 * @returns {number | null} UTC midnight of a real YYYY-MM-DD, or null; throws TypeError otherwise
 */
function retentionDateMs(date) {
  if (date === null) return null;
  const m = typeof date === 'string' ? DATE.exec(date) : null;
  const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new TypeError(
      `the retention date must be YYYY-MM-DD or null, got ${JSON.stringify(date)}`
    );
  }
  return ms;
}

module.exports = { RETENTION_DATE, retentionDateMs };
