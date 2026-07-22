/**
 * Section Routes
 *
 * Handles operations on individual translation sections:
 * - Get section details
 * - Assign reviewers and localizers
 * - Update section status
 *
 * Sections are the atomic unit of translation work.
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, requireHeadEditorFor, ROLES } = require('../middleware/requireRole');
const bookRegistration = require('../services/bookRegistration');
const notifications = require('../services/notifications');
const activityLog = require('../services/activityLog');

// Middleware to load section data
function loadSection(req, res, next) {
  const { sectionId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));
    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`,
      });
    }
    req.sectionData = section;
    next();
  } catch (err) {
    log.error({ err }, 'Load section error');
    res.status(500).json({
      error: 'Failed to load section',
      message: err.message,
    });
  }
}

// ============================================================================
// SECTION DETAILS
// ============================================================================

/**
 * GET /api/sections/:sectionId
 * Get detailed section information
 */
router.get('/:sectionId', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { sectionId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`,
      });
    }

    res.json(section);
  } catch (err) {
    log.error({ err }, 'Get section error');
    res.status(500).json({
      error: 'Failed to get section',
      message: err.message,
    });
  }
});

// ============================================================================
// ASSIGNMENT HANDLERS
// ============================================================================

/**
 * POST /api/sections/:sectionId/assign-reviewer
 * Assign a linguistic reviewer to a section
 *
 * Body:
 *   - reviewerId: User ID
 *   - reviewerName: User display name
 */
router.post(
  '/:sectionId/assign-reviewer',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  async (req, res) => {
    const section = req.sectionData;
    const { reviewerId, reviewerName } = req.body;

    if (!reviewerId || !reviewerName) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'reviewerId and reviewerName are required',
      });
    }

    // Validate section is ready for review assignment
    const validStatuses = ['mt_uploaded', 'review_assigned'];
    if (!validStatuses.includes(section.status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot assign reviewer to section in status '${section.status}'`,
        requiredStatuses: validStatuses,
      });
    }

    try {
      bookRegistration.assignLinguisticReviewer(section.id, reviewerId, reviewerName);

      // Send notification to reviewer
      await notifications.createNotification({
        userId: reviewerId,
        type: 'assignment',
        title: 'Nýr yfirlestur úthlutaður',
        message: `Þú hefur verið úthlutað yfirlestri á kafla ${section.sectionNum} í ${section.bookTitleIs}`,
        link: `/segment-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
      });

      // Log activity
      activityLog.log({
        type: 'assign_reviewer',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} úthlutaði ${reviewerName} yfirlestri á kafla ${section.sectionNum}`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
          reviewerId,
          reviewerName,
        },
      });

      res.json({
        success: true,
        message: `Reviewer ${reviewerName} assigned to section ${section.sectionNum}`,
        section: {
          id: section.id,
          status: 'review_assigned',
          linguisticReviewer: reviewerId,
          linguisticReviewerName: reviewerName,
        },
      });
    } catch (err) {
      log.error({ err }, 'Assign reviewer error');
      res.status(500).json({
        error: 'Failed to assign reviewer',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/sections/:sectionId/assign-localizer
 * Assign a localizer to a section
 *
 * Body:
 *   - localizerId: User ID
 *   - localizerName: User display name
 */
router.post(
  '/:sectionId/assign-localizer',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  async (req, res) => {
    const section = req.sectionData;
    const { localizerId, localizerName } = req.body;

    if (!localizerId || !localizerName) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'localizerId and localizerName are required',
      });
    }

    // Validate section is ready for localization
    const validStatuses = ['review_approved', 'faithful_published', 'localization_assigned'];
    if (!validStatuses.includes(section.status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot assign localizer to section in status '${section.status}'`,
        requiredStatuses: validStatuses,
      });
    }

    try {
      bookRegistration.assignLocalizer(section.id, localizerId, localizerName);

      // Send notification to localizer
      await notifications.createNotification({
        userId: localizerId,
        type: 'assignment',
        title: 'Ný staðfæring úthlutað',
        message: `Þú hefur verið úthlutað staðfæringu á kafla ${section.sectionNum} í ${section.bookTitleIs}`,
        link: `/localization-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
      });

      // Log activity
      activityLog.log({
        type: 'assign_localizer',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} úthlutaði ${localizerName} staðfæringu á kafla ${section.sectionNum}`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
          localizerId,
          localizerName,
        },
      });

      res.json({
        success: true,
        message: `Localizer ${localizerName} assigned to section ${section.sectionNum}`,
        section: {
          id: section.id,
          status: 'localization_assigned',
          localizer: localizerId,
          localizerName: localizerName,
        },
      });
    } catch (err) {
      log.error({ err }, 'Assign localizer error');
      res.status(500).json({
        error: 'Failed to assign localizer',
        message: err.message,
      });
    }
  }
);

// ============================================================================
// STATUS UPDATES
// ============================================================================

/**
 * POST /api/sections/:sectionId/status
 * Update section status (with validation)
 *
 * Body:
 *   - status: New status
 *   - notes: Optional notes
 */
router.post(
  '/:sectionId/status',
  requireAuth,
  requireRole(ROLES.EDITOR),
  loadSection,
  async (req, res) => {
    const section = req.sectionData;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing status',
        message: 'status is required',
      });
    }

    // Define valid transitions
    const validTransitions = {
      not_started: ['mt_pending'],
      mt_pending: ['mt_uploaded', 'not_started'],
      mt_uploaded: ['review_assigned'],
      review_assigned: ['review_in_progress'],
      review_in_progress: ['review_submitted', 'review_assigned'],
      review_submitted: ['review_approved', 'review_in_progress'],
      review_approved: ['faithful_published', 'tm_created', 'localization_assigned'],
      faithful_published: ['localization_assigned', 'tm_created'],
      tm_created: ['localization_assigned'],
      localization_assigned: ['localization_in_progress'],
      localization_in_progress: ['localization_submitted', 'localization_assigned'],
      localization_submitted: ['localization_approved', 'localization_in_progress'],
      localization_approved: ['localized_published'],
      localized_published: [],
    };

    const allowedNext = validTransitions[section.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: 'Invalid transition',
        message: `Cannot transition from '${section.status}' to '${status}'`,
        currentStatus: section.status,
        allowedTransitions: allowedNext,
      });
    }

    // Some transitions require higher permissions
    const headEditorRequired = ['review_approved', 'localization_approved'];
    if (headEditorRequired.includes(status)) {
      const isOwningHeadEditor =
        req.user.role === ROLES.HEAD_EDITOR && req.user.books?.includes(section.bookSlug);
      if (req.user.role !== ROLES.ADMIN && !isOwningHeadEditor) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `Status '${status}' requires a head editor assigned to ${section.bookSlug} (or admin)`,
        });
      }
    }

    try {
      bookRegistration.updateSectionStatus(section.id, status);

      // Log activity
      activityLog.log({
        type: 'status_change',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} breytti stöðu kafla ${section.sectionNum} úr '${section.status}' í '${status}'`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
          fromStatus: section.status,
          toStatus: status,
          notes,
        },
      });

      res.json({
        success: true,
        message: `Status updated to '${status}'`,
        section: {
          id: section.id,
          previousStatus: section.status,
          status,
        },
      });
    } catch (err) {
      log.error({ err }, 'Update section status error');
      res.status(500).json({
        error: 'Failed to update status',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/sections/:sectionId/submit-review
 * Submit section for review approval
 */
router.post(
  '/:sectionId/submit-review',
  requireAuth,
  requireRole(ROLES.EDITOR),
  loadSection,
  async (req, res) => {
    const section = req.sectionData;

    // Validate section is in progress
    if (section.status !== 'review_in_progress') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot submit review from status '${section.status}'`,
      });
    }

    // Validate user is the assigned reviewer
    if (section.linguisticReviewer !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        error: 'Not assigned',
        message: 'Only the assigned reviewer can submit this section',
      });
    }

    try {
      bookRegistration.updateSectionStatus(section.id, 'review_submitted');

      // Notify head editors
      // (In a real implementation, you'd query for head editors)

      activityLog.log({
        type: 'submit_review',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} sendi inn yfirlestur á kafla ${section.sectionNum} til samþykktar`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
        },
      });

      res.json({
        success: true,
        message: 'Review submitted for approval',
        section: {
          id: section.id,
          status: 'review_submitted',
        },
      });
    } catch (err) {
      log.error({ err }, 'Submit review error');
      res.status(500).json({
        error: 'Failed to submit review',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/sections/:sectionId/approve-review
 * Approve the linguistic review
 */
router.post(
  '/:sectionId/approve-review',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  async (req, res) => {
    const section = req.sectionData;

    if (section.status !== 'review_submitted') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot approve review from status '${section.status}'`,
      });
    }

    try {
      bookRegistration.updateSectionStatus(section.id, 'review_approved', {
        linguisticApprovedBy: req.user.id,
        linguisticApprovedByName: req.user.name,
      });

      // Notify the reviewer
      if (section.linguisticReviewer) {
        await notifications.createNotification({
          userId: section.linguisticReviewer,
          type: 'approval',
          title: 'Yfirlestur samþykktur',
          message: `Yfirlestur þinn á kafla ${section.sectionNum} hefur verið samþykktur`,
          link: `/segment-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
        });
      }

      activityLog.log({
        type: 'approve_review',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} samþykkti yfirlestur á kafla ${section.sectionNum}`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
          reviewer: section.linguisticReviewerName,
        },
      });

      res.json({
        success: true,
        message: 'Review approved',
        section: {
          id: section.id,
          status: 'review_approved',
        },
      });
    } catch (err) {
      log.error({ err }, 'Approve review error');
      res.status(500).json({
        error: 'Failed to approve review',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/sections/:sectionId/request-changes
 * Request changes on the review
 *
 * Body:
 *   - notes: Required feedback notes
 */
router.post(
  '/:sectionId/request-changes',
  requireAuth,
  loadSection,
  requireHeadEditorFor((req) => req.sectionData?.bookSlug),
  async (req, res) => {
    const section = req.sectionData;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({
        error: 'Missing notes',
        message: 'Feedback notes are required when requesting changes',
      });
    }

    if (section.status !== 'review_submitted' && section.status !== 'localization_submitted') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot request changes from status '${section.status}'`,
      });
    }

    try {
      const newStatus =
        section.status === 'review_submitted' ? 'review_in_progress' : 'localization_in_progress';

      bookRegistration.updateSectionStatus(section.id, newStatus);

      // Notify the reviewer/localizer
      const assignedUserId =
        section.status === 'review_submitted' ? section.linguisticReviewer : section.localizer;

      if (assignedUserId) {
        await notifications.createNotification({
          userId: assignedUserId,
          type: 'changes_requested',
          title: 'Breytingar óskast',
          message: `Breytingar óskast á kafla ${section.sectionNum}: ${notes.substring(0, 100)}...`,
          link: `/segment-editor?book=${section.bookSlug}&chapter=${section.chapterNum}&module=${section.moduleId}`,
        });
      }

      activityLog.log({
        type: 'request_changes',
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} óskaði eftir breytingum á kafla ${section.sectionNum}`,
        metadata: {
          entityType: 'section',
          entityId: section.id,
          notes,
        },
      });

      res.json({
        success: true,
        message: 'Changes requested',
        section: {
          id: section.id,
          status: newStatus,
        },
      });
    } catch (err) {
      log.error({ err }, 'Request changes error');
      res.status(500).json({
        error: 'Failed to request changes',
        message: err.message,
      });
    }
  }
);

module.exports = router;
