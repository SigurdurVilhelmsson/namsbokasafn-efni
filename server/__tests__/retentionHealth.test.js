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
const { plantAll, insert } = require('./helpers/retentionPlant.cjs');
const { NAMED_EDITING_RECORDS, effectiveMs } = require('../lib/retentionDates');
const { readRetentionHealth, DEFAULT_STALE_HOURS } = require('../lib/retentionHealth');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const AT = effectiveMs(NAMED_EDITING_RECORDS);
const HOUR = 3600000;

let db;
beforeEach(() => {
  db = freshMigratedDb().db;
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
    const cron = readFileSync(path.join(REPO, 'scripts', 'install-cron.sh'), 'utf8');
    const line = cron
      .split('\n')
      .find((l) => l.includes('scripts/backup-db.sh') && /^\S+ \S+ \* \* \*/.test(l));
    expect(line, 'the backup-db.sh cron line').toBeTruthy();
    const period = Number(/^\S+ \*\/(\d+) /.exec(line)[1]);
    expect(DEFAULT_STALE_HOURS).toBe(2 * period + 2);
  });

  it('index.js mounts it as checks.retention', () => {
    const src = readFileSync(path.join(HERE, '..', 'index.js'), 'utf8');
    expect(src).toMatch(/checks\.retention = readRetentionHealth\(/);
  });
});
