# Follow-up — robust IS→EN table-cell translation gate (deferred from the OC-B fix PR)

**Status:** deferred (lead decision 2026-07-06). **Why here:** the OC-B container-table fix PR
(`fix/chem-ocb-container-table-translation`, plan `docs/superpowers/plans/2026-07-06-ocb-container-table-translation-fix.md`)
originally bundled a producer-side gate (Task 4, "Gate A"). Stress-testing (in-memory `buildCnxml`
over all 147 modules) proved the **fix** correct book-wide but showed **Gate A is too brittle to
hard-fail**, so it was split out per "split refactor from enforcement".

## Why Gate A failed

Gate A asserted the **raw segment text** (`getSeg(segmentId)`) appears verbatim (after light
normalization) in the table's output block. But output cell text is **processed** after `getSeg`
(marker→tag conversion, term/emphasis restoration), so it legitimately diverges from the raw segment:

- **m68791** `fs-idp72766816` r0c0: output `Tími (klst.)` (period added) vs segment `Tími (klst)` →
  false throw, though the cell is correctly Icelandic (English `Time (h)` absent).
- **m68770** `fs-idm7525216` r3c3: output `aðeins ef bráðið/leyst` vs segment `…uppleyst` →
  term-processing mutated the IS text → false throw.

Both are FALSE POSITIVES (cells are translated, not English-reverted). A hard-fail Gate A would
spuriously block WS5.

## Tractable redesign (recommended for the follow-up PR)

Compare the **rendered output table** to the **source table** entry-by-entry. They align positionally
even where structure-cell counts don't (output = source with cell *contents* swapped), so this
sidesteps the 5-vs-4 structure/source cell-count misalignment (e.g. m68791 row2).

For each aligned entry position:
- Skip unless the **source** entry carries a content-word (letters, not just a number/formula/symbol) —
  this is the "translatable" discriminator; formula/number cells are skipped, no allowlist needed.
- Skip if a translation for that cell is absent/empty.
- **Flag (reversion) only when the output entry still equals the source entry** (normalized) — i.e.
  the English source survived into the output.
- **Strip the opening `<table …>` tag before comparing** so the English `summary="…"` attribute
  (present on OpenStax tables) doesn't create phantom English matches.

This is robust to IS-text processing (period, term mutation) because it compares output↔**source**,
not output↔raw-segment. It catches the real OC-B reversion (m68710 pre-fix: output `Reactants` ==
source `Reactants` while a translation existed → flag).

**Land it warn-only first, then flip to hard-fail** once a full-book run is clean (order-check / F8
precedent). Wire in `buildCnxml` after `assertNoMarkerResidue`.

## Also-found (separate, log to register)

- **m68770 within-Icelandic text mutation `uppleyst`→`leyst`** — a `<term>`/marker restoration side
  effect corrupts translated IS text (NOT OC-B, NOT English reversion). Independent bug; investigate
  term/marker restoration for the affected cell. Register: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`.

## Prior art in git

The rejected Gate-A implementation is recoverable at commit `2eef3e29` (dropped from the fix branch)
if useful as a starting reference (the `normalizeForTableGate` normalizer and the per-cell walk are
reusable; only the comparison basis changes).
