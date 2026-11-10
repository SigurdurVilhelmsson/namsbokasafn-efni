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
const segmentEditor = require('../services/segmentEditorService');
const acceptanceService = require('../services/acceptanceService');
const concordance = require('../services/concordanceService');
const propagation = require('../services/propagationService');
const activityLog = require('../services/activityLog');
const notifications = require('../services/notifications');
const servedVersions = require('../services/servedVersions');
const servedEdit = require('../services/servedEdit');
const moduleOpenings = require('../services/moduleOpenings');
const suggestionView = require('../services/suggestionView');
const suggestionLogs = require('../lib/suggestionLogs');
const researchEmission = require('../services/researchEmission');
const { sha256Text, isNotMintedBook } = require('../lib/servedText');
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

// G1.1 refusals (servedEdit.REFUSAL_STATUS), sent as `{ error: <code>, message }`. Keeps
// today's shapes for the unknown segment's 404 and the structural 400.
function sendRefusal(res, err) {
  if (!err.refusal || !servedEdit.REFUSAL_STATUS[err.code]) return false;
  if (err.code === 'SEGMENT_NOT_FOUND') {
    res.status(404).json({ error: 'segment not found' });
  } else if (err.code === 'STRUCTURE_BLOCKED') {
    res.status(400).json({ error: err.message, violations: err.violations });
  } else {
    res.status(servedEdit.REFUSAL_STATUS[err.code]).json({ error: err.code, message: err.message });
  }
  return true;
}

// G1.2 (spec §5.9, §11): services hand the research event its before-images under these keys; no
// response carries them. A copy, so the caller's object (the research event's input) keeps them.
function withoutResearchKeys(result) {
  const rest = { ...result };
  delete rest.before;
  delete rest.writes;
  return rest;
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
const { figureReviewClosed, refuseHeldForNonAdmins } = require('../lib/heldBookWrites');

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

      // G1.1 (spec §5.4 steps 1–3): occurrence and baseSha256 on the response's own segments,
      // and the served versions minted by servedVersions.recordServe (a lock-free read pass, then
      // an IMMEDIATE insert pass only when a row is missing). Fail-soft, except on a serve that
      // meets the opening predicate below: a failed mint is logged and the module is still served
      // with baseSha256; the save path mints the base it checks. Never in the loader (it has
      // other callers).
      const conn = segmentEditor.getDb();
      const served = servedVersions.recordServe(conn, data, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
      });

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
        // contentSha256 (spec §5.4 step 6): the hash of the row's text, computed here and never
        // stored. The client echoes it as displayedEditSha256 when it saves over this row.
        editsBySegment[edit.segment_id].push({
          ...edit,
          contentSha256: sha256Text(edit.edited_content),
        });
      }
      for (const segId of Object.keys(editsBySegment)) {
        editsBySegment[segId].sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0));
      }

      // Get stats — this chapter's rows (they gate the submit button, §C209)
      const stats = segmentEditor.getModuleStats(
        req.params.book,
        req.params.moduleId,
        req.chapterNum
      );

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

      // ── spec §5.4 step 4 and §5.5: the opening record (PR2). A serve that meets the predicate
      //    (a study book, no opening yet, and a users row holding a user_chapter_assignments row
      //    for this book and chapter) records the opening and its in-flight snapshot in one
      //    transaction, or answers 503 and records nothing, a failed mint above included. A
      //    study-book serve whose users or assignment lookup throws also answers 503, whoever
      //    made it: the route cannot tell whether it is the serve the record depends on
      //    (decision 4). Only an assigned editor's serve reaches the opening lookup, so a throw
      //    there answers 503 to that serve alone. Every other serve is answered exactly as
      //    before. ──
      const step = moduleOpenings.openOnServe(conn, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        providerId: req.user.id,
        served,
        segments: data.segments,
        edits,
      });
      if (step.status === 'unrecorded') {
        const { status, code, message } = moduleOpenings.OPENING_UNRECORDED;
        return res.status(status).json({ error: code, message });
      }
      // G1.2 (spec §5.5): after the opening's commit; it never turns a serve into a 503 or a 503 into a 200
      // (PR2's handoff). Step 5 (G1.23) runs after it and reads seg.baseSha256 and the stored opening. The
      // opening's research emission adds no field to the response (T17); step 5 adds only `suggestions`,
      // which carries no time, opened state, switch state or research field.
      if (step.status === 'opened') {
        researchEmission.emitModuleOpened(req, {
          detail: moduleOpenings.moduleOpenedDetail(served, step.opening),
        });
      }
      // G1.23 (spec §5.4 step 5, index decision 7): the offered term-suggestion groups per segment,
      // from the segments as served above and the edit rows as sent below. Only a segment with a
      // group or a tag carries the key. offeredForModule never throws and returns no time.
      const offered = suggestionView.offeredForModule(conn, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segments: data.segments,
        editsBySegment,
      });
      for (const s of data.segments) {
        const o = offered.get(s.segmentId);
        if (o) s.suggestions = o;
      }
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
 * The body's acceptedSuggestions (G1.23, R16): the WHOLE value must be an array of at most 500
 * entries, each { opId: a string of 1..128 characters, occurrence: a non-negative integer }; anything
 * else (absent, another type, one bad entry) is []. Never a 400: the list is an assist, not input to
 * refuse a save over. The server re-filters it against the module log and the saved text.
 */
