#!/usr/bin/env node

/**
 * Námsbókasafn Editorial Workflow Server
 *
 * Provides REST endpoints for:
 * - Segment-level linguistic editing (Pass 1)
 * - Localization editing (Pass 2)
 * - Terminology management
 * - Editorial progress tracking
 * - User and book administration
 * - Publication management
 *
 * Pipeline orchestration (extract, translate, inject, render) is handled
 * via CLI tools. See tools/cnxml-extract.js, tools/api-translate.js, etc.
 *
 * Usage:
 *   npm start                    # Start on default port (3000)
 *   PORT=8080 npm start          # Start on custom port
 *   npm run dev                  # Start with watch mode (Node 18+)
 */

// Load environment variables first
require('dotenv').config();

// Validate configuration before proceeding
const { validateSecrets, config, refreshValidBooks, VALID_BOOKS } = require('./config');
validateSecrets();

// Auto-run pending database migrations before starting the server
const { runAllMigrations } = require('./services/migrationRunner');
const migrationResult = runAllMigrations();
if (migrationResult.applied > 0) {
  console.log(
    `Migrations: ${migrationResult.applied} applied, ${migrationResult.skipped} already up-to-date`
  );
}
if (migrationResult.errors.length > 0) {
  console.error('Migration errors:', migrationResult.errors);
}

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ─── Route imports ──────────────────────────────────────────────────────────

// Authentication & user management
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const { requireAuth } = require('./middleware/requireAuth');

// Editorial workflow
const segmentEditorRoutes = require('./routes/segment-editor');
const localizationEditorRoutes = require('./routes/localization-editor');
const terminologyRoutes = require('./routes/terminology');
const suggestionsRoutes = require('./routes/suggestions');

// Administration & status
const statusRoutes = require('./routes/status');
const adminRoutes = require('./routes/admin');
const booksRoutes = require('./routes/books');
const sectionsRoutes = require('./routes/sections');
const myWorkRoutes = require('./routes/my-work');

// Pipeline (inject/render for apply-and-render flow)
const pipelineRoutes = require('./routes/pipeline');
const pipelineStatusRoutes = require('./routes/pipeline-status');
const publicationRoutes = require('./routes/publication');

// Support
const notificationsRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activity');
const feedbackRoutes = require('./routes/feedback');
const analyticsRoutes = require('./routes/analytics');

// HTML views
const viewRoutes = require('./routes/views');

// Load version from package.json
const serverVersion = require('./package.json').version;

// Configuration (use validated config)
const PORT = config.port;
const HOST = config.host;

// Initialize Express app
const app = express();

// Trust first proxy (nginx) — required for express-rate-limit and req.ip behind reverse proxy
app.set('trust proxy', 1);

// Security middleware - must come before other middleware
// Helmet sets various HTTP headers for security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    // Allow cross-origin requests for API
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Rate limiting - general limiter for all routes
// Authenticated users get a higher limit but are still rate-limited
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: (req) => {
    // Authenticated users get 5x the limit, but are still rate-limited
    if (req.cookies && req.cookies.auth_token) {
      return config.rateLimit.maxRequests * 5;
    }
    return config.rateLimit.maxRequests;
  },
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

// Static file serving for public assets (CSS, JS) — BEFORE rate limiter
// so static assets don't consume rate limit budget
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Cookie parser must run before rate limiter so skip() can check auth cookies
app.use(cookieParser());

// Apply general rate limiting to all routes (static assets already served above)
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ─── API Routes ─────────────────────────────────────────────────────────────

// Authentication
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/callback', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// Editorial workflow
app.use('/api/segment-editor', segmentEditorRoutes);
app.use('/api/localization-editor', localizationEditorRoutes);
app.use('/api/terminology', terminologyRoutes);
app.use('/api/suggestions', suggestionsRoutes);

// Administration & status
app.use('/api/status', statusRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/my-work', myWorkRoutes);

// Pipeline (inject/render, job tracking, publication)
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/pipeline-status', pipelineStatusRoutes);
app.use('/api/publication', publicationRoutes);

// Support
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activity', activityRoutes);
app.post('/api/feedback', publicSubmitLimiter);
app.post('/api/analytics/event', publicSubmitLimiter);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: serverVersion,
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Námsbókasafn Editorial API',
    version: serverVersion,
    status: 'ok',
    health: '/api/health',
    documentation: 'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni',
  });
});

// Static file serving for downloads (authenticated)
const downloadsPath = path.join(__dirname, '..', 'pipeline-output');
app.use('/downloads', requireAuth, express.static(downloadsPath));

// HTML Views (must be after API routes)
app.use('/', viewRoutes);

// 404 handler for API routes
app.use('/api/*path', (req, res) => {
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

  const statusCode = err.status || 500;
  // Only expose error details for client errors (4xx), never for server errors (5xx)
  const isClientError = statusCode >= 400 && statusCode < 500;
  res.status(statusCode).json({
    error: isClientError ? err.name || 'Error' : 'Internal Server Error',
    message: isClientError ? err.message || 'An error occurred' : 'An unexpected error occurred',
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('═'.repeat(55));
  console.log(`Námsbókasafn Editorial Server v${serverVersion}`);
  console.log('═'.repeat(55));
  console.log('');
  console.log(`  Server: http://${HOST}:${PORT}`);
  console.log(`  API:    http://${HOST}:${PORT}/api`);
  console.log('');
  console.log('Editorial Workflow:');
  console.log('  /editor           Segment editor (Pass 1)');
  console.log('  /localization     Localization editor (Pass 2)');
  console.log('  /terminology      Terminology manager');
  console.log('  /progress         Editorial progress dashboard');
  console.log('');
  console.log('Administration:');
  console.log('  /admin            User & book management');
  console.log('  /library          Book & chapter overview');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');

  // Refresh VALID_BOOKS from DB so newly registered books are accessible
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'pipeline-output', 'sessions.db');
    const db = new Database(dbPath, { readonly: true });
    refreshValidBooks(db);
    db.close();
    console.log(`Active books: ${VALID_BOOKS.join(', ')}`);
  } catch {
    // DB may not exist yet on first run — defaults are fine
  }
});

// Graceful shutdown — let in-flight requests complete before exiting
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log('All connections closed. Exiting.');
    process.exit(0);
  });
  // Force exit after 10 seconds if connections don't close
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
