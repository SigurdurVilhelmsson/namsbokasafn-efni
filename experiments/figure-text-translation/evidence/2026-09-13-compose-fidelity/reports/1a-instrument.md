# 1a — Per-block, text-isolated pixel fidelity instrument (and what it says about the current composer)

Date: 2026-09-13. Scope: the 34 bought figures (ch03 + ch04 + CNX_Chem_14_03_FishLemon), **control mode only**
(`compose.py --control`, i.e. the figure's own English re-injected, no MT). 0 ISK spent. Repo untouched
(`git status --porcelain` empty at the end).

Everything below was measured by the scripts in `scratchpad/tools/` on the prepared dirs in `scratchpad/prep/`.
Primary ink definition: `ink(img) = L(img) < 128 & ~(L(artwork) < 128)`. Primary composer image: the unmodified
`compose.py --control --svg` output `control.png` (cairo raster), not the browser render of `control.svg`.

---

## 1. Controls (read this first)

| # | Control | Expected | Measured | Denominator |
|---|---|---|---|---|
| R0 | `src.png` (pdftocairo -r 200 of `<prep>/<b>.pdf`) same size as `artwork.png` | equal | equal (asserted) | 34/34 figures |
| R1 | stripping text never ADDS dark ink: `dark(art) & ~dark(src)` | 0 px | 0 px | 34/34 figures |
| R2 | block census == `blocks.json` keys, in order | match | match | 34/34 figures, 367 blocks |
| R3 | tagged copy of compose.py (records block index per drawn item) draws the same picture | byte-identical control.png | byte-identical | 34/34 |
| R4 | source text ink not attributable to any block (>60 px from every run box) | ~0 | **212 px / 221,486 (0.10%), all in CNX_Chem_04_05_combustion** — recoloured arrowheads, see §4.1 | 34 figures |
| (i) | ours := src.png | every block iou1 = 1 | **367/367 = 1.0** in all 4 ink modes (dark128, dark200, diff40, diff96); ours-only = src-only = 0 | 367 blocks |
| (ii) | ours := artwork.png (no text) | every block iou1 = 0, nB = 0 | **367/367 = 0.0, nB = 0** in all 4 ink modes | 367 blocks |
| (iii) | CEILING: run-exact redraw (`runexact_png.py`) — every run at its own x, y, size, rot, fill, face from `meta.fonts[].base` | high, defines noise | see table below | 313 "clean" blocks* |
| (iv-a) | PLANTED 2 px shift of ONE block (re-rendered, same rasterizer as ceiling) | flagged | normal (vertical) **313/313 (100%)**; along baseline **+2 px 301/313 (96.2%), −2 px 245/313 (78.3%)** (paired rule, hint default) | 313 clean blocks, each shifted separately |
| (iv-b) | PLANTED flatten of one block's sub/superscripts (every run at block max size on its line's main baseline) | flagged | **47/47 clean + 5/5 non-clean = 52/52 (100%)**, also 100% under the absolute band | every has_script block |
| A | nearest-box attribution vs EXACT per-block ownership (each block's items rendered alone) | agree | ceiling: 0 px misattributed of 234,766 ours / 220,797 src px. current composer: **100 px of 244,657 (0.041%)**, all in CNX_Chem_04_03_ethene_img (long line's ink landing nearer two `H` boxes) | 34 figures |

\* clean = not STIX/symbol font (45 blocks), not rotated (4), not arc (0), ≥20 src ink px (366 of 367), no src ink that no drawn text explains (4 non-symfont blocks, all combustion). 313 of 367.

**Ceiling (iii) noise, clean blocks, n = 313**

