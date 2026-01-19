/**
 * Activity Log Service
 *
 * Tracks all editorial actions for audit purposes.
 * Provides a complete history of who did what and when.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Activity types
const ACTIVITY_TYPES = {
  // Editor actions
  DRAFT_SAVED: 'draft_saved',
  REVIEW_SUBMITTED: 'review_submitted',
  VERSION_RESTORED: 'version_restored',

  // Review actions
  REVIEW_APPROVED: 'review_approved',
  CHANGES_REQUESTED: 'changes_requested',

  // Git actions
  COMMIT_CREATED: 'commit_created',
  PUSH_COMPLETED: 'push_completed',

  // Workflow actions
  WORKFLOW_STARTED: 'workflow_started',
  WORKFLOW_COMPLETED: 'workflow_completed',
  FILE_UPLOADED: 'file_uploaded'
};

// Initialize database tables
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create activity_log table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      book TEXT,
      chapter TEXT,
      section TEXT,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
    CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_book ON activity_log(book);
    CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
  `);

  return db;
}

const db = initDb();

// Prepared statements
const statements = {
  insert: db.prepare(`
    INSERT INTO activity_log (type, user_id, username, book, chapter, section, description, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRecent: db.prepare(`
    SELECT * FROM activity_log
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getByUser: db.prepare(`
    SELECT * FROM activity_log
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getByBook: db.prepare(`
    SELECT * FROM activity_log
    WHERE book = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getBySection: db.prepare(`
    SELECT * FROM activity_log
    WHERE book = ? AND chapter = ? AND section = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getByType: db.prepare(`
    SELECT * FROM activity_log
    WHERE type = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  search: db.prepare(`
    SELECT * FROM activity_log
    WHERE (book = ? OR ? IS NULL)
      AND (type = ? OR ? IS NULL)
      AND (user_id = ? OR ? IS NULL)
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `),
  count: db.prepare(`
    SELECT COUNT(*) as count FROM activity_log
    WHERE (book = ? OR ? IS NULL)
      AND (type = ? OR ? IS NULL)
      AND (user_id = ? OR ? IS NULL)
  `)
};

/**
 * Log an activity
 */
function log(options) {
  const {
    type,
    userId,
    username,
    book = null,
    chapter = null,
    section = null,
    description,
    metadata = {}
  } = options;

  const result = statements.insert.run(
    type,
    userId,
    username,
    book,
    chapter,
    section,
    description,
    JSON.stringify(metadata)
  );

  return {
    id: result.lastInsertRowid,
    type,
    userId,
    username,
    book,
    chapter,
    section,
    description,
    metadata,
    createdAt: new Date().toISOString()
  };
}

/**
 * Get recent activity
 */
function getRecent(limit = 50) {
  const rows = statements.getRecent.all(Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by user
 */
function getByUser(userId, limit = 50) {
  const rows = statements.getByUser.all(userId, Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by book
 */
function getByBook(book, limit = 50) {
  const rows = statements.getByBook.all(book, Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by section
 */
function getBySection(book, chapter, section, limit = 50) {
  const rows = statements.getBySection.all(book, chapter, section, Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Search activity with filters
 */
function search(options = {}) {
  const {
    book = null,
    type = null,
    userId = null,
    limit = 50,
    offset = 0
  } = options;

  const rows = statements.search.all(
    book, book,
    type, type,
    userId, userId,
    Math.min(limit, 200),
    offset
  );

  const countResult = statements.count.get(
    book, book,
    type, type,
    userId, userId
  );

  return {
    activities: rows.map(parseRow),
    total: countResult.count,
    limit,
    offset
  };
}

/**
 * Parse a database row
 */
function parseRow(row) {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    username: row.username,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    description: row.description,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: row.created_at
  };
}

// Convenience logging functions

/**
 * Log a draft saved event
 */
function logDraftSaved(user, book, chapter, section, historyId) {
  return log({
    type: ACTIVITY_TYPES.DRAFT_SAVED,
    userId: user.id,
    username: user.username,
    book,
    chapter,
    section,
    description: `${user.username} saved a draft of ${book}/${chapter}/${section}`,
    metadata: { historyId }
  });
}

/**
 * Log a review submitted event
 */
function logReviewSubmitted(user, book, chapter, section, reviewId) {
  return log({
    type: ACTIVITY_TYPES.REVIEW_SUBMITTED,
    userId: user.id,
    username: user.username,
    book,
    chapter,
    section,
    description: `${user.username} submitted ${book}/${chapter}/${section} for review`,
    metadata: { reviewId }
  });
}

/**
 * Log a version restored event
 */
function logVersionRestored(user, book, chapter, section, historyId) {
  return log({
    type: ACTIVITY_TYPES.VERSION_RESTORED,
    userId: user.id,
    username: user.username,
    book,
    chapter,
    section,
    description: `${user.username} restored version ${historyId} of ${book}/${chapter}/${section}`,
    metadata: { historyId }
  });
}

/**
 * Log a review approved event
 */
function logReviewApproved(reviewer, submitter, book, chapter, section, reviewId, commitSha) {
  return log({
    type: ACTIVITY_TYPES.REVIEW_APPROVED,
    userId: reviewer.id,
    username: reviewer.username,
    book,
    chapter,
    section,
    description: `${reviewer.username} approved ${submitter}'s review of ${book}/${chapter}/${section}`,
    metadata: { reviewId, submitter, commitSha }
  });
}

/**
 * Log a changes requested event
 */
function logChangesRequested(reviewer, submitter, book, chapter, section, reviewId, notes) {
  return log({
    type: ACTIVITY_TYPES.CHANGES_REQUESTED,
    userId: reviewer.id,
    username: reviewer.username,
    book,
    chapter,
    section,
    description: `${reviewer.username} requested changes on ${submitter}'s review of ${book}/${chapter}/${section}`,
    metadata: { reviewId, submitter, notes }
  });
}

/**
 * Log a commit created event
 */
function logCommitCreated(user, book, chapter, section, commitSha) {
  return log({
    type: ACTIVITY_TYPES.COMMIT_CREATED,
    userId: user.id,
    username: user.username,
    book,
    chapter,
    section,
    description: `Commit ${commitSha.substring(0, 7)} created for ${book}/${chapter}/${section}`,
    metadata: { commitSha }
  });
}

module.exports = {
  ACTIVITY_TYPES,
  log,
  getRecent,
  getByUser,
  getByBook,
  getBySection,
  search,
  // Convenience functions
  logDraftSaved,
  logReviewSubmitted,
  logVersionRestored,
  logReviewApproved,
  logChangesRequested,
  logCommitCreated
};
