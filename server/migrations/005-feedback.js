/**
 * Migration: Add Feedback Collection Tables
 *
 * Adds tables to support:
 * - User feedback from pilot users (teachers, students)
 * - Feedback responses from admins
 * - Analytics events for usage tracking
 */

module.exports = {
  name: '005-feedback',

  up(db) {
    // Create feedback table
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        book TEXT,
        chapter TEXT,
        section TEXT,
        message TEXT NOT NULL,
        user_email TEXT,
        user_name TEXT,
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'normal',
        assigned_to TEXT,
        resolved_by TEXT,
        resolved_by_name TEXT,
        resolution_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_status
        ON feedback(status);
      CREATE INDEX IF NOT EXISTS idx_feedback_type
        ON feedback(type);
      CREATE INDEX IF NOT EXISTS idx_feedback_book
        ON feedback(book);
      CREATE INDEX IF NOT EXISTS idx_feedback_created_at
        ON feedback(created_at);
    `);

    // Create feedback_responses table (for admin replies)
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_id INTEGER NOT NULL,
        responder_id TEXT NOT NULL,
        responder_name TEXT NOT NULL,
        message TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_responses_feedback
        ON feedback_responses(feedback_id);
    `);

    // Create analytics_events table (for usage tracking)
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        book TEXT,
        chapter TEXT,
        section TEXT,
        user_agent TEXT,
        referrer TEXT,
        session_id TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_events_type
        ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_book
        ON analytics_events(book);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
        ON analytics_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_session
        ON analytics_events(session_id);
    `);

    // Create trigger to update feedback.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_feedback_timestamp
        AFTER UPDATE ON feedback
        FOR EACH ROW
        BEGIN
          UPDATE feedback SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
  },
};
