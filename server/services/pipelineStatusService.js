/**
 * Pipeline Status Service
 *
 * Manages chapter pipeline status in the database.
 * Provides stage transitions with validation, revert, and history.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const log = require('../lib/logger');
const resolveDbPath = require('../lib/dbPath');

const DB_PATH = resolveDbPath();
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// --- Constants ---

const STAGE_ORDER = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'injection',
  'rendering',
  'publication',
];

const { PUBLICATION_TRACKS, NON_SEQUENTIAL_STAGES } = require('../constants');

const VALID_STATUSES = ['not_started', 'in_progress', 'complete'];

const ALL_STAGES = [
  ...STAGE_ORDER.filter((s) => s !== 'publication'),
  ...PUBLICATION_TRACKS.map((t) => `publication.${t}`),
];

// Base stages (without 'publication')
const BASE_STAGES = STAGE_ORDER.filter((s) => s !== 'publication');

// Stages that are reported but do NOT participate in sequencing (C10-R2).
// Defined once in ../constants — the status.json read model in routes/status.js
// consumes the same list, so the two read models cannot disagree.
// Leaving `tmCreated` in the prerequisite chain made EVERY
// `advanceChapterStatus(…, 'injection')` throw — swallowed at
// pipelineService.js:744-746 — so DB-side chapter status silently never
// advanced past linguisticReview.
const NON_SEQUENTIAL = new Set(NON_SEQUENTIAL_STAGES);

// Stages that DO form the sequential chain, in order.
const SEQUENTIAL_STAGES = BASE_STAGES.filter((s) => !NON_SEQUENTIAL.has(s));

// --- DB connection ---

let _testDb = null;

function _setTestDb(db) {
  _testDb = db;
}

function _getTestDb() {
  return _testDb;
}

let _db;
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

// --- Helpers ---

function chapterDir(chapterNum) {
  if (chapterNum === -1) return 'appendices';
  return `ch${String(chapterNum).padStart(2, '0')}`;
}

// --- Core functions ---

/**
 * Get the current pipeline stage and status for a chapter.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @returns {{ currentStage: string, stages: Object, publication: Object }}
 */
function getChapterStage(bookSlug, chapterNum) {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        'SELECT stage, status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ?'
      )
      .all(bookSlug, chapterNum);

    const statusMap = {};
    for (const row of rows) {
      statusMap[row.stage] = row.status;
    }

    // Build stages object (7 base stages)
    const stages = {};
    for (const stage of BASE_STAGES) {
      stages[stage] = statusMap[stage] || 'not_started';
    }

    // Build publication object (3 tracks)
    const publication = {};
    for (const track of PUBLICATION_TRACKS) {
      publication[track] = statusMap[`publication.${track}`] || 'not_started';
    }

    // currentStage: first non-complete SEQUENTIAL stage, or 'publication' if all
    // complete. Non-sequential stages are skipped — `tmCreated` is never
    // advanced, so including it would pin currentStage there forever (C10-R2).
    let currentStage = 'publication';
    for (const stage of SEQUENTIAL_STAGES) {
      if (stages[stage] !== 'complete') {
        currentStage = stage;
        break;
      }
    }

    return { currentStage, stages, publication };
  } finally {
  }
}

/**
 * Transition a stage to a new status.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @param {string} stage - Stage name (from ALL_STAGES)
 * @param {string} status - New status (from VALID_STATUSES)
 * @param {string} user - User performing the transition
 * @param {string} [note] - Optional note
 * @returns {{ stage: string, status: string }}
 */
