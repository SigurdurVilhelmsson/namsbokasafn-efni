/**
 * Section Routes
 *
 * Handles operations on individual translation sections:
 * - Get section details
 * - Upload MT translation
 * - Assign reviewers and localizers
 * - Update section status
 *
 * Sections are the atomic unit of translation work.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const bookRegistration = require('../services/bookRegistration');
const notifications = require('../services/notifications');
const activityLog = require('../services/activityLog');

// Configure multer for section file uploads
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on upload type
    const section = req.sectionData;
    if (!section) {
      return cb(new Error('Section not found'));
    }

    const bookDir = path.join(BOOKS_DIR, section.bookSlug);
    let uploadDir;

    switch (req.params.uploadType) {
      case 'mt':
        uploadDir = path.join(
          bookDir,
          '02-mt-output',
          `ch${String(section.chapterNum).padStart(2, '0')}`
        );
        break;
      case 'faithful':
        uploadDir = path.join(
          bookDir,
          '03-faithful-translation',
          `ch${String(section.chapterNum).padStart(2, '0')}`
        );
        break;
      case 'localized':
        uploadDir = path.join(
          bookDir,
          '04-localized-content',
          `ch${String(section.chapterNum).padStart(2, '0')}`
        );
        break;
      default:
        return cb(new Error('Invalid upload type'));
    }

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const section = req.sectionData;
    const sectionNum = section.sectionNum.replace('.', '-');
    cb(null, `${sectionNum}.is.md`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.md') {
      cb(null, true);
    } else {
      cb(new Error('Only markdown (.md) files are allowed'));
    }
  },
});

// Middleware to load section data before upload
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
    console.error('Load section error:', err);
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
router.get('/:sectionId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
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
    console.error('Get section error:', err);
    res.status(500).json({
      error: 'Failed to get section',
      message: err.message,
    });
  }
});

// ============================================================================
// UPLOAD HANDLERS
// ============================================================================

/**
 * POST /api/sections/:sectionId/upload/:uploadType
 * Upload a file for a section (mt, faithful, or localized)
 *
 * uploadType: 'mt' | 'faithful' | 'localized'
 */
