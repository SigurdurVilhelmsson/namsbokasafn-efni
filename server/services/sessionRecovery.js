/**
 * Session Error Recovery Functions
 *
 * Handles checkpoints, rollback, retry, and error logging for sessions
 */

const fs = require('fs');
const { getSession, saveSession, withTransaction } = require('./sessionCore');

// Maximum retry attempts for a failed step
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Create a snapshot of session state for rollback
 * Captures current step, files, issues, and uploaded files
 */
function createStateSnapshot(session) {
  return {
    currentStep: session.currentStep,
    steps: JSON.parse(JSON.stringify(session.steps)),
    files: JSON.parse(JSON.stringify(session.files)),
    expectedFiles: JSON.parse(JSON.stringify(session.expectedFiles)),
    uploadedFiles: JSON.parse(JSON.stringify(session.uploadedFiles)),
    issues: JSON.parse(JSON.stringify(session.issues)),
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Save a checkpoint after successful step completion
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Updated session or null if not found
 */
function saveCheckpoint(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const snapshot = createStateSnapshot(session);
  session.lastGoodState = snapshot;
  session.filesManifest = []; // Clear manifest after checkpoint
  session.retryCount = 0; // Reset retry count
  session.updatedAt = new Date().toISOString();

  saveSession(session);
  return session;
}

/**
 * Log an error event to the session's error history
 * @param {string} sessionId - Session ID
 * @param {string} step - Step ID where error occurred
 * @param {string} error - Error message
 * @param {Object} context - Additional context (file, line, etc.)
 * @returns {Object|null} Updated session or null if not found
 */
function logError(sessionId, step, error, context = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  const errorEntry = {
    timestamp: new Date().toISOString(),
    step,
    error,
    context,
    retryCount: session.retryCount,
  };

  session.errorLog = session.errorLog || [];
  session.errorLog.push(errorEntry);
  session.updatedAt = new Date().toISOString();

  saveSession(session);
  return session;
}

/**
 * Get error history for a session
 * @param {string} sessionId - Session ID
 * @returns {Array} Array of error entries
 */
function getErrorLog(sessionId) {
  const session = getSession(sessionId);
  if (!session) return [];
  return session.errorLog || [];
}

/**
 * Rollback session to the last successful checkpoint
 * @param {string} sessionId - Session ID
 * @returns {Object} Result with success status
 */
function rollbackToPreviousStep(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  if (!session.lastGoodState) {
    return { success: false, error: 'No checkpoint available for rollback' };
  }

  // Cannot rollback if already at step 0
  if (session.currentStep === 0) {
    return { success: false, error: 'Cannot rollback from first step - use reset instead' };
  }

  return withTransaction(() => {
    const snapshot = session.lastGoodState;

    // Clean up files created since checkpoint
    cleanupFilesManifest(sessionId);

    // Restore state from snapshot
    session.currentStep = snapshot.currentStep;
    session.steps = snapshot.steps;
    session.files = snapshot.files;
    session.expectedFiles = snapshot.expectedFiles;
    session.uploadedFiles = snapshot.uploadedFiles;
    session.issues = snapshot.issues;

    // Reset error state
    session.status = 'active';
    session.failedAt = null;
    session.retryCount = 0;
    session.filesManifest = [];
    session.updatedAt = new Date().toISOString();

    // Log the rollback
    logError(
      sessionId,
      session.steps[session.currentStep]?.id || 'unknown',
      'Session rolled back to checkpoint',
      {
        rolledBackFrom: session.currentStep,
        rolledBackTo: snapshot.currentStep,
      }
    );

    saveSession(session);

    return {
      success: true,
      message: 'Session rolled back to previous checkpoint',
      currentStep: session.steps[session.currentStep],
      restoredAt: snapshot.snapshotAt,
    };
  });
}

/**
 * Reset session to the beginning (step 0)
 * @param {string} sessionId - Session ID
 * @param {boolean} confirm - Must be true to confirm reset
 * @returns {Object} Result with success status
 */
function resetSession(sessionId, confirm = false) {
  if (!confirm) {
    return { success: false, error: 'Reset requires confirmation (confirm: true)' };
  }

  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  return withTransaction(() => {
    // Clean up all files in manifest
    cleanupFilesManifest(sessionId);

    // Reset all steps to pending
    session.steps = session.steps.map((step) => ({
      ...step,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      data: {},
      issues: [],
    }));

    // Set first step to in-progress
    session.steps[0].status = 'in-progress';
    session.steps[0].startedAt = new Date().toISOString();

    // Reset session state
    session.currentStep = 0;
    session.status = 'active';
    session.files = {};
    session.uploadedFiles = { 'mt-upload': [] };
    session.issues = [];
    session.lastGoodState = null;
    session.filesManifest = [];
    session.retryCount = 0;
    session.failedAt = null;
    session.updatedAt = new Date().toISOString();

    // Log the reset (keep error log for history)
    session.errorLog = session.errorLog || [];
    session.errorLog.push({
      timestamp: new Date().toISOString(),
      step: 'reset',
      error: 'Session reset to beginning',
      context: { previousStep: session.currentStep },
    });

    saveSession(session);

    return {
      success: true,
      message: 'Session reset to beginning',
      currentStep: session.steps[0],
    };
  });
}

/**
 * Retry the current failed step
 * @param {string} sessionId - Session ID
 * @returns {Object} Result with success status and retry info
 */
function retryCurrentStep(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  const currentStep = session.steps[session.currentStep];
  if (!currentStep) {
    return { success: false, error: 'No current step' };
  }

  // Check if step is in failed state
  if (currentStep.status !== 'failed') {
    return { success: false, error: 'Current step is not in failed state' };
  }

  // Check retry limit
  if (session.retryCount >= MAX_RETRY_ATTEMPTS) {
    return {
      success: false,
      error: `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached`,
      retryCount: session.retryCount,
      suggestion: 'Use rollback or reset to continue',
    };
  }

  return withTransaction(() => {
    // Increment retry count
    session.retryCount++;

    // Clean up files from failed attempt
    cleanupFilesManifest(sessionId);

    // Reset step status to in-progress
    currentStep.status = 'in-progress';
    currentStep.startedAt = new Date().toISOString();
    delete currentStep.data.error;

    // Reset session status if it was failed
    if (session.status === 'failed') {
      session.status = 'active';
      session.failedAt = null;
    }

    session.updatedAt = new Date().toISOString();

    // Log the retry
    session.errorLog = session.errorLog || [];
    session.errorLog.push({
      timestamp: new Date().toISOString(),
      step: currentStep.id,
      error: 'Retrying step',
      context: { attemptNumber: session.retryCount },
    });

    saveSession(session);

    return {
      success: true,
      message: `Retry attempt ${session.retryCount} of ${MAX_RETRY_ATTEMPTS}`,
      currentStep,
      retriesRemaining: MAX_RETRY_ATTEMPTS - session.retryCount,
    };
  });
}

/**
 * Mark session as failed (unrecoverable without reset)
 * @param {string} sessionId - Session ID
 * @param {string} reason - Failure reason
 * @returns {Object|null} Updated session or null if not found
 */
function markSessionFailed(sessionId, reason) {
  const session = getSession(sessionId);
  if (!session) return null;

  session.status = 'failed';
  session.failedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();

  // Log the failure
  logError(sessionId, session.steps[session.currentStep]?.id || 'unknown', reason, {
    finalStatus: 'failed',
    retryCount: session.retryCount,
  });

  saveSession(session);
  return session;
}

/**
 * Add a file to the current step's manifest for potential cleanup
 * @param {string} sessionId - Session ID
 * @param {string} filePath - Path to the file
 * @returns {Object|null} Updated session or null if not found
 */
function addToFilesManifest(sessionId, filePath) {
  const session = getSession(sessionId);
  if (!session) return null;

  session.filesManifest = session.filesManifest || [];

  // Avoid duplicates
  if (!session.filesManifest.includes(filePath)) {
    session.filesManifest.push(filePath);
    session.updatedAt = new Date().toISOString();
    saveSession(session);
  }

  return session;
}

/**
 * Clean up files listed in the session's manifest
 * @param {string} sessionId - Session ID
 * @returns {Object} Result with files deleted and any errors
 */
function cleanupFilesManifest(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  const manifest = session.filesManifest || [];
  const deleted = [];
  const errors = [];

  for (const filePath of manifest) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted.push(filePath);
      }
    } catch (err) {
      errors.push({ path: filePath, error: err.message });
    }
  }

  // Clear the manifest
  session.filesManifest = [];
  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return {
    success: errors.length === 0,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get available recovery actions for a session
 * @param {string} sessionId - Session ID
 * @returns {Object} Available actions based on session state
 */
function getRecoveryActions(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  const currentStep = session.steps[session.currentStep];
  const actions = [];

  // Retry is available if step is failed and retries remain
  if (currentStep?.status === 'failed' && session.retryCount < MAX_RETRY_ATTEMPTS) {
    actions.push({
      action: 'retry',
      available: true,
      retriesRemaining: MAX_RETRY_ATTEMPTS - session.retryCount,
    });
  }

  // Rollback is available if there's a checkpoint and not at step 0
  if (session.lastGoodState && session.currentStep > 0) {
    actions.push({
      action: 'rollback',
      available: true,
      checkpointStep: session.lastGoodState.currentStep,
      checkpointTime: session.lastGoodState.snapshotAt,
    });
  }

  // Reset is always available
  actions.push({
    action: 'reset',
    available: true,
    requiresConfirmation: true,
  });

  return {
    sessionStatus: session.status,
    stepStatus: currentStep?.status,
    retryCount: session.retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    hasCheckpoint: !!session.lastGoodState,
    actions,
  };
}

module.exports = {
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
};