| metric | hint none (poppler-like) | hint default (= compose.py's cairo settings) |
|---|---|---|
| block iou1 (1-px-dilated IoU): median / p1 / min | 0.968 / 0.871 / 0.768 | 0.904 / 0.647 / **0.631** |
| run_iou1_min (worst RUN in block): min | 0.768 | 0.581 |
| run_cno_max (worst run centroid offset along the up-normal): max | 1.095 px | 1.095 px |
| run_cal_max (worst run centroid offset along the baseline): max | 2.37 px | 4.31 px |
| w_ratio / h_ratio (ours/src ink extent) | 0.980–1.136 / 0.961–1.091 | 0.980–1.136 / 0.913–1.091 |
| signed block c_al median | +0.10 px | **+0.26 px** (rightward bias from hint-metric rounding) |
| split-half false-positive rate of an absolute min/max band | 21/313 (6.7%) | 11/313 (3.5%) |

**Why hint default matters.** compose.py never sets font options, so its PNG uses cairo's default hinting with
hint-metric rounding. That alone drops a *faithful* redraw of a long plain label to iou1 0.63 (`Putrescinium ion`,
FishLemon: 0.981 unhinted → 0.631 hinted, visually identical — checked by eye). So **block-level IoU against an
absolute band cannot separate hint drift from real damage on long runs**; the matched ceiling (hint default) and
the per-run centroid metrics are what make the instrument usable.

**Resolution (paired rule, hint default, clean blocks):** 2 px perpendicular to the baseline: 100%. 1 px perpendicular:
30.7%. Along the baseline: 1 px 71.6%, 2 px 96.2% (+) / 78.3% (−), 3 px 99.0%. The ± asymmetry is the ceiling's
signed +0.26 px rightward bias partly cancelling a leftward shift. **State the instrument as seeing ≥2 px vertical
and ≥3 px horizontal reliably, and flattened scripts always.** On NON-clean blocks (mostly STIX `+ × =`) shifts are
NOT reliably seen (8–17% for ±2 px) — only gross defects are (flatten 5/5).

---

## 2. The instrument (design, file:line-free summary)

- `tools/fidelity.py` — `Figure(basename)`: renders/loads src.png, loads artwork.png, rebuilds blocks exactly as
  compose.py does (`figtext.merge_blocks(figtext.group(runs))`, `blockkey.block_key`), classes from
  `blocks.json.send` + the sidecar, features from runs.
  - **Text ink** = what text added over the artwork. Outside text, src and ours are pixel-identical to the artwork by
    construction (same rasterizer / composited onto artwork.png), controls (i)/(ii) and R1 confirm.
  - **Threshold choice:** all fills in the 34 figures are near-black (5 distinct CMYK fills; lightest → L≈21/255), so
    L<128 catches every glyph core; dark200/diff40/diff96 were run as sensitivity (§3.4). Text over dark artwork is
    invisible to dark-mode ink: max fraction of a block's text box lying on dark artwork = **0.039**; 0/367 blocks
    >5%. The 575 px counted as `src_hidden` (4 blocks) are all combustion's recoloured arrowheads, not hidden text.
  - **Regions:** each run is a rotated rectangle (baseline origin, along 0..adv, normal −0.22..+0.80 size). Every ink
    pixel (src side and ours side separately) goes to the NEAREST block box (0 inside; tie-break by run mid-line),
    capped at max(60 px, 2.4·size·S); beyond the cap it is "unattributed" and reported. Nearest-box instead of a
    fixed dilation because stacked labels sit ~50 px apart. Validated against exact labels (control A).
    Unattributed ours ink for the current composer: **0 px** on all 34.
  - **Scores per block:** iou0/iou1/iou2 (0/1/2-px dilation), p1/r1, ours-only/src-only px, centroid offset along and
    normal to the baseline, ink-extent ratios, **and per-RUN metrics** (ink re-attributed to the block's nearest run:
    `run_iou1_min`, `run_cno_max`, `run_cal_max`). The per-run layer was added after the first planted run: a
    block-level score is diluted by length (block iou1 caught 0% of hint-default flattens; run metrics catch 100%).
  - `run_cno_max`/`run_cal_max` = **999** is a sentinel: a source run with ≥10 ink px received ZERO of our ink
    (moved beyond attribution to that run, or not drawn). 7 blocks carry it (§3.3).
- `tools/runexact_png.py` — the ceiling renderer. Face check: fontconfig resolves `Liberation Sans` slant/weight to
  the four TTFs in /usr/share/fonts/truetype/liberation; advances equal fontTools hmtx to 4 d.p. STIX has no font on
  this box → drawn with Liberation Sans (45 blocks, see limitations). `--fit-adv` spreads a run's position-derived
  `adv` error over its gaps (30 of 661 runs had >0.05 pt error; max 3.29 pt, flowchart).
- `tools/planted.py` (5,976 planted renders), `tools/addon_nofit.py` (second faithful ceiling: per-run show_text, no
  advance fitting, hint default), `tools/run_all.py`, `tools/analyze.py`, `tools/compose_tagged.py`,
  `tools/compose_batch.sh`, `tools/blockview.py` (src / ceiling / control crops).

### Damage verdicts used

1. **Absolute band** (clean blocks only): any metric outside the min/max of the hint-default ceiling over clean
   blocks. Expected false positives ≈ 3.5% (split-half).
2. **Paired** (all 367, primary): composer worse than **both** faithful hint-default redraws (fit-adv and no-fit) by
   `Δ run_iou1_min ≥ 0.17` or `Δ run_cno_max ≥ 1.5 px`. Thresholds = p5 of the planted 2 px effect (Δ run_iou1_min p5
   0.167–0.182; Δ run_cno p5 1.40 for 2 px up). Empirical FP check: **structurally plain blocks** (no script, italic,
   multispace, symbol font, rotation or edge space): single-line 2/196 flagged and both are real collisions
   (CNX_Chem_04_03_ethene_img `H` ×2, overprinted by the long line); multi-line **0/62**.
3. **Gross** (subset of paired): at least as bad as the MILDEST planted flatten: `cur run_iou1_min ≤ 0.35` or
   `Δ run_cno_max ≥ 2.3 px`. Fires on 0.6–1.9% of planted 2 px shifts, 99.7% of 3 px vertical shifts, 100% of flattens.

---

## 3. Results — the current composer (control mode) over 34 figures

### 3.1 Denominators (correction to the brief)

By **drawn instance** (what the composer draws): **184 never-sent, 176 sent-translated, 7 sent-identity = 367**;
0 sent-missing. The brief's "198 never sent / 162 translated" counted sent blocks as **unique sidecar keys** and
subtracted from 367 instances: 14 translated keys are drawn twice (e.g. flowchart `Molar mass` ×2 rotated ±56°,
rxn2 `Reactant`/`Coefficient`/`Product` ×2). So English drawn "for no gain" is **191/367** instances (184 + 7), not
205. By unique key: 105 never-sent, 162 translated, 7 identity (274 keys).

### 3.2 Damage beyond the ceiling's noise

| group | absolute band (clean) | **paired** | **gross** |
|---|---|---|---|
| ALL | 72/313 clean (23.0%; ~11 expected FP) | **56/367 (15.3%)** | **55/367 (15.0%)** |
| cls never-sent | — | 16/184 (8.7%) | 16/184 |
| cls sent-translated (drawn in English here) | — | 35/176 (19.9%) | 34/176 |
| cls sent-identity | — | 5/7 (71.4%) | 5/7 |
| has_script | — | **52/52 (100%)** | **52/52 (100%)** |
| has_italic | — | 6/7 | 6/7 |
| has_multispace | — | 2/2 | 2/2 |
| stacked_split | — | 1/1 | 1/1 |
| has_symfont (STIX) | — | 1/45 (unjudgeable, see below) | 1/45 |
| has_bold | — | 0/26 | 0/26 |
| rotated | — | 0/4 (uncontrolled null: rotated blocks are outside "clean"; planted shifts on non-clean blocks detected 8–17%) | 0/4 |
| structurally plain, 1 line | — | 2/196 (both real collisions) | 2/196 |
| structurally plain, multi-line | — | 0/62 | 0/62 |
| a line with leading/trailing space, no script | — | 1/7 | 0/7 |

Figures with ≥1 gross block: **18 of 34**.

**has_script 52/52 is a saturated rate — it is a category, not a sample.** compose.py builds each line as
`''.join(r['text'] for r in l)` and draws it with ONE `setfont(fr, sz)` / `show_text` at the line's first run
(`experiments/figure-text-translation/compose.py:147`, `:279-290`), so every script run in every block is redrawn at
base size on the base baseline; the planted flatten (52/52 detected) proves the instrument sees exactly that shape.
Of the 52: 34 sent-translated, 14 never-sent, 4 sent-identity. The 4 paired-flagged non-script blocks are:
HClsoln `HCl(g)          HCl(aq)` (multispace collapse, M2), ethene_img `H` ×2 (overprinted by the long line
`required to react with H2O to produce 9.55 g of`, whose ink lands on them — exact-label control A found the same
100 px), moleratio2_img `Stoichiometric |factor` (edge space, §4.2).

**Italic alone is not separately attested.** The one italic-only block (HClsoln `HCl(g)`) has run_iou1_min 0.771
vs faithful 0.964/0.906 → Δ 0.135 < 0.17, not flagged. Liberation Italic and Regular share advances, so the loss is a
slant, below this instrument's resolution. The code fact (setfont never sets a slant, M1) stands on its own.

**STIX symbol blocks (45: `+`, `×`, `=`) are unjudgeable, not damaged:** cur median iou1 0.296 vs ceiling 0.370 —
both draw Liberation Sans for a STIX glyph; Liberation's `+` sits ~2.3–2.7 px higher than STIX's (run_cno_max
2.3–2.8 in both). That is a font gap any Liberation-only redraw has, and it is visible (FishLemon crop).

### 3.3 Worst 15 blocks (by current run_iou1_min, then block iou1)

| figure | # | key | class | cur iou1 | cur worst run (iou1) | cur run_cno px | faithful (hint default) iou1 / runmin |
|---|---|---|---|---|---|---|---|
| CNX_Chem_04_03_etheneBr_img | 2 | `with an excess of Br2.` | sent-translated | 0.033 | `2` (0.00) | 999 | 0.683 / 0.668 |
| CNX_Chem_03_02_sacch_img-3278 | 4 | `Multiply by\|Avogadro’s\|number (mol–1)` | sent-translated | 0.062 | `–1` (0.00) | 999 | 0.847 / 0.716 |
| CNX_Chem_03_02_copperMoles_img-a962 | 4 | `Multiply by\|Avogadro’s\|number (mol–1)` | sent-translated | 0.064 | `–1` (0.00) | 999 | 0.826 / 0.679 |
| CNX_Chem_03_02_glycine_img-7c96 | 0 | `Moles of\|C2H5O2N (mol)` | sent-translated | 0.099 | `2` (0.00) | 999 | 0.885 / 0.794 |
| CNX_Chem_14_03_FishLemon | 3 | `NH3\|+CH2CH2CH2CH2NH2` | never-sent | 0.117 | `+` (0.00) | 999 | 0.938 / 0.903 |
| CNX_Chem_04_02_HClsoln | 3 | `HCl(g)          HCl(aq)` | sent-identity | 0.205 | `)` (0.00) | 999 | 0.925 / 0.862 |
| CNX_Chem_04_02_HClsoln | 1 | `HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)` | sent-identity | 0.228 | `) ` (0.00) | 999 | 0.917 / 0.341 (STIX) |
| CNX_Chem_04_01_basehyd_img | 19 | `O–` | never-sent | 0.491 | `–` (0.00) | 9.5 | 0.969 / 0.964 |
| CNX_Chem_04_02_HClsoln | 7 | `Cl–(aq)` | never-sent | 0.508 | `–` (0.00) | 9.0 | 0.945 / 0.925 |
| CNX_Chem_14_03_FishLemon | 1 | `CH3COO–` | sent-identity | 0.536 | `–` (0.00) | 9.0 | 0.961 / 0.934 |
| CNX_Chem_04_03_ethene_img | 0 | `required to react with H2O to produce 9.55 g of` | sent-translated | 0.041 | `required to react with H` (0.02) | 15.4 | 0.846 / 0.817 |
| CNX_Chem_04_02_HClsoln | 5 | `H3O+(aq)` | never-sent | 0.407 | `+` (0.06) | 9.3 | 0.967 / 0.925 |
| CNX_Chem_04_01_basehyd_img | 10 | `Na+` | never-sent | 0.457 | `+` (0.08) | 9.3 | 0.987 / 0.983 |
| CNX_Chem_04_05_combustion | 1 | `CO2, H2O, O2,\|and other gases` | sent-translated | 0.577 | `,` (0.09) | 8.6 | 0.901 / 0.857 |
| CNX_Chem_04_05_combustion | 6 | `O2` | never-sent | 0.292 | `2` (0.11) | 4.2 | 0.530 / 0.286 (arrow-contaminated) |

The 999-sentinel blocks are the whole-line relayouts where the run's ink moved entirely away (collapse, re-centre,
re-wrap), matching M2/M3. ethene_img #0: its worst run's centroid sits 15.4 px off the source along the normal (h_ratio 2.05: its ink now spans two baselines).

