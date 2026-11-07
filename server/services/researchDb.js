/**
 * The lazy handle on the research file, research.db (spec §5.1).
 *
 * - better-sqlite3's default busy wait is 5000 ms and synchronous: it blocks the
 *   event loop. A short wait (BUSY_TIMEOUT_MS) turns a blocked write into a
 *   counted loss instead of a stalled server.
 * - The file is created only by `openSync(…, 0o600)`, and only while no
 *   `consented` row exists: a fresh file would re-key every editor and detach the
 *   data already captured, so once anyone has consented a missing file (or an
 *   existing one with no schema) is an outage, never a reason to start over.
 * - Safe integers are on (decision 4): ids above 2^53 survive the round trip, and
 *   so a pragma on this handle reads as a BigInt.
 * - An open handle is re-checked against its path on every getHandle (one stat): a
 *   file deleted, moved or replaced under it would otherwise keep taking writes into
 *   an inode nobody can read again. Such a handle is closed and the path decided as
 *   at open, so a deleted file is the missing-file case above.
 * - Routes never require this module (T17); they go through researchEmission.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const log = require('../lib/logger');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { ensureResearchSchema } = require('../lib/researchSchema');
const researchConsent = require('./researchConsent');

const BUSY_TIMEOUT_MS = 100;
const RETRY_INTERVAL_MS = 60_000;
const STICKY = new Set(['corrupt', 'same-path']);
const unavailable = (reason) =>
  Object.assign(new Error(`research file unavailable: ${reason}`), {
    code: 'RESEARCH_UNAVAILABLE',
    reason,
  });
const isCorrupt = (code) => code === 'SQLITE_NOTADB' || /^SQLITE_CORRUPT/.test(code || '');

// `file` is the path the handle was opened on and that file's identity then (device and inode).
let state = { handle: null, file: null, reason: null, lastAttemptAtMs: null, sticky: false };
let testDb = null;
let testPaths = null;

function fail(reason, errorCode) {
  state.handle = null;
  state.reason = reason;
  state.sticky = STICKY.has(reason);
  log.warn({ reason, errorCode: errorCode || null }, 'research file unavailable (spec §5.1)');
  return { ok: false, reason };
}

function attemptOpen() {
  state.lastAttemptAtMs = Date.now();
  let db = null;
  // ONE try around everything after the timestamp: a creation failure (EACCES, ENOENT, ENOSPC) must leave through
  // fail() as RESEARCH_UNAVAILABLE (decision 20), never escape getHandle() as a raw error with a stale reason.
  try {
    const { researchPath, editorialPath } = testPaths || resolveResearchDbPath();
    if (researchPath === editorialPath) return fail('same-path');
    // Would starting this file's schema re-key editors? Only if somebody has consented.
    const consentedOrReason = () => {
      try {
        return researchConsent.anyConsentedRow() ? 'missing' : null;
      } catch {
        return 'consent-unavailable'; // cannot tell: do not create or initialise
      }
    };
    if (!fs.existsSync(researchPath)) {
      const reason = consentedOrReason();
      if (reason) return fail(reason);
      fs.closeSync(fs.openSync(researchPath, 'a', 0o600));
    }
    for (const p of [researchPath, `${researchPath}-wal`, `${researchPath}-shm`]) {
      if (fs.existsSync(p)) fs.chmodSync(p, 0o600);
    }
    db = new Database(researchPath, { timeout: BUSY_TIMEOUT_MS, fileMustExist: true });
    db.defaultSafeIntegers(true);
    // An existing file with no schema (zero bytes, or user_version 0 and no tables) is as good as missing: the
    // schema would mint a fresh set of keys. Look BEFORE the WAL pragma, which writes to an empty file.
    const hasSchema =
      db.pragma('user_version', { simple: true }) !== 0n ||
      db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get() !== undefined;
    if (!hasSchema) {
      const reason = consentedOrReason();
      if (reason) {
        db.close();
        return fail(reason);
      }
    }
    db.pragma('journal_mode = WAL');
    const schema = ensureResearchSchema(db);
    if (!schema.ok) {
      db.close();
      return fail(isCorrupt(schema.code) ? 'corrupt' : 'unavailable', schema.code);
    }
    // WAL sidecars exist only now; keep them as private as the main file.
    for (const p of [`${researchPath}-wal`, `${researchPath}-shm`]) {
      if (fs.existsSync(p)) fs.chmodSync(p, 0o600);
    }
    const { dev, ino } = fs.statSync(researchPath);
    state = {
      handle: db,
      file: { path: researchPath, dev, ino },
      reason: null,
      lastAttemptAtMs: state.lastAttemptAtMs,
      sticky: false,
    };
    return { ok: true };
  } catch (err) {
    if (db && db.open) db.close();
    return fail(isCorrupt(err.code) ? 'corrupt' : 'unavailable', err.code || err.name);
  }
}

/** Whether the open handle's path still names the file it was opened on. One stat; never throws. */
function stillAtPath() {
  try {
    const st = fs.statSync(state.file.path, { throwIfNoEntry: false });
    return st !== undefined && st.ino === state.file.ino && st.dev === state.file.dev;
  } catch {
    return false;
  }
}

