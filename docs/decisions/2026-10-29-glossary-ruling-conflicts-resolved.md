# Decision: the 35 glossary-vs-ruling conflicts in chemistry are resolved, with three entry rules

- **Date:** 2026-10-29
- **Status:** Accepted; its *polyatomic ion* row is superseded by `docs/decisions/2026-11-01-polyatomic-ion-two-words.md`
- **Context owners:** [USER] (every decision); [CODE] (the census, the review page and this record)
- **Supersedes:** none. It amends targets in `experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json`, which is a compiled artifact and is not edited by hand (see Consequences).
- **Related:** `experiments/terminology-consistency/results/2026-10-29/conflict-answers-2026-10-29.json` (the answers, verbatim); `experiments/terminology-consistency/results/2026-10-29/conflict-items-2026-10-29.json` (what the page showed); `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`; `books/efnafraedi-2e/glossary/glossary-unified.json`; the active register.

> **FROZEN EVIDENCE — banner-dated 2026-10-29.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The AI term pass applies [USER]'s ruling set. Whether the whole chemistry glossary should join it was measured on
2026-10-29, and the census found 35 ruled headwords where the glossary gives different Icelandic. Two of them
collapse distinct concepts onto one word: the glossary gives *nákvæmni* for both *accuracy* and *precision*, and
*girðitala* for *valence* although that is the term for *coordination number*. A collapse like the first would make
the chapter on measurement unable to tell accuracy from precision. The question was which Icelandic the book uses
for each of the 35, and what the answers imply for how entries are written.

## Decision

[USER] decided all 35 on a review page showing each term in book context, then clarified three in the session.
The effective outcome:

| Outcome | Terms and the Icelandic the book uses |
|---|---|
| The ruling stands (9) | accuracy *hittni*; atomic orbital *atómsvigrúm*; alpha particle *alfaeind*; bonding orbital *tengisvigrúm*; dipole moment *tvískautsvægi*; dissociation constant *klofnunarfasti*; electron affinity *rafeindasækni*; polyatomic ion *fjölatómajón*; rate law *hraðalögmál* |
| The glossary wins (18) | alpha decay *alfasundrun*; beta decay *betasundrun*; becquerel *bekerel* (the unit; the name Becquerel is not translated); bimolecular reaction *tvísameinda efnahvarf*; calorie *kaloría*; collision theory *árekstrakenningin*; electron capture *rafeindarhremming*; electron volt *rafeindarvolt*; frequency factor *tíðnistuðull*; Geiger counter *Geiger-nemi*; heat *varmi*; lattice energy *grindarorka*; molality *mólalstyrkur*; nucleon *kjarnaeind*; osmosis *himnuflæði*; osmotic pressure *flæðiþrýstingur*; solute *leyst efni*; standing wave *stæð bylgja* |
| Both, by grammar (5) | isomer *hverfa* / isomers *hverfur*; intermolecular force *millisameindakraftur* / forces *millisameindakraftar*; monodentate *eintenntur* / *eintennt* (agrees with its noun); calorimetry *varmamæling* (one measurement) / *varmamælingar* (measurements, and the field); periodic table *lotukerfið* by default, *lotukerfi* where an editor judges it fits |
| Other (3) | **valence *gildistala*** on its own (the card chose the ruling *gildi*; [USER] first corrected it to *tengigeta*, then the same day read the chemistry glossary's *girðitala* as a typo for *gildistala*, the immunology glossary's term, and chose that); the compounds keep *gildis-*: valence electron *gildisrafeind* (chemistry glossary), valence bond *gildistengi* and valence band *gildisborði* (physics glossary), valence shell *gildishvolf* (as in the VSEPR ruling), valence orbital *gildissvigrúm*; vacancy *eyða* (the glossary's listed alternative to *eyðuveila*: students would not know *veila*); concentrated has **no standalone entry**: concentrated acid *megn sýra*, concentrated base *megn basi*, and other uses are translated in context |

Our copy of the glossary is corrected in two rows: *valence → girðitala* becomes *gildistala* (read as a typo) and
the standalone *concentrated → megn* is removed. Both are to be raised with the Icelandic Chemical Society.

## Reasoning

### Three entry rules, from [USER]'s notes

1. **A symbol or unit is not part of an entry.** *(q)*, *(m)*, *(cal)*, *(ΔHgrind)*, *α* and *β* follow the source
   when the source has them, and are never added by a glossary or a ruling. Six rulings carried one.
2. **The official glossaries are followed unless consistency argues otherwise.** The exceptions here are
   consistency arguments: *constant → fasti* across the book, *bond → tengi*, and *frumeind → atóm* carried into
   compounds (*atómsvigrúm*, *fjölatómajón*). Where the chemistry glossary has no entry, the physics glossary is used.
3. **Number, gender and the definite article are not conflicts.** An entry names a dictionary form, and the text
   inflects it. Five of the 35 were this, and *lotukerfið* and *árekstrakenningin* are deliberate definite forms
   for a specific table and a specific theory.

### The two collapses

*Accuracy* and *precision* name different properties of a measurement, and [USER] rules *hittni* for accuracy (how
well a measurement hits the target) and *nákvæmni* for precision (how consistently it hits the same point). The
glossary's *girðitala* for valence duplicates its term for coordination number, a different concept. The physics
and other glossaries give *gildi* and the immunology glossary *gildistala*, so [USER] reads it as a typo for
*gildistala*.

### What was checked

The census and the review data were computed read-only from layer 1 (`02-mt-output` plus the `02-mt-selected`
overlays) and `02-for-mt`, using the repo's own matchers. The census's positive control (*doping*, a known miss)
fired. The conflict list was rebuilt from the ruling set and the glossary rather than from memory, and its
collapse check found *valence* with nobody looking for it.

## Consequences

- **The ruling set cannot take these by hand.** `tools/ai-review/compile-ruling-set.js` compiles a frozen
  2026-10-11 base plus a scope-exceptions file, and a test requires byte equality with the committed artifact.
  It has no input that changes a target, so applying this record needs a dated amendments input to the compiler,
  test-first, then a recompile to a new dated ruling set.
- **Valence cannot change alone.** Measured in the book's English: bare *valence* is about 18 uses; about 270 are
  compounds (valence electron(s) 149, valence shell(s) 62, valence bond 29, valence orbitals 14, valence band 7). The
  work list shields a short ruling only where a longer ruling covers the phrase, and the only valence compound ruled
  today is the VSEPR theory. So *valence → gildistala* needs the five compound rulings above in the same change, or it
  offers *gildistala* inside every *gildisrafeind* context.
- **Server-side term sources must agree with the new set.** Rulings also live in `server/lib/houseStyleTerms.js`
  and in production's book term preferences, which the editor's terminology checks read. They are changed as code
  and deployed, never by hand-run SQL (CLAUDE.md, on values a migration re-asserts on boot).
- **The glossary corrections go through the concept model** on production, then the export, then a pull (CLAUDE.md:
  `terminology_translations.status` is inert for the export).
- **The ch10 AI pilot ran on the old set.** Its records stay as they are; any later comparison run uses the new set.
- **What it forecloses:** adding the whole glossary to the AI pass as it stands. Reversing a single decision means
  a new record that supersedes this one for that term.
- Follow-up work and its order are tracked in the active register, not here.

## Alternatives considered

1. **Add the whole glossary to the AI pass.** Rejected on the census: most of its 14,056 raw misses are everyday
   words, symbols and physics- or biology-domain rows, and the 35 conflicts would have sent the AI pass two targets
   for one term.
2. **Let the ruling set win every conflict.** Rejected by [USER] term by term: 18 glossary terms are better or more
   standard, and six rulings carried symbols that do not belong in an entry.
3. **Defer every conflict to the Icelandic Chemical Society.** Rejected for the book's timetable; the two entry
   errors are raised with the Society while our copy is corrected now.
