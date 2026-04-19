/**
 * Terminology Service — Multi-Subject Domain Model
 *
 * Normalized headword → translations → subjects model.
 * Each English headword can have multiple Icelandic translations,
 * each tagged with subject domains (chemistry, biology, etc.).
 * Inflection-aware matching for Icelandic terms.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Optional dependencies
let csvParse = null;
try {
  csvParse = require('csv-parse/sync').parse;
} catch {
  // csv-parse not installed
}

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// --- Test DB injection ---
let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
}

// Valid translation statuses
const TERM_STATUSES = ['approved', 'proposed', 'disputed', 'needs_review'];

// Valid term sources
const TERM_SOURCES = [
  'idordabankinn',
  'chemistry-association',
  'chemistry-society-csv',
  'openstax-mt',
  'openstax-glossary',
  'chapter-glossary',
  'manual',
  'imported-csv',
  'imported-excel',
  'merge-glossary',
];

// Known subject domains (from Íðorðabankinn collection codes)
const SUBJECTS = [
  'chemistry',
  'biology',
  'physics',
  'microbiology',
  'organic-chemistry',
  'mathematics',
  'general',
];

/**
 * Singleton database connection
 */
let _db;
function getDb() {
  if (_testDb) return _testDb;
  if (!_db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    _db = new Database(DB_PATH);
  }
  return _db;
}

/**
 * Upsert a headword. Handles NULL pos correctly (SQLite UNIQUE treats NULLs as distinct).
 * Returns the headword row { id }.
 */
function upsertHeadword(db, english, pos, definitionEn) {
  const existing = db
    .prepare(
      'SELECT id FROM terminology_headwords WHERE english = ? AND (pos = ? OR (pos IS NULL AND ? IS NULL))'
    )
    .get(english, pos || null, pos || null);

  if (existing) {
    if (definitionEn) {
      db.prepare(
        'UPDATE terminology_headwords SET definition_en = COALESCE(definition_en, ?) WHERE id = ?'
      ).run(definitionEn, existing.id);
    }
    return existing;
  }

  const result = db
    .prepare('INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)')
    .run(english, pos || null, definitionEn || null);
  return { id: Number(result.lastInsertRowid) };
}

// ─────────────────────────────────────────
// Headword CRUD
// ─────────────────────────────────────────

/**
 * Search headwords with optional filters.
 * Returns headwords with nested translations + subject tags.
 */
