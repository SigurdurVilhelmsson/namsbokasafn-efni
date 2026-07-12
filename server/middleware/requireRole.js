/**
 * Role-Based Access Control Middleware
 *
 * Checks if the authenticated user has the required role.
 * Must be used after requireAuth middleware.
 */

const { ROLES, hasRole } = require('../services/auth');
const userService = require('../services/userService');
const bookRegistration = require('../services/bookRegistration');

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
 *   router.post('/:bookSlug/.../faithful', requireAuth, requireHeadEditor('bookSlug'), handler);
 *
 * The book slug is extracted from req.params[bookParam] (default 'book').
 *
 * @param {string} [bookParam='book'] - name of the route param holding the book slug
 * @returns {function} Express middleware
 */
function requireHeadEditor(bookParam = 'book') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    const book = req.params[bookParam];

    // Admins can access any book
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    // Head editors can access their assigned books
    if (req.user.role === ROLES.HEAD_EDITOR && req.user.books && req.user.books.includes(book)) {
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
 * Require head-editor ownership of a book that is resolved dynamically.
 *
 * Some endpoints are keyed by an entity ID (e.g. :editId, :reviewId) rather
 * than a :book param, so the owning book has to be looked up. The resolver is
 * given the request and returns the book slug (or a falsy value / throws if the
 * target entity does not exist).
 *
 * Order of checks: auth → minimum head-editor level → admin bypass →
 * resolve book → book-ownership.
 *
 * @param {function(req): (string|undefined)} resolveBook - returns the book slug
 * @returns {function} Express middleware
 */
function requireHeadEditorFor(resolveBook) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    if (!hasRole(req.user.role, ROLES.HEAD_EDITOR)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires ${ROLES.HEAD_EDITOR} role or higher`,
        yourRole: req.user.role,
      });
    }

    // Admins bypass the per-book ownership check
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    let book;
    try {
      book = resolveBook(req);
    } catch (err) {
      // Resolver signals a missing target by throwing
      return res.status(404).json({ error: err.message });
    }

    if (!book) {
      return res.status(404).json({ error: 'Target not found' });
    }

    if (req.user.books && req.user.books.includes(book)) {
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
 * Book-scope a route keyed by a section (or an entity that resolves to a section).
 *
 * resolveSectionId(req) returns a section id (number|string), or a falsy value /
 * throws when the target entity does not exist (both → 404). The section's owning
 * book + chapter are resolved via bookRegistration.getSection, then the request is
 * delegated to requireBookAccess() — so the semantics are exactly its semantics:
 * admin passes; a head-editor OF THIS BOOK passes; everyone else (plain editors
 * AND head-editors of other books) takes the chapter-assignment path — fail-open
 * when the caller has no assignments for the book and enforcement is OFF,
 * default-deny when the book's enforce_assignments toggle is ON — for callers
 * resolvable to a DB user (a JWT holder with no users row falls through —
 * pre-existing requireBookAccess behavior) — 503 fail-closed when enforcement
 * is ON but assignments cannot be evaluated.
 *
 * Also attaches the resolved section as req.section for downstream handlers.
 *
 * @param {function(req): (number|string|undefined)} resolveSectionId
 * @returns {function} Express middleware
 */
function requireBookAccessForSection(resolveSectionId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    // Min-role fast-fail so sub-editor callers never trigger DB resolution.
    if (!hasRole(req.user.role, ROLES.EDITOR)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'This action requires editor role or higher',
        yourRole: req.user.role,
      });
    }

    let sectionId;
    try {
      sectionId = resolveSectionId(req);
    } catch (err) {
      // Resolver signals a missing target by throwing (requireHeadEditorFor parity)
      return res.status(404).json({ error: err.message });
    }

    if (!sectionId) {
      return res.status(404).json({ error: 'Target not found' });
    }

    const section = bookRegistration.getSection(parseInt(sectionId, 10));
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Hand requireBookAccess exactly what it reads, and keep the resolved
    // section for handlers (audit-log columns, sync-log's localizer check).
    req.section = section;
    req.params.book = section.bookSlug;
    req.chapterNum = String(section.chapterNum); // String: chapter 0 (front matter) must stay truthy
    return requireBookAccess()(req, res, next);
  };
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
 * 3. Editor → check chapter assignments (if any exist for that book)
 * 4. No access → 403
 *
 * Extracts book from req.params.book and chapter from req.params.chapter or req.chapterNum.
 * Requires at minimum EDITOR role.
 */
function requireBookAccess() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
      });
    }

    // Must be at least editor
    if (!hasRole(req.user.role, ROLES.EDITOR)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'This action requires editor role or higher',
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
      // Look up the DB user ID from the provider ID in the JWT
      const dbUser = userService.findByProviderId(req.user.id);
      if (dbUser) {
        let allowed;
        try {
          allowed = userService.hasChapterAccess(dbUser.id, book, chapter);
        } catch (err) {
          // Enforcement is on but assignments can't be evaluated → fail closed.
          if (err.code === 'ASSIGNMENT_TABLE_UNAVAILABLE') {
            return res.status(503).json({
              error: 'Assignment enforcement unavailable',
              message:
                'Chapter assignments cannot be verified right now. Access is blocked until this is resolved.',
            });
          }
          throw err;
        }
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
  requireHeadEditorFor,
  requireBookAccessForSection,
  requireEditor,
  requireAdmin,
  requireBookAccess,
  ROLES,
};
