/**
 * Activity Log Routes
 *
 * API endpoints for viewing editorial activity history.
 *
 * Endpoints:
 *   GET /api/activity          Get recent activity
 *   GET /api/activity/user/:id Get activity for a user
 *   GET /api/activity/book/:id Get activity for a book
 */

const express = require('express');
const router = express.Router();

const activityLog = require('../services/activityLog');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

/**
 * GET /api/activity
 * Get recent activity (admin/head-editor only)
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book, type, user, limit, offset } = req.query;

  try {
    const result = activityLog.search({
      book: book || null,
      type: type || null,
      userId: user || null,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });

    res.json(result);
  } catch (err) {
    console.error('Error getting activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/recent
 * Get recent activity (shortcut)
 */
router.get('/recent', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { limit } = req.query;

  try {
    const activities = activityLog.getRecent(parseInt(limit, 10) || 50);
    res.json({ activities });
  } catch (err) {
    console.error('Error getting recent activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/user/:userId
 * Get activity for a specific user
 */
router.get('/user/:userId', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { userId } = req.params;
  const { limit } = req.query;

  try {
    const activities = activityLog.getByUser(userId, parseInt(limit, 10) || 50);
    res.json({ userId, activities });
  } catch (err) {
    console.error('Error getting user activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/book/:book
 * Get activity for a specific book
 */
router.get('/book/:book', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.params;
  const { limit } = req.query;

  try {
    const activities = activityLog.getByBook(book, parseInt(limit, 10) || 50);
    res.json({ book, activities });
  } catch (err) {
    console.error('Error getting book activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/section/:book/:chapter/:section
 * Get activity for a specific section
 */
router.get('/section/:book/:chapter/:section', requireAuth, (req, res) => {
  const { book, chapter, section } = req.params;
  const { limit } = req.query;

  try {
    const activities = activityLog.getBySection(book, chapter, section, parseInt(limit, 10) || 50);
    res.json({ book, chapter, section, activities });
  } catch (err) {
    console.error('Error getting section activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/my
 * Get current user's own activity
 */
router.get('/my', requireAuth, (req, res) => {
  const { limit } = req.query;

  try {
    const activities = activityLog.getByUser(req.user.id, parseInt(limit, 10) || 50);
    res.json({ activities });
  } catch (err) {
    console.error('Error getting my activity:', err);
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/types
 * Get available activity types
 */
router.get('/types', requireAuth, (req, res) => {
  res.json({
    types: Object.entries(activityLog.ACTIVITY_TYPES).map(([key, value]) => ({
      key,
      value,
    })),
  });
});

module.exports = router;
