/**
 * Session Step Management
 *
 * Handles workflow step advancement and status updates
 */

const { getSession, saveSession } = require('./sessionCore');

/**
 * Update session step status
 */
function updateStepStatus(sessionId, stepId, status, data = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  const stepIndex = session.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) return null;

  const step = session.steps[stepIndex];
  step.status = status;
  step.data = { ...step.data, ...data };
  step.updatedAt = new Date().toISOString();

  if (status === 'in-progress' && !step.startedAt) {
    step.startedAt = new Date().toISOString();
  }

  if (status === 'completed') {
    step.completedAt = new Date().toISOString();
  }

  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return session;
}

/**
 * Advance session to next step
 */
function advanceSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const currentStep = session.steps[session.currentStep];

  // Check if current step is complete
  if (currentStep.status !== 'completed') {
    return {
      error: 'Current step not complete',
      currentStep,
    };
  }

  // Check if there's a next step
  if (session.currentStep >= session.steps.length - 1) {
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    saveSession(session);
    return {
      complete: true,
      session,
    };
  }

  // Advance to next step
  session.currentStep++;
  const nextStep = session.steps[session.currentStep];
  nextStep.status = 'in-progress';
  nextStep.startedAt = new Date().toISOString();

  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return {
    success: true,
    currentStep: nextStep,
    stepsRemaining: session.steps.length - session.currentStep - 1,
  };
}

module.exports = {
  updateStepStatus,
  advanceSession,
};
