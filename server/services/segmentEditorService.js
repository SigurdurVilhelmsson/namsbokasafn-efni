/**
 * Segment Editor Service
 *
 * CRUD operations for segment-level edits and reviews.
 * Wraps the segment_edits, module_reviews, and segment_discussions tables.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { advanceChapterStatus } = require('./pipelineService');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let db;
function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// =====================================================================
// SEGMENT EDITS
// =====================================================================

/**
 * Create or update a segment edit.
 * If the editor already has a pending edit for this segment, update it.
 */
function saveSegmentEdit(params) {
  const {
    book,
    chapter,
    moduleId,
    segmentId,
    originalContent,
    editedContent,
    category,
    editorNote,
    editorId,
    editorUsername,
  } = params;

  const conn = getDb();

  // Check for existing pending edit by this editor on this segment
  const existing = conn
    .prepare(
      `SELECT id FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ? AND editor_id = ? AND status = 'pending'`
    )
    .get(book, moduleId, segmentId, editorId);

  if (existing) {
    // Update existing edit
    conn
      .prepare(
        `UPDATE segment_edits
       SET edited_content = ?, category = ?, editor_note = ?, created_at = CURRENT_TIMESTAMP
       WHERE id = ?`
      )
      .run(editedContent, category || null, editorNote || null, existing.id);
    return { id: existing.id, updated: true };
  }

  // Create new edit
  const result = conn
    .prepare(
      `INSERT INTO segment_edits
     (book, chapter, module_id, segment_id, original_content, edited_content,
      category, editor_note, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      book,
      chapter,
      moduleId,
      segmentId,
      originalContent,
      editedContent,
      category || null,
      editorNote || null,
      editorId,
      editorUsername
    );

  return { id: result.lastInsertRowid, updated: false };
}

/**
 * Get all segment edits for a module.
 */
function getModuleEdits(book, moduleId, statusFilter) {
  const conn = getDb();

  let query = `SELECT * FROM segment_edits WHERE book = ? AND module_id = ?`;
  const params = [book, moduleId];

  if (statusFilter) {
    query += ` AND status = ?`;
    params.push(statusFilter);
  }

  query += ` ORDER BY created_at DESC`;

  return conn.prepare(query).all(...params);
}

/**
 * Get edits for a specific segment.
 */
function getSegmentEdits(book, moduleId, segmentId) {
  const conn = getDb();
  return conn
    .prepare(
      `SELECT * FROM segment_edits
     WHERE book = ? AND module_id = ? AND segment_id = ?
     ORDER BY created_at DESC`
    )
    .all(book, moduleId, segmentId);
}

/**
 * Get a single edit by ID.
 */
function getEditById(editId) {
  const conn = getDb();
  return conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
}

/**
 * Delete a pending segment edit (editor can withdraw before review).
 */
function deleteSegmentEdit(editId, editorId) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.editor_id !== editorId) throw new Error('Not your edit');
  if (edit.status !== 'pending') throw new Error('Can only delete pending edits');

  conn.prepare(`DELETE FROM segment_edits WHERE id = ?`).run(editId);
  return true;
}

// =====================================================================
// REVIEW ACTIONS (Head Editor)
// =====================================================================

/**
 * Approve a segment edit.
 */
function approveEdit(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  conn
    .prepare(
      `UPDATE segment_edits
     SET status = 'approved',
         reviewer_id = ?,
         reviewer_username = ?,
         reviewer_note = ?,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
    )
    .run(reviewerId, reviewerUsername, reviewerNote || null, editId);

  return conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
}

/**
 * Reject a segment edit.
 */
function rejectEdit(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  conn
    .prepare(
      `UPDATE segment_edits
     SET status = 'rejected',
         reviewer_id = ?,
         reviewer_username = ?,
         reviewer_note = ?,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
    )
    .run(reviewerId, reviewerUsername, reviewerNote || null, editId);

  return conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
}

/**
 * Mark a segment edit for discussion.
 */
function markForDiscussion(editId, reviewerId, reviewerUsername, reviewerNote) {
  const conn = getDb();
  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
  if (!edit) throw new Error('Edit not found');
  if (edit.status !== 'pending') throw new Error('Edit is not pending');

  conn
    .prepare(
      `UPDATE segment_edits
     SET status = 'discuss',
         reviewer_id = ?,
         reviewer_username = ?,
         reviewer_note = ?,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
    )
    .run(reviewerId, reviewerUsername, reviewerNote || null, editId);

  return conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(editId);
}

// =====================================================================
// MODULE REVIEWS
// =====================================================================

/**
 * Submit a module for review (after editor has made segment edits).
 */
