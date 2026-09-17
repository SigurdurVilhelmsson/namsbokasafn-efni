# §C140 ⑥b — translated figure labels are drawn with kerning off, so the browser draws the widths the composer planned

**Date:** 2026-09-17 · **Item:** campaign register §C140 ㉝ (⑥b) · **Cost:** 0 ISK
**Approval:** [USER], 2026-09-17 — ruling (a), recorded frozen at
[`docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md`](../../decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md):
*translated (layout-path) `<text>` items are written with `font-kerning: none`; `lin_advance` stays unkerned and remains the
single width function; kept English run-exact items keep the browser's default kerning.* The register's ⏩ RESUME of the same
date sets the shape (spec → plan → build → final review → PR, a 0-ISK recompose of the affected bought figures, the
`COMPOSER_VERSION` question argued here), buying stopped, no merge without [USER].
**Evidence (frozen):** [`experiments/figure-text-translation/evidence/2026-09-17-c6-explore/`](../../../experiments/figure-text-translation/evidence/2026-09-17-c6-explore/README.md)
(`kerning.md`, `critic.md`). This build's own measurements: `evidence/2026-09-17-c6b-build/`.
**Branch:** `feat/c140-c6b-unkerned-labels`, from `docs/c140-rerender-todo-kerning-font-prereq` ([USER]: the docs ride ⑥b).
Every before/after comparison here is against `main` as merged after #476/#477 (④ and ⑥a).

## 0. Rulings

