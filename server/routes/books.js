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
const { requireEditor, requireAdmin, requireBookAccess } = require('../middleware/requireRole');
const chapterFilesService = require('../services/chapterFilesService');
const { advanceChapterStatus } = require('../services/pipelineService');
const { VALID_BOOKS, BOOK_LABELS } = require('../config');

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

/**
 * Find the first .md file in a directory (or its first subdirectory).
 * Used for spot-checking file content before download.
 */
function findFirstMdFile(dirPath, ext) {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath);
  // Check files in this directory first
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isFile() && entry.endsWith(ext)) return fullPath;
  }
  // Check first subdirectory
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      const sub = fs.readdirSync(fullPath);
      for (const f of sub) {
        const fPath = path.join(fullPath, f);
        if (fs.statSync(fPath).isFile() && f.endsWith(ext)) return fPath;
      }
    }
  }
  return null;
}

// Validate :bookId param on all routes that use it
router.param('bookId', (req, res, next, bookId) => {
  if (!VALID_BOOKS.includes(bookId)) {
    return res.status(400).json({ error: 'Ógild bók' });
  }
  next();
});

/**
 * GET /api/books/list
 * Lightweight endpoint returning registered book slugs + labels for dropdown population.
 * No auth required — book names are not sensitive and this is used on public pages (e.g., feedback).
 */
