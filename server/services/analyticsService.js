/**
 * Analytics Service
 *
 * Reads the analytics events the reader once sent to the public route POST /api/analytics/event, for the statistics
 * tab of /admin. That route and every write helper here are retired ([USER] 2026-11-22; the G1.15(b) final review's
 * I-1): from 2029 a row written after 2028 would have raised the editorial retention script's continued-use refusal.
 * The stored rows stay until retention step 1 deletes them (server/lib/editorialRetentionScope.js), and
 * analyticsWriteRetired.test.js holds that no server code writes the table.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const resolveDbPath = require('../lib/dbPath');

// Database path
const DB_PATH = resolveDbPath();

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
    getRecent: db.prepare(`
      SELECT * FROM analytics_events
      ORDER BY created_at DESC
      LIMIT ?
    `),
    getByType: db.prepare(`
      SELECT * FROM analytics_events
      WHERE event_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    getByBook: db.prepare(`
      SELECT * FROM analytics_events
      WHERE book = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),
    countByType: db.prepare(`
      SELECT event_type, COUNT(*) as count FROM analytics_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event_type
    `),
    countByBook: db.prepare(`
      SELECT book, COUNT(*) as count FROM analytics_events
      WHERE event_type = 'chapter_view' AND created_at >= datetime('now', ?)
      GROUP BY book
    `),
    countByChapter: db.prepare(`
      SELECT book, chapter, COUNT(*) as count FROM analytics_events
      WHERE event_type IN ('chapter_view', 'section_view') AND created_at >= datetime('now', ?)
      GROUP BY book, chapter
      ORDER BY count DESC
    `),
    countUniqueSessions: db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count FROM analytics_events
      WHERE created_at >= datetime('now', ?)
    `),
    dailyPageViews: db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count FROM analytics_events
      WHERE event_type IN ('page_view', 'chapter_view', 'section_view')
        AND created_at >= datetime('now', ?)
      GROUP BY date(created_at)
      ORDER BY date
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
 * Get recent events
 */
function getRecentEvents(limit = 100) {
  const rows = stmts().getRecent.all(Math.min(limit, 1000));
  return rows.map(parseRow);
}

/**
 * Get statistics for a time period
 * @param {string} period - '-1 day', '-7 days', '-30 days'
 */
function getStats(period = '-7 days') {
  const byType = stmts().countByType.all(period);
  const byBook = stmts().countByBook.all(period);
  const byChapter = stmts().countByChapter.all(period);
  const uniqueSessions = stmts().countUniqueSessions.get(period);
  const dailyViews = stmts().dailyPageViews.all(period);

  return {
    period,
    byType: byType.reduce((acc, row) => {
      acc[row.event_type] = row.count;
      return acc;
    }, {}),
    byBook: byBook.reduce((acc, row) => {
      if (row.book) acc[row.book] = row.count;
      return acc;
    }, {}),
    topChapters: byChapter.slice(0, 10).map((row) => ({
      book: row.book,
      chapter: row.chapter,
      views: row.count,
    })),
    uniqueSessions: uniqueSessions.count,
    dailyViews: dailyViews.map((row) => ({
      date: row.date,
      views: row.count,
    })),
    totalPageViews: byType.reduce((sum, row) => {
      if (['page_view', 'chapter_view', 'section_view'].includes(row.event_type)) {
        return sum + row.count;
      }
      return sum;
    }, 0),
  };
}

/**
 * Parse event row
 */
function parseRow(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    userAgent: row.user_agent,
    referrer: row.referrer,
    sessionId: row.session_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: row.created_at,
  };
}

module.exports = {
  getRecentEvents,
  getStats,
  // Test helpers
  _setTestDb,
};
