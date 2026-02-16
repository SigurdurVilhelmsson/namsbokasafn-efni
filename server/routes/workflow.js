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
const { requireContributor, requireAdmin } = require('../middleware/requireRole');
const session = require('../services/session');
const gitService = require('../services/gitService');
const { classifyIssues, applyAutoFixes, getIssueStats } = require('../services/issueClassifier');
const activityLog = require('../services/activityLog');

const workflowPersistence = require('../services/workflowPersistence');

const { MAX_RETRY_ATTEMPTS } = session;

/**
 * Get book slug from book ID
 * The filesystem uses slugs (e.g., 'efnafraedi') but the workflow uses
 * book IDs (e.g., 'chemistry-2e'). This helper resolves the slug.
 * @param {string} bookId - Book ID (e.g., 'chemistry-2e')
 * @returns {string} Book slug (e.g., 'efnafraedi')
 */
function getBookSlug(bookId) {
  try {
    const bookDataPath = path.join(__dirname, '..', 'data', `${bookId}.json`);
    if (fs.existsSync(bookDataPath)) {
      const bookData = JSON.parse(fs.readFileSync(bookDataPath, 'utf8'));
      return bookData.slug || bookId;
    }
  } catch (err) {
    console.warn('Could not load book data for slug:', err.message);
  }
  return bookId;
}

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
  },
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
  },
});

/**
 * POST /api/workflow/start
 * Create a new workflow session
 *
 * Extraction is now done via CLI tools (cnxml-extract.js).
 * This endpoint creates a session starting at the MT upload step.
 * Use /api/workflow/resume for chapters that already have extracted files.
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
      message: 'book and chapter are required',
    });
  }

  if (!modules || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({
      error: 'Missing modules',
      message: 'At least one module is required',
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
        progress: progress,
      },
      action: 'join',
      joinUrl: `/workflow?session=${existing.id}`,
    });
  }

  try {
    // Create session starting at MT upload step (step 1)
    // Extraction (step 0) is done via CLI: node tools/cnxml-extract.js
    const newSession = session.createSession({
      book,
      chapter,
      modules,
      sourceType: 'modules',
      userId: req.user.id,
      username: req.user.username,
      startStep: 1,
      completedSteps: ['source'],
    });

    const sessionData = session.getSession(newSession.sessionId);

    // Build expected files for MT upload step
    const expected = modules.map((m) => ({
      moduleId: typeof m === 'object' ? m.id : m,
      section: typeof m === 'object' ? m.section : null,
      title: typeof m === 'object' ? m.title : null,
      displayName:
        typeof m === 'object' && m.section
          ? `${m.section}: ${m.title || m.id}`
          : typeof m === 'object'
            ? m.id
            : m,
      expectedUpload:
        typeof m === 'object' && m.section ? `${m.section.replace('.', '-')}.is.md` : null,
    }));
    session.updateExpectedFiles(newSession.sessionId, 'mt-upload', expected);

    // Save checkpoint
    session.saveCheckpoint(newSession.sessionId);

    res.json({
      success: true,
      sessionId: newSession.sessionId,
      book,
      chapter,
      modulesTotal: modules.length,
      steps: sessionData.steps.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        manual: s.manual,
      })),
      currentStep: sessionData.steps[sessionData.currentStep],
      downloads: getDownloadLinks(newSession.sessionId, sessionData),
    });
  } catch (err) {
    console.error('Workflow start error:', err);
    res.status(500).json({
      error: 'Failed to start workflow',
      message: err.message,
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
    total: sessions.length,
  });
});

/**
 * GET /api/workflow/sessions/all
 * List all active sessions (admin only)
 */
