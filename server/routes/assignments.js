/**
 * Assignments Routes
 *
 * CRUD API endpoints for managing translation task assignments.
 *
 * Endpoints:
 *   GET    /api/assignments          List all assignments (with filters)
 *   GET    /api/assignments/:id      Get assignment by ID
 *   POST   /api/assignments          Create new assignment
 *   PUT    /api/assignments/:id      Update assignment
 *   DELETE /api/assignments/:id      Cancel/delete assignment
 *   GET    /api/assignments/overview Get team overview (admin)
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/requireAuth');
const { requireEditor, requireHeadEditor } = require('../middleware/requireRole');
const assignmentStore = require('../services/assignmentStore');
const activityLog = require('../services/activityLog');

// Stage labels for display
const STAGE_LABELS = {
  'enMarkdown': 'EN Markdown',
  'mtOutput': 'Vélþýðing',
  'linguisticReview': 'Yfirferð 1',
  'editorialPass1': 'Yfirferð 1',
  'tmCreated': 'Þýðingaminni',
  'editorialPass2': 'Yfirferð 2',
  'publication': 'Útgáfa'
};

// Book labels
const BOOK_LABELS = {
  'efnafraedi': 'Efnafræði',
  'liffraedi': 'Líffræði'
};

/**
 * GET /api/assignments
 * List all assignments, optionally filtered
 *
 * Query params:
 *   - book: Filter by book
 *   - chapter: Filter by chapter number
 *   - stage: Filter by stage
 *   - assignedTo: Filter by assignee username
 *   - status: Filter by status (pending, completed, cancelled)
 *   - includeCompleted: Include completed assignments (default: false)
 */
router.get('/', requireAuth, requireEditor(), (req, res) => {
  const { book, chapter, stage, assignedTo, status, includeCompleted } = req.query;

  try {
    let assignments = assignmentStore.getAllPendingAssignments();

    // Include completed if requested (for history view)
    if (includeCompleted === 'true') {
      const allAssignments = require('fs').existsSync(
        require('path').join(__dirname, '..', 'data', 'assignments.json')
      ) ? JSON.parse(require('fs').readFileSync(
        require('path').join(__dirname, '..', 'data', 'assignments.json'),
        'utf-8'
      )) : [];
      assignments = allAssignments;
    }

    // Apply filters
    if (book) {
      assignments = assignments.filter(a => a.book === book);
    }
    if (chapter) {
      assignments = assignments.filter(a => a.chapter === parseInt(chapter));
    }
    if (stage) {
      assignments = assignments.filter(a => a.stage === stage);
    }
    if (assignedTo) {
      assignments = assignments.filter(a => a.assignedTo === assignedTo);
    }
    if (status) {
      assignments = assignments.filter(a => a.status === status);
    }

    // Enrich with labels
    const enrichedAssignments = assignments.map(a => ({
      ...a,
      bookLabel: BOOK_LABELS[a.book] || a.book,
      stageLabel: STAGE_LABELS[a.stage] || a.stage,
      dueInfo: getDueDateInfo(a.dueDate)
    }));

    // Sort by due date (soonest first), then by assigned date
    enrichedAssignments.sort((a, b) => {
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return new Date(b.assignedAt) - new Date(a.assignedAt);
    });

    res.json({
      assignments: enrichedAssignments,
      total: enrichedAssignments.length,
      filters: { book, chapter, stage, assignedTo, status }
    });

  } catch (err) {
    console.error('Error listing assignments:', err);
    res.status(500).json({
      error: 'Failed to list assignments',
      message: err.message
    });
  }
});

/**
 * GET /api/assignments/overview
 * Get team workload overview (admin view)
 */
