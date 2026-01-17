/**
 * Issue Classification Service
 *
 * Categorizes issues found during translation review by severity
 * and routes them appropriately for review or auto-fix.
 *
 * Categories:
 * - AUTO_FIX: Whitespace, formatting, known patterns - apply automatically
 * - EDITOR_CONFIRM: Terminology suggestions, minor edits - single editor reviews
 * - BOARD_REVIEW: New terminology, localization policy - discussion required
 * - BLOCKED: Copyright concern, major error - cannot proceed
 */

const fs = require('fs');
const path = require('path');

// Issue categories with their routing
const ISSUE_CATEGORIES = {
  AUTO_FIX: {
    name: 'Auto-Fix',
    description: 'Applied automatically without review',
    action: 'apply',
    approver: null,
    patterns: [
      'whitespace',
      'trailing-space',
      'line-ending',
      'known-typo',
      'double-space',
      'nbsp-normalization'
    ]
  },
  EDITOR_CONFIRM: {
    name: 'Editor Confirmation',
    description: 'Single editor reviews and confirms',
    action: 'queue',
    approver: 'head-editor',
    patterns: [
      'terminology-suggestion',
      'minor-edit',
      'formatting-choice',
      'punctuation',
      'capitalization'
    ]
  },
  BOARD_REVIEW: {
    name: 'Editorial Board Review',
    description: 'Requires discussion and consensus',
    action: 'escalate',
    approver: 'editorial-board',
    patterns: [
      'new-terminology',
      'localization-policy',
      'cultural-adaptation',
      'measurement-conversion',
      'regional-reference'
    ]
  },
  BLOCKED: {
    name: 'Blocked',
    description: 'Cannot proceed without manual resolution',
    action: 'halt',
    approver: 'manual',
    patterns: [
      'copyright',
      'major-error',
      'unclear-source',
      'missing-content',
      'structural-issue'
    ]
  }
};