### 3.4 Sensitivity to the ink definition (block iou1 only)

| mode | clean-block faithful iou1 floor | clean cur below floor | paired Δiou1 ≥ 0.18 |
|---|---|---|---|
| dark, L<128 (primary) | 0.631 | 46/313 | 52/367 |
| dark, L<200 | 0.682 | 40/313 | 46/367 |
| diff > 40 | 0.717 | 50/313 | 39/367 |
| diff > 96 | 0.679 | 52/313 | 46/367 |

Counts move by ±7 blocks across modes; controls (i)/(ii) are exact in every mode. Only iou1 was stored per mode —
the run-level verdicts were computed in the primary mode only.

### 3.5 Per figure

| figure | blocks | sent-translated | sent-identity | never-sent | paired | gross | has_script |
|---|---|---|---|---|---|---|---|
| CNX_Chem_03_01_alsulfatemass_img | 24 | 5 | 0 | 19 | 0 | 0 | 0 |
| CNX_Chem_03_01_aspirin | 24 | 5 | 0 | 19 | 0 | 0 | 0 |
| CNX_Chem_03_01_brain-ec0b | 3 | 1 | 0 | 2 | 0 | 0 | 0 |
| CNX_Chem_03_01_chloroform | 24 | 5 | 0 | 19 | 0 | 0 | 0 |
| CNX_Chem_03_01_exocytosis-88f6 | 7 | 5 | 0 | 2 | 0 | 0 | 0 |
| CNX_Chem_03_01_glycinemass_img | 30 | 5 | 0 | 25 | 0 | 0 | 0 |
| CNX_Chem_03_01_saltMass | 18 | 5 | 0 | 13 | 0 | 0 | 0 |
| CNX_Chem_03_02_argon_img-9025 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_03_02_copperMoles_img-a962 | 5 | 5 | 0 | 0 | 1 | 1 | 1 |
| CNX_Chem_03_02_glycine_img-7c96 | 3 | 3 | 0 | 0 | 2 | 2 | 2 |
| CNX_Chem_03_02_potassium_img-f1d1 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_03_02_sacch_img-3278 | 5 | 5 | 0 | 0 | 4 | 4 | 4 |
| CNX_Chem_03_02_vitC_img-e537 | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_03_03_empform | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_03_05_Example2_img | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_04_01_basehyd_img | 26 | 0 | 1 | 25 | 2 | 2 | 2 |
| CNX_Chem_04_01_rxn2 | 16 | 8 | 0 | 8 | 4 | 4 | 4 |
| CNX_Chem_04_01_rxn3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_04_02_HClsoln | 9 | 0 | 3 | 6 | 6 | 6 | 5 |
| CNX_Chem_04_03_etheneBr_img | 17 | 3 | 0 | 14 | 1 | 1 | 1 |
| CNX_Chem_04_03_ethene_img | 18 | 2 | 0 | 16 | 3 | 3 | 1 |
| CNX_Chem_04_03_flowchart | 19 | 19 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_04_03_map2_img | 7 | 7 | 0 | 0 | 2 | 2 | 2 |
| CNX_Chem_04_03_map3_img | 7 | 7 | 0 | 0 | 4 | 4 | 4 |
| CNX_Chem_04_03_moleratio1_img | 3 | 3 | 0 | 0 | 1 | 1 | 1 |
| CNX_Chem_04_03_moleratio2_img | 5 | 5 | 0 | 0 | 4 | 3 | 3 |
| CNX_Chem_04_04_GreenChem | 10 | 0 | 1 | 9 | 2 | 2 | 2 |
| CNX_Chem_04_04_limiting | 4 | 4 | 0 | 0 | 2 | 2 | 2 |
| CNX_Chem_04_04_sandwich | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_04_05_combmap_img | 15 | 15 | 0 | 0 | 4 | 4 | 4 |
| CNX_Chem_04_05_combustion | 7 | 6 | 0 | 1 | 5 | 5 | 5 |
| CNX_Chem_04_05_map7_img | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| CNX_Chem_04_05_map8_img | 9 | 9 | 0 | 0 | 5 | 5 | 5 |
| CNX_Chem_14_03_FishLemon | 12 | 4 | 2 | 6 | 4 | 4 | 4 |

