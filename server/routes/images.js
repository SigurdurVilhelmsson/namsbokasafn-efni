/**
 * Images Routes
 *
 * Handles image tracking and upload for translation workflow.
 *
 * Book parameter: :book (Icelandic slug, e.g., 'efnafraedi')
 *
 * Endpoints:
 *   GET  /api/images/:book              Get book image overview
 *   GET  /api/images/:book/:chapter     Get chapter image details
 *   GET  /api/images/:book/:chapter/:id Get specific image status
 *   POST /api/images/:book/:chapter/:id/status  Update image status
 *   POST /api/images/:book/:chapter/:id/upload  Upload translated image
 *   POST /api/images/:book/:chapter/init        Initialize from CNXML
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { requireAuth } = require('../middleware/requireAuth');
const { requireContributor, requireEditor } = require('../middleware/requireRole');
const imageTracker = require('../services/imageTracker');
const { VALID_BOOKS } = require('../config');
const { fetchModule } = require('../../tools/openstax-fetch.cjs');

// Validate :book param on all routes that use it
router.param('book', (req, res, next, book) => {
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: 'Invalid book' });
  }
  next();
});

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { book, chapter } = req.params;

    // Validate book parameter before using in file path
    if (!VALID_BOOKS.includes(book)) {
      return cb(new Error(`Invalid book: ${book}`));
    }

    // Validate chapter is a positive integer
    const chapterNum = parseInt(chapter, 10);
    if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 99) {
      return cb(new Error(`Invalid chapter: ${chapter}`));
    }

    const chapterStr = String(chapterNum).padStart(2, '0');
    const uploadDir = path.join(
      __dirname,
      '..',
      '..',
      'pipeline-output',
      'images',
      book,
      `ch${chapterStr}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const { id } = req.params;
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 }, // 500KB limit per image
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and SVG images are allowed'));
    }
  },
});

/**
 * GET /api/images/:book
 * Get image overview for a book
 */
router.get('/:book', requireAuth, (req, res) => {
  const { book } = req.params;

  try {
    const stats = imageTracker.getBookImageStats(book);

    res.json({
      book,
      ...stats,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get book images',
      message: err.message,
    });
  }
});

/**
 * GET /api/images/:book/:chapter
 * Get image details for a chapter
 */
router.get('/:book/:chapter', requireAuth, (req, res) => {
  const { book, chapter } = req.params;
  const { status } = req.query;

  try {
    const data = imageTracker.loadImageData(book, parseInt(chapter));
    let images = Object.values(data.images);

    // Filter by status if provided
    if (status) {
      images = images.filter((i) => i.status === status);
    }

    // Add links
    images = images.map((img) => ({
      ...img,
      editLink: img.source?.sharepoint || img.source?.onedrive,
      downloadLink: `/api/images/${book}/${chapter}/${img.id}/download`,
    }));

    const stats = imageTracker.getChapterImageStats(book, parseInt(chapter));

    res.json({
      book,
      chapter: parseInt(chapter),
      stats,
      images,
      lastUpdated: data.lastUpdated,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get chapter images',
      message: err.message,
    });
  }
});

/**
 * GET /api/images/:book/:chapter/:id
 * Get specific image details
 */
router.get('/:book/:chapter/:id', requireAuth, (req, res) => {
  const { book, chapter, id } = req.params;

  try {
    const data = imageTracker.loadImageData(book, parseInt(chapter));
    const image = data.images[id];

    if (!image) {
      return res.status(404).json({
        error: 'Image not found',
      });
    }

    res.json({
      book,
      chapter: parseInt(chapter),
      image: {
        ...image,
        editLink: image.source?.sharepoint || image.source?.onedrive,
        downloadLink: `/api/images/${book}/${chapter}/${id}/download`,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get image',
      message: err.message,
    });
  }
});

/**
 * POST /api/images/:book/:chapter/:id/status
 * Update image status
 *
 * Body:
 *   - status: Image status (pending, in-progress, translated, approved, not-needed)
 *   - notes: Optional notes
 */
router.post('/:book/:chapter/:id/status', requireAuth, requireContributor(), (req, res) => {
  const { book, chapter, id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = Object.values(imageTracker.IMAGE_STATUS);
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid status',
      validStatuses,
    });
  }

  try {
    const updated = imageTracker.updateImageStatus(book, parseInt(chapter), id, status, {
      notes,
      updatedBy: req.user.username,
    });

    res.json({
      success: true,
      image: updated,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to update status',
      message: err.message,
    });
  }
});

