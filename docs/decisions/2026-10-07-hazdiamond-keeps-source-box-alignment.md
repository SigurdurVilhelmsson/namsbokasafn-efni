# Decision: HazDiamond's boxes keep the source's alignment, through a per-figure table, with two boxes widened and the special-hazard list broken explicitly

- **Date:** 2026-10-07
- **Status:** Accepted
- **Context owners:** [USER] (rulings R-5b, R-5c, R-5c2 and R-5c3, 2026-10-07, on the composer
  rulings page); composer (§C140, COMPOSER_VERSION '6')
- **Supersedes:** none. For **one figure** it departs from ruling R2 ("Schematic boxes: centre
  every line … in its box") and from R-2a = C (2026-10-05, shared boxes centred on each label's
  own source centre). Both stay in force for every other figure.
- **Related:**
  - `docs/superpowers/specs/2026-10-05-c140-composer-formatting-class-design.md` (§8 R-2, R-5;
    frozen, not edited)
  - `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C140 and its RESUME: PR-B)
  - `experiments/figure-text-translation/figcontainers.py` (`SHARED_BOX_ALIGN`, `_container_for`)
  - `experiments/figure-text-translation/figure-text.config.json` (`artworkEdits` and the new
    per-figure table this record motivates)

> **FROZEN EVIDENCE — banner-dated 2026-10-07.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

On the NFPA hazard diamond (`CNX_Chem_01_03_HazDiamond`), version 6 put the special-hazard list
on the source row pitch but with its content one row off from ACID down (*Sýra Basi* on one row,
*Notið / ekki vatn* on two), which on a safety chart reads as a deliberate wrong pairing. R-5b
(2026-10-07) ruled "a wording edit". Measured wordings fixed the rows only by changing meaning
(*Sýrur Basar*, *Ekki vatn*). [USER] answered R-5c with four notes: widen the box so the
original wording fits; left-align both columns of every box as the source does; four word
fixes (*Heilsufars- / hætta*, *3 Mjög mikil hætta*, *2 Ofsafengin efnabreyting*, *Notið ekki
vatn*). Two follow-ups were then measured and ruled: R-5c2 (layout) and R-5c3 (singular or
plural).

## Decision

1. **R-5c2 = (b+).** Every box in HazDiamond keeps the source's alignment (number or code column,
   then a left-aligned explanation column at the source x), through a **per-figure table** in
   `figure-text.config.json`. Two `artworkEdits` widen boxes to the right: the special-hazard
   list box by **6 pt**, and the Reactivity box by **27 pt**, so its list returns from 7.5 pt
   to 9 pt.
2. **The special-hazard list is stored with explicit line breaks** (the R-5a route, built in
   PR-A for phscale), one item per source row: *Oxunarefni / Sýra / Basi / Ætandi / Notið ekki
   vatn / Geislavirkt*.
3. **R-5c3 = singular:** *Sýra*, *Basi*, as the machine translation has them.
4. The four word fixes are applied as value edits. *Heilsufars‐* uses U+2010, as SolTherm1's
   ruled split words do.

## Reasoning

### The row pairing was never width-bound

The free cut chooses lines by minimising the widest line under rule (E), not by the box width.
Measured: *Oxunarefni Sýrur Basar Ætandi Notið ekki vatn Geislavirkt* still cuts *Sýrur Basar*
together and splits *Notið / ekki vatn*; a non-breaking space binds nothing on that path. Only an
explicit break keeps *Notið ekki vatn* whole. With it, all six rows sit beside their codes at the
source pitch (12.15 pt), with no overflow. This uses R-5a's route although R-5b chose (d) over
(a); [USER] chose it with that stated on the R-5c2 card.

### Left alignment needs the widening, and the widening is measured, not estimated

Prototyped as an uncommitted switch: left-aligned, *Notið ekki vatn* hits the list box's right
edge and the whole column moves about 3 pt left of the source column (96.15 against 99.07 pt).
With the box's right edge moved 6 pt (`move-edge`), the column sits at 99.065 pt and the text
clears the edge by 6.0 pt (the source clears it by 5.6 pt). Moving it 10 pt gave the same
column. The Reactivity box widened 27 pt lets all five ratings return to 9.0 pt (from R-3's 7.5),
and its edge then ends 1.3 pt inside the 432 pt page.

### Per figure, not global

`SHARED_BOX_ALIGN = 'source'` (R-2a option B) is global and reaches only shared boxes; the rating
boxes are single-label boxes, which R2 centres and for which a global source alignment was
measured to break `test_compose_t23` L1 (spec R-2b). [USER] asked for this figure only, so a
per-figure table confines the pixel change to one figure.

### Measurement provenance

Off-repo, `~/.cache/namsbokasafn-audit/c140-v6/pr-b/step1/MEASUREMENTS.md` (rounds 1 and 2). Both
controls held: the harness reproduced T12's '6' output byte for byte, and re-preparing with the
committed config composed byte-identical to that control. All pictures are Chromium only.

## Consequences

- Version 6 gains one small compose-time mechanism and one config table. It is a composer pixel
  table, so it sits outside `renderHash`, reaches a figure that has a sidecar only at a
  `COMPOSER_VERSION` bump, and is fingerprinted by `COMPOSER_TABLES_PIN`.
- Any other figure that wants the source's box alignment needs its own [USER] ruling and its own
  entry. R2 and R-2a are unchanged as defaults.
- *Heilsufars-* is drawn at 8.5 pt beside a 9 pt *hætta*: the blue label rectangle is painted
  fill-plus-stroke, which `artworkEdits` cannot select, so it cannot be widened by this route.
- The Reactivity box's 1.3 pt page margin has been seen in Chromium only; the three-engine sweep
  before the merge covers it.
- Reversing it is removing the entry and the two `artworkEdits` ops; the next bump redraws the
  figure as R2/R-2a give.
- Work order and status: the active register (§C140, PR-B).

## Alternatives considered

1. **(a) The word fixes, centred as R2/R-2a give.** No new code. Rejected by [USER] for (b+),
   which matches the source.
2. **(b) Left-aligned, with only the list box widened.** The Reactivity list stays at 7.5 pt,
   smaller than the other three lists. Rejected for (b+).
3. **A wording that forces the break (*Sýrur Basar … Ekki vatn*).** Changes the meaning of two
   entries to steer a layout rule. Superseded by [USER]'s notes.
4. **A global switch (`SHARED_BOX_ALIGN = 'source'`).** Changes other figures nobody asked about,
   and does not reach single-label boxes.
5. **Plural *Sýrur / Basar* (R-5c3).** Only ever proposed to force the break; with the explicit
   break the stored translation can stay singular.
