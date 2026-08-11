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
const resolveDbPath = require('../lib/dbPath');
const log = require('../lib/logger');
const { PRODUCER_EXPORT } = require('../lib/glossaryProducer');
const { buildTermAutomaton, findFirstOccurrences } = require('../lib/termAutomaton');
const { buildScope, resolve } = require('../lib/conceptResolver');
const {
  loadEnglishEntries,
  prepareParadigmStatement,
  paradigmFor,
  PLACEHOLDER_TEXT,
} = require('../lib/conceptMatcher');

// Optional dependencies
let csvParse = null;
try {
  csvParse = require('csv-parse/sync').parse;
} catch {
  // csv-parse not installed
}

const DB_PATH = resolveDbPath();
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// --- Test DB injection ---
let _testDb = null;
function _setTestDb(db) {
  _testDb = db;
}

// Valid translation statuses
const TERM_STATUSES = ['approved', 'proposed', 'disputed', 'needs_review', 'rejected'];

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
  'mined-postedit',
];

// Sources whose ICELANDIC is project-authored — the Árnastofnun added-terms
// rights allowlist (item 21 PR-B, spec PR-B Amendment 1). Excludes sources
// already in Íðorðabankinn (idordabankinn/chemistry-association/chemistry-
// society-csv) and indeterminate-origin bulk imports (imported-csv/-excel/
// merge-glossary). A scientific term is not source-owned; the discriminator is
// whose Icelandic it is + idordabanki_id IS NULL (not already in Íðorðabankinn).
const PROJECT_ORIGINATED_SOURCES = [
  'manual',
  'mined-postedit',
  'chapter-glossary',
  'openstax-mt',
  'openstax-glossary',
];

