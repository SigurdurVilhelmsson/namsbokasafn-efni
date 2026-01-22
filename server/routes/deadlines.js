/**
 * Deadlines Routes
 *
 * API endpoints for deadline tracking and visualization.
 *
 * Endpoints:
 *   GET  /api/deadlines              Get all deadlines with filters
 *   GET  /api/deadlines/calendar     Get deadlines in calendar format
 *   GET  /api/deadlines/stats        Get deadline statistics
 *   GET  /api/deadlines/alerts       Get deadline alerts (overdue, due soon)
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const assignmentStore = require('../services/assignmentStore');

// Stage labels
const STAGE_LABELS = {
  enMarkdown: 'EN Markdown',
  mtOutput: 'Vélþýðing',
  linguisticReview: 'Málfarsskoðun',
  tmCreated: 'Þýðingaminni',
  publication: 'Útgáfa'
};

// Stage order for sorting
const STAGE_ORDER = ['enMarkdown', 'mtOutput', 'linguisticReview', 'tmCreated', 'publication'];

/**
 * GET /api/deadlines
 * Get all deadlines with optional filters
 *
 * Query params:
 *   - book: Filter by book
 *   - user: Filter by assigned user
 *   - stage: Filter by stage
 *   - status: 'all' | 'overdue' | 'due-soon' | 'upcoming' | 'no-date'
 *   - days: Number of days to look ahead (default: 30)
 */
router.get('/', requireAuth, (req, res) => {
  const { book, user, stage, status = 'all', days = '30' } = req.query;

  try {
    const now = new Date();
    const daysAhead = parseInt(days) || 30;
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Get assignments
    let assignments;
    if (book) {
      assignments = assignmentStore.getBookAssignments(book);
    } else if (user) {
      assignments = assignmentStore.getUserAssignments(user);
    } else {
      assignments = assignmentStore.getAllPendingAssignments();
    }

    // Apply stage filter
    if (stage) {
      assignments = assignments.filter(a => a.stage === stage);
    }

    // Categorize by deadline status
    const categorized = {
      overdue: [],
      dueSoon: [],      // Within 3 days
      thisWeek: [],     // 4-7 days
      upcoming: [],     // 8-30 days
      noDate: []
    };

    for (const a of assignments) {
      const item = {
        ...a,
        stageLabel: STAGE_LABELS[a.stage] || a.stage,
        stageOrder: STAGE_ORDER.indexOf(a.stage)
      };

      if (!a.dueDate) {
        item.deadlineStatus = 'no-date';
        categorized.noDate.push(item);
      } else {
        const dueDate = new Date(a.dueDate);
        const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        item.daysUntil = daysUntil;
        item.dueDateFormatted = dueDate.toLocaleDateString('is-IS');

        if (daysUntil < 0) {
          item.deadlineStatus = 'overdue';
          item.daysOverdue = Math.abs(daysUntil);
          categorized.overdue.push(item);
        } else if (daysUntil <= 3) {
          item.deadlineStatus = 'due-soon';
          categorized.dueSoon.push(item);
        } else if (daysUntil <= 7) {
          item.deadlineStatus = 'this-week';
          categorized.thisWeek.push(item);
        } else if (dueDate <= futureDate) {
          item.deadlineStatus = 'upcoming';
          categorized.upcoming.push(item);
        }
      }
    }

    // Sort each category
    categorized.overdue.sort((a, b) => a.daysOverdue - b.daysOverdue); // Most overdue first
    categorized.dueSoon.sort((a, b) => a.daysUntil - b.daysUntil);
    categorized.thisWeek.sort((a, b) => a.daysUntil - b.daysUntil);
    categorized.upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    categorized.noDate.sort((a, b) => {
      // Sort by book, chapter, stage order
      if (a.book !== b.book) return a.book.localeCompare(b.book);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.stageOrder - b.stageOrder;
    });

    // Filter by status if specified
    let result;
    if (status === 'all') {
      result = [
        ...categorized.overdue,
        ...categorized.dueSoon,
        ...categorized.thisWeek,
        ...categorized.upcoming,
        ...categorized.noDate
      ];
    } else if (status === 'overdue') {
      result = categorized.overdue;
    } else if (status === 'due-soon') {
      result = [...categorized.overdue, ...categorized.dueSoon];
    } else if (status === 'upcoming') {
      result = [...categorized.thisWeek, ...categorized.upcoming];
    } else if (status === 'no-date') {
      result = categorized.noDate;
    } else {
      result = [];
    }

    res.json({
      deadlines: result,
      total: result.length,
      categorized: {
        overdue: categorized.overdue.length,
        dueSoon: categorized.dueSoon.length,
        thisWeek: categorized.thisWeek.length,
        upcoming: categorized.upcoming.length,
        noDate: categorized.noDate.length
      },
      filters: { book, user, stage, status, days: daysAhead },
      stageLabels: STAGE_LABELS
    });

  } catch (err) {
    console.error('Get deadlines error:', err);
    res.status(500).json({
      error: 'Failed to get deadlines',
      message: err.message
    });
  }
});

