/**
 * Issues Routes
 *
 * Handles issue management and review workflow.
 *
 * Endpoints:
 *   GET  /api/issues                List pending issues by category and book
 *   GET  /api/issues/:id            Get specific issue details
 *   POST /api/issues/:id/resolve    Mark issue resolved with action taken
 *   GET  /api/issues/stats          Dashboard stats
 *   POST /api/issues/batch-resolve  Resolve multiple issues
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { requireEditor } = require('../middleware/requireRole');
const session = require('../services/session');
const { ISSUE_CATEGORIES } = require('../services/issueClassifier');

// Legacy in-memory issue store (for manually reported issues)
const issueStore = new Map();

/**
 * Collect issues from all sessions
 */
function collectSessionIssues(filters = {}) {
  const { book, chapter, sessionId } = filters;
  const sessions = session.listAllSessions();
  const allIssues = [];

  for (const sess of sessions) {
    // Filter by sessionId if specified
    if (sessionId && sess.id !== sessionId) continue;

    const sessionData = session.getSession(sess.id);
    if (!sessionData) continue;

    // Filter by book
    if (book && sessionData.book !== book) continue;
    // Filter by chapter
    if (chapter && sessionData.chapter !== parseInt(chapter)) continue;

    for (const issue of sessionData.issues) {
      allIssues.push({
        ...issue,
        sessionId: sess.id,
        book: sessionData.book,
        chapter: sessionData.chapter,
      });
    }
  }

  return allIssues;
}

/**
 * GET /api/issues
 * List pending issues, optionally filtered
 *
 * Query params:
 *   - book: Filter by book
 *   - chapter: Filter by chapter
 *   - sessionId: Filter by session
 *   - category: Filter by category (AUTO_FIX, EDITOR_CONFIRM, BOARD_REVIEW, BLOCKED)
 *   - status: Filter by status (pending, resolved, escalated)
 */
router.get('/', requireAuth, (req, res) => {
  const { book, chapter, sessionId, category, status = 'pending' } = req.query;

  // Collect issues from sessions
  let issues = collectSessionIssues({ book, chapter, sessionId });

  // Also include manually reported issues from issueStore
  const manualIssues = Array.from(issueStore.values());
  if (book) {
    issues = issues.concat(manualIssues.filter((i) => i.book === book));
  } else {
    issues = issues.concat(manualIssues);
  }

  // Apply category filter
  if (category) {
    issues = issues.filter((i) => i.category === category);
  }
  // Apply status filter
  if (status) {
    issues = issues.filter((i) => i.status === status);
  }

  // Check permissions - editors can see all, contributors only see their own sessions
  if (req.user.role === 'contributor') {
    const userSessions = session.listUserSessions(req.user.id).map((s) => s.id);
    issues = issues.filter(
      (i) => i.reportedBy === req.user.id || (i.sessionId && userSessions.includes(i.sessionId))
    );
  }

  // Group by category
  const grouped = {
    AUTO_FIX: [],
    EDITOR_CONFIRM: [],
    BOARD_REVIEW: [],
    BLOCKED: [],
  };

  for (const issue of issues) {
    if (grouped[issue.category]) {
      grouped[issue.category].push(issue);
    }
  }

  res.json({
    total: issues.length,
    byCategory: grouped,
    filters: { book, chapter, sessionId, category, status },
    categoryInfo: ISSUE_CATEGORIES,
  });
});

/**
 * GET /api/issues/stats
 * Get dashboard statistics
 */
