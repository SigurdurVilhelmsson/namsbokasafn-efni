/**
 * Terminology Routes — Multi-Subject Domain Model
 *
 * Handles terminology database operations:
 * - Search and lookup headwords with translations
 * - Create/update headwords and translations
 * - Approve/dispute translations
 * - Import from CSV/Excel
 * - Review board workflow
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const terminology = require('../services/terminologyService');
const activityLog = require('../services/activityLog');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

// ============================================================================
// SEARCH AND LOOKUP
// ============================================================================

/**
 * GET /api/terminology
 * Search headwords with optional filters
 *
 * Query params:
 *   q: Search query (matches English or Icelandic)
 *   subject: Filter by subject domain (chemistry, biology, etc.)
 *   bookSlug: Shorthand — resolves to the book's primary subject
 *   status: Filter by translation status
 *   limit: Max results (default 50)
 *   offset: Pagination offset
 */
router.get('/', requireAuth, (req, res) => {
  const { q, subject, bookSlug, status, limit, offset } = req.query;

  try {
    // bookSlug is a convenience alias: resolve to subject
    const effectiveSubject = subject || resolveBookSubject(bookSlug);

    const result = terminology.searchTerms(q, {
      subject: effectiveSubject || undefined,
      status,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Search terms error');
    res.status(500).json({ error: 'Failed to search terms', message: err.message });
  }
});

/**
 * GET /api/terminology/lookup
 * Fast lookup for editor popup
 *
 * Query params:
 *   q: Search query (required, min 2 chars)
 *   bookSlug: Book context for domain priority ranking
 */
router.get('/lookup', requireAuth, (req, res) => {
  const { q, bookSlug } = req.query;

  if (!q || q.length < 2) {
    return res.json({ terms: [] });
  }

  try {
    const terms = terminology.lookupTerm(q, bookSlug || null);
    res.json({ terms });
  } catch (err) {
    log.error({ err }, 'Terminology lookup error');
    res.status(500).json({ error: 'Lookup failed', message: err.message });
  }
});

/**
 * GET /api/terminology/stats
 * Get terminology statistics
 *
 * Query params:
 *   subject: Filter stats by subject domain
 */
router.get('/stats', requireAuth, (req, res) => {
  try {
    const stats = terminology.getStats(req.query.subject || null);
    res.json(stats);
  } catch (err) {
    log.error({ err }, 'Terminology stats error');
    res.status(500).json({ error: 'Failed to get statistics', message: err.message });
  }
});

/**
 * GET /api/terminology/review-queue
 * Get headwords with translations needing review (disputed/needs_review)
 */
router.get('/review-queue', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { subject, limit, offset } = req.query;

  try {
    const terms = terminology.getReviewQueue({
      subject: subject || undefined,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });

    res.json({ terms });
  } catch (err) {
    log.error({ err }, 'Review queue error');
    res.status(500).json({ error: 'Failed to get review queue', message: err.message });
  }
});

/**
 * GET /api/terminology/subjects
 * Get available subjects and constants
 */
router.get('/subjects', requireAuth, (req, res) => {
  res.json({
    subjects: terminology.SUBJECTS,
    statuses: terminology.TERM_STATUSES,
    sources: terminology.TERM_SOURCES,
  });
});

// Keep old endpoint for backwards compatibility
router.get('/categories', requireAuth, (req, res) => {
  res.json({
    subjects: terminology.SUBJECTS,
    statuses: terminology.TERM_STATUSES,
    sources: terminology.TERM_SOURCES,
  });
});

// ============================================================================
// EXPORT (must be before /:id to avoid route shadowing)
// ============================================================================

/**
 * GET /api/terminology/export
 * Export the glossary as JSON or CSV
 *
 * Query params:
 *   subject: Filter by subject domain
 *   bookSlug: Shorthand for subject
 *   status: Filter by status
 *   q: Search query
 *   format: 'json' or 'csv' (default: json)
 */
router.get('/export', requireAuth, (req, res) => {
  const { format = 'json', q, subject, bookSlug, status } = req.query;

  const effectiveSubject = subject || resolveBookSubject(bookSlug);

  try {
    const result = terminology.searchTerms(q || '', {
      subject: effectiveSubject || undefined,
      status,
      limit: 10000,
      offset: 0,
    });

    const terms = result.terms;

    if (format === 'csv') {
      const header = 'english,pos,definition_en,icelandic,definition_is,status,source,subjects,notes';
      const lines = [header];

      for (const hw of terms) {
        for (const tr of hw.translations || []) {
          lines.push(
            [
              csvEscapeField(hw.english),
              csvEscapeField(hw.pos || ''),
              csvEscapeField(hw.definitionEn || ''),
              csvEscapeField(tr.icelandic),
              csvEscapeField(tr.definitionIs || ''),
              tr.status,
              tr.source,
              csvEscapeField((tr.subjects || []).join('; ')),
              csvEscapeField(tr.notes || ''),
            ].join(',')
          );
        }
      }

      const csv = lines.join('\n') + '\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="glossary-export.csv"');
      return res.send(csv);
    }

    // JSON format
    res.json({
      generated: new Date().toISOString(),
      stats: {
        headwords: terms.length,
        translations: terms.reduce((n, hw) => n + (hw.translations || []).length, 0),
      },
      terms,
    });
  } catch (err) {
    log.error({ err }, 'Glossary export error');
    res.status(500).json({ error: 'Failed to export glossary', message: err.message });
  }
});

