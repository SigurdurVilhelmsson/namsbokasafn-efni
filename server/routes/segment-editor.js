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

const log = require('../lib/logger');
const segmentParser = require('../services/segmentParser');
const segmentEditor = require('../services/segmentEditorService');
const activityLog = require('../services/activityLog');

// ─── Book data lookup (slug → chapter/module metadata) ───────────────
const { enrichChapters, enrichModules } = require('../services/bookDataLoader');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, requireBookAccess, ROLES } = require('../middleware/requireRole');
const { validateBookChapter, validateModule } = require('../middleware/validateParams');
const { VALID_BOOKS } = require('../config');
const { PASS1_CATEGORIES: VALID_CATEGORIES } = require('../constants');

// =====================================================================
// NON-PARAMETERIZED ROUTES (must come before /:book/:chapter)
// =====================================================================

/**
 * GET /terminology/lookup
 * Quick term lookup for editor popups (delegates to terminology service).
 */
router.get('/terminology/lookup', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
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
      log.error({ err: e }, 'Could not load module data for review');
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
 * GET /edit/:editId/comments
 * Get discussion thread for a segment edit.
 */
router.get('/edit/:editId/comments', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const comments = segmentEditor.getDiscussion(parseInt(req.params.editId, 10));
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// EDITOR ENDPOINTS
// =====================================================================

/**
 * GET /:book/chapters
 * List available chapters for a book (scans 02-for-mt directory).
 */
router.get('/:book/chapters', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book: ${book}` });
  }
  try {
    const chapterNums = segmentParser.listChapters(book);
    const chapters = enrichChapters(book, chapterNums);
    res.json({ book, chapters });
  } catch (err) {
    log.error({ err }, 'Error listing chapters');
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:book/:chapter
 * List available modules in a chapter for editing.
 */
router.get(
  '/:book/:chapter',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const modules = segmentParser.listChapterModules(req.params.book, req.chapterNum);
      enrichModules(req.params.book, modules);
      res.json({
        book: req.params.book,
        chapter: req.chapterNum,
        modules,
      });
    } catch (err) {
      log.error({ err }, 'Error listing modules');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId
 * Load a module's segments for editing (paired EN/IS).
 */
router.get(
  '/:book/:chapter/:moduleId',
  requireAuth,
  requireRole(ROLES.EDITOR),
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

      // Identify segments with pending edits from OTHER editors (cross-editor awareness)
      const currentUserId = req.user?.id;
      const otherEdits = segmentEditor
        .getModuleEdits(req.params.book, req.params.moduleId, 'pending')
        .filter((e) => String(e.editor_id) !== String(currentUserId));
      const otherPendingSegments = [...new Set(otherEdits.map((e) => e.segment_id))];

      res.json({
        ...data,
        edits: editsBySegment,
        stats,
        otherPendingSegments,
      });
    } catch (err) {
      log.error({ err }, 'Error loading module');
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
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const { segmentId, originalContent, editedContent, category, editorNote } = req.body;

    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (!editedContent && editedContent !== '') {
      return res.status(400).json({ error: 'editedContent is required' });
    }
    if (typeof editedContent === 'string' && editedContent.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
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
        editorId: String(req.user.id),
        editorUsername: req.user.username,
      });

      try {
        activityLog.log({
          type: 'segment_edit_saved',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} vistaði breytingu á ${req.params.moduleId}:${segmentId}`,
        });
      } catch (logErr) {
        log.error({ err: logErr }, 'Activity log failed');
      }

      res.json({
        success: true,
        editId: result.id,
        updated: result.updated,
      });
    } catch (err) {
      log.error({ err }, 'Error saving segment edit');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /edit/:editId
 * Delete a pending segment edit.
 */
router.delete('/edit/:editId', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const editId = parseInt(req.params.editId, 10);
    // Read edit before deletion for logging
    const edit = segmentEditor.getEditById(editId);
    segmentEditor.deleteSegmentEdit(editId, req.user.id);
    res.json({ success: true });
    try {
      activityLog.log({
        type: 'segment_edit_deleted',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit?.book || '',
        chapter: String(edit?.chapter || ''),
        section: edit?.module_id || '',
        description: `${req.user.username} eyddi breytingu á ${edit?.segment_id || editId}`,
      });
    } catch {
      /* fire-and-forget */
    }
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
  validateBookChapter,
  requireBookAccess(),
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
      try {
        activityLog.log({
          type: 'module_submitted_for_review',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} sendi ${req.params.moduleId} til yfirlestrar`,
        });
      } catch (logErr) {
        log.error({ err: logErr }, 'Activity log failed');
      }
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
router.get('/review-queue', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
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
    log.error({ err }, 'Error getting review queue');
    res.status(500).json({ error: err.message });
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
      req.body?.note
    );
    try {
      activityLog.log({
        type: 'segment_edit_approved',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} samþykkti breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
    } catch {
      /* fire-and-forget */
    }
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
      req.body?.note
    );
    try {
      activityLog.log({
        type: 'segment_edit_rejected',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} hafnaði breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
    } catch {
      /* fire-and-forget */
    }
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
      req.body?.note
    );
    try {
      activityLog.log({
        type: 'segment_edit_discuss',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} merkti ${edit.module_id}:${edit.segment_id} til umræðu`,
      });
    } catch {
      /* fire-and-forget */
    }
    res.json({ success: true, edit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /edit/:editId/unapprove
 * Revert an approved edit back to pending (only if not yet applied to files).
 */
router.post('/edit/:editId/unapprove', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  try {
    const edit = segmentEditor.unapproveEdit(parseInt(req.params.editId, 10));
    res.json({ success: true, edit });
    try {
      activityLog.log({
        type: 'segment_edit_unapproved',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book || '',
        chapter: String(edit.chapter || ''),
        section: edit.module_id || '',
        description: `${req.user.username} afturkallaði samþykki á ${edit.segment_id}`,
      });
    } catch {
      /* fire-and-forget */
    }
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
        req.body?.notes
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
          // Auto-apply is best-effort; don't fail the review completion.
          // Head-editor can retry via POST /:book/:chapter/:moduleId/apply
          log.error({ err: applyErr }, 'Auto-apply after review failed');
          applied = { error: applyErr.message, retryable: true };
        }
      }

      res.json({ success: true, ...result, applied });
      try {
        activityLog.log({
          type: 'review_completed',
          userId: String(req.user.id),
          username: req.user.username,
          book: result.book || '',
          chapter: String(result.chapter || ''),
          section: result.module_id || '',
          description: `${req.user.username} lauk yfirferð á ${result.module_id || req.params.reviewId}`,
        });
      } catch (logErr) {
        log.error({ err: logErr }, 'Activity log failed');
      }
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
router.post('/edit/:editId/comment', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
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
    try {
      const edit = segmentEditor.getEditById(parseInt(req.params.editId, 10));
      activityLog.log({
        type: 'segment_edit_comment',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit?.book || '',
        chapter: String(edit?.chapter || ''),
        section: edit?.module_id || '',
        description: `${req.user.username} bætti við athugasemd á ${edit?.segment_id || req.params.editId}`,
      });
    } catch {
      /* fire-and-forget */
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
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
  requireRole(ROLES.EDITOR),
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
        enContent: seg.en || '',
        isContent: seg.is || '',
      }));

      // Get book ID from registered_books (if available)
      const bookId = req.query.bookId ? parseInt(req.query.bookId, 10) : null;

      const termMatches = terminology.findTermsInSegments(segments, bookId);

      res.json({
        moduleId: req.params.moduleId,
        termMatches,
      });
    } catch (err) {
      log.error({ err }, 'Error finding terms');
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  }
);

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
  requireRole(ROLES.EDITOR),
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

      try {
        activityLog.log({
          type: 'segment_edits_applied',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} yfirfærði ${result.appliedCount} breytingu/ar á ${req.params.moduleId}`,
        });
      } catch (logErr) {
        log.error({ err: logErr }, 'Activity log failed');
      }

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      log.error({ err }, 'Error applying edits');
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
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        track: 'faithful',
        userId: req.user.id,
      });

      try {
        activityLog.log({
          type: 'segment_edits_applied',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} yfirfærði ${applyResult.appliedCount} breytingu/ar á ${req.params.moduleId} og ræsti leiðslu`,
        });
      } catch (logErr) {
        log.error({ err: logErr }, 'Activity log failed');
      }

      res.json({
        success: true,
        applied: applyResult,
        jobId,
        message: 'Edits applied and pipeline started',
      });
    } catch (err) {
      log.error({ err }, 'Error in apply-and-render');
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
            book: req.params.book,
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
      log.error({ err }, 'Error in bulk apply');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// CONTENT VERSIONING — history and rollback
// =====================================================================

const contentVersionService = require('../services/contentVersionService');

/**
 * GET /:book/:chapter/:moduleId/versions
 * List all content versions for a module.
 */
router.get(
  '/:book/:chapter/:moduleId/versions',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const versions = contentVersionService.getModuleVersions(
        req.params.book,
        req.params.moduleId
      );
      res.json({ versions });
    } catch (err) {
      log.error({ err }, 'Error loading versions');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/versions/:version
 * Get content for a specific version (all segments).
 */
router.get(
  '/:book/:chapter/:moduleId/versions/:version',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const segments = contentVersionService.getVersionContent(
        req.params.book,
        req.params.moduleId,
        parseInt(req.params.version, 10)
      );
      res.json({ segments });
    } catch (err) {
      log.error({ err }, 'Error loading version content');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/segment-history/:segmentId
 * Get version history for a specific segment.
 */
router.get(
  '/:book/:chapter/:moduleId/segment-history/:segmentId',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const history = contentVersionService.getSegmentHistory(
        req.params.book,
        req.params.moduleId,
        req.params.segmentId
      );
      res.json({ history });
    } catch (err) {
      log.error({ err }, 'Error loading segment history');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// PREVIEW — render translated CNXML to HTML in-process
// =====================================================================

const renderService = require('../services/renderService');

/**
 * GET /:book/:chapter/:moduleId/preview
 * Render a module's translated CNXML to HTML for live preview.
 * Returns the rendered HTML as text/html.
 *
 * Query params:
 *   track (optional, default: 'mt-preview') — which translation track to render
 */
router.get(
  '/:book/:chapter/:moduleId/preview',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  async (req, res) => {
    const { book, moduleId } = req.params;
    const track = req.query.track || 'mt-preview';

    try {
      const { html } = await renderService.renderModule(book, req.chapterNum, moduleId, track);

      res.type('html').send(html);
    } catch (err) {
      log.error({ err, book, moduleId }, 'Preview render failed');

      if (err.message?.includes('not found')) {
        return res.status(404).json({
          error: 'Translated CNXML not found',
          message: 'Run inject before previewing this module',
        });
      }
      res.status(500).json({ error: 'Preview render failed: ' + err.message });
    }
  }
);

module.exports = router;
