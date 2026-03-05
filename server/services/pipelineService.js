/**
 * Pipeline Service
 *
 * Runs cnxml-inject and cnxml-render as child processes from the server.
 * Tracks running jobs with progress output and completion status.
 *
 * Pipeline flow:
 *   inject (segments → translated CNXML) → render (CNXML → HTML)
 *
 * Source directory mapping:
 *   mt-preview track  → source-dir: 02-mt-output
 *   faithful track    → source-dir: 03-faithful-translation
 *   localized track   → source-dir: 04-localized-content
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const TOOLS_DIR = path.join(PROJECT_ROOT, 'tools');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

// Track running and completed jobs
const jobs = new Map();

// Maximum concurrent pipeline jobs
const MAX_JOBS = 5;

// Source directory for each publication track
const TRACK_SOURCE_DIR = {
  'mt-preview': '02-mt-output',
  faithful: '03-faithful-translation',
  localized: '04-localized-content',
};

/**
 * Run cnxml-extract for a chapter/module.
 * Extracts EN segments + structure from CNXML source files.
 *
 * @param {Object} params
 * @param {string} params.book - Book slug
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.moduleId] - Specific module (or all in chapter)
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runExtract({ book, chapter, moduleId, userId }) {
  const args = [
    path.join(TOOLS_DIR, 'cnxml-extract.js'),
    '--book',
    book,
    '--chapter',
    String(chapter),
    '--verbose',
  ];

  if (moduleId) {
    args.push('--module', moduleId);
  }

  const result = spawnJob({
    type: 'extract',
    chapter,
    moduleId,
    track: null,
    userId,
    command: 'node',
    args,
  });

  // Auto-advance status when extraction completes
  result.promise.then(() => {
    const job = jobs.get(result.jobId);
    if (job && job.status === 'completed') {
      const sourceHash = computeSourceHash(book, chapter);
      advanceChapterStatus(book, chapter, 'extraction', sourceHash ? { sourceHash } : {});
    }
  });

  return result;
}

/**
 * Run protect-segments-for-mt for a chapter.
 * Protects EN segments for machine translation (handles placeholders, splits large files).
 *
 * @param {Object} params
 * @param {string} params.book - Book slug
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runProtect({ book, chapter, userId }) {
  const chapterStr = String(chapter).padStart(2, '0');
  const batchDir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${chapterStr}`);

  if (!fs.existsSync(batchDir)) {
    throw new Error(`EN segments directory not found: 02-for-mt/ch${chapterStr}`);
  }

  const args = [path.join(TOOLS_DIR, 'protect-segments-for-mt.js'), '--batch', batchDir];

  const result = spawnJob({
    type: 'protect',
    chapter,
    moduleId: undefined,
    track: null,
    userId,
    command: 'node',
    args,
  });

  // Auto-advance status when protection completes
  result.promise.then(() => {
    const job = jobs.get(result.jobId);
    if (job && job.status === 'completed') {
      advanceChapterStatus(book, chapter, 'mtReady');
    }
  });

  return result;
}

/**
 * Run unprotect-segments for a chapter.
 * Removes MT protection markers from translated segments in 02-mt-output.
 *
 * @param {Object} params
 * @param {string} params.book - Book slug
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runUnprotect({ book, chapter, userId }) {
  const chapterStr = String(chapter).padStart(2, '0');
  const batchDir = path.join(BOOKS_DIR, book, '02-mt-output', `ch${chapterStr}`);

  if (!fs.existsSync(batchDir)) {
    throw new Error(`MT output directory not found: 02-mt-output/ch${chapterStr}`);
  }

  const args = [path.join(TOOLS_DIR, 'unprotect-segments.js'), '--batch', batchDir, '--verbose'];

  const result = spawnJob({
    type: 'unprotect',
    chapter,
    moduleId: undefined,
    track: null,
    userId,
    command: 'node',
    args,
  });

  // Auto-advance status when unprotect completes
  result.promise.then(() => {
    const job = jobs.get(result.jobId);
    if (job && job.status === 'completed') {
      advanceChapterStatus(book, chapter, 'mtOutput');
    }
  });

  return result;
}

/**
 * Run cnxml-inject for a chapter/module.
 *
 * @param {Object} params
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.moduleId] - Specific module (or all in chapter)
 * @param {string} [params.track='faithful'] - Publication track
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runInject({ book, chapter, moduleId, track = 'faithful', userId }) {
  const sourceDir = TRACK_SOURCE_DIR[track] || '03-faithful-translation';

  const args = [
    path.join(TOOLS_DIR, 'cnxml-inject.js'),
    '--book',
    book,
    '--chapter',
    String(chapter),
    '--source-dir',
    sourceDir,
    '--verbose',
  ];

  if (moduleId) {
    args.push('--module', moduleId);
  }

  return spawnJob({
    type: 'inject',
    chapter,
    moduleId,
    track,
    userId,
    command: 'node',
    args,
  });
}

/**
 * Run cnxml-render for a chapter/module.
 *
 * @param {Object} params
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.moduleId] - Specific module (or all in chapter)
 * @param {string} [params.track='faithful'] - Publication track
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runRender({ book, chapter, moduleId, track = 'faithful', userId }) {
  const args = [
    path.join(TOOLS_DIR, 'cnxml-render.js'),
    '--book',
    book,
    '--chapter',
    String(chapter),
    '--track',
    track,
    '--verbose',
  ];

  if (moduleId) {
    args.push('--module', moduleId);
  }

  return spawnJob({
    type: 'render',
    chapter,
    moduleId,
    track,
    userId,
    command: 'node',
    args,
  });
}

/**
 * Run full pipeline: inject then render.
 *
 * @param {Object} params
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.moduleId] - Specific module (or all in chapter)
 * @param {string} [params.track='faithful'] - Publication track
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runPipeline({ book, chapter, moduleId, track = 'faithful', userId }) {
  // Guard: reject if too many concurrent jobs
  if (runningJobCount() >= MAX_JOBS) {
    throw new Error(
      `Maximum concurrent jobs limit reached (${MAX_JOBS}). Please wait for running jobs to complete.`
    );
  }

  const jobId = generateJobId();

  const job = {
    id: jobId,
    type: 'pipeline',
    chapter,
    moduleId: moduleId || 'all',
    track,
    userId,
    status: 'running',
    phase: 'inject',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [],
    error: null,
  };

  jobs.set(jobId, job);

  const promise = (async () => {
    try {
      // Phase 1: Inject
      job.output.push('=== Phase 1: Inject ===');
      const injectResult = await runInject({ book, chapter, moduleId, track, userId });
      await injectResult.promise;

      const injectJob = jobs.get(injectResult.jobId);
      if (injectJob.status === 'failed') {
        throw new Error(`Inject failed: ${injectJob.error}`);
      }
      job.output.push(...injectJob.output);

      // Auto-advance: injection complete
      advanceChapterStatus(book, chapter, 'injection', { track });

      // Phase 2: Render
      job.phase = 'render';
      job.output.push('', '=== Phase 2: Render ===');
      const renderResult = await runRender({ book, chapter, moduleId, track, userId });
      await renderResult.promise;

      const renderJob = jobs.get(renderResult.jobId);
      if (renderJob.status === 'failed') {
        throw new Error(`Render failed: ${renderJob.error}`);
      }
      job.output.push(...renderJob.output);

      // Auto-advance: rendering complete
      advanceChapterStatus(book, chapter, 'rendering', { track });

      // Done
      job.status = 'completed';
      job.phase = 'done';
      job.completedAt = new Date().toISOString();

      // Clean up sub-jobs
      jobs.delete(injectResult.jobId);
      jobs.delete(renderResult.jobId);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
    }
  })();

  return { jobId, promise };
}

/**
 * Count currently running jobs.
 */
function runningJobCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running') count++;
  }
  return count;
}

/**
 * Spawn a child process and track it as a job.
 */
function spawnJob({ type, chapter, moduleId, track, userId, command, args }) {
  // Guard: reject if too many concurrent jobs
  if (runningJobCount() >= MAX_JOBS) {
    throw new Error(
      `Maximum concurrent jobs limit reached (${MAX_JOBS}). Please wait for running jobs to complete.`
    );
  }

  const jobId = generateJobId();

  const job = {
    id: jobId,
    type,
    chapter,
    moduleId: moduleId || 'all',
    track,
    userId,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [],
    error: null,
  };

  jobs.set(jobId, job);

  const promise = new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      job.output.push(...lines);
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      // stderr includes verbose progress from the tools
      job.output.push(...lines);
    });

    child.on('error', (err) => {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
      resolve(job);
    });

    child.on('close', (code) => {
      if (code === 0) {
        job.status = 'completed';
      } else {
        job.status = 'failed';
        job.error = `Process exited with code ${code}`;
      }
      job.completedAt = new Date().toISOString();
      resolve(job);
    });
  });

  return { jobId, promise };
}

/**
 * Get job status.
 */
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * List recent jobs, optionally filtered.
 */
function listJobs({ chapter, type, status, limit = 20 } = {}) {
  let result = Array.from(jobs.values());

  if (chapter) result = result.filter((j) => j.chapter === chapter);
  if (type) result = result.filter((j) => j.type === type);
  if (status) result = result.filter((j) => j.status === status);

  // Sort by start time descending
  result.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  return result.slice(0, limit);
}

