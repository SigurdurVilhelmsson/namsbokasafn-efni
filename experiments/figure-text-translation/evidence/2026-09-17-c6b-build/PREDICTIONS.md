# Predictions — §C140 ⑥b, translated figure labels drawn with `font-kerning:none`, 0 ISK

> 🧊 **FROZEN, 2026-09-17.** Written before the census, compare and recompose runs they predict. The design
> ([`docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md))
> § 4 owns P1–P8; this file adds the numbers that could be written down in advance and the instruments that will
> test each. Evidence, never status: if it disagrees with the campaign register, the register wins.

**Already measured when this was written (not predictions):**
- **R-d, the property's written form** — `reports/rd/rd-analysis.txt`. Inline `style` and a `<style>` class rule are
  honoured inline and through `<img>`; the presentation attribute and `font-kerning:normal` draw exactly today's
  picture; a no-pair control never moves. `Ta` at 9 pt Regular widened 1.00 pt in `<img>` (predicted 0.998), `AVAVAVAV`
  4.75 (predicted 4.676, pixel quantum 0.125 pt), Bold `Ta` 0.625 (predicted 0.668).
- **Vitest baseline on this branch before any code change** — `reports/before/npm-failing-by-name.txt`: 36 failing
  names, 0 files died without a failing test; byte-identical to ⑥a's post-fix list.
- **Sidecar review state** — 0 of 34 `books/efnafraedi-2e/figure-text/*.is.json` carry a `state` key.

| # | prediction | instrument |
|---|---|---|
| P0 | The decision's own unit reproduces: over the translated block values of the 34 sidecars, **23** hold a tightening pair in Liberation Regular or Bold and **0** a widening one. | `kern_census.py labels` |
| P1 | The unchanged composer's compose-only `<text>` lists equal the committed media's figure by figure in text, x, y, size, weight, style, fill and family — "before" is what `books/` holds. | `compare_lists.py p1` over `before/work/*/translated.svg` vs `books/efnafraedi-2e/media/*_IS.svg` (corrected 2026-09-17, final review: this named a `textlist.py` the folder does not have) |
| P2 | **Before.** Every FigIS item's browser length minus its planned width equals its kern-pair sum within 0.05 pt at scales 1, 2.0833333 and 3 (`kern_explains` = FigIS items). Layout items with a non-zero sum are all `short` and none `long`, at every scale. No font face has a status other than `loaded`. Every `<text>` computes `font-kerning: auto`. | `compose34.py` → `kern_census.py jobs` → `kern_census.mjs` → `kern_census.py join` |
| P3 | **After (compose-only).** Every figure's `<text>` list equals before in every field of P1; the only difference is `style="font-kerning:none"` on exactly the items with `path == 'layout'`, as the last attribute. `@font-face` rules and `<metadata>` identical. The recompose set = figures with ≥ 1 layout item. | `compare_lists.py p3` (corrected 2026-09-17, final review: `textlist.py` is not in this folder) |
| P4 | **After (census).** Every layout item: `equal` at every scale (`max_abs_resid_0` ≤ 0.05 pt), computed `font-kerning: none`. Every run-exact and arc item: rendered length identical to before at every scale, computed `auto`. Layout items whose length changed = exactly the layout items with a non-zero kern sum. | `kern_census.py join` + `compare` |
| P5 | **Control.** The after-SVGs with the property stripped (the strip asserts one property per layout item) reproduce the BEFORE lengths exactly. | `kern_census.py strip` → census → `compare` against before |
| P6 | **Reader route.** Through `render-check.mjs` (`<img>`): a figure rendered twice is pixel-identical; before vs after is pixel-identical exactly for the figures with no kerned layout item, and differs for every figure with one. | `img_pixels.py` |
| P7 | **Recompose.** `git status -- books/` lists exactly the P3 set, all `M`; every `figure-run.js` run prints `MT spawned for 0 figure(s)` and `VERDICT ok`; `figparts.py`: artwork part identical, text group changed, `text_count` unchanged; no sidecar or `image-mapping.json` change. | `figure-run.js --stale --force --figure <b>`, `figparts.py` |
| P8 | Every figure-text Python suite prints `ALL PASS`; root vitest failing names equal `reports/before/npm-failing-by-name.txt` by name. | the suites; `npm_compare.cjs` |
