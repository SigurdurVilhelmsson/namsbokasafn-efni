#!/usr/bin/env node
/**
 * editorial-retention.js — enforces the editing tool's retention dates on sessions.db (G1.15(b) spec §4.4, §4.6; plan
 * Task 7). The dates: server/lib/retentionDates.js; their record: docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md.
 *
 * Usage: node server/scripts/editorial-retention.js [--write]
 *   Dry run unless --write. There is NO date option, and an unknown argument is refused (exit 2): the dates are fixed
 *   in retentionDates.js, so until 2029 nothing is due and the backup cron's every-cycle --write call changes nothing.
 *
 * Each step (named 2028, unnamed 2029, consent 2030; server/lib/editorialRetention.js) is due once its date has taken
 * effect and no retention_runs row records it. On --write, for each due step in order:
 *   1. a pre-flight checkpoint (one frame first): a reader holding the file stops the run before anything changes;
 *   2. the step, in one IMMEDIATE transaction (an outright refusal writes nothing);
 *   3. checkpoint, VACUUM, checkpoint, each requiring busy = 0 (scripts/lib/researchPurge.js, as research-retention.js
 *      does): an UPDATE or DELETE leaves old bytes in free pages and the WAL. The build's default is no secure delete,
 *      so this script also turns PRAGMA secure_delete on for its write connection: the step's writes zero what they
 *      free, and either that or the VACUUM alone leaves no removed value in the file (measured in the tests);
 *   4. verification: nothing the step acts on is left (verifyStep), freelist_count is 0, and the WAL is 0 bytes;
 *   5. a retention_runs row, ONLY when the verification passed and no refusal stands ([USER], 2026-11-21: a step with a
 *      refusal stays unrecorded and due, so the health check keeps showing it until a person decides).
 * A step that failed after changing rows stays due; the next cycle changes nothing more, compacts again and records it.
 *
 * It prints one JSON report of steps, counts by table and refusals: never a name and never a value. Exit codes: 0
 * nothing due, every due step recorded, or a dry run; 1 a refusal, a failure, or the file absent; 2 usage.
 * process.exitCode only, never process.exit().
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { planStep, applyStep, verifyStep, STEP_ORDER } = require('../lib/editorialRetention');
const { SCRIPT_BUSY_TIMEOUT_MS } = require('./lib/researchAdmin');
const researchPurge = require('./lib/researchPurge');

const SCRIPT = 'editorial-retention';
const USAGE = 'usage: editorial-retention.js [--write]';
const FLAGS = new Set(['--write']);

function walBytes(dbPath) {
  const wal = `${dbPath}-wal`;
  return fs.existsSync(wal) ? fs.statSync(wal).size : 0;
}

/**
 * @param {{ dbPath: string, write: boolean, nowMs?: number, busyTimeoutMs?: number,
 *   steps?: { checkpointBusy: Function, compact: Function } }} opts steps: the compaction (tests replace it)
 * @returns {{ script: string, write: boolean, ok: boolean, steps: object[] }} throws SQLITE_CANTOPEN when absent
 */
function runEditorialRetention({
  dbPath,
  write,
  nowMs = Date.now(),
  busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS,
  steps = researchPurge,
}) {
  const db = new Database(dbPath, {
    readonly: !write,
    fileMustExist: true,
    timeout: busyTimeoutMs,
  });
  const reports = [];
  try {
    // The step's own writes zero what they free (SQLite's secure_delete, a per-connection setting). VACUUM rebuilds the
    // file as well; either alone leaves no removed value in it. The structural check cannot look for names, since
    // users keeps every name, so the two together are what the record rests on.
    if (write) db.pragma('secure_delete = ON');
    for (let i = 0; i < STEP_ORDER.length; i++) {
      const kind = STEP_ORDER[i];
      const plan = planStep(db, kind, nowMs);
      if (!plan.due) {
        reports.push({ kind, due: false });
        continue;
      }
      if (!write) {
        reports.push({ kind, due: true, counts: plan.counts, refusals: plan.refusals });
        continue;
      }
      if (steps.checkpointBusy(db)) {
        reports.push({ kind, due: true, ok: false, failed: 'checkpoint-preflight' });
        for (const rest of STEP_ORDER.slice(i + 1))
          reports.push({ kind: rest, due: null, ok: false, failed: 'not-run' });
        break;
      }
      const res = applyStep(db, kind, nowMs);
      if (res.blocked) {
        reports.push({ kind, due: true, ok: false, blocked: true, refusals: res.refusals });
        continue;
      }
      const compacted = steps.compact(db);
      const structure = compacted.ok ? verifyStep(db, kind) : { ok: false };
      const verified =
        compacted.ok &&
        structure.ok &&
        Number(db.pragma('freelist_count', { simple: true })) === 0 &&
        walBytes(dbPath) === 0;
      const recorded = verified && res.refusals.length === 0;
      if (recorded) {
        db.prepare(
          'INSERT INTO retention_runs (kind, done_at_ms, rows_changed) VALUES (?, ?, ?)'
        ).run(kind, nowMs, res.changed);
      }
      reports.push({
        kind,
        due: true,
        changed: res.changed,
        refusals: res.refusals,
        compact: compacted.ok ? 'ok' : compacted.step,
        verified,
        recorded,
        ok: recorded,
      });
    }
  } finally {
    db.close();
  }
  return { script: SCRIPT, write, ok: reports.every((r) => r.ok !== false), steps: reports };
}

/** @returns {0 | 1 | 2} */
function main(argv) {
  const args = argv.slice(2);
  if (args.some((a) => !FLAGS.has(a))) {
    console.error(USAGE);
    return 2;
  }
  let report;
  try {
    report = runEditorialRetention({ dbPath: resolveDbPath(), write: args.includes('--write') });
  } catch (err) {
    console.error(`${SCRIPT}: ${err.code || err.name}: ${err.message}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = 1; // a run that dies before a verdict is never 0
  process.exitCode = main(process.argv);
}

module.exports = { USAGE, runEditorialRetention, main };
