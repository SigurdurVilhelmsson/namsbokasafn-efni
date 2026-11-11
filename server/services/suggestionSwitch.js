// server/services/suggestionSwitch.js — the writer of the per-book 'suggestion-view' switch (G1.23).
//
// bookSwitches.js only reads; this is the one place that inserts book_switch_events rows for the
// suggestion view. A switch's history is its rows: no row is OFF, the highest-id row is the current
// value, and the lowest-id value-1 row is the FIRST switch-on, which the study's analysis keys on.
// Never send a switch time to a browser.
//
// Check order in setSuggestionView (the route and its tests rely on it):
//   NOT_A_STUDY_BOOK -> repeat of the current value (no row) -> CONFIRM_REQUIRED
//   -> CLOSED_BEFORE_SWITCH_ON -> insert one row.
// The reads and the insert run in ONE immediate transaction, so a second writer cannot interleave
// between the compare and the insert.
//
// CLOSED_BEFORE_SWITCH_ON (PR2's R21): until the view is first switched on, any editor with chapter
// access can post a reject, and a Staðfesta MT or an approval records suggestions left open, closing
// groups that were never offered. The FIRST switch-on therefore refuses while closure rows exist for
// the book. After the first switch-on the check never runs again: rows written after go-live are
// legitimate, and off -> on is the kill switch working. There is no override.

const log = require('../lib/logger');
const { currentSwitchValue, firstSwitchOnMs } = require('../lib/bookSwitches');
const { isStudyBook } = require('../lib/researchScope');

const SWITCH_NAME = 'suggestion-view';

function refusal(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ book: string, enabled: boolean, confirmBook?: string, nowMs: number }} args
 * @returns {{ changed: boolean, enabled: boolean }}
 * @throws {Error & { code: 'NOT_A_STUDY_BOOK' | 'CONFIRM_REQUIRED' | 'CLOSED_BEFORE_SWITCH_ON' }}
 */
function setSuggestionView(conn, { book, enabled, confirmBook, nowMs }) {
  if (!isStudyBook(book)) {
    throw refusal('NOT_A_STUDY_BOOK', `The suggestion view is not available for ${book}`);
  }
  const want = !!enabled;
  return conn
    .transaction(() => {
      if (currentSwitchValue(conn, book, SWITCH_NAME) === want) {
        return { changed: false, enabled: want };
      }
      if (want && firstSwitchOnMs(conn, book, SWITCH_NAME) === null) {
        if (confirmBook !== book) {
          throw refusal('CONFIRM_REQUIRED', 'Type the book name to switch the view on');
        }
        const rejected = conn
          .prepare('SELECT COUNT(*) AS n FROM suggestion_rejections WHERE book = ?')
          .get(book).n;
        const leftOpen = conn
          .prepare('SELECT COUNT(*) AS n FROM suggestion_left_open WHERE book = ?')
          .get(book).n;
        if (rejected > 0 || leftOpen > 0) {
          log.warn(
            { book, rejected, leftOpen },
            'Suggestion view first switch-on refused: closures exist'
          );
          throw refusal(
            'CLOSED_BEFORE_SWITCH_ON',
            'Suggestions were already closed in this book before the first switch-on'
          );
        }
      }
      conn
        .prepare(
          'INSERT INTO book_switch_events (book, switch_name, value, switched_at_ms) VALUES (?, ?, ?, ?)'
        )
        .run(book, SWITCH_NAME, want ? 1 : 0, nowMs);
      return { changed: true, enabled: want };
    })
    .immediate();
}

/**
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {string} book
 * @returns {{ book: string, enabled: boolean }} Never a time.
 */
function getSuggestionView(conn, book) {
  return { book, enabled: currentSwitchValue(conn, book, SWITCH_NAME) };
}

module.exports = { SWITCH_NAME, setSuggestionView, getSuggestionView };
