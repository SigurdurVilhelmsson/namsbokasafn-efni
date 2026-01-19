/**
 * Admin Routes
 *
 * Handles administrative operations:
 * - OpenStax catalogue management
 * - Book registration
 * - User management (future)
 *
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin, requireRole, ROLES } = require('../middleware/requireRole');
const openstaxCatalogue = require('../services/openstaxCatalogue');
const bookRegistration = require('../services/bookRegistration');

// ============================================================================
// CATALOGUE MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/catalogue
 * List all books in the OpenStax catalogue
 *
 * Includes registration status for each book.
 */
router.get('/catalogue', requireAuth, requireAdmin(), (req, res) => {
  try {
    const books = openstaxCatalogue.listCatalogue();

    res.json({
      books,
      total: books.length,
      registered: books.filter(b => b.registered).length
    });
  } catch (err) {
    console.error('List catalogue error:', err);

    // Handle missing tables gracefully
    if (err.message.includes('not found')) {
      return res.status(503).json({
        error: 'Database not ready',
        message: 'Run migration 003-book-catalogue first',
        suggestion: 'node server/migrations/003-book-catalogue.js'
      });
    }

    res.status(500).json({
      error: 'Failed to list catalogue',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/catalogue/predefined
 * Get list of predefined books (no database required)
 *
 * Useful for initial setup before database is ready.
 */
router.get('/catalogue/predefined', requireAuth, requireAdmin(), (req, res) => {
  const books = openstaxCatalogue.getPredefinedBooks();

  res.json({
    books,
    total: books.length,
    note: 'These are predefined books available for sync'
  });
});

/**
 * POST /api/admin/catalogue/sync
 * Sync the catalogue with predefined books
 *
 * Adds any missing books and updates existing ones.
 */
router.post('/catalogue/sync', requireAuth, requireAdmin(), (req, res) => {
  try {
    const result = openstaxCatalogue.syncCatalogue();

    res.json({
      success: true,
      ...result,
      message: `Synced ${result.added} new books, updated ${result.updated} existing`
    });
  } catch (err) {
    console.error('Sync catalogue error:', err);

    if (err.message.includes('not found')) {
      return res.status(503).json({
        error: 'Database not ready',
        message: 'Run migration 003-book-catalogue first',
        suggestion: 'node server/migrations/003-book-catalogue.js'
      });
    }

    res.status(500).json({
      error: 'Failed to sync catalogue',
      message: err.message
    });
  }
});

/**
 * POST /api/admin/catalogue/add
 * Add a custom book to the catalogue
 *
 * Body:
 *   - slug: OpenStax identifier
 *   - title: Book title
 *   - description: Optional description
 *   - repoUrl: Optional GitHub repo URL
 *   - chapterCount: Optional chapter count
 *   - hasAppendices: Optional boolean
 */
router.post('/catalogue/add', requireAuth, requireAdmin(), (req, res) => {
  const { slug, title, description, repoUrl, chapterCount, hasAppendices } = req.body;

  if (!slug || !title) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'slug and title are required'
    });
  }

  try {
    const book = openstaxCatalogue.addToCatalogue({
      slug,
      title,
      description,
      repoUrl,
      chapterCount,
      hasAppendices
    });

    res.json({
      success: true,
      book,
      message: `Added ${title} to catalogue`
    });
  } catch (err) {
    console.error('Add to catalogue error:', err);

    if (err.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Already exists',
        message: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to add to catalogue',
      message: err.message
    });
  }
});

// ============================================================================
// BOOK REGISTRATION
// ============================================================================

/**
 * POST /api/admin/books/register
 * Register a book from the catalogue for translation
 *
 * Body:
 *   - catalogueSlug: OpenStax slug (e.g., 'chemistry-2e')
 *   - slug: Icelandic slug (e.g., 'efnafraedi')
 *   - titleIs: Icelandic title (e.g., 'Efnafræði')
 *   - fetchFromOpenstax: If true, fetch structure from OpenStax GitHub (optional)
 *   - forceReregister: If true, delete existing registration first (optional)
 */
router.post('/books/register', requireAuth, requireAdmin(), async (req, res) => {
  const { catalogueSlug, slug, titleIs, fetchFromOpenstax, forceReregister } = req.body;

  if (!catalogueSlug || !slug || !titleIs) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'catalogueSlug, slug, and titleIs are required'
    });
  }

  try {
    const result = await bookRegistration.registerBook({
      catalogueSlug,
      slug,
      titleIs,
      registeredBy: req.user.id,
      fetchFromOpenstax: fetchFromOpenstax === true,
      forceReregister: forceReregister === true
    });

    res.json(result);
  } catch (err) {
    console.error('Register book error:', err);

    if (err.message.includes('already registered') || err.message.includes('already in use')) {
      return res.status(409).json({
        error: 'Already registered',
        message: err.message,
        hint: 'Use forceReregister: true to replace the existing registration'
      });
    }

    if (err.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not found',
        message: err.message
      });
    }

    if (err.message.includes('not available for fetching')) {
      return res.status(400).json({
        error: 'Not available',
        message: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to register book',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/books
 * List all registered books with progress
 */
router.get('/books', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const books = bookRegistration.listRegisteredBooks();

    res.json({
      books,
      total: books.length
    });
  } catch (err) {
    console.error('List books error:', err);
    res.status(500).json({
      error: 'Failed to list books',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/books/:slug
 * Get detailed book information including chapters
 */
router.get('/books/:slug', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { slug } = req.params;

  try {
    const book = bookRegistration.getRegisteredBook(slug);

    if (!book) {
      return res.status(404).json({
        error: 'Not found',
        message: `Book '${slug}' not found`
      });
    }

    res.json(book);
  } catch (err) {
    console.error('Get book error:', err);
    res.status(500).json({
      error: 'Failed to get book',
      message: err.message
    });
  }
});

/**
 * GET /api/admin/books/:slug/chapters/:chapter
 * Get chapter details with all sections
 */
router.get('/books/:slug/chapters/:chapter', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { slug, chapter } = req.params;

  try {
    const book = bookRegistration.getRegisteredBook(slug);

    if (!book) {
      return res.status(404).json({
        error: 'Not found',
        message: `Book '${slug}' not found`
      });
    }

    const chapterNum = parseInt(chapter, 10);
    const chapterData = book.chapters.find(c => c.chapterNum === chapterNum);

    if (!chapterData) {
      return res.status(404).json({
        error: 'Not found',
        message: `Chapter ${chapter} not found in ${slug}`
      });
    }

    // Get sections for this chapter
    const sections = bookRegistration.getChapterSections(chapterData.id);

    res.json({
      book: {
        id: book.id,
        slug: book.slug,
        titleIs: book.titleIs
      },
      chapter: {
        ...chapterData,
        sections
      }
    });
  } catch (err) {
    console.error('Get chapter error:', err);
    res.status(500).json({
      error: 'Failed to get chapter',
      message: err.message
    });
  }
});

// ============================================================================
// DATABASE MANAGEMENT
// ============================================================================

/**
 * POST /api/admin/migrate
 * Run pending database migrations
 */
router.post('/migrate', requireAuth, requireAdmin(), async (req, res) => {
  try {
    const migrations = [
      require('../migrations/001-add-error-recovery'),
      require('../migrations/002-editor-tables'),
      require('../migrations/003-book-catalogue')
    ];

    const results = [];

    for (const migration of migrations) {
      const result = migration.migrate();
      results.push({
        name: migration.name || 'unknown',
        ...result
      });
    }

    const applied = results.filter(r => r.success && !r.alreadyApplied).length;
    const skipped = results.filter(r => r.alreadyApplied).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: failed === 0,
      applied,
      skipped,
      failed,
      results,
      message: failed > 0
        ? `${failed} migration(s) failed`
        : `Applied ${applied} migration(s), skipped ${skipped} already applied`
    });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({
      error: 'Migration failed',
      message: err.message
    });
  }
});

module.exports = router;
