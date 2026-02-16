/**
 * Session Core - Database Setup and Basic CRUD
 *
 * Central database configuration and fundamental session operations
 * Other session modules depend on this core module
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
    expires_at TEXT NOT NULL,
    error_log TEXT NOT NULL DEFAULT '[]',
    last_good_state TEXT DEFAULT NULL,
    files_manifest TEXT NOT NULL DEFAULT '[]',
    retry_count INTEGER NOT NULL DEFAULT 0,
    failed_at TEXT DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_book_chapter ON sessions(book, chapter);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

// Run migration to add new columns to existing databases
const { migrate } = require('../migrations/001-add-error-recovery');
migrate();

// Session expiry time (4 hours)
const SESSION_EXPIRY = 4 * 60 * 60 * 1000;

// Workflow steps in order
// Pipeline: Extract (CLI) → MT → 1st Edit → Matecat TM → Localization → Finalize
const WORKFLOW_STEPS = [
  {
    id: 'source',
    name: 'Undirbúningur',
    description: 'Draga út hluta úr CNXML (CLI: cnxml-extract.js)',
    manual: false,
    outputs: ['segments', 'structure'],
    instructionsIs: 'Keyra cnxml-extract.js til að búa til .en.md hlutaskrár og JSON uppbyggingu.',
  },
  {
    id: 'mt-upload',
    name: 'Vélþýðing',
    description: 'Senda í Erlendur MT og fá þýðingu',
    manual: true,
    instructions:
      '1. Farðu á malstadur.is\n2. Hladdu upp .md skránum (ein í einu)\n3. Veldu enska→íslenska\n4. Sæktu þýddu skrárnar\n5. Hladdu þeim upp hér',
    inputs: ['mt-output'],
    outputs: ['translated-segments'],
  },
  {
    id: 'faithful-edit',
    name: '1. yfirferð',
    description: 'Málfarsyfirferð á vélþýðingu (trú þýðing)',
    manual: true,
    instructions:
      '1. Farðu yfir vélþýðinguna\n2. Leiðréttu málfarsvillur\n3. Samræmdu hugtök við orðalista\n4. Vistaðu breytingar',
    instructionsIs:
      'Málfarsyfirferð á vélþýðingu til að búa til trúa þýðingu (faithful translation).',
    inputs: ['mt-output'],
    outputs: ['faithful-segments'],
  },
  {
    id: 'tm-creation',
    name: 'Þýðingaminni',
    description: 'Búa til þýðingaminni í Matecat Align',
    manual: true,
    instructions:
      '1. Útbúðu skrár fyrir Matecat Align\n2. Hladdu upp EN og IS skrám\n3. Samræmdu þýðingar\n4. Fluttu út TMX',
    instructionsIs: 'Nota Matecat Align til að búa til þýðingaminni (TMX) úr trúrri þýðingu.',
    inputs: ['faithful-segments', 'source-segments'],
    outputs: ['tmx'],
  },
  {
    id: 'localization',
    name: 'Staðfærsla',
    description: 'Aðlaga efni fyrir íslenskt samhengi',
    manual: true,
    instructions:
      '1. Farðu yfir staðfærsluatriði\n2. Umbreyttu einingum (mílu→km, Fahrenheit→Celsius)\n3. Settu inn íslensk dæmi þar sem við á\n4. Vistaðu breytingar',
    instructionsIs:
      'Aðlaga efni fyrir íslenska nemendur: umbreyta einingum, bæta við íslenskum dæmum.',
    inputs: ['faithful-segments'],
    outputs: ['localized-segments'],
  },
  {
    id: 'finalize',
    name: 'Frágangur',
    description: 'Sprautu þýðingum inn í CNXML og birttu sem HTML',
    manual: false,
    outputs: ['publication-html', 'status-updated'],
    instructionsIs: 'Keyra cnxml-inject + cnxml-render til að búa til HTML útgáfu.',
  },
];

// Prepared statements for better performance
const statements = {
  insert: db.prepare(`
    INSERT INTO sessions (id, book, chapter, modules, source_type, user_id, username, status, current_step, steps, files, expected_files, uploaded_files, issues, output_dir, created_at, updated_at, expires_at, error_log, last_good_state, files_manifest, retry_count, failed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getByBookChapter: db.prepare(
    'SELECT * FROM sessions WHERE book = ? AND chapter = ? AND status = ?'
  ),
  update: db.prepare(`
    UPDATE sessions SET
      status = ?, current_step = ?, steps = ?, files = ?, expected_files = ?, uploaded_files = ?, issues = ?,
      cancel_reason = ?, updated_at = ?, completed_at = ?, cancelled_at = ?, expires_at = ?,
      error_log = ?, last_good_state = ?, files_manifest = ?, retry_count = ?, failed_at = ?
    WHERE id = ?
  `),
  listByUser: db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? AND status = ? ORDER BY updated_at DESC'
  ),
  listAll: db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC'),
  deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  getExpired: db.prepare('SELECT * FROM sessions WHERE expires_at < ?'),
  deleteById: db.prepare('DELETE FROM sessions WHERE id = ?'),
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
    expiresAt: row.expires_at,
    errorLog: JSON.parse(row.error_log || '[]'),
    lastGoodState: row.last_good_state ? JSON.parse(row.last_good_state) : null,
    filesManifest: JSON.parse(row.files_manifest || '[]'),
    retryCount: row.retry_count || 0,
    failedAt: row.failed_at,
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
    JSON.stringify(session.errorLog || []),
    session.lastGoodState ? JSON.stringify(session.lastGoodState) : null,
    JSON.stringify(session.filesManifest || []),
    session.retryCount || 0,
    session.failedAt || null,
    session.id
  );
}

/**
 * Wrap database operations in a transaction
 * @param {Function} fn - Function to execute within transaction
 * @returns {*} Result of the function
 */
