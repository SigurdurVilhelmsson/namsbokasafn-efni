/**
 * analyticsService — first coverage (batch 4). The service previously
 * opened the production DB at require() time with no injection seam, so
 * it was untestable. Pins the read round-trip and getStats shape.
 *
 * The service writes nothing since the public event route was retired
 * ([USER] 2026-11-22; analyticsWriteRetired.test.js), so the rows here are
 * planted the way the retired route stored them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration005 = require('../migrations/005-feedback');
const analytics = require('../services/analyticsService');

let db;

/** One row as the retired POST /api/analytics/event stored it. */
function plant({ eventType, book = null, sessionId = null }) {
  return db
    .prepare(
      `INSERT INTO analytics_events (event_type, book, session_id, metadata) VALUES (?, ?, ?, '{}')`
    )
    .run(eventType, book, sessionId).lastInsertRowid;
}

beforeEach(() => {
  db = new Database(':memory:');
  migration005.up(db);
  analytics._setTestDb(db);
});

afterEach(() => {
  analytics._setTestDb(null);
  db.close();
});

describe('analyticsService with injected DB', () => {
  it('getRecentEvents returns a stored row', () => {
    const id = plant({ eventType: 'page_view', book: 'efnafraedi-2e', sessionId: 'prufa-session' });
    const recent = analytics.getRecentEvents(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ id, eventType: 'page_view', book: 'efnafraedi-2e' });
  });

  it('getStats aggregates by type for the period', () => {
    plant({ eventType: 'page_view', sessionId: 's1' });
    plant({ eventType: 'chapter_view', book: 'efnafraedi-2e', sessionId: 's1' });
    const stats = analytics.getStats('-1 day');
    expect(stats.byType.page_view).toBe(1);
    expect(stats.byType.chapter_view).toBe(1);
    expect(stats.uniqueSessions).toBe(1);
  });
});
