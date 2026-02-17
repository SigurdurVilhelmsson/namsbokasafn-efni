#!/usr/bin/env node

/**
 * Translation Pipeline API Server (Phase 2)
 *
 * Provides REST endpoints for:
 * - Processing CNXML files through the translation pipeline
 * - Fetching OpenStax modules
 * - Checking pipeline status
 * - GitHub OAuth authentication
 * - Multi-step workflow management
 * - Issue tracking and classification
 * - Image translation tracking
 * - PR-based content sync
 *
 * Usage:
 *   npm start                    # Start on default port (3000)
 *   PORT=8080 npm start          # Start on custom port
 *   npm run dev                  # Start with watch mode (Node 18+)
 */

// Load environment variables first
require('dotenv').config();

// Validate configuration before proceeding
const { validateSecrets, config } = require('./config');
validateSecrets();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import Phase 1 routes
const modulesRoutes = require('./routes/modules');
const statusRoutes = require('./routes/status');
const matecatRoutes = require('./routes/matecat');

// Import Phase 2 routes
const authRoutes = require('./routes/auth');
const workflowRoutes = require('./routes/workflow');
const issuesRoutes = require('./routes/issues');
const syncRoutes = require('./routes/sync');
const imagesRoutes = require('./routes/images');
const viewRoutes = require('./routes/views');
const booksRoutes = require('./routes/books');

// Import Phase 3 routes
const reviewsRoutes = require('./routes/reviews');
const notificationsRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activity');

// Import Phase 4 routes (Translation Management)
const adminRoutes = require('./routes/admin');
const sectionsRoutes = require('./routes/sections');

// Import Phase 5 routes (Terminology & Suggestions)
const terminologyRoutes = require('./routes/terminology');
const suggestionsRoutes = require('./routes/suggestions');

// Import My Work routes (translator dashboard)
const myWorkRoutes = require('./routes/my-work');

// Import Phase 6 routes (Publication)
const publicationRoutes = require('./routes/publication');

// Import Phase 7 routes (Pilot Support)
const feedbackRoutes = require('./routes/feedback');
const analyticsRoutes = require('./routes/analytics');

// Import Phase 8 routes (Segment Editor, Pipeline, Localization Editor)
const segmentEditorRoutes = require('./routes/segment-editor');
const pipelineRoutes = require('./routes/pipeline');
const localizationEditorRoutes = require('./routes/localization-editor');

// Configuration (use validated config)
const PORT = config.port;
const HOST = config.host;

// Initialize Express app
const app = express();

// Security middleware - must come before other middleware
// Helmet sets various HTTP headers for security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
        connectSrc: ["'self'"],
      },
    },
    // Allow cross-origin requests for API
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Rate limiting - general limiter for all routes
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});

// Stricter rate limiting for auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// CORS configuration - allow requests from web reader (vefur)
const allowedOrigins = [
  'https://namsbokasafn.is',
  'https://www.namsbokasafn.is',
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // Vite preview
  'http://localhost:3000', // Local dev
];

