/**
 * Pipeline Routes
 *
 * API endpoints to run cnxml-inject and cnxml-render from the web UI.
 * HEAD_EDITOR role required for all pipeline operations.
 *
 * Endpoints:
 *   POST /api/pipeline/inject      Run inject for a chapter/module
 *   POST /api/pipeline/render      Run render for a chapter/module
 *   POST /api/pipeline/run         Run full pipeline (inject + render)
 *   POST /api/pipeline/prepare-tm  Prepare files for Matecat Align (TM creation)
 *   GET  /api/pipeline/jobs        List recent jobs
 *   GET  /api/pipeline/jobs/:jobId Get job status and output
 */

const express = require('express');
const router = express.Router();

const pipeline = require('../services/pipelineService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const { VALID_BOOKS } = require('../config');
const VALID_TRACKS = ['mt-preview', 'faithful', 'localized'];

// All pipeline operations require HEAD_EDITOR
router.use(requireAuth, requireRole(ROLES.HEAD_EDITOR));

/**
 * Validate common pipeline parameters.
 */
function validateParams(req, res) {
  const { book, chapter, track } = req.body;

  if (!book || !VALID_BOOKS.includes(book)) {
    res.status(400).json({ error: `Invalid book. Must be one of: ${VALID_BOOKS.join(', ')}` });
    return null;
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
    res.status(400).json({ error: 'Invalid chapter number' });
    return null;
  }

  if (track && !VALID_TRACKS.includes(track)) {
    res.status(400).json({ error: `Invalid track. Must be one of: ${VALID_TRACKS.join(', ')}` });
    return null;
  }

  const moduleId = req.body.moduleId;
  if (moduleId && !/^m\d{5}$/.test(moduleId)) {
    res.status(400).json({ error: `Invalid module ID: ${moduleId}` });
    return null;
  }

  return { book, chapter: chapterNum, track: track || 'faithful', moduleId };
}

/**
 * POST /inject
 * Run cnxml-inject for a chapter or specific module.
 */
router.post('/inject', (req, res) => {
  const params = validateParams(req, res);
  if (!params) return;

  // Check for already running job
  const running = pipeline.hasRunningJob(params.chapter, 'inject');
  if (running) {
    return res.status(409).json({
      error: 'An inject job is already running for this chapter',
      jobId: running.id,
    });
  }

  const { jobId } = pipeline.runInject({
    chapter: params.chapter,
    moduleId: params.moduleId,
    track: params.track,
    userId: req.user.id,
  });

  res.json({
    success: true,
    jobId,
    message: `Inject started for chapter ${params.chapter}${params.moduleId ? ` module ${params.moduleId}` : ''}`,
  });
});

/**
 * POST /render
 * Run cnxml-render for a chapter or specific module.
 */
router.post('/render', (req, res) => {
  const params = validateParams(req, res);
  if (!params) return;

  const running = pipeline.hasRunningJob(params.chapter, 'render');
  if (running) {
    return res.status(409).json({
      error: 'A render job is already running for this chapter',
      jobId: running.id,
    });
  }

  const { jobId } = pipeline.runRender({
    chapter: params.chapter,
    moduleId: params.moduleId,
    track: params.track,
    userId: req.user.id,
  });

  res.json({
    success: true,
    jobId,
    message: `Render started for chapter ${params.chapter}${params.moduleId ? ` module ${params.moduleId}` : ''}`,
  });
});

/**
 * POST /run
 * Run full pipeline (inject then render) for a chapter or module.
 */
router.post('/run', (req, res) => {
  const params = validateParams(req, res);
  if (!params) return;

  const running = pipeline.hasRunningJob(params.chapter, 'pipeline');
  if (running) {
    return res.status(409).json({
      error: 'A pipeline job is already running for this chapter',
      jobId: running.id,
    });
  }

  const { jobId } = pipeline.runPipeline({
    book: params.book,
    chapter: params.chapter,
    moduleId: params.moduleId,
    track: params.track,
    userId: req.user.id,
  });

  res.json({
    success: true,
    jobId,
    message: `Pipeline started for chapter ${params.chapter}${params.moduleId ? ` module ${params.moduleId}` : ''}`,
  });
});

/**
 * POST /prepare-tm
 * Prepare files for Matecat Align (TM creation).
 */
router.post('/prepare-tm', (req, res) => {
  const { book, chapter } = req.body;

  if (!book || !VALID_BOOKS.includes(book)) {
    return res
      .status(400)
      .json({ error: `Invalid book. Must be one of: ${VALID_BOOKS.join(', ')}` });
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
    return res.status(400).json({ error: 'Invalid chapter number' });
  }

  const running = pipeline.hasRunningJob(chapterNum, 'prepare-tm');
  if (running) {
    return res.status(409).json({
      error: 'A TM preparation job is already running for this chapter',
      jobId: running.id,
    });
  }

  try {
    const { jobId } = pipeline.runPrepareTm({
      book,
      chapter: chapterNum,
      userId: req.user.id,
    });

    res.json({
      success: true,
      jobId,
      message: `TM preparation started for chapter ${chapterNum}`,
    });
  } catch (err) {
    console.error('Error starting TM preparation:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /jobs
 * List recent pipeline jobs.
 */
router.get('/jobs', (req, res) => {
  const { chapter, type, status, limit } = req.query;

  const jobsList = pipeline.listJobs({
    chapter: chapter ? parseInt(chapter, 10) : undefined,
    type,
    status,
    limit: limit ? parseInt(limit, 10) : 20,
  });

  res.json({ jobs: jobsList });
});

/**
 * GET /jobs/:jobId
 * Get status and output of a specific job.
 */
router.get('/jobs/:jobId', (req, res) => {
  const job = pipeline.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job });
});

module.exports = router;
