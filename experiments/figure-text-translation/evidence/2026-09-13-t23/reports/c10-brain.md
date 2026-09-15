# §C140 ⑩ spike — the "text-box outline" on `CNX_Chem_03_01_brain-ec0b`

0 ISK. Nothing that calls the MT was run. Scratch: `/home/siggi/dev/scratch-c140/c10/`. 2026-09-13.

## Headline

**The outline is not in the source, not in the strip, and not in the composer. `pdftocairo -svg`
creates it.** The source has a white rectangle (layer "white knockout", `Fm0`) under a
luminosity soft mask with `/BC [1.0]`. The mask is a feathered image that fades to about 0 at the
rectangle's edge, so the rectangle can't be seen in the source. `pdftocairo -svg` turns that soft
mask into a 90×24 PNG at 1 px per pt, laid over the whole-point extents of the rectangle's clip.
In that PNG the outer rows and columns, which the clip only partly covers, hold **alpha 236–251
where the source mask is 0–9** (measured).
*Inferred, not read in poppler's source:* this fits poppler rasterising the SMask group over the
clip's whole-number extents and leaving the uncovered part of each edge pixel at `/BC`. The exact
values do not fit a simple coverage model (243 measured against about 197 predicted), so treat the
model as consistent with the data, not proven.
Chromium scales that raster up bilinearly (×2.78 at 200 dpi), which spreads the bright edge inside
the clip. The result is a 1–2 px light line around the rectangle's BBox.

