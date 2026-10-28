/**
 * Writes refused to non-admins on a held book (Skerfur plan G1.14), in applyHold's style.
 *
 * #556's hold (lib/applyHold.js) covers only the writers of faithful files. A held book has two
 * more ways to change what readers will get, and both were closed by instruction only:
 *   - the pipeline (inject, render, run) and the three publish routes rewrite the book's
 *     generated and publication trees, while chemistry's whole-book re-render and the reader
 *     sync wait for [USER] (register: "the chemistry sync stays HELD");
 *   - the figure-correction route writes figure text while figure review is closed (R-22).
 * Admins pass: running the pipeline is [USER]'s work. The manual stage advance is made
 * admin-only in its own route, not here.
 *
 * ⚠️ AN ENFORCEABLE VALUE. Change it together with server/__tests__/heldBookWrites.test.js,
 * and lift a hold only by a code change that names why it is now safe.
 */
const { ROLES } = require('../constants');

const PIPELINE_HOLDS = Object.freeze({
  'efnafraedi-2e':
    'Keyrslur og útgáfa eru í bið fyrir efnafræði: endurgerð bókarinnar og samstilling við ' +
    'lesvefinn bíða ákvörðunar verkefnisstjóra.',
});

const FIGURE_REVIEW_CLOSED = Object.freeze({
  'efnafraedi-2e': 'Yfirferð mynda er lokuð fyrir efnafræði (R-22) þar til hún verður opnuð aftur.',
});

const own = (map, book) => (Object.prototype.hasOwnProperty.call(map, book) ? map[book] : null);

/** @returns {string|null} why non-admins may not run the pipeline or publish for this book */
const pipelineHold = (book) => own(PIPELINE_HOLDS, book);

/** @returns {string|null} why non-admins may not save figure corrections for this book */
const figureReviewClosed = (book) => own(FIGURE_REVIEW_CLOSED, book);

/**
 * Express middleware: answer 423 {held: true} to a non-admin when `holdFor(book)` names a hold.
 * Place it after the route's auth middleware, so req.user is set. `label` marks the returned
 * function, which is how the tests check that a route carries it.
 *
 * @param {(book: string) => string|null} holdFor
 * @param {(req: object) => string} bookFrom
 * @param {'pipeline'|'figure-review'} label
 */
function refuseHeldForNonAdmins(holdFor, bookFrom, label) {
  const guard = (req, res, next) => {
    const reason = holdFor(bookFrom(req));
    if (reason && req.user?.role !== ROLES.ADMIN) {
      return res.status(423).json({ error: reason, held: true });
    }
    return next();
  };
  guard.heldBookGuard = label;
  return guard;
}

module.exports = {
  HELD_FOR_PIPELINE: Object.freeze(Object.keys(PIPELINE_HOLDS)),
  pipelineHold,
  figureReviewClosed,
  refuseHeldForNonAdmins,
};
