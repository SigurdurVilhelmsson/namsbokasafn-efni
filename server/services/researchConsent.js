/**
 * Research consent: the editor's decision state, consent intervals and the content-free loss
 * ledger (G1.2 PR3; spec §5.11 and §5.14).
 *
 * Why this lives in sessions.db: it gates every research event, so it has to keep working while
 * the research file is down. The handle is lazy and WAL, like activityLog's, but the path is read
 * from resolveDbPath() at the first call, never captured at module load.
 *
 * "Current" is the HIGHEST id of a user's rows, never the latest time: a clock step must not
 * resurrect an older decision. An interval is a starting 'consented' row (interval_id = its own
 * id) plus renewal rows that carry its id; withdrawal is recorded once, on the starting row.
 *
 * No route displays a decision but the caller's own. recordLoss never throws and carries no
 * content: ids, a book, a chapter, a module, an event type, a UTC day and an error class only.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');
const resolveDbPath = require('../lib/dbPath');
const { isApprovedText } = require('../lib/researchConsentText');

let _testDb = null;
let _db = null;

/** @param {import('better-sqlite3').Database | null} db test-only; null restores the real handle */
function _setTestDb(db) {
  _testDb = db;
}

/** @returns {import('better-sqlite3').Database} the sessions.db handle, opened at the first call */
function getSessionsDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

/** The user's latest row and, when it is a consent, the live starting row of its interval. */
function latestAndLive(conn, userId) {
  const latest = conn
    .prepare('SELECT * FROM research_consent WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId);
  if (!latest || latest.decision !== 'consented') return { latest, live: null };
  const start = conn
    .prepare('SELECT * FROM research_consent WHERE id = ? AND user_id = ?')
    .get(latest.interval_id, userId);
  return { latest, live: start && start.withdrawn_at_ms === null ? start : null };
}

/**
 * @param {number} userId
 * @returns {{ state: 'undecided' | 'consented' | 'declined' | 'withdrawn', decidedTextVersion: string | null }}
 */
function decisionStateFor(userId) {
  const { latest, live } = latestAndLive(getSessionsDb(), userId);
  if (!latest) return { state: 'undecided', decidedTextVersion: null };
  const decidedTextVersion = latest.consent_text_version;
  if (latest.decision === 'declined') return { state: 'declined', decidedTextVersion };
  return { state: live ? 'consented' : 'withdrawn', decidedTextVersion };
}

/**
 * Records one decision in one transaction. Throws TypeError, writing nothing, on a bad decision
 * or a text that is not approved.
 * @param {{ userId: number, decision: 'consented' | 'declined', text: { version: string, sha256: string }, nowMs: number }} args
 * @returns {{ outcome: 'started' | 'renewed' | 'unchanged' | 'withdrew' | 'declined', intervalId: number | null }}
 */
function recordDecision({ userId, decision, text, nowMs }) {
  if (decision !== 'consented' && decision !== 'declined') {
    throw new TypeError(`recordDecision: bad decision ${String(decision)}`);
  }
  if (!text || !isApprovedText(text.version, text.sha256)) {
    throw new TypeError('recordDecision: the consent text is not an approved text');
  }
  const conn = getSessionsDb();
  const insert = conn.prepare(
    `INSERT INTO research_consent
       (user_id, decision, interval_id, consent_text_version, consent_text_sha256, given_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  return conn.transaction(() => {
    const { latest, live } = latestAndLive(conn, userId);
    if (decision === 'declined') {
      if (live) {
        conn
          .prepare('UPDATE research_consent SET withdrawn_at_ms = ? WHERE id = ?')
          .run(nowMs, live.id);
      }
      insert.run(userId, 'declined', null, text.version, text.sha256, nowMs);
      return live
        ? { outcome: 'withdrew', intervalId: live.id }
        : { outcome: 'declined', intervalId: null };
    }
    if (live) {
      if (
        latest.consent_text_version === text.version &&
        latest.consent_text_sha256 === text.sha256
      ) {
        return { outcome: 'unchanged', intervalId: live.id };
      }
      insert.run(userId, 'consented', live.id, text.version, text.sha256, nowMs);
      return { outcome: 'renewed', intervalId: live.id };
    }
    // A starting row is inserted with a NULL interval_id and filled in the same transaction.
    const id = Number(
      insert.run(userId, 'consented', null, text.version, text.sha256, nowMs).lastInsertRowid
    );
    conn.prepare('UPDATE research_consent SET interval_id = id WHERE id = ?').run(id);
    return { outcome: 'started', intervalId: id };
  })();
}

/**
 * Withdraws the live interval: sets withdrawn_at_ms once on its starting row, inserts nothing.
 * @param {{ userId: number, nowMs: number }} args
 * @returns {{ withdrawn: boolean, intervalId: number | null }}
 */
function withdraw({ userId, nowMs }) {
  const conn = getSessionsDb();
  return conn.transaction(() => {
    const { live } = latestAndLive(conn, userId);
    if (!live) return { withdrawn: false, intervalId: null };
    const res = conn
      .prepare(
        'UPDATE research_consent SET withdrawn_at_ms = ? WHERE id = ? AND withdrawn_at_ms IS NULL'
      )
      .run(nowMs, live.id);
    return res.changes > 0
      ? { withdrawn: true, intervalId: live.id }
      : { withdrawn: false, intervalId: null };
  })();
}

/**
 * Whether capture is on for the user. THROWS when the read fails (record turns that into
 * consent-unknown).
 * @param {number} userId
 * @returns {{ capturing: false } | { capturing: true, intervalId: number, startedAtMs: number }}
 */
function captureStateFor(userId) {
  const { latest, live } = latestAndLive(getSessionsDb(), userId);
  if (!live || !isApprovedText(latest.consent_text_version, latest.consent_text_sha256)) {
    return { capturing: false };
  }
  return { capturing: true, intervalId: live.id, startedAtMs: live.given_at_ms };
}

/**
 * Any 'consented' row at all, withdrawn or not (§5.1's missing-file rule). Throws on a failed read.
 * @returns {boolean}
 */
function anyConsentedRow() {
  return !!getSessionsDb()
    .prepare("SELECT 1 AS x FROM research_consent WHERE decision = 'consented' LIMIT 1")
    .get();
}

/**
 * Writes one content-free loss row. Never throws. With a clientActionId, a row already holding
 * the same (interval_id, client_action_id) makes it write nothing and return true.
 * @returns {boolean} false only when the write itself failed
 */
function recordLoss(loss) {
  try {
    const { intervalId, book, chapter, moduleId, eventType, errorClass, clientActionId, nowMs } =
      loss;
    const lossDay = new Date(nowMs).toISOString().slice(0, 10);
    const action = clientActionId === undefined ? null : clientActionId;
    getSessionsDb()
      .prepare(
        `INSERT INTO research_capture_losses
           (interval_id, book, chapter, module_id, event_type, loss_day, error_class, client_action_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ? IS NULL OR NOT EXISTS (
           SELECT 1 FROM research_capture_losses WHERE interval_id IS ? AND client_action_id = ?)`
      )
      .run(
        intervalId,
        book,
        chapter,
        moduleId,
        eventType,
        lossDay,
        errorClass,
        action,
        action,
        intervalId,
        action
      );
    return true;
  } catch (err) {
    logger.error(
      { errorCode: err.code || err.name },
      'research loss ledger write failed (spec §5.11)'
    );
    return false;
  }
}

module.exports = {
  getSessionsDb,
  decisionStateFor,
  recordDecision,
  withdraw,
  captureStateFor,
  anyConsentedRow,
  recordLoss,
  _setTestDb,
};
