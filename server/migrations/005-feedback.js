/**
 * Migration: Add Feedback Collection Tables
 *
 * Adds tables to support:
 * - User feedback from pilot users (teachers, students)
 * - Feedback responses from admins
 * - Analytics events for usage tracking
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
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feedback'").get();

    if (tables) {
      console.log('Migration 005-feedback already applied');
      db.close();
      return { success: true, alreadyApplied: true };
    }

    console.log('Applying migration: Adding feedback and analytics tables...');

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
    console.log('  Created feedback table');

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
    console.log('  Created feedback_responses table');

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
    console.log('  Created analytics_events table');

    // Create trigger to update feedback.updated_at
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_feedback_timestamp
        AFTER UPDATE ON feedback
        FOR EACH ROW
        BEGIN
          UPDATE feedback SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
    console.log('  Created update timestamp trigger');

    console.log('Migration 005-feedback completed successfully');
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
    console.log('Rolling back migration: Removing feedback and analytics tables...');

    db.exec(`
      DROP TRIGGER IF EXISTS update_feedback_timestamp;
      DROP TABLE IF EXISTS analytics_events;
      DROP TABLE IF EXISTS feedback_responses;
      DROP TABLE IF EXISTS feedback;
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