function searchTerms(query = '', options = {}) {
  const db = getDb();
  const { subject, status, limit = 50, offset = 0 } = options;

  let sql = `
    SELECT DISTINCT h.id
    FROM terminology_headwords h
  `;
  const joins = [];
  const params = [];

  // If filtering by subject or status, join translations
  if (subject || status || query) {
    joins.push('LEFT JOIN terminology_translations t ON t.headword_id = h.id');
  }
  if (subject) {
    joins.push('LEFT JOIN terminology_translation_subjects ts ON ts.translation_id = t.id');
  }

  sql += joins.join('\n');
  sql += '\nWHERE 1=1';

  if (query) {
    sql += ` AND (h.english LIKE ? OR t.icelandic LIKE ?)`;
    const pattern = `%${query}%`;
    params.push(pattern, pattern);
  }

  if (subject) {
    sql += ` AND ts.subject = ?`;
    params.push(subject);
  }

  if (status) {
    sql += ` AND t.status = ?`;
    params.push(status);
  }

  // Count total
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const totalResult = db.prepare(countSql).get(...params);
  const total = totalResult?.total || 0;

  // Get page of headword IDs
  sql += ` ORDER BY h.english COLLATE NOCASE ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const headwordIds = db
    .prepare(sql)
    .all(...params)
    .map((r) => r.id);

  const terms = headwordIds.map((id) => loadHeadword(db, id));

  return {
    terms,
    pagination: { total, limit, offset, hasMore: offset + terms.length < total },
  };
}

/**
 * Fast lookup for editor popup.
 * Searches English headwords and Icelandic translations (including inflections).
 */
function lookupTerm(query, bookSlug = null) {
  if (!query || query.length < 2) return [];

  const db = getDb();

  // Get book's primary subject for domain ranking
  const bookSubject = bookSlug ? getBookSubjectBySlug(db, bookSlug) : null;

  const sql = `
    SELECT DISTINCT h.id,
      CASE
        WHEN LOWER(h.english) = LOWER(?) THEN 1
        WHEN LOWER(h.english) LIKE LOWER(?) THEN 2
        ELSE 3
      END as relevance
    FROM terminology_headwords h
    LEFT JOIN terminology_translations t ON t.headword_id = h.id
    WHERE (
      h.english LIKE ? OR
      t.icelandic LIKE ? OR
      t.inflections LIKE ?
    )
    AND t.status IN ('approved', 'proposed')
    ORDER BY relevance, h.english COLLATE NOCASE
    LIMIT 10
  `;

  const exact = query;
  const startsWith = `${query}%`;
  const contains = `%${query}%`;

  const rows = db.prepare(sql).all(exact, startsWith, contains, contains, contains);

  return rows.map((r) => {
    const hw = loadHeadword(db, r.id);
    // Mark primary translation based on book's domain
    if (bookSubject && hw.translations) {
      for (const tr of hw.translations) {
        tr.isPrimary = tr.subjects.includes(bookSubject);
      }
    }
    return hw;
  });
}

/**
 * Get a single headword by ID with all translations, subjects, and discussions.
 */
function getHeadword(id) {
  const db = getDb();
  return loadHeadword(db, id, { includeDiscussions: true });
}

// Alias for backwards compatibility with routes
const getTerm = getHeadword;

/**
 * Create a new headword, optionally with an initial translation.
 */
function createTerm(data, userId, username) {
  const { english, icelandic, notes, source, pos, definitionEn, definitionIs, subjects } = data;

  if (!english) {
    throw new Error('English term is required');
  }

  const db = getDb();

  // Check for existing headword
  const existing = db
    .prepare(
      'SELECT id FROM terminology_headwords WHERE english = ? AND (pos = ? OR (pos IS NULL AND ? IS NULL))'
    )
    .get(english, pos || null, pos || null);

  if (existing) {
    throw new Error(`Term "${english}" already exists`);
  }

  const hwResult = db
    .prepare('INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)')
    .run(english, pos || null, definitionEn || null);

  const headwordId = hwResult.lastInsertRowid;

  // Add initial translation if icelandic is provided
  if (icelandic) {
    addTranslation(
      headwordId,
      { icelandic, definitionIs, notes, source, subjects },
      userId,
      username
    );
  }

  return getHeadword(headwordId);
}

/**
 * Add a translation to an existing headword.
 */
function addTranslation(headwordId, data, userId, username) {
  const { icelandic, definitionIs, inflections, notes, source, subjects, idordabankiId } = data;

  if (!icelandic) {
    throw new Error('Icelandic translation is required');
  }

  const db = getDb();

  // Verify headword exists
  const hw = db.prepare('SELECT id FROM terminology_headwords WHERE id = ?').get(headwordId);
  if (!hw) {
    throw new Error('Headword not found');
  }

  const result = db
    .prepare(
      `
      INSERT INTO terminology_translations
        (headword_id, icelandic, definition_is, inflections, notes, source, idordabanki_id,
         status, proposed_by, proposed_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)
    `
    )
    .run(
      headwordId,
      icelandic,
      definitionIs || null,
      inflections ? JSON.stringify(inflections) : null,
      notes || null,
      source || 'manual',
      idordabankiId || null,
      userId,
      username
    );

  const translationId = result.lastInsertRowid;

  // Add subject tags
  if (subjects && subjects.length > 0) {
    const insertSubject = db.prepare(
      'INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    );
    for (const subj of subjects) {
      insertSubject.run(translationId, subj);
    }
  }

  return getTranslation(db, translationId);
}

/**
 * Update a headword's fields (english, pos, definition_en).
 */
function updateHeadword(id, updates) {
  const db = getDb();

  const hw = db.prepare('SELECT * FROM terminology_headwords WHERE id = ?').get(id);
  if (!hw) {
    throw new Error('Headword not found');
  }

  const allowedFields = ['english', 'pos', 'definition_en'];
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(snakeKey)) {
      setClauses.push(`${snakeKey} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length > 0) {
    params.push(id);
    db.prepare(`UPDATE terminology_headwords SET ${setClauses.join(', ')} WHERE id = ?`).run(
      ...params
    );
  }

  return getHeadword(id);
}

