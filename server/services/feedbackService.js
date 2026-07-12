/**
 * Feedback Service
 *
 * Handles feedback collection from pilot users (teachers, students).
 * Provides storage, retrieval, and admin management of feedback.
 *
 * Feedback types:
 * - translation_error: Villa i thyðingu
 * - technical_issue: Tæknilegt vandamál
 * - improvement: Tillaga að bætingu
 * - other: Annað
 *
 * Statuses:
 * - open: New, unaddressed feedback
 * - in_progress: Being worked on
 * - resolved: Fixed/addressed
 * - wont_fix: Closed without action (documented)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const resolveDbPath = require('../lib/dbPath');

// Database path
const DB_PATH = resolveDbPath();

// Feedback types with Icelandic labels
const FEEDBACK_TYPES = {
  TRANSLATION_ERROR: 'translation_error',
  TECHNICAL_ISSUE: 'technical_issue',
  IMPROVEMENT: 'improvement',
  OTHER: 'other',
};

const FEEDBACK_TYPE_LABELS = {
  [FEEDBACK_TYPES.TRANSLATION_ERROR]: 'Villa í þýðingu',
  [FEEDBACK_TYPES.TECHNICAL_ISSUE]: 'Tæknilegt vandamál',
  [FEEDBACK_TYPES.IMPROVEMENT]: 'Tillaga að bætingu',
  [FEEDBACK_TYPES.OTHER]: 'Annað',
};

// Feedback statuses
const FEEDBACK_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  WONT_FIX: 'wont_fix',
};

const FEEDBACK_STATUS_LABELS = {
  [FEEDBACK_STATUSES.OPEN]: 'Opið',
  [FEEDBACK_STATUSES.IN_PROGRESS]: 'Í vinnslu',
  [FEEDBACK_STATUSES.RESOLVED]: 'Leyst',
  [FEEDBACK_STATUSES.WONT_FIX]: 'Verður ekki lagað',
};

// Priority levels
const PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
};

const PRIORITY_LABELS = {
  [PRIORITIES.LOW]: 'Lág',
  [PRIORITIES.NORMAL]: 'Venjuleg',
  [PRIORITIES.HIGH]: 'Há',
  [PRIORITIES.CRITICAL]: 'Mjög há',
};

let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
  _stmts = null; // statements must be rebuilt against the new handle
}

let _db;
function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

function initStatements(database) {
  return {
    insert: database.prepare(`
      INSERT INTO feedback (type, book, chapter, section, message, user_email, user_name, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getById: database.prepare(`
      SELECT * FROM feedback WHERE id = ?
    `),
    search: database.prepare(`
      SELECT * FROM feedback
      WHERE (status = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (book = ? OR ? IS NULL)
        AND (priority = ? OR ? IS NULL)
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `),
    count: database.prepare(`
      SELECT COUNT(*) as count FROM feedback
      WHERE (status = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (book = ? OR ? IS NULL)
        AND (priority = ? OR ? IS NULL)
    `),
    countByStatus: database.prepare(`
      SELECT status, COUNT(*) as count FROM feedback GROUP BY status
    `),
    countByType: database.prepare(`
      SELECT type, COUNT(*) as count FROM feedback GROUP BY type
    `),
    updateStatus: database.prepare(`
      UPDATE feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    resolve: database.prepare(`
      UPDATE feedback
      SET status = 'resolved',
          resolved_by = ?,
          resolved_by_name = ?,
          resolution_notes = ?,
          resolved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),
    setPriority: database.prepare(`
      UPDATE feedback SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    assignTo: database.prepare(`
      UPDATE feedback SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `),
    insertResponse: database.prepare(`
      INSERT INTO feedback_responses (feedback_id, responder_id, responder_name, message, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `),
    getResponses: database.prepare(`
      SELECT * FROM feedback_responses WHERE feedback_id = ? ORDER BY created_at ASC
    `),
    getRecent: database.prepare(`
      SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?
    `),
    getOpen: database.prepare(`
      SELECT * FROM feedback WHERE status IN ('open', 'in_progress')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        created_at DESC
      LIMIT ?
    `),
  };
}

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = initStatements(getDb());
  }
  return _stmts;
}

/**
 * Submit new feedback (public endpoint)
 */
