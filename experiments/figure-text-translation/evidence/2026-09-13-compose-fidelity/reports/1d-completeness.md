# 1d: completeness sweep. Where formatting and geometry get lost between the source PDF and the published SVG

Measured 2026-09-13, over the 34 bought figures (ch03 + ch04 + FishLemon). It cost 0 ISK, and nothing under the repo was modified.

## How it was measured (and the check that the instrument reproduces the published output)

- **Instrumented composer.** I copied `compose.py` (plus `figtext`, `blockkey`, `svgout`, `_deps`, `readlayer`) to `scratchpad/1d/lib/`. The **drawing statements are untouched**. I only added a per-block JSON dump (`diag-{control,translated}.json`). It ran 34× in `--control` mode and 34× with `--translations <sidecar>`, one at a time.
- **Reproduction check:** the regenerated `translated.svg` has the same `<text>` elements as `books/efnafraedi-2e/media/<b>_IS.svg` on **34 of 34 figures (450 of 450 elements)**, and the artwork is also identical on 34 of 34. Only the `<style>` block differs (see F14). So every geometric number below describes what readers actually get.
- **Denominators.** 367 drawn blocks: **K = 184** kept in English (send:false), **I = 7** in the sidecar with a value identical to the English, **T = 176** actually translated. The sidecars hold 169 distinct keys: 7 identity and 162 translated, and 14 sent blocks are duplicates of a key.
  - ⚠️ **Correction to the shared context.** The split "198 never sent / 7 / 162" mixes units. It counts duplicate *sent* blocks as never-sent. At block level the correct figure is **191 of 367** English blocks (184 K + 7 I) re-laid for no gain, not 205.
- **Visibility weights used for the ranking:**
  - **3**: obstructs, clips, or wrecks typography that carries meaning (text lands on an arrow or border, is cut off at the page edge, or a formula is flattened).
  - **2**: obvious in a side-by-side (glyph shape changed, element recoloured, moved ≥ 2 pt).
  - **1**: visible only on close comparison (shift of 0.5–2 pt, a similar glyph from another family).
  - **0.1**: below casual perception (shade of near-black, ≤ 35/255).
- **Score = exposure × visibility.** Exposure is in blocks unless a row says otherwise.
- **Pixel instruments** work at 200 dpi, with pdftocairo rendering both the source and the artwork.
  - "New ink" = dark pixels (L < 128) in the artwork that fall inside the *drawn* glyph boxes but outside the *source* glyph boxes dilated by 1 pt. Glyph boxes come from Liberation hmtx proportions scaled to each run's real advance, with spaces excluded.
  - Positive control: it flags HClsoln's M2 blocks (206 and 185 px), and all 8 crops I looked at were real collisions.
  - Limits: it only sees dark artwork, so text spilling onto a light fill or onto another label is missed; rotated text is not measured.

## Ranked table (exposure × visibility)

