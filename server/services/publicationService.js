/**
 * Publication Service
 *
 * Manages the publication workflow for translated content:
 * 1. MT Preview - Unreviewed machine translation (labeled as such)
 * 2. Faithful - Human-reviewed linguistic translation (Pass 1 complete)
 * 3. Localized - Culturally adapted for Iceland (Pass 2 complete)
 *
 * All publications require head editor approval.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * Get existing files in a target directory that would be overwritten
 *
 * @param {string} targetDir - Target directory path
 * @param {string} pattern - File extension pattern (default: '.is.md')
 * @returns {Array} Array of file info objects
 */
function getExistingFiles(targetDir, pattern = '.is.md') {
  if (!fs.existsSync(targetDir)) return [];
  return fs.readdirSync(targetDir)
    .filter(f => f.endsWith(pattern))
    .map(f => ({
      name: f,
      path: path.join(targetDir, f),
      mtime: fs.statSync(path.join(targetDir, f)).mtime.toISOString()
    }));
}

// Publication tracks
const PUBLICATION_TRACKS = {
  MT_PREVIEW: 'mt-preview',
  FAITHFUL: 'faithful',
  LOCALIZED: 'localized'
};

// MT Preview warning banner (Icelandic)
const MT_PREVIEW_BANNER = `:::warning{title="Vélþýðing"}
Þessi texti er vélþýddur og hefur ekki verið yfirfarinn af ritstjóra. Villur kunna að vera til staðar. Ritstýrð útgáfa er í vinnslu.
:::

`;

// MT Preview warning banner (for frontmatter)
const MT_PREVIEW_FRONTMATTER_NOTE = 'Vélþýðing - ekki yfirfarin';

/**
 * Initialize database connection
 */
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
}

/**
 * Check if a chapter is ready for MT preview publication
 * Requirements:
 * - MT output exists for all sections
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Readiness status
 */
function checkMtPreviewReadiness(bookSlug, chapterNum) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const mtOutputDir = path.join(BOOKS_DIR, bookSlug, '02-mt-output', chapterDir);

  if (!fs.existsSync(mtOutputDir)) {
    return {
      ready: false,
      reason: 'MT output directory does not exist',
      missingFiles: []
    };
  }

  const files = fs.readdirSync(mtOutputDir).filter(f => f.endsWith('.is.md'));

  if (files.length === 0) {
    return {
      ready: false,
      reason: 'No MT output files found',
      missingFiles: []
    };
  }

  return {
    ready: true,
    files,
    fileCount: files.length
  };
}

/**
 * Check if a chapter is ready for faithful publication
 * Requirements:
 * - All sections have linguistic review approved
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Readiness status
 */
