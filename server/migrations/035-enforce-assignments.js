/**
 * Migration 035: per-book chapter-assignment enforcement toggle
 *
 * Adds `enforce_assignments` to the shared `book_settings` table (introduced in
 * migration 034). When ON for a book, `userService.hasChapterAccess` switches
 * from fail-open (no assignment = full access) to default-deny — an editor may
 * only touch chapters explicitly assigned to them. OFF by default, so existing
 * books keep working until a lead opts in.
 *
 * Idempotent: book_settings is created if missing, and the ADD COLUMN is a
 * no-op on re-run (the runner treats "duplicate column" as skipped).
 */

module.exports = {
  name: '035-enforce-assignments',

  up(db) {
    // book_settings may already exist from migration 034; ensure it does.
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_settings (
        book TEXT PRIMARY KEY,
        enforce_localization_review INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec(`ALTER TABLE book_settings ADD COLUMN enforce_assignments INTEGER NOT NULL DEFAULT 0;`);
  },
};
