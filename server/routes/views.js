/**
 * View Routes
 *
 * Serves HTML pages for the web UI.
 * After the Basalt & Vellum redesign, most old routes redirect to new canonical paths.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { verifyToken, hasRole, ROLES } = require('../services/auth');

const viewsDir = path.join(__dirname, '..', 'views');

/**
 * Page-level authentication gate (defense-in-depth).
 *
 * The HTML pages carry no secrets themselves — their data comes from the
 * role-gated `/api/*` routes — but serving the app shell to anonymous users is
 * needless surface. This redirects un-/in-validly-authenticated browsers to the
 * login page (preserving the intended destination) instead of returning JSON,
 * which suits a navigated page request. Client-side guards still run on top.
 *
 * @param {string} [minRole] - optional minimum role; below it → redirect to '/'
 */
function requirePageAuth(minRole) {
  return (req, res, next) => {
    const token = req.cookies?.auth_token;
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
      const dest = encodeURIComponent(req.originalUrl);
      return res.redirect(302, `/login?redirect=${dest}`);
    }
    if (minRole && !hasRole(decoded.role, minRole)) {
      // Authenticated but under-privileged — bounce to the landing page rather
      // than leak the existence/shape of the restricted view.
      return res.redirect(302, '/');
    }
    next();
  };
}

// ─── Primary routes ───────────────────────────────────────────────

router.get('/', requirePageAuth(), (req, res) => sendView(res, 'my-work.html'));
router.get('/login', (req, res) => sendView(res, 'login.html'));
router.get('/editor', requirePageAuth(), (req, res) => sendView(res, 'segment-editor.html'));
router.get('/progress', requirePageAuth(), (req, res) => sendView(res, 'status.html'));
router.get('/terminology', requirePageAuth(), (req, res) => sendView(res, 'terminology.html'));
router.get('/reviews', (req, res) => res.redirect(301, '/editor'));
router.get('/localization', requirePageAuth(), (req, res) =>
  sendView(res, 'localization-editor.html')
);
router.get('/library', requirePageAuth(), (req, res) => sendView(res, 'books.html'));
router.get('/admin', requirePageAuth(ROLES.ADMIN), (req, res) => sendView(res, 'admin.html'));
router.get('/assignments', requirePageAuth(ROLES.HEAD_EDITOR), (req, res) =>
  sendView(res, 'assignments.html')
);
router.get('/profile', requirePageAuth(), (req, res) => sendView(res, 'profile.html'));
// '/feedback' is a deliberately public form (anonymous error/suggestion reports)
// rate-limited at the API — no page auth gate.
router.get('/feedback', (req, res) => sendView(res, 'feedback.html'));

// ─── Legacy redirects ────────────────────────────────────────────

router.get('/my-work', (req, res) => res.redirect(301, '/'));

router.get('/segment-editor', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(301, '/editor' + (qs ? `?${qs}` : ''));
});

router.get('/status', (req, res) => res.redirect(301, '/progress'));
router.get('/review-queue', (req, res) => res.redirect(301, '/editor'));

router.get('/localization-editor', (req, res) => res.redirect(301, '/localization'));
router.get('/localization-review', (req, res) => res.redirect(301, '/localization'));

router.get('/books', (req, res) => res.redirect(301, '/library'));

const SLUG_REDIRECTS = { efnafraedi: 'efnafraedi-2e' };
router.get('/books/:bookId', (req, res) => {
  const slug = SLUG_REDIRECTS[req.params.bookId] || req.params.bookId;
  res.redirect(301, `/library?book=${slug}`);
});
router.get('/chapter', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(301, '/library' + (qs ? `?${qs}` : ''));
});
router.get('/images', (req, res) => res.redirect(301, '/library'));

router.get('/admin/users', (req, res) => res.redirect(301, '/admin?tab=users'));
router.get('/admin/books', (req, res) => res.redirect(301, '/admin?tab=books'));
router.get('/admin/feedback', (req, res) => res.redirect(301, '/admin?tab=feedback'));
router.get('/analytics', (req, res) => res.redirect(301, '/admin?tab=analytics'));

router.get('/workflow', (req, res) => res.redirect(301, '/'));
router.get('/dashboard', (req, res) => res.redirect(301, '/'));
router.get('/pipeline', (req, res) => res.redirect(301, '/progress'));
router.get('/pipeline/:bookSlug/:chapterNum', (req, res) => res.redirect(301, '/progress'));
router.get('/issues', (req, res) => res.redirect(301, '/'));
router.get('/for-teachers', (req, res) => res.redirect(301, '/'));

// ─── 404 catch-all (must be last) ────────────────────────────────

router.use((req, res) => {
  const filePath = path.join(viewsDir, '404.html');
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).send('S\u00ED\u00F0a finnst ekki');
  }
});

/**
 * Helper to send a view file
 */
function sendView(res, filename) {
  const filePath = path.join(viewsDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filename, { root: viewsDir });
  } else {
    res.status(404).send('S\u00ED\u00F0a finnst ekki');
  }
}

module.exports = router;
module.exports.requirePageAuth = requirePageAuth;
