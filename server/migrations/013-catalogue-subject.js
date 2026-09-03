/**
 * Migration 013: Add subject column to openstax_catalogue
 *
 * Groups books by academic subject for the catalogue UI.
 * DEFAULT 'other' ensures existing rows get a value;
 * syncCatalogue() overwrites with correct values from PREDEFINED_BOOKS.
 */

module.exports = {
  name: '013-catalogue-subject',

  up(db) {
    db.exec(`ALTER TABLE openstax_catalogue ADD COLUMN subject TEXT DEFAULT 'other'`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_openstax_catalogue_subject ON openstax_catalogue(subject)`
    );
  },

  down(_db) {
    // SQLite doesn't support DROP COLUMN easily; recreate table if needed.
    // `_db` is deliberately underscore-prefixed: the body is a comment, so the
    // parameter is unused, and the eslint config allows unused args matching /^_/.
  },
};
