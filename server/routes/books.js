/**
 * Books Routes
 *
 * Provides book and chapter metadata for the workflow UI.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load book data
const dataDir = path.join(__dirname, '..', 'data');

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

module.exports = router;