The three all-identity figures: HClsoln 6/9 gross, basehyd_img 2/26 gross, GreenChem 2/10 gross — recomposing them
bought no text and damaged 10 blocks.

---

## 4. Side findings (out of scope for 1a; logged so they are not lost)

### 4.1 strip-text recoloured non-text artwork in CNX_Chem_04_05_combustion (reader-visible)

The 7 black arrowheads in the source are **teal/blue** in `artwork.png` (1,371 diff>40 px / 212 dark px not
explained by any run, confined to y 151–176 px, x 102–1001 px). The published
`books/efnafraedi-2e/media/CNX_Chem_04_05_combustion_IS.svg`, rendered in Chromium via render-check.mjs, shows the
same blue arrowheads. Consistent with a fill-colour operator removed together with a text object (hypothesis, not
checked in strip-text.py). R1 (`dark(art) & ~dark(src)`) could not see it because blue is still "dark"; only the
diff-ink / unattributed control did. 1 of 34 figures.

### 4.2 Edge-space lines are re-centred by half a space

A line whose source text ends in a space (`Stoichiometric |factor`) is anchored with its width INCLUDING the space
(compose.py:235-238) and drawn from `para.split()` WITHOUT it (compose.py:252). Measured on
CNX_Chem_04_03_moleratio1_img: `Stoichiometric` drawn at x 88.518 pt vs source 87.491 (+1.03 pt ≈ 2.85 px; the
naive prediction for a centred line is +1.25 pt, the anchor being the mean of both line centres). Left-aligned
edge-space blocks are unaffected (map7 `Volume of |NaOH` drawn at identical x). 19 blocks have an edge-space line;
12 of them also carry scripts. Paired-flagged without scripts: 1/7 (moleratio2_img; the same key in moleratio1_img, measured above, stays under the conservative threshold). Same root as M2 (whitespace discarded by
`wrap`), different shape.

