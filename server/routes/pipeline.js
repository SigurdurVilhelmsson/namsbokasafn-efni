/**
 * Pipeline Routes
 *
 * API endpoints for inject, render, and job tracking.
 * Used by the segment editor's "apply and render" flow.
 * HEAD_EDITOR role required for all pipeline operations.
 *
 * Endpoints:
 *   POST /api/pipeline/inject      Run inject for a chapter/module
 *   POST /api/pipeline/render      Run render for a chapter/module
 *   POST /api/pipeline/run         Run full pipeline (inject + render)
 *   GET  /api/pipeline/jobs        List recent jobs
 *   GET  /api/pipeline/jobs/:jobId Get job status and output
 *
 * Pipeline orchestration (extract, protect, unprotect, prepare-tm) has been
 * moved to CLI tools. See tools/cnxml-extract.js, tools/api-translate.js, etc.
 */

const express = require('express');
const router = express.Router();

const pipeline = require('../services/pipelineService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const { VALID_BOOKS } = require('../config');
const { VALID_TRACKS, MAX_CHAPTERS } = require('../constants');

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
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > MAX_CHAPTERS) {
    res.status(400).json({ error: 'Invalid chapter number' });
    return null;
  }

  if (track && !VALID_TRACKS.includes(track)) {
    res.status(400).json({ error: `Invalid track. Must be one of: ${VALID_TRACKS.join(', ')}` });
    return null;
  }

  const moduleId = req.body.moduleId;
  if (moduleId && !/^m\d{5}$/.test(moduleId)) {
    res.status(400).json({ error: 'Invalid module ID format. Expected: m followed by 5 digits' });
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

  // Prerequisite: extraction must have run before inject
  if (!req.body.confirmed) {
    const stageStatus = pipeline.getStageStatus(params.book, params.chapter);
    if (!stageStatus.extraction?.complete) {
      return res.status(409).json({
        requiresConfirmation: true,
        warning:
          'Extraction has not been run for this chapter. Inject may fail without extracted segments.',
      });
    }
  }

  const { jobId } = pipeline.runInject({
    book: params.book,
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

  // Prerequisite: injection must have run before render
  if (!req.body.confirmed) {
    const stageStatus = pipeline.getStageStatus(params.book, params.chapter);
    if (!stageStatus.injection?.complete) {
      return res.status(409).json({
        requiresConfirmation: true,
        warning:
          'Injection has not been run for this chapter. Render requires translated CNXML from inject.',
      });
    }
  }

  const { jobId } = pipeline.runRender({
    book: params.book,
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

  // Prerequisite: extraction must have run before full pipeline
  if (!req.body.confirmed) {
    const stageStatus = pipeline.getStageStatus(params.book, params.chapter);
    if (!stageStatus.extraction?.complete) {
      return res.status(409).json({
        requiresConfirmation: true,
        warning:
          'Extraction has not been run for this chapter. The pipeline requires extracted segments.',
      });
    }
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
 * GET /jobs
 * List recent pipeline jobs.
 */
router.get('/jobs', (req, res) => {
  const { chapter, type, status, limit } = req.query;

  const jobsList = pipeline.listJobs({
    chapter: chapter ? parseInt(chapter, 10) : undefined,
    type,
    status,
    limit: Math.min(parseInt(limit, 10) || 20, 200),
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
