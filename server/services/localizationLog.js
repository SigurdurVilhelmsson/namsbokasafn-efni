/**
 * Localization Log Service
 *
 * Manages localization change logs for tracking all adaptations made
 * during the localization (Pass 2) phase.
 *
 * Each localization change should document:
 * - Type: unit_conversion, cultural_adaptation, added_context, other
 * - Original text
 * - Changed to
 * - Reason for change
 * - Location in document
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

// Valid log entry types
const LOG_ENTRY_TYPES = [
  'unit_conversion',      // Converting imperial to SI units
  'cultural_adaptation',  // Adapting examples for Icelandic context
  'added_context',        // Adding explanatory context for Icelandic readers
  'removed_content',      // Removing US-specific content not relevant
  'terminology',          // Terminology changes specific to localization
  'other'                 // Other adaptations
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
 * Get or create a localization log for a section
 *
 * @param {number} sectionId - Section database ID
 * @param {string} localizer - User ID of the localizer
 * @returns {object} Log record
 */
function getOrCreateLog(sectionId, localizer) {
  const db = getDb();

  try {
    // Check for existing log
    let log = db.prepare(`
      SELECT * FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    if (log) {
      db.close();
      return {
        id: log.id,
        sectionId: log.section_id,
        localizer: log.localizer,
        entries: JSON.parse(log.entries || '[]'),
        createdAt: log.created_at,
        updatedAt: log.updated_at
      };
    }

    // Create new log
    const result = db.prepare(`
      INSERT INTO localization_logs (section_id, localizer, entries)
      VALUES (?, ?, '[]')
    `).run(sectionId, localizer);

    db.close();

    return {
      id: result.lastInsertRowid,
      sectionId,
      localizer,
      entries: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Add an entry to a localization log
 *
 * @param {number} sectionId - Section database ID
 * @param {object} entry - Log entry
 * @param {string} entry.type - Entry type (see LOG_ENTRY_TYPES)
 * @param {string} entry.original - Original text
 * @param {string} entry.changedTo - New text after localization
 * @param {string} entry.reason - Reason for the change
 * @param {string} entry.location - Location in document (e.g., "paragraph 3")
 * @param {string} localizer - User ID making the entry
 * @returns {object} Updated log
 */
function addEntry(sectionId, entry, localizer) {
  if (!LOG_ENTRY_TYPES.includes(entry.type)) {
    throw new Error(`Invalid entry type: ${entry.type}. Valid types: ${LOG_ENTRY_TYPES.join(', ')}`);
  }

  if (!entry.original || !entry.changedTo || !entry.reason) {
    throw new Error('Entry must include original, changedTo, and reason');
  }

  const db = getDb();

  try {
    // Get current log
    const log = db.prepare(`
      SELECT * FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    let logId;
    let entries = [];

    if (log) {
      logId = log.id;
      entries = JSON.parse(log.entries || '[]');
    } else {
      // Create new log
      const result = db.prepare(`
        INSERT INTO localization_logs (section_id, localizer, entries)
        VALUES (?, ?, '[]')
      `).run(sectionId, localizer);
      logId = result.lastInsertRowid;
    }

    // Add new entry
    const newEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: entry.type,
      original: entry.original,
      changedTo: entry.changedTo,
      reason: entry.reason,
      location: entry.location || null
    };

    entries.push(newEntry);

    // Update log
    db.prepare(`
      UPDATE localization_logs
      SET entries = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(entries), logId);

    db.close();

    return {
      id: logId,
      sectionId,
      entry: newEntry,
      totalEntries: entries.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Update an existing log entry
 *
 * @param {number} sectionId - Section database ID
 * @param {string} entryId - Entry UUID to update
 * @param {object} updates - Fields to update
 * @returns {object} Updated entry
 */
function updateEntry(sectionId, entryId, updates) {
  const db = getDb();

  try {
    const log = db.prepare(`
      SELECT * FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    if (!log) {
      throw new Error('Log not found');
    }

    const entries = JSON.parse(log.entries || '[]');
    const entryIndex = entries.findIndex(e => e.id === entryId);

    if (entryIndex === -1) {
      throw new Error('Entry not found');
    }

    // Update fields
    if (updates.type) {
      if (!LOG_ENTRY_TYPES.includes(updates.type)) {
        throw new Error(`Invalid entry type: ${updates.type}`);
      }
      entries[entryIndex].type = updates.type;
    }
    if (updates.original) entries[entryIndex].original = updates.original;
    if (updates.changedTo) entries[entryIndex].changedTo = updates.changedTo;
    if (updates.reason) entries[entryIndex].reason = updates.reason;
    if (updates.location !== undefined) entries[entryIndex].location = updates.location;

    entries[entryIndex].updatedAt = new Date().toISOString();

    // Save
    db.prepare(`
      UPDATE localization_logs
      SET entries = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(entries), log.id);

    db.close();

    return entries[entryIndex];
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Remove an entry from a log
 *
 * @param {number} sectionId - Section database ID
 * @param {string} entryId - Entry UUID to remove
 * @returns {boolean} Success
 */
function removeEntry(sectionId, entryId) {
  const db = getDb();

  try {
    const log = db.prepare(`
      SELECT * FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    if (!log) {
      throw new Error('Log not found');
    }

    const entries = JSON.parse(log.entries || '[]');
    const newEntries = entries.filter(e => e.id !== entryId);

    if (newEntries.length === entries.length) {
      throw new Error('Entry not found');
    }

    db.prepare(`
      UPDATE localization_logs
      SET entries = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(newEntries), log.id);

    db.close();
    return true;
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get the localization log for a section
 *
 * @param {number} sectionId - Section database ID
 * @returns {object|null} Log with entries
 */
function getLog(sectionId) {
  const db = getDb();

  try {
    const log = db.prepare(`
      SELECT * FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    db.close();

    if (!log) return null;

    return {
      id: log.id,
      sectionId: log.section_id,
      localizer: log.localizer,
      entries: JSON.parse(log.entries || '[]'),
      createdAt: log.created_at,
      updatedAt: log.updated_at
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Bulk save entries (replaces all entries)
 *
 * @param {number} sectionId - Section database ID
 * @param {Array} entries - Array of entry objects
 * @param {string} localizer - User ID
 * @returns {object} Updated log
 */
function saveEntries(sectionId, entries, localizer) {
  // Validate all entries
  for (const entry of entries) {
    if (!LOG_ENTRY_TYPES.includes(entry.type)) {
      throw new Error(`Invalid entry type: ${entry.type}`);
    }
    if (!entry.original || !entry.changedTo || !entry.reason) {
      throw new Error('Each entry must include original, changedTo, and reason');
    }
  }

  const db = getDb();

  try {
    // Ensure each entry has an ID
    const processedEntries = entries.map(e => ({
      id: e.id || uuidv4(),
      timestamp: e.timestamp || new Date().toISOString(),
      type: e.type,
      original: e.original,
      changedTo: e.changedTo,
      reason: e.reason,
      location: e.location || null
    }));

    // Check for existing log
    const existing = db.prepare(`
      SELECT id FROM localization_logs WHERE section_id = ?
    `).get(sectionId);

    if (existing) {
      db.prepare(`
        UPDATE localization_logs
        SET entries = ?, localizer = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(processedEntries), localizer, existing.id);
    } else {
      db.prepare(`
        INSERT INTO localization_logs (section_id, localizer, entries)
        VALUES (?, ?, ?)
      `).run(sectionId, localizer, JSON.stringify(processedEntries));
    }

    db.close();

    return {
      sectionId,
      localizer,
      entries: processedEntries,
      totalEntries: processedEntries.length
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Get statistics for localization logs
 *
 * @param {number} bookId - Optional book ID to filter by
 * @returns {object} Statistics
 */
function getStats(bookId = null) {
  const db = getDb();

  try {
    let query = `
      SELECT
        COUNT(DISTINCT ll.section_id) as sections_with_logs,
        SUM(json_array_length(ll.entries)) as total_entries
      FROM localization_logs ll
    `;

    if (bookId) {
      query += `
        JOIN book_sections bs ON bs.id = ll.section_id
        WHERE bs.book_id = ?
      `;
    }

    const stats = bookId
      ? db.prepare(query).get(bookId)
      : db.prepare(query).get();

    // Get breakdown by type
    const logs = db.prepare(`
      SELECT entries FROM localization_logs
    `).all();

    const byType = {};
    for (const type of LOG_ENTRY_TYPES) {
      byType[type] = 0;
    }

    for (const log of logs) {
      const entries = JSON.parse(log.entries || '[]');
      for (const entry of entries) {
        if (byType[entry.type] !== undefined) {
          byType[entry.type]++;
        }
      }
    }

    db.close();

    return {
      sectionsWithLogs: stats?.sections_with_logs || 0,
      totalEntries: stats?.total_entries || 0,
      byType
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

module.exports = {
  getOrCreateLog,
  addEntry,
  updateEntry,
  removeEntry,
  getLog,
  saveEntries,
  getStats,
  LOG_ENTRY_TYPES
};
