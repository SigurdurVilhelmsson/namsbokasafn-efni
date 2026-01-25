/**
 * Decision Store
 *
 * Unified storage for all translation decisions:
 * - Terminology decisions
 * - Localization choices
 * - Issue resolutions
 *
 * This provides a single searchable place for "why did we translate X as Y?"
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Decision types
 */
const DECISION_TYPES = {
  terminology: {
    name: 'Hugtök',
    nameEn: 'Terminology',
    description: 'Þýðing á faghugtökum',
    icon: '📖'
  },
  localization: {
    name: 'Staðfæring',
    nameEn: 'Localization',
    description: 'Aðlögun fyrir íslenskt samhengi',
    icon: '🌍'
  },
  issue: {
    name: 'Vandamál',
    nameEn: 'Issue Resolution',
    description: 'Úrlausn á atriðum',
    icon: '✓'
  },
  style: {
    name: 'Stíll',
    nameEn: 'Style',
    description: 'Ritstjórnarákvarðanir',
    icon: '✍️'
  }
};

/**
 * Load decisions from file
 */
function loadDecisions() {
  try {
    if (fs.existsSync(DECISIONS_FILE)) {
      return JSON.parse(fs.readFileSync(DECISIONS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load decisions:', err);
  }
  return [];
}

/**
 * Save decisions to file
 */
function saveDecisions(decisions) {
  fs.writeFileSync(DECISIONS_FILE, JSON.stringify(decisions, null, 2), 'utf-8');
}

/**
 * Log a new decision
 *
 * @param {object} data Decision data
 * @param {string} data.type Decision type (terminology, localization, issue, style)
 * @param {string} [data.englishTerm] Original English term/text
 * @param {string} [data.icelandicTerm] Icelandic translation/choice
 * @param {string} data.rationale Explanation of the decision
 * @param {string} data.decidedBy Username of decision maker
 * @param {string} [data.book] Book slug
 * @param {number} [data.chapter] Chapter number
 * @param {string} [data.section] Section identifier
 * @param {string} [data.linkedIssueId] Linked issue ID (for issue resolutions)
 * @param {object} [data.metadata] Additional metadata
 */
function logDecision(data) {
  const decisions = loadDecisions();

  const decision = {
    id: generateId(),
    type: data.type,
    englishTerm: data.englishTerm || null,
    icelandicTerm: data.icelandicTerm || null,
    rationale: data.rationale,
    decidedBy: data.decidedBy,
    decidedAt: new Date().toISOString(),
    book: data.book || null,
    chapter: data.chapter || null,
    section: data.section || null,
    linkedIssueId: data.linkedIssueId || null,
    metadata: data.metadata || {}
  };

  decisions.unshift(decision); // Add to beginning (most recent first)

  // Keep only the last 1000 decisions in memory (archive older ones)
  if (decisions.length > 1000) {
    archiveOldDecisions(decisions.splice(1000));
  }

  saveDecisions(decisions);
  return decision;
}

/**
 * Search decisions
 *
 * @param {object} options Search options
 * @param {string} [options.query] Text search in english/icelandic terms and rationale
 * @param {string} [options.type] Filter by decision type
 * @param {string} [options.book] Filter by book
 * @param {number} [options.chapter] Filter by chapter
 * @param {string} [options.decidedBy] Filter by user
 * @param {number} [options.limit] Max results (default 50)
 * @param {number} [options.offset] Offset for pagination (default 0)
 */
function searchDecisions(options = {}) {
  let decisions = loadDecisions();
  const { query, type, book, chapter, decidedBy, limit = 50, offset = 0 } = options;

  // Apply filters
  if (type) {
    decisions = decisions.filter(d => d.type === type);
  }

  if (book) {
    decisions = decisions.filter(d => d.book === book);
  }

  if (chapter) {
    decisions = decisions.filter(d => d.chapter === parseInt(chapter));
  }

  if (decidedBy) {
    decisions = decisions.filter(d => d.decidedBy === decidedBy);
  }

  if (query) {
    const q = query.toLowerCase();
    decisions = decisions.filter(d =>
      (d.englishTerm && d.englishTerm.toLowerCase().includes(q)) ||
      (d.icelandicTerm && d.icelandicTerm.toLowerCase().includes(q)) ||
      (d.rationale && d.rationale.toLowerCase().includes(q))
    );
  }

  const total = decisions.length;
  const results = decisions.slice(offset, offset + limit);

  return {
    decisions: results,
    total,
    hasMore: offset + results.length < total,
    limit,
    offset
  };
}

/**
 * Get decision by ID
 */
function getDecision(id) {
  const decisions = loadDecisions();
  return decisions.find(d => d.id === id);
}

/**
 * Get recent decisions
 */
function getRecentDecisions(limit = 10) {
  const decisions = loadDecisions();
  return decisions.slice(0, limit);
}

/**
 * Get decision stats
 */
function getStats() {
  const decisions = loadDecisions();

  const stats = {
    total: decisions.length,
    byType: {},
    last7Days: 0,
    last30Days: 0,
    topContributors: []
  };

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const contributors = {};

  for (const type of Object.keys(DECISION_TYPES)) {
    stats.byType[type] = 0;
  }

  for (const decision of decisions) {
    // Count by type
    if (stats.byType[decision.type] !== undefined) {
      stats.byType[decision.type]++;
    }

    // Count time-based
    const decisionDate = new Date(decision.decidedAt);
    if (decisionDate >= weekAgo) stats.last7Days++;
    if (decisionDate >= monthAgo) stats.last30Days++;

    // Count contributors
    if (decision.decidedBy) {
      contributors[decision.decidedBy] = (contributors[decision.decidedBy] || 0) + 1;
    }
  }

  // Top contributors
  stats.topContributors = Object.entries(contributors)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return stats;
}

/**
 * Import decisions from other sources (terminology, issues, etc.)
 */
function importFromTerminology(termData) {
  return logDecision({
    type: 'terminology',
    englishTerm: termData.english,
    icelandicTerm: termData.icelandic,
    rationale: termData.notes || termData.rationale || 'Samþykkt hugtak',
    decidedBy: termData.approvedBy || termData.createdBy || 'system',
    metadata: {
      source: 'terminology',
      termId: termData.id,
      category: termData.category
    }
  });
}

function importFromIssue(issueData) {
  return logDecision({
    type: 'issue',
    englishTerm: issueData.context,
    icelandicTerm: issueData.suggestion,
    rationale: issueData.resolution || issueData.description,
    decidedBy: issueData.resolvedBy || 'system',
    book: issueData.book,
    chapter: issueData.chapter,
    metadata: {
      source: 'issue',
      issueId: issueData.id,
      issueCategory: issueData.category
    }
  });
}

function importFromLocalization(locData) {
  return logDecision({
    type: 'localization',
    englishTerm: locData.original,
    icelandicTerm: locData.localized,
    rationale: locData.reason || locData.notes,
    decidedBy: locData.localizedBy || 'system',
    book: locData.book,
    chapter: locData.chapter,
    section: locData.section,
    metadata: {
      source: 'localization',
      adaptationType: locData.type
    }
  });
}

/**
 * Get decisions linked to an issue
 * @param {string} issueId The issue ID to find linked decisions for
 */
function getDecisionsByIssue(issueId) {
  const decisions = loadDecisions();
  return decisions.filter(d => d.linkedIssueId === issueId);
}

/**
 * Archive old decisions to a separate file
 */
function archiveOldDecisions(decisions) {
  const archiveFile = path.join(DATA_DIR, `decisions-archive-${Date.now()}.json`);
  fs.writeFileSync(archiveFile, JSON.stringify(decisions, null, 2), 'utf-8');
}

/**
 * Generate unique ID
 */
function generateId() {
  return 'dec_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Get terminology decisions relevant to a piece of content
 * Used for decision enforcement highlighting in the editor
 *
 * @param {object} options
 * @param {string} [options.book] Filter by book
 * @param {number} [options.chapter] Filter by chapter (include book-level decisions)
 * @param {string[]} [options.types] Decision types to include (default: terminology, style)
 * @returns {object[]} Decisions with searchable terms
 */
function getRelevantDecisions(options = {}) {
  const { book, chapter, types = ['terminology', 'style'] } = options;
  let decisions = loadDecisions();

  // Filter by type
  decisions = decisions.filter(d => types.includes(d.type));

  // Filter to book-wide decisions or chapter-specific decisions
  if (book) {
    decisions = decisions.filter(d =>
      d.book === book || !d.book // Include global decisions
    );
  }

  if (chapter !== undefined) {
    decisions = decisions.filter(d =>
      !d.chapter || d.chapter === parseInt(chapter) // Include chapter-agnostic decisions
    );
  }

  // Return only decisions with searchable English terms
  return decisions
    .filter(d => d.englishTerm && d.englishTerm.length >= 2)
    .map(d => ({
      id: d.id,
      englishTerm: d.englishTerm,
      icelandicTerm: d.icelandicTerm,
      type: d.type,
      rationale: d.rationale,
      decidedBy: d.decidedBy,
      decidedAt: d.decidedAt
    }));
}

module.exports = {
  DECISION_TYPES,
  logDecision,
  searchDecisions,
  getDecision,
  getDecisionsByIssue,
  getRecentDecisions,
  getStats,
  getRelevantDecisions,
  importFromTerminology,
  importFromIssue,
  importFromLocalization
};
