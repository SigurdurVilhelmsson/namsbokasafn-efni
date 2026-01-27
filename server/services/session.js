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

// Maximum retry attempts for a failed step
const MAX_RETRY_ATTEMPTS = 3;

// Session expiry time (4 hours)
const SESSION_EXPIRY = 4 * 60 * 60 * 1000;

// Erlendur MT character limit (20,000 characters)
const ERLENDUR_CHAR_LIMIT = 20000;

// Soft limit to allow some buffer
const ERLENDUR_SOFT_LIMIT = 18000;

// Workflow steps in order
// New workflow: MT → 1st Edit → Matecat TM → Localization → Finalize
const WORKFLOW_STEPS = [
  {
    id: 'source',
    name: 'Undirbúningur',
    description: 'Sækja CNXML og búa til Markdown',
    manual: false,
    outputs: ['markdown', 'equations'],
    instructionsIs: 'Kerfið sækir efni frá OpenStax og býr til .md skrár.'
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
    id: 'faithful-edit',
    name: '1. yfirferð',
    description: 'Málfarsyfirferð á vélþýðingu (trú þýðing)',
    manual: true,
    instructions: '1. Farðu yfir vélþýðinguna\n2. Leiðréttu málfarsvillur\n3. Samræmdu hugtök við orðalista\n4. Vistaðu breytingar',
    instructionsIs: 'Málfarsyfirferð á vélþýðingu til að búa til trúa þýðingu (faithful translation).',
    inputs: ['mt-output'],
    outputs: ['faithful-markdown']
  },
  {
    id: 'tm-creation',
    name: 'Þýðingaminni',
    description: 'Búa til þýðingaminni í Matecat Align',
    manual: true,
    instructions: '1. Útbúðu skrár fyrir Matecat Align\n2. Hladdu upp EN og IS skrám\n3. Samræmdu þýðingar\n4. Fluttu út TMX',
    instructionsIs: 'Nota Matecat Align til að búa til þýðingaminni (TMX) úr trúrri þýðingu.',
    inputs: ['faithful-markdown', 'source-markdown'],
    outputs: ['tmx']
  },
  {
    id: 'localization',
    name: 'Staðfærsla',
    description: 'Aðlaga efni fyrir íslenskt samhengi',
    manual: true,
    instructions: '1. Farðu yfir staðfærsluatriði\n2. Umbreyttu einingum (mílu→km, Fahrenheit→Celsius)\n3. Settu inn íslensk dæmi þar sem við á\n4. Vistaðu breytingar',
    instructionsIs: 'Aðlaga efni fyrir íslenska nemendur: umbreyta einingum, bæta við íslenskum dæmum.',
    inputs: ['faithful-markdown'],
    outputs: ['localized-markdown']
  },
  {
    id: 'finalize',
    name: 'Frágangur',
    description: 'Búa til lokaútgáfu og uppfæra stöðu',
    manual: false,
    outputs: ['publication-md', 'status-updated'],
    instructionsIs: 'Kerfið býr til lokaútgáfu og uppfærir stöðu.'
  }
];