function sanitizeAcceptedSuggestions(value) {
  const ok =
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        typeof e.opId === 'string' &&
        e.opId.length >= 1 &&
        e.opId.length <= 128 &&
        Number.isInteger(e.occurrence) &&
        e.occurrence >= 0
    );
  return ok ? value.map((e) => ({ opId: e.opId, occurrence: e.occurrence })) : [];
}

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
    // `originalContent` is no longer read: the server stores its own base (spec §5.6 step 6);
    // pages loaded before G1.1 still send it. The research-only fields (clientActionId,
    // clientActionTime, assists, replayed) are read only by the research event, after the act
    // (researchEmission); they never change this response (spec §5.11).
    const {
      segmentId,
      editedContent,
      category,
      editorNote,
      baseEditId,
      baseSha256,
      displayedEditId,
      displayedEditSha256,
    } = req.body;

    if (!segmentId) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (typeof editedContent !== 'string') {
      return res.status(400).json({ error: 'editedContent is required' });
    }
    if (editedContent.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }
    // The displayed pair the row showed (plan decision 14): absent, null, or the right type.
    if (displayedEditId != null && !Number.isInteger(displayedEditId)) {
      return res.status(400).json({ error: 'displayedEditId must be an integer or null' });
    }
    if (displayedEditSha256 != null && typeof displayedEditSha256 !== 'string') {
      return res.status(400).json({ error: 'displayedEditSha256 must be a string or null' });
    }

    const resolvedBaseEditId = typeof baseEditId === 'number' ? baseEditId : undefined;
    const acceptedSuggestions = sanitizeAcceptedSuggestions(req.body.acceptedSuggestions);

    try {
      // SR-OOS-2 FIX3: the conflict check runs BEFORE saveOnServedBase's refusals and its
      // structural-marker backstop, so a stale pane gets its familiar 409 (alert+reload flow)
      // instead of a refusal that masks the real reason the save failed — same args
      // saveSegmentEdit's own check receives.
      segmentEditor.checkEditConflict({
        book: req.params.book,
        moduleId: req.params.moduleId,
        segmentId,
        editorId: String(req.user.id),
        baseEditId: resolvedBaseEditId,
      });

      // G1.1 (spec §5.6): placement, the echoed base hash and displayed pair, the marker
      // backstop against the server-loaded base, then the mint and the row in one
      // transaction. A missing hash is refused (BASE_MISSING), never skipped.
      const saved = servedEdit.saveOnServedBase({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        editedContent,
        category,
        editorNote,
        editorId: String(req.user.id),
        editorUsername: req.user.username,
        baseEditId: resolvedBaseEditId,
        origin: 'editor-save',
        requireEcho: true,
        baseSha256: typeof baseSha256 === 'string' ? baseSha256 : undefined,
        displayedEditId: displayedEditId ?? null,
        displayedEditSha256: displayedEditSha256 ?? null,
        // G1.23 (spec §7): always a list, so an editor save always recomputes what the row took.
        acceptedSuggestions,
      });
      const kept = saved.outcome === 'inserted' || saved.outcome === 'updated';

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
      if (kept && editedContent) {
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

      // G1.2 (spec §5.9, §5.11): the research event, after the commit and before the response. It
      // never throws and never changes this response.
      researchEmission.emitSave(req, { segmentId, editedContent, category, editorNote, saved });

      // The three echo fields are named as the request fields the next save sends (plan
      // decision 15; spec §5.18): the base this save was checked against, and the row the
      // segment now displays (null/null when the save withdrew or wrote nothing).
      res.json({
        success: true,
        editId: saved.editId,
        updated: saved.outcome === 'updated' || saved.outcome === 'withdrawn',
        termWarnings,
        qaFindings,
        baseSha256: saved.baseSha256,
        displayedEditId: kept ? saved.editId : null,
        displayedEditSha256: kept ? saved.editedContentSha256 : null,
      });
    } catch (err) {
      if (err.code === 'SEGMENT_CONFLICT') {
        // Decision 49 ([USER] 2026-11-04, spec AMENDED 2026-11-04): the pre-G1.1 concurrency
        // refusal is logged too. It compares edit ids, not texts, so both hashes are null; the
        // reason is the server's code, not the wire's.
        researchEmission.emitRefused(req, {
          action: 'save',
          segmentId,
          origin: 'editor-save',
          refusal: { code: 'SEGMENT_CONFLICT', echoedSha256: null, currentSha256: null },
        });
        return res.status(409).json({ error: 'conflict', message: err.message });
      }
      if (err.code === 'HAS_DISCUSSION') {
        // §C210: withdrawing an edit that carries a discussion thread is refused.
        return res.status(409).json({ error: 'HAS_DISCUSSION', message: err.message });
      }
      if (err.refusal) {
        // spec §5.6: a refusal is logged with its reason and both hashes, never the text.
        researchEmission.emitRefused(req, {
          action: 'save',
          segmentId,
          refusal: err.refusal,
          origin: 'editor-save',
        });
      }
      if (sendRefusal(res, err)) return;
      if (err.message?.includes('not found')) {
        // A missing module (the loader's "not found"), answered as before G1.1.
        return res.status(404).json({ error: err.message });
      }
      log.error({ err }, 'Error saving segment edit');
      res.status(500).json({ error: err.message });
    }
  }
);

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * POST /:book/:chapter/:moduleId/suggestions/reject
 * Reject one AI suggestion group (G1.23 PR2 task 3; spec §7). Writes one rejection row per change,
 * which hides the group for every editor, then one research event per inserted row. The gate is the
 * save route's. A stale echoed base is never a refusal: the group is looked up in the module's kept
 * log, not in the offered set, so a stale screen can still reject.
 */