function transitionStage(bookSlug, chapterNum, stage, status, user, note) {
  // Validate inputs
  if (!ALL_STAGES.includes(stage)) {
    throw new Error(`Invalid stage: "${stage}"`);
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: "${status}"`);
  }

  const db = getDb();
  try {
    const result = db.transaction(() => {
      // Prerequisite check only when completing a stage
      if (status === 'complete') {
        if (stage.startsWith('publication.')) {
          // Publication sub-tracks require rendering to be complete
          const renderingRow = db
            .prepare(
              'SELECT status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?'
            )
            .get(bookSlug, chapterNum, 'rendering');
          if (!renderingRow || renderingRow.status !== 'complete') {
            throw new Error(`Cannot complete ${stage}: rendering must be complete first`);
          }
        } else {
          // Base stage: the nearest preceding SEQUENTIAL stage must be complete.
          // Non-sequential stages are stepped over — they are reported, never
          // gates (C10-R2). Note this also governs completing a non-sequential
          // stage itself: `tmCreated` still requires `linguisticReview`.
          let priorIdx = BASE_STAGES.indexOf(stage) - 1;
          while (priorIdx >= 0 && NON_SEQUENTIAL.has(BASE_STAGES[priorIdx])) {
            priorIdx--;
          }
          if (priorIdx >= 0) {
            const priorStage = BASE_STAGES[priorIdx];
            const priorRow = db
              .prepare(
                'SELECT status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND stage = ?'
              )
              .get(bookSlug, chapterNum, priorStage);
            if (!priorRow || priorRow.status !== 'complete') {
              throw new Error(`Cannot complete ${stage}: ${priorStage} must be complete first`);
            }
          }
        }
      }

      const completedAt = status === 'complete' ? new Date().toISOString() : null;
      const completedBy = status === 'complete' ? user : null;

      db.prepare(
        `INSERT INTO chapter_pipeline_status (book_slug, chapter_num, stage, status, completed_at, completed_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(book_slug, chapter_num, stage) DO UPDATE SET
           status = excluded.status,
           completed_at = excluded.completed_at,
           completed_by = excluded.completed_by,
           notes = COALESCE(excluded.notes, chapter_pipeline_status.notes)`
      ).run(bookSlug, chapterNum, stage, status, completedAt, completedBy, note || null);

      return { stage, status };
    })();

    // Sync status.json (skip in test mode)
    if (!_testDb) {
      try {
        syncStatusJsonCache(bookSlug, chapterNum);
      } catch (err) {
        log.error({ err, bookSlug, chapterNum }, 'syncStatusJsonCache failed');
      }
    }

    return result;
  } finally {
  }
}

/**
 * Revert the latest completed stage to not_started.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @param {string} user
 * @param {string} note - Required reason for revert
 * @returns {{ revertedStage: string, newStatus: string }}
 */
function revertStage(bookSlug, chapterNum, user, note) {
  if (!note || !note.trim()) {
    throw new Error('A note is required when reverting a stage');
  }

  const db = getDb();
  try {
    const result = db.transaction(() => {
      const rows = db
        .prepare(
          'SELECT stage, status FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ? AND status = ?'
        )
        .all(bookSlug, chapterNum, 'complete');

      if (rows.length === 0) {
        throw new Error('No completed stage to revert');
      }

      const completedStages = rows.map((r) => r.stage);

      // Find the latest completed stage: check publication sub-tracks first (reversed), then base stages (reversed)
      let latestStage = null;

      // Check publication sub-tracks in reverse order
      for (let i = PUBLICATION_TRACKS.length - 1; i >= 0; i--) {
        const pubStage = `publication.${PUBLICATION_TRACKS[i]}`;
        if (completedStages.includes(pubStage)) {
          latestStage = pubStage;
          break;
        }
      }

      // If no publication sub-track found, check SEQUENTIAL stages in reverse.
      // Non-sequential stages are skipped so revert stays the inverse of
      // advance: `/advance` transitions whatever `currentStage` reports, which
      // never names a non-sequential stage, so a revert landing on one would
      // both waste the revert and be unrestorable through the API. Reachable
      // with legacy data — efnafraedi-2e ch03/ch04 carry a Matecat-era
      // `tmCreated: complete`.
      if (!latestStage) {
        for (let i = SEQUENTIAL_STAGES.length - 1; i >= 0; i--) {
          if (completedStages.includes(SEQUENTIAL_STAGES[i])) {
            latestStage = SEQUENTIAL_STAGES[i];
            break;
          }
        }
      }

      db.prepare(
        `UPDATE chapter_pipeline_status
         SET status = 'not_started',
             completed_at = NULL,
             completed_by = NULL,
             notes = ?
         WHERE book_slug = ? AND chapter_num = ? AND stage = ?`
      ).run(`Reverted by ${user}: ${note}`, bookSlug, chapterNum, latestStage);

      return { revertedStage: latestStage, newStatus: 'not_started' };
    })();

    if (!_testDb) {
      try {
        syncStatusJsonCache(bookSlug, chapterNum);
      } catch (err) {
        log.error({ err, bookSlug, chapterNum }, 'syncStatusJsonCache failed after revert');
      }
    }

    return result;
  } finally {
  }
}

/**
 * Get combined history from pipeline status and generation log.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 * @returns {Array<{ type: string, ... }>}
 */
function getStageHistory(bookSlug, chapterNum) {
  const db = getDb();
  try {
    const entries = [];

    // Status rows
    const statusRows = db
      .prepare(
        'SELECT stage, status, completed_at, completed_by, notes, updated_at FROM chapter_pipeline_status WHERE book_slug = ? AND chapter_num = ?'
      )
      .all(bookSlug, chapterNum);

    for (const row of statusRows) {
      entries.push({
        type: 'status',
        stage: row.stage,
        status: row.status,
        completedAt: row.completed_at,
        completedBy: row.completed_by,
        notes: row.notes,
        timestamp: row.updated_at,
      });
    }

    // Generation log rows (table may not exist)
    try {
      const logRows = db
        .prepare(
          'SELECT action, user_id, username, details, created_at FROM chapter_generation_log WHERE book_slug = ? AND chapter_num = ?'
        )
        .all(bookSlug, chapterNum);

      for (const row of logRows) {
        let details = {};
        try {
          details = JSON.parse(row.details || '{}');
        } catch {
          // ignore parse errors
        }
        entries.push({
          type: 'log',
          action: row.action,
          userId: row.user_id,
          username: row.username,
          details,
          timestamp: row.created_at,
        });
      }
    } catch {
      // chapter_generation_log table may not exist
    }

    // Sort by timestamp descending
    entries.sort((a, b) => {
      const ta = a.timestamp || '';
      const tb = b.timestamp || '';
      return tb.localeCompare(ta);
    });

    return entries;
  } finally {
  }
}

/**
 * Sync the DB pipeline status to the chapter's status.json file.
 * Best-effort: catches and logs errors.
 *
 * @param {string} bookSlug
 * @param {number} chapterNum
 */
function syncStatusJsonCache(bookSlug, chapterNum) {
  if (_testDb) return; // No filesystem in tests

  try {
    const chDir = chapterDir(chapterNum);
    const statusPath = path.join(BOOKS_DIR, bookSlug, 'chapters', chDir, 'status.json');

    // Read existing status.json
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    } catch {
      // File may not exist yet
    }

    // Preserve non-pipeline fields
    const preserved = {};
    for (const key of ['chapter', 'titleEn', 'titleIs', 'sections', 'images', 'notes']) {
      if (existing[key] !== undefined) {
        preserved[key] = existing[key];
      }
    }

    // Get current DB state
    const { stages, publication } = getChapterStage(bookSlug, chapterNum);

    // Rebuild the status object in the format status.json expects:
    // { stage: { complete: bool, date?, notes? } }
    const statusObj = {};
    const existingStatus = existing.status || {};

    for (const stage of BASE_STAGES) {
      const dbStatus = stages[stage];
      const prev = existingStatus[stage] || {};
      statusObj[stage] = {
        complete: dbStatus === 'complete',
        ...(dbStatus === 'complete' && prev.date ? { date: prev.date } : {}),
        ...(dbStatus === 'complete' && !prev.date
          ? { date: new Date().toISOString().split('T')[0] }
          : {}),
        ...(prev.notes ? { notes: prev.notes } : {}),
      };
    }

    // Publication sub-tracks
    const existingPub = existingStatus.publication || {};
    statusObj.publication = {};
    for (const track of PUBLICATION_TRACKS) {
      const dbStatus = publication[track];
      const prev = existingPub[track] || {};
      statusObj.publication[track] = {
        complete: dbStatus === 'complete',
        ...(dbStatus === 'complete' && prev.date ? { date: prev.date } : {}),
        ...(dbStatus === 'complete' && !prev.date
          ? { date: new Date().toISOString().split('T')[0] }
          : {}),
        ...(prev.notes ? { notes: prev.notes } : {}),
      };
    }

    // Merge preserved fields with rebuilt status
    const output = { ...preserved, status: statusObj };

    // Write back
    const dir = path.dirname(statusPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(statusPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  } catch (err) {
    log.error({ err, bookSlug, chapterDir: chapterDir(chapterNum) }, 'syncStatusJsonCache error');
  } finally {
  }
}

/**
 * Read the active (non-expired) lock for a chapter, if any.
 *
 * Read-only peek that reuses the service's singleton DB handle rather than
 * opening a fresh connection per request (the route previously did the latter).
 *
 * @param {string} chapterId - lock id, e.g. "efnafraedi-2e-01"
 * @returns {{ lockedBy: string, expiresAt: string } | null}
 */
function getActiveLock(chapterId) {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT locked_by, expires_at FROM chapter_locks WHERE chapter_id = ? AND expires_at > datetime('now')"
      )
      .get(chapterId);
    return row ? { lockedBy: row.locked_by, expiresAt: row.expires_at } : null;
  } catch {
    // Lock table may not exist yet
    return null;
  }
}

module.exports = {
  getChapterStage,
  transitionStage,
  revertStage,
  getStageHistory,
  getActiveLock,
  syncStatusJsonCache,
  _setTestDb,
  _getTestDb,
  STAGE_ORDER,
  PUBLICATION_TRACKS,
  ALL_STAGES,
  VALID_STATUSES,
};
