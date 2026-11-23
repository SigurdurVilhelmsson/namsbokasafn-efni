/**
 * Which books editors may write to (G1.13, spec §6.1), in heldBookWrites' style.
 *
 * Until now an editor's write was bounded by role and assignment only, so any book registered in
 * the system accepted editor writes. This module names the books open to editors; every other
 * book is closed to non-admins for the guarded write routes. Admins pass: [USER]'s own work on a
 * closed book (a pipeline check, an import) is not an editor's.
 *
 * Study books are always assignment-enforced whatever this list says (`isAlwaysEnforced`, which
 * is `isStudyBook`; the one rule that the assignment check and the study-event gate both call).
 *
 * ⚠️ AN ENFORCEABLE VALUE. Change the list together with server/__tests__/editorScope.test.js,
 * and open a book to editors only by a code change that names why it is now safe.
 */
const { ROLES } = require('../constants');
const { isStudyBook } = require('./researchScope');

const EDITOR_WRITABLE_BOOKS = Object.freeze(['efnafraedi-2e']);

const BOOK_CLOSED_MESSAGE = 'Þessi bók er ekki opin til ritstjórnar.';

/** @returns {boolean} true only for a string on the allowlist */
const isEditorWritableBook = (book) =>
  typeof book === 'string' && EDITOR_WRITABLE_BOOKS.includes(book);

/** @returns {boolean} true when assignment enforcement cannot be switched off for this book */
const isAlwaysEnforced = (book) => isStudyBook(book);

/**
 * The row resolvers signal an unknown id by throwing 'Edit not found', 'Review not found' or
 * 'Acceptance not found': one word, then "not found". Only that is a 404. Any other throw (a
 * locked or broken database) is an outage, not a missing row, and its message is not for clients.
 */
const ROW_NOT_FOUND = /^\w+ not found$/;

/**
 * Express middleware: answer 403 BOOK_CLOSED to a non-admin when the book is not on the
 * allowlist. Place it after the route's auth middleware, so req.user is set. `label` marks the
 * returned function, which is how the route census checks that a route carries it.
 *
 * @param {(req: object) => string} bookOf resolves the book; may throw. A resolver's not-found
 *   throw answers 404; any other throw goes to next(err), the app's error handler (a 500 that
 *   withholds the message).
 * @param {'param'|'body'|'row'} label where the route's book comes from
 */
function refuseClosedBookForNonAdmins(bookOf, label) {
  const guard = (req, res, next) => {
    if (req.user?.role === ROLES.ADMIN) return next();
    let book;
    try {
      book = bookOf(req);
    } catch (err) {
      if (err && ROW_NOT_FOUND.test(err.message)) {
        return res.status(404).json({ error: err.message });
      }
      // next() with no argument would pass the request on, so a falsy throw becomes an Error.
      return next(err || new Error('book resolver threw without an error'));
    }
    if (!isEditorWritableBook(book)) {
      return res.status(403).json({ error: 'BOOK_CLOSED', message: BOOK_CLOSED_MESSAGE });
    }
    return next();
  };
  guard.editorScopeGuard = label;
  return guard;
}

module.exports = {
  EDITOR_WRITABLE_BOOKS,
  isEditorWritableBook,
  isAlwaysEnforced,
  BOOK_CLOSED_MESSAGE,
  refuseClosedBookForNonAdmins,
};
