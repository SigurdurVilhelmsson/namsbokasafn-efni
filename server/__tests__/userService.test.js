/**
 * userService unit tests
 *
 * Uses in-memory SQLite via _setTestDb to avoid touching the real database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const userService = require('../services/userService');
const { ROLES } = require('../constants');

let db;

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT,
    provider_username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    is_active INTEGER NOT NULL DEFAULT 1,
    school TEXT,
    subject TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,
    created_by TEXT
  );

  CREATE TABLE user_book_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_slug TEXT NOT NULL,
    role_for_book TEXT NOT NULL,
    assigned_by TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, book_slug)
  );

  CREATE TABLE user_chapter_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_slug TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    assigned_by TEXT,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, book_slug, chapter)
  );
`;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  userService._setTestDb(db);
});

afterAll(() => {
  userService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM user_chapter_assignments');
  db.exec('DELETE FROM user_book_access');
  db.exec('DELETE FROM users');
});

/** Helper to insert a user directly and return the id */
function seedUser(overrides = {}) {
  const defaults = {
    provider_id: 'prov-1',
    provider_username: 'testuser',
    display_name: 'Test User',
    avatar_url: '',
    email: 'test@example.com',
    role: ROLES.VIEWER,
    is_active: 1,
  };
  const u = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `INSERT INTO users (provider_id, provider_username, display_name, avatar_url, email, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      u.provider_id,
      u.provider_username,
      u.display_name,
      u.avatar_url,
      u.email,
      u.role,
      u.is_active
    );
  return result.lastInsertRowid;
}

// ────────────────────────────────────────────────────────────────────
// Find functions
// ────────────────────────────────────────────────────────────────────

describe('findByProviderId', () => {
  it('returns user when found', () => {
    seedUser({ provider_id: 'abc-123' });
    const user = userService.findByProviderId('abc-123');
    expect(user).not.toBeNull();
    expect(user.provider_id).toBe('abc-123');
  });

  it('returns undefined when not found', () => {
    const user = userService.findByProviderId('nonexistent');
    expect(user).toBeUndefined();
  });
});

describe('findByUsername', () => {
  it('finds user (case insensitive storage)', () => {
    seedUser({ provider_username: 'janedoe' });
    const user = userService.findByUsername('janedoe');
    expect(user).not.toBeNull();
    expect(user.provider_username).toBe('janedoe');
  });
});

describe('findById', () => {
  it('returns user with bookAccess populated', () => {
    const id = seedUser();
    db.prepare(
      `INSERT INTO user_book_access (user_id, book_slug, role_for_book) VALUES (?, ?, ?)`
    ).run(id, 'efnafraedi-2e', ROLES.EDITOR);

    const user = userService.findById(id);
    expect(user).not.toBeNull();
    expect(user.bookAccess).toHaveLength(1);
    expect(user.bookAccess[0]).toEqual({ book: 'efnafraedi-2e', role: ROLES.EDITOR });
  });
});

describe('findByEmail', () => {
  it('finds user by email', () => {
    seedUser({ email: 'anna@hi.is' });
    const user = userService.findByEmail('anna@hi.is');
    expect(user).not.toBeNull();
    expect(user.email).toBe('anna@hi.is');
  });
});

// ────────────────────────────────────────────────────────────────────
// createUser / upsertFromProvider
// ────────────────────────────────────────────────────────────────────

describe('createUser', () => {
  it('creates user with default viewer role', () => {
    const user = userService.createUser({
      providerId: 'new-prov',
      providerUsername: 'newuser',
      displayName: 'New User',
      email: 'new@example.com',
    });
    expect(user.role).toBe(ROLES.VIEWER);
    expect(user.provider_username).toBe('newuser');
  });

  it('creates user with explicit role', () => {
    const user = userService.createUser({
      providerId: 'editor-prov',
      providerUsername: 'editoruser',
      role: ROLES.EDITOR,
    });
    expect(user.role).toBe(ROLES.EDITOR);
  });

  it('throws on invalid role', () => {
    expect(() =>
      userService.createUser({
        providerId: 'bad-role',
        providerUsername: 'baduser',
        role: 'superadmin',
      })
    ).toThrow('Invalid role');
  });
});

describe('upsertFromProvider', () => {
  it('creates new user on first login', () => {
    const user = userService.upsertFromProvider({
      id: 'ms-object-id-1',
      displayName: 'First Login',
      mail: 'first@example.com',
    });
    expect(user).not.toBeNull();
    expect(user.provider_id).toBe('ms-object-id-1');
    expect(user.role).toBe(ROLES.VIEWER);
  });

  it('updates display_name on subsequent login without changing role', () => {
    // First login
    userService.upsertFromProvider({
      id: 'ms-object-id-2',
      displayName: 'Original Name',
      mail: 'repeat@example.com',
    });

    // Manually set role to editor
    const firstUser = userService.findByProviderId('ms-object-id-2');
    userService.updateUser(firstUser.id, { role: ROLES.EDITOR });

    // Second login with different display name
    const updated = userService.upsertFromProvider({
      id: 'ms-object-id-2',
      displayName: 'Updated Name',
      mail: 'repeat@example.com',
    });

    expect(updated.display_name).toBe('Updated Name');
    expect(updated.role).toBe(ROLES.EDITOR); // role unchanged
  });
});

// ────────────────────────────────────────────────────────────────────
// updateUser
// ────────────────────────────────────────────────────────────────────

describe('updateUser', () => {
  it('updates role field', () => {
    const id = seedUser();
    const updated = userService.updateUser(id, { role: ROLES.EDITOR });
    expect(updated.role).toBe(ROLES.EDITOR);
  });

  it('throws on invalid role value', () => {
    const id = seedUser();
    expect(() => userService.updateUser(id, { role: 'overlord' })).toThrow('Invalid role');
  });

  it('returns unchanged user when no valid fields provided', () => {
    const id = seedUser({ display_name: 'Unchanged' });
    const result = userService.updateUser(id, { foo: 'bar' });
    expect(result.display_name).toBe('Unchanged');
  });
});

// ────────────────────────────────────────────────────────────────────
// listUsers
// ────────────────────────────────────────────────────────────────────

describe('listUsers', () => {
  it('lists all users', () => {
    seedUser({ provider_username: 'user1', provider_id: 'p1' });
    seedUser({ provider_username: 'user2', provider_id: 'p2' });
    const { users, total } = userService.listUsers();
    expect(total).toBe(2);
    expect(users).toHaveLength(2);
  });

  it('filters by role', () => {
    seedUser({ provider_username: 'viewer1', provider_id: 'p1', role: ROLES.VIEWER });
    seedUser({ provider_username: 'editor1', provider_id: 'p2', role: ROLES.EDITOR });
    const { users, total } = userService.listUsers({ role: ROLES.EDITOR });
    expect(total).toBe(1);
    expect(users[0].role).toBe(ROLES.EDITOR);
  });

  it('filters by isActive', () => {
    seedUser({ provider_username: 'active1', provider_id: 'p1', is_active: 1 });
    seedUser({ provider_username: 'inactive1', provider_id: 'p2', is_active: 0 });
    const { users, total } = userService.listUsers({ isActive: true });
    expect(total).toBe(1);
    expect(users[0].is_active).toBe(1);
  });

  it('supports pagination and returns total count', () => {
    for (let i = 0; i < 5; i++) {
      seedUser({ provider_username: `page-${i}`, provider_id: `pp-${i}` });
    }
    const { users, total } = userService.listUsers({ limit: 2, offset: 0 });
    expect(total).toBe(5);
    expect(users).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// deactivate / reactivate / delete
// ────────────────────────────────────────────────────────────────────

describe('deactivateUser', () => {
  it('sets is_active = 0', () => {
    const id = seedUser();
    const user = userService.deactivateUser(id);
    expect(user.is_active).toBe(0);
  });
});

describe('reactivateUser', () => {
  it('sets is_active = 1', () => {
    const id = seedUser({ is_active: 0 });
    const user = userService.reactivateUser(id);
    expect(user.is_active).toBe(1);
  });
});

describe('deleteUser', () => {
  it('removes user from DB', () => {
    const id = seedUser();
    userService.deleteUser(id);
    const user = userService.findById(id);
    expect(user).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Book access CRUD
// ────────────────────────────────────────────────────────────────────

describe('assignBookAccess', () => {
  it('adds access record', () => {
    const id = seedUser();
    const user = userService.assignBookAccess(id, 'efnafraedi-2e', ROLES.EDITOR);
    expect(user.bookAccess).toContainEqual({ book: 'efnafraedi-2e', role: ROLES.EDITOR });
  });

  it('upserts on same book (updates role)', () => {
    const id = seedUser();
    userService.assignBookAccess(id, 'efnafraedi-2e', ROLES.EDITOR);
    const user = userService.assignBookAccess(id, 'efnafraedi-2e', ROLES.HEAD_EDITOR);
    const match = user.bookAccess.find((ba) => ba.book === 'efnafraedi-2e');
    expect(match.role).toBe(ROLES.HEAD_EDITOR);
  });

  it('throws on invalid book role', () => {
    const id = seedUser();
    expect(() => userService.assignBookAccess(id, 'efnafraedi-2e', ROLES.VIEWER)).toThrow(
      'Invalid book role'
    );
  });
});

describe('removeBookAccess', () => {
  it('removes record', () => {
    const id = seedUser();
    userService.assignBookAccess(id, 'efnafraedi-2e', ROLES.EDITOR);
    const user = userService.removeBookAccess(id, 'efnafraedi-2e');
    expect(user.bookAccess).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// getEffectiveRole
// ────────────────────────────────────────────────────────────────────

describe('getEffectiveRole', () => {
  it('returns base role when no book access', () => {
    const role = userService.getEffectiveRole(
      { role: ROLES.VIEWER, bookAccess: [] },
      'efnafraedi-2e'
    );
    expect(role).toBe(ROLES.VIEWER);
  });

  it('returns book role when higher than base role', () => {
    const role = userService.getEffectiveRole(
      {
        role: ROLES.VIEWER,
        bookAccess: [{ book: 'efnafraedi-2e', role: ROLES.EDITOR }],
      },
      'efnafraedi-2e'
    );
    expect(role).toBe(ROLES.EDITOR);
  });

  it('returns base role when base role is higher', () => {
    const role = userService.getEffectiveRole(
      {
        role: ROLES.ADMIN,
        bookAccess: [{ book: 'efnafraedi-2e', role: ROLES.EDITOR }],
      },
      'efnafraedi-2e'
    );
    expect(role).toBe(ROLES.ADMIN);
  });
});

// ────────────────────────────────────────────────────────────────────
// Chapter assignments
// ────────────────────────────────────────────────────────────────────

describe('chapter assignments', () => {
  it('hasChapterAccess returns true when no assignments (backward compat)', () => {
    const id = seedUser();
    const result = userService.hasChapterAccess(id, 'efnafraedi-2e', 1);
    expect(result).toBe(true);
  });

  it('assignChapter + hasChapterAccess returns true for assigned chapter', () => {
    const id = seedUser();
    userService.assignChapter(id, 'efnafraedi-2e', 3, 'admin');
    const result = userService.hasChapterAccess(id, 'efnafraedi-2e', 3);
    expect(result).toBe(true);
  });

  it('hasChapterAccess returns false for non-assigned chapter when assignments exist', () => {
    const id = seedUser();
    userService.assignChapter(id, 'efnafraedi-2e', 3, 'admin');
    const result = userService.hasChapterAccess(id, 'efnafraedi-2e', 5);
    expect(result).toBe(false);
  });
});
