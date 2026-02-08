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
const { execFileSync } = require('child_process');
const path = require('path');

const editorHistory = require('../services/editorHistory');
const notifications = require('../services/notifications');
const activityLog = require('../services/activityLog');
const { calculateEscalationLevel } = require('../services/issueClassifier');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');

// SLA Configuration
const REVIEW_SLA = {
  targetDays: 2, // Target: review within 2 days
  warningDays: 3, // Warning at 3 days
  criticalDays: 5, // Critical at 5 days
  maxDays: 7, // Maximum acceptable: 7 days
};

/**
 * Calculate SLA status for a review
 * @param {string} submittedAt - ISO date string of when review was submitted
 * @returns {object} SLA status info
 */
function calculateSLAStatus(submittedAt) {
  const submitted = new Date(submittedAt);
  const now = new Date();
  const diffMs = now - submitted;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const daysPending = Math.floor(diffDays);
  const hoursPending = Math.floor((diffMs / (1000 * 60 * 60)) % 24);

  // Calculate percentage of SLA used
  const slaPercentage = Math.round((diffDays / REVIEW_SLA.targetDays) * 100);

  // Determine status
  let status = 'on-track';
  let statusLabel = 'Á réttri leið';
  let statusClass = 'sla-on-track';

  if (diffDays >= REVIEW_SLA.criticalDays) {
    status = 'critical';
    statusLabel = 'Mjög seint';
    statusClass = 'sla-critical';
  } else if (diffDays >= REVIEW_SLA.warningDays) {
    status = 'overdue';
    statusLabel = 'Yfir tíma';
    statusClass = 'sla-overdue';
  } else if (diffDays >= REVIEW_SLA.targetDays) {
    status = 'at-risk';
    statusLabel = 'Á mörkum';
    statusClass = 'sla-at-risk';
  }

  // Time remaining or overdue
  const remainingDays = REVIEW_SLA.targetDays - diffDays;
  let timeMessage;
  if (remainingDays > 0) {
    const remainingHours = Math.round(remainingDays * 24);
    if (remainingHours < 24) {
      timeMessage = `${remainingHours} klst. eftir`;
    } else {
      timeMessage = `${Math.floor(remainingDays)} d. eftir`;
    }
  } else {
    const overdueDays = Math.abs(remainingDays);
    if (overdueDays < 1) {
      timeMessage = `${Math.round(overdueDays * 24)} klst. yfir`;
    } else {
      timeMessage = `${Math.floor(overdueDays)} d. yfir tíma`;
    }
  }

  return {
    daysPending,
    hoursPending,
    slaPercentage: Math.min(slaPercentage, 200), // Cap at 200%
    status,
    statusLabel,
    statusClass,
    timeMessage,
    isOverdue: diffDays >= REVIEW_SLA.targetDays,
    isCritical: diffDays >= REVIEW_SLA.criticalDays,
    target: {
      days: REVIEW_SLA.targetDays,
      label: `Markmið: ${REVIEW_SLA.targetDays} dagar`,
    },
  };
}

/**
 * GET /api/reviews
 * List all pending reviews (admin/head-editor only)
 */
router.get('/', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book, includeEscalation = 'true' } = req.query;

  try {
    let reviews = editorHistory.getPendingReviews(book || null);

    // Add escalation and SLA info
    reviews = reviews.map((review) => {
      const escalation =
        includeEscalation === 'true'
          ? calculateEscalationLevel(review.submittedAt, 'reviewPending')
          : null;
      const sla = calculateSLAStatus(review.submittedAt);

      return {
        ...review,
        escalation: escalation
          ? {
              level: escalation.level,
              daysPending: escalation.days,
              message: escalation.message,
              shouldEscalate: escalation.shouldEscalate,
            }
          : null,
        sla,
      };
    });

    // Sort by SLA status (critical first), then by days pending
    reviews.sort((a, b) => {
      const statusOrder = { critical: 0, overdue: 1, 'at-risk': 2, 'on-track': 3 };
      const statusDiff = statusOrder[a.sla.status] - statusOrder[b.sla.status];
      if (statusDiff !== 0) return statusDiff;
      return b.sla.daysPending - a.sla.daysPending;
    });

    // Calculate SLA stats
    const slaStats = {
      total: reviews.length,
      onTrack: reviews.filter((r) => r.sla.status === 'on-track').length,
      atRisk: reviews.filter((r) => r.sla.status === 'at-risk').length,
      overdue: reviews.filter((r) => r.sla.status === 'overdue').length,
      critical: reviews.filter((r) => r.sla.status === 'critical').length,
      oldest: reviews.length > 0 ? reviews[0] : null,
      avgDaysPending:
        reviews.length > 0
          ? Math.round(
              (reviews.reduce((sum, r) => sum + r.sla.daysPending, 0) / reviews.length) * 10
            ) / 10
          : 0,
      target: REVIEW_SLA,
    };

    // Legacy escalation stats for backwards compatibility
    const escalationStats = {
      critical: reviews.filter((r) => r.escalation?.level === 'critical').length,
      warning: reviews.filter((r) => r.escalation?.level === 'warning').length,
      notice: reviews.filter((r) => r.escalation?.level === 'notice').length,
      oldest: reviews.length > 0 ? reviews[0] : null,
    };

    res.json({
      count: reviews.length,
      reviews,
      slaStats,
      escalationStats,
    });
  } catch (err) {
    console.error('Error listing reviews:', err);
    res.status(500).json({
      error: 'Failed to list reviews',
      message: err.message,
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
      message: err.message,
    });
  }
});

