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
 *   GET  /api/segment-editor/review-queue             Cross-chapter review queue with SLA
 *   GET  /api/segment-editor/reviews/:reviewId        Get review with edits
 *   POST /api/segment-editor/edit/:editId/approve     Approve segment edit
 *   POST /api/segment-editor/edit/:editId/reject      Reject segment edit
 *   POST /api/segment-editor/edit/:editId/discuss     Mark for discussion
 *   POST /api/segment-editor/reviews/:reviewId/complete  Complete module review
 *   POST /api/segment-editor/edit/:editId/comment     Add discussion comment
 *   GET  /api/segment-editor/edit/:editId/comments    Get discussion thread
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/terms  Term matches per segment
 *   GET  /api/segment-editor/terminology/lookup              Quick term lookup
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/stats  Get module stats
 *
 *   POST /api/segment-editor/:book/:chapter/:moduleId/apply  Apply approved edits to files
 *   POST /api/segment-editor/:book/:chapter/:moduleId/apply-and-render  Apply then inject+render
 *   POST /api/segment-editor/:book/:chapter/apply-all        Bulk apply all approved modules
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/apply-status  Check apply status
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
 * GET /review-queue
 * Cross-chapter review queue with edit counts and SLA indicators.
 */
router.get('/review-queue', requireAuth, (req, res) => {
  try {
    const { book } = req.query;
    const reviews = segmentEditor.getReviewQueue(book || undefined);

    // Add SLA indicators
    const now = Date.now();
    const SLA_TARGET_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
    const SLA_WARNING_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
    const SLA_CRITICAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

    const items = reviews.map((r) => {
      const ageMs = now - new Date(r.submitted_at).getTime();
      let sla = 'on-track';
      if (ageMs > SLA_CRITICAL_MS) sla = 'critical';
      else if (ageMs > SLA_WARNING_MS) sla = 'overdue';
      else if (ageMs > SLA_TARGET_MS) sla = 'at-risk';

      return { ...r, sla, age_days: Math.floor(ageMs / (24 * 60 * 60 * 1000)) };
    });

    res.json({ reviews: items });
  } catch (err) {
    console.error('Error getting review queue:', err);
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
 * Complete a module review. If all edits are approved, automatically
 * applies them to 03-faithful-translation/ segment files.
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

      // Auto-apply when review is fully approved
      let applied = null;
      if (result.status === 'approved') {
        try {
          const review = segmentEditor.getModuleReviewWithEdits(parseInt(req.params.reviewId, 10));
          applied = segmentEditor.applyApprovedEdits(
            review.review.book,
            review.review.chapter,
            review.review.module_id
          );
        } catch (applyErr) {
          // Auto-apply is best-effort; don't fail the review completion
          console.error('Auto-apply after review failed:', applyErr.message);
          applied = { error: applyErr.message };
        }
      }

      res.json({ success: true, ...result, applied });
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
// TERMINOLOGY INTEGRATION
// =====================================================================

const terminology = require('../services/terminologyService');

/**
 * GET /:book/:chapter/:moduleId/terms
 * Find terminology matches in a module's segments.
 * Returns per-segment term matches and consistency issues.
 */
router.get(
  '/:book/:chapter/:moduleId/terms',
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

      // Build segment list for term matching
      const segments = data.segments.map((seg) => ({
        segmentId: seg.segmentId,
        enContent: seg.enContent || '',
        isContent: seg.isContent || '',
      }));

      // Get book ID from registered_books (if available)
      const bookId = req.query.bookId ? parseInt(req.query.bookId, 10) : null;

      const termMatches = terminology.findTermsInSegments(segments, bookId);

      res.json({
        moduleId: req.params.moduleId,
        termMatches,
      });
    } catch (err) {
      console.error('Error finding terms:', err.message);
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  }
);

/**
 * GET /terminology/lookup
 * Quick term lookup for editor popups (delegates to terminology service).
 */
router.get('/terminology/lookup', requireAuth, (req, res) => {
  const { q, bookId } = req.query;

  if (!q || q.length < 2) {
    return res.json({ terms: [] });
  }

  try {
    const terms = terminology.lookupTerm(q, bookId ? parseInt(bookId, 10) : null);
    res.json({ terms });
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

// =====================================================================
// APPLY APPROVED EDITS TO FILES (Phase 9)
// =====================================================================

const pipelineService = require('../services/pipelineService');

/**
 * GET /:book/:chapter/:moduleId/apply-status
 * Check how many approved edits are pending application.
 */
router.get(
  '/:book/:chapter/:moduleId/apply-status',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const status = segmentEditor.getApplyStatus(req.params.book, req.params.moduleId);
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/apply
 * Apply approved edits to 03-faithful-translation/ segment files.
 */
router.post(
  '/:book/:chapter/:moduleId/apply',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const result = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      console.error('Error applying edits:', err.message);
      const status =
        err.message.includes('No approved') || err.message.includes('already been') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/apply-and-render
 * Apply approved edits, then run inject+render for the faithful track.
 * Returns a pipeline job ID for polling.
 */
router.post(
  '/:book/:chapter/:moduleId/apply-and-render',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      // Step 1: Apply edits to files
      const applyResult = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Step 2: Run inject+render pipeline (async — returns job ID for polling)
      const existing = pipelineService.hasRunningJob(req.chapterNum, 'pipeline');
      if (existing) {
        return res.status(409).json({
          error: 'Pipeline already running for this chapter',
          jobId: existing.id,
          applied: applyResult,
        });
      }

      const { jobId } = pipelineService.runPipeline({
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        track: 'faithful',
        userId: req.user.id,
      });

      res.json({
        success: true,
        applied: applyResult,
        jobId,
        message: 'Edits applied and pipeline started',
      });
    } catch (err) {
      console.error('Error in apply-and-render:', err.message);
      const status =
        err.message.includes('No approved') || err.message.includes('already been') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/apply-all
 * Bulk apply approved edits for all modules in a chapter, then run pipeline.
 */
router.post(
  '/:book/:chapter/apply-all',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const modules = segmentParser.listChapterModules(req.params.book, req.chapterNum);
      const results = [];

      for (const mod of modules) {
        // Check if this module has unapplied approved edits
        const status = segmentEditor.getApplyStatus(req.params.book, mod.moduleId);
        if (status.unapplied_count > 0) {
          try {
            const result = segmentEditor.applyApprovedEdits(
              req.params.book,
              req.chapterNum,
              mod.moduleId
            );
            results.push({ moduleId: mod.moduleId, ...result });
          } catch (err) {
            results.push({ moduleId: mod.moduleId, error: err.message });
          }
        }
      }

      if (results.length === 0) {
        return res.json({
          success: true,
          message: 'No unapplied approved edits found in this chapter',
          results: [],
        });
      }

      // Optionally run pipeline for the whole chapter
      const runPipeline = req.body.runPipeline !== false;
      let jobId = null;

      if (runPipeline) {
        const existing = pipelineService.hasRunningJob(req.chapterNum, 'pipeline');
        if (!existing) {
          const job = pipelineService.runPipeline({
            chapter: req.chapterNum,
            track: 'faithful',
            userId: req.user.id,
          });
          jobId = job.jobId;
        }
      }

      res.json({
        success: true,
        results,
        totalApplied: results.filter((r) => !r.error).length,
        jobId,
      });
    } catch (err) {
      console.error('Error in bulk apply:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