router.get('/overview', requireAuth, requireHeadEditor(), (req, res) => {
  try {
    const assignments = assignmentStore.getAllPendingAssignments();

    // Group by assignee
    const byAssignee = {};
    const unassigned = [];

    for (const a of assignments) {
      if (!a.assignedTo) {
        unassigned.push(a);
        continue;
      }

      if (!byAssignee[a.assignedTo]) {
        byAssignee[a.assignedTo] = {
          username: a.assignedTo,
          assignments: [],
          totalAssignments: 0,
          overdueCount: 0,
          dueSoonCount: 0
        };
      }

      const dueInfo = getDueDateInfo(a.dueDate);
      if (dueInfo?.status === 'overdue') {
        byAssignee[a.assignedTo].overdueCount++;
      } else if (dueInfo?.status === 'today' || dueInfo?.status === 'soon') {
        byAssignee[a.assignedTo].dueSoonCount++;
      }

      byAssignee[a.assignedTo].assignments.push({
        ...a,
        bookLabel: BOOK_LABELS[a.book] || a.book,
        stageLabel: STAGE_LABELS[a.stage] || a.stage,
        dueInfo
      });
      byAssignee[a.assignedTo].totalAssignments++;
    }

    // Group by chapter (for pipeline view)
    const byChapter = {};
    for (const a of assignments) {
      const key = `${a.book}-${a.chapter}`;
      if (!byChapter[key]) {
        byChapter[key] = {
          book: a.book,
          bookLabel: BOOK_LABELS[a.book] || a.book,
          chapter: a.chapter,
          assignments: []
        };
      }
      byChapter[key].assignments.push({
        ...a,
        stageLabel: STAGE_LABELS[a.stage] || a.stage,
        dueInfo: getDueDateInfo(a.dueDate)
      });
    }

    // Calculate totals
    const totals = {
      totalAssignments: assignments.length,
      totalOverdue: Object.values(byAssignee).reduce((sum, u) => sum + u.overdueCount, 0),
      totalDueSoon: Object.values(byAssignee).reduce((sum, u) => sum + u.dueSoonCount, 0),
      unassignedCount: unassigned.length,
      activeEditors: Object.keys(byAssignee).length
    };

    res.json({
      totals,
      byAssignee: Object.values(byAssignee),
      byChapter: Object.values(byChapter),
      unassigned: unassigned.map(a => ({
        ...a,
        bookLabel: BOOK_LABELS[a.book] || a.book,
        stageLabel: STAGE_LABELS[a.stage] || a.stage
      }))
    });

  } catch (err) {
    console.error('Error getting overview:', err);
    res.status(500).json({
      error: 'Failed to get overview',
      message: err.message
    });
  }
});

/**
 * GET /api/assignments/:id
 * Get assignment by ID
 */
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const assignment = assignmentStore.getAssignmentById(id);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    // Check access - editors can see all, others only their own
    if (req.user.role !== 'admin' &&
        req.user.role !== 'head-editor' &&
        req.user.role !== 'editor' &&
        assignment.assignedTo !== req.user.username) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      ...assignment,
      bookLabel: BOOK_LABELS[assignment.book] || assignment.book,
      stageLabel: STAGE_LABELS[assignment.stage] || assignment.stage,
      dueInfo: getDueDateInfo(assignment.dueDate)
    });

  } catch (err) {
    console.error('Error getting assignment:', err);
    res.status(500).json({
      error: 'Failed to get assignment',
      message: err.message
    });
  }
});

/**
 * POST /api/assignments
 * Create new assignment
 *
 * Body:
 *   - book: Book identifier (required)
 *   - chapter: Chapter number (required)
 *   - stage: Pipeline stage (required)
 *   - assignedTo: Username of assignee (required)
 *   - dueDate: Due date (ISO string, optional)
 *   - notes: Notes for the assignee (optional)
 *   - priority: Priority level 1-3 (optional, default 2)
 */
router.post('/', requireAuth, requireHeadEditor(), (req, res) => {
  const { book, chapter, stage, assignedTo, dueDate, notes, priority } = req.body;

  // Validate required fields
  if (!book || !chapter || !stage || !assignedTo) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['book', 'chapter', 'stage', 'assignedTo']
    });
  }

  // Validate stage
  if (!STAGE_LABELS[stage]) {
    return res.status(400).json({
      error: 'Invalid stage',
      validStages: Object.keys(STAGE_LABELS)
    });
  }

  // Validate book
  if (!BOOK_LABELS[book]) {
    return res.status(400).json({
      error: 'Invalid book',
      validBooks: Object.keys(BOOK_LABELS)
    });
  }

  try {
    const assignment = assignmentStore.createAssignment({
      book,
      chapter: parseInt(chapter),
      stage,
      assignedTo,
      assignedBy: req.user.username,
      dueDate: dueDate || null,
      notes: notes || null,
      priority: priority || 2
    });

    // Log activity
    activityLog.log({
      userId: req.user.id,
      action: 'assignment_created',
      details: `Assigned ${book} chapter ${chapter} (${stage}) to ${assignedTo}`,
      metadata: {
        assignmentId: assignment.id,
        book,
        chapter,
        stage,
        assignedTo
      }
    });

    res.status(201).json({
      success: true,
      assignment: {
        ...assignment,
        bookLabel: BOOK_LABELS[assignment.book] || assignment.book,
        stageLabel: STAGE_LABELS[assignment.stage] || assignment.stage
      }
    });

  } catch (err) {
    console.error('Error creating assignment:', err);
    res.status(500).json({
      error: 'Failed to create assignment',
      message: err.message
    });
  }
});