/**
 * GET /api/deadlines/calendar
 * Get deadlines organized by date for calendar view
 *
 * Query params:
 *   - book: Filter by book
 *   - month: Month (1-12), defaults to current
 *   - year: Year, defaults to current
 */
router.get('/calendar', requireAuth, (req, res) => {
  const { book } = req.query;
  const now = new Date();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const year = parseInt(req.query.year) || now.getFullYear();

  try {
    // Get start and end of month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    // Get assignments
    let assignments = book
      ? assignmentStore.getBookAssignments(book)
      : assignmentStore.getAllPendingAssignments();

    // Group by date
    const byDate = {};
    const todayStr = now.toISOString().slice(0, 10);

    for (const a of assignments) {
      if (!a.dueDate) continue;

      const dueDate = new Date(a.dueDate);
      if (dueDate < startOfMonth || dueDate > endOfMonth) continue;

      const dateStr = dueDate.toISOString().slice(0, 10);

      if (!byDate[dateStr]) {
        byDate[dateStr] = {
          date: dateStr,
          dayOfMonth: dueDate.getDate(),
          dayOfWeek: dueDate.getDay(),
          isToday: dateStr === todayStr,
          isPast: dueDate < now,
          items: []
        };
      }

      byDate[dateStr].items.push({
        id: a.id,
        book: a.book,
        chapter: a.chapter,
        stage: a.stage,
        stageLabel: STAGE_LABELS[a.stage] || a.stage,
        assignedTo: a.assignedTo,
        isOverdue: dueDate < now
      });
    }

    // Build calendar grid
    const firstDay = startOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = endOfMonth.getDate();

    const weeks = [];
    let currentWeek = [];

    // Pad first week
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null);
    }

    // Fill in days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      currentWeek.push(byDate[dateStr] || {
        date: dateStr,
        dayOfMonth: day,
        dayOfWeek: (firstDay + day - 1) % 7,
        isToday: dateStr === todayStr,
        isPast: new Date(dateStr) < now,
        items: []
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Pad last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    // Count totals
    const totalItems = Object.values(byDate).reduce((sum, d) => sum + d.items.length, 0);
    const overdueItems = Object.values(byDate).reduce(
      (sum, d) => sum + d.items.filter(i => i.isOverdue).length, 0
    );

    res.json({
      month,
      year,
      monthName: startOfMonth.toLocaleDateString('is-IS', { month: 'long' }),
      weeks,
      totalItems,
      overdueItems,
      book: book || 'all'
    });

  } catch (err) {
    console.error('Get calendar error:', err);
    res.status(500).json({
      error: 'Failed to get calendar',
      message: err.message
    });
  }
});

/**
 * GET /api/deadlines/stats
 * Get deadline statistics
 */
