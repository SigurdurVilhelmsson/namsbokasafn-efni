/**
 * Workflow Session Management Service
 *
 * Main entry point for session management.
 * Imports and re-exports functions from focused sub-modules.
 *
 * Session lifecycle:
 * 1. Create session with book/chapter/source type
 * 2. Upload/process files for each step
 * 3. Advance through steps
 * 4. Complete or abandon session
 *
 * Storage: SQLite database for persistence across server restarts
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Import core functionality
const {
  db,
  statements,
  DB_PATH,
  SESSION_EXPIRY,
  WORKFLOW_STEPS,
  rowToSession,
  saveSession,
  withTransaction,
  createSession,
  getSession,
  deleteSession,
} = require('./sessionCore');

// Import step management
const { updateStepStatus, advanceSession } = require('./sessionSteps');

// Import file operations
const {
  ERLENDUR_CHAR_LIMIT,
  ERLENDUR_SOFT_LIMIT,
  storeFile,
  getFile,
  extractModuleId,
  extractSectionFromFilename,
  parseMarkdownFrontmatter,
  identifyUploadedFile,
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,
  getUploadProgress,
  updateExpectedFiles,
  recordUpload,
} = require('./sessionFiles');

// Import search/listing
const { findActiveWorkflow, listUserSessions, listAllSessions } = require('./sessionSearch');

// Import recovery functions
const {
  MAX_RETRY_ATTEMPTS,
  createStateSnapshot,
  saveCheckpoint,
  logError,
  getErrorLog,
  rollbackToPreviousStep,
  resetSession,
  retryCurrentStep,
  markSessionFailed,
  addToFilesManifest,
  cleanupFilesManifest,
  getRecoveryActions,
} = require('./sessionRecovery');

// ============================================================================
// ISSUE MANAGEMENT (kept in main file - small and tightly coupled)
// ============================================================================

/**
 * Add issue to session
 */
function addIssue(sessionId, issue) {
  const session = getSession(sessionId);
  if (!session) return null;

  const issueWithId = {
    id: uuidv4(),
    ...issue,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  session.issues.push(issueWithId);
  session.updatedAt = new Date().toISOString();

  // Also add to current step
  const currentStep = session.steps[session.currentStep];
  if (currentStep) {
    currentStep.issues.push(issueWithId.id);
  }

  saveSession(session);

  return issueWithId;
}

/**
 * Resolve issue in session
 */
function resolveIssue(sessionId, issueId, resolution) {
  const session = getSession(sessionId);
  if (!session) return null;

  const issue = session.issues.find((i) => i.id === issueId);
  if (!issue) return null;

  issue.status = 'resolved';
  issue.resolution = resolution;
  issue.resolvedAt = new Date().toISOString();

  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return issue;
}

/**
 * Get all pending issues for session
 */
function getPendingIssues(sessionId) {
  const session = getSession(sessionId);
  if (!session) return [];

  return session.issues.filter((i) => i.status === 'pending');
}

/**
 * Cancel/abandon session
 */
function cancelSession(sessionId, reason) {
  const session = getSession(sessionId);
  if (!session) return null;

  session.status = 'cancelled';
  session.cancelReason = reason;
  session.cancelledAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();

  saveSession(session);

  return session;
}

// ============================================================================
// CLEANUP AND MAINTENANCE
// ============================================================================

// Retention period for finished sessions (7 days)
const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Remove a session's output directory if it exists
 */
function removeSessionDir(outputDir) {
  if (outputDir && fs.existsSync(outputDir)) {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.error(`Failed to clean up session directory ${outputDir}:`, err);
      return false;
    }
  }
  return false;
}

/**
 * Clean up stale sessions:
 * 1. Mark zombie active sessions as expired
 * 2. Delete expired sessions (DB + files)
 * 3. Delete old finished sessions (completed/cancelled/failed older than 7 days)
 * 4. Remove orphaned session directories with no matching DB record
 */
