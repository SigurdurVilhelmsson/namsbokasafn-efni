/**
 * Propagation service (item O).
 *
 * Lets an editor's translation of a recurring segment be copied to its other
 * book-wide occurrences as PENDING edits. This is the only cross-module write
 * in the editor stack; it is intentionally isolated here (segmentEditorService
 * stays single-module). No auto-approve, no auto-publish.
 */

const path = require('path');
const Database = require('better-sqlite3');
// eslint-disable-next-line no-unused-vars
const segmentParser = require('./segmentParser');
// eslint-disable-next-line no-unused-vars
const concordance = require('./concordanceService');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}
function _setTestDb(testDb) {
  db = testDb;
}

/**
 * Decide what to do with one occurrence given the editor's propagated text.
 * Pure — no DB/file access.
 * @param {string} propagatedText
 * @param {{ currentIs: string, existingEdit: {edited_content: string, status: string}|null }} occ
 * @returns {'eligible'|'already-matches'|'conflict'}
 */
function classifyOccurrence(propagatedText, occ) {
  const existing = occ.existingEdit;
  if (existing) {
    return existing.edited_content === propagatedText ? 'already-matches' : 'conflict';
  }
  return occ.currentIs === propagatedText ? 'already-matches' : 'eligible';
}

module.exports = { getDb, _setTestDb, classifyOccurrence };