/**
 * Check if a job is already running for this chapter/type combo.
 */
function hasRunningJob(chapter, type) {
  for (const job of jobs.values()) {
    if (job.chapter === chapter && job.type === type && job.status === 'running') {
      return job;
    }
  }
  return null;
}

/**
 * Clean up completed jobs older than the given age.
 */
function cleanupJobs(maxAgeMs = 3600000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobs.entries()) {
    if (job.status !== 'running' && new Date(job.completedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

function generateJobId() {
  return crypto.randomBytes(8).toString('hex');
}

// =====================================================================
// OVERWRITE PREVENTION — IMPACT CHECKS
// =====================================================================

/**
 * Check downstream impact before re-extraction.
 * Scans the filesystem for manifests, faithful translations, and localized
 * content that would be invalidated by re-extracting a chapter.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @returns {Object} Impact report with module counts and IDs
 */
function checkExtractionImpact(book, chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const chapterDir = `ch${chapterStr}`;

  // Check existing manifests (extraction has run before)
  const structDir = path.join(BOOKS_DIR, book, '02-structure', chapterDir);
  const moduleIds = [];
  if (fs.existsSync(structDir)) {
    for (const f of fs.readdirSync(structDir)) {
      if (f.endsWith('-manifest.json')) {
        moduleIds.push(f.replace('-manifest.json', ''));
      }
    }
  }

  // Check faithful translation files
  const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful-translation', chapterDir);
  const faithfulModuleIds = [];
  if (fs.existsSync(faithfulDir)) {
    for (const f of fs.readdirSync(faithfulDir)) {
      if (f.endsWith('-segments.is.md')) {
        faithfulModuleIds.push(f.replace('-segments.is.md', ''));
      }
    }
  }

  // Check localized content files
  const localizedDir = path.join(BOOKS_DIR, book, '04-localized-content', chapterDir);
  const localizedModuleIds = [];
  if (fs.existsSync(localizedDir)) {
    for (const f of fs.readdirSync(localizedDir)) {
      if (f.endsWith('-segments.is.md')) {
        localizedModuleIds.push(f.replace('-segments.is.md', ''));
      }
    }
  }

  return {
    extractedModules: moduleIds.length,
    faithfulModules: faithfulModuleIds.length,
    localizedModules: localizedModuleIds.length,
    moduleIds,
    faithfulModuleIds,
    localizedModuleIds,
    hasDownstreamWork: faithfulModuleIds.length > 0 || localizedModuleIds.length > 0,
  };
}

/**
 * Count approved edits in the database for the given book and module IDs.
 * Best-effort — returns 0 if the DB or table doesn't exist.
 *
 * @param {string} book - Book slug
 * @param {string[]} moduleIds - Module IDs to check
 * @returns {number} Count of approved edits
 */
function countApprovedEdits(book, moduleIds) {
  if (!moduleIds || moduleIds.length === 0) return 0;

  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');
    const db = new Database(dbPath, { readonly: true });
    const placeholders = moduleIds.map(() => '?').join(',');
    const row = db
      .prepare(
        `SELECT COUNT(*) as count FROM segment_edits
         WHERE book = ? AND module_id IN (${placeholders}) AND status = 'approved'`
      )
      .get(book, ...moduleIds);
    db.close();
    return row ? row.count : 0;
  } catch {
    // segment_edits table may not exist yet, or DB not available
    return 0;
  }
}

/**
 * Compute a composite source hash for a chapter from its module manifests.
 * Used to record which source version was active when extraction ran.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @returns {string|null} 16-character hex hash, or null if no manifests found
 */
function computeSourceHash(book, chapter) {
  try {
    const chapterStr = String(chapter).padStart(2, '0');
    const structDir = path.join(BOOKS_DIR, book, '02-structure', `ch${chapterStr}`);
    if (!fs.existsSync(structDir)) return null;

    const manifestFiles = fs.readdirSync(structDir).filter((f) => f.endsWith('-manifest.json'));
    const hashes = [];

    for (const f of manifestFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(structDir, f), 'utf8'));
      if (data.sourceHash) hashes.push(data.sourceHash);
    }

    if (hashes.length === 0) return null;

    // Sort for deterministic output regardless of filesystem order
    return crypto
      .createHash('sha256')
      .update(hashes.sort().join(','))
      .digest('hex')
      .substring(0, 16);
  } catch (err) {
    console.error('computeSourceHash failed:', err.message);
    return null;
  }
}

