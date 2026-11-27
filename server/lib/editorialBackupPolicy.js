'use strict';

/**
 * G1.20 editorial long-lived backups: the listing policy (pure).
 *
 * Spec: docs/superpowers/specs/2026-11-27-g120-editorial-backups-design.md
 * §4.2-§4.3. Reads an `rclone lsjson` listing of the versioned, Object-Locked
 * bucket and decides which copies to delete, whether too many went up in 24
 * hours, and whether the 12-month cap holds (a fail-closed summary).
 *
 * The lock length (3 -> 30 -> 350 days) and the lifecycle rule (355 days, then
 * 1 day noncurrent) are BUCKET SETTINGS, never code. Only the values below
 * belong here.
 */

const DAY_MS = 86400000;
/** The server's own delete: data versions older than this are removed. */
const SERVER_DELETE_AFTER_DAYS = 356;
/** The health check's alarm: a data version older than this breaks the cap. */
const CAP_ALARM_AFTER_DAYS = 358;
/** The rate guard: more copies than this in 24 hours is refused. */
const MAX_COPIES_PER_24H = 8;

const invalid = () => new Error('listing-invalid');

/**
 * Parse `rclone lsjson` output.
 * @param {string} text JSON array of {Path, Size, ModTime, IsDir}
 * @param {number} nowMs
 * @returns {Array<{path: string, ageMs: number, marker: boolean}>}
 * @throws {Error} 'listing-invalid' when the text cannot be read as a listing
 */
function readListing(text, nowMs) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed)) throw invalid();
  const items = [];
  for (const it of parsed) {
    if (!it || typeof it !== 'object') throw invalid();
    if (it.IsDir) continue;
    const modMs = Date.parse(it.ModTime);
    if (typeof it.Path !== 'string' || typeof it.Size !== 'number' || Number.isNaN(modMs)) {
      throw invalid();
    }
    items.push({ path: it.Path, ageMs: nowMs - modMs, marker: it.Size === 0 });
  }
  return items;
}

/** Data versions (never markers) older than the server's delete age. */
function expiredPaths(items) {
  return items
    .filter((i) => !i.marker && i.ageMs > SERVER_DELETE_AFTER_DAYS * DAY_MS)
    .map((i) => i.path);
}

/** Data versions from the last 24 hours; a future ModTime (negative age) counts. */
function recentCopies(items) {
  return items.filter((i) => !i.marker && i.ageMs < DAY_MS).length;
}

const wholeDays = (ms) => Math.max(0, Math.floor(ms / DAY_MS));

/**
 * Fail-closed summary of a listing.
 * @param {Array<{ageMs: number, marker: boolean}>} items
 * @param {{uploadedSeen: boolean}} opts
 */
function summarize(items, { uploadedSeen }) {
  const data = items.filter((i) => !i.marker);
  const reasons = [];
  if (items.length === 0) reasons.push('listing-empty');
  if (!uploadedSeen) reasons.push('uploaded-not-seen');
  if (data.some((i) => i.ageMs > CAP_ALARM_AFTER_DAYS * DAY_MS)) reasons.push('over-cap');
  const ages = data.map((i) => i.ageMs);
  return {
    ok: reasons.length === 0,
    reasons,
    oldest_age_days: ages.length ? wholeDays(Math.max(...ages)) : 0,
    newest_age_days: ages.length ? wholeDays(Math.min(...ages)) : 0,
    data_versions: data.length,
    delete_markers: items.length - data.length,
    uploaded_seen: Boolean(uploadedSeen),
  };
}

module.exports = {
  DAY_MS,
  SERVER_DELETE_AFTER_DAYS,
  CAP_ALARM_AFTER_DAYS,
  MAX_COPIES_PER_24H,
  readListing,
  expiredPaths,
  recentCopies,
  summarize,
};
