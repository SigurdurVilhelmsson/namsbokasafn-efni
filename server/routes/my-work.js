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
const assignmentStore = require('../services/assignmentStore');
const activityLog = require('../services/activityLog');
const session = require('../services/session');

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

// Stage labels for display
const STAGE_LABELS = {
  'enMarkdown': 'EN Markdown',
  'mtOutput': 'Vélþýðing',
  'linguisticReview': 'Yfirferð 1',
  'editorialPass1': 'Yfirferð 1',
  'tmCreated': 'Þýðingaminni',
  'editorialPass2': 'Yfirferð 2',
  'publication': 'Útgáfa'
};

// Book labels
const BOOK_LABELS = {
  'efnafraedi': 'Efnafræði',
  'liffraedi': 'Líffræði'
};

/**
 * Calculate days until due date
 */
function getDueDateInfo(dueDate) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  return {
    date: dueDate,
    formatted: due.toLocaleDateString('is-IS'),
    daysUntil,
    status: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil <= 3 ? 'soon' : 'normal'
  };
}

/**
 * Get blocked issues for user's assigned chapters
 */
function getBlockedIssuesForAssignments(assignments) {
  const blockedIssues = [];

  try {
    const sessions = session.listAllSessions();

    for (const sess of sessions) {
      const sessionData = session.getSession(sess.id);
      if (!sessionData) continue;

      // Check if this session's chapter matches any of the user's assignments
      const matchingAssignment = assignments.find(a =>
        a.book === sessionData.book && a.chapter === sessionData.chapter
      );

      if (matchingAssignment) {
        // Find blocked issues in this session
        const blocked = sessionData.issues.filter(i =>
          i.category === 'BLOCKED' && i.status === 'pending'
        );

        for (const issue of blocked) {
          blockedIssues.push({
            id: issue.id,
            sessionId: sess.id,
            book: sessionData.book,
            bookLabel: BOOK_LABELS[sessionData.book] || sessionData.book,
            chapter: sessionData.chapter,
            description: issue.description,
            category: issue.category,
            patternId: issue.patternId,
            createdAt: issue.createdAt || sess.createdAt,
            context: issue.context,
            line: issue.line,
            assignmentId: matchingAssignment.id
          });
        }
      }
    }
  } catch (err) {
    console.error('Error getting blocked issues:', err);
  }

  return blockedIssues;
}

/**
 * Get escalation info for overdue items
 */
