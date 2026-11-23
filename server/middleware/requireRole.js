/**
 * Role-Based Access Control Middleware
 *
 * Checks if the authenticated user has the required role.
 * Must be used after requireAuth middleware.
 */

const { ROLES, hasRole } = require('../services/auth');
const userService = require('../services/userService');
const bookRegistration = require('../services/bookRegistration');
const log = require('../lib/logger');
const { isAlwaysEnforced } = require('../lib/editorScope');
// UMD display half of the chapter-label contract: -1 → 'Viðaukar', N → 'Kafli N' (no DB read).
const chapterLabel = require('../public/js/chapter-label');

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
  const guard = (req, res, next) => {
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
  guard.minimumRole = minimumRole;
  return guard;
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
 * AND head-editors of other books) takes the chapter-assignment path. A study
 * book is always enforced, whatever its enforce_assignments row says (spec
 * §6.2): default-deny, only an assigned chapter passes. Any other book is
 * default-deny when its enforce_assignments toggle is ON and fail-open when it
 * is OFF and the caller has no assignments for the book. A JWT holder with no
 * `users` row is decided the same way — denied under enforcement (batch 4 D7:
 * hasChapterAccess's null-user branch), fail-open otherwise — and enforcement
 * that cannot evaluate assignments answers 503, fail-closed.
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
 * 3. Editor → check chapter assignments: a study book is always enforced, and refuses a
 *    request that names no chapter (spec §6.2); any other book checks them only when its
 *    enforcement is on or the caller holds assignments in it
 * 4. No access → 403
 *
 * Extracts book from req.params.book and chapter from req.params.chapter or req.chapterNum.
 * Requires at minimum EDITOR role.
 */
function requireBookAccess() {
  const guard = (req, res, next) => {
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

    // Check chapter assignment. A study book is always enforced (spec §6.2): only an assigned
    // chapter passes. Any other book keeps the legacy rule while its enforcement is off: a caller
    // with no assignments for the book passes every chapter (hasChapterAccess).
    // `??` keeps chapter 0 and -1 (the appendices sentinel) as real chapters (spec §6.2, T4).
    const chapter = req.chapterNum ?? req.params.chapter;

    // A study book refuses a write that names no chapter: nothing to check the assignment against
    // (spec §6.2). A non-study book keeps the legacy pass-through.
    if ((chapter === undefined || chapter === null || chapter === '') && isAlwaysEnforced(book)) {
      return res.status(403).json({
        error: 'CHAPTER_UNKNOWN',
        message: 'Beiðnin tilgreinir engan kafla, svo ekki er hægt að staðfesta úthlutun.',
      });
    }

    if (chapter !== undefined && chapter !== null && chapter !== '') {
      // Look up the DB user ID from the provider ID in the JWT. A caller
      // with no users row is decided by hasChapterAccess: denied under
      // enforcement, legacy fail-open otherwise (batch 4, design D7).
      const dbUser = userService.findByProviderId(req.user.id);
      let allowed;
      try {
        allowed = userService.hasChapterAccess(dbUser ? dbUser.id : null, book, chapter);
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
        // Identity-bearing deny log (batch 4 D7 motivating scenario): the
        // service-side warn has no request context, so log who was denied
        // here when the denial traces to a JWT with no `users` row.
        if (!dbUser) {
          log.warn(
            { providerId: req.user.id, username: req.user.username, book, chapter },
            'Chapter access denied for JWT with no users row'
          );
        }
        return res.status(403).json({
          error: 'Chapter access denied',
          message: `Þér hefur ekki verið úthlutað þessum hluta bókarinnar (${chapterLabel.full(chapter)}, ${book}).`,
          yourRole: req.user.role,
        });
      }
    }

    next();
  };
  guard.bookAccessGuard = true;
  return guard;
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
