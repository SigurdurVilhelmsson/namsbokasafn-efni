/**
 * Sync Routes
 *
 * Handles content synchronization via GitHub PRs.
 * Server has read-only access to content repo; all writes go through PRs.
 *
 * Endpoints:
 *   POST /api/sync/prepare          Prepare content for sync
 *   POST /api/sync/create-pr        Create PR for approved content
 *   GET  /api/sync/status/:prNumber Get PR status
 *   GET  /api/sync/prs              List sync PRs
 *   GET  /api/sync/config           Check GitHub configuration
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { requireAuth } = require('../middleware/requireAuth');
const { requireEditor, requireHeadEditor } = require('../middleware/requireRole');
const { GitHubClient, createSyncPR, isConfigured, getConfigStatus } = require('../services/github');
const session = require('../services/session');

// Track created PRs (would use database in production)
const prStore = new Map();

/**
 * GET /api/sync/config
 * Check GitHub configuration status
 */
router.get('/config', (req, res) => {
  res.json(getConfigStatus());
});

/**
 * POST /api/sync/prepare
 * Prepare content for sync (validate and preview)
 *
 * Body:
 *   - sessionId: Workflow session ID
 *   OR
 *   - book: Book identifier
 *   - chapter: Chapter number
 *   - files: Array of file paths to sync
 */
router.post('/prepare', requireAuth, requireEditor(), async (req, res) => {
  const { sessionId, book, chapter, files } = req.body;

  try {
    let filesToSync = [];

    if (sessionId) {
      // Get files from session
      const sessionData = session.getSession(sessionId);
      if (!sessionData) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get completed files from session
      for (const [type, fileInfo] of Object.entries(sessionData.files)) {
        if (fs.existsSync(fileInfo.path)) {
          filesToSync.push({
            type,
            localPath: fileInfo.path,
            content: fs.readFileSync(fileInfo.path, 'utf-8'),
            targetPath: getTargetPath(sessionData.book, sessionData.chapter, type, fileInfo)
          });
        }
      }
    } else if (book && chapter && files) {
      // Manual file selection
      const projectRoot = path.join(__dirname, '..', '..');

      for (const filePath of files) {
        const fullPath = path.join(projectRoot, filePath);
        if (fs.existsSync(fullPath)) {
          filesToSync.push({
            localPath: fullPath,
            content: fs.readFileSync(fullPath, 'utf-8'),
            targetPath: filePath
          });
        }
      }
    } else {
      return res.status(400).json({
        error: 'Provide either sessionId or book+chapter+files'
      });
    }

    if (filesToSync.length === 0) {
      return res.status(400).json({
        error: 'No files to sync',
        message: 'No valid files found for synchronization'
      });
    }

    // Validate files
    const validation = validateFiles(filesToSync);

    res.json({
      ready: validation.valid,
      files: filesToSync.map(f => ({
        targetPath: f.targetPath,
        size: f.content.length,
        type: f.type
      })),
      validation,
      warnings: validation.warnings,
      errors: validation.errors
    });

  } catch (err) {
    console.error('Sync prepare error:', err);
    res.status(500).json({
      error: 'Failed to prepare sync',
      message: err.message
    });
  }
});

/**
 * POST /api/sync/create-pr
 * Create PR for approved content
 *
 * Body:
 *   - sessionId: Workflow session ID
 *   OR
 *   - book: Book identifier
 *   - chapter: Chapter number
 *   - files: Array of {path, content} objects
 *   - description: PR description
 */
router.post('/create-pr', requireAuth, requireHeadEditor(), async (req, res) => {
  const { sessionId, book, chapter, files, description } = req.body;

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'GitHub integration not configured',
      message: 'Set GITHUB_REPO_OWNER and GITHUB_REPO_NAME environment variables'
    });
  }

  // Get user's GitHub access token
  const accessToken = req.user.githubAccessToken || process.env.GITHUB_BOT_TOKEN;
  if (!accessToken) {
    return res.status(401).json({
      error: 'GitHub access token required',
      message: 'User must be authenticated with GitHub'
    });
  }

  try {
    let filesToSync = [];
    let syncBook = book;
    let syncChapter = chapter;

    if (sessionId) {
      const sessionData = session.getSession(sessionId);
      if (!sessionData) {
        return res.status(404).json({ error: 'Session not found' });
      }

      syncBook = sessionData.book;
      syncChapter = sessionData.chapter;

      for (const [type, fileInfo] of Object.entries(sessionData.files)) {
        if (fs.existsSync(fileInfo.path)) {
          filesToSync.push({
            path: getTargetPath(syncBook, syncChapter, type, fileInfo),
            content: fs.readFileSync(fileInfo.path, 'utf-8')
          });
        }
      }
    } else if (book && chapter && files) {
      syncBook = book;
      syncChapter = chapter;
      filesToSync = files;
    } else {
      return res.status(400).json({
        error: 'Provide either sessionId or book+chapter+files'
      });
    }

    if (filesToSync.length === 0) {
      return res.status(400).json({
        error: 'No files to sync'
      });
    }

    // Create PR
    const prResult = await createSyncPR({
      accessToken,
      book: syncBook,
      chapter: syncChapter,
      files: filesToSync,
      username: req.user.username,
      description
    });

    // Store PR info
    prStore.set(prResult.number, {
      ...prResult,
      book: syncBook,
      chapter: syncChapter,
      createdBy: req.user.username,
      files: filesToSync.map(f => f.path)
    });

    res.json({
      success: true,
      pr: prResult,
      message: 'Pull request created successfully'
    });

  } catch (err) {
    console.error('Create PR error:', err);
    res.status(500).json({
      error: 'Failed to create PR',
      message: err.message
    });
  }
});

