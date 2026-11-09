#!/usr/bin/env node
/**
 * research-backup.js — the Node half of the research file's own backup job (G1.1 + G1.2 spec
 * §5.17, §5.15; PR4 decisions 22–25, 29, 30 and 42).
 *
 * scripts/research-backup.sh holds the order, the exit codes and every rclone call, and runs this
 * file. Every file the job writes is written here — the local prune, the online-backup copy, the
 * heartbeat — under paths derived from the research file's own (server/lib/researchFiles.js,
 * decision 2), so the shell names no path under pipeline-output/.
 *
 * Usage: node server/scripts/research-backup.js <subcommand>
 *   prune-local     remove the local copies whose stamp has reached the cut-off; exit 1 on a name
 *                   it did not make (left in place, named on stderr)
 *   expired-names   read names on stdin; print the expired ones, one per line; exit 1 (the unknown
 *                   ones on stderr) when any name is not one it makes
 *   copy            take one copy; print exactly its absolute path; exit 1 otherwise
 *   heartbeat       write the heartbeat (only the job calls this, after every step succeeded)
 *   where           print the copies directory
 *   verify <file>   read-only check; print RESEARCH RESTORE VERIFY: PASS or FAIL (<reason>)
 *   Anything else is exit 2. There is no --write (decision 42): the writing subcommands are run
 *   only by the job's shell scripts, which read what they print, and a hand run of one does what
 *   the job does, which is safe by construction (the prune ages only names it owns; a copy is one
 *   more owned name).
 *
 * THE COPY (decision 25). Measured on better-sqlite3 13: the online backup copies deleted bytes,
 * both in free pages and inside pages still in use, and no page count reveals the latter. So each
 * copy: compacts the live file first, every time (a busy checkpoint takes no copy); backs up into
 * a pre-created 0600 research.<stamp>.db.partial (a fresh destination would be 0644 under umask
 * 022) in the 0700 copies directory; converts the copy to a rollback journal (one self-contained
 * file, so a read-only open creates nothing beside it) and requires integrity_check ok; then,
 * AFTER the copy, requires that no withdrawal and no retention is due, re-read from the files, so
 * a withdrawal recorded after that re-read is after the copy (§5.15: no backup taken after a
 * withdrawal holds that editor's rows). Only then is it renamed to research.<stamp>.db. Any
 * failure removes the partial and its side files.
 *
 * OWNED NAMES (decision 23, server/lib/researchBackupPolicy.js): a name this job did not make, or
 * a restore's staging file beside the research file, is never removed and never ignored: the prune
 * reports it and fails, so the heartbeat stops and checks.research_db reads backup-stale.
 *
 * It prints names and paths, never research content. It names no table of the editing record or
 * of consent: the due re-reads go through the deletion scripts' own exported predicates.
 * process.exitCode only, never process.exit().
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { copyName, expiredNames } = require('../lib/researchBackupPolicy');
const { RETENTION_DATE } = require('../lib/researchRetention');
const { RESEARCH_SCHEMA_VERSION } = require('../lib/researchSchema');
const { openResearch } = require('./lib/researchAdmin');
const { compact } = require('./lib/researchPurge');
const { dueIntervals } = require('./research-withdrawal');
const { isDue } = require('./research-retention');

const USAGE =
  'usage: research-backup.js prune-local | expired-names | copy | heartbeat | where | verify <file>';
const RESEARCH_TABLES = ['editor_keys', 'research_events', 'research_event_items'];

/**
 * @param {{ files: ReturnType<typeof researchFilesFor>, nowMs: number }} opts
 * @returns {{ ok: boolean, removed: string[], unknown: string[] }}
 */
