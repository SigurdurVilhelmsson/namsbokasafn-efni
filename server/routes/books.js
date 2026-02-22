/**
 * Books Routes
 *
 * Provides book and chapter metadata for the workflow UI.
 * Also handles downloading content for the MT workflow.
 *
 * Book parameter: :bookId (Icelandic slug, e.g., 'efnafraedi')
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');

const { requireAuth } = require('../middleware/requireAuth');
const { requireEditor, requireAdmin } = require('../middleware/requireRole');
const chapterFilesService = require('../services/chapterFilesService');
const { VALID_BOOKS } = require('../config');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '..', '..', 'pipeline-output', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Only accept .md files
    if (file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only .md files are allowed'), false);
    }
  },
});

// Validate :bookId param on all routes that use it
router.param('bookId', (req, res, next, bookId) => {
  if (!VALID_BOOKS.includes(bookId)) {
    return res.status(400).json({ error: 'Invalid book' });
  }
  next();
});

// Load book data
const dataDir = path.join(__dirname, '..', 'data');
const booksDir = path.join(__dirname, '..', '..', 'books');

function loadBookData(bookId) {
  // Try direct filename match first
  const directPath = path.join(dataDir, `${bookId}.json`);
  if (fs.existsSync(directPath)) {
    return JSON.parse(fs.readFileSync(directPath, 'utf8'));
  }

  // Search by slug or book ID in file contents
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        if (data.slug === bookId || data.book === bookId) {
          return data;
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  return null;
}

/**
 * GET /api/books
 * List available books
 */
router.get('/', requireAuth, (req, res) => {
  const books = [];

  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        // Only include files that have book structure (book id and chapters array)
        if (data.book && Array.isArray(data.chapters)) {
          books.push({
            id: data.book,
            title: data.title,
            titleIs: data.titleIs,
            chapterCount: data.chapters.length,
          });
        }
      } catch (err) {
        // Skip files that can't be parsed or don't have expected structure
        console.warn(`Skipping ${file}: ${err.message}`);
      }
    }
  }

  res.json({ books });
});

/**
 * GET /api/books/:bookId
 * Get book details including chapters
 */
router.get('/:bookId', requireAuth, (req, res) => {
  const { bookId } = req.params;

  const book = loadBookData(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  res.json(book);
});

/**
 * GET /api/books/:bookId/chapters/:chapter
 * Get chapter details including all modules
 */
router.get('/:bookId/chapters/:chapter', requireAuth, (req, res) => {
  const { bookId, chapter } = req.params;

  const book = loadBookData(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const chapterData = book.chapters.find((c) => c.chapter === parseInt(chapter, 10));

  if (!chapterData) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  res.json({
    book: book.book,
    bookTitle: book.titleIs || book.title,
    ...chapterData,
  });
});

/**
 * GET /api/books/:bookId/chapters/:chapter/files
 * List generated files for a chapter
 */
router.get('/:bookId/chapters/:chapter/files', requireAuth, (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);

  try {
    // Get files from database
    const dbFiles = chapterFilesService.getChapterFiles(bookId, chapterNum);

    // Also get section-level files from disk
    const sectionFiles = chapterFilesService.getChapterSectionFiles(bookId, chapterNum);

    // Get generation history
    const history = chapterFilesService.getGenerationHistory(bookId, chapterNum, 5);

    res.json({
      bookId,
      chapter: chapterNum,
      hasRequiredFiles: chapterFilesService.hasRequiredFiles(bookId, chapterNum),
      files: dbFiles,
      sections: sectionFiles,
      recentHistory: history,
    });
  } catch (err) {
    console.error('Error listing chapter files:', err);
    res.status(500).json({
      error: 'Failed to list chapter files',
      message: err.message,
    });
  }
});

/**
 * POST /api/books/:bookId/chapters/:chapter/files/scan
 * Scan existing files on disk and register them in database
 */
router.post('/:bookId/chapters/:chapter/files/scan', requireAuth, requireEditor(), (req, res) => {
  const { bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  try {
    const result = chapterFilesService.scanAndRegisterExistingFiles(bookId, chapterNum, userId);

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      ...result,
    });
  } catch (err) {
    console.error('Error scanning chapter files:', err);
    res.status(500).json({
      error: 'Failed to scan chapter files',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/books/:bookId/chapters/:chapter/files
 * Clear generated files for regeneration
 */
router.delete('/:bookId/chapters/:chapter/files', requireAuth, requireAdmin(), (req, res) => {
  const { bookId, chapter } = req.params;
  const { deleteFromDisk } = req.query;
  const chapterNum = parseInt(chapter, 10);
  const userId = req.user?.username || 'system';

  try {
    // Mark files as superseded in database
    const dbCleared = chapterFilesService.clearChapterFiles(bookId, chapterNum, userId);

    let diskDeleted = 0;
    if (deleteFromDisk === 'true') {
      const diskResult = chapterFilesService.deleteChapterFilesFromDisk(bookId, chapterNum);
      diskDeleted = diskResult.deleted;
    }

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      filesCleared: dbCleared,
      filesDeletedFromDisk: diskDeleted,
    });
  } catch (err) {
    console.error('Error clearing chapter files:', err);
    res.status(500).json({
      error: 'Failed to clear chapter files',
      message: err.message,
    });
  }
});

/**
 * GET /api/books/:bookId/files/summary
 * Get summary of generated files for all chapters
 */
router.get('/:bookId/files/summary', requireAuth, (req, res) => {
  const { bookId } = req.params;

  try {
    const summary = chapterFilesService.getBookFilesSummary(bookId);

    res.json({
      bookId,
      chapters: summary,
    });
  } catch (err) {
    console.error('Error getting book files summary:', err);
    res.status(500).json({
      error: 'Failed to get files summary',
      message: err.message,
    });
  }
});

/**
 * GET /api/books/:bookId/download
 * Download book content as ZIP
 *
 * Query params:
 *   - chapter: Optional chapter number (downloads single chapter if provided)
 *   - type: Content type to download
 *     - 'en-md': English markdown from 02-for-mt/ (default)
 *     - 'is-md': Icelandic markdown from 02-mt-output/
 *     - 'faithful': Reviewed IS markdown from 03-faithful/
 */
router.get('/:bookId/download', requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const { chapter, type = 'en-md' } = req.query;

  // Determine source directory based on type
  const typeDirs = {
    'en-md': '02-for-mt',
    'is-md': '02-mt-output',
    faithful: '03-faithful-translation',
  };

  const sourceType = typeDirs[type];
  if (!sourceType) {
    return res.status(400).json({
      error: 'Invalid type',
      message: 'Type must be one of: en-md, is-md, faithful',
    });
  }

  const bookDir = path.join(booksDir, bookId);
  const sourceDir = path.join(bookDir, sourceType);

  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({
      error: 'Not found',
      message: `Source directory not found: ${sourceType}`,
    });
  }

  try {
    // Build ZIP filename
    let zipName;
    if (chapter) {
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      zipName = `${bookId}-K${chapter}-${type}.zip`;

      // Check chapter directory exists
      const chapterPath = path.join(sourceDir, chapterDir);
      if (!fs.existsSync(chapterPath)) {
        return res.status(404).json({
          error: 'Not found',
          message: `Chapter ${chapter} not found`,
        });
      }
    } else {
      zipName = `${bookId}-${type}.zip`;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Helper function to add .md files from a directory
    const addMdFilesFromDir = (dirPath, archivePath) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && file.endsWith('.md')) {
          archive.file(filePath, { name: path.join(archivePath, file) });
        }
      }
    };

    if (chapter) {
      // Download single chapter
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      const chapterPath = path.join(sourceDir, chapterDir);
      addMdFilesFromDir(chapterPath, chapterDir);
    } else {
      // Download all chapters
      const entries = fs.readdirSync(sourceDir);
      for (const entry of entries) {
        const entryPath = path.join(sourceDir, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory() && entry.startsWith('ch')) {
          addMdFilesFromDir(entryPath, entry);
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Download failed',
        message: err.message,
      });
    }
  }
});

