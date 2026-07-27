/**
 * Staleness arithmetic shared by the project's two backup heartbeats.
 *
 * Both backup crons write a heartbeat file ONLY on a healthy run, so that
 * absence or staleness is the alarm — a status file written on every
 * outcome would read "success" forever once the cron stopped. This turns
 * such a file's mtime into a verdict.
 *
 *   - scripts/backup-db.sh   → pipeline-output/backups/.last-offbox-backup
 *   - scripts/git-backup.sh  → pipeline-output/.last-content-backup
 *
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
function computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours }) {
  if (heartbeatMtimeMs == null) return { age_hours: null, stale: true };
  const age_hours = Math.round((nowMs - heartbeatMtimeMs) / 3_600_000);
  return { age_hours, stale: age_hours > staleHours };
}

module.exports = { computeBackupHeartbeatHealth };
