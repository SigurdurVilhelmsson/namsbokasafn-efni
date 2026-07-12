/**
 * analyticsService — first coverage (batch 4). The service previously
 * opened the production DB at require() time with no injection seam, so
 * it was untestable. Pins the basic event round-trip and getStats shape.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration005 = require('../migrations/005-feedback');
const analytics = require('../services/analyticsService');

let db;

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
  it('logEvent inserts a row and getRecentEvents returns it', () => {
    const result = analytics.logEvent({
      eventType: 'page_view',
      book: 'efnafraedi-2e',
      sessionId: 'prufa-session',
    });
    expect(result.id).toBeGreaterThan(0);
    const recent = analytics.getRecentEvents(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].eventType).toBe('page_view');
  });

  it('getStats aggregates by type for the period', () => {
    analytics.logEvent({ eventType: 'page_view', sessionId: 's1' });
    analytics.logEvent({ eventType: 'chapter_view', book: 'efnafraedi-2e', sessionId: 's1' });
    const stats = analytics.getStats('-1 day');
    expect(stats.byType.page_view).toBe(1);
    expect(stats.byType.chapter_view).toBe(1);
    expect(stats.uniqueSessions).toBe(1);
  });
});
