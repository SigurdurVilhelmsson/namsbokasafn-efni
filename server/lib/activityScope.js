/**
 * Whose activity log a reader may see ([USER] 2026-11-14, answer 5).
 *
 * The log says who saved or approved what, and when. Every read of it follows one rule:
 *
 *   an admin reads every book's log;
 *   anyone else reads the log of the books they hold or are assigned to.
 *
 * "Hold or are assigned to" is a book-access row (head editor or editor) or a chapter assignment. The
 * session's `books` are the head editor's books; the account row adds the rest. A session with no account
 * row has only what its token holds.
 *
 * One function, used by every route that returns log rows, so a restriction on one read cannot be walked
 * around through another (the state before this file: the search was held to a head editor's books while
 * the timeline, the per-section read and the dashboard returned the same rows to any editor).
 */

const { ROLES } = require('../constants');
const userService = require('../services/userService');

/**
 * @param {{id: string, role: string, books?: string[]}} user  `req.user`
 * @returns {string[]|null} the slugs of the books whose log this reader may see; `null` means every book
 */
function readableLogBooks(user) {
  if (!user) return [];
  if (user.role === ROLES.ADMIN) return null;

  const books = new Set(user.books || []);
  const row = userService.findByProviderId(user.id);
  if (row) {
    for (const slug of userService.getBooksWorkedOn(row.id)) books.add(slug);
  }
  return [...books];
}

/** Whether this reader may see the log of `book`. */
function mayReadLogOf(user, book) {
  const books = readableLogBooks(user);
  return books === null || (typeof book === 'string' && books.includes(book));
}

/**
 * The books whose people this reader may see in a PER-PERSON figure (SD7, as answered on 2026-11-21:
 * docs/decisions/2026-11-21-g115-editor-privacy-split-and-sd7-scope.md). A different, narrower rule than
 * the log's: the log's rows follow every book a reader works on (readableLogBooks above), while a count or
 * total per person follows only the books the reader HEADS. A head editor who is an editor on another book
 * reads that book's log rows and sees none of its people in the dashboard's workload, the analytics' team
 * metrics or the meeting agenda's activity counts.
 *
 * `user.books` is the head editor's books: requireAuth refreshes it from the account row on every request
 * (services/auth.js currentAccess), and a session with no account row carries its token's.
 *
 * @param {{role: string, books?: string[]}} user  `req.user`
 * @returns {string[]|null} the slugs of the books the reader heads; `null` means every book (an admin)
 */
function headedBooks(user) {
  if (!user) return [];
  if (user.role === ROLES.ADMIN) return null;
  return [...new Set(user.books || [])];
}

/** The 403 every log read answers for a book that is not the reader's. It names no row and no person. */
function refuseOtherBook(res, book) {
  return res.status(403).json({
    error: 'Insufficient permissions',
    code: 'NOT_YOUR_BOOK',
    message: `The activity log of ${book} is for the people who work on that book`,
  });
}

module.exports = { readableLogBooks, mayReadLogOf, refuseOtherBook, headedBooks };
