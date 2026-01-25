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
const notifications = require('../services/notifications');
const activityLog = require('../services/activityLog');
const bookRegistration = require('../services/bookRegistration');
const notesStore = require('../services/notesStore');
const presenceStore = require('../services/presenceStore');
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

    // Check for recent feedback (changes requested)
    const recentFeedback = editorHistory.getRecentFeedback(book, chapter, section);

    // Check if this is a split file
    const splitInfo = editorHistory.getSplitInfo(book, chapter, section);

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
      } : null,
      recentFeedback: recentFeedback,
      splitInfo: splitInfo
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

    // Log the activity
    activityLog.logDraftSaved(req.user, book, String(chapter), section, result.historyId);

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
router.post('/:book/:chapter/:section/submit', requireAuth, requireRole(ROLES.EDITOR), validateParams, validateSection, async (req, res) => {
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

    // Log the activity
    activityLog.logReviewSubmitted(req.user, book, String(chapter), section, result.reviewId);

    // Notify admins about the new review submission
    // Admin user IDs come from environment variable ADMIN_USER_IDS (comma-separated)
    const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
    if (adminUserIds.length > 0) {
      try {
        const review = {
          id: result.reviewId,
          book,
          chapter: String(chapter),
          section,
          submittedByUsername: req.user.username
        };
        const adminUsers = adminUserIds.map(id => ({ id: id.trim(), email: null }));
        await notifications.notifyReviewSubmitted(review, adminUsers);
      } catch (notifyErr) {
        console.error('Failed to send review submission notification:', notifyErr);
      }
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

    // Log the activity
    activityLog.logVersionRestored(
      req.user,
      result.book,
      result.chapter,
      result.section,
      parseInt(historyId)
    );

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

// ============================================================================
// SECTION-BASED WORKFLOW (uses book_sections database)
// ============================================================================

/**
 * GET /api/editor/section/:sectionId
 * Load content for a section using database ID
 * Returns both source (EN) and target (IS) content with workflow status
 */
router.get('/section/:sectionId', requireAuth, async (req, res) => {
  const { sectionId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`
      });
    }

    // Load file content
    const content = editorHistory.loadSectionContent(
      section.bookSlug,
      section.chapterNum,
      section.sectionNum.replace('.', '-')
    );

    // Get version history
    const history = editorHistory.getVersionHistory(
      section.bookSlug,
      String(section.chapterNum),
      section.sectionNum.replace('.', '-'),
      10
    );

    // Determine if user can edit
    const canEdit = canUserEditSection(req.user, section);
    const isReviewer = section.linguisticReviewer === req.user.id;
    const isLocalizer = section.localizer === req.user.id;

    res.json({
      section: {
        id: section.id,
        bookSlug: section.bookSlug,
        bookTitleIs: section.bookTitleIs,
        chapterNum: section.chapterNum,
        chapterTitleIs: section.chapterTitleIs,
        chapterTitleEn: section.chapterTitleEn,
        sectionNum: section.sectionNum,
        titleEn: section.titleEn,
        titleIs: section.titleIs,
        status: section.status,
        linguisticReviewer: section.linguisticReviewer,
        linguisticReviewerName: section.linguisticReviewerName,
        localizer: section.localizer,
        localizerName: section.localizerName
      },
      content: {
        is: content.is,
        en: content.en
      },
      metadata: content.metadata,
      history,
      permissions: {
        canEdit,
        isReviewer,
        isLocalizer,
        canSubmitReview: isReviewer && section.status === 'review_in_progress',
        canApprove: (req.user.role === ROLES.HEAD_EDITOR || req.user.role === ROLES.ADMIN) &&
                    section.status === 'review_submitted',
        canSubmitLocalization: isLocalizer && section.status === 'localization_in_progress'
      }
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
 * POST /api/editor/section/:sectionId/save
 * Save draft for a section (with workflow status validation)
 */
router.post('/section/:sectionId/save', requireAuth, requireRole(ROLES.CONTRIBUTOR), async (req, res) => {
  const { sectionId } = req.params;
  const { content, mode } = req.body; // mode: 'review' | 'localization'

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a non-empty string'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`
      });
    }

    // Validate user can edit
    if (!canUserEditSection(req.user, section)) {
      return res.status(403).json({
        error: 'Cannot edit',
        message: 'You are not assigned to this section or it is not in an editable state',
        status: section.status,
        linguisticReviewer: section.linguisticReviewer,
        localizer: section.localizer
      });
    }

    // Update section status if this is first edit
    if (section.status === 'review_assigned') {
      bookRegistration.updateSectionStatus(section.id, 'review_in_progress');
    } else if (section.status === 'localization_assigned') {
      bookRegistration.updateSectionStatus(section.id, 'localization_in_progress');
    }

    // Save to edit history
    const result = editorHistory.saveDraft(
      section.bookSlug,
      String(section.chapterNum),
      section.sectionNum.replace('.', '-'),
      content,
      req.user.id,
      req.user.username
    );

    // Log activity
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'save_draft',
      entityType: 'section',
      entityId: section.id,
      details: {
        mode: mode || 'review',
        sectionNum: section.sectionNum,
        chapterNum: section.chapterNum,
        book: section.bookSlug
      }
    });

    res.json({
      success: true,
      ...result,
      section: {
        id: section.id,
        status: section.status === 'review_assigned' ? 'review_in_progress' :
                section.status === 'localization_assigned' ? 'localization_in_progress' :
                section.status
      },
      savedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving section draft:', err);
    res.status(500).json({
      error: 'Failed to save draft',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/section/:sectionId/submit-review
 * Submit linguistic review for approval
 */
router.post('/section/:sectionId/submit-review', requireAuth, requireRole(ROLES.CONTRIBUTOR), async (req, res) => {
  const { sectionId } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a non-empty string'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`
      });
    }

    // Validate user is reviewer and section is in progress
    if (section.linguisticReviewer !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        error: 'Not assigned',
        message: 'Only the assigned reviewer can submit this section'
      });
    }

    if (section.status !== 'review_in_progress') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot submit from status '${section.status}'`
      });
    }

    // Save final content
    const saveResult = editorHistory.submitForReview(
      section.bookSlug,
      String(section.chapterNum),
      section.sectionNum.replace('.', '-'),
      content,
      req.user.id,
      req.user.username
    );

    // Update section status
    bookRegistration.updateSectionStatus(section.id, 'review_submitted');

    // Notify head editors
    const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
    if (adminUserIds.length > 0) {
      for (const adminId of adminUserIds) {
        await notifications.create({
          userId: adminId.trim(),
          type: 'review_submitted',
          title: 'Ný yfirferð til samþykktar',
          message: `${req.user.username} hefur sent inn yfirferð á ${section.sectionNum} í ${section.bookTitleIs}`,
          link: `/editor?sectionId=${section.id}`
        });
      }
    }

    // Log activity
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'submit_review',
      entityType: 'section',
      entityId: section.id,
      details: {
        sectionNum: section.sectionNum,
        chapterNum: section.chapterNum,
        book: section.bookSlug
      }
    });

    res.json({
      success: true,
      message: 'Review submitted for approval',
      section: {
        id: section.id,
        status: 'review_submitted'
      },
      submittedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({
      error: 'Failed to submit review',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/section/:sectionId/submit-localization
 * Submit localization for approval
 */
router.post('/section/:sectionId/submit-localization', requireAuth, requireRole(ROLES.CONTRIBUTOR), async (req, res) => {
  const { sectionId } = req.params;
  const { content, localizationLog } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a non-empty string'
    });
  }

  // Localization log is mandatory
  if (!localizationLog || !Array.isArray(localizationLog) || localizationLog.length === 0) {
    return res.status(400).json({
      error: 'Missing localization log',
      message: 'Localization changes must be documented in the log'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`
      });
    }

    // Validate user is localizer and section is in progress
    if (section.localizer !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        error: 'Not assigned',
        message: 'Only the assigned localizer can submit this section'
      });
    }

    if (section.status !== 'localization_in_progress') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot submit from status '${section.status}'`
      });
    }

    // Save localization content
    const saveResult = editorHistory.saveDraft(
      section.bookSlug,
      String(section.chapterNum),
      section.sectionNum.replace('.', '-'),
      content,
      req.user.id,
      req.user.username
    );

    // Update section status
    bookRegistration.updateSectionStatus(section.id, 'localization_submitted');

    // Store localization log (would need a separate service in production)
    // For now, log it in activity
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'submit_localization',
      entityType: 'section',
      entityId: section.id,
      details: {
        sectionNum: section.sectionNum,
        chapterNum: section.chapterNum,
        book: section.bookSlug,
        logEntries: localizationLog.length
      }
    });

    res.json({
      success: true,
      message: 'Localization submitted for approval',
      section: {
        id: section.id,
        status: 'localization_submitted'
      },
      submittedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error submitting localization:', err);
    res.status(500).json({
      error: 'Failed to submit localization',
      message: err.message
    });
  }
});

// ============================================================================
// PERSONAL NOTES ROUTES
// ============================================================================

/**
 * GET /api/editor/:book/:chapter/:section/notes
 * Get personal note for a section
 */
router.get('/:book/:chapter/:section/notes', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;
  const userId = String(req.user.id);

  try {
    const note = notesStore.getNote(userId, book, chapter, section);

    res.json({
      book,
      chapter,
      section,
      note
    });
  } catch (err) {
    console.error('Error loading note:', err);
    res.status(500).json({
      error: 'Failed to load note',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/:book/:chapter/:section/notes
 * Save personal note for a section
 */
router.post('/:book/:chapter/:section/notes', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;
  const { content, pinned } = req.body;
  const userId = String(req.user.id);

  if (content !== undefined && typeof content !== 'string') {
    return res.status(400).json({
      error: 'Invalid content',
      message: 'Content must be a string'
    });
  }

  try {
    const note = notesStore.saveNote(userId, book, chapter, section, content, pinned);

    res.json({
      success: true,
      book,
      chapter,
      section,
      note
    });
  } catch (err) {
    console.error('Error saving note:', err);
    res.status(500).json({
      error: 'Failed to save note',
      message: err.message
    });
  }
});

/**
 * DELETE /api/editor/:book/:chapter/:section/notes
 * Delete personal note for a section
 */
router.delete('/:book/:chapter/:section/notes', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;
  const userId = String(req.user.id);

  try {
    const deleted = notesStore.deleteNote(userId, book, chapter, section);

    res.json({
      success: true,
      deleted,
      book,
      chapter,
      section
    });
  } catch (err) {
    console.error('Error deleting note:', err);
    res.status(500).json({
      error: 'Failed to delete note',
      message: err.message
    });
  }
});

/**
 * GET /api/editor/notes/all
 * Get all personal notes for the current user
 */
router.get('/notes/all', requireAuth, (req, res) => {
  const userId = String(req.user.id);
  const { book, chapter, pinnedOnly } = req.query;

  try {
    const notes = notesStore.getAllNotes(userId, {
      book,
      chapter,
      pinnedOnly: pinnedOnly === 'true'
    });

    const counts = notesStore.getNotesCount(userId);

    res.json({
      notes,
      counts
    });
  } catch (err) {
    console.error('Error loading notes:', err);
    res.status(500).json({
      error: 'Failed to load notes',
      message: err.message
    });
  }
});

/**
 * POST /api/editor/:book/:chapter/:section/notes/pin
 * Toggle pinned status for a note
 */
router.post('/:book/:chapter/:section/notes/pin', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;
  const userId = String(req.user.id);

  try {
    const pinned = notesStore.togglePinned(userId, book, chapter, section);

    res.json({
      success: true,
      pinned,
      book,
      chapter,
      section
    });
  } catch (err) {
    console.error('Error toggling pin:', err);
    res.status(500).json({
      error: 'Failed to toggle pin',
      message: err.message
    });
  }
});

// ============================================================================
// PRESENCE ROUTES
// ============================================================================

/**
 * POST /api/editor/:book/:chapter/:section/presence
 * Register/update presence for a section
 */
router.post('/:book/:chapter/:section/presence', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;

  try {
    // Set presence for this user
    presenceStore.setPresence(book, chapter, section, req.user);

    // Get other users currently on this section
    const others = presenceStore.getPresence(book, chapter, section, req.user.id);

    res.json({
      success: true,
      presence: {
        book,
        chapter,
        section,
        others,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error setting presence:', err);
    res.status(500).json({
      error: 'Failed to set presence',
      message: err.message
    });
  }
});

/**
 * DELETE /api/editor/:book/:chapter/:section/presence
 * Remove presence for a section (when leaving)
 */
router.delete('/:book/:chapter/:section/presence', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;
  const userId = String(req.user.id);

  try {
    const removed = presenceStore.removePresence(book, chapter, section, userId);

    res.json({
      success: true,
      removed,
      book,
      chapter,
      section
    });
  } catch (err) {
    console.error('Error removing presence:', err);
    res.status(500).json({
      error: 'Failed to remove presence',
      message: err.message
    });
  }
});

/**
 * GET /api/editor/:book/:chapter/:section/presence
 * Get current presence for a section
 */
router.get('/:book/:chapter/:section/presence', requireAuth, validateParams, validateSection, (req, res) => {
  const { book, chapter, section } = req.params;

  try {
    const others = presenceStore.getPresence(book, chapter, section, req.user.id);

    res.json({
      book,
      chapter,
      section,
      others,
      count: others.length
    });
  } catch (err) {
    console.error('Error getting presence:', err);
    res.status(500).json({
      error: 'Failed to get presence',
      message: err.message
    });
  }
});

/**
 * DELETE /api/editor/presence/me
 * Clear all presence for current user (logout/disconnect)
 */
router.delete('/presence/me', requireAuth, (req, res) => {
  const userId = String(req.user.id);

  try {
    const cleared = presenceStore.clearUserPresence(userId);

    res.json({
      success: true,
      cleared
    });
  } catch (err) {
    console.error('Error clearing presence:', err);
    res.status(500).json({
      error: 'Failed to clear presence',
      message: err.message
    });
  }
});

/**
 * Helper: Check if user can edit a section
 */
function canUserEditSection(user, section) {
  // Admins can always edit
  if (user.role === ROLES.ADMIN) return true;

  // Head editors can edit any section
  if (user.role === ROLES.HEAD_EDITOR) return true;

  // Check if user is assigned reviewer during review phase
  const reviewStatuses = ['review_assigned', 'review_in_progress'];
  if (reviewStatuses.includes(section.status)) {
    return section.linguisticReviewer === user.id;
  }

  // Check if user is assigned localizer during localization phase
  const localizationStatuses = ['localization_assigned', 'localization_in_progress'];
  if (localizationStatuses.includes(section.status)) {
    return section.localizer === user.id;
  }

  return false;
}

module.exports = router;