// Prepared statements for better performance
const statements = {
  insert: db.prepare(`
    INSERT INTO sessions (id, book, chapter, modules, source_type, user_id, username, status, current_step, steps, files, expected_files, uploaded_files, issues, output_dir, created_at, updated_at, expires_at, error_log, last_good_state, files_manifest, retry_count, failed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  getByBookChapter: db.prepare('SELECT * FROM sessions WHERE book = ? AND chapter = ? AND status = ?'),
  update: db.prepare(`
    UPDATE sessions SET
      status = ?, current_step = ?, steps = ?, files = ?, expected_files = ?, uploaded_files = ?, issues = ?,
      cancel_reason = ?, updated_at = ?, completed_at = ?, cancelled_at = ?, expires_at = ?,
      error_log = ?, last_good_state = ?, files_manifest = ?, retry_count = ?, failed_at = ?
    WHERE id = ?
  `),
  listByUser: db.prepare('SELECT * FROM sessions WHERE user_id = ? AND status = ? ORDER BY updated_at DESC'),
  listAll: db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC'),
  deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  getExpired: db.prepare('SELECT * FROM sessions WHERE expires_at < ?'),
  deleteById: db.prepare('DELETE FROM sessions WHERE id = ?')
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
    failedAt: row.failed_at
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
    completedSteps = []
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
      issues: []
    };
  });

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
    startStep,  // Use startStep instead of always 0
    JSON.stringify(steps),
    JSON.stringify({}),
    JSON.stringify(expectedFiles),
    JSON.stringify(uploadedFiles),
    JSON.stringify([]),
    outputDir,
    now,
    now,
    expiresAt,
    JSON.stringify([]),  // error_log
    null,                // last_good_state
    JSON.stringify([]),  // files_manifest
    0,                   // retry_count
    null                 // failed_at
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
    currentStep: steps[startStep],
    startedAt: startStep,
    resumed: startStep > 0
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
    section: metadata.section,
    part: metadata.part,
    title: metadata.title,
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
 * For strings files: "1-2-strings.is.md" -> "1.2-strings"
 */
function extractSectionFromFilename(filename) {
  // Check if it's a strings file first
  const stringsMatch = filename.match(/^(\d+)[-.](\d+)-strings\./);
  if (stringsMatch) {
    return `${stringsMatch[1]}.${stringsMatch[2]}-strings`;
  }

  // Match patterns like "1-2" or "1.2" at start of filename
  const match = filename.match(/^(\d+)[-.](\d+)/);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }
  return null;
}

/**
 * Parse metadata from markdown content
 * Supports two formats:
 * 1. YAML frontmatter: ---\ntitle: "..."\nsection: "..."\n---
 * 2. Erlendur MT format: ## titill: „..." kafli: „..." eining: „..." tungumál: „..."
 */
function parseMarkdownFrontmatter(content) {
  // Try standard YAML frontmatter first
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const frontmatter = yamlMatch[1];
    const result = {};
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  // Try Erlendur MT format: ## titill: „..." kafli: „..." eining: „..." tungumál: „..."
  // The format uses Icelandic quotation marks: „ (U+201E) opening, " (U+201C) closing
  // Extract each field separately to handle quote variations
  if (content.startsWith('## titill:') || content.startsWith('##titill:')) {
    const titleMatch = content.match(/titill:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const sectionMatch = content.match(/kafli:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const moduleMatch = content.match(/eining:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const langMatch = content.match(/tungum\u00E1l:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const partMatch = content.match(/hluti:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);

    if (titleMatch && sectionMatch && moduleMatch) {
      let section = sectionMatch[1];
      // Normalize translated section names back to canonical form
      if (section.toLowerCase() === 'inngangur') {
        section = 'intro';
      }
      const result = {
        title: titleMatch[1],
        section: section,
        module: moduleMatch[1],
        lang: langMatch ? langMatch[1] : null
      };
      if (partMatch) {
        result.part = partMatch[1];
      }
      return result;
    }
  }

  // Try a more lenient Erlendur format (in case of variations)
  const lenientMatch = content.match(/kafli:\s*[„""']?(\d+\.\d+)[„""']?/i);
  if (lenientMatch) {
    const result = { section: lenientMatch[1] };

    // Try to extract module
    const moduleMatch = content.match(/eining:\s*[„""']?(m\d+)[„""']?/i);
    if (moduleMatch) result.module = moduleMatch[1];

    // Try to extract title
    const titleMatch = content.match(/titill:\s*[„""']?([^„""'\n]+)[„""']?/i);
    if (titleMatch) result.title = titleMatch[1].trim();

    return result;
  }

  return null;
}

/**
 * Identify uploaded file by parsing its content
 * Returns { section, module, title, part } or null
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
        lang: metadata.lang,
        part: metadata.part // For split files
      };
    }
  } catch (err) {
    console.error(`Failed to parse file ${filePath}:`, err.message);
  }
  return null;
}

/**
 * Split content at paragraph boundaries to stay under character limit
 * Returns array of { content, part } objects
 */
function splitContentForErlendur(content, metadata) {
  if (content.length <= ERLENDUR_SOFT_LIMIT) {
    return [{ content, part: null }];
  }

  const parts = [];
  const paragraphs = content.split(/\n\n+/);
  let currentPart = [];
  let currentLength = 0;
  let partIndex = 0;

  // Generate header for split files
  const makeHeader = (partLetter) => {
    if (metadata) {
      // Erlendur format with part indicator
      return `## titill: „${metadata.title || 'Unknown'}" kafli: „${metadata.section}" eining: „${metadata.module}" tungumál: „en" hluti: „${partLetter}"\n\n`;
    }
    return `<!-- Part ${partLetter} -->\n\n`;
  };

  for (const para of paragraphs) {
    const paraLength = para.length + 2; // +2 for \n\n

    if (currentLength + paraLength > ERLENDUR_SOFT_LIMIT && currentPart.length > 0) {
      // Save current part and start new one
      const partLetter = String.fromCharCode(97 + partIndex); // a, b, c...
      parts.push({
        content: makeHeader(partLetter) + currentPart.join('\n\n'),
        part: partLetter
      });
      currentPart = [para];
      currentLength = paraLength;
      partIndex++;
    } else {
      currentPart.push(para);
      currentLength += paraLength;
    }
  }

  // Add final part
  if (currentPart.length > 0) {
    const partLetter = String.fromCharCode(97 + partIndex);
    if (parts.length > 0) {
      parts.push({
        content: makeHeader(partLetter) + currentPart.join('\n\n'),
        part: partLetter
      });
    } else {
      // No splitting needed after all
      parts.push({ content: currentPart.join('\n\n'), part: null });
    }
  }

  return parts;
}