function submitFeedback(options) {
  const {
    type,
    book = null,
    chapter = null,
    section = null,
    message,
    userEmail = null,
    userName = null,
    priority = PRIORITIES.NORMAL,
  } = options;

  // Validate type
  if (!Object.values(FEEDBACK_TYPES).includes(type)) {
    throw new Error(`Invalid feedback type: ${type}`);
  }

  // Validate required fields
  if (!message || message.trim().length < 10) {
    throw new Error('Message must be at least 10 characters');
  }

  const result = stmts().insert.run(
    type,
    book,
    chapter,
    section,
    message.trim(),
    userEmail,
    userName,
    priority
  );

  return {
    id: result.lastInsertRowid,
    type,
    book,
    chapter,
    section,
    message: message.trim(),
    userEmail,
    userName,
    status: FEEDBACK_STATUSES.OPEN,
    priority,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get feedback by ID
 */
function getFeedback(id) {
  const row = stmts().getById.get(id);
  if (!row) return null;

  const feedback = parseRow(row);
  feedback.responses = getResponses(id);
  return feedback;
}

/**
 * Search feedback with filters
 */
function searchFeedback(options = {}) {
  const {
    status = null,
    type = null,
    book = null,
    priority = null,
    limit = 50,
    offset = 0,
  } = options;

  const rows = stmts().search.all(
    status,
    status,
    type,
    type,
    book,
    book,
    priority,
    priority,
    Math.min(limit, 200),
    offset
  );

  const countResult = stmts().count.get(status, status, type, type, book, book, priority, priority);

  return {
    items: rows.map(parseRow),
    total: countResult.count,
    limit,
    offset,
  };
}

/**
 * Get open/in-progress feedback
 */
function getOpenFeedback(limit = 100) {
  const rows = stmts().getOpen.all(limit);
  return rows.map(parseRow);
}

/**
 * Get recent feedback
 */
function getRecentFeedback(limit = 20) {
  const rows = stmts().getRecent.all(limit);
  return rows.map(parseRow);
}

/**
 * Get statistics
 */
function getStats() {
  const byStatus = stmts().countByStatus.all();
  const byType = stmts().countByType.all();

  return {
    byStatus: byStatus.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    byType: byType.reduce((acc, row) => {
      acc[row.type] = row.count;
      return acc;
    }, {}),
    total: byStatus.reduce((sum, row) => sum + row.count, 0),
    open: byStatus.find((r) => r.status === 'open')?.count || 0,
    inProgress: byStatus.find((r) => r.status === 'in_progress')?.count || 0,
  };
}

/**
 * Update feedback status
 */
function updateStatus(id, status) {
  if (!Object.values(FEEDBACK_STATUSES).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const result = stmts().updateStatus.run(status, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Resolve feedback
 */
function resolveFeedback(id, userId, userName, notes) {
  const result = stmts().resolve.run(userId, userName, notes || null, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Set priority
 */
function setPriority(id, priority) {
  if (!Object.values(PRIORITIES).includes(priority)) {
    throw new Error(`Invalid priority: ${priority}`);
  }

  const result = stmts().setPriority.run(priority, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Assign feedback to user
 */
function assignFeedback(id, assigneeId) {
  const result = stmts().assignTo.run(assigneeId, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Add response to feedback
 */
function addResponse(feedbackId, responderId, responderName, message, isInternal = false) {
  if (!message || message.trim().length < 1) {
    throw new Error('Response message is required');
  }

  const result = stmts().insertResponse.run(
    feedbackId,
    responderId,
    responderName,
    message.trim(),
    isInternal ? 1 : 0
  );

  return {
    id: result.lastInsertRowid,
    feedbackId,
    responderId,
    responderName,
    message: message.trim(),
    isInternal,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get responses for feedback
 */
function getResponses(feedbackId) {
  const rows = stmts().getResponses.all(feedbackId);
  return rows.map(parseResponseRow);
}

/**
 * Parse feedback row
 */
function parseRow(row) {
  return {
    id: row.id,
    type: row.type,
    typeLabel: FEEDBACK_TYPE_LABELS[row.type] || row.type,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    message: row.message,
    userEmail: row.user_email,
    userName: row.user_name,
    status: row.status,
    statusLabel: FEEDBACK_STATUS_LABELS[row.status] || row.status,
    priority: row.priority,
    priorityLabel: PRIORITY_LABELS[row.priority] || row.priority,
    assignedTo: row.assigned_to,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by_name,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Parse response row
 */
function parseResponseRow(row) {
  return {
    id: row.id,
    feedbackId: row.feedback_id,
    responderId: row.responder_id,
    responderName: row.responder_name,
    message: row.message,
    isInternal: row.is_internal === 1,
    createdAt: row.created_at,
  };
}

module.exports = {
  // Constants
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  // Functions
  submitFeedback,
  getFeedback,
  searchFeedback,
  getOpenFeedback,
  getRecentFeedback,
  getStats,
  updateStatus,
  resolveFeedback,
  setPriority,
  assignFeedback,
  addResponse,
  getResponses,
  // Test helpers
  _setTestDb,
};
