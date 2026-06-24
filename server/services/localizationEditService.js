/**
 * Localization Edit Service
 *
 * Audit trail for localization (Pass 2) edits.
 * Write-only log — records every save for history and accountability.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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

/**
 * Log a single localization edit.
 */
function logLocalizationEdit({
  book,
  chapter,
  moduleId,
  segmentId,
  previousContent,
  newContent,
  category,
  editorId,
  editorUsername,
}) {
  const conn = getDb();
  const result = conn
    .prepare(
      `INSERT INTO localization_edits
       (book, chapter, module_id, segment_id, previous_content, new_content,
        category, editor_id, editor_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      book,
      chapter,
      moduleId,
      segmentId,
      previousContent,
      newContent,
      category || null,
      editorId,
      editorUsername
    );
  return { id: result.lastInsertRowid };
}

/**
 * Log multiple localization edits in a single transaction.
 */
function logLocalizationEdits(edits) {
  const conn = getDb();
  const insert = conn.prepare(
    `INSERT INTO localization_edits
     (book, chapter, module_id, segment_id, previous_content, new_content,
      category, editor_id, editor_username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAll = conn.transaction((rows) => {
    let count = 0;
    for (const row of rows) {
      insert.run(
        row.book,
        row.chapter,
        row.moduleId,
        row.segmentId,
        row.previousContent,
        row.newContent,
        row.category || null,
        row.editorId,
        row.editorUsername
      );
      count++;
    }
    return count;
  });

  return { logged: insertAll(edits) };
}

/**
 * Get edit history for a specific segment.
 */
function getSegmentHistory(book, moduleId, segmentId, limit = 20) {
  const conn = getDb();
  return conn
    .prepare(
      `SELECT id, segment_id, previous_content, new_content, category,
              editor_username, created_at
       FROM localization_edits
       WHERE book = ? AND module_id = ? AND segment_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(book, moduleId, segmentId, limit);
}

/**
 * Get edit history for an entire module.
 */
function getModuleHistory(book, moduleId, limit = 50) {
  const conn = getDb();
  return conn
    .prepare(
      `SELECT id, segment_id, previous_content, new_content, category,
              editor_username, created_at
       FROM localization_edits
       WHERE book = ? AND module_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(book, moduleId, limit);
}

module.exports = {
  logLocalizationEdit,
  logLocalizationEdits,
  getSegmentHistory,
  getModuleHistory,
};