function cleanupStaleSessions() {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - FINISHED_RETENTION_MS).toISOString();
  let zombies = 0;
  let expired = 0;
  let oldFinished = 0;
  let orphans = 0;

  // 1. Mark zombie active sessions as expired
  const zombieRows = statements.getZombieActive.all(now);
  if (zombieRows.length > 0) {
    statements.markZombieExpired.run(now, now);
    zombies = zombieRows.length;
  }

  // 2. Delete expired sessions (existing behavior)
  const expiredRows = statements.getExpired.all(now);
  for (const row of expiredRows) {
    const session = rowToSession(row);
    removeSessionDir(session.outputDir);
    expired++;
  }
  if (expiredRows.length > 0) {
    statements.deleteExpired.run(now);
  }

  // 3. Delete old finished sessions (completed/cancelled/failed > 7 days)
  const finishedRows = statements.getOldFinished.all(cutoff);
  for (const row of finishedRows) {
    const session = rowToSession(row);
    removeSessionDir(session.outputDir);
    oldFinished++;
  }
  if (finishedRows.length > 0) {
    statements.deleteOldFinished.run(cutoff);
  }

  // 4. Clean orphaned session directories
  const sessionsDir = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const allSessionIds = new Set(
      db
        .prepare('SELECT id FROM sessions')
        .all()
        .map((r) => r.id)
    );
    try {
      const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
      for (const entry of dirs) {
        if (entry.isDirectory() && !allSessionIds.has(entry.name)) {
          removeSessionDir(path.join(sessionsDir, entry.name));
          orphans++;
        }
      }
    } catch (err) {
      console.error('Failed to scan session directories for orphans:', err);
    }
  }

  const total = zombies + expired + oldFinished + orphans;
  if (total > 0) {
    const parts = [];
    if (zombies) parts.push(`${zombies} zombie→expired`);
    if (expired) parts.push(`${expired} expired deleted`);
    if (oldFinished) parts.push(`${oldFinished} old finished deleted`);
    if (orphans) parts.push(`${orphans} orphaned dirs removed`);
    console.log(`[session-cleanup] ${parts.join(', ')}`);
  }

  return { zombies, expired, oldFinished, orphans };
}

// Run cleanup every hour
const sessionCleanupInterval = setInterval(cleanupStaleSessions, 60 * 60 * 1000);
sessionCleanupInterval.unref();

// Clean up on startup
cleanupStaleSessions();

/**
 * Get database stats (for debugging/monitoring)
 */
function getDbStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
  const active = db
    .prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?')
    .get('active');
  const completed = db
    .prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?')
    .get('completed');
  const cancelled = db
    .prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?')
    .get('cancelled');
  const expired = db
    .prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?')
    .get('expired');
  const failed = db
    .prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?')
    .get('failed');

  return {
    total: total.count,
    active: active.count,
    completed: completed.count,
    cancelled: cancelled.count,
    expired: expired.count,
    failed: failed.count,
    dbPath: DB_PATH,
  };
}

// ============================================================================
// EXPORTS - All functions available to routes
// ============================================================================

module.exports = {
  // Constants
  WORKFLOW_STEPS,
  ERLENDUR_CHAR_LIMIT,
  ERLENDUR_SOFT_LIMIT,
  MAX_RETRY_ATTEMPTS,
  SESSION_EXPIRY,

  // Core CRUD
  createSession,
  getSession,
  deleteSession,

  // Step management
  updateStepStatus,
  advanceSession,

  // File operations
  storeFile,
  getFile,
  extractModuleId,
  extractSectionFromFilename,
  parseMarkdownFrontmatter,
  identifyUploadedFile,
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,

  // Upload tracking
  getUploadProgress,
  updateExpectedFiles,
  recordUpload,

  // Search/listing
  findActiveWorkflow,
  listUserSessions,
  listAllSessions,

  // Issues
  addIssue,
  resolveIssue,
  getPendingIssues,

  // Lifecycle
  cancelSession,
  cleanupStaleSessions,
  getDbStats,

  // Error recovery
  withTransaction,
  createStateSnapshot,
  saveCheckpoint,
  logError,
  getErrorLog,
  rollbackToPreviousStep,
  resetSession,
  retryCurrentStep,
  markSessionFailed,
  addToFilesManifest,
  cleanupFilesManifest,
  getRecoveryActions,
};
