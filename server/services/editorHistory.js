/**
 * Editor History Service
 *
 * Manages version history for the web-based markdown editor.
 * Tracks all edits, submissions, and reviews.
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Project root for file operations
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Ensure database and tables exist
function initDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Run migration to ensure tables exist
  const { migrate } = require('../migrations/002-editor-tables');
  migrate();

  return db;
}

// Initialize database
const db = initDb();

// Prepared statements
const statements = {
  // Edit history
  insertHistory: db.prepare(`
    INSERT INTO edit_history (book, chapter, section, content, user_id, username, is_submission, file_path, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getHistory: db.prepare(`
    SELECT * FROM edit_history
    WHERE book = ? AND chapter = ? AND section = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  getHistoryById: db.prepare('SELECT * FROM edit_history WHERE id = ?'),
  getLatestVersion: db.prepare(`
    SELECT * FROM edit_history
    WHERE book = ? AND chapter = ? AND section = ?
    ORDER BY created_at DESC
    LIMIT 1
  `),

  // Pending reviews
  insertReview: db.prepare(`
    INSERT INTO pending_reviews (book, chapter, section, edit_history_id, submitted_by, submitted_by_username, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `),
  getReviewById: db.prepare('SELECT * FROM pending_reviews WHERE id = ?'),
  getPendingReviews: db.prepare(`
    SELECT pr.*, eh.content, eh.created_at as edit_created_at
    FROM pending_reviews pr
    JOIN edit_history eh ON pr.edit_history_id = eh.id
    WHERE pr.status = 'pending'
    ORDER BY pr.submitted_at DESC
  `),
  getPendingReviewsForBook: db.prepare(`
    SELECT pr.*, eh.content, eh.created_at as edit_created_at
    FROM pending_reviews pr
    JOIN edit_history eh ON pr.edit_history_id = eh.id
    WHERE pr.status = 'pending' AND pr.book = ?
    ORDER BY pr.submitted_at DESC
  `),
  getReviewForSection: db.prepare(`
    SELECT pr.*, eh.content, eh.created_at as edit_created_at
    FROM pending_reviews pr
    JOIN edit_history eh ON pr.edit_history_id = eh.id
    WHERE pr.book = ? AND pr.chapter = ? AND pr.section = ? AND pr.status = 'pending'
    ORDER BY pr.submitted_at DESC
    LIMIT 1
  `),
  updateReviewStatus: db.prepare(`
    UPDATE pending_reviews
    SET status = ?, reviewed_by = ?, reviewed_by_username = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?, commit_sha = ?
    WHERE id = ?
  `),
  countPendingReviews: db.prepare(`
    SELECT COUNT(*) as count FROM pending_reviews WHERE status = 'pending'
  `),
  countPendingReviewsForBook: db.prepare(`
    SELECT COUNT(*) as count FROM pending_reviews WHERE status = 'pending' AND book = ?
  `),
  getRecentFeedbackForSection: db.prepare(`
    SELECT pr.*, eh.content, eh.created_at as edit_created_at
    FROM pending_reviews pr
    JOIN edit_history eh ON pr.edit_history_id = eh.id
    WHERE pr.book = ? AND pr.chapter = ? AND pr.section = ?
      AND pr.status = 'changes_requested'
      AND pr.reviewed_at > datetime('now', '-7 days')
    ORDER BY pr.reviewed_at DESC
    LIMIT 1
  `)
};

/**
 * Generate content hash for deduplication
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Get the file path for a section's markdown file
 */
function getFilePath(book, chapter, section) {
  // Format: books/{book}/03-faithful/{chapter}/{section}.is.md
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  return path.join(PROJECT_ROOT, 'books', book, '03-faithful', chapterDir, `${section}.is.md`);
}

/**
 * Get the EN source file path
 */
function getEnSourcePath(book, chapter, section) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  return path.join(PROJECT_ROOT, 'books', book, '02-for-mt', chapterDir, `${section}.en.md`);
}

/**
 * Read file content from disk
 */
