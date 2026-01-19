/**
 * Terminology Service
 *
 * Manages the terminology database for translation consistency.
 * Supports:
 * - CRUD operations on terms
 * - Full-text search
 * - CSV import (existing glossary)
 * - Excel import (Chemistry Association)
 * - Key Terms extraction from markdown
 * - Review board workflow (approve/dispute)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Optional dependencies - installed only when needed
let csvParse = null;
try {
  csvParse = require('csv-parse/sync').parse;
} catch {
  // csv-parse not installed - CSV import will be unavailable
}

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// Valid term statuses
const TERM_STATUSES = ['approved', 'proposed', 'disputed', 'needs_review'];

// Valid term categories
const TERM_CATEGORIES = [
  'fundamental',
  'bonding',
  'reactions',
  'solutions',
  'acids-bases',
  'periodic-table',
  'structure',
  'states',
  'properties',
  'changes',
  'measurements',
  'concepts',
  'constants',
  'units',
  'other'
];

// Valid term sources
const TERM_SOURCES = [
  'idordabankinn',
  'chemistry-association',
  'chapter-glossary',
  'manual',
  'imported-csv',
  'imported-excel'
];

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
 * Search terms with optional filters
 *
 * @param {string} query - Search query (matches English or Icelandic)
 * @param {object} options - Filter options
 * @param {number} options.bookId - Filter by book (null = global only)
 * @param {string} options.category - Filter by category
 * @param {string} options.status - Filter by status
 * @param {number} options.limit - Max results (default 50)
 * @param {number} options.offset - Pagination offset
 * @returns {object} Search results with pagination
 */
