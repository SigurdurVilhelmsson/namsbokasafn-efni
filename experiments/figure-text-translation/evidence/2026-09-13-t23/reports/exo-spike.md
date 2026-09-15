# §C140 spike — why the recomposed `CNX_Chem_03_01_exocytosis-88f6` SVG never loads in Chromium `<img>`

0 ISK. Nothing that calls the MT was run. Scratch: `/home/siggi/dev/scratch-c140/exo/`. 2026-09-13.
Chromium = Playwright 1.62.1 `chromium-headless-shell` r1234 (151.0.7922.34), inside an `<img>` host page (the reader's path).
Tools: pdftocairo 26.01.0, libcairo 1.18.4. No file written in the efni repo; `PYTHONDONTWRITEBYTECODE=1` on every python call.

## Headline

**The hang is cairo's blend-mode emulation, not the masks, the gradients or the file size.**
`pdftocairo -svg` writes every PDF paint that uses a non-Normal blend mode as
`add( blend(S, D) masked by Ma , D masked by (1 − Ma) )`. Here D is everything painted on the surface so far,
and it is referenced **twice**. The next blend paint's D contains that result, so each paint doubles the
reference tree. Exocytosis has **158** such paints (PDF: 110 `/Multiply` + 48 `/Screen` `gs` invocations, which
match the SVG's 110 + 48 `feBlend` 1:1). Its feImage chain is 224 deep. Rendering it without sharing would
take 2^116 paint invocations, and Chromium's `<img>` never reports `complete`.

**Smallest fix, measured:** where `Ma` is an opaque rect covering the whole filter region (no clip),
the `(1 − Ma)·D` term is exactly 0. The use site can then point at the blend filter instead of the add filter.
That is **a one-digit edit per paint** (`filter-315` → `filter-314`).
- Exocytosis: 155 of 158 paints collapse; the 3 clipped ones are left alone.
- **The `<img>` completes in 2.1 s and paints in 1.1 s**, where before it never completed in 60 s.
- Pixel-identical to the uncollapsed file on every Chromium render where the uncollapsed file can render at all.
- **It sits in the same post-`pdftocairo -svg` step as ⑩'s heal and commutes with it byte-for-byte.**

**Over all 34 prepared figures:**
- **31 are byte-identical** after the pass.
- The 3 that change (exocytosis, sandwich, HClsoln) render **pixel-identical before/after** where "before" can be rendered.

**Side finding for ⑩:** on exocytosis the 8 ring rasters are **not visible** before the heal. The same
instrument sees brain's ring: 521 px brighter than cairo by more than 20 L before the heal, 14 after. On exocytosis, healing
**mask-491 alone moves 61 px by more than 8 luminance units, away from cairo's picture**, on one axon edge.

---

## 1. Confirmation, with controls (`tools/run1.sh` → `tools/render-exo.mjs`)

`render-exo.mjs` is `render-check2.mjs` with the same `<img>` host page. The difference is separate bounded budgets:
- `loadMs` = time until `img.complete`
- `paintMs` = the screenshot

RSS is summed over **my** render process tree (node plus Chromium, shared pages counted more than once).
Memory was checked before each load and survivors were killed after. **0 survivors in every run.**

⚠️ Playwright's binary appears in `ps` as `chrome-headless`, which `pgrep -x headless_shell` / `pgrep -x chrome` never match.
The wrapper therefore tracks the descendants of its own node process. The first two runs predate this fix: their RSS reads 0 because the
sampler found nothing, not because nothing was used.

| file (unit: one load, DSF 1) | bytes | `img.complete` | loadMs | paintMs | peak RSS MiB |
|---|---|---|---|---|---|
| **committed `…exocytosis-88f6_IS.svg`** | 24,921,365 | **no** | **> 60,000** (timeout; node killed at 100 s) | — | 1,058 |
| control: brain-ec0b `_IS.svg` | 4,974,913 | yes | 182 / 221 / 612 (3 runs) | 618–629 | 495 / 647 |
| control: map2 `_IS.svg` | 15,788 | yes | 156 | 558 | (sampler bug) |
| control: June raster copy (`05-publication/mt-preview`, `d2095274`) | 254,774 | yes | 95 | 630 | 613 |
| control: prepared `artwork.png` | 264,230 | yes | 59 | 589 | 616 |

*Inherited (c10):* the prepared `artwork.svg`, which is byte-identical to the committed file minus 7 `<text>`, timed out at 30 s (screenshot) and at 300 s (`goto`).

## 2. What the SVG is made of (prepared `artwork.svg`, 24,913,394 bytes)

**Element counts:** `stop` 237,882 · `g` 3,895 · `path` 3,486 (938,175 bytes of path data) · `clipPath` 2,323 · `rect` 1,126 ·
`radialGradient` 947 · `use` 717 · **`feImage` 632** · `mask` 628 · `filter` 319 · **`feBlend` 158 (110 multiply, 48 screen)** ·
**`feComposite` arithmetic 158** · `image` 37 (largest a 509×950 PNG) · container nesting depth 5.

**The 628 masks, by role** (population: all 628; each assigned to exactly one class):

| role | n | content |
|---|---|---|
| `Ma`: clip coverage of a blend paint (R term) | 158 | `<use href=#compositing-group-N/>`, where N is a transparent rect plus an opaque white rect over the filter region |
| `Mb`: inverted `Ma` (L term) | 158 | same `use` through `filter-remove-color-and-invert-alpha` |
| `Mc`: source mask, opaque white rect | 64 | |
| `Mc` wrapping a nested constant-alpha mask | 94 | |
| constant alpha (cairo's encoding of `ca`/`CA`) | 130 | `<g filter=remove-color><rect fill-opacity="0.740005"/>` |
| soft mask via `use` (⑩'s class among them) | 24 | |

So the "604 image-less masks" (inherited from c10) are 474 blend scaffolding masks plus 130 constant-alpha masks. **None of them is the cause.** Every fix below leaves all 628 in the file.

**The chain:**
- The body opens with `<g filter="url(#filter-315)">`. That one element *is* the result of the last blend paint.
- Its add-filter `feImage`s reference R (`<g filter=feBlend(S, D) mask=Ma>`) and L (`<g mask=Mb><use href=#D/>`).
- D's first child is the previous paint's `<g filter=add>`.
- There are two sub-chains: `filter-0…91` (46 paints) and `filter-92…315` (112 paints), and the first nests inside the second.
- `tools/refgraph.py` models the reference graph with memoisation per id. Unit: paint invocations with no sharing; this is a model, not a measurement.
  - Before: **2^116.4**, feImage nesting depth **224**.
  - After the fix: **5,291 (2^12.4)**.
  - Controls: brain 18, map2 18.

## 3. Bisect

**(a) Chain length.** The body head was retargeted from `filter-315` to the add filter of paint k; the rest of the file is byte-identical. Unit: one load, 60 s budget.

| k (paints on the path) | 12 | 20 | 28 | 46 | 80 | 110 | 140 | 158 (original) |
|---|---|---|---|---|---|---|---|---|
| loadMs | 2,918 | 2,895 | 2,132 | 4,588 | 3,491 | **no load** | **no load** | **no load** |
| paintMs | 1,039 | 3,426 | 3,499 | 2,421 | 6,026 | — | — | — |

The growth is not a clean 2^k, so Chromium shares part of the tree. There is a cliff between 80 and 110.
*(A first bisect that also cut the body after the head was confounded and is not used.)*

**(b) Interventions on the full file.** Unit: one load at DSF 1, 1200×669.44 px. Fidelity is measured against `artwork.png`, cairo's text-free render at the same scale:
- `meanAbsL` = mean |ΔL|
- `gt20` = pixels with |ΔL| > 20

Population: 804,000 px.

| variant | what changes | load / paint ms | fidelity vs cairo | verdict |
|---|---|---|---|---|
| original | — | **never** | — | hang |
| **V1** | 155 use sites `filter=add` → `filter=blend mask=Ma` (the `Ma`-trivial paints) | 2,907 / 1,409 | 0.618 · 6,652 px (0.827 %) | loads |
| **V1b = the fix** | same use sites, `filter=add` → `filter=blend`, `Ma` dropped: **1 byte per paint** | 3,531 / 930 and 2,065 / 1,101 | **identical to V1 (804,000/804,000 px)** | loads; preferred because it is 1 byte per paint and exact by construction (the timing edge over V1 is single noisy runs) |
| **control: arithmetic kept, second D reference removed** | the add filters stay on the path; only L's `<use href=#D/>` is emptied | 2,531 / 5,665 | identical to V1 (804,000/804,000) | loads, so **the double reference is the cause, not `feComposite`** |
| V2 (CSS rewrite) | blend op → `isolation:isolate` + `mix-blend-mode`, no feImage | **41,809** / 1,752, **peak RSS 3,400 MiB** | 97.5 % px identical to V1, max channel Δ 21 | rejected |
| positive control: blend → `normal` | V1 with every `feBlend mode` set to `normal` | 2,106 / 2,043 | 1.716 · **22,994 px (2.86 %)** | the metric sees blend loss |
| positive control: truncated content | k = 80 original | — | 8.836 · 117,894 px (14.7 %) | the metric sees missing content |

**Exactness, measured in Chromium before/after** (where "before" renders):

| comparison | identical px | control: non-white px |
|---|---|---|
| k = 46, original vs V1 (the whole first sub-chain) | 804,000 / 804,000 | 166,406 |
| k = 46, original vs V1b | 804,000 / 804,000 | 166,406 |
| k = 80, original vs V1 (includes the 3 left-alone clipped paints) | 804,000 / 804,000 | 58,026 |
| k = 80, original vs V1b (includes the 3 left-alone clipped paints) | 804,000 / 804,000 | 58,026 |
| full file, V1 vs V1b at DSF 1 | 804,000 / 804,000 | — |
| full file, V1 vs V1b at DSF 2 | 3,216,000 / 3,216,000 | — |

Paints 81–158 cannot be compared against "before" in Chromium, because before never loads. For those, the evidence is
construction (`Ma` is an opaque rect over exactly the filter region, so the L term is 0 and R is unmasked) plus the
fidelity-to-cairo figure.

**Calibration of the fidelity metric** (Chromium `artwork.svg` vs cairo `artwork.png`, blend-free figures):

| figure | gt20 |
|---|---|
| brain | 0.416 % |
| flowchart | 1.708 % |
| rxn3 | 2.047 % |
| combustion | 3.421 % |
| aspirin | 9.55 %; a hairline table where the diff map shows sub-pixel misregistration of 1-px rules, not a picture difference |
| **exocytosis with the fix** | **0.827 %** (tight end of the renderer-noise band) |

**Against `source.png`, text ink masked** as in c10's `locate.py`:
- the fixed `artwork.svg`: 0.84 % (N = 791,764)
- **the fixed reader file (committed `_IS.svg` + pass): 0.843 % (N = 788,872)**

It loads in 2.8 s / 2.1 s, paints in 2.7 s / 1.1 s (V1 / V1b), and renders all 7 Icelandic labels (looked at: `bis/exo_IS_v1.png`).
- **DSF 2 (HiDPI):** V1b loads in 2,006 ms and paints in 3,222 ms. V1, with the mask, painted in 10,164 ms (run concurrently with the census).
- Raster control: `artwork.png` at DSF 2 paints in 1,171 ms.

## 4. Trace to the source PDF (`pdf/trace.py`, pikepdf)

**Source:** Illustrator CS6 PDF (Adobe PDF library 10.01), 432×241 pt.

**ExtGState dictionaries** (unique objects):

| dictionaries | count |
|---|---|
| `/BM /Multiply` | 4 (3 of them with `ca`/`CA` < 1) |
| `/BM /Screen` | 2 (1 with `ca` < 1) |
| `/SMask` | 22 |
| Normal with `ca` < 1 | 5 |

**Invocations** (page plus forms, counted per `gs`):
- **110 `/Multiply` + 48 `/Screen` = 158**, exactly the SVG's `feBlend` modes and count.
- 24 `/SMask` `gs`.
- **208 transparency-group Form invocations, all `/I false /K false`.** There are no knockout groups and no isolated groups.

The same counts hold on `artwork.pdf`, so the text strip does not create the construct.

**Mechanism** (inferred from cairo's output shape; cairo's source was not read):
- cairo 1.18's SVG surface paints each non-`OVER` operator through "compositing groups". It emits a lerp by the clip coverage even when there is no clip, and it snapshots the destination as a group.
- The next paint's destination embeds that snapshot. That makes a chain 158 deep with a double reference at every link.
- The 130 constant-alpha masks come from the `ca`/`CA` < 1 dictionaries.
- **The 3 paints that keep a real clip** are `filter-101`, `-131` and `-139`: their `Ma` contains a `clipPath` and a `g`. They are left alone, and their doubling (×8) stays.

## 5. Fix candidate

**Where:** `strip-text.py --svg`, straight after `subprocess.run(['pdftocairo', '-svg', …])`, on the same `text` that
⑩'s `heal_soft_mask_rings()` edits. **The same step as ⑩.**

**Scratch implementation:** `exo/fix/collapse_blend_lerp.py`, `collapse_blend_lerp(text) -> (text, report)`, about 60 lines of regex on cairo's exact output shape.
It matches:
1. add filter
2. R
3. L
4. blend filter, whose destination must equal L's D
5. `Ma` / `Mb`, which must reference the same extents group
6. extents group: a transparent rect plus an opaque white rect, offset cancelling the translate, size = the filter region

It then rewrites `<g filter="url(#F_add)"` → `<g filter="url(#F_blend)"`. The blend id is resolved, never assumed to be F_add − 1.

**Report fields:**
- `addOps`
- `collapsed`
- `useSitesRewritten`
- `clipped` (left alone: `Ma` is a real clip)
- `unmatched` (left alone: a different shape)
- `modes`

The regex version is **byte-identical to the parser-planned V1b on all 36 files tried** (the 34 prepared figures + 2 corpus figures).

**Over all 34 prepared `artwork.svg`:**

| outcome | figures |
|---|---|
| byte-identical | **31** (27 have no add filter; rxn3 has 6, all `clipped`, so it is untouched) |
| exocytosis | 155 of 158 collapsed, **155 bytes differ** |
| sandwich | 52 of 52 collapsed, 52 bytes differ |
| HClsoln | 2 of 2 collapsed, 2 bytes differ |

**Before/after in Chromium, for the 3 that change:**

| figure | identical px | non-white px (control) | load / paint before | load / paint after |
|---|---|---|---|---|
| sandwich | 934,700 / 934,700 | 390,974 | 17,169 / 3,339 ms | 13,940 / 754 ms |
| HClsoln | 540,150 / 540,150 | 147,678 | 267 / 577 ms | 220 / 610 ms |
| exocytosis | see §3 | | never | 2,065 / 1,101 ms |

**Commutes with ⑩:**
- `heal(V1(x)) == V1(heal(x))` byte-for-byte on exocytosis, with an identical heal report (`healed 8, sides 32, noClip [mask-0,-22,-53,-187]`).
- The heal edits only PNG payloads and this pass edits only `filter="url(#…)"` digits.
- My heal run reproduced c10's `heal/artwork.svg` byte-for-byte.

**Fallback not needed:** a lossless fix exists. For reference, the raster `artwork.png` is 264 KB against 24.9 MB of vector, and loads in 59 ms.

**Caveats:**
- Like the heal, the pass depends on cairo's exact output shape. If that shape changes, the pass collapses 0 and the hang returns.
- **A shape-independent sentinel is cheap:** `refgraph.py`'s no-sharing cost (an ElementTree parse of 25 MB takes 0.9 s and 136 MB RSS). A prepare-time warning above about 2^20 would fire whatever cairo writes.
- The `clipped` paints still double. 6 on rxn3 is harmless (load 112 ms), but a future figure with many clipped blend paints would not be rescued.

## 6. Exposure

**Among the 34** (population: prepared `artwork.svg`, measured directly on the SVG, all source formats):

| figure | blend paints | Chromium before the fix | after the fix |
|---|---|---|---|
| **CNX_Chem_03_01_exocytosis-88f6** | 158 | **never loads** | 2.1 s / 1.1 s |
| **CNX_Chem_04_04_sandwich** | 52 (screen) | **17.2 s load + 3.3 s paint** | 13.9 s + 0.75 s |
| CNX_Chem_04_01_rxn3 | 6 (all clipped) | 0.11 s | unchanged |
| CNX_Chem_04_02_HClsoln | 2 | 0.27 s | 0.22 s |

⚠️ **Sandwich's remaining ~13 s load is a second, unidentified construct.** It is not image payload: replacing all 5,800
PNG payloads with a 1×1 PNG (15.8 MB → 4.5 MB file) still loads in 13.2 s. It has 5,800 `<image>`, 3,166 `<mask>`
(2,958 through `filter-color-to-alpha`), 6,182 `<use>` and 58 `<pattern>`. **Not bisected.**

**Corpus, cheap census** (`corpus/bm_census.py`):
- Population: the 612 unique **PDF** source files in `c2/census/figs.jsonl`, 1 timeout (`CNX_Chem_21_04_ChnReact1`).
- Unit: `gs` invocations with a non-Normal `/BM`.
- **Calibration:** the count equals the SVG `feBlend` count on all 4 carriers among the 34 (158 / 52 / 6 / 2).
- 75 files have at least one blend paint: 52 have 1–9, 17 have 10–49, 2 have 50–99, 4 have 100 or more.

| blend paints | figure | probe (`pdftocairo -svg` of the **un-stripped** source into scratch; no prepare) |
|---|---|---|
| 158 | CNX_Chem_03_01_exocytosis-88f6 | (above) |
| 146 | **CNX_Chem_05_02_IcePack** | 1.77 MB file: **load 6.6 s + paint 7.5 s → 0.9 s + 0.6 s**, 777,075/777,075 px identical; 129 collapsed, 2 `unmatched` (arithmetic add with no `feBlend`, a different operator, left alone) |
| 146 | CNX_Chem_11_01_Icepack | not rendered (same count; probably the same art) |
| 146 | CNX_Chem_05_01_OxyacTorch | not rendered |
| 74 | **CNX_Chem_08_02_HybrdOrbit** | **load 8.6 s + 0.7 s → 1.3 s + 0.6 s**, 1,582,100/1,582,100 px identical; 74/74 collapsed |
| 52 | CNX_Chem_04_04_sandwich | (above) |
| 47–38 | 07_06_Egeom 47, 11_04_RaoultLaw 44, 08_02_ethane 41, 02_02_Millikan 38 | not rendered |

The count alone does not predict a hang. IcePack's chain is 259 deep, with a no-sharing cost of 2^133, and it loads in 14 s; exocytosis hangs.
So **the list is of exposure, not of predicted hangs**. On both probes the pass cut load time by roughly 5–9×.
**EPS sources (298 figure rows) were not censused.**

## 7. ⑩'s heal on exocytosis, now that it loads

**Setup:**
- V1 artwork vs V1 + ⑩ heal, both Chromium `<img>` at DSF 1.
- Reference: `artwork.png` (cairo), which c10 showed has no ring.
- Population: 804,000 px (1200×669 compared).

**Whole-figure change:** heal changes **232 px (61 by more than 8 L, 28 by more than 20 L, max 39.5)**, in 9 clusters.

**Before the heal (rings visible?):** no. In **every** cluster, unhealed pixels brighter than cairo by more than 20 L: 0, except 1 px in one cluster. Mean |unhealed − cairo| is 0.7–5.8.

**After the heal:**
- 7 clusters: essentially unchanged. Mean |Δ vs cairo| improves by 0.3–0.7 L in 5, worsens by 0.1 L in 1, and worsens 0.7 → 1.7 over 6 px in 1.
- **y 154–167, x 85–136 (the neuron's axon, top and bottom rows of one raster): 91 px change, 56 by more than 8; mean |healed − cairo| 4.7 → 15.5, max 31 → 45.**
- The neighbouring cluster y 151–164, x 82–90: mean 2.7 → 8.9 (11 px).
- At ×8 the healed axon loses part of its upper-edge shading band (`heal/worst_cluster_cairo_unhealed_healed_x8.png`).

**Positive control, same instrument (`ringvis` logic), on brain** (c10's existing renders, 975×484, no new Chromium load):
- The heal changes 1,320 px (898 by more than 8).
- **Pixels brighter than cairo by more than 20 L: 383 + 138 = 521 before, 0 + 14 after.**
- Mean |Δ vs cairo| 21.8 → 7.4 and 16.9 → 7.2.

So the instrument does see a visible ring, and the exocytosis null ("not visible before") is a real null.

**Which raster, one at a time.** Unit: one Chromium render of V1b with only that mask healed, against V1b unhealed. The 8 per-mask changes sum to 232 px, which equals the all-masks run.

| mask | px changed | px > 8 | where | vs cairo |
|---|---|---|---|---|
| mask-8 | 0 | 0 | | |
| mask-12 | 0 | 0 | | |
| mask-39 | 48 | 0 | | |
| mask-43 | 61 | 0 | | |
| mask-189 | 0 | 0 | | |
| mask-271 | 6 | 0 | | |
| mask-409 | 15 | 0 | | |
| **mask-491** (`source-843`, 22×6) | **102** | **61** | bbox y 154–167, x 85–139 | mean \|unhealed − cairo\| 4.5 → \|healed − cairo\| **14.8** |

c10's `ring_vs_clip.txt` scores mask-491's ring excess as 49.8 / 222.0 / 182.0 / 133.2 (left / right / top / bottom), so c10's ≥ 50 detector flags 3 of its sides.
On screen, the ring there is not visible, and overwriting it degrades the picture.
**c10's byte-level ring detector is a false positive for "visible outline" on mask-491.** The heal needs a
render-level gate, not a byte-level one.

**So on exocytosis the heal removes real mask content where the clip edge carries shading** (at ×8 the healed axon loses part of its upper-edge shading band).
V1 ≡ V1b pixel-identical, so this holds for the fix as recommended.

## Fold-in recommendation

Two recommendations. Act on each on its own.

**(i) Fold the lerp collapse into the same PR, as its own commit that does not depend on the heal, in the same post-`pdftocairo -svg` block as ⑩. Land it first: it is what makes exocytosis measurable at all.**

**(ii) Separately, a finding against ⑩'s heal, not a condition on (i):** on exocytosis the heal degrades mask-491 and fixes nothing visible. ⑩ needs a per-raster, render-level gate before it ships to exocytosis. Brain, where the ring is measurably visible (521 px → 14 px brighter than cairo by more than 20), stays in scope.

**Reasons for:**
1. It is the same file, the same step and the same kind of edit: a text pass over cairo's SVG.
2. It commutes with the heal byte-for-byte.
3. 31 of 34 figures are byte-identical, and the 3 that change are pixel-identical in Chromium.
4. **It is reader-facing and would ship otherwise.** The recomposed exocytosis replaces the working June raster at the next render + sync. Sandwich, at 17 s, is a near-miss on desktop and worse on phones.
5. Both passes need the same rollout: re-prepare the carriers.
   - *Inherited from c10, read from the code, not run:* `isStale` does not key on the artwork, so `figure-run --figure <b> --force` (0 ISK) is the route.
6. ⑩ on exocytosis could not be judged at all without it (§7).

**With (i):**
- Ship the shape-independent no-sharing-cost sentinel, so a cairo output change fails loud.

**Log separately:**
- sandwich's residual 13 s load
- the untested non-Chromium browsers

## Defects found

1. Exocytosis never loads in Chromium `<img>`, the reader's path. Cause: cairo's blend lerp references D twice per paint, 158 paints deep.
2. Sandwich takes 17 s to load, 14 s after the fix. The residual construct is unidentified and is not image bytes.
3. CNX_Chem_05_02_IcePack (14 s) and CNX_Chem_08_02_HybrdOrbit (9.6 s) have the same construct in the corpus (not bought).
4. ⑩'s heal, applied to exocytosis, degrades mask-491 (61 px by more than 8 L; mean |Δ vs cairo| 4.5 → 14.8), while no ring was visible before. c10's byte-level ring detector flags mask-491, so it is a false positive for "visible outline".
5. `pgrep -x headless_shell` / `pgrep -x chrome` do not see Playwright's `chrome-headless` processes, so the prescribed survivor check is blind.

## Misses (named)

- **Firefox / WebKit not tested.** cairo's emulation needs `feImage` referencing an in-document element; Firefox is believed not to support that (inferred, unmeasured). If so, all 4 carriers render wrong there even after this fix.
- The mechanism inside Blink (why `img.complete` never fires) is not identified. The evidence is causal intervention only.
- No mobile or low-end device timings; DSF 2 was measured on desktop only. Timings are mostly single runs on a shared box; a background census and the other workflow were running.
- Paints 81–158 of exocytosis have no Chromium "before" to compare against (it never loads).
- Compose was not re-run on the fixed artwork. The pass was applied to the committed composed file instead: 155 bytes change and it loads.
- The 7 minor heal clusters were mapped only through the per-mask renders. The worst one is mask-491. Exocytosis `mask-0` (left ring excess 39.6, inherited) was not examined.
- EPS corpus sources were not censused. `CNX_Chem_21_04_ChnReact1` timed out at 60 s in the PDF census.
- Sandwich's residual load cost was not bisected.

## Housekeeping

- Every Write and Edit, and every redirected output, went to `/home/siggi/dev/scratch-c140/exo/` or this report.
- Nothing in the efni repo was read with a writing tool.
- Git history was not touched.
- **`git status --porcelain` shows 1 untracked file that is not mine:** `docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md`, mtime 19:44:22Z.
  - It was created during this spike. This spike never wrote under `docs/`.
  - It is presumably from the other workflow running on this box. Not verified.
- `find experiments/figure-text-translation -newer critic.md` (excluding `pylibs`) returns nothing.
- Chromium survivors after the last load: none (`chrome-headless`, `headless_shell`, `chrome`).

## Artefacts

- **Tools:** `exo/tools/{render-exo.mjs, run1.sh, refgraph.py, ops.py, v1.py, v1b.py, v2.py, pixdiff.py, ident.py}` and `exo/census.py`
- **Fix:** `exo/fix/collapse_blend_lerp.py`; equivalence run `exo/fix/compare.txt`
- **Renders:** `exo/r1/`, `exo/bis/` (`v1*.png`, `chain_k*.png`, `exo_IS_v1*.png`, `v1_compare.png`), `exo/all34/`, `exo/cal/`, `exo/corp/`
- **Heal:** `exo/heal/` (`h_v1.svg/png`, `ringvis.py`, crops)
- **PDF trace:** `exo/pdf/trace.py`
- **Corpus census:** `exo/corpus/bm_census.{py,jsonl}`
