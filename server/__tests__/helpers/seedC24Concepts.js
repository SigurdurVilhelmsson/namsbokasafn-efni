// server/__tests__/helpers/seedC24Concepts.js
/**
 * §C36 B4b-1 — seed the C24 fixture into the CONCEPT model.
 *
 * The C24 fixture (`__tests__/fixtures/c24-terms.json`) was captured against the
 * OLD tables: `terminology_headwords` → many `terminology_translations`, each
 * tagged with `terminology_translation_subjects`. `findTermsInSegments` no longer
 * reads any of those, so every fixture-driven test in findTermsGolden.test.js was
 * matching against an empty term set.
 *
 * ⚠️ WITHOUT THIS HELPER THE PORTED SPAN ASSERTION COMPARES [] TO [] AND PASSES
 * FOREVER. That is the exact green-forever class Task 6 exists to remove, and the
 * per-segment `for` loop would make it LOOK like 24 segments are checked while
 * checking nothing. Hence `assertSeeded` below, and the row-count control test
 * that calls it.
 *
 * ── THE SUBJECT → DOMAIN MAPPING IS THE IDENTITY, AND THAT IS A MEASUREMENT ──
 *
 * The fixture's subject vocabulary is exactly {biology, chemistry, mathematics,
 * physics}; all four are members of `DOMAINS` in server/lib/domains.js. Every one
 * of the fixture's translations carries EXACTLY ONE subject (measured: 0 with
 * none, 0 with more than one), so no translation needs a multi-domain
 * representation at all. The identity map is therefore not a choice among
 * plausible mappings — it is the only mapping that does not invent information.
 *
 * ⚠️ A MAPPING THAT REPRODUCES THE COMMITTED GOLDEN EXACTLY EXISTS, AND IS
 * REJECTED ON PURPOSE. Sending `physics` and `biology` to domains outside
 * efnafraedi-2e's priority chain would restore the old single-subject partition
 * and make the golden's spans match byte-for-byte. That is a mapping chosen to
 * make an oracle pass, not a mapping that describes the fixture — it would
 * certify the cut-over against a fiction. See the span-set block in
 * findTermsGolden.test.js (and the banner above it) for the resulting diff,
 * which is a real finding about what B4b-1 changed.
 *
 * ── ONE CONCEPT PER (HEADWORD, SUBJECT) ──
 *
 * A headword's translations are grouped by subject, and each group becomes one
 * concept whose `domain` is that subject. Only ONE fixture headword ('cell':
 * biology 'fruma' + chemistry 'rafhlaða') spans two subjects, so this produces
 * 317 concepts for 316 headwords. Two concepts then share the English string
 * 'cell', which is the faithful representation — D4.2 collapses them to ONE
 * automaton entry and `resolve()` picks the winner by domain priority, which is
 * precisely the homograph case the concept model was built to own.
 *
 * ⚠️ INSERTION ORDER IS LOAD-BEARING. `loadEnglishEntries` keys each automaton
 * entry on `MIN(concept_term.id)` per distinct English string, and
 * `findTermsInSegments`'s `hits.sort` breaks equal-length ties on that id. Seeding
 * in fixture order — EN term before the concept's IS terms — makes that id order
 * agree with the old `terminology_headwords.id` order the golden's tie-break
 * rested on. Do not reorder this loop.
 *
 * ⚠️ `status` IS DROPPED, because `concept_term` HAS NO STATUS COLUMN. The
 * fixture's proposed rows become ordinary rank-ordered terms. This is not a
 * lossy shortcut — it is the model change: there is no proposed tier under the
 * concept model (see the `status: 'approved'` constant in
 * terminologyService.findTermsInSegments and the comment above it). `rank` is the
 * fixture's own order within the subject group, which is what the old
 * `t.id ASC` sibling tie-break resolved to.
 */

const terms = require('../fixtures/c24-terms.json');

/**
 * @param {import('better-sqlite3').Database} db a freshMigratedDb() handle
 * @returns {{concepts:number, terms:number, distinctEnglish:number}} row counts,
 *   for the caller's control assertions
 */
function seedC24Concepts(db) {
  const insConcept = db.prepare('INSERT INTO concept (domain) VALUES (?)');
  const insTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source, inflections)
     VALUES (?, ?, ?, ?, 'c24-fixture', ?)`
  );

  let concepts = 0;
  let termRows = 0;
  const english = new Set();

  for (const hw of terms.headwords) {
    // Group by subject, preserving first-seen subject order and, within a
    // subject, the fixture's own translation order.
    const bySubject = new Map();
    for (const tr of hw.translations) {
      // Defensive, not decorative: a fixture edit that dropped a subject tag
      // would otherwise silently create a concept with domain `undefined`,
      // which is out of scope for every book and matches nothing.
      if (!tr.subjects || tr.subjects.length !== 1) {
        throw new Error(
          `c24 fixture: translation "${tr.icelandic}" of "${hw.english}" carries ` +
            `${(tr.subjects || []).length} subjects; this helper's identity mapping ` +
            'assumes exactly one. Re-read the mapping rationale at the top of this file.'
        );
      }
      const subject = tr.subjects[0];
      if (!bySubject.has(subject)) bySubject.set(subject, []);
      bySubject.get(subject).push(tr);
    }

    for (const [domain, group] of bySubject) {
      const conceptId = Number(insConcept.run(domain).lastInsertRowid);
      concepts++;
      insTerm.run(conceptId, 'en', hw.english, 1, null);
      termRows++;
      english.add(hw.english);
      group.forEach((tr, i) => {
        insTerm.run(
          conceptId,
          'is',
          tr.icelandic,
          i + 1,
          tr.inflections ? JSON.stringify(tr.inflections) : null
        );
        termRows++;
      });
    }
  }

  return { concepts, terms: termRows, distinctEnglish: english.size };
}

/**
 * THE CONTROL, as a reusable throw — so a caller cannot forget it.
 *
 * Reads the counts back out of the DATABASE rather than trusting the return
 * value of the insert loop: a seeder that ran against a different handle than
 * the one under test would still return plausible numbers.
 *
 * @param {import('better-sqlite3').Database} db
 */
function assertSeeded(db) {
  const concepts = db.prepare('SELECT COUNT(*) AS n FROM concept').get().n;
  const distinct = db
    .prepare("SELECT COUNT(DISTINCT text) AS n FROM concept_term WHERE lang = 'en'")
    .get().n;
  if (concepts === 0 || distinct === 0) {
    throw new Error(
      'seedC24Concepts: the concept tables are EMPTY. Every fixture-driven assertion ' +
        'in this file would compare [] to [] and pass. Seed before asserting.'
    );
  }
  return { concepts, distinctEnglish: distinct };
}

module.exports = { seedC24Concepts, assertSeeded };
