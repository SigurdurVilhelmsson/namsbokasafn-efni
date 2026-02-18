/**
 * Workflow Persistence Service
 *
 * Handles saving workflow outputs to permanent locations and updating
 * the book_sections database table to track progress.
 *
 * Step-to-Folder Mapping:
 * | Workflow Step    | Output Folder         | File Pattern            | DB Status          |
 * |------------------|-----------------------|-------------------------|--------------------|
 * | source           | 02-for-mt/ch{NN}/     | {section}.en.md, .json  | mt_pending         |
 * | mt-upload        | 02-mt-output/ch{NN}/  | {section}.is.md         | mt_uploaded        |
 * | faithful-edit    | 03-faithful-translation/ch{NN}/ | {section}.is.md  | review_approved    |
 * | tm-creation      | tm/ch{NN}/            | {section}.tmx           | tm_created         |
 * | localization     | 04-localized-content/ch{NN}/ | {section}.is.md    | localization_approved |
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');
const DB_PATH = path.join(PROJECT_ROOT, 'pipeline-output', 'sessions.db');

// Step to folder and status mapping
const STEP_CONFIG = {
  source: {
    folder: '02-for-mt',
    status: 'mt_pending',
    filePattern: (section) => `${section.replace('.', '-')}.en.md`,
    dbField: 'en_md_path',
  },
  'mt-upload': {
    folder: '02-mt-output',
    status: 'mt_uploaded',
    filePattern: (section) => `${section.replace('.', '-')}.is.md`,
    dbField: 'mt_output_path',
  },
  'faithful-edit': {
    folder: '03-faithful-translation',
    status: 'review_approved',
    filePattern: (section) => `${section.replace('.', '-')}.is.md`,
    dbField: 'faithful_path',
  },
  'tm-creation': {
    folder: 'tm',
    status: 'tm_created',
    filePattern: (section) => `${section.replace('.', '-')}.tmx`,
    dbField: null, // TMX doesn't have a dedicated column
  },
  localization: {
    folder: '04-localized-content',
    status: 'localization_approved',
    filePattern: (section) => `${section.replace('.', '-')}.is.md`,
    dbField: 'localized_path',
  },
};

// Step order for resume detection
const STEP_ORDER = ['source', 'mt-upload', 'faithful-edit', 'tm-creation', 'localization'];

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
 * Get the permanent folder path for a workflow step
 *
 * @param {string} bookSlug - Book slug (e.g., 'efnafraedi')
 * @param {number} chapter - Chapter number
 * @param {string} stepId - Workflow step ID (e.g., 'source', 'mt-upload')
 * @returns {string} Full path to the folder
 */
function getStepFolder(bookSlug, chapter, stepId) {
  const config = STEP_CONFIG[stepId];
  if (!config) {
    throw new Error(`Unknown step: ${stepId}`);
  }

  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const folderPath = path.join(BOOKS_DIR, bookSlug, config.folder, chapterDir);

  // Ensure folder exists
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  return folderPath;
}

/**
 * Save a workflow file to its permanent location
 *
 * @param {string} bookSlug - Book slug (e.g., 'efnafraedi')
 * @param {number} chapter - Chapter number
 * @param {string} section - Section identifier (e.g., '4.1', 'intro')
 * @param {string} stepId - Workflow step ID
 * @param {string} sourcePath - Path to the source file to copy
 * @param {object} options - Additional options
 * @param {string} options.fileType - Override file type (e.g., 'equations' for .json files)
 * @returns {object} { success, destPath, error }
 */
function saveWorkflowFile(bookSlug, chapter, section, stepId, sourcePath, options = {}) {
  try {
    const config = STEP_CONFIG[stepId];
    if (!config) {
      return { success: false, error: `Unknown step: ${stepId}` };
    }

    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: `Source file not found: ${sourcePath}` };
    }

    const folderPath = getStepFolder(bookSlug, chapter, stepId);

    // Determine filename based on file type
    let filename;
    if (options.fileType === 'equations') {
      filename = `${section.replace('.', '-')}-equations.json`;
    } else {
      filename = config.filePattern(section);
    }

    const destPath = path.join(folderPath, filename);

    // Copy file to permanent location
    fs.copyFileSync(sourcePath, destPath);

    return { success: true, destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Update book_sections status based on workflow step completion
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} section - Section identifier (e.g., '4.1', 'intro')
 * @param {string} stepId - Workflow step ID
 * @param {object} options - Additional options
 * @param {string} options.filePath - Path to the file (for updating path columns)
 * @returns {object} { success, updated, error }
 */
