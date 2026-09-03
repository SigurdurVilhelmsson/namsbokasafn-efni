/**
 * Off-box backup heartbeat health check (Track A, Task A3).
 *
 * backup-db.sh (A1) writes pipeline-output/backups/.last-offbox-backup after
 * each successful off-box upload. This tests the pure computation that turns
 * that heartbeat file's mtime into a health-check verdict, so a silently
 * stopped cron becomes visible in GET /api/health instead of discovered in a
 * disaster. No live server needed — see server/index.js's /api/health
 * handler for the (untested-by-design, see brief) wiring that reads the
 * file's mtime and calls this helper.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeOffboxBackupHealth, DEFAULT_STALE_HOURS } = require('../lib/offboxBackupHealth');
const { DEFAULT_STALE_HOURS: CONTENT_STALE_HOURS } = require('../lib/contentBackupHealth');
const { readFileSync } = require('fs');

describe('the default staleness threshold is DERIVED from the cron period, not chosen', () => {
  // 🔴 THIS PIN EXISTS BECAUSE THE VALUE WAS 26, INLINE AT THE CALL SITE, AND WRONG
  // FOR THE CADENCE. 26 = 24 + 2 is a DAILY tolerance; backup-db.sh runs every 6
  // hours, so four consecutive upload failures could pass before /api/health said
  // anything. The sibling states the house formula in its own comment — "Two missed
  // cycles of the 2-hourly cron, plus margin" (2 x 2 + 2 = 6) — so the same formula
  // on a 6-hourly cron gives 2 x 6 + 2 = 14.
  it('is two missed cycles plus margin, the same formula the content check uses', () => {
    expect(DEFAULT_STALE_HOURS).toBe(14);
    // Stated as the arithmetic, so a future edit to the literal alone reads as wrong.
    expect(DEFAULT_STALE_HOURS).toBe(2 * 6 + 2);
    // The CONTROL that makes the formula claim mean something: the same arithmetic
    // must reproduce the sibling's independently-chosen value from ITS cron period.
    expect(CONTENT_STALE_HOURS).toBe(2 * 2 + 2);
  });

  // 🔴 AND THE CRON PERIOD IS THE OTHER HALF OF THE DERIVATION, so it is asserted
  // rather than trusted. A schedule change that leaves the threshold behind is
  // exactly how a silently-failing backup stays invisible — which is the condition
  // this whole check exists to surface.
  it('the backup-db cron really is 6-hourly, so 14 is still the right derivation', () => {
    const cron = readFileSync(new URL('../../scripts/install-cron.sh', import.meta.url), 'utf8');
    const line = cron
      .split('\n')
      .find((l) => !l.trimStart().startsWith('#') && l.includes('backup-db.sh'));
    expect(line, 'no uncommented backup-db.sh cron line found').toBeTruthy();
    const period = line.trim().split(/\s+/)[1]; // minute hour ... -> hour field
    expect(period).toBe('*/6');
  });
});

describe('offbox backup health', () => {
  it('reports null age + stale when the heartbeat is missing', () => {
    const r = computeOffboxBackupHealth({ heartbeatMtimeMs: null, nowMs: 1_000, staleHours: 26 });
    expect(r).toEqual({ age_hours: null, stale: true });
  });
  it('not stale when the heartbeat is fresh', () => {
    const now = 100 * 3600 * 1000;
    const r = computeOffboxBackupHealth({
      heartbeatMtimeMs: now - 2 * 3600 * 1000,
      nowMs: now,
      staleHours: 26,
    });
    expect(r.stale).toBe(false);
    expect(r.age_hours).toBe(2);
  });
  it('stale when older than the threshold', () => {
    const now = 100 * 3600 * 1000;
    const r = computeOffboxBackupHealth({
      heartbeatMtimeMs: now - 30 * 3600 * 1000,
      nowMs: now,
      staleHours: 26,
    });
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBe(30);
  });
});
