/**
 * Shared staleness arithmetic for both backup heartbeats.
 *
 * Two crons write a heartbeat file only on success: backup-db.sh (off-box
 * sessions.db, 6-hourly) and git-backup.sh (content push, 2-hourly). Both
 * ask the same question of it — "is this older than my threshold?" — so the
 * maths lives here once. offboxBackupHealth.js delegates to it.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeBackupHeartbeatHealth } = require('../lib/backupHeartbeatHealth');

const H = 3600 * 1000;

describe('computeBackupHeartbeatHealth', () => {
  it('reports null age + stale when the heartbeat is missing', () => {
    const r = computeBackupHeartbeatHealth({ heartbeatMtimeMs: null, nowMs: 1_000, staleHours: 6 });
    expect(r).toEqual({ age_hours: null, stale: true });
  });

  it('is not stale when the heartbeat is fresh', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({
      heartbeatMtimeMs: now - 2 * H,
      nowMs: now,
      staleHours: 6,
    });
    expect(r).toEqual({ age_hours: 2, stale: false });
  });

  it('is stale when older than the threshold', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({
      heartbeatMtimeMs: now - 9 * H,
      nowMs: now,
      staleHours: 6,
    });
    expect(r).toEqual({ age_hours: 9, stale: true });
  });

  it('treats exactly-at-threshold as not stale', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({
      heartbeatMtimeMs: now - 6 * H,
      nowMs: now,
      staleHours: 6,
    });
    expect(r.stale).toBe(false);
  });
});
