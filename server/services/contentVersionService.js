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
const segmentParser = require('./segmentParser');
const activityLog = require('./activityLog');
const tmService = require('./tmService');
const concordanceService = require('./concordanceService');
const resolveDbPath = require('../lib/dbPath');

const DB_PATH = resolveDbPath();

// item 15: the two content tracks that carry version history. Each entry
// wires the loader, the editable-content field, the writer, and the
// post-write cache hooks for restoreVersion.
const TRACKS = {
  faithful: {
    load: (book, chapter, moduleId) => segmentParser.loadModuleForEditing(book, chapter, moduleId),
    currentContent: (seg) => seg.is || '',
    write: (book, chapter, moduleId, segments) =>
      segmentParser.saveModuleSegments(book, chapter, moduleId, segments),
    runPostWriteHooks: true,
  },
  localized: {
    load: (book, chapter, moduleId) =>
      segmentParser.loadModuleForLocalization(book, chapter, moduleId),
    // The loc editor's editable baseline: localized when present, else faithful.
    currentContent: (seg) => (seg.hasLocalized ? seg.localized : seg.faithful) || '',
    write: (book, chapter, moduleId, segments) =>
      segmentParser.saveLocalizedSegments(book, chapter, moduleId, segments),
    // TM regen + concordance both consume FAITHFUL content — a localized
    // restore must refresh neither.
    runPostWriteHooks: false,
  },
};

function trackConfig(track) {
  const cfg = TRACKS[track];
  if (!cfg) {
    throw new TypeError(`Unknown content track: ${JSON.stringify(track)}`);
  }
  return cfg;
}

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
 * @param {import('better-sqlite3').Database} [db] - Existing connection to write
 *   on. Pass the caller's connection when the snapshot must run inside an
 *   already-open (IMMEDIATE) write transaction — otherwise a second connection
 *   would deadlock on SQLITE_BUSY and the snapshot would be silently lost.
 * @param {'faithful'|'localized'} [track='faithful'] - Content track this
 *   snapshot belongs to. Each track keeps its own version counter.
 * @returns {{ version: number, segmentsSnapshotted: number }}
 */
