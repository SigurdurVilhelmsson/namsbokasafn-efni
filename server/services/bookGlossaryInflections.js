/**
 * bookGlossaryInflections — fetch a book-glossary entry's Icelandic inflections from BÍN in the
 * background (design §5.4).
 *
 * After a head editor adds an entry or changes its Icelandic, the route answers at once and calls
 * schedule(). This service then runs server/scripts/fetch-bin-inflections.js, restricted to that
 * entry's Icelandic concept_term rows, so the script's own rules decide everything (part of speech,
 * refusing an ambiguous string, skipping a multi-word one). The script is never reimplemented here.
 *
 * - One lookup runs at a time per server: BÍN's file is large and a lookup reads all of it.
 * - A repeat schedule for a concept that is queued and has not started is dropped, because that
 *   lookup reads the entry's text only when it starts. A repeat for a concept whose lookup is
 *   running is kept, so a change made mid-lookup always ends with a lookup of the new text (the
 *   script itself refuses to write the old word's forms onto the new word: plan ruling P6).
 * - A child that never exits is killed after ten minutes and the queue moves on (plan ruling P9).
 * - Every result is written to the activity log; nothing here throws, because a lookup must never
 *   break the request that triggered it. Results are kept in memory for the page to read.
 *
 * Follows tmService's pattern: an injectable child-process runner behind a never-throwing wrapper.
 */
// Called as childProcess.spawn, not destructured, so a test can watch the real spawn's options.
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../lib/logger');
const activityLog = require('./activityLog');
const { getDb } = require('./bookGlossaryDb');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'fetch-bin-inflections.js');
// The licensed BÍN file stays out of the repository; dev boxes and CI do not have it.
const DEFAULT_BIN_DATA = path.join(PROJECT_ROOT, 'tools', 'data', 'SHsnid.csv');
const TIMEOUT_MS = 10 * 60 * 1000; // plan ruling P9
const STDERR_KEEP = 4000;

const RESULTS = Object.freeze([
  'forms',
  'not-in-bin',
  'ambiguous',
  'base-form-only',
  'several-words',
  'file-absent',
  'already',
  'superseded',
  'no-term',
  'timeout',
  'error',
]);

/**
 * Default runner: one child process of the inflection script, with its report read back from a
 * temp file that is always deleted (the report carries BÍN ids, which must not be left lying around).
 * Never rejects: a spawn failure resolves with `code: null`.
 *
 * @param {{conceptTermIds: number[], binDataPath: string, dbPath: string}} a
 * @returns {Promise<{code: number|null, signal: string|null, report: object|null, stderr: string}>}
 */
function defaultRunner({ conceptTermIds, binDataPath, dbPath }) {
  return new Promise((resolve) => {
    let tmpDir = null;
    let stderr = '';
    let settled = false;
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      let report = null;
      try {
        if (tmpDir) report = JSON.parse(fs.readFileSync(path.join(tmpDir, 'report.json'), 'utf-8'));
      } catch {
        report = null; // absent or unreadable: the caller records 'error', never a guess
      } finally {
        if (tmpDir) {
          try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          } catch (err) {
            log.warn({ err, tmpDir }, 'could not delete the BÍN lookup report');
          }
        }
      }
      resolve({ code, signal, report, stderr });
    };
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-inflections-report-'));
      // The server's own Node executable, not whatever `node` PATH resolves to: the child loads the
      // native better-sqlite3 build, which only matches the runtime that installed it.
      const child = childProcess.spawn(
        process.execPath,
        [
          SCRIPT,
          '--db',
          dbPath,
          '--bin-data',
          binDataPath,
          '--execute',
          '--concept-term-ids',
          conceptTermIds.join(','),
          '--report',
          path.join(tmpDir, 'report.json'),
        ],
        // stdout is ignored, so an unread pipe can never fill up and stall the child.
        { cwd: PROJECT_ROOT, timeout: TIMEOUT_MS, stdio: ['ignore', 'ignore', 'pipe'] }
      );
      child.stderr.on('data', (d) => {
        if (stderr.length < STDERR_KEEP) stderr += d.toString();
      });
      child.on('error', (err) => {
        stderr += String(err && err.message);
        // Only a child that never started is finished here; a running one still ends on 'close',
        // and finishing early would let the next lookup start beside it.
        if (child.pid === undefined) finish(null, null);
      });
      child.on('close', (code, signal) => finish(code, signal));
    } catch (err) {
      stderr += String(err && err.message);
      finish(null, null);
    }
  });
}

/**
 * Map one run to its result. Total: anything that matches no branch is 'error', so a report the
 * service cannot read is never shown as "nothing to do".
 */
