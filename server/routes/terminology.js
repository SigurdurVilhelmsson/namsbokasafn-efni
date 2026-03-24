/**
 * Terminology Routes
 *
 * Handles terminology database operations:
 * - Search and lookup terms
 * - Create/update terms
 * - Approve/dispute terms
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

/**
 * Resolve a bookSlug query param to a numeric book ID.
 * Accepts either a numeric bookId or a string bookSlug.
 * Returns the numeric ID or undefined if not specified.
 */
function resolveBookId(query) {
  const { bookId, bookSlug } = query;
  if (bookId) return parseInt(bookId, 10);
  if (!bookSlug) return undefined;

  // Look up slug in registered_books
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
  if (!require('fs').existsSync(dbPath)) return undefined;
  const db = new Database(dbPath);
  try {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
    db.close();
    return book ? book.id : undefined;
  } catch {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    return undefined;
  }
}

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
 * List and search terms
 *
 * Query params:
 *   q: Search query
 *   bookId: Filter by book ID
 *   bookSlug: Filter by book slug (alternative to bookId)
 *   includeGlobal: Include global terms alongside book terms (default: false)
 *   category: Filter by category
 *   status: Filter by status
 *   limit: Max results (default 50)
 *   offset: Pagination offset
 */
router.get('/', requireAuth, (req, res) => {
  const { q, category, status, includeGlobal, limit, offset } = req.query;

  try {
    const result = terminology.searchTerms(q, {
      bookId: resolveBookId(req.query),
      includeGlobal: includeGlobal === 'true',
      category,
      status,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Search terms error');
    res.status(500).json({
      error: 'Failed to search terms',
      message: err.message,
    });
  }
});

/**
 * GET /api/terminology/lookup
 * Fast lookup for editor popup
 *
 * Query params:
 *   q: Search query (required, min 2 chars)
 *   bookId: Optional book context
 */
router.get('/lookup', requireAuth, (req, res) => {
  const { q, bookId } = req.query;

  if (!q || q.length < 2) {
    return res.json({ terms: [] });
  }

  try {
    const terms = terminology.lookupTerm(q, bookId ? parseInt(bookId, 10) : null);
    res.json({ terms });
  } catch (err) {
    log.error({ err }, 'Terminology lookup error');
    res.status(500).json({
      error: 'Lookup failed',
      message: err.message,
    });
  }
});

/**
 * GET /api/terminology/stats
 * Get terminology statistics
 */
router.get('/stats', requireAuth, (req, res) => {
  try {
    const stats = terminology.getStats(resolveBookId(req.query) || null);
    res.json(stats);
  } catch (err) {
    log.error({ err }, 'Terminology stats error');
    res.status(500).json({
      error: 'Failed to get statistics',
      message: err.message,
    });
  }
});

/**
 * GET /api/terminology/review-queue
 * Get terms requiring review (disputed/needs_review)
 */
router.get('/review-queue', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { bookId, limit, offset } = req.query;

  try {
    const terms = terminology.getReviewQueue({
      bookId: bookId ? parseInt(bookId, 10) : undefined,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0),
    });

    res.json({ terms });
  } catch (err) {
    log.error({ err }, 'Review queue error');
    res.status(500).json({
      error: 'Failed to get review queue',
      message: err.message,
    });
  }
});

/**
 * GET /api/terminology/categories
 * Get available categories
 */
router.get('/categories', requireAuth, (req, res) => {
  res.json({
    categories: terminology.TERM_CATEGORIES,
    statuses: terminology.TERM_STATUSES,
    sources: terminology.TERM_SOURCES,
  });
});

// ============================================================================
// EXPORT (must be before /:id to avoid route shadowing)
// ============================================================================

/**
 * GET /api/terminology/export
 * Export the glossary as JSON or CSV with optional filters
 *
 * Query params:
 *   bookId: Book ID (optional — omit for all terms)
 *   bookSlug: Book slug alternative to bookId
 *   includeGlobal: Include global terms (default: false)
 *   q: Search query (optional)
 *   category: Filter by category (optional)
 *   status: Filter by status (optional)
 *   format: 'json' or 'csv' (default: json)
 */
