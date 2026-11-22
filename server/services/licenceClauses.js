// server/services/licenceClauses.js — the record that an editor signed the licence clause (G1.13 spec §6.4).
//
// Rows are append-only (migration 060) and never touched by the retention steps. Only admins write them, through
// routes/admin.js. `nowMs` is a parameter so the "not in the future" rule never depends on the clock of the test.

function refusal(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * True for a real calendar date written YYYY-MM-DD ('2026-02-30' and '2026-13-01' are not).
 * @param {unknown} s
 * @returns {boolean}
 */
function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC maps years 0-99 to 1900-1999, so a year below 1000 is refused rather than round-tripped.
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1000;
}

/**
 * Record one signature date for an account.
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ userId: number, signedOn: string, recordedBy: string, nowMs: number }} args
 * @returns {{ id: number }}
 * @throws {Error & { code: 'BAD_DATE' | 'FUTURE_DATE' }}
 */
function recordClause(conn, { userId, signedOn, recordedBy, nowMs }) {
  if (!isRealDate(signedOn)) {
    throw refusal(
      'BAD_DATE',
      'Dagsetning verður að vera raunveruleg dagsetning á forminu ÁÁÁÁ-MM-DD'
    );
  }
  if (signedOn > new Date(nowMs).toISOString().slice(0, 10)) {
    throw refusal('FUTURE_DATE', 'Undirritun getur ekki verið dagsett fram í tímann');
  }
  const res = conn
    .prepare(
      'INSERT INTO editor_licence_clauses (user_id, signed_on, recorded_by, recorded_at_ms) VALUES (?, ?, ?, ?)'
    )
    .run(userId, signedOn, recordedBy, nowMs);
  return { id: Number(res.lastInsertRowid) };
}

/**
 * @param {import('better-sqlite3').Database} conn
 * @param {number} userId
 * @returns {Array<{ id: number, signedOn: string, recordedBy: string, recordedAtMs: number }>} oldest first
 */
function clausesFor(conn, userId) {
  return conn
    .prepare(
      `SELECT id, signed_on AS signedOn, recorded_by AS recordedBy, recorded_at_ms AS recordedAtMs
         FROM editor_licence_clauses WHERE user_id = ? ORDER BY id`
    )
    .all(userId);
}

/** The latest signature date recorded for the account, or null. */
function latestSignedOn(conn, userId) {
  const row = conn
    .prepare('SELECT MAX(signed_on) AS d FROM editor_licence_clauses WHERE user_id = ?')
    .get(userId);
  return row.d || null;
}

/** True when at least one clause is recorded for the account. */
function hasClause(conn, userId) {
  return !!conn
    .prepare('SELECT 1 FROM editor_licence_clauses WHERE user_id = ? LIMIT 1')
    .get(userId);
}

/**
 * Remove one row; false when the row is not this user's (or does not exist).
 * @param {import('better-sqlite3').Database} conn
 * @param {{ userId: number, rowId: number }} args
 * @returns {boolean}
 */
function removeClause(conn, { userId, rowId }) {
  return (
    conn
      .prepare('DELETE FROM editor_licence_clauses WHERE id = ? AND user_id = ?')
      .run(rowId, userId).changes > 0
  );
}

module.exports = { isRealDate, recordClause, clausesFor, latestSignedOn, hasClause, removeClause };