**⑩ and ④ are NOT one fix.** Brain is the only one of the 19 PDF-sourced bought figures with zero
graphics-state operators inside BT..ET. ⑩ happens at the same step as ⑤ (the `pdftocairo -svg`
call), not at ④ (`strip-text.py`'s BT..ET removal).

**A second figure carries the same bytes:** `CNX_Chem_03_01_exocytosis-88f6` has 8 such masks.
Whether they show on screen is unmeasured (see Misses).

**Fix candidate, measured:** after `pdftocairo -svg`, overwrite each outer row/column that the clip
cuts with its inner neighbour. Results:
- brain: outline gone (edge contrast 33.8/25.5/12.3/23.3 → 1.1/0.0/0.0/2.2, below the source's
  own 0.8/6.6/0.0/9.6);
- 1,320 px changed, 0 of them more than 3 px from the BBox perimeter;
- 32 of 34 committed SVGs byte-identical after the pass;
- 2 control figures byte-identical when run through the patched `strip-text.py`.

---

## 0. Setup and provenance

- Source resolved: `sources.py --json efnafraedi-2e CNX_Chem_03_01_brain` →
  `/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_03/Source_File/CNX_Chem_03_01_brain.pdf`
  (first edition). It is an **Illustrator CS6 PDF** (Adobe PDF library 10.01), page 351×174 pt. The
  page size is whole points, so ⑤'s non-integer scaling does not apply.
- Prepared: `figure-prepare.py <src> --basename CNX_Chem_03_01_brain-ec0b --out c10/prep` → exit 0, 3
  blocks (1 sendable). **Control:** `c10/prep/artwork.svg` is byte-identical to the artwork part of
  the committed `books/efnafraedi-2e/media/CNX_Chem_03_01_brain-ec0b_IS.svg`. The committed file
  is that artwork followed by one `<style>` and 3 `<text>` elements, with 0 masks and 0 paths
  appended.
- numpy/scipy went into scratch only: `uv pip install --python 3.14 --target c10/pylibs-np numpy scipy`.
- Renders at 200 dpi, 975×484. Chromium renders use a scratch copy of `render-check.mjs`
  (`c10/tools/render-check2.mjs`). The copy sets the `<img>` height to 483.333 px, which matches
  pdftocairo's 483.33 rows and avoids a 0.14 % vertical stretch, and it raises the timeouts. It is
  the same `<img>`-hosted Chromium path E's review used.
  ⚠️ `render-check.mjs` writes `<dst>.host.html` next to its output. Never give it a repo path as `dst`.
- **`--control` compose was skipped because the check above already answers it.** The composed SVG
  is the prepared `artwork.svg` plus `<text>`, and the edge statistics of `artwork.svg` and the
  committed SVG agree to the digit (table in §2).

## 1–2. Locating the outline

The detector is `c10/tools/locate.py`. It finds columns and rows whose count of differing pixels is at
least 30 above the ±7-px median. Population: all pixels of one 975×484 render. Threshold: luminance
difference > 20, with text ink masked (|source − artwork| > 30, dilated by 3 px).

| comparison | column spikes (x) | row spikes (y) |
|---|---|---|
| `artwork.svg` in Chromium vs `artwork.png` (pdftocairo -png), both text-free | **633, 877** (64 / 59 px) | **259, 260, 321** brighter; **322** darker; 424 |
| committed `_IS.svg` in Chromium vs `source.png`, text masked | 633, 877 | 259, 260, 321, 322; 424 |
| **control:** `artwork.png` vs `source.png` (same renderer), text masked | none (0 px hit) | none (0 px hit) |

**Shape and position:** an axis-aligned rectangle at x 633–877, y 259–322 px, at 200 dpi. That is
PDF x 227.9–315.7 pt, y (top-down) 93.2–115.9 pt, which is exactly `Fm0`'s `/BBox [227.766 57.868
316.293 80.762]`. **It is a LIGHT line, not a dark stroke.** Ours is brighter by 20–40 luminance
units on the edge pixel.

The row at y=424 is a different thing: the bottom edge of the right-hand photo's clip. Chromium
paints that partly covered row white (255.0), where cairo antialiases it to 220.6. That is a
renderer difference at a clip edge, not the outline.

**Edge-line contrast.** Tool: `c10/tools/edgeline.py`. Unit: luminance (0–255) of the brightest line
within ±2 px of each BBox edge, minus the median of its ±6 px neighbourhood, averaged along the run.
Vertical edges average over y 265–316 (51 px); horizontal edges over x 644–866 (222 px). Controls
are the same statistic at positions with no edge. ctlV2 and ctlH2 are clean everywhere; ctlV1 and
ctlH1 pass through label ink on renders that carry text, and are clean on the text-free renders.

| render | left | right | top | bottom | ctlV2 | ctlH2 |
|---|---|---|---|---|---|---|
| `source.png` (pdftocairo -png, source PDF) | 0.8 | 6.6 | 0.0 | 9.6 | 1.6 | 1.4 |
| `artwork.png` (pdftocairo -png, stripped PDF) | 0.8 | 6.6 | 0.0 | 9.6 | 1.6 | 1.4 |
| `artwork.svg` → Chromium | **33.8** | **25.5** | **12.3** | **23.3** | 1.4 | 1.5 |
| committed `_IS.svg` (AFTER, `b28dbe22`) → Chromium | **33.8** | **25.5** | **12.3** | **23.3** | 1.4 | 1.5 |
| BEFORE (`f6069bb9`, 2026-09-12) → Chromium | **33.8** | **25.5** | **12.3** | **23.3** | 1.4 | 1.5 |
| June (`9269fcda`, 2026-06-26) → Chromium | 1.3 | −4.4 | 0.0 | 4.5 | 1.3 | 0.9 |
| OpenStax published JPG (`01-source/media/…-ec0b.jpg`, 700×347) → Chromium | 1.3 | −4.2 | 0.0 | 2.9 | 1.8 | 0.9 |

Crops (×3, nearest-neighbour) are in `c10/crops/`: `source_glow_x3.png`, `artwork_svg_glow_x3.png`,
`committed_IS_glow_x3.png`, `june_9269fcda_glow_x3.png`, `openstax_jpg_glow_x3.png`, and
`compare_source_committed_healed.png` (source / committed / healed, stacked).

The faint 6.6/9.6 in the pdftocairo PNG is *probably* the same effect at device resolution (one
partly covered device pixel, no bilinear spread). **That is inferred, not measured.** OpenStax's
own JPG measures ≤ 4.2.

## 3. Mechanism — each hypothesis tested

### What the source actually draws (content-stream operators)

On the page, layer `/OC /MC2` is the OCG named **"white knockout"**:
```
q 0 174 351 -174 re W n q /GS1 gs /Fm0 Do Q EMC        % GS1: ca 0.800003
```
`Fm0` (578) has BBox [227.766 80.7622 316.293 57.8677] and is a transparency group:
```
q /GS0 gs 0 Tc 0 Tw 0 Ts 100 Tz 0 Tr /Fm0 Do Q
  GS0 = { /SMask << /S /Luminosity /BC [1.0] /G 591 0 R >> }
    G (591), BBox [225.766 82.7622 318.405 55.6421], Group /CS /DeviceGray:
      /Fm0 (594): q 92.64 0 0 27.12 225.7656 55.6422 cm /Im0 Do Q
        Im0 (597): 386×113, 8 bpc, /Separation /Black, /Decode [1 0]   ← the feather
  inner /Fm0 (586), BBox = the same as 578:
      0.027 0.017 0.017 0 k   316.293 57.868 -88.527 22.895 re f   ← near-white fill, NOT stroked