// Alias for backwards compatibility
const updateTerm = updateHeadword;

/**
 * Update a translation's fields.
 */
function updateTranslation(id, updates) {
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(id);
  if (!tr) {
    throw new Error('Translation not found');
  }

  const allowedFields = ['icelandic', 'definition_is', 'inflections', 'notes', 'source'];
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(snakeKey)) {
      setClauses.push(`${snakeKey} = ?`);
      if (snakeKey === 'inflections' && Array.isArray(value)) {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
    }
  }

  // Handle subject updates separately
  if (updates.subjects && Array.isArray(updates.subjects)) {
    db.prepare('DELETE FROM terminology_translation_subjects WHERE translation_id = ?').run(id);
    const insertSubject = db.prepare(
      'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
    );
    for (const subj of updates.subjects) {
      insertSubject.run(id, subj);
    }
  }

  if (setClauses.length > 0) {
    params.push(id);
    db.prepare(`UPDATE terminology_translations SET ${setClauses.join(', ')} WHERE id = ?`).run(
      ...params
    );
  }

  return getTranslation(db, id);
}

// ─────────────────────────────────────────
// Approval / Dispute workflow
// ─────────────────────────────────────────

/**
 * Approve a translation.
 */
function approveTranslation(translationId, userId, username) {
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }

  if (tr.status === 'approved') {
    return getHeadword(tr.headword_id);
  }

  db.prepare(
    `
    UPDATE terminology_translations
    SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(userId, username, translationId);

  return getHeadword(tr.headword_id);
}

// Alias: old API approved "terms" (headwords), new API approves translations
const approveTerm = approveTranslation;

/**
 * Dispute a translation — sets status to disputed, adds discussion on the headword.
 */
function disputeTranslation(translationId, comment, userId, username, proposedTranslation = null) {
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }

  db.prepare(`UPDATE terminology_translations SET status = 'disputed' WHERE id = ?`).run(
    translationId
  );

  // Add discussion on the headword
  db.prepare(
    `
    INSERT INTO terminology_discussions (headword_id, user_id, username, comment, proposed_translation)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(tr.headword_id, userId, username, comment, proposedTranslation);

  return getHeadword(tr.headword_id);
}

const disputeTerm = disputeTranslation;

/**
 * Add a discussion comment to a headword.
 */
