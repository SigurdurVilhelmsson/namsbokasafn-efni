/**
 * Migration: take ownership of service-created tables
 *
 * activity_log, notifications, and notification_preferences were created
 * only as an import-time side effect of activityLog.js / notifications.js.
 * The fail-loud sweep (batch 4) makes those services lazy-open, so the
 * schema moves here, where every other table is owned. IF NOT EXISTS +
 * verbatim table/index DDL keeps this a no-op on databases that already
 * have the tables.
 */

module.exports = {
  name: '040-service-table-ownership',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        book TEXT,
        chapter TEXT,
        section TEXT,
        description TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
      CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_log_book ON activity_log(book);
      CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        metadata TEXT,
        read INTEGER DEFAULT 0,
        email_sent INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

      -- Notification preferences table
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id TEXT PRIMARY KEY,
        preferences TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
