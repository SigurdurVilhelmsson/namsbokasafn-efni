/**
 * Migration 016: Robust slug cleanup after efnafraedi → efnafraedi-2e rename
 *
 * Migration 015 may have failed silently if efnafraedi-2e already existed
 * (UNIQUE constraint on registered_books.slug). This migration handles
 * all possible DB states:
 *
 * - Both "efnafraedi" AND "efnafraedi-2e" exist → merge FK refs, delete old
 * - Only "efnafraedi" exists → rename to "efnafraedi-2e"
 * - Only "efnafraedi-2e" exists → no-op
 *
 * Also ensures title_is = 'Efnafræði 2e' in all cases.
 */

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

    if (!oldRow && newRow) {
      // Only new slug exists — just ensure title is correct
      db.prepare('UPDATE registered_books SET title_is = ? WHERE id = ?').run(newTitle, newRow.id);
      return;
    }

    // Tables with FK column "book" (text slug)
    // Note: sessions_backup is omitted — it only exists ephemerally during migration 001
    const bookTables = [
      'segment_edits',
      'module_reviews',
      'edit_history',
      'pending_reviews',
      'feedback',
      'analytics_events',
      'chapter_assignments',
      'localization_edits',
    ];

    // Tables with FK column "book_slug" (text slug)
    const bookSlugTables = [
      'chapter_generated_files',
      'chapter_generation_log',
      'user_book_access',
      'user_chapter_assignments',
    ];

    // Tables with FK column "book_id" (integer)
    const bookIdTables = ['book_chapters', 'book_sections', 'terminology_terms'];

    const cleanup = db.transaction(() => {
      if (oldRow && newRow) {
        // Both exist — merge: move FK references from old to new, then delete old
        const oldId = oldRow.id;
        const newId = newRow.id;

        for (const table of bookTables) {
          db.prepare(`UPDATE ${table} SET book = ? WHERE book = ?`).run(newSlug, oldSlug);
        }

        for (const table of bookSlugTables) {
          db.prepare(`UPDATE ${table} SET book_slug = ? WHERE book_slug = ?`).run(newSlug, oldSlug);
        }

        for (const table of bookIdTables) {
          db.prepare(`UPDATE ${table} SET book_id = ? WHERE book_id = ?`).run(newId, oldId);
        }

        // Delete the old entry
        db.prepare('DELETE FROM registered_books WHERE id = ?').run(oldId);

        // Ensure correct title
        db.prepare('UPDATE registered_books SET title_is = ? WHERE id = ?').run(newTitle, newId);
      } else if (oldRow && !newRow) {
        // Only old slug exists — safe to rename
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
      }
    });

    cleanup();
  },
};