function addDiscussion(headwordId, comment, userId, username, proposedTranslation = null) {
  const db = getDb();

  const hw = db.prepare('SELECT id FROM terminology_headwords WHERE id = ?').get(headwordId);
  if (!hw) {
    throw new Error('Headword not found');
  }

  const result = db
    .prepare(
      `
      INSERT INTO terminology_discussions (headword_id, user_id, username, comment, proposed_translation)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(headwordId, userId, username, comment, proposedTranslation);

  return db
    .prepare('SELECT * FROM terminology_discussions WHERE id = ?')
    .get(result.lastInsertRowid);
}

// ─────────────────────────────────────────
// Review queue
// ─────────────────────────────────────────

/**
 * Get translations needing review (disputed or needs_review).
 */
function getReviewQueue(options = {}) {
  const { subject, limit = 50, offset = 0 } = options;
  const db = getDb();

  let sql = `
    SELECT DISTINCT h.id
    FROM terminology_headwords h
    JOIN terminology_translations t ON t.headword_id = h.id
  `;
  const params = [];

  if (subject) {
    sql += ` JOIN terminology_translation_subjects ts ON ts.translation_id = t.id`;
  }

  sql += ` WHERE t.status IN ('disputed', 'needs_review')`;

  if (subject) {
    sql += ` AND ts.subject = ?`;
    params.push(subject);
  }

  sql += ` ORDER BY h.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const ids = db
    .prepare(sql)
    .all(...params)
    .map((r) => r.id);
  return ids.map((id) => loadHeadword(db, id));
}

// ─────────────────────────────────────────
// Delete
// ─────────────────────────────────────────

/**
 * Delete a headword and all its translations (CASCADE).
 */
function deleteHeadword(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM terminology_headwords WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

const deleteTerm = deleteHeadword;

/**
 * Delete a single translation.
 */
function deleteTranslation(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM terminology_translations WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

// ─────────────────────────────────────────
// Stats
// ─────────────────────────────────────────

function getStats(subject = null) {
  const db = getDb();

  const headwordCount = db
    .prepare('SELECT COUNT(*) as total FROM terminology_headwords')
    .get().total;

  let translationWhere = '';
  const params = [];
  if (subject) {
    translationWhere = `
      WHERE t.id IN (
        SELECT translation_id FROM terminology_translation_subjects WHERE subject = ?
      )
    `;
    params.push(subject);
  }

  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN t.status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN t.status = 'proposed' THEN 1 ELSE 0 END) as proposed,
        SUM(CASE WHEN t.status = 'disputed' THEN 1 ELSE 0 END) as disputed,
        SUM(CASE WHEN t.status = 'needs_review' THEN 1 ELSE 0 END) as needs_review
      FROM terminology_translations t
      ${translationWhere}
    `
    )
    .get(...params);

  const bySubject = db
    .prepare(
      `
      SELECT ts.subject, COUNT(DISTINCT ts.translation_id) as count
      FROM terminology_translation_subjects ts
      GROUP BY ts.subject
      ORDER BY count DESC
    `
    )
    .all();

  const bySource = db
    .prepare(
      `
      SELECT source, COUNT(*) as count
      FROM terminology_translations
      GROUP BY source
      ORDER BY count DESC
    `
    )
    .all();

  return {
    headwords: headwordCount,
    total: stats?.total || 0,
    byStatus: {
      approved: stats?.approved || 0,
      proposed: stats?.proposed || 0,
      disputed: stats?.disputed || 0,
      needsReview: stats?.needs_review || 0,
    },
    bySubject: bySubject.reduce((acc, row) => {
      acc[row.subject] = row.count;
      return acc;
    }, {}),
    bySource: bySource.reduce((acc, row) => {
      acc[row.source] = row.count;
      return acc;
    }, {}),
  };
}

// ─────────────────────────────────────────
// Import functions
// ─────────────────────────────────────────

/**
 * Import terms from CSV. Creates headwords + translations.
 */
function importFromCSV(filePath, userId, username, options = {}) {
  if (!csvParse) {
    throw new Error('CSV import requires csv-parse package. Run: npm install csv-parse');
  }

  const { subjects = [], overwrite = false } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = csvParse(content, { columns: true, skip_empty_lines: true, trim: true });

  const db = getDb();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const checkTranslation = db.prepare(`
    SELECT id, status FROM terminology_translations
    WHERE headword_id = ? AND icelandic = ?
  `);

  const insertTranslationStmt = db.prepare(`
    INSERT INTO terminology_translations
      (headword_id, icelandic, source, status, proposed_by, proposed_by_name)
    VALUES (?, ?, 'imported-csv', 'proposed', ?, ?)
  `);

  const insertSubject = db.prepare(`
    INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject)
    VALUES (?, ?)
  `);

  for (const record of records) {
    const english = record.english || record.English || record.en;
    const icelandic = record.icelandic || record.Icelandic || record.is;
    const pos = record.pos || record.POS || null;
    const defEn = record.definition_en || record.definition || null;

    if (!english || !icelandic) {
      skipped++;
      continue;
    }

    const hw = upsertHeadword(db, english, pos, defEn);
    const headwordId = hw.id;

    const existing = checkTranslation.get(headwordId, icelandic);
    if (existing) {
      if (overwrite && existing.status !== 'approved') {
        updated++;
      } else {
        skipped++;
      }
    } else {
      const trResult = insertTranslationStmt.run(headwordId, icelandic, userId, username);
      const translationId = trResult.lastInsertRowid;
      for (const subj of subjects) {
        insertSubject.run(translationId, subj);
      }
      added++;
    }
  }

  return { success: true, added, updated, skipped, total: records.length };
}

/**
 * Import terms from Excel file.
 */
async function importFromExcel(fileContent, userId, username, options = {}) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    throw new Error('xlsx package not installed. Run: npm install xlsx');
  }

  const { subjects = [], sheetName = null } = options;

  const workbook =
    typeof fileContent === 'string'
      ? XLSX.readFile(fileContent)
      : XLSX.read(fileContent, { type: 'buffer' });

  const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('No sheet found in Excel file');
  }

  const data = XLSX.utils.sheet_to_json(sheet);
  const db = getDb();
  let added = 0;
  let skipped = 0;

  const checkTranslation = db.prepare(`
    SELECT id FROM terminology_translations WHERE headword_id = ? AND icelandic = ?
  `);

  const insertTranslationStmt = db.prepare(`
    INSERT INTO terminology_translations
      (headword_id, icelandic, notes, source, status, proposed_by, proposed_by_name)
    VALUES (?, ?, ?, 'imported-excel', 'proposed', ?, ?)
  `);

  const insertSubject = db.prepare(`
    INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject)
    VALUES (?, ?)
  `);

  for (const row of data) {
    const english =
      row.English ||
      row.english ||
      row.EN ||
      row.en ||
      row['English term'] ||
      row['Enska'] ||
      Object.values(row)[0];
    const icelandic =
      row.Icelandic ||
      row.icelandic ||
      row.IS ||
      row.is ||
      row['Icelandic term'] ||
      row['Íslenska'] ||
      Object.values(row)[1];

    if (!english || !icelandic) {
      skipped++;
      continue;
    }

    const hw = upsertHeadword(db, english, null, null);
    const existing = checkTranslation.get(hw.id, icelandic);

    if (existing) {
      skipped++;
    } else {
      const notes = row.Notes || row.notes || row.Athugasemdir || null;
      const trResult = insertTranslationStmt.run(hw.id, icelandic, notes, userId, username);
      for (const subj of subjects) {
        insertSubject.run(trResult.lastInsertRowid, subj);
      }
      added++;
    }
  }

  return { success: true, added, updated: 0, skipped, total: data.length };
}

/**
 * Import glossary terms with definition merging and placeholder support.
 */
function importGlossaryTerms(terms, userId, username, options = {}) {
  const { subjects = [], source = 'openstax-glossary' } = options;

  if (source && !TERM_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}`);
  }

  const db = getDb();
  let added = 0;
  let updated = 0;
  let enriched = 0;
  let skipped = 0;
  const errors = [];

  const importAll = db.transaction(() => {
    for (const term of terms) {
      const english = (term.english || '').trim();
      if (!english) {
        skipped++;
        continue;
      }

      const icelandic = (term.icelandic || '').trim() || null;
      const defEn = term.definition_en || null;
      const defIs = term.definition_is || null;

      try {
        const hw = upsertHeadword(db, english, null, defEn);

        if (!icelandic) {
          // Placeholder — headword only, no translation
          added++;
          continue;
        }

        // Check if this translation already exists
        const existingTr = db
          .prepare(
            'SELECT id, status FROM terminology_translations WHERE headword_id = ? AND icelandic = ?'
          )
          .get(hw.id, icelandic);

        if (existingTr) {
          if (existingTr.status === 'approved') {
            // Enrich with definition only
            if (defIs) {
              db.prepare(
                `
                UPDATE terminology_translations
                SET definition_is = COALESCE(definition_is, ?)
                WHERE id = ?
              `
              ).run(defIs, existingTr.id);
            }
            enriched++;
          } else {
            // Update definition
            if (defIs) {
              db.prepare(
                `
                UPDATE terminology_translations SET definition_is = COALESCE(definition_is, ?) WHERE id = ?
              `
              ).run(defIs, existingTr.id);
            }
            updated++;
          }
        } else {
          // New translation
          const status = 'needs_review';
          const trResult = db
            .prepare(
              `
              INSERT INTO terminology_translations
                (headword_id, icelandic, definition_is, source, status, proposed_by, proposed_by_name)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `
            )
            .run(hw.id, icelandic, defIs, source, status, userId, username);

          // Add subjects
          const insertSubject = db.prepare(
            'INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
          );
          for (const subj of subjects) {
            insertSubject.run(trResult.lastInsertRowid, subj);
          }
          added++;
        }
      } catch (err) {
        errors.push(`${english}: ${err.message}`);
      }
    }
  });

  importAll();

  return { success: true, added, updated, enriched, skipped, errors, total: terms.length };
}

