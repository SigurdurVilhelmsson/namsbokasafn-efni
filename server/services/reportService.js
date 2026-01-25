/**
 * Report Service
 *
 * Generates weekly and monthly progress reports for stakeholders.
 * Aggregates data from activity logs, reviews, and assignments.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Try to load other services
let editorHistory, assignmentStore, feedbackService;
try {
  editorHistory = require('./editorHistory');
  assignmentStore = require('./assignmentStore');
  feedbackService = require('./feedbackService');
} catch (e) {
  console.warn('Some services not available for reporting:', e.message);
}

/**
 * Get database connection
 */
function getDb() {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Get date range for a week (Monday to Sunday)
 * @param {number} weeksAgo - 0 for current week, 1 for last week, etc.
 */
function getWeekRange(weeksAgo = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday - (weeksAgo * 7));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get week label (e.g., "Vika 4, 2026")
 */
function getWeekLabel(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `Vika ${weekNumber}, ${date.getFullYear()}`;
}

/**
 * Get activity summary from activity_log
 */
function getActivitySummary(db, startDate, endDate) {
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  try {
    // Count by activity type
    const typeCounts = db.prepare(`
      SELECT type, COUNT(*) as count
      FROM activity_log
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY type
    `).all(startStr, endStr + ' 23:59:59');

    // Count by user
    const userCounts = db.prepare(`
      SELECT username, COUNT(*) as count
      FROM activity_log
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY username
      ORDER BY count DESC
    `).all(startStr, endStr + ' 23:59:59');

    // Count by book
    const bookCounts = db.prepare(`
      SELECT book, COUNT(*) as count
      FROM activity_log
      WHERE created_at >= ? AND created_at <= ? AND book IS NOT NULL
      GROUP BY book
    `).all(startStr, endStr + ' 23:59:59');

    // Recent activities
    const recentActivities = db.prepare(`
      SELECT * FROM activity_log
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(startStr, endStr + ' 23:59:59');

    return {
      byType: typeCounts.reduce((acc, r) => ({ ...acc, [r.type]: r.count }), {}),
      byUser: userCounts,
      byBook: bookCounts.reduce((acc, r) => ({ ...acc, [r.book]: r.count }), {}),
      recent: recentActivities.map(a => ({
        ...a,
        metadata: a.metadata ? JSON.parse(a.metadata) : {}
      })),
      total: typeCounts.reduce((sum, r) => sum + r.count, 0)
    };
  } catch (e) {
    console.error('Error getting activity summary:', e);
    return { byType: {}, byUser: [], byBook: {}, recent: [], total: 0 };
  }
}

/**
 * Get review summary
 */
function getReviewSummary(db, startDate, endDate) {
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  try {
    // Reviews submitted this week
    const submitted = db.prepare(`
      SELECT COUNT(*) as count
      FROM editor_reviews
      WHERE submitted_at >= ? AND submitted_at <= ?
    `).get(startStr, endStr + ' 23:59:59');

    // Reviews approved this week
    const approved = db.prepare(`
      SELECT COUNT(*) as count
      FROM editor_reviews
      WHERE status = 'approved' AND reviewed_at >= ? AND reviewed_at <= ?
    `).get(startStr, endStr + ' 23:59:59');

    // Reviews with changes requested
    const changesRequested = db.prepare(`
      SELECT COUNT(*) as count
      FROM editor_reviews
      WHERE status = 'changes_requested' AND reviewed_at >= ? AND reviewed_at <= ?
    `).get(startStr, endStr + ' 23:59:59');

    // Currently pending
    const pending = db.prepare(`
      SELECT COUNT(*) as count
      FROM editor_reviews
      WHERE status = 'pending'
    `).get();

    // Average turnaround (days)
    const avgTurnaround = db.prepare(`
      SELECT AVG(julianday(reviewed_at) - julianday(submitted_at)) as avg_days
      FROM editor_reviews
      WHERE status IN ('approved', 'changes_requested')
        AND reviewed_at >= ? AND reviewed_at <= ?
    `).get(startStr, endStr + ' 23:59:59');

    return {
      submitted: submitted?.count || 0,
      approved: approved?.count || 0,
      changesRequested: changesRequested?.count || 0,
      pending: pending?.count || 0,
      avgTurnaroundDays: avgTurnaround?.avg_days ? Math.round(avgTurnaround.avg_days * 10) / 10 : null
    };
  } catch (e) {
    console.error('Error getting review summary:', e);
    return { submitted: 0, approved: 0, changesRequested: 0, pending: 0, avgTurnaroundDays: null };
  }
}

/**
 * Get feedback summary
 */
function getFeedbackSummary(db, startDate, endDate) {
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  try {
    // Feedback received this week
    const received = db.prepare(`
      SELECT type, COUNT(*) as count
      FROM feedback
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY type
    `).all(startStr, endStr + ' 23:59:59');

    // Feedback resolved this week
    const resolved = db.prepare(`
      SELECT COUNT(*) as count
      FROM feedback
      WHERE status = 'resolved' AND resolved_at >= ? AND resolved_at <= ?
    `).get(startStr, endStr + ' 23:59:59');

    // Currently open
    const open = db.prepare(`
      SELECT COUNT(*) as count
      FROM feedback
      WHERE status IN ('open', 'in_progress')
    `).get();

    return {
      received: received.reduce((acc, r) => ({ ...acc, [r.type]: r.count }), {}),
      receivedTotal: received.reduce((sum, r) => sum + r.count, 0),
      resolved: resolved?.count || 0,
      open: open?.count || 0
    };
  } catch (e) {
    console.error('Error getting feedback summary:', e);
    return { received: {}, receivedTotal: 0, resolved: 0, open: 0 };
  }
}

/**
 * Get chapter progress
 */
function getChapterProgress(book) {
  try {
    const PROJECT_ROOT = path.join(__dirname, '..', '..');
    const statusDir = path.join(PROJECT_ROOT, 'books', book, 'chapters');

    if (!fs.existsSync(statusDir)) {
      return [];
    }

    const chapters = [];
    const dirs = fs.readdirSync(statusDir).filter(d => d.startsWith('ch'));

    for (const dir of dirs) {
      const statusFile = path.join(statusDir, dir, 'status.json');
      if (fs.existsSync(statusFile)) {
        try {
          const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          chapters.push({
            chapter: dir.replace('ch', ''),
            ...status
          });
        } catch (e) {
          // Skip invalid status files
        }
      }
    }

    return chapters.sort((a, b) => parseInt(a.chapter) - parseInt(b.chapter));
  } catch (e) {
    console.error('Error getting chapter progress:', e);
    return [];
  }
}

/**
 * Calculate stage completion percentages
 */
function calculateStageCompletion(chapters) {
  const stages = ['enMarkdown', 'mtOutput', 'linguisticReview', 'tmCreated', 'publication'];
  const stageLabels = {
    enMarkdown: 'EN Markdown',
    mtOutput: 'Vélþýðing',
    linguisticReview: 'Yfirferð 1',
    tmCreated: 'TM búið',
    publication: 'Útgefið'
  };

  const completion = {};

  for (const stage of stages) {
    const complete = chapters.filter(c => c.stages?.[stage] === 'complete').length;
    completion[stage] = {
      label: stageLabels[stage],
      complete,
      total: chapters.length,
      percentage: chapters.length > 0 ? Math.round((complete / chapters.length) * 100) : 0
    };
  }

  return completion;
}

/**
 * Generate weekly report
 */
function generateWeeklyReport(weeksAgo = 0, book = 'efnafraedi') {
  const { start, end } = getWeekRange(weeksAgo);
  const db = getDb();

  if (!db) {
    return {
      error: 'Database not available',
      period: { start: formatDate(start), end: formatDate(end) }
    };
  }

  try {
    const activity = getActivitySummary(db, start, end);
    const reviews = getReviewSummary(db, start, end);
    const feedback = getFeedbackSummary(db, start, end);
    const chapters = getChapterProgress(book);
    const stageCompletion = calculateStageCompletion(chapters);

    db.close();

    return {
      period: {
        start: formatDate(start),
        end: formatDate(end),
        label: getWeekLabel(start),
        weeksAgo
      },
      book,
      summary: {
        draftsaved: activity.byType.draft_saved || 0,
        reviewsSubmitted: activity.byType.review_submitted || 0,
        reviewsApproved: reviews.approved,
        changesRequested: reviews.changesRequested,
        pendingReviews: reviews.pending,
        avgReviewTurnaround: reviews.avgTurnaroundDays,
        feedbackReceived: feedback.receivedTotal,
        feedbackResolved: feedback.resolved,
        openFeedback: feedback.open
      },
      activity: {
        total: activity.total,
        byUser: activity.byUser,
        byType: activity.byType
      },
      reviews,
      feedback,
      chapters: {
        total: chapters.length,
        progress: stageCompletion
      },
      generatedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error('Error generating weekly report:', e);
    if (db) db.close();
    return {
      error: e.message,
      period: { start: formatDate(start), end: formatDate(end) }
    };
  }
}

/**
 * Generate comparison with previous week
 */
function generateWeeklyComparison(book = 'efnafraedi') {
  const thisWeek = generateWeeklyReport(0, book);
  const lastWeek = generateWeeklyReport(1, book);

  if (thisWeek.error || lastWeek.error) {
    return { thisWeek, lastWeek, comparison: null };
  }

  const compare = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return {
    thisWeek,
    lastWeek,
    comparison: {
      activity: compare(thisWeek.activity.total, lastWeek.activity.total),
      reviewsApproved: compare(thisWeek.summary.reviewsApproved, lastWeek.summary.reviewsApproved),
      feedbackReceived: compare(thisWeek.summary.feedbackReceived, lastWeek.summary.feedbackReceived)
    }
  };
}

/**
 * Get list of available reports (last 8 weeks)
 */
function getAvailableReports(book = 'efnafraedi') {
  const reports = [];

  for (let i = 0; i < 8; i++) {
    const { start, end } = getWeekRange(i);
    reports.push({
      weeksAgo: i,
      label: getWeekLabel(start),
      period: {
        start: formatDate(start),
        end: formatDate(end)
      }
    });
  }

  return reports;
}

module.exports = {
  generateWeeklyReport,
  generateWeeklyComparison,
  getAvailableReports,
  getWeekRange,
  getWeekLabel
};