function readFileContent(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  } catch (err) {
    console.error(`Failed to read file ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Write file content to disk with backup
 */
function writeFileContent(filePath, content) {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create backup if file exists
    if (fs.existsSync(filePath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const backupPath = `${filePath}.${timestamp}.bak`;
      fs.copyFileSync(filePath, backupPath);
    }

    // Write new content
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error(`Failed to write file ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Load content for a section (both IS and EN)
 */
function loadSectionContent(book, chapter, section) {
  const isPath = getFilePath(book, chapter, section);
  const enPath = getEnSourcePath(book, chapter, section);

  const isContent = readFileContent(isPath);
  const enContent = readFileContent(enPath);

  // Get metadata from status.json if available
  let metadata = null;
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const statusPath = path.join(PROJECT_ROOT, 'books', book, 'chapters', chapterDir, 'status.json');
  try {
    if (fs.existsSync(statusPath)) {
      const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
      metadata = {
        title: statusData.title,
        chapter: statusData.chapter
      };
    }
  } catch (err) {
    // Ignore metadata errors
  }

  return {
    is: isContent,
    en: enContent,
    metadata,
    filePath: isPath,
    enFilePath: enPath,
    exists: isContent !== null
  };
}

/**
 * Save a draft (creates history entry but doesn't submit for review)
 */
function saveDraft(book, chapter, section, content, userId, username) {
  const filePath = getFilePath(book, chapter, section);
  const contentHash = hashContent(content);

  // Check if content actually changed
  const latest = statements.getLatestVersion.get(book, chapter, section);
  if (latest && latest.content_hash === contentHash) {
    return {
      success: true,
      unchanged: true,
      historyId: latest.id
    };
  }

  // Insert history entry
  const result = statements.insertHistory.run(
    book, chapter, section, content, userId, username, 0, filePath, contentHash
  );

  // Write to disk
  const written = writeFileContent(filePath, content);

  return {
    success: true,
    historyId: result.lastInsertRowid,
    written
  };
}

/**
 * Submit content for review
 */
function submitForReview(book, chapter, section, content, userId, username) {
  const filePath = getFilePath(book, chapter, section);
  const contentHash = hashContent(content);

  // Check if there's already a pending review for this section
  const existingReview = statements.getReviewForSection.get(book, chapter, section);
  if (existingReview) {
    return {
      success: false,
      error: 'A review is already pending for this section',
      existingReview: {
        id: existingReview.id,
        submittedBy: existingReview.submitted_by_username,
        submittedAt: existingReview.submitted_at
      }
    };
  }

  // Insert history entry marked as submission
  const historyResult = statements.insertHistory.run(
    book, chapter, section, content, userId, username, 1, filePath, contentHash
  );

  // Create pending review
  const reviewResult = statements.insertReview.run(
    book, chapter, section, historyResult.lastInsertRowid, userId, username
  );

  // Write to disk
  writeFileContent(filePath, content);

  return {
    success: true,
    historyId: historyResult.lastInsertRowid,
    reviewId: reviewResult.lastInsertRowid
  };
}

/**
 * Get version history for a section
 */
function getVersionHistory(book, chapter, section, limit = 20) {
  const rows = statements.getHistory.all(book, chapter, section, limit);
  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
    isSubmission: row.is_submission === 1,
    contentHash: row.content_hash
  }));
}

/**
 * Get a specific version's content
 */
function getVersion(historyId) {
  const row = statements.getHistoryById.get(historyId);
  if (!row) return null;

  return {
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    content: row.content,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
    isSubmission: row.is_submission === 1
  };
}

/**
 * Restore a previous version
 */
function restoreVersion(historyId, userId, username) {
  const version = getVersion(historyId);
  if (!version) {
    return { success: false, error: 'Version not found' };
  }

  // Save as new draft
  return saveDraft(version.book, version.chapter, version.section, version.content, userId, username);
}

/**
 * Get all pending reviews
 */
function getPendingReviews(book = null) {
  const rows = book
    ? statements.getPendingReviewsForBook.all(book)
    : statements.getPendingReviews.all();

  return rows.map(row => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    editHistoryId: row.edit_history_id,
    submittedBy: row.submitted_by,
    submittedByUsername: row.submitted_by_username,
    submittedAt: row.submitted_at,
    content: row.content,
    editCreatedAt: row.edit_created_at
  }));
}

/**
 * Get pending review count
 */
function getPendingReviewCount(book = null) {
  const result = book
    ? statements.countPendingReviewsForBook.get(book)
    : statements.countPendingReviews.get();
  return result.count;
}