router.get('/stats', requireAuth, (req, res) => {
  const { book, sessionId } = req.query;

  // Collect issues from sessions
  let issues = collectSessionIssues({ book, sessionId });

  // Also include manually reported issues
  const manualIssues = Array.from(issueStore.values());
  if (book) {
    issues = issues.concat(manualIssues.filter((i) => i.book === book));
  } else {
    issues = issues.concat(manualIssues);
  }

  const stats = {
    total: issues.length,
    pending: issues.filter((i) => i.status === 'pending').length,
    resolved: issues.filter((i) => i.status === 'resolved').length,
    escalated: issues.filter((i) => i.status === 'escalated').length,
    byCategory: {
      AUTO_FIX: issues.filter((i) => i.category === 'AUTO_FIX').length,
      EDITOR_CONFIRM: issues.filter((i) => i.category === 'EDITOR_CONFIRM').length,
      BOARD_REVIEW: issues.filter((i) => i.category === 'BOARD_REVIEW').length,
      BLOCKED: issues.filter((i) => i.category === 'BLOCKED').length,
    },
    pendingByCategory: {
      AUTO_FIX: issues.filter((i) => i.category === 'AUTO_FIX' && i.status === 'pending').length,
      EDITOR_CONFIRM: issues.filter(
        (i) => i.category === 'EDITOR_CONFIRM' && i.status === 'pending'
      ).length,
      BOARD_REVIEW: issues.filter((i) => i.category === 'BOARD_REVIEW' && i.status === 'pending')
        .length,
      BLOCKED: issues.filter((i) => i.category === 'BLOCKED' && i.status === 'pending').length,
    },
    recentlyResolved: issues
      .filter((i) => i.status === 'resolved' && i.resolvedAt)
      .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt))
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        description: i.description,
        category: i.category,
        resolvedAt: i.resolvedAt,
        resolvedBy: i.resolvedBy,
        sessionId: i.sessionId,
        book: i.book,
        chapter: i.chapter,
      })),
  };

  res.json(stats);
});

/**
 * GET /api/issues/session/:sessionId
 * Get all issues for a specific session
 */
router.get('/session/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const { category, status } = req.query;

  const sessionData = session.getSession(sessionId);
  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }

  // Check access
  if (
    sessionData.userId !== req.user.id &&
    req.user.role !== 'admin' &&
    req.user.role !== 'editor'
  ) {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  let issues = [...sessionData.issues];

  // Apply filters
  if (category) {
    issues = issues.filter((i) => i.category === category);
  }
  if (status) {
    issues = issues.filter((i) => i.status === status);
  }

  // Group by category
  const grouped = {
    AUTO_FIX: issues.filter((i) => i.category === 'AUTO_FIX'),
    EDITOR_CONFIRM: issues.filter((i) => i.category === 'EDITOR_CONFIRM'),
    BOARD_REVIEW: issues.filter((i) => i.category === 'BOARD_REVIEW'),
    BLOCKED: issues.filter((i) => i.category === 'BLOCKED'),
  };

  res.json({
    sessionId,
    book: sessionData.book,
    chapter: sessionData.chapter,
    issues,
    total: issues.length,
    pending: issues.filter((i) => i.status === 'pending').length,
    byCategory: grouped,
    categoryInfo: ISSUE_CATEGORIES,
  });
});

/**
 * POST /api/issues/session/:sessionId/:issueId/resolve
 * Resolve a session-based issue
 *
 * Body:
 *   - action: 'accept' | 'reject' | 'modify' | 'escalate' | 'ignore'
 *   - resolution: Description of resolution
 *   - modifiedValue: (optional) Modified value if action is 'modify'
 *   - createDecision: (optional) Whether to create a linked decision
 *   - decisionRationale: (optional) Additional rationale for decision
 */
router.post('/session/:sessionId/:issueId/resolve', requireAuth, (req, res) => {
  const { sessionId, issueId } = req.params;
  const { action, resolution, modifiedValue } = req.body;

  const sessionData = session.getSession(sessionId);
  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }

  // Check access
  if (
    sessionData.userId !== req.user.id &&
    req.user.role !== 'admin' &&
    req.user.role !== 'editor'
  ) {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  const issue = sessionData.issues.find((i) => i.id === issueId);
  if (!issue) {
    return res.status(404).json({
      error: 'Issue not found',
    });
  }

  if (issue.status !== 'pending') {
    return res.status(400).json({
      error: 'Issue already resolved',
      status: issue.status,
    });
  }

  // Check permissions for BOARD_REVIEW
  if (
    issue.category === 'BOARD_REVIEW' &&
    req.user.role !== 'admin' &&
    req.user.role !== 'head-editor' &&
    req.user.role !== 'editor'
  ) {
    return res.status(403).json({
      error: 'Editor access required for board review issues',
    });
  }

  if (!['accept', 'reject', 'modify', 'escalate', 'ignore'].includes(action)) {
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['accept', 'reject', 'modify', 'escalate', 'ignore'],
    });
  }

  // Resolve the issue via session service
  const resolutionData = {
    resolution: action === 'escalate' ? 'escalated' : action,
    comment: resolution,
    modifiedValue,
    resolvedBy: req.user.username,
  };

  const resolved = session.resolveIssue(sessionId, issueId, resolutionData);

  if (!resolved) {
    return res.status(500).json({
      error: 'Failed to resolve issue',
    });
  }

  // Get updated stats
  const updatedSession = session.getSession(sessionId);
  const pendingCount = updatedSession.issues.filter((i) => i.status === 'pending').length;
  const blockedCount = updatedSession.issues.filter(
    (i) => i.category === 'BLOCKED' && i.status === 'pending'
  ).length;

  res.json({
    success: true,
    issue: resolved,
    remainingPending: pendingCount,
    blockedCount,
  });
});

