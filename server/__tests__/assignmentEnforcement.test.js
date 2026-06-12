/**
 * Chapter-assignment enforcement (Unit 3, feat/assignment-enforcement).
 *
 * Verifies userService.hasChapterAccess under the per-book `enforce_assignments`
 * toggle: legacy fail-open when OFF, default-deny when ON, and fail-closed
 * (throws ASSIGNMENT_TABLE_UNAVAILABLE) when enforcement is on but the
 * assignment table is missing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const userService = require('../services/userService');

const BOOK = 'testbook';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_username TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor'
    );
    CREATE TABLE user_chapter_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_slug TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      assigned_by TEXT,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_slug, chapter)
    );
    CREATE TABLE book_settings (
      book TEXT PRIMARY KEY,
      enforce_localization_review INTEGER NOT NULL DEFAULT 0,
      enforce_assignments INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

describe('userService assignment enforcement', () => {
  let db;
  let editorId;

  beforeEach(() => {
    db = createDb();
    userService._setTestDb(db);
    const info = db
      .prepare(`INSERT INTO users (provider_username, role) VALUES ('editorA', 'editor')`)
      .run();
    editorId = info.lastInsertRowid;
    // editorA is assigned chapters 1 and 2 only
    const assign = db.prepare(
      `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter) VALUES (?, ?, ?)`
    );
    assign.run(editorId, BOOK, 1);
    assign.run(editorId, BOOK, 2);
  });

  afterEach(() => {
    userService._setTestDb(null);
    db.close();
  });

  it('toggle round-trips and defaults OFF', () => {
    expect(userService.isAssignmentEnforced(BOOK)).toBe(false);
    expect(userService.setAssignmentEnforced(BOOK, true)).toBe(true);
    expect(userService.isAssignmentEnforced(BOOK)).toBe(true);
    expect(userService.setAssignmentEnforced(BOOK, false)).toBe(false);
  });

  describe('enforcement OFF (legacy fail-open)', () => {
    it('a user with NO assignments can access any chapter', () => {
      const other = db
        .prepare(`INSERT INTO users (provider_username, role) VALUES ('editorB', 'editor')`)
        .run().lastInsertRowid;
      expect(userService.hasChapterAccess(other, BOOK, 5)).toBe(true);
    });

    it('a user WITH assignments is limited to those chapters', () => {
      expect(userService.hasChapterAccess(editorId, BOOK, 1)).toBe(true);
      expect(userService.hasChapterAccess(editorId, BOOK, 5)).toBe(false);
    });
  });

  describe('enforcement ON (default-deny)', () => {
    beforeEach(() => {
      userService.setAssignmentEnforced(BOOK, true);
    });

    it('an assigned editor can edit only assigned chapters', () => {
      expect(userService.hasChapterAccess(editorId, BOOK, 1)).toBe(true);
      expect(userService.hasChapterAccess(editorId, BOOK, 2)).toBe(true);
      expect(userService.hasChapterAccess(editorId, BOOK, 5)).toBe(false);
    });

    it('a user with NO assignments is denied (default-deny, not fail-open)', () => {
      const other = db
        .prepare(`INSERT INTO users (provider_username, role) VALUES ('editorB', 'editor')`)
        .run().lastInsertRowid;
      expect(userService.hasChapterAccess(other, BOOK, 1)).toBe(false);
    });

    it('only the toggled book is affected', () => {
      // Another book with no enforcement keeps legacy fail-open
      const other = db
        .prepare(`INSERT INTO users (provider_username, role) VALUES ('editorB', 'editor')`)
        .run().lastInsertRowid;
      expect(userService.hasChapterAccess(other, 'otherbook', 9)).toBe(true);
    });

    it('fails closed when the assignment table is missing', () => {
      db.exec('DROP TABLE user_chapter_assignments');
      try {
        userService.hasChapterAccess(editorId, BOOK, 1);
        throw new Error('expected hasChapterAccess to throw');
      } catch (err) {
        expect(err.code).toBe('ASSIGNMENT_TABLE_UNAVAILABLE');
      }
    });
  });
});
