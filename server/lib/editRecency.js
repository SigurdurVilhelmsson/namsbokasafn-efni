/**
 * Canonical edit-recency comparator (item 13, Part 0).
 *
 * ONE rule for "which edit wins a segment", shared by Pass-1 preview
 * (buildEffectiveSegments), Pass-1 apply (applyApprovedEdits), the Pass-1
 * approve guard, and the localization approve guard. Newest created_at wins;
 * id breaks same-second ties (CURRENT_TIMESTAMP is 1s-granular).
 *
 * Why not id alone: saves UPDATE pending rows in place (created_at refreshes,
 * id doesn't), so the highest id is creation order, not content recency.
 * Lives in lib/ because segmentEditorService and localizationReviewService
 * both consume it and must not import each other.
 */

/**
 * @param {{id: number, created_at: string|null}} a
 * @param {{id: number, created_at: string|null}} b
 * @returns {boolean} true when a is strictly newer than b
 */
function isNewer(a, b) {
  const ta = a.created_at || '';
  const tb = b.created_at || '';
  // SQLite CURRENT_TIMESTAMP TEXT ('YYYY-MM-DD HH:MM:SS'): lexicographic
  // comparison IS chronological comparison.
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

/**
 * @param {Array<{id: number, created_at: string|null}>} edits
 * @returns {object|null} the newest edit, or null for an empty list
 */
function pickLatest(edits) {
  let latest = null;
  for (const e of edits) {
    if (!latest || isNewer(e, latest)) latest = e;
  }
  return latest;
}

module.exports = { isNewer, pickLatest };
