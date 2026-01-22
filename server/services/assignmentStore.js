/**
 * Assignment Store
 *
 * Manages task assignments for the translation workflow.
 * Stores who is assigned to what chapter/stage.
 *
 * Data stored in: server/data/assignments.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'assignments.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load assignments from file
 */
function loadAssignments() {
  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      return JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load assignments:', err);
  }
  return [];
}

/**
 * Save assignments to file
 */
function saveAssignments(assignments) {
  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(assignments, null, 2), 'utf-8');
}

/**
 * Create or update an assignment
 *
 * @param {object} data Assignment data
 * @param {string} data.book Book identifier
 * @param {number} data.chapter Chapter number
 * @param {string} data.stage Pipeline stage
 * @param {string} data.assignedTo Username of assignee
 * @param {string} data.assignedBy Username of assigner
 * @param {string} [data.dueDate] Optional due date (ISO string)
 * @param {string} [data.notes] Optional notes
 */
function createAssignment(data) {
  const assignments = loadAssignments();

  // Check for existing assignment
  const existingIdx = assignments.findIndex(
    a => a.book === data.book &&
         a.chapter === data.chapter &&
         a.stage === data.stage &&
         a.status === 'pending'
  );

  const assignment = {
    id: existingIdx >= 0 ? assignments[existingIdx].id : generateId(),
    book: data.book,
    chapter: data.chapter,
    stage: data.stage,
    assignedTo: data.assignedTo,
    assignedBy: data.assignedBy,
    assignedAt: new Date().toISOString(),
    dueDate: data.dueDate || null,
    notes: data.notes || null,
    status: 'pending'
  };

  if (existingIdx >= 0) {
    assignments[existingIdx] = assignment;
  } else {
    assignments.push(assignment);
  }

  saveAssignments(assignments);
  return assignment;
}

/**
 * Get assignment for a specific book/chapter/stage
 */
function getAssignment(book, chapter, stage = null) {
  const assignments = loadAssignments();

  if (stage) {
    return assignments.find(
      a => a.book === book &&
           a.chapter === chapter &&
           a.stage === stage &&
           a.status === 'pending'
    );
  }

  // Return the most recent pending assignment for this chapter
  return assignments
    .filter(a => a.book === book && a.chapter === chapter && a.status === 'pending')
    .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))[0];
}

/**
 * Get all assignments for a user
 */
function getUserAssignments(username) {
  const assignments = loadAssignments();
  return assignments
    .filter(a => a.assignedTo === username && a.status === 'pending')
    .sort((a, b) => {
      // Sort by due date (null dates last), then by assigned date
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return new Date(b.assignedAt) - new Date(a.assignedAt);
    });
}

/**
 * Get all pending assignments
 */
function getAllPendingAssignments() {
  const assignments = loadAssignments();
  return assignments.filter(a => a.status === 'pending');
}

/**
 * Complete an assignment
 */
/**
 * Get an assignment by its ID
 */
function getAssignmentById(id) {
  const assignments = loadAssignments();
  return assignments.find(a => a.id === id) || null;
}

function completeAssignment(id, completedBy) {
  const assignments = loadAssignments();
  const idx = assignments.findIndex(a => a.id === id);

  if (idx < 0) {
    return null;
  }

  assignments[idx].status = 'completed';
  assignments[idx].completedAt = new Date().toISOString();
  assignments[idx].completedBy = completedBy;

  saveAssignments(assignments);
  return assignments[idx];
}

/**
 * Cancel an assignment
 */
function cancelAssignment(id, cancelledBy, reason) {
  const assignments = loadAssignments();
  const idx = assignments.findIndex(a => a.id === id);

  if (idx < 0) {
    return null;
  }

  assignments[idx].status = 'cancelled';
  assignments[idx].cancelledAt = new Date().toISOString();
  assignments[idx].cancelledBy = cancelledBy;
  assignments[idx].cancelReason = reason;

  saveAssignments(assignments);
  return assignments[idx];
}

/**
 * Get assignments by book
 */
function getBookAssignments(book) {
  const assignments = loadAssignments();
  return assignments.filter(a => a.book === book && a.status === 'pending');
}

/**
 * Generate unique ID
 */
function generateId() {
  return 'asgn_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

module.exports = {
  createAssignment,
  getAssignment,
  getAssignmentById,
  getUserAssignments,
  getAllPendingAssignments,
  completeAssignment,
  cancelAssignment,
  getBookAssignments
};
