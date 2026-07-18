/**
 * Migration 041: localization_pending_edits rebuild (item 13, finding 7).
 * 'superseded' joins the status CHECK; the one-pending invariant becomes
 * per-(book, module, segment, EDITOR) via a partial unique index — two
 * editors may each hold a pending on the same segment; one editor may not
 * hold two. 039-pattern transactional rebuild; idempotent re-run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const m034 = require('../migrations/034-localization-review');
const m041 = require('../migrations/041-localization-pending-per-editor');

const INSERT = `INSERT INTO localization_pending_edits
  (book, chapter, module_id, segment_id, original_content, edited_content,
   status, editor_id, editor_username)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

describe('migration 041', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    m034.up(db);
  });

  afterEach(() => db.close());

  it('preserves legacy rows across the rebuild', () => {
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e1', 'pending', '4', 'editorA');
    db.prepare(INSERT).run('b', 1, 'm1', 's2', 'o', 'e2', 'approved', '4', 'editorA');
    db.prepare(INSERT).run('b', 1, 'm1', 's3', 'o', 'e3', 'rejected', '4', 'editorA');

    m041.up(db);

    const rows = db
      .prepare(
        `SELECT segment_id, status, edited_content FROM localization_pending_edits ORDER BY id`
      )
      .all();
    expect(rows).toEqual([
      { segment_id: 's1', status: 'pending', edited_content: 'e1' },
      { segment_id: 's2', status: 'approved', edited_content: 'e2' },
      { segment_id: 's3', status: 'rejected', edited_content: 'e3' },
    ]);
  });

  it("accepts 'superseded' after the rebuild (CHECK rebuilt)", () => {
    m041.up(db);
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e', 'superseded', '4', 'editorA')
    ).not.toThrow();
  });

  it('unique index: one pending per editor per segment; two editors may coexist', () => {
    m041.up(db);
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA', 'pending', '4', 'editorA');
    // different editor, same segment: allowed
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eB', 'pending', '5', 'editorB')
    ).not.toThrow();
    // same editor, same segment, second pending: blocked
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA2', 'pending', '4', 'editorA')
    ).toThrow(/UNIQUE/);
    // non-pending statuses never collide
    expect(() =>
      db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'eA3', 'superseded', '4', 'editorA')
    ).not.toThrow();
  });

  it('re-run is a no-op (idempotent)', () => {
    db.prepare(INSERT).run('b', 1, 'm1', 's1', 'o', 'e1', 'pending', '4', 'editorA');
    m041.up(db);
    m041.up(db);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM localization_pending_edits`).get().n).toBe(1);
  });
});
