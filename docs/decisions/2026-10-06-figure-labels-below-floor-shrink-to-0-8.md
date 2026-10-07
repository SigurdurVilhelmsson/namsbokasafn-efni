# Decision: A figure label the source set below 7.5 pt may shrink to 0.8 × its source size, and the change rides in COMPOSER_VERSION '6'

- **Date:** 2026-10-06
- **Status:** Accepted
- **Context owners:** [USER] (rulings R-16, 2026-10-05, and its timing, 2026-10-06); composer (§C140)
- **Supersedes:** none. It **amends** rulings R4 and R5 of [USER] 2026-09-13, as recorded in
  `docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md`. That spec is
  frozen and is not edited.
- **Related:**
  - `docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md` (§8 R-16, §2 D-i)
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C140 and its RESUME)
  - `experiments/figure-text-translation/figlayout.py` (`size_steps`, `SUB_FLOOR_RATIO`)

> **FROZEN EVIDENCE — banner-dated 2026-10-06.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

[USER]'s 2026-09-13 rulings set the composer's size rules for translated figure labels:
- **R4:** the shrink floor is 7.5 pt, and no translated label is drawn smaller.
- **R5:** a word that does not fit at the floor overhangs, and is NAMED in the run output, never
  shrunk further.

The composer applies the floor as `min(7.5, source size)`. So a label the SOURCE set below 7.5 pt
can never shrink at all: `size_steps(4.0, 7.5)` is `[4.0]`. The question had two parts:
- May such a label shrink below its own source size, and if so, by how much?
- Should that change ship in the same `COMPOSER_VERSION` bump as the seven formatting mechanisms
  ('6'), or as its own later bump?

The stakes were legibility against overflow. The five periodic tables set element names at 4.0 pt,
and 22–24 names in each overflowed their cells. FoodLabel's 5 pt margin words did too. A
`COMPOSER_VERSION` bump also demotes every figure approval on prod, so every bump costs editors a
round of re-review.

## Decision

**Yes, to a fixed ratio, and in '6'.**
- A label whose source size `sz0` is below the 7.5 pt floor may shrink to `0.8 × sz0`, unrounded.
  At or above the floor, R4's 7.5 pt stands unchanged.
- The ratio is the module constant `SUB_FLOOR_RATIO = 0.8` in `figlayout.py`'s `size_steps`.
  Setting it to `1.0` restores the pre-R-16 ladder exactly.
- R5 still governs whatever does not fit at the new floor: it overhangs and is named.
- Ruled by [USER] on 2026-10-05 (option *"Yes: shrink to 0.8 × source size, only where the source
  is below 7.5 pt"*). The 2026-10-05 spec recommended a separate change; [USER] chose on 2026-10-06
  to ship it in '6'.

## Reasoning

### The floor that excluded these labels was never a size judgement about them
R4's 7.5 pt protects legibility for labels the source drew at normal sizes. A label the source
already drew at 4 pt was exempted from shrinking entirely, by the `min(F, sz0)` rule, rather than
given a proportionate floor. A floor relative to the source keeps the same proportion OpenStax
chose, and goes no further below it than 20 %.

### Measured, with the figures that change named
Measured 2026-10-06 on the implemented tree (`scratch/c140v6-impl`, T8 commit `e79f37bc8`), over all
451 chemistry sidecar figures:
- Exactly 7 figures change because of R-16: the five periodic tables, `04_05_combmap_img` and
  `05_02_FoodLabel`.
- In those 7, named overflows fall from 125 to 23. 120 labels are drawn below their source size.
- The smallest size drawn is 3.2 pt (0.8 × 4.0). No label is drawn below 3.0 pt.
- `combmap_img` composes byte-identical to the 2026-10-05 prototype arm (`m7/runs/r2`), so the
  shipped rule is the measured one.
- By eye in Chromium (PerTable1 triptych): long element names (*köfnunarefni*, *brennisteinn*,
  *germanium*) sit inside their cells, where the published copy lets them reach the cell walls.

### Why it rides in '6'
Prod figure review is closed until '6' deploys ([USER]'s R-22). A separate later bump would demote
every approval editors make after '6' and require a second re-review. One bump costs one review.
The cost: R-16 enters a release that also carries seven other mechanisms. It is kept attributable
by its own task, its own commit and its own measurement.

## Consequences

- The floor now depends on the source size `sz0`. It is 7.5 pt when `sz0 ≥ 7.5`, as R4 ruled, and
  `0.8 × sz0` when `sz0 < 7.5`. A label the source set at or above 7.5 pt can still never go below
  7.5 pt. (This is NOT `min(7.5, 0.8 × sz0)` for every label; that is the rejected alternative 2.)
  Any check, document or reviewer that assumes R4's floor without this amendment is out of date.
- The composer's report gains `belowSource` (one entry per label drawn below its source size), so
  each such label is named in the run output, as R5 names an overhang.
- Reversing it is a one-constant change (`SUB_FLOOR_RATIO = 1.0`). Its pixels reach media only at a
  `COMPOSER_VERSION` bump, like every composer change.
- No absolute minimum size is set. A source label at 1.3 pt (`Exposure1`) could in principle be
  drawn at 1.04 pt; the measurement found no label below 3.0 pt. Revisit this if one appears.
- The work it creates (PR-B's recompose and [USER]'s visual review of the changed figures) is
  tracked in the register's §C140, not here.

## Alternatives considered

1. **No** — keep R4/R5 as ruled. Rejected by [USER]: it leaves 120 named overflows, almost all
   periodic-table element names.
2. **`min(7.5, 0.8 × sz0)` for EVERY label** (the prototype's `r1`). Rejected on measurement: it
   adds only 11 fixes and shrinks about 40 labels from 7.5 to 7.2 pt for no gain (34 figures
   changed, against 7).
3. **A per-key size override** (forcing a size for named labels). Rejected: no such mechanism
   exists. It reopens R4/R5 key by key, without a rule a reviewer can check. FoodLabel's margin
   words are being fixed by widening their boxes instead (`artworkEdits`, R-15a2).
4. **A separate bump after '6'** (the spec's recommendation). Rejected by [USER] on 2026-10-06; see
   *Why it rides in '6'*.
