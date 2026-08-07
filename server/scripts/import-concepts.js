// server/scripts/import-concepts.js
/**
 * Load verbatim Íðorðabankinn entries (Task 1's `fetch-raw` output) into the
 * concept model.
 *
 * ⚠️ Adds only. This script writes to the concept tables and reads nothing from
 * the old terminology tables, so it can run while the editor is live.
 *
 * Idempotent by `concept.idordabanki_id`: re-running replaces a concept's terms
 * rather than duplicating them, so an interrupted 20-collection import can be
 * resumed by simply re-running it.
 */
const { conceptFromEntry, COLLECTION_DOMAIN } = require('../lib/conceptFromEntry');

function importConcepts(db, payload) {
  const collection = payload.collection;
  const domain = COLLECTION_DOMAIN[collection];
  if (!domain) {
    // Fail loud: a guessed domain would silently scope a whole collection to
    // the wrong books, and nothing downstream could detect it.
    throw new Error(
      `Unknown collection '${collection}' — add it to COLLECTION_DOMAIN in ` +
        `server/lib/conceptFromEntry.js with a deliberate domain, or do not import it.`
    );
  }

  const findConcept = db.prepare('SELECT id FROM concept WHERE idordabanki_id = ?');
  const insConcept = db.prepare(
    `INSERT INTO concept (domain, idordabanki_id, collection, definition_en, definition_is)
     VALUES (?,?,?,?,?)`
  );
  const clearTerms = db.prepare('DELETE FROM concept_term WHERE concept_id = ?');
  const insTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
  );

  const stats = {
    collection,
    entries: (payload.entries || []).length,
    imported: 0,
    skippedNoIcelandic: 0,
    terms: 0,
    byLang: { en: 0, is: 0, la: 0 },
  };

  const run = db.transaction(() => {
    for (const entry of payload.entries || []) {
      const built = conceptFromEntry(entry, { collection, domain });
      if (!built) {
        stats.skippedNoIcelandic++;
        continue;
      }
      const { concept, terms } = built;

      const existing =
        concept.idordabankiId != null ? findConcept.get(concept.idordabankiId) : null;
      const conceptId = existing
        ? existing.id
        : insConcept.run(
            concept.domain,
            concept.idordabankiId,
            concept.collection,
            concept.definitionEn,
            concept.definitionIs
          ).lastInsertRowid;

      if (existing) clearTerms.run(conceptId);

      const seen = new Set();
      for (const t of terms) {
        const key = `${t.lang} ${t.text}`;
        if (seen.has(key)) continue; // the API can repeat a form as its own synonym
        seen.add(key);
        insTerm.run(conceptId, t.lang, t.text, t.rank, t.source);
        stats.terms++;
        stats.byLang[t.lang]++;
      }
      stats.imported++;
    }
  });
  run();

  return stats;
}

module.exports = { importConcepts };