### 4.3 Multi-line leading is recomputed

compose.py re-leads multi-line blocks at `sz0*1.222`; flowchart `Number|of|particles|of A` lines move 0.5 pt
(1.4 px). Below the instrument's reliable resolution; not flagged by the paired rule (0/62 plain multi-line blocks).

---

## 5. Limitations

1. **Rasterizer.** Scored `control.png` (cairo toy text, default hinting). Readers see `control.svg` in a browser
   via `<img>`: same draw ITEMS, different rasterizer. The browser bridge (render src-as-SVG, artwork.svg,
   control.svg and a run-exact SVG in Chromium, then score) was designed but NOT run; the only browser render done
   was the published combustion SVG (§4.1).
2. **Hinting noise dominates block IoU on long runs** (faithful 0.98 → 0.63). Verdicts rely on the matched
   hint-default ceilings and per-run centroid metrics; along-baseline resolution is ≥3 px, 1 px vertical 30.7%.
3. **Control mode only.** Translated output has no ground-truth raster, so IoU against the English source is
   meaningless there; only structure-preserving checks on kept runs would transfer.
4. **STIX symbol font absent** → 45 blocks unjudgeable; planted shifts on non-clean blocks are detected 8–17%.
5. **Italic loss is below resolution** (1 italic-only block, Δ 0.135).
6. **The ceiling is run-level, not glyph-level**: intra-run TJ kerning is not in runs.json; residual along-baseline
   error up to 2.37 px (hint none).
