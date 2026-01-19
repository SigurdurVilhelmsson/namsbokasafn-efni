/**
 * Localization Suggestions Routes
 *
 * Handles auto-detected localization suggestions:
 * - Scan sections/books for localization opportunities
 * - Accept/reject/modify suggestions
 * - Sync to localization log
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const suggestions = require('../services/localizationSuggestions');
const bookRegistration = require('../services/bookRegistration');
const activityLog = require('../services/activityLog');

// ============================================================================
// SCANNING
// ============================================================================

/**
 * POST /api/suggestions/scan/:sectionId
 * Scan a section for localization suggestions
 */
router.post('/scan/:sectionId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;

  try {
    const result = suggestions.scanSection(parseInt(sectionId, 10));

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'scan_section_suggestions',
      entityType: 'section',
      entityId: parseInt(sectionId, 10),
      details: { suggestionsFound: result.suggestionsCount }
    });

    res.json(result);
  } catch (err) {
    console.error('Scan section error:', err);
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to scan section',
      message: err.message
    });
  }
});

/**
 * POST /api/suggestions/scan-book/:bookSlug
 * Scan an entire book for localization suggestions
 */
router.post('/scan-book/:bookSlug', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { bookSlug } = req.params;

  try {
    const result = suggestions.scanBook(bookSlug);

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'scan_book_suggestions',
      entityType: 'book',
      details: { bookSlug, totalSuggestions: result.totalSuggestions }
    });

    res.json(result);
  } catch (err) {
    console.error('Scan book error:', err);
    res.status(500).json({
      error: 'Failed to scan book',
      message: err.message
    });
  }
});

// ============================================================================
// GET SUGGESTIONS
// ============================================================================

/**
 * GET /api/suggestions/:sectionId
 * Get suggestions for a section
 *
 * Query params:
 *   status: Filter by status (pending, accepted, rejected, modified)
 */
router.get('/:sectionId', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;
  const { status } = req.query;

  try {
    const sectionSuggestions = suggestions.getSuggestions(
      parseInt(sectionId, 10),
      status
    );

    const stats = suggestions.getSuggestionStats(parseInt(sectionId, 10));

    res.json({
      suggestions: sectionSuggestions,
      stats
    });
  } catch (err) {
    console.error('Get suggestions error:', err);
    res.status(500).json({
      error: 'Failed to get suggestions',
      message: err.message
    });
  }
});

/**
 * GET /api/suggestions/:sectionId/stats
 * Get suggestion statistics for a section
 */
router.get('/:sectionId/stats', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;

  try {
    const stats = suggestions.getSuggestionStats(parseInt(sectionId, 10));
    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: err.message
    });
  }
});

/**
 * GET /api/suggestions/patterns
 * Get available localization patterns
 */
router.get('/patterns', requireAuth, (req, res) => {
  const patterns = Object.entries(suggestions.LOCALIZATION_PATTERNS).map(([id, pattern]) => ({
    id,
    type: pattern.type,
    description: pattern.regex.toString()
  }));

  res.json({
    patterns,
    types: suggestions.SUGGESTION_TYPES,
    statuses: suggestions.SUGGESTION_STATUSES
  });
});

// ============================================================================
// REVIEW SUGGESTIONS
// ============================================================================

/**
 * POST /api/suggestions/:id/accept
 * Accept a suggestion as-is
 */
router.post('/:id/accept', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { id } = req.params;

  try {
    const suggestion = suggestions.acceptSuggestion(
      parseInt(id, 10),
      req.user.id,
      req.user.name
    );

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'accept_suggestion',
      entityType: 'suggestion',
      entityId: parseInt(id, 10),
      details: {
        sectionId: suggestion.sectionId,
        type: suggestion.type,
        original: suggestion.originalText
      }
    });

    res.json({
      success: true,
      suggestion
    });
  } catch (err) {
    console.error('Accept suggestion error:', err);
    res.status(500).json({
      error: 'Failed to accept suggestion',
      message: err.message
    });
  }
});

/**
 * POST /api/suggestions/:id/reject
 * Reject a suggestion
 */
