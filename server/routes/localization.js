/**
 * Localization Routes
 *
 * Handles the localization (Pass 2) workflow:
 * - Loading localization log
 * - Adding/updating log entries
 * - Submitting localization for approval
 * - Approving/rejecting localization
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const bookRegistration = require('../services/bookRegistration');
const localizationLog = require('../services/localizationLog');
const notifications = require('../services/notifications');
const activityLog = require('../services/activityLog');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// ============================================================================
// LOCALIZATION LOG ENDPOINTS
// ============================================================================

/**
 * GET /api/localization/:sectionId
 * Get localization state and log for a section
 */
router.get('/:sectionId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found',
        message: `No section with ID ${sectionId}`
      });
    }

    // Get or create log
    const log = localizationLog.getLog(section.id);

    // Determine user's role in this section
    const isLocalizer = section.localizer === req.user.id;
    const canEdit = isLocalizer || req.user.role === ROLES.ADMIN || req.user.role === ROLES.HEAD_EDITOR;
    const canSubmit = isLocalizer && section.status === 'localization_in_progress';
    const canApprove = (req.user.role === ROLES.ADMIN || req.user.role === ROLES.HEAD_EDITOR) &&
                       section.status === 'localization_submitted';

    res.json({
      section: {
        id: section.id,
        bookSlug: section.bookSlug,
        bookTitleIs: section.bookTitleIs,
        chapterNum: section.chapterNum,
        sectionNum: section.sectionNum,
        titleEn: section.titleEn,
        status: section.status,
        localizer: section.localizer,
        localizerName: section.localizerName,
        localizationAssignedAt: section.localizationAssignedAt,
        localizationSubmittedAt: section.localizationSubmittedAt
      },
      log: log || { entries: [] },
      permissions: {
        canEdit,
        canSubmit,
        canApprove,
        isLocalizer
      },
      entryTypes: localizationLog.LOG_ENTRY_TYPES
    });
  } catch (err) {
    console.error('Get localization error:', err);
    res.status(500).json({
      error: 'Failed to get localization state',
      message: err.message
    });
  }
});

/**
 * POST /api/localization/:sectionId/log/add
 * Add an entry to the localization log
 *
 * Body:
 *   - type: Entry type (unit_conversion, cultural_adaptation, etc.)
 *   - original: Original text
 *   - changedTo: New localized text
 *   - reason: Reason for the change
 *   - location: Optional location reference
 */
router.post('/:sectionId/log/add', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;
  const { type, original, changedTo, reason, location } = req.body;

  if (!type || !original || !changedTo || !reason) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'type, original, changedTo, and reason are required'
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
    const canEdit = section.localizer === req.user.id ||
                    req.user.role === ROLES.ADMIN ||
                    req.user.role === ROLES.HEAD_EDITOR;

    if (!canEdit) {
      return res.status(403).json({
        error: 'Not authorized',
        message: 'Only the assigned localizer can add log entries'
      });
    }

    const result = localizationLog.addEntry(
      section.id,
      { type, original, changedTo, reason, location },
      req.user.id
    );

    res.json({
      success: true,
      entry: result.entry,
      totalEntries: result.totalEntries
    });
  } catch (err) {
    console.error('Add log entry error:', err);
    res.status(500).json({
      error: 'Failed to add log entry',
      message: err.message
    });
  }
});

/**
 * PUT /api/localization/:sectionId/log/:entryId
 * Update a log entry
 */
router.put('/:sectionId/log/:entryId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId, entryId } = req.params;
  const updates = req.body;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    // Validate user can edit
    const canEdit = section.localizer === req.user.id ||
                    req.user.role === ROLES.ADMIN ||
                    req.user.role === ROLES.HEAD_EDITOR;

    if (!canEdit) {
      return res.status(403).json({
        error: 'Not authorized'
      });
    }

    const entry = localizationLog.updateEntry(section.id, entryId, updates);

    res.json({
      success: true,
      entry
    });
  } catch (err) {
    console.error('Update log entry error:', err);
    res.status(500).json({
      error: 'Failed to update log entry',
      message: err.message
    });
  }
});

/**
 * DELETE /api/localization/:sectionId/log/:entryId
 * Remove a log entry
 */
router.delete('/:sectionId/log/:entryId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId, entryId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    // Validate user can edit
    const canEdit = section.localizer === req.user.id ||
                    req.user.role === ROLES.ADMIN ||
                    req.user.role === ROLES.HEAD_EDITOR;

    if (!canEdit) {
      return res.status(403).json({
        error: 'Not authorized'
      });
    }

    localizationLog.removeEntry(section.id, entryId);

    res.json({
      success: true,
      message: 'Entry removed'
    });
  } catch (err) {
    console.error('Remove log entry error:', err);
    res.status(500).json({
      error: 'Failed to remove log entry',
      message: err.message
    });
  }
});

/**
 * POST /api/localization/:sectionId/log/save
 * Bulk save all log entries
 */
router.post('/:sectionId/log/save', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;
  const { entries } = req.body;

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({
      error: 'Missing entries',
      message: 'entries array is required'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    // Validate user can edit
    const canEdit = section.localizer === req.user.id ||
                    req.user.role === ROLES.ADMIN ||
                    req.user.role === ROLES.HEAD_EDITOR;

    if (!canEdit) {
      return res.status(403).json({
        error: 'Not authorized'
      });
    }

    const result = localizationLog.saveEntries(section.id, entries, req.user.id);

    res.json({
      success: true,
      totalEntries: result.totalEntries
    });
  } catch (err) {
    console.error('Save log entries error:', err);
    res.status(500).json({
      error: 'Failed to save log entries',
      message: err.message
    });
  }
});

