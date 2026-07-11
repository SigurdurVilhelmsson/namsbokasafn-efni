/**
 * Pure health computation for the off-box backup heartbeat.
 *
 * scripts/backup-db.sh (Track A, Task A1) writes
 * pipeline-output/backups/.last-offbox-backup after each successful
 * encrypted off-box upload. Task A3 (server/index.js's /api/health handler)
 * reads that file's mtime and calls this helper so a silently-stopped
 * backup cron becomes visible in health checks instead of discovered in a
 * disaster.
 *
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
function computeOffboxBackupHealth({ heartbeatMtimeMs, nowMs, staleHours }) {
  if (heartbeatMtimeMs == null) return { age_hours: null, stale: true };
  const age_hours = Math.round((nowMs - heartbeatMtimeMs) / 3_600_000);
  return { age_hours, stale: age_hours > staleHours };
}

module.exports = { computeOffboxBackupHealth };
