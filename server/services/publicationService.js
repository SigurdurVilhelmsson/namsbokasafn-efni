/**
 * Publication Service (v2 — HTML Pipeline)
 *
 * Manages the three-track publication workflow using the cnxml-inject/render pipeline:
 * 1. MT Preview  — Machine-translated segments → inject → render → HTML
 * 2. Faithful    — Human-reviewed segments → inject → render → HTML
 * 3. Localized   — Culturally adapted segments → inject → render → HTML
 *
 * The core publish action is:
 *   validate readiness → pipelineService.runPipeline() → update status
 *
 * Readiness is file-system based: does the source directory have segment files?
 * Publication output is semantic HTML produced by cnxml-render.js.
 */

const path = require('path');
const fs = require('fs');
const pipelineService = require('./pipelineService');
const segmentParser = require('./segmentParser');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// Publication tracks
const PUBLICATION_TRACKS = {
  MT_PREVIEW: 'mt-preview',
  FAITHFUL: 'faithful',
  LOCALIZED: 'localized',
};

// Source directory for each track (maps to pipelineService.TRACK_SOURCE_DIR)
const TRACK_SOURCE_DIRS = {
  'mt-preview': '02-machine-translated',
  faithful: '03-faithful-translation',
  localized: '04-localized-content',
};

// =====================================================================
// READINESS CHECKS
// =====================================================================

/**
 * Check if a chapter has source segment files ready for a given track.
 *
 * @param {string} bookSlug - Book slug (e.g., 'efnafraedi')
 * @param {number} chapterNum - Chapter number
 * @param {string} track - Publication track ('mt-preview', 'faithful', 'localized')
 * @returns {object} { ready, reason?, moduleCount?, modules?, sourceDir? }
 */
