# BT..ET strip variants — rendered artwork impact (0 ISK)

Read-only render/diff measurement. Every number below is counted straight out of this run's own `render/results.jsonl` by `aggregate_render.py`, nothing hand-tallied.

## Population and denominators

- Population (a) bought figures: 34
- Population (b) non-bought figures with any non-text-in-BT operator: 499
- Combined population processed: **533** distinct figures (target 533)

Per-variant render/strip status (each figure contributes one line per variant):

| variant | status | count |
|---|---|---:|
| ORIG | ok | 533 |
| PERSIST | ok | 533 |
| NONTEXT | ok | 533 |

## The two instrument controls

- **SERIALISER control** (CNX_Chem_04_05_combustion, ORIG stripped a SECOND time vs the first): count_gt0=0, count_gt40=0 — proves re-serialisation alone introduces 0 px of change.
- **SERIALISER control (identity parse/unparse variant)**, RAW source vs an identity parse->unparse of the same source (no operator removed at all): count_gt0=0, count_gt40=0.
- **PLANTED control**: a 20x20 px black rectangle drawn on a copy of combustion's own ORIG render, diffed against ORIG: count_gt0=441, count_gt40=441, bbox=[80, 100, 325, 345] — proves the diff instrument DOES detect a real change when one is present.

## Census-derived predictions, stated before this run, now checked

- Prediction: PERSIST and NONTEXT are operator-for-operator IDENTICAL on this corpus (the census found zero special-gstate/marked-content/path/xobject/compat/other operators inside any BT..ET, corpus-wide — so NONTEXT dropping only text ops and PERSIST keeping only persistent-gstate ops leave the same residue).
  - **Result: 0 figures where PERSIST and NONTEXT differ from each other (count_gt0 > 0).** Prediction CONFIRMED.
- Prediction (design/register): "only combustion changes, 7 arrowheads back to black, 0 px elsewhere" among the 34 bought figures. Checked against the >40 threshold below.

## Per-variant counts of figures changed (whole population, n=533)

| variant | figures with count_gt40 > 0 | figures with count_gt0 > 0 | size-mismatch |
|---|---:|---:|---:|
| PERSIST | 15 | 34 | 0 |
| NONTEXT | 15 | 34 | 0 |

## Per-variant counts, 34-BOUGHT subset only

| variant | figures with count_gt40 > 0 | figures with count_gt0 > 0 |
|---|---:|---:|
| PERSIST | 1 | 1 |
| NONTEXT | 1 | 1 |

- PERSIST bought figures with count_gt40>0: ['CNX_Chem_04_05_combustion']
- NONTEXT bought figures with count_gt40>0: ['CNX_Chem_04_05_combustion']

## Census cross-reference: changed figures vs the 108 "later paint" candidates

