/**
 * Migration 028: Add idordabanki_id column to terminology_terms
 *
 * Adds an external reference column for Íðorðabankinn entry IDs.
 * Enables reliable deduplication on re-import from Íðorðabankinn API.
 *
 * The column is nullable since most existing terms don't come from this source.
 * Also added by fetch_idordabanki.py (ensure_idordabanki_id_column),
 * but this migration ensures it's tracked in the migration system.
 */

module.exports = {
  id: '028-idordabanki-id',

  up(db) {
    const columns = db.pragma('table_info(terminology_terms)');
    const hasColumn = columns.some((c) => c.name === 'idordabanki_id');

    if (hasColumn) {
      console.log('Migration 028: idordabanki_id column already exists');
      return;
    }

    console.log('Applying migration 028: Adding idordabanki_id column...');

    db.exec(`
      ALTER TABLE terminology_terms ADD COLUMN idordabanki_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_terminology_terms_idordabanki
        ON terminology_terms(idordabanki_id);
    `);

    console.log('Migration 028: idordabanki_id column added');
  },
};
