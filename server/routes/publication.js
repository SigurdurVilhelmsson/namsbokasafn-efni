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
const activityLog = require('../services/activityLog');

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
 * GET /api/publication/:bookSlug/:chapterNum/sections
 * Get section-level publication status for a chapter
 *
 * Returns each section's approval and publication state
 */
router.get('/:bookSlug/:chapterNum/sections', requireAuth, validateChapterParams, (req, res) => {
  const { bookSlug } = req.params;
  const { chapter } = req;

  try {
    const sectionStatus = publicationService.getSectionPublicationStatus(bookSlug, chapter);

    res.json({
      book: bookSlug,
      chapter,
      ...sectionStatus
    });
  } catch (err) {
    console.error('Error getting section status:', err);
    res.status(500).json({
      error: 'Failed to get section status',
      message: err.message
    });
  }
});

/**
 * GET /api/publication/:bookSlug/:chapterNum/:type/preview
 * Preview what files will be created/overwritten before publishing
 *
 * Type can be: mt-preview, faithful, localized
 * Requires: HEAD_EDITOR role
 */
router.get(
  '/:bookSlug/:chapterNum/:type/preview',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  (req, res) => {
    const { bookSlug, type } = req.params;
    const { chapter } = req;

    try {
      let preview;
      switch (type) {
        case 'mt-preview':
          preview = publicationService.publishMtPreview(bookSlug, chapter, null, null, { dryRun: true });
          break;
        case 'faithful':
          preview = publicationService.publishFaithful(bookSlug, chapter, null, null, { dryRun: true });
          break;
        case 'localized':
          preview = publicationService.publishLocalized(bookSlug, chapter, null, null, { dryRun: true });
          break;
        default:
          return res.status(400).json({
            error: 'Invalid publication type',
            message: 'Type must be mt-preview, faithful, or localized'
          });
      }

      res.json({
        book: bookSlug,
        chapter,
        type,
        ...preview
      });
    } catch (err) {
      console.error('Error getting publication preview:', err);
      res.status(400).json({
        error: 'Failed to get publication preview',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/publication/:bookSlug/:chapterNum/:type/:section/preview
 * Preview what files will be created/overwritten for a single section
 *
 * Type can be: faithful, localized (MT preview is chapter-level only)
 * Requires: HEAD_EDITOR role
 */
router.get(
  '/:bookSlug/:chapterNum/:type/:section/preview',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  (req, res) => {
    const { bookSlug, type, section } = req.params;
    const { chapter } = req;

    try {
      let preview;
      switch (type) {
        case 'faithful':
          preview = publicationService.publishFaithfulSection(bookSlug, chapter, section, null, null, { dryRun: true });
          break;
        case 'localized':
          preview = publicationService.publishLocalizedSection(bookSlug, chapter, section, null, null, { dryRun: true });
          break;
        default:
          return res.status(400).json({
            error: 'Invalid publication type',
            message: 'Section-level publishing supports faithful or localized only'
          });
      }

      res.json({
        book: bookSlug,
        chapter,
        section,
        type,
        ...preview
      });
    } catch (err) {
      console.error('Error getting section publication preview:', err);
      res.status(400).json({
        error: 'Failed to get section publication preview',
        message: err.message
      });
    }
  }
);

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
        activityLog.log({
          type: 'publish_mt_preview',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Published MT preview for ${bookSlug} chapter ${chapter}`,
          metadata: { filesPublished: result.filesPublished }
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
        activityLog.log({
          type: 'publish_faithful',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Published faithful translation for ${bookSlug} chapter ${chapter}`,
          metadata: { filesPublished: result.filesPublished, replacesMtPreview: result.replacesMtPreview }
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
        activityLog.log({
          type: 'publish_localized',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Published localized content for ${bookSlug} chapter ${chapter}`,
          metadata: { filesPublished: result.filesPublished, replacesFaithful: result.replacesFaithful }
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
 * POST /api/publication/:bookSlug/:chapterNum/faithful/:section
 * Publish faithful translation for a single section
 *
 * Requires: HEAD_EDITOR role
 * Requires: Section has passed linguistic review
 */
router.post(
  '/:bookSlug/:chapterNum/faithful/:section',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug, section } = req.params;
    const { chapter } = req;

    try {
      // Check section readiness
      const readiness = publicationService.checkSectionReadiness(bookSlug, chapter, section);
      if (!readiness.ready) {
        return res.status(400).json({
          error: 'Section not ready for faithful publication',
          reason: readiness.reason,
          details: readiness
        });
      }

      // Publish section
      const result = publicationService.publishFaithfulSection(
        bookSlug,
        chapter,
        section,
        req.user.id,
        req.user.name || req.user.login
      );

      // Log activity
      try {
        activityLog.log({
          type: 'publish_faithful_section',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          section,
          description: `Published faithful translation for ${bookSlug} chapter ${chapter} section ${section}`,
          metadata: { filesPublished: result.filesPublished, warning: result.warning }
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Faithful translation published for section ${section}`,
        ...result
      });
    } catch (err) {
      console.error('Error publishing faithful section:', err);
      res.status(500).json({
        error: 'Failed to publish faithful section',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/publication/:bookSlug/:chapterNum/localized/:section
 * Publish localized content for a single section
 *
 * Requires: HEAD_EDITOR role
 * Requires: Section has passed localization review
 */
router.post(
  '/:bookSlug/:chapterNum/localized/:section',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug, section } = req.params;
    const { chapter } = req;

    try {
      // Check section readiness
      const readiness = publicationService.checkSectionLocalizedReadiness(bookSlug, chapter, section);
      if (!readiness.ready) {
        return res.status(400).json({
          error: 'Section not ready for localized publication',
          reason: readiness.reason,
          details: readiness
        });
      }

      // Publish section
      const result = publicationService.publishLocalizedSection(
        bookSlug,
        chapter,
        section,
        req.user.id,
        req.user.name || req.user.login
      );

      // Log activity
      try {
        activityLog.log({
          type: 'publish_localized_section',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          section,
          description: `Published localized content for ${bookSlug} chapter ${chapter} section ${section}`,
          metadata: { filesPublished: result.filesPublished, warning: result.warning }
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `Localized content published for section ${section}`,
        ...result
      });
    } catch (err) {
      console.error('Error publishing localized section:', err);
      res.status(500).json({
        error: 'Failed to publish localized section',
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
