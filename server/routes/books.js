/**
 * Books Routes
 *
 * Provides book and chapter metadata for the workflow UI.
 * Also handles downloading content for the MT workflow.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { requireAuth } = require('../middleware/requireAuth');

// Load book data
const dataDir = path.join(__dirname, '..', 'data');
const booksDir = path.join(__dirname, '..', '..', 'books');

function loadBookData(bookId) {
  const filePath = path.join(dataDir, `${bookId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

/**
 * GET /api/books
 * List available books
 */
router.get('/', (req, res) => {
  const books = [];

  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      books.push({
        id: data.book,
        title: data.title,
        titleIs: data.titleIs,
        chapterCount: data.chapters.length
      });
    }
  }

  res.json({ books });
});

/**
 * GET /api/books/:bookId
 * Get book details including chapters
 */
router.get('/:bookId', (req, res) => {
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
router.get('/:bookId/chapters/:chapter', (req, res) => {
  const { bookId, chapter } = req.params;
  const book = loadBookData(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const chapterData = book.chapters.find(c => c.chapter === parseInt(chapter, 10));

  if (!chapterData) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  res.json({
    book: book.book,
    bookTitle: book.titleIs || book.title,
    ...chapterData
  });
});

/**
 * GET /api/books/:slug/download
 * Download book content as ZIP
 *
 * Query params:
 *   - chapter: Optional chapter number (downloads single chapter if provided)
 *   - type: Content type to download
 *     - 'en-md': English markdown from 02-for-mt/ (default)
 *     - 'is-md': Icelandic markdown from 02-mt-output/
 *     - 'faithful': Reviewed IS markdown from 03-faithful/
 */
router.get('/:slug/download', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { chapter, type = 'en-md' } = req.query;

  // Determine source directory based on type
  const typeDirs = {
    'en-md': '02-for-mt',
    'is-md': '02-mt-output',
    'faithful': '03-faithful'
  };

  const sourceType = typeDirs[type];
  if (!sourceType) {
    return res.status(400).json({
      error: 'Invalid type',
      message: 'Type must be one of: en-md, is-md, faithful'
    });
  }

  const bookDir = path.join(booksDir, slug);
  const sourceDir = path.join(bookDir, sourceType);

  if (!fs.existsSync(sourceDir)) {
    return res.status(404).json({
      error: 'Not found',
      message: `Source directory not found: ${sourceType}`
    });
  }

  try {
    // Build ZIP filename
    let zipName;
    if (chapter) {
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      zipName = `${slug}-K${chapter}-${type}.zip`;

      // Check chapter directory exists
      const chapterPath = path.join(sourceDir, chapterDir);
      if (!fs.existsSync(chapterPath)) {
        return res.status(404).json({
          error: 'Not found',
          message: `Chapter ${chapter} not found`
        });
      }
    } else {
      zipName = `${slug}-${type}.zip`;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    if (chapter) {
      // Download single chapter
      const chapterDir = 'ch' + String(chapter).padStart(2, '0');
      const chapterPath = path.join(sourceDir, chapterDir);
      archive.directory(chapterPath, chapterDir);
    } else {
      // Download all chapters
      const entries = fs.readdirSync(sourceDir);
      for (const entry of entries) {
        const entryPath = path.join(sourceDir, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory() && entry.startsWith('ch')) {
          archive.directory(entryPath, entry);
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Download failed',
        message: err.message
      });
    }
  }
});

module.exports = router;
