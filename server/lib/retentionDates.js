/**
 * The four retention dates of the editing tool's data: their one owner (G1.15(b) spec §4.1).
 *
 * Decided by [USER] and recorded in docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md, which is also SD6's
 * record for the research date. Enforceable values: a change goes through retentionDates.test.js in one reviewed
 * commit that cites that record. A record is kept TO its date, so a date takes effect at 00:00 UTC on the day after
 * (effectiveMs). Editing ends with 2028.
 *
 * This module reads no other module: every consumer reads it, so a cycle back into it is impossible by construction.
 */
const NAMED_EDITING_RECORDS = '2028-12-31'; // names stripped from editing records, pure logs deleted
const UNNAMED_RECORDS = '2029-12-31'; // records without names (served text versions, module openings)
const RESEARCH_RAW_ROWS = '2029-12-31'; // raw research rows (research-retention.js, via researchRetention.js)
const CONSENT_RECORDS = '2030-12-31'; // consent records and capture-loss notes

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The moment a retention date takes effect: 00:00 UTC on the day after it.
 *
 * @param {string} date A real calendar date, YYYY-MM-DD.
 * @returns {number} epoch milliseconds
 * @throws {TypeError} on anything else, including null
 */
function effectiveMs(date) {
  const m = typeof date === 'string' ? DATE.exec(date) : null;
  const day = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(day).toISOString().slice(0, 10) !== date) {
    throw new TypeError(`a retention date must be a real YYYY-MM-DD, got ${JSON.stringify(date)}`);
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
}

module.exports = {
  NAMED_EDITING_RECORDS,
  UNNAMED_RECORDS,
  RESEARCH_RAW_ROWS,
  CONSENT_RECORDS,
  effectiveMs,
};
