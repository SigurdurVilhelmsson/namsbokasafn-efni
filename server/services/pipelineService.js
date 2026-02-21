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
 *   mt-preview track  → source-dir: 02-machine-translated
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

// Source directory for each publication track
const TRACK_SOURCE_DIR = {
  'mt-preview': '02-machine-translated',
  faithful: '03-faithful-translation',
  localized: '04-localized-content',
};

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
function runInject({ book = 'efnafraedi', chapter, moduleId, track = 'faithful', userId }) {
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
function runRender({ book = 'efnafraedi', chapter, moduleId, track = 'faithful', userId }) {
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
function runPipeline({ book = 'efnafraedi', chapter, moduleId, track = 'faithful', userId }) {
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
 * Spawn a child process and track it as a job.
 */
function spawnJob({ type, chapter, moduleId, track, userId, command, args }) {
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
// AUTO-ADVANCE STATUS
// =====================================================================

/**
 * Advance chapter status.json when pipeline stages complete.
 * Best-effort — errors are logged but don't fail the pipeline.
 *
 * @param {string} book - Book slug (default: 'efnafraedi')
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

// Periodically clean up old jobs (every 30 minutes)
setInterval(() => cleanupJobs(), 1800000);

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
  runInject,
  runRender,
  runPipeline,
  runPrepareTm,
  getJob,
  listJobs,
  hasRunningJob,
  cleanupJobs,
  advanceChapterStatus,
  TRACK_SOURCE_DIR,
};
