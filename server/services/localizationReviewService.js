/**
 * Localization Review Service (Pass 2)
 *
 * The review tier for the student-facing localized asset — the Pass 2 parallel
 * to segmentEditorService's Pass 1 flow. When a book has
 * `enforce_localization_review` ON, localized edits are held as *pending* edits
 * and only reach `04-localized-content/` after a head-editor approves them
 * (four-eyes); when OFF, the editor saves directly (legacy behaviour, handled in
 * the route).
 *
 * Self-approval policy mirrors Pass 1 (post-#101): the approve route is
 * head-editor-only, so plain editors can never approve; head-editors/admins may
 * approve their own edits (small-team deadlock avoidance). The editor →
 * head-editor separation still holds for the normal flow.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const log = require('../lib/logger');
const segmentParser = require('./segmentParser');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let _db;
let _testDb;

function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

// =====================================================================
// PER-BOOK TOGGLE
// =====================================================================

/**
 * Is the localization review tier enforced for this book? Default false, so
 * books that never opt in keep the legacy direct-save behaviour.
 */
function isReviewEnabled(book) {
  const row = getDb()
    .prepare(`SELECT enforce_localization_review FROM book_settings WHERE book = ?`)
    .get(book);
  return !!(row && row.enforce_localization_review);
}

/** Enable/disable the review tier for a book (admin). Returns the new state. */
function setReviewEnabled(book, enabled) {
  getDb()
    .prepare(
      `INSERT INTO book_settings (book, enforce_localization_review, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(book) DO UPDATE SET
         enforce_localization_review = excluded.enforce_localization_review,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(book, enabled ? 1 : 0);
  return isReviewEnabled(book);
}

// =====================================================================
// SUBMIT (editor)
// =====================================================================

/**
 * Submit a proposed localized segment for review. Keeps one open (pending) edit
 * per segment — a re-submit updates the existing pending edit rather than
 * stacking duplicates.
 */
function submitEdit({
  book,
  chapter,
  moduleId,
  segmentId,
  originalContent,
  editedContent,
  category,
  editorId,
  editorUsername,
}) {
  const conn = getDb();
  const existing = conn
    .prepare(
      `SELECT id FROM localization_pending_edits
       WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'pending'`
    )
    .get(book, moduleId, segmentId);

  if (existing) {
    conn
      .prepare(
        `UPDATE localization_pending_edits
         SET edited_content = ?, category = ?, original_content = ?,
             editor_id = ?, editor_username = ?, created_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        editedContent,
        category || null,
        originalContent,
        String(editorId),
        editorUsername,
        existing.id
      );
    return { id: existing.id, updated: true };
  }

  const result = conn
    .prepare(
      `INSERT INTO localization_pending_edits
       (book, chapter, module_id, segment_id, original_content, edited_content,
        category, editor_id, editor_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      book,
      chapter,
      moduleId,
      segmentId,
      originalContent,
      editedContent,
      category || null,
      String(editorId),
      editorUsername
    );
  return { id: result.lastInsertRowid, updated: false };
}

// =====================================================================
// QUERIES
// =====================================================================

function getEditById(editId) {
  return getDb().prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
}

/** All edits for a module (any status), newest first — drives the editor badges. */
function getModuleEdits(book, moduleId) {
  return getDb()
    .prepare(
      `SELECT * FROM localization_pending_edits
       WHERE book = ? AND module_id = ?
       ORDER BY created_at DESC`
    )
    .all(book, moduleId);
}

/** Pending edits for a module (for the head-editor review panel). */
function getPendingByModule(book, moduleId) {
  return getDb()
    .prepare(
      `SELECT * FROM localization_pending_edits
       WHERE book = ? AND module_id = ? AND status = 'pending'
       ORDER BY created_at ASC`
    )
    .all(book, moduleId);
}

/**
 * Cross-module review queue of pending localization edits, grouped by module.
 * Mirrors the Pass 1 review queue so the two can be surfaced side by side.
 */
function getReviewQueue(book) {
  let query = `
    SELECT book, chapter, module_id,
           COUNT(*) AS pending_edits,
           MIN(created_at) AS oldest_submitted,
           MAX(created_at) AS newest_submitted
    FROM localization_pending_edits
    WHERE status = 'pending'`;
  const params = [];
  if (book) {
    query += ` AND book = ?`;
    params.push(book);
  }
  query += ` GROUP BY book, module_id ORDER BY oldest_submitted ASC`;
  return getDb()
    .prepare(query)
    .all(...params);
}

// =====================================================================
// REVIEW ACTIONS (head editor)
// =====================================================================

/**
 * Approve a pending localization edit and apply it to 04-localized-content/.
 *
 * Self-approval is permitted (see module header). `saveLocalizedSegments`
 * snapshots the prior file to a `.bak` before overwriting (parity with the
 * Pass 1 F10 snapshot-before-apply mitigation), so the overwrite is recoverable.
 *
 * @returns {{ edit: object, savedPath: string }}
 */
function approveAndApply(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  // 1. Mark approved
  conn
    .prepare(
      `UPDATE localization_pending_edits
       SET status = 'approved', reviewer_id = ?, reviewer_username = ?,
           reviewer_note = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(String(reviewerId), reviewerUsername, reviewerNote || null, editId);

  // 2. Apply to the localized file (snapshot-before-save handled by .bak)
  const data = segmentParser.loadModuleForLocalization(edit.book, edit.chapter, edit.module_id);
  const segments = data.segments.map((seg) => ({
    segmentId: seg.segmentId,
    content:
      seg.segmentId === edit.segment_id
        ? edit.edited_content
        : seg.hasLocalized
          ? seg.localized
          : seg.faithful,
  }));
  const savedPath = segmentParser.saveLocalizedSegments(
    edit.book,
    edit.chapter,
    edit.module_id,
    segments
  );

  // 3. Mark applied
  conn
    .prepare(`UPDATE localization_pending_edits SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(editId);

  log.info(
    { book: edit.book, moduleId: edit.module_id, segmentId: edit.segment_id, editId },
    'Localization edit approved and applied'
  );
  const updated = conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
  return { edit: updated, savedPath };
}

/** Reject a pending localization edit (does not touch the localized file). */
function rejectEdit(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  conn
    .prepare(
      `UPDATE localization_pending_edits
       SET status = 'rejected', reviewer_id = ?, reviewer_username = ?,
           reviewer_note = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(String(reviewerId), reviewerUsername, reviewerNote || null, editId);

  return conn.prepare(`SELECT * FROM localization_pending_edits WHERE id = ?`).get(editId);
}

/** @internal Test helper */
function _setTestDb(testDb) {
  _testDb = testDb;
}

module.exports = {
  isReviewEnabled,
  setReviewEnabled,
  submitEdit,
  getEditById,
  getModuleEdits,
  getPendingByModule,
  getReviewQueue,
  approveAndApply,
  rejectEdit,
  _setTestDb,
};
