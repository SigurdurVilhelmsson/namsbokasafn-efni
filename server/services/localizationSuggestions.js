/**
 * Localization Suggestions Service
 *
 * Automatically detects and suggests localization changes:
 * - Imperial to SI unit conversions
 * - US agency references to Icelandic equivalents
 * - Currency conversions
 * - Cultural adaptations
 *
 * Reuses pattern detection from issueClassifier.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

// Suggestion types
const SUGGESTION_TYPES = [
  'unit_conversion',
  'cultural_reference',
  'currency',
  'agency_reference',
  'regional_example',
  'other'
];

// Suggestion statuses
const SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected', 'modified'];

// Conversion patterns for localization
const LOCALIZATION_PATTERNS = {
  // Temperature conversions
  'fahrenheit-to-celsius': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*°?\s*F(?:ahrenheit)?\b/gi,
    convert: (match, value) => {
      const celsius = ((parseFloat(value) - 32) * 5 / 9).toFixed(1);
      return {
        original: match,
        suggested: `${celsius} °C`,
        context: `Temperature conversion: ${value}°F = ${celsius}°C`
      };
    }
  },

  // Weight conversions
  'pounds-to-kg': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(pounds?|lbs?)\b/gi,
    convert: (match, value) => {
      const kg = (parseFloat(value) * 0.453592).toFixed(2);
      return {
        original: match,
        suggested: `${kg} kg`,
        context: `Weight conversion: ${value} pounds = ${kg} kg`
      };
    }
  },

  'ounces-to-grams': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(ounces?|oz)\b/gi,
    convert: (match, value) => {
      const grams = (parseFloat(value) * 28.3495).toFixed(1);
      return {
        original: match,
        suggested: `${grams} g`,
        context: `Weight conversion: ${value} oz = ${grams} g`
      };
    }
  },

  // Distance conversions
  'miles-to-km': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*miles?\b/gi,
    convert: (match, value) => {
      const km = (parseFloat(value) * 1.60934).toFixed(1);
      return {
        original: match,
        suggested: `${km} km`,
        context: `Distance conversion: ${value} miles = ${km} km`
      };
    }
  },

  'feet-to-meters': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(feet|ft)\b/gi,
    convert: (match, value) => {
      const meters = (parseFloat(value) * 0.3048).toFixed(2);
      return {
        original: match,
        suggested: `${meters} m`,
        context: `Distance conversion: ${value} feet = ${meters} m`
      };
    }
  },

  'inches-to-cm': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(inches?|in)\b/gi,
    convert: (match, value) => {
      const cm = (parseFloat(value) * 2.54).toFixed(1);
      return {
        original: match,
        suggested: `${cm} cm`,
        context: `Distance conversion: ${value} inches = ${cm} cm`
      };
    }
  },

  // Volume conversions
  'gallons-to-liters': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*gallons?\b/gi,
    convert: (match, value) => {
      const liters = (parseFloat(value) * 3.78541).toFixed(2);
      return {
        original: match,
        suggested: `${liters} L`,
        context: `Volume conversion: ${value} gallons = ${liters} L`
      };
    }
  },

  'quarts-to-liters': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*quarts?\b/gi,
    convert: (match, value) => {
      const liters = (parseFloat(value) * 0.946353).toFixed(2);
      return {
        original: match,
        suggested: `${liters} L`,
        context: `Volume conversion: ${value} quarts = ${liters} L`
      };
    }
  },

  'pints-to-ml': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*pints?\b/gi,
    convert: (match, value) => {
      const ml = (parseFloat(value) * 473.176).toFixed(0);
      return {
        original: match,
        suggested: `${ml} mL`,
        context: `Volume conversion: ${value} pints = ${ml} mL`
      };
    }
  },

  'cups-to-ml': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*cups?\b/gi,
    convert: (match, value) => {
      const ml = (parseFloat(value) * 236.588).toFixed(0);
      return {
        original: match,
        suggested: `${ml} mL`,
        context: `Volume conversion: ${value} cups = ${ml} mL`
      };
    }
  },

  // Area conversions
  'square-feet-to-sqm': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(square feet|sq\.?\s*ft|ft²)\b/gi,
    convert: (match, value) => {
      const sqm = (parseFloat(value) * 0.092903).toFixed(2);
      return {
        original: match,
        suggested: `${sqm} m²`,
        context: `Area conversion: ${value} sq ft = ${sqm} m²`
      };
    }
  },

  'acres-to-hectares': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*acres?\b/gi,
    convert: (match, value) => {
      const hectares = (parseFloat(value) * 0.404686).toFixed(2);
      return {
        original: match,
        suggested: `${hectares} ha`,
        context: `Area conversion: ${value} acres = ${hectares} hectares`
      };
    }
  },

  // Pressure conversions
  'psi-to-pa': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*psi\b/gi,
    convert: (match, value) => {
      const pa = (parseFloat(value) * 6894.76).toFixed(0);
      const bar = (parseFloat(value) * 0.0689476).toFixed(3);
      return {
        original: match,
        suggested: `${pa} Pa (${bar} bar)`,
        context: `Pressure conversion: ${value} psi = ${pa} Pa = ${bar} bar`
      };
    }
  },

  // Force conversions (pounds-force to Newtons)
  'lbf-to-newtons': {
    type: 'unit_conversion',
    regex: /(\d+(?:\.\d+)?)\s*(pounds?[- ]?force|lbf)\b/gi,
    convert: (match, value) => {
      const newtons = (parseFloat(value) * 4.44822).toFixed(2);
      return {
        original: match,
        suggested: `${newtons} N`,
        context: `Force conversion: ${value} lbf = ${newtons} N`
      };
    }
  },

  // Text formatting
  'english-quotes-to-icelandic': {
    type: 'cultural_reference',
    regex: /"([^"]+)"/g,
    convert: (match, content) => ({
      original: match,
      suggested: `„${content}"`,
      context: 'Icelandic quotation marks: Use „text" instead of "text"'
    })
  },

  // US agencies
  'us-fda': {
    type: 'agency_reference',
    regex: /\bFDA\b/g,
    convert: (match) => ({
      original: match,
      suggested: 'Lyfjastofnun',
      context: 'US FDA equivalent in Iceland: Lyfjastofnun (Icelandic Medicines Agency)'
    })
  },

  'us-epa': {
    type: 'agency_reference',
    regex: /\bEPA\b/g,
    convert: (match) => ({
      original: match,
      suggested: 'Umhverfisstofnun',
      context: 'US EPA equivalent in Iceland: Umhverfisstofnun (Environment Agency of Iceland)'
    })
  },

  'us-usda': {
    type: 'agency_reference',
    regex: /\bUSDA\b/g,
    convert: (match) => ({
      original: match,
      suggested: 'Matvælastofnun',
      context: 'US USDA equivalent in Iceland: Matvælastofnun (Icelandic Food and Veterinary Authority)'
    })
  },

  'us-cdc': {
    type: 'agency_reference',
    regex: /\bCDC\b/g,
    convert: (match) => ({
      original: match,
      suggested: 'Landlæknir',
      context: 'US CDC equivalent in Iceland: Embætti landlæknis (Directorate of Health)'
    })
  },

  'us-nih': {
    type: 'agency_reference',
    regex: /\bNIH\b/g,
    convert: (match) => ({
      original: match,
      suggested: 'Heilbrigðisvísindastofnun',
      context: 'US NIH - consider Icelandic context or keep as international reference'
    })
  },

  // Currency
  'us-dollars': {
    type: 'currency',
    regex: /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
    convert: (match, value) => {
      const numValue = parseFloat(value.replace(/,/g, ''));
      // Approximate ISK conversion (rate varies - this is illustrative)
      const isk = Math.round(numValue * 140);
      return {
        original: match,
        suggested: `${isk.toLocaleString('is-IS')} kr.`,
        context: `Currency: Consider removing specific amounts or using ISK. $${value} ≈ ${isk.toLocaleString('is-IS')} kr.`
      };
    }
  }
};

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
 * Scan content for localization opportunities
 *
 * @param {string} content - Content to scan
 * @returns {object[]} Array of detected suggestions
 */