function submitModuleForReview(params) {
  const { book, chapter, moduleId, submittedBy, submittedByUsername } = params;

  const conn = getDb();

  // Check for existing pending review
  const existing = conn
    .prepare(
      `SELECT id FROM module_reviews
     WHERE book = ? AND module_id = ? AND status IN ('pending', 'in_review')`
    )
    .get(book, moduleId);

  if (existing) {
    throw new Error('Module already has a pending review');
  }

  // Count segments
  const editCounts = conn
    .prepare(
      `SELECT
       COUNT(*) as total_edits,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_edits
     FROM segment_edits
     WHERE book = ? AND module_id = ?`
    )
    .get(book, moduleId);

  const result = conn
    .prepare(
      `INSERT INTO module_reviews
     (book, chapter, module_id, submitted_by, submitted_by_username,
      edited_segments)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(book, chapter, moduleId, submittedBy, submittedByUsername, editCounts.total_edits);

  return {
    id: result.lastInsertRowid,
    editedSegments: editCounts.total_edits,
  };
}

/**
 * Get pending module reviews.
 */
function getPendingModuleReviews(book) {
  const conn = getDb();

  let query = `SELECT * FROM module_reviews WHERE status IN ('pending', 'in_review')`;
  const params = [];

  if (book) {
    query += ` AND book = ?`;
    params.push(book);
  }

  query += ` ORDER BY submitted_at ASC`;

  return conn.prepare(query).all(...params);
}

/**
 * Get a module review with its segment edits.
 */
function getModuleReviewWithEdits(reviewId) {
  const conn = getDb();

  const review = conn.prepare(`SELECT * FROM module_reviews WHERE id = ?`).get(reviewId);
  if (!review) throw new Error('Review not found');

  const edits = conn
    .prepare(
      `SELECT * FROM segment_edits
     WHERE book = ? AND module_id = ?
     ORDER BY created_at ASC`
    )
    .all(review.book, review.module_id);

  return { review, edits };
}

/**
 * Complete a module review (after all segment edits have been reviewed).
 */
function completeModuleReview(reviewId, reviewerId, reviewerUsername, notes) {
  const conn = getDb();

  const review = conn.prepare(`SELECT * FROM module_reviews WHERE id = ?`).get(reviewId);
  if (!review) throw new Error('Review not found');

  // Count segment edit statuses
  const counts = conn
    .prepare(
      `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
       COUNT(CASE WHEN status = 'discuss' THEN 1 END) as discuss
     FROM segment_edits
     WHERE book = ? AND module_id = ?`
    )
    .get(review.book, review.module_id);

  const allReviewed = counts.pending === 0 && counts.discuss === 0;
  const newStatus = allReviewed ? 'approved' : 'changes_requested';

  conn
    .prepare(
      `UPDATE module_reviews
     SET status = ?,
         reviewed_by = ?,
         reviewed_by_username = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         review_notes = ?,
         approved_segments = ?,
         rejected_segments = ?
     WHERE id = ?`
    )
    .run(
      newStatus,
      reviewerId,
      reviewerUsername,
      notes || null,
      counts.approved,
      counts.rejected,
      reviewId
    );

  return {
    status: newStatus,
    counts,
    allReviewed,
  };
}

// =====================================================================
// DISCUSSIONS
// =====================================================================

/**
 * Add a comment to a segment edit discussion.
 */
function addDiscussionComment(segmentEditId, userId, username, comment) {
  const conn = getDb();

  const edit = conn.prepare(`SELECT * FROM segment_edits WHERE id = ?`).get(segmentEditId);
  if (!edit) throw new Error('Edit not found');

  const result = conn
    .prepare(
      `INSERT INTO segment_discussions (segment_edit_id, user_id, username, comment)
     VALUES (?, ?, ?, ?)`
    )
    .run(segmentEditId, userId, username, comment);

  return { id: result.lastInsertRowid };
}

/**
 * Get discussion thread for a segment edit.
 */
function getDiscussion(segmentEditId) {
  const conn = getDb();
  return conn
    .prepare(
      `SELECT * FROM segment_discussions
     WHERE segment_edit_id = ?
     ORDER BY created_at ASC`
    )
    .all(segmentEditId);
}

// =====================================================================
// APPLY APPROVED EDITS TO FILES
// =====================================================================

const segmentParser = require('./segmentParser');

/**
 * Apply all approved (and not yet applied) edits for a module to the
 * 03-faithful-translation/ segment file. Starts from MT output as the base text
 * and overlays every approved edit.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @returns {object} { appliedCount, savedPath, segments }
 */
function applyApprovedEdits(book, chapter, moduleId) {
  const conn = getDb();

  // Pre-check: any approved edits at all?
  const approvedEdits = conn
    .prepare(
      `SELECT id, segment_id, edited_content
       FROM segment_edits
       WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NULL
       ORDER BY reviewed_at DESC`
    )
    .all(book, moduleId);

  if (approvedEdits.length === 0) {
    const anyApproved = conn
      .prepare(
        `SELECT COUNT(*) as count FROM segment_edits
         WHERE book = ? AND module_id = ? AND status = 'approved'`
      )
      .get(book, moduleId);

    if (anyApproved.count === 0) {
      throw new Error('No approved edits to apply for this module');
    }

    // Check if faithful file actually exists — if not, allow re-application
    const chDir = chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
    const faithfulPath = path.join(
      BOOKS_DIR,
      book,
      '03-faithful-translation',
      chDir,
      `${moduleId}-segments.is.md`
    );
    if (!fs.existsSync(faithfulPath)) {
      // File was deleted — reset applied_at so edits can be re-applied
      conn
        .prepare(
          `UPDATE segment_edits SET applied_at = NULL
           WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NOT NULL`
        )
        .run(book, moduleId);
      return applyApprovedEdits(book, chapter, moduleId);
    }

    throw new Error('All approved edits have already been applied');
  }

  // Use IMMEDIATE transaction to hold write lock for the entire apply cycle.
  // This prevents concurrent apply calls from reading the same edits.
  const applyTransaction = conn.transaction(() => {
    // Re-query inside the transaction to ensure consistency
    const edits = conn
      .prepare(
        `SELECT id, segment_id, edited_content
         FROM segment_edits
         WHERE book = ? AND module_id = ? AND status = 'approved' AND applied_at IS NULL
         ORDER BY reviewed_at DESC`
      )
      .all(book, moduleId);

    if (edits.length === 0) {
      throw new Error('Edits were applied by a concurrent request');
    }

    // 1. Load module data
    const data = segmentParser.loadModuleForEditing(book, chapter, moduleId);

    // 2. Build approved-content lookup (latest approved edit per segment wins)
    const approvedLookup = {};
    const supersededIds = [];
    for (const edit of edits) {
      if (!approvedLookup[edit.segment_id]) {
        approvedLookup[edit.segment_id] = edit;
      } else {
        supersededIds.push(edit.id);
      }
    }

    // 3. Warn about stale edits (segment IDs that no longer exist in current extraction)
    const currentSegIds = new Set(data.segments.map((s) => s.segmentId));
    for (const [segId, edit] of Object.entries(approvedLookup)) {
      if (!currentSegIds.has(segId)) {
        console.error(
          `Warning: Approved edit ${edit.id} references segment ${segId} which no longer exists in current extraction`
        );
      }
    }

    // 4. Build the full segment list: approved content overrides existing IS content
    const segments = data.segments.map((seg) => {
      const approved = approvedLookup[seg.segmentId];
      return {
        segmentId: seg.segmentId,
        content: approved ? approved.edited_content : seg.is,
      };
    });

    // 5. Write to 03-faithful-translation/
    const savedPath = segmentParser.saveModuleSegments(book, chapter, moduleId, segments);

    // 5b. Verify the file was actually written
    if (!fs.existsSync(savedPath)) {
      throw new Error(`Failed to write faithful file: ${savedPath}`);
    }
    const written = fs.readFileSync(savedPath, 'utf-8');
    const appliedCount = Object.keys(approvedLookup).length;
    if (written.length === 0) {
      throw new Error(`Faithful file written but empty: ${savedPath}`);
    }
    // Verify at least one approved edit's content appears in the file
    const sampleEdit = Object.values(approvedLookup)[0];
    const sampleText = sampleEdit?.edited_content || '';
    if (sampleText && !written.includes(sampleText.substring(0, Math.min(50, sampleText.length)))) {
      console.error(
        `Warning: Sample edit content not found in faithful file. ` +
          `Segment ID format may not match. Edit segment_id: ${sampleEdit.segment_id}`
      );
    }

    // 6. Mark winning edits as applied; mark superseded edits as rejected
    const winnerIds = Object.values(approvedLookup).map((e) => e.id);
    const markApplied = conn.prepare(
      `UPDATE segment_edits SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`
    );
    const markSuperseded = conn.prepare(
      `UPDATE segment_edits SET status = 'rejected', reviewer_note = 'Leyst úr gildi af nýrri samþykktri breytingu', applied_at = CURRENT_TIMESTAMP WHERE id = ?`
    );

    for (const id of winnerIds) {
      markApplied.run(id);
    }
    for (const id of supersededIds) {
      markSuperseded.run(id);
    }

    return {
      appliedCount,
      supersededCount: supersededIds.length,
      totalEditsMarked: edits.length,
      savedPath,
    };
  });

  const result = applyTransaction.immediate();

  // Auto-advance status (best-effort, outside transaction)
  try {
    const chDir = chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
    const mtOutputDir = path.join(BOOKS_DIR, book, '02-mt-output', chDir);
    const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful-translation', chDir);

    if (fs.existsSync(mtOutputDir) && fs.existsSync(faithfulDir)) {
      const mtModules = fs
        .readdirSync(mtOutputDir)
        .filter((f) => f.endsWith('-segments.is.md'))
        .map((f) => f.replace('-segments.is.md', ''));
      const faithfulModules = fs
        .readdirSync(faithfulDir)
        .filter((f) => f.endsWith('-segments.is.md'))
        .map((f) => f.replace('-segments.is.md', ''));

      const allModulesReviewed = mtModules.every((m) => faithfulModules.includes(m));

      if (allModulesReviewed) {
        advanceChapterStatus(book, chapter, 'linguisticReview');
      }
    }
  } catch (err) {
    console.error('Auto-advance linguisticReview failed:', err.message);
  }

  return result;
}

/**
 * Get apply status for a module: how many approved edits are pending application.
 *
 * @param {string} book - Book slug
 * @param {string} moduleId - Module ID
 * @returns {object} { unappliedCount, appliedCount, totalApproved }
 */
function getApplyStatus(book, moduleId) {
  const conn = getDb();

  return conn
    .prepare(
      `SELECT
         COUNT(CASE WHEN applied_at IS NULL THEN 1 END) as unapplied_count,
         COUNT(CASE WHEN applied_at IS NOT NULL THEN 1 END) as applied_count,
         COUNT(*) as total_approved
       FROM segment_edits
       WHERE book = ? AND module_id = ? AND status = 'approved'`
    )
    .get(book, moduleId);
}

// =====================================================================
// STATISTICS
// =====================================================================

/**
 * Get editing statistics for a module.
 */
function getModuleStats(book, moduleId) {
  const conn = getDb();

  return conn
    .prepare(
      `SELECT
       COUNT(*) as total_edits,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
       COUNT(CASE WHEN status = 'discuss' THEN 1 END) as discuss,
       COUNT(DISTINCT segment_id) as segments_edited,
       COUNT(DISTINCT editor_id) as editors,
       COUNT(CASE WHEN category = 'terminology' THEN 1 END) as cat_terminology,
       COUNT(CASE WHEN category = 'accuracy' THEN 1 END) as cat_accuracy,
       COUNT(CASE WHEN category = 'readability' THEN 1 END) as cat_readability,
       COUNT(CASE WHEN category = 'style' THEN 1 END) as cat_style,
       COUNT(CASE WHEN category = 'omission' THEN 1 END) as cat_omission
     FROM segment_edits
     WHERE book = ? AND module_id = ?`
    )
    .get(book, moduleId);
}

/**
 * Get cross-chapter review queue with edit counts per module.
 *
 * @param {string} [book] - Optional book filter
 * @returns {Array} Array of review items with edit counts
 */
function getReviewQueue(book) {
  const conn = getDb();

  let query = `
    SELECT
      mr.id,
      mr.book,
      mr.chapter,
      mr.module_id,
      mr.submitted_by_username,
      mr.submitted_at,
      mr.status,
      mr.edited_segments,
      COUNT(CASE WHEN se.status = 'pending' THEN 1 END) as pending_edits,
      COUNT(CASE WHEN se.status = 'approved' THEN 1 END) as approved_edits,
      COUNT(CASE WHEN se.status = 'rejected' THEN 1 END) as rejected_edits,
      COUNT(CASE WHEN se.status = 'discuss' THEN 1 END) as discuss_edits
    FROM module_reviews mr
    LEFT JOIN segment_edits se ON mr.book = se.book AND mr.module_id = se.module_id
    WHERE mr.status IN ('pending', 'in_review')`;

  const params = [];
  if (book) {
    query += ` AND mr.book = ?`;
    params.push(book);
  }

  query += `
    GROUP BY mr.id
    ORDER BY mr.submitted_at ASC`;

  return conn.prepare(query).all(...params);
}

module.exports = {
  // Segment edits
  saveSegmentEdit,
  getModuleEdits,
  getSegmentEdits,
  getEditById,
  deleteSegmentEdit,
  // Review actions
  approveEdit,
  rejectEdit,
  markForDiscussion,
  // Module reviews
  submitModuleForReview,
  getPendingModuleReviews,
  getModuleReviewWithEdits,
  completeModuleReview,
  // Apply to files
  applyApprovedEdits,
  getApplyStatus,
  // Discussions
  addDiscussionComment,
  getDiscussion,
  // Statistics
  getModuleStats,
  // Review queue
  getReviewQueue,
};