function updateSectionFromWorkflow(bookSlug, chapter, section, stepId, options = {}) {
  const db = getDb();

  try {
    const config = STEP_CONFIG[stepId];
    if (!config) {
      db.close();
      return { success: false, error: `Unknown step: ${stepId}` };
    }

    // Find the section in book_sections
    const sectionRow = db
      .prepare(
        `
      SELECT bs.id, bs.status
      FROM book_sections bs
      JOIN registered_books rb ON rb.id = bs.book_id
      WHERE rb.slug = ? AND bs.chapter_num = ? AND bs.section_num = ?
    `
      )
      .get(bookSlug, chapter, section);

    if (!sectionRow) {
      db.close();
      return { success: false, error: `Section not found: ${bookSlug} ch${chapter} ${section}` };
    }

    // Build update query
    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [config.status];

    // Add path update if applicable
    if (config.dbField && options.filePath) {
      // Store relative path from books directory
      const relativePath = path.relative(BOOKS_DIR, options.filePath);
      updates.push(`${config.dbField} = ?`);
      values.push(relativePath);
    }

    // Add timestamp for specific statuses
    const timestampFields = {
      mt_pending: null,
      mt_uploaded: null,
      review_approved: 'linguistic_approved_at',
      tm_created: 'tm_created_at',
      localization_approved: 'localization_approved_at',
    };

    if (timestampFields[config.status]) {
      updates.push(`${timestampFields[config.status]} = CURRENT_TIMESTAMP`);
    }

    values.push(sectionRow.id);

    const query = `UPDATE book_sections SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    db.close();
    return { success: true, updated: true, sectionId: sectionRow.id };
  } catch (err) {
    db.close();
    return { success: false, error: err.message };
  }
}

/**
 * Detect existing workflow progress for a chapter
 *
 * Scans the filesystem and database to determine:
 * - What files already exist
 * - What step the workflow can resume from
 * - Status of each section
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @returns {object} { canResume, resumeStep, resumeStepIndex, sections, completedSteps }
 */
function detectExistingProgress(bookSlug, chapter) {
  const db = getDb();

  try {
    // Get sections for this chapter from database
    const sections = db
      .prepare(
        `
      SELECT bs.section_num, bs.module_id, bs.title_en, bs.status,
             bs.en_md_path, bs.mt_output_path, bs.faithful_path, bs.localized_path
      FROM book_sections bs
      JOIN registered_books rb ON rb.id = bs.book_id
      WHERE rb.slug = ? AND bs.chapter_num = ?
      ORDER BY
        CASE WHEN bs.section_num = 'intro' THEN 0 ELSE 1 END,
        CAST(REPLACE(bs.section_num, '.', '') AS INTEGER)
    `
      )
      .all(bookSlug, chapter);

    if (sections.length === 0) {
      db.close();
      return {
        canResume: false,
        resumeStep: null,
        resumeStepIndex: 0,
        sections: [],
        completedSteps: [],
        error: 'No sections found for this chapter',
      };
    }

    const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
    const completedSteps = [];
    const stepProgress = {};

    // Check each step's files
    for (const stepId of STEP_ORDER) {
      const config = STEP_CONFIG[stepId];
      const folderPath = path.join(BOOKS_DIR, bookSlug, config.folder, chapterDir);

      let filesFound = 0;
      const filesExpected = sections.length;

      if (fs.existsSync(folderPath)) {
        for (const section of sections) {
          const filename = config.filePattern(section.section_num);
          const filePath = path.join(folderPath, filename);
          if (fs.existsSync(filePath)) {
            filesFound++;
          }
        }
      }

      stepProgress[stepId] = {
        filesFound,
        filesExpected,
        complete: filesFound === filesExpected && filesFound > 0,
        partial: filesFound > 0 && filesFound < filesExpected,
      };

      if (stepProgress[stepId].complete) {
        completedSteps.push(stepId);
      }
    }

    // Determine resume point
    let resumeStepIndex = 0;
    let resumeStep = STEP_ORDER[0];

    // Find the first incomplete step after completed steps
    for (let i = 0; i < STEP_ORDER.length; i++) {
      const stepId = STEP_ORDER[i];
      if (stepProgress[stepId].complete) {
        resumeStepIndex = i + 1;
        if (i + 1 < STEP_ORDER.length) {
          resumeStep = STEP_ORDER[i + 1];
        } else {
          // All steps complete
          resumeStep = null;
          resumeStepIndex = STEP_ORDER.length;
        }
      } else if (stepProgress[stepId].partial) {
        // Partial progress - resume at this step
        resumeStepIndex = i;
        resumeStep = stepId;
        break;
      } else {
        // No progress at this step - resume here
        break;
      }
    }

    const canResume =
      completedSteps.length > 0 || Object.values(stepProgress).some((s) => s.partial);

    // Build section details with file status
    const sectionDetails = sections.map((s) => ({
      section: s.section_num,
      moduleId: s.module_id,
      title: s.title_en,
      dbStatus: s.status,
      files: {
        enMd: checkFileExists(bookSlug, chapter, s.section_num, 'source'),
        mtOutput: checkFileExists(bookSlug, chapter, s.section_num, 'mt-upload'),
        faithful: checkFileExists(bookSlug, chapter, s.section_num, 'faithful-edit'),
        localized: checkFileExists(bookSlug, chapter, s.section_num, 'localization'),
        tm: checkFileExists(bookSlug, chapter, s.section_num, 'tm-creation'),
      },
    }));

    db.close();

    return {
      canResume,
      resumeStep,
      resumeStepIndex,
      sections: sectionDetails,
      completedSteps,
      stepProgress,
    };
  } catch (err) {
    db.close();
    return {
      canResume: false,
      resumeStep: null,
      resumeStepIndex: 0,
      sections: [],
      completedSteps: [],
      error: err.message,
    };
  }
}

/**
 * Check if a specific file exists for a section
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} section - Section identifier
 * @param {string} stepId - Workflow step ID
 * @returns {object} { exists, path }
 */
function checkFileExists(bookSlug, chapter, section, stepId) {
  const config = STEP_CONFIG[stepId];
  if (!config) {
    return { exists: false, path: null };
  }

  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const filename = config.filePattern(section);
  const filePath = path.join(BOOKS_DIR, bookSlug, config.folder, chapterDir, filename);

  return {
    exists: fs.existsSync(filePath),
    path: filePath,
  };
}

/**
 * Get download information for completed steps
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @param {string[]} completedSteps - List of completed step IDs
 * @returns {object} Download info per step
 */
function getCompletedStepDownloads(bookSlug, chapter, completedSteps) {
  const downloads = {};
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;

  for (const stepId of completedSteps) {
    const config = STEP_CONFIG[stepId];
    if (!config) continue;

    const folderPath = path.join(BOOKS_DIR, bookSlug, config.folder, chapterDir);
    if (!fs.existsSync(folderPath)) continue;

    const files = fs.readdirSync(folderPath).filter((f) => {
      // Match the expected pattern
      const ext = path.extname(f);
      if (stepId === 'source') return ext === '.md' && f.endsWith('.en.md');
      if (stepId === 'mt-upload') return ext === '.md' && f.endsWith('.is.md');
      if (stepId === 'faithful-edit') return ext === '.md' && f.endsWith('.is.md');
      if (stepId === 'tm-creation') return ext === '.tmx';
      if (stepId === 'localization') return ext === '.md' && f.endsWith('.is.md');
      return false;
    });

    downloads[stepId] = {
      folder: path.join(bookSlug, config.folder, chapterDir),
      files: files.map((f) => ({
        name: f,
        path: path.join(folderPath, f),
        size: fs.statSync(path.join(folderPath, f)).size,
      })),
      fileCount: files.length,
    };
  }

  return downloads;
}

/**
 * Batch update multiple sections from workflow completion
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} stepId - Workflow step ID
 * @param {Array<{section: string, filePath: string}>} sectionFiles - Array of section/file pairs
 * @returns {object} { success, updated, errors }
 */
function batchUpdateSections(bookSlug, chapter, stepId, sectionFiles) {
  const results = {
    success: true,
    updated: 0,
    errors: [],
  };

  for (const { section, filePath } of sectionFiles) {
    const result = updateSectionFromWorkflow(bookSlug, chapter, section, stepId, { filePath });
    if (result.success) {
      results.updated++;
    } else {
      results.errors.push({ section, error: result.error });
      results.success = false;
    }
  }

  return results;
}

module.exports = {
  STEP_CONFIG,
  STEP_ORDER,
  getStepFolder,
  saveWorkflowFile,
  updateSectionFromWorkflow,
  detectExistingProgress,
  checkFileExists,
  getCompletedStepDownloads,
  batchUpdateSections,
};
