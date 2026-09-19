// server/lib/houseStyleTerms.js
/**
 * HOUSE-STYLE TERMS — terminology rulings that are OURS, not Íðorðabankinn's.
 *
 * 🔴 THIS FILE IS THE ONE OWNER. Migration 051 asserts these into the concept
 * model on EVERY server start, exactly as 047 does for BOOK_DOMAIN_PRIORITY.
 * That is deliberate and it is the whole point: CLAUDE.md records that a hand
 * SQL edit to a glossary or domain value is silently reverted on the next boot,
 * with no error and no log line. An enforced value's fix is the file the code
 * reads, never SQL — so a ruling recorded here survives, and one typed into
 * sqlite does not.
 *
 * WHEN AN ENTRY BELONGS HERE, and it is a narrow test. CLAUDE.md: add a
 * glossary term ONLY when it resolves an ambiguity THE MODEL CANNOT SEE, and
 * delete it when it overrides a choice the model makes better than a flat map
 * can. The §C73 control is "what does the model do UNPROMPTED?" — check the
 * committed MT output before adding anything here.
 *
 * ▶ A house-style ruling is the legitimate case: two renderings are both
 * defensible Icelandic, the model has no way to know which one this project
 * settled on, and it therefore produces both. That is not the model being
 * wrong; it is a decision nobody had written down.
 *
 * ⚠️ WHAT THIS FILE IS NOT FOR: forcing a form the model never produces. If the
 * Icelandic you want appears nowhere in the committed MT output, you are
 * proposing an untested form, not correcting an inconsistency.
 *
 * ⚠️ Íðorðabankinn concepts are NOT edited or deleted by 051. A house-style
 * concept is a SEPARATE concept that outranks by domain priority — the
 * non-destructive route CLAUDE.md prescribes.
 *
 * 🔴 CORRECTED 2026-09-19 (§C164): domain priority alone was NOT enough. When
 * Íðorðabankinn already holds competing concepts for the same English in the
 * SAME domain, the house concept used to JOIN that tie instead of ending it, and
 * the export dropped the headword with no error (`resonance → vok`, measured on
 * prod). `conceptResolver.resolveCandidates` now lets the house-style concept
 * win a real tie at its own position. It still does not jump to a better
 * position, and a book/chapter preference still overrides it.
 */

/**
 * `chemistry`, not `physics`, and the reason is robustness rather than taxonomy.
 *
 * BOOK_DOMAIN_PRIORITY puts `chemistry` FIRST for both publishable books
 * (efnafraedi-2e, lifraen-efnafraedi), so a house-style concept filed here
 * cannot be outranked in the books that ship — including by a future
 * Íðorðabankinn import of the same English under `physics`, which is where
 * `kelvin` and `absolute temperature` already sit. It is also in 5 of the 6
 * books' fallback chains.
 *
 * ⚠️ The exception is `stjornufraedi`, whose chain is astronomy/physics/
 * earth-science/mathematics and contains no `chemistry`. An entry here does not
 * reach that book. Note it rather than widening the chain — the priority map has
 * its own owner and its own measured rationale.
 */
const HOUSE_STYLE_DOMAIN = 'chemistry';

/**
 * Each entry mints one concept with one or more English head forms and exactly
 * one Icelandic head form.
 *
 * `en` is a LIST because several English spellings can name one concept
 * ("degree Celsius" and "degree centigrade"); they resolve to the same
 * Icelandic. `is` is a single string because the whole purpose is to remove a
 * choice.
 *
 * ⚠️ `ruled` is the date and authority, kept beside the value. A term whose
 * rationale is lost is a term nobody dares delete.
 */
