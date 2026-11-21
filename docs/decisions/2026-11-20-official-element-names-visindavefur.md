# Decision: Vísindavefur answer 89909 is the official list of Icelandic element names for chemistry

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context owners:** [USER] (named the list on 2026-11-20; answered the reason, the scope and the
  alternatives in the same session)
- **Supersedes:** none. No earlier record rules on element names. The figure-label records of
  2026-09-15 and 2026-10-06 measure how element names *fit* in translated figures, not which names
  are right.
- **Related:**
  - `experiments/element-names/README.md` and its `evidence/2026-11-20-census/`: the evidence;
  - `docs/superpowers/specs/2026-11-19-book-glossary-layer-design.md`: the layer that chemistry term
    rulings go through;
  - `docs/editorial/terminology.md`: the editors' reference sources;
  - `experiments/figure-text-translation/REGISTER.md`: translated figures, including periodic tables.

> **FROZEN EVIDENCE — banner-dated 2026-11-20.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Which source decides the Icelandic name of a chemical element in the chemistry book
(`efnafraedi-2e`)? That covers the glossary, the editors' term checks and the translated text.

The answer was at stake because the sources in use disagree. Chemistry's glossary resolves element
names from Íðorðabankinn's physics domain, the MT writes its own forms, and the two differ from each
other and from the newest published list. One book can then carry two names for one element.

## Decision

**The list in Vísindavefur answer 89909 is the official list of Icelandic element names for
chemistry, in full.** The source is <https://www.visindavefur.is/svar.php?id=89909>, *"Hvað heita
öll frumefnin á íslensku?"*, published 2026-11-13 and updated 2026-11-18.

"In full" covers all 118 names as the page writes them. That includes its short forms (`úran`,
`selen`, `títan`, `króm`, `tellúr`, `ál`) and its two-name entries (`köfnunarefni / nitur`,
`wolfram / tungsten`), where either name is official.

## Reasoning

### It is the newest expert ruling

[USER]'s reason. The page follows a November 2026 resolution by chemists and other experts on the
element names to use in teaching materials. No newer authority on these names exists.

### The scope applies in full, although the page addresses compulsory school

The page recommends its names for compulsory-school (*grunnskóli*) teaching materials, and this
textbook is used at upper-secondary and university level. [USER] ruled that the list applies to
chemistry in full regardless, with no exceptions.

### What the evidence shows

Measured read-only on production on 2026-11-20 (`experiments/element-names/`, prod HEAD
`844f13d2f`). The numbers are a dated snapshot.

- **Against chemistry's glossary:** 41 elements match the list, 9 differ and 68 have no chemistry
  row. All 50 resolved names other than `neptunium` come from the physics domain. The 9 that differ
  are `german`, `sirkon`, `rúten`, `lantan`, `praseódým`, `neódým`, `pólon`, `astat` and `plúton`.
- **Against the MT:** for the names with no row, the MT is inconsistent within the one book. It
  writes `ameríkín` in one module and `amerísín` in another, `litíum` 71 times where the list has
  `liþíum`, and `kúríum` where the list has `curíum`. Across those names, 481 occurrences are not
  the official form, against 1,522 that are.

What was checked against the tree: the official list was parsed from the page's HTML, not
transcribed. The glossary and MT figures came from read-only runs of the server's own resolver and
worklist matcher. What was read from code and not run: that the head-editor page produces no
worklist for a name with no row (`worklistSpec` returns `add-alongside`).

## Consequences

- **Chemistry's element names are judged against this list.** That covers the glossary, the
  editors' term checks and the translated text. Where a resolved name already matches, nothing
  changes. The short forms the list keeps are correct and are not to be "corrected" to `-íum`.
- **Changes go through the book glossary layer, never `concept_term`** (CLAUDE.md, the c19
  ruling). The physics-domain rows stay in the shared concept model; this record does not judge
  them for physics or any other book.
- **The MT layer is not touched.** CLAUDE.md's no-hand-repairs ruling keeps `02-mt-output` as
  received, so the text is fixed in the editors' layer. The evidence folder is the
  before-measurement that the research evaluation needs (CLAUDE.md § Purpose).
- **Translated figures are chemistry text,** so element names in translated periodic tables fall
  under this list too. This record does not measure them.
- **Other books are not decided here.** Biology, microbiology and physics are not covered.
- **It forecloses** the physics-domain forms for the 9 names that differ, and the MT's own forms,
  as chemistry's names. Reversing it means removing or changing book-layer entries. The pure MT
  is unaffected either way.
- **Follow-up work it creates:** book entries for the names that differ, and fixes to the segments
  the evidence lists. Ruthenium's list needs the MT's form `rúþen`, not the glossary's `rúten`. Also,
  whether names with no row get rows at all, which CLAUDE.md's §C73 test answers name by name.
  Where that work is tracked: the active register.

## Alternatives considered

1. **Íðorðabankinn's physics rows** (what chemistry resolves to today). Rejected as the authority:
   they disagree with the newest expert ruling on 9 names, and they cover only 51 of the 121
   English spellings checked. Where they agree with the list, nothing changes.
2. **The MT's own forms.** Rejected: they are inconsistent within one book, and CLAUDE.md treats MT
   output as never a correctness reference. Mostly `-ín` endings, plus `litíum`, `kúríum` and an
   untranslated English name here and there.
3. **Íðorðabankinn's anatomy-physiology rows.** Rejected: closer to the list (mostly `-íum`), but
   outside chemistry's domain scope, available for only 19 of the 68 names with no chemistry row,
   and different from the list on `litíum` (list: `liþíum`) and `þallín` (list: `þallíum`).
