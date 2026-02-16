/**
 * My Work Routes
 *
 * API endpoints for the translator's "My Work" dashboard.
 * Aggregates assignments, pending reviews, and terminology proposals.
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

const { requireAuth } = require('../middleware/requireAuth');
const activityLog = require('../services/activityLog');

// Database path (same as other services)
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

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
  editorialPass1: 'pass1',
  editorialPass2: 'pass2',
};

/**
 * Build editor URL with stage parameter
 */
function buildEditorUrl(book, chapter, section, stage) {
  let url = `/editor?book=${book}&chapter=${chapter}`;
  if (section) {
    url += `&section=${section}`;
  }
  if (stage && STAGE_TO_PASS[stage]) {
    url += `&stage=${STAGE_TO_PASS[stage]}`;
  }
  return url;
}

// Book labels
const BOOK_LABELS = {
  efnafraedi: 'Efnafræði',
  liffraedi: 'Líffræði',
};

/**
 * Get user's proposed terminology
 */
function getUserProposedTerms(username) {
  try {
    const database = getDb();

    // Check if terminology table exists
    const tableExists = database
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' AND name='terminology'
    `
      )
      .get();

    if (!tableExists) {
      return [];
    }

    const stmt = database.prepare(`
      SELECT t.*,
             (SELECT COUNT(*) FROM terminology_discussions td WHERE td.term_id = t.id) as discussion_count
      FROM terminology t
      WHERE t.proposed_by_name = ? AND t.status IN ('proposed', 'needs_review')
      ORDER BY t.created_at DESC
      LIMIT 20
    `);
    return stmt.all(username);
  } catch (err) {
    console.error('Error getting user terms:', err);
    return [];
  }
}

/**
 * Get user's submissions awaiting review
 */
function getUserPendingSubmissions(username) {
  try {
    const database = getDb();

    // Check if pending_reviews table exists
    const tableExists = database
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' AND name='pending_reviews'
    `
      )
      .get();

    if (!tableExists) {
      return [];
    }

    const stmt = database.prepare(`
      SELECT pr.*, eh.content
      FROM pending_reviews pr
      JOIN edit_history eh ON pr.edit_history_id = eh.id
      WHERE pr.submitted_by_username = ? AND pr.status = 'pending'
      ORDER BY pr.submitted_at DESC
    `);
    return stmt.all(username);
  } catch (err) {
    console.error('Error getting user submissions:', err);
    return [];
  }
}

/**
 * Get user's recently reviewed submissions (approved or changes requested)
 */
function getUserRecentReviews(username, limit = 10) {
  try {
    const database = getDb();

    // Check if pending_reviews table exists
    const tableExists = database
      .prepare(
        `
      SELECT name FROM sqlite_master WHERE type='table' AND name='pending_reviews'
    `
      )
      .get();

    if (!tableExists) {
      return [];
    }

    const stmt = database.prepare(`
      SELECT pr.*, eh.content
      FROM pending_reviews pr
      JOIN edit_history eh ON pr.edit_history_id = eh.id
      WHERE pr.submitted_by_username = ? AND pr.status IN ('approved', 'changes_requested')
      ORDER BY pr.reviewed_at DESC
      LIMIT ?
    `);
    return stmt.all(username, limit);
  } catch (err) {
    console.error('Error getting user recent reviews:', err);
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
      editorUrl: buildEditorUrl(r.book, r.chapter, r.section, null),
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
        changesRequestedCount: formattedReviews.filter((r) => r.status === 'changes_requested')
          .length,
        proposedTermsCount: formattedTerms.length,
      },
    });
  } catch (err) {
    console.error('My work error:', err);
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

    // Get changes requested (highest priority)
    const recentReviews = getUserRecentReviews(username, 20);
    const changesRequested = recentReviews
      .filter((r) => r.status === 'changes_requested')
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
        editorUrl: buildEditorUrl(r.book, r.chapter, r.section, null),
        priority: 1,
        priorityLabel: 'Breytingar óskast',
      }));

    const allTasks = [...changesRequested];

    // Current task is the most urgent
    const currentTask = allTasks.length > 0 ? allTasks[0] : null;

    // Up next is the rest (limit to 5)
    const upNext = allTasks.slice(1, 6);

    // Needs attention: changes requested (for alert banner)
    const needsAttention = allTasks.filter((t) => t.type === 'changes_requested');

    // Quick stats
    const pendingSubmissions = getUserPendingSubmissions(username);
    const proposedTerms = getUserProposedTerms(username);

    // Calculate completed this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const completedThisWeek = recentReviews.filter(
      (r) => r.status === 'approved' && new Date(r.reviewed_at) >= weekAgo
    ).length;

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name || req.user.username,
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
      allTasks,
    });
  } catch (err) {
    console.error('My work today error:', err);
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
      changesRequested: recentReviews.filter((r) => r.status === 'changes_requested').length,
      proposedTerms: proposedTerms.length,
      total: pendingSubmissions.length + proposedTerms.length,
    });
  } catch (err) {
    console.error('My work summary error:', err);
    res.status(500).json({
      error: 'Failed to load summary',
      message: err.message,
    });
  }
});

module.exports = router;