// Add custom origins from environment
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map((o) => o.trim()));
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || origin.endsWith('.namsbokasafn.is')) {
        callback(null, true);
      } else {
        console.log(`[CORS] Blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Phase 1 API Routes
app.use('/api/modules', modulesRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/matecat', matecatRoutes);

// Phase 2 API Routes
// Apply stricter rate limiting to auth endpoints
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/images', imagesRoutes);

// Phase 3 API Routes
app.use('/api/reviews', reviewsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);

// Phase 4 API Routes (Translation Management)
app.use('/api/admin', adminRoutes);
app.use('/api/sections', sectionsRoutes);

// Phase 5 API Routes (Terminology & Suggestions)
app.use('/api/terminology', terminologyRoutes);
app.use('/api/suggestions', suggestionsRoutes);

// My Work API Routes (translator dashboard)
app.use('/api/my-work', myWorkRoutes);

// Phase 6 API Routes (Publication)
app.use('/api/publication', publicationRoutes);

// Phase 7 API Routes (Pilot Support)
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);

// Phase 8 API Routes (Segment Editor, Pipeline, Localization Editor)
app.use('/api/segment-editor', segmentEditorRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/localization-editor', localizationEditorRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    phase: 2,
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Translation Pipeline API',
    version: '2.0.0',
    phase: 2,
    endpoints: {
      // Phase 1
      'GET /api/health': 'Health check',
      'GET /api/modules': 'List available OpenStax modules',
      'GET /api/modules/:moduleId': 'Get module details',
      'GET /api/status/:book': 'Get pipeline status for book',
      'GET /api/status/:book/:chapter': 'Get status for specific chapter',
      'GET /api/matecat': 'Matecat integration documentation',
      'POST /api/matecat/projects': 'Create Matecat translation project',
      // Phase 2 - Auth
      'GET /api/auth/login': 'GitHub OAuth login',
      'GET /api/auth/callback': 'OAuth callback',
      'GET /api/auth/me': 'Current user info',
      'POST /api/auth/logout': 'Logout',
      // Phase 2 - Workflow
      'POST /api/workflow/start': 'Start new workflow session',
      'GET /api/workflow/:sessionId': 'Get session status',
      'POST /api/workflow/:sessionId/upload/:step': 'Upload file for step',
      'POST /api/workflow/:sessionId/advance': 'Advance to next step',
      // Phase 2 - Issues
      'GET /api/issues': 'List pending issues',
      'POST /api/issues/:id/resolve': 'Resolve an issue',
      'GET /api/issues/stats': 'Issue statistics',
      // Phase 2 - Sync
      'POST /api/sync/prepare': 'Prepare content for sync',
      'POST /api/sync/create-pr': 'Create sync PR',
      'GET /api/sync/status/:prNumber': 'Get PR status',
      // Phase 2 - Images
      'GET /api/images/:book': 'Book image overview',
      'GET /api/images/:book/:chapter': 'Chapter image details',
      'POST /api/images/:book/:chapter/:id/upload': 'Upload translated image',
      // Phase 3 - Reviews
      'GET /api/reviews': 'List pending reviews',
      'GET /api/reviews/:id': 'Get review details',
      'POST /api/reviews/:id/approve': 'Approve review',
      'POST /api/reviews/:id/changes': 'Request changes',
      // Phase 4 - Admin (Translation Management)
      'GET /api/admin/catalogue': 'List OpenStax catalogue',
      'POST /api/admin/catalogue/sync': 'Sync catalogue with predefined books',
      'POST /api/admin/books/register': 'Register book for translation',
      'GET /api/admin/books': 'List registered books',
      'GET /api/admin/books/:slug': 'Get book details with chapters',
      'POST /api/admin/migrate': 'Run database migrations',
      // Publication (HTML pipeline)
      'GET /api/publication/:bookSlug/:chapter/status': 'Publication status for all tracks',
      'GET /api/publication/:bookSlug/:chapter/readiness': 'Readiness check for each track',
      'GET /api/publication/:bookSlug/:chapter/modules': 'Module-level source availability',
      'POST /api/publication/:bookSlug/:chapter/mt-preview':
        'Publish MT preview via pipeline (HEAD_EDITOR, returns jobId)',
      'POST /api/publication/:bookSlug/:chapter/faithful':
        'Publish faithful via pipeline (HEAD_EDITOR, returns jobId)',
      'POST /api/publication/:bookSlug/:chapter/localized':
        'Publish localized via pipeline (HEAD_EDITOR, returns jobId)',
      'GET /api/publication/:bookSlug/overview': 'Publication overview for book',
      // Phase 7 - Feedback & Analytics
      'GET /api/feedback/types': 'Get feedback types (public)',
      'POST /api/feedback': 'Submit feedback (public)',
      'GET /api/feedback': 'List all feedback (HEAD_EDITOR)',
      'GET /api/feedback/stats': 'Get feedback statistics',
      'GET /api/feedback/:id': 'Get feedback details',
      'POST /api/feedback/:id/resolve': 'Resolve feedback',
      'GET /api/analytics/stats': 'Get analytics statistics',
      'GET /api/analytics/recent': 'Get recent events',
      'POST /api/analytics/event': 'Log client-side event (public)',
      // Phase 8 - Segment Editor
      'GET /api/segment-editor/:book/:chapter': 'List modules in chapter',
      'GET /api/segment-editor/:book/:chapter/:moduleId': 'Load module for editing',
      'POST /api/segment-editor/:book/:chapter/:moduleId/edit': 'Save segment edit',
      'DELETE /api/segment-editor/edit/:editId': 'Delete pending edit',
      'POST /api/segment-editor/:book/:chapter/:moduleId/submit': 'Submit for review',
      'GET /api/segment-editor/reviews': 'List pending module reviews',
      'POST /api/segment-editor/edit/:editId/approve': 'Approve segment edit',
      'POST /api/segment-editor/edit/:editId/reject': 'Reject segment edit',
      'POST /api/segment-editor/reviews/:reviewId/complete': 'Complete module review',
      'GET /api/segment-editor/:book/:chapter/:moduleId/terms': 'Term matches per segment',
      'GET /api/segment-editor/terminology/lookup': 'Quick term lookup',
      // Pipeline
      'POST /api/pipeline/inject': 'Run cnxml-inject (HEAD_EDITOR)',
      'POST /api/pipeline/render': 'Run cnxml-render (HEAD_EDITOR)',
      'POST /api/pipeline/run': 'Run inject + render (HEAD_EDITOR)',
      'GET /api/pipeline/jobs': 'List pipeline jobs',
      'GET /api/pipeline/jobs/:jobId': 'Get job status/output',
      // Localization Editor
      'GET /api/localization-editor/:book/:chapter': 'List modules with localization status',
      'GET /api/localization-editor/:book/:chapter/:moduleId':
        'Load module for localization (3-way)',
      'POST /api/localization-editor/:book/:chapter/:moduleId/save':
        'Save single localized segment',
      'POST /api/localization-editor/:book/:chapter/:moduleId/save-all':
        'Bulk save localized segments',
    },
    documentation: 'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni',
  });
});

// Static file serving for downloads
const downloadsPath = path.join(__dirname, '..', 'pipeline-output');
app.use('/downloads', express.static(downloadsPath));

// Static file serving for public assets (CSS, JS)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// HTML Views (must be after API routes)
app.use('/', viewRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: '/api',
  });
});

// Error handler (next is required by Express error handler signature)
app.use((err, req, res, _next) => {
  console.error('Error:', err);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'Uploaded file exceeds size limit (10MB)',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Invalid Upload',
      message: 'Unexpected field in upload',
    });
  }

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('═'.repeat(55));
  console.log('Translation Pipeline API Server v2.0 (Phase 2)');
  console.log('═'.repeat(55));
  console.log('');
  console.log(`  Server: http://${HOST}:${PORT}`);
  console.log(`  API:    http://${HOST}:${PORT}/api`);
  console.log(`  Web UI: http://${HOST}:${PORT}/workflow`);
  console.log('');
  console.log('Key Endpoints:');
  console.log('  GET  /api/status/:book      Get pipeline status');
  console.log('  GET  /api/auth/login        GitHub OAuth login');
  console.log('  POST /api/workflow/resume   Resume workflow session');
  console.log('  POST /api/pipeline/run      Inject + render (HEAD_EDITOR)');
  console.log('');
  console.log('Web Interface:');
  console.log('  /workflow         Multi-step workflow wizard');
  console.log('  /segment-editor   Segment-level linguistic editor');
  console.log('  /localization-editor  Segment-level localization (Pass 2)');
  console.log('  /pipeline         Pipeline flow dashboard');
  console.log('  /reviews          Review dashboard');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});

module.exports = app;