/**
 * Check downstream work across an entire book (for source import guard).
 * Scans all chapters for extracted modules, faithful translations, and
 * localized content that could be invalidated by a source update.
 *
 * @param {string} book - Book slug
 * @returns {Object} Aggregate impact report across all chapters
 */
function checkBookDownstreamWork(book) {
  const bookDir = path.join(BOOKS_DIR, book);
  let totalExtracted = 0;
  let totalFaithful = 0;
  let totalLocalized = 0;
  const chaptersWithWork = [];

  const structBaseDir = path.join(bookDir, '02-structure');
  if (!fs.existsSync(structBaseDir)) {
    return {
      totalExtracted: 0,
      totalFaithful: 0,
      totalLocalized: 0,
      chaptersWithWork: [],
      hasDownstreamWork: false,
    };
  }

  const chapterDirs = fs.readdirSync(structBaseDir).filter((d) => d.startsWith('ch'));

  for (const chDir of chapterDirs) {
    const chapterNum = parseInt(chDir.replace('ch', ''), 10);
    if (isNaN(chapterNum)) continue;

    const impact = checkExtractionImpact(book, chapterNum);
    totalExtracted += impact.extractedModules;
    totalFaithful += impact.faithfulModules;
    totalLocalized += impact.localizedModules;

    if (impact.hasDownstreamWork) {
      chaptersWithWork.push({ chapter: chapterNum, ...impact });
    }
  }

  return {
    totalExtracted,
    totalFaithful,
    totalLocalized,
    chaptersWithWork,
    hasDownstreamWork: totalFaithful > 0 || totalLocalized > 0,
  };
}

// =====================================================================
// STAGE STATUS QUERY
// =====================================================================