function csvEscapeField(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================================================
// HEADWORD CRUD
// ============================================================================

/**
 * GET /api/terminology/:id
 * Get a single headword with all translations and discussions
 */
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const term = terminology.getHeadword(parseInt(id, 10));

    if (!term) {
      return res.status(404).json({ error: 'Headword not found' });
    }

    res.json({ term });
  } catch (err) {
    log.error({ err }, 'Get headword error');
    res.status(500).json({ error: 'Failed to get headword', message: err.message });
  }
});

/**
 * POST /api/terminology
 * Create a new headword with optional initial translation
 *
 * Body:
 *   english: English term (required)
 *   icelandic: Icelandic translation (optional — omit for placeholder)
 *   pos: Part of speech
 *   definitionEn: English definition
 *   definitionIs: Icelandic definition
 *   notes: Additional notes
 *   source: Term source
 *   subjects: Array of subject tags for the translation
 */
router.post('/', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { english, icelandic, pos, definitionEn, definitionIs, notes, source, subjects } = req.body;

  if (!english) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'english is required',
    });
  }

  try {
    const term = terminology.createTerm(
      { english, icelandic, pos, definitionEn, definitionIs, notes, source, subjects },
      req.user.id,
      req.user.name
    );

    activityLog.log({
      type: 'create_term',
      userId: req.user.id,
      username: req.user.username,
      description: `Created headword: ${english}${icelandic ? ` → ${icelandic}` : ' (placeholder)'}`,
      metadata: { entityId: term.id, subjects },
    });

    res.status(201).json({ success: true, term });
  } catch (err) {
    log.error({ err }, 'Create headword error');
    res.status(err.message.includes('already exists') ? 409 : 500).json({
      error: 'Failed to create headword',
      message: err.message,
    });
  }
});

/**
 * PUT /api/terminology/:id
 * Update a headword's fields (english, pos, definitionEn)
 */
router.put('/:id', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const term = terminology.updateHeadword(parseInt(id, 10), req.body);

    activityLog.log({
      type: 'update_headword',
      userId: req.user.id,
      username: req.user.username,
      description: `Updated headword: ${term.english}`,
      metadata: { entityId: term.id, updates: Object.keys(req.body) },
    });

    res.json({ success: true, term });
  } catch (err) {
    log.error({ err }, 'Update headword error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to update headword',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/terminology/:id
 * Delete a headword and all its translations (ADMIN only)
 */
router.delete('/:id', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { id } = req.params;

  try {
    const result = terminology.deleteHeadword(parseInt(id, 10));

    if (result.success) {
      activityLog.log({
        type: 'delete_headword',
        userId: req.user.id,
        username: req.user.username,
        description: `Deleted headword ID ${id}`,
      });
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Delete headword error');
    res.status(500).json({ error: 'Failed to delete headword', message: err.message });
  }
});

// ============================================================================
// TRANSLATION CRUD
// ============================================================================

/**
 * POST /api/terminology/:headwordId/translations
 * Add a translation to a headword
 *
 * Body:
 *   icelandic: Icelandic translation (required)
 *   definitionIs: Icelandic definition
 *   inflections: Array of inflected forms
 *   notes: Notes
 *   source: Source
 *   subjects: Array of subject tags
 */
router.post('/:headwordId/translations', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { headwordId } = req.params;
  const { icelandic, definitionIs, inflections, notes, source, subjects } = req.body;

  if (!icelandic) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'icelandic is required',
    });
  }

  try {
    const translation = terminology.addTranslation(
      parseInt(headwordId, 10),
      { icelandic, definitionIs, inflections, notes, source, subjects },
      req.user.id,
      req.user.name
    );

    activityLog.log({
      type: 'add_translation',
      userId: req.user.id,
      username: req.user.username,
      description: `Added translation: ${icelandic} (headword #${headwordId})`,
      metadata: { headwordId: parseInt(headwordId, 10), translationId: translation.id, subjects },
    });

    res.status(201).json({ success: true, translation });
  } catch (err) {
    log.error({ err }, 'Add translation error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to add translation',
      message: err.message,
    });
  }
});

