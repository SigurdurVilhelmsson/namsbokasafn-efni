/**
 * Migration 051: assert this project's own terminology rulings into the concept
 * model.
 *
 * ⚠️ THIS IS ENFORCEMENT, NOT A ONE-TIME SEED — the same deliberate choice 047
 * documents. `migrationRunner` calls every `up()` unconditionally on every
 * server start, so this runs on every boot and a value that drifted in the
 * database is put back. That is the whole reason the file exists: CLAUDE.md
 * records that a hand SQL edit to a glossary value is silently reverted with no
 * error and no log line, and the shrink guard cannot see the regrowth because it
 * measures size. The fix for an enforced value is the file the code reads.
 *
 * 🔴 047's SHAPE IS DELIBERATELY NOT COPIED. It clears a book's rows and
 * re-inserts them, which is safe there because `book_domain_priority` has no
 * dependents. `concept` is referenced by `book_term_preference` ON DELETE
 * CASCADE, and better-sqlite3 is compiled with SQLITE_DEFAULT_FOREIGN_KEYS=1, so
 * that cascade FIRES: churning concept ids on every boot would quietly discard
 * an editor's chapter-level term preference. This migration matches on the
 * English head form and updates in place, so an unchanged entry keeps its id.
 *
 * 🔴 IT NEVER TOUCHES AN ÍÐORÐABANKINN CONCEPT. House style outranks by domain
 * priority — the non-destructive route — and every row this migration manages
 * is tagged `concept_term.source = 'house-style'`, which no import writes.
 *
 * ⚠️ IT MUST NEVER THROW. `up()` runs on every start and
 * `failLoudOnMigrationErrors` exit(1)s on a collected error, so one bad row
 * would mean the server never boots again. The whole body is wrapped, and the
 * guard is around the UNIT rather than the interesting line — 048's first
 * attempt guarded its INSERT while a malformed table still wedged the boot from
 * `db.prepare`, uncaught.
 */
const {
  HOUSE_STYLE_TERMS,
  HOUSE_STYLE_DOMAIN,
  HOUSE_STYLE_SOURCE,
} = require('../lib/houseStyleTerms');

module.exports = {
  name: '051-house-style-terms',

  up(db) {
    try {
      const findConcept = db.prepare(
        `SELECT c.id FROM concept c
           JOIN concept_term t ON t.concept_id = c.id
          WHERE t.lang='en' AND t.text=? AND t.source=?`
      );
      const insConcept = db.prepare(
        `INSERT INTO concept (domain, collection) VALUES (?, ?) RETURNING id`
      );
      const setDomain = db.prepare('UPDATE concept SET domain=? WHERE id=?');
      const listTerms = db.prepare(
        `SELECT id, lang, text FROM concept_term WHERE concept_id=? AND source=?`
      );
      const delTerm = db.prepare('DELETE FROM concept_term WHERE id=?');
      const insTerm = db.prepare(
        `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)`
      );
      // Every house-style concept currently in the database, so entries deleted
      // from the file can be retired. Absence from the file means RETIRED — the
      // defect 047 was written to fix in its predecessor was precisely that a
      // dropped value lived on forever.
      const allManaged = db.prepare(
        `SELECT DISTINCT concept_id AS id FROM concept_term WHERE source=?`
      );
      const delConcept = db.prepare('DELETE FROM concept WHERE id=?');

      const run = db.transaction(() => {
        const keep = new Set();

        for (const entry of HOUSE_STYLE_TERMS) {
          // Match on ANY of the entry's English head forms: adding a spelling to
          // an existing entry must extend that concept, not mint a second one
          // claiming the same meaning.
          let id = null;
          for (const en of entry.en) {
            const hit = findConcept.get(en, HOUSE_STYLE_SOURCE);
            if (hit) {
              id = hit.id;
              break;
            }
          }
          if (id === null) id = insConcept.get(HOUSE_STYLE_DOMAIN, HOUSE_STYLE_SOURCE).id;
          else setDomain.run(HOUSE_STYLE_DOMAIN, id);

          // 🔴 RECONCILE THE TERMS IN PLACE — do NOT delete and re-insert them.
          // `book_concept_preference.term_id` references concept_term ON DELETE
          // CASCADE, so replacing an unchanged term row wholesale discards an
          // editor's chapter-level choice even though the CONCEPT id held. That
          // is not hypothetical: it is what the first draft of this migration
          // did, and the preference test caught it. Stability has to hold at the
          // row that is actually referenced.
          //
          // Only OUR terms are touched. An Íðorðabankinn term on the same
          // concept could exist only if something merged them, and it is not
          // ours to discard.
          //
          // rank 1: the head form. resolvedGlossary takes the rank-1 Icelandic,
          // and the point of a ruling is that there is exactly one.
          // ⚠️ A Map carrying {lang, text}, never a delimited string that has to
          // be split back apart: 'degree Celsius' and 'stig á Celsíus' both contain
          // spaces, so a `lang text` key parsed with split(' ') writes 'stig' as the
          // Icelandic head form — silently, and only for the multi-word entries,
          // which is most of them.
          const wanted = new Map();
          for (const en of entry.en) wanted.set(`en ${en}`, { lang: 'en', text: en });
          wanted.set(`is ${entry.is}`, { lang: 'is', text: entry.is });
          for (const t of listTerms.all(id, HOUSE_STYLE_SOURCE)) {
            const key = `${t.lang} ${t.text}`;
            // A drifted value IS deleted, and it should be: a preference
            // pointing at a rendering this project no longer uses is not a
            // choice worth preserving.
            if (wanted.has(key)) wanted.delete(key);
            else delTerm.run(t.id);
          }
          for (const { lang, text } of wanted.values()) {
            insTerm.run(id, lang, text, 1, HOUSE_STYLE_SOURCE);
          }
          keep.add(id);
        }

        for (const row of allManaged.all(HOUSE_STYLE_SOURCE)) {
          if (!keep.has(row.id)) delConcept.run(row.id);
        }
      });
      run();
    } catch (err) {
      // Report and leave the prior state. A migration must not throw.
      console.warn(`[051] house-style terms not applied: ${err.message}`);
    }
  },
};
