/**
 * Editor Routes
 *
 * API endpoints for the web-based markdown editor.
 *
 * Endpoints:
 *   GET  /api/editor/:book/:chapter              List sections in chapter
 *   GET  /api/editor/:book/:chapter/:section     Load section content
 *   POST /api/editor/:book/:chapter/:section/save    Save draft
 *   POST /api/editor/:book/:chapter/:section/submit  Submit for review
 *   GET  /api/editor/:book/:chapter/:section/history Get version history
 *   POST /api/editor/:book/:chapter/:section/restore/:historyId  Restore version
 */

const express = require('express');
const router = express.Router();
const path = require('path');

const editorHistory = require('../services/editorHistory');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

// Valid books
const VALID_BOOKS = ['efnafraedi', 'liffraedi'];

/**
 * Validate book and chapter parameters
 */
function validateParams(req, res, next) {
  const { book, chapter } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  const chapterNum = parseInt(chapter);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a number between 1 and 50'
    });
  }

  req.chapterNum = chapterNum;
  next();
}

/**
 * Validate section parameter
 */
function validateSection(req, res, next) {
  const { section } = req.params;

  // Section format: "1-1", "1-2", "2-1", etc.
  if (!/^\d+-\d+(-[a-z0-9-]+)?$/.test(section)) {
    return res.status(400).json({
      error: 'Invalid section',
      message: 'Section must be in format like "1-1" or "1-2-title"'
    });
  }

  next();
}

/**
 * GET /api/editor/:book/:chapter
 * List all sections available for editing in a chapter
 */
router.get('/:book/:chapter', requireAuth, validateParams, (req, res) => {
  const { book } = req.params;
  const chapter = req.chapterNum;

  try {
    const sections = editorHistory.listSections(book, chapter);

    res.json({
      book,
      chapter,
      sections
    });
  } catch (err) {
    console.error('Error listing sections:', err);
    res.status(500).json({
      error: 'Failed to list sections',
      message: err.message
    });
  }
});

/**
 * GET /api/editor/:book/:chapter/:section
 * Load content for a section (IS translation and EN source)
 */
router.get('/:book/:chapter/:section', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, section } = req.params;
  const chapter = req.chapterNum;

  try {
    const content = editorHistory.loadSectionContent(book, chapter, section);
    const history = editorHistory.getVersionHistory(book, chapter, section, 5);

    // Check if there's a pending review
    const pendingReviews = editorHistory.getPendingReviews(book);
    const pendingReview = pendingReviews.find(
      r => r.chapter === String(chapter) && r.section === section
    );

    res.json({
      book,
      chapter,
      section,
      content: {
        is: content.is,
        en: content.en
      },
      metadata: content.metadata,
      filePath: content.filePath,
      exists: content.exists,
      history,
      pendingReview: pendingReview ? {
        id: pendingReview.id,
        submittedBy: pendingReview.submittedByUsername,
        submittedAt: pendingReview.submittedAt
      } : null
    });
  } catch (err) {
    console.error('Error loading section:', err);
    res.status(500).json({
      error: 'Failed to load section',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/:book/:chapter/:section/save
 * Save a draft (autosave or manual save)
 */
router.post('/:book/:chapter/:section/save', requireAuth, requireRole(ROLES.EDITOR), validateParams, validateSection, (req, res) => {
  const { book, section } = req.params;
  const chapter = req.chapterNum;
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a non-empty string'
    });
  }

  try {
    const result = editorHistory.saveDraft(
      book,
      String(chapter),
      section,
      content,
      req.user.id,
      req.user.username
    );

    res.json({
      success: true,
      ...result,
      savedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({
      error: 'Failed to save draft',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/:book/:chapter/:section/submit
 * Submit content for review
 */
router.post('/:book/:chapter/:section/submit', requireAuth, requireRole(ROLES.EDITOR), validateParams, validateSection, (req, res) => {
  const { book, section } = req.params;
  const chapter = req.chapterNum;
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a non-empty string'
    });
  }

  try {
    const result = editorHistory.submitForReview(
      book,
      String(chapter),
      section,
      content,
      req.user.id,
      req.user.username
    );

    if (!result.success) {
      return res.status(409).json(result);
    }

    res.json({
      success: true,
      ...result,
      submittedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error submitting for review:', err);
    res.status(500).json({
      error: 'Failed to submit for review',
      message: err.message
    });
  }
});

/**
 * GET /api/editor/:book/:chapter/:section/history
 * Get version history for a section
 */
router.get('/:book/:chapter/:section/history', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, section } = req.params;
  const chapter = req.chapterNum;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const history = editorHistory.getVersionHistory(book, String(chapter), section, Math.min(limit, 100));

    res.json({
      book,
      chapter,
      section,
      history
    });
  } catch (err) {
    console.error('Error getting history:', err);
    res.status(500).json({
      error: 'Failed to get history',
      message: err.message
    });
  }
});

/**
 * GET /api/editor/history/:historyId
 * Get a specific version's content
 */
router.get('/history/:historyId', requireAuth, (req, res) => {
  const { historyId } = req.params;

  try {
    const version = editorHistory.getVersion(parseInt(historyId));

    if (!version) {
      return res.status(404).json({
        error: 'Version not found',
        message: `No version found with ID ${historyId}`
      });
    }

    res.json(version);
  } catch (err) {
    console.error('Error getting version:', err);
    res.status(500).json({
      error: 'Failed to get version',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/:book/:chapter/:section/restore/:historyId
 * Restore a previous version
 */
router.post('/:book/:chapter/:section/restore/:historyId', requireAuth, requireRole(ROLES.EDITOR), validateParams, validateSection, (req, res) => {
  const { historyId } = req.params;

  try {
    const result = editorHistory.restoreVersion(
      parseInt(historyId),
      req.user.id,
      req.user.username
    );

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      ...result,
      restoredAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error restoring version:', err);
    res.status(500).json({
      error: 'Failed to restore version',
      message: err.message
    });
  }
});

module.exports = router;
