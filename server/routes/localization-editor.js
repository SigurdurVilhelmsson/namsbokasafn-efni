/**
 * Localization Editor Routes
 *
 * Segment-level localization editor (Pass 2).
 * Three-column view: EN (reference) | Faithful IS (source) | Localized IS (editable).
 * Saves localized segments to 04-localized-content/.
 *
 * Endpoints:
 *   GET  /api/localization-editor/:book/:chapter          List modules with localization status
 *   GET  /api/localization-editor/:book/:chapter/:moduleId Load module for localization
 *   POST /api/localization-editor/:book/:chapter/:moduleId/save      Save single segment
 *   POST /api/localization-editor/:book/:chapter/:moduleId/save-all  Save all segments
 *   GET  /api/localization-editor/:book/:chapter/:moduleId/history           Module edit history
 *   GET  /api/localization-editor/:book/:chapter/:moduleId/:segmentId/history Segment edit history
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const segmentParser = require('../services/segmentParser');
const segmentValidation = require('../public/js/segment-validation');
const localizationEditService = require('../services/localizationEditService');
const localizationReview = require('../services/localizationReviewService');
const contentVersionService = require('../services/contentVersionService');
const activityLog = require('../services/activityLog');
const { requireAuth } = require('../middleware/requireAuth');
const {
  requireRole,
  requireBookAccess,
  requireHeadEditor,
  requireHeadEditorFor,
  ROLES,
} = require('../middleware/requireRole');
const { validateBookChapter, validateModule } = require('../middleware/validateParams');
const { PASS2_CATEGORIES: VALID_CATEGORIES } = require('../constants');

// Resolve the owning book for a localization edit id (for book-scoped authz on
// the :editId-keyed approve/reject endpoints).
function bookFromLocEditId(req) {
  const edit = localizationReview.getEditById(parseInt(req.params.editId, 10));
  if (!edit) throw new Error('Edit not found');
  return edit.book;
}

// Per-module write lock to prevent read-modify-write race conditions.
// Key: "book/chapter/moduleId", Value: Promise chain
const moduleLocks = new Map();

/**
 * Acquire a per-module lock. Returns a release function.
 * Concurrent callers for the same module key are serialized.
 */
function acquireModuleLock(key) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const prev = moduleLocks.get(key) || Promise.resolve();
  const mine = prev.then(() => gate);
  moduleLocks.set(key, mine);
  // Prune the entry once this link settles, so the Map doesn't grow unbounded
  // with one key per module ever edited. Only delete if nothing newer queued
  // behind us (otherwise we'd drop a live tail and break serialization).
  mine.finally(() => {
    if (moduleLocks.get(key) === mine) {
      moduleLocks.delete(key);
    }
  });
  return prev.then(() => release);
}

const { VALID_BOOKS } = require('../config');
const { enrichChapters, enrichModules } = require('../services/bookDataLoader');

// =====================================================================
// REVIEW TIER (Pass 2 checks & balances)
// Registered before the parameterized /:book routes so literal-prefixed
// paths ("settings", "review-queue", "loc-edit") are not shadowed.
// =====================================================================

/**
 * GET /settings/:book
 * Whether the localization review tier is enforced for this book. Any editor
 * may read it (the editor UI needs it to choose submit-vs-save).
 */
