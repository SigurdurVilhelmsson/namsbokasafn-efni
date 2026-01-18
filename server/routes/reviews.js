/**
 * Reviews Routes
 *
 * API endpoints for the admin review dashboard.
 *
 * Endpoints:
 *   GET  /api/reviews                List pending reviews
 *   GET  /api/reviews/count          Get pending review count
 *   GET  /api/reviews/:id            Get review details
 *   POST /api/reviews/:id/approve    Approve a review
 *   POST /api/reviews/:id/changes    Request changes on a review
 */

const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const path = require('path');

const editorHistory = require('../services/editorHistory');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

/**
 * GET /api/reviews
 * List all pending reviews (admin/head-editor only)
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.query;

  try {
    const reviews = editorHistory.getPendingReviews(book || null);

    res.json({
      count: reviews.length,
      reviews
    });
  } catch (err) {
    console.error('Error listing reviews:', err);
    res.status(500).json({
      error: 'Failed to list reviews',
      message: err.message
    });
  }
});

/**
 * GET /api/reviews/count
 * Get pending review count (for dashboard badge)
 */
router.get('/count', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.query;

  try {
    const count = editorHistory.getPendingReviewCount(book || null);

    res.json({ count });
  } catch (err) {
    console.error('Error getting review count:', err);
    res.status(500).json({
      error: 'Failed to get review count',
      message: err.message
    });
  }
});

/**
 * GET /api/reviews/:id
 * Get review details including content and diff
 */
router.get('/:id', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const review = editorHistory.getReview(parseInt(id));

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: `No review found with ID ${id}`
      });
    }

    // Get current content on disk for comparison
    const currentContent = editorHistory.getCurrentContent(
      review.book,
      review.chapter,
      review.section
    );

    // Get EN source for context
    const enContent = editorHistory.loadSectionContent(
      review.book,
      parseInt(review.chapter),
      review.section
    ).en;

    res.json({
      ...review,
      currentContent,
      enContent
    });
  } catch (err) {
    console.error('Error getting review:', err);
    res.status(500).json({
      error: 'Failed to get review',
      message: err.message
    });
  }
});

/**
 * POST /api/reviews/:id/approve
 * Approve a review and optionally commit to git
 */
router.post('/:id/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), async (req, res) => {
  const { id } = req.params;
  const { commit = false } = req.body;

  try {
    const review = editorHistory.getReview(parseInt(id));

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: `No review found with ID ${id}`
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        error: 'Review not pending',
        message: 'This review has already been processed'
      });
    }

    let commitSha = null;

    // Optionally commit to git
    if (commit) {
      try {
        commitSha = await commitApprovedReview(review, req.user);
      } catch (gitErr) {
        console.error('Git commit error:', gitErr);
        // Don't fail the approval if git fails
      }
    }

    // Mark as approved
    const result = editorHistory.approveReview(
      parseInt(id),
      req.user.id,
      req.user.username,
      commitSha
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      review: result.review,
      committed: !!commitSha,
      commitSha
    });
  } catch (err) {
    console.error('Error approving review:', err);
    res.status(500).json({
      error: 'Failed to approve review',
      message: err.message
    });
  }
});

/**
 * POST /api/reviews/:id/changes
 * Request changes on a review
 */
router.post('/:id/changes', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  if (!notes || typeof notes !== 'string') {
    return res.status(400).json({
      error: 'Invalid notes',
      message: 'Notes are required when requesting changes'
    });
  }

  try {
    const result = editorHistory.requestChanges(
      parseInt(id),
      req.user.id,
      req.user.username,
      notes
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      review: result.review
    });
  } catch (err) {
    console.error('Error requesting changes:', err);
    res.status(500).json({
      error: 'Failed to request changes',
      message: err.message
    });
  }
});

/**
 * Commit approved review to git
 */
async function commitApprovedReview(review, admin) {
  const projectRoot = editorHistory.PROJECT_ROOT;
  const filePath = editorHistory.getFilePath(review.book, review.chapter, review.section);
  const relativePath = path.relative(projectRoot, filePath);

  try {
    // Stage the file
    execSync(`git add "${relativePath}"`, { cwd: projectRoot });

    // Create commit message
    const commitMessage = `feat(translation): ${review.section} reviewed by ${review.submittedByUsername}

Approved by: ${admin.username}
Book: ${review.book}
Chapter: ${review.chapter}
Section: ${review.section}

Co-Authored-By: ${review.submittedByUsername} <${review.submittedBy}@users.noreply.github.com>`;

    // Commit
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      cwd: projectRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: admin.name || admin.username,
        GIT_AUTHOR_EMAIL: `${admin.id}@users.noreply.github.com`,
        GIT_COMMITTER_NAME: admin.name || admin.username,
        GIT_COMMITTER_EMAIL: `${admin.id}@users.noreply.github.com`
      }
    });

    // Get the commit SHA
    const sha = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();

    // Push to origin (optional, may fail if no push access)
    try {
      execSync('git push origin HEAD', { cwd: projectRoot });
    } catch (pushErr) {
      console.warn('Git push failed (may need manual push):', pushErr.message);
    }

    return sha;
  } catch (err) {
    console.error('Git operation failed:', err);
    throw err;
  }
}

module.exports = router;
