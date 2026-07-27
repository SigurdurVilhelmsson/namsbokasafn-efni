/**
 * Glossary-export heartbeat health (register C14).
 *
 * server/scripts/export-terminology.js is invoked by scripts/git-backup.sh,
 * the 2-hourly cron, and writes pipeline-output/.last-glossary-export ONLY
 * when every book resolved healthily. Absence is therefore the alarm.
 *
 * This check exists because that invocation is deliberately CONTAINED: a
 * failing export logs a WARN and lets the content backup proceed, since
 * terminology-DB health must never be able to abort the backup or suppress
 * its own C11(b) heartbeat. The cost of that containment is that a
 * persistent failure would otherwise be invisible — a WARN in a gitignored
 * log nobody reads, while books/*\/glossary/ silently stayed frozen and MT
 * kept being primed from a months-old file. That is the exact failure this
 * whole register item was raised about; shipping the runner without this
 * check would repeat it.
 *
 * No status-file detail here (unlike contentBackupHealth): the exporter
 * writes no status file, so the heartbeat is the whole signal.
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
 * @returns {{age_hours: number|null, stale: boolean, ok: boolean}}
 */
function readGlossaryExportHealth({ projectRoot, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(
      path.join(projectRoot, 'pipeline-output', '.last-glossary-export')
    ).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });
  return { ...health, ok: !health.stale };
}

module.exports = { readGlossaryExportHealth, DEFAULT_STALE_HOURS };
