/**
 * View Routes
 *
 * Serves HTML pages for the web UI.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const viewsDir = path.join(__dirname, '..', 'views');

/**
 * GET /
 * Redirect to personal work dashboard
 */
router.get('/', (req, res) => {
  res.redirect('/my-work');
});

/**
 * GET /login
 * Login page
 */
router.get('/login', (req, res) => {
  sendView(res, 'login.html');
});

/**
 * GET /workflow
 * Deprecated — redirect to /my-work
 */
router.get('/workflow', (req, res) => {
  res.redirect('/my-work');
});

/**
 * GET /issues
 * Issues dashboard page
 */
router.get('/issues', (req, res) => {
  sendView(res, 'issues.html');
});

/**
 * GET /library
 * Unified library page (books + chapter + images)
 */
router.get('/library', (req, res) => {
  sendView(res, 'books.html');
});

/**
 * GET /images
 * Redirect to library page (images view)
 */
router.get('/images', (req, res) => {
  res.redirect('/library?view=images');
});

/**
 * GET /segment-editor
 * Segment-level linguistic editor
 */
router.get('/segment-editor', (req, res) => {
  sendView(res, 'segment-editor.html');
});

/**
 * GET /reviews
 * Review dashboard page
 */
router.get('/reviews', (req, res) => {
  sendView(res, 'reviews.html');
});

/**
 * GET /review-queue
 * Cross-chapter review queue
 */
router.get('/review-queue', (req, res) => {
  sendView(res, 'review-queue.html');
});

/**
 * GET /status
 * Status overview page
 */
router.get('/status', (req, res) => {
  sendView(res, 'status.html');
});

/**
 * GET /dashboard
 * Head editor dashboard with attention items, workload, and activity
 */
router.get('/dashboard', (req, res) => {
  sendView(res, 'dashboard.html');
});

/**
 * GET /pipeline
 * Pipeline flow dashboard with Nordic design
 */
router.get('/pipeline', (req, res) => {
  sendView(res, 'pipeline-dashboard.html');
});

/**
 * GET /books
 * Book management page
 */
router.get('/books', (req, res) => {
  sendView(res, 'books.html');
});

/**
 * GET /books/:bookId
 * Book detail page (serves same view, auto-loads book)
 */
router.get('/books/:bookId', (req, res) => {
  sendView(res, 'books.html');
});

/**
 * GET /editor
 * Legacy editor redirect → segment editor
 */
router.get('/editor', (req, res) => {
  const { book, chapter, module } = req.query;
  const params = new URLSearchParams();
  if (book) params.set('book', book);
  if (chapter) params.set('chapter', chapter);
  if (module) params.set('module', module);
  const qs = params.toString();
  res.redirect('/segment-editor' + (qs ? `?${qs}` : ''));
});

/**
 * GET /terminology
 * Terminology database page
 */
router.get('/terminology', (req, res) => {
  sendView(res, 'terminology.html');
});

/**
 * GET /my-work
 * Translator's personal work dashboard
 */
router.get('/my-work', (req, res) => {
  sendView(res, 'my-work.html');
});

/**
 * GET /chapter
 * Redirect to library page (chapter view)
 */
router.get('/chapter', (req, res) => {
  const { book, chapter } = req.query;
  const params = new URLSearchParams();
  params.set('view', 'chapter');
  if (book) params.set('book', book);
  if (chapter) params.set('chapter', chapter);
  res.redirect('/library?' + params.toString());
});

/**
 * GET /analytics
 * Usage analytics dashboard
 */
router.get('/analytics', (req, res) => {
  sendView(res, 'analytics.html');
});

/**
 * GET /localization-editor
 * Segment-level localization editor (Pass 2)
 */
router.get('/localization-editor', (req, res) => {
  sendView(res, 'localization-editor.html');
});

/**
 * GET /localization-review
 * Deprecated — redirect to /localization-editor
 */
router.get('/localization-review', (req, res) => {
  res.redirect('/localization-editor');
});

/**
 * GET /feedback
 * Public feedback form
 */
router.get('/feedback', (req, res) => {
  sendView(res, 'feedback.html');
});

/**
 * GET /admin
 * Admin dashboard
 */
router.get('/admin', (req, res) => {
  sendView(res, 'admin.html');
});

/**
 * GET /admin/users
 * User management page
 */
router.get('/admin/users', (req, res) => {
  sendView(res, 'admin-users.html');
});

/**
 * GET /admin/books
 * Book catalogue management page
 */
router.get('/admin/books', (req, res) => {
  sendView(res, 'admin-books.html');
});

/**
 * GET /admin/feedback
 * Admin feedback dashboard
 */
router.get('/admin/feedback', (req, res) => {
  sendView(res, 'feedback-admin.html');
});

/**
 * GET /for-teachers
 * Teacher guide page
 */
router.get('/for-teachers', (req, res) => {
  sendView(res, 'teacher-guide.html');
});

/**
 * Catch-all 404 handler — must be registered last
 */
router.use((req, res) => {
  const filePath = path.join(viewsDir, '404.html');
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).send('Síða finnst ekki');
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
    res.status(404).send('Síða finnst ekki');
  }
}

module.exports = router;