```
**There is no stroked path in the figure except the arrows** (`2 w … S` white halos and `0.75 w … S`
black shafts). The "outline" is the edge of a filled rectangle.

### (a) `strip-text.py` drops graphics-state ops inside BT..ET (④'s class) — **FALSIFIED**
- `instruments/1d/inbt_ops.py` on brain: `gstate-ops-inside-BT: 0`. **Positive control:** the same
  tool on `CNX_Chem_04_05_combustion.pdf` reports `{'k': 2}`, so it can fire.
- The page's only BT..ET is the last object in the stream, followed only by `EMC`, and holds only
  `Tf Tm Tj Td`.
- **Pixel control:** `artwork.png` equals `source.png` outside text ink (0 hit pixels in the table
  above). The strip does not change the rendered artwork of this figure.
- `strip_variant.py` was not run. Its keep-gstate variant would remove nothing different on a figure
  with 0 in-BT gstate ops, and the pixel control above already covers it.

### (b) text rendering mode 7 (clip) / 3 (invisible) — **FALSIFIED**
`Tr` census over the page, every reachable Form, and the SMask group: `{('/Fm0','0'): 1,
('/Fm0/SMask','0'): 1}`. Both are mode 0, and both sit *outside* BT, where the strip keeps them.

### (c) something in the source hides the rectangle's edge, and our pipeline exposes it — **HALF RIGHT**
- **Right half:** the edge is hidden by the **luminosity soft mask**. Decoded `Im0`, with the mask
  value equal to the raw sample because `/Decode [1 0]` and C0 is white, is **0–9 on the pixel ring
  at the rectangle's BBox** and 13–40 one pixel in. The feather fades to transparent before the
  rectangle's edge.
- **Wrong half:** it is not a stroked text frame, not a white paint-over, not overprint, and **not an
  optional-content layer**. All 19 OCGs are in `/D /ON`, there is no `/OFF` and no `/BaseState`,
  and `MC0`–`MC4` → Layer 3, Layer 1, white knockout, Arrows, labels, all ON.

### (d) the conversion — **CONFIRMED, at `pdftocairo -svg` (poppler 26.01.0)**. The EPS→PDF half does not apply: the source is a PDF.

`artwork.svg` holds the soft mask as `mask-2`:
```
<image id="source-29" width="90" height="24" href="data:image/png…"/>
<mask id="mask-2"><g filter="url(#filter-remove-color)"><use xlink:href="#source-29"/></g></mask>
<clipPath id="clip-2"><path d="M 0.765625 0.238281 L 89.292969 0.238281 L 89.292969 23.132812 L 0.765625 23.132812 Z …"/></clipPath>
… <g clip-path="url(#clip-2)"><g mask="url(#mask-2)"><use xlink:href="#source-28"/></g></g>   % source-28 = the 97% white rect
<g mask="url(#mask-1)"><use xlink:href="#source-32" transform="matrix(1,0,0,1,227,93)"/></g>   % mask-1 = 0.8 opacity
```
`filter-remove-color` sets RGB to 1, so the mask value is the PNG's alpha. The decoded alpha of `source-29`:

| | row 0 (top) | row 23 (bottom) | col 0 (left) | col 89 (right) |
|---|---|---|---|---|
| **SVG raster, outer ring** (mean excluding corners) | **128** | **251** | **243** | **236** |
| SVG raster, next ring in | 68 | 46 | 43 | 45 |
| **source `Im0` sampled onto the same 1-pt grid, outer ring** | 9 | 0 | 1 | 1 |
| source `Im0`, next ring in | 40 | 17 | 13 | 15 |
| fraction of the outer pixel outside `clip-2` | 0.238 | 0.867 | 0.766 | 0.707 |

- Inside the ring the SVG raster tracks the source mask (Pearson r = +1.000 on rows 2–21, cols 2–87).
  **The ring is added by the conversion, not present in the source.**
- The ring's strength follows the clip's outside fraction. The top edge has the smallest fraction
  and the weakest ring (128), and it is also the weakest edge in the render (12.3 vs 23–34).

**The intervention that makes this causal.** Copy `artwork.svg`, overwrite `source-29`'s outer ring
with the adjacent inner ring, re-encode, render:

| render | left | right | top | bottom |
|---|---|---|---|---|
| `artwork.svg`, untouched | 33.8 | 25.5 | 12.3 | 23.3 |
| **control:** the same raster re-encoded through PIL, pixels unchanged | 33.8 | 25.5 | 12.3 | 23.3 |
| ring overwritten | **1.1** | **0.0** | **0.0** | **2.2** |

The ring pixels are the cause. Re-encoding alone does nothing.

**Levers that do NOT work** (measured, so nobody retries them):
- `pdftocairo -svg -r 72|150|300|600` writes **byte-identical** SVGs. `-r` is ignored for `-svg`,
  and the mask raster stays 90×24.
- `-scale-to-x/-y` is refused: *"may only be used with the -png, -jpeg, or -tiff output options"*.
- `-paperw/-paperh -expand` rotates the page to portrait and fits it (scale 0.714 on the photo), so it
  is not a clean scale.

## 4. History — when did the outline arrive?

| vintage | what the SVG is | edge contrast (L/R/T/B) | outline |
|---|---|---|---|
| `9269fcda` 2026-06-26 (June) | one JPEG background + 3 `<text>` | 1.3 / −4.4 / 0.0 / 4.5 | **no** |
| `f6069bb9` 2026-09-12 (BEFORE) | pdftocairo -svg vector artwork | 33.8 / 25.5 / 12.3 / 23.3 | **yes** |
| `b28dbe22` 2026-09-13 (AFTER, E) | same artwork, run-exact text | 33.8 / 25.5 / 12.3 / 23.3 | **yes** |

The outline arrived when figure artwork moved from raster to `pdftocairo -svg` vector, on
2026-09-12. E did not change it, which matches [USER]'s "same as BEFORE".

**Who sees what today:** `05-publication/mt-preview` and `05-publication/faithful` at HEAD, and the
local `../namsbokasafn-vefur/static/content/…/CNX_Chem_03_01_brain-ec0b_IS.svg`, all hold the June
copy (sha256 `c4aa714d…`), which has no outline. **Nobody is served the outline today. It would
first reach a published copy at the render + sync that ships the recomposed figures (⑧'s
publication call).**

## 5. Exposure across the 34 bought figures

**Byte census.** Tool: `c10/tools/mask_census.py`, run on all 34 committed
`books/efnafraedi-2e/media/<b>_IS.svg`. Unit: one `<mask>`; a figure is flagged if any mask is.
Flag rule: outer ring minus next ring ≥ 50 alpha units on any side.

| | figures |
|---|---|
| no `<mask>` at all | 27 |
| masks, but none backed by an image | 1 (`CNX_Chem_04_01_rxn3`, 18 rect masks) |
| image masks, all **transformed** (an image's own /SMask at native resolution) | 4, **0 flagged**: HClsoln (44), limiting (12), sandwich (2,958), combustion (10) |
| **untransformed soft-mask rasters** (this mechanism's structure) | **2**: brain (1 raster, 1 flagged), exocytosis (12 rasters, **8 flagged**) |

Positive control: brain fires. The transformed masks in the same files (brain `mask-0`, the photo's
own 1641×907 alpha) do not.

**Mechanism check across both carriers.** Tool: `c10/tools/ring_vs_clip.py`. Unit: one side of one
mask. It relates each side's ring excess to the fraction of the outer pixel outside the rect clip
that wraps the masked group.
- **9 clip-wrapped rasters, 36 sides: Pearson r = 0.928.**
- Sides with outside fraction < 0.05 (n = 4): ring excess ≤ 9.7.
- Sides with outside fraction ≥ 0.2 (n = 28): ring excess ≥ 49.8.

The 9 clip-wrapped rasters are brain `mask-2` and exocytosis `mask-8, -12, -39, -43, -189, -271,
-409, -491`. The other 4 exocytosis rasters (`mask-0, -22, -53, -187`, all 432×241, page-sized) have
no clip wrapper, so the outside fraction is unknown. Their ring excess is ≤ 1.6, except
**`mask-0` left side 39.6**, which is not classified.

**Is ⑩ the same class as ④? No.** `inbt_ops.py` on the 19 PDF-sourced bought figures: **18 carry
gstate ops inside BT, brain is the only one with 0.** The 15 EPS-sourced figures were not censused
here; the tool reads PDFs and they would need staging. The one exocytosis also carries ④'s
signature (`{'k': 1}`), but the two defects sit at different steps and need separate fixes.

## 6. Fix candidate — heal the ring after `pdftocairo -svg`

**Where:** `strip-text.py --svg`, directly after the `pdftocairo -svg` call. That script produces
`artwork.svg`, and `svgout.write_svg` only appends `<text>` to it.
**Patched copy:** `c10/fix/strip_text_heal.py`, `heal_soft_mask_rings()`, about 45 lines:
1. Match cairo's soft-mask raster shape:
   `<mask id=M><g filter="url(#filter-remove-color)"><use xlink:href="#S"/></g></mask>`. An
   untransformed use; transformed image SMasks never match.
2. Pair it with the rect clip wrapping `<g mask="url(#M)">`. If there is no clip, **leave it and
   count it** (`noClip`).
3. Skip if the image `S` is referenced more than once (`sharedImage`), so visible content is never
   touched.
4. For each side the clip cuts (clip edge strictly inside the raster), overwrite the outer row or
   column with its inner neighbour. Re-encode the PNG and splice it in.
5. Print a report: `rasterMasks / healed / sidesHealed / noClip / sharedImage / clipUncut`.

### Measurements

| figure | role | patched vs original `strip-text.py` | pixel result |
|---|---|---|---|
| brain | target | `healed 1, sides 4`; SVG 4,964,452 → 4,964,388 bytes; `artwork.png` byte-identical | edge contrast **1.1/0.0/0.0/2.2** (source 0.8/6.6/0.0/9.6); **1,320 px changed (921 by > 8), max \|Δ\| 56, 0 px more than 3 px from the BBox perimeter**, all inside x 632–878 × y 259–322 |
| combustion | control, **has in-BT colour ops** (④), 10 transformed image masks | `rasterMasks 0`; **SVG and PNG byte-identical** | unchanged by construction |
| map7_img (staged EPS) | control, **0 in-BT gstate ops**, 0 images | `rasterMasks 0`; **SVG and PNG byte-identical** | unchanged by construction |
| exocytosis | second carrier | `healed 8, sides 32, noClip [mask-0, mask-22, mask-53, mask-187]` | not rendered (see Misses) |

- **Environment control:** the unpatched scratch copy reproduces `figure-prepare.py`'s `artwork.svg`
  byte for byte on all 4 figures, so the scratch runs stand in for the production path.
- **Heal run over all 34 committed SVGs:** 32 byte-identical. The 2 that change are brain and
  exocytosis.
- **In both changed files:** every byte outside the healed PNG payloads is identical. Inside the
  healed rasters, 0 interior pixels change and 0 RGB values change; only alpha on the ring moves
  (brain: 224 px = the whole ring).
- **Bought keys cannot move:** the heal rewrites only PNG payloads inside `artwork.svg`. It does not
  touch `runs.json` or `blocks.json`, which come from the read layer, not the strip.

### Caveats and alternatives
- **It depends on cairo's exact SVG output** (the regex shape). If poppler changes it, the heal
  matches nothing and the outline comes back. A production version should refuse, not report, when
  an untransformed soft-mask raster is found that it cannot pair or heal.
- **`mask_census.py`'s ring-minus-inner rule can serve as the regression sentinel, independent of
  the heal.** Run it at prepare time as a named warning. If cairo's output shape ever changes, the
  heal matches 0 masks while the census still fires, so the failure is loud rather than silent.
- **Untested branches:** across all 34 figures, `clipUncut` and `sharedImage` were hit by **0**
  masks. A production version needs fixtures for them, or should fail closed on them.
- **Rollout is not covered by any stamp.** `isStale` (`tools/figure-run.js`) keys on
  `COMPOSER_VERSION` and the render hashes, never on the artwork. `figure-run.js`'s step list runs
  prepare on every invocation, so `figure-run --figure <b> --force` (0 ISK) on the 2 carriers should
  pick up a healed `artwork.svg`. **That is read from the code, not run.**
- **Not tested:** pre-scaling the PDF page by k in pikepdf before `-svg` and wrapping the result in
  `scale(1/k)`. It would narrow the ring by k but not remove it, and it would change every cairo
  raster fallback in every figure. That fails "smallest fix".

## ⚠️ Out of scope, but reader-facing — surfaced, not buried
**The recomposed `CNX_Chem_03_01_exocytosis-88f6` SVG does not load in the reader's rendering path.**
- **Measured:** its freshly prepared `artwork.svg` did **not finish loading in headless Chromium
  inside `<img>`**, the path `cnxml-render` publishes through. That file is 24.9 MB with 628 masks,
  604 of which reference no image. **It is byte-identical to the committed `_IS.svg` minus the 7
  appended `<text>` elements** (checked). The committed file itself was not loaded separately.
  - First attempt: 30 s screenshot timeout.
  - Second attempt: 300 s `page.goto` timeout.
- **Not diagnosed:** the cause was not investigated.
- **Why it matters:** the copy at `05-publication/mt-preview` HEAD is the 254,774-byte June file
  (`d2095274`), so pupils get a working figure today. **The recomposed one would replace it at the
  next render + sync.**
- This is the likely explanation for [USER]'s USER-REVIEW row 11, *"Not visible on page"*, which no
  one had diagnosed.
- It also means **⑩'s visible exposure on exocytosis can't be measured until the figure loads.**

## Misses and open ends (named)
- **Exocytosis visibility: unmeasured**, for the reason above. It is a carrier by bytes only.
- Exocytosis `mask-0` left side, ring excess 39.6, no clip wrapper: not classified and not healed.
- The EPS-sourced 15 of 34 were not censused for in-BT gstate ops. That does not affect ⑩'s
  exposure, which was measured on the composed SVGs of all 34 whatever the source format.
- Row y=424 (the right photo's bottom clip edge) differs between Chromium and cairo. It was named
  and not pursued.

## Housekeeping disclosure
- The two prescribed `figure-prepare.py` / `sources.py` runs **recompiled
  `experiments/figure-text-translation/__pycache__/blockkey.cpython-314.pyc` and
  `figtext.cpython-314.pyc` inside the repo** (mtime 17:19:08). They are gitignored, so `git status
  --porcelain` stays clean, but it is still a write inside the repo. Every later run used
  `PYTHONDONTWRITEBYTECODE=1`.
- No file under `books/` was written. Git history was read with `git show <rev>:<path> > scratch`
  only.
- The two exocytosis Chromium renders threw a TimeoutError before `browser.close()`. Checked
  afterwards: `pgrep -fa 'headless_shell|chromium|chrome'`, excluding the always-running MCP plugin
  process, returns nothing, and no `render-check` node process is left.

## Artefacts
- Renders: `c10/renders/` (source, artwork, artwork_svg_exact, committed_IS_exact,
  before_f6069bb9_exact, june_9269fcda_exact, openstax_jpg_exact)
- Crops: `c10/crops/`
- Intervention: `c10/interv/`
- Fix: `c10/fix/strip_text_heal.py`, `c10/fix/{brain,combustion,map7,exocytosis}/{orig,heal}/`,
  `c10/fix/*_IS.healed.svg`, `c10/fix/brain_IS_healed.png`
- Instruments: `c10/tools/{locate,edgeline,mask_census,ring_vs_clip}.py`
- Census outputs: `c10/conv/mask_census_34.txt`, `c10/conv/ring_vs_clip.txt`,
  `c10/conv/inbt_19pdf.txt`