function pruneLocal({ files, nowMs }) {
  let names = null;
  try {
    names = fs.readdirSync(files.backupsDir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const removed = [];
  const unknown = [];
  if (names) {
    fs.chmodSync(files.backupsDir, 0o700); // re-asserted every run
    const r = expiredNames(names, nowMs);
    for (const n of r.expired) {
      fs.rmSync(path.join(files.backupsDir, n), { force: true });
      removed.push(n);
    }
    unknown.push(...r.unknown);
  }
  // A restore killed between its copy and its purge leaves a pre-withdrawal copy here; only the next restore removes it.
  const staged = ['', '-wal', '-shm', '-journal'].map((s) => `${files.stagingPath}${s}`);
  for (const p of staged) if (fs.existsSync(p)) unknown.push(path.basename(p));
  unknown.sort();
  return { ok: unknown.length === 0, removed, unknown };
}

/**
 * @param {{ files: ReturnType<typeof researchFilesFor>, sessionsPath: string, nowMs: number,
 *   retentionDate?: string | null, busyTimeoutMs?: number }} opts
 * @returns {Promise<{ ok: true, path: string } | { ok: false, reason: string }>} leaves no partial behind
 */
async function takeCopy({
  files,
  sessionsPath,
  nowMs,
  retentionDate = RETENTION_DATE,
  busyTimeoutMs,
}) {
  fs.mkdirSync(files.backupsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(files.backupsDir, 0o700); // mkdir's mode is masked by the umask
  const final = path.join(files.backupsDir, copyName(nowMs));
  const partial = `${final}.partial`;
  if (fs.existsSync(final) || fs.existsSync(partial)) return { ok: false, reason: 'name-taken' };
  const discard = () => {
    for (const p of [partial, `${partial}-wal`, `${partial}-shm`, `${partial}-journal`]) {
      fs.rmSync(p, { force: true });
    }
  };
  let research = null;
  let sessions = null;
  try {
    research = openResearch({ researchPath: files.researchPath, write: true, busyTimeoutMs });
    sessions = new Database(sessionsPath, { readonly: true, fileMustExist: true });
    // The online backup copies deleted bytes, in free pages AND inside pages still in use, and no page count sees the
    // latter (measured): compact before EVERY copy (decision 25).
    const compacted = compact(research);
    if (!compacted.ok) return { ok: false, reason: compacted.errorCode || 'compact-busy' };
    fs.closeSync(fs.openSync(partial, 'wx', 0o600)); // a fresh backup destination would be 0644 (measured)
    await research.backup(partial);
    const copy = new Database(partial, { fileMustExist: true });
    let integrity;
    let freePages;
    try {
      copy.pragma('journal_mode = DELETE'); // one self-contained file: a read-only open then creates nothing
      integrity = copy.pragma('integrity_check', { simple: true });
      freePages = Number(copy.pragma('freelist_count', { simple: true }));
    } finally {
      copy.close();
    }
    // Re-read AFTER the copy, on the handles already held: a withdrawal recorded after this point is after the copy
    // (spec §5.15, decision 25). freePages is a backstop, not evidence: it cannot see deleted bytes inside a page still
    // in use. The compaction above and this due re-read are what keep the copy clean.
    let reason = null;
    if (integrity !== 'ok') reason = 'integrity';
    else if (freePages > 0) reason = 'free-pages';
    else if (dueIntervals(sessions, research).length > 0) reason = 'withdrawal-due';
    else if (isDue({ research, sessions, retentionDate, nowMs })) reason = 'retention-due';
    if (reason) {
      discard();
      return { ok: false, reason };
    }
    fs.chmodSync(partial, 0o600);
    fs.renameSync(partial, final);
    return { ok: true, path: final };
  } catch (err) {
    discard();
    return { ok: false, reason: err.code || err.name };
  } finally {
    if (research) research.close();
    if (sessions) sessions.close();
  }
}

/** Writes the ISO time to the heartbeat, atomically. */
function writeHeartbeat(files) {
  const tmp = `${files.heartbeatPath}.tmp`;
  fs.writeFileSync(tmp, `${new Date().toISOString()}\n`);
  fs.renameSync(tmp, files.heartbeatPath);
}

/**
 * Read-only: integrity, schema version and the research tables.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function verifyCopy(file) {
  let db = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      return { ok: false, reason: 'integrity' };
    }
    if (Number(db.pragma('user_version', { simple: true })) !== RESEARCH_SCHEMA_VERSION) {
      return { ok: false, reason: 'schema' };
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    if (!RESEARCH_TABLES.every((t) => tables.includes(t))) return { ok: false, reason: 'tables' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.code || err.name };
  } finally {
    if (db) db.close();
  }
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

/** @returns {Promise<0 | 1 | 2>} */
async function main(
  argv,
  { stdin = process.stdin, out = process.stdout, err = process.stderr } = {}
) {
  const [cmd, ...rest] = argv.slice(2);
  const { researchPath, editorialPath } = resolveResearchDbPath();
  const files = researchFilesFor(researchPath);
  const nullary = ['prune-local', 'expired-names', 'copy', 'heartbeat', 'where'];
  if (nullary.includes(cmd) ? rest.length !== 0 : !(cmd === 'verify' && rest.length === 1)) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  switch (cmd) {
    case 'prune-local': {
      const r = pruneLocal({ files, nowMs: Date.now() });
      for (const n of r.removed) out.write(`removed ${n}\n`);
      for (const n of r.unknown) err.write(`unknown ${n}\n`);
      return r.ok ? 0 : 1;
    }
    case 'expired-names': {
      const names = (await readAll(stdin)).split('\n').map((s) => s.trim());
      const r = expiredNames(names, Date.now());
      for (const n of r.expired) out.write(`${n}\n`);
      for (const n of r.unknown) err.write(`unknown ${n}\n`);
      return r.unknown.length ? 1 : 0;
    }
    case 'copy': {
      const r = await takeCopy({ files, sessionsPath: editorialPath, nowMs: Date.now() });
      if (!r.ok) {
        err.write(`research-backup: no copy (${r.reason})\n`);
        return 1;
      }
      out.write(`${r.path}\n`);
      return 0;
    }
    case 'heartbeat':
      writeHeartbeat(files);
      return 0;
    case 'where':
      out.write(`${files.backupsDir}\n`);
      return 0;
    default: {
      const r = verifyCopy(path.resolve(rest[0]));
      out.write(
        r.ok ? 'RESEARCH RESTORE VERIFY: PASS\n' : `RESEARCH RESTORE VERIFY: FAIL (${r.reason})\n`
      );
      return r.ok ? 0 : 1;
    }
  }
}

if (require.main === module) {
  process.exitCode = 1; // a run that never reaches a verdict — a promise that never settles — is never 0
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`research-backup: ${e.code || e.name}: ${e.message}`);
      process.exitCode = 1;
    }
  );
}

module.exports = { USAGE, pruneLocal, takeCopy, writeHeartbeat, verifyCopy, main };
