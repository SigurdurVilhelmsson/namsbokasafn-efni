/**
 * Migration 039: segment_edits rebuild — partial unique index + 'superseded'.
 *
 * The 008 table-level UNIQUE(book, module_id, segment_id, status, editor_id)
 * made every repeat transition into an occupied status collide (live-reproduced:
 * re-discussing a revised segment surfaced the raw SQLite constraint text in a
 * browser alert). Only the one-pending-per-(segment, editor) invariant is
 * load-bearing; 039 keeps exactly that as a partial unique index and adds
 * 'superseded' to the status vocabulary as the discuss/rejected exit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

const TMP_DB = path.join(os.tmpdir(), `migration-039-${process.pid}.db`);
process.env.SESSIONS_DB_PATH = TMP_DB;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const Database = require('better-sqlite3');
const { runAllMigrations } = require('../services/migrationRunner');

function rm() {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(TMP_DB + s, { force: true });
}

beforeAll(rm);
afterAll(rm);

describe('migration 039 — segment_edits exit-path rebuild', () => {
  let db;

  beforeAll(() => {
    const result = runAllMigrations();
    expect(result.errors).toEqual([]);
    db = new Database(TMP_DB);
  });

  afterAll(() => db?.close());

  it('drops the 5-column UNIQUE and keeps every live column', () => {
    const sql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get().sql;
    expect(sql).not.toContain('UNIQUE(book, module_id, segment_id, status, editor_id)');

    const cols = db
      .prepare(`PRAGMA table_info(segment_edits)`)
      .all()
      .map((c) => c.name);
    for (const col of [
      'id',
      'book',
      'chapter',
      'module_id',
      'segment_id',
      'original_content',
      'edited_content',
      'category',
      'editor_note',
      'status',
      'editor_id',
      'editor_username',
      'reviewer_id',
      'reviewer_username',
      'reviewer_note',
      'created_at',
      'reviewed_at',
      'applied_at',
      'review_id',
    ]) {
      expect(cols).toContain(col);
    }
  });

  it('has the partial unique index on pending plus the five plain indexes', () => {
    const indexes = db.prepare(`PRAGMA index_list(segment_edits)`).all();
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_segment_edits_one_pending');
    expect(indexes.find((i) => i.name === 'idx_segment_edits_one_pending').unique).toBe(1);
    // Partiality: the index DDL carries the WHERE clause.
    const idxSql = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_segment_edits_one_pending'`
      )
      .get().sql;
    expect(idxSql).toContain("WHERE status = 'pending'");
    for (const idx of [
      'idx_segment_edits_module',
      'idx_segment_edits_status',
      'idx_segment_edits_editor',
      'idx_segment_edits_segment',
      'idx_segment_edits_applied',
      'idx_segment_edits_review',
    ]) {
      expect(names).toContain(idx);
    }
  });

  const baseRow = {
    book: 'b',
    chapter: 1,
    module_id: 'm1',
    segment_id: 's1',
    original_content: 'o',
    edited_content: 'e',
    editor_id: 'u1',
    editor_username: 'user1',
  };
  function insert(overrides = {}) {
    const row = { ...baseRow, ...overrides };
    return db
      .prepare(
        `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          status, editor_id, editor_username)
         VALUES (@book, @chapter, @module_id, @segment_id, @original_content,
                 @edited_content, @status, @editor_id, @editor_username)`
      )
      .run(row);
  }

  it("accepts 'superseded' and still rejects unknown statuses", () => {
    expect(() => insert({ status: 'superseded', segment_id: 's-chk' })).not.toThrow();
    expect(() => insert({ status: 'bogus', segment_id: 's-chk2' })).toThrow(/CHECK/);
  });

  it('enforces one pending per (book, module, segment, editor) and nothing else', () => {
    insert({ status: 'pending', segment_id: 's-inv' });
    expect(() => insert({ status: 'pending', segment_id: 's-inv' })).toThrow(/UNIQUE/);
    // Repeat non-pending statuses are now legal (the old constraint blocked these).
    insert({ status: 'rejected', segment_id: 's-inv' });
    expect(() => insert({ status: 'rejected', segment_id: 's-inv' })).not.toThrow();
    expect(() => insert({ status: 'discuss', segment_id: 's-inv' })).not.toThrow();
  });

  it('copies pre-existing rows across the rebuild intact (FK check clean)', () => {
    // runAllMigrations bootstrapped 008 → seeded nothing; verify structural health.
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });

  it('is idempotent — a re-run over the migrated DB is clean', () => {
    const second = runAllMigrations();
    expect(second.errors).toEqual([]);
  });
});

describe('migration 039 — populated-copy against a hand-built pre-039 schema', () => {
  // Pre-039 schema built by hand (not via runAllMigrations) so the copy
  // INSERT..SELECT runs against real seeded rows instead of an empty
  // bootstrap: the 008 DDL (5-column UNIQUE, no 'superseded') plus the 009
  // applied_at column and the 038 review_id column — the exact shape 039
  // meets in production.
  function preMigrationDb() {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE segment_edits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        original_content TEXT NOT NULL,
        edited_content TEXT NOT NULL,
        category TEXT CHECK(category IN (
          'terminology', 'accuracy', 'readability', 'style', 'omission'
        )),
        editor_note TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
          'pending', 'approved', 'rejected', 'discuss'
        )),
        editor_id TEXT NOT NULL,
        editor_username TEXT NOT NULL,
        reviewer_id TEXT,
        reviewer_username TEXT,
        reviewer_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        UNIQUE(book, module_id, segment_id, status, editor_id)
      );
      ALTER TABLE segment_edits ADD COLUMN applied_at DATETIME;
      ALTER TABLE segment_edits ADD COLUMN review_id INTEGER;

      CREATE TABLE module_reviews (
        id INTEGER PRIMARY KEY
      );
    `);
    return db;
  }

  // Three rows, explicit id gaps (1, 5, 9) rather than a contiguous 1,2,3, so
  // the AUTOINCREMENT-sequence assertion below can't pass by accident. Every
  // copyable column gets a distinct, explicitly-chosen value across the set;
  // row id=1 carries every nullable review-cycle column (reviewer_*,
  // reviewed_at, applied_at, review_id) non-null, rows 5 and 9 exercise the
  // null path for those same columns.
  const seedRows = [
    {
      id: 1,
      book: 'efnafraedi-2e',
      chapter: 3,
      module_id: 'm68762',
      segment_id: 'm68762:seg:0',
      original_content: 'Original text A',
      edited_content: 'Edited text A',
      category: 'terminology',
      editor_note: 'note A',
      status: 'approved',
      editor_id: 'u1',
      editor_username: 'ritstjori1',
      reviewer_id: 'r1',
      reviewer_username: 'yfirritstjori1',
      reviewer_note: 'reviewer note A',
      created_at: '2026-01-01 10:00:00',
      reviewed_at: '2026-01-02 11:00:00',
      applied_at: '2026-01-03 12:00:00',
      review_id: 42,
    },
    {
      id: 5,
      book: 'efnafraedi-2e',
      chapter: 4,
      module_id: 'm68770',
      segment_id: 'm68770:seg:1',
      original_content: 'Original text B',
      edited_content: 'Edited text B',
      category: null,
      editor_note: null,
      status: 'pending',
      editor_id: 'u2',
      editor_username: 'ritstjori2',
      reviewer_id: null,
      reviewer_username: null,
      reviewer_note: null,
      created_at: '2026-01-04 09:00:00',
      reviewed_at: null,
      applied_at: null,
      review_id: null,
    },
    {
      id: 9,
      book: 'edlisfraedi-2e',
      chapter: 7,
      module_id: 'm99001',
      segment_id: 'm99001:seg:2',
      original_content: 'Original text C',
      edited_content: 'Edited text C',
      category: 'style',
      editor_note: 'note C',
      status: 'rejected',
      editor_id: 'u3',
      editor_username: 'ritstjori3',
      reviewer_id: 'r2',
      reviewer_username: 'yfirritstjori2',
      reviewer_note: 'reviewer note C',
      created_at: '2026-01-05 08:00:00',
      reviewed_at: '2026-01-06 08:30:00',
      applied_at: null,
      review_id: null,
    },
  ];

  function seed(db) {
    db.prepare(`INSERT INTO module_reviews (id) VALUES (42)`).run();
    const stmt = db.prepare(`
      INSERT INTO segment_edits (
        id, book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, status, editor_id, editor_username, reviewer_id,
        reviewer_username, reviewer_note, created_at, reviewed_at, applied_at, review_id
      ) VALUES (
        @id, @book, @chapter, @module_id, @segment_id, @original_content, @edited_content,
        @category, @editor_note, @status, @editor_id, @editor_username, @reviewer_id,
        @reviewer_username, @reviewer_note, @created_at, @reviewed_at, @applied_at, @review_id
      )
    `);
    for (const row of seedRows) stmt.run(row);
  }

  it('copies every seeded row byte-identical, preserves ids, carries the AUTOINCREMENT sequence, and rebuilds the exit-path constraints', () => {
    const db = preMigrationDb();
    seed(db);

    require('../migrations/039-segment-edit-exit-path').up(db);

    const rows = db.prepare(`SELECT * FROM segment_edits ORDER BY id`).all();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual([1, 5, 9]);
    expect(rows).toEqual(seedRows);

    // AUTOINCREMENT sequence carried across the rebuild: the next auto id is
    // 10 (max seeded id + 1), not 4 (row count + 1) or 1 (fresh table).
    const fresh = db
      .prepare(
        `INSERT INTO segment_edits
         (book, chapter, module_id, segment_id, original_content, edited_content,
          status, editor_id, editor_username)
         VALUES ('efnafraedi-2e', 1, 'm1', 's-fresh', 'o', 'e', 'pending', 'u9', 'ritstjori9')`
      )
      .run();
    expect(Number(fresh.lastInsertRowid)).toBe(10);

    // Old 5-column UNIQUE is gone.
    const sql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='segment_edits'`)
      .get().sql;
    expect(sql).not.toContain('UNIQUE(book, module_id, segment_id, status, editor_id)');

    // A second non-pending row for the same (book, module, segment, editor)
    // now succeeds — the old 5-column UNIQUE used to block this.
    expect(() =>
      db
        .prepare(
          `INSERT INTO segment_edits
           (book, chapter, module_id, segment_id, original_content, edited_content,
            status, editor_id, editor_username)
           VALUES ('efnafraedi-2e', 3, 'm68762', 'm68762:seg:0', 'o2', 'e2', 'rejected', 'u1', 'ritstjori1')`
        )
        .run()
    ).not.toThrow();

    // A second PENDING row for the same tuple still throws — the one
    // load-bearing invariant, now enforced by the partial unique index.
    db.prepare(
      `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        status, editor_id, editor_username)
       VALUES ('efnafraedi-2e', 4, 'm68770', 'm68770:seg:new', 'o3', 'e3', 'pending', 'u4', 'ritstjori4')`
    ).run();
    expect(() =>
      db
        .prepare(
          `INSERT INTO segment_edits
           (book, chapter, module_id, segment_id, original_content, edited_content,
            status, editor_id, editor_username)
           VALUES ('efnafraedi-2e', 4, 'm68770', 'm68770:seg:new', 'o4', 'e4', 'pending', 'u4', 'ritstjori4')`
        )
        .run()
    ).toThrow(/UNIQUE/);
  });
});
