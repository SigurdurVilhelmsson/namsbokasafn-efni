// server/__tests__/retentionHealth.test.js
/**
 * checks.retention in /api/health (G1.15(b) spec §4.6; plan Task 8).
 *
 * Not ok when a step has been due and unrecorded for longer than two backup cycles plus margin, or when a refusal
 * stands. Until 2029 it is ok and nothing is due (Review Focus 5). /api/health is public, so it carries the steps
 * and whether a refusal stands, and never a table, a reason or a count (the security review of 2026-11-21).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { plantAll, insert, pinSeeds } = require('./helpers/retentionPlant.cjs');
const { NAMED_EDITING_RECORDS, effectiveMs } = require('../lib/retentionDates');
const Database = require('better-sqlite3');
const {
  readRetentionHealth,
  createRetentionHealthCache,
  DEFAULT_STALE_HOURS,
  DEFAULT_CACHE_MS,
} = require('../lib/retentionHealth');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const AT = effectiveMs(NAMED_EDITING_RECORDS);
const HOUR = 3600000;

let db;
let file;
beforeEach(() => {
  ({ db, path: file } = freshMigratedDb());
  pinSeeds(db);
  plantAll(db);
});
afterEach(() => {
  if (db.open) db.close();
});

describe('readRetentionHealth', () => {
  it('before 2029 it is ok and nothing is due', () => {
    expect(readRetentionHealth({ db, nowMs: AT - 1 })).toEqual({
      ok: true,
      due: [],
      overdue: [],
      refused: false,
    });
  });

  it('a step due for less than the threshold, with no refusal, is ok', () => {
    expect(readRetentionHealth({ db, nowMs: AT + HOUR })).toEqual({
      ok: true,
      due: ['named'],
      overdue: [],
      refused: false,
    });
  });

  it('a step due and unrecorded for longer than the threshold is not ok', () => {
    const res = readRetentionHealth({ db, nowMs: AT + (DEFAULT_STALE_HOURS + 1) * HOUR });
    expect(res).toMatchObject({ ok: false, due: ['named'], overdue: ['named'] });
  });

  // /api/health is public. A refusal's table or reason would say what the database holds (a later consent record
  // says someone consented), so the check says only that one stands; the script's dry run on the server says which.
  it('a standing refusal is not ok at once, and the check says only that one stands', () => {
    insert(db, 'feedback', {
      type: 'bug',
      message: 'm',
      user_name: 'Late Writer',
      created_at: '2029-02-01 09:00:00',
    });
    const res = readRetentionHealth({ db, nowMs: AT + HOUR });
    expect(res).toEqual({ ok: false, due: ['named'], overdue: [], refused: true });
    expect(JSON.stringify(res)).not.toMatch(/feedback|later-records|rows/);
  });

  it('a recorded step is no longer due', () => {
    db.prepare(
      "INSERT INTO retention_runs (kind, done_at_ms, rows_changed) VALUES ('named', ?, 40)"
    ).run(AT);
    expect(readRetentionHealth({ db, nowMs: AT + 100 * HOUR })).toEqual({
      ok: true,
      due: [],
      overdue: [],
      refused: false,
    });
  });

  it('never throws: a closed handle reports not ok with an error code', () => {
    db.close();
    const res = readRetentionHealth({ db, nowMs: AT + HOUR });
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });

  it("the threshold is two missed cycles of backup-db.sh's cron plus margin, derived from install-cron.sh", () => {
    expect(DEFAULT_STALE_HOURS).toBe(2 * backupCycleHours() + 2);
  });

  it('index.js mounts the cached reader as checks.retention', () => {
    const src = readFileSync(path.join(HERE, '..', 'index.js'), 'utf8');
    expect(src).toMatch(/checks\.retention = readRetentionHealthCached\(/);
  });
});

/** The period of backup-db.sh's cron line in install-cron.sh, in hours. */
function backupCycleHours() {
  const cron = readFileSync(path.join(REPO, 'scripts', 'install-cron.sh'), 'utf8');
  const line = cron
    .split('\n')
    .find((l) => l.includes('scripts/backup-db.sh') && /^\S+ \S+ \* \* \*/.test(l));
  expect(line, 'the backup-db.sh cron line').toBeTruthy();
  return Number(/^\S+ \*\/(\d+) /.exec(line)[1]);
}

