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

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Feedback types with Icelandic labels
const FEEDBACK_TYPES = {
  TRANSLATION_ERROR: 'translation_error',
  TECHNICAL_ISSUE: 'technical_issue',
  IMPROVEMENT: 'improvement',
  OTHER: 'other'
};

const FEEDBACK_TYPE_LABELS = {
  [FEEDBACK_TYPES.TRANSLATION_ERROR]: 'Villa í þýðingu',
  [FEEDBACK_TYPES.TECHNICAL_ISSUE]: 'Tæknilegt vandamál',
  [FEEDBACK_TYPES.IMPROVEMENT]: 'Tillaga að bætingu',
  [FEEDBACK_TYPES.OTHER]: 'Annað'
};

// Feedback statuses
const FEEDBACK_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  WONT_FIX: 'wont_fix'
};

const FEEDBACK_STATUS_LABELS = {
  [FEEDBACK_STATUSES.OPEN]: 'Opið',
  [FEEDBACK_STATUSES.IN_PROGRESS]: 'Í vinnslu',
  [FEEDBACK_STATUSES.RESOLVED]: 'Leyst',
  [FEEDBACK_STATUSES.WONT_FIX]: 'Verður ekki lagað'
};

// Priority levels
const PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical'
};

const PRIORITY_LABELS = {
  [PRIORITIES.LOW]: 'Lág',
  [PRIORITIES.NORMAL]: 'Venjuleg',
  [PRIORITIES.HIGH]: 'Há',
  [PRIORITIES.CRITICAL]: 'Mjög há'
};

// Initialize database tables
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables if migration hasn't run
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      book TEXT,
      chapter TEXT,
      section TEXT,
      message TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'normal',
      assigned_to TEXT,
      resolved_by TEXT,
      resolved_by_name TEXT,
      resolution_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
    CREATE INDEX IF NOT EXISTS idx_feedback_book ON feedback(book);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

    CREATE TABLE IF NOT EXISTS feedback_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      responder_id TEXT NOT NULL,
      responder_name TEXT NOT NULL,
      message TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_responses_feedback ON feedback_responses(feedback_id);
  `);

  return db;
}

const db = initDb();

// Prepared statements
const statements = {
  insert: db.prepare(`
    INSERT INTO feedback (type, book, chapter, section, message, user_email, user_name, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare(`
    SELECT * FROM feedback WHERE id = ?
  `),
  search: db.prepare(`
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
  count: db.prepare(`
    SELECT COUNT(*) as count FROM feedback
    WHERE (status = ? OR ? IS NULL)
      AND (type = ? OR ? IS NULL)
      AND (book = ? OR ? IS NULL)
      AND (priority = ? OR ? IS NULL)
  `),
  countByStatus: db.prepare(`
    SELECT status, COUNT(*) as count FROM feedback GROUP BY status
  `),
  countByType: db.prepare(`
    SELECT type, COUNT(*) as count FROM feedback GROUP BY type
  `),
  updateStatus: db.prepare(`
    UPDATE feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
  resolve: db.prepare(`
    UPDATE feedback
    SET status = 'resolved',
        resolved_by = ?,
        resolved_by_name = ?,
        resolution_notes = ?,
        resolved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  setPriority: db.prepare(`
    UPDATE feedback SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
  assignTo: db.prepare(`
    UPDATE feedback SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
  insertResponse: db.prepare(`
    INSERT INTO feedback_responses (feedback_id, responder_id, responder_name, message, is_internal)
    VALUES (?, ?, ?, ?, ?)
  `),
  getResponses: db.prepare(`
    SELECT * FROM feedback_responses WHERE feedback_id = ? ORDER BY created_at ASC
  `),
  getRecent: db.prepare(`
    SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?
  `),
  getOpen: db.prepare(`
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
  `)
};

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
    priority = PRIORITIES.NORMAL
  } = options;

  // Validate type
  if (!Object.values(FEEDBACK_TYPES).includes(type)) {
    throw new Error(`Invalid feedback type: ${type}`);
  }

  // Validate required fields
  if (!message || message.trim().length < 10) {
    throw new Error('Message must be at least 10 characters');
  }

  const result = statements.insert.run(
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
    createdAt: new Date().toISOString()
  };
}

/**
 * Get feedback by ID
 */
function getFeedback(id) {
  const row = statements.getById.get(id);
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
    offset = 0
  } = options;

  const rows = statements.search.all(
    status, status,
    type, type,
    book, book,
    priority, priority,
    Math.min(limit, 200),
    offset
  );

  const countResult = statements.count.get(
    status, status,
    type, type,
    book, book,
    priority, priority
  );

  return {
    items: rows.map(parseRow),
    total: countResult.count,
    limit,
    offset
  };
}

/**
 * Get open/in-progress feedback
 */
function getOpenFeedback(limit = 100) {
  const rows = statements.getOpen.all(limit);
  return rows.map(parseRow);
}

/**
 * Get recent feedback
 */
function getRecentFeedback(limit = 20) {
  const rows = statements.getRecent.all(limit);
  return rows.map(parseRow);
}

/**
 * Get statistics
 */
function getStats() {
  const byStatus = statements.countByStatus.all();
  const byType = statements.countByType.all();

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
    open: byStatus.find(r => r.status === 'open')?.count || 0,
    inProgress: byStatus.find(r => r.status === 'in_progress')?.count || 0
  };
}

/**
 * Update feedback status
 */
function updateStatus(id, status) {
  if (!Object.values(FEEDBACK_STATUSES).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const result = statements.updateStatus.run(status, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Resolve feedback
 */
function resolveFeedback(id, userId, userName, notes) {
  const result = statements.resolve.run(userId, userName, notes || null, id);
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

  const result = statements.setPriority.run(priority, id);
  if (result.changes === 0) {
    throw new Error(`Feedback not found: ${id}`);
  }

  return getFeedback(id);
}

/**
 * Assign feedback to user
 */
function assignFeedback(id, assigneeId) {
  const result = statements.assignTo.run(assigneeId, id);
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

  const result = statements.insertResponse.run(
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
    createdAt: new Date().toISOString()
  };
}

/**
 * Get responses for feedback
 */
function getResponses(feedbackId) {
  const rows = statements.getResponses.all(feedbackId);
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
    resolvedAt: row.resolved_at
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
    createdAt: row.created_at
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
  getResponses
};
