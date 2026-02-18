/**
 * User Management Service
 *
 * Handles user CRUD operations and in-app role management.
 * Users are authenticated via GitHub OAuth but roles are managed
 * in the local database rather than via GitHub teams.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

/**
 * Valid roles in hierarchy order
 */
const ROLES = {
  ADMIN: 'admin',
  HEAD_EDITOR: 'head-editor',
  EDITOR: 'editor',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 5,
  [ROLES.HEAD_EDITOR]: 4,
  [ROLES.EDITOR]: 3,
  [ROLES.CONTRIBUTOR]: 2,
  [ROLES.VIEWER]: 1,
};

/**
 * Get database connection
 */
function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return new Database(DB_PATH);
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
    db.close();
  }
}

/**
 * Find user by GitHub ID
 */
function findByGithubId(githubId) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db
      .prepare(
        `
      SELECT * FROM users WHERE github_id = ?
    `
      )
      .get(String(githubId));

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    db.close();
  }
}

/**
 * Find user by GitHub username
 */
function findByUsername(username) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const user = db
      .prepare(
        `
      SELECT * FROM users WHERE github_username = ?
    `
      )
      .get(username.toLowerCase());

    if (user) {
      user.bookAccess = getBookAccess(db, user.id);
    }

    return user;
  } finally {
    db.close();
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
    db.close();
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
    db.close();
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
      githubId,
      githubUsername,
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
      INSERT INTO users (github_id, github_username, display_name, avatar_url, email, role, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        String(githubId),
        githubUsername.toLowerCase(),
        displayName || githubUsername,
        avatarUrl || '',
        email || '',
        role,
        createdBy
      );

    return findById(result.lastInsertRowid);
  } finally {
    db.close();
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
    const allowedFields = ['display_name', 'avatar_url', 'email', 'role', 'is_active'];
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
        params.push(value);
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
    db.close();
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
    db.close();
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
    const validBookRoles = [ROLES.HEAD_EDITOR, ROLES.EDITOR, ROLES.CONTRIBUTOR];
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
    db.close();
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
    db.close();
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
    db.close();
  }
}

/**
 * Create or update user from GitHub OAuth
 * If user exists, update their info and return. If not, create with viewer role.
 */
function upsertFromGitHub(githubUser, options = {}) {
  if (!isUserTableReady()) return null;

  const db = getDb();
  try {
    const existing = db
      .prepare(
        `
      SELECT * FROM users WHERE github_id = ?
    `
      )
      .get(String(githubUser.id));

    if (existing) {
      // Update info but not role
      db.prepare(
        `
        UPDATE users
        SET display_name = ?, avatar_url = ?, email = ?, last_login_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(
        githubUser.name || githubUser.login,
        githubUser.avatar_url,
        githubUser.email || '',
        existing.id
      );

      return findById(existing.id);
    }

    // Create new user
    // If autoCreate is false, don't create (pending approval mode)
    if (options.autoCreate === false) {
      return null;
    }

    const defaultRole = options.defaultRole || ROLES.VIEWER;
    const result = db
      .prepare(
        `
      INSERT INTO users (github_id, github_username, display_name, avatar_url, email, role, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
      )
      .run(
        String(githubUser.id),
        githubUser.login.toLowerCase(),
        githubUser.name || githubUser.login,
        githubUser.avatar_url,
        githubUser.email || '',
        defaultRole
      );

    return findById(result.lastInsertRowid);
  } finally {
    db.close();
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
    db.close();
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
    db.close();
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
    db.close();
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
    db.close();
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
    db.close();
  }
}

module.exports = {
  // Query
  findByGithubId,
  findByUsername,
  findById,
  listUsers,
  isUserTableReady,

  // CRUD
  createUser,
  updateUser,
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
  upsertFromGitHub,
  updateLastLogin,

  // Role helpers
  getEffectiveRole,
  getHeadEditorBooks,
  ROLES,
  ROLE_HIERARCHY,
};
