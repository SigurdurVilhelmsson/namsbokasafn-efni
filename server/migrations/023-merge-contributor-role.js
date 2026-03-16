/**
 * Migration 023: Merge contributor role into editor
 *
 * The 5-tier role system (admin → head-editor → editor → contributor → viewer)
 * is too granular for a ~5 person team. This migration promotes all contributors
 * to editors, collapsing to a 4-tier model:
 *   admin (4) → head-editor (3) → editor (2) → viewer (1)
 */

module.exports = {
  id: '023-merge-contributor-role',

  up(db) {
    db.exec(`
      -- Promote all contributors to editors
      UPDATE users SET role = 'editor' WHERE role = 'contributor';

      -- Update book-level role assignments
      UPDATE user_book_access SET role_for_book = 'editor' WHERE role_for_book = 'contributor';
    `);
  },
};
