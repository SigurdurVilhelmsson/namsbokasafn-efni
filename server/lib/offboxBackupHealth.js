/**
 * Off-box backup heartbeat health (Track A, Task A3).
 *
 * scripts/backup-db.sh writes pipeline-output/backups/.last-offbox-backup
 * after each successful encrypted off-box upload. server/index.js's
 * /api/health handler reads that file's mtime and calls this, so a silently
 * stopped backup cron becomes visible in health checks instead of
 * discovered in a disaster.
 *
 * The arithmetic is shared with the content-backup heartbeat — see
 * server/lib/backupHeartbeatHealth.js. This wrapper exists so the off-box
 * call site keeps its domain-specific name and its existing test.
 *
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

/**
 * Two missed cycles of the 6-hourly cron, plus margin — the same formula
 * contentBackupHealth.js states for its 2-hourly cron (2 x 2 + 2 = 6).
 *
 * 🔴 WAS 26, INLINE AT THE CALL SITE, AND THAT WAS ~4 MISSED CYCLES. 26 = 24 + 2
 * is a DAILY tolerance, which does not match a job that runs every 6 hours: four
 * consecutive upload failures could pass before /api/health said anything.
 * Measured 2026-09-03 while diagnosing an off-box backup that turned out to be
 * healthy — the check was truthful but uninformative at that cadence.
 *
 * ⚠️ THE THRESHOLD IS DERIVED FROM THE CRON PERIOD, NOT CHOSEN. If
 * `scripts/install-cron.sh`'s 6-hourly backup-db schedule changes, re-derive this; a
 * threshold and a schedule that drift apart is how a silent backup failure hides.
 * Override per-deployment with OFFBOX_BACKUP_STALE_HOURS.
 */
const DEFAULT_STALE_HOURS = 14;

function computeOffboxBackupHealth(params) {
  return computeBackupHeartbeatHealth(params);
}

module.exports = { computeOffboxBackupHealth, DEFAULT_STALE_HOURS };