/**
 * Read the status.json for a chapter and return the status object.
 * Used by pipeline routes to check prerequisites before running stages.
 *
 * @param {string} book - Book slug
 * @param {number|string} chapter - Chapter number or 'appendices'
 * @returns {Object} The status object (stage → { complete, date, ... }), or empty object
 */
function getStageStatus(book, chapter) {
  const chapterDir =
    chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
  const statusPath = path.join(BOOKS_DIR, book, 'chapters', chapterDir, 'status.json');
  try {
    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    return data.status || {};
  } catch {
    return {};
  }
}

// =====================================================================
// AUTO-ADVANCE STATUS
// =====================================================================

/**
 * Advance chapter status.json when pipeline stages complete.
 * Best-effort — errors are logged but don't fail the pipeline.
 *
 * @param {string} book - Book slug (e.g., 'efnafraedi')
 * @param {number} chapter - Chapter number
 * @param {string} stage - Stage name ('injection', 'rendering')
 * @param {object} [extra] - Additional data to merge into the stage entry
 */
function advanceChapterStatus(book, chapter, stage, extra = {}) {
  try {
    const chapterDir =
      chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
    const statusPath = path.join(BOOKS_DIR, book, 'chapters', chapterDir, 'status.json');

    let status = {};
    if (fs.existsSync(statusPath)) {
      status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }

    if (!status.status) {
      status.status = {};
    }

    status.status[stage] = {
      complete: true,
      date: new Date().toISOString().split('T')[0],
      ...extra,
    };

    const statusDir = path.dirname(statusPath);
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }

    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
  } catch (err) {
    console.error(`Auto-advance status failed for ch${chapter} ${stage}:`, err.message);
  }
}

// =====================================================================
// SOURCE FETCHING
// =====================================================================

/**
 * Run download-source.js to fetch CNXML source from GitHub.
 *
 * @param {Object} params
 * @param {string} params.catalogueSlug - OpenStax slug (e.g. 'chemistry-2e')
 * @param {string} params.slug - Book slug in this project (e.g. 'efnafraedi')
 * @param {string} params.repo - GitHub repo (e.g. 'openstax/osbooks-chemistry-bundle')
 * @param {string} params.collection - Collection XML filename
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runFetchSource({ slug, repo, collection, userId }) {
  const args = [
    path.join(TOOLS_DIR, 'download-source.js'),
    '--repo',
    repo,
    '--collection',
    collection,
    '--book',
    slug,
    '--verbose',
  ];

  const result = spawnJob({
    type: 'fetch-source',
    chapter: null,
    moduleId: slug,
    track: null,
    userId,
    command: 'node',
    args,
  });

  // After completion, read .source-info.json and update DB
  result.promise.then(() => {
    const job = jobs.get(result.jobId);
    if (job && job.status === 'completed') {
      updateSourceTracking(slug);
    }
  });

  return result;
}

/**
 * Update registered_books with source tracking info from .source-info.json.
 * Best-effort — errors are logged but don't fail the job.
 *
 * @param {string} slug - Book slug
 */
function updateSourceTracking(slug) {
  try {
    const infoPath = path.join(BOOKS_DIR, slug, '01-source', '.source-info.json');
    if (!fs.existsSync(infoPath)) return;

    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    const Database = require('better-sqlite3');
    const dbPath = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');
    const db = new Database(dbPath);

    db.prepare(
      `UPDATE registered_books
       SET source_commit_hash = ?, source_fetched_at = ?, source_repo = ?
       WHERE slug = ?`
    ).run(info.commitHash, info.fetchedAt, info.repo, slug);

    db.close();
  } catch (err) {
    console.error(`updateSourceTracking failed for ${slug}:`, err.message);
  }
}

// Periodically clean up old jobs (every 30 minutes)
const cleanupInterval = setInterval(() => cleanupJobs(), 1800000);
cleanupInterval.unref();

