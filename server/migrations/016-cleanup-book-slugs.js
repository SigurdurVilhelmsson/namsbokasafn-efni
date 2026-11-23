/**
 * Migration 016: Robust slug cleanup after efnafraedi → efnafraedi-2e rename
 *
 * Migration 015 may have failed silently if efnafraedi-2e already existed
 * (UNIQUE constraint on registered_books.slug). This migration handles
 * all possible DB states:
 *
 * - Only "efnafraedi" exists → rename to "efnafraedi-2e"
 * - "efnafraedi-2e" exists → the rename is done: ensure its title, leave any "efnafraedi" alone
 *
 * ⚠️ IT USED TO MERGE when both existed (move the old book's rows onto efnafraedi-2e, then delete it).
 * That cleaned up a historical double registration, but migrationRunner re-runs every migration on
 * every boot, so once the rename was done it swallowed any book an admin later registered as
 * "efnafraedi" (register §C250). A fresh database never registers "efnafraedi" (only 049 registers
 * efnafraedi-2e), and production ran the merge long ago, so an "efnafraedi" row beside efnafraedi-2e
 * is now a deliberate new book.
 */

const { tableExists } = require('../lib/migrationSchema');

module.exports = {
  name: '016-cleanup-book-slugs',

  up(db) {
    const oldSlug = 'efnafraedi';
    const newSlug = 'efnafraedi-2e';
    const newTitle = 'Efnafræði 2e';

    const oldRow = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(oldSlug);
    const newRow = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(newSlug);

    if (!oldRow && !newRow) {
      // Neither exists — nothing to do
      return;
    }

    if (newRow) {
      // The rename is done: ensure the title, and leave any `efnafraedi` row alone (see the header)
      db.prepare('UPDATE registered_books SET title_is = ? WHERE id = ?').run(newTitle, newRow.id);
      return;
    }

    // Tables with FK column "book" (text slug)
    // Note: sessions_backup is omitted — it only exists ephemerally during migration 001
    // Only tables that still exist: edit_history and pending_reviews (021) and terminology_terms (032)
    // are retired and no longer recreated on later boots (§C250), so an UPDATE on them would throw.
    const present = (tables) => tables.filter((t) => tableExists(db, t));

    const bookTables = present([
      'segment_edits',
      'module_reviews',
      'edit_history',
      'pending_reviews',
      'feedback',
      'analytics_events',
      'chapter_assignments',
      'localization_edits',
    ]);

    // Tables with FK column "book_slug" (text slug)
    const bookSlugTables = present([
      'chapter_generated_files',
      'chapter_generation_log',
      'user_book_access',
      'user_chapter_assignments',
    ]);

    const cleanup = db.transaction(() => {
      // Only the old slug exists — rename it
      db.prepare('UPDATE registered_books SET slug = ?, title_is = ? WHERE id = ?').run(
        newSlug,
        newTitle,
        oldRow.id
      );

      for (const table of bookTables) {
        db.prepare(`UPDATE ${table} SET book = ? WHERE book = ?`).run(newSlug, oldSlug);
      }

      for (const table of bookSlugTables) {
        db.prepare(`UPDATE ${table} SET book_slug = ? WHERE book_slug = ?`).run(newSlug, oldSlug);
      }
    });

    cleanup();
  },
};