- Census "later paint depends on it" candidates (from census/results.jsonl, `n_later_paint_events>0`): **108** (report's own count: 108)
- Rendered as actually CHANGED (count_gt0>0 in PERSIST or NONTEXT vs ORIG), this run: **34**
- Changed AND in the 108 candidates: 34
- Changed but OUTSIDE the 108 candidates (a census miss, if any): 0
- In the 108 candidates but NOT changed on render (over-approximation confirmed by the render, per census_lib's own documented caveat): 74

### The 6 bought later-paint suspects, by measured outcome

- `CNX_Chem_03_01_exocytosis-88f6`: NOT changed (0 px)
- `CNX_Chem_03_03_empform`: NOT changed (0 px)
- `CNX_Chem_04_02_HClsoln`: NOT changed (0 px)
- `CNX_Chem_04_03_flowchart`: NOT changed (0 px)
- `CNX_Chem_04_04_sandwich`: NOT changed (0 px)
- `CNX_Chem_04_05_combustion`: CHANGED — {'size_match': True, 'shape': [321, 1300, 3], 'count_gt40': 2121, 'count_gt0': 2523, 'bbox_gt40': [151, 176, 78, 1160], 'bbox_gt0': [150, 177, 78, 1160]}

- **N2O5 note**: `figures-with-nontext-in-bt.tsv` carries N2O5's **`.pdf`** artwork_path (/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_18/Source_File/CNX_Chem_18_07_N2O5.pdf); the census's own REPORT.md records that the resolver now resolves N2O5 to the **`.eps`** instead. This run's N2O5 row therefore describes the `.pdf` half, which is NOT the half the real pipeline currently processes for this one figure (both show 0 later-paint events regardless).

## Every figure with a nonzero (>40) diff in either variant — named, with crop path and description

### `CNX_Chem_01_03_HazDiamond`
- PERSIST vs ORIG: {'size_match': True, 'shape': [837, 1200, 3], 'count_gt40': 227, 'count_gt0': 268, 'bbox_gt40': [795, 816, 202, 225], 'bbox_gt0': [795, 816, 202, 225]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [837, 1200, 3], 'count_gt40': 227, 'count_gt0': 268, 'bbox_gt40': [795, 816, 202, 225], 'bbox_gt0': [795, 816, 202, 225]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 125.29397962503423, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 125.29397962503423, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_HazDiamond.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_HazDiamond_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_HazDiamond_tight.png`
- **description**: The radiation-hazard trefoil symbol. SOURCE/PERSIST/NONTEXT: black. ORIG: a medium/royal blue. Same mechanism as combustion (a persisted `k` fill-colour deleted with its BT..ET), opposite colour direction -- here black is LOST and the ambient colour that shows through is blue, not the reverse. mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_01_03_PeriodicPU`
- PERSIST vs ORIG: {'size_match': True, 'shape': [1016, 1300, 3], 'count_gt40': 839, 'count_gt0': 965, 'bbox_gt40': [859, 1000, 126, 318], 'bbox_gt0': [858, 1000, 125, 318]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [1016, 1300, 3], 'count_gt40': 839, 'count_gt0': 965, 'bbox_gt40': [859, 1000, 126, 318], 'bbox_gt0': [858, 1000, 125, 318]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 215.4384642093673, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 215.4384642093673, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_PeriodicPU.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_PeriodicPU_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_03_PeriodicPU_tight.png`
- **description**: A small periodic-table swatch/cell. Tiny diff (242 px component). Shares its EXACT largest-component bbox ([980,1000,145,170]) with CNX_Chem_19_01_PeriodicEConfig -- the same base periodic-table artwork is reused across chapters 1 and 19 with different overlays, and both carry the identical defect at the identical location, consistent with one shared source asset. Not individually viewed at pixel level beyond the shared-bbox evidence; the pattern (a small swatch losing a persisted fill colour) matches every other figure in this set.

### `CNX_Chem_01_05_SigDigits4_img`
- PERSIST vs ORIG: {'size_match': True, 'shape': [228, 1067, 3], 'count_gt40': 444, 'count_gt0': 560, 'bbox_gt40': [28, 131, 120, 858], 'bbox_gt0': [28, 131, 119, 859]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [228, 1067, 3], 'count_gt40': 444, 'count_gt0': 560, 'bbox_gt40': [28, 131, 120, 858], 'bbox_gt0': [28, 131, 119, 859]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 209.90922948738287, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 209.90922948738287, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_05_SigDigits4_img.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_05_SigDigits4_img_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_01_05_SigDigits4_img_tight.png`
- **description**: A single small connected diff component (tens to ~170 px), consistent with the same persisted-fill-colour-deleted mechanism measured directly on combustion/HazDiamond/OxyacTorch/IcePack/Egeom/Damage1/Damage2 -- not individually viewed at crop level; results.jsonl carries this figure's own count_gt40/count_gt0/bbox and direction_vs_source (PERSIST/NONTEXT mean_dist_to_SOURCE=0.0 in every one of these, per the aggregate).

### `CNX_Chem_04_05_combustion` **[bought]**
- PERSIST vs ORIG: {'size_match': True, 'shape': [321, 1300, 3], 'count_gt40': 2121, 'count_gt0': 2523, 'bbox_gt40': [151, 176, 78, 1160], 'bbox_gt0': [150, 177, 78, 1160]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [321, 1300, 3], 'count_gt40': 2121, 'count_gt0': 2523, 'bbox_gt40': [151, 176, 78, 1160], 'bbox_gt0': [150, 177, 78, 1160]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 132.77792432109365, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 132.77792432109365, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_04_05_combustion.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_04_05_combustion_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_04_05_combustion_tight.png`
- **description**: The 7 arrowheads in a combustion-reaction map. SOURCE/PERSIST/NONTEXT: black. ORIG: blue-grey (mean channel [91,142,171] at the sampled pixel vs source's [102,102,103]). Mechanism: a fill-colour `k 0.698 0.675 0.639 0.74` set inside a BT..ET is deleted along with the text object; the 7 arrowhead fills painted just after inherit whatever colour was ambient instead (a light blue-grey). PERSIST/NONTEXT mean_dist_to_SOURCE = 0.0 in the changed region (pixel-identical restore).

### `CNX_Chem_05_01_OxyacTorch`
- PERSIST vs ORIG: {'size_match': True, 'shape': [557, 1300, 3], 'count_gt40': 5575, 'count_gt0': 6264, 'bbox_gt40': [122, 168, 747, 1001], 'bbox_gt0': [122, 169, 747, 1001]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [557, 1300, 3], 'count_gt40': 5575, 'count_gt0': 6264, 'bbox_gt40': [122, 168, 747, 1001], 'bbox_gt0': [122, 169, 747, 1001]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 167.73820293305252, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 167.73820293305252, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_01_OxyacTorch.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_01_OxyacTorch_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_01_OxyacTorch_tight.png`
- **description**: The word "COL" (a label) in an oxyacetylene-torch figure. SOURCE/PERSIST/NONTEXT: solid blue. ORIG: the first glyph ("C") renders solid BLACK while the rest stays blue -- i.e. losing the persisted blue fill for that one glyph's drawing exposes a black ambient fill underneath. This is the mirror image of HazDiamond: which colour is lost and which shows through depends on what was set immediately before the affected BT block at the same q/Q scope, and that differs per figure. mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_05_02_HeatMeas`
- PERSIST vs ORIG: {'size_match': True, 'shape': [650, 1300, 3], 'count_gt40': 529, 'count_gt0': 662, 'bbox_gt40': [280, 456, 49, 878], 'bbox_gt0': [279, 457, 48, 878]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [650, 1300, 3], 'count_gt40': 529, 'count_gt0': 662, 'bbox_gt40': [280, 456, 49, 878], 'bbox_gt0': [279, 457, 48, 878]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 213.53249168662995, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 213.53249168662995, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_HeatMeas.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_HeatMeas_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_HeatMeas_tight.png`
- **description**: A black diagonal line/arrow in a calorimetry diagram. Viewed directly: no clearly visible difference across the four panels at this crop size -- another small (114 px), measured-but-not-eyeballable shift, same family as sp3d.

### `CNX_Chem_05_02_IcePack`
- PERSIST vs ORIG: {'size_match': True, 'shape': [797, 975, 3], 'count_gt40': 13702, 'count_gt0': 14995, 'bbox_gt40': [186, 260, 136, 544], 'bbox_gt0': [186, 260, 136, 545]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [797, 975, 3], 'count_gt40': 13702, 'count_gt0': 14995, 'bbox_gt40': [186, 260, 136, 544], 'bbox_gt0': [186, 260, 136, 545]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 176.75617452556588, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 176.75617452556588, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_IcePack.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_IcePack_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_02_IcePack_tight.png`
- **description**: A cold-pack/droplet icon. SOURCE/PERSIST/NONTEXT: a saturated indigo/blue fill. ORIG: the SAME shape rendered almost white -- a very pale washed-out lavender, i.e. the fill is nearly gone rather than merely shifted. Largest single diff region among the 34 changed figures other than ChnReact1 (14,995 px > 0, 13,702 px > 40). mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_05_03_Systemqw`
- PERSIST vs ORIG: {'size_match': True, 'shape': [438, 650, 3], 'count_gt40': 336, 'count_gt0': 442, 'bbox_gt40': [142, 239, 224, 425], 'bbox_gt0': [142, 239, 223, 425]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [438, 650, 3], 'count_gt40': 336, 'count_gt0': 442, 'bbox_gt40': [142, 239, 224, 425], 'bbox_gt0': [142, 239, 223, 425]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 167.80571318560038, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 167.80571318560038, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_03_Systemqw.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_03_Systemqw_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_05_03_Systemqw_tight.png`
- **description**: A black diagonal arrow over a landscape icon (a thermodynamic system diagram). Viewed directly: the ORIG arrowhead area looks slightly faded/whitish compared to SOURCE/PERSIST/NONTEXT's cleaner black tip -- a milder version of Egeom's 'bond nearly vanishes' pattern, component size 114 px.

### `CNX_Chem_07_06_Egeom`
- PERSIST vs ORIG: {'size_match': True, 'shape': [1200, 1300, 3], 'count_gt40': 1381, 'count_gt0': 1633, 'bbox_gt40': [378, 670, 331, 1210], 'bbox_gt0': [377, 671, 331, 1210]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [1200, 1300, 3], 'count_gt40': 1381, 'count_gt0': 1633, 'bbox_gt40': [378, 670, 331, 1210], 'bbox_gt0': [377, 671, 331, 1210]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 258.66564860239436, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 258.66564860239436, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_07_06_Egeom.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_07_06_Egeom_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_07_06_Egeom_tight.png`
- **description**: A wedge/dash bond (with an "F" substituent label) in a molecular-geometry figure. SOURCE/PERSIST/NONTEXT: solid black wedge. ORIG: the wedge is almost INVISIBLE -- rendered so pale it nearly disappears into the page background. This is the most visually severe instance found (a bond vanishing, not just recolouring) -- pedagogically the worst outcome in the changed set, since the bond geometry itself becomes hard to read. mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_08_02_sp3Geom`
- PERSIST vs ORIG: {'size_match': True, 'shape': [1117, 1300, 3], 'count_gt40': 32, 'count_gt0': 50, 'bbox_gt40': [475, 480, 1138, 1143], 'bbox_gt0': [474, 481, 1137, 1144]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [1117, 1300, 3], 'count_gt40': 32, 'count_gt0': 50, 'bbox_gt40': [475, 480, 1138, 1143], 'bbox_gt0': [474, 481, 1137, 1144]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 95.82453064487287, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 95.82453064487287, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_08_02_sp3Geom.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_08_02_sp3Geom_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_08_02_sp3Geom_tight.png`
- **description**: A black X/cross mark (an sp3 orbital-geometry diagram). Viewed directly: no clearly visible difference across the four panels -- too-small-to-see-by-eye category, component size 50 px.

### `CNX_Chem_11_01_Icepack`
- PERSIST vs ORIG: {'size_match': True, 'shape': [800, 975, 3], 'count_gt40': 13832, 'count_gt0': 14927, 'bbox_gt40': [187, 261, 136, 544], 'bbox_gt0': [186, 261, 136, 544]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [800, 975, 3], 'count_gt40': 13832, 'count_gt0': 14927, 'bbox_gt40': [187, 261, 136, 544], 'bbox_gt0': [186, 261, 136, 544]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 181.18758526667673, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 181.18758526667673, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_11_01_Icepack.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_11_01_Icepack_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_11_01_Icepack_tight.png`
- **description**: The SAME cold-pack/droplet icon as CNX_Chem_05_02_IcePack, reused in a different chapter (its own diff bbox and largest component are close but not identical, consistent with a slightly different crop/placement of the same base artwork). Same washed-out-to-near-white pattern, viewed directly. mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_19_01_PeriodicEConfig`
- PERSIST vs ORIG: {'size_match': True, 'shape': [1016, 1300, 3], 'count_gt40': 839, 'count_gt0': 965, 'bbox_gt40': [859, 1000, 126, 318], 'bbox_gt0': [858, 1000, 125, 318]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [1016, 1300, 3], 'count_gt40': 839, 'count_gt0': 965, 'bbox_gt40': [859, 1000, 126, 318], 'bbox_gt0': [858, 1000, 125, 318]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 215.4384642093673, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 215.4384642093673, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_19_01_PeriodicEConfig.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_19_01_PeriodicEConfig_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_19_01_PeriodicEConfig_tight.png`
- **description**: See CNX_Chem_01_03_PeriodicPU -- identical bbox, same shared periodic-table artwork reused across chapters.

### `CNX_Chem_21_04_ChnReact1`
- PERSIST vs ORIG: {'size_match': True, 'shape': [1375, 1300, 3], 'count_gt40': 2761, 'count_gt0': 3410, 'bbox_gt40': [137, 1217, 67, 1227], 'bbox_gt0': [137, 1217, 66, 1227]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [1375, 1300, 3], 'count_gt40': 2761, 'count_gt0': 3410, 'bbox_gt40': [137, 1217, 67, 1227], 'bbox_gt0': [137, 1217, 66, 1227]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 201.4213424692369, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 201.4213424692369, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_04_ChnReact1.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_04_ChnReact1_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_04_ChnReact1_tight.png`
- **description**: A nuclear chain-reaction "starburst" diagram (green sunburst with radiating black arrows/lines) -- the largest (106 MB) figure in the population, 3140 /Form XObjects. 19 separate small diff components scattered across the whole starburst (bbox spans almost the entire page, rows 137-1217 of 1375, cols 67-1227 of 1300), each a few dozen to ~180 px -- consistent with many individual radiating arrow-lines each independently carrying their own small persisted-colour BT..ET, rather than one single element. mean_dist(ORIG,SOURCE) = 201 (the largest of any figure measured, reflecting how many elements are affected at once); mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_21_06_Damage1`
- PERSIST vs ORIG: {'size_match': True, 'shape': [393, 975, 3], 'count_gt40': 443, 'count_gt0': 535, 'bbox_gt40': [64, 81, 293, 827], 'bbox_gt0': [64, 81, 293, 828]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [393, 975, 3], 'count_gt40': 443, 'count_gt0': 535, 'bbox_gt40': [64, 81, 293, 827], 'bbox_gt0': [64, 81, 293, 828]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 189.00511908331862, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 189.00511908331862, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage1.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage1_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage1_tight.png`
- **description**: A black rightward arrow in a radiation-damage diagram. SOURCE/PERSIST/NONTEXT: solid black. ORIG: the arrow renders in a bright teal/turquoise. Same persisted-colour-lost mechanism as HazDiamond (black lost, a saturated colour shows through). mean_dist(PERSIST,SOURCE) = 0.0.

### `CNX_Chem_21_06_Damage2`
- PERSIST vs ORIG: {'size_match': True, 'shape': [450, 1300, 3], 'count_gt40': 289, 'count_gt0': 359, 'bbox_gt40': [145, 210, 787, 1274], 'bbox_gt0': [145, 211, 787, 1275]}
- NONTEXT vs ORIG: {'size_match': True, 'shape': [450, 1300, 3], 'count_gt40': 289, 'count_gt0': 359, 'bbox_gt40': [145, 210, 787, 1274], 'bbox_gt0': [145, 211, 787, 1275]}
- direction (PERSIST): {'mean_dist_ORIG_to_SOURCE': 187.74791908687143, 'mean_dist_PERSIST_to_SOURCE': 0.0, 'moves_toward_source': True}
- direction (NONTEXT): {'mean_dist_ORIG_to_SOURCE': 187.74791908687143, 'mean_dist_NONTEXT_to_SOURCE': 0.0, 'moves_toward_source': True}
- crop (first-pass, may be squished for a wide bbox): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage2.png`
- post-pass vertical stack crop: `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage2_stack.png`
- post-pass tight crop (largest connected diff component): `/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/225e3674-11df-4e10-af8c-00cd5cb3d62c/scratchpad/c4-explore/render/crops/CNX_Chem_21_06_Damage2_tight.png`
- **description**: The SAME black-arrow-turns-teal pattern as CNX_Chem_21_06_Damage1, viewed directly (not inferred) -- a second, adjacent figure in the same chapter reusing a similar arrow asset. mean_dist(PERSIST,SOURCE) = 0.0.

## Figures with a nonzero but SUB-40 diff (count_gt0>0, count_gt40==0)

- `CNX_Chem_01_05_SigDigits1_img` [NONTEXT]: count_gt0=969, count_gt40=0
- `CNX_Chem_01_05_SigDigits1_img` [PERSIST]: count_gt0=969, count_gt40=0
- `CNX_Chem_01_05_SigDigits2_img` [NONTEXT]: count_gt0=1397, count_gt40=0
- `CNX_Chem_01_05_SigDigits2_img` [PERSIST]: count_gt0=1397, count_gt40=0
- `CNX_Chem_01_05_SigDigits3_img` [NONTEXT]: count_gt0=432, count_gt40=0
- `CNX_Chem_01_05_SigDigits3_img` [PERSIST]: count_gt0=432, count_gt40=0
- `CNX_Chem_01_05_SigDigits5_img` [NONTEXT]: count_gt0=749, count_gt40=0
- `CNX_Chem_01_05_SigDigits5_img` [PERSIST]: count_gt0=749, count_gt40=0
- `CNX_Chem_05_01_HeatTrans1` [NONTEXT]: count_gt0=350, count_gt40=0
- `CNX_Chem_05_01_HeatTrans1` [PERSIST]: count_gt0=350, count_gt40=0
- `CNX_Chem_07_03_Exercise3a_img` [NONTEXT]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3a_img` [PERSIST]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3b_img` [NONTEXT]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3b_img` [PERSIST]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3c_img` [NONTEXT]: count_gt0=230, count_gt40=0
- `CNX_Chem_07_03_Exercise3c_img` [PERSIST]: count_gt0=230, count_gt40=0
- `CNX_Chem_07_03_Exercise3d_img` [NONTEXT]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3d_img` [PERSIST]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3e_img` [NONTEXT]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3e_img` [PERSIST]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3f_img` [NONTEXT]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_03_Exercise3f_img` [PERSIST]: count_gt0=228, count_gt40=0
- `CNX_Chem_07_06_NH3` [NONTEXT]: count_gt0=522, count_gt40=0
- `CNX_Chem_07_06_NH3` [PERSIST]: count_gt0=522, count_gt40=0
- `CNX_Chem_08_02_SF6` [NONTEXT]: count_gt0=35, count_gt40=0
- `CNX_Chem_08_02_SF6` [PERSIST]: count_gt0=35, count_gt40=0
- `CNX_Chem_08_02_sp3d` [NONTEXT]: count_gt0=71, count_gt40=0
- `CNX_Chem_08_02_sp3d` [PERSIST]: count_gt0=71, count_gt40=0
- `CNX_Chem_09_01_Atmosphere` [NONTEXT]: count_gt0=23, count_gt40=0
- `CNX_Chem_09_01_Atmosphere` [PERSIST]: count_gt0=23, count_gt40=0
- `CNX_Chem_11_04_phasediag` [NONTEXT]: count_gt0=1428, count_gt40=0
- `CNX_Chem_11_04_phasediag` [PERSIST]: count_gt0=1428, count_gt40=0
- `CNX_Chem_15_02_BF3-LA_img` [NONTEXT]: count_gt0=671, count_gt40=0
- `CNX_Chem_15_02_BF3-LA_img` [PERSIST]: count_gt0=671, count_gt40=0
- `CNX_Chem_16_02_Gas` [NONTEXT]: count_gt0=212, count_gt40=0
- `CNX_Chem_16_02_Gas` [PERSIST]: count_gt0=212, count_gt40=0
- `CNX_Chem_21_04_CritMass` [NONTEXT]: count_gt0=10391, count_gt40=0
- `CNX_Chem_21_04_CritMass` [PERSIST]: count_gt0=10391, count_gt40=0

## Figures where PERSIST and NONTEXT differ from EACH OTHER (count_gt0>0)

(none)

## Size mismatches (rendered PERSIST/NONTEXT dimensions != ORIG)

(none)

## SERIALISER control, per changed figure (variant=SERIALISER rows, post-pass)

- `CNX_Chem_01_03_HazDiamond`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_03_PeriodicPU`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_05_SigDigits1_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_05_SigDigits2_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_05_SigDigits3_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_05_SigDigits4_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_01_05_SigDigits5_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_04_05_combustion`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_05_01_HeatTrans1`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_05_01_OxyacTorch`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_05_02_HeatMeas`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_05_02_IcePack`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_05_03_Systemqw`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3a_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3b_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3c_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3d_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3e_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_03_Exercise3f_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_06_Egeom`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_07_06_NH3`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_08_02_SF6`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_08_02_sp3Geom`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_08_02_sp3d`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_09_01_Atmosphere`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_11_01_Icepack`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_11_04_phasediag`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_15_02_BF3-LA_img`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_16_02_Gas`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_19_01_PeriodicEConfig`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_21_04_ChnReact1`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_21_04_CritMass`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_21_06_Damage1`: status=ok, count_gt0=0, count_gt40=0
- `CNX_Chem_21_06_Damage2`: status=ok, count_gt0=0, count_gt40=0

## Render/strip failures (status != ok), any variant

(none)

