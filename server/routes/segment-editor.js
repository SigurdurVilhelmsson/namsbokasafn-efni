/**
 * Segment Editor Routes
 *
 * API endpoints for the segment-level linguistic editor.
 * Editors work on individual segments within module files,
 * tagging changes with categories for head editor review.
 *
 * Endpoints:
 *   GET  /api/segment-editor/:book/:chapter          List modules in chapter
 *   GET  /api/segment-editor/:book/:chapter/:moduleId Load module for editing
 *   POST /api/segment-editor/:book/:chapter/:moduleId/edit  Save segment edit
 *   DELETE /api/segment-editor/edit/:editId                  Delete pending edit
 *   POST /api/segment-editor/:book/:chapter/:moduleId/submit Submit for review
 *
 *   GET  /api/segment-editor/reviews                  List pending module reviews
 *   GET  /api/segment-editor/reviews/:reviewId        Get review with edits
 *   POST /api/segment-editor/edit/:editId/approve     Approve segment edit
 *   POST /api/segment-editor/edit/:editId/reject      Reject segment edit
 *   POST /api/segment-editor/edit/:editId/discuss     Mark for discussion
 *   POST /api/segment-editor/reviews/:reviewId/complete  Complete module review
 *   POST /api/segment-editor/edit/:editId/comment     Add discussion comment
 *   GET  /api/segment-editor/edit/:editId/comments    Get discussion thread
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/stats  Get module stats
 */

const express = require('express');
const router = express.Router();

const segmentParser = require('../services/segmentParser');
const segmentEditor = require('../services/segmentEditorService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

const VALID_BOOKS = ['efnafraedi', 'liffraedi'];
const VALID_CATEGORIES = ['terminology', 'accuracy', 'readability', 'style', 'omission'];

// =====================================================================
// PARAMETER VALIDATION
// =====================================================================

function validateBookChapter(req, res, next) {
  const { book, chapter } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
    return res.status(400).json({ error: `Invalid chapter: ${chapter}` });
  }

  req.chapterNum = chapterNum;
  next();
}

function validateModule(req, res, next) {
  const { moduleId } = req.params;
  if (!moduleId || !/^m\d{5}$/.test(moduleId)) {
    return res.status(400).json({ error: `Invalid module ID: ${moduleId}` });
  }
  next();
}

// =====================================================================
// EDITOR ENDPOINTS
// =====================================================================

/**
 * GET /:book/:chapter
 * List available modules in a chapter for editing.
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
    console.error('Error listing modules:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:book/:chapter/:moduleId
 * Load a module's segments for editing (paired EN/IS).
 */