function checkTrackReadiness(bookSlug, chapterNum, track) {
  const sourceDir = TRACK_SOURCE_DIRS[track];
  if (!sourceDir) {
    return { ready: false, reason: `Unknown track: ${track}` };
  }

  const chapterStr = String(chapterNum).padStart(2, '0');
  const fullDir = path.join(BOOKS_DIR, bookSlug, sourceDir, `ch${chapterStr}`);

  if (!fs.existsSync(fullDir)) {
    return {
      ready: false,
      reason: `Source directory not found: ${sourceDir}/ch${chapterStr}`,
      modules: [],
    };
  }

  // Find IS segment files
  const files = fs.readdirSync(fullDir).filter((f) => f.match(/^m\d+-segments\.is\.md$/));

  if (files.length === 0) {
    return {
      ready: false,
      reason: `No segment files found in ${sourceDir}/ch${chapterStr}`,
      modules: [],
    };
  }

  const modules = files
    .map((f) => {
      const match = f.match(/^(m\d+)-segments\.is\.md$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  return {
    ready: true,
    moduleCount: modules.length,
    modules,
    sourceDir: `${sourceDir}/ch${chapterStr}`,
  };
}

/**
 * Check MT preview readiness (02-machine-translated has IS segment files).
 */
function checkMtPreviewReadiness(bookSlug, chapterNum) {
  return checkTrackReadiness(bookSlug, chapterNum, 'mt-preview');
}

/**
 * Check faithful readiness (03-faithful-translation has IS segment files).
 */
function checkFaithfulReadiness(bookSlug, chapterNum) {
  return checkTrackReadiness(bookSlug, chapterNum, 'faithful');
}

/**
 * Check localized readiness (04-localized-content has IS segment files).
 */
function checkLocalizedReadiness(bookSlug, chapterNum) {
  return checkTrackReadiness(bookSlug, chapterNum, 'localized');
}

// =====================================================================
// PUBLISH (delegates to pipelineService)
// =====================================================================

/**
 * Publish a chapter by running the inject→render pipeline.
 * Returns a job ID for polling progress via /api/pipeline/status/:jobId.
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} track - Publication track ('mt-preview', 'faithful', 'localized')
 * @param {string} userId - User who triggered the publish
 * @returns {object} { jobId, track, chapter, moduleCount, modules }
 */
function publishChapter(bookSlug, chapterNum, track, userId) {
  const readiness = checkTrackReadiness(bookSlug, chapterNum, track);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for ${track} publication: ${readiness.reason}`);
  }

  // Check for already-running pipeline
  const existing = pipelineService.hasRunningJob(chapterNum, 'pipeline');
  if (existing) {
    throw new Error(
      `Pipeline already running for chapter ${chapterNum} (job: ${existing.id}). ` +
        'Wait for it to complete or check its status.'
    );
  }

  // Launch inject → render pipeline
  const { jobId, promise } = pipelineService.runPipeline({
    chapter: chapterNum,
    track,
    userId,
  });

  // When pipeline completes, update chapter status.json
  promise.then(() => {
    const job = pipelineService.getJob(jobId);
    if (job && job.status === 'completed') {
      const trackKey = track === 'mt-preview' ? 'mtPreview' : track;
      updateChapterStatus(bookSlug, chapterNum, 'publication', {
        [trackKey]: {
          complete: true,
          date: new Date().toISOString().split('T')[0],
          pipeline: 'html',
          moduleCount: readiness.moduleCount,
        },
      });
    }
  });

  return {
    jobId,
    track,
    chapter: chapterNum,
    moduleCount: readiness.moduleCount,
    modules: readiness.modules,
  };
}

/**
 * Publish MT preview for a chapter.
 */
function publishMtPreview(bookSlug, chapterNum, userId) {
  return publishChapter(bookSlug, chapterNum, 'mt-preview', userId);
}

/**
 * Publish faithful translation for a chapter.
 */
function publishFaithful(bookSlug, chapterNum, userId) {
  return publishChapter(bookSlug, chapterNum, 'faithful', userId);
}

/**
 * Publish localized content for a chapter.
 */
function publishLocalized(bookSlug, chapterNum, userId) {
  return publishChapter(bookSlug, chapterNum, 'localized', userId);
}

// =====================================================================
// STATUS
// =====================================================================

/**
 * Get publication status for a chapter.
 * Checks for HTML files in the publication output directories.
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Status for each track + active track + readiness
 */
function getPublicationStatus(bookSlug, chapterNum) {
  const chapterStr = String(chapterNum).padStart(2, '0');
  const pubDir = path.join(BOOKS_DIR, bookSlug, '05-publication');

  function trackStatus(trackDir) {
    // cnxml-render outputs to chapters/NN/ (two-digit, no "ch" prefix)
    const dir = path.join(pubDir, trackDir, 'chapters', chapterStr);
    if (!fs.existsSync(dir)) {
      return { published: false, fileCount: 0, path: null };
    }
    const htmlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
    return {
      published: htmlFiles.length > 0,
      fileCount: htmlFiles.length,
      files: htmlFiles,
      path: `05-publication/${trackDir}/chapters/${chapterStr}`,
    };
  }

  const status = {
    mtPreview: trackStatus('mt-preview'),
    faithful: trackStatus('faithful'),
    localized: trackStatus('localized'),
  };

  // Determine active track (what readers see — highest quality available)
  status.activeTrack = status.localized.published
    ? 'localized'
    : status.faithful.published
      ? 'faithful'
      : status.mtPreview.published
        ? 'mt-preview'
        : null;

  // Check readiness for each track
  status.readyFor = {
    mtPreview: checkMtPreviewReadiness(bookSlug, chapterNum).ready,
    faithful: checkFaithfulReadiness(bookSlug, chapterNum).ready,
    localized: checkLocalizedReadiness(bookSlug, chapterNum).ready,
  };

  // Check for running pipeline jobs
  const runningJob = pipelineService.hasRunningJob(chapterNum, 'pipeline');
  if (runningJob) {
    status.runningJob = {
      jobId: runningJob.id,
      track: runningJob.track,
      phase: runningJob.phase,
      startedAt: runningJob.startedAt,
    };
  }

  return status;
}

/**
 * Get module-level publication info for a chapter.
 * Shows which modules have source files in each track directory.
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} { modules: [...] }
 */
function getModulePublicationStatus(bookSlug, chapterNum) {
  const modules = segmentParser.listChapterModules(bookSlug, chapterNum);

  return {
    modules: modules.map((mod) => ({
      moduleId: mod.moduleId,
      sources: {
        mtOutput: mod.hasMtOutput,
        faithful: mod.hasFaithful,
        localized: mod.hasLocalized,
      },
    })),
  };
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Get existing files in a target directory.
 *
 * @param {string} targetDir - Target directory path
 * @param {string} pattern - File extension pattern (default: '.html')
 * @returns {Array} Array of file info objects
 */
function getExistingFiles(targetDir, pattern = '.html') {
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir)
    .filter((f) => f.endsWith(pattern))
    .map((f) => ({
      name: f,
      path: path.join(targetDir, f),
      mtime: fs.statSync(path.join(targetDir, f)).mtime.toISOString(),
    }));
}

/**
 * Update chapter status.json with publication data.
 */
function updateChapterStatus(bookSlug, chapterNum, stage, data) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const statusPath = path.join(BOOKS_DIR, bookSlug, 'chapters', chapterDir, 'status.json');

  let status = {};
  if (fs.existsSync(statusPath)) {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  }

  if (!status[stage]) {
    status[stage] = {};
  }

  Object.assign(status[stage], data);

  const statusDir = path.dirname(statusPath);
  if (!fs.existsSync(statusDir)) {
    fs.mkdirSync(statusDir, { recursive: true });
  }

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
}

module.exports = {
  PUBLICATION_TRACKS,
  checkMtPreviewReadiness,
  checkFaithfulReadiness,
  checkLocalizedReadiness,
  checkTrackReadiness,
  publishMtPreview,
  publishFaithful,
  publishLocalized,
  publishChapter,
  getPublicationStatus,
  getModulePublicationStatus,
  getExistingFiles,
  updateChapterStatus,
};
