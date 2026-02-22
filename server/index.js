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
const { requireAuth } = require('./middleware/requireAuth');

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

// Load version from package.json
const serverVersion = require('./package.json').version;

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
        scriptSrcAttr: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
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

// Stricter rate limiting for public content-submission endpoints
const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 submissions per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many submissions',
    message: 'Please try again later',
  },
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// CORS configuration - allow requests from web reader (vefur)
const allowedOrigins = ['https://namsbokasafn.is', 'https://www.namsbokasafn.is'];

// Allow localhost origins only in development
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:5173', // Vite dev server
    'http://localhost:4173', // Vite preview
    'http://localhost:3000' // Local dev
  );
}

// Add custom origins from environment
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map((o) => o.trim()));
}

app.use(
  cors({
    origin: (origin, callback) => {
      // In production, reject requests with no origin (blocks curl, extensions, etc.)
      if (!origin) {
        if (process.env.NODE_ENV === 'production') {
          return callback(null, false);
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin) || /^https:\/\/[\w-]+\.namsbokasafn\.is$/.test(origin)) {
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
// Apply stricter rate limiting only to login/callback (not session checks like /me)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/callback', authLimiter);
app.use('/api/auth', authRoutes);
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
app.post('/api/feedback', publicSubmitLimiter);
app.post('/api/analytics/event', publicSubmitLimiter);
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
    version: serverVersion,
    phase: 2,
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Translation Pipeline API',
    version: serverVersion,
    status: 'ok',
    health: '/api/health',
    documentation: 'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni',
  });
});

// Static file serving for downloads (authenticated)
const downloadsPath = path.join(__dirname, '..', 'pipeline-output');
app.use('/downloads', requireAuth, express.static(downloadsPath));

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

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: isProduction
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred',
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('═'.repeat(55));
  console.log(`Translation Pipeline API Server v${serverVersion}`);
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
