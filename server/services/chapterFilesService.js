/**
 * Chapter Files Service
 *
 * Manages permanently stored generated files for chapters.
 * Files are stored in the 02-for-mt/{book}/ch{NN}/ directory structure
 * and tracked in the database.
 *
 * Replaces ephemeral session-based storage with permanent storage
 * that persists until explicitly regenerated.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * File types that can be generated
 */
const FILE_TYPES = {
  EN_MD: 'en-md',              // English markdown
  EQUATIONS: 'equations',       // Equations JSON
  FIGURES: 'figures',           // Figures JSON
  PROTECTED: 'protected',       // Protected strings JSON
  STRINGS: 'strings'            // Extracted strings TXT
};

/**
 * Get database connection
 */
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
}

/**
 * Check if the chapter files table exists
 */
function isTableReady() {
  const db = getDb();
  try {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_generated_files'").get();
    return !!result;
  } finally {
    db.close();
  }
}

/**
 * Get the directory path for a chapter's generated files
 */
function getChapterDir(bookSlug, chapterNum) {
  const paddedChapter = String(chapterNum).padStart(2, '0');
  return path.join(BOOKS_DIR, bookSlug, '02-for-mt', `ch${paddedChapter}`);
}

/**
 * Calculate file hash for change detection
 */
function calculateFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Get current (non-superseded) files for a chapter
 */
function getChapterFiles(bookSlug, chapterNum) {
  if (!isTableReady()) return [];

  const db = getDb();
  try {
    const files = db.prepare(`
      SELECT * FROM chapter_generated_files
      WHERE book_slug = ? AND chapter_num = ? AND superseded_at IS NULL
      ORDER BY file_type
    `).all(bookSlug, chapterNum);

    // Check if files actually exist on disk
    return files.map(f => ({
      ...f,
      exists: fs.existsSync(path.join(BOOKS_DIR, f.file_path)),
      metadata: JSON.parse(f.metadata || '{}')
    }));
  } finally {
    db.close();
  }
}

/**
 * Check if a chapter has all required files generated
 */
function hasRequiredFiles(bookSlug, chapterNum) {
  const files = getChapterFiles(bookSlug, chapterNum);
  const existingTypes = new Set(files.filter(f => f.exists).map(f => f.file_type));

  // Required: at least one EN markdown file
  return existingTypes.has(FILE_TYPES.EN_MD);
}

/**
 * Get all sections with generated files for a chapter
 */
function getChapterSectionFiles(bookSlug, chapterNum) {
  const chapterDir = getChapterDir(bookSlug, chapterNum);
  if (!fs.existsSync(chapterDir)) return [];

  const files = fs.readdirSync(chapterDir);
  const sections = new Map();

  for (const file of files) {
    // Parse section from filename (e.g., "1-1.en.md" -> "1-1")
    const match = file.match(/^(\d+-\d+|intro)/);
    if (match) {
      const section = match[1];
      if (!sections.has(section)) {
        sections.set(section, { section, files: [] });
      }
      sections.get(section).files.push({
        name: file,
        path: path.join(chapterDir, file),
        type: getFileType(file)
      });
    }
  }

  return Array.from(sections.values()).sort((a, b) => {
    if (a.section === 'intro') return -1;
    if (b.section === 'intro') return 1;
    return a.section.localeCompare(b.section, undefined, { numeric: true });
  });
}

/**
 * Determine file type from filename
 */
function getFileType(filename) {
  if (filename.endsWith('.en.md')) return FILE_TYPES.EN_MD;
  if (filename.includes('-equations.json')) return FILE_TYPES.EQUATIONS;
  if (filename.includes('-figures.json')) return FILE_TYPES.FIGURES;
  if (filename.includes('-protected.json')) return FILE_TYPES.PROTECTED;
  if (filename.includes('-strings.en.txt')) return FILE_TYPES.STRINGS;
  return 'other';
}

/**
 * Register a generated file in the database
 */
