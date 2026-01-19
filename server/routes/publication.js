/**
 * Publication Routes
 *
 * Manages the three-track publication workflow:
 * 1. MT Preview - Machine translation (labeled as such)
 * 2. Faithful - Human-reviewed linguistic translation
 * 3. Localized - Culturally adapted for Iceland
 *
 * All publication actions require HEAD_EDITOR approval.
 *
 * Endpoints:
 *   GET  /api/publication/:bookSlug/:chapterNum/status       Get publication status
 *   GET  /api/publication/:bookSlug/:chapterNum/readiness    Check readiness for each track
 *   POST /api/publication/:bookSlug/:chapterNum/mt-preview   Publish MT preview
 *   POST /api/publication/:bookSlug/:chapterNum/faithful     Publish faithful translation
 *   POST /api/publication/:bookSlug/:chapterNum/localized    Publish localized content
 */

const express = require('express');
const router = express.Router();

const publicationService = require('../services/publicationService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const activityService = require('../services/activityService');

// Validation middleware for chapter params
function validateChapterParams(req, res, next) {
  const { bookSlug, chapterNum } = req.params;

  if (!bookSlug || !/^[a-z0-9-]+$/.test(bookSlug)) {
    return res.status(400).json({
      error: 'Invalid book slug',
      message: 'Book slug must be lowercase alphanumeric with hyphens'
    });
  }

  const chapter = parseInt(chapterNum, 10);
  if (isNaN(chapter) || chapter < 1 || chapter > 99) {
    return res.status(400).json({
      error: 'Invalid chapter number',
      message: 'Chapter number must be between 1 and 99'
    });
  }

  req.chapter = chapter;
  next();
}

/**
 * GET /api/publication/:bookSlug/:chapterNum/status
 * Get current publication status for a chapter
 *
 * Returns:
 * - Status of each publication track (mt-preview, faithful, localized)
 * - Active track (what readers currently see)
 * - Readiness flags for next possible publications
 */
router.get('/:bookSlug/:chapterNum/status', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    const status = publicationService.getPublicationStatus(bookSlug, chapter);

    res.json({
      book: bookSlug,
      chapter,
      ...status
    });
  } catch (err) {
    console.error('Error getting publication status:', err);
    res.status(500).json({
      error: 'Failed to get publication status',
      message: err.message
    });
  }
});

/**
 * GET /api/publication/:bookSlug/:chapterNum/readiness
 * Check readiness for each publication track
 *
 * Returns detailed readiness info including what's blocking publication
 */
router.get('/:bookSlug/:chapterNum/readiness', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    const readiness = {
      book: bookSlug,
      chapter,
      mtPreview: publicationService.checkMtPreviewReadiness(bookSlug, chapter),
      faithful: publicationService.checkFaithfulReadiness(bookSlug, chapter),
      localized: publicationService.checkLocalizedReadiness(bookSlug, chapter)
    };

    res.json(readiness);
  } catch (err) {
    console.error('Error checking readiness:', err);
    res.status(500).json({
      error: 'Failed to check readiness',
      message: err.message
    });
  }
});

/**
 * POST /api/publication/:bookSlug/:chapterNum/mt-preview
 * Publish MT preview for a chapter
 *
 * Requires: HEAD_EDITOR role
 *
 * This pushes machine-translated content to publication with a clear
 * warning label that it has not been human-reviewed.
 */