router.post('/:id/reject', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { id } = req.params;

  try {
    const suggestion = suggestions.rejectSuggestion(
      parseInt(id, 10),
      req.user.id,
      req.user.name
    );

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'reject_suggestion',
      entityType: 'suggestion',
      entityId: parseInt(id, 10),
      details: {
        sectionId: suggestion.sectionId,
        type: suggestion.type,
        original: suggestion.originalText
      }
    });

    res.json({
      success: true,
      suggestion
    });
  } catch (err) {
    console.error('Reject suggestion error:', err);
    res.status(500).json({
      error: 'Failed to reject suggestion',
      message: err.message
    });
  }
});

/**
 * POST /api/suggestions/:id/modify
 * Accept with modifications
 *
 * Body:
 *   modifiedText: The modified suggestion text
 */
router.post('/:id/modify', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { id } = req.params;
  const { modifiedText } = req.body;

  if (!modifiedText) {
    return res.status(400).json({
      error: 'Missing modifiedText',
      message: 'modifiedText is required'
    });
  }

  try {
    const suggestion = suggestions.modifySuggestion(
      parseInt(id, 10),
      modifiedText,
      req.user.id,
      req.user.name
    );

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'modify_suggestion',
      entityType: 'suggestion',
      entityId: parseInt(id, 10),
      details: {
        sectionId: suggestion.sectionId,
        type: suggestion.type,
        original: suggestion.originalText,
        modified: modifiedText
      }
    });

    res.json({
      success: true,
      suggestion
    });
  } catch (err) {
    console.error('Modify suggestion error:', err);
    res.status(500).json({
      error: 'Failed to modify suggestion',
      message: err.message
    });
  }
});

/**
 * POST /api/suggestions/:sectionId/bulk
 * Bulk accept or reject suggestions
 *
 * Body:
 *   ids: Array of suggestion IDs
 *   action: 'accept' or 'reject'
 */
router.post('/:sectionId/bulk', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;
  const { ids, action } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      error: 'Missing ids',
      message: 'ids array is required'
    });
  }

  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({
      error: 'Invalid action',
      message: 'action must be "accept" or "reject"'
    });
  }

  try {
    const result = suggestions.bulkUpdateSuggestions(
      ids.map(id => parseInt(id, 10)),
      action,
      req.user.id,
      req.user.name
    );

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: `bulk_${action}_suggestions`,
      entityType: 'section',
      entityId: parseInt(sectionId, 10),
      details: { count: ids.length, action }
    });

    res.json(result);
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({
      error: 'Failed to bulk update suggestions',
      message: err.message
    });
  }
});

// ============================================================================
// SYNC TO LOG
// ============================================================================

/**
 * POST /api/suggestions/:sectionId/sync-log
 * Sync accepted suggestions to localization log
 */
router.post('/:sectionId/sync-log', requireAuth, requireRole(ROLES.CONTRIBUTOR), (req, res) => {
  const { sectionId } = req.params;

  try {
    // Verify section exists and user has access
    const section = bookRegistration.getSection(parseInt(sectionId, 10));

    if (!section) {
      return res.status(404).json({
        error: 'Section not found'
      });
    }

    // Check if user is localizer or has elevated permissions
    const canSync = section.localizer === req.user.id ||
                    req.user.role === ROLES.ADMIN ||
                    req.user.role === ROLES.HEAD_EDITOR;

    if (!canSync) {
      return res.status(403).json({
        error: 'Not authorized',
        message: 'Only the assigned localizer can sync suggestions'
      });
    }

    const result = suggestions.syncToLocalizationLog(
      parseInt(sectionId, 10),
      req.user.id
    );

    activityLog.log({
      userId: req.user.id,
      username: req.user.username,
      action: 'sync_suggestions_to_log',
      entityType: 'section',
      entityId: parseInt(sectionId, 10),
      details: { entriesCreated: result.entriesCreated }
    });

    res.json(result);
  } catch (err) {
    console.error('Sync to log error:', err);
    res.status(500).json({
      error: 'Failed to sync to localization log',
      message: err.message
    });
  }
});

module.exports = router;
