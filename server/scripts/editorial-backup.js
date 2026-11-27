#!/usr/bin/env node
/**
 * editorial-backup.js — the Node half of the editorial database backup job (G1.20 spec §4.2).
 * scripts/backup-db.sh holds the order and every rclone call and runs this file.
 *
 * Usage: node server/scripts/editorial-backup.js <subcommand>
 *   copy <sessions-db> <backup-dir>   take one copy; print exactly its absolute path; exit 1 otherwise
 *   retention-due <sessions-db>       exit 0 when no retention step is due; exit 1 when one is due or
 *                                     when it cannot tell (fail closed)
 *   rate-ok                           stdin: listing. exit 0 under the 24 h copy limit; exit 1 at or over it
 *                                     or when the listing is unreadable
 *   expired                           stdin: listing. print each data version past the server's delete age.
 *                                     Prints nothing and exits 1 unless the listing holds a FRESH copy (a data
 *                                     version within FRESH_WINDOW_MS of now): the delete trusts the box clock,
 *                                     and the copy just uploaded is what proves the clock (G1.20 final review I3)
 *   status --uploaded-seen yes|no --out <file>
 *                                     stdin: listing. write the status file atomically (always, even for an
 *                                     unreadable listing); exit 0 only when ok
 *   Anything else, or a wrong argument count, is exit 2.
 *
 * THE COPY. better-sqlite3's online backup carries deleted bytes into the copy, so the copy is made
 * with VACUUM INTO, which writes live rows only. It goes into a pre-created 0600 partial file (a fresh
 * destination would be 0644 under umask 022) inside a 0700 directory, is converted to a rollback
 * journal (one self-contained file) and must pass integrity_check; only then is it renamed to
 * sessions.<UTC stamp>.db. Any failure removes the partial and its side files.
 *
 * It prints paths and step names, never content. process.exitCode only, never process.exit().
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { SCRIPT_BUSY_TIMEOUT_MS } = require('./lib/researchAdmin');
const { readRetentionHealth } = require('../lib/retentionHealth');
const {
  MAX_COPIES_PER_24H,
  readListing,
  expiredPaths,
  recentCopies,
  hasFreshCopy,
  summarize,
} = require('../lib/editorialBackupPolicy');

const USAGE =
  'usage: editorial-backup.js copy <sessions-db> <backup-dir> | retention-due <sessions-db>' +
  ' | rate-ok | expired | status --uploaded-seen yes|no --out <file>   (the last three read an rclone lsjson listing on stdin)';

/** sessions.YYYY-MM-DD-HHMMSS.db, stamped in UTC. */
function copyName(nowMs) {
  const stamp = new Date(nowMs)
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace('T', '-')
    .replace(/:/g, '');
  return `sessions.${stamp}.db`;
}

/**
 * @param {{ sessionsPath: string, dir: string, nowMs: number }} opts
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }} leaves no partial behind
 */
function takeCopy({ sessionsPath, dir, nowMs }) {
  const final = path.join(dir, copyName(nowMs));
  const partial = `${final}.partial`;
  let created = false; // only a partial THIS call created is ever removed: another run's is not ours
  const discard = () => {
    if (!created) return;
    for (const p of [partial, `${partial}-wal`, `${partial}-shm`, `${partial}-journal`]) {
      fs.rmSync(p, { force: true });
    }
  };
  let src = null;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700); // mkdir's mode is masked by the umask
    if (fs.existsSync(final)) return { ok: false, reason: 'name-taken' };
    try {
      // VACUUM INTO needs an empty file, and a fresh destination would be 0644: 'wx' gives both, atomically
      fs.closeSync(fs.openSync(partial, 'wx', 0o600));
      created = true;
    } catch (err) {
      return { ok: false, reason: err.code === 'EEXIST' ? 'name-taken' : err.code || err.name };
    }
    src = new Database(sessionsPath, {
      readonly: true,
      fileMustExist: true,
      timeout: SCRIPT_BUSY_TIMEOUT_MS,
    });
    src.prepare('VACUUM INTO ?').run(partial);
    const copy = new Database(partial, { fileMustExist: true });
    let mode;
    let integrity;
    try {
      mode = copy.pragma('journal_mode = DELETE', { simple: true });
      integrity = copy.pragma('integrity_check', { simple: true });
    } finally {
      copy.close();
    }
    const reason = mode !== 'delete' ? 'journal-mode' : integrity !== 'ok' ? 'integrity' : null;
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
    if (src) src.close();
  }
}

/**
 * Fail closed: a database it cannot read counts as due.
 * @param {{ sessionsPath: string, nowMs: number }} opts
 * @returns {{ due: boolean, steps: string[], error?: string }}
 */
