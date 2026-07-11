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
const { computeOffboxBackupHealth } = require('../lib/offboxBackupHealth');

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
