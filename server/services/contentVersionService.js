/**
 * Content Version Service
 *
 * Manages per-segment content snapshots for rollback capability.
 * A snapshot is created automatically before applyApprovedEdits
 * overwrites the faithful translation file.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const log = require('../lib/logger');

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
  }
  return _db;
}

/**
 * Snapshot the current content of all segments in a module before overwriting.
 * Called from applyApprovedEdits() before writing the faithful file.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @param {Array<{segmentId: string, content: string}>} segments - Current segment content
 * @param {string} [appliedBy] - User who triggered the apply
 * @returns {{ version: number, segmentsSnapshotted: number }}
 */
function snapshotModule(book, chapter, moduleId, segments, appliedBy) {
  const db = getDb();

  // Determine next version number for this module
  const latest = db
    .prepare(
      `SELECT MAX(version) as maxVer FROM content_versions
       WHERE book = ? AND module_id = ?`
    )
    .get(book, moduleId);

  const nextVersion = (latest?.maxVer || 0) + 1;

  const insert = db.prepare(
    `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    let count = 0;
    for (const seg of segments) {
      if (seg.content) {
        insert.run(book, chapter, moduleId, seg.segmentId, seg.content, nextVersion, appliedBy);
        count++;
      }
    }
    return count;
  });

  const segmentsSnapshotted = insertAll();
  log.info(
    { book, moduleId, version: nextVersion, segments: segmentsSnapshotted },
    'Content snapshot created'
  );

  return { version: nextVersion, segmentsSnapshotted };
}

/**
 * Get all versions for a module (version numbers + metadata).
 *
 * @param {string} book
 * @param {string} moduleId
 * @returns {Array<{ version: number, applied_by: string, applied_at: string, segments: number }>}
 */
function getModuleVersions(book, moduleId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT version, applied_by, applied_at, COUNT(*) as segments
       FROM content_versions
       WHERE book = ? AND module_id = ?
       GROUP BY version
       ORDER BY version DESC`
    )
    .all(book, moduleId);
}

/**
 * Get a specific version's content for a module (all segments).
 *
 * @param {string} book
 * @param {string} moduleId
 * @param {number} version
 * @returns {Array<{ segment_id: string, content: string }>}
 */
function getVersionContent(book, moduleId, version) {
  const db = getDb();
  return db
    .prepare(
      `SELECT segment_id, content
       FROM content_versions
       WHERE book = ? AND module_id = ? AND version = ?
       ORDER BY segment_id`
    )
    .all(book, moduleId, version);
}

/**
 * Get version history for a specific segment (all versions).
 *
 * @param {string} book
 * @param {string} moduleId
 * @param {string} segmentId
 * @returns {Array<{ version: number, content: string, applied_by: string, applied_at: string }>}
 */
function getSegmentHistory(book, moduleId, segmentId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT version, content, applied_by, applied_at
       FROM content_versions
       WHERE book = ? AND module_id = ? AND segment_id = ?
       ORDER BY version DESC`
    )
    .all(book, moduleId, segmentId);
}

/** @internal Test helper */
function _setTestDb(testDb) {
  _testDb = testDb;
}

module.exports = {
  snapshotModule,
  getModuleVersions,
  getVersionContent,
  getSegmentHistory,
  _setTestDb,
};
