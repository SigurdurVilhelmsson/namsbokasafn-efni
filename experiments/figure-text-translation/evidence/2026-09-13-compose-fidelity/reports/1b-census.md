# 1b: which Chemistry 2e figures carry formatting the composer destroys

**Scope.** Reader only, costs nothing. No compose run, no MT, nothing under the repo was modified. Measured 2026-09-13 over the **whole** driver population: 1148 of 1148 enumerated figures and 910 of 910 resolved figures. No sample was taken, so there is no chapter bias.

## Answer

The composer redraws every block of any figure that has at least one sendable block (`tools/lib/figure-classify.js:143`: `sendable > 0` → `translated`). So what matters is what sits in **composed figures**, not only in `send:true` blocks.

- **249 of the 463 figures that would be composed (54%)** have at least one block with sub/superscript, italic, collapsed multi-space or a stacked split.
- **1,749 of the 11,312 blocks that would be redrawn (15.5%)** are affected.
  - **Only 369 of those 1,749 are `send:true`.** The other **1,380 (79%) are `send:false` English.** The composer re-lays that English for no translation gain and flattens it in the process.
  - **187 of the 249 affected figures** have at least one affected `send:false` block. Only 62 figures are affected in `send:true` blocks alone.
- The largest class is **flattened sub/superscripts**, `script_union`: 1,569 blocks, of which 1,166 are redrawn, in **217 composed figures**. Next is **lost italics**: 1,104 blocks, 901 redrawn, in 129 composed figures.
- Multi-space collapse (19 blocks, 9 composed figures) and stacked splits (59 blocks by the best rule, 25 composed figures) are **rare but concentrated**:
  - multi-space: HClsoln, Blood, Oshapes, spin, Relation, HessCO2, Co60Decay, CrystalSys, emspectrum;
  - stacked splits: the ch14 conjugate-pair and ICE figures, and ch21 nuclide notation.
- **Formula-heavy chapters are the worst**, by share of redrawn blocks affected (corrected definition):
  - ch08 57%, ch13 45%, ch17 46%, ch14 35%, ch15 24%, ch12 20%, ch06 16%, ch19 13%, ch20 12%.
  - For comparison, ch03 (already bought) is 4% and ch04 (already bought) is 24%. The 34 bought figures show 54 affected blocks across 18 of 34 figures on this same instrument, and those are the figures the user found visibly damaged.
- **The candidate next chapters:**
  - **ch13**: all 9 composed figures are affected. 90 of 201 redrawn blocks (45%): 37 script, 58 italic, 1 multi-space (Blood, a 22-space run), 2 stacked. Only 19 of the 90 are `send:true`. **Every composed ch13 figure has at least one block that the composer flattens** (compose.py:147/:233/:252/:279). This census measures exposure to those code paths; whether the result looks damaged is for the tracks that inspect rendered output to judge.
  - **ch16**: 2 of 6 composed figures are affected. 8 of 62 redrawn blocks (13%): 3 script, 5 italic, of which 1 is `send:true`. Italic `S` appears in the four `ΔS > 0/< 0` labels (Entropies), plus `T1`/`T2` subscripts (EntGraph). ch16 is also thin: only 8 of its 16 figures resolve.
- **Glyph coverage is not the problem.** Every non-ASCII character in the corpus is in LiberationSans Regular and Bold except one: `⏞` U+23DE (CNX_Chem_10_05_Carbon, a `send:false` block in a composed figure). The fonts are almost entirely LiberationSans (14,446 blocks) plus STIXGeneral (883 blocks).
- **Side findings, measured and outside the formatting question** (details at the end):
  1. **MathematicalPi-One is mis-decoded, which destroys content, not just formatting.** It is verified against a raster. `°` is read as `8` and `−` as `2`:
     - CNX_Chem_10_01_PentIso `boiling point: 36 8C` ×3 are **`send:true`, so they would be bought as "8C"**;
     - CNX_Chem_09_02_Amontons2 `2100` and `250` are really −100 and −50.
  2. The resolved artwork for **CNX_Chem_11_04_rvosmosis is an "Art Dialogue Sheet", not the figure.** It is 612×792 with production notes. 13 blocks are sendable, including `Pick up from this file` and `CNX Chemistry Art Dialogue Sheet`.

## Instrument

- **Population.**
  - The figure list comes from `tools/lib/figure-enumerate.cjs` `enumerateChapterImages`, called per chapter directory. Of the 23 directories, 22 have images; ch00 has none. That gives **1148 basenames**, which **exactly matches** the `<image src>` set of `text-coverage-census.py`: 0 only-in-census, 0 only-in-enum. So the two population definitions agree.
  - Resolution copies `tools/figure-run.js`:
    - `sources.resolve` with `supersededArtwork`;
    - de-hash fallback used for lookup only, and only when the stem is uncontested within the chapter;
    - a collision backstop that nulls artwork claimed by two basenames.
  - Result: **910 resolved** (892 by basename, 18 de-hashed) and 238 unresolved (2 superseded-refused, 2 contested: RadioDecay-d92b/-e619).
  - Cross-check: all 34 bought figures resolve to the same path as `prep/bought-sources.json` (0 mismatches).
- **Reader and grouping.** These copy `emit-blocks.py` literally:
  - `readlayer.read(path)`, which stages .eps/.ai itself with the same `GS_ARGV`;
  - `FT.merge_blocks(FT.group(runs))`;
  - `block_lines`, `block_key`;
  - `joined = key if arc else ' '.join(lines)`;
  - `FT.sendable(b, joined, meta['fonts'])`.
