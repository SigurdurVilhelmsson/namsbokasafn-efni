/**
 * Dashboard Read Model
 *
 * Single source of truth for all "what's waiting?" counters and lists shown
 * on the home page (`/`) and the inbox (`/yfirferd`). Reads exclusively from
 * `segment_edits` — never from the `module_reviews` wrapper — so an editor's
 * saved edit becomes visible to admins immediately, with no separate "Submit
 * for review" gesture required.
 *
 * Callers: `server/routes/my-work.js`, `server/routes/status.js`,
 * `server/routes/views.js` (`/yfirferd`), and Phase 6 invariant tests.
 *
 * See:
 *   - `docs/audit/2026-05-10-editorial-workflow-audit.md` §4 (F1, F2, F3)
 *   - `docs/plans/2026-05-10-editorial-workflow-redesign-plan.md` Phase 1
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const resolveDbPath = require('../lib/dbPath');

const DB_PATH = resolveDbPath();

let db;
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

function tableExists(conn, name) {
  return !!conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

// =====================================================================
// Global pending queue — what every admin/head-editor needs to act on.
// =====================================================================

/**
 * Pending segment edits across the system, optionally filtered.
 * Reads `segment_edits.status='pending'` directly. No `module_reviews` join.
 *
 * @param {object} [filter]
 * @param {string} [filter.book]    — book slug
 * @param {number} [filter.chapter] — chapter number
 * @param {string} [filter.editor]  — editor_username
 * @param {number} [filter.limit=200]
 * @returns {Array<object>} — newest first
 */
function getGlobalPendingEdits(filter = {}) {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) return [];

  const where = [`status = 'pending'`];
  const params = [];
  if (filter.book) {
    where.push(`book = ?`);
    params.push(filter.book);
  }
  if (filter.chapter != null) {
    where.push(`chapter = ?`);
    params.push(filter.chapter);
  }
  if (filter.editor) {
    where.push(`editor_username = ?`);
    params.push(filter.editor);
  }
  const limit = Math.min(filter.limit || 200, 500);

  const sql = `
    SELECT id, book, chapter, module_id, segment_id, category,
           editor_username, editor_note, created_at,
           CAST((julianday('now') - julianday(created_at)) * 24 AS INTEGER) AS hours_waiting
    FROM segment_edits
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `;
  return conn.prepare(sql).all(...params, limit);
}

/**
 * Single integer for the home-page admin headline tile.
 * @returns {number}
 */
function getAdminHeadlineCount() {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) return 0;
  const row = conn
    .prepare(`SELECT COUNT(*) AS c FROM segment_edits WHERE status = 'pending'`)
    .get();
  return row ? row.c : 0;
}

// =====================================================================
// Per-user queue — what an editor needs to act on personally.
// =====================================================================

/**
 * Rejected or discuss-flagged edits for a specific editor — work they need
 * to revisit. Used by the editor headline tile and `/yfirferd` editor view.
 *
 * @param {string} username — editor_username
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
function getUserActionableEdits(username, limit = 50) {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) return [];

  return conn
    .prepare(
      `SELECT id, book, chapter, module_id, segment_id, status,
              reviewer_username, reviewer_note, reviewed_at
       FROM segment_edits
       WHERE editor_username = ? AND status IN ('rejected', 'discuss')
       ORDER BY reviewed_at DESC
       LIMIT ?`
    )
    .all(username, Math.min(limit, 200));
}

/**
 * Aggregate counts for the editor's three home-page tiles.
 * @param {string} username
 * @returns {{actionable:number, pendingReview:number, completedThisWeek:number}}
 */
function getUserHeadlineCounts(username) {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) {
    return { actionable: 0, pendingReview: 0, completedThisWeek: 0 };
  }

  const actionable = conn
    .prepare(
      `SELECT COUNT(*) AS c FROM segment_edits
       WHERE editor_username = ? AND status IN ('rejected', 'discuss')`
    )
    .get(username).c;

  const pendingReview = conn
    .prepare(
      `SELECT COUNT(*) AS c FROM segment_edits
       WHERE editor_username = ? AND status = 'pending'`
    )
    .get(username).c;

  const completedThisWeek = conn
    .prepare(
      `SELECT COUNT(*) AS c FROM segment_edits
       WHERE editor_username = ? AND status = 'approved'
         AND reviewed_at >= datetime('now', '-7 days')`
    )
    .get(username).c;

  return { actionable, pendingReview, completedThisWeek };
}

// =====================================================================
// Editor workload — for the admin "Vinnuálag yfirlesara" panel.
// =====================================================================

/**
 * Per-editor activity over a rolling window. Powers the previously-broken
 * Vinnuálag panel on the home page.
 *
 * @param {object} [opts]
 * @param {number} [opts.days=7]
 * @returns {Array<{editor:string, active:number, pending:number,
 *   approved:number, rejected:number, oldestPendingHours:number|null}>}
 */
function getEditorWorkload(opts = {}) {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) return [];
  const days = opts.days || 7;

  return conn
    .prepare(
      `SELECT editor_username AS editor,
              COUNT(*) AS active,
              SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              CAST(MAX(
                CASE WHEN status = 'pending'
                  THEN (julianday('now') - julianday(created_at)) * 24
                END
              ) AS INTEGER) AS oldestPendingHours
       FROM segment_edits
       WHERE created_at >= datetime('now', ?)
       GROUP BY editor_username
       ORDER BY active DESC`
    )
    .all(`-${days} days`);
}

// =====================================================================
// Ready to apply — modules where all pending edits are decided AND at
// least one approved edit has not yet been written to disk.
// =====================================================================

/**
 * Modules that have approved edits awaiting `applyApprovedEdits()`.
 * Powers the previously-broken "Tilbúið til úthlutunar" panel.
 *
 * @returns {Array<{book:string, chapter:number, moduleId:string,
 *   approvedCount:number, pendingCount:number}>}
 */
function getReadyToApply() {
  const conn = getDb();
  if (!tableExists(conn, 'segment_edits')) return [];

  return conn
    .prepare(
      `SELECT book, chapter, module_id AS moduleId,
              SUM(CASE WHEN status = 'approved' AND applied_at IS NULL THEN 1 ELSE 0 END) AS approvedCount,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount
       FROM segment_edits
       GROUP BY book, chapter, module_id
       HAVING approvedCount > 0 AND pendingCount = 0
       ORDER BY book, chapter, moduleId`
    )
    .all();
}

// =====================================================================
// Test helper
// =====================================================================

function _setTestDb(testDb) {
  db = testDb;
}

module.exports = {
  getGlobalPendingEdits,
  getAdminHeadlineCount,
  getUserActionableEdits,
  getUserHeadlineCounts,
  getEditorWorkload,
  getReadyToApply,
  _setTestDb,
};
