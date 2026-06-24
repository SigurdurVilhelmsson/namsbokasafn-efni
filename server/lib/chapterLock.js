/**
 * Chapter Lock — advisory locking for chapter-level editing coordination.
 *
 * Provides acquire/release/cleanup functions for chapter locks.
 * Locks expire after 2 hours to prevent stale locks from blocking editors.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let _testDb = null;

function _setTestDb(db) {
  _testDb = db;
}

function getDb() {
  if (_testDb) return _testDb;
  return new Database(DB_PATH);
}

function closeDb(db) {
  if (db && db !== _testDb) db.close();
}

/**
 * Acquire an advisory lock on a chapter.
 *
 * @param {string} chapterId - e.g. "efnafraedi-2e-1"
 * @param {string} username
 * @returns {{ ok: boolean, lockedBy?: string, expiresAt?: string }}
 */
function acquireLock(chapterId, username) {
  const db = getDb();
  try {
    const result = db.transaction(() => {
      // Clean expired locks for this chapter
      db.prepare(
        `DELETE FROM chapter_locks WHERE chapter_id = ? AND expires_at < datetime('now')`
      ).run(chapterId);

      // Check for existing lock
      const existing = db
        .prepare(`SELECT locked_by, expires_at FROM chapter_locks WHERE chapter_id = ?`)
        .get(chapterId);

      if (existing) {
        return { ok: false, lockedBy: existing.locked_by, expiresAt: existing.expires_at };
      }

      // Acquire the lock
      db.prepare(
        `INSERT INTO chapter_locks (chapter_id, locked_by, expires_at)
         VALUES (?, ?, datetime('now', '+2 hours'))`
      ).run(chapterId, username);

      return { ok: true };
    })();

    return result;
  } finally {
    closeDb(db);
  }
}

/**
 * Release an advisory lock on a chapter.
 *
 * @param {string} chapterId
 * @param {string} username - if prefixed with 'admin:', skips ownership check
 * @returns {{ ok: boolean, reason?: string }}
 */
function releaseLock(chapterId, username) {
  const db = getDb();
  try {
    let result;

    if (username.startsWith('admin:')) {
      // Admin override — delete regardless of owner
      result = db.prepare(`DELETE FROM chapter_locks WHERE chapter_id = ?`).run(chapterId);
    } else {
      result = db
        .prepare(`DELETE FROM chapter_locks WHERE chapter_id = ? AND locked_by = ?`)
        .run(chapterId, username);
    }

    if (result.changes === 0) {
      return { ok: false, reason: 'not_owner' };
    }

    return { ok: true };
  } finally {
    closeDb(db);
  }
}

/**
 * Remove all expired locks.
 * Call at server startup to clean stale locks.
 *
 * @returns {{ cleaned: number }}
 */
function cleanExpiredLocks() {
  const db = getDb();
  try {
    const result = db.prepare(`DELETE FROM chapter_locks WHERE expires_at < datetime('now')`).run();
    return { cleaned: result.changes };
  } finally {
    closeDb(db);
  }
}

module.exports = { acquireLock, releaseLock, cleanExpiredLocks, _setTestDb };
