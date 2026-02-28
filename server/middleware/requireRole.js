/**
 * Role-Based Access Control Middleware
 *
 * Checks if the authenticated user has the required role.
 * Must be used after requireAuth middleware.
 */

const { ROLES, hasRole } = require('../services/auth');
const userService = require('../services/userService');

/**
 * Require minimum role middleware factory
 *
 * Usage:
 *   router.get('/admin', requireAuth, requireRole('admin'), handler);
 *   router.get('/editors', requireAuth, requireRole('editor'), handler);
 *
 * @param {string} minimumRole - Minimum required role
 * @returns {function} Express middleware
 */
function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    if (!hasRole(req.user.role, minimumRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires ${minimumRole} role or higher`,
        yourRole: req.user.role,
        requiredRole: minimumRole,
      });
    }

    next();
  };
}

/**
 * Require head editor for specific book middleware factory
 *
 * Usage:
 *   router.put('/books/:book', requireAuth, requireHeadEditor(), handler);
 *
 * The book parameter is extracted from req.params.book
 *
 * @returns {function} Express middleware
 */
function requireHeadEditor() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    const book = req.params.book;

    // Admins can access any book
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // Head editors can access their assigned books
    if (req.user.role === ROLES.HEAD_EDITOR && req.user.books.includes(book)) {
      return next();
    }

    return res.status(403).json({
      error: 'Insufficient permissions',
      message: `Head editor access for ${book} is required`,
      yourRole: req.user.role,
      yourBooks: req.user.books,
    });
  };
}

/**
 * Require contributor or higher for a specific book
 *
 * Contributors can work on any book, but this checks minimum access level.
 */
function requireContributor() {
  return requireRole(ROLES.CONTRIBUTOR);
}

/**
 * Require editor or higher
 */
function requireEditor() {
  return requireRole(ROLES.EDITOR);
}

/**
 * Require admin
 */
function requireAdmin() {
  return requireRole(ROLES.ADMIN);
}

/**
 * Require book + chapter access for write operations.
 *
 * Checks (in order):
 * 1. Admin → always pass
 * 2. Head-editor for the book → always pass
 * 3. Contributor/editor → check chapter assignments (if any exist for that book)
 * 4. No access → 403
 *
 * Extracts book from req.params.book and chapter from req.params.chapter or req.chapterNum.
 * Requires at minimum CONTRIBUTOR role.
 */
function requireBookAccess() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    // Must be at least contributor
    if (!hasRole(req.user.role, ROLES.CONTRIBUTOR)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'This action requires contributor role or higher',
        yourRole: req.user.role,
      });
    }

    // Admin always passes
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // Head-editor for this book always passes
    const book = req.params.book;
    if (req.user.role === ROLES.HEAD_EDITOR && req.user.books && req.user.books.includes(book)) {
      return next();
    }

    // Check chapter assignment (backward compat: no assignments = full access)
    const chapter = req.chapterNum || req.params.chapter;

    if (chapter) {
      // Look up the DB user ID from the GitHub ID in the JWT
      const dbUser = userService.findByGithubId(req.user.id);
      if (dbUser) {
        const allowed = userService.hasChapterAccess(dbUser.id, book, chapter);
        if (!allowed) {
          return res.status(403).json({
            error: 'Chapter access denied',
            message: `You are not assigned to chapter ${chapter} of ${book}`,
            yourRole: req.user.role,
          });
        }
      }
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireHeadEditor,
  requireContributor,
  requireEditor,
  requireAdmin,
  requireBookAccess,
  ROLES,
};
