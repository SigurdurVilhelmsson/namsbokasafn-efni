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

const viewsDir = path.join(__dirname, '..', 'views');

// ─── Primary routes ───────────────────────────────────────────────

router.get('/', (req, res) => sendView(res, 'my-work.html'));
router.get('/login', (req, res) => sendView(res, 'login.html'));
router.get('/editor', (req, res) => sendView(res, 'segment-editor.html'));
router.get('/progress', (req, res) => sendView(res, 'status.html'));
router.get('/terminology', (req, res) => sendView(res, 'terminology.html'));
router.get('/reviews', (req, res) => sendView(res, 'reviews.html'));
router.get('/localization', (req, res) => sendView(res, 'localization-editor.html'));
router.get('/library', (req, res) => sendView(res, 'books.html'));
router.get('/admin', (req, res) => sendView(res, 'admin.html'));
router.get('/feedback', (req, res) => sendView(res, 'feedback.html'));

// ─── Legacy redirects ────────────────────────────────────────────

router.get('/my-work', (req, res) => res.redirect('/'));

router.get('/segment-editor', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect('/editor' + (qs ? `?${qs}` : ''));
});

router.get('/status', (req, res) => res.redirect('/progress'));
router.get('/review-queue', (req, res) => res.redirect('/reviews'));

router.get('/localization-editor', (req, res) => res.redirect('/localization'));
router.get('/localization-review', (req, res) => res.redirect('/localization'));

router.get('/books', (req, res) => res.redirect('/library'));
router.get('/books/:bookId', (req, res) => res.redirect(`/library?book=${req.params.bookId}`));
router.get('/chapter', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect('/library' + (qs ? `?${qs}` : ''));
});
router.get('/images', (req, res) => res.redirect('/library'));

router.get('/admin/users', (req, res) => res.redirect('/admin?tab=users'));
router.get('/admin/books', (req, res) => res.redirect('/admin?tab=books'));
router.get('/admin/feedback', (req, res) => res.redirect('/admin?tab=feedback'));
router.get('/analytics', (req, res) => res.redirect('/admin?tab=analytics'));

router.get('/workflow', (req, res) => res.redirect('/'));
router.get('/dashboard', (req, res) => res.redirect('/'));
router.get('/pipeline', (req, res) => res.redirect('/progress'));
router.get('/issues', (req, res) => res.redirect('/'));
router.get('/for-teachers', (req, res) => res.redirect('/'));

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
    res.sendFile(filePath);
  } else {
    res.status(404).send('S\u00ED\u00F0a finnst ekki');
  }
}

module.exports = router;