function retentionDue({ sessionsPath, nowMs }) {
  let db = null;
  try {
    db = new Database(sessionsPath, {
      readonly: true,
      fileMustExist: true,
      timeout: SCRIPT_BUSY_TIMEOUT_MS,
    });
    const h = readRetentionHealth({ db, nowMs });
    if (h.error) return { due: true, steps: [], error: h.error };
    return { due: h.due.length > 0, steps: h.due };
  } catch (err) {
    return { due: true, steps: [], error: err.code || err.name };
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

/** Write JSON to `file` through `<file>.tmp` and a rename, so a reader never sees half a file. */
function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`);
  fs.renameSync(tmp, file);
}

/** @returns {Promise<0 | 1 | 2>} */
async function listingCommand(cmd, rest, { stdin, out, err, now }) {
  let outFile = null;
  let uploadedSeen = null;
  if (cmd === 'status') {
    if (rest.length !== 4) return usage(err);
    for (let i = 0; i < 4; i += 2) {
      if (rest[i] === '--uploaded-seen') uploadedSeen = rest[i + 1];
      else if (rest[i] === '--out') outFile = rest[i + 1];
      else return usage(err);
    }
    if (!outFile || (uploadedSeen !== 'yes' && uploadedSeen !== 'no')) return usage(err);
  } else if (rest.length !== 0) {
    return usage(err);
  }
  let items = null;
  try {
    items = readListing(await readAll(stdin), now);
  } catch (e) {
    if (e.message !== 'listing-invalid') throw e;
  }
  switch (cmd) {
    case 'rate-ok': {
      if (!items) {
        err.write('editorial-backup: listing-invalid\n');
        return 1;
      }
      const n = recentCopies(items);
      if (n >= MAX_COPIES_PER_24H) {
        err.write(`editorial-backup: rate guard: ${n} copies in 24 h\n`);
        return 1;
      }
      return 0;
    }
    case 'expired': {
      if (!items) {
        err.write('editorial-backup: listing-invalid\n');
        return 1;
      }
      if (!hasFreshCopy(items)) {
        err.write('editorial-backup: no fresh copy in the listing; refusing to delete\n');
        return 1;
      }
      for (const p of expiredPaths(items)) out.write(`${p}\n`);
      return 0;
    }
    default: {
      const at = new Date(now).toISOString();
      const status = items
        ? { at, ...summarize(items, { uploadedSeen: uploadedSeen === 'yes' }) }
        : { at, ok: false, reasons: ['listing-invalid'] };
      writeJsonAtomic(path.resolve(outFile), status);
      out.write(
        status.ok
          ? 'editorial-backup: status ok\n'
          : `editorial-backup: status not ok (${status.reasons.join(',')})\n`
      );
      return status.ok ? 0 : 1;
    }
  }
}

function usage(err) {
  err.write(`${USAGE}\n`);
  return 2;
}

/** @returns {Promise<0 | 1 | 2>} */
async function main(
  argv,
  { stdin = process.stdin, out = process.stdout, err = process.stderr, nowMs = Date.now } = {}
) {
  const [cmd, ...rest] = argv.slice(2);
  if (cmd === 'rate-ok' || cmd === 'expired' || cmd === 'status') {
    return listingCommand(cmd, rest, { stdin, out, err, now: nowMs() });
  }
  const arity = { copy: 2, 'retention-due': 1 };
  if (!(cmd in arity) || rest.length !== arity[cmd]) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  switch (cmd) {
    case 'copy': {
      const r = takeCopy({
        sessionsPath: path.resolve(rest[0]),
        dir: path.resolve(rest[1]),
        nowMs: nowMs(),
      });
      if (!r.ok) {
        err.write(`editorial-backup: no copy (${r.reason})\n`);
        return 1;
      }
      out.write(`${r.path}\n`);
      return 0;
    }
    default: {
      const r = retentionDue({ sessionsPath: path.resolve(rest[0]), nowMs: nowMs() });
      if (r.error) {
        err.write(`editorial-backup: retention unknown (${r.error})\n`);
        return 1;
      }
      if (r.due) {
        err.write(`editorial-backup: retention due: ${r.steps.join(', ')}\n`);
        return 1;
      }
      return 0;
    }
  }
}

if (require.main === module) {
  process.exitCode = 1; // a run that never reaches a verdict is never 0
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`editorial-backup: ${e.code || e.name}: ${e.message}`);
      process.exitCode = 1;
    }
  );
}

module.exports = { USAGE, copyName, takeCopy, retentionDue, main };