/**
 * GET /api/sync/status/:prNumber
 * Get PR status
 */
router.get('/status/:prNumber', requireAuth, async (req, res) => {
  const { prNumber } = req.params;

  const accessToken = req.user.githubAccessToken || process.env.GITHUB_BOT_TOKEN;
  if (!accessToken) {
    return res.status(401).json({
      error: 'GitHub access token required'
    });
  }

  try {
    const client = new GitHubClient(accessToken);
    const pr = await client.getPullRequest(parseInt(prNumber));
    const reviews = await client.getPullRequestReviews(parseInt(prNumber));
    const mergeable = await client.checkMergeable(parseInt(prNumber));

    const storedInfo = prStore.get(parseInt(prNumber));

    res.json({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      merged: pr.merged,
      mergeable: mergeable.mergeable,
      mergeableState: mergeable.mergeableState,
      reviews: reviews.map(r => ({
        user: r.user.login,
        state: r.state,
        submittedAt: r.submitted_at
      })),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      storedInfo
    });

  } catch (err) {
    console.error('Get PR status error:', err);
    res.status(500).json({
      error: 'Failed to get PR status',
      message: err.message
    });
  }
});

/**
 * GET /api/sync/prs
 * List sync PRs
 */
router.get('/prs', requireAuth, async (req, res) => {
  const { state = 'open', book } = req.query;

  const accessToken = req.user.githubAccessToken || process.env.GITHUB_BOT_TOKEN;
  if (!accessToken) {
    // Return only stored PRs if no token
    let prs = Array.from(prStore.values());
    if (book) {
      prs = prs.filter(p => p.book === book);
    }
    return res.json({ prs, source: 'local' });
  }

  try {
    const client = new GitHubClient(accessToken);
    let prs = await client.listPullRequests(state);

    // Filter to sync PRs (by branch name pattern)
    prs = prs.filter(pr => pr.head.ref.startsWith('sync/'));

    if (book) {
      prs = prs.filter(pr => pr.head.ref.includes('/' + book + '/'));
    }

    res.json({
      prs: prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        branch: pr.head.ref,
        merged: pr.merged,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        user: pr.user.login
      })),
      total: prs.length,
      source: 'github'
    });

  } catch (err) {
    console.error('List PRs error:', err);
    res.status(500).json({
      error: 'Failed to list PRs',
      message: err.message
    });
  }
});

// Helper functions

function getTargetPath(book, chapter, fileType, fileInfo) {
  const chapterStr = String(chapter).padStart(2, '0');

  switch (fileType) {
    case 'markdown':
    case 'faithful-md':
      return `books/${book}/03-faithful/chapters/${chapterStr}/${path.basename(fileInfo.originalName || fileInfo.path)}`;
    case 'translated-markdown':
      return `books/${book}/02-mt-output/chapters/${chapterStr}/${path.basename(fileInfo.originalName || fileInfo.path)}`;
    case 'tmx':
      return `books/${book}/tm/${path.basename(fileInfo.originalName || fileInfo.path)}`;
    case 'xliff':
    case 'reviewed-xliff':
      return `books/${book}/pipeline-temp/xliff/${chapterStr}/${path.basename(fileInfo.originalName || fileInfo.path)}`;
    default:
      return `books/${book}/pipeline-temp/${fileType}/${path.basename(fileInfo.originalName || fileInfo.path)}`;
  }
}

function validateFiles(files) {
  const result = {
    valid: true,
    warnings: [],
    errors: []
  };

  for (const file of files) {
    // Check file size
    if (file.content.length > 1024 * 1024) { // 1MB
      result.warnings.push({
        file: file.targetPath,
        message: 'File is large (>1MB), sync may be slow'
      });
    }

    // Check for common issues
    if (file.content.includes('[EQUATION_')) {
      result.warnings.push({
        file: file.targetPath,
        message: 'Contains equation placeholders - ensure equations are restored'
      });
    }

    // Check for sensitive content patterns
    if (file.content.match(/password|secret|api[_-]?key/i)) {
      result.errors.push({
        file: file.targetPath,
        message: 'File may contain sensitive content'
      });
      result.valid = false;
    }
  }

  return result;
}

module.exports = router;
