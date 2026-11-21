/**
 * The one order for a list of people: by name, as an Icelandic reader expects (á after a; þ, æ and ö at
 * the end). SD7, as answered on 2026-11-21 (docs/decisions/2026-11-21-g115-editor-privacy-split-and-sd7-scope.md):
 * a per-person list keeps its counts and is never ordered by volume.
 *
 * Used by the dashboard's workload (services/dashboardReadModel.js), the analytics' team metrics
 * (lib/teamMetrics.js) and the meeting agenda's activity counts (routes/status.js).
 */

/** A comparator on two names; a missing name sorts as the empty string. */
function byName(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'is');
}

module.exports = { byName };
