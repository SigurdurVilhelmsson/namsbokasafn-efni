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
  const listTerms = db.prepare('SELECT id, lang, text FROM concept_term WHERE concept_id = ?');
  const delTerm = db.prepare('DELETE FROM concept_term WHERE id = ?');
  const countPrefs = db.prepare(
    'SELECT COUNT(*) AS c FROM book_concept_preference WHERE term_id = ?'
  );
  // ⚠️ Explicit, NOT left to ON DELETE CASCADE. `PRAGMA foreign_keys` is
  // per-connection, defaults off, is not stored in the file, and no production
  // connection sets it — so the cascade does not fire there and the preference
  // row would survive pointing at a term that no longer exists.
  const delPrefs = db.prepare('DELETE FROM book_concept_preference WHERE term_id = ?');

  // Upsert on the natural key, so a term that is still present upstream KEEPS
  // ITS ID. The previous DELETE-then-INSERT gave every surviving term a fresh
  // AUTOINCREMENT id, which broke every editor preference for the collection on
  // an ordinary refresh. (Register §C36 finding 1.)
  const insTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)
     ON CONFLICT(concept_id, lang, text)
     DO UPDATE SET rank = excluded.rank, source = excluded.source`
  );

  const stats = {
    collection,
    entries: (payload.entries || []).length,
    imported: 0,
    skippedNoIcelandic: 0,
    terms: 0,
    updatedTerms: 0,
    prunedTerms: 0,
    preferencesDropped: 0,
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

      // Captured BEFORE the upsert loop: afterwards an upsert cannot tell you
      // whether it inserted or updated — both report changes: 1.
      const priorKeys = existing
        ? new Set(listTerms.all(conceptId).map((r) => `${r.lang} ${r.text}`))
        : new Set();

      const seen = new Set();
      const keep = new Set();
      for (const t of terms) {
        const key = `${t.lang} ${t.text}`;
        if (seen.has(key)) continue; // the API can repeat a form as its own synonym
        seen.add(key);
        if (priorKeys.has(key)) stats.updatedTerms++;
        insTerm.run(conceptId, t.lang, t.text, t.rank, t.source);
        keep.add(key);
        stats.terms++;
        stats.byLang[t.lang]++;
      }

      // Prune ONLY what actually disappeared upstream. A preference pointing at
      // a term Árnastofnun has WITHDRAWN should still go — but it is counted
      // and reported, not silently lost.
      if (existing) {
        for (const row of listTerms.all(conceptId)) {
          if (keep.has(`${row.lang} ${row.text}`)) continue;
          stats.preferencesDropped += countPrefs.get(row.id).c; // count BEFORE deleting
          delPrefs.run(row.id);
          delTerm.run(row.id);
          stats.prunedTerms++;
        }
      }
      stats.imported++;
    }
  });
  run();

  return stats;
}

module.exports = { importConcepts };