// Sources the lead confirmed are ALREADY in Íðorðabankinn (2026-07-21). They
// carry idordabanki_id = NULL because the id is written only by the
// Íðorðabankinn *fetch* import — so a headword owning one of these siblings has
// a concept Íðorðabankinn already holds (⇒ a kept project term is a NEW
// ALTERNATIVE, not a new translation). The lead said "(at least)" these three;
// extend if more in-Íðorðabankinn sources are identified.
const IN_IDORDABANKINN_SOURCES = [
  'idordabankinn',
  'chemistry-association',
  'chemistry-society-csv',
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

  // Item 18: stamp tier flags and sort best-first so callers can safely take
  // translations[0]. Rank: primary → in-scope → fallback; approved before
  // proposed within a tier (Array#sort is stable, ties keep DB order).
  const TIER_RANK = { primary: 0, 'in-scope': 1, fallback: 2 };
  const tierOf = (tr) => translationTier(tr.subjects || [], bookSubject);

  return rows.map((r) => {
    const hw = loadHeadword(db, r.id);
    if (hw.translations) {
      for (const tr of hw.translations) {
        const tier = tierOf(tr);
        tr.isPrimary = tier === 'primary';
        tr.isFallback = tier === 'fallback';
      }
      hw.translations.sort((a, b) => {
        const byTier = TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)];
        if (byTier !== 0) return byTier;
        if (a.status === 'approved' && b.status !== 'approved') return -1;
        if (a.status !== 'approved' && b.status === 'approved') return 1;
        return 0;
      });
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
 * Validate a tag-at-approval subjects array (item 19). Throws before any write.
 */
function validateSubjects(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error('subjects must be a non-empty array');
  }
  for (const s of subjects) {
    if (!SUBJECTS.includes(s)) throw new Error(`Invalid subject: ${s}`);
  }
}

/**
 * Approve a translation. With options.subjects (item 19, tag-at-approval /
 * I18-R1): wholesale-replace the subject tags and approve in one transaction —
 * runs even if already approved (re-tagging through approve is legitimate).
 * Without options.subjects: legacy behavior, byte-identical, including the
 * already-approved early-return.
 */
function approveTranslation(translationId, userId, username, options = {}) {
  const { subjects } = options;
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }

  if (subjects !== undefined) {
    validateSubjects(subjects);
    const approveTx = db.transaction(() => {
      db.prepare('DELETE FROM terminology_translation_subjects WHERE translation_id = ?').run(
        translationId
      );
      const insertSubject = db.prepare(
        'INSERT INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
      );
      for (const subj of subjects) {
        insertSubject.run(translationId, subj);
      }
      db.prepare(
        `
        UPDATE terminology_translations
        SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(userId, username, translationId);
    });
    approveTx();
    return getHeadword(tr.headword_id);
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

const BATCH_APPROVE_LIMIT = 200;

/**
 * Batch approve (item 19). One transaction, all-or-nothing, fail-loud.
 * Subject semantics deliberately differ from single approve: the batch tag is
 * applied ONLY to currently-untagged rows — a bulk action can never clobber
 * deliberate per-term tagging. Already-approved rows keep their original
 * approval stamps (idempotency parity with single approve).
 *
 * @returns {{ approved: number, alreadyApproved: number, tagged: number }}
 */
function batchApproveTranslations(ids, userId, username, options = {}) {
  const { subjects } = options;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }
  if (ids.length > BATCH_APPROVE_LIMIT) {
    throw new Error(`Too many ids (max ${BATCH_APPROVE_LIMIT})`);
  }
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error('ids must be positive integers');
  }
  if (subjects !== undefined) {
    validateSubjects(subjects);
  }

  const db = getDb();
  const selectStmt = db.prepare('SELECT id, status FROM terminology_translations WHERE id = ?');
  const hasSubjectStmt = db.prepare(
    'SELECT 1 FROM terminology_translation_subjects WHERE translation_id = ? LIMIT 1'
  );
  const insertSubject = db.prepare(
    'INSERT OR IGNORE INTO terminology_translation_subjects (translation_id, subject) VALUES (?, ?)'
  );
  const approveStmt = db.prepare(
    `
    UPDATE terminology_translations
    SET status = 'approved', approved_by = ?, approved_by_name = ?, approved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  );

  const batchTx = db.transaction(() => {
    const rows = ids.map((id) => ({ id, row: selectStmt.get(id) }));
    const missing = rows.filter((r) => !r.row).map((r) => r.id);
    if (missing.length > 0) {
      throw new Error(`Translations not found: ${missing.join(', ')}`);
    }
    let approved = 0;
    let alreadyApproved = 0;
    let tagged = 0;
    for (const { id, row } of rows) {
      if (subjects !== undefined && !hasSubjectStmt.get(id)) {
        for (const subj of subjects) {
          insertSubject.run(id, subj);
        }
        tagged++;
      }
      if (row.status === 'approved') {
        alreadyApproved++;
      } else {
        approveStmt.run(userId, username, id);
        approved++;
      }
    }
    return { approved, alreadyApproved, tagged };
  });

  return batchTx();
}

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

const REJECT_REASON_MAX = 500;

/**
 * Reject a translation (item 19 — the review queue's negative action).
 * Terminal-but-reversible: approveTranslation approves from any status.
 * Audit trail is a terminology_discussions entry (dispute's pattern — no
 * schema change; the translations table has no rejected_by columns).
 */
function rejectTranslation(translationId, userId, username, reason = '') {
  const db = getDb();

  const tr = db.prepare('SELECT * FROM terminology_translations WHERE id = ?').get(translationId);
  if (!tr) {
    throw new Error('Translation not found');
  }
  if (typeof reason !== 'string' || reason.length > REJECT_REASON_MAX) {
    throw new Error(`reason must be a string of at most ${REJECT_REASON_MAX} characters`);
  }

  const rejectTx = db.transaction(() => {
    db.prepare(`UPDATE terminology_translations SET status = 'rejected' WHERE id = ?`).run(
      translationId
    );
    db.prepare(
      `
      INSERT INTO terminology_discussions (headword_id, user_id, username, comment, proposed_translation)
      VALUES (?, ?, ?, ?, NULL)
    `
    ).run(tr.headword_id, userId, username, reason ? `Hafnað: ${reason}` : 'Hafnað');
  });
  rejectTx();

  return getHeadword(tr.headword_id);
}

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
 * Public book→subject resolver (item 19; consolidates the routes-level
 * resolveBookSubject duplicate — I18-R2). Errors propagate: fail loud.
 */
function getBookSubject(bookSlug) {
  if (!bookSlug) return null;
  return getBookSubjectBySlug(getDb(), bookSlug);
}

const REVIEW_QUEUE_DEFAULT_STATUSES = ['proposed', 'disputed', 'needs_review'];

/**
 * Build the subject-scoping WHERE fragment shared by the queue query and the
 * counts query. subject === 'untagged' selects rows with zero subject tags
 * (the I18-R1 targets a slug-filtered view must not silently hide).
 */
function subjectScopeClause(effectiveSubject, where, params) {
  if (effectiveSubject === 'untagged') {
    where.push(
      'NOT EXISTS (SELECT 1 FROM terminology_translation_subjects x WHERE x.translation_id = t.id)'
    );
  } else if (effectiveSubject) {
    where.push(
      'EXISTS (SELECT 1 FROM terminology_translation_subjects x WHERE x.translation_id = t.id AND x.subject = ?)'
    );
    params.push(effectiveSubject);
  }
}

/**
 * Translation-granular review queue (item 19). Replaces the headword-granular
 * getReviewQueue. Explicit `subject` beats `book`; a book without a subject
 * mapping applies no subject constraint.
 *
 * @returns {{ items: Array, total: number }}
 */
function getTranslationReviewQueue(options = {}) {
  const {
    statuses = REVIEW_QUEUE_DEFAULT_STATUSES,
    source,
    subject,
    book,
    limit = 50,
    offset = 0,
  } = options;
  const db = getDb();

  if (!Array.isArray(statuses) || statuses.length === 0) {
    throw new Error('statuses must be a non-empty array');
  }
  for (const s of statuses) {
    if (!TERM_STATUSES.includes(s)) throw new Error(`Invalid status: ${s}`);
  }

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [`t.status IN (${statuses.map(() => '?').join(', ')})`];
  const params = [...statuses];
  if (source) {
    where.push('t.source = ?');
    params.push(source);
  }
  subjectScopeClause(effectiveSubject, where, params);
  const whereSql = where.join(' AND ');

  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM terminology_translations t WHERE ${whereSql}`)
    .get(...params).total;

  const rows = db
    .prepare(
      `
      SELECT t.id, t.headword_id, h.english, h.pos,
             t.icelandic, t.definition_is, t.notes, t.source, t.status,
             t.proposed_by, t.proposed_by_name, t.created_at
      FROM terminology_translations t
      JOIN terminology_headwords h ON h.id = t.headword_id
      WHERE ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(...params, limit, offset);

  const subjectStmt = db.prepare(
    'SELECT subject FROM terminology_translation_subjects WHERE translation_id = ?'
  );

  const items = rows.map((r) => ({
    translationId: r.id,
    headwordId: r.headword_id,
    english: r.english,
    pos: r.pos || null,
    icelandic: r.icelandic,
    definitionIs: r.definition_is || null,
    notes: r.notes,
    source: r.source,
    status: r.status,
    subjects: subjectStmt.all(r.id).map((s) => s.subject),
    proposedBy: r.proposed_by,
    proposedByName: r.proposed_by_name,
    createdAt: r.created_at,
  }));

  return { items, total };
}

/**
 * Lightweight per-status counts for the review banner and queue chips.
 * `subject` in the result is the resolved effective subject (or null) so the
 * client can prefill its tag-at-approval picker without a book→subject map.
 */
function getReviewQueueCounts(options = {}) {
  const { book, subject } = options;
  const db = getDb();

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [`t.status IN ('proposed', 'disputed', 'needs_review')`];
  const params = [];
  subjectScopeClause(effectiveSubject, where, params);

  const row = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN t.status = 'proposed' THEN 1 ELSE 0 END) AS proposed,
        SUM(CASE WHEN t.status = 'disputed' THEN 1 ELSE 0 END) AS disputed,
        SUM(CASE WHEN t.status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review
      FROM terminology_translations t
      WHERE ${where.join(' AND ')}
    `
    )
    .get(...params);

  return {
    proposed: row?.proposed || 0,
    disputed: row?.disputed || 0,
    needsReview: row?.needs_review || 0,
    subject: effectiveSubject || null,
  };
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
        SUM(CASE WHEN t.status = 'needs_review' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN t.status = 'rejected' THEN 1 ELSE 0 END) as rejected
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
      rejected: stats?.rejected || 0,
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
 * Item 18 — the single subject-scoping policy for editing surfaces.
 * Classifies one translation relative to a book's primary subject:
 *   'primary'  — tagged with the book's subject (ranks first, drives isPrimary)
 *   'in-scope' — untagged or tagged 'general' (or the book has no subject
 *                mapping at all → nothing is filtered, nothing is primary)
 *   'fallback' — tagged only with other subjects; surfaces ONLY when a
 *                headword has no in-scope translation, and never produces
 *                missing-term issues.
 * exportBookGlossary deliberately does NOT use this (MT priming stays strict).
 *
 * @param {string[]} subjects
 * @param {string|null} bookSubject
 * @returns {'primary'|'in-scope'|'fallback'}
 */
function translationTier(subjects, bookSubject) {
  if (!bookSubject) return 'in-scope';
  if (subjects.includes(bookSubject)) return 'primary';
  if (subjects.length === 0 || subjects.includes('general')) return 'in-scope';
  return 'fallback';
}

// C24: the ONLY cached state. It depends solely on the DISTINCT
// concept_term(lang='en') strings (one entry per string, not per row — see
// conceptMatcher.loadEnglishEntries), and the fingerprint is computed from
// rows we re-read on every call — so the DB stays authoritative: there is no
// invalidation hook to forget, no second connection, no test-mode special
// case. Staleness therefore cannot arrive as a missed notification; it would
// require a HASH COLLISION between two different English-string sets. (This
// comment used to claim staleness was "structurally impossible" — that
// overstated it. ⚠️ CORRECTED 2026-08-10 (§C36 B4b-1 fix round 1): it also
// used to point at `fingerprintHeadwords`, deleted this task — see
// conceptMatcher.fingerprintEntries for exactly what the encoding does and
// does not guarantee.)
//
// PRAGMA data_version cannot do this job: all 16 mutators write through the same
// singleton connection, and data_version is "unchanged for commits made on the
// same database connection".
let _automatonCache = null; // { fingerprint: number, automaton }

/**
 * Normalise a caller-supplied chapter for conceptResolver.buildScope.
 *
 * ⚠️ THE CAST IS NOT THE POINT — SQLite already does it correctly. `book_term_
 * preference.chapter` is INTEGER, so `chapter IN (0, ?)` bound with '3' returns
 * the same rows as 3 (column affinity, measured 2026-08-10). The hazard is the
 * SENTINEL WORD: 'appendices', null and undefined all return the chapter-0
 * book-default rows with NO throw, silently dropping every appendices-scoped
 * override. So this guard REJECTS rather than coerces.
 *
 * 0 = book default, -1 = appendices (chapterLabel's sentinel).
 */
function normalizeChapterArg(chapter) {
  if (chapter === undefined) return 0;
  if (typeof chapter === 'number' && Number.isInteger(chapter)) return chapter;
  if (typeof chapter === 'string' && /^-?\d+$/.test(chapter)) return Number(chapter);
  throw new TypeError(
    `chapter must be an integer (0 = book default, -1 = appendices), got ${JSON.stringify(chapter)}`
  );
}

/**
 * Find terminology matches in segments.
 * Uses inflection-aware matching and domain priority ranking.
 *
 * @param {Array<{segmentId, enContent, isContent}>} segments
 * @param {string|null} bookSlug - Book slug for domain priority
 * @returns {object} Map of segmentId → { matches, issues }
 */
function findTermsInSegments(segments, bookSlug = null, chapter) {
  const db = getDb();
  const chapterNum = normalizeChapterArg(chapter);

  // ⚠️ AN UNSCOPED BOOK MATCHES NOTHING, and that is fail-CLOSED on purpose:
  // resolve() returns no winner AND an empty outOfScope (emptyResolution is
  // called with [] for the unscoped branch), so the isFallback guard below
  // drops every hit.
  //
  // ⚠️ THIS DIFFERS FROM THE OLD MODEL, where a null bookSubject made
  // translationTier return 'in-scope' for everything and every term matched.
  // Measured 2026-08-10; the comment that stood here asserted the opposite.
  // Reachable in production for a book absent from domains.js's
  // BOOK_DOMAIN_PRIORITY map (migrations 046/047 seed only from that map), so
  // it is LOGGED rather than left to look like "this book has no terminology".
  //
  // ⚠️ Fix round 2, Minor 1 — 'no-book-slug' is a DISTINCT reason from
  // buildScope's own 'unregistered'/'no-priorities'. A caller that omitted
  // bookSlug entirely is not the same fault as a caller naming a real but
  // unregistered/unpriority'd book; conceptResolver.js:149-152 states exactly
  // this rationale for keeping THOSE two distinct, and collapsing a third
  // case into 'unregistered' here would repeat it one level up.
  const scope = bookSlug ? buildScope(db, bookSlug, chapterNum) : { unscoped: 'no-book-slug' };
  const paradigmStmt = prepareParadigmStatement(db);

  // ⚠️ ONE GLOBAL AUTOMATON, exactly as before. The old term SQL was unfiltered
  // too and all scoping happened after; keeping that means the single-slot
  // cache still works and NO scope-keyed cache is needed. Per-book scoping is
  // resolve()'s job.
  const { entries, englishById, fingerprint } = loadEnglishEntries(db);
  if (!_automatonCache || _automatonCache.fingerprint !== fingerprint) {
    // Drop the old automaton BEFORE building the new one: the object literal
    // evaluates fully before the assignment, so without this two automata are
    // live at once. Safe because this function is fully synchronous — if it
    // ever becomes async this is a correctness bug, not an optimisation.
    _automatonCache = null;
    _automatonCache = { fingerprint, automaton: buildTermAutomaton(entries) };
  }
  const automaton = _automatonCache.automaton;

  // ⚠️ MEMOISE resolve() ACROSS THE WHOLE CALL, keyed on the English string.
  // Without this, resolve() runs once per (segment × hit) and each call is a DB
  // lookup through lookupCandidates. The golden fixture's ~40 matches make that
  // look free; a real module has hundreds of segments, and C24 exists because
  // this function took the server down for ~3 minutes per call at production
  // scale. The scope is fixed for the whole invocation, so one English string
  // has one answer.
  //
  // SOUND, and verified rather than assumed: nothing in conceptResolver assigns
  // to `scope` or mutates `scope.preference`/`scope.positionOf` (grepped; the
  // control finds 18 reads, so the search is live), and this function is fully
  // synchronous, so no concurrent write can land mid-call. ⚠️ If this function
  // ever becomes async, this cache — like the automaton one below — turns into
  // a correctness bug.
  const resolved = new Map();
  const resolveOnce = (english) => {
    let r = resolved.get(english);
    if (r === undefined) {
      r = resolve(scope, english);
      resolved.set(english, r);
    }
    return r;
  };

  // ⚠️ D5 COVERS TWO POPULATIONS, AND alsoInScope EXPRESSES ONLY ONE.
  // Cross-concept — two different concepts carry the same English string and
  // one loses the domain-priority walk — is what alsoInScope reports
  // (measured 2026-08-10 on the real corpus: 11,553/61,042 EN strings, 18.9%).
  // INTRA-concept — one concept with two ranked Icelandic terms — is what D5's
  // prose actually describes ("the OLD check passed if the editor used ANY
  // approved translation"), is the direct analogue of the old
  // headword→many-approved-translations shape, and is the LARGER population
  // (17,356/70,187 concepts, 24.7%, same measurement). alsoFrom()
  // (conceptResolver.js) builds from `chosen`, one head-form entry per
  // concept, then excludes the winner's own conceptId — so a concept's own
  // rank-2+ sibling can never appear there. This query is the only way to
  // reach it, and conceptResolver.js is NOT touched: its alsoInScope contract
  // is depended on elsewhere (verify-b4a-gates.js gate 3's cross-concept
  // assertion) exactly as-is.
  //
  // ⚠️ BOUNDED TO THE ISSUE PATH ON PURPOSE, not the hit path. It runs only
  // after matchesForm(winner) has already failed AND alts did not answer —
  // i.e. only when an issue is actually about to be emitted, which is rare
  // relative to the number of hits. A per-HIT query here would repeat §C24,
  // which took the server down for ~3 minutes per call at production scale
  // (see the `resolved` memo's comment above). Memoised per conceptId for the
  // whole call, same pattern as `resolved`.
  //
  // ⚠️ THE MEMO CACHES THE CONCEPT'S FULL IS TERM LIST, WINNER-INDEPENDENT ON
  // PURPOSE. An earlier version bound the winner into the SQL (`id != ?`) while
  // keying the memo on conceptId alone, and asserted that one concept can only
  // win with one termId per call. THAT IS FALSE: a concept may carry several
  // English strings (UNIQUE is per (concept_id, lang, text), migration 045:48),
  // book_term_preference is keyed on the ENGLISH STRING (migration 048:109-115),
  // and applyPreference (conceptResolver.js:501-508) sets winner.termId to an
  // ARBITRARY term of the concept — not necessarily its head form. So a
  // preference on one of a concept's English strings and not another produces
  // two different winner termIds for one conceptId in one call. The first hit's
  // winner was then frozen into the SQL exclusion and reused for every later
  // hit on the same conceptId, making SEGMENT ORDER decide whether the editor
  // saw `alternative` or `missing` — §C18 reproduced one level up, inside the
  // fix round that had just corrected an instance of it for `outOfScope`.
  // Measured 2026-08-11 (whole-branch review, fix round 1) by swapping segment
  // order alone with everything else held constant. Excluding the winner in JS
  // instead removes the winner from the cache key entirely: the cached rows no
  // longer depend on which hit populated them first, so order cannot matter.
  const siblingStmt = db.prepare(
    `SELECT id AS termId, text FROM concept_term
      WHERE concept_id = ? AND lang = 'is'
      ORDER BY rank, id`
  );
  const isTermsOf = new Map();
  const isTermsFor = (conceptId) => {
    let s = isTermsOf.get(conceptId);
    if (s === undefined) {
      s = siblingStmt.all(conceptId);
      isTermsOf.set(conceptId, s);
    }
    return s;
  };

  const result = {};
  let unscopedHits = 0; // §item-1c: accumulated across the call, logged once — never per segment
  for (const seg of segments) {
    const matches = [];
    const issues = [];
    if (!seg.enContent) {
      result[seg.segmentId] = { matches, issues };
      continue;
    }

    const firstByHeadword = findFirstOccurrences(automaton, seg.enContent);
    if (scope.unscoped) unscopedHits += firstByHeadword.size;

    // ⚠️ RESOLVE FIRST, THEN ORDER, THEN TILE — and the order of those three is
    // the whole behaviour. Under the old model the tier was known from the SQL
    // row, so `terms` could be pre-partitioned; here the tier is only known
    // after resolve(). Tiling before resolving would let a fallback term claim
    // a span an in-scope term wanted, inverting item 18's rule that the book's
    // own domain always wins an overlap.
    const hits = [];
    for (const [headwordId, occ] of firstByHeadword) {
      const english = englishById.get(headwordId);
      const res = resolveOnce(english);
      // §C43 / D7: the placeholder is a well-formed head form that is not a
      // word. It must never reach an editor. This does NOT close §C43.
      if (res.winner && res.winner.text === PLACEHOLDER_TEXT) continue;
      const isFallback = !res.winner;
      // ⚠️ §C43 / D7 (fix round 2, Finding 1) — the guard above only covers the
      // WINNER. On a fallback match winner is null, and outOfScope/alsoInScope
      // are built from headForm() (conceptResolver.js:353-356, :404-414),
      // which for the 201 placeholder-only concepts IS '[vantar]'. Filtering
      // here is what makes "never reaches an editor" true for BOTH paths — a
      // fallback match's suggestion (outOfScope) and an in-scope match's
      // alternative sibling (alsoInScope). The isFallback guard immediately
      // below then drops a hit left with nothing to offer, exactly as it
      // already did for a genuinely empty outOfScope. Deliberately NOT
      // promoting an alsoInScope alternative to winner when the winner IS the
      // placeholder — dropping the whole match there can suppress a real
      // answer at a lower position; that tradeoff is out of remit here.
      const offerable = res.outOfScope.filter((t) => t.text !== PLACEHOLDER_TEXT);
      const alts = (res.alsoInScope || []).filter((t) => t.text !== PLACEHOLDER_TEXT);
      if (isFallback && offerable.length === 0) continue; // nothing to offer
      // ⚠️ Finding 2 (fix round 2) — conceptResolver.js:124-129's `hits`
      // statement has NO ORDER BY, so `outOfScope` — unlike every other list
      // the resolver returns (`atBest` sorts by conceptId; `alsoFrom` sorts by
      // position, conceptId) — inherits raw SQL row order. `outOfScope` was
      // designed as a report, not an answer; this function is the first
      // caller to read `outOfScope[0]` as one. Sorting here, AFTER the
      // placeholder filter so the two compose, is what keeps a fallback
      // answer deterministic instead of reproducing §C18's row-order defect
      // inside the model built to end it. Do not add ORDER BY to
      // conceptResolver for this — out of scope for this file's fix.
      offerable.sort((a, b) => a.conceptId - b.conceptId);
      hits.push({ headwordId, english, occ, res, isFallback, offerable, alts });
    }

    hits.sort(
      (a, b) =>
        Number(a.isFallback) - Number(b.isFallback) || // in-scope claims spans first
        b.english.length - a.english.length || // "melting point" before "melting"
        a.headwordId - b.headwordId // deterministic; the golden rests on it
    );

    const consumed = [];
    for (const hit of hits) {
      const start = hit.occ.index;
      const end = start + hit.occ.length;
      if (consumed.some((r) => start < r.end && end > r.start)) continue;
      consumed.push({ start, end });

      const winner = hit.res.winner;
      const alts = hit.alts; // already placeholder-filtered above
      // ⚠️ `status` is a constant, not a lifecycle readout. Emitted to keep
      // the response shape stable for the existing client, which renders it
      // as an approval badge
      // (segment-editor.js:2467-2470): every term now shows ✓, which IS
      // truthful under the concept model, since there is no proposed tier —
      // the corpus is Árnastofnun's, imported by an operator, and
      // concept_term has no status column at all.
      matches.push({
        headwordId: hit.headwordId,
        english: hit.english,
        icelandic: winner ? winner.text : (hit.offerable[0] || {}).text || null,
        subjects: winner ? [winner.domain] : [],
        status: 'approved',
        isPrimary: Boolean(winner),
        isFallback: hit.isFallback,
        position: start,
        // ⚠️ A FALLBACK ENTRY HAS `id: undefined`, DROPPED BY JSON.stringify —
        // NOT PRESENT AS `null`. `hit.offerable`/`hit.res.outOfScope` entries
        // are shaped {conceptId, text, domain} (conceptResolver.
        // resolveCandidates, step 2); they carry no termId, unlike
        // `winner`/`alsoInScope`, which do. This differs from the old model,
        // where every translation row always carried a real translation id.
        // Measured 2026-08-10 — no current client reads translations[].id, so
        // this is left as-is rather than fabricated; a future consumer
        // needing a stable fallback handle should read this comment rather
        // than rediscover the gap.
        translations: (winner ? [winner, ...alts] : hit.offerable).map((t) => ({
          id: t.termId,
          icelandic: t.text,
          subjects: t.domain ? [t.domain] : [],
          status: 'approved',
          isPrimary: winner ? t.termId === winner.termId : false,
          isFallback: hit.isFallback,
        })),
      });

      // ⚠️ THREE INDEPENDENT CHECKS, NOT FOUR. This comment used to claim four
      // "gates" — not fallback, IS content present, a winner exists, and the EN
      // span was actually claimed — but `hit.isFallback` (:1526) IS `!res.winner`
      // by construction, and nothing mutates `res` between there and here. So
      // `hit.isFallback ||` and `!winner` are the SAME predicate written twice,
      // not two independent ones; no fixture can ever make them disagree. Kept
      // both anyway, deliberately: `hit.isFallback` reads as "not a fallback
      // match" at the call site, which is clearer than re-deriving it from
      // `!winner`. The real checks are: IS content present, a winner exists —
      // plus the EN span having been claimed, which is structural here (we are
      // inside the tiler) rather than a runtime condition at all.
      if (hit.isFallback || !seg.isContent || !winner) continue;

      const matchesForm = (term) => {
        const re = buildInflectionRegex(term.text, paradigmFor(paradigmStmt, term.termId));
        // Insurance, not correction: wholeWordRegex always returns a fresh
        // RegExp per call today, so lastIndex is already 0 on arrival and this
        // is presently a no-op. It becomes load-bearing the moment anyone
        // memoises buildInflectionRegex per termId — a stateful /g regex lies
        // on alternate .test() calls otherwise.
        re.lastIndex = 0;
        return re.test(seg.isContent);
      };

      if (matchesForm(winner)) continue;

      // D5: the resolver returns ONE winner, so a legitimate synonym would
      // start failing. Say "you used a known alternative" instead of "missing".
      // `alts` is the CROSS-concept population (alsoInScope); isTermsFor is the
      // INTRA-concept population (this concept's own OTHER Icelandic terms,
      // winner excluded here in JS — see the isTermsFor comment above for why
      // that exclusion cannot live in the SQL/memo instead).
      const used =
        alts.find(matchesForm) ||
        isTermsFor(winner.conceptId).find((t) => t.termId !== winner.termId && matchesForm(t));
      issues.push(
        used
          ? {
              type: 'alternative',
              headwordId: hit.headwordId,
              english: hit.english,
              expected: winner.text,
              used: used.text,
              message: `„${hit.english}“ → „${winner.text}“ (notað: „${used.text}“)`,
            }
          : {
              type: 'missing',
              headwordId: hit.headwordId,
              english: hit.english,
              expected: winner.text,
              message: `„${hit.english}“ → „${winner.text}“ fannst ekki`,
            }
      );
    }
    result[seg.segmentId] = { matches, issues };
  }
  if (scope.unscoped && unscopedHits > 0) {
    log.warn(
      { bookSlug, reason: scope.unscoped, hits: unscopedHits },
      'terminology: book has no domain scope; matcher emitted 0 matches'
    );
  }
  return result;
}

/**
 * Propose a glossary term from a mined post-edit candidate (Unit 3.5).
 * Upserts the (human-supplied) English headword and adds the corrected
 * Icelandic as a *proposed* translation — so it still goes through normal
 * approval. Idempotent: an existing identical translation is returned as-is.
 *
 * @returns {{ headwordId, translationId, existed: boolean }}
 */
function proposeMinedTerm(english, icelandic, pos, userId, username) {
  if (!english || !icelandic) throw new Error('english and icelandic are required');
  const db = getDb();
  const hw = upsertHeadword(db, english, pos || null, null);
  const existing = db
    .prepare('SELECT id FROM terminology_translations WHERE headword_id = ? AND icelandic = ?')
    .get(hw.id, icelandic);
  if (existing) return { headwordId: hw.id, translationId: existing.id, existed: true };
  const tr = addTranslation(hw.id, { icelandic, source: 'mined-postedit' }, userId, username);
  return { headwordId: hw.id, translationId: tr.id, existed: false };
}

/**
 * Export a book's glossary from the DB in the `glossary-unified.json` shape
 * consumed by `tools/api-translate.js` (Unit 6.1 — keeps the MT glossary fresh
 * instead of the months-stale committed export).
 *
 * Scoped to the book's primary subject (so chemistry books get chemistry
 * terms); if the book has no subject mapping, all terms are included. One row
 * per translation; sibling translations become `alternatives`.
 *
 * @param {string} bookSlug
 * @returns {{ producer, generated, book, stats, terms: Array }}
 */
function exportBookGlossary(bookSlug) {
  const db = getDb();
  const bookSubject = getBookSubjectBySlug(db, bookSlug);

  const rows = db
    .prepare(
      `SELECT h.id AS headword_id, h.english, h.pos, h.definition_en,
              t.icelandic, t.definition_is, t.status, t.source, t.notes,
              GROUP_CONCAT(ts.subject) AS subjects
       FROM terminology_headwords h
       JOIN terminology_translations t ON t.headword_id = h.id
       LEFT JOIN terminology_translation_subjects ts ON ts.translation_id = t.id
       WHERE t.status != 'rejected'
       GROUP BY t.id
       ORDER BY h.english COLLATE NOCASE ASC`
    )
    .all();

  // Group translations per headword for alternatives + subject scoping.
  const byHeadword = new Map();
  for (const r of rows) {
    const subjects = r.subjects ? r.subjects.split(',') : [];
    if (!byHeadword.has(r.headword_id)) byHeadword.set(r.headword_id, []);
    byHeadword.get(r.headword_id).push({ ...r, subjects });
  }

  const terms = [];
  const stats = { total: 0, approved: 0, proposed: 0, needs_review: 0, disputed: 0 };
  for (const translations of byHeadword.values()) {
    for (const t of translations) {
      // Subject scoping: include when the translation carries the book's
      // subject, or when the book has no subject mapping.
      // DELIBERATELY STRICT (item 18): unlike the editor surfaces
      // (findTermsInSegments/lookupTerm admit 'general'/untagged and fall back
      // on a miss), MT priming exports ONLY exact-subject-tagged translations —
      // cross-subject or unclassified terms in the MT glossary would harm MT
      // quality. Pinned by 'deliberately strict' in terminologyService.test.js.
      if (bookSubject && !t.subjects.includes(bookSubject)) continue;
      terms.push({
        english: t.english,
        icelandic: t.icelandic,
        pos: t.pos,
        definitionEn: t.definition_en,
        definitionIs: t.definition_is,
        status: t.status,
        source: t.source,
        subjects: t.subjects,
        alternatives: translations
          .filter((o) => o.icelandic !== t.icelandic)
          .map((o) => o.icelandic),
        notes: t.notes,
      });
      stats.total++;
      if (stats[t.status] !== undefined) stats[t.status]++;
    }
  }

  // `producer` is TOP-LEVEL on purpose: sameTerms compares only `.terms`
  // (glossaryExportDecision.js), so the stamp cannot trigger a spurious
  // rewrite every 2h. It makes producer detection exact for every book after
  // its first adoption, and catches the REVERSE swap — re-running
  // merge-glossary.js over an adopted book removes the stamp.
  //
  // It also closes a corner in detectProducer's shape inference
  // (glossaryProducer.js): that function checks `payload.producer ===
  // PRODUCER_EXPORT` FIRST, before ever looking at `terms`, so a stamped
  // payload is never misread as 'unknown' — even for a book whose subject
  // filter legitimately matches zero terms, where the shape-only fallback
  // (an empty `terms` array) would otherwise be indistinguishable from a
  // malformed payload.
  return {
    producer: PRODUCER_EXPORT,
    generated: new Date().toISOString(),
    book: bookSlug,
    stats,
    terms,
  };
}

/**
 * Árnastofnun added-terms seed rows (item 21 PR-B). Selects the project's
 * approved, project-authored Icelandic terms that are NOT already in
 * Íðorðabankinn, then classifies each as a new translation or a new
 * alternative to an existing Íðorðabankinn entry.
 *
 * Filter: status='approved' AND idordabanki_id IS NULL AND
 *         source IN PROJECT_ORIGINATED_SOURCES [AND subject scope].
 *
 * `alternatives` are the other KEPT (approved project-Icelandic) translations
 * of the same headword. `submissionType`/`existingIdordabanki*` come from a
 * per-headword lookup of the id-linked siblings the filter excluded.
 *
 * @param {{ subject?: string|null, book?: string|null }} [options]
 * @returns {Array<object>} rows ordered by english then icelandic (NOCASE)
 */
function getAddedTerms(options = {}) {
  const { subject = null, book = null } = options;
  const db = getDb();

  const effectiveSubject = subject || (book ? getBookSubjectBySlug(db, book) : null);

  const where = [
    "t.status = 'approved'",
    't.idordabanki_id IS NULL',
    `t.source IN (${PROJECT_ORIGINATED_SOURCES.map(() => '?').join(', ')})`,
  ];
  const params = [...PROJECT_ORIGINATED_SOURCES];
  subjectScopeClause(effectiveSubject, where, params);
  const whereSql = where.join(' AND ');

  const rows = db
    .prepare(
      `SELECT h.id AS headword_id, h.english, h.pos, h.definition_en,
              t.icelandic, t.definition_is, t.notes, t.source,
              t.proposed_by, t.proposed_by_name, t.approved_by, t.approved_by_name, t.approved_at,
              GROUP_CONCAT(ts.subject) AS subjects
       FROM terminology_headwords h
       JOIN terminology_translations t ON t.headword_id = h.id
       LEFT JOIN terminology_translation_subjects ts ON ts.translation_id = t.id
       WHERE ${whereSql}
       GROUP BY t.id
       ORDER BY h.english COLLATE NOCASE ASC, t.icelandic COLLATE NOCASE ASC`
    )
    .all(...params);

  if (rows.length === 0) return [];

  // Kept siblings per headword (for `alternatives`).
  const keptByHeadword = new Map();
  for (const r of rows) {
    if (!keptByHeadword.has(r.headword_id)) keptByHeadword.set(r.headword_id, []);
    keptByHeadword.get(r.headword_id).push(r.icelandic);
  }

  // Siblings KNOWN to be in Íðorðabankinn (the ones the filter excluded): either
  // idordabanki_id-linked (fetched from Íðorðabankinn) OR sourced from a set the
  // lead confirmed is already in Íðorðabankinn (those carry a NULL id). Presence
  // ⇒ the concept is in Íðorðabankinn ⇒ the kept project term is a NEW
  // ALTERNATIVE. One query over the kept headword ids.
  const hwIds = [...keptByHeadword.keys()];
  const anchorRows = db
    .prepare(
      `SELECT headword_id, icelandic, idordabanki_id
       FROM terminology_translations
       WHERE headword_id IN (${hwIds.map(() => '?').join(', ')})
         AND (idordabanki_id IS NOT NULL
              OR source IN (${IN_IDORDABANKINN_SOURCES.map(() => '?').join(', ')}))
       ORDER BY idordabanki_id ASC`
    )
    .all(...hwIds, ...IN_IDORDABANKINN_SOURCES);
  const anchorByHeadword = new Map();
  for (const a of anchorRows) {
    if (!anchorByHeadword.has(a.headword_id)) anchorByHeadword.set(a.headword_id, []);
    anchorByHeadword.get(a.headword_id).push(a);
  }

  return rows.map((r) => {
    const anchors = anchorByHeadword.get(r.headword_id) || [];
    return {
      english: r.english,
      pos: r.pos || null,
      definitionEn: r.definition_en || null,
      icelandic: r.icelandic,
      definitionIs: r.definition_is || null,
      alternatives: keptByHeadword.get(r.headword_id).filter((is) => is !== r.icelandic),
      subjects: r.subjects ? r.subjects.split(',') : [],
      notes: r.notes || null,
      source: r.source,
      submissionType: anchors.length ? 'new-alternative' : 'new-translation',
      existingIdordabankiTerm: anchors.map((a) => a.icelandic).join('; '),
      // Only the non-null ids — a chem-society anchor has no Íðorðabankinn id.
      existingIdordabankiId: anchors
        .map((a) => a.idordabanki_id)
        .filter((v) => v != null)
        .join('; '),
      proposedBy: r.proposed_by_name || r.proposed_by || '',
      approvedBy: r.approved_by_name || r.approved_by || '',
      approvedAt: r.approved_at || null,
    };
  });
}

/**
 * Terminology consistency for a single segment (save-path QA, Unit 3.1).
 * Returns the "missing approved translation" issues for one EN/IS pair.
 *
 * @param {string} enContent
 * @param {string} isContent
 * @param {string|null} bookSlug
 * @param {string} [segmentId]
 * @returns {Array<{type, headwordId, english, expected, message}>}
 */
function checkSegmentConsistency(
  enContent,
  isContent,
  bookSlug = null,
  segmentId = 'seg',
  chapter
) {
  const res = findTermsInSegments([{ segmentId, enContent, isContent }], bookSlug, chapter);
  return res[segmentId]?.issues || [];
}

/**
 * Aggregate terminology violations across a module's segments (submit-gate
 * report, Unit 3.2). Groups by headword so a head-editor sees term → expected
 * IS → which segments still violate it.
 *
 * @param {Array<{segmentId, enContent, isContent}>} segments
 * @param {string|null} bookSlug
 * @returns {Array<{headwordId, english, expected, count, segments: string[]}>}
 */
function buildModuleTerminologyReport(segments, bookSlug = null, chapter) {
  const res = findTermsInSegments(segments, bookSlug, chapter);
  const byTerm = new Map();
  for (const [segId, { issues }] of Object.entries(res)) {
    for (const issue of issues) {
      if (!byTerm.has(issue.headwordId)) {
        byTerm.set(issue.headwordId, {
          headwordId: issue.headwordId,
          english: issue.english,
          expected: issue.expected,
          segments: [],
        });
      }
      byTerm.get(issue.headwordId).segments.push(segId);
    }
  }
  return Array.from(byTerm.values())
    .map((t) => ({ ...t, count: t.segments.length }))
    .sort((a, b) => b.count - a.count);
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
 * Build a case-insensitive, Unicode-aware whole-word regex matching any of the
 * given forms. Uses \p{L}/\p{N} lookarounds instead of \b so Icelandic special
 * letters (þ æ ö ó á í ú ð) form proper word boundaries. Longest form first to
 * avoid partial matches. Returns a never-matching regex for an empty list.
 */
function wholeWordRegex(forms) {
  const alts = forms.filter(Boolean).map(escapeRegex);
  if (alts.length === 0) return /(?!)/;
  alts.sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * Build a regex that matches the base Icelandic form or any inflected form.
 */
function buildInflectionRegex(icelandic, inflections) {
  return wholeWordRegex([icelandic, ...inflections]);
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
  batchApproveTranslations,
  disputeTranslation,
  disputeTerm,
  rejectTranslation,
  addDiscussion,
  getTranslationReviewQueue,
  getReviewQueueCounts,
  getBookSubject,

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
  normalizeChapterArg,
  findTermsInSegments,
  translationTier,
  checkSegmentConsistency,
  buildModuleTerminologyReport,
  exportBookGlossary,
  getAddedTerms,
  proposeMinedTerm,

  // Constants
  TERM_STATUSES,
  TERM_SOURCES,
  PROJECT_ORIGINATED_SOURCES,
  IN_IDORDABANKINN_SOURCES,
  SUBJECTS,

  // Test injection
  _setTestDb,
};
