/**
 * F12 server half (item 16 PR1): the chapter activity panel sends
 * ?chapter=N, but search() had no chapter predicate — the panel silently
 * showed whole-book activity. Chapter compare is
 * `CAST(chapter AS INTEGER) = CAST(? AS INTEGER)`, not TEXT: better-sqlite3
 * binds plain JS numbers as REAL, so a raw-number chapter write (e.g.
 * admin.js assign/unassign passing a bare `chapterNum`) lands in this
 * TEXT-affinity column as "1.0", not "1" — CAST(...AS TEXT) can't reconcile
 * "1.0" with "1", but CAST(...AS INTEGER) normalizes both storage shapes
 * (and the String()-wrapped "1"/"-1" rows everywhere else, incl. I14-R7's
 * appendices String(-1)) to the same integer. A GLOB numeric guard
 * (`chapter GLOB '-[0-9]*' OR chapter GLOB '[0-9]*'`) is ANDed in because
 * CAST('' AS INTEGER) and CAST('garbage' AS INTEGER) both evaluate to 0 —
 * without the guard, a chapter=0 filter (front matter is a real chapter)
 * would false-positive on empty-string chapter rows (segment-editor.js
 * writes `chapter: String(edit?.chapter || '')` on failed-lookup edges).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'actchapter-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const BOOK = 'synthetic-actfilter-book';
let activityLog;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  activityLog = require('../services/activityLog');

  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'u1',
    username: 'ed1',
    book: BOOK,
    chapter: 1,
    description: 'ch1 edit',
  });
  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'u1',
    username: 'ed1',
    book: BOOK,
    chapter: '2',
    description: 'ch2 edit',
  });
  // Edge-case write: segment-editor.js writes `chapter: String(edit?.chapter
  // || '')` when the referenced edit lookup misses, producing chapter: ''.
  activityLog.log({
    type: 'segment_edit_deleted',
    userId: 'u1',
    username: 'ed1',
    book: BOOK,
    chapter: '',
    description: 'edge-case empty chapter',
  });
  // Genuine chapter-0 row (front matter) — must NOT be shadowed by the
  // empty-string edge case above under a chapter=0 filter.
  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'u1',
    username: 'ed1',
    book: BOOK,
    chapter: 0,
    description: 'ch0 edit',
  });
  // Appendix row: chapter -1 is the DB/route dialect (I14-R7); 'appendices'
  // is the on-URL dialect the client sends (item 14 convention).
  activityLog.log({
    type: 'segment_edit_saved',
    userId: 'u1',
    username: 'ed1',
    book: BOOK,
    chapter: -1,
    description: 'appendix edit',
  });
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('activityLog.search chapter filter (F12)', () => {
  it('filters by chapter regardless of number/string storage', () => {
    const asNumber = activityLog.search({ book: BOOK, chapter: 1 });
    expect(asNumber.activities.map((a) => a.description)).toEqual(['ch1 edit']);
    expect(asNumber.total).toBe(1);

    const asString = activityLog.search({ book: BOOK, chapter: '2' });
    expect(asString.activities.map((a) => a.description)).toEqual(['ch2 edit']);
  });

  it('omitting chapter returns all book rows (unchanged behavior)', () => {
    const all = activityLog.search({ book: BOOK });
    expect(all.total).toBe(5);
  });

  it('chapter=0 filter excludes empty-string edge-case rows (Important fix)', () => {
    const result = activityLog.search({ book: BOOK, chapter: 0 });
    expect(result.activities.map((a) => a.description)).toEqual(['ch0 edit']);
    expect(result.total).toBe(1);
  });

  it('route destructures chapter and forwards it', () => {
    const src = fs.readFileSync(require.resolve('../routes/activity.js'), 'utf8');
    expect(src).toMatch(/const\s*\{\s*book,\s*type,\s*user,\s*chapter\b/);
    expect(src).toMatch(/chapter:\s*chapter\s*\|\|\s*null/);
  });

  it("chapter='appendices' maps to chapter -1 (Minor fix)", () => {
    const result = activityLog.search({ book: BOOK, chapter: 'appendices' });
    expect(result.activities.map((a) => a.description)).toEqual(['appendix edit']);
    expect(result.total).toBe(1);
  });

  it('non-numeric, non-appendices chapter param matches nothing (not ch0)', () => {
    const result = activityLog.search({ book: BOOK, chapter: 'abc' });
    expect(result.activities).toEqual([]);
    expect(result.total).toBe(0);
  });
});