// [USER] 2026-11-22 (the final review's I-1): while a step is due, each read surveys every scope table (0.10-0.15 s
// measured on a test database of 30,000 terms and 20,000 edits), on a public endpoint. The cached reader keeps an
// answer that has a due step for DEFAULT_CACHE_MS; before 2029 nothing is due, nothing is cached, and nothing changes.
describe('createRetentionHealthCache: the reader /api/health uses (final review I-1)', () => {
  const MIN = 60000;
  function reader(opts) {
    const read = createRetentionHealthCache(opts);
    const opened = { n: 0 };
    const at = (nowMs, key = file) =>
      read({
        key,
        nowMs,
        open: () => {
          opened.n++;
          return new Database(file, { readonly: true, fileMustExist: true });
        },
      });
    return { at, opened };
  }
  const laterFeedback = () =>
    insert(db, 'feedback', {
      type: 'bug',
      message: 'm',
      user_name: 'Late Writer',
      created_at: '2029-02-01 09:00:00',
    });
  const recordNamed = () =>
    db
      .prepare(
        "INSERT INTO retention_runs (kind, done_at_ms, rows_changed) VALUES ('named', ?, 40)"
      )
      .run(AT);

  it('while a step is due, a read inside the window gives the same answer and opens no database', () => {
    const { at, opened } = reader();
    const first = at(AT + HOUR);
    expect(first).toEqual({ ok: true, due: ['named'], overdue: [], refused: false });
    expect(at(AT + HOUR + MIN)).toEqual(first);
    expect(opened.n).toBe(1);
  });

  it('a refusal that appears meanwhile is shown once the window has passed', () => {
    const { at } = reader();
    at(AT + HOUR);
    laterFeedback();
    expect(at(AT + HOUR + DEFAULT_CACHE_MS - 1).refused).toBe(false);
    expect(at(AT + HOUR + DEFAULT_CACHE_MS)).toEqual({
      ok: false,
      due: ['named'],
      overdue: [],
      refused: true,
    });
  });

  it('a step recorded meanwhile is no longer due once the window has passed', () => {
    const { at } = reader();
    at(AT + HOUR);
    recordNamed();
    expect(at(AT + HOUR + 1).due).toEqual(['named']);
    expect(at(AT + HOUR + DEFAULT_CACHE_MS)).toEqual({
      ok: true,
      due: [],
      overdue: [],
      refused: false,
    });
  });

  it('before 2029 nothing is cached: each read opens and gives what readRetentionHealth gives', () => {
    const { at, opened } = reader();
    expect(at(AT - HOUR)).toEqual(readRetentionHealth({ db, nowMs: AT - HOUR }));
    expect(at(AT - HOUR + 1)).toEqual(readRetentionHealth({ db, nowMs: AT - HOUR + 1 }));
    expect(opened.n).toBe(2);
  });

  it('another database is read afresh', () => {
    const { at, opened } = reader();
    at(AT + 2 * HOUR);
    at(AT + 2 * HOUR + 1, `${file}-other`);
    expect(opened.n).toBe(2);
  });

  it('a clock that went back is read afresh', () => {
    const { at, opened } = reader();
    at(AT + 2 * HOUR);
    at(AT + HOUR);
    expect(opened.n).toBe(2);
  });

  it('an error is never kept: a read that could not open says so, and the next read computes', () => {
    const read = createRetentionHealthCache();
    const failed = read({
      key: file,
      nowMs: AT + HOUR,
      open: () => {
        throw Object.assign(new Error('cannot open'), { code: 'SQLITE_CANTOPEN' });
      },
    });
    expect(failed).toEqual({ ok: false, error: 'SQLITE_CANTOPEN' });
    const next = read({
      key: file,
      nowMs: AT + HOUR + 1,
      open: () => new Database(file, { readonly: true, fileMustExist: true }),
    });
    expect(next).toEqual({ ok: true, due: ['named'], overdue: [], refused: false });
  });

  it('a caller changing the answer it was given does not change the kept one', () => {
    const { at } = reader();
    at(AT + HOUR).due.push('unnamed');
    expect(at(AT + HOUR + 1).due).toEqual(['named']);
  });

  it('the window is shorter than one backup cycle, so it never hides a whole run of backup-db.sh', () => {
    expect(DEFAULT_CACHE_MS).toBeGreaterThan(0);
    expect(DEFAULT_CACHE_MS).toBeLessThan(backupCycleHours() * HOUR);
  });
});