/**
 * PUT /api/terminology/translations/:id
 * Update a translation
 */
router.put('/translations/:id', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const translation = terminology.updateTranslation(parseInt(id, 10), req.body);

    activityLog.log({
      type: 'update_translation',
      userId: req.user.id,
      username: req.user.username,
      description: `Updated translation #${id}`,
      metadata: { translationId: parseInt(id, 10), updates: Object.keys(req.body) },
    });

    res.json({ success: true, translation });
  } catch (err) {
    log.error({ err }, 'Update translation error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to update translation',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/terminology/translations/:id
 * Delete a single translation (ADMIN only)
 */
router.delete('/translations/:id', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { id } = req.params;

  try {
    const result = terminology.deleteTranslation(parseInt(id, 10));

    if (result.success) {
      activityLog.log({
        type: 'delete_translation',
        userId: req.user.id,
        username: req.user.username,
        description: `Deleted translation #${id}`,
      });
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Delete translation error');
    res.status(500).json({ error: 'Failed to delete translation', message: err.message });
  }
});

// ============================================================================
// WORKFLOW (APPROVE/DISPUTE on translations)
// ============================================================================

/**
 * POST /api/terminology/translations/:id/approve
 * Approve a translation (HEAD_EDITOR+)
 */
router.post(
  '/translations/:id/approve',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  (req, res) => {
    const { id } = req.params;

    try {
      const term = terminology.approveTranslation(parseInt(id, 10), req.user.id, req.user.name);

      activityLog.log({
        type: 'approve_translation',
        userId: req.user.id,
        username: req.user.username,
        description: `Approved translation #${id} for "${term.english}"`,
        metadata: { headwordId: term.id, translationId: parseInt(id, 10) },
      });

      res.json({ success: true, term });
    } catch (err) {
      log.error({ err }, 'Approve translation error');
      res.status(err.message.includes('not found') ? 404 : 500).json({
        error: 'Failed to approve translation',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/terminology/translations/:id/dispute
 * Dispute a translation (escalate to review board)
 *
 * Body:
 *   comment: Reason for dispute (required)
 *   proposedTranslation: Alternative suggestion (optional)
 */
router.post(
  '/translations/:id/dispute',
  requireAuth,
  requireRole(ROLES.EDITOR),
  (req, res) => {
    const { id } = req.params;
    const { comment, proposedTranslation } = req.body;

    if (!comment) {
      return res.status(400).json({
        error: 'Missing comment',
        message: 'A comment explaining the dispute is required',
      });
    }

    try {
      const term = terminology.disputeTranslation(
        parseInt(id, 10),
        comment,
        req.user.id,
        req.user.name,
        proposedTranslation
      );

      activityLog.log({
        type: 'dispute_translation',
        userId: req.user.id,
        username: req.user.username,
        description: `Disputed translation #${id} — ${comment}`,
        metadata: { headwordId: term.id, translationId: parseInt(id, 10) },
      });

      res.json({ success: true, term });
    } catch (err) {
      log.error({ err }, 'Dispute translation error');
      res.status(err.message.includes('not found') ? 404 : 500).json({
        error: 'Failed to dispute translation',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/terminology/:id/discuss
 * Add a discussion comment to a headword
 *
 * Body:
 *   comment: Comment text (required)
 *   proposedTranslation: Alternative suggestion (optional)
 */
router.post('/:id/discuss', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { id } = req.params;
  const { comment, proposedTranslation } = req.body;

  if (!comment) {
    return res.status(400).json({
      error: 'Missing comment',
      message: 'Comment text is required',
    });
  }

  try {
    const discussion = terminology.addDiscussion(
      parseInt(id, 10),
      comment,
      req.user.id,
      req.user.name,
      proposedTranslation
    );

    res.json({ success: true, discussion });
  } catch (err) {
    log.error({ err }, 'Add discussion error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to add discussion',
      message: err.message,
    });
  }
});

// ============================================================================
// IMPORT
// ============================================================================

/**
 * POST /api/terminology/import/csv
 * Import terms from CSV file
 *
 * Query params:
 *   subjects: Comma-separated subject tags (e.g., "chemistry,physics")
 *   overwrite: Whether to overwrite existing non-approved terms
 */
router.post(
  '/import/csv',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { overwrite, subjects: subjectsParam } = req.query;
    const subjects = subjectsParam ? subjectsParam.split(',').map(s => s.trim()) : [];

    try {
      const tempPath = path.join('/tmp', `terminology-import-${Date.now()}.csv`);
      fs.writeFileSync(tempPath, req.file.buffer);

      const result = terminology.importFromCSV(tempPath, req.user.id, req.user.name, {
        subjects,
        overwrite: overwrite === 'true',
      });

      fs.unlinkSync(tempPath);

      activityLog.log({
        type: 'import_terminology_csv',
        userId: req.user.id,
        username: req.user.username,
        description: `Imported ${result.added} terms from CSV`,
        metadata: result,
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'CSV import error');
      res.status(500).json({ error: 'Failed to import CSV', message: err.message });
    }
  }
);

/**
 * POST /api/terminology/import/glossary
 * Import glossary terms with definition merging and placeholder support.
 *
 * Query params:
 *   bookSlug: Book slug (required — determines subject tags)
 */
router.post(
  '/import/glossary',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { bookSlug } = req.query;
    if (!bookSlug) {
      return res.status(400).json({ error: 'bookSlug is required' });
    }

    const bookSubject = resolveBookSubject(bookSlug);
    const subjects = bookSubject ? [bookSubject] : [];

    let csvParseSync;
    try {
      csvParseSync = require('csv-parse/sync').parse;
    } catch {
      return res.status(500).json({ error: 'csv-parse package not installed' });
    }

    try {
      const content = req.file.buffer.toString('utf8');
      const records = csvParseSync(content, { columns: true, skip_empty_lines: true, trim: true });

      const terms = records.map((r) => ({
        english: r.english || r.English || r.en,
        icelandic: r.icelandic || r.Icelandic || r.is || '',
        notes: r.notes || r.Notes || null,
        definition_en: r.definition_en || r.Definition_EN || null,
        definition_is: r.definition_is || r.Definition_IS || null,
      }));

      const result = terminology.importGlossaryTerms(terms, req.user.id, req.user.name, {
        subjects,
        source: 'openstax-glossary',
      });

      activityLog.log({
        type: 'import_terminology_glossary',
        userId: req.user.id,
        username: req.user.username,
        description: `Glossary import: ${result.added} added, ${result.enriched} enriched`,
        metadata: result,
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Glossary import error');
      res.status(500).json({ error: 'Failed to import glossary', message: err.message });
    }
  }
);

/**
 * POST /api/terminology/import/excel
 * Import terms from Excel file
 */
router.post(
  '/import/excel',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sheetName, subjects: subjectsParam } = req.query;
    const subjects = subjectsParam ? subjectsParam.split(',').map(s => s.trim()) : [];

    try {
      const result = await terminology.importFromExcel(
        req.file.buffer,
        req.user.id,
        req.user.name,
        { subjects, sheetName }
      );

      activityLog.log({
        type: 'import_terminology_excel',
        userId: req.user.id,
        username: req.user.username,
        description: `Imported ${result.added} terms from Excel`,
        metadata: result,
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Excel import error');
      res.status(500).json({ error: 'Failed to import Excel', message: err.message });
    }
  }
);

/**
 * POST /api/terminology/import/key-terms
 * Extract terms from key-terms markdown files
 *
 * Body:
 *   bookSlug: Book slug (required)
 *   chapterNum: Chapter number (optional)
 */
router.post('/import/key-terms', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { bookSlug, chapterNum } = req.body;

  if (!bookSlug) {
    return res.status(400).json({ error: 'Missing bookSlug' });
  }

  try {
    const result = terminology.importFromKeyTerms(
      bookSlug,
      chapterNum ? parseInt(chapterNum, 10) : null,
      req.user.id,
      req.user.name
    );

    activityLog.log({
      type: 'import_terminology_keyterms',
      userId: req.user.id,
      username: req.user.username,
      description: `Imported ${result.added} key terms from ${bookSlug}`,
      metadata: { bookSlug, chapterNum, ...result },
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Key-terms import error');
    res.status(500).json({ error: 'Failed to import key terms', message: err.message });
  }
});

/**
 * POST /api/terminology/import/existing-glossary
 * Import the existing terminology-en-is.csv from the books directory
 */
router.post(
  '/import/existing-glossary',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  (req, res) => {
    const { bookSlug } = req.body;

    if (!bookSlug) {
      return res.status(400).json({ error: 'Missing bookSlug' });
    }

    const glossaryPath = path.join(__dirname, '..', '..', 'books', bookSlug, 'glossary', 'terminology-en-is.csv');

    if (!fs.existsSync(glossaryPath)) {
      return res.status(404).json({
        error: 'Glossary not found',
        message: `No glossary found for book '${bookSlug}'`,
      });
    }

    const bookSubject = resolveBookSubject(bookSlug);
    const subjects = bookSubject ? [bookSubject] : [];

    try {
      const result = terminology.importFromCSV(glossaryPath, req.user.id, req.user.name, {
        subjects,
        overwrite: false,
      });

      activityLog.log({
        type: 'import_terminology_glossary',
        userId: req.user.id,
        username: req.user.username,
        description: `Imported ${result.added} terms from ${bookSlug} glossary`,
        metadata: { bookSlug, ...result },
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, 'Glossary import error');
      res.status(500).json({ error: 'Failed to import glossary', message: err.message });
    }
  }
);

// ============================================================================
// CONSISTENCY CHECK
// ============================================================================

/**
 * POST /api/terminology/check-consistency
 * Check text for terminology consistency issues
 *
 * Body:
 *   segments: Array of { segmentId, enContent, isContent }
 *   bookSlug: Book slug for domain priority
 */
router.post('/check-consistency', requireAuth, (req, res) => {
  const { segments, bookSlug, content, sourceContent } = req.body;

  try {
    // New API: array of segments
    if (segments && Array.isArray(segments)) {
      const result = terminology.findTermsInSegments(segments, bookSlug || null);
      return res.json({ success: true, result });
    }

    // Legacy single-content API
    if (!content) {
      return res.status(400).json({
        error: 'Missing content',
        message: 'Either segments array or content string is required',
      });
    }

    const legacySegments = [
      { segmentId: 'single', enContent: sourceContent || '', isContent: content },
    ];
    const result = terminology.findTermsInSegments(legacySegments, bookSlug || null);

    const segResult = result.single || { matches: [], issues: [] };
    res.json({
      success: true,
      issues: segResult.issues,
      stats: {
        termsChecked: segResult.matches.length,
        issuesFound: segResult.issues.length,
      },
    });
  } catch (err) {
    log.error({ err }, 'Consistency check error');
    res.status(500).json({ error: 'Failed to check consistency', message: err.message });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve a book slug to its primary subject domain.
 * Returns null if not found.
 */
function resolveBookSubject(bookSlug) {
  if (!bookSlug) return null;

  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
  if (!fs.existsSync(dbPath)) return null;

  const db = new Database(dbPath);
  try {
    const row = db
      .prepare(`
        SELECT bsm.primary_subject
        FROM book_subject_mapping bsm
        JOIN registered_books rb ON rb.id = bsm.book_id
        WHERE rb.slug = ?
      `)
      .get(bookSlug);
    db.close();
    return row ? row.primary_subject : null;
  } catch {
    try { db.close(); } catch { /* ignore */ }
    return null;
  }
}

module.exports = router;
