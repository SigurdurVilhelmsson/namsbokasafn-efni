/**
 * Chapter Lock Tests
 *
 * Tests advisory lock acquire/release/cleanup logic using an in-memory DB.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const chapterLock = require('../lib/chapterLock');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE chapter_locks (
      chapter_id TEXT PRIMARY KEY,
      locked_by TEXT NOT NULL,
      locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
  `);
  return db;
}

describe('chapterLock', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    chapterLock._setTestDb(db);
  });

  describe('acquireLock', () => {
    it('succeeds on a fresh chapter', () => {
      const result = chapterLock.acquireLock('efnafraedi-2e-1', 'anna');
      expect(result).toEqual({ ok: true });

      // Verify the lock exists in DB
      const row = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(row.locked_by).toBe('anna');
    });

    it('fails when already locked by someone else', () => {
      chapterLock.acquireLock('efnafraedi-2e-1', 'anna');
      const result = chapterLock.acquireLock('efnafraedi-2e-1', 'jon');

      expect(result.ok).toBe(false);
      expect(result.lockedBy).toBe('anna');
      expect(result.expiresAt).toBeDefined();
    });

    it('succeeds after lock expires', () => {
      // Insert an already-expired lock
      db.prepare(
        `INSERT INTO chapter_locks (chapter_id, locked_by, expires_at)
         VALUES (?, ?, datetime('now', '-1 hour'))`
      ).run('efnafraedi-2e-1', 'anna');

      const result = chapterLock.acquireLock('efnafraedi-2e-1', 'jon');
      expect(result).toEqual({ ok: true });

      const row = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(row.locked_by).toBe('jon');
    });
  });

  describe('releaseLock', () => {
    it('works for the lock owner', () => {
      chapterLock.acquireLock('efnafraedi-2e-1', 'anna');
      const result = chapterLock.releaseLock('efnafraedi-2e-1', 'anna');
      expect(result).toEqual({ ok: true });

      const row = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(row).toBeUndefined();
    });

    it('fails for non-owner', () => {
      chapterLock.acquireLock('efnafraedi-2e-1', 'anna');
      const result = chapterLock.releaseLock('efnafraedi-2e-1', 'jon');
      expect(result).toEqual({ ok: false, reason: 'not_owner' });

      // Lock should still exist
      const row = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(row.locked_by).toBe('anna');
    });

    it('works with admin: prefix override', () => {
      chapterLock.acquireLock('efnafraedi-2e-1', 'anna');
      const result = chapterLock.releaseLock('efnafraedi-2e-1', 'admin:siggi');
      expect(result).toEqual({ ok: true });

      const row = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(row).toBeUndefined();
    });
  });

  describe('cleanExpiredLocks', () => {
    it('removes expired entries', () => {
      // Insert one expired and one active lock
      db.prepare(
        `INSERT INTO chapter_locks (chapter_id, locked_by, expires_at)
         VALUES (?, ?, datetime('now', '-1 hour'))`
      ).run('efnafraedi-2e-1', 'anna');

      db.prepare(
        `INSERT INTO chapter_locks (chapter_id, locked_by, expires_at)
         VALUES (?, ?, datetime('now', '+1 hour'))`
      ).run('efnafraedi-2e-2', 'jon');

      const result = chapterLock.cleanExpiredLocks();
      expect(result).toEqual({ cleaned: 1 });

      // Expired lock gone
      const expired = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-1');
      expect(expired).toBeUndefined();

      // Active lock still present
      const active = db
        .prepare('SELECT * FROM chapter_locks WHERE chapter_id = ?')
        .get('efnafraedi-2e-2');
      expect(active.locked_by).toBe('jon');
    });
  });
});