function detectSuggestions(content) {
  const suggestions = [];

  for (const [patternId, pattern] of Object.entries(LOCALIZATION_PATTERNS)) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Skip if in code block
      if (isInCodeBlock(content, match.index)) {
        continue;
      }

      const result = pattern.convert(match[0], ...match.slice(1));

      suggestions.push({
        patternId,
        type: pattern.type,
        originalText: result.original,
        suggestedText: result.suggested,
        context: result.context,
        lineNumber: getLineNumber(content, match.index),
        position: match.index
      });
    }
  }

  // Sort by position
  suggestions.sort((a, b) => a.position - b.position);

  return suggestions;
}

/**
 * Scan a section and store suggestions
 *
 * @param {number} sectionId - Section database ID
 * @returns {object} Scan results
 */
function scanSection(sectionId) {
  const db = getDb();

  try {
    // Get section info
    const section = db.prepare(`
      SELECT bs.*, rb.slug as book_slug
      FROM book_sections bs
      JOIN registered_books rb ON bs.book_id = rb.id
      WHERE bs.id = ?
    `).get(sectionId);

    if (!section) {
      throw new Error('Section not found');
    }

    // Get content to scan (faithful translation)
    const contentPath = section.faithful_path
      ? path.join(BOOKS_DIR, section.book_slug, section.faithful_path)
      : null;

    if (!contentPath || !fs.existsSync(contentPath)) {
      db.close();
      return {
        success: true,
        sectionId,
        suggestions: [],
        message: 'No content to scan'
      };
    }

    const content = fs.readFileSync(contentPath, 'utf8');
    const detectedSuggestions = detectSuggestions(content);

    // Clear existing pending suggestions for this section
    db.prepare(`
      DELETE FROM localization_suggestions
      WHERE section_id = ? AND status = 'pending'
    `).run(sectionId);

    // Insert new suggestions
    const insertStmt = db.prepare(`
      INSERT INTO localization_suggestions
        (section_id, suggestion_type, original_text, suggested_text, context, line_number, pattern_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const suggestion of detectedSuggestions) {
      insertStmt.run(
        sectionId,
        suggestion.type,
        suggestion.originalText,
        suggestion.suggestedText,
        suggestion.context,
        suggestion.lineNumber,
        suggestion.patternId
      );
    }

    db.close();

    return {
      success: true,
      sectionId,
      suggestionsCount: detectedSuggestions.length,
      suggestions: detectedSuggestions
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Scan an entire book for localization opportunities
 *
 * @param {string} bookSlug - Book slug
 * @returns {object} Scan results
 */
function scanBook(bookSlug) {
  const db = getDb();

  try {
    const sections = db.prepare(`
      SELECT bs.id
      FROM book_sections bs
      JOIN registered_books rb ON bs.book_id = rb.id
      WHERE rb.slug = ? AND bs.faithful_path IS NOT NULL
    `).all(bookSlug);

    db.close();

    let totalSuggestions = 0;
    const results = [];

    for (const section of sections) {
      try {
        const result = scanSection(section.id);
        totalSuggestions += result.suggestionsCount || 0;
        results.push({
          sectionId: section.id,
          suggestionsCount: result.suggestionsCount || 0
        });
      } catch (err) {
        results.push({
          sectionId: section.id,
          error: err.message
        });
      }
    }

    return {
      success: true,
      bookSlug,
      sectionsScanned: sections.length,
      totalSuggestions,
      results
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get suggestions for a section
 *
 * @param {number} sectionId - Section ID
 * @param {string} status - Optional status filter
 * @returns {object[]} Suggestions
 */
function getSuggestions(sectionId, status = null) {
  const db = getDb();

  try {
    let sql = `
      SELECT * FROM localization_suggestions
      WHERE section_id = ?
    `;
    const params = [sectionId];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY line_number, id`;

    const suggestions = db.prepare(sql).all(...params);
    db.close();

    return suggestions.map(formatSuggestion);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get a single suggestion
 *
 * @param {number} id - Suggestion ID
 * @returns {object|null} Suggestion
 */
function getSuggestion(id) {
  const db = getDb();

  try {
    const suggestion = db.prepare('SELECT * FROM localization_suggestions WHERE id = ?').get(id);
    db.close();
    return suggestion ? formatSuggestion(suggestion) : null;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Accept a suggestion as-is
 *
 * @param {number} id - Suggestion ID
 * @param {string} userId - Reviewing user ID
 * @param {string} username - Reviewing user name
 * @returns {object} Updated suggestion
 */
function acceptSuggestion(id, userId, username) {
  const db = getDb();

  try {
    db.prepare(`
      UPDATE localization_suggestions
      SET status = 'accepted', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, username, id);

    const suggestion = db.prepare('SELECT * FROM localization_suggestions WHERE id = ?').get(id);
    db.close();

    return formatSuggestion(suggestion);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Reject a suggestion
 *
 * @param {number} id - Suggestion ID
 * @param {string} userId - Reviewing user ID
 * @param {string} username - Reviewing user name
 * @returns {object} Updated suggestion
 */
function rejectSuggestion(id, userId, username) {
  const db = getDb();

  try {
    db.prepare(`
      UPDATE localization_suggestions
      SET status = 'rejected', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, username, id);

    const suggestion = db.prepare('SELECT * FROM localization_suggestions WHERE id = ?').get(id);
    db.close();

    return formatSuggestion(suggestion);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Accept with modifications
 *
 * @param {number} id - Suggestion ID
 * @param {string} modifiedText - Modified suggestion text
 * @param {string} userId - Reviewing user ID
 * @param {string} username - Reviewing user name
 * @returns {object} Updated suggestion
 */
function modifySuggestion(id, modifiedText, userId, username) {
  const db = getDb();

  try {
    db.prepare(`
      UPDATE localization_suggestions
      SET status = 'modified',
          reviewer_modified_text = ?,
          reviewed_by = ?,
          reviewed_by_name = ?,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(modifiedText, userId, username, id);

    const suggestion = db.prepare('SELECT * FROM localization_suggestions WHERE id = ?').get(id);
    db.close();

    return formatSuggestion(suggestion);
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Bulk accept/reject suggestions
 *
 * @param {number[]} ids - Suggestion IDs
 * @param {string} action - 'accept' or 'reject'
 * @param {string} userId - Reviewing user ID
 * @param {string} username - Reviewing user name
 * @returns {object} Result
 */
function bulkUpdateSuggestions(ids, action, userId, username) {
  if (!['accept', 'reject'].includes(action)) {
    throw new Error('Invalid action');
  }

  const db = getDb();
  const status = action === 'accept' ? 'accepted' : 'rejected';

  try {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE localization_suggestions
      SET status = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders}) AND status = 'pending'
    `).run(status, userId, username, ...ids);

    db.close();

    return {
      success: true,
      action,
      count: ids.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Sync accepted suggestions to localization log
 *
 * @param {number} sectionId - Section ID
 * @param {string} localizer - User ID
 * @returns {object} Sync result
 */
function syncToLocalizationLog(sectionId, localizer) {
  const localizationLog = require('./localizationLog');
  const db = getDb();

  try {
    // Get accepted/modified suggestions
    const suggestions = db.prepare(`
      SELECT * FROM localization_suggestions
      WHERE section_id = ? AND status IN ('accepted', 'modified')
    `).all(sectionId);

    db.close();

    if (suggestions.length === 0) {
      return {
        success: true,
        entriesCreated: 0,
        message: 'No accepted suggestions to sync'
      };
    }

    let entriesCreated = 0;

    for (const suggestion of suggestions) {
      const changedTo = suggestion.reviewer_modified_text || suggestion.suggested_text;

      localizationLog.addEntry(
        sectionId,
        {
          type: mapSuggestionTypeToLogType(suggestion.suggestion_type),
          original: suggestion.original_text,
          changedTo,
          reason: suggestion.context || `Auto-detected ${suggestion.suggestion_type}`,
          location: `Line ${suggestion.line_number}`
        },
        localizer
      );

      entriesCreated++;
    }

    return {
      success: true,
      entriesCreated
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get suggestion statistics for a section
 *
 * @param {number} sectionId - Section ID
 * @returns {object} Statistics
 */
function getSuggestionStats(sectionId) {
  const db = getDb();

  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'modified' THEN 1 ELSE 0 END) as modified
      FROM localization_suggestions
      WHERE section_id = ?
    `).get(sectionId);

    const byType = db.prepare(`
      SELECT suggestion_type, COUNT(*) as count
      FROM localization_suggestions
      WHERE section_id = ?
      GROUP BY suggestion_type
    `).all(sectionId);

    db.close();

    return {
      total: stats?.total || 0,
      byStatus: {
        pending: stats?.pending || 0,
        accepted: stats?.accepted || 0,
        rejected: stats?.rejected || 0,
        modified: stats?.modified || 0
      },
      byType: byType.reduce((acc, row) => {
        acc[row.suggestion_type] = row.count;
        return acc;
      }, {})
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

// Helper functions

function formatSuggestion(row) {
  return {
    id: row.id,
    sectionId: row.section_id,
    type: row.suggestion_type,
    originalText: row.original_text,
    suggestedText: row.suggested_text,
    context: row.context,
    lineNumber: row.line_number,
    patternId: row.pattern_id,
    status: row.status,
    reviewerModifiedText: row.reviewer_modified_text,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

function isInCodeBlock(content, position) {
  const before = content.substring(0, position);
  const codeBlockStarts = (before.match(/```/g) || []).length;
  return codeBlockStarts % 2 === 1;
}

function getLineNumber(content, position) {
  return content.substring(0, position).split('\n').length;
}

function mapSuggestionTypeToLogType(suggestionType) {
  const mapping = {
    'unit_conversion': 'unit_conversion',
    'cultural_reference': 'cultural_adaptation',
    'currency': 'cultural_adaptation',
    'agency_reference': 'cultural_adaptation',
    'regional_example': 'cultural_adaptation',
    'other': 'other'
  };
  return mapping[suggestionType] || 'other';
}

module.exports = {
  detectSuggestions,
  scanSection,
  scanBook,
  getSuggestions,
  getSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  modifySuggestion,
  bulkUpdateSuggestions,
  syncToLocalizationLog,
  getSuggestionStats,
  SUGGESTION_TYPES,
  SUGGESTION_STATUSES,
  LOCALIZATION_PATTERNS
};
