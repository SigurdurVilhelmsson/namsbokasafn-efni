/**
 * Decision Routes
 *
 * API endpoints for the consolidated decision log.
 *
 * Endpoints:
 *   GET /api/decisions           Search and list decisions
 *   GET /api/decisions/stats     Get decision statistics
 *   GET /api/decisions/types     Get available decision types
 *   GET /api/decisions/recent    Get recent decisions
 *   GET /api/decisions/:id       Get specific decision
 *   POST /api/decisions          Log a new decision
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const decisionStore = require('../services/decisionStore');

/**
 * GET /api/decisions/types
 * Get available decision types
 */
router.get('/types', (req, res) => {
  const types = Object.entries(decisionStore.DECISION_TYPES).map(([key, value]) => ({
    value: key,
    ...value
  }));

  res.json({ types });
});

/**
 * GET /api/decisions/stats
 * Get decision statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = decisionStore.getStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats', message: err.message });
  }
});

/**
 * GET /api/decisions/recent
 * Get recent decisions
 */
router.get('/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const decisions = decisionStore.getRecentDecisions(limit);
    res.json({
      decisions,
      total: decisions.length
    });
  } catch (err) {
    console.error('Recent decisions error:', err);
    res.status(500).json({ error: 'Failed to get recent decisions', message: err.message });
  }
});

/**
 * GET /api/decisions
 * Search and list decisions
 *
 * Query params:
 *   q - Text search
 *   type - Filter by type (terminology, localization, issue, style)
 *   book - Filter by book
 *   chapter - Filter by chapter
 *   user - Filter by decidedBy
 *   limit - Max results (default 50)
 *   offset - Pagination offset (default 0)
 */
router.get('/', (req, res) => {
  const options = {
    query: req.query.q,
    type: req.query.type,
    book: req.query.book,
    chapter: req.query.chapter,
    decidedBy: req.query.user,
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0
  };

  try {
    const result = decisionStore.searchDecisions(options);
    res.json(result);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search decisions', message: err.message });
  }
});

/**
 * GET /api/decisions/:id
 * Get specific decision
 */
router.get('/:id', (req, res) => {
  try {
    const decision = decisionStore.getDecision(req.params.id);

    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    res.json(decision);
  } catch (err) {
    console.error('Get decision error:', err);
    res.status(500).json({ error: 'Failed to get decision', message: err.message });
  }
});

/**
 * GET /api/decisions/by-issue/:issueId
 * Get decisions linked to a specific issue
 */
router.get('/by-issue/:issueId', (req, res) => {
  try {
    const decisions = decisionStore.getDecisionsByIssue(req.params.issueId);
    res.json({ decisions });
  } catch (err) {
    console.error('Get decisions by issue error:', err);
    res.status(500).json({ error: 'Failed to get decisions', message: err.message });
  }
});

/**
 * POST /api/decisions
 * Log a new decision
 */
router.post('/', requireAuth, (req, res) => {
  const { type, englishTerm, icelandicTerm, rationale, book, chapter, section, linkedIssueId, metadata } = req.body;

  // Validation
  if (!type) {
    return res.status(400).json({ error: 'Missing type' });
  }

  if (!rationale) {
    return res.status(400).json({ error: 'Missing rationale' });
  }

  if (!decisionStore.DECISION_TYPES[type]) {
    return res.status(400).json({
      error: 'Invalid type',
      validTypes: Object.keys(decisionStore.DECISION_TYPES)
    });
  }

  try {
    const decision = decisionStore.logDecision({
      type,
      englishTerm,
      icelandicTerm,
      rationale,
      decidedBy: req.user.username,
      book,
      chapter: chapter ? parseInt(chapter) : null,
      section,
      linkedIssueId: linkedIssueId || null,
      metadata
    });

    res.status(201).json({
      success: true,
      decision
    });
  } catch (err) {
    console.error('Log decision error:', err);
    res.status(500).json({ error: 'Failed to log decision', message: err.message });
  }
});

module.exports = router;
