/**
 * Modules Routes
 *
 * Provides information about available OpenStax modules.
 *
 * Endpoints:
 *   GET /api/modules                 List all known modules
 *   GET /api/modules/:moduleId       Get specific module details
 *   GET /api/modules/book/:bookId    List modules for a book
 *   GET /api/modules/chapter/:ch     List modules for a chapter
 */

const express = require('express');
const router = express.Router();

// Import module data from tools
const { CHEMISTRY_MODULES, BOOKS, getModulesForBook } = require('../../tools/openstax-fetch.cjs');

/**
 * GET /api/modules
 * List all known modules
 *
 * Query params:
 *   - book: Filter by book (default: chemistry-2e)
 *   - chapter: Filter by chapter number
 *   - format: 'full' or 'simple' (default: simple)
 */
router.get('/', (req, res) => {
  const book = req.query.book || 'chemistry-2e';
  const chapter = req.query.chapter ? parseInt(req.query.chapter, 10) : null;
  const format = req.query.format || 'simple';

  try {
    const modules = getModulesForBook(book, chapter);

    if (modules.length === 0 && book !== 'chemistry-2e') {
      return res.json({
        message: `No hardcoded modules for book: ${book}. Module data only available for chemistry-2e.`,
        availableBooks: Object.keys(BOOKS),
        modules: [],
      });
    }

    if (format === 'full') {
      res.json({
        book,
        bookTitle: BOOKS[book]?.title || book,
        chapter: chapter || 'all',
        totalModules: modules.length,
        modules: modules.map((m) => ({
          id: m.id,
          chapter: m.chapter,
          section: m.section,
          title: m.title,
          urls: {
            cnxml: `https://raw.githubusercontent.com/openstax/${BOOKS[book]?.repo || 'osbooks-chemistry-bundle'}/main/modules/${m.id}/index.cnxml`,
            process: `/api/process/module/${m.id}`,
          },
        })),
      });
    } else {
      res.json({
        book,
        modules: modules.map((m) => ({
          id: m.id,
          section: m.section,
          title: m.title,
        })),
      });
    }
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get modules',
      message: err.message,
    });
  }
});

/**
 * GET /api/modules/books
 * List available books
 */
router.get('/books', (req, res) => {
  const books = Object.entries(BOOKS).map(([id, info]) => ({
    id,
    title: info.title,
    repo: info.repo,
    hasModuleData: id === 'chemistry-2e',
  }));

  res.json({
    books,
    note: 'Module metadata is currently only available for chemistry-2e. Other books require fetching collection.xml.',
  });
});

/**
 * GET /api/modules/book/:bookId
 * List modules for a specific book
 */
router.get('/book/:bookId', (req, res) => {
  const { bookId } = req.params;
  const chapter = req.query.chapter ? parseInt(req.query.chapter, 10) : null;

  if (!BOOKS[bookId]) {
    return res.status(404).json({
      error: 'Book not found',
      message: `Unknown book: ${bookId}`,
      availableBooks: Object.keys(BOOKS),
    });
  }

  const modules = getModulesForBook(bookId, chapter);

  res.json({
    book: bookId,
    bookTitle: BOOKS[bookId].title,
    chapter: chapter || 'all',
    totalModules: modules.length,
    modules,
  });
});

/**
 * GET /api/modules/chapter/:chapter
 * List modules for a specific chapter (chemistry-2e only)
 */
router.get('/chapter/:chapter', (req, res) => {
  const chapter = parseInt(req.params.chapter, 10);

  if (isNaN(chapter) || chapter < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number',
    });
  }

  const modules = getModulesForBook('chemistry-2e', chapter);

  if (modules.length === 0) {
    return res.status(404).json({
      error: 'No modules found',
      message: `No modules found for chapter ${chapter}. Chemistry 2e chapters 1-4 are available.`,
    });
  }

  res.json({
    book: 'chemistry-2e',
    chapter,
    totalModules: modules.length,
    modules,
  });
});

/**
 * GET /api/modules/:moduleId
 * Get details for a specific module
 */
router.get('/:moduleId', (req, res) => {
  const { moduleId } = req.params;

  // Validate module ID format
  if (!/^m\d+$/.test(moduleId)) {
    return res.status(400).json({
      error: 'Invalid module ID',
      message: 'Module ID should be in format mXXXXX (e.g., m68690)',
    });
  }

  // Look up module in chemistry modules
  const moduleInfo = CHEMISTRY_MODULES[moduleId];

  if (!moduleInfo) {
    return res.status(404).json({
      error: 'Module not found',
      message: `Module ${moduleId} not found in known modules. It may exist but not be in our database.`,
      hint: 'Use POST /api/process/module/:id to process any valid OpenStax module ID.',
    });
  }

  res.json({
    id: moduleId,
    book: 'chemistry-2e',
    chapter: moduleInfo.chapter,
    section: moduleInfo.section,
    title: moduleInfo.title,
    urls: {
      cnxml: `https://raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/main/modules/${moduleId}/index.cnxml`,
      github: `https://github.com/openstax/osbooks-chemistry-bundle/tree/main/modules/${moduleId}`,
      openstax: `https://openstax.org/books/chemistry-2e/pages/${moduleInfo.section.replace('.', '-')}`,
    },
    actions: {
      process: {
        method: 'POST',
        url: `/api/process/module/${moduleId}`,
        description: 'Process this module through the translation pipeline',
      },
    },
  });
});

module.exports = router;