/**
 * GET /api/reviews/sla
 * Get SLA statistics for reviews
 */
router.get('/sla', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { book } = req.query;

  try {
    const reviews = editorHistory.getPendingReviews(book || null);

    // Calculate SLA for each review
    const reviewsWithSLA = reviews.map((r) => ({
      ...r,
      sla: calculateSLAStatus(r.submittedAt),
    }));

    // Sort by urgency
    reviewsWithSLA.sort((a, b) => {
      const statusOrder = { critical: 0, overdue: 1, 'at-risk': 2, 'on-track': 3 };
      return statusOrder[a.sla.status] - statusOrder[b.sla.status];
    });

    // Calculate statistics
    const stats = {
      total: reviews.length,
      byStatus: {
        onTrack: reviewsWithSLA.filter((r) => r.sla.status === 'on-track').length,
        atRisk: reviewsWithSLA.filter((r) => r.sla.status === 'at-risk').length,
        overdue: reviewsWithSLA.filter((r) => r.sla.status === 'overdue').length,
        critical: reviewsWithSLA.filter((r) => r.sla.status === 'critical').length,
      },
      avgDaysPending:
        reviews.length > 0
          ? Math.round(
              (reviewsWithSLA.reduce((sum, r) => sum + r.sla.daysPending, 0) / reviews.length) * 10
            ) / 10
          : 0,
      oldest: reviewsWithSLA[0] || null,
      slaPerformance:
        reviews.length > 0
          ? Math.round(
              (reviewsWithSLA.filter((r) => r.sla.status === 'on-track').length / reviews.length) *
                100
            )
          : 100,
      config: REVIEW_SLA,
    };

    res.json(stats);
  } catch (err) {
    console.error('Error getting SLA stats:', err);
    res.status(500).json({
      error: 'Failed to get SLA stats',
      message: err.message,
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
        message: `No review found with ID ${id}`,
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
      enContent,
    });
  } catch (err) {
    console.error('Error getting review:', err);
    res.status(500).json({
      error: 'Failed to get review',
      message: err.message,
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
        message: `No review found with ID ${id}`,
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        error: 'Review not pending',
        message: 'This review has already been processed',
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

    // Log the activity
    activityLog.logReviewApproved(
      req.user,
      review.submittedByUsername,
      review.book,
      review.chapter,
      review.section,
      parseInt(id),
      commitSha
    );

    // Notify the editor that their review was approved
    try {
      await notifications.notifyReviewApproved(
        { ...review, reviewedByUsername: req.user.username },
        { id: review.submittedBy, email: null } // Email would come from user lookup
      );
    } catch (notifyErr) {
      console.error('Failed to send approval notification:', notifyErr);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      review: result.review,
      committed: !!commitSha,
      commitSha,
    });
  } catch (err) {
    console.error('Error approving review:', err);
    res.status(500).json({
      error: 'Failed to approve review',
      message: err.message,
    });
  }
});

/**
 * POST /api/reviews/bulk/approve
 * Bulk approve multiple reviews
 *
 * Body:
 *   - reviewIds: Array of review IDs to approve
 *   - commit: Whether to commit each approval to git (default: false)
 */
