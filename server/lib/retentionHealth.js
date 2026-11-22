/**
 * checks.retention in /api/health (G1.15(b) spec §4.6; plan Task 8).
 *
 * The editorial retention script (server/scripts/editorial-retention.js) runs inside scripts/backup-db.sh, every six
 * hours, and records each step in retention_runs only when it verified and no refusal stands. So this check is not ok
 * when a step has been due and unrecorded for longer than two missed backup cycles plus margin, or at once when a
 * refusal stands (spec §4.4: continued use is a refusal, shown until a person decides). Until 2029 nothing is due, so
 * it is ok and costs nothing: every step's plan returns before reading a table.
 *
 * ⚠️ NO TABLE, NO REASON, NO COUNT. /api/health is unauthenticated. A refusal's table or reason says what the database
 * holds (a later consent record says that someone consented; research_db's comment states the same rule), so the
 * result carries only which steps are due or overdue and whether a refusal stands (security review, 2026-11-21). Which
 * refusal, on which table and how many rows: the script's dry run on the server,
 * `node server/scripts/editorial-retention.js`.
 */
const { planStep, STEPS, STEP_ORDER } = require('./editorialRetention');
const { effectiveMs } = require('./retentionDates');
// The same cron as the off-box backup heartbeat (backup-db.sh, 6-hourly), so the same derived threshold: 2 x 6 + 2.
// retentionHealth.test.js re-derives it from install-cron.sh.
const { DEFAULT_STALE_HOURS } = require('./offboxBackupHealth');

const HOUR_MS = 3600000;

/**
 * @param {{ db: import('better-sqlite3').Database, nowMs: number, staleHours?: number }} p
 * @returns {{ ok: boolean, due: string[], overdue: string[], refused: boolean } | { ok: false, error: string }}
 *   never throws
 */
function readRetentionHealth({ db, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  try {
    const due = [];
    const overdue = [];
    let refused = false;
    for (const kind of STEP_ORDER) {
      const plan = planStep(db, kind, nowMs);
      if (!plan.due) continue;
      due.push(kind);
      if (nowMs - effectiveMs(STEPS[kind].date) > staleHours * HOUR_MS) overdue.push(kind);
      if (plan.refusals.length) refused = true;
    }
    return { ok: overdue.length === 0 && !refused, due, overdue, refused };
  } catch (err) {
    return { ok: false, error: err.code || err.name };
  }
}

/**
 * How long the cached reader keeps an answer that has a due step. While a step is due, readRetentionHealth surveys
 * every scope table (0.10-0.15 s measured on a test database of 30,000 terms and 20,000 edits; the final review's
 * I-1), and /api/health is public. Kept this long, the survey runs at most once a window, however often it is called;
 * the price is that the check can show a refusal, its clearing, or a recorded step up to this late. Shorter than one
 * backup cycle, so it never hides a whole run of backup-db.sh (retentionHealth.test.js derives the cycle).
 */
const DEFAULT_CACHE_MS = 5 * 60 * 1000;

/**
 * A reader for /api/health that keeps an answer with a due step for `ttlMs` ([USER] 2026-11-22, the final review's
 * I-1). Before 2029 nothing is due, so nothing is kept and every read is readRetentionHealth's. An error is never kept.
 * A read inside the window opens no database. The answer has the same shape either way: no age, no time.
 *
 * @param {{ ttlMs?: number }} [opts]
 * @returns {(p: { key: string, open: () => import('better-sqlite3').Database, nowMs: number, staleHours?: number })
 *   => ReturnType<typeof readRetentionHealth>} never throws; `open` is called only on a miss, and its handle closed
 */
function createRetentionHealthCache({ ttlMs = DEFAULT_CACHE_MS } = {}) {
  let kept = null; // { key, atMs, result }
  const copy = (r) => ({ ...r, due: [...r.due], overdue: [...r.overdue] });
  return function read({ key, open, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
    if (kept && kept.key === key && nowMs >= kept.atMs && nowMs - kept.atMs < ttlMs) {
      return copy(kept.result);
    }
    kept = null;
    let result;
    try {
      const db = open();
      try {
        result = readRetentionHealth({ db, nowMs, staleHours });
      } finally {
        db.close();
      }
    } catch (err) {
      return { ok: false, error: err.code || err.name };
    }
    if (!result.error && result.due.length) kept = { key, atMs: nowMs, result: copy(result) };
    return result;
  };
}

/** The process's one cached reader, which index.js calls for checks.retention. */
const readRetentionHealthCached = createRetentionHealthCache();

module.exports = {
  readRetentionHealth,
  readRetentionHealthCached,
  createRetentionHealthCache,
  DEFAULT_STALE_HOURS,
  DEFAULT_CACHE_MS,
};