function resultOf(outcome) {
  const { code, signal, report } = outcome || {};
  if (signal) return 'timeout';
  if (code !== 0) return 'error';
  const strings = report && report.strings;
  const rows = report && report.rows;
  if (!strings || !rows) return 'error';
  if (rows.superseded > 0) return 'superseded';
  if (rows.written > 0) return 'forms';
  // An entry has one Icelandic string, so at most one bucket is non-zero. The order only fixes
  // the answer for a concept that holds more than one.
  if (strings.notInBin > 0) return 'not-in-bin';
  if (strings.refusedAmbiguous > 0 || strings.refusedNoNoun > 0) return 'ambiguous';
  if (strings.baseFormOnly > 0) return 'base-form-only';
  if (strings.total === 0) return 'already';
  return 'error';
}

let runner = defaultRunner;
let binDataPath = DEFAULT_BIN_DATA;

/** One lookup for one concept: its result and, when a child ran, the runner's outcome. */
async function lookupOne(conceptId) {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, text FROM concept_term WHERE concept_id = ? AND lang = 'is' ORDER BY id")
    .all(conceptId);
  if (rows.length === 0) return { result: 'no-term' };
  if (!fs.existsSync(binDataPath)) return { result: 'file-absent' };
  // The script's own test for a multi-word string (a literal space), so the two never disagree.
  if (rows.every((r) => r.text.includes(' '))) return { result: 'several-words' };
  const outcome = await runner({
    conceptTermIds: rows.map((r) => r.id),
    binDataPath,
    // The file this service's own connection has open, never resolveDbPath(): in a test without
    // SESSIONS_DB_PATH that names the developer's real sessions.db. Resolved because the child
    // runs from the project root while the server runs from server/, so a relative name would
    // point the child at a different file.
    dbPath: path.resolve(db.name),
  });
  return { result: resultOf(outcome), outcome };
}

function record(item, result, outcome) {
  const { conceptId, ctx } = item;
  if (result === 'error' || result === 'timeout') {
    log.warn(
      {
        conceptId,
        result,
        code: outcome ? outcome.code : undefined,
        signal: outcome ? outcome.signal : undefined,
        stderr: outcome && outcome.stderr ? outcome.stderr.slice(0, 500) : undefined,
      },
      'book glossary inflection lookup did not finish'
    );
  }
  activityLog.log({
    type: activityLog.ACTIVITY_TYPES.BOOK_GLOSSARY_INFLECTIONS,
    userId: ctx.userId,
    username: ctx.username,
    book: ctx.book,
    description: `Beygingar orðasafns sóttar fyrir hugtak ${conceptId}: ${result}`,
    metadata: { conceptId, result },
  });
}

const queue = []; // lookups not yet started: [{conceptId, ctx}]
let running = null; // the concept whose lookup is under way
const results = new Map(); // conceptId -> the latest finished result
let draining = null; // the drain's promise while it runs

async function drain() {
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      running = item.conceptId;
      let result = 'error';
      let outcome;
      try {
        ({ result, outcome } = await lookupOne(item.conceptId));
      } catch (err) {
        result = 'error';
        log.error({ err, conceptId: item.conceptId }, 'book glossary inflection lookup failed');
      }
      // Both in one synchronous step, so status() never sees the concept as neither pending nor done.
      results.set(item.conceptId, result);
      running = null;
      try {
        record(item, result, outcome);
      } catch (err) {
        log.error({ err, conceptId: item.conceptId }, 'book glossary inflection result not logged');
      }
    }
  } finally {
    draining = null;
  }
}

/**
 * Queue a lookup for an entry and start the drain. Never throws.
 *
 * @param {number} conceptId the entry's concept
 * @param {{book: string, userId: string, username: string}} ctx who triggered it, for the activity log
 */
function schedule(conceptId, ctx) {
  try {
    if (queue.some((q) => q.conceptId === conceptId)) return;
    queue.push({ conceptId, ctx: ctx || {} });
    if (!draining) draining = drain();
  } catch (err) {
    log.error({ err, conceptId }, 'book glossary inflection lookup could not be scheduled');
  }
}

/**
 * The lookup state for a concept, in memory: pending while queued or running, else the latest
 * finished result, else null (never looked up since the server started).
 *
 * @param {number} conceptId
 * @returns {{state: 'pending'} | {state: 'done', result: string} | null}
 */
function status(conceptId) {
  if (running === conceptId || queue.some((q) => q.conceptId === conceptId)) {
    return { state: 'pending' };
  }
  if (results.has(conceptId)) return { state: 'done', result: results.get(conceptId) };
  return null;
}

/** @internal Test-only: inject a runner. Pass nothing to restore the default. */
function _setRunner(fn) {
  runner = fn || defaultRunner;
}

/** @internal Test-only: point at another BÍN file. Pass nothing to restore the default. */
function _setBinDataPath(p) {
  binDataPath = p || DEFAULT_BIN_DATA;
}

/** @internal Test-only: resolves once the queue is empty, including lookups queued meanwhile. */
function _idle() {
  return draining || Promise.resolve();
}

module.exports = {
  schedule,
  status,
  RESULTS,
  _setRunner,
  _setBinDataPath,
  _idle,
  _defaultRunner: defaultRunner,
};