router.get('/export', requireAuth, (req, res) => {
  const { format = 'json', q, category, status, includeGlobal } = req.query;

  const bookId = resolveBookId(req.query);

  try {
    const result = terminology.searchTerms(q || '', {
      bookId,
      includeGlobal: includeGlobal === 'true',
      category,
      status,
      limit: 10000,
      offset: 0,
    });

    const terms = result.terms;

    if (format === 'csv') {
      const header =
        'english,icelandic,pos,definition_en,definition_is,status,source,alternatives,category,chapter,notes';
      const lines = [header];

      for (const term of terms) {
        const alts = (term.alternatives || [])
          .map((a) => (typeof a === 'string' ? a : a.term))
          .join('; ');
        lines.push(
          [
            csvEscapeField(term.english),
            csvEscapeField(term.icelandic),
            csvEscapeField(term.pos || ''),
            csvEscapeField(term.definitionEn || ''),
            csvEscapeField(term.definitionIs || ''),
            term.status,
            term.source,
            csvEscapeField(alts),
            term.category,
            term.sourceChapter || '',
            csvEscapeField(term.notes || ''),
          ].join(',')
        );
      }

      const csv = lines.join('\n') + '\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="glossary-export.csv"');
      return res.send(csv);
    }

    // JSON format (default)
    res.json({
      generated: new Date().toISOString(),
      stats: {
        total: terms.length,
        approved: terms.filter((t) => t.status === 'approved').length,
        proposed: terms.filter((t) => t.status === 'proposed').length,
        needs_review: terms.filter((t) => t.status === 'needs_review').length,
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

/**
 * GET /api/terminology/:id
 * Get a single term with discussions
 */
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const term = terminology.getTerm(parseInt(id, 10));

    if (!term) {
      return res.status(404).json({
        error: 'Term not found',
      });
    }

    res.json({ term });
  } catch (err) {
    log.error({ err }, 'Get term error');
    res.status(500).json({
      error: 'Failed to get term',
      message: err.message,
    });
  }
});

// ============================================================================
// CREATE AND UPDATE
// ============================================================================

/**
 * POST /api/terminology
 * Create a new term (proposed status)
 *
 * Body:
 *   english: English term (required)
 *   icelandic: Icelandic translation (required)
 *   alternatives: Array of alternative translations
 *   category: Term category
 *   notes: Additional notes
 *   source: Term source
 *   sourceChapter: Chapter number if from glossary
 *   bookId: Book ID (null for global term)
 */
router.post('/', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { english, icelandic, alternatives, category, notes, source, sourceChapter, bookId } =
    req.body;

  if (!english || !icelandic) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'english and icelandic are required',
    });
  }

  try {
    const term = terminology.createTerm(
      { english, icelandic, alternatives, category, notes, source, sourceChapter, bookId },
      req.user.id,
      req.user.name
    );

    // Log activity
    activityLog.log({
      type: 'create_term',
      userId: req.user.id,
      username: req.user.username,
      description: `Created term: ${english} → ${icelandic}`,
      metadata: { entityId: term.id, category },
    });

    res.status(201).json({
      success: true,
      term,
    });
  } catch (err) {
    log.error({ err }, 'Create term error');
    res.status(err.message.includes('already exists') ? 409 : 500).json({
      error: 'Failed to create term',
      message: err.message,
    });
  }
});

/**
 * PUT /api/terminology/:id
 * Update a term
 */
router.put('/:id', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const term = terminology.updateTerm(parseInt(id, 10), req.body);

    activityLog.log({
      type: 'update_term',
      userId: req.user.id,
      username: req.user.username,
      description: `Updated term: ${term.english}`,
      metadata: { entityId: term.id, updates: Object.keys(req.body) },
    });

    res.json({
      success: true,
      term,
    });
  } catch (err) {
    log.error({ err }, 'Update term error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to update term',
      message: err.message,
    });
  }
});

/**
 * DELETE /api/terminology/:id
 * Delete a term (ADMIN only)
 */
router.delete('/:id', requireAuth, requireRole(ROLES.ADMIN), (req, res) => {
  const { id } = req.params;

  try {
    const result = terminology.deleteTerm(parseInt(id, 10));

    if (result.success) {
      activityLog.log({
        type: 'delete_term',
        userId: req.user.id,
        username: req.user.username,
        description: `Deleted term ID ${id}`,
      });
    }

    res.json(result);
  } catch (err) {
    log.error({ err }, 'Delete term error');
    res.status(500).json({
      error: 'Failed to delete term',
      message: err.message,
    });
  }
});

// ============================================================================
// WORKFLOW (APPROVE/DISPUTE)
// ============================================================================

/**
 * POST /api/terminology/:id/approve
 * Approve a term (HEAD_EDITOR+)
 */
