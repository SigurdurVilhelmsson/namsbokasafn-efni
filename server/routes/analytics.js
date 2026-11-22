/**
 * Analytics Routes
 *
 * API endpoints for analytics data (admin only).
 *
 * Endpoints:
 *   GET  /api/analytics/stats           Get statistics summary
 *   GET  /api/analytics/recent          Get recent events
 *   GET  /api/analytics/dashboard-data  Get the dashboard's figures
 *
 * The public write, POST /api/analytics/event, is retired ([USER] 2026-11-22; the G1.15(b) final review's I-1). It
 * needed no sign-in, and from 2029 a row it wrote would have raised the editorial retention script's continued-use
 * refusal. The reader had stopped sending it (D03). These reads show the rows it stored until retention step 1
 * deletes them (server/lib/editorialRetentionScope.js); analyticsWriteRetired.test.js holds that nothing writes them.
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const analyticsService = require('../services/analyticsService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

/**
 * GET /api/analytics/stats
 * Get analytics statistics (admin only)
 */
router.get('/stats', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { period = '-7 days' } = req.query;

  // Validate period
  const validPeriods = ['-1 day', '-7 days', '-30 days', '-90 days'];
  const safePeriod = validPeriods.includes(period) ? period : '-7 days';

  try {
    const stats = analyticsService.getStats(safePeriod);
    res.json(stats);
  } catch (err) {
    log.error({ err }, 'Error getting analytics stats');
    res.status(500).json({
      error: 'Failed to get stats',
      message: err.message,
    });
  }
});

/**
 * GET /api/analytics/recent
 * Get recent events (admin only)
 */
router.get('/recent', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { limit = 100 } = req.query;

  try {
    const events = analyticsService.getRecentEvents(Math.min(parseInt(limit, 10) || 100, 200));
    res.json({ events });
  } catch (err) {
    log.error({ err }, 'Error getting recent events');
    res.status(500).json({
      error: 'Failed to get events',
      message: err.message,
    });
  }
});

/**
 * GET /api/analytics/dashboard-data
 * Get all data needed for analytics dashboard (admin only)
 */
router.get('/dashboard-data', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const weekStats = analyticsService.getStats('-7 days');
    const monthStats = analyticsService.getStats('-30 days');

    res.json({
      week: weekStats,
      month: monthStats,
      summary: {
        weeklyPageViews: weekStats.totalPageViews,
        monthlyPageViews: monthStats.totalPageViews,
        weeklyUniqueSessions: weekStats.uniqueSessions,
        monthlyUniqueSessions: monthStats.uniqueSessions,
      },
    });
  } catch (err) {
    log.error({ err }, 'Error getting dashboard data');
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: err.message,
    });
  }
});

module.exports = router;