function getEscalationInfo(items) {
  const now = new Date();
  const escalations = [];

  for (const item of items) {
    let daysOverdue = 0;
    let escalationLevel = null;

    if (item.dueDate?.status === 'overdue') {
      daysOverdue = Math.abs(item.dueDate.daysUntil);

      if (daysOverdue >= 7) {
        escalationLevel = 'critical';
      } else if (daysOverdue >= 3) {
        escalationLevel = 'warning';
      } else {
        escalationLevel = 'notice';
      }

      escalations.push({
        ...item,
        daysOverdue,
        escalationLevel
      });
    }
  }

  return escalations.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/**
 * Get user's proposed terminology
 */
function getUserProposedTerms(username) {
  try {
    const database = getDb();

    // Check if terminology table exists
    const tableExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='terminology'
    `).get();

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
    const tableExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='pending_reviews'
    `).get();

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
    const tableExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='pending_reviews'
    `).get();

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

    // Get assignments
    const assignments = assignmentStore.getUserAssignments(username);
    const formattedAssignments = assignments.map(a => ({
      id: a.id,
      book: a.book,
      bookLabel: BOOK_LABELS[a.book] || a.book,
      chapter: a.chapter,
      stage: a.stage,
      stageLabel: STAGE_LABELS[a.stage] || a.stage,
      assignedBy: a.assignedBy,
      assignedAt: a.assignedAt,
      dueDate: getDueDateInfo(a.dueDate),
      notes: a.notes,
      editorUrl: `/editor?book=${a.book}&chapter=${a.chapter}`
    }));

    // Get pending submissions (awaiting review)
    const pendingSubmissions = getUserPendingSubmissions(username);
    const formattedSubmissions = pendingSubmissions.map(s => ({
      id: s.id,
      book: s.book,
      bookLabel: BOOK_LABELS[s.book] || s.book,
      chapter: s.chapter,
      section: s.section,
      submittedAt: s.submitted_at,
      daysPending: Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / (1000 * 60 * 60 * 24)),
      editorUrl: `/editor?book=${s.book}&chapter=${s.chapter}&section=${s.section}`
    }));

    // Get recent review decisions (feedback)
    const recentReviews = getUserRecentReviews(username);
    const formattedReviews = recentReviews.map(r => ({
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
      editorUrl: `/editor?book=${r.book}&chapter=${r.chapter}&section=${r.section}`
    }));

    // Get proposed terminology
    const proposedTerms = getUserProposedTerms(username);
    const formattedTerms = proposedTerms.map(t => ({
      id: t.id,
      english: t.english,
      icelandic: t.icelandic,
      status: t.status,
      category: t.category,
      createdAt: t.created_at,
      discussionCount: t.discussion_count || 0
    }));

    // Get recent activity
    const recentActivity = activityLog.getByUser(req.user.id, 10);

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name || req.user.username
      },
      assignments: formattedAssignments,
      pendingSubmissions: formattedSubmissions,
      recentReviews: formattedReviews,
      proposedTerms: formattedTerms,
      recentActivity,
      summary: {
        assignmentsCount: formattedAssignments.length,
        pendingSubmissionsCount: formattedSubmissions.length,
        changesRequestedCount: formattedReviews.filter(r => r.status === 'changes_requested').length,
        proposedTermsCount: formattedTerms.length,
        overdueCount: formattedAssignments.filter(a => a.dueDate?.status === 'overdue').length
      }
    });

  } catch (err) {
    console.error('My work error:', err);
    res.status(500).json({
      error: 'Failed to load my work',
      message: err.message
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

    // Get all assignments
    const assignments = assignmentStore.getUserAssignments(username);

    // Get changes requested (highest priority)
    const recentReviews = getUserRecentReviews(username, 20);
    const changesRequested = recentReviews
      .filter(r => r.status === 'changes_requested')
      .map(r => ({
        id: r.id,
        type: 'changes_requested',
        book: r.book,
        bookLabel: BOOK_LABELS[r.book] || r.book,
        chapter: r.chapter,
        section: r.section,
        reviewedBy: r.reviewed_by_username,
        reviewedAt: r.reviewed_at,
        notes: r.review_notes,
        editorUrl: `/editor?book=${r.book}&chapter=${r.chapter}&section=${r.section}`,
        priority: 1, // Highest priority
        priorityLabel: 'Breytingar óskast'
      }));

    // Format assignments with priority
    const formattedAssignments = assignments.map(a => {
      const dueInfo = getDueDateInfo(a.dueDate);
      let priority = 3; // Default priority
      let priorityLabel = 'Úthlutað';

      if (dueInfo?.status === 'overdue') {
        priority = 1;
        priorityLabel = 'Yfir tíma!';
      } else if (dueInfo?.status === 'today') {
        priority = 2;
        priorityLabel = 'Skiladagur í dag';
      } else if (dueInfo?.status === 'soon') {
        priority = 2;
        priorityLabel = `${dueInfo.daysUntil} dagar eftir`;
      }

      return {
        id: a.id,
        type: 'assignment',
        book: a.book,
        bookLabel: BOOK_LABELS[a.book] || a.book,
        chapter: a.chapter,
        stage: a.stage,
        stageLabel: STAGE_LABELS[a.stage] || a.stage,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt,
        dueDate: dueInfo,
        notes: a.notes,
        editorUrl: `/editor?book=${a.book}&chapter=${a.chapter}`,
        priority,
        priorityLabel
      };
    });

    // Combine and sort by priority
    const allTasks = [...changesRequested, ...formattedAssignments]
      .sort((a, b) => {
        // First by priority (lower = more urgent)
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Then by due date
        if (a.dueDate?.daysUntil !== undefined && b.dueDate?.daysUntil !== undefined) {
          return a.dueDate.daysUntil - b.dueDate.daysUntil;
        }
        return 0;
      });

    // Current task is the most urgent
    const currentTask = allTasks.length > 0 ? allTasks[0] : null;

    // Up next is the rest (limit to 5)
    const upNext = allTasks.slice(1, 6);

    // Get blocked issues for user's assignments
    const blockedIssues = getBlockedIssuesForAssignments(assignments);

    // Mark assignments that are blocked
    for (const assignment of formattedAssignments) {
      const relatedBlocked = blockedIssues.filter(b =>
        b.book === assignment.book && b.chapter === assignment.chapter
      );
      if (relatedBlocked.length > 0) {
        assignment.isBlocked = true;
        assignment.blockedReason = relatedBlocked[0].description;
        assignment.blockedIssueId = relatedBlocked[0].id;
        assignment.blockedCount = relatedBlocked.length;
      }
    }

    // Needs attention: overdue items, changes requested, and blocked items (for alert banner)
    const needsAttention = [
      ...allTasks.filter(t =>
        t.type === 'changes_requested' ||
        t.dueDate?.status === 'overdue'
      ),
      ...blockedIssues.map(b => ({
        type: 'blocked',
        ...b
      }))
    ];

    // Get escalation info for overdue items
    const escalations = getEscalationInfo(formattedAssignments);

    // Quick stats
    const pendingSubmissions = getUserPendingSubmissions(username);
    const proposedTerms = getUserProposedTerms(username);

    // Calculate completed this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const completedThisWeek = recentReviews.filter(r =>
      r.status === 'approved' &&
      new Date(r.reviewed_at) >= weekAgo
    ).length;

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name || req.user.username
      },
      currentTask,
      upNext,
      needsAttention,
      blockedIssues,
      escalations,
      quickStats: {
        totalTasks: allTasks.length,
        changesRequested: changesRequested.length,
        overdue: formattedAssignments.filter(a => a.dueDate?.status === 'overdue').length,
        blocked: blockedIssues.length,
        pendingReview: pendingSubmissions.length,
        completedThisWeek,
        proposedTerms: proposedTerms.length
      },
      // For users who want to see more
      allTasks
    });

  } catch (err) {
    console.error('My work today error:', err);
    res.status(500).json({
      error: 'Failed to load today view',
      message: err.message
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

    const assignments = assignmentStore.getUserAssignments(username);
    const pendingSubmissions = getUserPendingSubmissions(username);
    const recentReviews = getUserRecentReviews(username, 5);
    const proposedTerms = getUserProposedTerms(username);

    const overdueCount = assignments.filter(a => {
      if (!a.dueDate) return false;
      const daysUntil = Math.ceil((new Date(a.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntil < 0;
    }).length;

    res.json({
      assignments: assignments.length,
      pendingSubmissions: pendingSubmissions.length,
      changesRequested: recentReviews.filter(r => r.status === 'changes_requested').length,
      proposedTerms: proposedTerms.length,
      overdue: overdueCount,
      total: assignments.length + pendingSubmissions.length + proposedTerms.length
    });

  } catch (err) {
    console.error('My work summary error:', err);
    res.status(500).json({
      error: 'Failed to load summary',
      message: err.message
    });
  }
});

module.exports = router;
