/**
 * User Management Service
 *
 * Handles user CRUD operations and in-app role management.
 * Users are authenticated via Microsoft Entra ID (Azure AD) but roles
 * are managed in the local database.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { ROLES, ROLE_HIERARCHY } = require('../constants');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

let _testDb = null;

function _setTestDb(db) {
  _testDb = db;
}

/**
 * Get database connection
 */
function getDb() {
  if (_testDb) return _testDb;
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
}

/**
 * Close database connection (skips closing if using test DB)
 */
function closeDb(db) {
  if (db && db !== _testDb) {
    db.close();
  }
}

/**
 * Check if the users table exists (migration has run)
 */
function isUserTableReady() {
  const db = getDb();
  try {
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    return !!result;
  } finally {
    closeDb(db);
  }
}

/**
 * Find user by provider ID (Microsoft Entra object ID)
 */
function findByProviderId(providerId) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM users WHERE provider_id = ?').get(String(providerId));

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    closeDb(db);
  }
}

/**
 * Find user by username (provider_username column)
 */
function findByUsername(username) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db
      .prepare('SELECT * FROM users WHERE provider_username = ?')
      .get(username.toLowerCase());

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    closeDb(db);
  }
}

/**
 * Find user by email address
 */
function findByEmail(email) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    closeDb(db);
  }
}

/**
 * Update provider info (used when matching by email on first Microsoft login)
 */
function updateProviderInfo(userId, providerId, email) {
  if (!isUserTableReady()) return;

  const db = getDb();
  try {
    db.prepare('UPDATE users SET provider_id = ?, email = ? WHERE id = ?').run(
      String(providerId),
      email.toLowerCase(),
      userId
    );
  } finally {
    closeDb(db);
  }
}

/**
 * Find user by ID
 */
function findById(id) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db
      .prepare(
        `
      SELECT * FROM users WHERE id = ?
    `
      )
      .get(id);

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    closeDb(db);
  }
}

/**
 * Get book access for a user
 */
function getBookAccess(db, userId) {
  const rows = db
    .prepare(
      `
    SELECT book_slug, role_for_book
    FROM user_book_access
    WHERE user_id = ?
  `
    )
    .all(userId);

  return rows.map((r) => ({
    book: r.book_slug,
    role: r.role_for_book,
  }));
}

/**
 * List all users
 */
function listUsers(options = {}) {
  if (!isUserTableReady()) return { users: [], total: 0 };

  const db = getDb();
  try {
    const { role, isActive, limit = 100, offset = 0 } = options;

    let whereClause = '1=1';
    const params = [];

    if (role) {
      whereClause += ' AND role = ?';
      params.push(role);
    }

    if (typeof isActive === 'boolean') {
      whereClause += ' AND is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    const total = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM users WHERE ${whereClause}
    `
      )
      .get(...params).count;

    const users = db
      .prepare(
        `
      SELECT * FROM users
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...params, limit, offset);

    // Add book access to each user
    for (const user of users) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return { users, total };
  } finally {
    closeDb(db);
  }
}

/**
 * Create a new user
 */
