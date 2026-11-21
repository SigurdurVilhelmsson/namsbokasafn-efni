/**
 * checks.retention in /api/health (G1.15(b) spec §4.6; plan Task 8).
 *
 * The editorial retention script (server/scripts/editorial-retention.js) runs inside scripts/backup-db.sh, every six
 * hours, and records each step in retention_runs only when it verified and no refusal stands. So this check is not ok
 * when a step has been due and unrecorded for longer than two missed backup cycles plus margin, or at once when a
 * refusal stands (spec §4.4: continued use is a refusal, shown until a person decides). Until 2029 nothing is due, so
 * it is ok and costs nothing: every step's plan returns before reading a table.
 *
 * ⚠️ NAMES ONLY, NEVER COUNTS. /api/health is unauthenticated, so the result carries steps, reasons and tables and no
 * row count (schemaHealth.js and research_db follow the same rule).
 */
const { planStep, STEPS, STEP_ORDER } = require('./editorialRetention');
const { effectiveMs } = require('./retentionDates');
// The same cron as the off-box backup heartbeat (backup-db.sh, 6-hourly), so the same derived threshold: 2 x 6 + 2.
// retentionHealth.test.js re-derives it from install-cron.sh.
const { DEFAULT_STALE_HOURS } = require('./offboxBackupHealth');

const HOUR_MS = 3600000;

/**
 * @param {{ db: import('better-sqlite3').Database, nowMs: number, staleHours?: number }} p
 * @returns {{ ok: boolean, due: string[], overdue: string[], refusals: {kind: string, reason: string, table: string}[] }
 *   | { ok: false, error: string }} never throws
 */
function readRetentionHealth({ db, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  try {
    const due = [];
    const overdue = [];
    const refusals = [];
    for (const kind of STEP_ORDER) {
      const plan = planStep(db, kind, nowMs);
      if (!plan.due) continue;
      due.push(kind);
      if (nowMs - effectiveMs(STEPS[kind].date) > staleHours * HOUR_MS) overdue.push(kind);
      for (const r of plan.refusals) refusals.push({ kind, reason: r.reason, table: r.table });
    }
    return { ok: overdue.length === 0 && refusals.length === 0, due, overdue, refusals };
  } catch (err) {
    return { ok: false, error: err.code || err.name };
  }
}

module.exports = { readRetentionHealth, DEFAULT_STALE_HOURS };
