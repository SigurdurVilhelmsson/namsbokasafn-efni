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
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/figures  Translated figures + review state
 *   POST /api/segment-editor/:book/:chapter/:moduleId/figures/:basename/block  Save a figure text edit
 *   POST /api/segment-editor/:book/:chapter/:moduleId/figures/:basename/state  Approve/flag a figure
 *
 *   POST /api/segment-editor/:book/:chapter/:moduleId/apply  Apply approved edits to files
 *   POST /api/segment-editor/:book/:chapter/:moduleId/apply-and-render  Apply then inject+render
 *   GET  /api/segment-editor/:book/:chapter/:moduleId/apply-status  Check apply status
 */

const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const segmentParser = require('../services/segmentParser');
const segmentValidation = require('../public/js/segment-validation');
const segmentEditor = require('../services/segmentEditorService');
const acceptanceService = require('../services/acceptanceService');
const concordance = require('../services/concordanceService');
const propagation = require('../services/propagationService');
const activityLog = require('../services/activityLog');
const notifications = require('../services/notifications');
const { isNewer } = require('../lib/editRecency');

// Notify an edit's author of a head-editor decision (fire-and-forget — a
// notification failure must never fail the decision).
function notifyDecision(edit, decision, req) {
  Promise.resolve()
    .then(() =>
      notifications.notifyEditDecision(
        edit,
        decision,
        req.user.id,
        req.user.username,
        req.body?.note
      )
    )
    .catch((err) => log.error({ err }, 'Edit-decision notification failed'));
}

// ─── Book data lookup (slug → chapter/module metadata) ───────────────
const { enrichChapters, enrichModules } = require('../services/bookDataLoader');
const { requireAuth } = require('../middleware/requireAuth');
const {
  requireRole,
  requireBookAccess,
  requireHeadEditor,
  requireHeadEditorFor,
  ROLES,
} = require('../middleware/requireRole');
const { validateBookChapter, validateModule } = require('../middleware/validateParams');
const { VALID_BOOKS } = require('../config');
const { PASS1_CATEGORIES: VALID_CATEGORIES, VALID_TRACKS } = require('../constants');

// ─── Book-ownership resolvers for ID-keyed head-editor endpoints ──────
// These endpoints are keyed by :editId / :reviewId, not :book, so the owning
// book has to be looked up before the per-book head-editor check can run.
function bookFromEditId(req) {
  const edit = segmentEditor.getEditById(parseInt(req.params.editId, 10));
  if (!edit) throw new Error('Edit not found');
  return edit.book;
}

function bookFromReviewId(req) {
  // getModuleReviewWithEdits throws 'Review not found' when the id is unknown
  const { review } = segmentEditor.getModuleReviewWithEdits(parseInt(req.params.reviewId, 10));
  return review.book;
}

// =====================================================================
// NON-PARAMETERIZED ROUTES (must come before /:book/:chapter)
// =====================================================================

/**
 * GET /terminology/lookup
 * Quick term lookup for editor popups (delegates to terminology service).
 */
