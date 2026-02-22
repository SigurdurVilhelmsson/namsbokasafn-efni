/**
 * Admin Routes
 *
 * Handles administrative operations:
 * - OpenStax catalogue management
 * - Book registration
 * - User management (future)
 *
 * All routes require admin authentication.
 *
 * Book parameter: :slug (OpenStax or Icelandic slug, e.g., 'efnafraedi')
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin, requireRole, ROLES } = require('../middleware/requireRole');
const openstaxCatalogue = require('../services/openstaxCatalogue');
const bookRegistration = require('../services/bookRegistration');
const bookDataGenerator = require('../services/bookDataGenerator');
const userService = require('../services/userService');
const https = require('https');

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
      registered: books.filter((b) => b.registered).length,
    });
  } catch (err) {
    console.error('List catalogue error:', err);

    // Handle missing tables gracefully
    if (err.message.includes('not found')) {
      return res.status(503).json({
        error: 'Database not ready',
        message: 'Run migration 003-book-catalogue first',
        suggestion: 'node server/migrations/003-book-catalogue.js',
      });
    }

    res.status(500).json({
      error: 'Failed to list catalogue',
      message: err.message,
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
    note: 'These are predefined books available for sync',
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
      message: `Synced ${result.added} new books, updated ${result.updated} existing`,
    });
  } catch (err) {
    console.error('Sync catalogue error:', err);

    if (err.message.includes('not found')) {
      return res.status(503).json({
        error: 'Database not ready',
        message: 'Run migration 003-book-catalogue first',
        suggestion: 'node server/migrations/003-book-catalogue.js',
      });
    }

    res.status(500).json({
      error: 'Failed to sync catalogue',
      message: err.message,
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
      message: 'slug and title are required',
    });
  }

  try {
    const book = openstaxCatalogue.addToCatalogue({
      slug,
      title,
      description,
      repoUrl,
      chapterCount,
      hasAppendices,
    });

    res.json({
      success: true,
      book,
      message: `Added ${title} to catalogue`,
    });
  } catch (err) {
    console.error('Add to catalogue error:', err);

    if (err.message.includes('already exists')) {
      return res.status(409).json({
        error: 'Already exists',
        message: err.message,
      });
    }

    res.status(500).json({
      error: 'Failed to add to catalogue',
      message: err.message,
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
  const { catalogueSlug, slug, titleIs, fetchFromOpenstax, forceReregister, headEditorId } =
    req.body;

  if (!catalogueSlug || !slug || !titleIs) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'catalogueSlug, slug, and titleIs are required',
    });
  }

  try {
    const result = await bookRegistration.registerBook({
      catalogueSlug,
      slug,
      titleIs,
      registeredBy: req.user.id,
      fetchFromOpenstax: fetchFromOpenstax === true,
      forceReregister: forceReregister === true,
    });

    // Assign head editor if specified
    if (headEditorId && result.success && result.book) {
      try {
        userService.assignBookAccess(headEditorId, slug, 'head-editor', req.user.username);
        result.headEditorAssigned = true;
      } catch (assignErr) {
        console.error('Failed to assign head editor:', assignErr);
        result.headEditorError = assignErr.message;
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Register book error:', err);

    if (err.message.includes('already registered') || err.message.includes('already in use')) {
      return res.status(409).json({
        error: 'Already registered',
        message: err.message,
        hint: 'Use forceReregister: true to replace the existing registration',
      });
    }

    if (err.message.includes('not found')) {
      return res.status(404).json({
        error: 'Not found',
        message: err.message,
      });
    }

    if (err.message.includes('not available for fetching')) {
      return res.status(400).json({
        error: 'Not available',
        message: err.message,
      });
    }

    res.status(500).json({
      error: 'Failed to register book',
      message: err.message,
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
      total: books.length,
    });
  } catch (err) {
    console.error('List books error:', err);
    res.status(500).json({
      error: 'Failed to list books',
      message: err.message,
    });
  }
});

/**
 * GET /api/admin/books/data-status
 * Get status of book data files for all available books
 * NOTE: Must be defined BEFORE /books/:slug to avoid Express matching "data-status" as :slug
 */