7. **Paired-rule FP is estimated, not proven.** The only empirical FP control is the 258 structurally plain blocks (2/196 single-line + 0/62 multi-line flagged, both flags explained as real collisions). The fit-vs-nofit comparison of two faithful redraws tripped a ONE-sided version of the rule on 18/367 blocks — that is WHY the verdict requires being worse than both; with the worst-of-two reference that null is 0 by construction, so it is not evidence.
8. Attribution cap 60 px: ink moved farther would be "unattributed" — measured 0 px for the current composer, but a
   translated (re-wrapped) figure could exceed it.
9. The combustion arrow contamination lowers ceiling and current alike for 4 blocks there (`O2`, `O2 and |other
   gases`, the two absorber labels); they are excluded from "clean".

## 6. Files

- Per-block rows: `scratchpad/findings/1a-blocks.jsonl` (367 rows: basename, block, key, cls, features, clean,
  score_current, score_ceiling (hint default, fit), score_ceiling_nofit, score_ceiling_nohint, flags, paired_visible,
  gross, sensitivity_iou1). 999 = sentinel (source run with ≥10 ink px got none of ours).
- Raw: `scratchpad/fid/blockscores.jsonl`, `fid/planted.jsonl` (5,976), `fid/nofit.jsonl`, `fid/figures.jsonl`,
  `fid/summary.json`, `fid/analyze.out`, `fid/compose-batch.jsonl`; crops in `fid/views/`.
- Composer outputs: `scratchpad/fid/<b>/orig/` (control.png/svg/compose-report.json) and copies of control.png,
  control.svg, compose-report.json, items-control.json in each `scratchpad/prep/<b>/`.
- Tools: `scratchpad/tools/{fidelity.py, runexact_png.py, planted.py, addon_nofit.py, run_all.py, analyze.py,
  compose_tagged.py, compose_batch.sh, blockview.py, stack.py}`. Python deps numpy/scipy installed to
  `scratchpad/pylibs-np` (`PYTHONPATH=$SP/pylibs-np:$EXP/pylibs`).
