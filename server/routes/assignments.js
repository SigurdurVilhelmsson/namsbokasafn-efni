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
const capacityStore = require('../services/capacityStore');

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
 * GET /api/assignments/capacity
 * Get team capacity overview with workload for all editors
 */
router.get('/capacity', requireAuth, requireHeadEditor(), (req, res) => {
  try {
    const assignments = assignmentStore.getAllPendingAssignments();
    const teamWorkload = capacityStore.getTeamWorkload(assignments);
    const defaults = capacityStore.getDefaults();

    // Calculate team totals
    const totals = {
      totalEditors: teamWorkload.length,
      available: teamWorkload.filter(w => w.status === 'available').length,
      nearlyFull: teamWorkload.filter(w => w.status === 'nearly-full').length,
      atCapacity: teamWorkload.filter(w => w.status === 'at-capacity').length,
      hasOverdue: teamWorkload.filter(w => w.status === 'has-overdue').length,
      totalAssignments: teamWorkload.reduce((sum, w) => sum + w.current.assignments, 0),
      totalOverdue: teamWorkload.reduce((sum, w) => sum + w.current.overdue, 0)
    };

    res.json({
      totals,
      defaults,
      editors: teamWorkload
    });

  } catch (err) {
    console.error('Error getting capacity overview:', err);
    res.status(500).json({
      error: 'Failed to get capacity overview',
      message: err.message
    });
  }
});

/**
 * GET /api/assignments/capacity/:username
 * Get capacity settings and current workload for a specific user
 */
router.get('/capacity/:username', requireAuth, requireEditor(), (req, res) => {
  const { username } = req.params;

  try {
    const assignments = assignmentStore.getAllPendingAssignments();
    const workload = capacityStore.calculateWorkload(username, assignments);

    res.json(workload);

  } catch (err) {
    console.error('Error getting user capacity:', err);
    res.status(500).json({
      error: 'Failed to get user capacity',
      message: err.message
    });
  }
});

/**
 * PUT /api/assignments/capacity/:username
 * Update capacity settings for a user
 *
 * Body:
 *   - weeklyChapters: Max chapters per week
 *   - maxConcurrent: Max concurrent assignments
 *   - availableHoursPerWeek: Available hours per week
 *   - notes: Optional notes about the user
 */
router.put('/capacity/:username', requireAuth, requireHeadEditor(), (req, res) => {
  const { username } = req.params;
  const { weeklyChapters, maxConcurrent, availableHoursPerWeek, notes } = req.body;

  try {
    const capacity = capacityStore.setUserCapacity(username, {
      weeklyChapters,
      maxConcurrent,
      availableHoursPerWeek,
      notes
    });

    activityLog.log({
      userId: req.user.id,
      action: 'capacity_updated',
      details: `Updated capacity for ${username}`,
      metadata: { username, capacity }
    });

    res.json({
      success: true,
      capacity
    });

  } catch (err) {
    console.error('Error updating capacity:', err);
    res.status(500).json({
      error: 'Failed to update capacity',
      message: err.message
    });
  }
});

/**
 * GET /api/assignments/check-capacity
 * Check if assigning work to a user would exceed their capacity
 *
 * Query params:
 *   - username: User to check
 *   - stage: Stage being assigned
 */