router.get('/list', (req, res) => {
  res.json({
    books: VALID_BOOKS.map((slug) => ({ slug, label: BOOK_LABELS[slug] || slug })),
  });
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
    return res.status(404).json({ error: 'Bók fannst ekki' });
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
    return res.status(404).json({ error: 'Bók fannst ekki' });
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
 *     - 'faithful': Reviewed IS markdown from 03-faithful-translation/
 *     - 'pub-mt-preview': Published HTML from 05-publication/mt-preview/chapters/
 *     - 'pub-faithful': Published HTML from 05-publication/faithful/chapters/
 *     - 'pub-localized': Published HTML from 05-publication/localized/chapters/
 */
router.get('/:bookId/download', requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const { chapter, type = 'en-md' } = req.query;

  // Type configuration: directory, file extension, chapter dir format
  const typeConfig = {
    'en-md': { dir: '02-for-mt', ext: '.md', chPrefix: 'ch' },
    'is-md': { dir: '02-mt-output', ext: '.md', chPrefix: 'ch' },
    faithful: { dir: '03-faithful-translation', ext: '.md', chPrefix: 'ch' },
    'pub-mt-preview': { dir: '05-publication/mt-preview/chapters', ext: '.html', chPrefix: '' },
    'pub-faithful': { dir: '05-publication/faithful/chapters', ext: '.html', chPrefix: '' },
    'pub-localized': { dir: '05-publication/localized/chapters', ext: '.html', chPrefix: '' },
  };

  const config = typeConfig[type];
  if (!config) {
    return res.status(400).json({
      error: 'Invalid type',
      message: `Type must be one of: ${Object.keys(typeConfig).join(', ')}`,
    });
  }

  const bookDir = path.join(booksDir, bookId);
  const sourceDir = path.join(bookDir, config.dir);

  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({
      error: 'Not found',
      message: `Source directory not found: ${config.dir}`,
    });
  }

  try {
    // Chapter directory name: "ch01" for markdown types, "01" for publication types
    const paddedChapter = chapter ? String(chapter).padStart(2, '0') : null;
    const chapterDirName = paddedChapter ? `${config.chPrefix}${paddedChapter}` : null;

    // Build ZIP filename
    let zipName;
    if (chapter) {
      zipName = `${bookId}-K${chapter}-${type}.zip`;

      // Check chapter directory exists
      const chapterPath = path.join(sourceDir, chapterDirName);
      if (!fs.existsSync(chapterPath)) {
        return res.status(404).json({
          error: 'Not found',
          message: `Chapter ${chapter} not found`,
        });
      }
    } else {
      zipName = `${bookId}-${type}.zip`;
    }

    // For EN markdown downloads, verify files are protected for MT
    if (type === 'en-md') {
      const checkDir = chapter
        ? path.join(sourceDir, chapterDirName)
        : sourceDir;
      const sampleFile = findFirstMdFile(checkDir, config.ext);
      if (sampleFile) {
        const sample = fs.readFileSync(sampleFile, 'utf-8').slice(0, 2000);
        const hasUnprotected = /<!--\s*SEG:/.test(sample);
        const hasProtected = /\{\{SEG:/.test(sample);
        if (hasUnprotected && !hasProtected) {
          return res.status(409).json({
            error: 'Skrár eru ekki verndaðar',
            message: 'EN-skrár eru ekki verndaðar fyrir vélþýðingu. Keyrðu "Vernda" skrefið aftur.',
          });
        }
      }
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Helper function to add files matching the expected extension from a directory
    const addFilesFromDir = (dirPath, archivePath) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && file.endsWith(config.ext)) {
          archive.file(filePath, { name: path.join(archivePath, file) });
        }
      }
    };

    if (chapter) {
      // Download single chapter
      const chapterPath = path.join(sourceDir, chapterDirName);
      addFilesFromDir(chapterPath, chapterDirName);
    } else {
      // Download all chapters
      const entries = fs.readdirSync(sourceDir);
      for (const entry of entries) {
        const entryPath = path.join(sourceDir, entry);
        const stat = fs.statSync(entryPath);
        // Match both ch-prefixed dirs (ch01) and bare number dirs (01)
        if (stat.isDirectory() && (entry.startsWith('ch') || /^\d{2}$/.test(entry))) {
          addFilesFromDir(entryPath, entry);
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
 * GET /api/books/:bookId/chapters/:chapter/faithful-count
 * Count faithful translation files for a chapter.
 * Used by the client to show enhanced warnings before MT upload.
 */
router.get(
  '/:bookId/chapters/:chapter/faithful-count',
  requireAuth,
  requireBookAccess(),
  (req, res) => {
    const { bookId, chapter } = req.params;
    const chapterNum = parseInt(chapter, 10);
    if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 99) {
      return res.status(400).json({ error: 'Ógilt kaflanúmer' });
    }
    const paddedChapter = String(chapterNum).padStart(2, '0');
    const faithfulDir = path.join(
      booksDir,
      bookId,
      '03-faithful-translation',
      `ch${paddedChapter}`
    );

    let count = 0;
    const modules = [];
    if (fs.existsSync(faithfulDir)) {
      for (const f of fs.readdirSync(faithfulDir)) {
        if (f.endsWith('-segments.is.md')) {
          modules.push(f.replace('-segments.is.md', ''));
          count++;
        }
      }
    }

    res.json({ count, modules });
  }
);

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

/**
 * POST /api/books/:bookId/chapters/:chapter/import-mt
 * Import MT output files for a chapter
 *
 * Accepts multiple .md files and stores them in 02-mt-output/ch{NN}/
 * These are the Icelandic segments returned from the machine translation service.
 */
router.post(
  '/:bookId/chapters/:chapter/import-mt',
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

    const paddedChapter = String(chapterNum).padStart(2, '0');
    const targetDir = path.join(booksDir, bookId, '02-mt-output', `ch${paddedChapter}`);

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const imported = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const filename = file.originalname;
        // Accept IS segment files: m{NNNNN}-segments.is.md or {section}.is.md
        const validPattern = /^(m\d{5}-segments|[\w-]+)\.is\.md$/;

        if (!validPattern.test(filename)) {
          errors.push({
            file: filename,
            error: 'Invalid filename format. Expected: {moduleId}-segments.is.md or {name}.is.md',
          });
          fs.unlinkSync(file.path);
          continue;
        }

        const targetPath = path.join(targetDir, filename);

        // Move file to MT output directory
        fs.renameSync(file.path, targetPath);

        // Check for segment markers
        const content = fs.readFileSync(targetPath, 'utf-8');
        const hasMarkers = /(?:<!--\s*SEG:|\{\{SEG:)/.test(content);

        imported.push({
          originalName: filename,
          storedAs: filename,
          path: targetPath,
          hasMarkers,
        });
      } catch (err) {
        errors.push({
          file: file.originalname,
          error: err.message,
        });
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // Register imported files in database (best-effort)
    if (imported.length > 0) {
      try {
        const filesToRegister = imported.map((f) => ({
          type: 'mt-output',
          path: f.path,
          metadata: { importedFrom: f.originalName },
        }));

        chapterFilesService.registerFiles(bookId, chapterNum, filesToRegister, userId);
      } catch (dbErr) {
        console.error('Failed to register MT output files:', dbErr);
      }

      // Advance pipeline status — MT output is now available
      advanceChapterStatus(bookId, chapterNum, 'mtOutput');
    }

    const noMarkerCount = imported.filter((f) => !f.hasMarkers).length;

    res.json({
      success: true,
      bookId,
      chapter: chapterNum,
      imported: imported.length,
      errors: errors.length > 0 ? errors : undefined,
      markerWarning:
        noMarkerCount > 0
          ? {
              count: noMarkerCount,
              total: imported.length,
              message:
                'Hlutamerki vantar í ' +
                noMarkerCount +
                ' af ' +
                imported.length +
                ' skrám — þýðingar munu ekki birtast í ritstjóranum.',
            }
          : undefined,
      files: imported.map((f) => ({
        original: f.originalName,
        stored: f.storedAs,
      })),
    });
  }
);

module.exports = router;
