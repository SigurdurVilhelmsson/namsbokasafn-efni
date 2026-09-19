# Decision: the enthalpy glossary subset is chemistry's standard MT arm, and every chapter is checked for its own subset terms and short math labels

- **Date:** 2026-09-19
- **Status:** Accepted
- **Context owners:** [USER]
- **Supersedes:** `docs/decisions/2026-09-19-enthalpy-glossary-subset-exception.md` (its scope, "chemistry ch05 only";
  its evidence and reasoning stand and are not repeated here)
- **Related:** `docs/plans/2026-09-05-per-chapter-loop.md` (Step 2) · the active register's ⏩ RESUME ·
  `tools/lib/math-label-inventory.js` (`LOCALIZABLE_SHORT_LABELS`, where the `rxn` ruling of the same day lives)

> **FROZEN EVIDENCE — banner-dated 2026-09-19.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

After ch05, [USER] was asked whether `--glossary-only "enthalpy,enthalpy change"` should be the arm for later
chemistry chapters. The same day's re-render also turned published `ΔH°hvarf` into `ΔH°rxn` under the 2026-09-04
short-label default. Both findings share a shape: a flat rule that is right in general can be wrong for one term.
What should the per-chapter loop do about that?

## Decision

1. **`--glossary-only "enthalpy,enthalpy change"` is the standard arm for chemistry text MT.** On any chunk
   without either headword it sends nothing, so it is identical to `--no-glossary` there.
2. **Chapters are thematic, so each one is checked for ITS OWN mirror-case terms.** A term joins that chapter's
   subset only on measured evidence, as in ch05: an unprompted rendering that is inconsistent or collapses two
   concepts, against a control. The subset is per chapter, not a growing global list.
3. **Each chapter is also checked for short math labels** that the book's `math-label-map.json` translates but the
   short-label default renders in English. [USER] rules on each one; the ruling goes into
   `LOCALIZABLE_SHORT_LABELS` with its reason. `rxn → hvarf` was the first, on the same day.

## Reasoning

### One term, one chapter, is the unit where both defects were found

Neither the glossary-off ruling (2026-09-06) nor the short-label default (2026-09-04) is withdrawn. Both were
measured correct in aggregate. Both were wrong for exactly one term that a chapter happened to concentrate:
137 `enthalpy` occurrences in one module, and `rxn` throughout thermochemistry's equations. Aggregate measurements
cannot see such a term, and a chapter-sized check can.

### The checks must be cheap enough to run every chapter

A per-term paid probe costs a module (~500 ISK) each time. The standing check therefore has to be mostly free: a
census over the chapter's English, the committed MT and the book's maps that names *candidates* before or after a
buy. Paid confirmation is reserved for candidates. How that census is built and run belongs to the loop plan and
the register, not to this record.

## Consequences

- The loop plan's Step 2 arm is `--glossary-only` with the chapter's subset. Provenance reads
  `arm: "glossary-only"`, and a bare `"glossary"` arm is still wrong.
- Every chapter gains two review questions for [USER]: the subset candidates, and the short labels.
- A term added to a subset for one chapter does not carry to the next unless that chapter's check finds it too.
- Reversal: drop the flag and its subset. The cost is the mirror-case errors returning for editors to fix by hand.

## Alternatives considered

1. **One global subset that grows with every chapter.** Rejected: [USER] noted the chapters are thematic, and a
   term that is a mirror case in thermochemistry need not be one elsewhere. A global list drifts back towards the
   full glossary the 2026-09-06 ruling removed.
2. **Put the full glossary back on the wire.** Rejected for the 2026-09-06 reasons (wrong-sense and substring
   headwords), which this decision does not revisit.