function createUser(userData, createdBy = null) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    const {
      providerId,
      providerUsername,
      displayName,
      avatarUrl,
      email,
      role = ROLES.VIEWER,
    } = userData;

    // Validate role
    if (!Object.values(ROLES).includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    const result = db
      .prepare(
        `
      INSERT INTO users (provider_id, provider_username, display_name, avatar_url, email, role, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        providerId ? String(providerId) : null,
        providerUsername.toLowerCase(),
        displayName || providerUsername,
        avatarUrl || '',
        email || '',
        role,
        createdBy
      );

    return findById(result.lastInsertRowid);
  } finally {
    closeDb(db);
  }
}

/**
 * Update user
 */
function updateUser(id, updates, _updatedBy = null) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    const allowedFields = [
      'display_name',
      'avatar_url',
      'email',
      'role',
      'is_active',
      'school',
      'subject',
      'bio',
    ];
    const setClause = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        // Validate role if updating
        if (snakeKey === 'role' && !Object.values(ROLES).includes(value)) {
          throw new Error(`Invalid role: ${value}`);
        }
        setClause.push(`${snakeKey} = ?`);
        // SQLite can't bind booleans — coerce is_active to integer
        if (snakeKey === 'is_active' && typeof value === 'boolean') {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    }

    if (setClause.length === 0) {
      return findById(id);
    }

    params.push(id);
    db.prepare(
      `
      UPDATE users SET ${setClause.join(', ')} WHERE id = ?
    `
    ).run(...params);

    return findById(id);
  } finally {
    closeDb(db);
  }
}

/**
 * Delete user (soft delete - sets is_active = false)
 */
function deactivateUser(id) {
  return updateUser(id, { isActive: false });
}

/**
 * Reactivate user
 */
function reactivateUser(id) {
  return updateUser(id, { isActive: true });
}

/**
 * Hard delete user
 */
function deleteUser(id) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    // Book access is deleted via CASCADE
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return true;
  } finally {
    closeDb(db);
  }
}

/**
 * Assign book access to user
 */
function assignBookAccess(userId, bookSlug, roleForBook, assignedBy = null) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    // Validate role
    const validBookRoles = [ROLES.HEAD_EDITOR, ROLES.EDITOR];
    if (!validBookRoles.includes(roleForBook)) {
      throw new Error(
        `Invalid book role: ${roleForBook}. Must be one of: ${validBookRoles.join(', ')}`
      );
    }

    // Upsert
    db.prepare(
      `
      INSERT INTO user_book_access (user_id, book_slug, role_for_book, assigned_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_slug)
      DO UPDATE SET role_for_book = excluded.role_for_book, assigned_by = excluded.assigned_by, assigned_at = CURRENT_TIMESTAMP
    `
    ).run(userId, bookSlug, roleForBook, assignedBy);

    // Send notification (async, don't block)
    try {
      const notifications = require('./notifications');
      notifications
        .notifyBookAccessAssigned(userId, bookSlug, roleForBook, assignedBy || 'kerfi')
        .catch((err) => console.error('Failed to send book access notification:', err.message));
    } catch (notifyErr) {
      console.error('Failed to notify book access:', notifyErr.message);
    }

    return findById(userId);
  } finally {
    closeDb(db);
  }
}

/**
 * Remove book access from user
 */
function removeBookAccess(userId, bookSlug) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    db.prepare(
      `
      DELETE FROM user_book_access WHERE user_id = ? AND book_slug = ?
    `
    ).run(userId, bookSlug);

    return findById(userId);
  } finally {
    closeDb(db);
  }
}

/**
 * Update last login timestamp
 */
function updateLastLogin(id) {
  if (!isUserTableReady()) return;

  const db = getDb();
  try {
    db.prepare(
      `
      UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
    `
    ).run(id);
  } finally {
    closeDb(db);
  }
}

/**
 * Create or update user from OAuth provider (Microsoft Entra ID)
 * If user exists (by provider_id or email), update their info and return.
 * If not, create with viewer role.
 */
function upsertFromProvider(providerUser, options = {}) {
  if (!isUserTableReady()) return null;

  const email = (providerUser.mail || providerUser.userPrincipalName || '').toLowerCase();
  const displayName = providerUser.displayName || email;

  const db = getDb();
  try {
    // Find by provider_id first, then by email
    let existing = db
      .prepare('SELECT * FROM users WHERE provider_id = ?')
      .get(String(providerUser.id));

    if (!existing && email) {
      existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    if (existing) {
      // Update info but not role
      db.prepare(
        `
        UPDATE users
        SET display_name = ?, provider_id = ?, email = ?, last_login_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(displayName, String(providerUser.id), email, existing.id);

      return findById(existing.id);
    }

    // Create new user
    if (options.autoCreate === false) {
      return null;
    }

    const defaultRole = options.defaultRole || ROLES.VIEWER;
    const result = db
      .prepare(
        `
      INSERT INTO users (provider_id, provider_username, display_name, email, role, last_login_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
      )
      .run(String(providerUser.id), email, displayName, email, defaultRole);

    return findById(result.lastInsertRowid);
  } finally {
    closeDb(db);
  }
}

/**
 * Get user's effective role (including book-specific roles)
 */
function getEffectiveRole(user, bookSlug = null) {
  if (!user) return null;

  // Base role
  let effectiveRole = user.role;

  // Check book-specific role if book is specified
  if (bookSlug && user.bookAccess) {
    const bookRole = user.bookAccess.find((ba) => ba.book === bookSlug);
    if (bookRole) {
      // Use higher of base role and book role
      if (ROLE_HIERARCHY[bookRole.role] > ROLE_HIERARCHY[effectiveRole]) {
        effectiveRole = bookRole.role;
      }
    }
  }

  return effectiveRole;
}

/**
 * Get books where user is head editor
 */
function getHeadEditorBooks(user) {
  if (!user || !user.bookAccess) return [];

  return user.bookAccess.filter((ba) => ba.role === ROLES.HEAD_EDITOR).map((ba) => ba.book);
}

// ================================================================
// CHAPTER ASSIGNMENTS
// ================================================================

/**
 * Check if user has access to a specific chapter.
 * Backward compat: if user has NO assignments for the book, they can access all chapters.
 */
function hasChapterAccess(userId, bookSlug, chapter) {
  if (!isUserTableReady()) return true;

  const db = getDb();
  try {
    const count = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ?'
      )
      .get(userId, bookSlug);

    // No assignments for this book = full access (backward compat)
    if (!count || count.cnt === 0) return true;

    const assignment = db
      .prepare(
        'SELECT id FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ? AND chapter = ?'
      )
      .get(userId, bookSlug, parseInt(chapter, 10));

    return !!assignment;
  } catch (err) {
    // Table might not exist yet — allow access
    if (err.message && err.message.includes('no such table')) return true;
    throw err;
  } finally {
    closeDb(db);
  }
}

/**
 * Assign a chapter to a user
 */
function assignChapter(userId, bookSlug, chapter, assignedBy = null) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    db.prepare(
      `
      INSERT OR IGNORE INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by)
      VALUES (?, ?, ?, ?)
    `
    ).run(userId, bookSlug, parseInt(chapter, 10), assignedBy);
  } finally {
    closeDb(db);
  }
}

/**
 * Remove a chapter assignment
 */
function removeChapterAssignment(userId, bookSlug, chapter) {
  if (!isUserTableReady()) {
    throw new Error('User management not available - run migrations first');
  }

  const db = getDb();
  try {
    db.prepare(
      'DELETE FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ? AND chapter = ?'
    ).run(userId, bookSlug, parseInt(chapter, 10));
  } finally {
    closeDb(db);
  }
}

/**
 * Get all chapter assignments for a user in a book
 */
function getChapterAssignments(userId, bookSlug) {
  if (!isUserTableReady()) return [];

  const db = getDb();
  try {
    return db
      .prepare(
        'SELECT * FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ? ORDER BY chapter'
      )
      .all(userId, bookSlug);
  } catch (err) {
    if (err.message && err.message.includes('no such table')) return [];
    throw err;
  } finally {
    closeDb(db);
  }
}

/**
 * Get all chapter assignments for a user across all books
 */
function getAllChapterAssignments(userId) {
  if (!isUserTableReady()) return [];

  const db = getDb();
  try {
    return db
      .prepare(
        'SELECT * FROM user_chapter_assignments WHERE user_id = ? ORDER BY book_slug, chapter'
      )
      .all(userId);
  } catch (err) {
    if (err.message && err.message.includes('no such table')) return [];
    throw err;
  } finally {
    closeDb(db);
  }
}

module.exports = {
  // Query
  findByProviderId,
  findByUsername,
  findByEmail,
  findById,
  listUsers,
  isUserTableReady,

  // CRUD
  createUser,
  updateUser,
  updateProviderInfo,
  deactivateUser,
  reactivateUser,
  deleteUser,

  // Book access
  assignBookAccess,
  removeBookAccess,

  // Chapter assignments
  hasChapterAccess,
  assignChapter,
  removeChapterAssignment,
  getChapterAssignments,
  getAllChapterAssignments,

  // Auth integration
  upsertFromProvider,
  updateLastLogin,

  // Role helpers
  getEffectiveRole,
  getHeadEditorBooks,
  ROLES,
  ROLE_HIERARCHY,

  // Test helpers
  _setTestDb,
};