function searchTerms(query = '', options = {}) {
  const db = getDb();
  const { bookId, category, status, limit = 50, offset = 0 } = options;

  try {
    let sql = `
      SELECT
        t.*,
        rb.slug as book_slug,
        rb.title_is as book_title
      FROM terminology_terms t
      LEFT JOIN registered_books rb ON t.book_id = rb.id
      WHERE 1=1
    `;
    const params = [];

    // Search query
    if (query) {
      sql += ` AND (t.english LIKE ? OR t.icelandic LIKE ? OR t.alternatives LIKE ?)`;
      const searchPattern = `%${query}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Book filter (null = global terms, specific ID = book terms)
    if (bookId !== undefined) {
      if (bookId === null) {
        sql += ` AND t.book_id IS NULL`;
      } else {
        sql += ` AND (t.book_id = ? OR t.book_id IS NULL)`;
        params.push(bookId);
      }
    }

    // Category filter
    if (category) {
      sql += ` AND t.category = ?`;
      params.push(category);
    }

    // Status filter
    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }

    // Get total count
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;

    // Add ordering and pagination
    sql += ` ORDER BY t.english COLLATE NOCASE ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const terms = db.prepare(sql).all(...params);
    db.close();

    return {
      terms: terms.map(formatTerm),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + terms.length < total
      }
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Fast lookup for editor popup
 * Returns exact and partial matches sorted by relevance
 *
 * @param {string} query - Search term
 * @param {number} bookId - Optional book context
 * @returns {object[]} Matching terms
 */
function lookupTerm(query, bookId = null) {
  if (!query || query.length < 2) {
    return [];
  }

  const db = getDb();

  try {
    const sql = `
      SELECT
        t.*,
        CASE
          WHEN LOWER(t.english) = LOWER(?) THEN 1
          WHEN LOWER(t.english) LIKE LOWER(?) THEN 2
          ELSE 3
        END as relevance
      FROM terminology_terms t
      WHERE (
        t.english LIKE ? OR
        t.icelandic LIKE ? OR
        t.alternatives LIKE ?
      )
      AND (t.book_id IS NULL OR t.book_id = ?)
      AND t.status IN ('approved', 'proposed')
      ORDER BY relevance, t.english COLLATE NOCASE
      LIMIT 10
    `;

    const searchExact = query;
    const searchStart = `${query}%`;
    const searchContains = `%${query}%`;

    const terms = db.prepare(sql).all(
      searchExact,
      searchStart,
      searchContains,
      searchContains,
      searchContains,
      bookId
    );

    db.close();
    return terms.map(formatTerm);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get a single term by ID
 *
 * @param {number} id - Term ID
 * @returns {object|null} Term or null
 */
function getTerm(id) {
  const db = getDb();

  try {
    const term = db.prepare(`
      SELECT
        t.*,
        rb.slug as book_slug,
        rb.title_is as book_title
      FROM terminology_terms t
      LEFT JOIN registered_books rb ON t.book_id = rb.id
      WHERE t.id = ?
    `).get(id);

    // Get discussions
    const discussions = db.prepare(`
      SELECT * FROM terminology_discussions
      WHERE term_id = ?
      ORDER BY created_at DESC
    `).all(id);

    db.close();

    if (!term) return null;

    return {
      ...formatTerm(term),
      discussions
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Create a new term (status: proposed)
 *
 * @param {object} data - Term data
 * @param {string} userId - User creating the term
 * @param {string} username - User's display name
 * @returns {object} Created term
 */
function createTerm(data, userId, username) {
  const { english, icelandic, alternatives, category, notes, source, sourceChapter, bookId } = data;

  if (!english || !icelandic) {
    throw new Error('English and Icelandic terms are required');
  }

  if (category && !TERM_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }

  if (source && !TERM_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}`);
  }

  const db = getDb();

  try {
    // Check for existing term
    const existing = db.prepare(`
      SELECT id FROM terminology_terms
      WHERE english = ? AND (book_id = ? OR (book_id IS NULL AND ? IS NULL))
    `).get(english, bookId, bookId);

    if (existing) {
      db.close();
      throw new Error(`Term "${english}" already exists`);
    }

    const result = db.prepare(`
      INSERT INTO terminology_terms
        (english, icelandic, alternatives, category, notes, source, source_chapter, book_id, status, proposed_by, proposed_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)
    `).run(
      english,
      icelandic,
      alternatives ? JSON.stringify(alternatives) : null,
      category || 'other',
      notes,
      source || 'manual',
      sourceChapter,
      bookId,
      userId,
      username
    );

    const term = getTerm(result.lastInsertRowid);
    db.close();
    return term;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Update a term
 *
 * @param {number} id - Term ID
 * @param {object} updates - Fields to update
 * @returns {object} Updated term
 */
function updateTerm(id, updates) {
  const db = getDb();

  try {
    const term = db.prepare('SELECT * FROM terminology_terms WHERE id = ?').get(id);
    if (!term) {
      throw new Error('Term not found');
    }

    const allowedFields = ['icelandic', 'alternatives', 'category', 'notes', 'source', 'source_chapter'];
    const setClauses = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = ?`);
        if (snakeKey === 'alternatives' && Array.isArray(value)) {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
      }
    }

    if (setClauses.length === 0) {
      db.close();
      return getTerm(id);
    }

    params.push(id);
    db.prepare(`UPDATE terminology_terms SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    db.close();
    return getTerm(id);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Approve a term (HEAD_EDITOR+)
 *
 * @param {number} id - Term ID
 * @param {string} userId - Approving user ID
 * @param {string} username - Approving user name
 * @returns {object} Updated term
 */
function approveTerm(id, userId, username) {
  const db = getDb();

  try {
    const term = db.prepare('SELECT * FROM terminology_terms WHERE id = ?').get(id);
    if (!term) {
      throw new Error('Term not found');
    }

    if (term.status === 'approved') {
      db.close();
      return getTerm(id);
    }

    db.prepare(`
      UPDATE terminology_terms
      SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, username, id);

    db.close();
    return getTerm(id);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Dispute a term (escalate to review board)
 *
 * @param {number} id - Term ID
 * @param {string} comment - Reason for dispute
 * @param {string} userId - User ID
 * @param {string} username - User name
 * @param {string} proposedTranslation - Alternative translation suggestion
 * @returns {object} Updated term with discussion
 */
function disputeTerm(id, comment, userId, username, proposedTranslation = null) {
  const db = getDb();

  try {
    const term = db.prepare('SELECT * FROM terminology_terms WHERE id = ?').get(id);
    if (!term) {
      throw new Error('Term not found');
    }

    // Update status to disputed
    db.prepare(`UPDATE terminology_terms SET status = 'disputed' WHERE id = ?`).run(id);

    // Add discussion entry
    db.prepare(`
      INSERT INTO terminology_discussions (term_id, user_id, username, comment, proposed_translation)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, username, comment, proposedTranslation);

    db.close();
    return getTerm(id);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Add discussion comment to a term
 *
 * @param {number} termId - Term ID
 * @param {string} comment - Comment text
 * @param {string} userId - User ID
 * @param {string} username - User name
 * @param {string} proposedTranslation - Optional alternative suggestion
 * @returns {object} Created discussion entry
 */
function addDiscussion(termId, comment, userId, username, proposedTranslation = null) {
  const db = getDb();

  try {
    const term = db.prepare('SELECT id FROM terminology_terms WHERE id = ?').get(termId);
    if (!term) {
      throw new Error('Term not found');
    }

    const result = db.prepare(`
      INSERT INTO terminology_discussions (term_id, user_id, username, comment, proposed_translation)
      VALUES (?, ?, ?, ?, ?)
    `).run(termId, userId, username, comment, proposedTranslation);

    const discussion = db.prepare('SELECT * FROM terminology_discussions WHERE id = ?').get(result.lastInsertRowid);
    db.close();
    return discussion;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get terms requiring review (disputed or needs_review)
 *
 * @param {object} options - Filter options
 * @returns {object[]} Terms needing review
 */
function getReviewQueue(options = {}) {
  const { bookId, limit = 50, offset = 0 } = options;
  const db = getDb();

  try {
    let sql = `
      SELECT
        t.*,
        rb.slug as book_slug,
        rb.title_is as book_title,
        (SELECT COUNT(*) FROM terminology_discussions WHERE term_id = t.id) as discussion_count
      FROM terminology_terms t
      LEFT JOIN registered_books rb ON t.book_id = rb.id
      WHERE t.status IN ('disputed', 'needs_review')
    `;
    const params = [];

    if (bookId) {
      sql += ` AND (t.book_id = ? OR t.book_id IS NULL)`;
      params.push(bookId);
    }

    sql += ` ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const terms = db.prepare(sql).all(...params);
    db.close();

    return terms.map(formatTerm);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Import terms from CSV file
 *
 * @param {string} filePath - Path to CSV file
 * @param {string} userId - Importing user ID
 * @param {string} username - Importing user name
 * @param {object} options - Import options
 * @returns {object} Import results
 */
function importFromCSV(filePath, userId, username, options = {}) {
  if (!csvParse) {
    throw new Error('CSV import requires csv-parse package. Run: npm install csv-parse');
  }

  const { bookId = null, overwrite = false } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const db = getDb();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const insertStmt = db.prepare(`
      INSERT INTO terminology_terms
        (english, icelandic, alternatives, category, notes, source, book_id, status, proposed_by, proposed_by_name)
      VALUES (?, ?, ?, ?, ?, 'imported-csv', ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE terminology_terms
      SET icelandic = ?, alternatives = ?, category = ?, notes = ?, source = 'imported-csv'
      WHERE english = ? AND (book_id = ? OR (book_id IS NULL AND ? IS NULL))
    `);

    const checkStmt = db.prepare(`
      SELECT id, status FROM terminology_terms
      WHERE english = ? AND (book_id = ? OR (book_id IS NULL AND ? IS NULL))
    `);

    for (const record of records) {
      const english = record.english || record.English || record.en;
      const icelandic = record.icelandic || record.Icelandic || record.is;
      const category = record.category || record.Category || 'other';
      const notes = record.notes || record.Notes || null;
      const status = record.status || record.Status || 'proposed';

      if (!english || !icelandic) {
        skipped++;
        continue;
      }

      const existing = checkStmt.get(english, bookId, bookId);

      if (existing) {
        if (overwrite && existing.status !== 'approved') {
          updateStmt.run(icelandic, null, category, notes, english, bookId, bookId);
          updated++;
        } else {
          skipped++;
        }
      } else {
        insertStmt.run(english, icelandic, null, category, notes, bookId, status, userId, username);
        added++;
      }
    }

    // Log import
    db.prepare(`
      INSERT INTO terminology_imports (source_name, file_name, imported_by, imported_by_name, terms_added, terms_updated, terms_skipped)
      VALUES ('csv', ?, ?, ?, ?, ?, ?)
    `).run(path.basename(filePath), userId, username, added, updated, skipped);

    db.close();

    return {
      success: true,
      added,
      updated,
      skipped,
      total: records.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Import terms from Excel file (Chemistry Association format)
 *
 * @param {Buffer|string} fileContent - Excel file content or path
 * @param {string} userId - Importing user ID
 * @param {string} username - Importing user name
 * @param {object} options - Import options
 * @returns {object} Import results
 */
async function importFromExcel(fileContent, userId, username, options = {}) {
  // Dynamic import for xlsx (optional dependency)
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    throw new Error('xlsx package not installed. Run: npm install xlsx');
  }

  const { bookId = null, sheetName = null } = options;

  const workbook = typeof fileContent === 'string'
    ? XLSX.readFile(fileContent)
    : XLSX.read(fileContent, { type: 'buffer' });

  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error('No sheet found in Excel file');
  }

  const data = XLSX.utils.sheet_to_json(sheet);
  const db = getDb();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const insertStmt = db.prepare(`
      INSERT INTO terminology_terms
        (english, icelandic, alternatives, category, notes, source, book_id, status, proposed_by, proposed_by_name)
      VALUES (?, ?, ?, ?, ?, 'chemistry-association', ?, 'proposed', ?, ?)
    `);

    const checkStmt = db.prepare(`
      SELECT id FROM terminology_terms
      WHERE english = ? AND (book_id = ? OR (book_id IS NULL AND ? IS NULL))
    `);

    for (const row of data) {
      // Try common column names for English/Icelandic
      const english = row.English || row.english || row.EN || row.en ||
                     row['English term'] || row['Enska'] || Object.values(row)[0];
      const icelandic = row.Icelandic || row.icelandic || row.IS || row.is ||
                       row['Icelandic term'] || row['Íslenska'] || Object.values(row)[1];

      if (!english || !icelandic) {
        skipped++;
        continue;
      }

      const existing = checkStmt.get(english, bookId, bookId);

      if (existing) {
        skipped++;
      } else {
        const category = row.Category || row.category || row.Flokkur || 'other';
        const notes = row.Notes || row.notes || row.Athugasemdir || null;
        insertStmt.run(english, icelandic, null, category, notes, bookId, userId, username);
        added++;
      }
    }

    // Log import
    db.prepare(`
      INSERT INTO terminology_imports (source_name, file_name, imported_by, imported_by_name, terms_added, terms_updated, terms_skipped)
      VALUES ('excel', 'chemistry-association.xlsx', ?, ?, ?, ?, ?)
    `).run(userId, username, added, updated, skipped);

    db.close();

    return {
      success: true,
      added,
      updated,
      skipped,
      total: data.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Extract terms from key-terms markdown files
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number (optional, extracts all if not specified)
 * @param {string} userId - Importing user ID
 * @param {string} username - Importing user name
 * @returns {object} Extraction results
 */
function importFromKeyTerms(bookSlug, chapterNum, userId, username) {
  const db = getDb();

  try {
    // Get book ID
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    if (!book) {
      db.close();
      throw new Error(`Book not found: ${bookSlug}`);
    }

    // Find key-terms files
    const pubDir = path.join(BOOKS_DIR, bookSlug, '05-publication');
    let keyTermsFiles = [];

    if (chapterNum) {
      const chDir = `ch${String(chapterNum).padStart(2, '0')}`;
      const pattern = path.join(pubDir, 'faithful', 'chapters', chDir, '*-key-terms.md');
      keyTermsFiles = findFiles(pattern);
      if (keyTermsFiles.length === 0) {
        // Try mt-preview
        const mtPattern = path.join(pubDir, 'mt-preview', 'chapters', chDir, '*-key-terms.md');
        keyTermsFiles = findFiles(mtPattern);
      }
    } else {
      // Find all key-terms files
      keyTermsFiles = findFilesRecursive(pubDir, '-key-terms.md');
    }

    if (keyTermsFiles.length === 0) {
      db.close();
      return { success: true, added: 0, skipped: 0, total: 0, message: 'No key-terms files found' };
    }

    let added = 0;
    let skipped = 0;
    let total = 0;

    const insertStmt = db.prepare(`
      INSERT INTO terminology_terms
        (english, icelandic, category, notes, source, source_chapter, book_id, status, proposed_by, proposed_by_name)
      VALUES (?, ?, 'chapter-glossary', ?, 'chapter-glossary', ?, ?, 'proposed', ?, ?)
    `);

    const checkStmt = db.prepare(`
      SELECT id FROM terminology_terms WHERE english = ? AND book_id = ?
    `);

    // Regex to match definition blocks
    const definitionRegex = /:::definition\{term="([^"]+)"\}\s*([\s\S]*?):::/g;

    for (const file of keyTermsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const chapter = extractChapterNum(file);
      let match;

      while ((match = definitionRegex.exec(content)) !== null) {
        total++;
        const term = match[1].trim();
        const definition = match[2].trim();

        // Try to extract Icelandic translation from definition
        // Assumes format: "Icelandic term - definition" or just definition
        const parts = definition.split(/\s*[-–—]\s*/);
        const icelandic = parts[0].trim();

        if (!icelandic || icelandic.length > 100) {
          skipped++;
          continue;
        }

        const existing = checkStmt.get(term, book.id);
        if (existing) {
          skipped++;
          continue;
        }

        insertStmt.run(term, icelandic, definition.substring(0, 500), chapter, book.id, userId, username);
        added++;
      }
    }

    // Log import
    if (added > 0) {
      db.prepare(`
        INSERT INTO terminology_imports (source_name, file_name, imported_by, imported_by_name, terms_added, terms_skipped)
        VALUES ('key-terms', ?, ?, ?, ?, ?)
      `).run(`${bookSlug}/ch${chapterNum || 'all'}`, userId, username, added, skipped);
    }

    db.close();

    return {
      success: true,
      added,
      skipped,
      total,
      filesProcessed: keyTermsFiles.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get terminology statistics
 *
 * @param {number} bookId - Optional book filter
 * @returns {object} Statistics
 */
function getStats(bookId = null) {
  const db = getDb();

  try {
    let whereClause = bookId ? 'WHERE book_id = ? OR book_id IS NULL' : '';
    const params = bookId ? [bookId] : [];

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'proposed' THEN 1 ELSE 0 END) as proposed,
        SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) as disputed,
        SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) as needs_review
      FROM terminology_terms
      ${whereClause}
    `).get(...params);

    // Get by category
    const byCategory = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM terminology_terms
      ${whereClause}
      GROUP BY category
      ORDER BY count DESC
    `).all(...params);

    // Get by source
    const bySource = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM terminology_terms
      ${whereClause}
      GROUP BY source
      ORDER BY count DESC
    `).all(...params);

    // Recent imports
    const recentImports = db.prepare(`
      SELECT * FROM terminology_imports
      ORDER BY imported_at DESC
      LIMIT 5
    `).all();

    db.close();

    return {
      total: stats?.total || 0,
      byStatus: {
        approved: stats?.approved || 0,
        proposed: stats?.proposed || 0,
        disputed: stats?.disputed || 0,
        needsReview: stats?.needs_review || 0
      },
      byCategory: byCategory.reduce((acc, row) => {
        acc[row.category] = row.count;
        return acc;
      }, {}),
      bySource: bySource.reduce((acc, row) => {
        acc[row.source] = row.count;
        return acc;
      }, {}),
      recentImports
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Delete a term (ADMIN only)
 *
 * @param {number} id - Term ID
 */
function deleteTerm(id) {
  const db = getDb();

  try {
    const result = db.prepare('DELETE FROM terminology_terms WHERE id = ?').run(id);
    db.close();
    return { success: result.changes > 0 };
  } catch (err) {
    db.close();
    throw err;
  }
}

// Helper functions

function formatTerm(term) {
  return {
    id: term.id,
    bookId: term.book_id,
    bookSlug: term.book_slug,
    bookTitle: term.book_title,
    english: term.english,
    icelandic: term.icelandic,
    alternatives: term.alternatives ? JSON.parse(term.alternatives) : [],
    category: term.category,
    notes: term.notes,
    source: term.source,
    sourceChapter: term.source_chapter,
    status: term.status,
    proposedBy: term.proposed_by,
    proposedByName: term.proposed_by_name,
    approvedBy: term.approved_by,
    approvedByName: term.approved_by_name,
    approvedAt: term.approved_at,
    createdAt: term.created_at,
    updatedAt: term.updated_at,
    discussionCount: term.discussion_count
  };
}

function findFiles(pattern) {
  const glob = require('glob');
  try {
    return glob.sync(pattern);
  } catch {
    return [];
  }
}

function findFilesRecursive(dir, suffix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findFilesRecursive(fullPath, suffix));
    } else if (item.name.endsWith(suffix)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractChapterNum(filePath) {
  const match = filePath.match(/ch(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

module.exports = {
  searchTerms,
  lookupTerm,
  getTerm,
  createTerm,
  updateTerm,
  approveTerm,
  disputeTerm,
  addDiscussion,
  getReviewQueue,
  importFromCSV,
  importFromExcel,
  importFromKeyTerms,
  getStats,
  deleteTerm,
  TERM_STATUSES,
  TERM_CATEGORIES,
  TERM_SOURCES
};