/**
 * PUT /api/assignments/:id
 * Update assignment
 *
 * Body (all optional):
 *   - assignedTo: Reassign to different user
 *   - dueDate: Update due date
 *   - notes: Update notes
 *   - priority: Update priority
 *   - status: Update status (complete, cancel)
 */
router.put('/:id', requireAuth, requireEditor(), (req, res) => {
  const { id } = req.params;
  const { assignedTo, dueDate, notes, priority, status } = req.body;

  try {
    const assignment = assignmentStore.getAssignmentById(id);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    // Check permissions - head editors can reassign, editors can only update their own
    if (req.user.role !== 'admin' && req.user.role !== 'head-editor') {
      if (assignment.assignedTo !== req.user.username) {
        return res.status(403).json({
          error: 'Cannot modify assignments assigned to others'
        });
      }
      // Regular editors can only update status of their own assignments
      if (assignedTo !== undefined) {
        return res.status(403).json({
          error: 'Cannot reassign - head editor access required'
        });
      }
    }

    // Handle status changes
    if (status === 'completed') {
      const completed = assignmentStore.completeAssignment(id, req.user.username);
      if (completed) {
        activityLog.log({
          userId: req.user.id,
          action: 'assignment_completed',
          details: `Completed ${assignment.book} chapter ${assignment.chapter}`,
          metadata: { assignmentId: id }
        });
        return res.json({
          success: true,
          assignment: completed
        });
      }
    }

    if (status === 'cancelled') {
      const cancelled = assignmentStore.cancelAssignment(id, req.user.username, notes || 'Cancelled');
      if (cancelled) {
        activityLog.log({
          userId: req.user.id,
          action: 'assignment_cancelled',
          details: `Cancelled ${assignment.book} chapter ${assignment.chapter}`,
          metadata: { assignmentId: id }
        });
        return res.json({
          success: true,
          assignment: cancelled
        });
      }
    }

    // For other updates, we need to modify the assignment in place
    // This requires extending the assignmentStore
    // For now, create a new assignment to replace it
    if (assignedTo !== undefined || dueDate !== undefined || notes !== undefined || priority !== undefined) {
      const updatedAssignment = assignmentStore.createAssignment({
        ...assignment,
        assignedTo: assignedTo !== undefined ? assignedTo : assignment.assignedTo,
        assignedBy: req.user.username,
        dueDate: dueDate !== undefined ? dueDate : assignment.dueDate,
        notes: notes !== undefined ? notes : assignment.notes,
        priority: priority !== undefined ? priority : assignment.priority
      });

      activityLog.log({
        userId: req.user.id,
        action: 'assignment_updated',
        details: `Updated ${assignment.book} chapter ${assignment.chapter} assignment`,
        metadata: { assignmentId: id }
      });

      return res.json({
        success: true,
        assignment: {
          ...updatedAssignment,
          bookLabel: BOOK_LABELS[updatedAssignment.book] || updatedAssignment.book,
          stageLabel: STAGE_LABELS[updatedAssignment.stage] || updatedAssignment.stage
        }
      });
    }

    res.json({
      success: true,
      assignment: {
        ...assignment,
        bookLabel: BOOK_LABELS[assignment.book] || assignment.book,
        stageLabel: STAGE_LABELS[assignment.stage] || assignment.stage
      }
    });

  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(500).json({
      error: 'Failed to update assignment',
      message: err.message
    });
  }
});

/**
 * DELETE /api/assignments/:id
 * Cancel/delete assignment
 *
 * Query params:
 *   - reason: Cancellation reason (optional)
 */
router.delete('/:id', requireAuth, requireHeadEditor(), (req, res) => {
  const { id } = req.params;
  const { reason } = req.query;

  try {
    const assignment = assignmentStore.getAssignmentById(id);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    const cancelled = assignmentStore.cancelAssignment(
      id,
      req.user.username,
      reason || 'Deleted by admin'
    );

    if (!cancelled) {
      return res.status(500).json({
        error: 'Failed to cancel assignment'
      });
    }

    activityLog.log({
      userId: req.user.id,
      action: 'assignment_deleted',
      details: `Deleted ${assignment.book} chapter ${assignment.chapter} assignment`,
      metadata: { assignmentId: id, reason }
    });

    res.json({
      success: true,
      message: 'Assignment cancelled'
    });

  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({
      error: 'Failed to delete assignment',
      message: err.message
    });
  }
});

// Helper function
function getDueDateInfo(dueDate) {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  return {
    date: dueDate,
    formatted: due.toLocaleDateString('is-IS'),
    daysUntil,
    status: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil <= 3 ? 'soon' : 'normal'
  };
}

module.exports = router;