router.get('/stats', requireAuth, (req, res) => {
  const { book } = req.query;

  try {
    const now = new Date();

    let assignments = book
      ? assignmentStore.getBookAssignments(book)
      : assignmentStore.getAllPendingAssignments();

    // Calculate stats
    const stats = {
      total: assignments.length,
      withDueDate: 0,
      withoutDueDate: 0,
      overdue: 0,
      dueSoon: 0,
      dueThisWeek: 0,
      dueThisMonth: 0,
      byUser: {},
      byStage: {},
      byBook: {}
    };

    for (const a of assignments) {
      // Count by user
      if (a.assignedTo) {
        if (!stats.byUser[a.assignedTo]) {
          stats.byUser[a.assignedTo] = { total: 0, overdue: 0, dueSoon: 0 };
        }
        stats.byUser[a.assignedTo].total++;
      }

      // Count by stage
      if (!stats.byStage[a.stage]) {
        stats.byStage[a.stage] = { total: 0, overdue: 0, label: STAGE_LABELS[a.stage] || a.stage };
      }
      stats.byStage[a.stage].total++;

      // Count by book
      if (!stats.byBook[a.book]) {
        stats.byBook[a.book] = { total: 0, overdue: 0 };
      }
      stats.byBook[a.book].total++;

      if (!a.dueDate) {
        stats.withoutDueDate++;
        continue;
      }

      stats.withDueDate++;
      const dueDate = new Date(a.dueDate);
      const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        stats.overdue++;
        if (a.assignedTo) stats.byUser[a.assignedTo].overdue++;
        stats.byStage[a.stage].overdue++;
        stats.byBook[a.book].overdue++;
      } else if (daysUntil <= 3) {
        stats.dueSoon++;
        if (a.assignedTo) stats.byUser[a.assignedTo].dueSoon++;
      } else if (daysUntil <= 7) {
        stats.dueThisWeek++;
      } else if (daysUntil <= 30) {
        stats.dueThisMonth++;
      }
    }

    // Calculate averages
    const usersWithOverdue = Object.values(stats.byUser).filter(u => u.overdue > 0).length;
    const totalUsers = Object.keys(stats.byUser).length;

    stats.summary = {
      overduePercentage: stats.withDueDate > 0 ? Math.round(stats.overdue / stats.withDueDate * 100) : 0,
      usersWithOverdue,
      totalUsers,
      avgAssignmentsPerUser: totalUsers > 0 ? Math.round(stats.total / totalUsers * 10) / 10 : 0,
      healthScore: calculateHealthScore(stats)
    };

    res.json(stats);

  } catch (err) {
    console.error('Get deadline stats error:', err);
    res.status(500).json({
      error: 'Failed to get stats',
      message: err.message
    });
  }
});

/**
 * GET /api/deadlines/alerts
 * Get deadline alerts for dashboard/notifications
 */
router.get('/alerts', requireAuth, (req, res) => {
  const { user } = req.query;

  try {
    const now = new Date();
    const alerts = [];

    let assignments = user
      ? assignmentStore.getUserAssignments(user)
      : assignmentStore.getAllPendingAssignments();

    for (const a of assignments) {
      if (!a.dueDate) continue;

      const dueDate = new Date(a.dueDate);
      const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        alerts.push({
          type: 'overdue',
          severity: 'critical',
          title: 'Tímafrestur liðinn',
          message: `${a.book} kafli ${a.chapter} - ${STAGE_LABELS[a.stage] || a.stage}`,
          daysOverdue: Math.abs(daysUntil),
          assignedTo: a.assignedTo,
          assignmentId: a.id,
          book: a.book,
          chapter: a.chapter,
          stage: a.stage
        });
      } else if (daysUntil === 0) {
        alerts.push({
          type: 'due-today',
          severity: 'high',
          title: 'Skilar í dag',
          message: `${a.book} kafli ${a.chapter} - ${STAGE_LABELS[a.stage] || a.stage}`,
          assignedTo: a.assignedTo,
          assignmentId: a.id,
          book: a.book,
          chapter: a.chapter,
          stage: a.stage
        });
      } else if (daysUntil === 1) {
        alerts.push({
          type: 'due-tomorrow',
          severity: 'medium',
          title: 'Skilar á morgun',
          message: `${a.book} kafli ${a.chapter} - ${STAGE_LABELS[a.stage] || a.stage}`,
          assignedTo: a.assignedTo,
          assignmentId: a.id,
          book: a.book,
          chapter: a.chapter,
          stage: a.stage
        });
      } else if (daysUntil <= 3) {
        alerts.push({
          type: 'due-soon',
          severity: 'low',
          title: `Skilar eftir ${daysUntil} daga`,
          message: `${a.book} kafli ${a.chapter} - ${STAGE_LABELS[a.stage] || a.stage}`,
          daysUntil,
          assignedTo: a.assignedTo,
          assignmentId: a.id,
          book: a.book,
          chapter: a.chapter,
          stage: a.stage
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    res.json({
      alerts,
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length
    });

  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({
      error: 'Failed to get alerts',
      message: err.message
    });
  }
});

/**
 * Calculate health score (0-100)
 */
function calculateHealthScore(stats) {
  if (stats.total === 0) return 100;

  let score = 100;

  // Deduct for overdue (10 points each, max 50)
  score -= Math.min(stats.overdue * 10, 50);

  // Deduct for due soon (5 points each, max 25)
  score -= Math.min(stats.dueSoon * 5, 25);

  // Deduct for no due dates (2 points each, max 20)
  score -= Math.min(stats.withoutDueDate * 2, 20);

  return Math.max(0, score);
}

module.exports = router;
