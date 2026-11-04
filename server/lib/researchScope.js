/**
 * researchScope — the study-book allowlist (G1.2; spec §11, §5.5).
 *
 * This is an enforceable value (spec §11): the books whose editing is part of the research study
 * are named here and nowhere else. Every reader goes through `isStudyBook`, and no other file
 * restates the list: PR2's module-opening predicate (spec §5.5, its first clause), the event log's
 * record step, and the re-attach script's refusal of a study book
 * (`scripts/reattach-segment-edits.js`) all read it from here. To change the study's scope, change
 * this file and its test (`server/__tests__/researchScope.test.js`), nothing else.
 *
 * Organic Chemistry (`lifraen-efnafraedi`) must never appear here: it is not translated
 * (CLAUDE.md § Organic), and nothing is opened or captured for it. The test fails if it does.
 *
 * It requires nothing on purpose: the re-attach script loads it to refuse a study book before
 * planning, and that refusal, in a dry run too, must come before any database is opened, so this
 * module must not pull in anything that opens one.
 */

/** The books in the research study (spec §11). Frozen; read through `isStudyBook`. */
const STUDY_BOOKS = Object.freeze(['efnafraedi-2e']);

function isStudyBook(book) {
  return STUDY_BOOKS.includes(book);
}

module.exports = { STUDY_BOOKS, isStudyBook };
