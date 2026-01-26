/**
 * Migration: Add User Management Tables
 *
 * Adds tables to support in-app role management:
 * - Users table for storing user info and roles
 * - User book access table for book-level permissions
 *
 * This allows managing user roles in-app instead of via GitHub teams.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');

function migrate() {
  // Ensure database directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  try {
    // Check if migration is already applied
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

    if (tables) {
      console.log('Migration 006-user-management already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding user management tables...');

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
    console.log('  Created users table');

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
    console.log('  Created user_book_access table');

    // Create trigger to update users.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_users_timestamp
        AFTER UPDATE ON users
        FOR EACH ROW
        BEGIN
          UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
    console.log('  Created update timestamp trigger');

    console.log('Migration 006-user-management completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Migration failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

function rollback() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database does not exist, nothing to rollback');
    return { success: true };
  }

  const db = new Database(DB_PATH);

  try {
    console.log('Rolling back migration: Removing user management tables...');

    db.exec(`
      DROP TRIGGER IF EXISTS update_users_timestamp;
      DROP TABLE IF EXISTS user_book_access;
      DROP TABLE IF EXISTS users;
    `);

    console.log('Rollback completed successfully');
    db.close();

    return { success: true };
  } catch (err) {
    console.error('Rollback failed:', err.message);
    db.close();
    return { success: false, error: err.message };
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--rollback')) {
    rollback();
  } else {
    migrate();
  }
}

module.exports = { migrate, rollback };
