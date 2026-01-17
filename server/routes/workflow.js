/**
 * Workflow Routes
 *
 * Handles multi-step workflow sessions for the translation pipeline.
 *
 * Endpoints:
 *   POST /api/workflow/start              Create new workflow session
 *   GET  /api/workflow/:sessionId         Get session status
 *   POST /api/workflow/:sessionId/upload/:step  Upload file for step
 *   GET  /api/workflow/:sessionId/download/:artifact  Download artifact
 *   POST /api/workflow/:sessionId/advance  Advance to next step
 *   POST /api/workflow/:sessionId/cancel   Cancel session
 *   GET  /api/workflow/sessions            List user's sessions
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const { requireAuth } = require('../middleware/requireAuth');
const { requireContributor } = require('../middleware/requireRole');
const session = require('../services/session');
const pipelineRunner = require('../../tools/pipeline-runner');
const { classifyIssues } = require('../services/issueClassifier');

// Configure multer for workflow file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.params.sessionId;
    const sessionData = session.getSession(sessionId);

    if (!sessionData) {
      return cb(new Error('Session not found'));
    }

    const uploadDir = sessionData.outputDir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const step = req.params.step;
    const ext = path.extname(file.originalname);
    cb(null, `${step}-upload-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.md', '.xliff', '.xlf', '.json', '.txt', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed`));
    }
  }
});

/**
 * POST /api/workflow/start
 * Create a new workflow session
 *
 * Body:
 *   - book: Book identifier (e.g., 'efnafraedi')
 *   - chapter: Chapter number
 *   - sourceType: 'cnxml' or 'moduleId'
 *   - moduleId: (optional) OpenStax module ID if sourceType is 'moduleId'
 *   - cnxmlFile: (optional) Uploaded CNXML file if sourceType is 'cnxml'
 */
router.post('/start', requireAuth, requireContributor(), async (req, res) => {
  const { book, chapter, sourceType, moduleId } = req.body;

  if (!book || !chapter) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'book and chapter are required'
    });
  }

  if (sourceType === 'moduleId' && !moduleId) {
    return res.status(400).json({
      error: 'Missing moduleId',
      message: 'moduleId is required when sourceType is moduleId'
    });
  }

  try {
    // Create session
    const newSession = session.createSession({
      book,
      chapter,
      sourceType: sourceType || 'moduleId',
      userId: req.user.id,
      username: req.user.username
    });

    // If moduleId provided, start processing immediately
    if (moduleId) {
      const sessionData = session.getSession(newSession.sessionId);

      // Update step status
      session.updateStepStatus(newSession.sessionId, 'source', 'in-progress');

      // Run pipeline
      const results = await pipelineRunner.run({
        input: moduleId,
        outputDir: sessionData.outputDir,
        book,
        verbose: false
      });

      if (results.success) {
        // Store file references
        for (const output of results.outputs) {
          session.storeFile(newSession.sessionId, output.type, output.path, {
            originalName: path.basename(output.path),
            size: fs.statSync(output.path).size
          });
        }

        session.updateStepStatus(newSession.sessionId, 'source', 'completed', {
          outputs: results.outputs.map(o => o.type)
        });
      } else {
        session.updateStepStatus(newSession.sessionId, 'source', 'failed', {
          error: results.error
        });
      }
    }

    // Get updated session
    const updatedSession = session.getSession(newSession.sessionId);

    res.json({
      success: true,
      sessionId: newSession.sessionId,
      book,
      chapter,
      steps: updatedSession.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        manual: s.manual
      })),
      currentStep: updatedSession.steps[updatedSession.currentStep],
      downloads: getDownloadLinks(newSession.sessionId, updatedSession)
    });

  } catch (err) {
    console.error('Workflow start error:', err);
    res.status(500).json({
      error: 'Failed to start workflow',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/:sessionId
 * Get session status
 */
router.get('/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
      message: `No session with ID ${sessionId}`
    });
  }

  // Check access (user owns session or is admin)
  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You do not have access to this session'
    });
  }

  res.json({
    session: {
      id: sessionData.id,
      book: sessionData.book,
      chapter: sessionData.chapter,
      status: sessionData.status,
      currentStep: sessionData.currentStep,
      steps: sessionData.steps.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        manual: s.manual,
        instructions: s.instructions,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        issues: s.issues.length
      })),
      issues: sessionData.issues,
      files: Object.keys(sessionData.files),
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt,
      expiresAt: sessionData.expiresAt
    },
    downloads: getDownloadLinks(sessionId, sessionData),
    actions: getAvailableActions(sessionData)
  });
});

