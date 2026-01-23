/**
 * Process Routes
 *
 * Handles CNXML processing through the translation pipeline.
 *
 * Endpoints:
 *   POST /api/process/cnxml           Process uploaded CNXML file
 *   POST /api/process/module/:id      Process module by OpenStax ID
 *   GET  /api/process/jobs/:jobId     Get job status (for async processing)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// Import pipeline runner (ES module - use dynamic import)
let pipelineRunner = null;
const getPipelineRunner = async () => {
  if (!pipelineRunner) {
    pipelineRunner = await import('../../tools/pipeline-runner.js');
  }
  return pipelineRunner;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', 'pipeline-output', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.cnxml' || ext === '.xml') {
      cb(null, true);
    } else {
      cb(new Error('Only .cnxml and .xml files are allowed'));
    }
  }
});

// Job storage (in-memory for Phase 1, could be Redis/DB later)
const jobs = new Map();

/**
 * POST /api/process/cnxml
 * Process uploaded CNXML file
 *
 * Body (multipart/form-data):
 *   - file: CNXML file
 *   - skipXliff: boolean (optional)
 *   - book: string (optional, for status tracking)
 */
router.post('/cnxml', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please upload a CNXML file'
    });
  }

  const jobId = uuidv4();
  const outputDir = path.join(__dirname, '..', '..', 'pipeline-output', jobId);

  try {
    // Create job record
    jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      input: req.file.originalname,
      startedAt: new Date().toISOString(),
      outputDir
    });

    // Run pipeline
    const runner = await getPipelineRunner();
    const results = await runner.run({
      input: req.file.path,
      outputDir,
      skipXliff: req.body.skipXliff === 'true',
      book: req.body.book || null,
      verbose: false
    });

    if (!results.success) {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: 'failed',
        error: results.error,
        completedAt: new Date().toISOString()
      });

      return res.status(500).json({
        error: 'Pipeline failed',
        message: results.error,
        jobId
      });
    }

    // Create ZIP archive
    const zipPath = path.join(outputDir, 'output.zip');
    await createZipArchive(results.outputs, zipPath);

    // Update job record
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'completed',
      outputs: results.outputs,
      zipPath,
      downloadUrl: `/downloads/${jobId}/output.zip`,
      completedAt: new Date().toISOString()
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      jobId,
      outputs: results.outputs.map(o => ({
        type: o.type,
        filename: path.basename(o.path),
        description: o.description
      })),
      downloadUrl: `/downloads/${jobId}/output.zip`,
      individualFiles: results.outputs.map(o => ({
        type: o.type,
        url: `/downloads/${jobId}/${path.basename(o.path)}`
      }))
    });

  } catch (err) {
    console.error('Process error:', err);

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString()
    });

    // Clean up
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Processing failed',
      message: err.message,
      jobId
    });
  }
});

/**
 * POST /api/process/module/:moduleId
 * Process OpenStax module by ID
 *
 * URL params:
 *   - moduleId: OpenStax module ID (e.g., m68690)
 *
 * Body (JSON):
 *   - skipXliff: boolean (optional)
 *   - book: string (optional)
 */
router.post('/module/:moduleId', async (req, res) => {
  const { moduleId } = req.params;

  // Validate module ID format
  if (!/^m\d+$/.test(moduleId)) {
    return res.status(400).json({
      error: 'Invalid module ID',
      message: 'Module ID should be in format mXXXXX (e.g., m68690)'
    });
  }

  const jobId = uuidv4();
  const outputDir = path.join(__dirname, '..', '..', 'pipeline-output', jobId);

  try {
    // Create job record
    jobs.set(jobId, {
      id: jobId,
      status: 'processing',
      input: moduleId,
      inputType: 'moduleId',
      startedAt: new Date().toISOString(),
      outputDir
    });

    // Run pipeline
    const runner = await getPipelineRunner();
    const results = await runner.run({
      input: moduleId,
      outputDir,
      skipXliff: req.body.skipXliff === true,
      book: req.body.book || null,
      verbose: false
    });

    if (!results.success) {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: 'failed',
        error: results.error,
        completedAt: new Date().toISOString()
      });

      return res.status(500).json({
        error: 'Pipeline failed',
        message: results.error,
        jobId
      });
    }

    // Create ZIP archive
    const zipPath = path.join(outputDir, 'output.zip');
    await createZipArchive(results.outputs, zipPath);

    // Update job record
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'completed',
      outputs: results.outputs,
      zipPath,
      downloadUrl: `/downloads/${jobId}/output.zip`,
      completedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      jobId,
      moduleId,
      outputs: results.outputs.map(o => ({
        type: o.type,
        filename: path.basename(o.path),
        description: o.description
      })),
      downloadUrl: `/downloads/${jobId}/output.zip`,
      individualFiles: results.outputs.map(o => ({
        type: o.type,
        url: `/downloads/${jobId}/${path.basename(o.path)}`
      }))
    });

  } catch (err) {
    console.error('Process error:', err);

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Processing failed',
      message: err.message,
      jobId
    });
  }
});

/**
 * GET /api/process/jobs/:jobId
 * Get job status
 */
router.get('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      message: `No job with ID ${jobId}`
    });
  }

  res.json(job);
});

/**
 * GET /api/process/jobs
 * List recent jobs
 */
router.get('/jobs', (req, res) => {
  const jobList = Array.from(jobs.values())
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .slice(0, 20); // Last 20 jobs

  res.json({
    jobs: jobList,
    total: jobs.size
  });
});

/**
 * Create ZIP archive from output files
 */
function createZipArchive(outputs, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);

    for (const { path: filePath, type } of outputs) {
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
    }

    archive.finalize();
  });
}

// Simple UUID generator (avoid extra dependency)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = router;
