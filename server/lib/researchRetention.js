/**
 * The research retention date (G1.1 + G1.2 spec §5.15, §15 SD6; PR4 decision 12; G1.15(b) spec §4.1).
 *
 * SD6 set it on 2026-11-21: raw research rows are kept to 31 Dec 2029, recorded in
 * docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md (SD6's record). The value is owned by
 * server/lib/retentionDates.js (RESEARCH_RAW_ROWS) and pinned by researchRetention.test.js; a change goes through both
 * in one reviewed commit that cites that record. Before the date takes effect, research-retention.js finds nothing
 * due, so the research backup job's every-cycle call changes nothing.
 *
 * No seam and no flag sets it: research-retention.js has no date option and refuses an unknown
 * one, and its pure functions take the date as a parameter that only main fills from here. A
 * writable switch on a value that deletes every research row is the danger PR3 decision 2 names.
 */
const { RESEARCH_RAW_ROWS, effectiveMs } = require('./retentionDates');

const RETENTION_DATE = RESEARCH_RAW_ROWS;

/**
 * The moment a retention date takes effect: rows are kept TO the date, so 00:00 UTC on the day after it
 * (G1.15(b) spec §4.1). isDue compares against it in research-retention.js, research-backup.js and
 * research-restore.js.
 *
 * @param {string | null} date
 * @returns {number | null} epoch ms of 00:00 UTC on the day after a real YYYY-MM-DD, or null; throws TypeError otherwise
 */
function retentionDateMs(date) {
  if (date === null) return null;
  return effectiveMs(date);
}

module.exports = { RETENTION_DATE, retentionDateMs };
