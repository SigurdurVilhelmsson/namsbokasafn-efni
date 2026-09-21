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
    en: Object.freeze(['hybridization', 'orbital hybridization']),
    is: 'svigrúmablöndun',
    ruled: '2026-09-19 [USER]',
    why:
      "Found by the PRE-BUY scan on chemistry ch08 (76 segments, the book's own key term, no " +
      'row). The unprompted March MT splits it: blending ~80 tokens against blöndun ~39, with ' +
      'the control that antibonding is unanimous at andbindandi — so the split is a real ' +
      'disagreement, not noise. [USER] ruled svigrúmablöndun for this context; it occurs in the ' +
      'committed MT, so it is a form the model produces. ⚠️ Deliberately a DIFFERENT stem from ' +
      'hybrid orbital below: the process and the object are two concepts, as Celsius and degree ' +
      'Celsius are.',
  }),
  Object.freeze({
    en: Object.freeze(['hybrid orbital']),
    is: 'blendingssvigrúm',
    ruled: '2026-09-19 [USER]',
    why:
      'The OBJECT, ruled separately from the process above. The MT already writes ' +
      'blendingssvigrúm (81 tokens in committed chemistry MT), so this pins a choice it ' +
      'already makes rather than forcing a new form.',
  }),
  Object.freeze({
    en: Object.freeze(['bonding orbital']),
    is: 'bindandi svigrúm',
    ruled: '2026-09-19 [USER]',
    why:
      'Chemistry ch08, 25 segments, key term, no row. The MT splits bindandi svigrúm ~37 ' +
      'against tengisvigrúm ~6. [USER] ruled the majority, which also pairs with the ' +
      'unanimous andbindandi for antibonding — and antibonding therefore needs NO entry, ' +
      'per the rule that a row is for a choice the model cannot make on its own.',
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
  Object.freeze({
    en: Object.freeze(['torr']),
    is: 'torr',
    ruled: '2026-09-20 [USER]',
    why: 'ch09 (55 segments). An identity row: the unit keeps its English spelling in Icelandic, and pinning it stops the MT reaching for a paraphrase. The MT already writes torr (91 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['hydroxide']),
    is: 'hýdroxíð',
    ruled: '2026-09-20 [USER]',
    why: "ch18 (55 segments), the book's own key term with no row. The MT already writes hýdroxíð (272 tokens), so this pins a choice it makes rather than forcing a new form.",
  }),
  Object.freeze({
    en: Object.freeze(['group']),
    is: 'flokkur',
    ruled: '2026-09-20 [USER]',
    why: "ch02 (42 segments) — the PERIODIC-TABLE column. ⚠️ SEND IT IN ch02's SUBSET ONLY. In ch20 the same English word means a functional group (functional group 35, carbonyl group 29, alkyl group 16), where hópur is right and carbonyl group has its own row below. A glossary row is global, but --glossary-only decides what reaches the wire per chapter, and that is the mitigation for a headword whose sense is chapter-bound.",
  }),
  Object.freeze({
    en: Object.freeze(['alcohol']),
    is: 'alkóhól',
    ruled: '2026-09-20 [USER]',
    why: 'ch20 (42 segments), key term, no row. The MT already writes alkóhól (73 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['carbonate']),
    is: 'karbónat',
    ruled: '2026-09-20 [USER]',
    why: 'ch18 (40 segments). [USER] ruled the plural karbónöt; recorded SINGULAR because matching is by substring, so the singular headword also fires on carbonates and the model inflects — the shape the rest of the glossary uses. The MT already writes karbónat (149 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['radioactive decay']),
    is: 'geislasundrun',
    ruled: '2026-09-20 [USER]',
    why: "ch21 (39 segments), key term, no row. ⚠️ A form the committed MT has NEVER produced (0 tokens); [USER] ruled it deliberately on 2026-09-20 as the correct Icelandic, against the file's usual caution about untested forms.",
  }),
  Object.freeze({
    en: Object.freeze(['galvanic cell']),
    is: 'galvaníker',
    ruled: '2026-09-20 [USER]',
    why: 'ch17 (36 segments). [USER] 2026-09-20: galvanic = galvaní, and cell in this context is ker. ⚠️ 0 tokens in the committed MT — a deliberate coinage, ruled with the bare `cell` row below so the chapter is consistent.',
  }),
  Object.freeze({
    en: Object.freeze(['cell']),
    is: 'ker',
    ruled: '2026-09-20 [USER]',
    why: "ch17: the bare word appears 189 times, far more than galvanic cell (38), so leaving it unruled would leave four fifths of the chapter unanchored. ⚠️ SEND IT IN ch17's SUBSET ONLY — `cell` means something else wherever biology-adjacent text appears. 🔴 SAFE IN FORMULAE BY CONSTRUCTION, and this was checked: `cell` is 4 characters, so SHORT_LABEL_MAX makes it a short math label, and it is NOT on LOCALIZABLE_SHORT_LABELS — so resolveLabel keeps it English and the published E°ker defect (§C144) cannot recur through this row.",
  }),
  Object.freeze({
    en: Object.freeze(['cell potential']),
    is: 'kerspenna',
    ruled: '2026-09-20 [USER]',
    why: 'ch17 (61 segments), ruled with `cell → ker` so the compound matches the bare word.',
  }),
  Object.freeze({
    en: Object.freeze(['hole']),
    is: 'hol',
    ruled: '2026-09-20 [USER]',
    why: 'ch10 (34 segments) — the vacancies in a close-packed lattice. [USER]: same form singular and plural. Recorded singular, which also matches `holes`. ⚠️ English `whole` contains `hole`, so the substring selector fires on it (5 occurrences in ch10); harmless for selection, but worth knowing if a rendering ever looks odd.',
  }),
  Object.freeze({
    en: Object.freeze(['representative metal']),
    is: 'aðalflokkamálmur',
    ruled: '2026-09-20 [USER]',
    why: 'ch18 (34 segments). Singular, matching the existing `representative element → aðalflokkafrumefni`. The MT already writes aðalflokkamálm- (21 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['elementary reaction']),
    is: 'grunnhvarf',
    ruled: '2026-09-20 [USER]',
    why: 'ch12 (32 segments), key term, no row. ⚠️ The MT writes frumhvarf (26 tokens) and has never written grunnhvarf; [USER] ruled grunnhvarf deliberately on 2026-09-20.',
  }),
  Object.freeze({
    en: Object.freeze(['pOH']),
    is: 'pOH',
    ruled: '2026-09-20 [USER]',
    why: 'ch14 (32 segments). An identity row, like torr: the symbol is the same in both languages and pinning it stops a paraphrase.',
  }),
  Object.freeze({
    en: Object.freeze(['Lewis']),
    is: 'Lewis',
    ruled: '2026-09-20 [USER]',
    why: "ch15 (29 segments) — the name in Lewis acid / Lewis base. An identity row that keeps the surname intact. ⚠️ Send it in ch15's subset; `Lewis structure → Lewis-mynd` is a separate, longer row and stays available to chapters that need it.",
  }),
  Object.freeze({
    en: Object.freeze(['central metal']),
    is: 'miðjumálmur',
    ruled: '2026-09-20 [USER]',
    why: 'ch19 (29 segments), key term, no row. The MT already writes miðjumálm- (10 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['ether']),
    is: 'eter',
    ruled: '2026-09-20 [USER]',
    why: 'ch20 (29 segments), key term, no row. The MT already writes eter (56 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['dispersion force']),
    is: 'dreifikraftur',
    ruled: '2026-09-20 [USER]',
    why: 'ch10 (28 segments). ⚠️ CORRECTED IN REVIEW: the first ruling was fráhrindikraftar (repulsive), and London dispersion forces are ATTRACTIVE — the chapter groups them with dipole-dipole attraction. [USER] chose dreifikraftar 2026-09-20; recorded singular, per the substring rule.',
  }),
  Object.freeze({
    en: Object.freeze(['microstate']),
    is: 'örástand',
    ruled: '2026-09-20 [USER]',
    why: 'ch16 (28 segments), key term, no row. Singular, which also matches microstates.',
  }),
  Object.freeze({
    en: Object.freeze(['carboxylic acid']),
    is: 'karboxýlsýra',
    ruled: '2026-09-20 [USER]',
    why: 'ch20 (26 segments), key term, no row. The MT already writes karboxýlsýra.',
  }),
  Object.freeze({
    en: Object.freeze(['ketone']),
    is: 'ketón',
    ruled: '2026-09-20 [USER]',
    why: 'ch20 (23 segments), key term, no row. The MT already writes ketón (25 tokens).',
  }),
  Object.freeze({
    en: Object.freeze(['reaction mechanism']),
    is: 'hvarfgangur',
    ruled: '2026-09-20 [USER]',
    why: 'ch12 (22 segments), key term, no row. The MT already writes hvarfgangur (15 tokens), and it was one of the split renderings the pre-scan flagged.',
  }),
  Object.freeze({
    en: Object.freeze(['carbonyl group']),
    is: 'karbónýlhópur',
    ruled: '2026-09-20 [USER]',
    why: "ch20 (22 segments), key term, no row. The MT already writes karbónýlhóp- (26 tokens). ⚠️ Deliberately hópur where ch02's `group` is flokkur: the sense differs, and the two rows never travel in the same chapter subset.",
  }),
  Object.freeze({
    en: Object.freeze(['chain reaction']),
    is: 'keðjuhvarf',
    ruled: '2026-09-20 [USER]',
    why: 'ch21 (22 segments), key term, no row. [USER] ruled the plural keðjuhvörf; recorded singular for the substring rule, so the model inflects.',
  }),
  Object.freeze({
    en: Object.freeze(['reaction order']),
    is: 'stig efnahvarfs',
    ruled: '2026-09-20 [USER]',
    why: 'ch12 (21 segments), key term, no row. Singular, which also matches reaction orders. The MT already writes stig efnahvarfs (26 tokens).',
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // 2026-09-21 — six rows from the glossary-subset audit's 18 questions.
  // Full record: docs/decisions/2026-09-21-chemistry-terminology-rulings.md.
  //
  // ⚠️ ALL SIX ALREADY HAVE AN APPROVED ROW, and every one of those rows sits
  // in a NON-chemistry domain (five `physics`, one `biology`). They are NOT
  // edited or deleted: a house-style concept is filed under `chemistry`, which
  // is FIRST in BOOK_DOMAIN_PRIORITY for both books that ship, so it outranks
  // them — the non-destructive route CLAUDE.md prescribes.
  //
  // §C73 control, measured 2026-09-21 over books/efnafraedi-2e/02-mt-output/
  // **/*.is.md (case-insensitive substring, so inflected and compounded forms
  // count). Every ruled form below is one the model ALREADY produces; in three
  // cases the currently-approved form is one it has NEVER produced.
  // ─────────────────────────────────────────────────────────────────────────
  Object.freeze({
    en: Object.freeze(['hydrocarbon']),
    is: 'vetniskolefni',
    ruled: '2026-09-21 [USER]',
    why:
      'Resolves a genuine COLLISION, which is the case CLAUDE.md says a glossary row earns its ' +
      'place on: ch20 calls two different things kolvetni — hydrocarbons (59, including the §20.1 ' +
      'section title) AND carbohydrates (7, including the note title "Kolvetni og sykursýki"). ' +
      'With carbohydrate → sykra, kolvetni is retired for both senses. The approved row was ' +
      'vetniskol (domain physics) and the ruled form is a listed alternative. MT: vetniskolefni 3, ' +
      'vetniskol 3, kolvetni 89 — so the ruled form is produced, not invented. ⚠️ 40 kolvetni ' +
      'occurrences in five ALREADY-BOUGHT chapters are not repaired by this row; they are an ' +
      'editor substitution or a targeted re-buy, and ch05 is mostly the CARBOHYDRATE sense.',
  }),
  Object.freeze({
    en: Object.freeze(['laser']),
    is: 'leysir',
    ruled: '2026-09-21 [USER]',
    why:
      'ch21. The approved row was ljósleysir (domain physics), which appears 0 times in the ' +
      "book's committed MT, while the model writes leysir 56 times unprompted and compounds it " +
      'correctly (leysigeisla, leysiorka, leysiaðskilnaði — the leysi- stem 546). §C73: a form ' +
      'the model never produces is untested, not better.',
  }),
  Object.freeze({
    en: Object.freeze(['steam']),
    is: 'gufa',
    ruled: '2026-09-21 [USER]',
    why:
      'ch21, the reactor and power-plant sections. The approved row was vatnsgufa (physics), ' +
      'which is water VAPOUR and would yield vatnsgufuketill for a steam generator. MT: gufa 97 ' +
      'against vatnsgufa 21, and the model compounds it correctly (gufuketill, Gufuþrýstingurinn).',
  }),
  Object.freeze({
    en: Object.freeze(['electronegative']),
    is: 'rafneikvæður',
    ruled: '2026-09-21 [USER]',
    why:
      'ch18. Makes the PAIR consistent, which is why [USER] ruled it: the book already has ' +
      'electronegativity → rafneikvæðni in the CHEMISTRY domain, while the singular adjective sat ' +
      'at rafeindadrægur in PHYSICS. MT: rafneikvæð- 140 against rafeindadræg- 5. ⚠️ No substring ' +
      'collision with the existing row — "electronegativity" does not contain "electronegative" ' +
      '(…ativ+ity vs …ative).',
  }),
  Object.freeze({
    en: Object.freeze(['phase transition']),
    is: 'fasabreyting',
    ruled: '2026-09-21 [USER]',
    why:
      'ch16. A house-consistency ruling, not a defect — hamskipti (the approved row, physics) is ' +
      'not wrong. MT: fasabreyting 17, hamskipti 4, fasaskipti 2, and ch10 (states of matter, ' +
      'already re-bought) came out the same way. Sending hamskipti for ch16 alone would have made ' +
      'ch16 the outlier. Multiword, so it cannot substring-collide.',
  }),
  Object.freeze({
    en: Object.freeze(['carbon monoxide']),
    is: 'kolmónoxíð',
    ruled: '2026-09-21 [USER]',
    why:
      'ch18. The approved row was koleinoxíð (domain BIOLOGY) with 0 tokens in the MT; the model ' +
      'writes kolmónoxíð 25 times. [USER] chose the produced form over the tví-/ein- pairing with ' +
      'carbon dioxide → koltvíoxíð. Multiword, so it cannot substring-collide.',
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