function snapshotModule(
  book,
  chapter,
  moduleId,
  segments,
  appliedBy,
  db = getDb(),
  track = 'faithful'
) {
  trackConfig(track); // validate before touching the DB

  // Determine next version number for this module, scoped to this track
  const latest = db
    .prepare(
      `SELECT MAX(version) as maxVer FROM content_versions
       WHERE book = ? AND module_id = ? AND track = ?`
    )
    .get(book, moduleId, track);

  const nextVersion = (latest?.maxVer || 0) + 1;

  const insert = db.prepare(
    `INSERT INTO content_versions (book, chapter, module_id, segment_id, content, version, track, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    let count = 0;
    for (const seg of segments) {
      // Record every segment, empty string included: at restore time,
      // absence-from-snapshot is indistinguishable from "was never extracted",
      // which broke restore-undo for untranslated segments (item 12, F19).
      // Nullish content throws (NOT NULL / binding error) and aborts the
      // snapshot transaction — a bad caller must fail loud, not shrink history.
      insert.run(
        book,
        chapter,
        moduleId,
        seg.segmentId,
        seg.content,
        nextVersion,
        track,
        appliedBy
      );
      count++;
    }
    return count;
  });

  const segmentsSnapshotted = insertAll();
  log.info(
    { book, moduleId, version: nextVersion, track, segments: segmentsSnapshotted },
    'Content snapshot created'
  );

  return { version: nextVersion, segmentsSnapshotted };
}

/**
 * Get all versions for a module (version numbers + metadata).
 *
 * @param {string} book
 * @param {string} moduleId
 * @param {'faithful'|'localized'} [track='faithful']
 * @returns {Array<{ version: number, applied_by: string, applied_at: string, segments: number }>}
 */
function getModuleVersions(book, moduleId, track = 'faithful') {
  trackConfig(track);
  const db = getDb();
  return db
    .prepare(
      `SELECT version, applied_by, applied_at, COUNT(*) as segments
       FROM content_versions
       WHERE book = ? AND module_id = ? AND track = ?
       GROUP BY version
       ORDER BY version DESC`
    )
    .all(book, moduleId, track);
}

/**
 * Get a specific version's content for a module (all segments).
 *
 * @param {string} book
 * @param {string} moduleId
 * @param {number} version
 * @param {'faithful'|'localized'} [track='faithful']
 * @returns {Array<{ segment_id: string, content: string }>}
 */
function getVersionContent(book, moduleId, version, track = 'faithful') {
  trackConfig(track);
  const db = getDb();
  return db
    .prepare(
      `SELECT segment_id, content
       FROM content_versions
       WHERE book = ? AND module_id = ? AND version = ? AND track = ?
       ORDER BY segment_id`
    )
    .all(book, moduleId, version, track);
}

/**
 * Get version history for a specific segment (all versions).
 *
 * @param {string} book
 * @param {string} moduleId
 * @param {string} segmentId
 * @param {'faithful'|'localized'} [track='faithful']
 * @returns {Array<{ version: number, content: string, applied_by: string, applied_at: string }>}
 */
function getSegmentHistory(book, moduleId, segmentId, track = 'faithful') {
  trackConfig(track);
  const db = getDb();
  return db
    .prepare(
      `SELECT version, content, applied_by, applied_at
       FROM content_versions
       WHERE book = ? AND module_id = ? AND segment_id = ? AND track = ?
       ORDER BY version DESC`
    )
    .all(book, moduleId, segmentId, track);
}

/**
 * Restore a module's faithful translation to a previous snapshot version.
 *
 * This is the *backward* (rollback) complement to edit-again's *forward*
 * editing: it writes a chosen `content_versions` snapshot back as the faithful
 * file, which then becomes the baseline for the next `applyApprovedEdits`
 * (`loadModuleForEditing` reads the faithful file first).
 *
 * The restore is itself reversible: the *current* content is snapshotted as a
 * fresh version **before** the chosen version is written, so a head-editor can
 * always roll forward again.
 *
 * Graceful when the extraction changed since the snapshot — the on-disk file is
 * always rebuilt against the *current* segment structure:
 *   - segments present in both the snapshot and the current extraction are
 *     restored to the snapshot content;
 *   - current segments absent from the snapshot keep their present content;
 *   - snapshot segments no longer in the extraction are skipped (warned).
 * Nothing in `content_versions` is deleted, so no snapshot data is lost.
 *
 * @param {string} book
 * @param {number} chapter
 * @param {string} moduleId
 * @param {number} version - the snapshot version to restore
 * @param {{ userId?: string|number, username?: string }} [restoredBy] - actor
 * @param {'faithful'|'localized'} [track='faithful'] - Which content track to
 *   restore. 'localized' loads/writes via the Pass-2 (localization) files and
 *   skips the faithful-only post-write cache hooks (TM regen, concordance) —
 *   those consume faithful content only.
 * @returns {{ restoredVersion: number, snapshotVersion: number,
 *   segmentsRestored: number, segmentsKept: number, segmentsSkipped: number,
 *   savedPath: string }}
 */
function restoreVersion(book, chapter, moduleId, version, restoredBy = {}, track = 'faithful') {
  const cfg = trackConfig(track); // validate before touching the DB or filesystem
  const actorName =
    restoredBy.username || (restoredBy.userId != null ? String(restoredBy.userId) : 'system');

  // 1. Load the requested snapshot
  const snapshot = getVersionContent(book, moduleId, version, track);
  if (snapshot.length === 0) {
    throw new Error(`Version ${version} not found for ${moduleId}`);
  }
  const snapshotLookup = new Map(snapshot.map((s) => [s.segment_id, s.content]));

  // 2. Load the current module for canonical segment order + current content
  const data = cfg.load(book, chapter, moduleId);

  // 3. Snapshot current content first, so this restore can itself be undone
  const currentSegments = data.segments.map((seg) => ({
    segmentId: seg.segmentId,
    content: cfg.currentContent(seg),
  }));
  const { version: snapshotVersion } = snapshotModule(
    book,
    chapter,
    moduleId,
    currentSegments,
    actorName,
    getDb(),
    track
  );

  // 4. Rebuild the file from the snapshot, aligned to current extraction
  let segmentsRestored = 0;
  let segmentsKept = 0;
  const restoredSegments = data.segments.map((seg) => {
    if (snapshotLookup.has(seg.segmentId)) {
      segmentsRestored++;
      return { segmentId: seg.segmentId, content: snapshotLookup.get(seg.segmentId) };
    }
    segmentsKept++;
    return { segmentId: seg.segmentId, content: cfg.currentContent(seg) };
  });

  const currentIds = new Set(data.segments.map((s) => s.segmentId));
  const skipped = snapshot.filter((s) => !currentIds.has(s.segment_id));
  if (skipped.length > 0) {
    log.warn(
      { book, moduleId, version, track, skipped: skipped.map((s) => s.segment_id) },
      'Restore: snapshot segments no longer in current extraction were skipped'
    );
  }

  // 5. Write the restored content back as the new baseline for this track
  const savedPath = cfg.write(book, chapter, moduleId, restoredSegments);

  // Keep derived caches current — the same two best-effort steps the apply
  // path runs after writing the faithful file (segmentEditorService
  // :995-1009). Never fail the restore over a cache refresh. TM regen and
  // concordance both index FAITHFUL content only, so a localized restore
  // must not trigger either (cfg.runPostWriteHooks is false for 'localized').
  if (cfg.runPostWriteHooks) {
    try {
      tmService.scheduleTmRegen(book);
    } catch (err) {
      log.error({ err, book }, 'Scheduling TM regeneration after restore failed');
    }
    try {
      concordanceService.indexModule(book, chapter, moduleId);
    } catch (err) {
      log.error({ err, book, moduleId }, 'Concordance indexing after restore failed');
    }
  }

  const result = {
    restoredVersion: version,
    snapshotVersion,
    segmentsRestored,
    segmentsKept,
    segmentsSkipped: skipped.length,
    savedPath,
  };

  // 6. Audit trail (best-effort — never fail the restore over a log write)
  activityLog.log({
    type: activityLog.ACTIVITY_TYPES.VERSION_RESTORED,
    userId: String(restoredBy.userId != null ? restoredBy.userId : 'system'),
    username: actorName,
    book,
    chapter: String(chapter),
    section: moduleId,
    description: `Færði ${moduleId} í útgáfu ${version} (núverandi efni vistað sem útgáfa ${snapshotVersion})`,
    metadata: {
      restoredVersion: version,
      snapshotVersion,
      segmentsRestored,
      segmentsKept,
      segmentsSkipped: skipped.length,
      track,
    },
  });

  log.info({ book, moduleId, track, ...result }, 'Module restored to previous version');
  return result;
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
  restoreVersion,
  _setTestDb,
};