/**
 * @returns {import('better-sqlite3').Database}
 * @throws {Error & {code: 'RESEARCH_UNAVAILABLE', reason: string}}
 */
function getHandle() {
  if (testDb) return testDb;
  if (state.handle) {
    if (stillAtPath()) return state.handle;
    // Deleted, moved or replaced under the handle: close it and decide the path as at open, not after the
    // retry minute. A missing file is never recreated while a consented row exists (spec §5.1); a replaced
    // one is opened.
    closeHandle();
    const r = attemptOpen();
    if (!r.ok) throw unavailable(r.reason);
    return state.handle;
  }
  if (state.sticky) throw unavailable(state.reason);
  if (state.lastAttemptAtMs !== null && Date.now() - state.lastAttemptAtMs < RETRY_INTERVAL_MS) {
    throw unavailable(state.reason || 'unavailable');
  }
  const r = attemptOpen();
  if (!r.ok) throw unavailable(r.reason);
  return state.handle;
}

/** Always attempts once; never throws.
 * @returns {{ok: true} | {ok: false, reason: string}} */
function openAtBoot() {
  try {
    return attemptOpen();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** @returns {{state: 'unopened'|'open'|'unavailable', reason: string|null, lastAttemptAtMs: number|null, sticky: boolean}} */
function status() {
  const s = state.handle ? 'open' : state.lastAttemptAtMs === null ? 'unopened' : 'unavailable';
  return {
    state: s,
    reason: state.reason,
    lastAttemptAtMs: state.lastAttemptAtMs,
    sticky: state.sticky,
  };
}

/**
 * A caller's write failed: decide whether the handle is still any good.
 * @param {{code?: string}} err
 */
function noteFailure(err) {
  const code = (err && err.code) || '';
  if (isCorrupt(code)) {
    closeHandle();
    state.reason = 'corrupt';
    state.sticky = true;
  } else if (/^SQLITE_IOERR/.test(code)) {
    closeHandle();
    state.reason = 'unavailable';
    state.sticky = false;
    state.lastAttemptAtMs = Date.now(); // the reopen waits its minute (§5.1)
  } else if (code === 'SQLITE_READONLY_DBMOVED') {
    // The file was moved or deleted under the handle: the missing-file case. The reopen waits its minute
    // and, while a consented row exists, never recreates the file (§5.1).
    closeHandle();
    state.reason = 'missing';
    state.sticky = false;
    state.lastAttemptAtMs = Date.now();
  }
}

function closeHandle() {
  try {
    if (state.handle && state.handle.open) state.handle.close();
  } catch {
    // A handle whose file is gone must still be dropped: the next getHandle decides from the path.
  }
  state.handle = null;
  state.file = null;
}

/** Test-only; also "a restart". Leaves testPaths and testDb as they are. */
function _reset() {
  closeHandle();
  state = { handle: null, file: null, reason: null, lastAttemptAtMs: null, sticky: false };
}

/** Test-only. @param {{researchPath: string, editorialPath: string}|null} p */
function _setTestPaths(p) {
  _reset(); // else getHandle() keeps returning the handle it holds and never reads the new paths
  testPaths = p;
}

/** Test-only. @param {import('better-sqlite3').Database|null} db */
function _setTestDb(db) {
  testDb = db;
}

module.exports = {
  BUSY_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  getHandle,
  openAtBoot,
  status,
  noteFailure,
  _setTestDb,
  _setTestPaths,
  _reset,
};
