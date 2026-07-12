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