| # | ruling | why | cost if wrong |
|---|---|---|---|
| K1 | **Only items with `path == 'layout'` are written unkerned.** Run-exact items (kept English, identity, FigSym, `numloc`-localised) and arc items are unchanged, byte for byte. | The decision's own scope. An arc item draws ONE character per `<text>` (`compose.py` arc branch), so there is no pair for kerning to act on; leaving it untouched keeps `test_compose_runexact.py` C1's byte pin on the arc population meaningful. Finding A (a data-driven per-run choice for kept runs) reaches 0 kept runs on the 34 and stays unbuilt. | none known |
| K2 | **The written form is an inline `style="font-kerning:none"`, appended as the element's LAST attribute.** Never the presentation attribute `font-kerning="none"`. | **Measured before building (R-d, `reports/rd/`):** over planted SVGs built the way `svgout.write_svg` builds a figure, inline `style` and a `<style>` class rule both remove kerning — inline DOM *and* through `render-check.mjs`'s `<img>` route, `Ta` at 9 pt Regular widening 1.00 pt against a predicted 0.998 — while **the presentation attribute is silently ignored** (renders exactly like today) and `style="font-kerning:normal"` equals today. Inline over a class rule: the element carries its own rule, and nothing new enters the `<style>` block, whose rule order is already pinned (FigIS order; FigSym after FigIS). Appending last leaves every existing attribute's position unchanged. | a renderer that ignores inline `style` draws today's figure (the decision's fail-safe direction) |
| K3 | **Only the writer changes; the layout decision does not.** `lin_advance`, `seg_width`, `figlayout.decide` and `figscripts.split_at_word_edges`' cut are untouched. The comments that state the contradicted premise are corrected: `compose.py`'s note on the linear measuring context ("which can only widen a gap"), `split_at_word_edges`' docstring, and the two places that justify the `<g>` placement of `geometricPrecision` by "leaves every `<text>` element byte-identical" — `svgout.py`'s own comment above the item loop and `test_svgout.py`'s docstring — which stops being true for layout items. | The decision's Consequences ("should be corrected by the build that implements this"). Removing or moving the cut would re-segment translated labels (critic.md § 5 risk 3). | none known |
| K4 | **No `COMPOSER_VERSION` bump** — the third pixel-changing composer change in a row to share version `'3'` (④, ⑥a, ⑥b). The recompose (K5) writes every changed figure on the branch. | The constant's contract (`tools/lib/figure-text-sidecar.cjs`: *bump when a composer change alters pixels for unchanged text*) exists to send APPROVED figures back to mt-preview; ⑥b alters pixels on the figures whose layout items hold a kern pair (§ 4 P6). What it would protect is absent: **0 of the 34 committed sidecars carry a `state` key** (re-measured 2026-09-17 on this branch) and **[USER] confirmed on 2026-09-17 that prod's database holds no figure-review approval** (register ⏩ RESUME). **What a bump would add, stated correctly** (corrected 2026-09-17, spec review): not a deploy (one follows a merge, though as a separate step a person runs) but a one-field change in all 34 sidecars — `composedVersion` `'3'` → `'4'`; `renderHash` is written only by a paid mint or an editor's approval, and `publish-figure-svg.js` copies `composedHash` from it (corrected 2026-09-17, final review: this said all three fields) — a byte-only recompose of the figures with no layout item, and, durably, a **staleness signal**: `figure-run.js` `isStale` compares `composedVersion` with the constant, so after a bump any bought figure the recompose missed stays visible to every later `--stale` run. ⚠️ **Without the bump that detector is blind to ⑥b**, and the one-time P3/P7 comparison over the complete bought population (34; buying is stopped) is the only guard. The precedent is ④'s and ⑥a's ([USER] merged both with this exception stated). ⚠️ **The approval window closes at the prod DEPLOY, not at the merge** (corrected 2026-09-17, spec review): an editor approves against the prod checkout's own `books/<slug>/media` (`figureReviewService.translatedImageFor`), which takes the recomposed SVGs only when `deploy.sh` pulls, and an approval leaves `renderHash`/`composedHash`/`composedVersion` unchanged under `'3'` — so an approval made after the merge and before the deploy stands over pixels the editor never saw, and nothing detects it. So the PR names the recompose set and asks [USER] to confirm, **when running the deploy that carries this merge**, that prod holds no figure approval; it offers one bump covering ④ + ⑥a + ⑥b as a follow-up if [USER] wants the contract honoured literally; and the exception is recorded beside the constant in `tools/lib/figure-text-sidecar.cjs`, the file that owns the rule, so the next composer change does not inherit a version list that is silent about three pixel changes. | an approval made on prod between [USER]'s confirmation and the deploy carrying this merge survives over sub-point-changed pixels until re-opened by hand; a bought figure the recompose missed would stay kerned with no later `--stale` run to name it (P7 is the guard) |
| K5 | **Recompose, 0 ISK, exactly the bought figures whose composed `<text>` list changes** — predicted before the recompose as *the figures with at least one `path == 'layout'` item* (§ 4 P3) — one `node tools/figure-run.js --book efnafraedi-2e --chapter <N> --figure <b> --stale --force` at a time, each under the chapter whose CNXML references the image — never read from the `CNX_Chem_NN_` prefix (`CNX_Chem_14_03_FishLemon` is used by ch04's m68710, as ⑥a ran it) — and confirmed before any write by a `--dry-run` per chapter, which refuses a `--figure` its chapter does not reference, in the foreground, each after `test_figrings.py` prints `ALL PASS`, with the STIX 1.1.0 font provisioned. | A figure with a layout item changes bytes even where it has no kerned pair, and leaving it un-recomposed would leave committed media that the composer no longer produces. The figure driver's local-box prerequisites (register loop Step 3; memory `figure-driver-box-prereqs`). | none known |
| K6 | **"28 of 647, up to 0.99 pt short" is NOT reproduced; a fresh per-item census replaces it.** | Its instrument is not preserved (kerning.md). The replacement measures what the ruling is about — each drawn `<text>`'s browser length against the width the composer planned — per path, and explains the gap by the font's own kern pairs item by item, so the number cannot be quietly different in kind. | none — the old number is cited as history only |

## 1. What is wrong today

`compose.py` decides every translated straight label — its line breaks, size, anchor, and each segment's `x` — from ONE width
function, `lin_advance`, in cairo linear metrics **without kerning**. `svgout.write_svg` then writes those segments as `<text>`
elements inside `<g text-rendering="geometricPrecision">`, embedding a Liberation subset whose GPOS `kern` feature
`subset_face` keeps (`layout_features=['*']`). The browser applies it by default (`font-kerning: auto`), so wherever a segment
holds a kerned pair it draws a different width from the one the layout was decided with. Liberation Sans' Latin pairs mostly
tighten (`Ta` −227/2048 em), but `f’` (+37) and `r’` (+76) widen — so "a gap can only widen" is false, and a later chapter's
label can draw longer than planned and collide. Exposure on the 34 as the decision measured it: 23 labels with a tightening
pair, 0 with a widening one (an upper bound: a block's text is not its segmentation, and Italic was not checked).

## 2. The change

- **`svgout.py` `write_svg`:** for an item whose `path` is `'layout'`, append `style="font-kerning:none"` to its attributes
  (after `transform` when present). No other element, rule or ordering changes.
- **Comments only:** `compose.py` (the linear-context note), `figscripts.py` (`split_at_word_edges` docstring),
  `svgout.py` (the `geometricPrecision` comment above the item loop) and `test_svgout.py` (module docstring), each restated
  against the ruling, citing the decision record.

## 3. Tests (written first, run red on the unchanged writer)

- **`test_svgout.py`, new section:** synthetic items of each path (`layout`, `run-exact`, `arc`, and one with no `path`).
  A resolver answers the `font-kerning` each `<text>` resolves to — honouring an inline `style` and a `<style>` rule on the
  element or an ancestor, and **modelling R-d's measurement that a presentation attribute is ignored** — checked first against
  planted trees (positive: inline style, ancestor inline style, class rule; negative: bare `<text>`, presentation attribute).
  Asserted: every layout `<text>` resolves to `none`; every other resolves to `auto`; each layout element carries the property
  exactly once, as its last attribute; a writer that emitted the presentation attribute instead fails.
- **`test_compose_t23.py`:** in the composed fixture, every translated straight-label element resolves to `none` and every kept
  element (G1's population, byte-pinned already) carries no `font-kerning`.
- **`test_compose_runexact.py`:** no run-exact element carries `font-kerning`; C1 (arc byte-identity) unchanged and still green.
- Every Python suite and the root vitest (by name, against this branch's pre-change baseline) as before.

## 4. Verification — 0 ISK, predictions written first, `evidence/2026-09-17-c6b-build/`

Instruments: a compose-only run of the 34 (`compose34`-style, `SOURCE_DATE_EPOCH` pinned) that also dumps each figure's drawn
items (`path`, text, size, weight, slant) through an unmodified `compose.py`; a Chromium pass that inlines each SVG and reads
`getComputedTextLength` for every `<text>` at three scales; a join computing each item's planned width (the same hint-off
cairo context `lin_advance` uses) and its kern-pair sum (the `kern` table of the file `svgout.FACES` subsets for its weight and
slant).

| # | prediction |
|---|---|
| P1 | The unchanged composer's compose-only `<text>` lists equal the committed media's, figure by figure (text, x, y, size, weight, style, fill, family) — so "before" is what `books/` holds. Any difference is named. |
| P2 | **Before:** for every item drawn in **FigIS** (Liberation), `rendered − planned` equals the item's kern-pair sum within 0.05 pt at every scale (the font's own pairs explain the whole gap). Items drawn in **FigSym** (⑥a's STIX subset: 43 `<text>` in 9 figures) have no Liberation planned width and are excluded from this prediction by family, with their count reported; their lengths are compared in P4 (corrected 2026-09-17, spec review). Layout items with a non-zero sum are all SHORT (0 long, as no widening pair occurs on the 34). Counts reported per path, in items and in layout blocks — a block being a run of layout items opening at line 0, seg 0, since ITEMS carry no block field — and reconciled with P0's label unit: every label with a tightening pair either reaches a drawn kerned item or is named with the reason it does not (corrected 2026-09-17, spec review: this clause had no source field and was dropped by the first build of the census). |
| P3 | **After (compose-only):** every figure's `<text>` list equals the before list in every field; the ONLY difference is `style="font-kerning:none"` on exactly the layout items (count = the dumped layout items). `@font-face` rules, `<metadata>` and artwork are identical. Figures with 0 layout items: text group identical. The recompose set is exactly the figures with ≥ 1 layout item. |
| P4 | **After (census):** every layout item's rendered length equals its planned width within 0.05 pt (0 short, 0 long) at every scale; every run-exact and arc item's rendered length — FigSym items included — equals its before length exactly. |
| P5 | **Control:** the after-SVGs with the property stripped reproduce the before census exactly. ⚠️ **Once P3 holds this cannot fail because of the property** (the stripped SVGs are byte-identical to before; only the inline census route's repeatability is tested) — so two controls are added (2026-09-17, spec review): the byte identity is recorded directly (`cmp`, 34 of 34), and a control that CAN fail: the property rewritten into the presentation-attribute form reproduces the BEFORE lengths across the corpus — R-d's V3 at corpus scale. The positive control is P4's own clause: the items whose length changed are exactly the kerned layout items. |
| P6 | **Reader route (`<img>`, `render-check.mjs`):** before and after render pixel-identically for a figure with no layout item carrying a kern pair, and differently for a figure with one. A figure rendered twice is pixel-identical (determinism control). |
| P7 | **Recompose:** `git status -- books/` lists exactly the P3 recompose set, every `figure-run.js` run printing `MT spawned for 0 figure(s)`; artwork parts byte-identical; text groups differ only by the property; no sidecar or mapping change. |
| P8 | Every Python suite prints `ALL PASS`; the root vitest failing names equal this branch's pre-change baseline by name. |

## 5. Out of scope — logged, not built

- **Finding A** — the per-run kerning choice for kept runs the source set unkerned (0 kept runs on the 34).
- **Firefox and WebKit** — not on the box. The decision's "fails safe" (an ignoring renderer draws today's figure) is
  mechanism inference; school iPads run WebKit.
- **Kept runs' own kerning** is the browser default, as the ruling states.

## 6. Known limits

- Only Chromium (Playwright, Linux) is measured.
- The census's planned width is recomputed from each item's drawn fields, for FigIS items only (FigSym items are compared before/after, never against a Liberation plan); it equals `lin_advance`'s memoised key
  `(text, bold, italic, size × ratio)` by construction, which § 4 P2/P4 rely on and do not independently re-derive from
  `figlayout`.