/**
 * Get a specific pending review
 */
function getReview(reviewId) {
  const row = statements.getReviewById.get(reviewId);
  if (!row) return null;

  const history = statements.getHistoryById.get(row.edit_history_id);

  return {
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    section: row.section,
    editHistoryId: row.edit_history_id,
    submittedBy: row.submitted_by,
    submittedByUsername: row.submitted_by_username,
    submittedAt: row.submitted_at,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedByUsername: row.reviewed_by_username,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    commitSha: row.commit_sha,
    content: history?.content,
    filePath: history?.file_path
  };
}

/**
 * Approve a review (marks as approved, content already written)
 */
function approveReview(reviewId, reviewerId, reviewerUsername, commitSha = null) {
  const review = getReview(reviewId);
  if (!review) {
    return { success: false, error: 'Review not found' };
  }

  if (review.status !== 'pending') {
    return { success: false, error: 'Review is not pending' };
  }

  statements.updateReviewStatus.run(
    'approved', reviewerId, reviewerUsername, null, commitSha, reviewId
  );

  return {
    success: true,
    review: getReview(reviewId)
  };
}

/**
 * Request changes on a review
 */
function requestChanges(reviewId, reviewerId, reviewerUsername, notes) {
  const review = getReview(reviewId);
  if (!review) {
    return { success: false, error: 'Review not found' };
  }

  if (review.status !== 'pending') {
    return { success: false, error: 'Review is not pending' };
  }

  statements.updateReviewStatus.run(
    'changes_requested', reviewerId, reviewerUsername, notes, null, reviewId
  );

  return {
    success: true,
    review: getReview(reviewId)
  };
}

/**
 * Get current file content from disk (for diff comparison)
 */
function getCurrentContent(book, chapter, section) {
  const filePath = getFilePath(book, chapter, section);
  return readFileContent(filePath);
}

/**
 * List all sections available for editing in a chapter
 */
function listSections(book, chapter) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const faithfulDir = path.join(PROJECT_ROOT, 'books', book, '03-faithful', chapterDir);
  const mtOutputDir = path.join(PROJECT_ROOT, 'books', book, '02-mt-output', chapterDir);

  const sections = [];

  // Check 03-faithful first (edited versions)
  if (fs.existsSync(faithfulDir)) {
    const files = fs.readdirSync(faithfulDir).filter(f => f.endsWith('.is.md'));
    for (const file of files) {
      const section = file.replace('.is.md', '');
      sections.push({
        section,
        source: 'faithful',
        path: path.join(faithfulDir, file)
      });
    }
  }

  // Also check 02-mt-output for sections not yet edited
  if (fs.existsSync(mtOutputDir)) {
    const files = fs.readdirSync(mtOutputDir).filter(f => f.endsWith('.is.md'));
    for (const file of files) {
      const section = file.replace('.is.md', '');
      // Only add if not already in faithful
      if (!sections.find(s => s.section === section)) {
        sections.push({
          section,
          source: 'mt-output',
          path: path.join(mtOutputDir, file)
        });
      }
    }
  }

  return sections.sort((a, b) => {
    // Sort by section number (e.g., "1-1" < "1-2" < "2-1")
    const aParts = a.section.split('-').map(Number);
    const bParts = b.section.split('-').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });
}

/**
 * Get recent feedback for a section (changes requested within last 7 days)
 * This helps translators see what changes were requested by reviewers.
 */
function getRecentFeedback(book, chapter, section) {
  const row = statements.getRecentFeedbackForSection.get(book, String(chapter), section);
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    reviewedBy: row.reviewed_by_username,
    reviewedAt: row.reviewed_at,
    notes: row.review_notes,
    submittedBy: row.submitted_by_username,
    submittedAt: row.submitted_at
  };
}

module.exports = {
  loadSectionContent,
  saveDraft,
  submitForReview,
  getVersionHistory,
  getVersion,
  restoreVersion,
  getPendingReviews,
  getPendingReviewCount,
  getReview,
  approveReview,
  requestChanges,
  getRecentFeedback,
  getCurrentContent,
  listSections,
  getFilePath,
  getEnSourcePath,
  PROJECT_ROOT
};
