/**
 * The purge steps both deletion scripts and the backup's copy step share (G1.1 + G1.2 spec §5.15
 * steps 2–4, §9 G-2; PR4 decisions 5, 7 and 25).
 *
 * Why compaction is needed (measured on better-sqlite3 13; this build has no SQLITE_SECURE_DELETE,
 * G-2): a DELETE leaves the deleted bytes in the file, in free pages and inside pages still in use,
 * and in the WAL, and the online backup copies them. No page count reveals them. Only a checkpoint,
 * a VACUUM and a second checkpoint remove them from the file and leave the -wal at 0 bytes.
 *
 * Why each checkpoint must report busy 0: a reader holding the file keeps the WAL frames it can
 * see, so a busy checkpoint leaves deleted bytes behind. Why one frame is written first (decision
 * 5): a reader that began while the WAL was empty holds read-lock 0, which a checkpoint of an empty
 * WAL cannot see (measured), and an empty WAL is exactly the state every TRUNCATE checkpoint leaves.
 * With one frame written, the checkpoint must reach that reader. Writing the user_version the file
 * already holds changes nothing else.
 *
 * The byte scan reads the research file and its -wal, the two places §5.15 names. The -shm is not
 * scanned: it holds the WAL index, no row content.
 *
 * emptyExports empties research-exports/ only. served-version-exports/ is never touched.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {import('better-sqlite3').Database} db a write handle
 * @returns {boolean} true when a reader or a writer stops the checkpoint
 */
function checkpointBusy(db) {
  // One frame first (decision 5): a reader that began while the WAL was empty holds read-lock 0, which a checkpoint
  // of an empty WAL cannot see (measured). Writing the version the file already holds changes nothing else.
  try {
    const v = Number(db.pragma('user_version', { simple: true }));
    db.transaction(() => db.pragma(`user_version = ${v}`)).immediate();
  } catch (err) {
    if (err.code === 'SQLITE_BUSY') return true; // a writer holds the lock past the wait
    throw err;
  }
  const [row] = db.pragma('wal_checkpoint(TRUNCATE)');
  return Number(row.busy) !== 0;
}

/**
 * Checkpoint, vacuum, checkpoint; stops at the first failure.
 * @returns {{ ok: true } | { ok: false, step: 'checkpoint-1' | 'vacuum' | 'checkpoint-2', errorCode?: string }}
 *   never throws
 */
function compact(db) {
  const step = (name, fn) => {
    try {
      return fn() ? null : { ok: false, step: name };
    } catch (err) {
      return { ok: false, step: name, errorCode: err.code || err.name };
    }
  };
  return (
    step('checkpoint-1', () => !checkpointBusy(db)) ||
    step('vacuum', () => (db.exec('VACUUM'), true)) ||
    step('checkpoint-2', () => !checkpointBusy(db)) || { ok: true }
  );
}

/**
 * @param {string[]} paths an absent path is skipped; another read error throws
 * @param {string[]} keys
 * @returns {string[]} the keys whose ASCII bytes occur in any of the files, sorted, each once
 */
function scanForKeys(paths, keys) {
  const found = new Set();
  for (const p of paths) {
    let bytes;
    try {
      bytes = fs.readFileSync(p);
    } catch (err) {
      if (err.code === 'ENOENT') continue; // no -wal yet, or a staged file's
      throw err;
    }
    for (const k of keys) if (bytes.includes(Buffer.from(k, 'ascii'))) found.add(k);
  }
  return [...found].sort();
}

/**
 * Removes every entry inside the directory and keeps the directory. Never follows a link.
 * @returns {'absent' | 'emptied'} throws on a removal failure
 */
function emptyExports(exportsDir) {
  let entries;
  try {
    entries = fs.readdirSync(exportsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 'absent';
    throw err;
  }
  // rmSync removes a symlink itself, never its target.
  for (const e of entries) fs.rmSync(path.join(exportsDir, e), { recursive: true, force: true });
  return 'emptied';
}

module.exports = { checkpointBusy, compact, scanForKeys, emptyExports };
