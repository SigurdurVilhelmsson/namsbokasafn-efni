/**
 * Migration 045: concept-oriented terminology model (spec 2026-08-07).
 *
 * A CONCEPT is one sense. Íðorðabankinn is concept-oriented — one entry per
 * concept with synonyms — and the concept identity survived the original import
 * in idordabanki_id while the structure around it was discarded: `cell` is one
 * headword row with five translations from THREE entries (biology fruma,
 * physics rafhlað, mathematics flokkur).
 *
 * ⚠️ ADDS BESIDE, REMOVES NOTHING. The old tables and every consumer are
 * untouched by this migration. Cut-over is Part B; dropping is Part C. A
 * migration that dropped them here would break the editor from this moment
 * until Part B landed.
 *
 * ⚠️ book_concept_preference.chapter is NOT NULL with 0 as the book-default
 * sentinel, deliberately not nullable: in SQLite NULLs do not compare equal
 * inside a primary key, so a nullable chapter would admit two conflicting
 * "book defaults" for one concept. -1 is the appendices sentinel (item-14).
 */
module.exports = {
  name: '045-concept-model',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS concept (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        domain          TEXT NOT NULL,
        idordabanki_id  INTEGER UNIQUE,
        collection      TEXT,
        definition_en   TEXT,
        definition_is   TEXT,
        merged_into     INTEGER REFERENCES concept(id),
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_concept_domain ON concept(domain);
      CREATE INDEX IF NOT EXISTS idx_concept_merged ON concept(merged_into);

      CREATE TABLE IF NOT EXISTS concept_term (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
        lang        TEXT NOT NULL CHECK(lang IN ('en','is','la')),
        text        TEXT NOT NULL,
        rank        INTEGER NOT NULL,
        source      TEXT NOT NULL,
        inflections TEXT,
        lifecycle   TEXT,
        UNIQUE(concept_id, lang, text)
      );

      CREATE INDEX IF NOT EXISTS idx_concept_term_lookup ON concept_term(lang, text);
      CREATE INDEX IF NOT EXISTS idx_concept_term_concept ON concept_term(concept_id);

      CREATE TABLE IF NOT EXISTS book_concept_preference (
        book_id     INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        chapter     INTEGER NOT NULL,
        concept_id  INTEGER NOT NULL REFERENCES concept(id) ON DELETE CASCADE,
        term_id     INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, chapter, concept_id)
      );

      CREATE TABLE IF NOT EXISTS book_domain_priority (
        book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        domain   TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (book_id, domain)
      );
    `);
  },
};
