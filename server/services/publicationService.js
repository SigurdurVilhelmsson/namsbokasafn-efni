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
 * @returns {object} Publication result
 */
function publishMtPreview(bookSlug, chapterNum, approvedBy, approvedByName) {
  const readiness = checkMtPreviewReadiness(bookSlug, chapterNum);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for MT preview: ${readiness.reason}`);
  }

  const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '02-mt-output', chapterDir);
  const targetDir = path.join(BOOKS_DIR, bookSlug, '05-publication', 'mt-preview', 'chapters', chapterDir);

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
    files: publishedFiles
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
 * @returns {object} Publication result
 */
function publishFaithful(bookSlug, chapterNum, approvedBy, approvedByName) {
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
 * @returns {object} Publication result
 */
function publishLocalized(bookSlug, chapterNum, approvedBy, approvedByName) {
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
  publishMtPreview,
  publishFaithful,
  publishLocalized,
  getPublicationStatus
};
