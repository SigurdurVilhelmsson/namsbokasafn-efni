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
const segmentParser = require('./segmentParser');
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

/**
 * For each occurrence, re-check eligibility against the latest non-rejected edit
 * and (if eligible) insert a pending segment_edit. Cross-module write.
 * @returns {{ created: Array, skipped: Array }}
 */
function createPropagatedEdits(
  conn,
  { book, editorId, editorUsername, propagatedText, category, note, occurrences }
) {
  const findEdit = conn.prepare(
    `SELECT edited_content, status FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status != 'rejected'
     ORDER BY id DESC LIMIT 1`
  );
  const insert = conn.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const created = [];
  const skipped = [];
  const tx = conn.transaction(() => {
    for (const occ of occurrences) {
      const existingEdit = findEdit.get(book, occ.moduleId, occ.segmentId) || null;
      const verdict = classifyOccurrence(propagatedText, {
        currentIs: occ.currentIs,
        existingEdit,
      });
      if (verdict !== 'eligible') {
        skipped.push({ moduleId: occ.moduleId, segmentId: occ.segmentId, reason: verdict });
        continue;
      }
      insert.run(
        book,
        occ.chapter,
        occ.moduleId,
        occ.segmentId,
        occ.currentIs || '',
        propagatedText,
        category || null,
        note || null,
        String(editorId),
        editorUsername
      );
      created.push({ moduleId: occ.moduleId, segmentId: occ.segmentId });
    }
  });
  tx();
  return { created, skipped };
}

/**
 * Find all segments in the book whose source EN normalizes to enNorm
 * (excluding the source segment). On-demand scan — call only on a deliberate
 * propagation action.
 */
function findOccurrences(book, enNorm, { excludeModuleId, excludeSegmentId } = {}) {
  const conn = getDb();
  const findEdit = conn.prepare(
    `SELECT edited_content, status FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status != 'rejected'
     ORDER BY id DESC LIMIT 1`
  );
  const out = [];
  for (const chapter of segmentParser.listChapters(book)) {
    for (const mod of segmentParser.listChapterModules(book, chapter)) {
      let data;
      try {
        data = segmentParser.loadModuleForEditing(book, chapter, mod.moduleId);
      } catch {
        continue;
      }
      for (const seg of data.segments) {
        if (concordance.normalizeEn(seg.en) !== enNorm) continue;
        if (mod.moduleId === excludeModuleId && seg.segmentId === excludeSegmentId) continue;
        out.push({
          chapter,
          moduleId: mod.moduleId,
          segmentId: seg.segmentId,
          en: seg.en,
          currentIs: seg.is || '',
          existingEdit: findEdit.get(book, mod.moduleId, seg.segmentId) || null,
        });
      }
    }
  }
  return out;
}

module.exports = { getDb, _setTestDb, classifyOccurrence, createPropagatedEdits, findOccurrences };
