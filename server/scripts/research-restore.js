#!/usr/bin/env node
/**
 * research-restore.js — restores the research file from one of its local copies, purged before it
 * goes live (G1.1 + G1.2 spec §5.15 "A restore", §5.1, §5.17; PR4 decisions 32 and 33). The
 * runbook is in docs/technical/backup-and-restore.md; only this script restores the file (§5.1).
 *
 * Usage: node server/scripts/research-restore.js --from <copy> [--write]
 *   Dry run unless --write.
 *
 * STOP THE SERVICE FIRST: it refuses while `ritstjorn` (the unit scripts/deploy.sh restarts) is
 * active, because a restore would swap the file under the server's open handle.
 *
 * FROM A LOCAL COPY ONLY: --from must name a research.<stamp>.db inside the copies directory. Fetch
 * an off-box copy into that directory under its own name first. The copy restored from stays
 * there, so the restore can be repeated, and ages out by its stamp.
 *
 * THE ORDER (decision 32): verify the copy; copy it to the staging file beside the research file;
 * run research-withdrawal.js's and research-retention.js's purge on the staged file with --write
 * (§5.15: both run against the restored file before the server opens it — a restored file brings
 * back the key rows of every interval withdrawn since the copy, which makes each one due again);
 * only if both pass, DELETE the current file and its -wal and -shm, then rename the staged file into
 * place. A failed purge removes the staged file (it may hold withdrawn rows) and leaves the live
 * file as it was.
 *
 * WHY THE CURRENT FILE IS DELETED, NEVER SET ASIDE: the purge has just recorded every interval due
 * at restore time as deleted, and the usual reason for a restore (a corrupt live file, during which
 * the route's immediate deletion and the job's deletion step both failed) is exactly when that file
 * still holds a due interval's rows. Kept aside it would hold them past 7 days while the record
 * says the deletion is done, and no deletion run would reach it. Delete before rename: a run killed
 * between them leaves no live file (missing, §5.1), and the next restore starts again; a killed run
 * before the purge leaves a staging file the backup's prune refuses to ignore (decision 23).
 *
 * It never re-creates a lost file without a copy (decision 33). It names no table of the editing
 * record or of consent. execNeverThrow is a local copy of read-research-preconditions.js's: that
 * probe must require only modules production already had.
 *
 * Exit codes: 0 done or a clean dry run; 1 refused or failed; 2 usage. process.exitCode only.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { COPY_NAME } = require('../lib/researchBackupPolicy');
const { RETENTION_DATE } = require('../lib/researchRetention');
const { verifyCopy } = require('./research-backup');
const { runWithdrawal } = require('./research-withdrawal');
const { runRetention } = require('./research-retention');

const SERVICE_UNIT = 'ritstjorn';
const USAGE = 'usage: research-restore.js --from <copy> [--write]';
const ACTIVE = new Set(['active', 'activating', 'reloading', 'deactivating']);

function execNeverThrow(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      ran: err.code !== 'ENOENT',
      code: typeof err.status === 'number' ? err.status : null,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

/**
 * @param {{ from: string, files: ReturnType<typeof researchFilesFor>, sessionsPath: string, write: boolean,
 *   nowMs?: number, retentionDate?: string | null, exec?: typeof execNeverThrow, busyTimeoutMs?: number,
 *   deps?: { runWithdrawal: Function, runRetention: Function } }} opts
 * @returns {object} the report
 */
function restoreResearch({
  from,
  files,
  sessionsPath,
  write,
  nowMs = Date.now(),
  retentionDate = RETENTION_DATE,
  exec = execNeverThrow,
  busyTimeoutMs,
  deps = { runWithdrawal, runRetention },
}) {
  if (ACTIVE.has(String(exec('systemctl', ['is-active', SERVICE_UNIT]).stdout).trim())) {
    return { ok: false, refused: 'SERVICE_ACTIVE' };
  }
  const abs = path.resolve(from);
  if (
    path.dirname(abs) !== files.backupsDir ||
    !COPY_NAME.test(path.basename(abs)) ||
    !fs.existsSync(abs)
  ) {
    return { ok: false, refused: 'NOT_A_COPY' };
  }
  const check = verifyCopy(abs);
  if (!check.ok) return { ok: false, refused: 'COPY_INVALID', reason: check.reason };
  const staging = files.stagingPath; // pruneLocal refuses to ignore one a killed run left (decision 23)
  const removeStaging = () => {
    for (const p of [staging, `${staging}-wal`, `${staging}-shm`, `${staging}-journal`]) {
      fs.rmSync(p, { force: true });
    }
  };
  const report = { from: abs, staging, write };
  if (!write) {
    return {
      ...report,
      ok: true,
      current: fs.existsSync(files.researchPath) ? 'present' : 'absent',
    };
  }
  removeStaging();
  fs.copyFileSync(abs, staging);
  fs.chmodSync(staging, 0o600);
  let withdrawal = null;
  let retention = null;
  try {
    withdrawal = deps.runWithdrawal({
      researchPath: staging,
      sessionsPath,
      write: true,
      nowMs,
      busyTimeoutMs,
    });
    retention = deps.runRetention({
      researchPath: staging,
      sessionsPath,
      write: true,
      nowMs,
      retentionDate,
      busyTimeoutMs,
    });
  } catch (err) {
    withdrawal = withdrawal || { ok: false, error: err.code || err.name };
  }
  if (!withdrawal?.ok || !retention?.ok) {
    removeStaging(); // it may hold withdrawn rows
    return { ...report, ok: false, refused: 'PURGE_FAILED', withdrawal, retention };
  }
  // Decision 32: delete the current file, never set it aside. The purge above has just recorded every interval due at
  // restore time as deleted, and the current file may still hold such an interval's rows (a bad file is when the
  // route's deletion and the job both failed). Delete before rename: a run killed between them leaves no live file.
  const current = fs.existsSync(files.researchPath) ? 'deleted' : 'absent';
  for (const p of [files.researchPath, files.walPath, files.shmPath]) fs.rmSync(p, { force: true });
  fs.renameSync(staging, files.researchPath);
  return { ...report, ok: true, current, withdrawal, retention };
}

/** @returns {{ from: string, write: boolean } | { error: string }} */
function parseArgs(args) {
  let from = null;
  let write = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--write' && !write) write = true;
    else if (
      args[i] === '--from' &&
      from === null &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    ) {
      from = args[i + 1];
      i += 1;
    } else return { error: `unexpected argument ${args[i]}` };
  }
  return from === null ? { error: '--from is required' } : { from, write };
}

/** @returns {0 | 1 | 2} */
function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.error) {
    console.error(`${args.error}\n${USAGE}`);
    return 2;
  }
  const { researchPath, editorialPath } = resolveResearchDbPath();
  let report;
  try {
    report = restoreResearch({
      from: args.from,
      files: researchFilesFor(researchPath),
      sessionsPath: editorialPath,
      write: args.write,
    });
  } catch (err) {
    console.error(`research-restore: ${err.code || err.name}: ${err.message}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = 1; // a run that dies before a verdict is never 0
  process.exitCode = main(process.argv);
}

module.exports = { SERVICE_UNIT, execNeverThrow, restoreResearch, main };