router.post(
  '/:bookSlug/:chapterNum/mt-preview',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug } = req.params;
    const { chapter } = req;

    try {
      // Check readiness first
      const readiness = publicationService.checkMtPreviewReadiness(bookSlug, chapter);
      if (!readiness.ready) {
        return res.status(400).json({
          error: 'Chapter not ready for MT preview publication',
          reason: readiness.reason,
          details: readiness
        });
      }

      // Publish
      const result = publicationService.publishMtPreview(
        bookSlug,
        chapter,
        req.user.id,
        req.user.name || req.user.login
      );

      // Log activity
      try {
        activityService.logActivity({
          userId: req.user.id,
          username: req.user.name || req.user.login,
          action: 'publish_mt_preview',
          targetType: 'chapter',
          targetId: `${bookSlug}:ch${String(chapter).padStart(2, '0')}`,
          details: {
            book: bookSlug,
            chapter,
            filesPublished: result.filesPublished
          }
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `MT preview published for chapter ${chapter}`,
        ...result
      });
    } catch (err) {
      console.error('Error publishing MT preview:', err);
      res.status(500).json({
        error: 'Failed to publish MT preview',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/publication/:bookSlug/:chapterNum/faithful
 * Publish faithful translation for a chapter
 *
 * Requires: HEAD_EDITOR role
 * Requires: All sections have passed linguistic review
 *
 * This replaces the MT preview with human-reviewed content.
 */
router.post(
  '/:bookSlug/:chapterNum/faithful',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug } = req.params;
    const { chapter } = req;

    try {
      // Check readiness first
      const readiness = publicationService.checkFaithfulReadiness(bookSlug, chapter);
      if (!readiness.ready) {
        return res.status(400).json({
          error: 'Chapter not ready for faithful publication',
          reason: readiness.reason,
          details: readiness
        });
      }

      // Publish
      const result = publicationService.publishFaithful(
        bookSlug,
        chapter,
        req.user.id,
        req.user.name || req.user.login
      );

      // Log activity
      try {
        activityService.logActivity({
          userId: req.user.id,
          username: req.user.name || req.user.login,
          action: 'publish_faithful',
          targetType: 'chapter',
          targetId: `${bookSlug}:ch${String(chapter).padStart(2, '0')}`,
          details: {
            book: bookSlug,
            chapter,
            filesPublished: result.filesPublished,
            replacesMtPreview: result.replacesMtPreview
          }
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Faithful translation published for chapter ${chapter}`,
        ...result
      });
    } catch (err) {
      console.error('Error publishing faithful translation:', err);
      res.status(500).json({
        error: 'Failed to publish faithful translation',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/publication/:bookSlug/:chapterNum/localized
 * Publish localized content for a chapter
 *
 * Requires: HEAD_EDITOR role
 * Requires: All sections have passed localization review
 *
 * This replaces the faithful translation with culturally adapted content.
 */
router.post(
  '/:bookSlug/:chapterNum/localized',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug } = req.params;
    const { chapter } = req;

    try {
      // Check readiness first
      const readiness = publicationService.checkLocalizedReadiness(bookSlug, chapter);
      if (!readiness.ready) {
        return res.status(400).json({
          error: 'Chapter not ready for localized publication',
          reason: readiness.reason,
          details: readiness
        });
      }

      // Publish
      const result = publicationService.publishLocalized(
        bookSlug,
        chapter,
        req.user.id,
        req.user.name || req.user.login
      );

      // Log activity
      try {
        activityService.logActivity({
          userId: req.user.id,
          username: req.user.name || req.user.login,
          action: 'publish_localized',
          targetType: 'chapter',
          targetId: `${bookSlug}:ch${String(chapter).padStart(2, '0')}`,
          details: {
            book: bookSlug,
            chapter,
            filesPublished: result.filesPublished,
            replacesFaithful: result.replacesFaithful
          }
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Localized content published for chapter ${chapter}`,
        ...result
      });
    } catch (err) {
      console.error('Error publishing localized content:', err);
      res.status(500).json({
        error: 'Failed to publish localized content',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/publication/:bookSlug/overview
 * Get publication overview for all chapters in a book
 */
router.get('/:bookSlug/overview', requireAuth, (req, res) => {
  const { bookSlug } = req.params;
  const fs = require('fs');
  const path = require('path');

  const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
  const bookDir = path.join(BOOKS_DIR, bookSlug);

  if (!fs.existsSync(bookDir)) {
    return res.status(404).json({
      error: 'Book not found',
      message: `Book '${bookSlug}' does not exist`
    });
  }

  try {
    // Find all chapters by checking for ch## directories
    const mtOutputDir = path.join(bookDir, '02-mt-output');
    const chapters = [];

    if (fs.existsSync(mtOutputDir)) {
      const dirs = fs.readdirSync(mtOutputDir);
      for (const dir of dirs) {
        const match = dir.match(/^ch(\d{2})$/);
        if (match) {
          chapters.push(parseInt(match[1], 10));
        }
      }
    }

    chapters.sort((a, b) => a - b);

    // Get status for each chapter
    const overview = chapters.map(chapterNum => {
      const status = publicationService.getPublicationStatus(bookSlug, chapterNum);
      return {
        chapter: chapterNum,
        ...status
      };
    });

    res.json({
      book: bookSlug,
      chapters: overview,
      summary: {
        total: chapters.length,
        mtPreviewPublished: overview.filter(c => c.mtPreview.published).length,
        faithfulPublished: overview.filter(c => c.faithful.published).length,
        localizedPublished: overview.filter(c => c.localized.published).length
      }
    });
  } catch (err) {
    console.error('Error getting book overview:', err);
    res.status(500).json({
      error: 'Failed to get book overview',
      message: err.message
    });
  }
});

module.exports = router;