/**
 * Import key terms from markdown files.
 */
function importFromKeyTerms(bookSlug, chapterNum, userId, username) {
  const db = getDb();

  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) {
    throw new Error(`Book not found: ${bookSlug}`);
  }

  // Determine subject from book mapping
  const mapping = db
    .prepare('SELECT primary_subject FROM book_subject_mapping WHERE book_id = ?')
    .get(book.id);
  const subjects = mapping ? [mapping.primary_subject] : [];

  const pubDir = path.join(BOOKS_DIR, bookSlug, '05-publication');
  let keyTermsFiles = [];

  if (chapterNum) {
    const chDir = `ch${String(chapterNum).padStart(2, '0')}`;
    const pattern = path.join(pubDir, 'faithful', 'chapters', chDir, '*-key-terms.md');
    keyTermsFiles = findFiles(pattern);
    if (keyTermsFiles.length === 0) {
      const mtPattern = path.join(pubDir, 'mt-preview', 'chapters', chDir, '*-key-terms.md');
      keyTermsFiles = findFiles(mtPattern);
    }
  } else {
    keyTermsFiles = findFilesRecursive(pubDir, '-key-terms.md');
  }

  if (keyTermsFiles.length === 0) {
    return { success: true, added: 0, skipped: 0, total: 0, message: 'No key-terms files found' };
  }

  let added = 0;
  let skipped = 0;
  let total = 0;

  const checkTranslation = db.prepare(`
    SELECT id FROM terminology_translations WHERE headword_id = ? AND icelandic = ?
  `);

  const insertTranslationStmt = db.prepare(`
    INSERT INTO terminology_translations
      (headword_id, icelandic, notes, source, status, proposed_by, proposed_by_name)
    VALUES (?, ?, ?, 'chapter-glossary', 'proposed', ?, ?)
  `);

  const insertSubjectStmt = db.prepare(`
    INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject)
    VALUES (?, ?)
  `);

  const definitionRegex = /:::definition\{term="([^"]+)"\}\s*([\s\S]*?):::/g;

  for (const file of keyTermsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;

    while ((match = definitionRegex.exec(content)) !== null) {
      total++;
      const term = match[1].trim();
      const definition = match[2].trim();

      const parts = definition.split(/\s*[-–—]\s*/);
      const icelandic = parts[0].trim();

      if (!icelandic || icelandic.length > 100) {
        skipped++;
        continue;
      }

      const hw = upsertHeadword(db, term, null, null);
      const existing = checkTranslation.get(hw.id, icelandic);
      if (existing) {
        skipped++;
        continue;
      }

      const trResult = insertTranslationStmt.run(
        hw.id,
        icelandic,
        definition.substring(0, 500),
        userId,
        username
      );
      for (const subj of subjects) {
        insertSubjectStmt.run(trResult.lastInsertRowid, subj);
      }
      added++;
    }
  }

  return { success: true, added, skipped, total, filesProcessed: keyTermsFiles.length };
}

