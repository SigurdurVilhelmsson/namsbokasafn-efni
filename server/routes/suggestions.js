/**
 * Localization Suggestions Routes
 *
 * Handles auto-detected localization suggestions:
 * - Scan sections/books for localization opportunities
 * - Accept/reject/modify suggestions
 * - Sync to localization log
 *
 * The writes are for the book's head editor and admins. The reads ask for book access.
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const {
  requireRole,
  requireHeadEditor,
  requireHeadEditorFor,
  requireBookAccessForSection,
  ROLES,
} = require('../middleware/requireRole');
const bookRegistration = require('../services/bookRegistration');
const suggestions = require('../services/localizationSuggestions');
const activityLog = require('../services/activityLog');

// ── Section resolvers ──
// Resolve the gated section straight from the :sectionId route param.
const bySectionParam = (req) => req.params.sectionId;
// Resolve a suggestion :id to its owning section (null → 404).
const bySuggestionParam = (req) => {
  const s = suggestions.getSuggestion(parseInt(req.params.id, 10));
  return s ? s.sectionId : null;
};

// ── The writes: the book's head editor, or an admin ──
// Localization is head editors' and admins' work ([USER] 2026-11-14, answer 12), on these routes as on the
// localization page whose review tab calls them. The reads keep the book-access guard.
//
// Three steps, in this order. Anyone below head editor is refused before a section is looked up. The section is
// then loaded and kept on req.section for the handler: a step of its own, because the head-editor guard lets an
// admin through before it resolves a book. Last, a head editor must hold the section's book.
function loadSectionBy(resolveSectionId) {
  return (req, res, next) => {
    const sectionId = resolveSectionId(req);
    const section = sectionId ? bookRegistration.getSection(parseInt(sectionId, 10)) : null;
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }
    req.section = section;
    next();
  };
}
const requireHeadEditorOfSection = (resolveSectionId) => [
  requireRole(ROLES.HEAD_EDITOR),
  loadSectionBy(resolveSectionId),
  requireHeadEditorFor((req) => req.section.bookSlug),
];

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
  requireHeadEditorOfSection(bySectionParam),
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
  requireHeadEditorOfSection(bySuggestionParam),
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
  requireHeadEditorOfSection(bySuggestionParam),
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
  requireHeadEditorOfSection(bySuggestionParam),
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
  requireHeadEditorOfSection(bySectionParam),
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
  requireHeadEditorOfSection(bySectionParam),
  (req, res) => {
    const { sectionId } = req.params;

    try {
      // The guard already resolved (and 404-guarded) the section, and let through only the book's head editor
      // or an admin. Being the section's assigned localizer no longer opens this route.
      const section = req.section;

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
