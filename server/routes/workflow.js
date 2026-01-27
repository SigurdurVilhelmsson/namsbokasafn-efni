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
// pipelineRunner is an ES module - use dynamic import
let pipelineRunner = null;
const getPipelineRunner = async () => {
  if (!pipelineRunner) {
    pipelineRunner = await import('../../tools/pipeline-runner.js');
  }
  return pipelineRunner;
};
const { classifyIssues, applyAutoFixes, getIssueStats } = require('../services/issueClassifier');
const assignmentStore = require('../services/assignmentStore');
const activityLog = require('../services/activityLog');
const notifications = require('../services/notifications');
const workflowPersistence = require('../services/workflowPersistence');

// Re-export splitting functions for use in this module
const {
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,
  ERLENDUR_SOFT_LIMIT,
  MAX_RETRY_ATTEMPTS
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
    const allowedExts = ['.md', '.xliff', '.xlf', '.json', '.txt', '.docx', '.tmx'];
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
        const runner = await getPipelineRunner();
        const results = await runner.run({
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

            // === PERSISTENCE: Save to permanent folder ===
            if (moduleSection && output.path) {
              const fileType = output.type === 'markdown' ? undefined : output.type;
              const saveResult = workflowPersistence.saveWorkflowFile(
                book, chapter, moduleSection, 'source', output.path,
                { fileType: fileType === 'equations' ? 'equations' : undefined }
              );
              if (saveResult.success) {
                console.log(`  Saved to permanent: ${saveResult.destPath}`);
              } else {
                console.warn(`  Failed to save permanently: ${saveResult.error}`);
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

      // Save checkpoint after successful source step
      session.saveCheckpoint(newSession.sessionId);

      // === PERSISTENCE: Update book_sections status to mt_pending ===
      const sectionFiles = allOutputs
        .filter(o => o.section && o.type === 'markdown')
        .map(o => ({
          section: o.section,
          filePath: workflowPersistence.checkFileExists(book, chapter, o.section, 'source').path
        }));

      if (sectionFiles.length > 0) {
        const batchResult = workflowPersistence.batchUpdateSections(book, chapter, 'source', sectionFiles);
        console.log(`Updated ${batchResult.updated} sections to mt_pending status`);
        if (batchResult.errors.length > 0) {
          console.warn('Section update errors:', batchResult.errors);
        }
      }

      // Don't auto-advance - let the UI control progression via download button
    } else {
      session.updateStepStatus(newSession.sessionId, 'source', 'failed', {
        error: 'No modules processed successfully',
        errors
      });

      // Log the error
      session.logError(newSession.sessionId, 'source', 'No modules processed successfully', {
        errors,
        modulesAttempted: modules.length
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
 * GET /api/workflow/check/:book/:chapter
 * Check existing progress for a chapter
 *
 * Returns information about what files already exist and what step
 * the workflow can resume from.
 */
router.get('/check/:book/:chapter', requireAuth, (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);

  if (!book || isNaN(chapterNum)) {
    return res.status(400).json({
      error: 'Invalid parameters',
      message: 'book and chapter are required'
    });
  }

  try {
    const progress = workflowPersistence.detectExistingProgress(book, chapterNum);

    // Also check for active session
    const activeSession = session.findActiveWorkflow(book, chapterNum);

    res.json({
      book,
      chapter: chapterNum,
      hasProgress: progress.canResume,
      activeSession: activeSession ? {
        id: activeSession.id,
        startedBy: activeSession.username,
        currentStep: activeSession.steps[activeSession.currentStep]?.name,
        createdAt: activeSession.createdAt
      } : null,
      progress: {
        canResume: progress.canResume,
        resumeStep: progress.resumeStep,
        resumeStepIndex: progress.resumeStepIndex,
        completedSteps: progress.completedSteps,
        stepProgress: progress.stepProgress
      },
      sections: progress.sections,
      downloads: progress.completedSteps.length > 0
        ? workflowPersistence.getCompletedStepDownloads(book, chapterNum, progress.completedSteps)
        : {}
    });

  } catch (err) {
    console.error('Check progress error:', err);
    res.status(500).json({
      error: 'Failed to check progress',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/resume
 * Resume workflow from existing progress
 *
 * Body:
 *   - book: Book identifier
 *   - chapter: Chapter number
 *   - modules: Array of module IDs to process
 *   - resumeFromStep: Step index to resume from (optional, auto-detected if not provided)
 */
router.post('/resume', requireAuth, requireContributor(), async (req, res) => {
  const { book, chapter, modules, resumeFromStep } = req.body;

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

  try {
    // Detect existing progress
    const progress = workflowPersistence.detectExistingProgress(book, chapter);

    if (!progress.canResume) {
      return res.status(400).json({
        error: 'No progress to resume',
        message: 'No existing files found for this chapter. Use /start instead.',
        suggestion: 'POST /api/workflow/start'
      });
    }

    // Determine start step
    const startStep = resumeFromStep !== undefined
      ? resumeFromStep
      : progress.resumeStepIndex;

    // Create session starting from the resume point
    const newSession = session.createSession({
      book,
      chapter,
      modules,
      sourceType: 'modules',
      userId: req.user.id,
      username: req.user.username,
      startStep,
      completedSteps: progress.completedSteps
    });

    const sessionData = session.getSession(newSession.sessionId);

    // Build expected files for current step
    if (startStep === 1) {
      // Resuming at MT upload - build expected files from sections
      const expected = modules.map(m => ({
        moduleId: typeof m === 'object' ? m.id : m,
        section: typeof m === 'object' ? m.section : null,
        title: typeof m === 'object' ? m.title : null,
        displayName: typeof m === 'object' && m.section
          ? `${m.section}: ${m.title || m.id}`
          : (typeof m === 'object' ? m.id : m),
        expectedUpload: typeof m === 'object' && m.section
          ? `${m.section.replace('.', '-')}.is.md`
          : null
      }));
      session.updateExpectedFiles(newSession.sessionId, 'mt-upload', expected);
    }

    // Save checkpoint
    session.saveCheckpoint(newSession.sessionId);

    // Get upload progress for current step if applicable
    let uploadProgress = null;
    const currentStepData = sessionData.steps[startStep];
    if (currentStepData && currentStepData.id === 'mt-upload') {
      uploadProgress = session.getUploadProgress(newSession.sessionId, 'mt-upload');
    }

    res.json({
      success: true,
      sessionId: newSession.sessionId,
      book,
      chapter,
      resumed: true,
      resumedFromStep: startStep,
      completedSteps: progress.completedSteps,
      steps: sessionData.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        manual: s.manual
      })),
      currentStep: sessionData.steps[startStep],
      downloads: workflowPersistence.getCompletedStepDownloads(book, chapter, progress.completedSteps),
      uploadProgress
    });

  } catch (err) {
    console.error('Workflow resume error:', err);
    res.status(500).json({
      error: 'Failed to resume workflow',
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

    // Track file in manifest for potential cleanup on rollback
    session.addToFilesManifest(sessionId, req.file.path);

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
      // Note: skipLocalization=true because this is Faithful stage, not Localization
      try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const issues = await classifyIssues(fileContent, {
          type: 'mt-output',
          book: sessionData.book,
          chapter: sessionData.chapter,
          skipLocalization: true  // BOARD_REVIEW issues are for Pass 2 (Localization), not Faithful
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

      // === PERSISTENCE: Save MT output to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploaded?.section) {
        const saveResult = workflowPersistence.saveWorkflowFile(
          sessionData.book, sessionData.chapter, lastUploaded.section,
          'mt-upload', req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved MT output to permanent: ${saveResult.destPath}`);
          // Update database status
          workflowPersistence.updateSectionFromWorkflow(
            sessionData.book, sessionData.chapter, lastUploaded.section,
            'mt-upload', { filePath: saveResult.destPath }
          );
        }
      }
    }

    if (step === 'faithful-edit') {
      // Faithful translation edited - save updated file
      processingResult = {
        filesUploaded: progress.uploaded,
        filesExpected: progress.expected,
        complete: progress.complete,
        message: `${progress.uploaded}/${progress.expected} skrá(r) yfirfarnar`
      };

      // === PERSISTENCE: Save faithful edit to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploaded?.section) {
        const saveResult = workflowPersistence.saveWorkflowFile(
          sessionData.book, sessionData.chapter, lastUploaded.section,
          'faithful-edit', req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved faithful edit to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            sessionData.book, sessionData.chapter, lastUploaded.section,
            'faithful-edit', { filePath: saveResult.destPath }
          );
        }
      }
    }

    if (step === 'tm-creation') {
      // TMX uploaded from Matecat Align
      processingResult = {
        filesUploaded: 1,
        message: 'TMX skrá móttekin frá Matecat Align'
      };

      // === PERSISTENCE: Save TMX to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploaded?.section) {
        const saveResult = workflowPersistence.saveWorkflowFile(
          sessionData.book, sessionData.chapter, lastUploaded.section,
          'tm-creation', req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved TMX to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            sessionData.book, sessionData.chapter, lastUploaded.section,
            'tm-creation', { filePath: saveResult.destPath }
          );
        }
      }
    }

    if (step === 'localization') {
      // Localized content uploaded
      // Run issue detection for localization-specific issues
      try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const issues = await classifyIssues(fileContent, {
          type: 'localization',
          book: sessionData.book,
          chapter: sessionData.chapter,
          skipLocalization: false  // Include BOARD_REVIEW issues for localization
        });

        // Apply auto-fixes
        const autoFixResult = applyAutoFixes(fileContent, issues);
        if (autoFixResult.fixesApplied > 0) {
          fs.writeFileSync(req.file.path, autoFixResult.content, 'utf-8');
        }

        // Store remaining issues
        const remainingIssues = issues.filter(i => i.category !== 'AUTO_FIX');
        for (const issue of remainingIssues) {
          session.addIssue(sessionId, {
            ...issue,
            sourceFile: req.file.originalname,
            step
          });
        }

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
        issuesSummary = { error: issueErr.message };
      }

      processingResult = {
        filesUploaded: progress.uploaded,
        filesExpected: progress.expected,
        complete: progress.complete,
        message: `${progress.uploaded}/${progress.expected} staðfærð(ar) skrá(r) mótteknar`
      };

      // === PERSISTENCE: Save localized file to permanent folder ===
      const lastUploadedLoc = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploadedLoc?.section) {
        const saveResult = workflowPersistence.saveWorkflowFile(
          sessionData.book, sessionData.chapter, lastUploadedLoc.section,
          'localization', req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved localized file to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            sessionData.book, sessionData.chapter, lastUploadedLoc.section,
            'localization', { filePath: saveResult.destPath }
          );
        }
      }
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
 *
 * ZIP naming: {slug}-K{chapter}-{sections}{-filter}.zip
 * Example: efnafraedi-K4-4.1-4.5-md.zip
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
    // Build descriptive ZIP filename
    const zipFilename = buildZipFilename(sessionData, filter);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${zipFilename}`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Identify sections that have split files
    const sectionsWithSplits = new Set();
    for (const [type, file] of Object.entries(sessionData.files)) {
      if (file.part && file.section) {
        sectionsWithSplits.add(file.section);
      }
    }

    for (const [type, file] of Object.entries(sessionData.files)) {
      if (!fs.existsSync(file.path)) continue;

      // Apply filter if specified
      if (filter) {
        const ext = path.extname(file.path).toLowerCase();
        if (filter === 'md' && ext !== '.md') continue;
        if (filter === 'xliff' && ext !== '.xliff' && ext !== '.xlf') continue;
        if (filter === 'json' && ext !== '.json') continue;
      }

      // Exclude full files when split parts exist for that section
      // Full files have section but no part; split files have both section and part
      if (file.section && !file.part && sectionsWithSplits.has(file.section)) {
        // Skip the full file - include only the split parts
        continue;
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
 * Build descriptive ZIP filename from session data
 * Format: {slug}-K{chapter}-{sections}{-filter}.zip
 * Example: efnafraedi-K4-4.1-4.5-md.zip
 */
function buildZipFilename(sessionData, filter) {
  const { book, chapter, modules } = sessionData;

  // Get book slug from data file
  let slug = book; // Default to book ID
  try {
    const bookDataPath = path.join(__dirname, '..', 'data', `${book}.json`);
    if (fs.existsSync(bookDataPath)) {
      const bookData = JSON.parse(fs.readFileSync(bookDataPath, 'utf8'));
      slug = bookData.slug || book;
    }
  } catch (err) {
    console.warn('Could not load book data for slug:', err.message);
  }

  // Extract section numbers and determine range
  const sectionNumbers = [];
  for (const mod of modules || []) {
    const section = typeof mod === 'object' ? mod.section : null;
    if (section && section !== 'intro') {
      sectionNumbers.push(section);
    }
  }

  // Sort sections numerically and get first/last
  sectionNumbers.sort((a, b) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    return numA - numB;
  });

  let sectionRange = '';
  if (sectionNumbers.length > 0) {
    const first = sectionNumbers[0];
    const last = sectionNumbers[sectionNumbers.length - 1];
    sectionRange = first === last ? `-${first}` : `-${first}-${last}`;
  }

  const filterSuffix = filter ? `-${filter}` : '';

  return `${slug}-K${chapter}${sectionRange}${filterSuffix}.zip`;
}

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
      // Save final checkpoint
      session.saveCheckpoint(sessionId);

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

    // Save checkpoint after successful step completion
    session.saveCheckpoint(sessionId);

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

// ============================================================================
// ERROR RECOVERY ROUTES
// ============================================================================

/**
 * GET /api/workflow/:sessionId/errors
 * Get error history for a session
 */
router.get('/:sessionId/errors', requireAuth, (req, res) => {
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

  const errorLog = session.getErrorLog(sessionId);
  const recoveryActions = session.getRecoveryActions(sessionId);

  res.json({
    sessionId,
    status: sessionData.status,
    currentStep: sessionData.steps[sessionData.currentStep]?.id,
    stepStatus: sessionData.steps[sessionData.currentStep]?.status,
    errorCount: errorLog.length,
    errors: errorLog,
    retryCount: sessionData.retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    recoveryActions
  });
});

/**
 * POST /api/workflow/:sessionId/retry
 * Retry the current failed step
 */
router.post('/:sessionId/retry', requireAuth, (req, res) => {
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

  const result = session.retryCurrentStep(sessionId);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      retryCount: result.retryCount,
      suggestion: result.suggestion
    });
  }

  const updatedSession = session.getSession(sessionId);

  res.json({
    success: true,
    message: result.message,
    currentStep: result.currentStep,
    retriesRemaining: result.retriesRemaining,
    session: {
      id: updatedSession.id,
      status: updatedSession.status,
      currentStep: updatedSession.currentStep,
      steps: updatedSession.steps.map(s => ({
        id: s.id,
        status: s.status
      }))
    },
    nextAction: getNextAction(updatedSession)
  });
});

/**
 * POST /api/workflow/:sessionId/rollback
 * Rollback to the last successful checkpoint
 */
router.post('/:sessionId/rollback', requireAuth, (req, res) => {
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

  const result = session.rollbackToPreviousStep(sessionId);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      suggestion: sessionData.currentStep === 0 ? 'Use /reset instead' : 'No checkpoint available'
    });
  }

  const updatedSession = session.getSession(sessionId);

  res.json({
    success: true,
    message: result.message,
    restoredAt: result.restoredAt,
    currentStep: result.currentStep,
    session: {
      id: updatedSession.id,
      status: updatedSession.status,
      currentStep: updatedSession.currentStep,
      steps: updatedSession.steps.map(s => ({
        id: s.id,
        status: s.status
      }))
    },
    downloads: getDownloadLinks(sessionId, updatedSession),
    nextAction: getNextAction(updatedSession)
  });
});

/**
 * POST /api/workflow/:sessionId/reset
 * Reset session to the beginning
 */
router.post('/:sessionId/reset', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const { confirm } = req.body;
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

  if (!confirm) {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Reset will clear all progress. Send {confirm: true} to proceed.',
      warning: 'This action cannot be undone'
    });
  }

  const result = session.resetSession(sessionId, true);

  if (!result.success) {
    return res.status(400).json({
      error: result.error
    });
  }

  const updatedSession = session.getSession(sessionId);

  res.json({
    success: true,
    message: result.message,
    currentStep: result.currentStep,
    session: {
      id: updatedSession.id,
      status: updatedSession.status,
      currentStep: updatedSession.currentStep,
      steps: updatedSession.steps.map(s => ({
        id: s.id,
        status: s.status
      }))
    },
    nextAction: getNextAction(updatedSession)
  });
});

/**
 * GET /api/workflow/:sessionId/recovery
 * Get available recovery actions for a session
 */
router.get('/:sessionId/recovery', requireAuth, (req, res) => {
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

  const recoveryActions = session.getRecoveryActions(sessionId);

  res.json({
    sessionId,
    ...recoveryActions,
    endpoints: {
      retry: `/api/workflow/${sessionId}/retry`,
      rollback: `/api/workflow/${sessionId}/rollback`,
      reset: `/api/workflow/${sessionId}/reset`,
      errors: `/api/workflow/${sessionId}/errors`
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

  // Add recovery actions if step is failed
  if (currentStep.status === 'failed') {
    // Retry available if under limit
    if ((sessionData.retryCount || 0) < MAX_RETRY_ATTEMPTS) {
      actions.push({
        action: 'retry',
        url: `/api/workflow/${sessionData.id}/retry`,
        description: `Retry current step (${MAX_RETRY_ATTEMPTS - (sessionData.retryCount || 0)} attempts remaining)`
      });
    }

    // Rollback available if not at first step and has checkpoint
    if (sessionData.currentStep > 0 && sessionData.lastGoodState) {
      actions.push({
        action: 'rollback',
        url: `/api/workflow/${sessionData.id}/rollback`,
        description: 'Rollback to previous checkpoint'
      });
    }

    // Reset always available
    actions.push({
      action: 'reset',
      url: `/api/workflow/${sessionData.id}/reset`,
      description: 'Reset session to beginning (requires confirmation)'
    });
  }

  // Add recovery info link if session has errors
  if (sessionData.errorLog && sessionData.errorLog.length > 0) {
    actions.push({
      action: 'errors',
      url: `/api/workflow/${sessionData.id}/errors`,
      description: `View error history (${sessionData.errorLog.length} errors)`
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

  // Handle failed step
  if (currentStep.status === 'failed') {
    const retryCount = sessionData.retryCount || 0;
    const canRetry = retryCount < MAX_RETRY_ATTEMPTS;
    const canRollback = sessionData.currentStep > 0 && sessionData.lastGoodState;

    return {
      type: 'recovery',
      message: `Step failed: ${currentStep.data?.error || 'Unknown error'}`,
      options: {
        retry: canRetry ? {
          available: true,
          retriesRemaining: MAX_RETRY_ATTEMPTS - retryCount
        } : { available: false, reason: 'Maximum retries reached' },
        rollback: canRollback ? {
          available: true,
          checkpointStep: sessionData.lastGoodState.currentStep
        } : { available: false, reason: 'No checkpoint or at first step' },
        reset: { available: true, requiresConfirmation: true }
      }
    };
  }

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
    if (stepId === 'finalize') {
      // Generate final outputs
      // Copy faithful/localized files to publication folder
      session.updateStepStatus(sessionId, stepId, 'completed', {
        message: 'Final outputs generated'
      });
      // Save checkpoint after automatic step completion
      session.saveCheckpoint(sessionId);
    }

  } catch (err) {
    session.updateStepStatus(sessionId, stepId, 'failed', {
      error: err.message
    });

    // Log the error
    session.logError(sessionId, stepId, err.message, {
      stack: err.stack,
      retryCount: sessionData.retryCount || 0
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

// ============================================================================
// ASSIGNMENT ROUTES
// ============================================================================

/**
 * POST /api/workflow/assignments
 * Create or update an assignment
 */
router.post('/assignments', requireAuth, async (req, res) => {
  const { book, chapter, stage, assignedTo, dueDate, notes } = req.body;

  if (!book || !chapter || !stage || !assignedTo) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'book, chapter, stage, and assignedTo are required'
    });
  }

  try {
    const assignment = assignmentStore.createAssignment({
      book,
      chapter: parseInt(chapter),
      stage,
      assignedTo,
      assignedBy: req.user.username,
      dueDate,
      notes
    });

    // Log the assignment activity
    activityLog.log({
      type: 'assign_reviewer',
      userId: req.user.id,
      username: req.user.username,
      book,
      chapter: parseInt(chapter),
      description: `Úthlutaði ${stage} til ${assignedTo}`,
      metadata: {
        stage,
        assignedTo,
        dueDate
      }
    });

    // Send notification to the assignee
    try {
      await notifications.notifyAssignmentCreated(
        assignment,
        { id: assignedTo, username: assignedTo }, // User object (email would come from user lookup)
        req.user.username
      );
    } catch (notifyErr) {
      console.error('Failed to send assignment notification:', notifyErr);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      assignment
    });

  } catch (err) {
    console.error('Assignment creation error:', err);
    res.status(500).json({
      error: 'Failed to create assignment',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/assignments/kickoff
 * Start a chapter by assigning multiple stages at once
 *
 * Body:
 *   - book: Book identifier (e.g., 'efnafraedi')
 *   - chapter: Chapter number
 *   - assignments: Array of { stage, assignedTo, dueDate?, notes? }
 */
router.post('/assignments/kickoff', requireAuth, async (req, res) => {
  const { book, chapter, assignments } = req.body;

  if (!book || !chapter) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'book and chapter are required'
    });
  }

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({
      error: 'No assignments provided',
      message: 'At least one stage assignment is required'
    });
  }

  // Validate all assignments have required fields
  for (const a of assignments) {
    if (!a.stage || !a.assignedTo) {
      return res.status(400).json({
        error: 'Invalid assignment',
        message: 'Each assignment must have stage and assignedTo'
      });
    }
  }

  try {
    const createdAssignments = [];
    const chapterNum = parseInt(chapter);

    for (const a of assignments) {
      const assignment = assignmentStore.createAssignment({
        book,
        chapter: chapterNum,
        stage: a.stage,
        assignedTo: a.assignedTo,
        assignedBy: req.user.username,
        dueDate: a.dueDate || null,
        notes: a.notes || null
      });
      createdAssignments.push(assignment);

      // Log each assignment
      activityLog.log({
        type: 'assign_reviewer',
        userId: req.user.id,
        username: req.user.username,
        book,
        chapter: chapterNum,
        description: `Úthlutaði ${a.stage} til ${a.assignedTo} (kafla upphaf)`,
        metadata: {
          stage: a.stage,
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
          kickoff: true
        }
      });
    }

    // Log the overall kickoff event
    activityLog.log({
      type: 'chapter_kickoff',
      userId: req.user.id,
      username: req.user.username,
      book,
      chapter: chapterNum,
      description: `Hóf kafla ${chapterNum} með ${createdAssignments.length} úthlutanir`,
      metadata: {
        assignmentsCount: createdAssignments.length,
        stages: assignments.map(a => a.stage)
      }
    });

    // Send notifications to all assignees
    try {
      const assignmentsWithAssignees = createdAssignments.map((a, i) => ({
        ...a,
        assignee: { id: assignments[i].assignedTo, username: assignments[i].assignedTo }
      }));

      await notifications.notifyChapterKickoff(
        book,
        chapterNum,
        assignmentsWithAssignees,
        req.user.username
      );
    } catch (notifyErr) {
      console.error('Failed to send kickoff notifications:', notifyErr);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      message: `Kafli ${chapterNum} hafinn með ${createdAssignments.length} úthlutanir`,
      assignments: createdAssignments
    });

  } catch (err) {
    console.error('Chapter kickoff error:', err);
    res.status(500).json({
      error: 'Failed to kickoff chapter',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/assignments/workload
 * Get workload distribution across team members
 *
 * Returns assignment counts per user with breakdown by stage and overdue status
 */
router.get('/assignments/workload', requireAuth, (req, res) => {
  const { book } = req.query;

  try {
    // Get all pending assignments
    let assignments;
    if (book) {
      assignments = assignmentStore.getBookAssignments(book);
    } else {
      assignments = assignmentStore.getAllPendingAssignments();
    }

    const now = new Date();
    const workloadMap = {};

    // Aggregate by user
    for (const a of assignments) {
      if (!a.assignedTo) continue;

      if (!workloadMap[a.assignedTo]) {
        workloadMap[a.assignedTo] = {
          username: a.assignedTo,
          total: 0,
          overdue: 0,
          dueSoon: 0,  // Due within 3 days
          byStage: {},
          byBook: {},
          assignments: []
        };
      }

      const user = workloadMap[a.assignedTo];
      user.total++;

      // Check due date status
      if (a.dueDate) {
        const dueDate = new Date(a.dueDate);
        const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
          user.overdue++;
        } else if (daysUntil <= 3) {
          user.dueSoon++;
        }
      }

      // Count by stage
      if (!user.byStage[a.stage]) {
        user.byStage[a.stage] = 0;
      }
      user.byStage[a.stage]++;

      // Count by book
      if (!user.byBook[a.book]) {
        user.byBook[a.book] = 0;
      }
      user.byBook[a.book]++;

      // Add assignment summary
      user.assignments.push({
        id: a.id,
        book: a.book,
        chapter: a.chapter,
        stage: a.stage,
        dueDate: a.dueDate,
        isOverdue: a.dueDate && new Date(a.dueDate) < now
      });
    }

    // Convert to sorted array
    const workload = Object.values(workloadMap).sort((a, b) => {
      // Sort by overdue first, then by total
      if (a.overdue !== b.overdue) return b.overdue - a.overdue;
      return b.total - a.total;
    });

    // Calculate team stats
    const totalAssignments = assignments.length;
    const totalOverdue = workload.reduce((sum, u) => sum + u.overdue, 0);
    const avgPerPerson = workload.length > 0 ? Math.round(totalAssignments / workload.length * 10) / 10 : 0;
    const maxAssignments = workload.length > 0 ? Math.max(...workload.map(u => u.total)) : 0;

    res.json({
      workload,
      summary: {
        teamSize: workload.length,
        totalAssignments,
        totalOverdue,
        avgPerPerson,
        maxAssignments
      },
      stageLabels: {
        enMarkdown: 'EN Markdown',
        mtOutput: 'Vélþýðing',
        linguisticReview: 'Yfirferð 1',
        tmCreated: 'Þýðingaminni',
        publication: 'Útgáfa'
      }
    });

  } catch (err) {
    console.error('Get workload error:', err);
    res.status(500).json({
      error: 'Failed to get workload',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/assignments
 * Get all pending assignments (optionally filtered)
 */
router.get('/assignments', requireAuth, (req, res) => {
  const { book, user } = req.query;

  try {
    let assignments;

    if (user) {
      assignments = assignmentStore.getUserAssignments(user);
    } else if (book) {
      assignments = assignmentStore.getBookAssignments(book);
    } else {
      assignments = assignmentStore.getAllPendingAssignments();
    }

    res.json({
      assignments,
      total: assignments.length
    });

  } catch (err) {
    console.error('Get assignments error:', err);
    res.status(500).json({
      error: 'Failed to get assignments',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/assignments/mine
 * Get current user's assignments
 */
router.get('/assignments/mine', requireAuth, (req, res) => {
  try {
    const assignments = assignmentStore.getUserAssignments(req.user.username);

    res.json({
      assignments,
      total: assignments.length
    });

  } catch (err) {
    console.error('Get my assignments error:', err);
    res.status(500).json({
      error: 'Failed to get assignments',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/assignments/:id/complete
 * Mark an assignment as completed
 */
router.post('/assignments/:id/complete', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    // Get the assignment before completing it (to know the stage order)
    const beforeAssignment = assignmentStore.getAssignment(id);

    const assignment = assignmentStore.completeAssignment(id, req.user.username);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    // Define stage order for hand-off
    const stageOrder = ['enMarkdown', 'mtOutput', 'linguisticReview', 'tmCreated', 'publication'];
    const currentStageIndex = stageOrder.indexOf(assignment.stage);

    // Check if there's a next stage with an assignee
    let nextAssignment = null;
    let nextAssignee = null;

    if (currentStageIndex >= 0 && currentStageIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentStageIndex + 1];

      // Look for an assignment for the next stage
      const bookAssignments = assignmentStore.getBookAssignments(assignment.book);
      nextAssignment = bookAssignments.find(a =>
        a.chapter === assignment.chapter &&
        a.stage === nextStage &&
        a.status === 'pending'
      );

      if (nextAssignment && nextAssignment.assignedTo) {
        nextAssignee = {
          id: nextAssignment.assignedTo,
          username: nextAssignment.assignedTo
        };
      }
    }

    // Send hand-off notification if there's a next assignee
    if (nextAssignment && nextAssignee) {
      try {
        await notifications.notifyHandoff(
          assignment,
          nextAssignment,
          nextAssignee,
          req.user.username
        );
      } catch (notifyErr) {
        console.error('Failed to send hand-off notification:', notifyErr);
      }
    }

    // Also notify admins that a stage was completed
    try {
      // For now, notify the person who assigned this task (if different from completer)
      if (assignment.assignedBy && assignment.assignedBy !== req.user.username) {
        await notifications.notifyStageCompleted(
          assignment,
          { id: assignment.assignedBy, username: assignment.assignedBy },
          req.user.username
        );
      }
    } catch (notifyErr) {
      console.error('Failed to send stage completed notification:', notifyErr);
    }

    // Log activity
    activityLog.log({
      type: 'assignment_completed',
      userId: req.user.id,
      username: req.user.username,
      book: assignment.book,
      chapter: assignment.chapter,
      description: `Kláraði ${assignment.stage} fyrir kafla ${assignment.chapter}`,
      metadata: {
        assignmentId: id,
        stage: assignment.stage,
        handoffTo: nextAssignee ? nextAssignee.username : null
      }
    });

    res.json({
      success: true,
      assignment,
      handoff: nextAssignment ? {
        nextStage: nextAssignment.stage,
        assignee: nextAssignee?.username,
        notified: !!nextAssignee
      } : null
    });

  } catch (err) {
    console.error('Complete assignment error:', err);
    res.status(500).json({
      error: 'Failed to complete assignment',
      message: err.message
    });
  }
});

/**
 * GET /api/workflow/assignments/matrix
 * Get assignment matrix for a book (chapters × stages with assignments)
 */
router.get('/assignments/matrix', requireAuth, (req, res) => {
  const { book = 'efnafraedi' } = req.query;

  try {
    const fs = require('fs');
    const path = require('path');
    const PROJECT_ROOT = path.join(__dirname, '..', '..');

    // Get all assignments for this book
    const bookAssignments = assignmentStore.getBookAssignments(book);

    // Build assignment lookup map
    const assignmentMap = {};
    for (const a of bookAssignments) {
      const key = `${a.chapter}-${a.stage}`;
      assignmentMap[key] = a;
    }

    // Get chapter statuses
    const chaptersPath = path.join(PROJECT_ROOT, 'books', book, 'chapters');
    const chapters = [];

    if (fs.existsSync(chaptersPath)) {
      const chapterDirs = fs.readdirSync(chaptersPath)
        .filter(d => d.startsWith('ch'))
        .sort((a, b) => {
          const aNum = parseInt(a.replace('ch', ''));
          const bNum = parseInt(b.replace('ch', ''));
          return aNum - bNum;
        });

      const stages = ['enMarkdown', 'mtOutput', 'linguisticReview', 'tmCreated', 'publication'];

      for (const chapterDir of chapterDirs) {
        const chapterNum = parseInt(chapterDir.replace('ch', ''));
        const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

        let chapterData = {
          chapter: chapterNum,
          title: null,
          stages: {}
        };

        // Load status data
        if (fs.existsSync(statusPath)) {
          try {
            const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
            chapterData.title = statusData.title || `Kafli ${chapterNum}`;

            // Get status for each stage
            const stageStatus = statusData.status || {};
            for (const stage of stages) {
              const key = `${chapterNum}-${stage}`;
              const stageData = stageStatus[stage] || {};

              chapterData.stages[stage] = {
                status: stageData.status || 'not-started',
                assignment: assignmentMap[key] || null
              };
            }
          } catch (err) {
            // Use defaults
            for (const stage of stages) {
              chapterData.stages[stage] = {
                status: 'not-started',
                assignment: null
              };
            }
          }
        } else {
          for (const stage of stages) {
            chapterData.stages[stage] = {
              status: 'not-started',
              assignment: null
            };
          }
        }

        chapters.push(chapterData);
      }
    }

    // Get team members (users who have been assignees or assigners)
    const allAssignments = assignmentStore.getAllPendingAssignments();
    const teamSet = new Set();
    for (const a of allAssignments) {
      if (a.assignedTo) teamSet.add(a.assignedTo);
      if (a.assignedBy) teamSet.add(a.assignedBy);
    }

    // Summary stats
    const summary = {
      totalChapters: chapters.length,
      assignedCells: Object.keys(assignmentMap).length,
      unassignedInProgress: 0,
      overdueAssignments: 0
    };

    const now = new Date();
    for (const a of bookAssignments) {
      if (a.dueDate && new Date(a.dueDate) < now) {
        summary.overdueAssignments++;
      }
    }

    for (const ch of chapters) {
      for (const [stage, data] of Object.entries(ch.stages)) {
        if (data.status === 'in-progress' && !data.assignment) {
          summary.unassignedInProgress++;
        }
      }
    }

    res.json({
      book,
      chapters,
      stages: [
        { id: 'enMarkdown', label: 'EN Markdown', shortLabel: 'EN' },
        { id: 'mtOutput', label: 'Vélþýðing', shortLabel: 'VÞ' },
        { id: 'linguisticReview', label: 'Yfirferð 1', shortLabel: 'Y1' },
        { id: 'tmCreated', label: 'Þýðingaminni', shortLabel: 'TM' },
        { id: 'publication', label: 'Útgáfa', shortLabel: 'Útg' }
      ],
      team: Array.from(teamSet).sort(),
      summary
    });

  } catch (err) {
    console.error('Assignment matrix error:', err);
    res.status(500).json({
      error: 'Failed to get assignment matrix',
      message: err.message
    });
  }
});

/**
 * POST /api/workflow/assignments/:id/cancel
 * Cancel an assignment
 */
router.post('/assignments/:id/cancel', requireAuth, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const assignment = assignmentStore.cancelAssignment(id, req.user.username, reason);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    res.json({
      success: true,
      assignment
    });

  } catch (err) {
    console.error('Cancel assignment error:', err);
    res.status(500).json({
      error: 'Failed to cancel assignment',
      message: err.message
    });
  }
});

module.exports = router;
