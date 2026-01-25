/**
 * Presence Store
 *
 * Tracks active editing sessions to show who is currently working
 * on each section. Helps prevent edit conflicts.
 *
 * Presence entries expire after PRESENCE_TIMEOUT to handle abandoned sessions.
 */

// In-memory store for presence data
// Format: { sectionKey: { userId: { userId, username, avatar, lastSeen } } }
const presence = new Map();

// Presence entries expire after 2 minutes of inactivity
const PRESENCE_TIMEOUT = 2 * 60 * 1000;

/**
 * Generate a unique key for a section
 */
function getSectionKey(book, chapter, section) {
  return `${book}:${chapter}:${section}`;
}

/**
 * Register or update presence for a user on a section
 *
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @param {object} user - User object
 * @param {string} user.id - User ID
 * @param {string} user.username - Username
 * @param {string} [user.avatar] - Avatar URL
 * @returns {object} Presence entry
 */
function setPresence(book, chapter, section, user) {
  const sectionKey = getSectionKey(book, chapter, section);

  if (!presence.has(sectionKey)) {
    presence.set(sectionKey, new Map());
  }

  const sectionPresence = presence.get(sectionKey);
  const userId = String(user.id);

  const entry = {
    userId,
    username: user.username || user.name || 'Unknown',
    avatar: user.avatar || null,
    lastSeen: Date.now(),
    book,
    chapter: String(chapter),
    section
  };

  sectionPresence.set(userId, entry);

  return entry;
}

/**
 * Remove presence for a user on a section
 *
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @param {string} userId - User ID
 * @returns {boolean} Whether presence was removed
 */
function removePresence(book, chapter, section, userId) {
  const sectionKey = getSectionKey(book, chapter, section);
  const sectionPresence = presence.get(sectionKey);

  if (!sectionPresence) {
    return false;
  }

  const removed = sectionPresence.delete(String(userId));

  // Clean up empty sections
  if (sectionPresence.size === 0) {
    presence.delete(sectionKey);
  }

  return removed;
}

/**
 * Get all active users on a section (excluding expired entries)
 *
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @param {string} [excludeUserId] - User ID to exclude from results
 * @returns {Array} Array of active presence entries
 */
function getPresence(book, chapter, section, excludeUserId = null) {
  const sectionKey = getSectionKey(book, chapter, section);
  const sectionPresence = presence.get(sectionKey);

  if (!sectionPresence) {
    return [];
  }

  const now = Date.now();
  const active = [];
  const expired = [];

  for (const [userId, entry] of sectionPresence) {
    // Check if entry has expired
    if (now - entry.lastSeen > PRESENCE_TIMEOUT) {
      expired.push(userId);
      continue;
    }

    // Exclude the requesting user
    if (excludeUserId && userId === String(excludeUserId)) {
      continue;
    }

    active.push(entry);
  }

  // Clean up expired entries
  for (const userId of expired) {
    sectionPresence.delete(userId);
  }

  // Clean up empty sections
  if (sectionPresence.size === 0) {
    presence.delete(sectionKey);
  }

  return active;
}

/**
 * Get all sections where a user has presence
 *
 * @param {string} userId - User ID
 * @returns {Array} Array of section keys
 */
function getUserPresence(userId) {
  const userIdStr = String(userId);
  const sections = [];

  for (const [sectionKey, sectionPresence] of presence) {
    if (sectionPresence.has(userIdStr)) {
      const entry = sectionPresence.get(userIdStr);
      sections.push({
        sectionKey,
        ...entry
      });
    }
  }

  return sections;
}

/**
 * Remove all presence for a user across all sections
 *
 * @param {string} userId - User ID
 * @returns {number} Number of sections cleared
 */
function clearUserPresence(userId) {
  const userIdStr = String(userId);
  let cleared = 0;

  for (const [sectionKey, sectionPresence] of presence) {
    if (sectionPresence.delete(userIdStr)) {
      cleared++;

      // Clean up empty sections
      if (sectionPresence.size === 0) {
        presence.delete(sectionKey);
      }
    }
  }

  return cleared;
}

/**
 * Get global presence stats
 *
 * @returns {object} Stats object
 */
function getStats() {
  let totalSections = 0;
  let totalUsers = 0;

  for (const sectionPresence of presence.values()) {
    totalSections++;
    totalUsers += sectionPresence.size;
  }

  return {
    activeSections: totalSections,
    activeUsers: totalUsers
  };
}

/**
 * Clean up all expired presence entries
 * Should be called periodically
 *
 * @returns {number} Number of entries cleaned
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;

  for (const [sectionKey, sectionPresence] of presence) {
    for (const [userId, entry] of sectionPresence) {
      if (now - entry.lastSeen > PRESENCE_TIMEOUT) {
        sectionPresence.delete(userId);
        cleaned++;
      }
    }

    // Clean up empty sections
    if (sectionPresence.size === 0) {
      presence.delete(sectionKey);
    }
  }

  return cleaned;
}

// Run cleanup every minute
setInterval(cleanup, 60 * 1000);

module.exports = {
  setPresence,
  removePresence,
  getPresence,
  getUserPresence,
  clearUserPresence,
  getStats,
  cleanup,
  PRESENCE_TIMEOUT
};
