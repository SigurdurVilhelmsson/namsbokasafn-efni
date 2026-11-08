#!/usr/bin/env node
/**
 * research-retention.js — deletes every research row once the retention date has passed (G1.1 +
 * G1.2 spec §5.15, A3; PR4 decisions 9, 11, 12 and 13).
 *
 * Usage: node server/scripts/research-retention.js [--write] [--no-derived-dataset]
 *   Dry run unless --write. There is NO date option, and an unknown argument is refused: the date
 *   is SD6's, held in server/lib/researchRetention.js, and while it is empty nothing is ever due,
 *   so the research backup job's every-cycle --write call changes nothing.
 *
 * DUE (decision 11; spec ✏️ AMENDED 2026-11-04): the date is set and has passed, and either a
 * research row exists (an event, an item or a key), or no retention deletion has been recorded
 * at or after the date. The second arm keeps a run that deleted every row but could not compact
 * due: the deleted bytes may still be in free pages and the WAL, and with no row left the literal
 * rule would never select the file again.
 *
 * THE DERIVED-DATASET GUARD (decision 12; spec ✏️ AMENDED 2026-11-04): --write is refused while no
 * derived dataset is recorded, but only when something is due. The backup job runs this script
 * with --write every cycle and takes no copy when it exits non-zero, so refusing while nothing is
 * due would fail every cycle long before SD6 sets a date. A dataset row counts only when its path
 * is absolute and lies outside research-exports/, the copies directory and the research file
 * (§5.15: the dataset never lives in research.db or research-exports/): a row naming a file this
 * same run deletes would let the date destroy the only copy. An absolute path, because resolving
 * a relative one would need a working directory. --no-derived-dataset overrides the guard.
 *
 * THE ORDER, on --write, the withdrawal script's: pre-flight checkpoint (one frame first), every
 * item, event and key row in one immediate transaction (the key map last), compact, byte scan for
 * every key the run held, empty research-exports/, and one research_deletions row (kind
 * 'retention', no interval) ONLY if all of that passed.
 *
 * Loss rows and consent rows are not research rows here: the loss notes outlive the retention
 * date (A3), and the consent record is kept a stated period longer (§5.14). So this script names
 * no consent table (§5.22) and sets no consent column: only withdrawals record deletion_done_at_ms
 * (decision 9; spec ✏️ AMENDED 2026-11-04).
 *
 * It prints one JSON report of step outcomes: never a key and never a row count. Exit codes: 0
 * done, nothing due, or a clean dry run; 1 refused, a step failed or a file is absent; 2 usage.
 * process.exitCode only, never process.exit().
 */
const path = require('path');
const Database = require('better-sqlite3');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { RETENTION_DATE, retentionDateMs } = require('../lib/researchRetention');
const {
  openResearch,
  allKeys,
  anyResearchRow,
  SCRIPT_BUSY_TIMEOUT_MS,
} = require('./lib/researchAdmin');
const researchPurge = require('./lib/researchPurge');

const SCRIPT = 'research-retention';
const USAGE = 'usage: research-retention.js [--write] [--no-derived-dataset]';
const FLAGS = new Set(['--write', '--no-derived-dataset']);

/**
 * @param {{ research: import('better-sqlite3').Database, sessions: import('better-sqlite3').Database,
 *   retentionDate: string | null, nowMs: number }} opts
 * @returns {boolean}
 */
function isDue({ research, sessions, retentionDate, nowMs }) {
  const at = retentionDateMs(retentionDate);
  if (at === null || nowMs < at) return false;
  if (anyResearchRow(research)) return true;
  // Decision 11: deleted but not yet compacted and recorded — the bytes may still be in free pages and the WAL.
  return !sessions
    .prepare(
      "SELECT 1 FROM research_deletions WHERE kind = 'retention' AND done_at_ms >= ? LIMIT 1"
    )
    .get(at);
}

// Decision 12: a dataset row counts only when it names an absolute path outside everything this run deletes
// (spec §5.15: the dataset "never lives in research.db or research-exports/").
function hasDerivedDatasetOutside(sessions, files) {
  const within = (p, dir) => p === dir || p.startsWith(`${dir}${path.sep}`);
  const deleted = [files.researchPath, files.walPath, files.shmPath, files.stagingPath];
  return sessions
    .prepare('SELECT path FROM research_derived_datasets')
    .all()
    .some(({ path: raw }) => {
      if (!path.isAbsolute(raw)) return false; // resolving it would need a working directory
      const p = path.normalize(raw);
      return !within(p, files.exportsDir) && !within(p, files.backupsDir) && !deleted.includes(p);
    });
}

/**
 * @param {{ researchPath: string, sessionsPath: string, write: boolean, retentionDate: string | null,
 *   noDerivedDataset?: boolean, nowMs?: number, busyTimeoutMs?: number, steps?: typeof researchPurge }} opts
 * @returns {object} the report; throws SQLITE_CANTOPEN when the research file is absent
 */
function runRetention({
  researchPath,
  sessionsPath,
  write,
  retentionDate,
  noDerivedDataset = false,
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
    const due = isDue({ research, sessions, retentionDate, nowMs });
    const report = { script: SCRIPT, write, due, ok: true };
    if (!due) return report;
    const derivedDataset = hasDerivedDatasetOutside(sessions, files);
    if (!write) return { ...report, derivedDataset };
    if (!noDerivedDataset && !derivedDataset) {
      return { ...report, ok: false, refused: 'no-derived-dataset' };
    }
    // Stop before deleting anything while a reader holds the file: the next run then still holds the keys.
    if (steps.checkpointBusy(research)) {
      return { ...report, ok: false, failed: 'checkpoint-preflight' };
    }
    const keys = allKeys(research).map((k) => k.editorKey);
    research
      .transaction(() => {
        research.prepare('DELETE FROM research_event_items').run();
        research.prepare('DELETE FROM research_events').run();
        research.prepare('DELETE FROM editor_keys').run(); // last: events reference it
      })
      .immediate();
    const compacted = steps.compact(research);
    const found = compacted.ok
      ? steps.scanForKeys([files.researchPath, files.walPath], keys)
      : null;
    let exportsState;
    try {
      exportsState = steps.emptyExports(files.exportsDir);
    } catch {
      exportsState = 'failed';
    }
    const passed = compacted.ok && found.length === 0 && exportsState !== 'failed';
    if (passed) {
      sessions
        .prepare(
          "INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('retention', NULL, ?, ?)"
        )
        .run(nowMs, keys.length > 0 ? 1 : 0);
    }
    return {
      ...report,
      compact: compacted.ok ? 'ok' : compacted.step,
      scan:
        found === null
          ? 'not-run'
          : keys.length === 0
            ? 'no-key'
            : found.length
              ? 'found'
              : 'clean',
      exports: exportsState,
      verified: passed && keys.length > 0,
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
  if (args.some((a) => !FLAGS.has(a))) {
    console.error(USAGE);
    return 2;
  }
  const { researchPath, editorialPath } = resolveResearchDbPath();
  let report;
  try {
    report = runRetention({
      researchPath,
      sessionsPath: editorialPath,
      write: args.includes('--write'),
      noDerivedDataset: args.includes('--no-derived-dataset'),
      retentionDate: RETENTION_DATE,
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

module.exports = { USAGE, isDue, runRetention, main };
