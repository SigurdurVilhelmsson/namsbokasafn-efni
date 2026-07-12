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

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const {
  requireHeadEditor,
  requireBookAccessForSection,
  ROLES,
} = require('../middleware/requireRole');
const suggestions = require('../services/localizationSuggestions');
const activityLog = require('../services/activityLog');

// ── requireBookAccessForSection resolvers ──
// Resolve the gated section straight from the :sectionId route param.
const bySectionParam = (req) => req.params.sectionId;
// Resolve a suggestion :id to its owning section (null → middleware 404s).
const bySuggestionParam = (req) => {
  const s = suggestions.getSuggestion(parseInt(req.params.id, 10));
  return s ? s.sectionId : null;
};

// ============================================================================
// SCANNING
// ============================================================================

/**
 * POST /api/suggestions/scan/:sectionId
 * Scan a section for localization suggestions
 */
router.post(
  '/scan/:sectionId',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      const result = suggestions.scanSection(parseInt(sectionId, 10));

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SCANNED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} skannaði kafla ${req.section.sectionNum} eftir staðfæringartillögum`,
        metadata: { sectionId: parseInt(sectionId, 10), suggestionsFound: result.suggestionsCount },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Scan section error');
      res.status(err.message.includes('not found') ? 404 : 500).json({
        error: 'Failed to scan section',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/suggestions/scan-book/:bookSlug
 * Scan an entire book for localization suggestions
 */
router.post('/scan-book/:bookSlug', requireAuth, requireHeadEditor('bookSlug'), (req, res) => {
  const { bookSlug } = req.params;

  try {
    const result = suggestions.scanBook(bookSlug);

    activityLog.log({
      type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SCANNED,
      userId: req.user.id,
      username: req.user.username,
      book: bookSlug,
      description: `${req.user.username} skannaði bókina ${bookSlug} eftir staðfæringartillögum`,
      metadata: {
        bookSlug,
        sectionsScanned: result.sectionsScanned,
        totalSuggestions: result.totalSuggestions,
      },
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Scan book error');
    res.status(500).json({
      error: 'Failed to scan book',
      message: err.message,
    });
  }
});

// ============================================================================
// GET SUGGESTIONS
// ============================================================================

/**
 * GET /api/suggestions/patterns
 * Get available localization patterns
 * NOTE: Must be defined before /:sectionId to avoid "patterns" being matched as :sectionId
 */
router.get('/patterns', requireAuth, (req, res) => {
  const patterns = Object.entries(suggestions.LOCALIZATION_PATTERNS).map(([id, pattern]) => ({
    id,
    type: pattern.type,
    description: pattern.regex.toString(),
  }));

  res.json({
    patterns,
    types: suggestions.SUGGESTION_TYPES,
    statuses: suggestions.SUGGESTION_STATUSES,
  });
});

/**
 * GET /api/suggestions/:sectionId
 * Get suggestions for a section
 *
 * Query params:
 *   status: Filter by status (pending, accepted, rejected, modified)
 */
router.get('/:sectionId', requireAuth, requireBookAccessForSection(bySectionParam), (req, res) => {
  const { sectionId } = req.params;
  const { status } = req.query;

  try {
    const sectionSuggestions = suggestions.getSuggestions(parseInt(sectionId, 10), status);

    const stats = suggestions.getSuggestionStats(parseInt(sectionId, 10));

    res.json({
      suggestions: sectionSuggestions,
      stats,
    });
  } catch (err) {
    log.error({ err }, 'Get suggestions error');
    res.status(500).json({
      error: 'Failed to get suggestions',
      message: err.message,
    });
  }
});

/**
 * GET /api/suggestions/:sectionId/stats
 * Get suggestion statistics for a section
 */
router.get(
  '/:sectionId/stats',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      const stats = suggestions.getSuggestionStats(parseInt(sectionId, 10));
      res.json(stats);
    } catch (err) {
      log.error({ err }, 'Get suggestion stats error');
      res.status(500).json({
        error: 'Failed to get statistics',
        message: err.message,
      });
    }
  }
);

// ============================================================================
// REVIEW SUGGESTIONS
// ============================================================================

/**
 * POST /api/suggestions/:id/accept
 * Accept a suggestion as-is
 */
router.post(
  '/:id/accept',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;

    try {
      const suggestion = suggestions.acceptSuggestion(parseInt(id, 10), req.user.id, req.user.name);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_ACCEPTED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} samþykkti staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Accept suggestion error');
      res.status(500).json({
        error: 'Failed to accept suggestion',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/suggestions/:id/reject
 * Reject a suggestion
 */
router.post(
  '/:id/reject',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;

    try {
      const suggestion = suggestions.rejectSuggestion(parseInt(id, 10), req.user.id, req.user.name);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_REJECTED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} hafnaði staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Reject suggestion error');
      res.status(500).json({
        error: 'Failed to reject suggestion',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/suggestions/:id/modify
 * Accept with modifications
 *
 * Body:
 *   modifiedText: The modified suggestion text
 */
router.post(
  '/:id/modify',
  requireAuth,
  requireBookAccessForSection(bySuggestionParam),
  (req, res) => {
    const { id } = req.params;
    const { modifiedText } = req.body;

    if (!modifiedText) {
      return res.status(400).json({
        error: 'Missing modifiedText',
        message: 'modifiedText is required',
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
        type: activityLog.ACTIVITY_TYPES.SUGGESTION_MODIFIED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} breytti og samþykkti staðfæringartillögu #${id} í kafla ${req.section.sectionNum}`,
        metadata: {
          suggestionId: parseInt(id, 10),
          sectionId: suggestion.sectionId,
          suggestionType: suggestion.type,
          original: suggestion.originalText,
          modified: modifiedText,
        },
      });

      res.json({
        success: true,
        suggestion,
      });
    } catch (err) {
      log.error({ err }, 'Modify suggestion error');
      res.status(500).json({
        error: 'Failed to modify suggestion',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/suggestions/:sectionId/bulk
 * Bulk accept or reject suggestions
 *
 * Body:
 *   ids: Array of suggestion IDs
 *   action: accept or reject
 */
router.post(
  '/:sectionId/bulk',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Missing ids',
        message: 'ids array is required',
      });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        message: 'action must be "accept" or "reject"',
      });
    }

    try {
      // Book-scope containment: every id must belong to the gated section —
      // otherwise the :sectionId gate could be cleared with one section while
      // mutating another book's rows.
      const requestedIds = ids.map((id) => parseInt(id, 10));
      const sectionIds = new Set(
        suggestions.getSuggestions(parseInt(sectionId, 10)).map((s) => s.id)
      );
      const foreign = requestedIds.filter((id) => !sectionIds.has(id));
      if (foreign.length > 0) {
        return res.status(400).json({
          error: 'Invalid ids',
          message: `Suggestions do not belong to section ${sectionId}: ${foreign.join(', ')}`,
        });
      }

      const result = suggestions.bulkUpdateSuggestions(
        requestedIds,
        action,
        req.user.id,
        req.user.name
      );

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_BULK_REVIEWED,
        userId: req.user.id,
        username: req.user.username,
        book: req.section.bookSlug,
        chapter: String(req.section.chapterNum),
        section: req.section.sectionNum,
        description: `${req.user.username} afgreiddi ${requestedIds.length} staðfæringartillögur (${action}) í kafla ${req.section.sectionNum}`,
        metadata: {
          sectionId: parseInt(sectionId, 10),
          count: requestedIds.length,
          bulkAction: action,
        },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Bulk update suggestions error');
      res.status(500).json({
        error: 'Failed to bulk update suggestions',
        message: err.message,
      });
    }
  }
);

