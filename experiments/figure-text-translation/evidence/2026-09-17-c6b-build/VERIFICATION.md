# Verification — §C140 ⑥b, translated figure labels drawn with `font-kerning:none`, 0 ISK

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㉝ and its ⏩ RESUME). If this document disagrees with
> the design or `PREDICTIONS.md`, they win; if it disagrees with the campaign register, **the register wins**
> (CLAUDE.md § One source of truth) — this folder is evidence, never status.
> **Cost of everything here: 0 ISK** — see `README.md`'s banner.

Ruling: [`docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md`](../../../../docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md)
· design: [`docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md)
· predictions: [`PREDICTIONS.md`](PREDICTIONS.md) · commands: [`README.md` § Commands](README.md#commands).

Built on `feat/c140-c6b-unkerned-labels`: design, predictions and the BEFORE census (`2566092a`), the writer change and
its tests (`2b7688d7`), the spec review applied with the AFTER census, reader-route pixels and the added controls
(`01b9e04c`), the recompose (`9d8f2942`), this write-up.

## Before any code: R-d — the written form

`reports/rd/rd-analysis.txt`. Five planted SVGs built as `svgout.write_svg` builds a figure; lengths inline, right ink
edge through `<img>` at 8 px/pt.

| form | inline `Taugafrumur` (planned 51.52, kerned 50.52) | `<img>` Δ vs today (predicted if unkerned) | honoured |
|---|---|---|---|
| V0 nothing (today) | 50.53 | — | — |
| V1 inline `style="font-kerning:none"` | 51.53 | `AVAVAVAV` 4.75 (4.676) · `Ta` 1.00 (0.998) · bold `Ta` 0.625 (0.668) | ✅ |
| V2 `<style>` `.nk{font-kerning:none}` | 51.53 | identical to V1 | ✅ |
| V3 presentation attribute `font-kerning="none"` | 50.53 | 0 on every line | ❌ **silently ignored** |
| V4 `style="font-kerning:normal"` | 50.53 | 0 on every line | = today (control) |

The no-pair control `lllllll` measured 14.00 under all five. Liberation's GSUB carries `ccmp dlig subs sups` (+`locl`
in the italics) and no `liga`, so once kerning is off nothing else should separate the browser's width from cairo's.

## Predictions P0–P8

| # | predicted | measured | file |
|---|---|---|---|
| P0 | 162 translated labels; 23 with a tightening pair, 0 widening | ✅ `162 translated block values (identity values excluded: 7); tightening 23; widening 0` | `reports/before/p0-labels.txt` |
| P1 | unchanged composer's compose-only lists = committed media | ✅ `ok=True`, 34 figures | `reports/before/p1-media-compare.txt` |
| P2 | before: every FigIS item's gap = its kern sum (±0.05 pt, 3 scales); kerned layout items all short, none long; fonts loaded; computed `auto` | ✅ **layout**: 370 items, 27 kerned, `kern_explains` 370/370, `max_abs_resid_k` 0.0151, short 27 at each scale, long 0, largest shortfall 0.992 pt · **run-exact**: 277 items = 234 FigIS + 43 FigSym (not classified, by family); `kern_explains` 234/234; 1 kerned item short (chloroform `119,37`, pair `11`, −0.668) · 0 arc items on the 34 · 50 font faces, all `loaded` · computed `font-kerning` `auto` on 647/647 · **blocks** (added after the spec review): 176 layout blocks; N=27 kerned items in B=24 blocks; 21 of P0's 23 labels reach a drawn kerned item — argon's 2 do not, their only pair (`space`+`A`) is consumed by a line break (`Mól af` / `Ar atómum (mól)`) | `reports/before/census.txt`, `census.json`, `p2-blocks.txt` |
| P3 | after: lists equal in every field; only `style="font-kerning:none"`, last, on exactly the layout items; faces/metadata equal; recompose set = figures with ≥1 layout item | ✅ `ok=True`; attribute order checked from the raw tags; recompose set 31 = changed set 31 | `reports/after/p3-compare.txt` |
| P4 | after: every layout item equal to planned; run-exact/arc lengths identical; changed = exactly the kerned layout items | ✅ layout `equal` 370/370 at all 3 scales, `max_abs_resid_0` 0.0151; computed `none` on 370/370 layout, `auto` on 277/277 run-exact · compare over 647 items (43 FigSym included): changed = 27 layout items, all 27 with a kern pair, 0 without, 0 non-layout, in 10 figures; each changed by −kern within 0.0132 pt (largest +1.00 pt) | `reports/after/census.txt`, `census-compare.txt` |
| P5 | stripped after-SVGs reproduce before | ✅ 0 of 647 lengths changed · **added (spec review):** stripped SVGs byte-identical to before, 34/34 — so this control only re-tests the inline route · **added control that can fail:** the 370 properties rewritten as the presentation attribute change 0 of 647 lengths, computed `none` on 0 — R-d's V3 at corpus scale | `reports/control/` |
| P6 | `<img>`: render twice identical; before≠after exactly where a kerned layout item exists | ✅ A=A2 on 34/34; before≠after on 10 = the 10 predicted, identical on the other 24 (21 of them with layout items and no kerned one); `ok=True` | `reports/after/pixels.txt`, `pixels.json` |
| P7 | git status = the P3 set; MT 0; artwork identical, text group changed; no sidecar/mapping change | ✅ 31/31 `rc=0`, `MT spawned for 0 figure(s)`, `VERDICT ok`; `git status -- books/` = the 31 `_IS.svg`, all `M`; `parts-compare.json` `all_ok` (artwork same 31, text group changed 31, count/faces/opener same); published lists = compose-only lists on 31 and on all 34; sidecar + mapping diff 0 lines; ring gate as §C140 ⑩ (brain heals `mask-2`, exocytosis declines 8) | `reports/recompose/` |
| P8 | Python suites ALL PASS; vitest failing names = baseline by name | ✅ Python 23/23 `ALL PASS` (every `test_*.py` in the composer directory, 7 more than ⑥a's list) · vitest (full root run at `9d8f2942`, after the recompose): `now 36 before 36`, `only-now []`, `only-before []`, 0 files died without a failing test, planted-name control fires; 6545 tests, 6508 passed — identical by name to the pre-change baseline | `reports/after/python-tests.txt`, `npm-compare.txt` |

**The old number, reconstructed:** "28 of 647 segments draw up to 0.99 pt short" (2026-09-15, instrument lost) = the 27
kerned layout items + the 1 kerned kept item, over 370 + 277 drawn `<text>`, largest 0.992 pt. The breakdown the original
never had: 27 translated, 1 kept.

## Controls

- **Mutants of the writer** (`2b7688d7`'s message; golden-copy restore, `cmp` verified): the presentation-attribute form
  fails `test_svgout.py` K1/K2/K5; applying the property to every path fails K1/K3.
- **R-d's V3 and V4** and the `lllllll` line (above): the property's effect is shown to be the property's, and the
  attribute form is shown to be a no-op before anything was built on it.
- **P5's attribute-form census** — the same no-op at corpus scale, measured on the real 34.
- **P6's render-twice** — pixel identity is not an accident of the harness.
- **P4's changed set** — a fix that moved unrelated text, or nothing, could not produce "exactly the 27 kerned items".

## What the spec review changed

A three-lens adversarial review, each finding checked by a refuter (`reports/spec-review/review.json`): 7 findings
confirmed, 2 refuted. Confirmed and applied — P2's FigSym unit (three lenses found it independently), K5's full command
and chapter source, K4's cost/detector/approval-window (closes at the deploy, not the merge; recorded beside
`COMPOSER_VERSION`), `svgout.py`'s own byte-identical comment, P2's missing block unit, P5's tautology. The census
`compare` was also found to skip FigSym items; it now compares all 647, and the results did not change.

## Known limits

- **Only Chromium (Playwright, Linux) is measured.** Firefox and WebKit are not on the box. The decision's "fails safe"
  (a renderer that ignores the property draws today's figure) is mechanism inference; school iPads run WebKit.
- **No `COMPOSER_VERSION` bump** (spec K4): `isStale` cannot tell pre-⑥b media from post-⑥b media. P7's comparison over
  the complete bought population is the guard; the approval window closes at the prod deploy.
- **Kept runs keep the default kerning.** Finding A (runs the source set unkerned) is not built; the one kept item
  Chromium kerns on the 34 (`119,37`) is among the runs the 2026-09-13 prototype found the SOURCE kerned.
- **The census's planned width is recomputed** from each item's drawn fields with a separate cairo context configured
  like `compose.py`'s measuring context; it is not read out of `lin_advance`'s own memo.
- **`xml.etree.ElementTree`** parses only this pipeline's own generated SVGs here (same precedent as ④ and ⑥a).
- **The recomposed figures reach readers only after a ch03/ch04 re-render and [USER]'s sync** (register §C140 ㉟).