router.get('/books/data-status', requireAuth, requireAdmin(), (req, res) => {
  try {
    const books = bookDataGenerator.listBooks();

    res.json({
      books,
      total: books.length,
      withDataFile: books.filter((b) => b.hasDataFile).length,
      needsUpdate: books.filter((b) => b.needsUpdate).length,
      missingFile: books.filter((b) => !b.hasDataFile).length,
    });
  } catch (err) {
    console.error('List book data status error:', err);
    res.status(500).json({
      error: 'Failed to list book data status',
      message: err.message,
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
        message: `Book '${slug}' not found`,
      });
    }

    res.json(book);
  } catch (err) {
    console.error('Get book error:', err);
    res.status(500).json({
      error: 'Failed to get book',
      message: err.message,
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
        message: `Book '${slug}' not found`,
      });
    }

    const chapterNum = parseInt(chapter, 10);
    const chapterData = book.chapters.find((c) => c.chapterNum === chapterNum);

    if (!chapterData) {
      return res.status(404).json({
        error: 'Not found',
        message: `Chapter ${chapter} not found in ${slug}`,
      });
    }

    // Get sections for this chapter
    const sections = bookRegistration.getChapterSections(chapterData.id);

    res.json({
      book: {
        id: book.id,
        slug: book.slug,
        titleIs: book.titleIs,
      },
      chapter: {
        ...chapterData,
        sections,
      },
    });
  } catch (err) {
    console.error('Get chapter error:', err);
    res.status(500).json({
      error: 'Failed to get chapter',
      message: err.message,
    });
  }
});

// ============================================================================
// BOOK DATA GENERATION
// ============================================================================

/**
 * POST /api/admin/books/:slug/generate-data
 * Generate/regenerate the JSON data file for a book
 *
 * This fetches the complete chapter structure from OpenStax and merges
 * Icelandic titles from the database, then writes to server/data/{slug}.json.
 *
 * Query params:
 *   - force: If true, regenerate even if file exists with correct chapter count
 */
router.post('/books/:slug/generate-data', requireAuth, requireAdmin(), async (req, res) => {
  const { slug } = req.params;
  const force = req.query.force === 'true';

  try {
    // The slug here could be either the OpenStax catalogue slug (chemistry-2e)
    // or the Icelandic slug (efnafraedi). We need to find the catalogue slug.
    let catalogueSlug = slug;

    // Check if this is an Icelandic slug by looking up registration
    const registeredBook = bookRegistration.getRegisteredBook(slug);
    if (registeredBook) {
      catalogueSlug = registeredBook.catalogueSlug;
    }

    const result = await bookDataGenerator.generateBookData(catalogueSlug, { force });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('Generate book data error:', err);

    if (err.message.includes('not available')) {
      return res.status(400).json({
        error: 'Book not available',
        message: err.message,
      });
    }

    res.status(500).json({
      error: 'Failed to generate book data',
      message: err.message,
    });
  }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/users
 * List all users
 *
 * Query params:
 *   - role: Filter by role
 *   - active: Filter by active status (true/false)
 *   - limit: Max results (default 100)
 *   - offset: Pagination offset
 */
router.get('/users', requireAuth, requireAdmin(), (req, res) => {
  try {
    if (!userService.isUserTableReady()) {
      return res.status(503).json({
        error: 'Database not ready',
        message: 'Run migration 006-user-management first',
        suggestion: 'POST /api/admin/migrate',
      });
    }

    const options = {
      role: req.query.role,
      isActive: req.query.active !== undefined ? req.query.active === 'true' : undefined,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    };

    const result = userService.listUsers(options);

    res.json({
      users: result.users.map(formatUser),
      total: result.total,
      limit: options.limit,
      offset: options.offset,
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({
      error: 'Failed to list users',
      message: err.message,
    });
  }
});

/**
 * GET /api/admin/users/roles
 * Get available roles and their descriptions
 * NOTE: Must be defined before /users/:id to avoid "roles" being matched as :id
 */
router.get('/users/roles', requireAuth, requireAdmin(), (req, res) => {
  res.json({
    roles: [
      { id: 'admin', name: 'Kerfisstjóri', description: 'Full access to all features', level: 5 },
      {
        id: 'head-editor',
        name: 'Aðalritstjóri',
        description: 'Manage assigned books and reviewers',
        level: 4,
      },
      { id: 'editor', name: 'Ritstjóri', description: 'Review and approve translations', level: 3 },
      { id: 'contributor', name: 'Þýðandi', description: 'Contribute translations', level: 2 },
      { id: 'viewer', name: 'Lesandi', description: 'View only access', level: 1 },
    ],
  });
});

/**
 * GET /api/admin/users/:id
 * Get user details
 */
router.get('/users/:id', requireAuth, requireAdmin(), (req, res) => {
  try {
    const user = userService.findById(parseInt(req.params.id, 10));

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
    }

    res.json(formatUser(user));
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({
      error: 'Failed to get user',
      message: err.message,
    });
  }
});

/**
 * POST /api/admin/users
 * Add a new user by GitHub username
 *
 * Body:
 *   - githubUsername: GitHub username (required)
 *   - role: Initial role (default: viewer)
 */
router.post('/users', requireAuth, requireAdmin(), async (req, res) => {
  const { githubUsername, role = 'viewer' } = req.body;

  if (!githubUsername) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'githubUsername is required',
    });
  }

  try {
    // Check if user already exists
    const existing = userService.findByUsername(githubUsername);
    if (existing) {
      return res.status(409).json({
        error: 'Already exists',
        message: `User ${githubUsername} is already registered`,
        user: formatUser(existing),
      });
    }

    // Fetch user info from GitHub
    const githubUser = await fetchGitHubUser(githubUsername);
    if (!githubUser) {
      return res.status(404).json({
        error: 'GitHub user not found',
        message: `Could not find GitHub user: ${githubUsername}`,
      });
    }

    // Create user
    const user = userService.createUser(
      {
        githubId: githubUser.id,
        githubUsername: githubUser.login,
        displayName: githubUser.name || githubUser.login,
        avatarUrl: githubUser.avatar_url,
        email: githubUser.email,
        role,
      },
      req.user.username
    );

    res.status(201).json({
      success: true,
      message: `User ${githubUsername} added successfully`,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Add user error:', err);
    res.status(500).json({
      error: 'Failed to add user',
      message: err.message,
    });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user role or status
 *
 * Body (all optional):
 *   - role: New role
 *   - isActive: Active status
 *   - displayName: Display name
 */
router.put('/users/:id', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { role, isActive, displayName } = req.body;

  try {
    const existing = userService.findById(userId);
    if (!existing) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
    }

    // Prevent demoting self
    if (existing.github_username === req.user.username && role && role !== 'admin') {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'You cannot demote yourself',
      });
    }

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (displayName !== undefined) updates.displayName = displayName;

    const user = userService.updateUser(userId, updates, req.user.username);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({
      error: 'Failed to update user',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Deactivate or delete a user
 *
 * Query params:
 *   - hard: If true, permanently delete (default: deactivate)
 */
router.delete('/users/:id', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const hardDelete = req.query.hard === 'true';

  try {
    const existing = userService.findById(userId);
    if (!existing) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found',
      });
    }

    // Prevent deleting self
    if (existing.github_username === req.user.username) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: 'You cannot delete yourself',
      });
    }

    if (hardDelete) {
      userService.deleteUser(userId);
      res.json({
        success: true,
        message: 'User permanently deleted',
      });
    } else {
      userService.deactivateUser(userId);
      res.json({
        success: true,
        message: 'User deactivated',
      });
    }
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({
      error: 'Failed to delete user',
      message: err.message,
    });
  }
});

