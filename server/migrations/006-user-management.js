/**
 * Migration: Add User Management Tables
 *
 * Adds tables to support in-app role management:
 * - Users table for storing user info and roles
 * - User book access table for book-level permissions
 *
 * This allows managing user roles in-app instead of via GitHub teams.
 */

module.exports = {
  name: '006-user-management',

  up(db) {
    // Create users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id TEXT UNIQUE NOT NULL,
        github_username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'viewer',
        is_active BOOLEAN DEFAULT 1,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_users_github_id
        ON users(github_id);
      CREATE INDEX IF NOT EXISTS idx_users_github_username
        ON users(github_username);
      CREATE INDEX IF NOT EXISTS idx_users_role
        ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_is_active
        ON users(is_active);
    `);

    // Create user_book_access table for book-level permissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_book_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_slug TEXT NOT NULL,
        role_for_book TEXT NOT NULL,
        assigned_by TEXT,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, book_slug)
      );

      CREATE INDEX IF NOT EXISTS idx_user_book_access_user
        ON user_book_access(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_book_access_book
        ON user_book_access(book_slug);
    `);

    // Create trigger to update users.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_users_timestamp
        AFTER UPDATE ON users
        FOR EACH ROW
        BEGIN
          UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
  },
};