router.get('/terminology/lookup', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { q, bookSlug } = req.query;

  if (!q || q.length < 2) {
    return res.json({ terms: [] });
  }

  try {
    const terms = terminology.lookupTerm(q, bookSlug || null);
    res.json({ terms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /concordance?q=…&book=…
 * Concordance search across applied EN↔IS faithful segments (book-scoped).
 */
router.get('/concordance', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { q, book } = req.query;
  if (!book || !VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: 'Unknown or missing book' });
  }
  if (!q || q.trim().length < 2) {
    return res.json({ results: [] });
  }
  try {
    const results = concordance.search(q, { book });
    res.json({ results });
  } catch (err) {
    log.error({ err }, 'Concordance search failed');
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
    // listChapters scans 02-for-mt, which may contain a front-matter `ch00`
    // (e.g. a preface). The editor's load path (validateParams) only accepts
    // chapter -1 (appendices) or >= 1, so offering chapter 0 here yields a
    // dead option that 400s with "Invalid chapter: 0" when selected. Drop it to
    // match the load contract. (Making front-matter editable would be a separate
    // feature — teaching validateParams + the load path to handle 0.)
    const chapterNums = segmentParser.listChapters(book).filter((c) => c !== 0);
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
 * GET /:book/:chapter/repetition-report
 * Chapter-level repetition audit (head-editor): EN strings that recur and
 * whether their IS translations agree — a cheap consistency check.
 * Registered before /:book/:chapter/:moduleId so the literal path wins.
 */
router.get(
  '/:book/:chapter/repetition-report',
  requireAuth,
  requireHeadEditor('book'),
  validateBookChapter,
  (req, res) => {
    try {
      const report = concordance.repetitionReport(req.params.book, req.chapterNum);
      res.json({ book: req.params.book, chapter: req.chapterNum, report });
    } catch (err) {
      log.error({ err }, 'Error building repetition report');
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

      // Build edit lookup by segmentId for quick access. The pane pre-fills
      // from edits[0] ("latestEdit"), so each segment's array is ordered by the
      // canonical recency comparator (same rule preview/apply pick winners
      // with) — newest first, id breaking a same-second tie. Without the id
      // tiebreak a same-second tie could pre-fill the losing edit while
      // preview/apply publish the winner. NOTE: unlike buildEffectiveSegments,
      // no status filter here — every status must still reach edits[0] (the
      // frontend branches on rejected/discuss/superseded to show reopen/re-edit
      // affordances).
      const editsBySegment = {};
      for (const edit of edits) {
        if (!editsBySegment[edit.segment_id]) {
          editsBySegment[edit.segment_id] = [];
        }
        editsBySegment[edit.segment_id].push(edit);
      }
      for (const segId of Object.keys(editsBySegment)) {
        editsBySegment[segId].sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0));
      }

      // Get stats
      const stats = segmentEditor.getModuleStats(req.params.book, req.params.moduleId);

      // Active MT acceptances keyed by segmentId (item 20b)
      const acceptances = {};
      for (const a of acceptanceService.getModuleAcceptances(
        req.params.book,
        req.params.moduleId
      )) {
        acceptances[a.segment_id] = a;
      }

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
        acceptances,
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
    const { segmentId, originalContent, editedContent, category, editorNote, baseEditId } =
      req.body;

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

    const resolvedBaseEditId = typeof baseEditId === 'number' ? baseEditId : undefined;

    try {
      // SR-OOS-2 FIX3: the conflict check runs BEFORE the structural-marker
      // backstop guard below, so a stale pane gets its familiar 409
      // (alert+reload flow) instead of a 400 that masks the real reason the
      // save failed — same args the saveSegmentEdit call below passes.
      segmentEditor.checkEditConflict({
        book: req.params.book,
        moduleId: req.params.moduleId,
        segmentId,
        editorId: String(req.user.id),
        baseEditId: resolvedBaseEditId,
      });

      // SR-OOS-2 backstop: the client's hard-block gate is bypassable, so the
      // save route re-checks structural markers against SERVER-loaded
      // baselines (never the client-supplied originalContent). Identity
      // edits (editedContent === baseline.is) skip the check: content equal
      // to the server's own baseline cannot introduce NEW corruption
      // relative to what's already on disk, so the server deliberately
      // stays permissive here even on a withdrawal whose baseline would
      // itself fail an EN-derived rule in the UI (e.g. an MT baseline that
      // already dropped a [[MATH:N]]). Warnings are advisory and
      // deliberately NOT enforced here (design D3).
      let baseline;
      try {
        const modData = segmentParser.loadModuleForEditing(
          req.params.book,
          req.chapterNum,
          req.params.moduleId
        );
        baseline = modData.segments.find((s) => s.segmentId === segmentId);
      } catch (loadErr) {
        log.error({ err: loadErr }, 'Backstop baseline load failed');
        return res.status(loadErr.message.includes('not found') ? 404 : 500).json({
          error: loadErr.message,
        });
      }
      if (!baseline) {
        return res.status(404).json({ error: 'segment not found' });
      }
      if (editedContent !== baseline.is) {
        const structure = segmentValidation.validateStructure(
          baseline.en,
          baseline.is,
          editedContent
        );
        if (structure.blocked) {
          return res.status(400).json({
            error: 'Vistun hafnað: byggingarmerki vantar eða hafa breyst.',
            violations: structure.blocked,
          });
        }
      }

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
        baseEditId: resolvedBaseEditId,
      });

      activityLog.log({
        type: 'segment_edit_saved',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} vistaði breytingu á ${req.params.moduleId}:${segmentId}`,
      });

      // Live QA. NOT non-blocking — the try/catch makes this non-FATAL, not
      // non-blocking, and there is no await. It runs synchronously on every save.
      // (Before C24 this cost ~45s; the mislabel is probably why it was never
      // suspected.)
      let termWarnings = [];
      let qaFindings = [];
      if (!result.reverted && typeof editedContent === 'string' && editedContent) {
        try {
          termWarnings = segmentEditor.getSegmentTerminologyWarnings(
            req.params.book,
            req.chapterNum,
            req.params.moduleId,
            segmentId,
            editedContent
          );
        } catch (qaErr) {
          log.error({ err: qaErr }, 'Terminology save-check failed (non-fatal)');
        }
        try {
          qaFindings = segmentEditor.getSegmentQaFindings(
            req.params.book,
            req.chapterNum,
            req.params.moduleId,
            segmentId,
            editedContent
          );
        } catch (qaErr) {
          log.error({ err: qaErr }, 'QA save-check failed (non-fatal)');
        }
      }

      res.json({
        success: true,
        editId: result.id,
        updated: result.updated,
        termWarnings,
        qaFindings,
      });
    } catch (err) {
      if (err.code === 'SEGMENT_CONFLICT') {
        return res.status(409).json({ error: 'conflict', message: err.message });
      }
      log.error({ err }, 'Error saving segment edit');
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================================
// FIGURE-TEXT REVIEW
//
// A translated figure's Icelandic text lives in a COMMITTED sidecar
// (books/<slug>/figure-text/<basename>.is.json); its workflow state lives in
// SQLite. "Is this approved?" is DERIVED from both on every read and never
// stored, so an approved figure whose text has since changed reports
// mt-preview on its own, with no second row to keep in sync.
//
// These handlers stay thin. Enumeration, the no-sidecar skip and the
// no-DB-row fallback all live in figureReviewService because all three routes
// need them; the router validates input and shapes nothing itself.
// =====================================================================

const figureReview = require('../services/figureReviewService');

/**
 * :basename is concatenated into a filename by sidecarPath(), so it must not be
 * able to leave books/<slug>/figure-text/. REJECTED, never sanitised: a
 * silently rewritten name would read and write a different figure than the one
 * the editor is looking at, which is worse than a refusal. \w excludes both
 * separators, so no value passing this can traverse. The corpus convention is
 * CNX_Chem_01_01_ChemWeb; the length cap keeps a pathological name off the
 * filesystem call.
 */
const FIGURE_BASENAME_RE = /^[\w.-]{1,120}$/;

/**
 * Everything the two figure write routes need, or the response saying why they
 * cannot proceed. ORDER IS LOAD-BEARING: the syntactic guard runs before any
 * I/O, and the book lookup runs before ensureFigureRow can reach a live foreign
 * key (an unregistered slug would otherwise throw, not 404).
 */
function resolveFigureRequest(req) {
  const { book, moduleId, basename } = req.params;
  if (!FIGURE_BASENAME_RE.test(basename || '')) {
    return { error: { status: 400, body: { error: `Invalid figure basename: ${basename}` } } };
  }
  const db = figureReview.getDb();
  const bookId = figureReview.lookupBookId(db, book);
  if (!bookId) {
    return { error: { status: 404, body: { error: `Book not registered: ${book}` } } };
  }
  // The basename must name a figure OF THIS MODULE. Without this check a
  // regex-valid name from anywhere would mint a figure_review row carrying
  // THIS route's chapter/module_id — silently mis-attributed provenance, which
  // idx_figure_review_module would then serve under the wrong module.
  const known = figureReview.listModuleFigures(book, req.chapterNum, moduleId);
  if (!known.some((f) => f.basename === basename)) {
    return {
      error: { status: 404, body: { error: `No such figure in ${moduleId}: ${basename}` } },
    };
  }
  const resolved = figureReview.resolveFigure(db, bookId, book, basename);
  if (!resolved) {
    // No sidecar: the plain English OpenStax figure. There is no Icelandic text
    // to edit or approve.
    return {
      error: { status: 404, body: { error: `No translated text for figure: ${basename}` } },
    };
  }
  return { db, bookId, basename, resolved };
}

/**
 * GET /:book/:chapter/:moduleId/figures
 * The module's TRANSLATED figures, each with its derived review state and the
 * advisory checks. Read chain mirrors the module GET above.
 */
router.get(
  '/:book/:chapter/:moduleId/figures',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    const { book, moduleId } = req.params;
    try {
      const db = figureReview.getDb();
      const bookId = figureReview.lookupBookId(db, book);
      if (!bookId) return res.status(404).json({ error: `Book not registered: ${book}` });

      // The module's own ICELANDIC prose, as captionDivergence's reference.
      // Icelandic on both sides on purpose: the check looks for near-variant
      // spellings (Selsíus vs Celsíus), which can only exist between two
      // Icelandic strings — an English caption would make it silently inert.
      // Best-effort: a module with no segments file must still list its
      // figures, and '' makes captionDivergence return [], which is designed
      // silence rather than a false all-clear.
      const isBySegment = {};
      try {
        const data = segmentParser.loadModuleForEditing(book, req.chapterNum, moduleId);
        for (const seg of data.segments) isBySegment[seg.segmentId] = seg.is || '';
      } catch (err) {
        log.warn({ err }, 'Figure list: module segments unavailable; caption check stays silent');
      }

      const figures = [];
      for (const f of figureReview.listModuleFigures(book, req.chapterNum, moduleId)) {
        const resolved = figureReview.resolveFigure(db, bookId, book, f.basename);
        if (!resolved) continue; // no sidecar -> not a translated figure; skip
        const referenceText = [f.captionSegmentId, f.altSegmentId]
          .map((id) => (id && isBySegment[id]) || '')
          .filter(Boolean)
          .join(' ');
        figures.push(figureReview.buildFigurePayload(f.basename, resolved.fig, referenceText));
      }
      res.json({ figures });
    } catch (err) {
      log.error({ err }, 'Error listing figures for review');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/figures/:basename/block
 * Save one editor correction to one figure text block. Write chain mirrors the
 * segment edit save.
 */
router.post(
  '/:book/:chapter/:moduleId/figures/:basename/block',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const { blockKey, isText } = req.body || {};
    if (typeof blockKey !== 'string' || !blockKey) {
      return res.status(400).json({ error: 'blockKey is required' });
    }
    if (typeof isText !== 'string') {
      return res.status(400).json({ error: 'isText is required' });
    }
    if (isText.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }
    try {
      const ctx = resolveFigureRequest(req);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      // blockKey must name a block that currently exists in the figure's own
      // sidecar (ctx.resolved.mtBlocks — see resolveBlocks' doc comment: block
      // keys are content-addressed, so re-extraction changes them). Without
      // this, an unknown key upserts into figure_block_edit unconditionally,
      // is invisible to every later GET (resolveBlocks only merges a row whose
      // key is still present in mtBlocks) and the client is told {ok: true} —
      // the realistic trigger being a stale card open from before a
      // re-extraction, not a malicious client. hasOwnProperty, not `in` or a
      // truthiness test: a block's value can legitimately be ''.
      if (!Object.prototype.hasOwnProperty.call(ctx.resolved.mtBlocks, blockKey)) {
        return res.status(404).json({ error: `No such block in ${ctx.basename}: ${blockKey}` });
      }
      figureReview.saveBlockEdit(ctx.db, {
        bookId: ctx.bookId,
        basename: ctx.basename,
        blockKey,
        isText,
        editedBy: String(req.user.id),
      });
      // Deliberately no state here: the badge is DERIVED, so the client
      // re-fetches /figures rather than guessing what this edit did to it.
      res.json({ ok: true });
    } catch (err) {
      log.error({ err }, 'Error saving figure block edit');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/figures/:basename/state
 * Approve or flag a figure, and write the committed sidecar.
 */
router.post(
  '/:book/:chapter/:moduleId/figures/:basename/state',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const { state, flagKind, note } = req.body || {};
    // Validated against the service's enums, which are pinned to migration
    // 050's CHECK constraints — otherwise SQLite throws and a typo is a 500.
    if (!figureReview.FIGURE_STATES.includes(state)) {
      return res.status(400).json({
        error: `Invalid state. Must be one of: ${figureReview.FIGURE_STATES.join(', ')}`,
      });
    }
    if (flagKind != null && !figureReview.FIGURE_FLAG_KINDS.includes(flagKind)) {
      return res.status(400).json({
        error: `Invalid flagKind. Must be one of: ${figureReview.FIGURE_FLAG_KINDS.join(', ')}`,
      });
    }
    if (note != null && (typeof note !== 'string' || note.length > 2000)) {
      return res.status(400).json({ error: 'note must be a string of at most 2,000 characters' });
    }
    try {
      const ctx = resolveFigureRequest(req);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);
      const { db, bookId, basename, resolved } = ctx;

      // setState is an UPDATE and stays one — it is never told which module a
      // basename belongs to, and chapter/module_id are NOT NULL. On day one
      // there is no row, so mint it here from this route's own params.
      figureReview.ensureFigureRow(db, {
        bookId,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        basename,
      });
      // The approval hash must cover the blocks AS THE EDITOR SEES THEM — MT
      // overlaid with their corrections — not the raw sidecar text.
      figureReview.setState(db, {
        bookId,
        basename,
        state,
        flagKind: flagKind || null,
        note: note || null,
        reviewedBy: String(req.user.id),
        blocks: resolved.fig.blocks,
      });
      // The renderer reads the SIDECAR, never the database, so every transition
      // must reach it — a flag as much as an approval.
      figureReview.applyApprovedFigureEdits(db, {
        bookDir: figureReview.bookDirFor(req.params.book),
        bookId,
        basename,
        mtBlocks: resolved.mtBlocks,
      });
      const after = figureReview.getFigure(db, bookId, basename, resolved.mtBlocks);
      res.json({ ok: true, effectiveState: after.effectiveState });
    } catch (err) {
      log.error({ err }, 'Error setting figure review state');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /:book/:chapter/:moduleId/accept
 * Record a per-segment MT acceptance ("Staðfesta vélþýðingu", item 20b).
 * Chain mirrors the edit save. acceptedContent must equal the current
 * baseline byte-for-byte (409 STALE_CONTENT — doubles as the saveRetry
 * replay guard); an active edit wins (409 EDIT_EXISTS); an open discussion
 * blocks (409 DISCUSS_OPEN) and so does published human text that is still the
 * live baseline (409 HUMAN_CONTENT). Eligibility is enforced HERE, not in the
 * client — this endpoint is directly reachable (MTA-R3).
 */
router.post(
  '/:book/:chapter/:moduleId/accept',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const { segmentId, acceptedContent } = req.body || {};
    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (typeof acceptedContent !== 'string' || acceptedContent === '') {
      return res.status(400).json({ error: 'acceptedContent is required' });
    }
    if (acceptedContent.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }

    try {
      const result = acceptanceService.acceptSegment({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        acceptedContent,
        userId: String(req.user.id),
        username: req.user.username,
      });

      if (!result.alreadyAccepted) {
        activityLog.log({
          type: 'segment_accepted',
          userId: String(req.user.id),
          username: req.user.username,
          book: req.params.book,
          chapter: String(req.chapterNum),
          section: req.params.moduleId,
          description: `${req.user.username} staðfesti vélþýðingu á ${req.params.moduleId}:${segmentId}`,
        });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      // MTA-R3 adds DISCUSS_OPEN / HUMAN_CONTENT to the eligibility guard;
      // they are conflict states like the other two, not server errors.
      if (
        err.code === 'STALE_CONTENT' ||
        err.code === 'EDIT_EXISTS' ||
        err.code === 'DISCUSS_OPEN' ||
        err.code === 'HUMAN_CONTENT'
      ) {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      if (err.code === 'NO_TRANSLATION') {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      if (err.code === 'SEGMENT_NOT_FOUND' || err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      log.error({ err }, 'Error accepting segment');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /acceptance/:id/revoke
 * Revoke an active acceptance. Route gate is editor-tier; the owner-or-
 * book-scoped-head-editor rule lives in the service (owner-OR-HE cannot be
 * expressed as middleware — same pattern as DELETE /edit/:editId).
 */
router.post('/acceptance/:id/revoke', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const row = acceptanceService.revokeAcceptance(parseInt(req.params.id, 10), {
      actorId: String(req.user.id),
      actorRole: req.user.role,
      actorBooks: req.user.books || [],
    });
    res.json({ success: true, acceptance: row });
    activityLog.log({
      type: 'acceptance_revoked',
      userId: String(req.user.id),
      username: req.user.username,
      book: row.book,
      chapter: String(row.chapter),
      section: row.module_id,
      description: `${req.user.username} afturkallaði staðfestingu á ${row.module_id}:${row.segment_id}`,
    });
    // item 20b final-review F1: a revoke changes the segment's review status,
    // so refresh the durable sidecar (parity with apply/restore). Best-effort
    // and never fails the revoke — regenSidecarSafe swallows the expected
    // "no faithful file yet" case and logs (never throws) anything else.
    acceptanceService.regenSidecarSafe(row.book, row.chapter, row.module_id);
  } catch (err) {
    if (err.code === 'FORBIDDEN') {
      return res.status(403).json({ error: err.message });
    }
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

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
    activityLog.log({
      type: 'segment_edit_deleted',
      userId: String(req.user.id),
      username: req.user.username,
      book: edit?.book || '',
      chapter: String(edit?.chapter || ''),
      section: edit?.module_id || '',
      description: `${req.user.username} eyddi breytingu á ${edit?.segment_id || editId}`,
    });
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
      activityLog.log({
        type: 'module_submitted_for_review',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} sendi ${req.params.moduleId} til yfirlestrar`,
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
router.post(
  '/edit/:editId/approve',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.approveEdit(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      activityLog.log({
        type: 'segment_edit_approved',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} samþykkti breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
      notifyDecision(edit, 'approved', req);
      res.json({ success: true, edit });
    } catch (err) {
      const status = err.code === 'SUPERSEDED_BY_NEWER' ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

/**
 * POST /edit/:editId/reject
 * Reject a segment edit.
 */
router.post(
  '/edit/:editId/reject',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.rejectEdit(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      activityLog.log({
        type: 'segment_edit_rejected',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} hafnaði breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
      notifyDecision(edit, 'rejected', req);
      res.json({ success: true, edit });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * POST /edit/:editId/discuss
 * Mark a segment edit for discussion.
 */
router.post(
  '/edit/:editId/discuss',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.markForDiscussion(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      activityLog.log({
        type: 'segment_edit_discuss',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} merkti ${edit.module_id}:${edit.segment_id} til umræðu`,
      });
      notifyDecision(edit, 'discuss', req);
      res.json({ success: true, edit });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * POST /edit/:editId/unapprove
 * Revert an approved edit back to pending (only if not yet applied to files).
 */
router.post(
  '/edit/:editId/unapprove',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.unapproveEdit(parseInt(req.params.editId, 10));
      res.json({ success: true, edit });
      activityLog.log({
        type: 'segment_edit_unapproved',
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book || '',
        chapter: String(edit.chapter || ''),
        section: edit.module_id || '',
        description: `${req.user.username} afturkallaði samþykki á ${edit.segment_id}`,
      });
    } catch (err) {
      res.status(err.code === 'PENDING_EXISTS' ? 409 : 400).json({ error: err.message });
    }
  }
);

/**
 * POST /edit/:editId/return-to-pending
 * Return a discussed/rejected edit to pending for re-review (manual exit path).
 */
router.post(
  '/edit/:editId/return-to-pending',
  requireAuth,
  requireHeadEditorFor(bookFromEditId),
  (req, res) => {
    try {
      const edit = segmentEditor.returnEditToPending(parseInt(req.params.editId, 10));
      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SEGMENT_EDIT_REOPENED,
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} opnaði aftur breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
      res.json({ success: true, edit });
    } catch (err) {
      res.status(err.code === 'PENDING_EXISTS' ? 409 : 400).json({ error: err.message });
    }
  }
);

/**
 * POST /reviews/:reviewId/complete
 * Complete a module review. If all edits are approved, automatically
 * applies them to 03-faithful-translation/ segment files.
 */
router.post(
  '/reviews/:reviewId/complete',
  requireAuth,
  requireHeadEditorFor(bookFromReviewId),
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
            review.review.module_id,
            { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
          );
        } catch (applyErr) {
          // Auto-apply is best-effort; don't fail the review completion.
          // Head-editor can retry via POST /:book/:chapter/:moduleId/apply
          log.error({ err: applyErr }, 'Auto-apply after review failed');
          applied = { error: applyErr.message, retryable: true };
        }
      }

      res.json({ success: true, ...result, applied });
      activityLog.log({
        type: 'review_completed',
        userId: String(req.user.id),
        username: req.user.username,
        book: result.book || '',
        chapter: String(result.chapter || ''),
        section: result.module_id || '',
        description: `${req.user.username} lauk yfirlestri á ${result.module_id || req.params.reviewId}`,
      });
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
    // Response stays first (the comment IS saved; a context-lookup failure
    // must not flip a committed mutation into a 400 — that is the
    // nested-site defect class this batch fixes). Only the lookup is
    // guarded, with a log; the audit write goes bare with degraded context
    // on lookup failure (edit stays null → the || '' fallbacks apply).
    res.json({ success: true, commentId: result.id });
    let edit = null;
    try {
      edit = segmentEditor.getEditById(parseInt(req.params.editId, 10));
    } catch (lookupErr) {
      log.error(
        { err: lookupErr, editId: req.params.editId },
        'Edit lookup for comment audit failed'
      );
    }
    activityLog.log({
      type: 'segment_edit_comment',
      userId: String(req.user.id),
      username: req.user.username,
      book: edit?.book || '',
      chapter: String(edit?.chapter || ''),
      section: edit?.module_id || '',
      description: `${req.user.username} bætti við athugasemd á ${edit?.segment_id || req.params.editId}`,
    });
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

      // Pass book slug for domain-priority ranking
      const termMatches = terminology.findTermsInSegments(
        segments,
        req.params.book,
        req.chapterNum
      );

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

/**
 * GET /:book/:chapter/:moduleId/repetitions
 * Exact-match review-deduplication suggestions: for each EN segment with a
 * human-approved translation of the same sentence in another module, return
 * that translation (outranks the MT draft). Editor confirms rather than
 * re-reviews. Cross-book matches included (boilerplate recurs across books).
 */
router.get(
  '/:book/:chapter/:moduleId/repetitions',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const repetitions = concordance.findRepetitions(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      res.json({ moduleId: req.params.moduleId, repetitions });
    } catch (err) {
      log.error({ err }, 'Error finding repetitions');
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  }
);

// GET propagation preview — occurrences of this segment's EN across the book.
router.get(
  '/:book/:chapter/:moduleId/propagation-preview',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const { segmentId } = req.query;
      if (!segmentId) return res.status(400).json({ error: 'segmentId is required' });
      const data = segmentParser.loadModuleForEditing(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      const seg = data.segments.find((s) => s.segmentId === segmentId);
      if (!seg) return res.status(404).json({ error: 'segment not found' });
      const enNorm = concordance.normalizeEn(seg.en);
      const propagatedText =
        propagation.latestEditedText(req.params.book, req.params.moduleId, segmentId) ??
        (seg.is || '');
      const occ = propagation.findOccurrences(req.params.book, enNorm, {
        excludeModuleId: req.params.moduleId,
        excludeSegmentId: segmentId,
      });
      const eligible = [];
      const skipped = [];
      for (const o of occ) {
        // Pass editorId so the preview's eligible/skipped split matches what
        // propagate actually writes (own pending edit → eligible-supersede).
        const verdict = propagation.classifyOccurrence(propagatedText, {
          ...o,
          editorId: req.user.id,
        });
        (verdict === 'eligible' ? eligible : skipped).push({
          moduleId: o.moduleId,
          chapter: o.chapter,
          segmentId: o.segmentId,
          reason: verdict === 'eligible' ? undefined : verdict,
        });
      }
      res.json({ enNorm, eligible, skipped });
    } catch (err) {
      log.error({ err }, 'propagation-preview failed');
      res.status(500).json({ error: err.message });
    }
  }
);

// POST propagate — create pending edits on eligible occurrences.
router.post(
  '/:book/:chapter/:moduleId/propagate',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    try {
      const { segmentId, editedContent, category, note } = req.body || {};
      if (!segmentId || !editedContent) {
        return res.status(400).json({ error: 'segmentId and editedContent are required' });
      }
      // Parity with the /edit route — bound the payload and constrain category.
      if (typeof editedContent === 'string' && editedContent.length > 10000) {
        return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
      }
      if (category && !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({
          error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        });
      }
      const sourceSeg = segmentParser
        .loadModuleForEditing(req.params.book, req.chapterNum, req.params.moduleId)
        .segments.find((s) => s.segmentId === segmentId);
      const enNorm = concordance.normalizeEn(sourceSeg?.en || '');
      if (!enNorm) return res.status(404).json({ error: 'segment not found' });
      const occurrences = propagation.findOccurrences(req.params.book, enNorm, {
        excludeModuleId: req.params.moduleId,
        excludeSegmentId: segmentId,
      });
      const result = propagation.createPropagatedEdits(propagation.getDb(), {
        book: req.params.book,
        editorId: req.user.id,
        editorUsername: req.user.username,
        propagatedText: editedContent,
        category,
        note: note || 'Sjálfvirk fjölgun',
        occurrences,
        sourceEn: sourceSeg?.en,
      });
      res.json(result);
    } catch (err) {
      log.error({ err }, 'propagate failed');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/terminology-report
 * Submit-gate terminology report (Unit 3.2): approved terms still violated in
 * the module's to-be-published content, grouped by term. Advisory — no block.
 */
router.get(
  '/:book/:chapter/:moduleId/terminology-report',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const report = segmentEditor.getModuleTerminologyReport(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      res.json({ moduleId: req.params.moduleId, ...report });
    } catch (err) {
      log.error({ err }, 'Error building terminology report');
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/spellcheck
 * On-demand Icelandic proofreading (Greynir sidecar, Unit 4.2). Off the save
 * path; returns { enabled:false } when GREYNIR_URL isn't configured.
 */
router.get(
  '/:book/:chapter/:moduleId/spellcheck',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  async (req, res) => {
    try {
      const result = await segmentEditor.getModuleSpellFindings(
        req.params.book,
        req.chapterNum,
        req.params.moduleId
      );
      res.json({ moduleId: req.params.moduleId, ...result });
    } catch (err) {
      log.error({ err }, 'Error running spellcheck');
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
      const status = segmentEditor.getApplyStatus(
        req.params.book,
        req.params.moduleId,
        req.chapterNum
      );
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
  requireHeadEditor(),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const result = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );

      activityLog.log({
        type: 'segment_edits_applied',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} yfirfærði ${result.appliedCount} breytingu/ar${
          result.acceptedCount ? ` og ${result.acceptedCount} staðfestingar` : ''
        } á ${req.params.moduleId}`,
      });

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
  requireHeadEditor(),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      // Guard FIRST (item 12, F6): a running pipeline means we could not
      // render what we apply, so nothing is applied either — the 409
      // truthfully reports a no-op and the head-editor just retries later.
      const existing = pipelineService.hasRunningJob(req.params.book, req.chapterNum, 'pipeline');
      if (existing) {
        return res.status(409).json({
          error: 'Pipeline already running for this chapter',
          jobId: existing.id,
        });
      }

      // Capacity guard (item 12 final review): runPipeline throws over
      // MAX_JOBS — that throw must land BEFORE edits are applied, not after,
      // or the applied-but-unrendered dead-end returns via 500.
      if (!pipelineService.hasCapacity(2)) {
        return res.status(409).json({
          error: 'Pipeline queue is full — try again shortly',
        });
      }

      // Apply edits to files
      const applyResult = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );

      // Run inject+render pipeline (async — returns job ID for polling)
      const { jobId } = pipelineService.runPipeline({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        track: 'faithful',
        userId: req.user.id,
      });

      activityLog.log({
        type: 'segment_edits_applied',
        userId: String(req.user.id),
        username: req.user.username,
        book: req.params.book,
        chapter: String(req.chapterNum),
        section: req.params.moduleId,
        description: `${req.user.username} yfirfærði ${applyResult.appliedCount} breytingu/ar${
          applyResult.acceptedCount ? ` og ${applyResult.acceptedCount} staðfestingar` : ''
        } á ${req.params.moduleId} og ræsti leiðslu`,
      });

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
 * POST /:book/:chapter/:moduleId/restore/:version
 * Restore a module's faithful translation to a previous snapshot version.
 * Book-scoped head-editor only (admin bypasses). Requires { confirm: true }
 * in the body so an accidental request can't overwrite published content.
 */
router.post(
  '/:book/:chapter/:moduleId/restore/:version',
  requireAuth,
  requireHeadEditor(),
  validateBookChapter,
  validateModule,
  (req, res) => {
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

    try {
      const result = contentVersionService.restoreVersion(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        version,
        { userId: req.user.id, username: req.user.username }
      );
      res.json({ success: true, ...result });
    } catch (err) {
      log.error({ err }, 'Error restoring version');
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
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
  validateModule,
  async (req, res) => {
    const { book, moduleId } = req.params;
    const track = req.query.track || 'mt-preview';

    // Guard against path traversal via the track query param — it flows into
    // path.join(... '03-translated', track, ...) inside renderService.
    if (!VALID_TRACKS.includes(track)) {
      return res.status(400).json({
        error: `Invalid track. Must be one of: ${VALID_TRACKS.join(', ')}`,
      });
    }

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
