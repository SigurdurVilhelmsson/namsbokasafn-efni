/**
 * Content-backup heartbeat health (register C11(b)).
 *
 * scripts/git-backup.sh — the 2-hourly cron that is the ONLY route by which
 * reviewed translations reach GitHub — writes
 * pipeline-output/.last-content-backup on every healthy run and never on a
 * failure. Absence is therefore the alarm: a status file written on every
 * outcome (backup-status.json) would still read "success" long after the
 * cron died.
 *
 * All filesystem access lives here rather than in the /api/health handler,
 * because server/index.js calls app.listen() at module load and so cannot be
 * imported by a unit test.
 */

const fs = require('fs');
const path = require('path');
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

/** Two missed cycles of the 2-hourly cron, plus margin. */
const DEFAULT_STALE_HOURS = 6;

/**
 * @param {{projectRoot: string, nowMs: number, staleHours?: number}} p
 *   projectRoot — the repo root. Derive it from `__dirname`, never
 *   `process.cwd()`: the server runs with cwd=server/.
 * @returns {{age_hours: number|null, stale: boolean, last_status: string|null,
 *            message: string|null, ok: boolean}}
 */
function readContentBackupHealth({ projectRoot, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(
      path.join(projectRoot, 'pipeline-output', '.last-content-backup')
    ).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });

  // Detail only, and deliberately not part of the verdict. The heartbeat is
  // the gate: error paths never write it, so a persistent failure goes stale
  // on its own, while a transient one self-heals inside one cron cycle.
  let last_status = null;
  let message = null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'pipeline-output', 'backup-status.json'), 'utf8')
    );
    last_status = typeof parsed.status === 'string' ? parsed.status : null;
    message = typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    /* absent or malformed => no detail; never affects `ok` */
  }

  return { ...health, last_status, message, ok: !health.stale };
}

module.exports = { readContentBackupHealth, DEFAULT_STALE_HOURS };
