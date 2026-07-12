/**
 * Propagation service (item O).
 *
 * Lets an editor's translation of a recurring segment be copied to its other
 * book-wide occurrences as PENDING edits. This is the only cross-module write
 * in the editor stack; it is intentionally isolated here (segmentEditorService
 * stays single-module). No auto-approve, no auto-publish.
 */

const Database = require('better-sqlite3');
const segmentParser = require('./segmentParser');
const concordance = require('./concordanceService');
const segmentValidation = require('../public/js/segment-validation');
const resolveDbPath = require('../lib/dbPath');

const DB_PATH = resolveDbPath();

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
 * @param {{ currentIs: string, editorId?: string|number,
 *           existingEdit: {edited_content: string, status: string, editor_id?: string}|null }} occ
 * @returns {'eligible'|'already-matches'|'conflict'}
 */
function classifyOccurrence(propagatedText, occ) {
  const existing = occ.existingEdit;
  if (existing) {
    if (existing.edited_content === propagatedText) return 'already-matches';
    // Re-propagating over one's OWN still-pending edit supersedes it in place
    // (mirrors saveSegmentEdit's edit-again update — at most one pending row per
    // (segment, editor)). Another editor's pending edit, or any approved/applied
    // edit, stays a genuine conflict (preserves four-eyes).
    if (
      existing.status === 'pending' &&
      occ.editorId != null &&
      String(existing.editor_id) === String(occ.editorId)
    ) {
      return 'eligible';
    }
    return 'conflict';
  }
  return occ.currentIs === propagatedText ? 'already-matches' : 'eligible';
}

/**
 * For each occurrence, re-check eligibility against the latest live edit
 * (rejected and superseded rows don't count) and (if eligible) insert a
 * pending segment_edit. Cross-module write.
 * @returns {{ created: Array, skipped: Array }}
 */
function createPropagatedEdits(
  conn,
  { book, editorId, editorUsername, propagatedText, category, note, occurrences, sourceEn }
) {
  const findEdit = conn.prepare(
    `SELECT id, edited_content, status, editor_id FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status NOT IN ('rejected', 'superseded')
     ORDER BY id DESC LIMIT 1`
  );
  const insert = conn.prepare(
    `INSERT INTO segment_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_note, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = conn.prepare(
    `UPDATE segment_edits
       SET edited_content = ?, category = ?, editor_note = ?, created_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  const created = [];
  const skipped = [];
  const tx = conn.transaction(() => {
    for (const occ of occurrences) {
      const existingEdit = findEdit.get(book, occ.moduleId, occ.segmentId) || null;
      const verdict = classifyOccurrence(propagatedText, {
        currentIs: occ.currentIs,
        editorId,
        existingEdit,
      });
      if (verdict !== 'eligible') {
        skipped.push({ moduleId: occ.moduleId, segmentId: occ.segmentId, reason: verdict });
        continue;
      }
      // SR-OOS-2: propagated content is validated per-occurrence against the
      // occurrence's own baseline (currentIs) + the source EN. Blocked
      // occurrences are skipped (propagation's existing verdict model), not
      // fatal — other occurrences still propagate.
      if (sourceEn !== undefined) {
        const structure = segmentValidation.validateStructure(
          sourceEn,
          occ.currentIs,
          propagatedText
        );
        if (structure.blocked) {
          skipped.push({
            moduleId: occ.moduleId,
            segmentId: occ.segmentId,
            reason: 'structure_blocked',
          });
          continue;
        }
      }
      // Eligible because of an own pending edit → supersede it in place rather
      // than inserting a duplicate pending row (keeps the one-row-per-(seg,editor)
      // invariant; classifyOccurrence already guaranteed it is ours + pending).
      if (
        existingEdit &&
        existingEdit.status === 'pending' &&
        String(existingEdit.editor_id) === String(editorId)
      ) {
        update.run(propagatedText, category || null, note || null, existingEdit.id);
        created.push({ moduleId: occ.moduleId, segmentId: occ.segmentId, superseded: true });
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
 * The text that would be propagated from a source segment: its latest live
 * edit's content (rejected and superseded rows don't count), or null if it
 * has none (caller falls back to the file text). Keeps the preview's
 * classification consistent with what propagate actually writes.
 */
function latestEditedText(book, moduleId, segmentId) {
  const row = getDb()
    .prepare(
      `SELECT edited_content FROM segment_edits
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status NOT IN ('rejected', 'superseded')
       ORDER BY id DESC LIMIT 1`
    )
    .get(book, moduleId, segmentId);
  return row ? row.edited_content : null;
}

/**
 * Find all segments in the book whose source EN normalizes to enNorm
 * (excluding the source segment). On-demand scan — call only on a deliberate
 * propagation action.
 */
function findOccurrences(book, enNorm, { excludeModuleId, excludeSegmentId } = {}) {
  const conn = getDb();
  const findEdit = conn.prepare(
    `SELECT id, edited_content, status, editor_id FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND status NOT IN ('rejected', 'superseded')
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

module.exports = {
  getDb,
  _setTestDb,
  classifyOccurrence,
  createPropagatedEdits,
  findOccurrences,
  latestEditedText,
};