function checkFaithfulReadiness(bookSlug, chapterNum) {
  const db = getDb();

  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      return { ready: false, reason: 'Book not registered' };
    }

    const sections = db.prepare(`
      SELECT id, section_num, linguistic_approved_at, faithful_path
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ?
    `).all(book.id, chapterNum);

    if (sections.length === 0) {
      db.close();
      return { ready: false, reason: 'No sections registered for this chapter' };
    }

    const unapproved = sections.filter(s => !s.linguistic_approved_at);
    const missingFiles = sections.filter(s => {
      if (!s.faithful_path) return true;
      const fullPath = path.join(BOOKS_DIR, bookSlug, s.faithful_path);
      return !fs.existsSync(fullPath);
    });

    db.close();

    if (unapproved.length > 0) {
      return {
        ready: false,
        reason: `${unapproved.length} section(s) pending linguistic review approval`,
        unapprovedSections: unapproved.map(s => s.section_num)
      };
    }

    if (missingFiles.length > 0) {
      return {
        ready: false,
        reason: `${missingFiles.length} section(s) missing faithful translation files`,
        missingSections: missingFiles.map(s => s.section_num)
      };
    }

    return {
      ready: true,
      sectionCount: sections.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Check if a chapter is ready for localized publication
 * Requirements:
 * - All sections have localization approved
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Readiness status
 */
function checkLocalizedReadiness(bookSlug, chapterNum) {
  const db = getDb();

  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      return { ready: false, reason: 'Book not registered' };
    }

    const sections = db.prepare(`
      SELECT id, section_num, localization_approved_at, localized_path
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ?
    `).all(book.id, chapterNum);

    if (sections.length === 0) {
      db.close();
      return { ready: false, reason: 'No sections registered for this chapter' };
    }

    const unapproved = sections.filter(s => !s.localization_approved_at);
    const missingFiles = sections.filter(s => {
      if (!s.localized_path) return true;
      const fullPath = path.join(BOOKS_DIR, bookSlug, s.localized_path);
      return !fs.existsSync(fullPath);
    });

    db.close();

    if (unapproved.length > 0) {
      return {
        ready: false,
        reason: `${unapproved.length} section(s) pending localization approval`,
        unapprovedSections: unapproved.map(s => s.section_num)
      };
    }

    if (missingFiles.length > 0) {
      return {
        ready: false,
        reason: `${missingFiles.length} section(s) missing localized files`,
        missingSections: missingFiles.map(s => s.section_num)
      };
    }

    return {
      ready: true,
      sectionCount: sections.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Publish MT preview for a chapter
 * Adds MT warning banner to each file
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} approvedBy - User ID of approving head editor
 * @param {string} approvedByName - Name of approving head editor
 * @param {object} options - Options: { dryRun: boolean }
 * @returns {object} Publication result or preview info
 */
function publishMtPreview(bookSlug, chapterNum, approvedBy, approvedByName, { dryRun = false } = {}) {
  const readiness = checkMtPreviewReadiness(bookSlug, chapterNum);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for MT preview: ${readiness.reason}`);
  }

  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '02-mt-output', chapterDir);
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'mt-preview', 'chapters', chapterDir);

  // Check for existing files that would be overwritten
  const existingFiles = getExistingFiles(targetDir);
  const existingNames = new Set(existingFiles.map(f => f.name));
  const willOverwrite = existingFiles.filter(f => readiness.files.includes(f.name));
  const willCreate = readiness.files.filter(f => !existingNames.has(f));

  // If dry run, return preview info
  if (dryRun) {
    return {
      dryRun: true,
      sourceDir: `02-mt-output/${chapterDir}`,
      targetDir: `05-publication/mt-preview/chapters/${chapterDir}`,
      willOverwrite,
      willCreate,
      totalFiles: readiness.files.length
    };
  }

  // Run MT restoration before copying files
  // This integrates translated strings and restores table content
  const mtRestoration = require('./mtRestoration');
  const restorationResult = mtRestoration.runMtRestoration(bookSlug, chapterNum, { verbose: false });

  if (!restorationResult.success) {
    console.error(`MT restoration warning: ${restorationResult.error}`);
    // Continue with publication even if restoration fails - files may not have strings/tables
  }

  // Create target directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const publishedFiles = [];

  for (const file of readiness.files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    let content = fs.readFileSync(sourcePath, 'utf8');

    // Add MT warning banner after frontmatter (if present) or at start
    content = addMtPreviewBanner(content);

    // Add/update frontmatter with MT preview note
    content = updateFrontmatter(content, {
      'translation-status': MT_PREVIEW_FRONTMATTER_NOTE,
      'published-at': new Date().toISOString(),
      'approved-by': approvedByName
    });

    fs.writeFileSync(targetPath, content, 'utf8');
    publishedFiles.push(file);
  }

  // Update chapter status.json
  updateChapterStatus(bookSlug, chapterNum, 'publication', {
    mtPreview: {
      complete: true,
      date: new Date().toISOString().split('T')[0],
      approvedBy: approvedByName,
      fileCount: publishedFiles.length
    }
  });

  return {
    success: true,
    track: PUBLICATION_TRACKS.MT_PREVIEW,
    chapter: chapterNum,
    filesPublished: publishedFiles.length,
    files: publishedFiles,
    restoration: restorationResult.success ? restorationResult.summary : null
  };
}

/**
 * Publish faithful translation for a chapter
 * Replaces MT preview with human-reviewed content
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} approvedBy - User ID of approving head editor
 * @param {string} approvedByName - Name of approving head editor
 * @param {object} options - Options: { dryRun: boolean }
 * @returns {object} Publication result or preview info
 */
function publishFaithful(bookSlug, chapterNum, approvedBy, approvedByName, { dryRun = false } = {}) {
  const readiness = checkFaithfulReadiness(bookSlug, chapterNum);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for faithful publication: ${readiness.reason}`);
  }

  const db = getDb();
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'faithful', 'chapters', chapterDir);

  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    const sections = db.prepare(`
      SELECT id, section_num, faithful_path
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ?
    `).all(book.id, chapterNum);

    // Calculate source files for dry run
    const sourceFiles = sections.map(s => path.basename(s.faithful_path));
    const existingFiles = getExistingFiles(targetDir);
    const existingNames = new Set(existingFiles.map(f => f.name));
    const willOverwrite = existingFiles.filter(f => sourceFiles.includes(f.name));
    const willCreate = sourceFiles.filter(f => !existingNames.has(f));

    // If dry run, return preview info
    if (dryRun) {
      db.close();
      return {
        dryRun: true,
        sourceDir: `03-faithful/${chapterDir}`,
        targetDir: `05-publication/faithful/chapters/${chapterDir}`,
        willOverwrite,
        willCreate,
        totalFiles: sourceFiles.length
      };
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const publishedFiles = [];

    for (const section of sections) {
      const sourcePath = path.join(BOOKS_DIR, bookSlug, section.faithful_path);
      const filename = path.basename(section.faithful_path);
      const targetPath = path.join(targetDir, filename);

      let content = fs.readFileSync(sourcePath, 'utf8');

      // Remove any MT preview banner if present
      content = removeMtPreviewBanner(content);

      // Update frontmatter
      content = updateFrontmatter(content, {
        'translation-status': 'Ritstýrð þýðing',
        'published-at': new Date().toISOString(),
        'approved-by': approvedByName
      });

      fs.writeFileSync(targetPath, content, 'utf8');
      publishedFiles.push(filename);

      // Update section record
      db.prepare(`
        UPDATE book_sections
        SET faithful_published_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(section.id);
    }

    db.close();

    // Update chapter status.json
    updateChapterStatus(bookSlug, chapterNum, 'publication', {
      faithful: {
        complete: true,
        date: new Date().toISOString().split('T')[0],
        approvedBy: approvedByName,
        fileCount: publishedFiles.length
      }
    });

    return {
      success: true,
      track: PUBLICATION_TRACKS.FAITHFUL,
      chapter: chapterNum,
      filesPublished: publishedFiles.length,
      files: publishedFiles,
      replacesMtPreview: true
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Publish localized content for a chapter
 * Replaces faithful with culturally adapted content
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} approvedBy - User ID of approving head editor
 * @param {string} approvedByName - Name of approving head editor
 * @param {object} options - Options: { dryRun: boolean }
 * @returns {object} Publication result or preview info
 */
function publishLocalized(bookSlug, chapterNum, approvedBy, approvedByName, { dryRun = false } = {}) {
  const readiness = checkLocalizedReadiness(bookSlug, chapterNum);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for localized publication: ${readiness.reason}`);
  }

  const db = getDb();
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'localized', 'chapters', chapterDir);

  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    const sections = db.prepare(`
      SELECT id, section_num, localized_path
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ?
    `).all(book.id, chapterNum);

    // Calculate source files for dry run
    const sourceFiles = sections.map(s => path.basename(s.localized_path));
    const existingFiles = getExistingFiles(targetDir);
    const existingNames = new Set(existingFiles.map(f => f.name));
    const willOverwrite = existingFiles.filter(f => sourceFiles.includes(f.name));
    const willCreate = sourceFiles.filter(f => !existingNames.has(f));

    // If dry run, return preview info
    if (dryRun) {
      db.close();
      return {
        dryRun: true,
        sourceDir: `04-localized/${chapterDir}`,
        targetDir: `05-publication/localized/chapters/${chapterDir}`,
        willOverwrite,
        willCreate,
        totalFiles: sourceFiles.length
      };
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const publishedFiles = [];

    for (const section of sections) {
      const sourcePath = path.join(BOOKS_DIR, bookSlug, section.localized_path);
      const filename = path.basename(section.localized_path);
      const targetPath = path.join(targetDir, filename);

      let content = fs.readFileSync(sourcePath, 'utf8');

      // Update frontmatter
      content = updateFrontmatter(content, {
        'translation-status': 'Staðfærð útgáfa',
        'published-at': new Date().toISOString(),
        'approved-by': approvedByName
      });

      fs.writeFileSync(targetPath, content, 'utf8');
      publishedFiles.push(filename);

      // Update section record
      db.prepare(`
        UPDATE book_sections
        SET localized_published_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(section.id);
    }

    db.close();

    // Update chapter status.json
    updateChapterStatus(bookSlug, chapterNum, 'publication', {
      localized: {
        complete: true,
        date: new Date().toISOString().split('T')[0],
        approvedBy: approvedByName,
        fileCount: publishedFiles.length
      }
    });

    return {
      success: true,
      track: PUBLICATION_TRACKS.LOCALIZED,
      chapter: chapterNum,
      filesPublished: publishedFiles.length,
      files: publishedFiles,
      replacesFaithful: true
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get publication status for a chapter
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Publication status for all tracks
 */
function getPublicationStatus(bookSlug, chapterNum) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const pubDir = path.join(BOOKS_DIR, bookSlug, '05-publication');

  const status = {
    mtPreview: {
      published: false,
      fileCount: 0,
      path: null
    },
    faithful: {
      published: false,
      fileCount: 0,
      path: null
    },
    localized: {
      published: false,
      fileCount: 0,
      path: null
    }
  };

  // Check MT preview
  const mtPreviewDir = path.join(pubDir, 'mt-preview', 'chapters', chapterDir);
  if (fs.existsSync(mtPreviewDir)) {
    const files = fs.readdirSync(mtPreviewDir).filter(f => f.endsWith('.md'));
    status.mtPreview.published = files.length > 0;
    status.mtPreview.fileCount = files.length;
    status.mtPreview.path = `05-publication/mt-preview/chapters/${chapterDir}`;
  }

  // Check faithful
  const faithfulDir = path.join(pubDir, 'faithful', 'chapters', chapterDir);
  if (fs.existsSync(faithfulDir)) {
    const files = fs.readdirSync(faithfulDir).filter(f => f.endsWith('.md'));
    status.faithful.published = files.length > 0;
    status.faithful.fileCount = files.length;
    status.faithful.path = `05-publication/faithful/chapters/${chapterDir}`;
  }

  // Check localized
  const localizedDir = path.join(pubDir, 'localized', 'chapters', chapterDir);
  if (fs.existsSync(localizedDir)) {
    const files = fs.readdirSync(localizedDir).filter(f => f.endsWith('.md'));
    status.localized.published = files.length > 0;
    status.localized.fileCount = files.length;
    status.localized.path = `05-publication/localized/chapters/${chapterDir}`;
  }

  // Determine active track (what readers see)
  status.activeTrack = status.localized.published ? 'localized' :
                       status.faithful.published ? 'faithful' :
                       status.mtPreview.published ? 'mt-preview' : null;

  // Check readiness for next track
  status.readyFor = {
    mtPreview: !status.mtPreview.published && checkMtPreviewReadiness(bookSlug, chapterNum).ready,
    faithful: !status.faithful.published && checkFaithfulReadiness(bookSlug, chapterNum).ready,
    localized: !status.localized.published && checkLocalizedReadiness(bookSlug, chapterNum).ready
  };

  return status;
}

/**
 * Check if a specific section is ready for faithful publication
 * Requirements:
 * - Section has linguistic review approved
 * - Main .is.md file exists
 * - Strings file exists (warning only if missing)
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} sectionNum - Section number (e.g., "1-1", "intro")
 * @returns {object} Readiness status
 */
function checkSectionReadiness(bookSlug, chapterNum, sectionNum) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const faithfulDir = path.join(BOOKS_DIR, bookSlug, '03-faithful', chapterDir);

  const mainFile = path.join(faithfulDir, `${sectionNum}.is.md`);
  const stringsFile = path.join(faithfulDir, `${sectionNum}-strings.is.md`);

  const hasMain = fs.existsSync(mainFile);
  const hasStrings = fs.existsSync(stringsFile);

  // Check database for approval
  const db = getDb();
  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      return { ready: false, reason: 'Bók ekki skráð' };
    }

    const section = db.prepare(`
      SELECT id, section_num, linguistic_approved_at
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ? AND section_num = ?
    `).get(book.id, chapterNum, sectionNum);

    db.close();

    if (!section) {
      return { ready: false, reason: `Eining ${sectionNum} ekki skráð` };
    }

    const isApproved = section.linguistic_approved_at != null;

    if (!isApproved) {
      return { ready: false, reason: 'Yfirferð ekki lokið' };
    }
    if (!hasMain) {
      return { ready: false, reason: `Vantar skrá: ${sectionNum}.is.md` };
    }
    if (!hasStrings) {
      return { ready: true, warning: `Vantar strengjaskrá: ${sectionNum}-strings.is.md`, hasStrings: false };
    }

    return { ready: true, hasStrings: true };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Check if a specific section is ready for localized publication
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} sectionNum - Section number
 * @returns {object} Readiness status
 */
function checkSectionLocalizedReadiness(bookSlug, chapterNum, sectionNum) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const localizedDir = path.join(BOOKS_DIR, bookSlug, '04-localized', chapterDir);

  const mainFile = path.join(localizedDir, `${sectionNum}.is.md`);
  const stringsFile = path.join(localizedDir, `${sectionNum}-strings.is.md`);

  const hasMain = fs.existsSync(mainFile);
  const hasStrings = fs.existsSync(stringsFile);

  // Check database for approval
  const db = getDb();
  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      return { ready: false, reason: 'Bók ekki skráð' };
    }

    const section = db.prepare(`
      SELECT id, section_num, localization_approved_at
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ? AND section_num = ?
    `).get(book.id, chapterNum, sectionNum);

    db.close();

    if (!section) {
      return { ready: false, reason: `Eining ${sectionNum} ekki skráð` };
    }

    const isApproved = section.localization_approved_at != null;

    if (!isApproved) {
      return { ready: false, reason: 'Staðfærsla ekki lokið' };
    }
    if (!hasMain) {
      return { ready: false, reason: `Vantar skrá: ${sectionNum}.is.md` };
    }
    if (!hasStrings) {
      return { ready: true, warning: `Vantar strengjaskrá: ${sectionNum}-strings.is.md`, hasStrings: false };
    }

    return { ready: true, hasStrings: true };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Publish faithful translation for a single section
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} sectionNum - Section number
 * @param {string} approvedBy - User ID of approving head editor
 * @param {string} approvedByName - Name of approving head editor
 * @param {object} options - Options: { dryRun: boolean }
 * @returns {object} Publication result or preview info
 */
function publishFaithfulSection(bookSlug, chapterNum, sectionNum, approvedBy, approvedByName, { dryRun = false } = {}) {
  const readiness = checkSectionReadiness(bookSlug, chapterNum, sectionNum);
  if (!readiness.ready) {
    throw new Error(`Section not ready for faithful publication: ${readiness.reason}`);
  }

  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '03-faithful', chapterDir);
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'faithful', 'chapters', chapterDir);

  // Files to publish
  const mainFile = `${sectionNum}.is.md`;
  const stringsFile = `${sectionNum}-strings.is.md`;
  const filesToPublish = [mainFile];
  if (readiness.hasStrings) {
    filesToPublish.push(stringsFile);
  }

  // Check for existing files
  const existingFiles = getExistingFiles(targetDir);
  const existingNames = new Set(existingFiles.map(f => f.name));
  const willOverwrite = existingFiles.filter(f => filesToPublish.includes(f.name));
  const willCreate = filesToPublish.filter(f => !existingNames.has(f));

  if (dryRun) {
    return {
      dryRun: true,
      section: sectionNum,
      sourceDir: `03-faithful/${chapterDir}`,
      targetDir: `05-publication/faithful/chapters/${chapterDir}`,
      willOverwrite,
      willCreate,
      totalFiles: filesToPublish.length,
      warning: readiness.warning || null
    };
  }

  // Create target directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const publishedFiles = [];

  for (const file of filesToPublish) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    let content = fs.readFileSync(sourcePath, 'utf8');

    // Remove any MT preview banner if present
    content = removeMtPreviewBanner(content);

    // Update frontmatter
    content = updateFrontmatter(content, {
      'translation-status': 'Ritstýrð þýðing',
      'published-at': new Date().toISOString(),
      'approved-by': approvedByName
    });

    fs.writeFileSync(targetPath, content, 'utf8');
    publishedFiles.push(file);
  }

  // Update section record in database
  const db = getDb();
  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    db.prepare(`
      UPDATE book_sections
      SET faithful_published_at = CURRENT_TIMESTAMP
      WHERE book_id = ? AND chapter_num = ? AND section_num = ?
    `).run(book.id, chapterNum, sectionNum);
    db.close();
  } catch (err) {
    db.close();
    throw err;
  }

  return {
    success: true,
    track: PUBLICATION_TRACKS.FAITHFUL,
    chapter: chapterNum,
    section: sectionNum,
    filesPublished: publishedFiles.length,
    files: publishedFiles,
    warning: readiness.warning || null
  };
}

/**
 * Publish localized content for a single section
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} sectionNum - Section number
 * @param {string} approvedBy - User ID of approving head editor
 * @param {string} approvedByName - Name of approving head editor
 * @param {object} options - Options: { dryRun: boolean }
 * @returns {object} Publication result or preview info
 */
function publishLocalizedSection(bookSlug, chapterNum, sectionNum, approvedBy, approvedByName, { dryRun = false } = {}) {
  const readiness = checkSectionLocalizedReadiness(bookSlug, chapterNum, sectionNum);
  if (!readiness.ready) {
    throw new Error(`Section not ready for localized publication: ${readiness.reason}`);
  }

  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '04-localized', chapterDir);
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'localized', 'chapters', chapterDir);

  // Files to publish
  const mainFile = `${sectionNum}.is.md`;
  const stringsFile = `${sectionNum}-strings.is.md`;
  const filesToPublish = [mainFile];
  if (readiness.hasStrings) {
    filesToPublish.push(stringsFile);
  }

  // Check for existing files
  const existingFiles = getExistingFiles(targetDir);
  const existingNames = new Set(existingFiles.map(f => f.name));
  const willOverwrite = existingFiles.filter(f => filesToPublish.includes(f.name));
  const willCreate = filesToPublish.filter(f => !existingNames.has(f));

  if (dryRun) {
    return {
      dryRun: true,
      section: sectionNum,
      sourceDir: `04-localized/${chapterDir}`,
      targetDir: `05-publication/localized/chapters/${chapterDir}`,
      willOverwrite,
      willCreate,
      totalFiles: filesToPublish.length,
      warning: readiness.warning || null
    };
  }

  // Create target directory
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const publishedFiles = [];

  for (const file of filesToPublish) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    let content = fs.readFileSync(sourcePath, 'utf8');

    // Update frontmatter
    content = updateFrontmatter(content, {
      'translation-status': 'Staðfærð útgáfa',
      'published-at': new Date().toISOString(),
      'approved-by': approvedByName
    });

    fs.writeFileSync(targetPath, content, 'utf8');
    publishedFiles.push(file);
  }

  // Update section record in database
  const db = getDb();
  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    db.prepare(`
      UPDATE book_sections
      SET localized_published_at = CURRENT_TIMESTAMP
      WHERE book_id = ? AND chapter_num = ? AND section_num = ?
    `).run(book.id, chapterNum, sectionNum);
    db.close();
  } catch (err) {
    db.close();
    throw err;
  }

  return {
    success: true,
    track: PUBLICATION_TRACKS.LOCALIZED,
    chapter: chapterNum,
    section: sectionNum,
    filesPublished: publishedFiles.length,
    files: publishedFiles,
    warning: readiness.warning || null
  };
}

/**
 * Get section-level publication status for a chapter
 * Returns each section's publication state
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @returns {object} Section-level status for faithful and localized tracks
 */
function getSectionPublicationStatus(bookSlug, chapterNum) {
  const db = getDb();
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const pubDir = path.join(BOOKS_DIR, bookSlug, '05-publication');

  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      return { sections: [] };
    }

    const sections = db.prepare(`
      SELECT id, section_num, title, title_is,
             linguistic_approved_at, localization_approved_at,
             faithful_published_at, localized_published_at
      FROM book_sections
      WHERE book_id = ? AND chapter_num = ?
      ORDER BY id
    `).all(book.id, chapterNum);

    db.close();

    // Check published files on disk
    const faithfulDir = path.join(pubDir, 'faithful', 'chapters', chapterDir);
    const localizedDir = path.join(pubDir, 'localized', 'chapters', chapterDir);

    const faithfulFiles = fs.existsSync(faithfulDir)
      ? new Set(fs.readdirSync(faithfulDir).filter(f => f.endsWith('.is.md')))
      : new Set();
    const localizedFiles = fs.existsSync(localizedDir)
      ? new Set(fs.readdirSync(localizedDir).filter(f => f.endsWith('.is.md')))
      : new Set();

    return {
      sections: sections.map(s => {
        const mainFile = `${s.section_num}.is.md`;
        return {
          sectionNum: s.section_num,
          title: s.title_is || s.title,
          faithful: {
            approved: !!s.linguistic_approved_at,
            published: faithfulFiles.has(mainFile),
            publishedAt: s.faithful_published_at
          },
          localized: {
            approved: !!s.localization_approved_at,
            published: localizedFiles.has(mainFile),
            publishedAt: s.localized_published_at
          }
        };
      })
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

// Helper functions

function addMtPreviewBanner(content) {
  // Check if content starts with frontmatter
  if (content.startsWith('---')) {
    const endOfFrontmatter = content.indexOf('---', 3);
    if (endOfFrontmatter !== -1) {
      const frontmatter = content.substring(0, endOfFrontmatter + 3);
      const body = content.substring(endOfFrontmatter + 3);
      return frontmatter + '\n\n' + MT_PREVIEW_BANNER + body.trimStart();
    }
  }

  // No frontmatter, add banner at start
  return MT_PREVIEW_BANNER + content;
}

function removeMtPreviewBanner(content) {
  // Remove the MT preview banner if present
  return content.replace(/:::warning\{title="Vélþýðing"\}[\s\S]*?:::\s*\n*/g, '');
}

function updateFrontmatter(content, updates) {
  if (!content.startsWith('---')) {
    // No frontmatter, create one
    const yaml = Object.entries(updates)
      .map(([k, v]) => `${k}: "${v}"`)
      .join('\n');
    return `---\n${yaml}\n---\n\n${content}`;
  }

  const endOfFrontmatter = content.indexOf('---', 3);
  if (endOfFrontmatter === -1) return content;

  let frontmatter = content.substring(4, endOfFrontmatter).trim();
  const body = content.substring(endOfFrontmatter + 3);

  // Update or add each field
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}:.*$`, 'm');
    if (regex.test(frontmatter)) {
      frontmatter = frontmatter.replace(regex, `${key}: "${value}"`);
    } else {
      frontmatter += `\n${key}: "${value}"`;
    }
  }

  return `---\n${frontmatter}\n---${body}`;
}

function updateChapterStatus(bookSlug, chapterNum, stage, data) {
  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const statusPath = path.join(BOOKS_DIR, bookSlug, 'chapters', chapterDir, 'status.json');

  let status = {};
  if (fs.existsSync(statusPath)) {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  }

  if (!status[stage]) {
    status[stage] = {};
  }

  // Merge data into stage
  Object.assign(status[stage], data);

  // Ensure directory exists
  const statusDir = path.dirname(statusPath);
  if (!fs.existsSync(statusDir)) {
    fs.mkdirSync(statusDir, { recursive: true });
  }

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), 'utf8');
}

module.exports = {
  PUBLICATION_TRACKS,
  checkMtPreviewReadiness,
  checkFaithfulReadiness,
  checkLocalizedReadiness,
  checkSectionReadiness,
  checkSectionLocalizedReadiness,
  publishMtPreview,
  publishFaithful,
  publishLocalized,
  publishFaithfulSection,
  publishLocalizedSection,
  getPublicationStatus,
  getSectionPublicationStatus,
  getExistingFiles
};