router.post(
  '/:sectionId/upload/:uploadType',
  requireAuth,
  requireRole(ROLES.EDITOR),
  loadSection,
  (req, res, next) => {
    // Check for re-upload restrictions
    const section = req.sectionData;
    const { uploadType } = req.params;

    // MT re-upload requires HEAD_EDITOR
    if (
      uploadType === 'mt' &&
      section.status !== 'not_started' &&
      section.status !== 'mt_pending'
    ) {
      if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.HEAD_EDITOR) {
        return res.status(403).json({
          error: 'Re-upload restricted',
          message: 'Re-uploading MT translation requires head editor or admin role',
          currentStatus: section.status,
          yourRole: req.user.role,
        });
      }
    }

    // Faithful re-upload requires HEAD_EDITOR if already approved
    if (uploadType === 'faithful' && section.status === 'review_approved') {
      if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.HEAD_EDITOR) {
        return res.status(403).json({
          error: 'Re-upload restricted',
          message: 'Re-uploading approved translation requires head editor or admin role',
          currentStatus: section.status,
        });
      }
    }

    next();
  },
  upload.single('file'),
  async (req, res) => {
    const section = req.sectionData;
    const { uploadType } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a markdown file',
      });
    }

    try {
      // Update section status and path based on upload type
      let newStatus;
      const updates = {};

      switch (uploadType) {
        case 'mt':
          newStatus = 'mt_uploaded';
          updates.mtOutputPath = path.relative(
            path.join(BOOKS_DIR, section.bookSlug),
            req.file.path
          );
          break;
        case 'faithful':
          // Only update status if coming from review
          if (section.status.startsWith('review_')) {
            newStatus = section.status; // Keep current status
          }
          updates.faithfulPath = path.relative(
            path.join(BOOKS_DIR, section.bookSlug),
            req.file.path
          );
          break;
        case 'localized':
          updates.localizedPath = path.relative(
            path.join(BOOKS_DIR, section.bookSlug),
            req.file.path
          );
          break;
      }

      if (newStatus) {
        bookRegistration.updateSectionStatus(section.id, newStatus, updates);
      }

      // Log activity
      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'upload',
        entityType: 'section',
        entityId: section.id,
        details: {
          uploadType,
          filename: req.file.originalname,
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
        },
      });

      res.json({
        success: true,
        message: `${uploadType} file uploaded successfully`,
        section: {
          id: section.id,
          sectionNum: section.sectionNum,
          status: newStatus || section.status,
        },
        file: {
          name: req.file.filename,
          path: req.file.path,
          size: req.file.size,
        },
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({
        error: 'Failed to process upload',
        message: err.message,
      });
    }
  }
);

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
  requireRole(ROLES.HEAD_EDITOR),
  loadSection,
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
      await notifications.create({
        userId: reviewerId,
        type: 'assignment',
        title: 'Ný yfirferð úthlutað',
        message: `Þú hefur verið úthlutað yfirferð á kafla ${section.sectionNum} í ${section.bookTitleIs}`,
        link: `/editor?book=${section.bookSlug}&chapter=${section.chapterNum}&section=${section.sectionNum}`,
      });

      // Log activity
      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'assign_reviewer',
        entityType: 'section',
        entityId: section.id,
        details: {
          reviewerId,
          reviewerName,
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Assign reviewer error:', err);
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
  requireRole(ROLES.HEAD_EDITOR),
  loadSection,
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
      await notifications.create({
        userId: localizerId,
        type: 'assignment',
        title: 'Ný staðfæring úthlutað',
        message: `Þú hefur verið úthlutað staðfæringu á kafla ${section.sectionNum} í ${section.bookTitleIs}`,
        link: `/editor?book=${section.bookSlug}&chapter=${section.chapterNum}&section=${section.sectionNum}&mode=localization`,
      });

      // Log activity
      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'assign_localizer',
        entityType: 'section',
        entityId: section.id,
        details: {
          localizerId,
          localizerName,
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Assign localizer error:', err);
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
      if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.HEAD_EDITOR) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: `Status '${status}' requires head editor or admin role`,
        });
      }
    }

    try {
      bookRegistration.updateSectionStatus(section.id, status);

      // Log activity
      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'status_change',
        entityType: 'section',
        entityId: section.id,
        details: {
          fromStatus: section.status,
          toStatus: status,
          notes,
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Update status error:', err);
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
  requireRole(ROLES.CONTRIBUTOR),
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
        userId: req.user.id,
        username: req.user.username,
        action: 'submit_review',
        entityType: 'section',
        entityId: section.id,
        details: {
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Submit review error:', err);
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
  requireRole(ROLES.HEAD_EDITOR),
  loadSection,
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
        await notifications.create({
          userId: section.linguisticReviewer,
          type: 'approval',
          title: 'Yfirferð samþykkt',
          message: `Yfirferð þín á kafla ${section.sectionNum} hefur verið samþykkt`,
          link: `/editor?book=${section.bookSlug}&chapter=${section.chapterNum}&section=${section.sectionNum}`,
        });
      }

      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'approve_review',
        entityType: 'section',
        entityId: section.id,
        details: {
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Approve review error:', err);
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
  requireRole(ROLES.HEAD_EDITOR),
  loadSection,
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
        await notifications.create({
          userId: assignedUserId,
          type: 'changes_requested',
          title: 'Breytingar óskast',
          message: `Breytingar óskast á kafla ${section.sectionNum}: ${notes.substring(0, 100)}...`,
          link: `/editor?book=${section.bookSlug}&chapter=${section.chapterNum}&section=${section.sectionNum}`,
        });
      }

      activityLog.log({
        userId: req.user.id,
        username: req.user.username,
        action: 'request_changes',
        entityType: 'section',
        entityId: section.id,
        details: {
          sectionNum: section.sectionNum,
          chapterNum: section.chapterNum,
          book: section.bookSlug,
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
      console.error('Request changes error:', err);
      res.status(500).json({
        error: 'Failed to request changes',
        message: err.message,
      });
    }
  }
);

module.exports = router;