function registerFile(bookSlug, chapterNum, fileType, filePath, generatedBy, metadata = {}) {
  if (!isTableReady()) {
    throw new Error('Chapter files table not ready - run migrations first');
  }

  const db = getDb();
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(BOOKS_DIR, filePath);

    const relativePath = path.relative(BOOKS_DIR, absolutePath);
    const fileSize = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0;
    const fileHash = calculateFileHash(absolutePath);

    // Supersede any existing file of this type
    db.prepare(`
      UPDATE chapter_generated_files
      SET superseded_at = CURRENT_TIMESTAMP
      WHERE book_slug = ? AND chapter_num = ? AND file_type = ? AND superseded_at IS NULL
    `).run(bookSlug, chapterNum, fileType);

    // Insert new record
    const result = db.prepare(`
      INSERT INTO chapter_generated_files
        (book_slug, chapter_num, file_type, file_path, file_size, file_hash, generated_by, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookSlug,
      chapterNum,
      fileType,
      relativePath,
      fileSize,
      fileHash,
      generatedBy,
      JSON.stringify(metadata)
    );

    // Log the generation
    logGeneration(db, bookSlug, chapterNum, 'file_generated', generatedBy, {
      fileType,
      filePath: relativePath,
      fileSize
    });

    return result.lastInsertRowid;
  } finally {
    db.close();
  }
}

/**
 * Register multiple files at once (batch)
 */
function registerFiles(bookSlug, chapterNum, files, generatedBy) {
  if (!isTableReady()) {
    throw new Error('Chapter files table not ready - run migrations first');
  }

  const db = getDb();
  try {
    const registered = [];

    const supersede = db.prepare(`
      UPDATE chapter_generated_files
      SET superseded_at = CURRENT_TIMESTAMP
      WHERE book_slug = ? AND chapter_num = ? AND file_type = ? AND superseded_at IS NULL
    `);

    const insert = db.prepare(`
      INSERT INTO chapter_generated_files
        (book_slug, chapter_num, file_type, file_path, file_size, file_hash, generated_by, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((files) => {
      for (const file of files) {
        const absolutePath = path.isAbsolute(file.path)
          ? file.path
          : path.join(BOOKS_DIR, file.path);

        const relativePath = path.relative(BOOKS_DIR, absolutePath);
        const fileSize = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0;
        const fileHash = calculateFileHash(absolutePath);

        // Supersede existing
        supersede.run(bookSlug, chapterNum, file.type);

        // Insert new
        const result = insert.run(
          bookSlug,
          chapterNum,
          file.type,
          relativePath,
          fileSize,
          fileHash,
          generatedBy,
          JSON.stringify(file.metadata || {})
        );

        registered.push({
          id: result.lastInsertRowid,
          type: file.type,
          path: relativePath
        });
      }
    });

    insertMany(files);

    // Log the batch generation
    logGeneration(db, bookSlug, chapterNum, 'files_generated', generatedBy, {
      fileCount: files.length,
      files: registered.map(r => r.type)
    });

    return registered;
  } finally {
    db.close();
  }
}

/**
 * Clear all files for a chapter (before regeneration)
 */
function clearChapterFiles(bookSlug, chapterNum, clearedBy) {
  if (!isTableReady()) return;

  const db = getDb();
  try {
    // Mark all current files as superseded
    const result = db.prepare(`
      UPDATE chapter_generated_files
      SET superseded_at = CURRENT_TIMESTAMP
      WHERE book_slug = ? AND chapter_num = ? AND superseded_at IS NULL
    `).run(bookSlug, chapterNum);

    // Log the clear
    logGeneration(db, bookSlug, chapterNum, 'files_cleared', clearedBy, {
      filesCleared: result.changes
    });

    return result.changes;
  } finally {
    db.close();
  }
}

/**
 * Delete files from disk (for regeneration)
 */
function deleteChapterFilesFromDisk(bookSlug, chapterNum) {
  const chapterDir = getChapterDir(bookSlug, chapterNum);

  if (!fs.existsSync(chapterDir)) return { deleted: 0 };

  const files = fs.readdirSync(chapterDir);
  let deleted = 0;

  for (const file of files) {
    // Only delete generated files (EN markdown, JSON, TXT)
    if (file.endsWith('.en.md') || file.endsWith('.json') || file.endsWith('.en.txt')) {
      try {
        fs.unlinkSync(path.join(chapterDir, file));
        deleted++;
      } catch (e) {
        console.warn(`Could not delete ${file}:`, e.message);
      }
    }
  }

  return { deleted };
}

/**
 * Get generation history for a chapter
 */
function getGenerationHistory(bookSlug, chapterNum, limit = 20) {
  if (!isTableReady()) return [];

  const db = getDb();
  try {
    return db.prepare(`
      SELECT * FROM chapter_generation_log
      WHERE book_slug = ? AND chapter_num = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(bookSlug, chapterNum, limit).map(r => ({
      ...r,
      details: JSON.parse(r.details || '{}')
    }));
  } finally {
    db.close();
  }
}

/**
 * Log a generation action
 */
function logGeneration(db, bookSlug, chapterNum, action, userId, details = {}) {
  db.prepare(`
    INSERT INTO chapter_generation_log (book_slug, chapter_num, action, user_id, username, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bookSlug, chapterNum, action, userId, userId, JSON.stringify(details));
}

/**
 * Get summary of generated files for multiple chapters
 */
function getBookFilesSummary(bookSlug) {
  if (!isTableReady()) return [];

  const db = getDb();
  try {
    const summary = db.prepare(`
      SELECT
        chapter_num,
        COUNT(*) as file_count,
        MAX(generated_at) as last_generated
      FROM chapter_generated_files
      WHERE book_slug = ? AND superseded_at IS NULL
      GROUP BY chapter_num
      ORDER BY chapter_num
    `).all(bookSlug);

    return summary;
  } finally {
    db.close();
  }
}

/**
 * Scan existing files on disk and register them in database
 * Useful for importing CLI-generated files
 */
function scanAndRegisterExistingFiles(bookSlug, chapterNum, registeredBy) {
  const chapterDir = getChapterDir(bookSlug, chapterNum);

  if (!fs.existsSync(chapterDir)) {
    return { found: 0, registered: 0 };
  }

  const files = fs.readdirSync(chapterDir);
  const toRegister = [];

  for (const file of files) {
    const filePath = path.join(chapterDir, file);
    const fileType = getFileType(file);

    if (fileType !== 'other') {
      toRegister.push({
        type: fileType,
        path: filePath,
        metadata: { scannedFrom: 'disk', originalName: file }
      });
    }
  }

  if (toRegister.length === 0) {
    return { found: 0, registered: 0 };
  }

  const registered = registerFiles(bookSlug, chapterNum, toRegister, registeredBy);

  return {
    found: toRegister.length,
    registered: registered.length
  };
}

module.exports = {
  // Query
  getChapterFiles,
  getChapterSectionFiles,
  hasRequiredFiles,
  getGenerationHistory,
  getBookFilesSummary,
  isTableReady,

  // Registration
  registerFile,
  registerFiles,
  scanAndRegisterExistingFiles,

  // Management
  clearChapterFiles,
  deleteChapterFilesFromDisk,

  // Utilities
  getChapterDir,
  calculateFileHash,
  FILE_TYPES
};