router.get('/sessions/all', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
    });
  }

  const sessions = session.listAllSessions();

  res.json({
    sessions,
    total: sessions.length,
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
      message: 'book and chapter are required',
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
      activeSession: activeSession
        ? {
            id: activeSession.id,
            startedBy: activeSession.username,
            currentStep: activeSession.steps[activeSession.currentStep]?.name,
            createdAt: activeSession.createdAt,
          }
        : null,
      progress: {
        canResume: progress.canResume,
        resumeStep: progress.resumeStep,
        resumeStepIndex: progress.resumeStepIndex,
        completedSteps: progress.completedSteps,
        stepProgress: progress.stepProgress,
      },
      sections: progress.sections,
      downloads:
        progress.completedSteps.length > 0
          ? workflowPersistence.getCompletedStepDownloads(book, chapterNum, progress.completedSteps)
          : {},
    });
  } catch (err) {
    console.error('Check progress error:', err);
    res.status(500).json({
      error: 'Failed to check progress',
      message: err.message,
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
      message: 'book and chapter are required',
    });
  }

  if (!modules || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({
      error: 'Missing modules',
      message: 'At least one module is required',
    });
  }

  try {
    // Detect existing progress
    const progress = workflowPersistence.detectExistingProgress(book, chapter);

    if (!progress.canResume) {
      return res.status(400).json({
        error: 'No progress to resume',
        message: 'No existing files found for this chapter. Use /start instead.',
        suggestion: 'POST /api/workflow/start',
      });
    }

    // Determine start step
    const startStep = resumeFromStep !== undefined ? resumeFromStep : progress.resumeStepIndex;

    // Create session starting from the resume point
    const newSession = session.createSession({
      book,
      chapter,
      modules,
      sourceType: 'modules',
      userId: req.user.id,
      username: req.user.username,
      startStep,
      completedSteps: progress.completedSteps,
    });

    const sessionData = session.getSession(newSession.sessionId);

    // Build expected files for current step
    if (startStep === 1) {
      // Resuming at MT upload - build expected files from sections
      const expected = modules.map((m) => ({
        moduleId: typeof m === 'object' ? m.id : m,
        section: typeof m === 'object' ? m.section : null,
        title: typeof m === 'object' ? m.title : null,
        displayName:
          typeof m === 'object' && m.section
            ? `${m.section}: ${m.title || m.id}`
            : typeof m === 'object'
              ? m.id
              : m,
        expectedUpload:
          typeof m === 'object' && m.section ? `${m.section.replace('.', '-')}.is.md` : null,
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
      steps: sessionData.steps.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        manual: s.manual,
      })),
      currentStep: sessionData.steps[startStep],
      downloads: workflowPersistence.getCompletedStepDownloads(
        book,
        chapter,
        progress.completedSteps
      ),
      uploadProgress,
    });
  } catch (err) {
    console.error('Workflow resume error:', err);
    res.status(500).json({
      error: 'Failed to resume workflow',
      message: err.message,
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
      message: `No session with ID ${sessionId}`,
    });
  }

  // Check access (user owns session or is admin)
  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You do not have access to this session',
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
      bookSlug: sessionData.bookSlug || getBookSlug(sessionData.book),
      chapter: sessionData.chapter,
      modules: sessionData.modules,
      status: sessionData.status,
      currentStep: sessionData.currentStep,
      steps: sessionData.steps.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        manual: s.manual,
        instructions: s.instructions,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        issues: s.issues.length,
      })),
      issues: sessionData.issues,
      files: Object.keys(sessionData.files),
      expectedFiles: sessionData.expectedFiles,
      uploadedFiles: sessionData.uploadedFiles,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt,
      expiresAt: sessionData.expiresAt,
    },
    uploadProgress,
    downloads: getDownloadLinks(sessionId, sessionData),
    actions: getAvailableActions(sessionData),
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
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
      size: req.file.size,
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
        message: `${progress.uploaded}/${progress.expected} þýdd(ar) skrá(r) mótteknar`,
      };

      // Run issue detection on the uploaded file
      // Note: skipLocalization=true because this is Faithful stage, not Localization
      try {
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        const issues = await classifyIssues(fileContent, {
          type: 'mt-output',
          book: sessionData.book,
          chapter: sessionData.chapter,
          skipLocalization: true, // BOARD_REVIEW issues are for Pass 2 (Localization), not Faithful
        });

        // Apply auto-fixes and store fixed content
        const autoFixResult = applyAutoFixes(fileContent, issues);
        if (autoFixResult.fixesApplied > 0) {
          fs.writeFileSync(req.file.path, autoFixResult.content, 'utf-8');
        }

        // Store non-auto-fixed issues in session
        const remainingIssues = issues.filter((i) => i.category !== 'AUTO_FIX');
        for (const issue of remainingIssues) {
          session.addIssue(sessionId, {
            ...issue,
            sourceFile: req.file.originalname,
            step,
          });
        }

        // Get issue statistics
        const stats = getIssueStats(issues);
        issuesSummary = {
          total: stats.total,
          autoFixed: autoFixResult.fixesApplied,
          requiresReview: stats.requiresReview,
          blocked: stats.blocked,
          byCategory: stats.byCategory,
        };
      } catch (issueErr) {
        console.error('Issue detection error:', issueErr);
        // Don't fail the upload if issue detection fails
        issuesSummary = { error: issueErr.message };
      }

      // === PERSISTENCE: Save MT output to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];

      // Determine section from tracking data or filename
      let section = lastUploaded?.section;
      if (!section && req.file.originalname) {
        // Extract section from filename (e.g., "1-1.is.md" -> "1.1", "intro.is.md" -> "intro")
        const match = req.file.originalname.match(/^(\d+-\d+|intro)\.is\.md$/);
        if (match) {
          section = match[1].replace('-', '.');
        }
      }

      if (section) {
        const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
        const saveResult = workflowPersistence.saveWorkflowFile(
          bookSlug,
          sessionData.chapter,
          section,
          'mt-upload',
          req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved MT output to permanent: ${saveResult.destPath}`);
          // Update database status
          workflowPersistence.updateSectionFromWorkflow(
            bookSlug,
            sessionData.chapter,
            section,
            'mt-upload',
            { filePath: saveResult.destPath }
          );
        } else {
          console.warn(`  Failed to save MT output: ${saveResult.error}`);
        }
      } else {
        console.warn(`  Could not determine section for file: ${req.file.originalname}`);
      }
    }

    if (step === 'faithful-edit') {
      // Faithful translation edited - save updated file
      processingResult = {
        filesUploaded: progress.uploaded,
        filesExpected: progress.expected,
        complete: progress.complete,
        message: `${progress.uploaded}/${progress.expected} skrá(r) yfirfarnar`,
      };

      // === PERSISTENCE: Save faithful edit to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploaded?.section) {
        const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
        const saveResult = workflowPersistence.saveWorkflowFile(
          bookSlug,
          sessionData.chapter,
          lastUploaded.section,
          'faithful-edit',
          req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved faithful edit to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            bookSlug,
            sessionData.chapter,
            lastUploaded.section,
            'faithful-edit',
            { filePath: saveResult.destPath }
          );
        }
      }
    }

    if (step === 'tm-creation') {
      // TMX uploaded from Matecat Align
      processingResult = {
        filesUploaded: 1,
        message: 'TMX skrá móttekin frá Matecat Align',
      };

      // === PERSISTENCE: Save TMX to permanent folder ===
      const lastUploaded = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploaded?.section) {
        const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
        const saveResult = workflowPersistence.saveWorkflowFile(
          bookSlug,
          sessionData.chapter,
          lastUploaded.section,
          'tm-creation',
          req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved TMX to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            bookSlug,
            sessionData.chapter,
            lastUploaded.section,
            'tm-creation',
            { filePath: saveResult.destPath }
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
          skipLocalization: false, // Include BOARD_REVIEW issues for localization
        });

        // Apply auto-fixes
        const autoFixResult = applyAutoFixes(fileContent, issues);
        if (autoFixResult.fixesApplied > 0) {
          fs.writeFileSync(req.file.path, autoFixResult.content, 'utf-8');
        }

        // Store remaining issues
        const remainingIssues = issues.filter((i) => i.category !== 'AUTO_FIX');
        for (const issue of remainingIssues) {
          session.addIssue(sessionId, {
            ...issue,
            sourceFile: req.file.originalname,
            step,
          });
        }

        const stats = getIssueStats(issues);
        issuesSummary = {
          total: stats.total,
          autoFixed: autoFixResult.fixesApplied,
          requiresReview: stats.requiresReview,
          blocked: stats.blocked,
          byCategory: stats.byCategory,
        };
      } catch (issueErr) {
        console.error('Issue detection error:', issueErr);
        issuesSummary = { error: issueErr.message };
      }

      processingResult = {
        filesUploaded: progress.uploaded,
        filesExpected: progress.expected,
        complete: progress.complete,
        message: `${progress.uploaded}/${progress.expected} staðfærð(ar) skrá(r) mótteknar`,
      };

      // === PERSISTENCE: Save localized file to permanent folder ===
      const lastUploadedLoc = progress.uploadedFiles[progress.uploadedFiles.length - 1];
      if (lastUploadedLoc?.section) {
        const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
        const saveResult = workflowPersistence.saveWorkflowFile(
          bookSlug,
          sessionData.chapter,
          lastUploadedLoc.section,
          'localization',
          req.file.path
        );
        if (saveResult.success) {
          console.log(`  Saved localized file to permanent: ${saveResult.destPath}`);
          workflowPersistence.updateSectionFromWorkflow(
            bookSlug,
            sessionData.chapter,
            lastUploadedLoc.section,
            'localization',
            { filePath: saveResult.destPath }
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
          : lastUploaded?.moduleId || 'Unknown',
      },
      progress: {
        uploaded: progress.uploaded,
        expected: progress.expected,
        complete: progress.complete,
        remaining: progress.missing,
      },
      processing: processingResult,
      issues: issuesSummary,
      session: {
        currentStep: updatedSession.currentStep,
        steps: updatedSession.steps.map((s) => ({
          id: s.id,
          status: s.status,
        })),
        totalIssues: updatedSession.issues.length,
        pendingIssues: updatedSession.issues.filter((i) => i.status === 'pending').length,
      },
      nextAction: getNextAction(updatedSession),
    });
  } catch (err) {
    console.error('Upload processing error:', err);
    res.status(500).json({
      error: 'Failed to process upload',
      message: err.message,
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  const file = session.getFile(sessionId, artifact);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).json({
      error: 'Artifact not found',
      message: `No artifact '${artifact}' in this session`,
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
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
    for (const [, file] of Object.entries(sessionData.files)) {
      if (file.part && file.section) {
        sectionsWithSplits.add(file.section);
      }
    }

    for (const [, file] of Object.entries(sessionData.files)) {
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
      message: err.message,
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

  // Get book slug (use cached value from session or resolve from book ID)
  const slug = sessionData.bookSlug || getBookSlug(book);

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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
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
            complete: progress.complete,
          },
        });
      }
    }

    // Check for BLOCKED issues that prevent advancement
    const blockedIssues = sessionData.issues.filter(
      (i) => i.category === 'BLOCKED' && i.status === 'pending'
    );
    if (blockedIssues.length > 0) {
      return res.status(400).json({
        error: 'Blocked issues',
        message: `Ekki hægt að halda áfram: ${blockedIssues.length} vandamál krefjast úrlausnar`,
        messageEn: `Cannot advance: ${blockedIssues.length} blocked issue(s) require resolution`,
        blockedCount: blockedIssues.length,
        issues: blockedIssues.map((i) => ({
          id: i.id,
          description: i.description,
          sourceFile: i.sourceFile,
          line: i.line,
        })),
      });
    }

    // If markComplete is true, mark current step as complete first
    if (markComplete) {
      if (currentStep && currentStep.status !== 'completed') {
        session.updateStepStatus(sessionId, currentStep.id, 'completed', {
          completedBy: req.user.username,
          completedAt: new Date().toISOString(),
        });
      }
    }

    const result = session.advanceSession(sessionId);

    if (result.error) {
      return res.status(400).json({
        error: 'Cannot advance',
        message: result.error,
        currentStep: result.currentStep,
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
          status: result.session.status,
        },
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
      nextAction: getNextAction(finalSession),
    });
  } catch (err) {
    console.error('Advance error:', err);
    res.status(500).json({
      error: 'Failed to advance workflow',
      message: err.message,
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  const cancelled = session.cancelSession(sessionId, reason);

  res.json({
    success: true,
    message: 'Session cancelled',
    session: {
      id: cancelled.id,
      status: cancelled.status,
      cancelReason: cancelled.cancelReason,
    },
  });
});

/**
 * DELETE /api/workflow/:sessionId
 * Delete a workflow session permanently
 * Useful for clearing stale sessions that block new workflows
 */
router.delete('/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }

  // Allow owner or admin to delete
  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Only the session owner or an admin can delete this session',
    });
  }

  const result = session.deleteSession(sessionId);

  if (!result.success) {
    return res.status(500).json({
      error: 'Failed to delete session',
      message: result.error,
    });
  }

  res.json({
    success: true,
    message: 'Verkflæði eytt',
    messageEn: 'Session deleted',
    sessionId,
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
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
    recoveryActions,
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  const result = session.retryCurrentStep(sessionId);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      retryCount: result.retryCount,
      suggestion: result.suggestion,
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
      steps: updatedSession.steps.map((s) => ({
        id: s.id,
        status: s.status,
      })),
    },
    nextAction: getNextAction(updatedSession),
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  const result = session.rollbackToPreviousStep(sessionId);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
      suggestion: sessionData.currentStep === 0 ? 'Use /reset instead' : 'No checkpoint available',
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
      steps: updatedSession.steps.map((s) => ({
        id: s.id,
        status: s.status,
      })),
    },
    downloads: getDownloadLinks(sessionId, updatedSession),
    nextAction: getNextAction(updatedSession),
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
    });
  }

  if (!confirm) {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Reset will clear all progress. Send {confirm: true} to proceed.',
      warning: 'This action cannot be undone',
    });
  }

  const result = session.resetSession(sessionId, true);

  if (!result.success) {
    return res.status(400).json({
      error: result.error,
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
      steps: updatedSession.steps.map((s) => ({
        id: s.id,
        status: s.status,
      })),
    },
    nextAction: getNextAction(updatedSession),
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
      error: 'Session not found',
    });
  }

  if (sessionData.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
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
      errors: `/api/workflow/${sessionId}/errors`,
    },
  });
});

// Helper functions

function getDownloadLinks(sessionId, sessionData) {
  const downloads = {};

  for (const [fileType] of Object.entries(sessionData.files)) {
    downloads[fileType] = `/api/workflow/${sessionId}/download/${fileType}`;
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
      description: currentStep.instructions,
    });
  }

  if (
    currentStep.status === 'completed' &&
    sessionData.currentStep < sessionData.steps.length - 1
  ) {
    actions.push({
      action: 'advance',
      url: `/api/workflow/${sessionData.id}/advance`,
      description: 'Proceed to next step',
    });
  }

  // Add recovery actions if step is failed
  if (currentStep.status === 'failed') {
    // Retry available if under limit
    if ((sessionData.retryCount || 0) < MAX_RETRY_ATTEMPTS) {
      actions.push({
        action: 'retry',
        url: `/api/workflow/${sessionData.id}/retry`,
        description: `Retry current step (${MAX_RETRY_ATTEMPTS - (sessionData.retryCount || 0)} attempts remaining)`,
      });
    }

    // Rollback available if not at first step and has checkpoint
    if (sessionData.currentStep > 0 && sessionData.lastGoodState) {
      actions.push({
        action: 'rollback',
        url: `/api/workflow/${sessionData.id}/rollback`,
        description: 'Rollback to previous checkpoint',
      });
    }

    // Reset always available
    actions.push({
      action: 'reset',
      url: `/api/workflow/${sessionData.id}/reset`,
      description: 'Reset session to beginning (requires confirmation)',
    });
  }

  // Add recovery info link if session has errors
  if (sessionData.errorLog && sessionData.errorLog.length > 0) {
    actions.push({
      action: 'errors',
      url: `/api/workflow/${sessionData.id}/errors`,
      description: `View error history (${sessionData.errorLog.length} errors)`,
    });
  }

  actions.push({
    action: 'cancel',
    url: `/api/workflow/${sessionData.id}/cancel`,
    description: 'Cancel this workflow',
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
        retry: canRetry
          ? {
              available: true,
              retriesRemaining: MAX_RETRY_ATTEMPTS - retryCount,
            }
          : { available: false, reason: 'Maximum retries reached' },
        rollback: canRollback
          ? {
              available: true,
              checkpointStep: sessionData.lastGoodState.currentStep,
            }
          : { available: false, reason: 'No checkpoint or at first step' },
        reset: { available: true, requiresConfirmation: true },
      },
    };
  }

  if (currentStep.manual && currentStep.status !== 'completed') {
    return {
      type: 'upload',
      step: currentStep.id,
      instructions: currentStep.instructions,
    };
  }

  if (currentStep.status === 'completed') {
    return {
      type: 'advance',
      message: 'Ready to proceed to next step',
    };
  }

  return {
    type: 'wait',
    message: 'Processing in progress',
  };
}

async function runAutomaticStep(sessionId, stepId, sessionData) {
  session.updateStepStatus(sessionId, stepId, 'in-progress');

  try {
    if (stepId === 'finalize') {
      // Generate final outputs
      // Copy faithful/localized files to publication folder
      session.updateStepStatus(sessionId, stepId, 'completed', {
        message: 'Final outputs generated',
      });
      // Save checkpoint after automatic step completion
      session.saveCheckpoint(sessionId);
    }
  } catch (err) {
    session.updateStepStatus(sessionId, stepId, 'failed', {
      error: err.message,
    });

    // Log the error
    session.logError(sessionId, stepId, err.message, {
      stack: err.stack,
      retryCount: sessionData.retryCount || 0,
    });

    throw err;
  }
}

// ============================================================================
// GIT COMMIT ROUTES (Admin only)
// ============================================================================

/**
 * GET /api/workflow/:sessionId/git-preview
 * Preview what files would be committed for the current step
 * Admin only
 */
router.get('/:sessionId/git-preview', requireAuth, requireAdmin(), (req, res) => {
  const { sessionId } = req.params;
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }

  try {
    const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
    const currentStep = sessionData.steps[sessionData.currentStep];
    const stepId = currentStep?.id;

    if (!stepId) {
      return res.status(400).json({
        error: 'No current step',
      });
    }

    const preview = gitService.previewChanges(bookSlug, sessionData.chapter, stepId);

    res.json({
      sessionId,
      book: sessionData.book,
      bookSlug,
      chapter: sessionData.chapter,
      stepId,
      stepLabel: preview.stepLabel,
      ...preview,
    });
  } catch (err) {
    console.error('Git preview error:', err);
    res.status(500).json({
      error: 'Failed to preview changes',
      message: err.message,
    });
  }
});

/**
 * POST /api/workflow/:sessionId/git-commit
 * Commit workflow files to git
 * Admin only
 *
 * Body:
 *   - message: Optional custom commit message
 *   - push: Whether to push after commit (default: true)
 */
router.post('/:sessionId/git-commit', requireAuth, requireAdmin(), (req, res) => {
  const { sessionId } = req.params;
  const { message, push = true } = req.body || {};
  const sessionData = session.getSession(sessionId);

  if (!sessionData) {
    return res.status(404).json({
      error: 'Session not found',
    });
  }

  try {
    const bookSlug = sessionData.bookSlug || getBookSlug(sessionData.book);
    const currentStep = sessionData.steps[sessionData.currentStep];
    const stepId = currentStep?.id;

    if (!stepId) {
      return res.status(400).json({
        error: 'No current step',
      });
    }

    // Commit (and optionally push)
    const result = gitService.commitAndPush({
      bookSlug,
      chapter: sessionData.chapter,
      stepId,
      user: req.user,
      message,
      push,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        suggestion: result.pushSuggestion,
      });
    }

    // Log the activity
    activityLog.log({
      type: activityLog.ACTIVITY_TYPES.WORKFLOW_GIT_COMMIT,
      userId: req.user.id,
      username: req.user.username,
      book: sessionData.book,
      chapter: String(sessionData.chapter),
      description: `Committed ${result.filesCommitted} files for ${stepId}`,
      metadata: {
        sha: result.sha,
        stepId,
        filesCommitted: result.filesCommitted,
        pushed: result.pushed,
        files: result.files,
      },
    });

    res.json({
      success: true,
      sha: result.sha,
      filesCommitted: result.filesCommitted,
      pushed: result.pushed,
      pushError: result.pushError,
      pushSuggestion: result.pushSuggestion,
      message: result.message,
    });
  } catch (err) {
    console.error('Git commit error:', err);
    res.status(500).json({
      error: 'Failed to commit changes',
      message: err.message,
    });
  }
});

module.exports = router;
