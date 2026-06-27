import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration = require('../migrations/038-segment-edit-review-id');

// Pre-038 schema: segment_edits WITHOUT review_id, plus module_reviews. Mirrors
// the production reality the migration meets — existing rows have no review_id.
function preMigrationDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE segment_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
      segment_id TEXT NOT NULL, original_content TEXT NOT NULL, edited_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      editor_id TEXT NOT NULL, editor_username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE module_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
      submitted_by TEXT, submitted_by_username TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending'
    );
  `);
  return db;
}

function insertEdit(db, moduleId, segmentId, status) {
  return db
    .prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username)
       VALUES ('bk', 1, ?, ?, 'o', 'e', ?, '1', 'ed')`
    )
    .run(moduleId, segmentId, status).lastInsertRowid;
}

function insertReview(db, moduleId, status) {
  return db
    .prepare(
      `INSERT INTO module_reviews (book, chapter, module_id, submitted_by, submitted_by_username, status)
       VALUES ('bk', 1, ?, '1', 'ed', ?)`
    )
    .run(moduleId, status).lastInsertRowid;
}

const reviewIdOf = (db, editId) =>
  db.prepare(`SELECT review_id FROM segment_edits WHERE id = ?`).get(editId).review_id;

describe('migration 038 — review_id column + open-review backfill', () => {
  it('adds the review_id column and index', () => {
    const db = preMigrationDb();
    migration.up(db);
    const cols = db
      .prepare(`PRAGMA table_info(segment_edits)`)
      .all()
      .map((c) => c.name);
    expect(cols).toContain('review_id');
    const idx = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_segment_edits_review'`
      )
      .get();
    expect(idx).toBeTruthy();
  });

  it("backfills an OPEN review's edits, leaves completed-review edits NULL", () => {
    const db = preMigrationDb();
    const openReview = insertReview(db, 'm1', 'pending');
    const e1 = insertEdit(db, 'm1', 'm1:seg:a', 'pending');
    const e2 = insertEdit(db, 'm1', 'm1:seg:b', 'approved');
    const e3rej = insertEdit(db, 'm1', 'm1:seg:c', 'rejected');

    // A different module with a COMPLETED review — must NOT be backfilled.
    insertReview(db, 'm2', 'approved');
    const e4 = insertEdit(db, 'm2', 'm2:seg:a', 'approved');

    migration.up(db);

    expect(reviewIdOf(db, e1)).toBe(openReview);
    expect(reviewIdOf(db, e2)).toBe(openReview);
    expect(reviewIdOf(db, e3rej)).toBeNull(); // rejected edits excluded
    expect(reviewIdOf(db, e4)).toBeNull(); // completed review → no attribution
  });

  it('is idempotent — re-running does not throw and does not re-backfill', () => {
    const db = preMigrationDb();
    insertReview(db, 'm1', 'pending');
    const e1 = insertEdit(db, 'm1', 'm1:seg:a', 'pending');
    migration.up(db);
    const after = reviewIdOf(db, e1);
    // A new edit created later (post-deploy) must NOT be claimed by a second run.
    const e2 = insertEdit(db, 'm1', 'm1:seg:b', 'pending');
    expect(() => migration.up(db)).not.toThrow();
    expect(reviewIdOf(db, e1)).toBe(after);
    expect(reviewIdOf(db, e2)).toBeNull();
  });
});
