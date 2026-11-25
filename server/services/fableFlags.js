/**
 * Which Fable "meaning" flags an editor may see (spec amendment 1).
 *
 * A flag is withheld where human text was in flight at the unit's opening, and in a unit with no
 * opening yet, so a flag never sits over an editor's own pending work. The opening's in-flight
 * snapshot is fixed when it is recorded, so a later edit neither hides nor reveals a flag.
 *
 * Occurrence -1 in the snapshot means every occurrence of that segment id (rows made before G1.1
 * carry no occurrence). A served segment carries no occurrence of its own when only the first copy
 * of a repeated id is served, so it counts as occurrence 0.
 */

const moduleOpenings = require('./moduleOpenings');
const log = require('../lib/logger');

/**
 * @param {{ inflight: Array<{ segmentId: string, occurrence: number }> } | null} opening
 * @param {string} segmentId
 * @param {number} occurrence
 * @returns {boolean} true when the flag may be shown
 */
function isFableFlagVisible(opening, segmentId, occurrence) {
  if (!opening) return false;
  return !opening.inflight.some(
    (r) => r.segmentId === segmentId && (r.occurrence === -1 || r.occurrence === occurrence)
  );
}

/**
 * Sets fableMeaning to null, in place, on every segment whose flag is not visible.
 * @param {object | null} opening as returned by moduleOpenings.readOpening
 * @param {Array<{ segmentId: string, occurrence?: number, fableMeaning?: object | null }>} segments
 */
function suppressFableFlags(opening, segments) {
  for (const s of segments) {
    if (!isFableFlagVisible(opening, s.segmentId, s.occurrence ?? 0)) s.fableMeaning = null;
  }
}

/**
 * Reads the unit's opening and suppresses the flags it does not allow. Fails closed: a read that
 * throws is treated as no opening, so every flag is cleared and the failure is logged. Returns the
 * opening it used (null when absent or unreadable) for callers that need the same snapshot.
 * @param {object} conn
 * @param {{ book: string, chapter: number, moduleId: string, segments: Array<object> }} args
 */
function applyFableFlags(conn, { book, chapter, moduleId, segments }) {
  let opening = null;
  try {
    opening = moduleOpenings.readOpening(conn, { book, chapter, moduleId });
  } catch (err) {
    log.error({ err, book, moduleId }, 'fable flags: opening unreadable, flags withheld');
  }
  suppressFableFlags(opening, segments);
  return opening;
}

/**
 * Whether one segment's flag is visible under the unit's stored opening, for a caller that holds no
 * opening (a route never names it, T17). Fails closed: a read that throws is logged and answers
 * false, so the caller refuses as "not flagged" and never answers 500.
 * @param {object} conn
 * @param {{ book: string, chapter: number, moduleId: string }} place
 * @param {string} segmentId
 * @param {number} occurrence
 * @returns {boolean}
 */
function isFlagVisibleNow(conn, { book, chapter, moduleId }, segmentId, occurrence) {
  try {
    const opening = moduleOpenings.readOpening(conn, { book, chapter, moduleId });
    return isFableFlagVisible(opening, segmentId, occurrence);
  } catch (err) {
    log.error({ err, book, moduleId }, 'fable flags: opening unreadable, flag treated as hidden');
    return false;
  }
}

module.exports = { suppressFableFlags, isFableFlagVisible, applyFableFlags, isFlagVisibleNow };
