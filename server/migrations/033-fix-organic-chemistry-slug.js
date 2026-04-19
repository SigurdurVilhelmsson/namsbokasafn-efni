/**
 * Migration 033: Fix organic chemistry slug (underscore → hyphen)
 *
 * The book was registered via the admin UI with slug 'lifraen_efnafraedi'
 * (underscore), but the canonical slug used in the filesystem and hardcoded
 * defaults is 'lifraen-efnafraedi' (hyphen). This mismatch causes the book
 * to appear twice in dropdown menus.
 *
 * Handles three possible DB states (since migration 029 may have inserted
 * a second row with the hyphenated slug):
 *   1. Both slugs exist → merge FK refs onto the richer row, delete the other
 *   2. Only underscore exists → simple rename
 *   3. Only hyphen exists → no-op
 */

module.exports = {
  name: '033-fix-organic-chemistry-slug',

  up(db) {
    const oldSlug = 'lifraen_efnafraedi';
    const newSlug = 'lifraen-efnafraedi';

    const oldRow = db
      .prepare('SELECT id, catalogue_id FROM registered_books WHERE slug = ?')
      .get(oldSlug);
    const newRow = db
      .prepare('SELECT id, catalogue_id FROM registered_books WHERE slug = ?')
      .get(newSlug);

    if (!oldRow && !newRow) return; // Neither exists
    if (!oldRow && newRow) return; // Already correct

    // Tables with column "book" (text slug)
    // Note: edit_history and pending_reviews were dropped by migrations 021/030.
    const bookTables = [
      'segment_edits',
      'module_reviews',
      'feedback',
      'analytics_events',
      'chapter_assignments',
      'localization_edits',
    ];

    // Tables with column "book_slug" (text slug)
    const bookSlugTables = [
      'chapter_generated_files',
      'chapter_generation_log',
      'user_book_access',
      'user_chapter_assignments',
    ];

    // Tables with column "book_id" (integer FK)
    // Note: terminology_terms was dropped by migration 032 and replaced with
    // terminology_headwords/translations/subjects — none of which use book_id.
    const bookIdTables = ['book_chapters', 'book_sections'];

    const fix = db.transaction(() => {
      if (oldRow && newRow) {
        // Both exist — keep the one with richer data (catalogue_id), delete the other
        const keepRow = oldRow.catalogue_id ? oldRow : newRow;
        const dropRow = oldRow.catalogue_id ? newRow : oldRow;

        // Move any FK references from the row we're dropping
        for (const table of bookIdTables) {
          db.prepare(`UPDATE ${table} SET book_id = ? WHERE book_id = ?`).run(
            keepRow.id,
            dropRow.id
          );
        }

        // Delete the empty row
        db.prepare('DELETE FROM registered_books WHERE id = ?').run(dropRow.id);

        // Ensure the surviving row has the correct hyphenated slug
        db.prepare('UPDATE registered_books SET slug = ? WHERE id = ?').run(newSlug, keepRow.id);
      } else {
        // Only oldRow exists — simple rename
        db.prepare('UPDATE registered_books SET slug = ? WHERE slug = ?').run(newSlug, oldSlug);
      }

      // Update text-slug references in all cases
      for (const table of bookTables) {
        db.prepare(`UPDATE ${table} SET book = ? WHERE book = ?`).run(newSlug, oldSlug);
      }
      for (const table of bookSlugTables) {
        db.prepare(`UPDATE ${table} SET book_slug = ? WHERE book_slug = ?`).run(newSlug, oldSlug);
      }
    });

    fix();
  },
};
