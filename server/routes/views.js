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
 * GET /editor
 * Markdown editor page
 */
router.get('/editor', (req, res) => {
  sendView(res, 'editor.html');
});

/**
 * GET /reviews
 * Review dashboard page
 */
router.get('/reviews', (req, res) => {
  sendView(res, 'reviews.html');
});

/**
 * GET /status
 * Status overview page
 */
router.get('/status', (req, res) => {
  sendView(res, 'status.html');
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
 * GET /decisions
 * Consolidated decision log page
 */
router.get('/decisions', (req, res) => {
  sendView(res, 'decisions.html');
});

/**
 * GET /my-work
 * Translator's personal work dashboard
 */
router.get('/my-work', (req, res) => {
  sendView(res, 'my-work.html');
});

/**
 * GET /assignments
 * Chapter assignment board for admin/head editor
 */
router.get('/assignments', (req, res) => {
  sendView(res, 'assignments.html');
});

/**
 * GET /meetings
 * Meeting agenda generator
 */
router.get('/meetings', (req, res) => {
  sendView(res, 'meetings.html');
});

/**
 * GET /deadlines
 * Deadline tracking dashboard
 */
router.get('/deadlines', (req, res) => {
  sendView(res, 'deadlines.html');
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
