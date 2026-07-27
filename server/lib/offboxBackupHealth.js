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

function computeOffboxBackupHealth(params) {
  return computeBackupHeartbeatHealth(params);
}

module.exports = { computeOffboxBackupHealth };
