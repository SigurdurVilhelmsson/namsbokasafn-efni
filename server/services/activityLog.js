/**
 * Activity Log Service
 *
 * Tracks all editorial actions for audit purposes.
 * Provides a complete history of who did what and when.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');
const resolveDbPath = require('../lib/dbPath');

// Database path
const DB_PATH = resolveDbPath();

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
  FILE_UPLOADED: 'file_uploaded',
  WORKFLOW_GIT_COMMIT: 'workflow_git_commit',

  // Segment editor actions
  SEGMENT_EDIT_SAVED: 'segment_edit_saved',
  SEGMENT_EDIT_APPROVED: 'segment_edit_approved',
  SEGMENT_EDIT_REJECTED: 'segment_edit_rejected',
  SEGMENT_EDIT_DISCUSS: 'segment_edit_discuss',
  SEGMENT_EDITS_APPLIED: 'segment_edits_applied',
  SEGMENT_EDIT_REOPENED: 'segment_edit_reopened',

  // Localization suggestion actions
  SUGGESTIONS_SCANNED: 'suggestions_scanned',
  SUGGESTION_ACCEPTED: 'suggestion_accepted',
  SUGGESTION_REJECTED: 'suggestion_rejected',
  SUGGESTION_MODIFIED: 'suggestion_modified',
  SUGGESTIONS_BULK_REVIEWED: 'suggestions_bulk_reviewed',
  SUGGESTIONS_SYNCED: 'suggestions_synced',
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

function initStatements(db) {
  return {
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
    // Chapter compare uses CAST(... AS INTEGER), not TEXT: better-sqlite3 binds
    // plain JS numbers as REAL, so a raw-number chapter (e.g. admin.js
    // assign/unassign passing chapterNum) lands in this TEXT-affinity column
    // as "1.0", not "1" (verified empirically — SQLite's REAL→TEXT affinity
    // conversion appends the decimal). CAST(x AS TEXT) can't reconcile "1.0"
    // with "1"; CAST(x AS INTEGER) normalizes both storage shapes (and the
    // String()-wrapped "1"/"-1" rows everywhere else) to the same integer.
    //
    // The GLOB numeric guard (chapter GLOB '-[0-9]*' OR chapter GLOB '[0-9]*')
    // is required because CAST('' AS INTEGER) = 0 and CAST('garbage' AS
    // INTEGER) = 0 too — without it, a chapter=0 filter would false-positive
    // on empty-string chapter rows (real write path: segment-editor.js writes
    // `chapter: String(edit?.chapter || '')` on failed-lookup edges), and
    // chapter 0 (front matter) is a real, selectable chapter in this project.
    // AND binds tighter than OR, so this groups as
    // (numeric match AND is-numeric-string) OR (omitted-filter bypass) —
    // verified empirically against '1.0', '-1', '0.0', '0', and '' rows.
    search: db.prepare(`
      SELECT * FROM activity_log
      WHERE (book = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (user_id = ? OR ? IS NULL)
        AND (CAST(chapter AS INTEGER) = CAST(? AS INTEGER) AND (chapter GLOB '-[0-9]*' OR chapter GLOB '[0-9]*') OR ? IS NULL)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),
    count: db.prepare(`
      SELECT COUNT(*) as count FROM activity_log
      WHERE (book = ? OR ? IS NULL)
        AND (type = ? OR ? IS NULL)
        AND (user_id = ? OR ? IS NULL)
        AND (CAST(chapter AS INTEGER) = CAST(? AS INTEGER) AND (chapter GLOB '-[0-9]*' OR chapter GLOB '[0-9]*') OR ? IS NULL)
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
 * Log an activity. NEVER throws (design D1, batch 4): the mutation that
 * triggered an audit write must not fail over its audit record. On any
 * failure this pino-logs 'Activity log write failed' and returns null —
 * the error log is the fail-loud channel for a broken audit trail.
 */
function log(options) {
  try {
    const {
      type,
      userId,
      username,
      book = null,
      chapter = null,
      section = null,
      description,
      metadata = {},
    } = options;

    const result = stmts().insert.run(
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
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    // The destructuring above is inside this try, so `options` itself may be
    // null/undefined here (never-throw contract, batch 4 D1) — options?.x is
    // safe in that case and just yields undefined for the log context.
    logger.error(
      { err, type: options?.type, book: options?.book, userId: options?.userId },
      'Activity log write failed'
    );
    return null;
  }
}

/**
 * Get recent activity
 */
function getRecent(limit = 50) {
  const rows = stmts().getRecent.all(Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by user
 */
function getByUser(userId, limit = 50) {
  const rows = stmts().getByUser.all(userId, Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by book
 */
function getByBook(book, limit = 50) {
  const rows = stmts().getByBook.all(book, Math.min(limit, 200));
  return rows.map(parseRow);
}

/**
 * Get activity by section
 */
function getBySection(book, chapter, section, limit = 50) {
  const rows = stmts().getBySection.all(book, chapter, section, Math.min(limit, 200));
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
    chapter = null,
    limit = 50,
    offset = 0,
  } = options;
  const chapterText = chapter == null ? null : String(chapter);

  const rows = stmts().search.all(
    book,
    book,
    type,
    type,
    userId,
    userId,
    chapterText,
    chapterText,
    Math.min(limit, 200),
    offset
  );

  const countResult = stmts().count.get(
    book,
    book,
    type,
    type,
    userId,
    userId,
    chapterText,
    chapterText
  );

  return {
    activities: rows.map(parseRow),
    total: countResult.count,
    limit,
    offset,
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
    createdAt: row.created_at,
  };
}

module.exports = {
  ACTIVITY_TYPES,
  log,
  getRecent,
  getByUser,
  getByBook,
  getBySection,
  search,
  _setTestDb,
};