// Pattern matchers for issue detection
const ISSUE_PATTERNS = {
  // Whitespace issues (AUTO_FIX)
  'trailing-space': {
    regex: / +$/gm,
    category: 'AUTO_FIX',
    description: 'Trailing whitespace',
    fix: () => ''
  },
  'double-space': {
    regex: /  +/g,
    category: 'AUTO_FIX',
    description: 'Multiple consecutive spaces',
    fix: () => ' ',
    excludeInCode: true
  },
  'nbsp-normalization': {
    regex: /\u00A0/g,
    category: 'AUTO_FIX',
    description: 'Non-breaking space normalization',
    fix: () => ' '
  },

  // Line ending issues (AUTO_FIX)
  'crlf-to-lf': {
    regex: /\r\n/g,
    category: 'AUTO_FIX',
    description: 'Windows line endings',
    fix: () => '\n'
  },

  // Known typos (AUTO_FIX)
  'common-typo-english': {
    regex: /\b(teh|hte|taht|adn|nad)\b/gi,
    category: 'AUTO_FIX',
    description: 'Common English typo',
    fix: (match) => {
      const fixes = {
        'teh': 'the', 'hte': 'the',
        'taht': 'that', 'adn': 'and', 'nad': 'and'
      };
      return fixes[match.toLowerCase()] || match;
    }
  },

  // Icelandic-specific issues (EDITOR_CONFIRM)
  'icelandic-quotes': {
    regex: /"([^"]+)"/g,
    category: 'EDITOR_CONFIRM',
    description: 'Should use Icelandic quotation marks',
    suggestion: (match, content) => `„${content}"`
  },

  // Chemistry terminology (EDITOR_CONFIRM / BOARD_REVIEW)
  'element-symbol-case': {
    regex: /\b([A-Z][a-z]?)\b(?=\s*\d|\s*\+|\s*-)/g,
    category: 'EDITOR_CONFIRM',
    description: 'Verify chemical element symbol',
    requiresContext: true
  },

  // Unit conversions (BOARD_REVIEW)
  'fahrenheit-to-celsius': {
    regex: /(\d+(?:\.\d+)?)\s*°?\s*F\b/g,
    category: 'BOARD_REVIEW',
    description: 'Temperature in Fahrenheit - consider Celsius conversion',
    suggestion: (match, value) => {
      const celsius = ((parseFloat(value) - 32) * 5/9).toFixed(1);
      return celsius + ' °C (' + value + ' °F)';
    }
  },
  'pounds-to-kg': {
    regex: /(\d+(?:\.\d+)?)\s*(pounds?|lbs?)\b/gi,
    category: 'BOARD_REVIEW',
    description: 'Weight in pounds - consider kg conversion',
    suggestion: (match, value) => {
      const kg = (parseFloat(value) * 0.453592).toFixed(2);
      return kg + ' kg';
    }
  },
  'miles-to-km': {
    regex: /(\d+(?:\.\d+)?)\s*miles?\b/gi,
    category: 'BOARD_REVIEW',
    description: 'Distance in miles - consider km conversion',
    suggestion: (match, value) => {
      const km = (parseFloat(value) * 1.60934).toFixed(1);
      return km + ' km';
    }
  },
  'gallons-to-liters': {
    regex: /(\d+(?:\.\d+)?)\s*gallons?\b/gi,
    category: 'BOARD_REVIEW',
    description: 'Volume in gallons - consider liter conversion',
    suggestion: (match, value) => {
      const liters = (parseFloat(value) * 3.78541).toFixed(2);
      return liters + ' L';
    }
  },

  // Cultural references (BOARD_REVIEW)
  'us-specific-reference': {
    regex: /\b(FDA|EPA|USDA|CDC|NIH|US\s+Department)\b/g,
    category: 'BOARD_REVIEW',
    description: 'US-specific agency reference - consider Icelandic equivalent'
  },
  'dollar-amount': {
    regex: /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
    category: 'BOARD_REVIEW',
    description: 'Dollar amount - consider ISK conversion or removal'
  },

  // Potential errors (EDITOR_CONFIRM)
  'broken-link': {
    regex: /\[([^\]]+)\]\(\s*\)/g,
    category: 'EDITOR_CONFIRM',
    description: 'Empty link URL'
  },
  'duplicate-word': {
    regex: /\b(\w+)\s+\1\b/gi,
    category: 'EDITOR_CONFIRM',
    description: 'Duplicate word'
  },

  // Structural issues (BLOCKED)
  'unclosed-bracket': {
    regex: /\[[^\]]*$/gm,
    category: 'BLOCKED',
    description: 'Unclosed bracket at end of line'
  },
  'missing-equation': {
    regex: /\[EQUATION_\d+\]/g,
    category: 'EDITOR_CONFIRM',
    description: 'Equation placeholder - verify restoration',
    requiresContext: true
  }
};

// Glossary terms that should be checked (would load from file in production)
const GLOSSARY_TERMS = {
  'atom': 'frumeind',
  'molecule': 'sameind',
  'electron': 'rafeind',
  'proton': 'roteind',
  'neutron': 'nifteind',
  'nucleus': 'frumeindakjarni',
  'chemical bond': 'efnatengi',
  'covalent bond': 'samgildistengi',
  'ionic bond': 'jonatengi',
  'mole': 'mol',
  'molarity': 'molstyrkur',
  'concentration': 'styrkur',
  'solution': 'lausn',
  'solvent': 'leysiefni',
  'solute': 'leysisefni'
};

/**
 * Classify issues in content
 *
 * @param {string} content - Content to analyze
 * @param {object} options - Analysis options
 * @returns {Promise<object[]>} Array of classified issues
 */