// ─────────────────────────────────────────
// Segment term matching
// ─────────────────────────────────────────

/**
 * Find terminology matches in segments.
 * Uses inflection-aware matching and domain priority ranking.
 *
 * @param {Array<{segmentId, enContent, isContent}>} segments
 * @param {string|null} bookSlug - Book slug for domain priority
 * @returns {object} Map of segmentId → { matches, issues }
 */
function findTermsInSegments(segments, bookSlug = null) {
  const db = getDb();

  // Get book's primary subject
  const bookSubject = bookSlug ? getBookSubjectBySlug(db, bookSlug) : null;

  // Load all headwords with approved/proposed translations
  const headwords = db
    .prepare(
      `
      SELECT h.id as headword_id, h.english,
             t.id as translation_id, t.icelandic, t.inflections, t.status,
             GROUP_CONCAT(ts.subject) as subjects
      FROM terminology_headwords h
      JOIN terminology_translations t ON t.headword_id = h.id
      LEFT JOIN terminology_translation_subjects ts ON ts.translation_id = t.id
      WHERE t.status IN ('approved', 'proposed')
      GROUP BY h.id, t.id
      ORDER BY LENGTH(h.english) DESC
    `
    )
    .all();

  // Group translations by headword
  const termMap = new Map();
  for (const row of headwords) {
    if (!termMap.has(row.headword_id)) {
      termMap.set(row.headword_id, {
        headwordId: row.headword_id,
        english: row.english,
        regex: new RegExp(`\\b${escapeRegex(row.english)}\\b`, 'gi'),
        translations: [],
      });
    }
    const inflections = row.inflections ? JSON.parse(row.inflections) : [];
    const subjects = row.subjects ? row.subjects.split(',') : [];

    termMap.get(row.headword_id).translations.push({
      id: row.translation_id,
      icelandic: row.icelandic,
      inflections,
      status: row.status,
      subjects,
      isPrimary: bookSubject ? subjects.includes(bookSubject) : false,
      // Build regex for icelandic + all inflections
      isRegex: buildInflectionRegex(row.icelandic, inflections),
    });
  }

  const terms = Array.from(termMap.values());
  const result = {};

  for (const seg of segments) {
    const matches = [];
    const issues = [];

    if (!seg.enContent) {
      result[seg.segmentId] = { matches, issues };
      continue;
    }

    // Track consumed character ranges so shorter terms that overlap with
    // longer already-matched terms are skipped. Terms are sorted longest-first,
    // so "melting point" claims its range before "melting" is checked.
    const consumed = []; // [{start, end}]

    for (const term of terms) {
      term.regex.lastIndex = 0;
      const enMatch = term.regex.exec(seg.enContent);

      if (enMatch) {
        const matchStart = enMatch.index;
        const matchEnd = matchStart + enMatch[0].length;

        // Skip if this match overlaps with an already-consumed range
        const overlaps = consumed.some((r) => matchStart < r.end && matchEnd > r.start);
        if (overlaps) continue;

        // Claim this range
        consumed.push({ start: matchStart, end: matchEnd });

        // Find best translation (primary domain first)
        const sorted = [...term.translations].sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          if (a.status === 'approved' && b.status !== 'approved') return -1;
          if (a.status !== 'approved' && b.status === 'approved') return 1;
          return 0;
        });

        const primary = sorted[0];
        matches.push({
          headwordId: term.headwordId,
          english: term.english,
          icelandic: primary.icelandic,
          subjects: primary.subjects,
          status: primary.status,
          isPrimary: primary.isPrimary,
          position: enMatch.index,
          translations: sorted.map((t) => ({
            id: t.id,
            icelandic: t.icelandic,
            subjects: t.subjects,
            status: t.status,
            isPrimary: t.isPrimary,
          })),
        });

        // Check if any approved translation appears in IS text
        if (seg.isContent) {
          const approvedTranslations = term.translations.filter((t) => t.status === 'approved');
          if (approvedTranslations.length > 0) {
            const anyFound = approvedTranslations.some((t) => {
              t.isRegex.lastIndex = 0;
              return t.isRegex.test(seg.isContent);
            });

            if (!anyFound) {
              issues.push({
                type: 'missing',
                headwordId: term.headwordId,
                english: term.english,
                expected: approvedTranslations[0].icelandic,
                message: `„${term.english}" → „${approvedTranslations[0].icelandic}" fannst ekki`,
              });
            }
          }
        }
      }
    }

    result[seg.segmentId] = { matches, issues };
  }

  return result;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

