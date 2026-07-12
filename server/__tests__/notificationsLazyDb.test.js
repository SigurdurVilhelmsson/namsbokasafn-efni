/**
 * notifications lazy-DB seam (batch 4, design D4): the service used to
 * open the production DB at require() time (no injection possible).
 * Pins: _setTestDb works, createNotification + getUnreadCount round-trip
 * against an injected migration-040 schema.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration040 = require('../migrations/040-service-table-ownership');
const notifications = require('../services/notifications');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  migration040.up(db);
  notifications._setTestDb(db);
});

afterEach(() => {
  notifications._setTestDb(null);
  db.close();
});

describe('notifications with injected DB', () => {
  it('createNotification writes a row readable via getUnreadCount', async () => {
    await notifications.createNotification({
      userId: '7',
      type: 'review_submitted',
      title: 'Prufa',
      message: 'Prufuskilaboð',
    });
    expect(notifications.getUnreadCount('7')).toBe(1);
    const row = db.prepare('SELECT * FROM notifications WHERE user_id = ?').get('7');
    expect(row.type).toBe('review_submitted');
  });

  it('preferences round-trip against the injected DB', () => {
    const prefs = notifications.setPreferences('7', { reviews: { inApp: false, email: false } });
    expect(prefs.reviews.inApp).toBe(false);
    expect(notifications.getPreferences('7').reviews.email).toBe(false);
  });
});