/**
 * Check if a file needs splitting for Erlendur MT
 * Returns { needsSplit, charCount, estimatedParts }
 */
function checkFileSplitNeeded(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const charCount = content.length;
    const needsSplit = charCount > ERLENDUR_SOFT_LIMIT;
    const estimatedParts = needsSplit
      ? Math.ceil(charCount / ERLENDUR_SOFT_LIMIT)
      : 1;

    return { needsSplit, charCount, estimatedParts };
  } catch (err) {
    console.error(`Failed to check file ${filePath}:`, err.message);
    return { needsSplit: false, charCount: 0, estimatedParts: 1 };
  }
}

/**
 * Split a markdown file into multiple parts for Erlendur MT
 * Returns array of { filename, path, part } objects
 */
function splitFileForErlendur(filePath, outputDir, section) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const metadata = parseMarkdownFrontmatter(content);

  // Remove the header from content if present (we'll add new Erlendur headers)
  let bodyContent = content;

  // Remove YAML frontmatter (---\n...\n---)
  const yamlMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (yamlMatch) {
    bodyContent = content.substring(yamlMatch[0].length);
  }
  // Also remove Erlendur-style header (## titill: ...)
  else if (content.startsWith('##')) {
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd > 0) {
      bodyContent = content.substring(headerEnd + 2);
    }
  }

  // Use section from metadata if available, fall back to passed section
  const effectiveSection = metadata?.section || section;
  const effectiveModule = metadata?.module || '';
  const effectiveTitle = metadata?.title || '';

  const metadataForSplit = {
    section: effectiveSection,
    title: effectiveTitle,
    module: effectiveModule
  };

  const parts = splitContentForErlendur(bodyContent, metadataForSplit);

  // Generate filename base from section
  const sectionBase = effectiveSection ? effectiveSection.replace('.', '-') : 'unknown';

  if (parts.length === 1 && parts[0].part === null) {
    // No splitting needed
    return [{ filename: `${sectionBase}.en.md`, path: filePath, part: null }];
  }

  const result = [];
  for (const { content: partContent, part } of parts) {
    const filename = `${sectionBase}(${part}).en.md`;
    const partPath = path.join(outputDir, filename);
    fs.writeFileSync(partPath, partContent, 'utf-8');
    result.push({ filename, path: partPath, part });
  }

  return result;
}

/**
 * Recombine split translated files into a single file
 * Expects uploads with matching section and sequential part letters (a, b, c...)
 */