/**
 * POST /api/admin/users/:id/books
 * Assign book access to user
 *
 * Body:
 *   - bookSlug: Book slug (required)
 *   - role: Role for this book (head-editor, editor, contributor)
 */
router.post('/users/:id/books', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { bookSlug, role } = req.body;

  if (!bookSlug || !role) {
    return res.status(400).json({
      error: 'Missing parameters',
      message: 'bookSlug and role are required',
    });
  }

  try {
    const user = userService.assignBookAccess(userId, bookSlug, role, req.user.username);

    res.json({
      success: true,
      message: `Assigned ${role} access to ${bookSlug}`,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Assign book access error:', err);
    res.status(500).json({
      error: 'Failed to assign book access',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/admin/users/:id/books/:bookSlug
 * Remove book access from user
 */
router.delete('/users/:id/books/:bookSlug', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { bookSlug } = req.params;

  try {
    const user = userService.removeBookAccess(userId, bookSlug);

    res.json({
      success: true,
      message: `Removed access to ${bookSlug}`,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Remove book access error:', err);
    res.status(500).json({
      error: 'Failed to remove book access',
      message: err.message,
    });
  }
});

// ================================================================
// CHAPTER ASSIGNMENTS
// ================================================================

/**
 * GET /api/admin/users/:id/chapters
 * List chapter assignments for a user (optionally filtered by book)
 */
router.get('/users/:id/chapters', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { book } = req.query;

  try {
    const assignments = book
      ? userService.getChapterAssignments(userId, book)
      : userService.getAllChapterAssignments(userId);

    res.json({ assignments });
  } catch (err) {
    console.error('Get chapter assignments error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/users/:id/chapters
 * Assign chapters to a user
 * Body: { bookSlug, chapters: [1, 2, 3] }
 */
router.post('/users/:id/chapters', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { bookSlug, chapters } = req.body;

  if (!bookSlug || !chapters || !Array.isArray(chapters)) {
    return res.status(400).json({ error: 'bookSlug and chapters array required' });
  }

  try {
    for (const ch of chapters) {
      userService.assignChapter(userId, bookSlug, ch, req.user.username);
    }

    const assignments = userService.getChapterAssignments(userId, bookSlug);
    res.json({
      success: true,
      message: `Assigned ${chapters.length} chapter(s) to user`,
      assignments,
    });
  } catch (err) {
    console.error('Assign chapters error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/users/:id/chapters/:book/:chapter
 * Remove a chapter assignment
 */
router.delete('/users/:id/chapters/:book/:chapter', requireAuth, requireAdmin(), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { book, chapter } = req.params;

  try {
    userService.removeChapterAssignment(userId, book, parseInt(chapter, 10));

    const assignments = userService.getChapterAssignments(userId, book);
    res.json({
      success: true,
      message: `Removed chapter ${chapter} assignment`,
      assignments,
    });
  } catch (err) {
    console.error('Remove chapter assignment error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper: Format user for API response
 */
function formatUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    githubId: user.github_id,
    githubUsername: user.github_username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    email: user.email,
    role: user.role,
    isActive: !!user.is_active,
    bookAccess: user.bookAccess || [],
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
    createdBy: user.created_by,
  };
}

/**
 * Helper: Fetch GitHub user info by username
 */
function fetchGitHubUser(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/users/${encodeURIComponent(username)}`,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'namsbokasafn-pipeline',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve(null);
        } else if (res.statusCode >= 400) {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse GitHub response'));
          }
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ============================================================================
// DATABASE MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/migrate
 * Show migration info (hint to use POST)
 */
router.get('/migrate', requireAuth, requireAdmin(), (req, res) => {
  res.json({
    message: 'Use POST /api/admin/migrate to run pending migrations',
    method: 'POST',
    migrations: [
      '001-add-error-recovery',
      '002-editor-tables',
      '003-book-catalogue',
      '004-terminology',
      '005-feedback',
      '006-user-management',
      '007-chapter-files',
      '008-segment-editing',
      '009-segment-edit-apply',
      '010-chapter-assignments',
    ],
  });
});

/**
 * POST /api/admin/migrate
 * Run pending database migrations
 */
router.post('/migrate', requireAuth, requireAdmin(), async (req, res) => {
  try {
    const migrations = [
      require('../migrations/001-add-error-recovery'),
      require('../migrations/002-editor-tables'),
      require('../migrations/003-book-catalogue'),
      require('../migrations/004-terminology'),
      require('../migrations/005-feedback'),
      require('../migrations/006-user-management'),
      require('../migrations/007-chapter-files'),
      require('../migrations/008-segment-editing'),
      require('../migrations/009-segment-edit-apply'),
      require('../migrations/010-chapter-assignments'),
    ];

    const results = [];

    // Migrations 001-007 use migrate() with internal DB connection.
    // Migrations 008+ use up(db) and expect a DB instance.
    const Database = require('better-sqlite3');
    const migrationDbPath = require('path').join(
      __dirname,
      '..',
      '..',
      'pipeline-output',
      'sessions.db'
    );
    let migrationDb;

    for (const migration of migrations) {
      let result;
      if (typeof migration.migrate === 'function') {
        result = migration.migrate();
      } else if (typeof migration.up === 'function') {
        try {
          if (!migrationDb) {
            migrationDb = new Database(migrationDbPath);
          }
          migration.up(migrationDb);
          result = { success: true, name: migration.name };
        } catch (err) {
          if (err.message && err.message.includes('duplicate column')) {
            result = { success: true, alreadyApplied: true, name: migration.name };
          } else {
            result = { success: false, error: err.message, name: migration.name };
          }
        }
      } else {
        result = {
          success: false,
          error: 'No migrate() or up() function',
          name: migration.name || 'unknown',
        };
      }
      results.push({
        name: migration.name || 'unknown',
        ...result,
      });
    }

    if (migrationDb) {
      migrationDb.close();
    }

    const applied = results.filter((r) => r.success && !r.alreadyApplied).length;
    const skipped = results.filter((r) => r.alreadyApplied).length;
    const failed = results.filter((r) => !r.success).length;

    res.json({
      success: failed === 0,
      applied,
      skipped,
      failed,
      results,
      message:
        failed > 0
          ? `${failed} migration(s) failed`
          : `Applied ${applied} migration(s), skipped ${skipped} already applied`,
    });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({
      error: 'Migration failed',
      message: err.message,
    });
  }
});

module.exports = router;