// ============================================================================
// LOCALIZATION WORKFLOW
// ============================================================================

/**
 * POST /api/localization/:sectionId/submit
 * Submit localization for approval
 *
 * Body:
 *   - content: The localized markdown content
 */
router.post('/:sectionId/submit', requireAuth, requireRole(ROLES.CONTRIBUTOR), async (req, res) => {
  const { sectionId } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({
      error: 'Missing content',
      message: 'Localized content is required'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    // Validate user is localizer
    if (section.localizer !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        error: 'Not authorized',
        message: 'Only the assigned localizer can submit'
      });
    }

    // Validate status
    if (section.status !== 'localization_in_progress') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot submit from status '${section.status}'`
      });
    }

    // Validate log has entries
    const log = localizationLog.getLog(section.id);
    if (!log || !log.entries || log.entries.length === 0) {
      return res.status(400).json({
        error: 'Missing log entries',
        message: 'Localization log must have at least one entry documenting changes'
      });
    }

    // Save localized content to file
    const localizedDir = path.join(
      BOOKS_DIR,
      section.bookSlug,
      '04-localized-content',
      `ch${String(section.chapterNum).padStart(2, '0')}`
    );

    if (!fs.existsSync(localizedDir)) {
      fs.mkdirSync(localizedDir, { recursive: true });
    }

    const filename = `${section.sectionNum.replace('.', '-')}.is.md`;
    const filePath = path.join(localizedDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');

    // Update section status
    bookRegistration.updateSectionStatus(section.id, 'localization_submitted', {
      localizedPath: path.relative(path.join(BOOKS_DIR, section.bookSlug), filePath)
    });

    // Notify head editors
    const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);
    for (const adminId of adminUserIds) {
      await notifications.create({
        userId: adminId.trim(),
        type: 'localization_submitted',
        title: 'Ný staðfæring til samþykktar',
        message: `${req.user.username} hefur sent inn staðfæringu á ${section.sectionNum} í ${section.bookTitleIs}`,
        link: `/localization?sectionId=${section.id}`
      });
    }

    // Log activity
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
        logEntries: log.entries.length
      }
    });

    res.json({
      success: true,
      message: 'Localization submitted for approval',
      section: {
        id: section.id,
        status: 'localization_submitted'
      }
    });
  } catch (err) {
    console.error('Submit localization error:', err);
    res.status(500).json({
      error: 'Failed to submit localization',
      message: err.message
    });
  }
});

/**
 * POST /api/localization/:sectionId/approve
 * Approve localization
 */
router.post('/:sectionId/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), async (req, res) => {
  const { sectionId } = req.params;

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    if (section.status !== 'localization_submitted') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot approve from status '${section.status}'`
      });
    }

    // Update status
    bookRegistration.updateSectionStatus(section.id, 'localization_approved', {
      localizationApprovedBy: req.user.id,
      localizationApprovedByName: req.user.name
    });

    // Notify localizer
    if (section.localizer) {
      await notifications.create({
        userId: section.localizer,
        type: 'localization_approved',
        title: 'Staðfæring samþykkt',
        message: `Staðfæring þín á ${section.sectionNum} hefur verið samþykkt`,
        link: `/books/${section.bookSlug}`
      });
    }

    // Log activity
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'approve_localization',
      entityType: 'section',
      entityId: section.id,
      details: {
        sectionNum: section.sectionNum,
        chapterNum: section.chapterNum,
        book: section.bookSlug,
        localizer: section.localizerName
      }
    });

    res.json({
      success: true,
      message: 'Localization approved',
      section: {
        id: section.id,
        status: 'localization_approved'
      }
    });
  } catch (err) {
    console.error('Approve localization error:', err);
    res.status(500).json({
      error: 'Failed to approve localization',
      message: err.message
    });
  }
});

/**
 * POST /api/localization/:sectionId/request-changes
 * Request changes on localization
 */
router.post('/:sectionId/request-changes', requireAuth, requireRole(ROLES.HEAD_EDITOR), async (req, res) => {
  const { sectionId } = req.params;
  const { notes } = req.body;

  if (!notes) {
    return res.status(400).json({
      error: 'Missing notes',
      message: 'Feedback notes are required'
    });
  }

  try {
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    if (section.status !== 'localization_submitted') {
      return res.status(400).json({
        error: 'Invalid status',
        message: `Cannot request changes from status '${section.status}'`
      });
    }

    // Update status back to in progress
    bookRegistration.updateSectionStatus(section.id, 'localization_in_progress');

    // Notify localizer
    if (section.localizer) {
      await notifications.create({
        userId: section.localizer,
        type: 'changes_requested',
        title: 'Breytingar óskast á staðfæringu',
        message: `Breytingar óskast á ${section.sectionNum}: ${notes.substring(0, 100)}...`,
        link: `/localization?sectionId=${section.id}`
      });
    }

    // Log activity
    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'request_localization_changes',
      entityType: 'section',
      entityId: section.id,
      details: {
        sectionNum: section.sectionNum,
        chapterNum: section.chapterNum,
        book: section.bookSlug,
        notes
      }
    });

    res.json({
      success: true,
      message: 'Changes requested',
      section: {
        id: section.id,
        status: 'localization_in_progress'
      }
    });
  } catch (err) {
    console.error('Request changes error:', err);
    res.status(500).json({
      error: 'Failed to request changes',
      message: err.message
    });
  }
});

/**
 * GET /api/localization/stats
 * Get localization statistics
 */
router.get('/stats', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { bookId } = req.query;

  try {
    const stats = localizationLog.getStats(bookId ? parseInt(bookId, 10) : null);

    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: err.message
    });
  }
});

module.exports = router;