async function classifyIssues(content, options = {}) {
  const { type, book, chapter } = options;
  const issues = [];

  // Check each pattern
  for (const [patternId, pattern] of Object.entries(ISSUE_PATTERNS)) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Skip if in code block and pattern excludes code
      if (pattern.excludeInCode && isInCodeBlock(content, match.index)) {
        continue;
      }

      const issue = {
        patternId,
        category: pattern.category,
        categoryInfo: ISSUE_CATEGORIES[pattern.category],
        description: pattern.description,
        match: match[0],
        position: match.index,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index, 50)
      };

      // Add suggestion if available
      if (pattern.suggestion) {
        issue.suggestion = pattern.suggestion(match[0], ...match.slice(1));
      }

      // Add fix if auto-fixable
      if (pattern.fix) {
        issue.fix = pattern.fix(match[0]);
        issue.autoFixable = true;
      }

      issues.push(issue);
    }
  }

  // Check glossary terms if this is MT output
  if (type === 'mt-output') {
    const glossaryIssues = await checkGlossaryTerms(content);
    issues.push(...glossaryIssues);
  }

  // Sort by category priority (BLOCKED first, then BOARD_REVIEW, etc.)
  const categoryPriority = {
    'BLOCKED': 0,
    'BOARD_REVIEW': 1,
    'EDITOR_CONFIRM': 2,
    'AUTO_FIX': 3
  };

  issues.sort((a, b) => {
    const priorityDiff = categoryPriority[a.category] - categoryPriority[b.category];
    if (priorityDiff !== 0) return priorityDiff;
    return a.position - b.position;
  });

  return issues;
}

/**
 * Check for glossary term consistency
 */
async function checkGlossaryTerms(content) {
  const issues = [];

  for (const [english, icelandic] of Object.entries(GLOSSARY_TERMS)) {
    // Check if English term appears (might indicate untranslated term)
    const englishRegex = new RegExp('\\b' + escapeRegex(english) + '\\b', 'gi');
    let match;

    while ((match = englishRegex.exec(content)) !== null) {
      issues.push({
        patternId: 'glossary-term',
        category: 'EDITOR_CONFIRM',
        categoryInfo: ISSUE_CATEGORIES['EDITOR_CONFIRM'],
        description: 'English term "' + english + '" - should be "' + icelandic + '"',
        match: match[0],
        position: match.index,
        line: getLineNumber(content, match.index),
        context: getContext(content, match.index, 50),
        suggestion: icelandic,
        glossaryTerm: true
      });
    }
  }

  return issues;
}

/**
 * Apply auto-fixes to content
 *
 * @param {string} content - Content to fix
 * @param {object[]} issues - Issues with fixes
 * @returns {object} Fixed content and applied fixes
 */
function applyAutoFixes(content, issues) {
  const autoFixIssues = issues.filter(i => i.autoFixable && i.category === 'AUTO_FIX');

  // Sort by position descending so we can apply fixes without shifting indices
  autoFixIssues.sort((a, b) => b.position - a.position);

  let fixedContent = content;
  const appliedFixes = [];

  for (const issue of autoFixIssues) {
    const before = fixedContent.substring(0, issue.position);
    const after = fixedContent.substring(issue.position + issue.match.length);
    fixedContent = before + issue.fix + after;

    appliedFixes.push({
      patternId: issue.patternId,
      original: issue.match,
      replacement: issue.fix,
      line: issue.line
    });
  }

  return {
    content: fixedContent,
    fixesApplied: appliedFixes.length,
    fixes: appliedFixes
  };
}

/**
 * Get statistics about issues
 */
function getIssueStats(issues) {
  const stats = {
    total: issues.length,
    byCategory: {},
    autoFixable: 0,
    requiresReview: 0,
    blocked: 0
  };

  for (const category of Object.keys(ISSUE_CATEGORIES)) {
    stats.byCategory[category] = issues.filter(i => i.category === category).length;
  }

  stats.autoFixable = stats.byCategory['AUTO_FIX'] || 0;
  stats.blocked = stats.byCategory['BLOCKED'] || 0;
  stats.requiresReview = stats.total - stats.autoFixable - stats.blocked;

  return stats;
}

// Helper functions

function isInCodeBlock(content, position) {
  const before = content.substring(0, position);
  const codeBlockStarts = (before.match(/```/g) || []).length;
  return codeBlockStarts % 2 === 1; // Odd number means we're inside a code block
}

function getLineNumber(content, position) {
  return content.substring(0, position).split('\n').length;
}

function getContext(content, position, radius) {
  const start = Math.max(0, position - radius);
  const end = Math.min(content.length, position + radius);
  let context = content.substring(start, end);

  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context.replace(/\n/g, '\\n');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  ISSUE_CATEGORIES,
  ISSUE_PATTERNS,
  classifyIssues,
  applyAutoFixes,
  getIssueStats,
  checkGlossaryTerms
};