| # | What is lost / replaced | Where | Exposure (denominator) | Vis | Score | Example | Fix class |
|---|---|---|---|---|---|---|---|
| 1 | **Sub/superscripts flattened**: each line becomes one string at one size on one baseline | compose.py:147 (`''.join`), :264-291 (one `sz`, one baseline per line) | **52/367 blocks** have a baseline-shifted run (K 14, I 4, T 34), 87 runs, 18/34 figs. Plus 1 block that only mixes sizes (sandwich `=` at 10 pt). Pixel XOR of control vs source: **median 0.268 vs noise floor 0.05** | 3 | 156 | sacch `Mass of\|C7H5NO3S\|(g)` → `C7H5NO3S (g)` flat; FishLemon `NH2CH2CH2CH2CH2NH2` | **K** for 18 K/I blocks; **T** for 34 (the MT value carries the formula as flat text, so K cannot restore it) |
| 2 | **Translated blocks re-flowed with a hard-coded box width and re-centred vertically**, so text lands on arrows, box borders and leader lines, or runs off the page | compose.py:135 `BOXW=63` (the box of one figure), :241 `maxw`, :249-269 wrap + shrink, :274-277 vertical-centre anchor, figtext.py:71 single-line → `center` | T with new ink ≥ 30 px: **34/176** (≥ 100 px: 23), 13/34 figs. T with line count changed: **66/176** (18 more, 48 fewer). T wider than source by > 2 pt: 64/176. Shrunk: 15/176 (down to 6.75 pt). Page overhang: 4. **Any of ink/overhang/shrink: 46/176 blocks, 23/34 figs** | 3 | 138 | vitC `Multiply by molar\|mass (g/mol)`: 2 → 3 lines, top line on the arrow (1304 px). empform `Mass of\|X atoms`: 2 → 1 line, out of its box (353 px). flowchart `Volume\|of pure\|substance\|B`: 4 → 2 lines, 14.5 pt past the page edge. combmap `Percent\|composition` → one line at 6.75 pt, over the box border | **T** |
| 3 | **English re-laid for no gain.** This is the carrier of rows 1, 4, 6, 8, 10, 11, 12 for K/I | compose.py:173-199 (`keep_english` goes through the same wrap/centre/flatten path) | **191/367 blocks** (K 184 + I 7). 3 figures are all-identity (basehyd, HClsoln, GreenChem). Among K/I blocks drawn line-for-line: horizontal shift ≥ 1 pt 33/191, ≥ 0.5 pt 60/191 | framing | — | HClsoln (all 9 blocks English) | **K** (draw run-exact from runs.json), or skip recompose |
| 4 | **Font family replaced: STIXGeneral glyphs (+ = ×) drawn in Liberation** | compose.py:47 `FAMILY`, svgout.py:16-19 | 47 runs / **45 blocks** (K 41, I 1, T 3), 10/34 figs. Advance ratio source/Liberation: × 1.086, = and + 1.163, so the glyph sits ~0.5 pt off-centre and has a different shape. XOR median 0.182 | 1 | 45 | alsulfatemass `=`, rxn2 `+` | **F** (embed a STIX face, or K run-exact) |
| 5 | **Colour conversion is a naive CMYK→RGB**, unlike poppler's for the surrounding artwork | compose.py:66-70 | **367/367 blocks (661/661 runs), 34/34 figs**; every text fill is near-black. 100% K: composer draws `#000000`, while pdftocairo writes the same ink into the published artwork as `rgb(13.73%, 12.16%, 12.55%)` = (35,31,32). Read from `cmyk_probe.svg`, and that exact fill occurs 3× in HClsoln's `artwork.svg`. 498 runs / 27 figs are 100% K; rich blacks differ by ≤ 13/255 | 0.1 | 37 | every label | **F** |
| 6 | **Page overhang**: a wider (flattened or translated) line is centred and crosses the page edge | compose.py:236-238, :281 | **5/367** (K 1, T 4), 5 figs | 3 | 15 | HClsoln `H2O(l)` x = −0.54 (K). empform `Empirical\|formula` +14.55 pt. etheneBr `with an excess of Br2.` → `Br2.` at y = −2.51 | K / T |
| 7 | 🆕 **strip-text deletes graphics-state operators inside BT..ET.** Fill colour set inside a text object carries on to artwork drawn after ET, so later artwork changes colour | strip-text.py:92-112 (every instruction at depth > 0 is dropped, including `k`/`rg`/`gs`/`w`) | Latent on **18/34 figs** (gstate ops inside BT). **Visible on 1/34: combustion, 7 arrowheads blue-grey instead of black, 1750 px.** A strip variant that keeps non-text ops gives **0 px on 18/18** and restores the black arrowheads (I looked). Confirmed in Chromium on the published `_IS.svg` | 2 | 14 (7 elements) | CNX_Chem_04_05_combustion, the `>` arrowheads | **S** |
| 8 | **Italic drawn upright** | compose.py:54-58 `FONT_SLANT_NORMAL`, svgout.py:16-19 and :59 (Regular + Bold faces, `font-style:normal` only) | 11 runs / **7 blocks** (K 4, I 3), 1/34 figs. XOR median 0.295 | 2 | 14 | HClsoln `aq` `g` `l` | **F** (+K) |
| 9 | **Browser metrics ≠ composer metrics.** Positions come from cairo's toy font, hinted at 200 dpi; Chromium lays out the embedded woff2 with its own, **scale-dependent** advances | compose.py:61-63 `measure`, :281 anchor math | 450 `<text>`, browser − cairo width. **At the repo's reader convention of 2.78 px/pt** (render-check.mjs 1300 px for a 468 pt figure): median 0.00, p95 +0.003, extremes −2.88 / +4.32 pt; **11/450 ≥ 1 pt**; anchor-point shift (centre ×½, right ×1) ≥ 0.5 pt: **8/450**. At the SVG's natural size (1.33 px/pt): 67/450 ≥ 1 pt and 42/450 anchor shifts ≥ 0.5 pt. At 1 px/pt `Efnajöfnustuðull` measures 53.0 vs 60.75 at 4 px/pt, and deviceScaleFactor 2 does not change that. ⚠️ Headless Chromium on Linux quantises advances to whole CSS px; Chrome on Windows/mac with subpixel positioning may behave differently (not measured) | 1 | 8 | rxn2 `Hvarfefnamegin` −2.88 pt at 2.78 px/pt | **F/T** (`text-anchor`, or unhinted hmtx metrics) |
| 10 | **M2: runs of whitespace collapsed**, so the line shrinks and is re-centred onto the arrow | compose.py:252 `para.split()` / :258 `' '.join` | **2/367** (both I), 1/34 figs, 9 spaces each (≈ 20–23 pt). Shift 10.6 / 11.3 pt, new ink 206 / 185 px. 0 T values carry multiple spaces | 3 | 6 | HClsoln `HCl(g)          HCl(aq)` | **K**. Chromium **does** honour the `xml:space="preserve"` that svgout.py:72 already writes (measured length 81.75 vs 61.5; I looked at the render) |
| 11 | **Kept formula shrunk** because flattening makes it wider than `max(widths)+1` | compose.py:241, :266-268 | **2/184 K**: FishLemon, 9 → 8.5 and 9 → 8.25 pt | 2 | 4 | `NH2CH2CH2CH2CH2NH2` | **K** |
| 12 | **M3: `lines()` splits a superscript that `group()` admitted**, so one baseline becomes 2 drawn lines. The bought key changes too | figtext.py:61-66 (0.5·max size) vs :31-33 (`script`), blockkey.py:34 | **1/367** (K), 1 fig. Baseline moved 7.0 pt, horizontal 15.5 pt; also the only non-monotonic line order | 3 | 3 | FishLemon `NH3\|+CH2CH2CH2CH2NH2` | **R** |
| 13 | **Line pitch assumed to be 1.222×size** (and vertical centre taken from each line's first run) | compose.py:274-277 | pitch/size over 119 line pairs: median 1.222, outside [1.19, 1.25] in 6 blocks. Baseline error ≥ 0.5 pt: K/I 1 (the M3 block), T 2 of 35 same-line-count blocks (sacch, 0.5 pt) | 1 | 3 | sacch `Moles of\|C7H5NO3S\|(mol)` (pitches 11 and 12 pt) | T / K |
| 14 | **Tc/Tw letter- and word-spacing dropped** | readlayer.py:393 (adv keeps it), compose.py:280 (drawn at natural spacing) | **1/34 figs** (flowchart: 2 Tc≠0, 2 Tw≠0 operators). Source/Liberation ratio down to 0.896 (`Number\|of\|particles`); those blocks are T and re-flowed anyway. Tz≠100: 0/34; Ts≠0: 0/34 | 0.1 | ~1 | flowchart `Number\|of\|particles\|of A` | T |
| 15 | **Embedded font bytes are not deterministic.** fontTools stamps `head.modified`, so identical input yields different SVG bytes | svgout.py:23-40 | **34/34** recomposes byte-different while text and artwork are identical | 0 | 0 | argon: `head.modified` 3872132747 vs 3872093445 | F (operational: a hash cannot tell a no-op recompose) |

### Single-line `center` default: proxy for labels anchored on one side

- **Exposure.** 270/367 blocks are single-line and forced to `center` (K 183, I 7, T 80). For K/I text this is harmless, because the start is the same when the widths match.
- **Proxy.** Look for dark artwork within 8 pt beside the source text, left or right, at text height.
  - Positive control: exocytosis `Neuron` → `right` (its leader line); `Synapse` → `left`; flowchart `Molarity` → `both`, between two box borders.
  - At 4 pt the proxy missed `Neuron`, which is why 8 pt was used.
- **Result over unrotated single-line blocks:**
  - T: 7 left, 4 right, 5 both, 62 none.
  - K: 14 left, 9 right, 12 both, 148 none.
  - I: 2 left, 1 right, 4 none.
- **16 of 78 unrotated single-line T blocks abut artwork.** 3 of them measure new ink ≥ 30 px after centred growth: `Neuron` → `Taugungur`, which runs over the leader; and `Molarity` → `Mólstyrkur` ×2, over both box borders.
- **Limits.** An 8 pt band also catches unrelated artwork nearby. The proxy does not see a label abutting another label.

## Measured zeros, each with its positive control

| Hazard | Result on the 34 | Control that proves it could have fired |
|---|---|---|
| Glyph coverage (tofu) | 0 missing among 3,115 published chars; 0 among source chars | U+21CC and U+27F6 are flagged as missing from the Liberation cmap |
| Fill kinds other than cmyk / None→black | 661/661 runs are `('cmyk', …)`; 0 None; 0 unknown colour spaces; 0 colour warnings (meta) | — (readlayer normalises; a census, not a detector) |
| Text drawn with alpha, blend or SMask (drawn opaque by us) | 0/677 show ops under a non-default ExtGState (q/Q-aware walk, including forms) | Synthetic PDF: 1 of 3 ops under `ca 0.5 /Multiply` detected |
| MediaBox origin ≠ 0, CropBox ≠ MediaBox, /Rotate (misregistration) | 0/34 | Synthetic PDF with MediaBox [10 20 110 120] read correctly |
| `Tr` ≠ 0 (clip-mode 7 hazard, stroke/invisible text) | 0/34 (only `0 Tr`) | CNX_Chem_04_02_Citrus: `Tr7` ×2 detected |
| Arcs / degenerate arcs | 0/367 / 0/367 | — (compose's own `is_arc`/`fit_circle` values) |
| Mixed weight or fill within a line (lost at compose.py:279) | 0/367 / 0/367 | Mutated block fires 1 / 1; unmutated copy 0 |
| Line styles differing between lines (misapplied when the line count changes) | 0/367 | Mutated block fires |
| Tab/NBSP collapsed | 0/367 | Mutated value fires |
| Bold weights missed by `'bold' in base` | 0: only 4 base families on the 34 (LiberationSans, -Bold, -Italic; STIXGeneral-Regular) | `LiberationSans-Bold` detected (37 runs, 6 figs) |
| Source text hidden behind artwork, which our drawn-on-top text would reveal (z-order) | 362 of 363 unrotated blocks show ≥ 5% visible source ink (median 25.8%); the one below is a `.` glyph | 18 figs do paint after text in-stream, so the hazard class exists; rotated blocks (4) are not measurable with this box model |
| Strip changing non-text artwork (other than row 7) | 0 px on 33/34 (rotated-text mask) | combustion: 1750 px detected; the flowchart 4292 px on the first pass was my unrotated mask and dropped to 0 once the mask followed the rotation |
| Kept English wrapped to more lines / still over budget at 5 pt | 0/191 / 0/367 | T wrapped-more fires on 18 |

## Details worth carrying

- **Rows 1 and 2 are different mechanisms and need different fixes.**
  - Row 1 (K part) disappears if kept blocks are drawn run-exact.
  - Row 1 (T part) and all of row 2 live in the translated-layout path:
    - `BOXW=63` is one figure's box width, applied to every unrotated label.
    - Rotated labels get `maxw=999`.
    - Vertical-centre anchoring moves a label whose line count changed toward or onto whatever sits above or below it.
- **In the T population, 48 of 66 line-count changes are FEWER lines.** The single MT string gets re-wrapped to 63 pt, wider than the 40–45 pt source columns. So the dominant defect is labels growing wider than their boxes, not taller.
- **Row 7 (strip-text graphics state) is new and has nothing to do with the MT.** It also hits a `--control` compose, because strip-text runs at prepare time. The published combustion figure is wrong for readers today.
  - Mechanism: `strip_text_ops` drops every operator at BT depth > 0. PDF graphics state (colour, `gs`, line width) is not scoped by BT/ET.
  - Evidence: `scratchpad/1d/crops/combustion_strip_variants.png` (source / current strip / keep-gstate strip) and `combustion_published_browser.png`.
- **The width ratio (row 4, row 14) is measured per SOURCE LINE:** the source extent (first run to the last run's end) divided by cairo's width of the same runs at their own sizes.
  - Lines drawn only in Liberation: **n = 441, median 0.9929, p5 0.9758, p95 1.014.**
  - The 13 Liberation-only lines outside [0.97, 1.03]:
    - flowchart ×9 (the Tc/Tw figure; `Number` 0.896);
    - combmap `composition` 0.950;
    - 4 short strings at 0.966–0.970 (`Al`, `A to X`, `119.37`, `Vesicles`).
  - Everything else outside that band carries a STIX glyph.
  - ⚠️ The ~0.993 median is partly cairo's hinting at 200 dpi (e.g. `g`: source 5.004 pt vs cairo 5.04), not a source spacing operator.

## Artifacts (all under scratchpad/1d/)

- `lib/compose.py`: the instrumented copy (diag only).
- `work/<b>/diag-*.json`: per-block records.
- `data/blocks.jsonl`, `data/joined.json`: per-block flags.
- `data/pixel.jsonl`: occlusion and XOR.
- `data/pdf_scan.txt`, `data/text_gs.txt`, `data/inbt_ops.txt`, `data/gs_validate.jsonl`.
- `data/browser_widths.json`, `data/browser_scale.json`, `data/width_rows.json`, `data/cmyk_probe.*`.
- `crops/*.png`: every visual check cited above.
- `browser/xmlspace.png`: the xml:space render.
- Scripts: `analyse.py`, `summ.py`, `pixel.py`, `pdf_scan.py`, `text_gs.py`, `inbt_ops.py`, `strip_variant.py`, `gs_validate.py`, `cmp_widths.py`, `browser/*.mjs`.
