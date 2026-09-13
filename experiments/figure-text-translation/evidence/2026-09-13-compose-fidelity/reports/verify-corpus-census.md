# Verify 1b corpus census (adversarial)

Measured 2026-09-13. Read-only against the repo: `git status --porcelain` was empty at the end. Everything I wrote is under `scratchpad/vcc/`. No MT, no `figure-run.js`. I ran `compose.py --control` twice, on my own prepare copies of Carbon and ChnReact1.

## Verdicts at a glance

| id | verdict | one line |
|---|---|---|
| C1 | confirmed, with a caveat | Code path read and correct. "Composed" is an **upper bound**: the driver's guards can still downgrade a figure to `failed-*`. |
| C2 | confirmed (the numbers, as defined) | Re-tallied, and re-measured on 25 figures with other instruments: 0 census-only flags. The **definition** is a poor proxy for visible damage, in both directions (new problems P1–P3). |
| C3 | confirmed | Resolution, blocks, keys, send and sendable are identical on **25 of 25** more figures in 15 chapters, via `figure-prepare.py`. |
| C4 | partially-true | The counts reproduce. But **53 of ch13's 90** affected blocks are italic-only. Without italic, ch13 is 37 of 201 blocks in 8 of 9 figures, and ch16 is 3 blocks in 1 figure. |
| C5 | confirmed | Mechanism reproduced from my own runs, and a raster shows the best-rule hits are real kerned sub/superscript pairs. |
| C6 | confirmed | Three readers (pdfminer, poppler, PDFium) all return `8`/`2`, while the raster shows `°C` and `−100`/`−50`. The cause is the font: `pdffonts` shows Custom encoding and no ToUnicode. |
| C7 | partially-true | It is a letter-size dialogue sheet and 13 blocks are sendable. But the figure **is** on that page: 5 of the 13 are real labels. A page-size census found a **second** artefact page, N2O5 (new problem P4). |
| C8 | confirmed | The only uncovered character is U+23DE. It is **visibly** broken: a notdef box in the control PNG, and the brace no longer spans its tick marks. |

## Instruments (independent of the producer's)

1. **Population**
   - Enumeration: a third instrument, `grep -a -o '<image [^>]*src="…"'` over `01-source/ch*/*.cnxml` and `appendices`. It finds 1149 tags and **1148 distinct basenames**. The set is identical to `population.json`: 0 names on either side only.
   - Resolution: `sources.py --json` (the sanctioned CLI) was run on the 25 sample names. **25 of 25 paths are identical** to the census.
   - Unresolved names: `sources.py` was also run on all 238 unresolved basenames plus their de-hashed stems (242 names). Only **1** resolves: `CNX_Chem_21_03_RadioDecay`, the stem both contested figures claim. The driver's `dehashStemClaims` (figure-run.js:518) refuses exactly that case, so the funnel count of 910 stands.
2. **Sample of 25 figures.**
   - 12 were chosen on purpose: the claims' own examples, plus ch13 and ch16.
   - 13 were chosen at random by `random.Random(20260913).shuffle` over sorted read-ok, non-bought names outside ch03/ch04, taking the first figure per chapter. The list is in `vcc/sample.json`.
   - Coverage: **15 chapters** (ch02, 07, 08, 09, 10, 11, 13, 14, 16, 17, 18, 19, 20, 21, appendices). 12 are EPS and 13 PDF; 18 would be composed and 7 not.
3. **Path.** I ran `figure-prepare.py` into `vcc/prep/<b>`. That goes staging → `extract.py` subprocess → `emit-blocks.py`, which is not census.py's direct `readlayer.read`. All 25 returned rc=0.
4. **My own detectors** (`vcc/mydetect.py`).
   - Written from the stated definitions: a char-weighted **mode** baseline instead of the median; my own italic regex over `meta.json` bases; my own multispace test; my own stacked-split rule.
   - Only the composer's units (`FT.group/merge_blocks/lines`) are shared. The claim is about what the composer draws, so those units have to be the same.
5. **A second parser** (`vcc/pdfium_cmp.py`, `pdfium_italic.py`). PDFium (pypdfium2), not pdfminer.
   - Size is `FontSize × |up vector|`.
   - Chars are attached to census blocks by position only.
   - Script test: a char next to a neighbour in content order, either smaller with a baseline offset over 0.5 pt, or the same size with an offset over 0.75 pt.
   - Controls:
     - HClsoln + FishLemon: 9 both, 0 disagreements.
     - The same-size branch fires on Nitrogen `ammonium (NH4|+|)`.
     - A first version that read `FontSize` alone missed 23 blocks. That wrong version is what proved the comparison can fail.
   - ⚠️ **PDFium collapses runs of consecutive spaces**. HClsoln's content stream holds `(\)          )Tj` (10 literal spaces, which confirms M2), but PDFium returns 1 space. PDFium is therefore **not used** for multispace.

## Results

### Sample of 25 (475 blocks, 190 send:true)

