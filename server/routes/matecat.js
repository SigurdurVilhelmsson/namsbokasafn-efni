/**
 * Matecat Routes
 *
 * API endpoints for Matecat integration.
 *
 * Endpoints:
 *   POST /api/matecat/projects              Create a new translation project
 *   GET  /api/matecat/projects/:id/status   Get project status
 *   GET  /api/matecat/jobs/:id/stats        Get job statistics
 *   GET  /api/matecat/jobs/:id/download     Download translated file
 *   POST /api/matecat/config                Save API configuration
 *   GET  /api/matecat/config                Get API configuration status
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { MatecatClient, LANGUAGE_CODES, SUBJECTS } = require('../services/matecat');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'pipeline-output', 'matecat-uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB (Matecat limit)
  fileFilter: (req, file, cb) => {
    // Accept XLIFF and common translation formats
    const allowedExts = ['.xliff', '.xlf', '.xml', '.docx', '.txt', '.html', '.json', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowedExts.join(', ')}`));
    }
  },
});

// In-memory storage for project tracking (could be Redis/DB in production)
const projectStore = new Map();

// ============================================================================
// Middleware
// ============================================================================

/**
 * Middleware to get or create Matecat client
 */
function getClient(req, res, next) {
  const apiKey = req.headers['x-matecat-key'] || process.env.MATECAT_API_KEY;
  const baseUrl = req.headers['x-matecat-url'] || process.env.MATECAT_BASE_URL;

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Provide MATECAT_API_KEY env var or x-matecat-key header',
    });
  }

  try {
    req.matecat = new MatecatClient({
      apiKey,
      baseUrl: baseUrl || undefined,
    });
    next();
  } catch (err) {
    res.status(500).json({
      error: 'Failed to create Matecat client',
      message: err.message,
    });
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/matecat
 * API documentation
 */
router.get('/', (req, res) => {
  res.json({
    service: 'Matecat Integration',
    version: '1.0.0',
    endpoints: {
      'POST /api/matecat/projects': 'Create a new translation project',
      'GET /api/matecat/projects/:id/status': 'Get project status',
      'GET /api/matecat/jobs/:id/stats': 'Get job translation statistics',
      'GET /api/matecat/jobs/:id/download': 'Download translated file',
      'GET /api/matecat/config': 'Check API configuration status',
    },
    authentication: {
      methods: ['x-matecat-key header', 'MATECAT_API_KEY environment variable'],
      note: 'Get your API key from your Matecat profile settings',
    },
    languages: LANGUAGE_CODES,
    subjects: SUBJECTS,
  });
});

/**
 * GET /api/matecat/config
 * Check if Matecat is configured
 */
router.get('/config', (req, res) => {
  const hasEnvKey = !!process.env.MATECAT_API_KEY;
  const hasHeaderKey = !!req.headers['x-matecat-key'];
  const baseUrl = process.env.MATECAT_BASE_URL || 'https://www.matecat.com';

  res.json({
    configured: hasEnvKey || hasHeaderKey,
    source: hasHeaderKey ? 'header' : hasEnvKey ? 'environment' : 'none',
    baseUrl,
    selfHosted: baseUrl !== 'https://www.matecat.com',
  });
});

/**
 * POST /api/matecat/projects
 * Create a new translation project
 *
 * Body (multipart/form-data):
 *   - file: XLIFF or other translation file
 *   - sourceLang: Source language code (e.g., 'en-US')
 *   - targetLang: Target language code (e.g., 'is-IS')
 *   - projectName: (optional) Project name
 *   - subject: (optional) Subject/domain
 *   - tmKey: (optional) Translation Memory key
 *   - pretranslate: (optional) Enable TM pre-translation
 */
router.post('/projects', getClient, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please upload a file for translation',
    });
  }

  const { sourceLang, targetLang, projectName, subject, tmKey, pretranslate } = req.body;

  if (!sourceLang || !targetLang) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'sourceLang and targetLang are required',
    });
  }

  try {
    const result = await req.matecat.createProject({
      files: req.file.path,
      sourceLang,
      targetLang,
      projectName: projectName || `Pipeline_${Date.now()}`,
      subject: subject || 'general',
      tmKey,
      pretranslate: pretranslate === 'true' || pretranslate === true,
    });

    // Store project info
    const projectId = result.id_project;
    projectStore.set(projectId, {
      id: projectId,
      password: result.project_pass,
      name: projectName,
      sourceLang,
      targetLang,
      sourceFile: req.file.originalname,
      createdAt: new Date().toISOString(),
      jobs: result.jobs || [],
      analyzeUrl: result.analyze_url,
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      project: {
        id: projectId,
        password: result.project_pass,
        analyzeUrl: result.analyze_url,
        jobs: (result.jobs || []).map((job) => ({
          id: job.id,
          password: job.password,
          sourceLang: job.source,
          targetLang: job.target,
        })),
      },
      links: {
        status: `/api/matecat/projects/${projectId}/status?password=${result.project_pass}`,
        jobs: (result.jobs || []).map((job) => ({
          stats: `/api/matecat/jobs/${job.id}/stats?password=${job.password}`,
          download: `/api/matecat/jobs/${job.id}/download?password=${job.password}`,
        })),
      },
    });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('Matecat project creation error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Failed to create project',
      message: err.message,
      details: err.response || null,
    });
  }
});

/**
 * GET /api/matecat/projects/:id/status
 * Get project status
 *
 * Query params:
 *   - password: Project password (required)
 */