// ============================================================================
// SYNC TO LOG
// ============================================================================

/**
 * POST /api/suggestions/:sectionId/sync-log
 * Sync accepted suggestions to localization log
 */
router.post(
  '/:sectionId/sync-log',
  requireAuth,
  requireBookAccessForSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      // Middleware already resolved (and 404-guarded) the section.
      const section = req.section;

      // Sync is restricted to the assigned localizer or elevated roles —
      // elevated meaning admin, or a head-editor OF THIS BOOK (a global
      // head-editor check here was the B1-F1 class: any HE of any book passed).
      const canSync =
        section.localizer === req.user.id ||
        req.user.role === ROLES.ADMIN ||
        (req.user.role === ROLES.HEAD_EDITOR &&
          Array.isArray(req.user.books) &&
          req.user.books.includes(section.bookSlug));

      if (!canSync) {
        return res.status(403).json({
          error: 'Not authorized',
          message: 'Only the assigned localizer can sync suggestions',
        });
      }

      const result = suggestions.syncToLocalizationLog(parseInt(sectionId, 10), req.user.id);

      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SUGGESTIONS_SYNCED,
        userId: req.user.id,
        username: req.user.username,
        book: section.bookSlug,
        chapter: String(section.chapterNum),
        section: section.sectionNum,
        description: `${req.user.username} samstillti samþykktar staðfæringartillögur við staðfæringarskrá fyrir kafla ${section.sectionNum}`,
        metadata: { sectionId: parseInt(sectionId, 10), entriesCreated: result.entriesCreated },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Sync suggestions to log error');
      res.status(500).json({
        error: 'Failed to sync to localization log',
        message: err.message,
      });
    }
  }
);

module.exports = router;
