// server/services/assignmentGate.js — may this user be given this chapter? (G1.13 spec §6.5, §6.6.)
//
// Every path that creates a user_chapter_assignments row asks `assignmentRefusal` before it writes:
// userService.assignChapter and setChapterAssignee, and the two admin routes over them. In a study book
// an assignment row opens the chapter's research units on the editor's first look, so a row may exist
// only for an editor the study may capture or knowingly skip (a consent decision on record, either one),
// who has signed the licence clause, and only while the book is served to editors from the Fable layer
// (docs/decisions/2026-11-24-assign-gate-waits-on-fable-layer.md, which supersedes ruling R6: a unit
// opened before the layer is served would open on text the study does not compare).
//
// Removing an assignment is not gated. Rows written before the gate are untouched.
//
// It reads users and user_book_access by SQL on the connection it is given, and does not require
// userService, which requires it.

const { ROLES } = require('../constants');
const { isEditorWritableBook, BOOK_CLOSED_MESSAGE } = require('../lib/editorScope');
const { isStudyBook } = require('../lib/researchScope');
const servedLayer = require('../lib/servedLayer');
const { hasClause } = require('./licenceClauses');

/**
 * @typedef {'book-closed'|'chapter-not-editable'|'bypass-role'|'no-consent-decision'|'no-licence-clause'|'served-layer-not-fable'} Reason
 */

/** What the assignments page and a refused assign say, per reason. */
const REFUSAL_MESSAGES = Object.freeze({
  'book-closed': BOOK_CLOSED_MESSAGE,
  'chapter-not-editable':
    'Kafla 0 er ekki hægt að úthluta í rannsóknarbókinni, því hann er aldrei opnaður til ritstjórnar.',
  'bypass-role':
    'Stjórnendur og aðalritstjórar bókarinnar þurfa enga úthlutun: þeir hafa aðgang að öllum köflum.',
  'no-consent-decision': 'Notandinn hefur ekki enn tekið afstöðu til þátttöku í rannsókninni.',
  'no-licence-clause': 'Ekkert undirritað leyfisákvæði er skráð fyrir notandann.',
  'served-layer-not-fable':
    'Ritillinn sýnir ekki enn texta gervigreindar fyrir bókina; ekki er hægt að úthluta köflum fyrr en hann gerir það.',
});

/**
 * An admin, or a head editor of this book: the token's rule (services/auth.js builds `books` from
 * getHeadEditorBooks), read from the account. Such a user bypasses chapter enforcement and needs no row.
 */
function isBypassRole(conn, userId, book) {
  const user = conn.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role !== ROLES.HEAD_EDITOR) return false;
  return !!conn
    .prepare(
      `SELECT 1 FROM user_book_access WHERE user_id = ? AND book_slug = ? AND role_for_book = ?`
    )
    .get(userId, book, ROLES.HEAD_EDITOR);
}

/** A consent decision on record, of either kind (spec §6.5: a decline still lets the editor edit). */
function hasConsentDecision(conn, userId) {
  return !!conn.prepare('SELECT 1 FROM research_consent WHERE user_id = ? LIMIT 1').get(userId);
}

/**
 * Why `userId` may not be given `chapter` of `book`, or null when nothing stands in the way. The first
 * reason that applies wins, in the order below. A missing table throws: the gate fails closed.
 *
 * @param {import('better-sqlite3').Database} conn sessions.db
 * @param {{ userId: number, book: string, chapter?: number }} args `chapter` is the number the row
 *   would carry; undefined when the assignments page asks about an editor in general.
 * @returns {Reason|null}
 */
function assignmentRefusal(conn, { userId, book, chapter }) {
  if (!isEditorWritableBook(book)) return 'book-closed';
  const study = isStudyBook(book);
  // §6.6: chapter 0 never opens, so a row for it would open nothing; refused rather than written.
  if (study && chapter !== undefined && Number(chapter) === 0) return 'chapter-not-editable';
  if (isBypassRole(conn, userId, book)) return 'bypass-role';
  if (study && !hasConsentDecision(conn, userId)) return 'no-consent-decision';
  if (!hasClause(conn, userId)) return 'no-licence-clause';
  if (study && servedLayer.servedLayerFor(book) !== 'fable') return 'served-layer-not-fable';
  return null;
}

module.exports = { assignmentRefusal, REFUSAL_MESSAGES };
