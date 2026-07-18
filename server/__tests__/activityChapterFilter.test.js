/**
 * F12 server half (item 16 PR1): the chapter activity panel sends
 * ?chapter=N, but search() had no chapter predicate — the panel silently
 * showed whole-book activity. Chapter compare is CAST(chapter AS TEXT) = ?
 * with String() coercion so number/string storage both match (I14-R7:
 * appendices rows store String(-1)).
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
    expect(all.total).toBe(2);
  });

  it('route destructures chapter and forwards it', () => {
    const src = fs.readFileSync(require.resolve('../routes/activity.js'), 'utf8');
    expect(src).toMatch(/const\s*\{\s*book,\s*type,\s*user,\s*chapter\b/);
    expect(src).toMatch(/chapter:\s*chapter\s*\|\|\s*null/);
  });
});