router.post(
  '/:book/:chapter/:moduleId/suggestions/reject',
  requireAuth,
  validateBookChapter,
  requireBookAccess(),
  validateModule,
  (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { segmentId, occurrence, groupKey, baseSha256, groupActionId } = body;
    if (typeof segmentId !== 'string' || segmentId.length < 1 || segmentId.length > 200) {
      return res.status(400).json({ error: 'segmentId is required' });
    }
    if (!Number.isInteger(occurrence) || occurrence < 0) {
      return res.status(400).json({ error: 'occurrence must be a non-negative integer' });
    }
    if (typeof groupKey !== 'string' || groupKey.length < 1 || groupKey.length > 512) {
      return res.status(400).json({ error: 'groupKey is required' });
    }
    const book = req.params.book;
    const chapter = req.chapterNum;
    const moduleId = req.params.moduleId;
    try {
      const moduleLog = suggestionLogs.readModuleLog({ book, chapter, moduleId });
      const group = moduleLog.ok
        ? (suggestionLogs.keptGroups(moduleLog).get(`${segmentId}#${occurrence}`) || []).find(
            (g) => g.key === groupKey
          )
        : undefined;
      if (!group) return res.status(404).json({ error: 'SUGGESTION_UNKNOWN' });

      const base = servedEdit.placeAndMintBase({ book, chapter, moduleId, segmentId, occurrence });
      const echoedBaseSha256 =
        typeof baseSha256 === 'string' && SHA256_HEX.test(baseSha256) ? baseSha256 : null;
      const baseMismatch = echoedBaseSha256 !== base.baseSha256;

      const conn = segmentEditor.getDb();
      // Before the write: afterwards the group is closed and would read as not offered. Research
      // only: a failed check never fails the reject; its claims are then unverified (null).
      let offeredOpIds = null;
      try {
        offeredOpIds = suggestionView
          .staticGroupsFor(suggestionView.moduleContext(conn, { book, chapter, moduleId }), {
            segmentId,
            occurrence: base.occurrence,
            baseSha256: base.baseSha256,
          })
          .flatMap((g) => g.changes.map((c) => c.opId));
      } catch (checkErr) {
        log.warn(
          {
            book,
            chapter,
            moduleId,
            reason: checkErr && checkErr.code ? checkErr.code : 'check-failed',
          },
          'Suggestion reject: the offered-set check failed; claims are unverified'
        );
      }

      const { rows, alreadyClosed } = suggestionView.recordRejection(conn, {
        book,
        chapter,
        moduleId,
        segmentId,
        occurrence: base.occurrence,
        group,
        rejectedBy: String(req.user.id),
        nowMs: Date.now(),
      });

      researchEmission.emitSuggestionReject(req, {
        rows,
        servedVersionId: base.servedVersionId,
        offeredOpIds,
        groupActionId,
        echoedBaseSha256,
        baseMismatch,
      });
      res.json({ inserted: rows.length, alreadyClosed });
    } catch (err) {
      if (sendRefusal(res, err)) return;
      if (err.message?.includes('not found')) {
        // A missing module (the loader's "not found"), answered as the save answers it.
        return res.status(404).json({ error: err.message });
      }
      log.error({ err }, 'Error rejecting suggestion group');
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
// §C140 '6' R-5a: the one owner of what a translated block value may hold (an explicit line
// break's shape), shared with the CI corpus sweep and the review panel's line rule.
const { blockValueProblems } = require('../../tools/lib/figure-text-sidecar.cjs');

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
 * The URL of the image route below, for one figure of THIS request's module.
 *
 * Built here rather than in the service because only the route knows
 * `req.baseUrl` — the prefix app.use() mounted this router under. Hardcoding
 * '/api/segment-editor' in the service would make the router un-remountable and
 * would put a second copy of the mount path in the tree.
 *
 * Every interpolated segment is encoded: `basename` has already passed
 * FIGURE_BASENAME_RE by the time a client follows this, but the URL is BUILT
 * before any such check on the list route, and book/chapter/moduleId reach it
 * from params.
 */
function figureImageUrl(req, basename) {
  const { book, chapter, moduleId } = req.params;
  return (
    `${req.baseUrl}/${encodeURIComponent(book)}/${encodeURIComponent(chapter)}` +
    `/${encodeURIComponent(moduleId)}/figures/${encodeURIComponent(basename)}/image`
  );
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

      const bookDir = figureReview.bookDirFor(book);
      const figures = [];
      for (const f of figureReview.listModuleFigures(book, req.chapterNum, moduleId)) {
        const resolved = figureReview.resolveFigure(db, bookId, book, f.basename);
        if (!resolved) continue; // no sidecar -> not a translated figure; skip
        const referenceText = [f.captionSegmentId, f.altSegmentId]
          .map((id) => (id && isBySegment[id]) || '')
          .filter(Boolean)
          .join(' ');
        // The URL is offered only when the file is really there. A figure whose
        // image has not been composed yet keeps its card — the TEXT is what is
        // under review — but gets no <img>, rather than a link that 404s.
        const imageUrl = figureReview.translatedImageFor(bookDir, f.basename)
          ? figureImageUrl(req, f.basename)
          : null;
        figures.push(
          figureReview.buildFigurePayload(f.basename, resolved.fig, referenceText, imageUrl, {
            mtBlocks: resolved.mtBlocks,
            mtAlternatives: resolved.sidecar.mtAlternatives,
            mtJoined: resolved.sidecar.mtJoined,
          })
        );
      }
      res.json({ figures });
    } catch (err) {
      log.error({ err }, 'Error listing figures for review');
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * GET /:book/:chapter/:moduleId/figures/:basename/image
 * The figure's TRANSLATED image, so the review card can show the label an
 * editor is correcting the text of. Read chain mirrors the figure list above.
 *
 * 🔴 Deliberately NOT express.static over books/. A per-book static mount
 * would put a URL segment into a filesystem path with only the router between
 * it and 01-source/, which is licence-load-bearing and READ-ONLY. (This used
 * to cite index.js's `/downloads` mount as a fixed-root precedent; §C200
 * removed it, because that fixed root was pipeline-output/ and it served
 * sessions.db to any signed-in user. A fixed root is no safer than what
 * lives under it.) Going through
 * resolveFigureRequest instead adds NO new traversal surface: it already
 * enforces, in this order, the basename regex (before any I/O), the book
 * lookup, MEMBERSHIP OF THIS MODULE, and the existence of a sidecar.
 *
 * ⚠️ res.sendFile(name, {root}) — never an absolute path. send() applies its
 * dotfiles policy to the whole path it is given, which is how a dot ANYWHERE
 * above the served file (a `.worktrees/` checkout, say) turns every response
 * into a 404. This repo has been bitten by it twice in views.js.
 */
router.get(
  '/:book/:chapter/:moduleId/figures/:basename/image',
  requireAuth,
  requireRole(ROLES.EDITOR),
  validateBookChapter,
  validateModule,
  (req, res) => {
    try {
      const ctx = resolveFigureRequest(req);
      if (ctx.error) return res.status(ctx.error.status).json(ctx.error.body);

      const img = figureReview.translatedImageFor(
        figureReview.bookDirFor(req.params.book),
        ctx.basename
      );
      // Unmapped, or mapped to a file that is not on disk. Both are the normal
      // state of a figure whose image has not been composed yet, so a 404 is
      // the honest answer — not a 500, and not an empty 200.
      if (!img) {
        return res.status(404).json({ error: `No translated image for figure: ${ctx.basename}` });
      }
      res.sendFile(img.name, { root: img.root }, (err) => {
        if (!err) return;
        // The existence check above already passed, so reaching here means the
        // file moved mid-request or the stream broke. Log it; do not try to
        // write a body over a response that may already be streaming.
        log.warn({ err, basename: ctx.basename }, 'Figure image could not be sent');
      });
    } catch (err) {
      log.error({ err }, 'Error serving figure image');
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
  refuseHeldForNonAdmins(figureReviewClosed, (req) => req.params.book, 'figure-review'), // G1.14, R-22
  validateModule,
  (req, res) => {
    const { blockKey, isText } = req.body || {};
    if (typeof blockKey !== 'string' || !blockKey) {
      return res.status(400).json({ error: 'blockKey is required' });
    }
    if (typeof isText !== 'string') {
      return res.status(400).json({ error: 'isText is required' });
    }
    // An empty or whitespace-only value is SILENT LOSS OF PUBLISHED CONTENT,
    // not a no-op: resolveBlocks merges it over the MT text,
    // applyApprovedFigureEdits commits it to the sidecar, and compose.py's
    // guard against exactly this ("a silent blank is far worse than an
    // untranslated label") tests `key not in TR` — so it does NOT fire for a
    // key that is PRESENT with an empty value, and the label is drawn as
    // show_text(''). Refuse it at the boundary instead, before any IO.
    // ⚠️ Distinct from the hasOwnProperty guard below, which is about a
    // block's EXISTING value legitimately being ''. Clearing a label is not
    // an edit this endpoint offers.
    if (!isText.trim()) {
      return res
        .status(400)
        .json({ error: 'isText cannot be empty — a blank would remove the label from the figure' });
    }
    if (isText.length > 10000) {
      return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
    }
    // §C140 '6' R-5a ([USER] 2026-10-05): an LF in the value is the editor's explicit line break,
    // drawn on its own line by the composer. A malformed one (a CR, an empty, edge-spaced or
    // invisible line, or more lines than the key has source lines - so a single-line key takes no
    // LF) would be refused at compose; refuse it here instead, by name, before any IO. The rule's
    // one owner is figure-text-sidecar.cjs; the composer's own copy is figtext.explicit_lines.
    const problems = blockValueProblems(blockKey, isText);
    if (problems.length) {
      return res.status(400).json({ error: `isText cannot be stored — ${problems.join('; ')}` });
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
  refuseHeldForNonAdmins(figureReviewClosed, (req) => req.params.book, 'figure-review'), // G1.14, R-22
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
      const applied = figureReview.applyApprovedFigureEdits(db, {
        bookDir: figureReview.bookDirFor(req.params.book),
        bookId,
        basename,
        mtBlocks: resolved.mtBlocks,
      });
      // composedHash from what was just WRITTEN, not from resolved.sidecar: that
      // copy predates the write. They agree today (the write carries the value
      // forward), and reading the authority rather than a stale twin is what
      // keeps them agreeing if that ever changes.
      const after = figureReview.getFigure(
        db,
        bookId,
        basename,
        resolved.mtBlocks,
        applied.composedHash
      );
      // ⚠️ Approving reports 'mt-preview' until the composer has run, and that
      // is the [USER]-ruled behaviour, not a bug: nothing in this server invokes
      // compose.py, so the published SVG still carries the pre-approval text.
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
 * G1.1 (spec §5.6 Accept): placement runs first (409 BOOK_NOT_MINTED, NO_LAYER,
 * DUPLICATE_ID; 404 for an id not served), and a new acceptance row records the
 * served version it was made on and its occurrence.
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

    let placed = null;
    try {
      // Spec §5.6 Accept: steps 1–3 first, so a duplicated id is refused before acceptSegment's
      // existing lookup would return the first copy's row as alreadyAccepted, and organic and a
      // module with no layer are refused before anything is written. acceptOrigin is the research
      // event's (PR3); nothing here reads it.
      placed = servedEdit.placeOnServedBase({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
      });
      const result = acceptanceService.acceptSegment({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
        acceptedContent,
        userId: String(req.user.id),
        username: req.user.username,
        occurrence: placed.occurrence,
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

      researchEmission.emitAccept(req, { result });
      res.json({ success: true, ...result });
    } catch (err) {
      if (err.refusal) {
        researchEmission.emitRefused(req, { action: 'accept', segmentId, refusal: err.refusal });
      } else if (err.code === 'STALE_CONTENT' && placed) {
        // spec §5.6: the accept's base check is the value check; its refusal is logged as one (decision 49).
        researchEmission.emitRefused(req, {
          action: 'accept',
          segmentId,
          refusal: {
            code: 'STALE_CONTENT',
            echoedText: acceptedContent,
            currentText: placed.seg.is,
          },
        });
      } else if (researchEmission.ACCEPT_ELIGIBILITY_REFUSALS.includes(err.code)) {
        // Decision 49 ([USER] 2026-11-04, spec AMENDED 2026-11-04): an eligibility refusal is logged too, with no hash.
        researchEmission.emitRefused(req, {
          action: 'accept',
          segmentId,
          refusal: { code: err.code, echoedSha256: null, currentSha256: null },
        });
      }
      if (sendRefusal(res, err)) return;
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
    const revoked = acceptanceService.revokeAcceptance(parseInt(req.params.id, 10), {
      actorId: String(req.user.id),
      actorRole: req.user.role,
      actorBooks: req.user.books || [],
    });
    const row = withoutResearchKeys(revoked);
    researchEmission.emitRevoke(req, { row, before: revoked.before });
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
    const { before } = segmentEditor.deleteSegmentEdit(editId, req.user.id);
    researchEmission.emitDelete(req, { before });
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
    if (err.code === 'HAS_DISCUSSION') {
      return res.status(409).json({ error: 'HAS_DISCUSSION', message: err.message });
    }
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

      researchEmission.emitSubmit(req, {
        reviewId: result.id,
        stampedEditIds: result.stampedEditIds,
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
      const result = segmentEditor.approveEdit(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      const edit = withoutResearchKeys(result);
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
      // G1.2: emitted after the act committed and before the response (spec §5.11); `before` is the
      // research event's and never reaches the response (decision 44).
      researchEmission.emitReview(req, 'edit-approve', { edit: result, before: result.before });
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
      const result = segmentEditor.rejectEdit(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      const edit = withoutResearchKeys(result);
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
      researchEmission.emitReview(req, 'edit-reject', { edit: result, before: result.before });
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
      const result = segmentEditor.markForDiscussion(
        parseInt(req.params.editId, 10),
        req.user.id,
        req.user.username,
        req.body?.note
      );
      const edit = withoutResearchKeys(result);
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
      researchEmission.emitReview(req, 'edit-discuss', { edit: result, before: result.before });
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
      const result = segmentEditor.unapproveEdit(parseInt(req.params.editId, 10));
      const edit = withoutResearchKeys(result);
      researchEmission.emitReview(req, 'edit-unapprove', { edit: result, before: result.before });
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
      const result = segmentEditor.returnEditToPending(parseInt(req.params.editId, 10));
      const edit = withoutResearchKeys(result);
      activityLog.log({
        type: activityLog.ACTIVITY_TYPES.SEGMENT_EDIT_REOPENED,
        userId: String(req.user.id),
        username: req.user.username,
        book: edit.book,
        chapter: edit.chapter,
        section: edit.module_id,
        description: `${req.user.username} opnaði aftur breytingu á ${edit.module_id}:${edit.segment_id}`,
      });
      researchEmission.emitReview(req, 'edit-return-to-pending', {
        edit: result,
        before: result.before,
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
      let applyOutcome = 'not-attempted';
      let applyBefore = null;
      let place = null;
      if (result.status === 'approved') {
        try {
          const review = segmentEditor.getModuleReviewWithEdits(parseInt(req.params.reviewId, 10));
          const appliedRaw = segmentEditor.applyApprovedEdits(
            review.review.book,
            review.review.chapter,
            review.review.module_id,
            { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
          );
          applied = withoutResearchKeys(appliedRaw);
          applyBefore = appliedRaw.before;
          applyOutcome = 'applied';
          place = review.review;
        } catch (applyErr) {
          // Auto-apply is best-effort; don't fail the review completion.
          // Head-editor can retry via POST /:book/:chapter/:moduleId/apply
          // — except under a §C203 hold, where a retry is refused the same way.
          log.error({ err: applyErr }, 'Auto-apply after review failed');
          applyOutcome = applyErr.code === 'APPLY_HELD' ? 'held' : 'failed';
          applied =
            applyErr.code === 'APPLY_HELD'
              ? { error: applyErr.message, held: true, retryable: false }
              : { error: applyErr.message, retryable: true };
        }
      }

      const reviewId = parseInt(req.params.reviewId, 10);
      researchEmission.emitReviewComplete(req, {
        reviewId,
        result,
        notes: req.body?.notes,
        apply: applyOutcome,
      });
      if (applyBefore) {
        researchEmission.emitApply(req, {
          book: place.book,
          chapter: place.chapter,
          moduleId: place.module_id,
          before: applyBefore,
          trigger: 'review-complete',
          reviewId,
        });
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
    // The comment IS saved: the research event, then the response (spec §5.11; emit cannot
    // throw), then the audit write. A context-lookup failure after the response must not flip a
    // committed mutation into a 400 — that is the nested-site defect class this batch fixes. Only
    // the lookup is guarded, with a log; the audit write goes bare with degraded context on lookup
    // failure (edit stays null → the || '' fallbacks apply).
    researchEmission.emitComment(req, { edit: result.edit, comment });
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
      // PR1 review C3: the source is placed as POST /propagate places it, so the preview refuses
      // what the write refuses (organic, no layer, a duplicated id) instead of offering it.
      const { seg } = servedEdit.placeOnServedBase({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
      });
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
      if (sendRefusal(res, err)) return;
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
      // G1.1 (spec §11, T18): a book that is never minted takes no write, before any target is
      // loaded. createPropagatedEdits' mint refuses it too, as a second line.
      if (isNotMintedBook(req.params.book)) {
        researchEmission.emitRefused(req, {
          action: 'propagate',
          segmentId,
          refusal: { code: 'BOOK_NOT_MINTED', echoedSha256: null, currentSha256: null },
          origin: 'propagation',
        });
        return res.status(409).json({
          error: 'BOOK_NOT_MINTED',
          message: servedEdit.REFUSAL_MESSAGES.BOOK_NOT_MINTED,
        });
      }
      // PR1 review C3 (spec §5.7): the source is placed, not found by .find, which takes a
      // duplicated id's first copy's English while the client sends the served (last copy's)
      // Icelandic. A duplicated id or a module with no layer is refused, an unknown id keeps
      // today's 404.
      const { seg: sourceSeg } = servedEdit.placeOnServedBase({
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        segmentId,
      });
      const enNorm = concordance.normalizeEn(sourceSeg?.en || '');
      if (!enNorm) return res.status(404).json({ error: 'segment not found' });
      const occurrences = propagation.findOccurrences(req.params.book, enNorm, {
        excludeModuleId: req.params.moduleId,
        excludeSegmentId: segmentId,
      });
      // G1.2 (spec §5.9): what the preview would classify now, read just before the write, for the event only.
      // Research must never fail the act (spec §5.11): if the read throws, the propagation proceeds exactly as
      // before and its events carry no preview.
      let latest = null;
      let previewUnknown = false;
      try {
        latest = propagation.latestLiveEdit(req.params.book, req.params.moduleId, segmentId);
      } catch (readErr) {
        previewUnknown = true;
        log.warn(
          { errorCode: (readErr && (readErr.code || readErr.name)) || null },
          'Propagation preview read failed; its research events carry no preview (spec §5.11)'
        );
      }
      const created = propagation.createPropagatedEdits(propagation.getDb(), {
        book: req.params.book,
        editorId: req.user.id,
        editorUsername: req.user.username,
        propagatedText: editedContent,
        category,
        note: note || 'Sjálfvirk fjölgun',
        occurrences,
        sourceEn: sourceSeg?.en,
      });
      // G1.2: `created.writes` is the research event's; the response stays PR1's.
      const result = withoutResearchKeys(created);
      researchEmission.emitPropagation(req, {
        sourceSegmentId: segmentId,
        sourceIs: sourceSeg?.is ?? '',
        latest,
        previewUnknown,
        editedContent,
        category,
        note: note || 'Sjálfvirk fjölgun',
        writes: created.writes,
        skipped: created.skipped,
      });
      res.json(result);
    } catch (err) {
      if (err.refusal) {
        // spec §5.6, decision 49: every refusal PR1 raises (the source's placement, the mint) is logged.
        researchEmission.emitRefused(req, {
          action: 'propagate',
          segmentId: req.body && req.body.segmentId,
          refusal: err.refusal,
          origin: 'propagation',
        });
      }
      if (sendRefusal(res, err)) return;
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
      const stats = segmentEditor.getModuleStats(
        req.params.book,
        req.params.moduleId,
        req.chapterNum
      );
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
      const applied = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );
      const result = withoutResearchKeys(applied);
      researchEmission.emitApply(req, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        before: applied.before,
        trigger: 'apply',
      });

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
      if (err.code === 'APPLY_HELD') {
        return res.status(423).json({ error: err.message, held: true }); // §C203
      }
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
      const applyRaw = segmentEditor.applyApprovedEdits(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        { appliedBy: req.user.username || (req.user.id != null ? String(req.user.id) : null) }
      );
      const applyResult = withoutResearchKeys(applyRaw);
      researchEmission.emitApply(req, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        before: applyRaw.before,
        trigger: 'apply-and-render',
      });

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
      if (err.code === 'APPLY_HELD') {
        return res.status(423).json({ error: err.message, held: true }); // §C203
      }
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
        req.chapterNum,
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
        req.chapterNum,
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
      const restored = contentVersionService.restoreVersion(
        req.params.book,
        req.chapterNum,
        req.params.moduleId,
        version,
        { userId: req.user.id, username: req.user.username }
      );
      const result = withoutResearchKeys(restored);
      researchEmission.emitRestore(req, { version, before: restored.before });
      res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === 'APPLY_HELD') {
        return res.status(423).json({ error: err.message, held: true }); // §C203
      }
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
