#!/usr/bin/env node

/**
 * Translation Pipeline API Server
 *
 * Provides REST endpoints for:
 * - Processing CNXML files through the translation pipeline
 * - Fetching OpenStax modules
 * - Checking pipeline status
 *
 * Usage:
 *   npm start                    # Start on default port (3000)
 *   PORT=8080 npm start          # Start on custom port
 *   npm run dev                  # Start with watch mode (Node 18+)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const processRoutes = require('./routes/process');
const modulesRoutes = require('./routes/modules');
const statusRoutes = require('./routes/status');
const matecatRoutes = require('./routes/matecat');

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/process', processRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/matecat', matecatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Translation Pipeline API',
    version: '1.0.0',
    endpoints: {
      'GET /api/health': 'Health check',
      'GET /api/modules': 'List available OpenStax modules',
      'GET /api/modules/:moduleId': 'Get module details',
      'POST /api/process/cnxml': 'Process CNXML through pipeline',
      'POST /api/process/module/:moduleId': 'Process module by ID',
      'GET /api/status/:book': 'Get pipeline status for book',
      'GET /api/status/:book/:chapter': 'Get status for specific chapter',
      'GET /api/matecat': 'Matecat integration documentation',
      'POST /api/matecat/projects': 'Create Matecat translation project',
      'GET /api/matecat/projects/:id/status': 'Get project analysis status',
      'GET /api/matecat/jobs/:id/stats': 'Get job translation progress',
      'GET /api/matecat/jobs/:id/download': 'Download translated file'
    },
    documentation: 'https://github.com/SigurdurVilhelmsson/namsbokasafn-efni'
  });
});

// Static file serving for downloads
const downloadsPath = path.join(__dirname, '..', 'pipeline-output');
app.use('/downloads', express.static(downloadsPath));

// 404 handler
app.use((req, res) => {
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
  console.log('═'.repeat(50));
  console.log('Translation Pipeline API Server');
  console.log('═'.repeat(50));
  console.log('');
  console.log(`  Server running at http://${HOST}:${PORT}`);
  console.log(`  API documentation: http://${HOST}:${PORT}/api`);
  console.log(`  Health check: http://${HOST}:${PORT}/api/health`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /api/modules           List available modules');
  console.log('  GET  /api/modules/:id       Get module details');
  console.log('  POST /api/process/cnxml     Process CNXML file');
  console.log('  POST /api/process/module/:id Process module by ID');
  console.log('  GET  /api/status/:book      Get book pipeline status');
  console.log('');
  console.log('Matecat Integration:');
  console.log('  GET  /api/matecat           Matecat API documentation');
  console.log('  POST /api/matecat/projects  Create translation project');
  console.log('  GET  /api/matecat/projects/:id/status  Project status');
  console.log('  GET  /api/matecat/jobs/:id/stats       Job progress');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});

module.exports = app;
