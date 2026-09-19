# Decision: chemistry's text MT sends a two-term glossary subset (enthalpy, enthalpy change) instead of no glossary

- **Date:** 2026-09-19
- **Status:** Accepted
- **Context owners:** [USER] (the choice) · pipeline (the probe and the `--glossary-only` flag)
- **Supersedes:** none. It is a bounded exception to the 2026-09-06 glossary-off ruling, whose verbatim
  record is in the active register's **§C133**; that ruling is not withdrawn.
- **Related:** `docs/plans/2026-09-05-per-chapter-loop.md` (Step 2) ·
  `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C133, and the register's 2026-06-25 enthalpy datapoint) ·
  `docs/plans/2026-06-25-term-system-audit.md` (item 4, the first measurement) · CLAUDE.md § glossary
  (*"add a term only when it resolves an ambiguity the model cannot see"*)

> **FROZEN EVIDENCE — banner-dated 2026-09-19.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

[USER] ruled on 2026-09-06 that the glossary comes off the paid MT wire, because §C133 measured its benefit inside
the same-arm noise floor and its wrong-sense headwords had damaged real output. Chemistry ch05 is the thermochemistry
chapter: 138 of the book's `enthalpy` occurrences, 137 of them in `m68727`. The one measured glossary benefit in the
repository was exactly this term (2026-06-25: `vermi` with the glossary, `varmi` = *heat* without it). Does the
glossary-off ruling hold for a term where the model, unprompted, collapses two concepts onto one Icelandic word?

## Decision

**No — for that class only.** Chemistry ch05's text was bought with `--glossary-only "enthalpy,enthalpy change"`:
the approved glossary narrowed to those two headwords, everything else still off the wire. On any chunk whose
English does not contain either headword, nothing is sent, so the wire is identical to `--no-glossary`.

## Reasoning

### The probe was paid for and measured per segment, with a control

The instrument: for each segment whose English contains `enthalp`, does the Icelandic contain `verm-`, only `varm-`,
or neither? It was run first on the committed glossary-era MT as a positive control.

| m68727, 86 enthalpy segments | `verm-` | `varm-` only | neither |
|---|---|---|---|
| committed MT (June, full glossary) — the control | 83 | 0 | 2 (+1 missing) |
| **2026-09-19, `--no-glossary`** (paid, discarded) | 19 | **40** | 27 |
| **2026-09-19, `--glossary-only` enthalpy subset** | **86** | 0 | 0 |

Unprompted, the model used three different terms for one concept: `varmaorka` (the title *Enthalpy* became
*Varmaorka*, which is *thermal energy*, a separate approved term), `varmi` (*heat*), and `entalpía`. The
remaining `verm-` hits were compounds such as `útvermið` (*exothermic*), not `enthalpy` itself. The finding
therefore reproduces June's, on today's model, at n = 86.

### It is the class CLAUDE.md already carves out

CLAUDE.md's glossary rule has two halves: delete a term that overrides a choice the model makes better, and keep
one that *"resolves an ambiguity the model cannot see"*. Its example of the mirror case is two English terms
collapsing onto one Icelandic word. `enthalpy` and `heat` → `varmi` is that case, and the sentence does not carry
the distinction.

### The subset avoids the harms the ruling was about

§C121/§C117's damage came from wrong-sense and short headwords reaching unrelated prose through substring matching.
A subset of two long, unambiguous headwords cannot fire on ordinary English. Measured: `m68724` and `m68726`
carried the subset on 0 of their chunks.

## Consequences

- `tools/api-translate.js` has a `--glossary-only <headwords>` flag. It refuses before any spend if a named headword
  is not in the approved glossary or is combined with `--no-glossary`, and it stamps provenance
  `arm: "glossary-only"`. The per-chapter loop's arm check must accept that value alongside `no-glossary`.
- **Scope decided here: chemistry ch05.** Whether the same subset is the standing arm for later chemistry chapters
  is [USER]'s. `enthalpy` also occurs in ch07, ch10 and ch16 (37, 38 and 27 times in `02-for-mt`). Where it stands is
  owned by the register, not this file.
- Adding a headword to a subset is a new decision of this kind. It needs its own unprompted control first
  (§C73's test: does the model already produce the wanted form?), and only a measured mirror case qualifies.
- Reversal is cheap: drop the flag. The cost is ~40 of 86 enthalpy segments per affected module going wrong
  again, for editors to fix by hand.

## Alternatives considered

1. **Keep `--no-glossary` and make the ~67 enthalpy segments an editor task.** Rejected. The errors are
   well-formed Icelandic that no gate detects. They include a title that would rename the published page
   `5-3-vermi.html`. And the one-pass editing model would spend that pass on a defect a two-term subset avoids.
2. **Re-buy `m68727` with the full current glossary.** Rejected. It brings back every wrong-sense and substring
   risk the 2026-09-06 ruling removed, for one module, to fix one term.
3. **Revert `m68727` to its June MT.** Rejected. That vintage is mixed (a 2026-03 re-inject kept older
   segments) and predates the current extraction.
