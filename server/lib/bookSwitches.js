// server/lib/bookSwitches.js — the per-book switch readers (spec §5.13).
//
// A switch's history is the rows of book_switch_events. No row is OFF. The current value is
// the highest-id row's; the FIRST switch-on is the lowest-id row with value 1 — by id, not by
// earliest time, because a clock step or a manual insert can give a later row an earlier time
// and the first switch-on must not move. G1.23 writes the rows; this file only reads.
// Never send a switch time to a browser (spec §11).

const SWITCH_NAMES = Object.freeze(['suggestion-view']);

/**
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {string} book
 * @param {string} name One of SWITCH_NAMES.
 * @returns {boolean}
 */
function currentSwitchValue(conn, book, name) {
  const row = conn
    .prepare(
      'SELECT value FROM book_switch_events WHERE book = ? AND switch_name = ? ORDER BY id DESC LIMIT 1'
    )
    .get(book, name);
  return !!row && row.value === 1;
}

/**
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {string} book
 * @param {string} name One of SWITCH_NAMES.
 * @returns {number|null} switched_at_ms of the lowest-id row with value 1, or null.
 */
function firstSwitchOnMs(conn, book, name) {
  const row = conn
    .prepare(
      'SELECT switched_at_ms FROM book_switch_events WHERE book = ? AND switch_name = ? AND value = 1 ORDER BY id ASC LIMIT 1'
    )
    .get(book, name);
  return row ? row.switched_at_ms : null;
}

module.exports = { SWITCH_NAMES, currentSwitchValue, firstSwitchOnMs };