const HOUSE_STYLE_TERMS = Object.freeze([
  Object.freeze({
    en: Object.freeze(['Celsius']),
    is: 'Celsíus',
    ruled: '2026-09-04 [USER]',
    why:
      'Both transliterations are defensible and the model produces BOTH unprompted — ' +
      'measured 24 Celsíus : 5 Selsíus in committed chemistry MT output, and 31 : 13 in ' +
      'published HTML, with no glossary entry steering either. The split tracks context: ' +
      'in-sentence uses came back Celsíus, while short standalone labels — a key-term ' +
      'headword, and the figure-text run — came back Selsíus. Figure labels are nothing ' +
      'BUT standalone fragments, so the figure pipeline is systematically exposed. ' +
      'Celsíus is house style and the common form in Icelandic science textbooks.',
  }),
  Object.freeze({
    en: Object.freeze(['degree Celsius', 'degree centigrade']),
    is: 'stig á Celsíus',
    ruled: '2026-09-04 [USER]',
    why:
      'The UNIT PHRASE, distinct from the name above and not interchangeable with it. ' +
      'Giving the bare headword "Celsius" this value would render a standalone figure ' +
      'label as a phrase ("stig á Celsíus" where the artwork wants "Celsíus"); giving ' +
      'the phrase the bare value would lose "stig á". Two concepts, deliberately.',
  }),
  Object.freeze({
    en: Object.freeze(['resonance']),
    is: 'vok',
    ruled: '2026-09-19 [USER]',
    why:
      'Chemistry ch07 had no glossary row for resonance, and the 2026-09-19 re-MT collapsed it ' +
      'onto COVALENCE: 15 of 24 resonance segments came back samgild-, including the 7.4 ' +
      'subsection title "Samgildni" and "samgildniblendingur" for resonance hybrid. The rest ' +
      "split between ómun and samómun. A wrong-sense collapse onto another concept's word is " +
      'the mirror case a glossary row exists for. The March MT used vokmynd- unprompted (30+ ' +
      'tokens in 02-mt-output), so the vok- family is a form the model produces.',
  }),
  Object.freeze({
    en: Object.freeze(['resonance structure', 'resonance form']),
    is: 'vokmynd',
    ruled: '2026-09-19 [USER]',
    why:
      'See "resonance". OpenStax uses both "resonance forms" (20) and "resonance structures" ' +
      '(7) in ch07 for one concept; both resolve to vokmynd.',
  }),
  Object.freeze({
    en: Object.freeze(['resonance hybrid']),
    is: 'vokblendingur',
    ruled: '2026-09-19 [USER]',
    why:
      'See "resonance". Its own concept so the bare "resonance → vok" row is not the only ' +
      'anchor for the compound. The March MT wrote vokmyndablendingur; [USER] ruled the ' +
      'shorter vokblendingur.',
  }),
  Object.freeze({
    en: Object.freeze(['Lewis structure']),
    is: 'Lewis-mynd',
    ruled: '2026-09-19 [USER]',
    why:
      'Chemistry ch07 renders Lewis structure four ways with no glossary row: Lewis-bygging 72, ' +
      'Lewis-formúla 67, Lewis-mynd 42, Lewis-formgerð 14 (of 194 segments). Lewis-mynd is ' +
      'house style and a form the model already produces.',
  }),
]);

/** The marker 051 uses to find and manage its own rows. Not an Íðorðabankinn source. */
const HOUSE_STYLE_SOURCE = 'house-style';

/**
 * 🔴 THE ROWS 051 SEEDS ARE ENFORCEMENT, NOT CONTENT — so any check asking
 * "did the import actually put anything here?" MUST exclude them.
 *
 * This is not hygiene; it is a defect that was measured. Before these helpers,
 * `verify-concept-import.js` counted every row in `concept` to decide
 * `model-is-non-empty`, and 051 made that count >= 2 on every database in
 * existence. Run against a database where nothing had ever been imported, the
 * real CLI printed `VERIFY: PASS [yield: 2 concepts, 5 terms]` and exited 0 —
 * a release gate that could no longer go red, on the fresh-clone path it was
 * written for. `fetch-bin-inflections.js` had the same shape: its "the concept
 * model is empty, you have pointed me at the wrong database" refusal could
 * never fire once 'Celsíus' was always a candidate.
 *
 * ⚠️ `IS NOT`, never `<>`. A row with a NULL collection/source is IMPORTED and
 * must still be counted; `<>` evaluates to NULL against NULL and would silently
 * drop it, turning one under-count into another.
 *
 * ⚠️ And NOT `WHERE idordabanki_id IS NOT NULL` as the positive test:
 * conceptFromEntry does `idordabankiId: entry.id ?? null`, so a legitimately
 * imported entry that lacks an id would go uncounted.
 */
function countImportedConcepts(db) {
  return db
    .prepare('SELECT COUNT(*) n FROM concept WHERE collection IS NOT ?')
    .get(HOUSE_STYLE_SOURCE).n;
}

/** concept_term rows that came from an import rather than from 051. */
function countImportedTerms(db) {
  return db
    .prepare('SELECT COUNT(*) n FROM concept_term WHERE source IS NOT ?')
    .get(HOUSE_STYLE_SOURCE).n;
}

module.exports = {
  HOUSE_STYLE_TERMS,
  HOUSE_STYLE_DOMAIN,
  HOUSE_STYLE_SOURCE,
  countImportedConcepts,
  countImportedTerms,
};
