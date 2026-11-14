/**
 * My Work Routes
 *
 * API endpoints for the translator's "My Work" dashboard.
 * Aggregates pending reviews, changes requested, and terminology proposals.
 *
 * Endpoints:
 *   GET /api/my-work          Get all work items for current user
 *   GET /api/my-work/summary  Get summary counts
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const { BOOK_LABELS } = require('../config');
const activityLog = require('../services/activityLog');
const dashboardReadModel = require('../services/dashboardReadModel');
const userService = require('../services/userService');
const resolveDbPath = require('../lib/dbPath');

// Database path (same as other services)
const DB_PATH = resolveDbPath();

// Lazy database initialization
let db = null;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// Stage to editor pass mapping
const STAGE_TO_PASS = {
  linguisticReview: 'pass1',
};

/**
 * Build editor URL with stage parameter. With `segmentId`, the editor opens that row once the module is loaded
 * (interface audit 2026-11-13, HM-04: "Laga" opened the module and left the editor to find the row).
 */
function buildEditorUrl(book, chapter, section, stage, segmentId = null) {
  let url = `/segment-editor?book=${book}&chapter=${chapter}`;
  if (section) {
    url += `&module=${section}`;
  }
  if (stage && STAGE_TO_PASS[stage]) {
    url += `&stage=${STAGE_TO_PASS[stage]}`;
  }
  if (section && segmentId) {
    url += `&segment=${encodeURIComponent(segmentId)}`;
  }
  return url;
}

/**
 * The first words of a segment's text for a reader (HM-03): bracket markers become their visible text, and a
 * text longer than `max` is cut at a word and ends in "…".
 */
function excerptOf(text, max = 80) {
  const plain = String(text || '')
    .replace(/\[\[[a-z]+:([^\]|]*)(?:\|[^\]]*)?\]\]/gi, '$1')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * What a reviewer's answer asks of the editor (HM-03): `discuss` is a question to answer, `rejected` is a
 * rejection to look at. Both used to read "Breytingar óskast".
 */
function reviewKind(status) {
  return status === 'discuss' ? 'question' : 'rejected';
}

/**
 * The chapters assigned to the reader, each with a link into the editor (HM-01). Looked up by the session's
 * account row; a session with no row (a guest) has none.
 */
function getAssignedChapters(user) {
  try {
    const row = userService.findByProviderId(user.id);
    if (!row) return [];
    return userService.getAllChapterAssignments(row.id).map((a) => ({
      book: a.book_slug,
      bookLabel: BOOK_LABELS[a.book_slug] || a.book_slug,
      chapter: a.chapter,
      editorUrl: `/editor?book=${encodeURIComponent(a.book_slug)}&chapter=${a.chapter}`,
    }));
  } catch (err) {
    log.error({ err }, 'Error getting assigned chapters');
    return [];
  }
}

/**
 * Get user's proposed terminology.
 *
 * NOTE: The terminology proposals feature is not yet implemented.
 * The actual table is 'terminology_terms' (migration 004) with a different
 * schema than this function expected. Returns empty until the feature is built.
 */
function getUserProposedTerms() {
  return [];
}

/**
 * Get user's pending segment edits (awaiting review)
 */
function getUserPendingSubmissions(username) {
  try {
    const database = getDb();

    const tableExists = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='segment_edits'")
      .get();
    if (!tableExists) return [];

    const stmt = database.prepare(`
      SELECT id, book, chapter, module_id as section, segment_id, status, created_at as submitted_at
      FROM segment_edits
      WHERE editor_username = ? AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 50
    `);
    return stmt.all(username);
  } catch (err) {
    log.error({ err }, 'Error getting user submissions');
    return [];
  }
}

/**
 * Get user's recently reviewed segment edits (approved, rejected, or discuss)
 */
function getUserRecentReviews(username, limit = 10) {
  try {
    const database = getDb();

    const tableExists = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='segment_edits'")
      .get();
    if (!tableExists) return [];

    const stmt = database.prepare(`
      SELECT id, book, chapter, module_id as section, segment_id, status, edited_content,
             reviewer_username as reviewed_by_username, reviewer_note as review_notes,
             reviewed_at
      FROM segment_edits
      WHERE editor_username = ? AND status IN ('approved', 'rejected', 'discuss')
      ORDER BY reviewed_at DESC, id DESC
      LIMIT ?
    `);
    return stmt.all(username, Math.min(limit, 200));
  } catch (err) {
    log.error({ err }, 'Error getting user recent reviews');
    return [];
  }
}