router.get('/settings/:book', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Ógild bók: ${book}` });
  }
  try {
    res.json({ book, enforceLocalizationReview: localizationReview.isReviewEnabled(book) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /settings/:book  { enforceLocalizationReview: boolean }
 * Toggle the review tier for a book (admin only).
 */
router.post('/settings/:book', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Ógild bók: ${book}` });
  }
  if (typeof req.body?.enforceLocalizationReview !== 'boolean') {
    return res.status(400).json({ error: 'enforceLocalizationReview (boolean) is required' });
  }
  try {
    const enabled = localizationReview.setReviewEnabled(book, req.body.enforceLocalizationReview);
    activityLog.log({
      type: 'localization_review_toggled',
      userId: String(req.user.id),
      username: req.user.username,
      book,
      description: `${req.user.username} ${enabled ? 'kveikti á' : 'slökkti á'} yfirlestri staðfærslu fyrir ${book}`,
    });
    res.json({ book, enforceLocalizationReview: enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /review-queue/:book?
 * Pending localization edits grouped by module (head-editor review queue).
 */
router.get('/review-queue/:book', requireAuth, requireHeadEditor(), (req, res) => {
  try {
    res.json({ queue: localizationReview.getReviewQueue(req.params.book) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /loc-edit/:editId/approve
 * Approve a pending localization edit and apply it to 04-localized-content/.
 * Book-scoped head-editor (admin bypasses).
 */
router.post(
  '/loc-edit/:editId/approve',
  requireAuth,
  requireHeadEditorFor(bookFromLocEditId),
  (req, res) => {
    try {
      const { edit, savedPath } = localizationReview.approveAndApply(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      res.json({ success: true, edit, savedPath });
      activityLog.log({
        type: 'localization_edit_approved',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: String(edit.chapter),
        section: edit.module_id,
        description: `${req.user.username} samþykkti staðfærslu á ${edit.module_id}:${edit.segment_id}`,
      });
    } catch (err) {
      const status =
        err.code === 'PENDING_EXISTS' ? 409 : err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * POST /loc-edit/:editId/reject
 * Reject a pending localization edit. Book-scoped head-editor.
 */
router.post(
  '/loc-edit/:editId/reject',
  requireAuth,
  requireHeadEditorFor(bookFromLocEditId),
  (req, res) => {
    try {
      const edit = localizationReview.rejectEdit(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      res.json({ success: true, edit });
      activityLog.log({
        type: 'localization_edit_rejected',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: String(edit.chapter),
        section: edit.module_id,
        description: `${req.user.username} hafnaði staðfærslu á ${edit.module_id}:${edit.segment_id}`,
      });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// =====================================================================
// MODULE LISTING
// =====================================================================

/**
 * GET /:book/chapters
 * List available chapters for a book (scans 02-for-mt directory).
 */
router.get('/:book/chapters', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { book } = req.params;
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Ógild bók: ${book}` });
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
 * List modules in a chapter with localization status.
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
      log.error({ err }, 'Error listing modules for localization');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// LOAD MODULE FOR LOCALIZATION
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId
 * Load a module's segments for localization (three-way: EN | faithful IS | localized IS).
 */
router.get(
  '/:book/:chapter/:moduleId',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      res.json(data);
    } catch (err) {
      log.error({ err }, 'Error loading module for localization');
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  }
);

// =====================================================================
// SAVE LOCALIZED SEGMENTS
// =====================================================================

/**
 * POST /:book/:chapter/:moduleId/save
 * Save a single localized segment.
 * Loads existing localized file (or copies from faithful), updates the segment, and saves.
 */
router.post(
  '/:book/:chapter/:moduleId/save',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  async (req, res) => {
    const { segmentId, content, category, lastModified } = req.body;

    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (typeof content === 'string' && content.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      // Conflict detection: check if file was modified since client loaded it
      if (lastModified != null) {
        const currentMtime = segmentParser.getLocalizedMtime(
          req.params.book,
          req.chapterNum,
          req.params.moduleId
        );
        if (currentMtime != null && Math.abs(currentMtime - lastModified) > 1) {
          return res.status(409).json({
            error: 'conflict',
            message:
              'Einingin hefur verið breytt af öðrum notanda. Endurhlaðið til að sjá nýjustu útgáfu.',
            currentLastModified: currentMtime,
          });
        }
      }

      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // SR-OOS-2 FIX5: an unknown segmentId used to fall through silently —
      // it's absent from data.segments (paired from the EN source), so the
      // map below just never wrote it and the route still returned 200/success.
      // 404 instead (parity with the segment-editor route's identical guard).
      const targetSeg = data.segments.find((seg) => seg.segmentId === segmentId);
      if (!targetSeg) {
        return res.status(404).json({ error: 'segment not found' });
      }
      const previousContent = targetSeg.hasLocalized ? targetSeg.localized : targetSeg.faithful;

      // Build the full segment list for saving.
      // Start from existing localized data, or from faithful if no localized file yet.
      const segments = data.segments.map((seg) => ({
        segmentId: seg.segmentId,
        content:
          seg.segmentId === segmentId ? content : seg.hasLocalized ? seg.localized : seg.faithful,
      }));

      // SR-OOS-2 backstop (parity with the segment-editor's edValidateSegmentEdit):
      // baseline is the FAITHFUL text (localization's source of truth), warnings
      // are advisory-only and never enforced here (design D3/D5). Identity edits
      // (content unchanged from what the pane currently shows) skip validation.
      if (content !== previousContent) {
        const structure = segmentValidation.validateStructure(
          targetSeg.en,
          targetSeg.faithful,
          content
        );
        if (structure.blocked) {
          return res.status(400).json({
            error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
            violations: structure.blocked,
          });
        }
      }

      // Review tier: when enforced for this book, hold the edit as pending for
      // head-editor approval instead of writing 04-localized-content/ directly.
      if (localizationReview.isReviewEnabled(req.params.book)) {
        const submitted = localizationReview.submitEdit({
          book: req.params.book,
          chapter: req.chapterNum,
          moduleId: req.params.moduleId,
          segmentId,
          originalContent: previousContent,
          editedContent: content,
          category: category || null,
          editorId: req.user.id,
          editorUsername: req.user.username,
        });
        res.json({ success: true, pending: true, segmentId, editId: submitted.id });
        activityLog.log({
          type: 'localization_edit_submitted',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} sendi staðfærslu á ${segmentId} til yfirlestrar`,
        });
        return;
      }

      const { savedPath } = contentVersionService.saveLocalizedWithSnapshot(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        segments,
        req.user.username
      );

      // Get updated mtime for client
      const newMtime = segmentParser.getLocalizedMtime(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Fire-and-forget audit log — don't block the response
      if (previousContent !== content) {
        try {
          localizationEditService.logLocalizationEdit({
            book: req.params.book,
            chapter: req.chapterNum,
            moduleId: req.params.moduleId,
            segmentId,
            previousContent,
            newContent: content,
            category: category || null,
            editorId: String(req.user.id),
            editorUsername: req.user.username,
          });
        } catch (logErr) {
          log.error({ err: logErr }, 'Audit log failed (single save)');
        }
      }

      res.json({
        success: true,
        segmentId,
        savedPath,
        lastModified: newMtime,
      });
      activityLog.log({
        type: 'localization_edit_saved',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} breytti ${segmentId} í ${req.params.moduleId}`,
      });
    } catch (err) {
      log.error({ err }, 'Error saving localized segment');
      res.status(500).json({ error: err.message });
    } finally {
      release();
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/save-all
 * Save all localized segments at once (bulk save).
 * Body: { segments: [{ segmentId, content }] }
 */
router.post(
  '/:book/:chapter/:moduleId/save-all',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  async (req, res) => {
    const { segments, lastModified } = req.body;

    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'segments array is required' });
    }
    const oversized = segments.find(
      (s) => typeof s.content === 'string' && s.content.length > 10000
    );
    if (oversized) {
      return res.status(400).json({
        error: `Content too long for segment ${oversized.segmentId} (max 10,000 characters)`,
      });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      // Conflict detection: check if file was modified since client loaded it
      if (lastModified != null) {
        const currentMtime = segmentParser.getLocalizedMtime(
          req.params.book,
          req.chapterNum,
          req.params.moduleId
        );
        if (currentMtime != null && Math.abs(currentMtime - lastModified) > 1) {
          return res.status(409).json({
            error: 'conflict',
            message:
              'Einingin hefur verið breytt af öðrum notanda. Endurhlaðið til að sjá nýjustu útgáfu.',
            currentLastModified: currentMtime,
          });
        }
      }

      // Build lookups from request
      const editLookup = {};
      for (const seg of segments) {
        if (seg.segmentId && seg.content !== undefined && seg.content !== null) {
          editLookup[seg.segmentId] = { content: seg.content, category: seg.category };
        }
      }

      // Load current state to fill in any segments not included in the request
      const data = segmentParser.loadModuleForLocalization(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      const allSegments = data.segments.map((seg) => ({
        segmentId: seg.segmentId,
        content:
          editLookup[seg.segmentId] !== undefined
            ? editLookup[seg.segmentId].content
            : seg.hasLocalized
              ? seg.localized
              : seg.faithful,
      }));

      // Build audit trail entries before saving
      const auditEdits = [];
      for (const seg of data.segments) {
        if (editLookup[seg.segmentId] !== undefined) {
          const previousContent = seg.hasLocalized ? seg.localized : seg.faithful;
          const newContent = editLookup[seg.segmentId].content;
          if (previousContent !== newContent) {
            auditEdits.push({
              book: req.params.book,
              chapter: req.chapterNum,
              moduleId: req.params.moduleId,
              segmentId: seg.segmentId,
              previousContent,
              newContent,
              category: editLookup[seg.segmentId]?.category || null,
              editorId: String(req.user.id),
              editorUsername: req.user.username,
            });
          }
        }
      }

      // SR-OOS-2 backstop: validate every changed segment against its
      // faithful baseline; reject the whole batch on any violation — a
      // partial apply of a structurally broken batch is worse than a clean
      // retry (design §4).
      const batchViolations = [];
      for (const e of auditEdits) {
        const segData = data.segments.find((s) => s.segmentId === e.segmentId);
        if (!segData) continue;
        const structure = segmentValidation.validateStructure(
          segData.en,
          segData.faithful,
          e.newContent
        );
        if (structure.blocked) {
          for (const v of structure.blocked) {
            batchViolations.push({ code: v.code, params: { ...v.params, segmentId: e.segmentId } });
          }
        }
      }
      if (batchViolations.length > 0) {
        return res.status(400).json({
          error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
          violations: batchViolations,
        });
      }

      // Review tier: when enforced, submit each changed segment for approval
      // instead of writing 04-localized-content/ directly.
      if (localizationReview.isReviewEnabled(req.params.book)) {
        for (const e of auditEdits) {
          localizationReview.submitEdit({
            book: e.book,
            chapter: e.chapter,
            moduleId: e.moduleId,
            segmentId: e.segmentId,
            originalContent: e.previousContent,
            editedContent: e.newContent,
            category: e.category,
            editorId: e.editorId,
            editorUsername: e.editorUsername,
          });
        }
        res.json({
          success: true,
          pending: true,
          submittedSegments: auditEdits.length,
          totalSegments: allSegments.length,
        });
        activityLog.log({
          type: 'localization_edits_submitted',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} sendi ${auditEdits.length} hluta í ${req.params.moduleId} til yfirlestrar`,
        });
        return;
      }

      // I15-R5 (lead-decided mechanism c): the 60s autosave marks itself and
      // skips the version snapshot — explicit saves and approvals still
      // snapshot. Strict === true so nothing else can accidentally skip.
      const { savedPath } = contentVersionService.saveLocalizedWithSnapshot(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        allSegments,
        req.user.username,
        { snapshot: req.body.autosave !== true }
      );

      // Get updated mtime for client
      const newMtime = segmentParser.getLocalizedMtime(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );

      // Fire-and-forget audit log — don't block the response
      if (auditEdits.length > 0) {
        try {
          localizationEditService.logLocalizationEdits(auditEdits);
        } catch (logErr) {
          log.error({ err: logErr }, 'Audit log failed (bulk save)');
        }
      }

      res.json({
        success: true,
        savedSegments: Object.keys(editLookup).length,
        totalSegments: allSegments.length,
        savedPath,
        lastModified: newMtime,
      });
      activityLog.log({
        type: 'localization_edits_saved',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} vistaði ${Object.keys(editLookup).length} hluta í ${req.params.moduleId}`,
      });
    } catch (err) {
      log.error({ err }, 'Error saving localized segments');
      res.status(500).json({ error: err.message });
    } finally {
      release();
    }
  }
);

// =====================================================================
// PENDING REVIEW EDITS (status badges + head-editor review panel)
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId/pending-edits
 * All review-tier edits for a module (any status). Used by the editor to show
 * per-segment review status and by head-editors to drive the approve/reject UI.
 */
router.get(
  '/:book/:chapter/:moduleId/pending-edits',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      res.json({
        enforceLocalizationReview: localizationReview.isReviewEnabled(req.params.book),
        edits: localizationReview.getModuleEdits(req.params.book, req.params.moduleId),
      });
    } catch (err) {
      log.error({ err }, 'Error loading pending localization edits');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// EDIT HISTORY
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId/history
 * Get localization edit history for a module.
 */
router.get(
  '/:book/:chapter/:moduleId/history',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const history = localizationEditService.getModuleHistory(
        req.params.book,
        req.params.moduleId,
        limit
      );
      res.json({ history });
    } catch (err) {
      log.error({ err }, 'Error fetching module history');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/:segmentId/history
 * Get localization edit history for a specific segment.
 */
router.get(
  '/:book/:chapter/:moduleId/:segmentId/history',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
      const history = localizationEditService.getSegmentHistory(
        req.params.book,
        req.params.moduleId,
        req.params.segmentId,
        limit
      );
      res.json({ history });
    } catch (err) {
      log.error({ err }, 'Error fetching segment history');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// CONTENT VERSIONING — localized history and rollback (item 15)
// Mirrors the faithful block in routes/segment-editor.js:1248-1345, but
// track-parameterized to 'localized' throughout.
// =====================================================================

/**
 * GET /:book/:chapter/:moduleId/versions
 * List all localized content versions for a module.
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
        req.params.moduleId,
        'localized'
      );
      res.json({ versions });
    } catch (err) {
      log.error({ err }, 'Error loading localized versions');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/versions/:version
 * Get localized content for a specific version (all segments).
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
        parseInt(req.params.version, 10),
        'localized'
      );
      res.json({ segments });
    } catch (err) {
      log.error({ err }, 'Error loading localized version content');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/version-history/:segmentId
 * Per-segment localized snapshot history. Distinct from
 * GET /:segmentId/history, which serves the localization_edits audit log.
 */
router.get(
  '/:book/:chapter/:moduleId/version-history/:segmentId',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  (req, res) => {
    try {
      const history = contentVersionService.getSegmentHistory(
        req.params.book,
        req.params.moduleId,
        req.params.segmentId,
        'localized'
      );
      res.json({ history });
    } catch (err) {
      log.error({ err }, 'Error loading localized segment history');
      res.status(500).json({ error: err.message });
    }
  }
);

// requireHeadEditor() returns an anonymous middleware function; wrap it with a
// named function so route.stack introspection (used by this file's own
// restore-route test, and any future authz-composition check) can assert the
// head-editor guard is mounted without invoking it.
const headEditorGuard = requireHeadEditor();
function requireHeadEditorGuard(req, res, next) {
  return headEditorGuard(req, res, next);
}

/**
 * POST /:book/:chapter/:moduleId/restore/:version
 * Restore a module's localized content to a previous snapshot version.
 * Book-scoped head-editor only (admin bypasses). Requires { confirm: true }.
 * Takes the module lock (restore is a write) and returns the fresh mtime so
 * clients update lastModified; an editor holding a stale token 409s on their
 * next save — restore composes with the conflict machinery, not around it.
 */
router.post(
  '/:book/:chapter/:moduleId/restore/:version',
  requireAuth,
  requireHeadEditorGuard,
  validateBookChapter,
  validateModule,
  async (req, res) => {
    const version = parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ error: `Invalid version: ${req.params.version}` });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Pass { "confirm": true } to restore this module to a previous version',
      });
    }

    const lockKey = `${req.params.book}/${req.chapterNum}/${req.params.moduleId}`;
    const release = await acquireModuleLock(lockKey);
    try {
      const result = contentVersionService.restoreVersion(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        version,
        { userId: req.user.id, username: req.user.username },
        'localized'
      );
      const lastModified = segmentParser.getLocalizedMtime(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      res.json({ success: true, ...result, lastModified });
    } catch (err) {
      log.error({ err }, 'Error restoring localized version');
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    } finally {
      release();
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/log
 * Add a manual localization log entry (for the review tab's changelog).
 */
router.post(
  '/:book/:chapter/:moduleId/log',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  requireBookAccess(),
  (req, res) => {
    const { original, changedTo, reason, type } = req.body;

    if (!original || !changedTo || !reason) {
      return res.status(400).json({ error: 'original, changedTo, and reason are required' });
    }

    const VALID_LOC_CATEGORIES = [
      'unit-conversion',
      'cultural-adaptation',
      'example-replacement',
      'formatting',
      'unchanged',
    ];
    const category = VALID_LOC_CATEGORIES.includes(type) ? type : null;

    try {
      localizationEditService.logLocalizationEdit({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId: type || 'manual-log',
        previousContent: original,
        newContent: changedTo,
        category,
        editorId: String(req.user.id),
        editorUsername: req.user.username,
      });

      res.json({ success: true });
    } catch (err) {
      log.error({ err }, 'Error adding log entry');
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