/**
 * POST /api/books/:bookId/chapters/:chapter/import
 * Import markdown files for a chapter
 *
 * Accepts multiple .md files and stores them in 02-for-mt/ch{NN}/
 * Registers files in the database for tracking.
 */
router.post(
  '/:bookId/chapters/:chapter/import',
  requireAuth,
  requireEditor(),
  upload.array('files', 50),
  async (req, res) => {
    const { bookId, chapter } = req.params;
    const chapterNum = parseInt(chapter, 10);
    const userId = req.user?.username || 'system';

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'Please upload at least one .md file',
      });
    }

    const chapterDir = chapterFilesService.getChapterDir(bookId, chapterNum);

    // Ensure chapter directory exists
    if (!fs.existsSync(chapterDir)) {
      fs.mkdirSync(chapterDir, { recursive: true });
    }

    const imported = [];
    const errors = [];

    for (const file of req.files) {
      try {
        // Validate filename pattern (e.g., 1-1.en.md, intro.en.md)
        const filename = file.originalname;
        const validPattern = /^(\d+-\d+|intro)(\.en)?\.md$/;

        if (!validPattern.test(filename)) {
          errors.push({
            file: filename,
            error: 'Invalid filename format. Expected: {section}.en.md or {section}.md',
          });
          // Clean up temp file
          fs.unlinkSync(file.path);
          continue;
        }

        // Determine target filename (ensure .en.md extension)
        let targetName = filename;
        if (!filename.includes('.en.md')) {
          targetName = filename.replace('.md', '.en.md');
        }

        const targetPath = path.join(chapterDir, targetName);

        // Move file to chapter directory
        fs.renameSync(file.path, targetPath);

        // Determine file type
        const fileType = chapterFilesService.FILE_TYPES.EN_MD;

        imported.push({
          originalName: filename,
          storedAs: targetName,
          path: targetPath,
          type: fileType,
        });
      } catch (err) {
        errors.push({
          file: file.originalname,
          error: err.message,
        });
        // Clean up temp file if it exists
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // Register imported files in database
    if (imported.length > 0) {
      try {
        const filesToRegister = imported.map((f) => ({
          type: f.type,
          path: f.path,
          metadata: { importedFrom: f.originalName },
        }));

        chapterFilesService.registerFiles(bookId, chapterNum, filesToRegister, userId);
      } catch (dbErr) {
        console.error('Failed to register imported files:', dbErr);
        // Don't fail the request - files are already stored
      }
    }

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      imported: imported.length,
      errors: errors.length > 0 ? errors : undefined,
      files: imported.map((f) => ({
        original: f.originalName,
        stored: f.storedAs,
      })),
    });
  }
);

module.exports = router;