router.get('/check-capacity', requireAuth, requireEditor(), (req, res) => {
  const { username, stage } = req.query;

  if (!username) {
    return res.status(400).json({
      error: 'Missing username parameter'
    });
  }

  try {
    const assignments = assignmentStore.getAllPendingAssignments();
    const warning = capacityStore.checkCapacityWarning(username, assignments, stage || 'linguisticReview');

    res.json(warning);

  } catch (err) {
    console.error('Error checking capacity:', err);
    res.status(500).json({
      error: 'Failed to check capacity',
      message: err.message
    });
  }
});

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

    // Get team workload with capacity
    const teamWorkload = capacityStore.getTeamWorkload(assignments);

    // Group by assignee with capacity info
    const byAssignee = {};
    const unassigned = [];

    for (const a of assignments) {
      if (!a.assignedTo) {
        unassigned.push(a);
        continue;
      }

      if (!byAssignee[a.assignedTo]) {
        // Get capacity info from team workload
        const workload = teamWorkload.find(w => w.username === a.assignedTo) ||
          capacityStore.calculateWorkload(a.assignedTo, assignments);

        byAssignee[a.assignedTo] = {
          username: a.assignedTo,
          assignments: [],
          totalAssignments: 0,
          overdueCount: 0,
          dueSoonCount: 0,
          // Add capacity info
          capacity: workload.capacity,
          capacityStatus: workload.status,
          capacityMessage: workload.statusMessage,
          remainingCapacity: workload.remainingCapacity,
          percentages: workload.percentages
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

    // Calculate totals including capacity stats
    const assigneeValues = Object.values(byAssignee);
    const totals = {
      totalAssignments: assignments.length,
      totalOverdue: assigneeValues.reduce((sum, u) => sum + u.overdueCount, 0),
      totalDueSoon: assigneeValues.reduce((sum, u) => sum + u.dueSoonCount, 0),
      unassignedCount: unassigned.length,
      activeEditors: assigneeValues.length,
      // Capacity stats
      editorsAvailable: assigneeValues.filter(u => u.capacityStatus === 'available').length,
      editorsNearlyFull: assigneeValues.filter(u => u.capacityStatus === 'nearly-full').length,
      editorsAtCapacity: assigneeValues.filter(u => u.capacityStatus === 'at-capacity').length
    };

    res.json({
      totals,
      byAssignee: assigneeValues,
      byChapter: Object.values(byChapter),
      unassigned: unassigned.map(a => ({
        ...a,
        bookLabel: BOOK_LABELS[a.book] || a.book,
        stageLabel: STAGE_LABELS[a.stage] || a.stage
      })),
      capacityDefaults: capacityStore.getDefaults()
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
 * POST /api/assignments/bulk/assign
 * Bulk assign multiple chapters to a translator
 *
 * Body:
 *   - assignments: Array of { book, chapter, stage }
 *   - assignedTo: Username to assign all to
 *   - dueDate: Optional shared due date
 *   - notes: Optional shared notes
 *   - forceAssign: Override capacity limits
 */
router.post('/bulk/assign', requireAuth, requireHeadEditor(), (req, res) => {
  const { assignments, assignedTo, dueDate, notes, forceAssign = false } = req.body;

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({
      error: 'Invalid assignments',
      message: 'assignments must be a non-empty array'
    });
  }

  if (!assignedTo) {
    return res.status(400).json({
      error: 'Missing assignedTo',
      message: 'assignedTo is required for bulk assignment'
    });
  }

  const results = {
    created: [],
    failed: [],
    skipped: []
  };

  // Check capacity once for all assignments
  const allAssignments = assignmentStore.getAllPendingAssignments();
  const capacityWarning = capacityStore.checkCapacityWarning(
    assignedTo,
    allAssignments,
    assignments[0]?.stage || 'linguisticReview'
  );

  if (capacityWarning.hasErrors && !forceAssign) {
    return res.status(400).json({
      error: 'Capacity exceeded',
      message: capacityWarning.warnings[0]?.message || 'User at capacity',
      capacityWarning,
      hint: 'Set forceAssign=true to override capacity limits'
    });
  }

  for (const item of assignments) {
    if (!item.book || !item.chapter || !item.stage) {
      results.failed.push({
        item,
        error: 'Missing required fields (book, chapter, stage)'
      });
      continue;
    }

    // Check for existing assignment
    const existing = allAssignments.find(a =>
      a.book === item.book &&
      a.chapter === parseInt(item.chapter) &&
      a.stage === item.stage &&
      a.status === 'pending'
    );

    if (existing) {
      results.skipped.push({
        item,
        reason: 'Assignment already exists',
        existingId: existing.id
      });
      continue;
    }

    try {
      const assignment = assignmentStore.createAssignment({
        book: item.book,
        chapter: parseInt(item.chapter),
        stage: item.stage,
        assignedTo,
        assignedBy: req.user.username,
        dueDate: dueDate || null,
        notes: notes || null,
        priority: item.priority || 2
      });

      results.created.push({
        id: assignment.id,
        book: item.book,
        chapter: item.chapter,
        stage: item.stage
      });

    } catch (err) {
      results.failed.push({
        item,
        error: err.message
      });
    }
  }

  // Log bulk activity
  if (results.created.length > 0) {
    activityLog.log({
      userId: req.user.id,
      action: 'bulk_assignment_created',
      details: `Bulk assigned ${results.created.length} chapters to ${assignedTo}`,
      metadata: {
        assignedTo,
        created: results.created.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      }
    });
  }

  res.json({
    success: results.failed.length === 0,
    summary: {
      total: assignments.length,
      created: results.created.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    },
    results,
    capacityWarning: capacityWarning.hasWarnings ? capacityWarning : null
  });
});

/**
 * PUT /api/assignments/bulk/update
 * Bulk update multiple assignments
 *
 * Body:
 *   - assignmentIds: Array of assignment IDs to update
 *   - updates: Object with fields to update { assignedTo, dueDate, status, priority }
 */
router.put('/bulk/update', requireAuth, requireHeadEditor(), (req, res) => {
  const { assignmentIds, updates } = req.body;

  if (!assignmentIds || !Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid assignmentIds',
      message: 'assignmentIds must be a non-empty array'
    });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'Missing updates',
      message: 'updates object is required'
    });
  }

  const results = {
    updated: [],
    failed: [],
    skipped: []
  };

  for (const id of assignmentIds) {
    try {
      const assignment = assignmentStore.getAssignmentById(id);

      if (!assignment) {
        results.failed.push({ id, error: 'Assignment not found' });
        continue;
      }

      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        results.skipped.push({ id, reason: 'Assignment already finalized' });
        continue;
      }

      // Handle status changes
      if (updates.status === 'completed') {
        const completed = assignmentStore.completeAssignment(id, req.user.username);
        if (completed) {
          results.updated.push({ id, action: 'completed' });
        } else {
          results.failed.push({ id, error: 'Failed to complete' });
        }
        continue;
      }

      if (updates.status === 'cancelled') {
        const cancelled = assignmentStore.cancelAssignment(id, req.user.username, updates.notes || 'Bulk cancelled');
        if (cancelled) {
          results.updated.push({ id, action: 'cancelled' });
        } else {
          results.failed.push({ id, error: 'Failed to cancel' });
        }
        continue;
      }

      // For other updates, create a new assignment to replace
      const updatedAssignment = assignmentStore.createAssignment({
        ...assignment,
        assignedTo: updates.assignedTo !== undefined ? updates.assignedTo : assignment.assignedTo,
        assignedBy: req.user.username,
        dueDate: updates.dueDate !== undefined ? updates.dueDate : assignment.dueDate,
        notes: updates.notes !== undefined ? updates.notes : assignment.notes,
        priority: updates.priority !== undefined ? updates.priority : assignment.priority
      });

      results.updated.push({
        id,
        newId: updatedAssignment.id,
        action: 'updated'
      });

    } catch (err) {
      results.failed.push({ id, error: err.message });
    }
  }

  // Log bulk activity
  if (results.updated.length > 0) {
    activityLog.log({
      userId: req.user.id,
      action: 'bulk_assignment_updated',
      details: `Bulk updated ${results.updated.length} assignments`,
      metadata: {
        updated: results.updated.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
        updates
      }
    });
  }

  res.json({
    success: results.failed.length === 0,
    summary: {
      total: assignmentIds.length,
      updated: results.updated.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    },
    results
  });
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
    // Check capacity before creating assignment
    const allAssignments = assignmentStore.getAllPendingAssignments();
    const capacityWarning = capacityStore.checkCapacityWarning(assignedTo, allAssignments, stage);

    // If forceAssign is not set and there are errors, reject
    const { forceAssign } = req.body;
    if (capacityWarning.hasErrors && !forceAssign) {
      return res.status(400).json({
        error: 'Capacity exceeded',
        message: capacityWarning.warnings[0].message,
        capacityWarning,
        hint: 'Set forceAssign=true to override capacity limits'
      });
    }

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
        assignedTo,
        overrodeCapacity: capacityWarning.hasWarnings
      }
    });

    res.status(201).json({
      success: true,
      assignment: {
        ...assignment,
        bookLabel: BOOK_LABELS[assignment.book] || assignment.book,
        stageLabel: STAGE_LABELS[assignment.stage] || assignment.stage
      },
      capacityWarning: capacityWarning.hasWarnings ? capacityWarning : null
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
