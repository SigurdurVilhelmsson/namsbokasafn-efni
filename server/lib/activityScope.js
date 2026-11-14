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

/** The 403 every log read answers for a book that is not the reader's. It names no row and no person. */
function refuseOtherBook(res, book) {
  return res.status(403).json({
    error: 'Insufficient permissions',
    code: 'NOT_YOUR_BOOK',
    message: `The activity log of ${book} is for the people who work on that book`,
  });
}

module.exports = { readableLogBooks, mayReadLogOf, refuseOtherBook };