- Ordered `(key, send, arc)`: identical on 25 of 25 figures. `prepare.json.sendable` equals census `sendable` on 25 of 25, and composed matches on 25 of 25.
- My detectors against the census, per block, as [both, census-only, mine-only, neither]:

  | feature | both | census-only | mine-only | neither |
  |---|---:|---:|---:|---:|
  | script | 107 | 0 | 5 | 363 |
  | shift | 107 | 0 | 0 | 368 |
  | italic | 34 | 0 | 0 | 441 |
  | multispace | 1 | 0 | 0 | 474 |
  | stacked (best) | 31 | 0 | 8 | 436 |
  | **ANY** | **132** | **0** | **8** | **335** |

  - My 5 extra script flags are 0.5-pt threshold artefacts in ICETable2: `–3.39 × 10`, where an 11-pt `×`/`–` sits 0.5 pt above 9-pt digits.
  - My 8 extra stacked flags are ChnReact1 `0|1`/`1|0` nuclide prescript stacks. They are not splits under the census's definition, but they **are visibly damaged** (P2).
- PDFium script test against census `has_script|shift_any_075`: **108 both, 2 census-only, 1 PDFium-only, 364 neither.**
  - The 2 census-only blocks are real scripts my PDFium test missed: `Π solution` (space neighbour) and Carbon `10–10` (8.25-pt `–`).
  - The 1 PDFium-only block, CbcCltPckd `C|B|A`, is a false positive of my test on stacked letters.
  - On the 34 bought figures: 51 / 1 / 0 / 315.
  - **Null with control:** readlayer merges same-font, same-size characters shifted by less than 0.25 × size (`PROJ_TOL`, readlayer.py:98), so a same-size script under about 2.25 pt would be invisible to the census. PDFium, which does no such merge, found **0** such blocks in 59 figures, while its same-size branch demonstrably fires on Nitrogen.
- Italic by PDFium font name: 34 both, 0 disagreements. The FontDescriptor italic flag bit is unreliable, since EPS-staged fonts lack it (21 disagreements), so the name is the right criterion.

### Arithmetic re-tally from `1b-census.jsonl` (my own filter)

- Reproduced exactly: 910 read-ok, 829 text-bearing, 463 composed, 11,312 redrawn, 2,946 send.
- ANY: 1,749 blocks (369 send:true, 1,380 send:false) in 249 figures.
- `script_union`: 1,166 blocks in 217 figures. Italic: 901 blocks in 129 figures.
- Figure rows: `sendable`, `n_blocks` and `composed` are consistent with the block rows (0 mismatches).
- The 34 bought figures are the whole composed set of ch03 (15) + ch04 (19), which is consistent with the context.

### C4: ch13 and ch16

| ch | composed | redrawn | ANY | figs ANY | ANY excl. italic | figs | italic-only |
|---|---:|---:|---:|---:|---:|---:|---:|
| ch13 | 9 | 201 | 90 | 9 | 37 | 8 | 53 |
| ch16 | 6 | 62 | 8 | 2 | 3 | 1 | 5 |
| ch08 | 25 | 304 | 174 | 18 | 53 | 15 | **121** |

- Per-figure counts in my sample match the ch13 and ch16 tables exactly: Blood 4, ICETable2 15, Entropies 4, EntGraph 4.
- ICETable30's only "affected" blocks are italic.
- The headline "ch08 57%" is 70% italic-only.

### C5

- `NH4|+(aq)`: the split pair is `4`/`+`, with Δproj 7.00 against the task threshold 0.6 × 9 × 1.222 = 6.60. So the task rule misses it by construction: it measures sub-to-sup, not base-to-script.
- Nitrogen `ammonium (NH4|+|)`: every run is 9 pt, so the task rule's "smaller" clause is False.
- Nitrogen `nitrites`/`nitrates`: the scripts are 7 pt, but Δproj is 7.5 > 6.6.
- A raster crop of corresp (`vcc/ras/corresp_crop.png`) shows HSO₄⁻ and NH₄⁺ as real kerned pairs, so the best rule's extra hits are true positives.

### C6

- The raster (`vcc/ras/CNX_Chem_10_01_PentIso.png`) shows "boiling point: 36 °C" and friends.
- `pdftotext -layout` prints `36 8C`. PDFium returns `'8'` in MathematicalPi-One.
- `pdffonts`: `AITLIF+MathematicalPi-One Type 1C Custom … uni no`.
- The Amontons2 raster shows −100 and −50; poppler prints `2100` and `250`.
- My `blocks.json`: PentIso's 3 boiling-point blocks are send:true, and Amontons2's `2100`/`250` are send:false.

### C7

- `vcc/ras/rvosmosis40.png` is a letter-size "CNX *Chemistry* Art Dialogue Sheet" with the U-tube figure embedded.
- My prepare finds 13 sendable blocks: 8 are sheet chrome (`CNX Chemistry Art Dialogue Sheet`, `Page 1 of 1`, `Words & Numbers`, `Art Pass B|Revision 1`, `Pick up from this file`, the filename, the two notes) and **5 are genuine labels** (`Pressure|greater|than`, `Π solution`, `Pure solvent`, `Semipermeable|membrane`, `Solution`).
- Page-size census (second detector): `pdfinfo` over all 612 resolved PDFs and `%%BoundingBox` over all 298 EPS files finds **2** letter-size pages: rvosmosis and **CNX_Chem_18_07_N2O5** (P4).

