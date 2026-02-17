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
 * Redirect to workflow or login
 */
router.get('/', (req, res) => {
  res.redirect('/workflow');
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
 * Workflow wizard page
 */
router.get('/workflow', (req, res) => {
  sendView(res, 'workflow.html');
});

/**
 * GET /issues
 * Issues dashboard page
 */
router.get('/issues', (req, res) => {
  sendView(res, 'issues.html');
});

/**
 * GET /images
 * Image tracker page
 */
router.get('/images', (req, res) => {
  sendView(res, 'images.html');
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
 * Chapter control panel for admin/head editor
 */
router.get('/chapter', (req, res) => {
  sendView(res, 'chapter.html');
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
 * Split-panel localization review page
 */
router.get('/localization-review', (req, res) => {
  sendView(res, 'localization-review.html');
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
 * Helper to send a view file
 */
function sendView(res, filename) {
  const filePath = path.join(viewsDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Page not found');
  }
}

module.exports = router;
