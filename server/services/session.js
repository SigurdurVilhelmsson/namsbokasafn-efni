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
 *
 * Storage: SQLite database for persistence across server restarts
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Database path - stored in pipeline-output directory
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    modules TEXT NOT NULL,
    source_type TEXT NOT NULL,
    user_id TEXT,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    current_step INTEGER NOT NULL DEFAULT 0,
    steps TEXT NOT NULL,
    files TEXT NOT NULL DEFAULT '{}',
    expected_files TEXT NOT NULL DEFAULT '{}',
    uploaded_files TEXT NOT NULL DEFAULT '{}',
    issues TEXT NOT NULL DEFAULT '[]',
    output_dir TEXT NOT NULL,
    cancel_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    cancelled_at TEXT,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_book_chapter ON sessions(book, chapter);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

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

// Prepared statements for better performance
const statements = {
  insert: db.prepare(`
    INSERT INTO sessions (id, book, chapter, modules, source_type, user_id, username, status, current_step, steps, files, expected_files, uploaded_files, issues, output_dir, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getByBookChapter: db.prepare('SELECT * FROM sessions WHERE book = ? AND chapter = ? AND status = ?'),
  update: db.prepare(`
    UPDATE sessions SET
      status = ?, current_step = ?, steps = ?, files = ?, expected_files = ?, uploaded_files = ?, issues = ?,
      cancel_reason = ?, updated_at = ?, completed_at = ?, cancelled_at = ?, expires_at = ?
    WHERE id = ?
  `),
  listByUser: db.prepare('SELECT * FROM sessions WHERE user_id = ? AND status = ? ORDER BY updated_at DESC'),
  listAll: db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC'),
  deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  getExpired: db.prepare('SELECT * FROM sessions WHERE expires_at < ?')
};

/**
 * Convert database row to session object
 */
function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    modules: JSON.parse(row.modules),
    sourceType: row.source_type,
    userId: row.user_id,
    username: row.username,
    status: row.status,
    currentStep: row.current_step,
    steps: JSON.parse(row.steps),
    files: JSON.parse(row.files),
    expectedFiles: JSON.parse(row.expected_files),
    uploadedFiles: JSON.parse(row.uploaded_files),
    issues: JSON.parse(row.issues),
    outputDir: row.output_dir,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    expiresAt: row.expires_at
  };
}

/**
 * Save session to database
 */
function saveSession(session) {
  statements.update.run(
    session.status,
    session.currentStep,
    JSON.stringify(session.steps),
    JSON.stringify(session.files),
    JSON.stringify(session.expectedFiles),
    JSON.stringify(session.uploadedFiles),
    JSON.stringify(session.issues),
    session.cancelReason || null,
    session.updatedAt,
    session.completedAt || null,
    session.cancelledAt || null,
    session.expiresAt,
    session.id
  );
}

/**
 * Find active workflow for a book/chapter combination
 * Returns the session if an active workflow exists, null otherwise
 */
function findActiveWorkflow(book, chapter) {
  const row = statements.getByBookChapter.get(book, chapter, 'active');
  if (!row) return null;

  const session = rowToSession(row);

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    // Mark as expired
    session.status = 'expired';
    session.updatedAt = new Date().toISOString();
    saveSession(session);
    return null;
  }

  return session;
}

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

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY).toISOString();

  const steps = WORKFLOW_STEPS.map(step => ({
    ...step,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    data: {},
    issues: []
  }));

  // Normalize modules - can be array of strings (IDs) or objects with id/section/title
  const normalizedModules = modules.map(m => {
    if (typeof m === 'string') {
      return { id: m, section: null, title: null };
    }
    return { id: m.id, section: m.section, title: m.title };
  });

  // Expected files with meaningful display info
  const expectedFiles = {
    'mt-upload': normalizedModules.map(m => ({
      moduleId: m.id,
      section: m.section,
      title: m.title,
      // Display name for UI (section + title or just module ID)
      displayName: m.section
        ? `${m.section}: ${m.title || m.id}`
        : m.id
    }))
  };

  const uploadedFiles = {
    'mt-upload': []
  };

  // Insert into database - store normalized modules with section/title info
  statements.insert.run(
    sessionId,
    book,
    chapter,
    JSON.stringify(normalizedModules),
    sourceType,
    userId,
    username,
    'active',
    0,
    JSON.stringify(steps),
    JSON.stringify({}),
    JSON.stringify(expectedFiles),
    JSON.stringify(uploadedFiles),
    JSON.stringify([]),
    outputDir,
    now,
    now,
    expiresAt
  );

  return {
    sessionId,
    book,
    chapter,
    steps: steps.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status
    })),
    currentStep: steps[0]
  };
}

/**
 * Get session by ID
 */
function getSession(sessionId) {
  const row = statements.getById.get(sessionId);
  if (!row) return null;

  const session = rowToSession(row);

  // Check if expired
  if (new Date(session.expiresAt) < new Date()) {
    session.status = 'expired';
    session.updatedAt = new Date().toISOString();
    saveSession(session);
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
      currentStep
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
      session
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
    moduleId: metadata.moduleId,
    uploadedAt: new Date().toISOString()
  };

  session.updatedAt = new Date().toISOString();
  saveSession(session);

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
 * Extract module ID from filename
 * e.g., "m68663.is.md" -> "m68663"
 */
function extractModuleId(filename) {
  const match = filename.match(/(m\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract section number from filename
 * e.g., "1-2.en.md" -> "1.2", "1-2-chemistry-in-context.md" -> "1.2"
 */
function extractSectionFromFilename(filename) {
  // Match patterns like "1-2" or "1.2" at start of filename
  const match = filename.match(/^(\d+)[-.](\d+)/);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }
  return null;
}

/**
 * Parse YAML frontmatter from markdown content
 * Returns object with title, section, module, lang if present
 */
function parseMarkdownFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const result = {};

  // Parse simple YAML key: "value" pairs
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Identify uploaded file by parsing its content
 * Returns { section, module, title } or null
 */
function identifyUploadedFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = parseMarkdownFrontmatter(content);
    if (metadata) {
      return {
        section: metadata.section,
        module: metadata.module,
        title: metadata.title,
        lang: metadata.lang
      };
    }
  } catch (err) {
    console.error(`Failed to parse file ${filePath}:`, err.message);
  }
  return null;
}

/**
 * Get upload progress for a workflow step
 */
function getUploadProgress(sessionId, stepId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const expected = session.expectedFiles[stepId] || [];
  const uploaded = session.uploadedFiles[stepId] || [];

  // Find which expected files have been uploaded (match by section or moduleId)
  const uploadedSections = uploaded.map(u => u.section).filter(Boolean);
  const uploadedModules = uploaded.map(u => u.moduleId).filter(Boolean);

  const missing = expected.filter(exp => {
    // Expected can be object with section/moduleId or legacy string
    if (typeof exp === 'object') {
      // Match by section first, then by moduleId
      if (exp.section && uploadedSections.includes(exp.section)) return false;
      if (exp.moduleId && uploadedModules.includes(exp.moduleId)) return false;
      return true;
    }
    // Legacy: string filename - match by moduleId
    const moduleId = extractModuleId(exp);
    return !uploadedModules.includes(moduleId);
  });

  return {
    expected: expected.length,
    uploaded: uploaded.length,
    complete: uploaded.length >= expected.length,
    missing,
    uploadedFiles: uploaded,
    expectedFiles: expected
  };
}

/**
 * Record a file upload for a workflow step
 * Parses the uploaded file to identify it by metadata
 */
function recordUpload(sessionId, stepId, filename, filePath) {
  const session = getSession(sessionId);
  if (!session) return null;

  if (!session.uploadedFiles[stepId]) {
    session.uploadedFiles[stepId] = [];
  }

  // Try to identify the file by parsing its content
  let metadata = null;
  if (filePath) {
    metadata = identifyUploadedFile(filePath);
  }

  // Extract info from filename as fallback
  const moduleIdFromName = extractModuleId(filename);
  const sectionFromName = extractSectionFromFilename(filename);

  const uploadRecord = {
    filename,
    section: metadata?.section || sectionFromName,
    moduleId: metadata?.module || moduleIdFromName,
    title: metadata?.title,
    uploadedAt: new Date().toISOString()
  };

  session.uploadedFiles[stepId].push(uploadRecord);

  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return getUploadProgress(sessionId, stepId);
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

  saveSession(session);

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
  saveSession(session);

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

  saveSession(session);

  return session;
}

/**
 * List active sessions for a user
 */
function listUserSessions(userId) {
  const rows = statements.listByUser.all(userId, 'active');

  return rows.map(row => {
    const session = rowToSession(row);
    return {
      id: session.id,
      book: session.book,
      chapter: session.chapter,
      modulesCount: session.modules?.length || 0,
      currentStep: session.steps[session.currentStep]?.name,
      progress: Math.round((session.currentStep / session.steps.length) * 100),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  });
}

/**
 * List all active sessions (admin)
 */
function listAllSessions() {
  const rows = statements.listAll.all('active');

  return rows.map(row => {
    const session = rowToSession(row);
    return {
      id: session.id,
      book: session.book,
      chapter: session.chapter,
      username: session.username,
      currentStep: session.steps[session.currentStep]?.name,
      progress: Math.round((session.currentStep / session.steps.length) * 100),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  });
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const now = new Date().toISOString();
  let cleaned = 0;

  // Get expired sessions to clean up their files
  const expiredRows = statements.getExpired.all(now);
  for (const row of expiredRows) {
    const session = rowToSession(row);
    // Clean up files
    if (session.outputDir && fs.existsSync(session.outputDir)) {
      try {
        fs.rmSync(session.outputDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to clean up session directory ${session.outputDir}:`, err);
      }
    }
    cleaned++;
  }

  // Delete expired sessions from database
  statements.deleteExpired.run(now);

  return cleaned;
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Clean up on startup
cleanupExpiredSessions();

/**
 * Get database stats (for debugging/monitoring)
 */
function getDbStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
  const active = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('active');
  const completed = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('completed');
  const cancelled = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('cancelled');
  const expired = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('expired');

  return {
    total: total.count,
    active: active.count,
    completed: completed.count,
    cancelled: cancelled.count,
    expired: expired.count,
    dbPath: DB_PATH
  };
}

module.exports = {
  WORKFLOW_STEPS,
  createSession,
  getSession,
  updateStepStatus,
  advanceSession,
  storeFile,
  getFile,
  findActiveWorkflow,
  getUploadProgress,
  recordUpload,
  extractModuleId,
  addIssue,
  resolveIssue,
  getPendingIssues,
  cancelSession,
  listUserSessions,
  listAllSessions,
  cleanupExpiredSessions,
  getDbStats
};
