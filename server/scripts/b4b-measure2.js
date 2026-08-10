/**
 * B4b measurement #2 — READ-ONLY.
 *   Q5  Can the old model's inflections be JOINED onto concept_term (lang='is')?
 *   Q6  EN coverage delta: what does the matcher GAIN and LOSE at cut-over?
 *   Q7  Of the old headwords the concept model lacks, how many actually matter?
 */
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const db = new Database(resolveDbPath(), { readonly: true });
const line = (s) => console.log(s);

line('══ Q5 — can inflections be carried onto the concept model? ══');
const infRows = db
  .prepare(
    `SELECT COUNT(*) tot, COUNT(DISTINCT icelandic) distinctIs
       FROM terminology_translations
      WHERE inflections IS NOT NULL AND inflections <> '' AND inflections <> '[]'`
  )
  .get();
line(`  inflection-bearing translation rows      : ${infRows.tot}`);
line(`  ... distinct Icelandic strings among them: ${infRows.distinctIs}`);

const joinable = db
  .prepare(
    `SELECT COUNT(DISTINCT tt.icelandic) n
       FROM terminology_translations tt
      WHERE tt.inflections IS NOT NULL AND tt.inflections <> '' AND tt.inflections <> '[]'
        AND EXISTS (SELECT 1 FROM concept_term ct
                     WHERE ct.lang='is' AND ct.text = tt.icelandic)`
  )
  .get().n;
line(
  `  ... that EXIST as a concept_term(is).text : ${joinable}  (${((100 * joinable) / infRows.distinctIs).toFixed(1)}%)`
);
line('  → the ceiling for a join-based backfill. The rest have no concept-model home.');

// Ambiguity: one Icelandic string may sit on many concepts (that is expected and fine —
// the inflections of a word do not depend on which concept uses it).
const spread = db
  .prepare(
    `SELECT AVG(n) avg, MAX(n) max FROM (
       SELECT COUNT(DISTINCT ct.concept_id) n
         FROM terminology_translations tt
         JOIN concept_term ct ON ct.lang='is' AND ct.text = tt.icelandic
        WHERE tt.inflections IS NOT NULL AND tt.inflections <> '' AND tt.inflections <> '[]'
        GROUP BY tt.icelandic)`
  )
  .get();
line(
  `  concepts per joined Icelandic string: avg ${Number(spread.avg).toFixed(2)}, max ${spread.max}`
);

// CONFLICT CHECK: does one Icelandic string carry TWO DIFFERENT inflection sets?
const conflict = db
  .prepare(
    `SELECT COUNT(*) n FROM (
       SELECT icelandic FROM terminology_translations
        WHERE inflections IS NOT NULL AND inflections <> '' AND inflections <> '[]'
        GROUP BY icelandic HAVING COUNT(DISTINCT inflections) > 1)`
  )
  .get().n;
line(`  ⚠️ Icelandic strings with CONFLICTING inflection sets: ${conflict}`);
line('     (a backfill must have a rule for these, or it is order-dependent — §C18 again)');

line('\n══ Q6 — EN coverage delta at cut-over ══');
const oldHw = db.prepare('SELECT COUNT(DISTINCT english) n FROM terminology_headwords').get().n;
const both = db
  .prepare(
    `SELECT COUNT(DISTINCT h.english) n FROM terminology_headwords h
      WHERE EXISTS (SELECT 1 FROM concept_term ct WHERE ct.lang='en' AND ct.text = h.english)`
  )
  .get().n;
const bothNocase = db
  .prepare(
    `SELECT COUNT(DISTINCT h.english) n FROM terminology_headwords h
      WHERE EXISTS (SELECT 1 FROM concept_term ct
                     WHERE ct.lang='en' AND ct.text = h.english COLLATE NOCASE)`
  )
  .get().n;
line(`  OLD distinct headword english            : ${oldHw}`);
line(`  ... also present in concept_term(en)     : ${both}  exact · ${bothNocase} NOCASE`);
line(
  `  ⚠️ LOST at cut-over (old-only headwords)  : ${oldHw - bothNocase}  (${((100 * (oldHw - bothNocase)) / oldHw).toFixed(1)}%)`
);
line('  → these stop matching entirely unless B4b carries them. THIS IS THE REGRESSION RISK.');

line('\n  A sample of the old-only headwords (what an editor would stop seeing):');
const sample = db
  .prepare(
    `SELECT h.english FROM terminology_headwords h
      WHERE NOT EXISTS (SELECT 1 FROM concept_term ct
                         WHERE ct.lang='en' AND ct.text = h.english COLLATE NOCASE)
      ORDER BY LENGTH(h.english) DESC LIMIT 15`
  )
  .all();
for (const r of sample) line(`      ${r.english}`);

line('\n══ Q7 — do the old-only headwords carry real editorial work? ══');
const oldOnlyApproved = db
  .prepare(
    `SELECT COUNT(DISTINCT h.id) n
       FROM terminology_headwords h
       JOIN terminology_translations t ON t.headword_id = h.id AND t.status='approved'
      WHERE NOT EXISTS (SELECT 1 FROM concept_term ct
                         WHERE ct.lang='en' AND ct.text = h.english COLLATE NOCASE)`
  )
  .get().n;
line(`  old-only headwords WITH an approved translation: ${oldOnlyApproved}`);
const oldOnlyHuman = db
  .prepare(
    `SELECT COUNT(DISTINCT h.id) n
       FROM terminology_headwords h
       JOIN terminology_translations t ON t.headword_id = h.id
      WHERE t.idordabanki_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM concept_term ct
                         WHERE ct.lang='en' AND ct.text = h.english COLLATE NOCASE)`
  )
  .get().n;
line(`  ... of which NOT from Íðorðabankinn (project-authored): ${oldOnlyHuman}`);
line('  → project-authored terms have NO upstream source; losing them is irreversible.');

db.close();
line('\nDONE (read-only, nothing written).');