/**
 * Load a full headword with translations, subjects, and optionally discussions.
 */
function loadHeadword(db, id, options = {}) {
  const hw = db
    .prepare(
      `
      SELECT h.* FROM terminology_headwords h WHERE h.id = ?
    `
    )
    .get(id);

  if (!hw) return null;

  // Load translations
  const translations = db
    .prepare(
      `
      SELECT t.*
      FROM terminology_translations t
      WHERE t.headword_id = ?
      ORDER BY t.status = 'approved' DESC, t.created_at ASC
    `
    )
    .all(id);

  // Load subjects for each translation
  const subjectStmt = db.prepare(
    'SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?'
  );

  const formattedTranslations = translations.map((t) => ({
    id: t.id,
    icelandic: t.icelandic,
    definitionIs: t.definition_is || null,
    inflections: t.inflections ? JSON.parse(t.inflections) : [],
    source: t.source,
    idordabankiId: t.idordabanki_id || null,
    notes: t.notes,
    status: t.status,
    proposedBy: t.proposed_by,
    proposedByName: t.proposed_by_name,
    approvedBy: t.approved_by,
    approvedByName: t.approved_by_name,
    approvedAt: t.approved_at,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    subjects: subjectStmt.all(t.id).map((s) => s.subject),
  }));

  const result = {
    id: hw.id,
    english: hw.english,
    pos: hw.pos || null,
    definitionEn: hw.definition_en || null,
    translations: formattedTranslations,
    createdAt: hw.created_at,
    updatedAt: hw.updated_at,
  };

  if (options.includeDiscussions) {
    result.discussions = db
      .prepare(
        'SELECT * FROM terminology_discussions WHERE headword_id = ? ORDER BY created_at DESC'
      )
      .all(id);
  }

  return result;
}

