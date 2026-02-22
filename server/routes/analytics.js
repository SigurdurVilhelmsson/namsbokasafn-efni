/**
 * Analytics Routes
 *
 * API endpoints for analytics data (admin only).
 *
 * Endpoints:
 *   GET  /api/analytics/stats         Get statistics summary
 *   GET  /api/analytics/recent        Get recent events
 *   POST /api/analytics/event         Log a client-side event (public)
 */

const express = require('express');
const router = express.Router();

const analyticsService = require('../services/analyticsService');
const { requireAuth, optionalAuth } = require('../middleware/requireAuth');
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
    console.error('Error getting analytics stats:', err);
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
    const events = analyticsService.getRecentEvents(parseInt(limit, 10));
    res.json({ events });
  } catch (err) {
    console.error('Error getting recent events:', err);
    res.status(500).json({
      error: 'Failed to get events',
      message: err.message,
    });
  }
});

/**
 * POST /api/analytics/event
 * Log a client-side event (public - for tracking frontend events)
 */
router.post('/event', optionalAuth, (req, res) => {
  const { eventType, book, chapter, section, metadata = {} } = req.body;

  // Validate event type
  const allowedTypes = ['page_view', 'chapter_view', 'section_view', 'error', 'search', 'download'];
  if (!eventType || !allowedTypes.includes(eventType)) {
    return res.status(400).json({
      error: 'Invalid event type',
      message: `Event type must be one of: ${allowedTypes.join(', ')}`,
    });
  }

  // Validate metadata size to prevent abuse
  const metadataStr = JSON.stringify(metadata);
  if (metadataStr.length > 2048) {
    return res.status(400).json({
      error: 'Metadata too large',
      message: `Metadata must be under 2048 characters when serialized (got ${metadataStr.length})`,
    });
  }

  try {
    const event = analyticsService.logEvent({
      eventType,
      book: book || null,
      chapter: chapter || null,
      section: section || null,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
      sessionId: req.cookies?.sessionId || null,
      metadata,
    });

    res.json({ success: true, eventId: event.id });
  } catch (err) {
    console.error('Error logging event:', err);
    res.status(500).json({
      error: 'Failed to log event',
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
    console.error('Error getting dashboard data:', err);
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: err.message,
    });
  }
});

module.exports = router;
