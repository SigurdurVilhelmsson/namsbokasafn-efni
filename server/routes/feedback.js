/**
 * Feedback Routes
 *
 * API endpoints for feedback collection and management.
 *
 * Public endpoints (no auth required):
 *   POST /api/feedback            Submit feedback (for teachers/students)
 *   GET  /api/feedback/types      Get available feedback types
 *
 * Admin endpoints (requires HEAD_EDITOR role):
 *   GET  /api/feedback            List all feedback with filters
 *   GET  /api/feedback/stats      Get feedback statistics
 *   GET  /api/feedback/:id        Get feedback details
 *   POST /api/feedback/:id/status Update status
 *   POST /api/feedback/:id/resolve Mark as resolved
 *   POST /api/feedback/:id/priority Set priority
 *   POST /api/feedback/:id/assign  Assign to user
 *   POST /api/feedback/:id/respond Add response
 */

const express = require('express');
const router = express.Router();

const feedbackService = require('../services/feedbackService');
const notifications = require('../services/notifications');
const { requireAuth, optionalAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

// ============================================================================
// Public Endpoints
// ============================================================================

/**
 * GET /api/feedback/types
 * Get available feedback types for the form
 */
router.get('/types', (req, res) => {
  res.json({
    types: Object.entries(feedbackService.FEEDBACK_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  });
});

/**
 * POST /api/feedback
 * Submit feedback (public - no auth required)
 */
router.post('/', optionalAuth, async (req, res) => {
  const { type, book, chapter, section, message, userEmail, userName } = req.body;

  // Validate required fields
  if (!type) {
    return res.status(400).json({
      error: 'Missing type',
      message: 'Feedback type is required',
    });
  }

  if (!message || message.trim().length < 10) {
    return res.status(400).json({
      error: 'Invalid message',
      message: 'Message must be at least 10 characters',
    });
  }

  try {
    // Determine priority based on type
    let priority = feedbackService.PRIORITIES.NORMAL;
    if (type === feedbackService.FEEDBACK_TYPES.TECHNICAL_ISSUE) {
      priority = feedbackService.PRIORITIES.HIGH;
    }

    const feedback = feedbackService.submitFeedback({
      type,
      book: book || null,
      chapter: chapter || null,
      section: section || null,
      message,
      userEmail: userEmail || null,
      userName: userName || req.user?.name || null,
      priority,
    });

    // Send email notification to admins
    try {
      const typeLabel = feedbackService.FEEDBACK_TYPE_LABELS[type];
      console.log('[Feedback] New feedback submitted:', feedback.id, '-', typeLabel);

      // Send email + in-app notification
      const notifyResult = await notifications.notifyFeedbackReceived(feedback, typeLabel);
      if (notifyResult.emailSent) {
        console.log('[Feedback] Email notification sent to admin');
      }
    } catch (notifyErr) {
      console.error('[Feedback] Notification error:', notifyErr);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      feedback,
      message: 'Takk fyrir endurgjöfina! (Thank you for your feedback!)',
    });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(400).json({
      error: 'Submission failed',
      message: err.message,
    });
  }
});

// ============================================================================
// Admin Endpoints
// ============================================================================

/**
 * GET /api/feedback
 * List all feedback with filters (admin only)
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { status, type, book, priority, limit = 50, offset = 0 } = req.query;

  try {
    const result = feedbackService.searchFeedback({
      status: status || null,
      type: type || null,
      book: book || null,
      priority: priority || null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json(result);
  } catch (err) {
    console.error('Error listing feedback:', err);
    res.status(500).json({
      error: 'Failed to list feedback',
      message: err.message,
    });
  }
});

/**
 * GET /api/feedback/stats
 * Get feedback statistics (admin only)
 */
router.get('/stats', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const stats = feedbackService.getStats();
    res.json(stats);
  } catch (err) {
    console.error('Error getting stats:', err);
    res.status(500).json({
      error: 'Failed to get stats',
      message: err.message,
    });
  }
});

/**
 * GET /api/feedback/open
 * Get open feedback items (admin only)
 */
router.get('/open', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { limit = 100 } = req.query;

  try {
    const items = feedbackService.getOpenFeedback(parseInt(limit, 10));
    res.json({ items, count: items.length });
  } catch (err) {
    console.error('Error getting open feedback:', err);
    res.status(500).json({
      error: 'Failed to get open feedback',
      message: err.message,
    });
  }
});

/**
 * GET /api/feedback/:id
 * Get feedback details (admin only)
 */
router.get('/:id', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const feedback = feedbackService.getFeedback(parseInt(id, 10));

    if (!feedback) {
      return res.status(404).json({
        error: 'Not found',
        message: `Feedback ${id} not found`,
      });
    }

    res.json(feedback);
  } catch (err) {
    console.error('Error getting feedback:', err);
    res.status(500).json({
      error: 'Failed to get feedback',
      message: err.message,
    });
  }
});

/**
 * POST /api/feedback/:id/status
 * Update feedback status (admin only)
 */
router.post('/:id/status', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({
      error: 'Missing status',
      message: 'Status is required',
    });
  }

  try {
    const feedback = feedbackService.updateStatus(parseInt(id, 10), status);

    res.json({
      success: true,
      feedback,
    });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(400).json({
      error: 'Update failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/feedback/:id/resolve
 * Mark feedback as resolved (admin only)
 */
router.post('/:id/resolve', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const feedback = feedbackService.resolveFeedback(
      parseInt(id, 10),
      req.user.id,
      req.user.name || req.user.username,
      notes
    );

    res.json({
      success: true,
      feedback,
    });
  } catch (err) {
    console.error('Error resolving feedback:', err);
    res.status(400).json({
      error: 'Resolve failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/feedback/:id/priority
 * Set feedback priority (admin only)
 */
router.post('/:id/priority', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  if (!priority) {
    return res.status(400).json({
      error: 'Missing priority',
      message: 'Priority is required',
    });
  }

  try {
    const feedback = feedbackService.setPriority(parseInt(id, 10), priority);

    res.json({
      success: true,
      feedback,
    });
  } catch (err) {
    console.error('Error setting priority:', err);
    res.status(400).json({
      error: 'Update failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/feedback/:id/assign
 * Assign feedback to user (admin only)
 */
router.post('/:id/assign', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { assignee } = req.body;

  try {
    const feedback = feedbackService.assignFeedback(parseInt(id, 10), assignee || null);

    res.json({
      success: true,
      feedback,
    });
  } catch (err) {
    console.error('Error assigning feedback:', err);
    res.status(400).json({
      error: 'Assign failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/feedback/:id/respond
 * Add response to feedback (admin only)
 */
router.post('/:id/respond', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { message, isInternal = false } = req.body;

  if (!message || message.trim().length < 1) {
    return res.status(400).json({
      error: 'Missing message',
      message: 'Response message is required',
    });
  }

  try {
    const response = feedbackService.addResponse(
      parseInt(id, 10),
      req.user.id,
      req.user.name || req.user.username,
      message,
      isInternal
    );

    res.json({
      success: true,
      response,
    });
  } catch (err) {
    console.error('Error adding response:', err);
    res.status(400).json({
      error: 'Response failed',
      message: err.message,
    });
  }
});

module.exports = router;