/**
 * GET /api/issues/:id
 * Get specific issue details (legacy - checks both stores)
 */
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  // First check legacy store
  let issue = issueStore.get(id);

  // If not found, search in sessions
  if (!issue) {
    const sessions = session.listAllSessions();
    for (const sess of sessions) {
      const sessionData = session.getSession(sess.id);
      if (!sessionData) continue;

      const found = sessionData.issues.find((i) => i.id === id);
      if (found) {
        issue = {
          ...found,
          sessionId: sess.id,
          book: sessionData.book,
          chapter: sessionData.chapter,
        };
        break;
      }
    }
  }

  if (!issue) {
    return res.status(404).json({
      error: 'Issue not found',
    });
  }

  res.json({
    issue,
    categoryInfo: ISSUE_CATEGORIES[issue.category],
    actions: getAvailableActions(issue, req.user),
  });
});

/**
 * POST /api/issues/:id/resolve
 * Mark issue resolved with action taken
 *
 * Body:
 *   - action: 'accept' | 'reject' | 'modify'
 *   - resolution: Description of resolution
 *   - modifiedValue: (optional) Modified value if action is 'modify'
 */
router.post('/:id/resolve', requireAuth, requireEditor(), (req, res) => {
  const { id } = req.params;
  const { action, resolution, modifiedValue } = req.body;

  const issue = issueStore.get(id);

  if (!issue) {
    return res.status(404).json({
      error: 'Issue not found',
    });
  }

  if (issue.status !== 'pending') {
    return res.status(400).json({
      error: 'Issue already resolved',
      status: issue.status,
    });
  }

  // Check permissions for category
  if (
    issue.category === 'BOARD_REVIEW' &&
    req.user.role !== 'admin' &&
    req.user.role !== 'head-editor'
  ) {
    return res.status(403).json({
      error: 'Board review issues require head editor or admin',
    });
  }

  if (!['accept', 'reject', 'modify', 'escalate'].includes(action)) {
    return res.status(400).json({
      error: 'Invalid action',
      validActions: ['accept', 'reject', 'modify', 'escalate'],
    });
  }

  // Update issue
  issue.status = action === 'escalate' ? 'escalated' : 'resolved';
  issue.action = action;
  issue.resolution = resolution;
  issue.resolvedBy = req.user.username;
  issue.resolvedAt = new Date().toISOString();

  if (modifiedValue !== undefined) {
    issue.modifiedValue = modifiedValue;
  }

  res.json({
    success: true,
    issue: {
      id: issue.id,
      status: issue.status,
      action: issue.action,
      resolution: issue.resolution,
      resolvedBy: issue.resolvedBy,
      resolvedAt: issue.resolvedAt,
    },
  });
});

/**
 * POST /api/issues/batch-resolve
 * Resolve multiple issues at once
 *
 * Body:
 *   - issueIds: Array of issue IDs
 *   - action: 'accept' | 'reject'
 *   - resolution: Description of resolution
 */
router.post('/batch-resolve', requireAuth, requireEditor(), (req, res) => {
  const { issueIds, action, resolution } = req.body;

  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return res.status(400).json({
      error: 'issueIds must be a non-empty array',
    });
  }

  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({
      error: 'Invalid action for batch resolve',
      validActions: ['accept', 'reject'],
    });
  }

  const results = {
    resolved: [],
    failed: [],
  };

  for (const id of issueIds) {
    const issue = issueStore.get(id);

    if (!issue) {
      results.failed.push({ id, error: 'Not found' });
      continue;
    }

    if (issue.status !== 'pending') {
      results.failed.push({ id, error: 'Already resolved' });
      continue;
    }

    // Skip board review issues in batch resolve
    if (issue.category === 'BOARD_REVIEW') {
      results.failed.push({ id, error: 'Board review issues must be resolved individually' });
      continue;
    }

    // Update issue
    issue.status = 'resolved';
    issue.action = action;
    issue.resolution = resolution || `Batch ${action}ed`;
    issue.resolvedBy = req.user.username;
    issue.resolvedAt = new Date().toISOString();

    results.resolved.push(id);
  }

  res.json({
    success: true,
    resolved: results.resolved.length,
    failed: results.failed.length,
    details: results,
  });
});