### C8

- fontTools over **all 115 distinct characters** in the run text (including ASCII; 0 control characters): only U+23DE is missing from LiberationSans Regular and Bold. Control: `A` is present.
- Carbon, `compose --control` (`vcc/ras/carbon_cmp.png`): the source brace spans the two tick marks, while the composed brace is a small notdef box. The same crop shows `10⁻¹⁰` flattened to `10–10`.
- Coverage is measured over the **decoded** characters, so it cannot see C6's mis-decoding.

## New problems

- **P1: the ANY definition bundles italic, which inflates "damage".**
  - 577 of the 1,749 ANY blocks (33%) are italic-only.
  - Without italic, **1,172 blocks in 218 figures remain (258 send:true)**. 31 figures are affected by italic alone. (The 577 blocks sit in more figures than 31; ch08 alone has 121 of them.)
  - Measured on 59 figures (the 25 sample + the 34 bought; `prep/` duplicates `HClsoln` and `FishLemon` excluded): **15 of 41 italic blocks (37%)** have italics only on `×`, `–` or `+`, where slant is barely visible. That rate is a sample estimate, not measured corpus-wide.
  - The chapter ranking by share (ch08 57%, ch13 45%) is driven by the italic-only blocks, which are counted corpus-wide.
- **P2: re-leading of multi-line blocks is a visible damage class outside ANY.**
  - The composer lays lines at `sz0 × 1.222` from the block centre (compose.py:274-277), whatever the source spacing.
  - Composed, non-arc, multi-line blocks with a spacing deviation over 1.5 pt: **131**, of which **61 are not in ANY, in 26 figures**. Examples: periodic-table `La–|Lu` 8.6→10.4; Fission1/Fission2/ChnReact1 nuclide prescripts `1|0`, `0|1` 6.0→8.55; FuelCell `+|+` 20.6→16.0.
  - This is **measured corpus-wide, and visually MILD where I looked**. In the ChnReact1 `3 ¹₀n` block, the only damage is re-leading (`vcc/ras/chn_p2_zoom.png`, source left, control right, 3× zoom): the stack spreads by about 2.5 pt and still reads correctly.
  - ⚠️ The broken `+n⁰₁` in `chn_cmp.png` is **P3's** evidence, not P2's: `+` and `n` are joined by the arc clause, then `0|1` lands after them.
  - Cases with large deviations (≥ 5 pt, 46 blocks) were not looked at.
- **P3: geometric gap collapse is outside ANY.**
  - `figtext.group`'s arc clause joins two single characters up to 1.6 × size apart. The composer then `''.join`s them, erasing the gap even with **no whitespace characters** involved, so the multispace detector cannot see it.
  - 18 redrawn blocks in 6 composed figures have an in-line gap over 3 pt with no whitespace, all send:false and none in ANY: Fission1/2 and ChnReact1 `+n` (8.2 pt), substitu_img `21`/`23`/`34`, alklnm `12`/`34`, COandO2 `OC`/`OO`/`CO`.
  - Visually confirmed in ChnReact1 (`vcc/ras/chn_cmp.png`): `+ ⁰₁n` is drawn as `+n⁰₁`. The `+` at x=36.55 and `n` at x=50.91 are one block, and the nuclide stack between them is displaced.
- **P4: CNX_Chem_18_07_N2O5 resolves to an InDesign letter-size placement page.**
  - Creator: Adobe InDesign CS4. Its only sendable block is the caption **`CNX_Chem_18_07_N2O5.jpg`** (send:true, composed:true).
  - The driver would buy a filename and draw it as a label.
  - The census's dialogue-vocabulary search could not find it (it contains no dialogue text). A keyword search for filename or production text over all blocks finds only rvosmosis (7 blocks, the control) and N2O5.
- **P5: "composed" is an upper bound.** The census uses `sendable > 0`. `applyMappingPreflight` (figure-run.js:387-428), the drift guards and the basename-mismatch check can downgrade a `translated` figure to `failed-*` before compose. None of these changes which blocks flatten when a figure is composed.
- **P6: PDFium is an incapable instrument for whitespace.** It collapses the 10 literal spaces in HClsoln to 1. Any future multispace check through pypdfium2 would return a confident false zero.

## Files

- Sample and scripts: `vcc/sample.json`, `vcc/prep25.sh`, `vcc/mydetect.py`, `vcc/compare25.py` (→ `compare25.json`), `vcc/pdfium_chars.py`, `vcc/pdfium_cmp.py`, `vcc/pdfium_italic.py`.
- Outputs: `vcc/pdfium25.txt`, `vcc/pdfium34.txt`, `vcc/pdfium_italic25.txt`, `vcc/sources25.json`, `vcc/sources_unres.json`, `vcc/grep_images.txt`.
- Rasters: `vcc/ras/*.png`.
