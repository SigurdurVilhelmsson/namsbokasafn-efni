#!/usr/bin/env node
/**
 * research-withdrawal.js — completes the deletion of every withdrawn consent interval (G1.1 +
 * G1.2 spec §5.15, §5.1, §5.16; PR4 decisions 4–10 and 13).
 *
 * Usage: node server/scripts/research-withdrawal.js [--write]
 *   Dry run unless --write: it lists what is due and changes nothing.
 *
 * WHAT IS DUE (decision 4): every interval's starting row (decision 'consented', interval_id = id)
 * with withdrawn_at_ms set, and either deletion_done_at_ms empty, or a key row for the interval in
 * the research file (a restore brought it back, spec §5.15 "A restore"). Nothing due: the run
 * changes nothing at all (no compaction, no export removal, no row) and exits 0.
 *
 * THE ORDER, on --write:
 *   1. pre-flight: one WAL frame, then a TRUNCATE checkpoint (decision 5). A reader holding the
 *      file stops the run before anything is deleted, so the next run still holds the key to scan
 *      for (the scan needs the key, so only the run that deleted it can do it).
 *   2. the interval's loss rows, in one sessions.db transaction. They go FIRST (decision 6): if
 *      this delete fails, it throws before the key is touched.
 *   3. in one immediate transaction on the research file: the interval's items, its events and,
 *      last, its key row (§5.16: events reference the key). Two files, no ATTACH (§5.1).
 *   4. compact: checkpoint, vacuum, checkpoint, each required to report busy 0.
 *   5. byte scan: the research file and its -wal must not hold any deleted key.
 *   6. empty research-exports/ (served-version-exports/ is never touched).
 *   7. record: one research_deletions row per interval, and deletion_done_at_ms set the first time
 *      only. Written ONLY if steps 4, 5 and 6 all passed (decision 10): a deletion is never recorded
 *      as done while a copy made from the file survives. Otherwise the interval stays due, and a
 *      later run repeats the work; with the key already gone, that run verifies by compaction alone
 *      and records verified 0 (decision 8).
 *
 * §5.22: this is the one research-* script allowed to name the consent table. It reads it to find
 * withdrawn intervals and writes it only to set deletion_done_at_ms. It reads nothing of the
 * editing record and computes no figure.
 *
 * It prints one JSON report of interval ids and step outcomes: never a key, never a row count
 * (how many rows an editor had is a measure of their volume), never a checkpoint frame count.
 *
 * Exit codes: 0 done, nothing due, or a clean dry run; 1 a step failed, or a file is absent (the
 * research file is opened with fileMustExist and is never created, §5.1); 2 usage (an unknown
 * argument is refused, never ignored). process.exitCode only, never process.exit(): stdout may be
 * a pipe.
 */
const Database = require('better-sqlite3');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { openResearch, keyForInterval, SCRIPT_BUSY_TIMEOUT_MS } = require('./lib/researchAdmin');
const researchPurge = require('./lib/researchPurge');

const SCRIPT = 'research-withdrawal';
const USAGE = 'usage: research-withdrawal.js [--write]';

/**
 * Withdrawn intervals still due (spec §5.15): deletion not done yet, or the key row back after a restore.
 * @param {import('better-sqlite3').Database} sessions sessions.db
 * @param {import('better-sqlite3').Database} research the research file
 * @returns {number[]} interval ids, ascending
 */
function dueIntervals(sessions, research) {
  const hasKey = research.prepare('SELECT 1 FROM editor_keys WHERE interval_id = ?');
  return sessions
    .prepare(
      `SELECT id, deletion_done_at_ms FROM research_consent
        WHERE decision = 'consented' AND interval_id = id AND withdrawn_at_ms IS NOT NULL
        ORDER BY id`
    )
    .all()
    .filter((r) => r.deletion_done_at_ms === null || Boolean(hasKey.get(r.id)))
    .map((r) => r.id);
}