/**
 * GET /api/my-work
 * Get all work items for the current user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const username = req.user.username;

    // Get pending submissions (awaiting review)
    const pendingSubmissions = getUserPendingSubmissions(username);
    const formattedSubmissions = pendingSubmissions.map((s) => ({
      id: s.id,
      book: s.book,
      bookLabel: BOOK_LABELS[s.book] || s.book,
      chapter: s.chapter,
      section: s.section,
      submittedAt: s.submitted_at,
      daysPending: Math.floor(
        (Date.now() - new Date(s.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
      editorUrl: buildEditorUrl(s.book, s.chapter, s.section, null),
    }));

    // Get recent review decisions (feedback)
    const recentReviews = getUserRecentReviews(username);
    const formattedReviews = recentReviews.map((r) => ({
      id: r.id,
      book: r.book,
      bookLabel: BOOK_LABELS[r.book] || r.book,
      chapter: r.chapter,
      section: r.section,
      status: r.status,
      reviewedBy: r.reviewed_by_username,
      reviewedAt: r.reviewed_at,
      notes: r.review_notes,
      hasNotes: !!r.review_notes,
      kind: reviewKind(r.status),
      excerpt: excerptOf(r.edited_content),
      editorUrl: buildEditorUrl(r.book, r.chapter, r.section, null, r.segment_id),
    }));

    // Get proposed terminology
    const proposedTerms = getUserProposedTerms(username);
    const formattedTerms = proposedTerms.map((t) => ({
      id: t.id,
      english: t.english,
      icelandic: t.icelandic,
      status: t.status,
      category: t.category,
      createdAt: t.created_at,
      discussionCount: t.discussion_count || 0,
    }));

    // Get recent activity
    const recentActivity = activityLog.getByUser(req.user.id, 10);

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name || req.user.username,
      },
      pendingSubmissions: formattedSubmissions,
      recentReviews: formattedReviews,
      proposedTerms: formattedTerms,
      recentActivity,
      summary: {
        pendingSubmissionsCount: formattedSubmissions.length,
        changesRequestedCount: formattedReviews.filter(
          (r) => r.status === 'rejected' || r.status === 'discuss'
        ).length,
        proposedTermsCount: formattedTerms.length,
      },
    });
  } catch (err) {
    log.error({ err }, 'My work error');
    res.status(500).json({
      error: 'Failed to load my work',
      message: err.message,
    });
  }
});

/**
 * GET /api/my-work/today
 * Get prioritized "what to work on now" view
 * Returns: currentTask, upNext, needsAttention, quickStats
 */
router.get('/today', requireAuth, (req, res) => {
  try {
    const username = req.user.username;

    // Get rejected/discuss edits (highest priority — need editor attention)
    const recentReviews = getUserRecentReviews(username, 20);
    const changesRequested = recentReviews
      .filter((r) => r.status === 'rejected' || r.status === 'discuss')
      .map((r) => ({
        id: r.id,
        type: 'changes_requested',
        book: r.book,
        bookLabel: BOOK_LABELS[r.book] || r.book,
        chapter: r.chapter,
        section: r.section,
        reviewedBy: r.reviewed_by_username,
        reviewedAt: r.reviewed_at,
        notes: r.review_notes,
        kind: reviewKind(r.status),
        excerpt: excerptOf(r.edited_content),
        editorUrl: buildEditorUrl(r.book, r.chapter, r.section, null, r.segment_id),
        priority: 1,
        // (read and approved by [USER] on 2026-11-14)
        priorityLabel: r.status === 'discuss' ? 'Spurning frá yfirlesara' : 'Breytingu hafnað',
      }));

    const allTasks = changesRequested;

    // Current task is the most urgent
    const currentTask = allTasks.length > 0 ? allTasks[0] : null;

    // Up next is the rest (limit to 5)
    const upNext = allTasks.slice(1, 6);

    // Needs attention: changes requested (for alert banner)
    const needsAttention = changesRequested;

    // Quick stats
    const pendingSubmissions = getUserPendingSubmissions(username);
    const proposedTerms = getUserProposedTerms(username);

    // Calculate completed this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const completedThisWeek = recentReviews.filter(
      (r) => r.status === 'approved' && new Date(r.reviewed_at) >= weekAgo
    ).length;

    // Role-aware admin counter (audit F1, F2). Single source of truth via
    // dashboardReadModel — counts pending segment_edits directly, no
    // module_reviews wrapper required.
    let adminStats = null;
    if (req.user.role === 'admin' || req.user.role === 'head-editor') {
      try {
        adminStats = {
          globalPendingCount: dashboardReadModel.getAdminHeadlineCount(),
          readyToApplyCount: dashboardReadModel.getReadyToApply().length,
        };
      } catch (err) {
        log.error({ err }, 'Failed to compute adminStats');
      }
    }

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name || req.user.username,
        role: req.user.role,
      },
      currentTask,
      upNext,
      needsAttention,
      quickStats: {
        totalTasks: allTasks.length,
        changesRequested: changesRequested.length,
        pendingReview: pendingSubmissions.length,
        completedThisWeek,
        proposedTerms: proposedTerms.length,
      },
      adminStats,
      allTasks,
      assignedChapters: getAssignedChapters(req.user),
    });
  } catch (err) {
    log.error({ err }, 'My work today error');
    res.status(500).json({
      error: 'Failed to load today view',
      message: err.message,
    });
  }
});

/**
 * GET /api/my-work/summary
 * Get summary counts only (for nav badges)
 */
router.get('/summary', requireAuth, (req, res) => {
  try {
    const username = req.user.username;

    const pendingSubmissions = getUserPendingSubmissions(username);
    const recentReviews = getUserRecentReviews(username, 5);
    const proposedTerms = getUserProposedTerms(username);

    res.json({
      pendingSubmissions: pendingSubmissions.length,
      changesRequested: recentReviews.filter(
        (r) => r.status === 'rejected' || r.status === 'discuss'
      ).length,
      proposedTerms: proposedTerms.length,
      total: pendingSubmissions.length + proposedTerms.length,
    });
  } catch (err) {
    log.error({ err }, 'My work summary error');
    res.status(500).json({
      error: 'Failed to load summary',
      message: err.message,
    });
  }
});

module.exports = router;
