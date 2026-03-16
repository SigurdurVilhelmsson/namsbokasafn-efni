/**
 * Migration 022: Rename GitHub-specific columns to generic provider columns
 *
 * Prepares the users table for Microsoft Entra ID authentication by renaming:
 *   - github_id → provider_id
 *   - github_username → provider_username
 *
 * Also adds profile columns: school, subject, bio
 *
 * SQLite does not support ALTER TABLE RENAME COLUMN in older versions,
 * so we recreate the table with the new column names.
 */

module.exports = {
  name: '022-provider-auth',

  up(db) {
    // Check if migration already applied (new column exists)
    const columns = db.prepare("PRAGMA table_info('users')").all();
    const hasProviderCol = columns.some((c) => c.name === 'provider_id');

    if (hasProviderCol) {
      console.log('Migration 022: already applied (provider_id column exists)');
      return;
    }

    // Check that users table exists
    const hasTable = columns.length > 0;
    if (!hasTable) {
      console.log('Migration 022: users table does not exist yet, skipping');
      return;
    }

    db.exec('PRAGMA foreign_keys = OFF');

    db.transaction(() => {
      // Create new table with renamed columns + profile fields
      db.exec(`
        CREATE TABLE users_new (
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
      `);

      // Copy data from old table
      db.exec(`
        INSERT INTO users_new (
          id, provider_id, provider_username, display_name, avatar_url,
          email, role, is_active, created_at, updated_at, last_login_at, created_by
        )
        SELECT
          id, github_id, github_username, display_name, avatar_url,
          email, role, is_active, created_at, updated_at, last_login_at, created_by
        FROM users;
      `);

      // Drop old table and rename
      db.exec('DROP TABLE users;');
      db.exec('ALTER TABLE users_new RENAME TO users;');

      // Recreate indexes
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_username ON users(provider_username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);
    })();

    db.exec('PRAGMA foreign_keys = ON');

    console.log(
      'Migration 022: renamed github_id/github_username → provider_id/provider_username, added profile columns'
    );
  },
};