/**
 * Run prepare-for-align.js for all modules in a chapter.
 * Requires linguisticReview to be complete (faithful files exist).
 *
 * @param {Object} params
 * @param {string} params.book - Book slug
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runPrepareTm({ book, chapter, userId }) {
  const chapterStr = String(chapter).padStart(2, '0');
  const enDir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${chapterStr}`);
  const isDir = path.join(BOOKS_DIR, book, '03-faithful-translation', `ch${chapterStr}`);
  const outputDir = path.join(BOOKS_DIR, book, 'for-align', `ch${chapterStr}`);

  if (!fs.existsSync(enDir)) {
    throw new Error(`EN segments directory not found: 02-for-mt/ch${chapterStr}`);
  }
  if (!fs.existsSync(isDir)) {
    throw new Error(
      `Faithful translation directory not found: 03-faithful-translation/ch${chapterStr}`
    );
  }

  // Find EN segment files (module-style: m68724-segments.en.md)
  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith('-segments.en.md'));
  if (enFiles.length === 0) {
    throw new Error(`No EN segment files found in 02-for-mt/ch${chapterStr}`);
  }

  // Find matching IS files
  const isFileSet = new Set(fs.readdirSync(isDir).filter((f) => f.endsWith('-segments.is.md')));

  // Build pairs: EN file + matching IS file
  const pairs = [];
  for (const enFile of enFiles) {
    const moduleId = enFile.replace('-segments.en.md', '');
    const isFile = `${moduleId}-segments.is.md`;
    if (isFileSet.has(isFile)) {
      pairs.push({
        moduleId,
        en: path.join(enDir, enFile),
        is: path.join(isDir, isFile),
      });
    }
  }

  if (pairs.length === 0) {
    throw new Error(`No modules have both EN and IS files for chapter ${chapter}`);
  }

  // Guard: reject if too many concurrent jobs
  if (runningJobCount() >= MAX_JOBS) {
    throw new Error(
      `Maximum concurrent jobs limit reached (${MAX_JOBS}). Please wait for running jobs to complete.`
    );
  }

  const jobId = generateJobId();
  const job = {
    id: jobId,
    type: 'prepare-tm',
    chapter,
    moduleId: 'all',
    track: 'faithful',
    userId,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [`Preparing ${pairs.length} modules for Matecat Align...`],
    error: null,
  };
  jobs.set(jobId, job);

  const promise = (async () => {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      for (const pair of pairs) {
        job.output.push(`Processing ${pair.moduleId}...`);

        await new Promise((resolve, reject) => {
          const child = spawn(
            'node',
            [
              path.join(TOOLS_DIR, 'prepare-for-align.js'),
              '--en',
              pair.en,
              '--is',
              pair.is,
              '--output-dir',
              outputDir,
              '--verbose',
            ],
            {
              cwd: PROJECT_ROOT,
              env: { ...process.env, NODE_NO_WARNINGS: '1' },
            }
          );

          child.stdout.on('data', (data) => {
            job.output.push(...data.toString().trim().split('\n'));
          });
          child.stderr.on('data', (data) => {
            job.output.push(...data.toString().trim().split('\n'));
          });

          child.on('error', (err) => reject(err));
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(
                new Error(`prepare-for-align failed for ${pair.moduleId} (exit code ${code})`)
              );
            }
          });
        });
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.output.push(`Done. ${pairs.length} module pairs ready in for-align/ch${chapterStr}/`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
    }
  })();

  return { jobId, promise };
}

module.exports = {
  runExtract,
  runProtect,
  runUnprotect,
  runInject,
  runRender,
  runPipeline,
  runPrepareTm,
  runFetchSource,
  getJob,
  listJobs,
  hasRunningJob,
  cleanupJobs,
  advanceChapterStatus,
  getStageStatus,
  checkExtractionImpact,
  checkBookDownstreamWork,
  countApprovedEdits,
  computeSourceHash,
  TRACK_SOURCE_DIR,
};