router.get('/projects/:id/status', getClient, async (req, res) => {
  const { id } = req.params;
  const { password } = req.query;

  if (!password) {
    return res.status(400).json({
      error: 'Missing password',
      message: 'Project password is required as query parameter',
    });
  }

  try {
    const status = await req.matecat.getStatus(id, password);

    // Update stored project info
    const stored = projectStore.get(id);
    if (stored) {
      stored.lastStatus = status.status;
      stored.lastChecked = new Date().toISOString();
    }

    res.json({
      projectId: id,
      status: status.status,
      message:
        status.status === 'ANALYZING'
          ? 'Project is being analyzed'
          : status.status === 'DONE'
            ? 'Analysis complete, ready for translation'
            : status.status === 'FAIL'
              ? 'Analysis failed'
              : 'Unknown status',
      details: {
        jobs: status.jobs || [],
        summary: status.summary || null,
      },
      raw: status,
    });
  } catch (err) {
    console.error('Matecat status error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Failed to get status',
      message: err.message,
    });
  }
});

/**
 * GET /api/matecat/jobs/:id/stats
 * Get job translation statistics
 *
 * Query params:
 *   - password: Job password (required)
 */
router.get('/jobs/:id/stats', getClient, async (req, res) => {
  const { id } = req.params;
  const { password } = req.query;

  if (!password) {
    return res.status(400).json({
      error: 'Missing password',
      message: 'Job password is required as query parameter',
    });
  }

  try {
    const stats = await req.matecat.getStats(id, password);

    // Calculate progress
    const total = stats.TOTAL || 0;
    const draft = stats.DRAFT || 0;
    const translated = stats.TRANSLATED || 0;
    const approved = stats.APPROVED || 0;
    const rejected = stats.REJECTED || 0;

    const progress = total > 0 ? Math.round(((translated + approved) / total) * 100) : 0;

    res.json({
      jobId: id,
      progress: `${progress}%`,
      wordCounts: {
        total,
        draft,
        translated,
        approved,
        rejected,
      },
      isComplete: progress === 100,
      raw: stats,
    });
  } catch (err) {
    console.error('Matecat stats error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Failed to get stats',
      message: err.message,
    });
  }
});

/**
 * GET /api/matecat/jobs/:id/urls
 * Get download URLs for a job
 *
 * Query params:
 *   - password: Job password (required)
 */
router.get('/jobs/:id/urls', getClient, async (req, res) => {
  const { id } = req.params;
  const { password } = req.query;

  if (!password) {
    return res.status(400).json({
      error: 'Missing password',
      message: 'Job password is required as query parameter',
    });
  }

  try {
    const urls = await req.matecat.getUrls(id, password);

    res.json({
      jobId: id,
      urls: {
        original: urls.original_download,
        translation: urls.translation_download,
        xliff: urls.xliff_download,
      },
    });
  } catch (err) {
    console.error('Matecat urls error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Failed to get URLs',
      message: err.message,
    });
  }
});

/**
 * GET /api/matecat/jobs/:id/download
 * Download translated file
 *
 * Query params:
 *   - password: Job password (required)
 *   - type: 'translation' (default), 'original', or 'xliff'
 */
router.get('/jobs/:id/download', getClient, async (req, res) => {
  const { id } = req.params;
  const { password, type = 'translation' } = req.query;

  if (!password) {
    return res.status(400).json({
      error: 'Missing password',
      message: 'Job password is required as query parameter',
    });
  }

  if (!['translation', 'original', 'xliff'].includes(type)) {
    return res.status(400).json({
      error: 'Invalid type',
      message: 'Type must be: translation, original, or xliff',
    });
  }

  try {
    // Get download URLs
    const urls = await req.matecat.getUrls(id, password);

    let downloadUrl;
    switch (type) {
      case 'original':
        downloadUrl = urls.original_download;
        break;
      case 'xliff':
        downloadUrl = urls.xliff_download;
        break;
      case 'translation':
      default:
        downloadUrl = urls.translation_download;
    }

    if (!downloadUrl) {
      return res.status(404).json({
        error: 'Download not available',
        message: `${type} download URL is not available`,
      });
    }

    // Redirect to Matecat's download URL
    res.redirect(downloadUrl);
  } catch (err) {
    console.error('Matecat download error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Failed to get download',
      message: err.message,
    });
  }
});

/**
 * GET /api/matecat/projects
 * List tracked projects (from local store)
 */
router.get('/projects', (req, res) => {
  const projects = Array.from(projectStore.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  res.json({
    projects,
    total: projectStore.size,
    note: 'This only shows projects created through this API',
  });
});

/**
 * POST /api/matecat/projects/:id/poll
 * Start polling a project until analysis is done
 *
 * Query params:
 *   - password: Project password (required)
 *   - interval: Poll interval in ms (default: 5000)
 *   - timeout: Max wait time in ms (default: 300000 = 5 min)
 */
router.post('/projects/:id/poll', getClient, async (req, res) => {
  const { id } = req.params;
  const { password } = req.query;
  const interval = parseInt(req.query.interval) || 5000;
  const timeout = parseInt(req.query.timeout) || 300000;

  if (!password) {
    return res.status(400).json({
      error: 'Missing password',
      message: 'Project password is required as query parameter',
    });
  }

  try {
    const finalStatus = await req.matecat.pollUntilDone(id, password, {
      interval,
      timeout,
    });

    res.json({
      success: true,
      projectId: id,
      status: finalStatus.status,
      jobs: finalStatus.jobs || [],
    });
  } catch (err) {
    console.error('Matecat poll error:', err);
    res.status(err.statusCode || 500).json({
      error: 'Polling failed',
      message: err.message,
    });
  }
});

module.exports = router;