router.post('/:id/approve', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { id } = req.params;

  try {
    const term = terminology.approveTerm(parseInt(id, 10), req.user.id, req.user.name);

    activityLog.log({
      type: 'approve_term',
      userId: req.user.id,
      username: req.user.username,
      description: `Approved term: ${term.english} → ${term.icelandic}`,
      metadata: { entityId: term.id },
    });

    res.json({
      success: true,
      term,
    });
  } catch (err) {
    log.error({ err }, 'Approve term error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to approve term',
      message: err.message,
    });
  }
});

/**
 * POST /api/terminology/:id/dispute
 * Dispute a term (escalate to review board)
 *
 * Body:
 *   comment: Reason for dispute (required)
 *   proposedTranslation: Alternative suggestion (optional)
 */
router.post('/:id/dispute', requireAuth, requireRole(ROLES.EDITOR), (req, res) => {
  const { id } = req.params;
  const { comment, proposedTranslation } = req.body;

  if (!comment) {
    return res.status(400).json({
      error: 'Missing comment',
      message: 'A comment explaining the dispute is required',
    });
  }

  try {
    const term = terminology.disputeTerm(
      parseInt(id, 10),
      comment,
      req.user.id,
      req.user.name,
      proposedTranslation
    );

    activityLog.log({
      type: 'dispute_term',
      userId: req.user.id,
      username: req.user.username,
      description: `Disputed term: ${term.english} — ${comment}`,
      metadata: { entityId: term.id },
    });

    res.json({
      success: true,
      term,
    });
  } catch (err) {
    log.error({ err }, 'Dispute term error');
    res.status(err.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to dispute term',
      message: err.message,
    });
  }
});

/**
 * POST /api/terminology/:id/discuss
 * Add a discussion comment
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

    res.json({
      success: true,
      discussion,
    });
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
 *   bookId: Optional book ID
 *   overwrite: Whether to overwrite existing non-approved terms
 */
