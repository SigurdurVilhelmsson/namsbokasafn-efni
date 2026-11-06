/**
 * The lazy handle on the research file, research.db (spec §5.1).
 *
 * - better-sqlite3's default busy wait is 5000 ms and synchronous: it blocks the
 *   event loop. A short wait (BUSY_TIMEOUT_MS) turns a blocked write into a
 *   counted loss instead of a stalled server.
 * - The file is created only by `openSync(…, 0o600)`, and only while no
 *   `consented` row exists: a fresh file would re-key every editor and detach the
 *   data already captured, so once anyone has consented a missing file is an
 *   outage, never a reason to start over.
 * - Safe integers are on (decision 4): ids above 2^53 survive the round trip, and
 *   so a pragma on this handle reads as a BigInt.
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

let state = { handle: null, reason: null, lastAttemptAtMs: null, sticky: false };
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
    if (!fs.existsSync(researchPath)) {
      let consented;
      try {
        consented = researchConsent.anyConsentedRow();
      } catch {
        return fail('consent-unavailable'); // cannot tell whether creating would re-key editors: do not create
      }
      if (consented) return fail('missing');
      fs.closeSync(fs.openSync(researchPath, 'a', 0o600));
    }
    for (const p of [researchPath, `${researchPath}-wal`, `${researchPath}-shm`]) {
      if (fs.existsSync(p)) fs.chmodSync(p, 0o600);
    }
    db = new Database(researchPath, { timeout: BUSY_TIMEOUT_MS, fileMustExist: true });
    db.defaultSafeIntegers(true);
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
    state = { handle: db, reason: null, lastAttemptAtMs: state.lastAttemptAtMs, sticky: false };
    return { ok: true };
  } catch (err) {
    if (db && db.open) db.close();
    return fail(isCorrupt(err.code) ? 'corrupt' : 'unavailable', err.code || err.name);
  }
}

/**
 * @returns {import('better-sqlite3').Database}
 * @throws {Error & {code: 'RESEARCH_UNAVAILABLE', reason: string}}
 */
function getHandle() {
  if (testDb) return testDb;
  if (state.handle) return state.handle;
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
  }
}

function closeHandle() {
  if (state.handle && state.handle.open) state.handle.close();
  state.handle = null;
}

/** Test-only; also "a restart". Leaves testPaths and testDb as they are. */
function _reset() {
  closeHandle();
  state = { handle: null, reason: null, lastAttemptAtMs: null, sticky: false };
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
