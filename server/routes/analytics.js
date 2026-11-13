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

const log = require('../lib/logger');
const analyticsService = require('../services/analyticsService');
const { requireAuth, optionalAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

const PLACE_FIELD_MAX_LENGTH = 200;

/**
 * A book, chapter or section named by an analytics event: absent, a number, or short plain text.
 *
 * No book slug, chapter number or section id contains a markup delimiter or a control character,
 * so a value that does is refused, not repaired. Free text belongs in `metadata` (a search query,
 * say), which is never trusted as markup either: see anUpdateActivity in views/admin.html.
 *
 * A number is stored as its digits: the columns are text, and a number bound as it came was
 * kept as "3.0" (and the appendices sentinel -1 as "-1.0").
 *
 * @param {unknown} value
 * @returns {{ok: true, value: string|null}|{ok: false}}
 */
function placeField(value) {
  if (value === undefined || value === null || value === '' || value === 0 || value === false) {
    return { ok: true, value: null }; // what `value || null` stored before this check existed
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value: String(value) } : { ok: false };
  }
  if (typeof value !== 'string' || value.length > PLACE_FIELD_MAX_LENGTH) return { ok: false };
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (ch === '<' || ch === '>' || code < 0x20 || code === 0x7f) return { ok: false };
  }
  return { ok: true, value };
}

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
 * POST /api/analytics/event
 * Log a client-side event (public - for tracking frontend events)
 */
router.post('/event', optionalAuth, (req, res) => {
  const { eventType, book, chapter, section, metadata = {} } = req.body || {};

  // Validate event type
  const allowedTypes = ['page_view', 'chapter_view', 'section_view', 'error', 'search', 'download'];
  if (!eventType || !allowedTypes.includes(eventType)) {
    return res.status(400).json({
      error: 'Invalid event type',
      message: `Event type must be one of: ${allowedTypes.join(', ')}`,
    });
  }

  // This route needs no sign-in, and what it stores is shown to admins. The place fields are
  // held to short plain text here, as well as being escaped where the admin page displays them.
  const where = {
    book: placeField(book),
    chapter: placeField(chapter),
    section: placeField(section),
  };
  if (!where.book.ok || !where.chapter.ok || !where.section.ok) {
    return res.status(400).json({
      error: 'Invalid event',
      message: `book, chapter and section must be plain text of at most ${PLACE_FIELD_MAX_LENGTH} characters`,
    });
  }

  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return res.status(400).json({
      error: 'Invalid event',
      message: 'metadata must be an object',
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
      book: where.book.value,
      chapter: where.chapter.value,
      section: where.section.value,
      userAgent: req.get('user-agent'),
      referrer: req.get('referer'),
      sessionId: req.cookies?.sessionId || null,
      metadata,
    });

    res.json({ success: true, eventId: event.id });
  } catch (err) {
    log.error({ err }, 'Error logging event');
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
    log.error({ err }, 'Error getting dashboard data');
    res.status(500).json({
      error: 'Failed to get dashboard data',
      message: err.message,
    });
  }
});

module.exports = router;