/**
 * POST /api/images/:book/:chapter/:id/upload
 * Upload translated image
 */
router.post(
  '/:book/:chapter/:id/upload',
  requireAuth,
  requireContributor(),
  (req, res, next) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid image ID' });
    }
    next();
  },
  upload.single('image'),
  async (req, res) => {
    const { book, chapter, id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        error: 'No image uploaded',
      });
    }

    try {
      // Update tracking status
      const updated = imageTracker.updateImageStatus(book, parseInt(chapter), id, 'translated', {
        translatedPath: req.file.path,
        translatedBy: req.user.username,
        translatedAt: new Date().toISOString(),
        fileSize: req.file.size,
      });

      res.json({
        success: true,
        image: updated,
        file: {
          path: req.file.path,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (err) {
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        error: 'Failed to upload image',
        message: err.message,
      });
    }
  }
);

/**
 * GET /api/images/:book/:chapter/:id/download
 * Download translated image
 */
router.get('/:book/:chapter/:id/download', requireAuth, (req, res) => {
  const { book, chapter, id } = req.params;

  try {
    const data = imageTracker.loadImageData(book, parseInt(chapter));
    const image = data.images[id];

    if (!image || !image.translatedPath) {
      return res.status(404).json({
        error: 'Translated image not found',
      });
    }

    if (!fs.existsSync(image.translatedPath)) {
      return res.status(404).json({
        error: 'Image file not found',
      });
    }

    res.download(image.translatedPath, `${id}.png`);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to download image',
      message: err.message,
    });
  }
});

/**
 * POST /api/images/:book/:chapter/init
 * Initialize image tracking from CNXML source
 *
 * Body:
 *   - cnxmlContent: CNXML content to extract images from
 *   OR
 *   - moduleId: OpenStax module ID to fetch and extract from
 */
router.post('/:book/:chapter/init', requireAuth, requireEditor(), async (req, res) => {
  const { book, chapter } = req.params;
  const { cnxmlContent, moduleId } = req.body;

  if (!cnxmlContent && !moduleId) {
    return res.status(400).json({
      error: 'Provide either cnxmlContent or moduleId',
    });
  }

  try {
    let content = cnxmlContent;

    // Fetch CNXML if moduleId provided
    if (moduleId) {
      content = await fetchModule(moduleId);
    }

    const result = imageTracker.initializeFromCnxml(book, parseInt(chapter), content);

    res.json({
      success: true,
      ...result,
      stats: imageTracker.getChapterImageStats(book, parseInt(chapter)),
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to initialize image tracking',
      message: err.message,
    });
  }
});

/**
 * POST /api/images/:book/:chapter/:id/approve
 * Approve translated image (editor only)
 */
router.post('/:book/:chapter/:id/approve', requireAuth, requireEditor(), (req, res) => {
  const { book, chapter, id } = req.params;
  const { notes } = req.body;

  try {
    const data = imageTracker.loadImageData(book, parseInt(chapter));
    const image = data.images[id];

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (image.status !== 'translated') {
      return res.status(400).json({
        error: 'Image must be translated before approval',
        currentStatus: image.status,
      });
    }

    const updated = imageTracker.updateImageStatus(book, parseInt(chapter), id, 'approved', {
      approvedBy: req.user.username,
      approvedAt: new Date().toISOString(),
      approvalNotes: notes,
    });

    res.json({
      success: true,
      image: updated,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to approve image',
      message: err.message,
    });
  }
});

module.exports = router;
