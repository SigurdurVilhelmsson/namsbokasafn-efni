# Decision: translated figure labels are drawn with kerning OFF (`font-kerning: none`), so the browser draws the widths the composer planned — the composer does not learn kerning

- **Date:** 2026-09-17
- **Status:** Accepted
- **Context owners:** [USER] + figure-text pipeline
- **Supersedes:** none. It answers the open choice logged as §C140 ⑥b / ㉝, and it contradicts a premise that lived only in code comments: `experiments/figure-text-translation/compose.py`'s note on the linear measuring context ("which can only widen a gap").
- **Related:** campaign register [`docs/plans/2026-07-21-post-item17-followup-campaign.md`](../plans/2026-07-21-post-item17-followup-campaign.md) §C140 ⑥ and ㉝ · exploration, frozen: [`experiments/figure-text-translation/evidence/2026-09-17-c6-explore/kerning.md`](../../experiments/figure-text-translation/evidence/2026-09-17-c6-explore/kerning.md) and [`critic.md`](../../experiments/figure-text-translation/evidence/2026-09-17-c6-explore/critic.md) · the one-width-function design of §C140 ③ ([`docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md`](../superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md), Amendments — 2026-09-15) · the STIX half, [`docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md`](../superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md) (ruling T1 split kerning out)

> **FROZEN EVIDENCE — banner-dated 2026-09-17.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The figure composer decides each translated label's layout — where its lines break, whether it shrinks, where it is anchored — from ONE width function, `compose.py`'s `lin_advance`, which measures text in cairo's linear metrics **without kerning**. The reader's browser then draws the label's `<text>` elements with its default `font-kerning: normal`, applying the embedded Liberation subset's GPOS `kern` feature (kept by `svgout.py`'s `layout_features=['*']`). Planned width and drawn width therefore disagree wherever a label contains a kerned letter pair, and every label position computed from the planned width is off by that difference.

Two fixes remove the disagreement from opposite ends, and they are not interchangeable:

- **(a)** draw translated labels unkerned — make the drawing match the plan;
- **(b)** fold the font's kern pairs into `lin_advance` — make the plan match the drawing.

At stake: whether any of the 34 bought and [USER]-reviewed figures changes layout, how the fix behaves in browsers nobody has measured (school iPads run WebKit), and the typography of Icelandic labels.

## Decision

**(a).** Translated (layout-path) `<text>` items are written with `font-kerning: none`. `lin_advance` stays unkerned and remains the single width function. Kept English run-exact items are not part of this ruling and keep the browser's default kerning.

## Reasoning

### The plan and the drawing must use one width model — (a) keeps the one that already decides every layout
§C140 ③ made `lin_advance` the one width function because two width models had already flipped fit decisions (a right-flush `Mólmassi` 0.93 pt short of its edge). Kerning in the browser is a second width model that was never removed. (a) removes it from the drawing side; `figlayout.decide`'s partition, shrink and anchor inputs do not change.

### (a) moves no layout that [USER] has already reviewed; (b) can move any of them
Under (a) the recompose changes only the spacing *inside* a label that contains a kerned pair. Under (b) every translated label's measured width shrinks, so a label near a fit boundary can re-break, pick a different size or re-anchor (critic.md § 5, item 2) — which would re-open the visual review of all 34 bought figures, reviewed twice already.

### (a) fails safe in an unmeasured browser; (b) fails toward overlap
Only Chromium on Linux has ever been measured (kerning.md; critic.md open questions). If a renderer ignores `font-kerning: none`, (a) degrades to today's behaviour, which the 2026-09-15 browser census measured with lost/narrowed/collision/overhang counts of 0 (`evidence/2026-09-15-t23-review-fixes/reports/census-final.txt`). If a renderer does not kern, (b)'s kerned plan is drawn LONGER than planned — the direction that produces collisions. ⚠️ **Both halves of this argument are mechanism inference, not measurement.** Whether Chromium honours the property in the exact form the code will write (inline `style` vs a `<style>` rule vs a presentation attribute) is also unmeasured — only an inline `style` has been (critic.md R-d).

### What (a) gives up is small and measured
Measured 2026-09-17, 0 ISK, read-only: over the **162** translated block texts in the 34 sidecars (`books/efnafraedi-2e/figure-text/*.is.json`), each adjacent character pair was looked up in the `kern` table of the same `/usr/share/fonts/truetype/liberation/LiberationSans-{Regular,Bold}.ttf` files `svgout.py`'s `FACES` subsets (control: `Te`, `AV`, `To` all found). **23** labels contain a tightening pair — the largest `Ta` at −227/2048 em, as in *Taugafrumur* — and **0** contain a widening one. So under (a) those labels are set a hair looser than a typesetter would set them, by at most about one point. Italic was not checked, and a block's text is not its drawn line segmentation, so 23 is an upper bound.

### The premise "a gap can only widen" was wrong, which is why doing nothing was not the default
Liberation Regular has 68 positive kern pairs (critic.md § Contradicted; the Latin ones are `f’` and `r’`), so a label containing one draws longer than planned and can collide. The 34 carry none today, but every chapter bought later adds labels whose pairs nobody has counted. (a) closes the class, not just today's instances.

## Consequences

- **Commits the figure track to unkerned Icelandic labels.** Any future composer change that adds a width model (a new face, a new style bit through `FS.transfer`) must keep drawing and measuring in agreement under this rule — i.e. drawn unkerned.
- **Forecloses kerned Icelandic typography in composed figures.** Reversing to (b) later means folding kern pairs into `lin_advance` and removing the property, which can move the layout of every translated label in every bought figure — a cost that grows with each chapter bought, and re-opens their review.
- **Does not decide finding A** — the data-driven per-run kerning choice for KEPT English runs the source set unkerned. It reaches 0 kept runs on the 34 in translated mode (critic.md), and its corpus exposure is unmeasured; it stays separate.
- **The comment in `compose.py` that states "which can only widen a gap" is contradicted** and should be corrected by the build that implements this.
- **Follow-up work** — the ⑥b build (spec, a fresh browser measurement since the instrument behind "28 of 647, up to 0.99 pt" is not preserved, the form of the property Chromium honours, a 0-ISK recompose) — is tracked in the campaign register §C140 ㉝, not here.

## Alternatives considered

1. **(b) Fold kern pairs into `lin_advance`** — matches the source's typography, but can change line breaks, sizes and anchors on reviewed figures, fails toward overlap in a renderer that does not kern, and adds a second source of font data that must stay in step with the embedded subsets.
2. **Drop the `kern` feature from the embedded subset** (`svgout.py` `layout_features`) — equivalent to (a) for translated labels, but it also removes kerning from kept English runs — the 2026-09-13 prototype found 19 runs the source itself kerned, which the browser's default kerning matched (measured in control mode; kerning.md, candidate 4). Dropping the legacy `kern` table alone would do nothing: the subsetter already drops it and Chromium uses GPOS (critic.md § Imprecise).
3. **Position every glyph with its own `x`** — removes browser shaping entirely, but reverses the one-item-one-`<text>` design, inflates element counts and was never measured (kerning.md, candidate 3).
4. **Leave it** — the defect is sub-point and collision-free on the 34 today, but the widening pairs make it a latent collision class for every chapter bought later.