function recombineSplitFiles(uploads, outputDir, section) {
  // Sort uploads by part letter
  const sortedUploads = uploads
    .filter(u => u.section === section && u.part)
    .sort((a, b) => (a.part || '').localeCompare(b.part || ''));

  if (sortedUploads.length === 0) {
    return null;
  }

  const combinedParts = [];
  for (const upload of sortedUploads) {
    try {
      let content = fs.readFileSync(upload.filePath, 'utf-8');

      // Remove part header from Erlendur output
      const headerMatch = content.match(/^##\s*titill:.*?hluti:.*?\n\n/);
      if (headerMatch) {
        content = content.substring(headerMatch[0].length);
      }

      combinedParts.push(content);
    } catch (err) {
      console.error(`Failed to read split file ${upload.filePath}:`, err.message);
    }
  }

  if (combinedParts.length === 0) {
    return null;
  }

  // Create combined file with proper header
  const firstUpload = sortedUploads[0];
  const header = `## titill: „${firstUpload.title || ''}" kafli: „${section}" eining: „${firstUpload.moduleId || ''}" tungumál: „is"\n\n`;
  const combinedContent = header + combinedParts.join('\n\n');

  const outputPath = path.join(outputDir, `${section.replace('.', '-')}.is.md`);
  fs.writeFileSync(outputPath, combinedContent, 'utf-8');

  return { path: outputPath, section };
}

/**
 * Get upload progress for a workflow step
 * Only counts uploads that match expected files (by section+part or moduleId)
 */
function getUploadProgress(sessionId, stepId) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  const expected = sess.expectedFiles[stepId] || [];
  const uploaded = sess.uploadedFiles[stepId] || [];

  // Create a key for matching: section+part or just section or moduleId
  const makeKey = (obj) => {
    if (obj.section && obj.part) return `${obj.section}:${obj.part}`;
    if (obj.section) return obj.section;
    if (obj.moduleId) return obj.moduleId;
    return null;
  };

  // Find which uploads actually match expected files
  const matchedUploads = [];
  const unmatchedUploads = [];
  const matchedKeys = new Set();

  for (const up of uploaded) {
    let matched = false;
    let matchedExp = null;

    for (const exp of expected) {
      if (typeof exp === 'object') {
        // For split files, must match both section AND part
        if (exp.part && up.part) {
          if (exp.section === up.section && exp.part === up.part) {
            matched = true;
            matchedExp = exp;
            break;
          }
        }
        // For non-split files, match by section or moduleId
        else if (!exp.part && !up.part) {
          if (exp.section && up.section === exp.section) {
            matched = true;
            matchedExp = exp;
            break;
          }
          if (exp.moduleId && up.moduleId === exp.moduleId) {
            matched = true;
            matchedExp = exp;
            break;
          }
        }
      } else {
        // Legacy: string filename
        const moduleId = extractModuleId(exp);
        if (moduleId && up.moduleId === moduleId) {
          matched = true;
          matchedExp = { moduleId };
          break;
        }
      }
    }

    if (matched) {
      matchedUploads.push({ ...up, matchedExpected: matchedExp });
      matchedKeys.add(makeKey(matchedExp));
    } else {
      unmatchedUploads.push(up);
    }
  }

  // Find missing expected files
  const missing = expected.filter(exp => {
    const key = typeof exp === 'object' ? makeKey(exp) : extractModuleId(exp);
    return !matchedKeys.has(key);
  });

  return {
    expected: expected.length,
    uploaded: matchedKeys.size,
    complete: missing.length === 0,
    missing,
    matchedFiles: matchedUploads,
    unmatchedFiles: unmatchedUploads,
    uploadedFiles: uploaded,
    expectedFiles: expected
  };
}

/**
 * Update expected files for a workflow step
 */
function updateExpectedFiles(sessionId, stepId, expectedFiles) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  sess.expectedFiles[stepId] = expectedFiles;
  sess.updatedAt = new Date().toISOString();
  saveSession(sess);

  return sess.expectedFiles[stepId];
}

/**
 * Record a file upload for a workflow step
 * Parses the uploaded file to identify it by metadata
 */