/**
 * @param {{ researchPath: string, sessionsPath: string, write: boolean, nowMs?: number,
 *   busyTimeoutMs?: number, steps?: typeof researchPurge }} opts
 * @returns {object} the report; throws SQLITE_CANTOPEN when the research file is absent, and
 *   throws when the loss-row delete fails (before the research delete, decision 6)
 */
function runWithdrawal({
  researchPath,
  sessionsPath,
  write,
  nowMs = Date.now(),
  busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS,
  steps = researchPurge,
}) {
  const files = researchFilesFor(researchPath);
  const research = openResearch({ researchPath, write, busyTimeoutMs }); // throws when absent (spec §5.1)
  let sessions = null;
  try {
    sessions = new Database(sessionsPath, {
      readonly: !write,
      fileMustExist: true,
      timeout: busyTimeoutMs,
    });
    const due = dueIntervals(sessions, research);
    const report = { script: SCRIPT, write, due, ok: true };
    if (due.length === 0 || !write) return report;
    // Stop before deleting anything while a reader holds the file: the next run then still holds the key to scan for.
    if (steps.checkpointBusy(research)) {
      return { ...report, ok: false, failed: 'checkpoint-preflight' };
    }
    const keys = new Map(due.map((id) => [id, keyForInterval(research, id)]));
    // Loss rows first (spec §5.15's order, decision 6): if this throws, the key is still there for the next run's scan.
    sessions.transaction(() => {
      const del = sessions.prepare('DELETE FROM research_capture_losses WHERE interval_id = ?');
      for (const id of due) del.run(id);
    })();
    research
      .transaction(() => {
        for (const key of keys.values()) {
          if (!key) continue;
          research
            .prepare(
              'DELETE FROM research_event_items WHERE event_id IN (SELECT id FROM research_events WHERE editor_key = ?)'
            )
            .run(key);
          research.prepare('DELETE FROM research_events WHERE editor_key = ?').run(key);
          research.prepare('DELETE FROM editor_keys WHERE editor_key = ?').run(key); // last: events reference it
        }
      })
      .immediate();
    const compacted = steps.compact(research);
    const known = [...keys.values()].filter(Boolean);
    const found = compacted.ok
      ? steps.scanForKeys([files.researchPath, files.walPath], known)
      : null;
    let exportsState;
    try {
      exportsState = steps.emptyExports(files.exportsDir);
    } catch {
      exportsState = 'failed';
    }
    const passed = compacted.ok && found.length === 0 && exportsState !== 'failed';
    if (passed) {
      sessions.transaction(() => {
        const record = sessions.prepare(
          "INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('withdrawal', ?, ?, ?)"
        );
        const markDone = sessions.prepare(
          'UPDATE research_consent SET deletion_done_at_ms = ? WHERE id = ? AND deletion_done_at_ms IS NULL'
        );
        for (const id of due) {
          record.run(id, nowMs, keys.get(id) ? 1 : 0);
          markDone.run(nowMs, id);
        }
      })();
    }
    return {
      ...report,
      compact: compacted.ok ? 'ok' : compacted.step,
      scan:
        found === null
          ? 'not-run'
          : known.length === 0
            ? 'no-key'
            : found.length
              ? 'found'
              : 'clean',
      exports: exportsState,
      verified: passed ? due : [],
      ok: passed,
    };
  } finally {
    research.close();
    if (sessions) sessions.close();
  }
}

/** @returns {0 | 1 | 2} */
function main(argv) {
  const args = argv.slice(2);
  if (args.some((a) => a !== '--write')) {
    console.error(USAGE);
    return 2;
  }
  const { researchPath, editorialPath } = resolveResearchDbPath();
  let report;
  try {
    report = runWithdrawal({
      researchPath,
      sessionsPath: editorialPath,
      write: args.includes('--write'),
    });
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

module.exports = { USAGE, dueIntervals, runWithdrawal, main };
