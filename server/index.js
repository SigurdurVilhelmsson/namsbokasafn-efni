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

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// Import Phase 1 routes
const processRoutes = require('./routes/process');
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

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
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
app.use('/api/process', processRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/matecat', matecatRoutes);

// Phase 2 API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/images', imagesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    phase: 2
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
      'POST /api/process/cnxml': 'Process CNXML through pipeline',
      'POST /api/process/module/:moduleId': 'Process module by ID',
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
      'POST /api/images/:book/:chapter/:id/upload': 'Upload translated image'
    },
    documentation: 'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni'
  });
});

// Static file serving for downloads
const downloadsPath = path.join(__dirname, '..', 'pipeline-output');
app.use('/downloads', express.static(downloadsPath));

// HTML Views (must be after API routes)
app.use('/', viewRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: '/api'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'Uploaded file exceeds size limit (10MB)'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      error: 'Invalid Upload',
      message: 'Unexpected field in upload'
    });
  }

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
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
  console.log('Phase 1 Endpoints (Processing):');
  console.log('  POST /api/process/cnxml     Process CNXML file');
  console.log('  POST /api/process/module/:id Process by module ID');
  console.log('  GET  /api/status/:book      Get pipeline status');
  console.log('');
  console.log('Phase 2 Endpoints (Workflow):');
  console.log('  GET  /api/auth/login        GitHub OAuth login');
  console.log('  POST /api/workflow/start    Start workflow session');
  console.log('  GET  /api/issues            List pending issues');
  console.log('  POST /api/sync/create-pr    Create sync PR');
  console.log('  GET  /api/images/:book      Image tracking');
  console.log('');
  console.log('Web Interface:');
  console.log('  /workflow   Multi-step workflow wizard');
  console.log('  /issues     Issue review dashboard');
  console.log('  /images     Image translation tracker');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});

module.exports = app;