/**
 * POST /api/issues/auto-fix
 * Apply all auto-fixable issues for a session/chapter
 *
 * Body:
 *   - sessionId: Workflow session ID
 *   OR
 *   - book: Book identifier
 *   - chapter: Chapter number
 */
router.post('/auto-fix', requireAuth, requireEditor(), async (req, res) => {
  const { sessionId, book, chapter } = req.body;

  let issues;
  if (sessionId) {
    const sessionData = session.getSession(sessionId);
    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found' });
    }
    issues = sessionData.issues.filter((i) => i.category === 'AUTO_FIX' && i.status === 'pending');
  } else if (book && chapter) {
    issues = Array.from(issueStore.values()).filter(
      (i) =>
        i.book === book &&
        i.chapter === parseInt(chapter) &&
        i.category === 'AUTO_FIX' &&
        i.status === 'pending'
    );
  } else {
    return res.status(400).json({
      error: 'Provide either sessionId or book+chapter',
    });
  }

  // Mark all as resolved
  const resolved = [];
  for (const issue of issues) {
    issue.status = 'resolved';
    issue.action = 'auto-fixed';
    issue.resolvedBy = 'system';
    issue.resolvedAt = new Date().toISOString();
    resolved.push(issue.id);
  }

  res.json({
    success: true,
    autoFixed: resolved.length,
    issueIds: resolved,
  });
});

/**
 * POST /api/issues/report
 * Report a new issue (for contributors)
 *
 * Body:
 *   - book: Book identifier
 *   - chapter: Chapter number
 *   - description: Issue description
 *   - category: Suggested category
 *   - location: File/line reference
 */
router.post('/report', requireAuth, (req, res) => {
  const { book, chapter, description, category, location } = req.body;

  if (!book || !chapter || !description) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['book', 'chapter', 'description'],
    });
  }

  const { v4: uuidv4 } = require('uuid');
  const issueId = uuidv4();

  const issue = {
    id: issueId,
    book,
    chapter: parseInt(chapter),
    description,
    category: category || 'EDITOR_CONFIRM',
    location,
    status: 'pending',
    reportedBy: req.user.id,
    reportedByUsername: req.user.username,
    createdAt: new Date().toISOString(),
  };

  issueStore.set(issueId, issue);

  res.json({
    success: true,
    issue: {
      id: issue.id,
      category: issue.category,
      status: issue.status,
    },
    message: 'Issue reported and queued for review',
  });
});

// Helper functions

function getAvailableActions(issue, user) {
  const actions = [];

  if (issue.status !== 'pending') {
    return actions;
  }

  // Auto-fix issues can be applied
  if (issue.category === 'AUTO_FIX') {
    actions.push({
      action: 'accept',
      description: 'Apply auto-fix',
    });
    actions.push({
      action: 'reject',
      description: 'Skip this fix',
    });
  }

  // Editor confirm issues
  if (issue.category === 'EDITOR_CONFIRM') {
    actions.push({
      action: 'accept',
      description: 'Accept suggestion',
    });
    actions.push({
      action: 'modify',
      description: 'Accept with modification',
    });
    actions.push({
      action: 'reject',
      description: 'Reject suggestion',
    });
  }

  // Board review issues (head editor or admin only)
  if (issue.category === 'BOARD_REVIEW' && (user.role === 'head-editor' || user.role === 'admin')) {
    actions.push({
      action: 'accept',
      description: 'Approve for localization',
    });
    actions.push({
      action: 'reject',
      description: 'Keep original',
    });
    actions.push({
      action: 'escalate',
      description: 'Escalate to editorial board',
    });
  }

  // Blocked issues
  if (issue.category === 'BLOCKED') {
    actions.push({
      action: 'resolve',
      description: 'Mark as resolved with explanation',
    });
    actions.push({
      action: 'escalate',
      description: 'Escalate for manual handling',
    });
  }

  return actions;
}

// Export the issue store for use by other modules
module.exports = router;
module.exports.issueStore = issueStore;
