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
const { classifyIssues, applyAutoFixes, getIssueStats } = require('../services/issueClassifier');

// Re-export splitting functions for use in this module
const {
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,
  ERLENDUR_SOFT_LIMIT
} = session;

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
 *   - book: Book identifier (e.g., 'chemistry-2e')
 *   - chapter: Chapter number
 *   - modules: Array of module IDs to process (auto-populated from chapter selection)
 */
router.post('/start', requireAuth, requireContributor(), async (req, res) => {
  const { book, chapter, modules } = req.body;

  if (!book || !chapter) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'book and chapter are required'
    });
  }

  if (!modules || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({
      error: 'Missing modules',
      message: 'At least one module is required'
    });
  }

  // Check for existing active workflow for this book/chapter
  const existing = session.findActiveWorkflow(book, chapter);
  if (existing) {
    const progress = session.getUploadProgress(existing.id, 'mt-upload');
    return res.status(409).json({
      error: 'Workflow already exists',
      message: `Verkflæði fyrir ${book} kafla ${chapter} er þegar í gangi`,
      existingSession: {
        id: existing.id,
        startedBy: existing.username,
        startedAt: existing.createdAt,
        currentStep: existing.steps[existing.currentStep]?.name,
        progress: progress
      },
      action: 'join',
      joinUrl: `/workflow?session=${existing.id}`
    });
  }

  try {
    // Create session
    const newSession = session.createSession({
      book,
      chapter,
      modules,
      sourceType: 'modules',
      userId: req.user.id,
      username: req.user.username
    });

    const sessionData = session.getSession(newSession.sessionId);

    // Update step status
    session.updateStepStatus(newSession.sessionId, 'source', 'in-progress');

    // Process all modules
    const allOutputs = [];
    const errors = [];
    const splitInfo = []; // Track which files need splitting

    for (const mod of modules) {
      // Handle both { id, section, title } objects and plain strings
      const moduleId = typeof mod === 'object' ? mod.id : mod;
      const moduleSection = typeof mod === 'object' ? mod.section : null;
      const moduleTitle = typeof mod === 'object' ? mod.title : null;

      try {
        console.log(`Processing module ${moduleId}...`);
        const results = await pipelineRunner.run({
          input: moduleId,
          outputDir: sessionData.outputDir,
          book,
          verbose: false
        });

        if (results.success) {
          for (const output of results.outputs) {
            // Check if markdown file needs splitting for Erlendur
            let needsSplit = false;
            let splitParts = [];

            if (output.type === 'markdown' && output.path) {
              const splitCheck = checkFileSplitNeeded(output.path);
              needsSplit = splitCheck.needsSplit;

              if (needsSplit && moduleSection) {
                console.log(`File ${output.path} exceeds ${ERLENDUR_SOFT_LIMIT} chars (${splitCheck.charCount}), splitting...`);
                splitParts = splitFileForErlendur(output.path, sessionData.outputDir, moduleSection);
                splitInfo.push({
                  moduleId,
                  section: moduleSection,
                  parts: splitParts.length,
                  charCount: splitCheck.charCount
                });
              }
            }

            allOutputs.push({
              moduleId,
              section: moduleSection,
              title: moduleTitle,
              needsSplit,
              splitParts: splitParts.length > 0 ? splitParts : undefined,
              ...output
            });

            // Store file reference with section-based name if available
            const fileKey = moduleSection
              ? `${moduleSection.replace('.', '-')}-${output.type}`
              : `${moduleId}-${output.type}`;

            session.storeFile(newSession.sessionId, fileKey, output.path, {
              originalName: path.basename(output.path),
              size: fs.statSync(output.path).size,
              moduleId,
              section: moduleSection,
              title: moduleTitle
            });

            // Also store split parts if created
            if (splitParts.length > 0) {
              for (const part of splitParts) {
                const partKey = `${moduleSection.replace('.', '-')}(${part.part})-${output.type}`;
                session.storeFile(newSession.sessionId, partKey, part.path, {
                  originalName: part.filename,
                  size: fs.statSync(part.path).size,
                  moduleId,
                  section: moduleSection,
                  part: part.part
                });
              }
            }
          }
        } else {
          errors.push({ moduleId, error: results.error });
        }
      } catch (moduleErr) {
        errors.push({ moduleId, error: moduleErr.message });
      }
    }

    // Update session status based on results
    if (allOutputs.length > 0) {
      session.updateStepStatus(newSession.sessionId, 'source', 'completed', {
        outputs: allOutputs.map(o => `${o.section || o.moduleId}: ${o.type}`),
        modulesProcessed: modules.length - errors.length,
        splitFiles: splitInfo.length > 0 ? splitInfo : undefined,
        errors: errors.length > 0 ? errors : undefined
      });

      // Update expected files with split info (section-based naming)
      const updatedExpected = buildExpectedFiles(allOutputs, splitInfo);
      session.updateExpectedFiles(newSession.sessionId, 'mt-upload', updatedExpected);

      // Don't auto-advance - let the UI control progression via download button
    } else {
      session.updateStepStatus(newSession.sessionId, 'source', 'failed', {
        error: 'No modules processed successfully',
        errors
      });
    }

    // Get updated session
    const updatedSession = session.getSession(newSession.sessionId);

    res.json({
      success: true,
      sessionId: newSession.sessionId,
      book,
      chapter,
      modulesProcessed: modules.length - errors.length,
      modulesTotal: modules.length,
      splitFiles: splitInfo.length > 0 ? splitInfo : undefined,
      errors: errors.length > 0 ? errors : undefined,
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
 * GET /api/workflow/sessions
 * List user's active sessions
 * NOTE: Must be defined before /:sessionId to avoid "sessions" being matched as sessionId
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

  // Get upload progress for current step if applicable
  const currentStepData = sessionData.steps[sessionData.currentStep];
  let uploadProgress = null;
  if (currentStepData && currentStepData.id === 'mt-upload') {
    uploadProgress = session.getUploadProgress(sessionId, 'mt-upload');
  }

  res.json({
    session: {
      id: sessionData.id,
      book: sessionData.book,
      chapter: sessionData.chapter,
      modules: sessionData.modules,
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
      expectedFiles: sessionData.expectedFiles,
      uploadedFiles: sessionData.uploadedFiles,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt,
      expiresAt: sessionData.expiresAt
    },
    uploadProgress,
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
    // Record the upload - the session service will parse the file to identify it
    const progress = session.recordUpload(sessionId, step, req.file.originalname, req.file.path);

    // Store file with a unique key
    const fileKey = `${step}-${Date.now()}`;
    session.storeFile(sessionId, fileKey, req.file.path, {
      originalName: req.file.originalname,
      size: req.file.size
    });

    // Process based on step
    let processingResult = {};
    let issuesSummary = null;

    if (step === 'mt-upload' || step === 'mt-output') {
      // MT output uploaded - track progress
      processingResult = {
        filesUploaded: progress.uploaded,
        filesExpected: progress.expected,
        complete: progress.complete,
        missing: progress.missing,
        message: `${progress.uploaded}/${progress.expected} þýdd(ar) skrá(r) mótteknar`
      };

      // Run issue detection on the uploaded file
      try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const issues = await classifyIssues(fileContent, {
          type: 'mt-output',
          book: sessionData.book,
          chapter: sessionData.chapter
        });

        // Apply auto-fixes and store fixed content
        const autoFixResult = applyAutoFixes(fileContent, issues);
        if (autoFixResult.fixesApplied > 0) {
          fs.writeFileSync(req.file.path, autoFixResult.content, 'utf-8');
        }

        // Store non-auto-fixed issues in session
        const remainingIssues = issues.filter(i => i.category !== 'AUTO_FIX');
        for (const issue of remainingIssues) {
          session.addIssue(sessionId, {
            ...issue,
            sourceFile: req.file.originalname,
            step
          });
        }

        // Get issue statistics
        const stats = getIssueStats(issues);
        issuesSummary = {
          total: stats.total,
          autoFixed: autoFixResult.fixesApplied,
          requiresReview: stats.requiresReview,
          blocked: stats.blocked,
          byCategory: stats.byCategory
        };

      } catch (issueErr) {
        console.error('Issue detection error:', issueErr);
        // Don't fail the upload if issue detection fails
        issuesSummary = { error: issueErr.message };
      }
    }

    if (step === 'reviewed-xliff' || step === 'matecat-review') {
      // Reviewed XLIFF uploaded
      processingResult = {
        filesUploaded: 1,
        message: 'XLIFF skrá móttekin'
      };
    }

    const updatedSession = session.getSession(sessionId);

    // Get the last uploaded file info
    const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];

    res.json({
      success: true,
      step,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        identifiedAs: lastUploaded?.section
          ? `${lastUploaded.section}: ${lastUploaded.title || 'Unknown'}`
          : lastUploaded?.moduleId || 'Unknown'
      },
      progress: {
        uploaded: progress.uploaded,
        expected: progress.expected,
        complete: progress.complete,
        remaining: progress.missing
      },
      processing: processingResult,
      issues: issuesSummary,
      session: {
        currentStep: updatedSession.currentStep,
        steps: updatedSession.steps.map(s => ({
          id: s.id,
          status: s.status
        })),
        totalIssues: updatedSession.issues.length,
        pendingIssues: updatedSession.issues.filter(i => i.status === 'pending').length
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
 * Download artifacts as ZIP (optionally filtered by type)
 * Query params:
 *   - filter: 'md' | 'xliff' | 'json' (optional)
 */
router.get('/:sessionId/download-all', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { filter } = req.query;
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
    const filterSuffix = filter ? `-${filter}` : '';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=workflow-${sessionId}${filterSuffix}.zip`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const [type, file] of Object.entries(sessionData.files)) {
      if (!fs.existsSync(file.path)) continue;

      // Apply filter if specified
      if (filter) {
        const ext = path.extname(file.path).toLowerCase();
        if (filter === 'md' && ext !== '.md') continue;
        if (filter === 'xliff' && ext !== '.xliff' && ext !== '.xlf') continue;
        if (filter === 'json' && ext !== '.json') continue;
      }

      archive.file(file.path, { name: file.originalName || path.basename(file.path) });
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
 *
 * Body:
 *   - markComplete: boolean - if true, mark current step as complete before advancing
 */
router.post('/:sessionId/advance', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { markComplete } = req.body || {};
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
    const currentStep = sessionData.steps[sessionData.currentStep];

    // For MT upload step, check all files are uploaded before allowing advance
    if (currentStep && currentStep.id === 'mt-upload') {
      const progress = session.getUploadProgress(sessionId, 'mt-upload');
      if (progress && !progress.complete) {
        return res.status(400).json({
          error: 'Cannot advance',
          message: `Ekki hægt að halda áfram: ${progress.uploaded}/${progress.expected} skrár hlaðið upp`,
          messageEn: `Upload incomplete: ${progress.uploaded}/${progress.expected} files`,
          missing: progress.missing,
          progress: {
            uploaded: progress.uploaded,
            expected: progress.expected,
            complete: progress.complete
          }
        });
      }
    }

    // Check for BLOCKED issues that prevent advancement
    const blockedIssues = sessionData.issues.filter(
      i => i.category === 'BLOCKED' && i.status === 'pending'
    );
    if (blockedIssues.length > 0) {
      return res.status(400).json({
        error: 'Blocked issues',
        message: `Ekki hægt að halda áfram: ${blockedIssues.length} vandamál krefjast úrlausnar`,
        messageEn: `Cannot advance: ${blockedIssues.length} blocked issue(s) require resolution`,
        blockedCount: blockedIssues.length,
        issues: blockedIssues.map(i => ({
          id: i.id,
          description: i.description,
          sourceFile: i.sourceFile,
          line: i.line
        }))
      });
    }

    // If markComplete is true, mark current step as complete first
    if (markComplete) {
      if (currentStep && currentStep.status !== 'completed') {
        session.updateStepStatus(sessionId, currentStep.id, 'completed', {
          completedBy: req.user.username,
          completedAt: new Date().toISOString()
        });
      }
    }

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
    const nextStep = updatedSession.steps[updatedSession.currentStep];

    if (!nextStep.manual) {
      await runAutomaticStep(sessionId, nextStep.id, updatedSession);
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

/**
 * Build expected files list from processed outputs
 * Handles split files by creating separate entries for each part
 */
function buildExpectedFiles(outputs, splitInfo) {
  const expected = [];
  const splitSections = new Map(splitInfo.map(s => [s.section, s.parts]));

  for (const output of outputs) {
    if (output.type !== 'markdown') continue;

    const section = output.section;
    const moduleId = output.moduleId;
    const title = output.title;

    // Check if this section has split files
    const splitParts = splitSections.get(section);

    if (splitParts && splitParts > 1) {
      // Add an entry for each split part
      for (let i = 0; i < splitParts; i++) {
        const partLetter = String.fromCharCode(97 + i); // a, b, c...
        expected.push({
          moduleId,
          section,
          part: partLetter,
          title: title ? `${title} (hluti ${partLetter})` : `Kafli ${section} (hluti ${partLetter})`,
          displayName: section
            ? `${section}(${partLetter}): ${title || moduleId}`
            : `${moduleId}(${partLetter})`,
          downloadName: `${section.replace('.', '-')}(${partLetter}).en.md`,
          expectedUpload: `${section.replace('.', '-')}(${partLetter}).is.md`
        });
      }
    } else {
      // Single file, no splitting
      expected.push({
        moduleId,
        section,
        title,
        displayName: section
          ? `${section}: ${title || moduleId}`
          : moduleId,
        downloadName: section ? `${section.replace('.', '-')}.en.md` : `${moduleId}.en.md`,
        expectedUpload: section ? `${section.replace('.', '-')}.is.md` : `${moduleId}.is.md`
      });
    }
  }

  return expected;
}

module.exports = router;