function withTransaction(fn) {
  const transaction = db.transaction(fn);
  return transaction();
}

/**
 * Create a new workflow session
 *
 * @param {object} options - Session options
 * @param {string} options.book - Book identifier
 * @param {number} options.chapter - Chapter number
 * @param {Array} options.modules - Array of module objects or IDs
 * @param {string} options.sourceType - Source type (default: 'cnxml')
 * @param {string} options.userId - User ID
 * @param {string} options.username - Username
 * @param {number} options.startStep - Step index to start from (for resuming, default: 0)
 * @param {Array<string>} options.completedSteps - Array of step IDs already completed (for resuming)
 */
function createSession(options) {
  const {
    book,
    chapter,
    modules = [],
    sourceType = 'cnxml',
    userId,
    username,
    startStep = 0,
    completedSteps = [],
  } = options;

  const sessionId = uuidv4();
  const outputDir = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions', sessionId);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY).toISOString();

  // Initialize steps with appropriate status based on startStep and completedSteps
  const steps = WORKFLOW_STEPS.map((step, index) => {
    let status = 'pending';
    let completedAt = null;

    // Mark previously completed steps
    if (completedSteps.includes(step.id) || index < startStep) {
      status = 'completed';
      completedAt = new Date().toISOString();
    }
    // Mark current step as in-progress
    else if (index === startStep) {
      status = 'in-progress';
    }

    return {
      ...step,
      status,
      startedAt: index === startStep ? new Date().toISOString() : null,
      completedAt,
      data: {},
      issues: [],
    };
  });

  // Normalize modules - can be array of strings (IDs) or objects with id/section/title
  const normalizedModules = modules.map((m) => {
    if (typeof m === 'string') {
      return { id: m, section: null, title: null };
    }
    return { id: m.id, section: m.section, title: m.title };
  });

  // Expected files with meaningful display info
  const expectedFiles = {
    'mt-upload': normalizedModules.map((m) => ({
      moduleId: m.id,
      section: m.section,
      title: m.title,
      // Display name for UI (section + title or just module ID)
      displayName: m.section ? `${m.section}: ${m.title || m.id}` : m.id,
    })),
  };

  const uploadedFiles = {
    'mt-upload': [],
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
    startStep, // Use startStep instead of always 0
    JSON.stringify(steps),
    JSON.stringify({}),
    JSON.stringify(expectedFiles),
    JSON.stringify(uploadedFiles),
    JSON.stringify([]),
    outputDir,
    now,
    now,
    expiresAt,
    JSON.stringify([]), // error_log
    null, // last_good_state
    JSON.stringify([]), // files_manifest
    0, // retry_count
    null // failed_at
  );

  return {
    sessionId,
    book,
    chapter,
    steps: steps.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
    })),
    currentStep: steps[startStep],
    startedAt: startStep,
    resumed: startStep > 0,
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
 * Delete a session by ID
 * Removes the session from the database and cleans up associated files
 * @param {string} sessionId - Session ID to delete
 * @returns {Object} Result with success status
 */
function deleteSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Clean up output directory if it exists
  if (session.outputDir && fs.existsSync(session.outputDir)) {
    try {
      fs.rmSync(session.outputDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to clean up session directory ${session.outputDir}:`, err);
      // Continue with deletion even if directory cleanup fails
    }
  }

  // Delete from database
  statements.deleteById.run(sessionId);

  return {
    success: true,
    message: 'Session deleted',
    sessionId,
  };
}

module.exports = {
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
};