router.post(
  '/import/csv',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  upload.single('file'),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    const { overwrite } = req.query;
    const bookId = resolveBookId(req.query);

    try {
      // Write buffer to temp file
      const tempPath = path.join('/tmp', `terminology-import-${Date.now()}.csv`);
      fs.writeFileSync(tempPath, req.file.buffer);

      const result = terminology.importFromCSV(tempPath, req.user.id, req.user.name, {
        bookId: bookId || null,
        overwrite: overwrite === 'true',
      });

      // Clean up temp file
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
      res.status(500).json({
        error: 'Failed to import CSV',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/terminology/import/glossary
 * Import glossary terms with definition merging and placeholder support.
 * Enriches existing approved terms with definitions without changing their status.
 * Imports terms without icelandic as placeholders (status: proposed).
 *
 * Query params:
 *   bookSlug: Book slug (required)
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

    const bookId = resolveBookId(req.query);
    if (!bookId) {
      return res.status(400).json({ error: 'bookSlug is required' });
    }

    let csvParse;
    try {
      csvParse = require('csv-parse/sync').parse;
    } catch {
      return res.status(500).json({ error: 'csv-parse package not installed' });
    }

    try {
      const content = req.file.buffer.toString('utf8');
      const records = csvParse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const terms = records.map((r) => ({
        english: r.english || r.English || r.en,
        icelandic: r.icelandic || r.Icelandic || r.is || '',
        category: r.category || r.Category || 'other',
        notes: r.notes || r.Notes || null,
        definition_en: r.definition_en || r.Definition_EN || null,
        definition_is: r.definition_is || r.Definition_IS || null,
      }));

      const result = terminology.importGlossaryTerms(terms, req.user.id, req.user.name, {
        bookId,
        source: 'openstax-glossary',
      });

      activityLog.log({
        type: 'import_terminology_glossary',
        userId: req.user.id,
        username: req.user.username,
        description: `Glossary import: ${result.added} added, ${result.enriched} enriched, ${result.updated} updated`,
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
 * Import terms from Excel file (Chemistry Association format)
 */
router.post(
  '/import/excel',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
      });
    }

    const { sheetName } = req.query;
    const bookId = resolveBookId(req.query);

    try {
      const result = await terminology.importFromExcel(
        req.file.buffer,
        req.user.id,
        req.user.name,
        {
          bookId: bookId || null,
          sheetName,
        }
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
      res.status(500).json({
        error: 'Failed to import Excel',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/terminology/import/key-terms
 * Extract terms from key-terms markdown files
 *
 * Body:
 *   bookSlug: Book slug (required)
 *   chapterNum: Chapter number (optional, extracts all if not specified)
 */
router.post('/import/key-terms', requireAuth, requireRole(ROLES.HEAD_EDITOR), (req, res) => {
  const { bookSlug, chapterNum } = req.body;

  if (!bookSlug) {
    return res.status(400).json({
      error: 'Missing bookSlug',
    });
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
    res.status(500).json({
      error: 'Failed to import key terms',
      message: err.message,
    });
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
      return res.status(400).json({
        error: 'Missing bookSlug',
      });
    }

    const glossaryPath = path.join(
      __dirname,
      '..',
      '..',
      'books',
      bookSlug,
      'glossary',
      'terminology-en-is.csv'
    );

    if (!fs.existsSync(glossaryPath)) {
      return res.status(404).json({
        error: 'Glossary not found',
        message: `No glossary found for book '${bookSlug}'`,
      });
    }

    try {
      const result = terminology.importFromCSV(glossaryPath, req.user.id, req.user.name, {
        bookId: null,
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
      res.status(500).json({
        error: 'Failed to import glossary',
        message: err.message,
      });
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
 *   content: The translated text to check
 *   sourceContent: The source (English) text
 *   bookId: Optional book ID for book-specific terms
 */
router.post('/check-consistency', requireAuth, (req, res) => {
  const { content, sourceContent, bookId } = req.body;

  if (!content) {
    return res.status(400).json({
      error: 'Missing content',
      message: 'Content is required for consistency check',
    });
  }

  try {
    // Get all approved terms for this book
    const termsResult = terminology.searchTerms('', {
      bookId: bookId ? parseInt(bookId, 10) : undefined,
      status: 'approved',
      limit: 1000,
    });

    const issues = [];
    const termMap = new Map(); // english -> icelandic (approved)

    // Build map of approved translations
    for (const term of termsResult.terms) {
      if (term.english && term.icelandic) {
        const enLower = term.english.toLowerCase();
        if (!termMap.has(enLower)) {
          termMap.set(enLower, {
            approved: term.icelandic,
            category: term.category,
            id: term.id,
          });
        }
      }
    }

    // Check source content for English terms and verify translations
    if (sourceContent) {
      for (const [enTerm, termInfo] of termMap) {
        // Check if EN term exists in source
        const enRegex = new RegExp(`\\b${escapeRegex(enTerm)}\\b`, 'gi');
        const enMatches = sourceContent.match(enRegex);

        if (enMatches && enMatches.length > 0) {
          // Check if approved IS term exists in content
          const isRegex = new RegExp(`\\b${escapeRegex(termInfo.approved)}\\b`, 'gi');
          const isMatches = content.match(isRegex);

          if (!isMatches || isMatches.length === 0) {
            // The approved Icelandic term is missing
            // Check for other translations of the same word
            const alternatives = termsResult.terms
              .filter(
                (t) =>
                  t.english &&
                  t.english.toLowerCase() === enTerm &&
                  t.icelandic !== termInfo.approved
              )
              .map((t) => t.icelandic);

            // Check if any alternative is used
            let alternativeUsed = null;
            for (const alt of alternatives) {
              const altRegex = new RegExp(`\\b${escapeRegex(alt)}\\b`, 'gi');
              if (content.match(altRegex)) {
                alternativeUsed = alt;
                break;
              }
            }

            if (alternativeUsed) {
              issues.push({
                type: 'inconsistent_translation',
                severity: 'warning',
                enTerm: enTerm,
                expectedTerm: termInfo.approved,
                foundTerm: alternativeUsed,
                message: `"${enTerm}" ætti að vera "${termInfo.approved}" (ekki "${alternativeUsed}")`,
                termId: termInfo.id,
              });
            } else {
              issues.push({
                type: 'missing_term',
                severity: 'info',
                enTerm: enTerm,
                expectedTerm: termInfo.approved,
                message: `Hugtakið "${enTerm}" → "${termInfo.approved}" fannst ekki í þýðingunni`,
                termId: termInfo.id,
              });
            }
          }
        }
      }
    }

    // Check for terms that appear inconsistently within the text itself
    const wordFreq = new Map();
    const words = content.match(/[\wáéíóúýþæöðÁÉÍÓÚÝÞÆÖÐ]+/g) || [];

    for (const word of words) {
      const lower = word.toLowerCase();
      if (lower.length >= 4) {
        // Skip short words
        wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
      }
    }

    res.json({
      success: true,
      issues,
      stats: {
        termsChecked: termMap.size,
        issuesFound: issues.length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        infos: issues.filter((i) => i.severity === 'info').length,
      },
    });
  } catch (err) {
    log.error({ err }, 'Consistency check error');
    res.status(500).json({
      error: 'Failed to check consistency',
      message: err.message,
    });
  }
});

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
