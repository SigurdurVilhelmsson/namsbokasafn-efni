/**
 * Notifications Routes
 *
 * API endpoints for user notifications.
 *
 * Endpoints:
 *   GET  /api/notifications           Get user's notifications
 *   GET  /api/notifications/count     Get unread count
 *   POST /api/notifications/:id/read  Mark as read
 *   POST /api/notifications/read-all  Mark all as read
 */

const express = require('express');
const router = express.Router();

const notifications = require('../services/notifications');
const { requireAuth } = require('../middleware/requireAuth');

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
router.get('/', requireAuth, (req, res) => {
  const { unread, limit } = req.query;

  try {
    const maxLimit = Math.min(parseInt(limit) || 20, 100);

    const items = unread === 'true'
      ? notifications.getUnreadNotifications(req.user.id, maxLimit)
      : notifications.getAllNotifications(req.user.id, maxLimit);

    res.json({
      notifications: items,
      unreadCount: notifications.getUnreadCount(req.user.id)
    });
  } catch (err) {
    console.error('Error getting notifications:', err);
    res.status(500).json({
      error: 'Failed to get notifications',
      message: err.message
    });
  }
});

/**
 * GET /api/notifications/count
 * Get unread notification count
 */
router.get('/count', requireAuth, (req, res) => {
  try {
    const count = notifications.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    console.error('Error getting notification count:', err);
    res.status(500).json({
      error: 'Failed to get notification count',
      message: err.message
    });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    notifications.markAsRead(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: err.message
    });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', requireAuth, (req, res) => {
  try {
    notifications.markAllAsRead(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({
      error: 'Failed to mark notifications as read',
      message: err.message
    });
  }
});

/**
 * GET /api/notifications/preferences
 * Get notification preferences for current user
 */
router.get('/preferences', requireAuth, (req, res) => {
  try {
    const prefs = notifications.getPreferences(req.user.id);
    res.json({
      preferences: prefs,
      categories: notifications.NOTIFICATION_CATEGORIES,
      defaults: notifications.DEFAULT_PREFERENCES
    });
  } catch (err) {
    console.error('Error getting notification preferences:', err);
    res.status(500).json({
      error: 'Failed to get preferences',
      message: err.message
    });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 *
 * Body: {
 *   reviews: { inApp: true, email: false },
 *   assignments: { inApp: true, email: true },
 *   feedback: { inApp: true, email: true }
 * }
 */
router.put('/preferences', requireAuth, (req, res) => {
  const { body } = req;

  // Validate structure
  const validCategories = Object.keys(notifications.NOTIFICATION_CATEGORIES);
  const preferences = {};

  for (const category of validCategories) {
    if (body[category]) {
      preferences[category] = {
        inApp: body[category].inApp !== false,
        email: body[category].email !== false
      };
    }
  }

  try {
    const updated = notifications.setPreferences(req.user.id, preferences);
    res.json({
      success: true,
      preferences: updated
    });
  } catch (err) {
    console.error('Error updating notification preferences:', err);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: err.message
    });
  }
});

module.exports = router;
