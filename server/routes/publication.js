/**
 * Publication Routes (v2 — HTML Pipeline)
 *
 * Manages the three-track publication workflow:
 * 1. MT Preview — Machine translation → inject → render → HTML
 * 2. Faithful   — Human-reviewed translation → inject → render → HTML
 * 3. Localized  — Culturally adapted content → inject → render → HTML
 *
 * All publication actions require HEAD_EDITOR approval.
 * Publish endpoints are async: they return a jobId for polling via /api/pipeline/status/:jobId.
 *
 * Endpoints:
 *   GET  /api/publication/:bookSlug/:chapterNum/status       Publication status for all tracks
 *   GET  /api/publication/:bookSlug/:chapterNum/readiness    Readiness check for each track
 *   GET  /api/publication/:bookSlug/:chapterNum/modules      Module-level source availability
 *   POST /api/publication/:bookSlug/:chapterNum/mt-preview   Publish MT preview (HEAD_EDITOR)
 *   POST /api/publication/:bookSlug/:chapterNum/faithful     Publish faithful translation (HEAD_EDITOR)
 *   POST /api/publication/:bookSlug/:chapterNum/localized    Publish localized content (HEAD_EDITOR)
 *   GET  /api/publication/:bookSlug/overview                 Overview for all chapters in a book
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const publicationService = require('../services/publicationService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const activityLog = require('../services/activityLog');
const { VALID_BOOKS } = require('../config');

// Validation middleware for chapter params
function validateChapterParams(req, res, next) {
  const { bookSlug, chapterNum } = req.params;

  if (!bookSlug || !VALID_BOOKS.includes(bookSlug)) {
    return res.status(400).json({
      error: 'Invalid book slug',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`,
    });
  }

  const chapter = parseInt(chapterNum, 10);
  if (isNaN(chapter) || chapter < 1 || chapter > 99) {
    return res.status(400).json({
      error: 'Invalid chapter number',
      message: 'Chapter number must be between 1 and 99',
    });
  }

  req.chapter = chapter;
  next();
}

/**
 * GET /api/publication/:bookSlug/:chapterNum/status
 * Get current publication status for a chapter.
 *
 * Returns:
 * - Status of each publication track (mt-preview, faithful, localized)
 * - Active track (what readers currently see)
 * - Readiness flags for each track
 * - Running pipeline job info if any
 */
router.get('/:bookSlug/:chapterNum/status', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    const status = publicationService.getPublicationStatus(bookSlug, chapter);
    res.json({ book: bookSlug, chapter, ...status });
  } catch (err) {
    console.error('Error getting publication status:', err);
    res.status(500).json({ error: 'Failed to get publication status', message: err.message });
  }
});

/**
 * GET /api/publication/:bookSlug/:chapterNum/readiness
 * Check readiness for each publication track.
 * Returns module-level detail about what's available.
 */
router.get('/:bookSlug/:chapterNum/readiness', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    res.json({
      book: bookSlug,
      chapter,
      mtPreview: publicationService.checkMtPreviewReadiness(bookSlug, chapter),
      faithful: publicationService.checkFaithfulReadiness(bookSlug, chapter),
      localized: publicationService.checkLocalizedReadiness(bookSlug, chapter),
    });
  } catch (err) {
    console.error('Error checking readiness:', err);
    res.status(500).json({ error: 'Failed to check readiness', message: err.message });
  }
});

/**
 * GET /api/publication/:bookSlug/:chapterNum/modules
 * Get module-level publication info for a chapter.
 * Shows which modules have source files for each track.
 */
router.get('/:bookSlug/:chapterNum/modules', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    const moduleStatus = publicationService.getModulePublicationStatus(bookSlug, chapter);
    res.json({ book: bookSlug, chapter, ...moduleStatus });
  } catch (err) {
    console.error('Error getting module status:', err);
    res.status(500).json({ error: 'Failed to get module status', message: err.message });
  }
});

