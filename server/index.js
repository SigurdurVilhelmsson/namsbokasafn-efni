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

const log = require('./lib/logger');

// Validate configuration before proceeding
const { validateSecrets, config, refreshValidBooks, VALID_BOOKS } = require('./config');
validateSecrets();

// Auto-run pending database migrations before starting the server
const { runAllMigrations, failLoudOnMigrationErrors } = require('./services/migrationRunner');
const migrationResult = runAllMigrations();
if (migrationResult.applied > 0) {
  log.info(
    { applied: migrationResult.applied, skipped: migrationResult.skipped },
    'Migrations applied'
  );
}
// Fail loud: refuse to serve on a broken schema. Migrations are idempotent
// (re-run asserted clean in CI), so any error here is real.
failLoudOnMigrationErrors(migrationResult, {
  onError: (errors) => log.error({ errors }, 'Migration errors — refusing to start'),
});

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
const { createRequestTimer, DEFAULT_SLOW_REQUEST_MS } = require('./middleware/requestTiming');

// Editorial workflow
const segmentEditorRoutes = require('./routes/segment-editor');
const localizationEditorRoutes = require('./routes/localization-editor');
const terminologyRoutes = require('./routes/terminology');
const suggestionsRoutes = require('./routes/suggestions');

// Administration & status
const statusRoutes = require('./routes/status');
const adminRoutes = require('./routes/admin');
const booksRoutes = require('./routes/books');
const tmRoutes = require('./routes/tm');
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

// Request-duration logging (register C23) — mounted HERE, directly after
// static, on purpose. Everything below it is inside the measured window:
// cookie parsing, the rate limiter, CORS and body parsing, so the number
// logged is close to what nginx measures rather than route time alone. A
// rate-limited 429, which the old inline logger sat behind and so never
// recorded, is now visible too. Static assets terminate above and are still
// not logged, which keeps STATIC-ASSET volume where it was — but total volume
// is strictly higher than before, by exactly the requests that used to be
// rejected upstream of the old logger (429s, CORS rejections, failed body
// parses). That is the point: those are the ones that vanished silently.
app.use(
  createRequestTimer({
    logger: log,
    // The default lives in the middleware, next to the comment explaining why
    // it is what it is. Repeating the literal here would let the two drift.
    thresholdMs: Number(process.env.SLOW_REQUEST_MS) || DEFAULT_SLOW_REQUEST_MS,
  })
);

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
        log.warn({ origin }, 'CORS blocked origin');
        callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
app.use('/api/tm', tmRoutes);
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

