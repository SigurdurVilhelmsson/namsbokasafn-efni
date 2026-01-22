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
 * GET /api/decisions/related
 * Find decisions related to given terms or source text
 *
 * Query params:
 *   terms - Comma-separated list of terms to search for
 *   text - Source text to extract terms from (alternative to terms)
 *   book - Filter by book
 *   limit - Max results (default 20)
 */
router.get('/related', (req, res) => {
  const { terms, text, book } = req.query;
  const limit = parseInt(req.query.limit) || 20;

  try {
    let searchTerms = [];

    if (terms) {
      // Use provided terms
      searchTerms = terms.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 2);
    } else if (text) {
      // Extract terms from text - look for likely terminology
      // Focus on: capitalized words, multi-word phrases, scientific terms
      const words = text.toLowerCase()
        .replace(/[^\w\sáéíóúýþæöð]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);

      // Get unique words that might be terminology
      const wordSet = new Set(words);
      searchTerms = Array.from(wordSet).slice(0, 50); // Limit to 50 terms
    }

    if (searchTerms.length === 0) {
      return res.json({
        decisions: [],
        matchedTerms: [],
        total: 0
      });
    }

    // Search for decisions matching any of these terms
    const allDecisions = decisionStore.searchDecisions({
      book: book || undefined,
      limit: 500 // Get more to filter from
    });

    // Score decisions by how many terms they match
    const scoredDecisions = [];
    const matchedTermsSet = new Set();

    for (const decision of allDecisions.decisions) {
      const decisionText = [
        decision.englishTerm,
        decision.icelandicTerm,
        decision.rationale
      ].filter(Boolean).join(' ').toLowerCase();

      let score = 0;
      const matched = [];

      for (const term of searchTerms) {
        if (decisionText.includes(term)) {
          score++;
          matched.push(term);
          matchedTermsSet.add(term);
        }

        // Bonus for exact term match
        if (decision.englishTerm && decision.englishTerm.toLowerCase() === term) {
          score += 5;
        }
        if (decision.icelandicTerm && decision.icelandicTerm.toLowerCase() === term) {
          score += 5;
        }
      }

      if (score > 0) {
        scoredDecisions.push({
          ...decision,
          _relevanceScore: score,
          _matchedTerms: matched
        });
      }
    }

    // Sort by relevance score, then by date
    scoredDecisions.sort((a, b) => {
      if (b._relevanceScore !== a._relevanceScore) {
        return b._relevanceScore - a._relevanceScore;
      }
      return new Date(b.decidedAt) - new Date(a.decidedAt);
    });

    // Return top results
    const results = scoredDecisions.slice(0, limit);

    res.json({
      decisions: results,
      matchedTerms: Array.from(matchedTermsSet),
      total: scoredDecisions.length,
      searchedTerms: searchTerms.length
    });

  } catch (err) {
    console.error('Related decisions error:', err);
    res.status(500).json({ error: 'Failed to find related decisions', message: err.message });
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