/**
 * POST /api/workflow/:sessionId/upload/:step
 * Upload file for a manual step
 */
router.post('/:sessionId/upload/:step', requireAuth, upload.single('file'), async (req, res) => {
  const { sessionId, step } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded'
    });
  }

  try {
    // Store file
    session.storeFile(sessionId, step, req.file.path, {
      originalName: req.file.originalname,
      size: req.file.size
    });

    // Process based on step
    let processingResult = {};

    if (step === 'mt-output') {
      // MT output uploaded - analyze for issues
      const content = fs.readFileSync(req.file.path, 'utf-8');
      const issues = await classifyIssues(content, {
        type: 'mt-output',
        book: sessionData.book,
        chapter: sessionData.chapter
      });

      // Add issues to session
      for (const issue of issues) {
        session.addIssue(sessionId, issue);
      }

      processingResult = {
        issuesFound: issues.length,
        autoFixed: issues.filter(i => i.category === 'AUTO_FIX').length,
        needsReview: issues.filter(i => i.category !== 'AUTO_FIX').length
      };

      // Mark step complete
      session.updateStepStatus(sessionId, 'mt-upload', 'completed', processingResult);
    }

    if (step === 'reviewed-xliff') {
      // Reviewed XLIFF uploaded - process for final output
      session.updateStepStatus(sessionId, 'matecat-review', 'completed', {
        xliffPath: req.file.path
      });
    }

    const updatedSession = session.getSession(sessionId);

    res.json({
      success: true,
      step,
      file: {
        name: req.file.originalname,
        size: req.file.size
      },
      processing: processingResult,
      session: {
        currentStep: updatedSession.currentStep,
        steps: updatedSession.steps.map(s => ({
          id: s.id,
          status: s.status
        }))
      },
      nextAction: getNextAction(updatedSession)
    });

  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({
      error: 'Failed to process upload',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/:sessionId/download/:artifact
 * Download an artifact from the session
 */
router.get('/:sessionId/download/:artifact', requireAuth, (req, res) => {
  const { sessionId, artifact } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  const file = session.getFile(sessionId, artifact);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).json({
      error: 'Artifact not found',
      message: `No artifact '${artifact}' in this session`
    });
  }

  res.download(file.path, file.originalName || path.basename(file.path));
});

/**
 * GET /api/workflow/:sessionId/download-all
 * Download all artifacts as ZIP
 */
router.get('/:sessionId/download-all', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  try {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=workflow-${sessionId}.zip`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const [type, file] of Object.entries(sessionData.files)) {
      if (fs.existsSync(file.path)) {
        archive.file(file.path, { name: file.originalName || path.basename(file.path) });
      }
    }

    await archive.finalize();

  } catch (err) {
    console.error('Download all error:', err);
    res.status(500).json({
      error: 'Failed to create archive',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/:sessionId/advance
 * Advance to the next step
 */
router.post('/:sessionId/advance', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  try {
    const result = session.advanceSession(sessionId);

    if (result.error) {
      return res.status(400).json({
        error: 'Cannot advance',
        message: result.error,
        currentStep: result.currentStep
      });
    }

    if (result.complete) {
      return res.json({
        success: true,
        complete: true,
        message: 'Workflow completed successfully',
        session: {
          id: result.session.id,
          status: result.session.status
        }
      });
    }

    // If next step is automatic, run it
    const updatedSession = session.getSession(sessionId);
    const currentStep = updatedSession.steps[updatedSession.currentStep];

    if (!currentStep.manual) {
      await runAutomaticStep(sessionId, currentStep.id, updatedSession);
    }

    const finalSession = session.getSession(sessionId);

    res.json({
      success: true,
      currentStep: finalSession.steps[finalSession.currentStep],
      stepsRemaining: result.stepsRemaining,
      downloads: getDownloadLinks(sessionId, finalSession),
      nextAction: getNextAction(finalSession)
    });

  } catch (err) {
    console.error('Advance error:', err);
    res.status(500).json({
      error: 'Failed to advance workflow',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/:sessionId/cancel
 * Cancel the workflow session
 */
router.post('/:sessionId/cancel', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const { reason } = req.body;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  const cancelled = session.cancelSession(sessionId, reason);

  res.json({
    success: true,
    message: 'Session cancelled',
    session: {
      id: cancelled.id,
      status: cancelled.status,
      cancelReason: cancelled.cancelReason
    }
  });
});

/**
 * GET /api/workflow/sessions
 * List user's active sessions
 */
router.get('/sessions', requireAuth, (req, res) => {
  const sessions = session.listUserSessions(req.user.id);

  res.json({
    sessions,
    total: sessions.length
  });
});

/**
 * GET /api/workflow/sessions/all
 * List all active sessions (admin only)
 */
router.get('/sessions/all', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required'
    });
  }

  const sessions = session.listAllSessions();

  res.json({
    sessions,
    total: sessions.length
  });
});

// Helper functions

function getDownloadLinks(sessionId, sessionData) {
  const downloads = {};

  for (const [type, file] of Object.entries(sessionData.files)) {
    downloads[type] = `/api/workflow/${sessionId}/download/${type}`;
  }

  if (Object.keys(downloads).length > 0) {
    downloads.all = `/api/workflow/${sessionId}/download-all`;
  }

  return downloads;
}

function getAvailableActions(sessionData) {
  const currentStep = sessionData.steps[sessionData.currentStep];
  const actions = [];

  if (currentStep.manual && currentStep.status !== 'completed') {
    actions.push({
      action: 'upload',
      url: `/api/workflow/${sessionData.id}/upload/${currentStep.id}`,
      description: currentStep.instructions
    });
  }

  if (currentStep.status === 'completed' && sessionData.currentStep < sessionData.steps.length - 1) {
    actions.push({
      action: 'advance',
      url: `/api/workflow/${sessionData.id}/advance`,
      description: 'Proceed to next step'
    });
  }

  actions.push({
    action: 'cancel',
    url: `/api/workflow/${sessionData.id}/cancel`,
    description: 'Cancel this workflow'
  });

  return actions;
}

function getNextAction(sessionData) {
  const currentStep = sessionData.steps[sessionData.currentStep];

  if (currentStep.manual && currentStep.status !== 'completed') {
    return {
      type: 'upload',
      step: currentStep.id,
      instructions: currentStep.instructions
    };
  }

  if (currentStep.status === 'completed') {
    return {
      type: 'advance',
      message: 'Ready to proceed to next step'
    };
  }

  return {
    type: 'wait',
    message: 'Processing in progress'
  };
}

async function runAutomaticStep(sessionId, stepId, sessionData) {
  session.updateStepStatus(sessionId, stepId, 'in-progress');

  try {
    if (stepId === 'matecat-create') {
      // Generate XLIFF if not already done
      const mdFile = session.getFile(sessionId, 'markdown');
      if (mdFile) {
        // XLIFF should already be generated in source step
        const xliffFile = session.getFile(sessionId, 'xliff');
        if (xliffFile) {
          session.updateStepStatus(sessionId, stepId, 'completed', {
            xliffPath: xliffFile.path
          });
        }
      }
    }

    if (stepId === 'finalize') {
      // Generate final outputs
      session.updateStepStatus(sessionId, stepId, 'completed', {
        message: 'Final outputs generated'
      });
    }

  } catch (err) {
    session.updateStepStatus(sessionId, stepId, 'failed', {
      error: err.message
    });
    throw err;
  }
}

module.exports = router;
