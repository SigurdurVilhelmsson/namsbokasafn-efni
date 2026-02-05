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
 *   faithful track    → source-dir: 03-faithful
 *   localized track   → source-dir: 04-localized
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const TOOLS_DIR = path.join(PROJECT_ROOT, 'tools');

// Track running and completed jobs
const jobs = new Map();

// Source directory for each publication track
const TRACK_SOURCE_DIR = {
  'mt-preview': '02-mt-output',
  faithful: '03-faithful',
  localized: '04-localized',
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
function runInject({ chapter, moduleId, track = 'faithful', userId }) {
  const sourceDir = TRACK_SOURCE_DIR[track] || '03-faithful';

  const args = [
    path.join(TOOLS_DIR, 'cnxml-inject.js'),
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
function runRender({ chapter, moduleId, track = 'faithful', userId }) {
  const args = [
    path.join(TOOLS_DIR, 'cnxml-render.js'),
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
function runPipeline({ chapter, moduleId, track = 'faithful', userId }) {
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
      const injectResult = await runInject({ chapter, moduleId, track, userId });
      await injectResult.promise;

      const injectJob = jobs.get(injectResult.jobId);
      if (injectJob.status === 'failed') {
        throw new Error(`Inject failed: ${injectJob.error}`);
      }
      job.output.push(...injectJob.output);

      // Phase 2: Render
      job.phase = 'render';
      job.output.push('', '=== Phase 2: Render ===');
      const renderResult = await runRender({ chapter, moduleId, track, userId });
      await renderResult.promise;

      const renderJob = jobs.get(renderResult.jobId);
      if (renderJob.status === 'failed') {
        throw new Error(`Render failed: ${renderJob.error}`);
      }
      job.output.push(...renderJob.output);

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

// Periodically clean up old jobs (every 30 minutes)
setInterval(() => cleanupJobs(), 1800000);

module.exports = {
  runInject,
  runRender,
  runPipeline,
  getJob,
  listJobs,
  hasRunningJob,
  cleanupJobs,
  TRACK_SOURCE_DIR,
};
