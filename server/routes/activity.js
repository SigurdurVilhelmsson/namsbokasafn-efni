/**
 * Activity Log Routes
 *
 * API endpoints for viewing editorial activity history.
 *
 * Endpoints:
 *   GET /api/activity          Search the log (a head editor: one book they hold; an admin: any)
 *   GET /api/activity/recent   Recent activity across all books (admin)
 *   GET /api/activity/user/:id Activity for a user across all books (admin)
 *   GET /api/activity/book/:id Activity for a book (its head editor, or an admin)
 *
 * Every row names who did what, so a read is held to the books the reader works on
 * (lib/activityScope: a book-access row or a chapter assignment; an admin reads every book's). A read that
 * spans books is an admin's.
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const activityLog = require('../services/activityLog');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, requireHeadEditor, ROLES } = require('../middleware/requireRole');
const { mayReadLogOf, refuseOtherBook } = require('../lib/activityScope');

/**
 * GET /api/activity?book=&chapter=&type=&user=
 * Search the log. A head editor must name a book they hold: /book/:book asks the same, and
 * without it here `?book=` read any book's log and no `book` at all read every book's.
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book, type, user, chapter, limit, offset } = req.query;

  if (req.user.role !== ROLES.ADMIN) {
    const held = mayReadLogOf(req.user, book);
    if (!held) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message:
          typeof book === 'string' && book
            ? `Head editor access for ${book} is required`
            : 'Name a book you are head editor of (?book=)',
        yourRole: req.user.role,
        yourBooks: req.user.books,
      });
    }
  }

  try {
    const result = activityLog.search({
      book: book || null,
      type: type || null,
      userId: user || null,
      chapter: chapter || null,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Error getting activity');
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/recent
 * Recent activity across all books (admin: it is not one book's log)
 */
router.get('/recent', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { limit } = req.query;

  try {
    const activities = activityLog.getRecent(Math.min(parseInt(limit, 10) || 50, 200));
    res.json({ activities });
  } catch (err) {
    log.error({ err }, 'Error getting recent activity');
    res.status(500).json({
      error: 'Failed to get activity',
      message: err.message,
    });
  }
});

/**
 * GET /api/activity/user/:userId
 * One person's activity across all books (admin; a person's own is GET /my)
 */
router.get('/user/:userId', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { userId } = req.params;
  const { limit } = req.query;

  try {
    const activities = activityLog.getByUser(userId, Math.min(parseInt(limit, 10) || 50, 200));
    res.json({ userId, activities });
  } catch (err) {
    log.error({ err }, 'Error getting user activity');
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
router.get('/book/:book', requireAuth, requireHeadEditor('book'), (req, res) => {
  const { book } = req.params;
  const { limit } = req.query;

  try {
    const activities = activityLog.getByBook(book, Math.min(parseInt(limit, 10) || 50, 200));
    res.json({ book, activities });
  } catch (err) {
    log.error({ err }, 'Error getting book activity');
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
router.get(
  '/section/:book/:chapter/:section',
  requireAuth,
  requireRole(ROLES.EDITOR), // each row names who did what
  (req, res) => {
    const { book, chapter, section } = req.params;
    const { limit } = req.query;

    if (!mayReadLogOf(req.user, book)) {
      return refuseOtherBook(res, book);
    }

    try {
      const activities = activityLog.getBySection(
        book,
        chapter,
        section,
        Math.min(parseInt(limit, 10) || 50, 200)
      );
      res.json({ book, chapter, section, activities });
    } catch (err) {
      log.error({ err }, 'Error getting section activity');
      res.status(500).json({
        error: 'Failed to get activity',
        message: err.message,
      });
    }
  }
);

/**
 * GET /api/activity/my
 * Get current user's own activity
 */
router.get('/my', requireAuth, (req, res) => {
  const { limit } = req.query;

  try {
    const activities = activityLog.getByUser(req.user.id, Math.min(parseInt(limit, 10) || 50, 200));
    res.json({ activities });
  } catch (err) {
    log.error({ err }, 'Error getting my activity');
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
