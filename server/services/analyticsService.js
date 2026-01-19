/**
 * Analytics Service
 *
 * Simple server-side analytics tracking for the pilot.
 * Tracks page views and events without requiring user login.
 *
 * Privacy-conscious design:
 * - No personal identifiers stored
 * - Session IDs are random UUIDs (not tied to users)
 * - User agent stored for browser stats only
 * - No cookies set by this service
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Event types
const EVENT_TYPES = {
  PAGE_VIEW: 'page_view',
  CHAPTER_VIEW: 'chapter_view',
  SECTION_VIEW: 'section_view',
  FEEDBACK_SUBMIT: 'feedback_submit',
  ERROR: 'error',
  SEARCH: 'search',
  DOWNLOAD: 'download'
};

// Initialize database tables
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create analytics_events table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      book TEXT,
      chapter TEXT,
      section TEXT,
      user_agent TEXT,
      referrer TEXT,
      session_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_book ON analytics_events(book);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
  `);

  return db;
}

const db = initDb();

// Prepared statements
const statements = {
  insert: db.prepare(`
    INSERT INTO analytics_events (event_type, book, chapter, section, user_agent, referrer, session_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
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
  `)
};

/**
 * Generate a session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Log an analytics event
 */
function logEvent(options) {
  const {
    eventType,
    book = null,
    chapter = null,
    section = null,
    userAgent = null,
    referrer = null,
    sessionId = null,
    metadata = {}
  } = options;

  const result = statements.insert.run(
    eventType,
    book,
    chapter,
    section,
    userAgent ? userAgent.substring(0, 500) : null, // Limit UA length
    referrer ? referrer.substring(0, 500) : null,
    sessionId,
    JSON.stringify(metadata)
  );

  return {
    id: result.lastInsertRowid,
    eventType,
    book,
    chapter,
    section
  };
}

/**
 * Log a page view
 */
function logPageView(req, book = null, chapter = null, section = null) {
  return logEvent({
    eventType: EVENT_TYPES.PAGE_VIEW,
    book,
    chapter,
    section,
    userAgent: req.get('user-agent'),
    referrer: req.get('referer'),
    sessionId: req.cookies?.sessionId || null
  });
}

/**
 * Log a chapter view
 */
function logChapterView(req, book, chapter) {
  return logEvent({
    eventType: EVENT_TYPES.CHAPTER_VIEW,
    book,
    chapter,
    userAgent: req.get('user-agent'),
    referrer: req.get('referer'),
    sessionId: req.cookies?.sessionId || null
  });
}

/**
 * Log a section view
 */
function logSectionView(req, book, chapter, section) {
  return logEvent({
    eventType: EVENT_TYPES.SECTION_VIEW,
    book,
    chapter,
    section,
    userAgent: req.get('user-agent'),
    referrer: req.get('referer'),
    sessionId: req.cookies?.sessionId || null
  });
}

/**
 * Log an error
 */
function logError(req, errorType, errorMessage) {
  return logEvent({
    eventType: EVENT_TYPES.ERROR,
    userAgent: req.get('user-agent'),
    metadata: { errorType, errorMessage }
  });
}

/**
 * Get recent events
 */
function getRecentEvents(limit = 100) {
  const rows = statements.getRecent.all(Math.min(limit, 1000));
  return rows.map(parseRow);
}

/**
 * Get statistics for a time period
 * @param {string} period - '-1 day', '-7 days', '-30 days'
 */
function getStats(period = '-7 days') {
  const byType = statements.countByType.all(period);
  const byBook = statements.countByBook.all(period);
  const byChapter = statements.countByChapter.all(period);
  const uniqueSessions = statements.countUniqueSessions.get(period);
  const dailyViews = statements.dailyPageViews.all(period);

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
    topChapters: byChapter.slice(0, 10).map(row => ({
      book: row.book,
      chapter: row.chapter,
      views: row.count
    })),
    uniqueSessions: uniqueSessions.count,
    dailyViews: dailyViews.map(row => ({
      date: row.date,
      views: row.count
    })),
    totalPageViews: byType.reduce((sum, row) => {
      if (['page_view', 'chapter_view', 'section_view'].includes(row.event_type)) {
        return sum + row.count;
      }
      return sum;
    }, 0)
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
    createdAt: row.created_at
  };
}

/**
 * Express middleware to log page views
 * Use selectively on routes you want to track
 */
function trackingMiddleware(options = {}) {
  const { book = null, extractFromPath = false } = options;

  return (req, res, next) => {
    // Only track GET requests
    if (req.method !== 'GET') {
      return next();
    }

    let trackBook = book;
    let trackChapter = null;
    let trackSection = null;

    // Extract book/chapter/section from path if requested
    if (extractFromPath) {
      const pathParts = req.path.split('/').filter(Boolean);
      // Expecting patterns like /efnafraedi/kafli/1 or /efnafraedi/1/1-1
      if (pathParts.length >= 1) trackBook = pathParts[0];
      if (pathParts.length >= 2) trackChapter = pathParts[1];
      if (pathParts.length >= 3) trackSection = pathParts[2];
    }

    try {
      if (trackSection) {
        logSectionView(req, trackBook, trackChapter, trackSection);
      } else if (trackChapter) {
        logChapterView(req, trackBook, trackChapter);
      } else {
        logPageView(req, trackBook, trackChapter, trackSection);
      }
    } catch (err) {
      // Don't let analytics errors break the request
      console.error('[Analytics] Error logging event:', err.message);
    }

    next();
  };
}

module.exports = {
  EVENT_TYPES,
  generateSessionId,
  logEvent,
  logPageView,
  logChapterView,
  logSectionView,
  logError,
  getRecentEvents,
  getStats,
  trackingMiddleware
};