/**
 * POST /api/publication/:bookSlug/:chapterNum/mt-preview
 * Publish MT preview for a chapter.
 *
 * Requires: HEAD_EDITOR role
 * Returns: { jobId, track, chapter, moduleCount, modules }
 * Poll pipeline status via: GET /api/pipeline/status/:jobId
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
      const result = await publicationService.publishMtPreview(bookSlug, chapter, req.user.id);

      // Log activity
      try {
        activityLog.log({
          type: 'publish_mt_preview',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Started MT preview publication for ${bookSlug} chapter ${chapter}`,
          metadata: { jobId: result.jobId, moduleCount: result.moduleCount },
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `MT preview pipeline started for chapter ${chapter}`,
        ...result,
      });
    } catch (err) {
      console.error('Error publishing MT preview:', err);
      if (err.validation) {
        return res.status(400).json({
          error: 'Content validation failed',
          message: err.message,
          validation: err.validation,
        });
      }
      const status = err.message.includes('not ready')
        ? 400
        : err.message.includes('already running')
          ? 409
          : 500;
      res.status(status).json({ error: 'Failed to publish MT preview', message: err.message });
    }
  }
);

/**
 * POST /api/publication/:bookSlug/:chapterNum/faithful
 * Publish faithful translation for a chapter.
 *
 * Requires: HEAD_EDITOR role
 * Requires: 03-faithful-translation/ has segment files (from Phase 9 apply)
 * Returns: { jobId, track, chapter, moduleCount, modules }
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
      const result = await publicationService.publishFaithful(bookSlug, chapter, req.user.id);

      try {
        activityLog.log({
          type: 'publish_faithful',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Started faithful publication for ${bookSlug} chapter ${chapter}`,
          metadata: { jobId: result.jobId, moduleCount: result.moduleCount },
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Faithful publication pipeline started for chapter ${chapter}`,
        ...result,
      });
    } catch (err) {
      console.error('Error publishing faithful translation:', err);
      if (err.validation) {
        return res.status(400).json({
          error: 'Content validation failed',
          message: err.message,
          validation: err.validation,
        });
      }
      const status = err.message.includes('not ready')
        ? 400
        : err.message.includes('already running')
          ? 409
          : 500;
      res
        .status(status)
        .json({ error: 'Failed to publish faithful translation', message: err.message });
    }
  }
);

/**
 * POST /api/publication/:bookSlug/:chapterNum/localized
 * Publish localized content for a chapter.
 *
 * Requires: HEAD_EDITOR role
 * Requires: 04-localized-content/ has segment files
 * Returns: { jobId, track, chapter, moduleCount, modules }
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
      const result = await publicationService.publishLocalized(bookSlug, chapter, req.user.id);

      try {
        activityLog.log({
          type: 'publish_localized',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Started localized publication for ${bookSlug} chapter ${chapter}`,
          metadata: { jobId: result.jobId, moduleCount: result.moduleCount },
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Localized publication pipeline started for chapter ${chapter}`,
        ...result,
      });
    } catch (err) {
      console.error('Error publishing localized content:', err);
      if (err.validation) {
        return res.status(400).json({
          error: 'Content validation failed',
          message: err.message,
          validation: err.validation,
        });
      }
      const status = err.message.includes('not ready')
        ? 400
        : err.message.includes('already running')
          ? 409
          : 500;
      res
        .status(status)
        .json({ error: 'Failed to publish localized content', message: err.message });
    }
  }
);

/**
 * GET /api/publication/:bookSlug/overview
 * Get publication overview for all chapters in a book.
 */
router.get('/:bookSlug/overview', requireAuth, (req, res) => {
  const { bookSlug } = req.params;

  if (!VALID_BOOKS.includes(bookSlug)) {
    return res.status(400).json({ error: 'Invalid book' });
  }

  const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
  const bookDir = path.join(BOOKS_DIR, bookSlug);

  if (!fs.existsSync(bookDir)) {
    return res.status(404).json({
      error: 'Book not found',
      message: 'The requested book does not exist',
    });
  }

  try {
    // Find all chapters by checking for ch## directories in 02-mt-output
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

    const overview = chapters.map((chapterNum) => {
      const status = publicationService.getPublicationStatus(bookSlug, chapterNum);
      return { chapter: chapterNum, ...status };
    });

    res.json({
      book: bookSlug,
      chapters: overview,
      summary: {
        total: chapters.length,
        mtPreviewPublished: overview.filter((c) => c.mtPreview.published).length,
        faithfulPublished: overview.filter((c) => c.faithful.published).length,
        localizedPublished: overview.filter((c) => c.localized.published).length,
      },
    });
  } catch (err) {
    console.error('Error getting book overview:', err);
    res.status(500).json({ error: 'Failed to get book overview', message: err.message });
  }
});

module.exports = router;
