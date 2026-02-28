/**
 * Localization Editor Routes
 *
 * Segment-level localization editor (Pass 2).
 * Three-column view: EN (reference) | Faithful IS (source) | Localized IS (editable).
 * Saves localized segments to 04-localized-content/.
 *
 * Endpoints:
 *   GET  /api/localization-editor/:book/:chapter          List modules with localization status
 *   GET  /api/localization-editor/:book/:chapter/:moduleId Load module for localization
 *   POST /api/localization-editor/:book/:chapter/:moduleId/save      Save single segment
 *   POST /api/localization-editor/:book/:chapter/:moduleId/save-all  Save all segments
 */

const express = require('express');
const router = express.Router();

const segmentParser = require('../services/segmentParser');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, requireBookAccess, ROLES } = require('../middleware/requireRole');
const { validateBookChapter, validateModule } = require('../middleware/validateParams');
const VALID_CATEGORIES = [
  'unit-conversion',
  'cultural-adaptation',
  'example-replacement',
  'formatting',
  'unchanged',
];

// Per-module write lock to prevent read-modify-write race conditions.
// Key: "book/chapter/moduleId", Value: Promise chain
const moduleLocks = new Map();

/**
 * Acquire a per-module lock. Returns a release function.
 * Concurrent callers for the same module key are serialized.
 */
function acquireModuleLock(key) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const prev = moduleLocks.get(key) || Promise.resolve();
  moduleLocks.set(
    key,
    prev.then(() => gate)
  );
  return prev.then(() => release);
}

// =====================================================================
// MODULE LISTING
// =====================================================================

/**
 * GET /:book/:chapter
 * List modules in a chapter with localization status.
 */
router.get('/:book/:chapter', requireAuth, validateBookChapter, (req, res) => {
  try {
    const modules = segmentParser.listChapterModules(req.params.book, req.chapterNum);
    res.json({
      book: req.params.book,
      chapter: req.chapterNum,
      modules,
    });
  } catch (err) {
    console.error('Error listing modules for localization:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// LOAD MODULE FOR LOCALIZATION
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId
 * Load a module's segments for localization (three-way: EN | faithful IS | localized IS).
 */
router.get(
  '/:book/:chapter/:moduleId',
  requireAuth,
  requireRole(ROLES.CONTRIBUTOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      res.json(data);
    } catch (err) {
      console.error('Error loading module for localization:', err.message);
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// =====================================================================
// SAVE LOCALIZED SEGMENTS
// =====================================================================

/**
 * POST /:book/:chapter/:moduleId/save
 * Save a single localized segment.
 * Loads existing localized file (or copies from faithful), updates the segment, and saves.
 */
router.post(
  '/:book/:chapter/:moduleId/save',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  async (req, res) => {
    const { segmentId, content, category } = req.body;

    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Build the full segment list for saving.
      // Start from existing localized data, or from faithful if no localized file yet.
      const segments = data.segments.map((seg) => ({
        segmentId: seg.segmentId,
        content:
          seg.segmentId === segmentId ? content : seg.hasLocalized ? seg.localized : seg.faithful,
      }));

      const savedPath = segmentParser.saveLocalizedSegments(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        segments
      );

      res.json({
        success: true,
        segmentId,
        savedPath,
      });
    } catch (err) {
      console.error('Error saving localized segment:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      release();
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/save-all
 * Save all localized segments at once (bulk save).
 * Body: { segments: [{ segmentId, content }] }
 */
router.post(
  '/:book/:chapter/:moduleId/save-all',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  async (req, res) => {
    const { segments } = req.body;

    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments array is required' });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      // Build lookup from request
      const editLookup = {};
      for (const seg of segments) {
        if (seg.segmentId && seg.content !== undefined && seg.content !== null) {
          editLookup[seg.segmentId] = seg.content;
        }
      }

      // Load current state to fill in any segments not included in the request
      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      const allSegments = data.segments.map((seg) => ({
        segmentId: seg.segmentId,
        content:
          editLookup[seg.segmentId] !== undefined
            ? editLookup[seg.segmentId]
            : seg.hasLocalized
              ? seg.localized
              : seg.faithful,
      }));

      const savedPath = segmentParser.saveLocalizedSegments(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        allSegments
      );

      res.json({
        success: true,
        savedSegments: Object.keys(editLookup).length,
        totalSegments: allSegments.length,
        savedPath,
      });
    } catch (err) {
      console.error('Error saving localized segments:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      release();
    }
  }
);

module.exports = router;