/**
 * Load a single translation with subjects.
 */
function getTranslation(db, id) {
  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(id);
  if (!tr) return null;

  const subjects = db
    .prepare('SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?')
    .all(id)
    .map((s) => s.subject);

  return {
    id: tr.id,
    headwordId: tr.headword_id,
    icelandic: tr.icelandic,
    definitionIs: tr.definition_is || null,
    inflections: tr.inflections ? JSON.parse(tr.inflections) : [],
    source: tr.source,
    notes: tr.notes,
    status: tr.status,
    subjects,
    proposedBy: tr.proposed_by,
    proposedByName: tr.proposed_by_name,
  };
}

/**
 * Get a book's primary subject by slug.
 */
function getBookSubjectBySlug(db, bookSlug) {
  const row = db
    .prepare(
      `
      SELECT bsm.primary_subject
      FROM book_subject_mapping bsm
      JOIN registered_books rb ON rb.id = bsm.book_id
      WHERE rb.slug = ?
    `
    )
    .get(bookSlug);
  return row ? row.primary_subject : null;
}

/**
 * Build a regex that matches the base Icelandic form or any inflected form.
 */
function buildInflectionRegex(icelandic, inflections) {
  const forms = [icelandic, ...inflections].filter(Boolean).map(escapeRegex);
  if (forms.length === 0) return /(?!)/; // never matches
  // Sort longest first to avoid partial matches
  forms.sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${forms.join('|')})\\b`, 'gi');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

module.exports = {
  // Headword CRUD
  searchTerms,
  lookupTerm,
  getHeadword,
  getTerm,
  createTerm,
  updateHeadword,
  updateTerm,
  addTranslation,
  updateTranslation,

  // Approval workflow
  approveTranslation,
  approveTerm,
  disputeTranslation,
  disputeTerm,
  addDiscussion,
  getReviewQueue,

  // Delete
  deleteHeadword,
  deleteTerm,
  deleteTranslation,

  // Import
  importFromCSV,
  importFromExcel,
  importFromKeyTerms,
  importGlossaryTerms,

  // Query
  getStats,
  findTermsInSegments,

  // Constants
  TERM_STATUSES,
  TERM_SOURCES,
  SUBJECTS,

  // Test injection
  _setTestDb,
};