function recordUpload(sessionId, stepId, filename, filePath) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  if (!sess.uploadedFiles[stepId]) {
    sess.uploadedFiles[stepId] = [];
  }

  // Try to identify the file by parsing its content
  let metadata = null;
  if (filePath) {
    metadata = identifyUploadedFile(filePath);
  }

  // Extract info from filename as fallback
  const moduleIdFromName = extractModuleId(filename);
  const sectionFromName = extractSectionFromFilename(filename);

  // Check for part indicator in filename (e.g., "1-1(a).is.md")
  let partFromName = null;
  const partMatch = filename.match(/\(([a-z])\)\./i);
  if (partMatch) {
    partFromName = partMatch[1].toLowerCase();
  }

  const uploadRecord = {
    filename,
    filePath, // Store path for recombination
    section: metadata?.section || sectionFromName,
    moduleId: metadata?.module || moduleIdFromName,
    title: metadata?.title,
    part: metadata?.part || partFromName, // For split files
    uploadedAt: new Date().toISOString()
  };

  sess.uploadedFiles[stepId].push(uploadRecord);

  sess.updatedAt = new Date().toISOString();
  saveSession(sess);

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
  const failed = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get('failed');

  return {
    total: total.count,
    active: active.count,
    completed: completed.count,
    cancelled: cancelled.count,
    expired: expired.count,
    failed: failed.count,
    dbPath: DB_PATH
  };
}

// ============================================================================
// ERROR RECOVERY FUNCTIONS
// ============================================================================

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
    snapshotAt: new Date().toISOString()
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
  session.retryCount = 0;     // Reset retry count
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
    retryCount: session.retryCount
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
    logError(sessionId, session.steps[session.currentStep]?.id || 'unknown', 'Session rolled back to checkpoint', {
      rolledBackFrom: session.currentStep,
      rolledBackTo: snapshot.currentStep
    });

    saveSession(session);

    return {
      success: true,
      message: 'Session rolled back to previous checkpoint',
      currentStep: session.steps[session.currentStep],
      restoredAt: snapshot.snapshotAt
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
    session.steps = session.steps.map(step => ({
      ...step,
      status: 'pending',
      startedAt: null,
      completedAt: null,
      data: {},
      issues: []
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
      context: { previousStep: session.currentStep }
    });

    saveSession(session);

    return {
      success: true,
      message: 'Session reset to beginning',
      currentStep: session.steps[0]
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
      suggestion: 'Use rollback or reset to continue'
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
      context: { attemptNumber: session.retryCount }
    });

    saveSession(session);

    return {
      success: true,
      message: `Retry attempt ${session.retryCount} of ${MAX_RETRY_ATTEMPTS}`,
      currentStep,
      retriesRemaining: MAX_RETRY_ATTEMPTS - session.retryCount
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
    retryCount: session.retryCount
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
    errors: errors.length > 0 ? errors : undefined
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
      retriesRemaining: MAX_RETRY_ATTEMPTS - session.retryCount
    });
  }

  // Rollback is available if there's a checkpoint and not at step 0
  if (session.lastGoodState && session.currentStep > 0) {
    actions.push({
      action: 'rollback',
      available: true,
      checkpointStep: session.lastGoodState.currentStep,
      checkpointTime: session.lastGoodState.snapshotAt
    });
  }

  // Reset is always available
  actions.push({
    action: 'reset',
    available: true,
    requiresConfirmation: true
  });

  return {
    sessionStatus: session.status,
    stepStatus: currentStep?.status,
    retryCount: session.retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    hasCheckpoint: !!session.lastGoodState,
    actions
  };
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
    sessionId
  };
}

module.exports = {
  WORKFLOW_STEPS,
  ERLENDUR_CHAR_LIMIT,
  ERLENDUR_SOFT_LIMIT,
  MAX_RETRY_ATTEMPTS,
  createSession,
  getSession,
  updateStepStatus,
  advanceSession,
  storeFile,
  getFile,
  findActiveWorkflow,
  getUploadProgress,
  updateExpectedFiles,
  recordUpload,
  extractModuleId,
  extractSectionFromFilename,
  parseMarkdownFrontmatter,
  identifyUploadedFile,
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,
  addIssue,
  resolveIssue,
  getPendingIssues,
  cancelSession,
  listUserSessions,
  listAllSessions,
  cleanupExpiredSessions,
  getDbStats,
  deleteSession,
  // Error recovery functions
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
  getRecoveryActions
};