// Health check — verifies DB, migrations, books, auth configuration
app.get('/api/health', (req, res) => {
  const checks = {};

  // Check DB connection
  try {
    const Database = require('better-sqlite3');
    const dbPath = require('./lib/dbPath')();
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as n FROM users').get();
    checks.db = { ok: true, users: row.n };
    db.close();
  } catch (err) {
    checks.db = { ok: false, error: err.message };
  }

  // Check migrations
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const fs = require('fs');
    const onDisk = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js')).length;
    checks.migrations = { ok: true, total: onDisk };
  } catch (err) {
    checks.migrations = { ok: false, error: err.message };
  }

  // Check books loaded
  checks.books = { ok: VALID_BOOKS.length > 0, count: VALID_BOOKS.length, list: VALID_BOOKS };

  // Check auth configured
  checks.auth = { ok: !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 };

  // Check off-box backup heartbeat (Track A, Task A3) — surfaces a
  // silently-stopped backup-db.sh cron instead of it being discovered in a
  // disaster. Missing heartbeat => stale (handled by the helper).
  try {
    const {
      computeOffboxBackupHealth,
      DEFAULT_STALE_HOURS: OFFBOX_DEFAULT_STALE_HOURS,
    } = require('./lib/offboxBackupHealth');
    const fs = require('fs');
    let hbMtime = null;
    try {
      const hb = path.join(__dirname, '..', 'pipeline-output', 'backups', '.last-offbox-backup');
      hbMtime = fs.statSync(hb).mtimeMs;
    } catch {
      /* missing heartbeat => stale, handled by the helper */
    }
    const offbox = computeOffboxBackupHealth({
      heartbeatMtimeMs: hbMtime,
      nowMs: Date.now(),
      staleHours: Number(process.env.OFFBOX_BACKUP_STALE_HOURS) || OFFBOX_DEFAULT_STALE_HOURS,
    });
    // Spread {age_hours, stale} and add `ok` so this check gates `allOk` the
    // same way every other check here does — a stale/missing heartbeat must
    // flip overall status to "degraded", not just report a silent field.
    checks.offbox_backup = { ...offbox, ok: !offbox.stale };
  } catch (err) {
    checks.offbox_backup = { ok: false, error: err.message };
  }

  // Check content-backup heartbeat (register C11(b)). scripts/git-backup.sh
  // is the ONLY route by which reviewed translations reach GitHub, and its
  // failures were previously invisible: it wrote `error` into a gitignored
  // backup-status.json that nothing read, with no MAILTO on the cron. The
  // heartbeat is written only on healthy runs, so staleness is the alarm.
  try {
    const { readContentBackupHealth, DEFAULT_STALE_HOURS } = require('./lib/contentBackupHealth');
    checks.content_backup = readContentBackupHealth({
      projectRoot: path.join(__dirname, '..'),
      nowMs: Date.now(),
      // The default lives in the lib, next to the comment explaining why it
      // is 6 (two missed 2 h cycles + margin). Repeating the literal here
      // would let the two drift apart silently.
      staleHours: Number(process.env.CONTENT_BACKUP_STALE_HOURS) || DEFAULT_STALE_HOURS,
    });
  } catch (err) {
    checks.content_backup = { ok: false, error: err.message };
  }

  // Check whether migration 047's every-boot enforcement OVERWROTE live
  // book_domain_priority rows (§C119). The enforcement is correct; what was
  // missing is that it ran blind, so a hand-made trim vanished 102 seconds
  // later on a deploy's restart with no error, no log line and no gate, and
  // was found days afterwards from a glossary that had silently doubled.
  // This is deliberately surfaced HERE rather than left in the boot log:
  // ./scripts/deploy.sh prints every not-ok check, and the deploy is where the
  // operator is actually standing when the revert happens.
  try {
    const { readDomainPriorityHealth } = require('./lib/domainPriorityHealth');
    checks.domain_priority = readDomainPriorityHealth({
      projectRoot: path.join(__dirname, '..'),
    });
  } catch (err) {
    checks.domain_priority = { ok: false, error: err.message };
  }

  // Check glossary-export heartbeat (register C14). The export is meant to run
  // from scripts/git-backup.sh in a contained way — a failure must not abort
  // the content backup — so this is the only place a persistently failing
  // export becomes visible. ./scripts/deploy.sh prints every not-ok check.
  try {
    const {
      readGlossaryExportHealth,
      DEFAULT_STALE_HOURS,
      DEFAULT_REFUSAL_STALE_DAYS,
    } = require('./lib/glossaryExportHealth');
    checks.glossary_export = readGlossaryExportHealth({
      projectRoot: path.join(__dirname, '..'),
      nowMs: Date.now(),
      staleHours: Number(process.env.GLOSSARY_EXPORT_STALE_HOURS) || DEFAULT_STALE_HOURS,
      // A book that has been REFUSING this long is no longer a guard doing its
      // job, it is unattended work (decision D6). The refusal itself does not
      // flip `ok` — only its age does. Defaults live in the lib, beside the
      // comments explaining the numbers; repeating a literal here would let
      // the two drift apart silently.
      refusalStaleDays:
        Number(process.env.GLOSSARY_REFUSAL_STALE_DAYS) || DEFAULT_REFUSAL_STALE_DAYS,
    });
  } catch (err) {
    checks.glossary_export = { ok: false, error: err.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  res.json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: serverVersion,
    checks,
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
  log.error({ err, method: req.method, path: req.path }, 'Unhandled request error');

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
  log.info({ host: HOST, port: PORT }, 'Server started');
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
    const dbPath = require('./lib/dbPath')();
    const db = new Database(dbPath, { readonly: true });
    refreshValidBooks(db);
    db.close();
    log.info({ books: VALID_BOOKS }, 'Active books loaded');
  } catch {
    // DB may not exist yet on first run — defaults are fine
  }

  // Start the daily reviewer-queue digest scheduler (no-op under test).
  try {
    require('./services/teamDigestService').startScheduler();
  } catch (err) {
    log.error({ err }, 'Failed to start review-digest scheduler');
  }
});

// Graceful shutdown — let in-flight requests complete before exiting
function gracefulShutdown(signal) {
  log.info({ signal }, 'Shutting down gracefully');
  server.close(() => {
    log.info('All connections closed, exiting');
    process.exit(0);
  });
  // Force exit after 10 seconds if connections don't close
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
