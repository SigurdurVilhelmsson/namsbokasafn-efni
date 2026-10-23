/**
 * Books whose faithful files no code path may write (register §C203).
 *
 * Chemistry's approved segment_edits include edits made on an OLDER machine translation, and
 * applyApprovedEdits never compares an edit's original_content with the current text. Its
 * self-heal (a module whose faithful file is missing while every approved row is marked
 * applied) re-applies all of them on one click, so those edits would replace today's text. A
 * version restore can write an old snapshot the same way. Both writers refuse a held book until
 * a base-text guard and the §C202 fix (carried-over MT counted as human-reviewed) exist.
 *
 * ⚠️ AN ENFORCEABLE VALUE. Change it together with server/__tests__/applyHold.test.js, and lift
 * a hold only by a code change that names the guard that made it safe.
 */
const HOLDS = Object.freeze({
  'efnafraedi-2e':
    'Vistun í skrár er í bið fyrir efnafræði (§C203): eldri samþykktar breytingar og útgáfur ' +
    'voru gerðar á eldri vélþýðingu og myndu skrifa yfir núverandi texta.',
});

const HELD_BOOKS = Object.freeze(Object.keys(HOLDS));

/**
 * @param {string} book
 * @returns {string|null} why the book's faithful files may not be written, or null
 */
function faithfulWriteHold(book) {
  return Object.prototype.hasOwnProperty.call(HOLDS, book) ? HOLDS[book] : null;
}

/**
 * @param {string} book
 * @throws {Error} with code 'APPLY_HELD' when the book is held
 */
function assertFaithfulWritable(book) {
  const reason = faithfulWriteHold(book);
  if (reason) {
    const err = new Error(reason);
    err.code = 'APPLY_HELD';
    throw err;
  }
}

module.exports = { HELD_BOOKS, faithfulWriteHold, assertFaithfulWritable };