- **Same-population control (passed).** For all 34 bought figures, the census's ordered (key, send, arc) sequence equals `prep/<b>/blocks.json`: 34 of 34 figures and 367 of 367 blocks. Both sides have 183 `send:true` block instances.
  - The context's "169 sent" counts unique keys per figure. 169 unique versus 183 instances is a multiplicity difference, not a disagreement.
- **Run-to-run stability.** There were two full reads. The second added detectors. Their ordered (key, send) sequences are identical on 910 of 910 figures.
- **Funnel:** 1148 enumerated → 910 resolved → 910 read OK (0 errors, 0 timeouts; 298 .eps, 612 .pdf) → **829 text-bearing** (81 read empty) → **463 composed**.
  - Blocks: 14,962 in text-bearing figures. Of those, 11,312 are in composed figures (2,946 `send:true`, 8,366 `send:false` but redrawn), and 3,650 are in non-composed figures and are never redrawn.
  - Sanity check: the older pdftotext census found 817 text-bearing of 895 resolved.

### Definitions and thresholds

- **`has_script`** (the task's definition): within an `FT.lines` line, a non-blank run whose size is under 0.9 × the line's max size **and** whose `proj` sits more than 0.5 pt from the line base. The line base is the median `proj` of the full-size runs.
  - Robust to the threshold: 1,553 blocks at >0.75 pt and 1,550 at >1.0 pt, against 1,554 at >0.5 pt.
  - The near-threshold false positives are about 4. Example: `A + B` in RCooDgm, where an 11-pt `+` is raised 0.5 pt.
  - The typical real offset is 1.37–4 pt.
- **`shift_any_075`** is added because the task definition misses **same-size scripts**. It is a baseline shift over 0.75 pt at any size, arcs excluded.
  - Found on CNX_Chem_18_07_Nitrogen `ammonium (NH4|+|)`, where every run is 9 pt.
  - Only 24 blocks carry the shift without `has_script`. 9 of those are borderline 0.5-pt artifacts (`<90°`, molgeom), which the 0.75 threshold removes.
- **`stacked_split`** (the task's rule): the pair that `lines()` split on is closer than 0.6 × block max size × 1.222, and one side of the pair is a smaller run.
  - **This rule undercounts.** It misses cases where the subscript and superscript are separated by ≥6.6 pt (`NH4|+(aq)`: 7 pt), and cases at the same size.
  - Two alternatives were therefore measured:
    - `stacked_split_baseline`: the dominant baselines of the two lines are within 0.5 × size. Found 49 blocks.
    - **`stacked_split_best`**: the next line continues **rightward** from where the previous line ended (gap between −0.6 × max and +2.5 pt), at less than 0.9 of a normal leading, **and** either a smaller run is present or the baseline returns. Found 59 blocks.
  - Cross-tab of (task, baseline, best): 23 blocks all three, 24 baseline+best, 8 task+best, 2 task+baseline only (the two arcs `10n3` and `HC2O4–`, which the best rule excludes as arcs), and 4 best only (Nitrogen ×3, plus EDTA `CH2|CH2`, a likely false positive in a non-composed figure).
  - An earlier geometric version without the "smaller run or return" clause fired on `H|H`, `C|C`, `+|+`, `1|0` and `1|2`. Those are real two-row objects, not splits. That is why the clause was added.
  - Independent check: a regex over the keys for a charge-only line (`^[0-9]*[+–−-]$`) gave 68 candidates. 41 are flagged by task∪baseline. All 3 Nitrogen misses are caught by `best`. The remaining unflagged candidates are real stacked lists (Oxistatra `2+|3+|4+`, FuelCell `+|+`, refinery bullet lines), not splits.
- **`has_italic`**: the font base matches `/italic|oblique/i`. There is no synthetic oblique in the corpus: a sheared text matrix over 2° occurs on 0 of 14,962 blocks.
  - The skew detector was proven able to fire on a synthetic run (`tm=[9,0,1.8,9]` → 11.3°; the upright control gave False).
  - A looser `-It`/`Ital`/`Slant` name pattern found 0 additional fonts.
  - Italic faces seen: LiberationSans-Italic (657 blocks), STIXGeneral-Italic (338), LiberationSans-BoldItalic (108), STIXGeneral-BoldItalic (48), LiquidCrystal-BoldItalic (2).
- **`has_multispace`**: 2 or more consecutive spaces (or no-break spaces) inside a line's joined text, with the maximum run recorded.
- **Fill kinds are an instrument fact, not a corpus finding.** `readlayer._fill` converts DeviceRGB and DeviceGray **into** `('cmyk',…)`, so the original colour space cannot be recovered from runs. What is reported is cmyk on 14,949 blocks and None on 8.
  - Unreliable fills: 1 figure has `color_warnings` (CNX_Chem_09_04_KMT2). 3 have `Separation` spaces: 21_06_Penetrate, 14_07_titration2, 18_07_Nitrogen.
- **Positive controls, all passed:**
  - HClsoln `HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)`: has_script True (`2`/`3` −3.0 pt, `+` +4.0 pt), has_italic True (`LiberationSans-Italic`), has_multispace True (10 spaces).
  - FishLemon `NH3|+CH2CH2CH2CH2NH2`: stacked_split True under all three rules, 2 lines → 1.
  - non_text_glyphs fires on the corpus (Δ×48 …) and on a synthetic `ΔH`.
  - The coverage check can return False (`⏞`).
  - symbol-font detection fires on synthetic Symbol `Dm` and on real MathematicalPi-One.
- **Composer mechanisms these features map to**, from reading `compose.py`:
  - one size per block, `sz0 = b[0]['size']` (compose.py:233), applied to every wrapped line;
  - `''.join` of the runs in a line (:147) and `para.split()` rejoined with one space (:252);
  - font and fill taken from **the first run of each line** (`fr = ls[j][0]`, :279);
  - `setfont` only toggles bold and never slant (:54-58);
  - svgout embeds only Regular and Bold (svgout.py:16-19).
  - The per-feature table below also counts the related losses: mixed size, two fills in one line (68 blocks), bold and regular in one line (11), and formulas read as single-glyph arcs (119).

## Funnel

- enumerated (driver `enumerateChapterImages`, 23 chapter dirs incl. ch00 + appendices): **1148**
- resolved (sources.py + supersededArtwork, de-hash lookup-only, contest + collision guards): **910** (via basename 892, de-hashed 18); unresolved 238 (of which superseded-refused 2, contested 2)
- read OK: **910** (status counts {'read-ok': 910, 'unresolved': 238}; ext {'.eps': 298, '.pdf': 612})
- text-bearing (outcome 'reads' and >=1 block): **829** (81 read empty)
- would be COMPOSED (figure sendable > 0, `figure-classify.js:143`): **463**
- blocks: 14962 in 829 text-bearing figures; 11312 in the 463 composed figures (send:true 2946, send:false-but-redrawn 8366); 3650 in non-composed figures (never redrawn)
- run-to-run reconstruction self-check: 1 blocks where detectors recomputed from stored runs disagree with the in-read flags

## Per feature

Columns: figures = text-bearing figures with >=1 such block (of 829) / of those composed (of 463). Blocks: all (of 14962) / send:true (of 2946) / send:false in a composed figure (of 8366) / in a NON-composed figure (of 3650, never redrawn).

| feature | figs | figs composed | blocks | send:true | send:false redrawn | not redrawn |
|---|---:|---:|---:|---:|---:|---:|
| ANY of script|italic|multispace|stacked (task definitions) | 365 | 248 | 2285 | 368 | 1377 | 540 |
| ANY, corrected (script_union|italic|multispace) | 366 | 249 | 2289 | 369 | 1380 | 540 |
| has_script (size<0.9 of line max AND baseline offset >0.5pt) | 313 | 216 | 1554 | 251 | 908 | 395 |
| script_union (has_script | shift>0.75pt | stacked_split | stacked_best) | 315 | 217 | 1569 | 253 | 913 | 403 |
| baseline shift >0.75pt at ANY size (non-arc) | 304 | 214 | 1472 | 253 | 828 | 391 |
| mixed size within a line (compose draws the block at b[0] size) | 334 | 237 | 1722 | 306 | 1012 | 404 |
| block has a run larger than its FIRST run (compose draws all at b[0] size; mostly an 11pt STIX symbol in 9pt text, real shrink e.g. '35Br') | 53 | 52 | 170 | 49 | 118 | 3 |
| has_italic (font base /italic|oblique/i) | 168 | 129 | 1104 | 185 | 716 | 203 |
| synthetic oblique (sheared text matrix >2deg) | 0 | 0 | 0 | 0 | 0 | 0 |
| has_bold (compose BOLD rule) | 215 | 179 | 2690 | 460 | 1906 | 324 |
| bold and regular mixed in ONE line (compose: first run wins) | 5 | 5 | 11 | 8 | 3 | 0 |
| has_multispace (2+ spaces inside a line; wrap() collapses) | 10 | 9 | 19 | 11 | 7 | 1 |
| stacked_split (task rule: boundary pair, smaller run, <0.6*max*1.222) | 18 | 15 | 33 | 7 | 23 | 3 |
| stacked_split_baseline (dominant baselines within 0.5*size) | 21 | 17 | 49 | 15 | 30 | 4 |
| stacked_split_best (continues rightward, <0.9 leading, + smaller run or baseline return) | 29 | 25 | 59 | 21 | 34 | 4 |
| two fills in ONE line (compose: first run colour wins) | 35 | 23 | 68 | 20 | 26 | 22 |
| two font resources in ONE line | 174 | 142 | 910 | 241 | 505 | 164 |
| rotated (|rot|>0.5deg) | 93 | 88 | 158 | 121 | 21 | 16 |
| arc (figtext.is_arc) | 62 | 51 | 164 | 21 | 117 | 26 |
| arc with size variation (formula read as single-glyph runs) | 48 | 39 | 119 | 0 | 107 | 12 |
| undecoded text (held) | 1 | 1 | 2 | 0 | 2 | 0 |

## Per chapter

enum/res/text/comp = figures enumerated / resolved / text-bearing / composed. Block columns are for COMPOSED figures only (what the composer redraws). ANY = any_corrected; spec = any4_spec. figsANY = composed figures carrying >=1 ANY block.

| ch | enum | res | text | comp | blocks redrawn | send:true | ANY (T/F) | spec | script_union | italic | multispace | stacked_best | figsANY |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| ch01 | 36 | 36 | 32 | 24 | 787 | 283 | 15 (2/13) | 15 | 15 | 3 | 0 | 0 | 4 |
| ch02 | 47 | 46 | 42 | 21 | 856 | 226 | 70 (3/67) | 69 | 70 | 0 | 0 | 0 | 8 |
| ch03 | 41 | 41 | 30 | 15 | 167 | 68 | 7 (7/0) | 7 | 7 | 0 | 0 | 0 | 3 |
| ch04 | 30 | 30 | 25 | 19 | 200 | 115 | 47 (33/14) | 47 | 45 | 7 | 2 | 1 | 15 |
| ch05 | 24 | 24 | 20 | 16 | 176 | 101 | 25 (7/18) | 25 | 8 | 24 | 1 | 0 | 6 |
| ch06 | 51 | 51 | 44 | 23 | 1587 | 112 | 259 (27/232) | 259 | 152 | 221 | 11 | 0 | 17 |
| ch07 | 159 | 73 | 73 | 18 | 377 | 65 | 17 (10/7) | 17 | 12 | 6 | 0 | 1 | 6 |
| ch08 | 72 | 72 | 65 | 25 | 304 | 97 | 174 (14/160) | 174 | 53 | 170 | 0 | 0 | 18 |
| ch09 | 49 | 19 | 18 | 16 | 233 | 89 | 35 (20/15) | 35 | 22 | 22 | 0 | 0 | 8 |
| ch10 | 82 | 53 | 50 | 40 | 297 | 189 | 60 (14/46) | 60 | 30 | 38 | 1 | 0 | 17 |
| ch11 | 46 | 41 | 32 | 21 | 230 | 117 | 47 (8/39) | 47 | 45 | 6 | 0 | 2 | 8 |
| ch12 | 42 | 39 | 33 | 30 | 513 | 108 | 105 (16/89) | 105 | 51 | 90 | 0 | 0 | 16 |
| ch13 | 14 | 12 | 9 | 9 | 201 | 62 | 90 (19/71) | 90 | 37 | 58 | 1 | 2 | 9 |
| ch14 | 36 | 23 | 23 | 22 | 716 | 238 | 251 (69/182) | 251 | 192 | 86 | 0 | 24 | 20 |
| ch15 | 32 | 23 | 22 | 15 | 291 | 45 | 70 (18/52) | 70 | 12 | 66 | 0 | 2 | 8 |
| ch16 | 16 | 8 | 8 | 6 | 62 | 30 | 8 (1/7) | 8 | 3 | 5 | 0 | 0 | 2 |
| ch17 | 20 | 17 | 17 | 17 | 221 | 104 | 101 (19/82) | 98 | 80 | 36 | 1 | 3 | 15 |
| ch18 | 92 | 72 | 65 | 21 | 703 | 192 | 17 (8/9) | 17 | 17 | 6 | 0 | 3 | 6 |
| ch19 | 51 | 36 | 34 | 15 | 740 | 171 | 95 (26/69) | 95 | 80 | 32 | 0 | 0 | 11 |
| ch20 | 134 | 133 | 126 | 53 | 1388 | 225 | 172 (34/138) | 172 | 161 | 16 | 0 | 0 | 35 |
| ch21 | 38 | 25 | 25 | 25 | 622 | 152 | 58 (4/54) | 58 | 54 | 3 | 1 | 14 | 7 |
| appendices | 36 | 36 | 36 | 12 | 641 | 157 | 26 (10/16) | 26 | 20 | 6 | 0 | 4 | 10 |

### Top 10 chapters by redrawn blocks with has_script|has_italic|has_multispace|stacked_split (task definition, composed figures)

| rank | ch | spec blocks | of redrawn | share | send:true among them | composed figs | figs with >=1 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | ch06 | 259 | 1587 | 16% | 27 | 23 | 17 |
| 2 | ch14 | 251 | 716 | 35% | 69 | 22 | 20 |
| 3 | ch08 | 174 | 304 | 57% | 14 | 25 | 18 |
| 4 | ch20 | 172 | 1388 | 12% | 34 | 53 | 35 |
| 5 | ch12 | 105 | 513 | 20% | 16 | 30 | 16 |
| 6 | ch17 | 98 | 221 | 44% | 18 | 17 | 15 |
| 7 | ch19 | 95 | 740 | 13% | 26 | 15 | 11 |
| 8 | ch13 | 90 | 201 | 45% | 19 | 9 | 9 |
| 9 | ch15 | 70 | 291 | 24% | 18 | 15 | 8 |
| 10 | ch02 | 69 | 856 | 8% | 3 | 21 | 7 |

## Font families

| family (normalised) | blocks | blocks in composed figs | figures |
|---|---:|---:|---:|
| LiberationSans | 14446 | 10891 | 825 |
| STIXGeneral | 883 | 739 | 193 |
| MathematicalPi | 5 | 5 | 2 |
| Helvetica | 3 | 3 | 2 |
| LiquidCrystal | 2 | 2 | 1 |
| Courier | 1 | 1 | 1 |
| MyriadPro | 1 | 1 | 1 |
| STIXSizeFiveSym | 1 | 1 | 1 |

Raw base names (subset prefix removed), blocks: `LiberationSans` 11700, `LiberationSans-Bold` 2600, `LiberationSans-Italic` 657, `STIXGeneral-Regular` 468, `STIXGeneral-Italic` 338, `LiberationSans-BoldItalic` 108, `STIXGeneral-Bold` 58, `STIXGeneral-BoldItalic` 48, `MathematicalPi-One` 5, `Helvetica` 3, `LiquidCrystal-BoldItalic` 2, `LiquidCrystal-Bold` 2, `STIXGeneral` 1, `Courier` 1, `MyriadPro-Regular` 1, `STIXSizeFiveSym-Regular` 1

## Non-ASCII glyphs and Liberation Sans coverage

| char | U+ | non-Latin (task set) | blocks | redrawn blocks | send:true | figures | Regular cmap | Bold cmap | example figures |
|---|---|---|---:|---:|---:|---:|---|---|---|
| – | 2013 |  | 594 | 472 | 56 | 193 | True | True | CNX_Chem_00_AA_PeriodicPU_img, CNX_Chem_00_EE_LiqWatAbso, CNX_Chem_00_HH_1shydrazoi_img |
| ° | 00B0 |  | 97 | 84 | 22 | 31 | True | True | CNX_Chem_00_EE_Density_img, CNX_Chem_00_EE_Vapor_img, CNX_Chem_00_EE_WaterpKw_img |
| × | 00D7 |  | 68 | 65 | 10 | 18 | True | True | CNX_Chem_02_02_Millikan, CNX_Chem_03_01_alsulfatemass_img, CNX_Chem_03_01_aspirin |
| Δ | 0394 | yes | 48 | 45 | 16 | 19 | True | True | CNX_Chem_05_03_HessCO2, CNX_Chem_05_03_Systemqw, CNX_Chem_07_05_CH4bond_img |
| δ | 03B4 | yes | 41 | 24 | 0 | 5 | True | True | CNX_Chem_07_06_Dipolfield, CNX_Chem_07_06_SH2NH3_img, CNX_Chem_10_01_DipDip |
| σ | 03C3 | yes | 40 | 25 | 13 | 13 | True | True | CNX_Chem_08_01_N2LewStru_img, CNX_Chem_08_01_O2bonds_img, CNX_Chem_08_01_bondtype_img |
| π | 03C0 | yes | 30 | 18 | 10 | 11 | True | True | CNX_Chem_08_01_N2LewStru_img, CNX_Chem_08_01_O2bonds_img, CNX_Chem_08_01_bondtype_img |
| α | 03B1 | yes | 20 | 19 | 12 | 7 | True | True | CNX_Chem_02_02_GoldFoil3, CNX_Chem_02_02_Rutherford, CNX_Chem_10_06_CrystalSys |
| λ | 03BB | yes | 14 | 14 | 6 | 6 | True | True | CNX_Chem_06_01_Blackbody, CNX_Chem_06_01_Frequency, CNX_Chem_06_01_emspectrum |
| ′ | 2032 |  | 14 | 14 | 0 | 2 | True | True | CNX_Chem_20_02_FunctGroup_img, CNX_Chem_20_04_DNA |
| − | 2212 | yes | 11 | 11 | 6 | 8 | True | True | CNX_Chem_12_01_RRateIll, CNX_Chem_17_05_AlkalineBat, CNX_Chem_17_05_DryCell |
| ‒ | 2012 |  | 11 | 1 | 0 | 2 | True | True | CNX_Chem_12_01_NH3Decomp, CNX_Chem_12_05_ArrhPlot |
| γ | 03B3 | yes | 11 | 10 | 3 | 4 | True | True | CNX_Chem_10_06_CrystalSys, CNX_Chem_10_06_GenUnitCll, CNX_Chem_21_03_Radiation |
| β | 03B2 | yes | 11 | 11 | 4 | 4 | True | True | CNX_Chem_10_06_CrystalSys, CNX_Chem_21_03_DecayS, CNX_Chem_21_03_Radiation |
| ’ | 2019 |  | 8 | 8 | 8 | 6 | True | True | CNX_Chem_03_02_copperMoles_img-a962, CNX_Chem_03_02_sacch_img-3278, CNX_Chem_04_03_flowchart |
| ≠ | 2260 | yes | 8 | 8 | 0 | 1 | True | True | CNX_Chem_10_06_CrystalSys |
| ν | 03BD | yes | 6 | 6 | 5 | 4 | True | True | CNX_Chem_06_01_Ephoton, CNX_Chem_06_01_Frequency, CNX_Chem_06_01_emspectrum |
| µ | 00B5 |  | 5 | 5 | 1 | 3 | True | True | CNX_Chem_00_EE_LiqWatAbso, CNX_Chem_06_01_Blackbody, CNX_Chem_06_01_emspectrum |
| “ | 201C |  | 5 | 5 | 5 | 3 | True | True | CNX_Chem_01_04_CylGold, CNX_Chem_01_04_CylRebar, CNX_Chem_17_05_NiCd |
| ” | 201D |  | 5 | 5 | 5 | 3 | True | True | CNX_Chem_01_04_CylGold, CNX_Chem_01_04_CylRebar, CNX_Chem_17_05_NiCd |
| θ | 03B8 | yes | 4 | 4 | 0 | 1 | True | True | CNX_Chem_10_06_XRyDiff1 |
| ρ | 03C1 | yes | 3 | 3 | 3 | 1 | True | True | CNX_Chem_09_01_Manometer |
| ∞ | 221E | yes | 3 | 3 | 0 | 3 | True | True | CNX_Chem_06_02_BohrArrows, CNX_Chem_06_02_Hlevels, CNX_Chem_13_02_mixtures |
| Å | 00C5 |  | 2 | 0 | 0 | 1 | True | True | CNX_Chem_06_01_2spectra |
| — | 2014 |  | 1 | 1 | 1 | 1 | True | True | CNX_Chem_08_01_Morse-3a8e |
| → | 2192 | yes | 1 | 1 | 0 | 1 | True | True | CNX_Chem_13_02_mixtures |
| Π | 03A0 | yes | 1 | 1 | 1 | 1 | True | True | CNX_Chem_11_04_rvosmosis |
| ⏞ | 23DE | yes | 1 | 1 | 0 | 1 | False | False | CNX_Chem_10_05_Carbon |
| ß | 00DF |  | 1 | 0 | 0 | 1 | True | True | CNX_Chem_10_06_GenUnitCll |

## ch13 in detail

enumerated 14, resolved 12, text-bearing 9, composed 9; redrawn blocks 201 (send:true 62); ANY 90 (send:true 19, send:false 71); spec 90

| figure | blocks | sendable | composed | script_union | italic | multispace | stacked | examples (key) |
|---|---:|---:|---|---:|---:|---:|---:|---|
| CNX_Chem_13_00_Blood | 4 | 1 | True | 4 | 0 | 1 | 1 | 'CO2'; 'CO2'; 'CO2 + H2O              H2CO3                      HCO3|–' |
| CNX_Chem_13_01_equilibrium | 20 | 8 | True | 6 | 2 | 0 | 0 | 'NO2'; 'N2O4'; 'kf[N2O4]' |
| CNX_Chem_13_01_dynamic | 0 | 0 | False | 0 | 0 | 0 | 0 |  |
| CNX_Chem_13_01_bromine | 0 | 0 | False | 0 | 0 | 0 | 0 |  |
| CNX_Chem_13_02_quotient | 22 | 12 | True | 6 | 2 | 0 | 0 | '[SO3]'; '[SO2]'; '[SO3]' |
| CNX_Chem_13_02_mixtures | 65 | 10 | True | 3 | 13 | 0 | 0 | '[H2O]'; '[CO2]'; '[H2]' |
| CNX_Chem_13_01_SuperSat | 0 | 0 | False | 0 | 0 | 0 | 0 |  |
| CNX_Chem_13_03_catalyst | - | - | unresolved | | | | | |
| CNX_Chem_13_03_factory | 19 | 17 | True | 5 | 1 | 0 | 0 | 'NH3 and|unreacted|N2, H2'; 'NH3 and|unreacted|N2, H2'; 'NH3(l)' |
| CNX_Chem_13_04_ICETable1_img | - | - | unresolved | | | | | |
| CNX_Chem_13_04_ICETable2_img | 24 | 3 | True | 3 | 14 | 0 | 1 | 'Initial concentration (M)'; 'Change (M) '; 'Equilibrium concentration (M) ' |
| CNX_Chem_13_04_ICETable3_img | 16 | 5 | True | 3 | 10 | 0 | 0 | '–x '; '1.00 – x'; '+x' |
| CNX_Chem_13_04_ICETable30_img | 20 | 4 | True | 0 | 15 | 0 | 0 | 'Initial concentration (M)'; 'Change (M) '; 'Equilibrium concentration (M)' |
| CNX_Chem_13_05_Butane_img | 11 | 2 | True | 7 | 1 | 0 | 0 | 'CH3'; 'H2'; 'H2' |

## ch16 in detail

enumerated 16, resolved 8, text-bearing 8, composed 6; redrawn blocks 62 (send:true 30); ANY 8 (send:true 1, send:false 7); spec 8

| figure | blocks | sendable | composed | script_union | italic | multispace | stacked | examples (key) |
|---|---:|---:|---|---:|---:|---:|---:|---|
| CNX_Chem_16_00_Geyser | - | - | unresolved | | | | | |
| CNX_Chem_16_01_decayrates | 23 | 2 | True | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_01_carbon | 2 | 2 | True | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_02_Gas | 2 | 2 | True | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_02_Temperature | - | - | unresolved | | | | | |
| CNX_Chem_16_02_Process | - | - | unresolved | | | | | |
| CNX_Chem_16_03_Carnot | - | - | unresolved | | | | | |
| CNX_Chem_16_02_Microstates | 5 | 0 | False | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_03_Energy | 60 | 0 | False | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_03_Matter_img | - | - | unresolved | | | | | |
| CNX_Chem_16_03_Entropies | 8 | 4 | True | 0 | 4 | 0 | 0 | 'ΔS > 0'; 'ΔS < 0'; 'ΔS > 0' |
| CNX_Chem_16_02_EntGraph | 14 | 9 | True | 3 | 1 | 0 | 0 | 'Entropy (S)'; 'T1'; 'T2' |
| CNX_Chem_16_04_Scenarios | 13 | 11 | True | 0 | 0 | 0 | 0 |  |
| CNX_Chem_16_04_TempSpont-d7b9 | - | - | unresolved | | | | | |
| CNX_Chem_16_04_Gibbs-1aa8 | - | - | unresolved | | | | | |
| CNX_Chem_16_04_aceticdimr_img | - | - | unresolved | | | | | |

## The 34 bought figures, same instrument

blocks 367; any_corrected 54 (send:true 40); script_union 52; italic 7; multispace 2; stacked 1; figures with >=1 any: 18 of 34

## Lists

### Multispace blocks (all)

- ch13 CNX_Chem_13_00_Blood 'CO2 + H2O              H2CO3                      HCO3|–' run=22 send=True composed=True
- ch06 CNX_Chem_06_01_emspectrum 'PET  scan' run=2 send=True composed=True
- ch04 CNX_Chem_04_02_HClsoln 'HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)' run=10 send=True composed=True
- ch04 CNX_Chem_04_02_HClsoln 'HCl(g)          HCl(aq)' run=10 send=True composed=True
- ch17 CNX_Chem_17_04_Relation 'E°cell = (    )ln K' run=4 send=True composed=True
- ch06 CNX_Chem_06_03_Oshapes 'p0   pz' run=3 send=False composed=True
- ch06 CNX_Chem_06_03_Oshapes 'p–1   px' run=3 send=False composed=True
- ch06 CNX_Chem_06_03_Oshapes 'p1   py' run=3 send=False composed=True
- ch06 CNX_Chem_06_03_Oshapes 'd–2   dxy' run=3 send=True composed=True
- ch06 CNX_Chem_06_03_Oshapes 'd–1   dxz' run=3 send=True composed=True
- ch06 CNX_Chem_06_03_Oshapes 'd1   dyz' run=3 send=True composed=True
- ch06 CNX_Chem_06_03_Oshapes 'd0   dz2' run=3 send=False composed=True
- ch06 CNX_Chem_06_03_Oshapes 'd2   dx2–y2' run=3 send=False composed=True
- ch12 CNX_Chem_12_05_ArrhPlot 'Δ (   )' run=3 send=False composed=False
- ch06 CNX_Chem_06_03_spin 'Spin +   ,|spin-up' run=3 send=True composed=True
- ch06 CNX_Chem_06_03_spin 'Spin –   ,|spin-down' run=3 send=True composed=True
- ch05 CNX_Chem_05_03_HessCO2 'CO(g) +   O2(g)' run=3 send=False composed=True
- ch21 CNX_Chem_21_05_Co60Decay '1.3325 MeV  γ' run=2 send=True composed=True
- ch10 CNX_Chem_10_06_CrystalSys 'α =  γ = 90°; β ≠ 90°' run=2 send=False composed=True

### Stacked-split blocks (union of task rule and best rule)

- ch13 CNX_Chem_13_00_Blood 'CO2 + H2O              H2CO3                      HCO3|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_01_conjugate_img 'NH4|+(aq)' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_01_conjugate_img 'NH4|+ (conjugate acid)' task=False best=True baseline=True send=True composed=True
- ch17 CNX_Chem_17_02_Galvanicel 'NO3|–' task=True best=True baseline=True send=False composed=True
- ch17 CNX_Chem_17_02_Galvanicel 'NO3|–' task=True best=True baseline=True send=False composed=True
- ch17 CNX_Chem_17_02_Galvanicel 'NO3|–' task=True best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_01_NH3_img 'C5NH6|+' task=False best=True baseline=True send=False composed=True
- ch15 CNX_Chem_15_01_ICETable2_img 'Hg2|2+ ' task=True best=True baseline=False send=False composed=True
- ch04 CNX_Chem_14_03_FishLemon 'NH3|+CH2CH2CH2CH2NH2' task=True best=True baseline=True send=False composed=True
- appendices CNX_Chem_00_HH_chemform1_img 'H2AsO4|–' task=True best=True baseline=True send=True composed=True
- ch13 CNX_Chem_13_04_ICETable2_img 'I3|–' task=True best=True baseline=False send=False composed=True
- ch14 CNX_Chem_14_03_strengths 'HCO3|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_strengths 'NH4|+' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_strengths 'ClO2|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'HSO4|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'NH4|+' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'HCO3|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'ClO4|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'HSO4|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'NO3|–' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'H2PO4|–' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'NO2|–' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'CH3CO2|–' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'HCO3|–' task=False best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_03_corresp 'NH2|–' task=False best=True baseline=True send=False composed=True
- ch14 CNX_Chem_14_03_corresp 'CH3|–' task=False best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_Fission1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_Fission1 '10n3' task=True best=False baseline=True send=False composed=True
- appendices CNX_Chem_00_HH_chemform3_img 'HCO3|–' task=True best=True baseline=True send=True composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch21 CNX_Chem_21_04_ChnReact1 '1|0n' task=True best=True baseline=True send=False composed=True
- ch15 CNX_Chem_15_02_ICETable1_img 'Ag(NH3)2|+' task=True best=True baseline=False send=False composed=True
- ch14 CNX_Chem_14_03_ICETable3_img 'HCO2|–' task=True best=True baseline=False send=True composed=True
- appendices CNX_Chem_00_HH_chemform4_img 'HSO4|–' task=True best=True baseline=True send=True composed=True
- ch19 CNX_Chem_19_02_oct '3 NO3|–' task=False best=True baseline=True send=False composed=False
- ch14 CNX_Chem_14_03_ICETable5_img 'SO4|2–' task=True best=True baseline=False send=False composed=True
- ch14 CNX_Chem_14_03_ICETable5_img 'HSO4|–' task=True best=True baseline=False send=True composed=True
- appendices CNX_Chem_00_HH_chemform5_img 'HC2O4–' task=True best=False baseline=True send=False composed=False
- appendices CNX_Chem_00_HH_chemform6_img 'H2PO4|–' task=True best=True baseline=True send=False composed=False
- ch14 CNX_Chem_14_05_ICETable1_img 'HCO3|–' task=True best=True baseline=False send=True composed=True
- appendices CNX_Chem_00_HH_chemform8_img 'H2PO3|–' task=True best=True baseline=True send=False composed=False
- appendices CNX_Chem_00_HH_chemform9_img 'HSO3|–' task=True best=True baseline=True send=True composed=True
- ch14 CNX_Chem_14_06_ICETable16_img 'CH3CO2|–' task=True best=True baseline=False send=False composed=True
- ch19 CNX_Chem_19_02_EDTA 'CH2|CH2' task=False best=True baseline=False send=False composed=False
- ch14 CNX_Chem_14_06_buffer '[CH3CO2H] is 11% of [CH3CO2|–]' task=False best=True baseline=True send=False composed=True
- ch18 CNX_Chem_18_07_Nitrogen 'ammonium (NH4|+|)' task=False best=True baseline=False send=True composed=True
- ch18 CNX_Chem_18_07_Nitrogen 'nitrites (NO2|–' task=False best=True baseline=False send=True composed=True
- ch18 CNX_Chem_18_07_Nitrogen 'nitrates (NO3|–' task=False best=True baseline=False send=True composed=True
- ch11 CNX_Chem_11_05_soap 'CO2|–Na+' task=False best=True baseline=True send=False composed=True
- ch11 CNX_Chem_11_05_detrg 'OSO3|–Na+' task=False best=True baseline=True send=True composed=True
- ch07 CNX_Chem_07_04_Ques11ans_img 'For NO2|–' task=False best=True baseline=True send=True composed=True

### Formula-bearing blocks that are BOUGHT (script_union and send:true), per chapter

appendices 9, ch01 2, ch02 3, ch03 7, ch04 31, ch05 5, ch06 14, ch07 5, ch08 10, ch09 15, ch10 10, ch11 7, ch12 10, ch13 6, ch14 51, ch17 19, ch18 8, ch19 18, ch20 23

### Symbol / non-Liberation fonts (all blocks)

- ch17 CNX_Chem_17_03_GalvanCu '+ 0.337 V' fonts=['LiquidCrystal'] send=False composed=True
- ch17 CNX_Chem_17_03_GalvanCu '+ 0.337 V' fonts=['LiquidCrystal'] send=False composed=True
- ch10 CNX_Chem_10_01_PentIso 'n-pentane|boiling point: 36 8C' fonts=['LiberationSans', 'MathematicalPi'] send=True composed=True
- ch10 CNX_Chem_10_01_PentIso 'isopentane|boiling point: 27 8C' fonts=['LiberationSans', 'MathematicalPi'] send=True composed=True
- ch10 CNX_Chem_10_01_PentIso 'neopentane|boiling point: 9.5 8C' fonts=['LiberationSans', 'MathematicalPi'] send=True composed=True
- ch09 CNX_Chem_09_02_Amontons2 '2100' fonts=['LiberationSans', 'MathematicalPi'] send=False composed=True
- ch09 CNX_Chem_09_02_Amontons2 '250' fonts=['LiberationSans', 'MathematicalPi'] send=False composed=True
- ch11 CNX_Chem_11_04_rvosmosis 'Pick up from this file' fonts=['Courier'] send=True composed=True
- ch11 CNX_Chem_11_04_rvosmosis '- Changes have been made here, pick up from this file' fonts=['Helvetica'] send=True composed=True
- ch06 CNX_Chem_06_05_Firstiongr 'N' fonts=['MyriadPro'] send=False composed=True
- ch10 CNX_Chem_10_05_MolSolids 'carbon dioxide' fonts=['Helvetica'] send=True composed=True
- ch10 CNX_Chem_10_05_MolSolids 'iodine' fonts=['Helvetica'] send=True composed=True
- ch10 CNX_Chem_10_05_Carbon '⏞' fonts=['STIXSizeFiveSym'] send=False composed=True

### Fill kinds as the reader reports them (instrument fact: readlayer._fill normalises every space to cmyk or None)

kinds (blocks): {('cmyk',): 14949, (): 5, ('None',): 8}
classes (blocks): {('black',): 11765, ('colour',): 2829, ('white',): 220, ('gray',): 88, ('black', 'colour'): 41, ('None',): 8, (): 5, ('black', 'gray'): 3, ('black', 'white'): 2, ('colour', 'white'): 1}
figures with color_warnings>0: 1 ['CNX_Chem_09_04_KMT2']; with unknown_colorspaces: 3 [('CNX_Chem_21_06_Penetrate', {'Separation:1': 2}), ('CNX_Chem_14_07_titration2', {'Separation:1': 44}), ('CNX_Chem_18_07_Nitrogen', {'Separation:1': 45})]

## Side findings (measured, outside the formatting question)

1. **MathematicalPi-One is mis-decoded, and this is CONTENT loss.**
   - The reader returns `8` for the degree sign and `2` for the minus sign.
   - Verified by rasterising the staged source with pdftocairo at 200 dpi: the images show `boiling point: 36 °C` and `−100` / `−50`. Crops are in `scratchpad/1b/side/pentiso_bottom.png` and `amontons_left.png`.
   - Affected blocks:
     - CNX_Chem_10_01_PentIso (ch10): `n-pentane|boiling point: 36 8C`, `isopentane|boiling point: 27 8C`, `neopentane|boiling point: 9.5 8C`. All three are **`send:true`**.
     - CNX_Chem_09_02_Amontons2 (ch09): `2100`, `250`, both `send:false` in a composed figure.
   - Whether sent or not, the composer redraws them in LiberationSans, so a reader would see "36 8C" and "2100".
   - `readlayer._looks_undecoded` cannot see this: the output is valid ASCII.
   - Exposure is 5 blocks in 2 figures, among the 13 blocks in non-Liberation/STIX fonts listed above.
2. **CNX_Chem_11_04_rvosmosis resolves to an "Art Dialogue Sheet".**
   - Source: `Myndir/chemistry-2e/base/Ch_11/Source_File/CNX_Chem_11_04_rvosmosis.pdf`. Its MediaBox is 612×792 and its ArtBox is 16,158–601,783. It carries production notes in Courier and Helvetica, and header text.
   - 13 blocks are sendable, including `CNX Chemistry Art Dialogue Sheet`, `Page 1 of 1` and `Pick up from this file`.
   - A key search for dialogue-sheet vocabulary across all 910 resolved figures finds only this one. The known figure is the positive control. This is a text search, so a dialogue sheet with no live text would not be found.

## Files

- `findings/1b-census.jsonl` holds the raw rows.
  - `row:"figure"`: one row for each of the 1148 enumerated figures, with status, resolution, `sendable` and `composed`.
  - `row:"block"`: one row for each of the 14,962 blocks, with every feature and the stored runs `[text,size,along,proj,adv,rot,fontkey]`.
- `scratchpad/1b/`:
  - `census.py`: the reader census, resumable;
  - `resolve.py`, `enum.cjs`: population;
  - `summarize.py`: the tables;
  - `control_cmp.py` and `control34b.jsonl`: the same-population control;
  - `figs2.jsonl`: per-figure, nested;
  - `figs.jsonl`: the first full read, used for the stability check.
