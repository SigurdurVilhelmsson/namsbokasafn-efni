/**
 * Workflow Session Management Service
 *
 * Manages multi-step workflow sessions for the translation pipeline.
 * Sessions track progress through the workflow steps and store
 * intermediate files and data.
 *
 * Session lifecycle:
 * 1. Create session with book/chapter/source type
 * 2. Upload/process files for each step
 * 3. Advance through steps
 * 4. Complete or abandon session
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Session storage (in-memory for development, would use Redis in production)
const sessions = new Map();

// Session expiry time (4 hours)
const SESSION_EXPIRY = 4 * 60 * 60 * 1000;

// Workflow steps in order
const WORKFLOW_STEPS = [
  {
    id: 'source',
    name: 'Undirbúningur',
    description: 'Sækja CNXML og búa til Markdown',
    manual: false,
    outputs: ['markdown', 'equations'],
    instructionsIs: 'Kerfið sækir efni frá OpenStax og býr til .md og .xliff skrár.'
  },
  {
    id: 'mt-upload',
    name: 'Vélþýðing',
    description: 'Senda í Erlendur MT og fá þýðingu',
    manual: true,
    instructions: '1. Farðu á malstadur.is\n2. Hladdu upp .md skránum (ein í einu)\n3. Veldu enska→íslenska\n4. Sæktu þýddu skrárnar\n5. Hladdu þeim upp hér',
    inputs: ['mt-output'],
    outputs: ['translated-markdown']
  },
  {
    id: 'matecat-create',
    name: 'Matecat verkefni',
    description: 'Búa til Matecat verkefni fyrir samræmingu',
    manual: false,
    outputs: ['xliff', 'matecat-project'],
    instructionsIs: 'Kerfið býr til Matecat verkefni með .xliff skránum.'
  },
  {
    id: 'matecat-review',
    name: 'Matecat yfirferð',
    description: 'Fara yfir og staðfesta þýðingar í Matecat',
    manual: true,
    instructions: '1. Opnaðu Matecat verkefnið\n2. Farðu yfir þýðingar og samþykktu/lagaðu\n3. Fluttu út XLIFF þegar lokið\n4. Hladdu XLIFF skránni upp hér',
    inputs: ['reviewed-xliff'],
    outputs: ['reviewed-xliff']
  },
  {
    id: 'issue-review',
    name: 'Yfirferð atriða',
    description: 'Fara yfir merkt atriði og staðfesta breytingar',
    manual: true,
    instructions: 'Farðu yfir öll merkt atriði og samþykktu eða hafnaðu tillögum.',
    outputs: ['issues-resolved']
  },
  {
    id: 'finalize',
    name: 'Frágangur',
    description: 'Búa til lokaútgáfu og uppfæra stöðu',
    manual: false,
    outputs: ['faithful-md', 'tmx', 'status-updated'],
    instructionsIs: 'Kerfið býr til lokaútgáfu með jöfnum og uppfærir þýðingaminni.'
  }
];

/**
 * Create a new workflow session
 */
function createSession(options) {
  const {
    book,
    chapter,
    modules = [],
    sourceType = 'cnxml',
    userId,
    username
  } = options;

  const sessionId = uuidv4();
  const outputDir = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions', sessionId);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const session = {
    id: sessionId,
    book,
    chapter,
    modules,
    sourceType,
    userId,
    username,
    status: 'active',
    currentStep: 0,
    steps: WORKFLOW_STEPS.map(step => ({
      ...step,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      data: {},
      issues: []
    })),
    files: {},
    issues: [],
    outputDir,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY).toISOString()
  };

  sessions.set(sessionId, session);

  return {
    sessionId,
    book,
    chapter,
    steps: session.steps.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status
    })),
    currentStep: session.steps[0]
  };
}

/**
 * Get session by ID
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    session.status = 'expired';
  }

  return session;
}

/**
 * Update session step status
 */
function updateStepStatus(sessionId, stepId, status, data = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  const stepIndex = session.steps.findIndex(s => s.id === stepId);
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
      currentStep
    };
  }

  // Check if there's a next step
  if (session.currentStep >= session.steps.length - 1) {
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    return {
      complete: true,
      session
    };
  }

  // Advance to next step
  session.currentStep++;
  const nextStep = session.steps[session.currentStep];
  nextStep.status = 'in-progress';
  nextStep.startedAt = new Date().toISOString();

  session.updatedAt = new Date().toISOString();

  return {
    success: true,
    currentStep: nextStep,
    stepsRemaining: session.steps.length - session.currentStep - 1
  };
}

/**
 * Store file in session
 */
function storeFile(sessionId, fileType, filePath, metadata = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  session.files[fileType] = {
    path: filePath,
    originalName: metadata.originalName,
    size: metadata.size,
    uploadedAt: new Date().toISOString()
  };

  session.updatedAt = new Date().toISOString();

  return session.files[fileType];
}

/**
 * Get file from session
 */
function getFile(sessionId, fileType) {
  const session = getSession(sessionId);
  if (!session) return null;

  return session.files[fileType] || null;
}

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
    status: 'pending'
  };

  session.issues.push(issueWithId);
  session.updatedAt = new Date().toISOString();

  // Also add to current step
  const currentStep = session.steps[session.currentStep];
  if (currentStep) {
    currentStep.issues.push(issueWithId.id);
  }

  return issueWithId;
}

/**
 * Resolve issue in session
 */
function resolveIssue(sessionId, issueId, resolution) {
  const session = getSession(sessionId);
  if (!session) return null;

  const issue = session.issues.find(i => i.id === issueId);
  if (!issue) return null;

  issue.status = 'resolved';
  issue.resolution = resolution;
  issue.resolvedAt = new Date().toISOString();

  session.updatedAt = new Date().toISOString();

  return issue;
}

/**
 * Get all pending issues for session
 */
function getPendingIssues(sessionId) {
  const session = getSession(sessionId);
  if (!session) return [];

  return session.issues.filter(i => i.status === 'pending');
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

  return session;
}

/**
 * List active sessions for a user
 */
function listUserSessions(userId) {
  const userSessions = [];

  for (const session of sessions.values()) {
    if (session.userId === userId && session.status === 'active') {
      userSessions.push({
        id: session.id,
        book: session.book,
        chapter: session.chapter,
        modulesCount: session.modules?.length || 0,
        currentStep: session.steps[session.currentStep]?.name,
        progress: Math.round((session.currentStep / session.steps.length) * 100),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      });
    }
  }

  return userSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * List all active sessions (admin)
 */
function listAllSessions() {
  const allSessions = [];

  for (const session of sessions.values()) {
    if (session.status === 'active') {
      allSessions.push({
        id: session.id,
        book: session.book,
        chapter: session.chapter,
        username: session.username,
        currentStep: session.steps[session.currentStep]?.name,
        progress: Math.round((session.currentStep / session.steps.length) * 100),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      });
    }
  }

  return allSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const now = new Date();
  let cleaned = 0;

  for (const [id, session] of sessions) {
    if (new Date(session.expiresAt) < now) {
      // Clean up files
      if (fs.existsSync(session.outputDir)) {
        fs.rmSync(session.outputDir, { recursive: true, force: true });
      }
      sessions.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

module.exports = {
  WORKFLOW_STEPS,
  createSession,
  getSession,
  updateStepStatus,
  advanceSession,
  storeFile,
  getFile,
  addIssue,
  resolveIssue,
  getPendingIssues,
  cancelSession,
  listUserSessions,
  listAllSessions,
  cleanupExpiredSessions
};