router.post('/bulk/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), async (req, res) => {
  const { reviewIds, commit = false } = req.body;

  if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid reviewIds',
      message: 'reviewIds must be a non-empty array of review IDs',
    });
  }

  const results = {
    approved: [],
    failed: [],
    skipped: [],
  };

  for (const id of reviewIds) {
    try {
      const review = editorHistory.getReview(parseInt(id));

      if (!review) {
        results.failed.push({ id, error: 'Review not found' });
        continue;
      }

      if (review.status !== 'pending') {
        results.skipped.push({ id, reason: 'Already processed' });
        continue;
      }

      let commitSha = null;

      // Optionally commit to git
      if (commit) {
        try {
          commitSha = await commitApprovedReview(review, req.user);
        } catch (gitErr) {
          console.error(`Git commit error for review ${id}:`, gitErr);
        }
      }

      // Mark as approved
      const result = editorHistory.approveReview(
        parseInt(id),
        req.user.id,
        req.user.username,
        commitSha
      );

      if (result.success) {
        results.approved.push({
          id,
          book: review.book,
          chapter: review.chapter,
          section: review.section,
          commitSha,
        });

        // Log the activity
        activityLog.logReviewApproved(
          req.user,
          review.submittedByUsername,
          review.book,
          review.chapter,
          review.section,
          parseInt(id),
          commitSha
        );

        // Try to notify (don't wait)
        notifications
          .notifyReviewApproved(
            { ...review, reviewedByUsername: req.user.username },
            { id: review.submittedBy, email: null }
          )
          .catch((err) => console.error('Notification error:', err));
      } else {
        results.failed.push({ id, error: result.error || 'Unknown error' });
      }
    } catch (err) {
      console.error(`Error approving review ${id}:`, err);
      results.failed.push({ id, error: err.message });
    }
  }

  res.json({
    success: results.failed.length === 0,
    summary: {
      total: reviewIds.length,
      approved: results.approved.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
    },
    results,
  });
});

/**
 * POST /api/reviews/:id/changes
 * Request changes on a review
 */
router.post('/:id/changes', requireAuth, requireRole(ROLES.HEAD_EDITOR), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  if (!notes || typeof notes !== 'string') {
    return res.status(400).json({
      error: 'Invalid notes',
      message: 'Notes are required when requesting changes',
    });
  }

  try {
    const review = editorHistory.getReview(parseInt(id));

    if (!review) {
      return res.status(404).json({
        error: 'Review not found',
        message: `No review found with ID ${id}`,
      });
    }

    const result = editorHistory.requestChanges(
      parseInt(id),
      req.user.id,
      req.user.username,
      notes
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log the activity
    activityLog.logChangesRequested(
      req.user,
      review.submittedByUsername,
      review.book,
      review.chapter,
      review.section,
      parseInt(id),
      notes
    );

    // Notify the editor that changes were requested
    try {
      await notifications.notifyChangesRequested(
        { ...review, reviewedByUsername: req.user.username },
        { id: review.submittedBy, email: null },
        notes
      );
    } catch (notifyErr) {
      console.error('Failed to send changes requested notification:', notifyErr);
    }

    res.json({
      success: true,
      review: result.review,
    });
  } catch (err) {
    console.error('Error requesting changes:', err);
    res.status(500).json({
      error: 'Failed to request changes',
      message: err.message,
    });
  }
});

/**
 * Commit approved review to git
 * @param {Object} review - The review object
 * @param {Object} admin - The admin user approving the review
 * @returns {string} The commit SHA
 */
async function commitApprovedReview(review, admin) {
  const projectRoot = editorHistory.PROJECT_ROOT;
  const filePath = editorHistory.getFilePath(review.book, review.chapter, review.section);
  const relativePath = path.relative(projectRoot, filePath);

  try {
    // Stage the file
    execFileSync('git', ['add', relativePath], { cwd: projectRoot });

    // Create commit message
    const commitMessage = `feat(translation): ${review.section} reviewed by ${review.submittedByUsername}

Approved by: ${admin.username}
Book: ${review.book}
Chapter: ${review.chapter}
Section: ${review.section}

Co-Authored-By: ${review.submittedByUsername} <${review.submittedBy}@users.noreply.github.com>`;

    // Commit
    execFileSync('git', ['commit', '-m', commitMessage], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: admin.name || admin.username,
        GIT_AUTHOR_EMAIL: `${admin.id}@users.noreply.github.com`,
        GIT_COMMITTER_NAME: admin.name || admin.username,
        GIT_COMMITTER_EMAIL: `${admin.id}@users.noreply.github.com`,
      },
    });

    // Get the commit SHA
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();

    // Log the commit creation
    activityLog.logCommitCreated(admin, review.book, review.chapter, review.section, sha);

    // Push to origin (optional, may fail if no push access)
    try {
      execFileSync('git', ['push', 'origin', 'HEAD'], { cwd: projectRoot });
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