router.get(
  '/:book/:chapter/:moduleId',
  requireAuth,
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const data = segmentParser.loadModuleForEditing(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Get existing edits for this module
      const edits = segmentEditor.getModuleEdits(req.params.book, req.params.moduleId);

      // Build edit lookup by segmentId for quick access
      const editsBySegment = {};
      for (const edit of edits) {
        if (!editsBySegment[edit.segment_id]) {
          editsBySegment[edit.segment_id] = [];
        }
        editsBySegment[edit.segment_id].push(edit);
      }

      // Get stats
      const stats = segmentEditor.getModuleStats(req.params.book, req.params.moduleId);

      res.json({
        ...data,
        edits: editsBySegment,
        stats,
      });
    } catch (err) {
      console.error('Error loading module:', err.message);
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/edit
 * Save a segment edit (create or update).
 */
router.post(
  '/:book/:chapter/:moduleId/edit',
  requireAuth,
  requireRole(ROLES.CONTRIBUTOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    const { segmentId, originalContent, editedContent, category, editorNote } = req.body;

    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (!editedContent && editedContent !== '') {
      return res.status(400).json({ error: 'editedContent is required' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    try {
      const result = segmentEditor.saveSegmentEdit({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        originalContent: originalContent || '',
        editedContent,
        category,
        editorNote,
        editorId: req.user.id,
        editorUsername: req.user.username,
      });

      res.json({
        success: true,
        editId: result.id,
        updated: result.updated,
      });
    } catch (err) {
      console.error('Error saving segment edit:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /edit/:editId
 * Delete a pending segment edit.
 */
router.delete('/edit/:editId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  try {
    segmentEditor.deleteSegmentEdit(parseInt(req.params.editId, 10), req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === 'Not your edit' ? 403 : 400).json({ error: err.message });
  }
});

/**
 * POST /:book/:chapter/:moduleId/submit
 * Submit a module for head editor review.
 */
router.post(
  '/:book/:chapter/:moduleId/submit',
  requireAuth,
  requireRole(ROLES.CONTRIBUTOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const result = segmentEditor.submitModuleForReview({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        submittedBy: req.user.id,
        submittedByUsername: req.user.username,
      });

      res.json({
        success: true,
        reviewId: result.id,
        editedSegments: result.editedSegments,
      });
    } catch (err) {
      const status = err.message.includes('already has') ? 409 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// =====================================================================
// REVIEW ENDPOINTS (Head Editor)
// =====================================================================

/**
 * GET /reviews
 * List pending module reviews.
 */
router.get('/reviews', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const reviews = segmentEditor.getPendingModuleReviews(req.query.book);
    res.json({ reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /reviews/:reviewId
 * Get a module review with all segment edits.
 */
router.get('/reviews/:reviewId', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const data = segmentEditor.getModuleReviewWithEdits(parseInt(req.params.reviewId, 10));

    // Also load the module segments for context
    let moduleData = null;
    try {
      moduleData = segmentParser.loadModuleForEditing(
        data.review.book,
        data.review.chapter,
        data.review.module_id
      );
    } catch (e) {
      // Module data is supplementary, don't fail the request
      console.error('Could not load module data for review:', e.message);
    }

    res.json({
      ...data,
      module: moduleData,
    });
  } catch (err) {
    res.status(err.message === 'Review not found' ? 404 : 500).json({ error: err.message });
  }
});

/**
 * POST /edit/:editId/approve
 * Approve a segment edit.
 */
router.post('/edit/:editId/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const edit = segmentEditor.approveEdit(
      parseInt(req.params.editId, 10),
      req.user.id,
      req.user.username,
      req.body.note
    );
    res.json({ success: true, edit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /edit/:editId/reject
 * Reject a segment edit.
 */
router.post('/edit/:editId/reject', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const edit = segmentEditor.rejectEdit(
      parseInt(req.params.editId, 10),
      req.user.id,
      req.user.username,
      req.body.note
    );
    res.json({ success: true, edit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /edit/:editId/discuss
 * Mark a segment edit for discussion.
 */
router.post('/edit/:editId/discuss', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const edit = segmentEditor.markForDiscussion(
      parseInt(req.params.editId, 10),
      req.user.id,
      req.user.username,
      req.body.note
    );
    res.json({ success: true, edit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /reviews/:reviewId/complete
 * Complete a module review.
 */
router.post(
  '/reviews/:reviewId/complete',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  (req, res) => {
    try {
      const result = segmentEditor.completeModuleReview(
        parseInt(req.params.reviewId, 10),
        req.user.id,
        req.user.username,
        req.body.notes
      );
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// =====================================================================
// DISCUSSION ENDPOINTS
// =====================================================================

/**
 * POST /edit/:editId/comment
 * Add a comment to a segment edit discussion.
 */
router.post('/edit/:editId/comment', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { comment } = req.body;
  if (!comment) {
    return res.status(400).json({ error: 'comment is required' });
  }

  try {
    const result = segmentEditor.addDiscussionComment(
      parseInt(req.params.editId, 10),
      req.user.id,
      req.user.username,
      comment
    );
    res.json({ success: true, commentId: result.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /edit/:editId/comments
 * Get discussion thread for a segment edit.
 */
router.get('/edit/:editId/comments', requireAuth, (req, res) => {
  try {
    const comments = segmentEditor.getDiscussion(parseInt(req.params.editId, 10));
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// STATISTICS
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId/stats
 * Get editing statistics for a module.
 */
router.get(
  '/:book/:chapter/:moduleId/stats',
  requireAuth,
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const stats = segmentEditor.getModuleStats(req.params.book, req.params.moduleId);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
