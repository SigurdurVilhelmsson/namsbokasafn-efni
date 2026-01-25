/**
 * Notes Store
 *
 * Personal notes for editors - private annotations that don't show up
 * in formal issue tracking or comments.
 *
 * Notes are stored per user, per section, allowing editors to save
 * quick reminders and working notes during their review process.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NOTES_FILE = path.join(DATA_DIR, 'personal-notes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load all notes from file
 */
function loadNotes() {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to load notes:', err);
  }
  return {};
}

/**
 * Save all notes to file
 */
function saveNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

/**
 * Generate a key for a section
 */
function getSectionKey(book, chapter, section) {
  return `${book}:${chapter}:${section}`;
}

/**
 * Get personal notes for a user on a specific section
 *
 * @param {string} userId - User ID (GitHub ID)
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @returns {object} Notes object with content, pinned status, and timestamps
 */
function getNote(userId, book, chapter, section) {
  const notes = loadNotes();
  const sectionKey = getSectionKey(book, chapter, section);

  if (!notes[userId] || !notes[userId][sectionKey]) {
    return {
      content: '',
      pinned: false,
      createdAt: null,
      updatedAt: null
    };
  }

  return notes[userId][sectionKey];
}

/**
 * Save personal note for a user on a specific section
 *
 * @param {string} userId - User ID (GitHub ID)
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @param {string} content - Note content
 * @param {boolean} [pinned=false] - Whether the note is pinned
 * @returns {object} The saved note
 */
function saveNote(userId, book, chapter, section, content, pinned = false) {
  const notes = loadNotes();
  const sectionKey = getSectionKey(book, chapter, section);

  if (!notes[userId]) {
    notes[userId] = {};
  }

  const existingNote = notes[userId][sectionKey];
  const now = new Date().toISOString();

  notes[userId][sectionKey] = {
    content: content || '',
    pinned: pinned,
    book,
    chapter: String(chapter),
    section,
    createdAt: existingNote?.createdAt || now,
    updatedAt: now
  };

  saveNotes(notes);

  return notes[userId][sectionKey];
}

/**
 * Delete a personal note
 *
 * @param {string} userId - User ID
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @returns {boolean} Whether a note was deleted
 */
function deleteNote(userId, book, chapter, section) {
  const notes = loadNotes();
  const sectionKey = getSectionKey(book, chapter, section);

  if (!notes[userId] || !notes[userId][sectionKey]) {
    return false;
  }

  delete notes[userId][sectionKey];
  saveNotes(notes);

  return true;
}

/**
 * Get all notes for a user across all sections
 *
 * @param {string} userId - User ID
 * @param {object} options - Filter options
 * @param {string} [options.book] - Filter by book
 * @param {string} [options.chapter] - Filter by chapter
 * @param {boolean} [options.pinnedOnly] - Only return pinned notes
 * @returns {Array} Array of notes with section info
 */
function getAllNotes(userId, options = {}) {
  const notes = loadNotes();
  const userNotes = notes[userId] || {};

  const result = [];

  for (const [sectionKey, note] of Object.entries(userNotes)) {
    // Filter by book
    if (options.book && note.book !== options.book) {
      continue;
    }

    // Filter by chapter
    if (options.chapter && note.chapter !== String(options.chapter)) {
      continue;
    }

    // Filter by pinned
    if (options.pinnedOnly && !note.pinned) {
      continue;
    }

    // Only include non-empty notes
    if (note.content && note.content.trim()) {
      result.push({
        sectionKey,
        ...note
      });
    }
  }

  // Sort by updatedAt (most recent first)
  result.sort((a, b) => {
    const aTime = new Date(a.updatedAt || 0).getTime();
    const bTime = new Date(b.updatedAt || 0).getTime();
    return bTime - aTime;
  });

  return result;
}

/**
 * Get count of notes for a user
 *
 * @param {string} userId - User ID
 * @returns {object} Count stats
 */
function getNotesCount(userId) {
  const notes = loadNotes();
  const userNotes = notes[userId] || {};

  let total = 0;
  let pinned = 0;

  for (const note of Object.values(userNotes)) {
    if (note.content && note.content.trim()) {
      total++;
      if (note.pinned) {
        pinned++;
      }
    }
  }

  return { total, pinned };
}

/**
 * Toggle pinned status for a note
 *
 * @param {string} userId - User ID
 * @param {string} book - Book ID
 * @param {number|string} chapter - Chapter number
 * @param {string} section - Section ID
 * @returns {boolean} New pinned status
 */
function togglePinned(userId, book, chapter, section) {
  const notes = loadNotes();
  const sectionKey = getSectionKey(book, chapter, section);

  if (!notes[userId] || !notes[userId][sectionKey]) {
    return false;
  }

  const newPinned = !notes[userId][sectionKey].pinned;
  notes[userId][sectionKey].pinned = newPinned;
  notes[userId][sectionKey].updatedAt = new Date().toISOString();

  saveNotes(notes);

  return newPinned;
}

module.exports = {
  getNote,
  saveNote,
  deleteNote,
  getAllNotes,
  getNotesCount,
  togglePinned
};
