/**
 * The status page's per-person figures (GET /api/status/analytics → `teamMetrics`), moved out of the route
 * unchanged on 2026-11-17 so they can be tested without the route's book scan, plus one rule:
 *
 * "Merkja sem lokið" presses (`module_marked_done`, register §C222) are skipped before anything is counted. A press is
 * a line in the shared activity feed, never a per-person count: [USER] ruled on 2026-11-17 that presses appear in the
 * feed and stay out of these figures. A user whose only rows are presses therefore does not appear at all.
 *
 * Requiring activityLog here is safe: its database opens lazily, on the first statement.
 */

const { MODULE_MARKED_DONE } = require('../services/activityLog');

/**
 * @param {object[]} activities rows as activityLog.search returns them (`type`, `username`, `createdAt`, …)
 * @param {Date} now the moment the 30-day window is counted back from
 * @returns {object[]} one entry per user ({username, totalActions, reviews, approvals, drafts, submissions,
 *   lastActive}), most actions first
 */
function teamMetricsFrom(activities, now) {
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  const userStats = {};

  for (const activity of activities) {
    if (activity.type === MODULE_MARKED_DONE) continue;

    const activityDate = new Date(activity.createdAt);
    if (activityDate < last30Days) continue;

    const user = activity.username || 'unknown';
    if (!userStats[user]) {
      userStats[user] = {
        username: user,
        totalActions: 0,
        reviews: 0,
        approvals: 0,
        drafts: 0,
        submissions: 0,
        lastActive: null,
      };
    }

    userStats[user].totalActions++;

    if (
      activity.type === 'review_approved' ||
      activity.type === 'approve_review' ||
      activity.type === 'segment_edit_approved'
    ) {
      userStats[user].approvals++;
    } else if (
      activity.type === 'review_submitted' ||
      activity.type === 'submit_review' ||
      activity.type === 'segment_edit_saved'
    ) {
      userStats[user].submissions++;
    } else if (activity.type === 'draft_saved') {
      userStats[user].drafts++;
    } else if (activity.type === 'segment_edits_applied') {
      userStats[user].approvals++;
    }

    if (
      !userStats[user].lastActive ||
      new Date(activity.createdAt) > new Date(userStats[user].lastActive)
    ) {
      userStats[user].lastActive = activity.createdAt;
    }
  }

  return Object.values(userStats).sort((a, b) => b.totalActions - a.totalActions);
}

module.exports = { teamMetricsFrom };
