# figcontainers.py — container detection and open/cell alignment (§C140 ③), scratch pre-implementation

**Cost: 0 ISK.** No MT, no `figure-run.js`, nothing written under the repository (`git status --porcelain` → 0 lines; 0 `*.pyc` under `experiments/figure-text-translation` newer than the base-tree copy). Every python call ran with `PYTHONDONTWRITEBYTECODE=1`; the cairo test PDF went to `plan/tmp-figcontainers` via `TMPDIR` (emptied by the test). The harness refused a report file, so this text exists only here.

## Files

| path | what |
|---|---|
| `/home/siggi/dev/scratch-c140/plan/tree-figcontainers/figcontainers.py` | the module (contract: `source_frame`, `page_bbox`, `load_page`, `classify`, `container_for`; plus `line_frames`, `free_box`, `open_alignment`, `cell_alignment`, `multi_alignment`, `sibling_cues`) |
| `/home/siggi/dev/scratch-c140/plan/tree-figcontainers/test_figcontainers.py` | 68 checks, repo test style, 0.27 s |
| `/home/siggi/dev/scratch-c140/plan/figcontainers-work/red_first.py` → `red_first.out` | 13 mutation rounds (3 constant, 10 code-on-copies) + golden cmp |
| `.../figcontainers-work/real_figcontainers.py` → `real.out`, `results.json` | real data over the 176 layout blocks (31 figures carry them; basehyd, HClsoln, GreenChem carry none) |
| `.../figcontainers-work/obstacle_variants.py` → `obstacle_variants.out` | which obstacle line-box definition reproduces the census free box |
| `.../figcontainers-work/all_blocks.py` → `all_blocks.out` | `container_for` over all 367 blocks of the 34 |

## Headline

- **Class 176/176** vs census truth (box 66 / cell 26 / open 84); 0 disagreements; 0 error branches; 367/367 blocks of the 34 never raise.
- **Inner**: box max |dev| 0.314 (14/66 > 0.25, 0 > 0.5); rule cells max 0.247; fill-rect after the new MIN_RULE/2 inset ≤ 0.22 on the five untextured cells, 0.498 on brain b0 (census inner = raw vector bbox for textured blocks → differs by exactly the inset, by construction).
- **Cell alignment: 0/26 change** when computed from inner geometry; right-flush ratios 27.26–54.06, centred ≤ 4.20.
- **Open alignment: 2/84 differ** — rxn2 b11 `Reactant`, b12 `Coefficient` right → center: the designed SIBLING_TOL 0.2 departure.
- **Free box**: FL/FR 84/84 within one step. room_down: 5 subscript blocks differ by the contract frame (re-based 84/84). room_up: 4 FishLemon blocks differ because obstacles are per-run (see the ruling needed below).
- **Wall time**: worst figure exocytosis 0.88 s (load_page 0.65–0.84 s, 423 curves); no figure near 5 s; nothing to profile.

## ⚠️ DEVIATION NEEDING A RULING — per-run obstacles

The contract says "other blocks' source line boxes are obstacles"; the census and free_v1 built those boxes from each line's FIRST run. I used `source_frame(line)` (per run). Line-based variants reproduce census room_up **84/84**; per-run gives **80/84** — FishLemon #6 `Acetic acid`, #7 `Acetate ion`, #8 `Putrescine` (−2.75), #9 `Putrescinium ion` (−5.75). An exact per-glyph obstacle set (every run its own glyph box) gives the **identical 80/84 with the identical four**: the census boxes miss the subscripts of `CH3COOH` / `CH3COO–` / `NH2CH2…` above those labels, and on #9 FT.lines puts the raised `+` first on the line `+CH2CH2CH2CH2NH2`, so a first-run box sits 6 pt above that line's glyphs. **Revert = one line** in `free_box` (swap `for f in line_frames(other)` for first-run-proj / `l[0]['size']` boxes); the unit test *"room_up 8.25, not 11.0"* then goes RED (proved by mutation `obstacles-line-based`), so either choice is deliberate.

## Decisions

1. Source frame per RUN (contract, cls_v3). 26/176 frames differ from census `src.frame`, n0 only, −1.576…−2.579. Pre-named consequence: 21 boxes' `src_down_margin` 1.37–2.52 smaller; 5 opens' `room_down` 1.75–2.75 smaller (etheneBr#2, ethene#0, limiting#2, limiting#3, combustion#2); re-based all 84 within one step. 0 of the 26 are cells.
2. Per-run obstacles (above).
3. Multi-line ambiguity = two smallest spreads differ by < AMBIG (assemble.py/contract), not align_v1 line 17 (`and False`). Spreads from adv line extents. 41/41 unambiguous verdicts equal `FT.alignment(block, adv)`; 2 ambiguous (combmap#11, #13, margin 0.39) → center, FT also center.
4. `CELL_RATIO = 20.0` named separately (build_census.py). Ratio = far/tight if tight > 0 else ∞ (census arithmetic) — tight 0 is flush (etheneBr#1, #2, L = 0.00 = census).
5. Rotation: box/cell only within 0.5° of 90k; else `open`/`rotated` without classify, free box still marched in rotation. The 4 rotated blocks of the 34 are census-open. Inner mapped by 2nd/3rd sorted corner projections — exact at 90k, inscribed within the snap.
6. Error fallback: open, `error: <Type>`, FL/FR = source a0/a1 (0/0 if the frame fails), zero room, center.
7. `load_page` copies object_type, x0..y1, stroke, fill, linewidth, path op letters, pts, integer `oid` (owner identity; `id()` does not survive the copy) and page `bbox`; pdfplumber imported inside `load_page` only; pts/path (y-down) used only for closure. All page origins (0,0).
8. March = free_v1 semantics (0.25 steps, 600 limit, 7/11 rays over the middle 70 %, `max(d−step,0)` on leaving the image); exact slab pre-filter for speed. On limit exhaustion the reason reads 'page' (never reached). `artwork.png` is ceil(page·S) on 18/31 figures, so a march can run one step past the page edge there.
9. Box containers also carry `align: 'center'` (contract lists align as cell-only, "box always center") — additive. `free_box` exposes per-side `by`; `container_for` returns the contract keys.
10. `classify` names refusals in `why` for open labels. Fill-only curves are not label patches; open stroked curves are not boxes.
11. SPAN docstring states the measured split: 11 = 9 arrow labels between flow-map boxes + 2 exocytosis labels.

## Hazards

- **Fragile flush verdicts** — each within one 0.25 march step of a FLUSH threshold, so a re-render of `artwork.png` could flip them: sandwich#0 ratio 20.9 (R 57.50), sandwich#2 ratio 20.6 (R 56.75), sandwich#5 tight exactly 4.75. Next closest: exocytosis#0 ratio 23.2.
- free_v1's "83/84 (sandwich b6 up 0.75)" measured its START frame: sandwich#6's line is 9 pt but carries a 10 pt `=`, so free_v1's n1 was 254.95 vs 255.68 (per-run and census agree); here room_up 2.75 = census 2.75. Trust the census/per-run number, not free_v1's.

## Spec conflicts

- "11 arrow labels between boxes" → measured 9 arrow labels + 2 exocytosis labels (`Synapse`, `Neuron`, bracketed by curve bbox sides, oids 7 and 3).
- Census room_up on FishLemon #6–#9 is 2.75–5.75 pt larger than the source glyphs allow (see ruling).

## RED-first (verbatim red_first.out; lines cut at 260 chars by the display command)

```
### control: unchanged: exit 0, 0 FAIL line(s)
ALL PASS

### SPAN disabled (SPAN = 1e9): exit 1, 2 FAIL line(s)
  FAIL  bracketing, non-spanning rules -> open: cell rules
  FAIL  ... and the why names the refusal: rules
2 FAILED: bracketing, non-spanning rules -> open, ... and the why names the refusal

### SIBLING_TOL = 0.5 (the census tolerance): exit 1, 2 FAIL line(s)
  FAIL  rxn2 Reactant: 0.498 pt right-edge coincidence -> no cue -> center: right single-cue-right-only->right
  FAIL  rxn2 Coefficient: 0.498 pt right-edge coincidence -> no cue -> center: right single-cue-right-only->right
2 FAILED: rxn2 Reactant: 0.498 pt right-edge coincidence -> no cue -> center, rxn2 Coefficient: 0.498 pt right-edge coincidence -> no cue -> center

### MIN_RULE = 0 (no minimum inset): exit 1, 6 FAIL line(s)
  FAIL  lw 0 (hairline) -> inset MIN_RULE/2 = 0.5: box (90.0, 90.0, 160.0, 120.0)
  FAIL  container_for box: inner in the along/normal frame: {'cls': 'box', 'why': 'stroked-closed', 'L': 90.0, 'R': 160.0, 'D': 90.0, 'U': 120.0, 'src_left_margin': 10.0, 'src_right_margin': 20.0, 'src_up_margin': 12.700
  FAIL  container_for box: source margins: {'cls': 'box', 'why': 'stroked-closed', 'L': 90.0, 'R': 160.0, 'D': 90.0, 'U': 120.0, 'src_left_margin': 10.0, 'src_right_margin': 20.0, 'src_up_margin': 12.700000000000003, 'sr
  FAIL  inner: 0.5 on the hairline sides, 1.0 on the 2 pt right rule: (90.25, 90.25, 159.0, 119.75)
  FAIL  fill-rect inner inset 0.5: (90.0, 90.0, 160.0, 120.0)
  FAIL  real PDF: label in the grid -> cell via rules, inner inset 0.5: {'cls': 'cell', 'why': 'rules', 'L': 20.25, 'R': 119.75, 'D': 50.25, 'U': 89.75, 'src_left_margin': 19.75, 'src_right_margin': 49.75, 'src_up_margin
6 FAILED: lw 0 (hairline) -> inset MIN_RULE/2 = 0.5, container_for box: inner in the along/normal frame, container_for box: source margins, inner: 0.5 on the hairline sides, 1.0 on the 2 pt right rule, fill-rect inner inset 0.5, real PDF: label in the grid -> 

### no-inset-at-all: exit 1, 15 FAIL line(s)
  FAIL  lw 2.0 -> inner inset 1.0 on every side: (90, 90, 160, 120)
  FAIL  lw 0 (hairline) -> inset MIN_RULE/2 = 0.5: box (90, 90, 160, 120)
  FAIL  container_for box: inner in the along/normal frame: {'cls': 'box', 'why': 'stroked-closed', 'L': 90.0, 'R': 160.0, 'D': 90.0, 'U': 120.0, 'src_left_margin': 10.0, 'src_right_margin': 20.0, 'src_up_margin': 12.700
  FAIL  container_for box: source margins: {'cls': 'box', 'why': 'stroked-closed', 'L': 90.0, 'R': 160.0, 'D': 90.0, 'U': 120.0, 'src_left_margin': 10.0, 'src_right_margin': 20.0, 'src_up_margin': 12.700000000000003, 'sr
  FAIL  closed curve (ends in h) -> box, inset 0.75: box (90, 90, 160, 120)
  FAIL  inner: 0.5 on the hairline sides, 1.0 on the 2 pt right rule: (90.0, 90.0, 160.0, 120.0)
  FAIL  fill-rect inner inset 0.5: (90, 90, 160, 120)
  FAIL  nested: the smallest enclosing candidate wins: box (90, 90, 160, 120)
  FAIL  rot 90 inner: L=10.5 R=99.5 D=-59.5 U=-10.5: {'cls': 'box', 'why': 'stroked-closed', 'L': 10.000000000000004, 'R': 100.0, 'D': -59.99999999999999, 'U': -10.0, 'src_left_margin': 20.0, 'src_right_margin': 30.0, 's
  FAIL  rot 90 margins: left 19.5, right 29.5, up 32.2, down 7.4: {'cls': 'box', 'why': 'stroked-closed', 'L': 10.000000000000004, 'R': 100.0, 'D': -59.99999999999999, 'U': -10.0, 'src_left_margin': 20.0, 'src_right_marg
  FAIL  rot -90 -> box with inner L=-99.5 R=-10.5 D=10.5 U=59.5: {'cls': 'box', 'why': 'stroked-closed', 'L': -100.0, 'R': -10.0, 'D': 10.000000000000005, 'U': 60.0, 'src_left_margin': 30.0, 'src_right_margin': 20.0, 'sr
  FAIL  rot 89.6 (within 0.5 of 90) -> box, inner inscribed (never wider than the exact one): {'cls': 'box', 'why': 'stroked-closed', 'L': 10.418631924931645, 'R': 100.06737567351908, 'D': -59.30041181252752, 'U': -9.929
  FAIL  real PDF: label in the cairo rect -> box, inner inset 0.5: {'cls': 'box', 'why': 'stroked-closed', 'L': 20.0, 'R': 120.0, 'D': 120.0, 'U': 180.0, 'src_left_margin': 20.0, 'src_right_margin': 50.0, 'src_up_margin'
  FAIL  real PDF: label in the rounded rect -> box, inner inset 0.75: {'cls': 'box', 'why': 'stroked-closed', 'L': 160.0, 'R': 280.0, 'D': 120.0, 'U': 180.0, 'src_left_margin': 30.0, 'src_right_margin': 50.0, 'src_up_mar
  FAIL  real PDF: label in the grid -> cell via rules, inner inset 0.5: {'cls': 'cell', 'why': 'rules', 'L': 20.0, 'R': 120.0, 'D': 50.0, 'U': 90.0, 'src_left_margin': 20.0, 'src_right_margin': 50.0, 'src_up_margin': 18.
15 FAILED: lw 2.0 -> inner inset 1.0 on every side, lw 0 (hairline) -> inset MIN_RULE/2 = 0.5, container_for box: inner in the along/normal frame, container_for box: source margins, closed curve (ends in h) -> box, inset 0.75, inner: 0.5 on the hairline sides,

### fill-rect-without-inset (cls_v3 as written): exit 1, 1 FAIL line(s)
  FAIL  fill-rect inner inset 0.5: (90, 90, 160, 120)
1 FAILED: fill-rect inner inset 0.5

### no-rotation-gate: exit 1, 2 FAIL line(s)
  FAIL  rot 30 -> open with why rotated: {'cls': 'box', 'why': 'stroked-closed', 'L': 83.84326673973659, 'R': 143.381051903618, 'D': 3.843266739736607, 'U': 49.720797865773605, 'src_left_margin': -1.8817425126702716, 'sr
  FAIL  rot 30 still carries a free box: ['D', 'L', 'R', 'U', 'align', 'align_why', 'cls', 'src_down_margin', 'src_left_margin', 'src_right_margin', 'src_up_margin', 'why']
2 FAILED: rot 30 -> open with why rotated, rot 30 still carries a free box

### no-edge-rule: exit 1, 2 FAIL line(s)
  FAIL  stroked rect 0.1 pt from the left page edge -> open: box stroked-closed
  FAIL  rules cell whose left rule is 0.2 pt from the page edge -> open: cell rules
2 FAILED: stroked rect 0.1 pt from the left page edge -> open, rules cell whose left rule is 0.2 pt from the page edge -> open

### no-area-rule: exit 1, 2 FAIL line(s)
  FAIL  stroked rect of exactly 25 % -> open: box stroked-closed
  FAIL  rules cell of exactly 25 % -> open: cell rules
2 FAILED: stroked rect of exactly 25 % -> open, rules cell of exactly 25 % -> open

### container_for-raises: exit 1, 3 FAIL line(s)
  FAIL  broken page dict -> open "error: TypeError": RAISED TypeError: 'NoneType' object is not iterable
  FAIL  dark image None on an open block -> open "error: AttributeError": RAISED AttributeError: 'NoneType' object has no attribute 'load'
  FAIL  index out of range -> open "error: IndexError": RAISED IndexError: list index out of range
3 FAILED: broken page dict -> open "error: TypeError", dark image None on an open block -> open "error: AttributeError", index out of range -> open "error: IndexError"

### ambiguity-disabled (align_v1 line 17): exit 1, 1 FAIL line(s)
  FAIL  multi-line ambiguous (0.3 vs 0.6) -> center: left multi(margin 0.30)->left
1 FAILED: multi-line ambiguous (0.3 vs 0.6) -> center

### flush-rule-disabled: exit 1, 2 FAIL line(s)
  FAIL  flush: bar 2 pt to the left -> left, single-flush: center single-cue(L0C0R0)->center L=2.25
  FAIL  flush: bar 2 pt to the right -> right: center single-cue(L0C0R0)->center
2 FAILED: flush: bar 2 pt to the left -> left, single-flush, flush: bar 2 pt to the right -> right

### obstacles-ignored: exit 1, 2 FAIL line(s)
  FAIL  another block's source line box stops the march: {'FL': 0.0, 'FR': 400.25, 'room_up': 192.5, 'room_down': 98.0, 'free_left_clear': 100.0, 'free_right_clear': 260.25, 'by': {'left': 'page', 'right': 'page', 'up': 
  FAIL  an obstacle's subscript glyph box stops the up march (room_up 8.25, not 11.0): {'FL': 0.0, 'FR': 400.25, 'room_up': 192.5, 'room_down': 98.0, 'free_left_clear': 100.0, 'free_right_clear': 260.25, 'by': {'left': '
2 FAILED: another block's source line box stops the march, an obstacle's subscript glyph box stops the up march (room_up 8.25, not 11.0)

### obstacles-line-based (first-run proj, l[0] size): exit 1, 1 FAIL line(s)
  FAIL  an obstacle's subscript glyph box stops the up march (room_up 8.25, not 11.0): {'FL': 0.0, 'FR': 400.25, 'room_up': 11.0, 'room_down': 98.0, 'free_left_clear': 100.0, 'free_right_clear': 260.25, 'by': {'left': 'p
1 FAILED: an obstacle's subscript glyph box stops the up march (room_up 8.25, not 11.0)

### working files vs golden copies: True True
```

## Test run (tail, verbatim) — `cd plan/tree-figcontainers && TMPDIR=plan/tmp-figcontainers PYTHONDONTWRITEBYTECODE=1 python3 -u test_figcontainers.py`

68 PASS, 0 FAIL. Case 11 printed what pdfplumber returns for cairo-drawn shapes:

```
        pdfplumber rects: [('rect', True, False, 1.0, ['h'], (20.0, 120.0, 120.0, 180.0))]
        pdfplumber curves: [('curve', True, False, 1.5, ['h'], (160.0, 120.0, 280.0, 180.0))]
        pdfplumber lines: [('line', True, False, 0.5, ['l'], (20.0, 10.0, 20.0, 90.0)), ('line', True, False, 0.5, ['l'], (120.0, 10.0, 120.0, 90.0)), ('line', True, False, 0.5, ['l'], (220.0, 10.0, 220.0, 90.0)), ('line', True, False, 0.5, ['l'], (20.0, 90.0, 220.0, 90.0)), ('line', True, False, 0.5, ['l'], (20.0, 50.0, 220.0, 50.0)), ('line', True, False, 0.5, ['l'], (20.0, 10.0, 220.0, 10.0))]
        page width/height/bbox: 300.0 200.0 (0.0, 0.0, 300.0, 200.0)
...
  PASS  real PDF: label in the rounded rect -> box, inner inset 0.75: {'cls': 'box', 'why': 'stroked-closed', 'L': 160.75, 'R': 279.25, 'D': 120.75, 'U': 179.25, 'src_left_margin': 29.25, 'src_right_margin': 49.25, 'src_up_margin': 27.680000000000007, 'src_down_margin': 22.360000000000014, 'align': 'center', 'align_why': 'box->center (R2)'}
  PASS  real PDF: label in the grid -> cell via rules, inner inset 0.5: {'cls': 'cell', 'why': 'rules', 'L': 20.5, 'R': 119.5, 'D': 50.5, 'U': 89.5, 'src_left_margin': 19.5, 'src_right_margin': 49.5, 'src_up_margin': 17.930000000000007, 'src_down_margin': 12.61, 'align': 'center', 'align_why': 'cell-single-margins(ratio 2.54)->center'}

ALL PASS

real	0m0.268s
```

So, for the end-to-end tests: cairo `rectangle()+stroke()` → one `rect`, stroke True, fill False, linewidth exactly the cairo width (1.0, not CTM-scaled), path ends `h`, y flipped to PDF y-up; a rounded rect (4 `arc` + `close_path`) → one `curve`, stroke True, linewidth 1.5, path ends `h`, bbox = the rounded rect's extents; each `move_to/line_to/stroke` → one `line`, linewidth 0.5.

## Real data — `real_figcontainers.py` (verbatim real.out, T0–T9 identical across both runs; T10 from the final run)

```
## T0. pages and images
page bbox origins: {(0.0, 0.0): 31}
page size == meta page: 31 of 31
png size == round(page * 200/72): 13 of 31 [('CNX_Chem_03_01_alsulfatemass_img', (1200, 320), (1200, 319)), ('CNX_Chem_03_01_aspirin', (1175, 318), (1174, 317)), ('CNX_Chem_03_01_brain-ec0b', (975, 484), (975, 483)), ('CNX_Chem_03_01_chloroform', (1300, 320), (1300, 319)), ('CNX_Chem_03_01_exocytosis-88f6', (1200, 670), (1200, 669)), ('CNX_Chem_03_01_glycinemass_img', (1200, 412), (1200, 411)), ('CNX_Chem_03_01_saltMass', (1300, 263), (1300, 262)), ('CNX_Chem_03_02_copperMoles_img-a962', (1200, 183), (1200, 182)), ('CNX_Chem_03_02_glycine_img-7c96', (1200, 162), (1200, 161)), ('CNX_Chem_03_02_potassium_img-f1d1', (1200, 148), (1200, 147)), ('CNX_Chem_03_02_sacch_img-3278', (1224, 205), (1223, 205)), ('CNX_Chem_03_02_vitC_img-e537', (1219, 174), (1219, 173)), ('CNX_Chem_03_05_Example2_img', (1231, 191), (1231, 190)), ('CNX_Chem_04_01_rxn2', (975, 445), (975, 444)), ('CNX_Chem_04_03_etheneBr_img', (1300, 194), (1300, 193)), ('CNX_Chem_04_03_ethene_img', (650, 352), (650, 351)), ('CNX_Chem_04_03_moleratio2_img', (1100, 467), (1100, 466)), ('CNX_Chem_14_03_FishLemon', (1200, 782), (1200, 781))]

## T1. class vs census truth (176)
| truth \ got | box | cell | open |
|---|---|---|---|
| box | 66 | 0 | 0 |
| cell | 0 | 26 | 0 |
| open | 0 | 0 | 84 |
disagreements: 0
why counts: {('cell', 'rules'): 20, ('cell', 'fill-rect'): 6, ('box', 'stroked-closed'): 66, ('open', 'no-container (refused: area)'): 24, ('open', 'no-container (refused: rules-not-spanning)'): 4, ('open', 'no-container'): 44, ('open', 'rotated'): 4, ('open', 'no-container (refused: area, rules-not-spanning)'): 8}
errors: []

## T2. inner (L R D U) minus census, per class and branch (got - census, pt)
| population | n | min | median | max | abs > 0.25 | abs > 0.5 |
|---|---|---|---|---|---|---|
| box / stroked-closed / D | 66 | -0.21 | -0.03 | +0.20 | 0 | 0 |
| box / stroked-closed / L | 66 | -0.25 | -0.10 | +0.31 | 4 | 0 |
| box / stroked-closed / R | 66 | -0.29 | -0.05 | +0.29 | 7 | 0 |
| box / stroked-closed / U | 66 | -0.31 | -0.01 | +0.24 | 4 | 0 |
| cell / fill-rect / D | 6 | -0.07 | +0.16 | +0.50 | 1 | 0 |
| cell / fill-rect / L | 6 | +0.05 | +0.07 | +0.50 | 1 | 0 |
| cell / fill-rect / R | 6 | -0.50 | -0.07 | -0.03 | 1 | 0 |
| cell / fill-rect / U | 6 | -0.50 | +0.09 | +0.22 | 1 | 0 |
| cell / rules / D | 20 | -0.22 | -0.22 | +0.03 | 0 | 0 |
| cell / rules / L | 20 | -0.20 | +0.08 | +0.19 | 0 | 0 |
| cell / rules / R | 20 | -0.25 | -0.08 | +0.12 | 0 | 0 |
| cell / rules / U | 20 | +0.02 | +0.02 | +0.02 | 0 | 0 |

per block, max |dev| over the four sides:
| class / branch | blocks | max | abs > 0.25 | abs > 0.5 |
|---|---|---|---|---|
| box / stroked-closed | 66 | 0.314 | 14 | 0 |
| cell / fill-rect | 6 | 0.498 | 1 | 0 |
| cell / rules | 20 | 0.247 | 0 | 0 |

every block with max |dev| > 0.25:
  0.498  CNX_Chem_03_01_brain-ec0b#0  cell/fill-rect  {'L': 0.496, 'R': -0.497, 'D': 0.498, 'U': -0.497}  textured=True  key='Neuron cells'
  0.314  CNX_Chem_04_03_flowchart#10  box/stroked-closed  {'L': 0.314, 'R': -0.106, 'D': 0.143, 'U': -0.309}  textured=False  key='Number|of|particles|of A'
  0.309  CNX_Chem_04_03_flowchart#11  box/stroked-closed  {'L': -0.182, 'R': -0.102, 'D': 0.143, 'U': -0.309}  textured=False  key='Number|of|particles|of B'
  0.290  CNX_Chem_03_02_argon_img-9025#0  box/stroked-closed  {'L': -0.112, 'R': -0.29, 'D': -0.06, 'U': -0.02}  textured=False  key='Moles of|Ar atoms (mol)'
  0.286  CNX_Chem_03_02_copperMoles_img-a962#0  box/stroked-closed  {'L': -0.109, 'R': 0.286, 'D': -0.06, 'U': -0.02}  textured=False  key='Moles of|Cu atoms (mol)'
  0.273  CNX_Chem_03_03_empform#5  box/stroked-closed  {'L': -0.108, 'R': 0.094, 'D': 0.187, 'U': -0.273}  textured=False  key='Mass of|X atoms'
  0.273  CNX_Chem_03_03_empform#3  box/stroked-closed  {'L': -0.112, 'R': 0.09, 'D': 0.187, 'U': -0.273}  textured=False  key='Moles of|X atoms'
  0.259  CNX_Chem_04_05_combmap_img#7  box/stroked-closed  {'L': 0.001, 'R': -0.259, 'D': 0.078, 'U': -0.132}  textured=False  key='Mass of H'
  0.259  CNX_Chem_04_05_combmap_img#3  box/stroked-closed  {'L': 0.001, 'R': -0.259, 'D': 0.073, 'U': -0.137}  textured=False  key='Mass of C'
  0.253  CNX_Chem_04_05_map7_img#1  box/stroked-closed  {'L': -0.253, 'R': -0.005, 'D': -0.006, 'U': 0.029}  textured=False  key='Moles of |NaOH'
  0.253  CNX_Chem_04_05_combmap_img#9  box/stroked-closed  {'L': 0.007, 'R': -0.253, 'D': 0.077, 'U': 0.117}  textured=False  key='C to H|mole ratio'
  0.253  CNX_Chem_04_05_combmap_img#6  box/stroked-closed  {'L': 0.007, 'R': -0.253, 'D': 0.078, 'U': -0.132}  textured=False  key='Moles of H'
  0.253  CNX_Chem_04_05_combmap_img#2  box/stroked-closed  {'L': 0.007, 'R': -0.253, 'D': 0.073, 'U': -0.137}  textured=False  key='Moles of C'
  0.253  CNX_Chem_04_03_map3_img#1  box/stroked-closed  {'L': -0.253, 'R': -0.005, 'D': -0.006, 'U': 0.029}  textured=False  key='Moles of |C8H18'
  0.253  CNX_Chem_04_03_map2_img#1  box/stroked-closed  {'L': -0.253, 'R': -0.005, 'D': 0.044, 'U': 0.029}  textured=False  key='Moles of |Mg(OH)2'

## T3. source margins minus census (frame-dependent), box/cell
| population | n | min | median | max | abs > 0.25 | abs > 0.5 |
|---|---|---|---|---|---|---|
frames equal to the census frame (<= 0.01 pt): 150; differing: 26
differing frames: [('CNX_Chem_03_02_glycine_img-7c96#0', 'BOUNDED', (-0.002, 0.003, -2.579, 0.001)), ('CNX_Chem_03_02_glycine_img-7c96#2', 'BOUNDED', (0.005, 0.002, -2.579, 0.001)), ('CNX_Chem_04_03_etheneBr_img#2', 'OPEN', (0.0, -0.001, -2.578, 0.002)), ('CNX_Chem_04_03_ethene_img#0', 'OPEN', (-0.003, -0.0, -2.578, 0.002)), ('CNX_Chem_04_03_map2_img#0', 'BOUNDED', (0.003, 0.002, -1.576, 0.004)), ('CNX_Chem_04_03_map2_img#1', 'BOUNDED', (0.004, -0.003, -1.576, 0.004)), ('CNX_Chem_04_03_map3_img#0', 'BOUNDED', (0.003, 0.004, -1.576, 0.004)), ('CNX_Chem_04_03_map3_img#1', 'BOUNDED', (0.004, -0.003, -1.576, 0.004)), ('CNX_Chem_04_03_map3_img#2', 'BOUNDED', (0.004, 0.0, -1.583, -0.003)), ('CNX_Chem_04_03_map3_img#4', 'BOUNDED', (0.003, -0.005, -1.583, -0.003)), ('CNX_Chem_04_03_moleratio1_img#1', 'BOUNDED', (0.003, -0.0, -1.577, 0.003)), ('CNX_Chem_04_03_moleratio2_img#0', 'BOUNDED', (-0.002, -0.004, -1.576, 0.004)), ('CNX_Chem_04_03_moleratio2_img#1', 'BOUNDED', (-0.001, -0.005, -1.576, 0.004)), ('CNX_Chem_04_03_moleratio2_img#2', 'BOUNDED', (-0.005, 0.004, -1.58, -0.0)), ('CNX_Chem_04_04_limiting#2', 'OPEN', (-0.004, -0.001, -2.578, 0.002)), ('CNX_Chem_04_04_limiting#3', 'OPEN', (0.003, 0.002, -2.578, 0.002)), ('CNX_Chem_04_05_combmap_img#0', 'BOUNDED', (0.001, 0.0, -1.581, -0.001)), ('CNX_Chem_04_05_combmap_img#1', 'BOUNDED', (0.004, 0.005, -1.581, -0.001)), ('CNX_Chem_04_05_combmap_img#4', 'BOUNDED', (0.001, 0.0, -1.576, 0.004)), ('CNX_Chem_04_05_combmap_img#5', 'BOUNDED', (0.004, 0.005, -1.576, 0.004)), ('CNX_Chem_04_05_combustion#2', 'OPEN', (-0.004, 0.001, -1.579, 0.003)), ('CNX_Chem_04_05_map8_img#3', 'BOUNDED', (0.005, -0.004, -1.582, -0.002)), ('CNX_Chem_04_05_map8_img#4', 'BOUNDED', (0.004, -0.003, -1.582, -0.002)), ('CNX_Chem_04_05_map8_img#5', 'BOUNDED', (0.003, -0.004, -1.582, -0.002)), ('CNX_Chem_04_05_map8_img#6', 'BOUNDED', (0.002, 0.003, -1.583, -0.003)), ('CNX_Chem_04_05_map8_img#7', 'BOUNDED', (0.001, -0.003, -1.583, -0.003))]
| box / frame differs / down | 21 | -2.52 | -1.57 | -1.37 | 21 | 21 |
| box / frame differs / left | 21 | -0.15 | +0.01 | +0.26 | 2 | 0 |
| box / frame differs / right | 21 | -0.25 | -0.07 | +0.14 | 0 | 0 |
| box / frame differs / up | 21 | -0.14 | +0.07 | +0.12 | 0 | 0 |
| box / frame==census / down | 45 | -0.19 | +0.01 | +0.18 | 0 | 0 |
| box / frame==census / left | 45 | -0.32 | +0.11 | +0.26 | 2 | 0 |
| box / frame==census / right | 45 | -0.29 | -0.04 | +0.29 | 7 | 0 |
| box / frame==census / up | 45 | -0.31 | -0.02 | +0.24 | 4 | 0 |
| cell / frame==census / down | 26 | -0.50 | +0.06 | +0.22 | 1 | 0 |
| cell / frame==census / left | 26 | -0.50 | -0.08 | +0.19 | 1 | 1 |
| cell / frame==census / right | 26 | -0.50 | -0.07 | +0.13 | 1 | 1 |
| cell / frame==census / up | 26 | -0.50 | +0.02 | +0.22 | 1 | 0 |

## T4. free box minus census, open blocks (got - census, pt)
| population | n | min | median | max | abs > 0.25 | abs > 0.5 |
|---|---|---|---|---|---|---|
| all / FL | 84 | -0.25 | +0.00 | +0.25 | 3 | 0 |
| all / FR | 84 | -0.25 | +0.00 | +0.25 | 3 | 0 |
| all / room_down | 84 | -2.75 | +0.00 | +0.25 | 5 | 5 |
| all / room_up | 84 | -5.75 | +0.00 | +0.00 | 4 | 4 |
| frame differs / FL | 5 | -0.00 | -0.00 | +0.25 | 1 | 0 |
| frame differs / FR | 5 | -0.00 | -0.00 | +0.00 | 0 | 0 |
| frame differs / room_down | 5 | -2.75 | -2.75 | -1.75 | 5 | 5 |
| frame differs / room_up | 5 | +0.00 | +0.00 | +0.00 | 0 | 0 |
| frame==census / FL | 79 | -0.25 | +0.00 | +0.25 | 2 | 0 |
| frame==census / FR | 79 | -0.25 | +0.00 | +0.25 | 3 | 0 |
| frame==census / room_down | 79 | -0.25 | +0.00 | +0.25 | 0 | 0 |
| frame==census / room_up | 79 | -5.75 | +0.00 | +0.00 | 4 | 4 |
| re-based on census frame / room_down | 84 | -0.25 | -0.00 | +0.25 | 3 | 0 |
| re-based on census frame / room_up | 84 | -5.75 | +0.00 | +0.00 | 4 | 4 |

every open block with max |dev| > 0.25 (raw, then re-based room):
  5.750  CNX_Chem_14_03_FishLemon#9  raw={'FL': 0.005, 'FR': 0.004, 'room_up': -5.75, 'room_down': 0.0}  rebased={'room_up': -5.748, 'room_down': -0.002}  by={'left': 'hit', 'right': 'page', 'up': 'hit', 'down': 'page'}  key='Putrescinium ion'
  2.750  CNX_Chem_14_03_FishLemon#8  raw={'FL': -0.001, 'FR': 0.005, 'room_up': -2.75, 'room_down': 0.0}  rebased={'room_up': -2.748, 'room_down': -0.002}  by={'left': 'hit', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='Putrescine'
  2.750  CNX_Chem_14_03_FishLemon#7  raw={'FL': 0.004, 'FR': 0.001, 'room_up': -2.75, 'room_down': 0.0}  rebased={'room_up': -2.748, 'room_down': -0.002}  by={'left': 'hit', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='Acetate ion'
  2.750  CNX_Chem_14_03_FishLemon#6  raw={'FL': -0.0, 'FR': 0.005, 'room_up': -2.75, 'room_down': 0.0}  rebased={'room_up': -2.748, 'room_down': -0.002}  by={'left': 'page', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='Acetic acid'
  2.750  CNX_Chem_04_04_limiting#3  raw={'FL': 0.253, 'FR': 0.002, 'room_up': 0.0, 'room_down': -2.75}  rebased={'room_up': 0.002, 'room_down': -0.172}  by={'left': 'hit', 'right': 'page', 'up': 'hit', 'down': 'page'}  key='8 HCl and 2 H2'
  2.750  CNX_Chem_04_04_limiting#2  raw={'FL': -0.004, 'FR': -0.001, 'room_up': 0.0, 'room_down': -2.75}  rebased={'room_up': 0.002, 'room_down': -0.172}  by={'left': 'page', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='6 H2 and 4 Cl2'
  2.750  CNX_Chem_04_03_ethene_img#0  raw={'FL': -0.003, 'FR': -0.0, 'room_up': 0.0, 'room_down': -2.75}  rebased={'room_up': 0.002, 'room_down': -0.172}  by={'left': 'page', 'right': 'page', 'up': 'hit', 'down': 'hit'}  key='required to react with H2O to produce 9.55 g of'
  2.500  CNX_Chem_04_03_etheneBr_img#2  raw={'FL': 0.0, 'FR': -0.001, 'room_up': 0.0, 'room_down': -2.5}  rebased={'room_up': 0.002, 'room_down': 0.078}  by={'left': 'page', 'right': 'page', 'up': 'hit', 'down': 'page'}  key='with an excess of Br2.'
  1.750  CNX_Chem_04_05_combustion#2  raw={'FL': -0.004, 'FR': 0.001, 'room_up': 0.0, 'room_down': -1.75}  rebased={'room_up': 0.003, 'room_down': -0.171}  by={'left': 'hit', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='H2O absorber|such as |Mg(ClO4)2'
  0.254  CNX_Chem_04_05_combustion#0  raw={'FL': 0.004, 'FR': -0.254, 'room_up': 0.0, 'room_down': 0.0}  rebased={'room_up': 0.0, 'room_down': -0.0}  by={'left': 'page', 'right': 'hit', 'up': 'page', 'down': 'hit'}  key='Furnace'
  0.252  CNX_Chem_04_01_rxn2#12  raw={'FL': -0.0, 'FR': 0.252, 'room_up': 0.0, 'room_down': 0.0}  rebased={'room_up': -0.002, 'room_down': 0.002}  by={'left': 'page', 'right': 'hit', 'up': 'hit', 'down': 'hit'}  key='Coefficient'
  0.252  CNX_Chem_04_01_rxn2#11  raw={'FL': 0.252, 'FR': -0.0, 'room_up': 0.0, 'room_down': 0.0}  rebased={'room_up': -0.001, 'room_down': 0.001}  by={'left': 'hit', 'right': 'hit', 'up': 'page', 'down': 'hit'}  key='Reactant'
  0.251  CNX_Chem_04_01_rxn2#15  raw={'FL': -0.251, 'FR': 0.001, 'room_up': 0.0, 'room_down': 0.0}  rebased={'room_up': -0.002, 'room_down': 0.002}  by={'left': 'hit', 'right': 'page', 'up': 'hit', 'down': 'hit'}  key='Coefficient'
  0.251  CNX_Chem_04_01_rxn2#9  raw={'FL': 0.003, 'FR': -0.251, 'room_up': 0.0, 'room_down': 0.0}  rebased={'room_up': -0.003, 'room_down': 0.003}  by={'left': 'page', 'right': 'hit', 'up': 'hit', 'down': 'page'}  key='Reactant side'
open blocks with every side within one 0.25 step: raw 70/84, room re-based on the census frame 72/84

## T5. alignment vs census
cell alignments compared: 26; differ: 0
open alignments compared: 84; differ: 2
   ('CNX_Chem_04_01_rxn2#11', 'Reactant', 'right', 'center', 'single-cue(L0C0R0)->center', 'single-cue-right-only->right')
   ('CNX_Chem_04_01_rxn2#12', 'Coefficient', 'right', 'center', 'single-cue(L0C0R0)->center', 'single-cue-right-only->right')
open blocks with the SAME verdict for a DIFFERENT reason: 0
open alignment reasons: {'multi->center': 27, 'single-cue->center': 38, 'single-flush->left': 7, 'single-cue-left-only->left->left': 4, 'single-flush->right': 2, 'multi-ambiguous->center': 2, 'multi->left': 4}
box alignment: {'center': 66}

## T6. flush-rule inputs, single-line open blocks: mine vs census (tight <= 4.75 and ratio >= 20)
| block | key | L mine | L census | R mine | R census | tight mine | ratio mine | flush mine | flush census | near threshold |
|---|---|---|---|---|---|---|---|---|---|---|
| CNX_Chem_03_01_exocytosis-88f6#0 | 'Synapse' | 3.00 | 3.00 | 69.75 | 69.75 | 3.00 | 23.2 | True | True | False |
| CNX_Chem_03_01_exocytosis-88f6#1 | 'Vesicles' | 3.00 | 3.00 | 76.00 | 76.00 | 3.00 | 25.3 | True | True | False |
| CNX_Chem_03_01_exocytosis-88f6#2 | 'Neuron' | 103.50 | 103.50 | 3.25 | 3.25 | 3.25 | 31.8 | True | True | False |
| CNX_Chem_04_03_etheneBr_img#1 | 'The number of moles and ' | 0.00 | 0.00 | 15.00 | 15.00 | 0.00 | inf | True | True | False |
| CNX_Chem_04_03_etheneBr_img#2 | 'with an excess of Br2.' | 0.00 | 0.00 | 381.00 | 381.00 | 0.00 | inf | True | True | False |
| CNX_Chem_04_04_sandwich#0 | 'Provided with:' | 2.75 | 2.75 | 57.50 | 57.75 | 2.75 | 20.9 | True | True | True |
| CNX_Chem_04_04_sandwich#2 | 'We can make:' | 2.75 | 2.75 | 56.75 | 57.00 | 2.75 | 20.6 | True | True | True |
| CNX_Chem_04_04_sandwich#5 | '+ 6 slices bread left ov' | 188.75 | 188.75 | 4.75 | 4.75 | 4.75 | 39.7 | True | True | True |
| CNX_Chem_04_04_sandwich#6 | '1 sandwich = 2 slices of' | 2.75 | 2.75 | 264.50 | 264.50 | 2.75 | 96.2 | True | True | False |
(rows shown: flush on either side, near a threshold, or a clearance off by > 0.25) single-line open blocks: 51; near threshold: 3; |L-census|>0.25: 0; |R-census|>0.25: 0

## T7. single-line cells: margin ratio mine vs census (CELL_RATIO 20)
| block | key | ml mine | mr mine | ratio mine | ratio census | align mine | align census |
|---|---|---|---|---|---|---|---|
| CNX_Chem_03_01_alsulfatemass_img#0 | 'Element' | 4.23 | 3.26 | 1.30 | 1.214 | center | center |
| CNX_Chem_03_01_alsulfatemass_img#1 | 'Quantity' | 4.90 | 6.02 | 1.23 | 1.2 | center | center |
| CNX_Chem_03_01_alsulfatemass_img#13 | 'Molecular mass' | 131.44 | 2.44 | 53.91 | 52.6 | right | right |
| CNX_Chem_03_01_aspirin#0 | 'Element' | 4.24 | 3.26 | 1.30 | 1.214 | center | center |
| CNX_Chem_03_01_aspirin#1 | 'Quantity' | 4.90 | 6.02 | 1.23 | 1.2 | center | center |
| CNX_Chem_03_01_aspirin#13 | 'Molecular mass' | 131.45 | 2.43 | 54.06 | 52.6 | right | right |
| CNX_Chem_03_01_brain-ec0b#0 | 'Neuron cells' | 6.44 | 27.07 | 4.20 | 3.973 | center | center |
| CNX_Chem_03_01_chloroform#0 | 'Element' | 4.24 | 3.26 | 1.30 | 1.308 | center | center |
| CNX_Chem_03_01_chloroform#1 | 'Quantity' | 4.90 | 6.02 | 1.23 | 1.2 | center | center |
| CNX_Chem_03_01_chloroform#13 | 'Molecular mass' | 131.44 | 2.44 | 53.92 | 52.6 | right | right |
| CNX_Chem_03_01_glycinemass_img#0 | 'Element' | 4.24 | 3.26 | 1.30 | 1.214 | center | center |
| CNX_Chem_03_01_glycinemass_img#13 | 'Molecular mass (g/mol compound' | 78.58 | 2.29 | 34.25 | 31.5 | right | right |
| CNX_Chem_03_01_saltMass#0 | 'Element' | 4.24 | 3.26 | 1.30 | 1.308 | center | center |
| CNX_Chem_03_01_saltMass#1 | 'Quantity' | 4.90 | 6.02 | 1.23 | 1.2 | center | center |
| CNX_Chem_03_01_saltMass#10 | 'Formula mass' | 135.42 | 4.97 | 27.26 | 27.1 | right | right |
| CNX_Chem_03_01_saltMass#3 | 'Subtotal' | 7.15 | 3.59 | 1.99 | 1.867 | center | center |

## T8. multi-line verdicts: min/max adv line extents (figcontainers) vs FT.alignment(block, adv)
multi-line cell/open blocks: 43; unambiguous verdict == FT.alignment(adv): 41; ambiguous->center: 2; unambiguous and different: 0
  ambiguous ('CNX_Chem_04_05_combmap_img#11', 'open', 'center', 'multi-ambiguous(margin 0.39)->center', 'center')
  ambiguous ('CNX_Chem_04_05_combmap_img#13', 'open', 'center', 'multi-ambiguous(margin 0.39)->center', 'center')

## T9. SPAN counterfactual: blocks whose class changes with the span test disabled
changed: 11 {('open', 'cell'): 11}
   ('CNX_Chem_03_01_exocytosis-88f6#0', 'Synapse', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_03_01_exocytosis-88f6#4', 'Neuron', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_03_03_empform#1', 'Divide by|molar mass', 'open', 'no-container (refused: rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_03_flowchart#13', 'Molarity', 'open', 'no-container (refused: rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_03_flowchart#14', 'Molarity', 'open', 'no-container (refused: rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_03_map2_img#3', 'Molar mass', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_03_map3_img#3', 'Molar mass', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_05_combmap_img#11', 'Molar|mass', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_05_combmap_img#12', 'Stoichiometric|factor', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_05_map7_img#3', 'Molar|concentration', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')
   ('CNX_Chem_04_05_map8_img#1', 'Stoichiometric|factor', 'open', 'no-container (refused: area, rules-not-spanning)', 'cell', 'rules')

## T10. wall time per figure (s): load_page, png open+L, container_for over layout blocks (sum / max per block)
| figure | layout blocks | all blocks | rects/curves/lines | load_page | png | container_for sum | max per block |
|---|---|---|---|---|---|---|---|
| CNX_Chem_03_01_alsulfatemass_img | 5 | 24 | 5/0/11 | 0.062 | 0.009 | 0.000 | 0.000 |
| CNX_Chem_03_01_aspirin | 5 | 24 | 3/0/11 | 0.003 | 0.006 | 0.000 | 0.000 |
| CNX_Chem_03_01_brain-ec0b | 1 | 3 | 1/6/2 | 0.014 | 0.015 | 0.000 | 0.000 |
| CNX_Chem_03_01_chloroform | 5 | 24 | 3/0/11 | 0.003 | 0.004 | 0.000 | 0.000 |
| CNX_Chem_03_01_exocytosis-88f6 | 5 | 7 | 2/423/6 | 0.651 | 0.016 | 0.064 | 0.009 |
| CNX_Chem_03_01_glycinemass_img | 5 | 30 | 5/0/12 | 0.005 | 0.006 | 0.001 | 0.000 |
| CNX_Chem_03_01_saltMass | 5 | 18 | 3/0/10 | 0.004 | 0.007 | 0.000 | 0.000 |
| CNX_Chem_03_02_argon_img-9025 | 3 | 3 | 1/5/1 | 0.004 | 0.002 | 0.002 | 0.001 |
| CNX_Chem_03_02_copperMoles_img-a962 | 5 | 5 | 1/8/2 | 0.005 | 0.002 | 0.008 | 0.003 |
| CNX_Chem_03_02_glycine_img-7c96 | 3 | 3 | 1/5/1 | 0.004 | 0.002 | 0.002 | 0.001 |
| CNX_Chem_03_02_potassium_img-f1d1 | 3 | 3 | 1/5/1 | 0.004 | 0.002 | 0.002 | 0.001 |
| CNX_Chem_03_02_sacch_img-3278 | 5 | 5 | 1/8/2 | 0.005 | 0.002 | 0.006 | 0.002 |
| CNX_Chem_03_02_vitC_img-e537 | 3 | 3 | 1/5/1 | 0.004 | 0.002 | 0.002 | 0.001 |
| CNX_Chem_03_03_empform | 10 | 10 | 0/18/3 | 0.008 | 0.004 | 0.018 | 0.003 |
| CNX_Chem_03_05_Example2_img | 5 | 5 | 1/8/2 | 0.005 | 0.002 | 0.008 | 0.002 |
| CNX_Chem_04_01_rxn2 | 8 | 16 | 0/10/2 | 0.014 | 0.006 | 0.078 | 0.007 |
| CNX_Chem_04_01_rxn3 | 2 | 2 | 0/1/1 | 0.016 | 0.013 | 0.030 | 0.008 |
| CNX_Chem_04_03_etheneBr_img | 3 | 17 | 0/0/13 | 0.010 | 0.002 | 0.029 | 0.008 |
| CNX_Chem_04_03_ethene_img | 2 | 18 | 0/0/14 | 0.010 | 0.002 | 0.018 | 0.005 |
| CNX_Chem_04_03_flowchart | 19 | 19 | 0/40/10 | 0.016 | 0.011 | 0.126 | 0.011 |
| CNX_Chem_04_03_map2_img | 7 | 7 | 1/11/3 | 0.013 | 0.009 | 0.036 | 0.011 |
| CNX_Chem_04_03_map3_img | 7 | 7 | 1/11/3 | 0.007 | 0.005 | 0.026 | 0.006 |
| CNX_Chem_04_03_moleratio1_img | 3 | 3 | 1/5/1 | 0.005 | 0.002 | 0.005 | 0.003 |
| CNX_Chem_04_03_moleratio2_img | 5 | 5 | 1/8/2 | 0.006 | 0.007 | 0.022 | 0.006 |
| CNX_Chem_04_04_limiting | 4 | 4 | 0/1/1 | 0.014 | 0.015 | 0.132 | 0.019 |
| CNX_Chem_04_04_sandwich | 7 | 7 | 0/220/0 | 0.217 | 0.024 | 0.130 | 0.016 |
| CNX_Chem_04_05_combmap_img | 15 | 15 | 1/31/9 | 0.011 | 0.007 | 0.036 | 0.007 |
| CNX_Chem_04_05_combustion | 6 | 7 | 2/301/10 | 0.130 | 0.011 | 0.117 | 0.019 |
| CNX_Chem_04_05_map7_img | 7 | 7 | 1/11/3 | 0.011 | 0.007 | 0.040 | 0.010 |
| CNX_Chem_04_05_map8_img | 9 | 9 | 1/14/4 | 0.012 | 0.007 | 0.060 | 0.010 |
| CNX_Chem_14_03_FishLemon | 4 | 12 | 0/2/2 | 0.015 | 0.047 | 0.033 | 0.007 |
total container_for: 1.031 s; total load_page: 1.291 s
figures over 5 s (load + png + container_for): []
```
(First run: total container_for 0.592 s, total load_page 1.021 s, exocytosis load_page 0.610 s — the machine is shared.)

## Obstacle variants — `obstacle_variants.py` (verbatim)

| obstacle variant | FL within 0.25 | FR within 0.25 | room_up within 0.25 | room_down within 0.25 (re-based) | all four within 0.25 | blocks off by > 0.25 (side: dev) |
|---|---|---|---|---|---|---|
| run-box (each run its own glyph box) | 84/84 | 84/84 | 80/84 | 84/84 | 80/84 | 14_03_FishLemon#6 up -2.75; 14_03_FishLemon#7 up -2.75; 14_03_FishLemon#8 up -2.75; 14_03_FishLemon#9 up -5.75 |
| per-run | 84/84 | 84/84 | 80/84 | 84/84 | 80/84 | 14_03_FishLemon#6 up -2.75; 14_03_FishLemon#7 up -2.75; 14_03_FishLemon#8 up -2.75; 14_03_FishLemon#9 up -5.75 |
| l0size | 84/84 | 84/84 | 84/84 | 84/84 | 84/84 | - |
| maxsize | 84/84 | 84/84 | 84/84 | 84/84 | 84/84 | - |
| freev1 | 84/84 | 84/84 | 84/84 | 84/84 | 84/84 | - |

(The march start frame is the contract's per-run source_frame in every variant; up/down are re-based on the census frame, 0.01 slack.)

## All 367 blocks — `all_blocks.py` (verbatim)

```
figures: 34 blocks: 367
raised: []
error branch: []
classes: {'cell': 119, 'open': 182, 'box': 66}
why: {'rules': 113, 'fill-rect': 6, 'no-container': 178, 'stroked-closed': 66, 'rotated': 4}
| figure | blocks | load (pdf+png) s | container_for all blocks s |
|---|---|---|---|
| CNX_Chem_03_01_alsulfatemass_img | 24 | 0.060 | 0.001 |
| CNX_Chem_03_01_aspirin | 24 | 0.007 | 0.001 |
| CNX_Chem_03_01_brain-ec0b | 3 | 0.028 | 0.009 |
| CNX_Chem_03_01_chloroform | 24 | 0.007 | 0.001 |
| CNX_Chem_03_01_exocytosis-88f6 | 7 | 0.844 | 0.036 |
| CNX_Chem_03_01_glycinemass_img | 30 | 0.008 | 0.010 |
| CNX_Chem_03_01_saltMass | 18 | 0.008 | 0.001 |
| CNX_Chem_03_02_argon_img-9025 | 3 | 0.004 | 0.001 |
| CNX_Chem_03_02_copperMoles_img-a962 | 5 | 0.005 | 0.003 |
| CNX_Chem_03_02_glycine_img-7c96 | 3 | 0.004 | 0.001 |
| CNX_Chem_03_02_potassium_img-f1d1 | 3 | 0.004 | 0.001 |
| CNX_Chem_03_02_sacch_img-3278 | 5 | 0.005 | 0.002 |
| CNX_Chem_03_02_vitC_img-e537 | 3 | 0.004 | 0.001 |
| CNX_Chem_03_03_empform | 10 | 0.009 | 0.007 |
| CNX_Chem_03_05_Example2_img | 5 | 0.006 | 0.003 |
| CNX_Chem_04_01_basehyd_img | 26 | 0.025 | 0.083 |
| CNX_Chem_04_01_rxn2 | 16 | 0.015 | 0.066 |
| CNX_Chem_04_01_rxn3 | 2 | 0.024 | 0.012 |
| CNX_Chem_04_02_HClsoln | 9 | 0.075 | 0.036 |
| CNX_Chem_04_03_etheneBr_img | 17 | 0.011 | 0.065 |
| CNX_Chem_04_03_ethene_img | 18 | 0.010 | 0.055 |
| CNX_Chem_04_03_flowchart | 19 | 0.022 | 0.037 |
| CNX_Chem_04_03_map2_img | 7 | 0.010 | 0.009 |
| CNX_Chem_04_03_map3_img | 7 | 0.009 | 0.009 |
| CNX_Chem_04_03_moleratio1_img | 3 | 0.004 | 0.002 |
| CNX_Chem_04_03_moleratio2_img | 5 | 0.007 | 0.007 |
| CNX_Chem_04_04_GreenChem | 10 | 0.043 | 0.057 |
| CNX_Chem_04_04_limiting | 4 | 0.018 | 0.023 |
| CNX_Chem_04_04_sandwich | 7 | 0.167 | 0.052 |
| CNX_Chem_04_05_combmap_img | 15 | 0.019 | 0.021 |
| CNX_Chem_04_05_combustion | 7 | 0.116 | 0.043 |
| CNX_Chem_04_05_map7_img | 7 | 0.011 | 0.012 |
| CNX_Chem_04_05_map8_img | 9 | 0.014 | 0.018 |
| CNX_Chem_14_03_FishLemon | 12 | 0.059 | 0.030 |
total container_for s: 0.712  max figure: CNX_Chem_03_01_exocytosis-88f6 0.88
```

## The module — `figcontainers.py` (verbatim)

```python
"""figcontainers - per-block container detection for TRANSLATED figure labels (§C140 ③).

Answers, for one text block of one figure, "what is this label drawn inside?" so that
figlayout.decide() can choose a wrap budget, an anchor and a size:

  box   a single closed path with a visible stroke encloses the label (a schematic box).
        Every line is centred in it (ruling R2).
  cell  a table cell: the label is bounded on all four sides by rule segments that do not form
        one closed path, or it sits on a fill-only rect (a label patch). The source alignment is
        kept (ruling R3).
  open  anything else. The label gets a FREE BOX: clearance from its source frame, in the
        block's own rotation, to dark artwork, another block's source line box, or the page
        edge.

Detection is per block, at compose time, from the text-stripped artwork (artwork.pdf through
pdfplumber for the vector shapes, artwork.png through Pillow for the dark pixels). It is never
precomputed and never keyed on a block index: the prototype's precomputed census crashed a whole
figure with a KeyError the moment an identity label was edited into a translation.

container_for() NEVER raises. A block that cannot be classified is 'open', and an exception
anywhere becomes an 'open' container whose `why` is 'error: <ExceptionType>' with ZERO free room,
so the layout step overhangs and NAMES the label (R5) instead of silently drawing it across
whatever it would have hit.

SOURCE GEOMETRY COMES FROM THE PDF'S OWN ADVANCES (run['adv']), NEVER FROM A CAIRO MEASURE.
  frame of a block (or of one line)  along  [min FT.along(r), max FT.along(r) + r['adv']]
                                     normal [min FT.proj(r) - DESC*size, max FT.proj(r) + ASC*size]
  - per RUN, so a subscript run's glyph box pulls the lower edge down. (The raster census
    used the line's first-run projection minus DESC * the line's largest size instead; on the
    34 bought figures the two differ on 26 blocks, by 1.58-2.58 pt on n0 only.)

Coordinates: pdfplumber's x0/y0/x1/y1, y UP - the reader runs.json itself comes from
(readlayer.py), so runs and shapes share one space; the page-edge test assumes that space starts
at (0, 0), which load_page records as 'bbox'. pdfplumber's `pts` and `path` points are y DOWN;
they are used ONLY to decide whether a path is closed (first == last is frame-invariant), never
for geometry.

The page dict classify() expects (load_page builds it; tests plant it by hand):
  {'width': W, 'height': H, 'bbox': (x0, y0, x1, y1),
   'rects': [obj], 'curves': [obj], 'lines': [obj]}
  obj = {'object_type': 'rect'|'curve'|'line', 'x0', 'y0', 'x1', 'y1',
         'stroke': bool, 'fill': bool, 'linewidth': float,
         'path': [op letter, ...]  (optional), 'pts': [(x, y), ...] (optional),
         'oid': int (optional; the owner identity for "four rules from ONE path")}

Constants are module globals read at CALL time (never bound as def-time defaults), so a test can
change one and see the consequence.
"""
import math

import figtext as FT

# --- source glyph box ------------------------------------------------------------------------
ASC, DESC = 0.73, 0.21
S = 200 / 72.0            # artwork.png is rendered at 200 dpi

# --- container detection ---------------------------------------------------------------------
TOL = 0.5                 # frame enclosure slack (pt)
SPAN = 1.0                # a cell rule must span the cell to within this (pt) - see classify()
AREA_MAX = 0.25           # a candidate covering >= this fraction of the page is not a container
EDGE = 0.25               # a candidate side within this of the page edge is not a container
MIN_RULE = 1.0            # every container side is pulled in by max(linewidth, MIN_RULE)/2
RULE_THIN = 1.0           # a segment / rect thinner than this (pt) is a rule
ROT_SNAP = 0.5            # box/cell only when rot is within this of a multiple of 90 degrees

# --- alignment -------------------------------------------------------------------------------
SIBLING_TOL = 0.2         # a sibling edge coincides within this (pt) - MEASURED, see open_alignment()
SIBLING_ROT = 3.0         # siblings must share the rotation within this (degrees)
FLUSH_TIGHT = 4.75        # single-line open label flush against an obstacle: tight side <= this
FLUSH_RATIO = 20.0        # ... and far / tight >= this
CELL_RATIO = 20.0         # single-line cell: far / tight source margin >= this -> flush to tight side
AMBIG = 0.5               # multi-line: two smallest spreads differ by < this -> centre

# --- free-box march --------------------------------------------------------------------------
MARCH_STEP = 0.25         # pt
MARCH_LIMIT = 600.0       # pt
DARK_LEVEL = 128          # dark := L < 128
SIDE_SAMPLES = 7          # rays per left/right side, across the normal extent
END_SAMPLES = 11          # rays per up/down side, across the along extent
EPS = 1e-9


# =============================================================================================
# geometry
# =============================================================================================

def source_frame(block):
    """(a0, a1, n0, n1) of a block - or of one line - in its own (along, normal) frame, from the
    PDF's advances. Per run: a script run's glyph box counts where it is drawn."""
    a0 = min(FT.along(r) for r in block)
    a1 = max(FT.along(r) + r['adv'] for r in block)
    n0 = min(FT.proj(r) - DESC * r['size'] for r in block)
    n1 = max(FT.proj(r) + ASC * r['size'] for r in block)
    return a0, a1, n0, n1


def _to_page(a, n, rot):
    t = math.radians(rot)
    return a * math.cos(t) - n * math.sin(t), a * math.sin(t) + n * math.cos(t)


def _to_frame(x, y, rot):
    t = math.radians(rot)
    return x * math.cos(t) + y * math.sin(t), -x * math.sin(t) + y * math.cos(t)


def page_bbox(block):
    """The source frame's axis-aligned page bbox (x0, y0, x1, y1), PDF y-up."""
    a0, a1, n0, n1 = source_frame(block)
    rot = block[0]['rot']
    pts = [_to_page(a, n, rot) for a in (a0, a1) for n in (n0, n1)]
    return (min(p[0] for p in pts), min(p[1] for p in pts),
            max(p[0] for p in pts), max(p[1] for p in pts))


def _axis_aligned(rot):
    """rot within ROT_SNAP of a multiple of 90 degrees."""
    return abs(((rot + 45.0) % 90.0) - 45.0) <= ROT_SNAP


def _inner_to_frame(inner, rot):
    """Map a page-space inner rect into the block's (along, normal) frame -> (L, R, D, U).

    Of the four corners' projections the 2nd and 3rd sorted values are taken, not min/max:
    at an exact multiple of 90 degrees the corners pair up and this is exact; within the
    ROT_SNAP tolerance it is the conservative (inscribed) bound, so a label laid out in it
    cannot cross the slightly-rotated side."""
    x0, y0, x1, y1 = inner
    cs = [_to_frame(x, y, rot) for x in (x0, x1) for y in (y0, y1)]
    As = sorted(c[0] for c in cs)
    Ns = sorted(c[1] for c in cs)
    return As[1], As[2], Ns[1], Ns[2]


def line_frames(block):
    """source_frame of each FT.lines line of the block."""
    return [source_frame(l) for l in FT.lines(block)]


# =============================================================================================
# page loading
# =============================================================================================

def _copy_obj(o, oid):
    path = o.get('path') or []
    return {
        'oid': oid,
        'object_type': o.get('object_type'),
        'x0': float(o['x0']), 'y0': float(o['y0']), 'x1': float(o['x1']), 'y1': float(o['y1']),
        'stroke': bool(o.get('stroke')),
        'fill': bool(o.get('fill')),
        'linewidth': float(o.get('linewidth') or 0.0),
        'path': [seg[0] if isinstance(seg, (tuple, list)) else seg for seg in path],
        'pts': [(float(p[0]), float(p[1])) for p in (o.get('pts') or [])],
    }


def load_page(pdf_path):
    """Open the stripped artwork PDF ONCE and copy page 1's vector objects into plain dicts
    (see the module docstring for the shape). pdfplumber is imported here so the rest of the
    module - and its unit tests - never need it."""
    import pdfplumber
    oid = 0
    out = {}
    with pdfplumber.open(str(pdf_path)) as pdf:
        p = pdf.pages[0]
        out['width'] = float(p.width)
        out['height'] = float(p.height)
        out['bbox'] = tuple(float(v) for v in p.bbox)
        for kind in ('rects', 'curves', 'lines'):
            objs = []
            for o in getattr(p, kind):
                objs.append(_copy_obj(o, oid))
                oid += 1
            out[kind] = objs
    return out


# =============================================================================================
# classification
# =============================================================================================

def _closed(o):
    if o.get('object_type') == 'rect':
        return True
    path = o.get('path') or []
    if path:
        last = path[-1]
        op = last[0] if isinstance(last, (tuple, list)) else last
        if op == 'h':
            return True
    pts = o.get('pts') or []
    return (len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 0.01
            and abs(pts[0][1] - pts[-1][1]) < 0.01)


def _area(bb):
    return (bb[2] - bb[0]) * (bb[3] - bb[1])


def _at_edge(bb, W, H):
    return bb[0] <= EDGE or bb[1] <= EDGE or bb[2] >= W - EDGE or bb[3] >= H - EDGE


def _encloses(bb, fr):
    return (bb[0] <= fr[0] + TOL and bb[2] >= fr[2] - TOL
            and bb[1] <= fr[1] + TOL and bb[3] >= fr[3] - TOL)


def classify(page, bbox):
    """(cls, inner, why) for a label whose source frame has page bbox `bbox`.

    cls   'box' | 'cell' | 'open'
    inner (x0, y0, x1, y1) in page coordinates AFTER the inset, or None for 'open'.

    Candidates, the smallest-area one wins (a box beats a cell of equal area):
      box        a rect or curve that is STROKED and CLOSED and encloses the frame (+TOL).
                 Inset by max(linewidth, MIN_RULE)/2 on every side: the stroke straddles the
                 path, and a hairline is still a visible edge.
      fill-rect  a rect that is filled, NOT stroked, and encloses the frame - a label patch or
                 a shaded table cell. Inset by MIN_RULE/2: it has no stroke, and on the bought
                 figures its raw bbox sat 0.34-0.72 pt outside the edge of the visible cell.
      rules      the nearest rule segment on each of the four sides - page lines, thin rects
                 (centre line, half-thickness = max(thickness, MIN_RULE)/2) and the four
                 sides of every stroked closed path - where the four do NOT all come from ONE
                 path (that is a box). Inset by each side's own half-thickness.
    Every candidate is refused when it covers >= AREA_MAX of the page (the page frame or a
    whole-table background) or when a side lies within EDGE of the page edge (the page's own
    background rect, not a container).

    WHY THE RULES BRANCH REQUIRES EACH RULE TO SPAN THE CELL (to within SPAN): four segments
    that merely bracket a label are not a cell. Without the span test, 11 open labels on the 34
    bought figures became cells: 9 arrow labels BETWEEN boxes on the flow maps ('Molar mass',
    'Molarity', 'Stoichiometric factor', ...), bracketed left and right by the neighbouring
    boxes' edges and above and below by arrow lines that do not enclose them, and 2 exocytosis
    labels bracketed by the bbox sides of illustration paths. A table cell's rules run the full
    length of the cell's sides; an arrow line stops short of the box it points at.
    """
    W, H = float(page['width']), float(page['height'])
    parea = W * H
    fr = bbox
    cands = []
    refused = set()
    objs = list(page['rects']) + list(page['curves'])

    for o in objs:
        bb = (o['x0'], o['y0'], o['x1'], o['y1'])
        if not _encloses(bb, fr):
            continue
        stroked_closed = bool(o.get('stroke')) and _closed(o)
        fill_rect = bool(o.get('fill')) and not o.get('stroke') and o.get('object_type') == 'rect'
        if not (stroked_closed or fill_rect):
            continue
        if _area(bb) >= AREA_MAX * parea:
            refused.add('area')
            continue
        if _at_edge(bb, W, H):
            refused.add('page-edge')
            continue
        if stroked_closed:
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            cands.append(('box', _area(bb), (bb[0] + h, bb[1] + h, bb[2] - h, bb[3] - h), 'stroked-closed'))
        else:
            h = MIN_RULE / 2
            cands.append(('cell', _area(bb), (bb[0] + h, bb[1] + h, bb[2] - h, bb[3] - h), 'fill-rect'))

    # rule segments: (x0, y0, x1, y1, owner, half-thickness)
    segs = []
    for o in page['lines']:
        owner = o.get('oid', id(o))
        segs.append((min(o['x0'], o['x1']), min(o['y0'], o['y1']),
                     max(o['x0'], o['x1']), max(o['y0'], o['y1']),
                     owner, max(o.get('linewidth') or 0.0, MIN_RULE) / 2))
    for o in objs:
        owner = o.get('oid', id(o))
        x0, y0, x1, y1 = o['x0'], o['y0'], o['x1'], o['y1']
        if o.get('object_type') == 'rect' and ((x1 - x0) < RULE_THIN or (y1 - y0) < RULE_THIN):
            h = max(min(x1 - x0, y1 - y0), MIN_RULE) / 2
            if x1 - x0 < RULE_THIN:
                xm = (x0 + x1) / 2
                segs.append((xm, y0, xm, y1, owner, h))
            else:
                ym = (y0 + y1) / 2
                segs.append((x0, ym, x1, ym, owner, h))
        elif o.get('stroke') and _closed(o):
            h = max(o.get('linewidth') or 0.0, MIN_RULE) / 2
            segs += [(x0, y0, x0, y1, owner, h), (x1, y0, x1, y1, owner, h),
                     (x0, y0, x1, y0, owner, h), (x0, y1, x1, y1, owner, h)]

    cx, cy = (fr[0] + fr[2]) / 2, (fr[1] + fr[3]) / 2
    V = [s for s in segs if s[2] - s[0] < RULE_THIN and s[1] <= cy <= s[3]]
    Hz = [s for s in segs if s[3] - s[1] < RULE_THIN and s[0] <= cx <= s[2]]
    Ls = max((s for s in V if s[2] <= fr[0] + TOL), key=lambda s: s[0], default=None)
    Rs = min((s for s in V if s[0] >= fr[2] - TOL), key=lambda s: s[0], default=None)
    Ds = max((s for s in Hz if s[3] <= fr[1] + TOL), key=lambda s: s[1], default=None)
    Us = min((s for s in Hz if s[1] >= fr[3] - TOL), key=lambda s: s[1], default=None)
    if None not in (Ls, Rs, Ds, Us):
        bb = ((Ls[0] + Ls[2]) / 2, (Ds[1] + Ds[3]) / 2, (Rs[0] + Rs[2]) / 2, (Us[1] + Us[3]) / 2)
        spans = (all(s[1] <= bb[1] + SPAN and s[3] >= bb[3] - SPAN for s in (Ls, Rs))
                 and all(s[0] <= bb[0] + SPAN and s[2] >= bb[2] - SPAN for s in (Ds, Us)))
        one_path = len({Ls[4], Rs[4], Ds[4], Us[4]}) == 1
        if not spans:
            refused.add('rules-not-spanning')
        elif one_path:
            pass          # the four sides of one closed path: the box branch owns it
        elif _area(bb) >= AREA_MAX * parea:
            refused.add('rules-area')
        elif _at_edge(bb, W, H):
            refused.add('rules-page-edge')
        else:
            cands.append(('cell', _area(bb),
                          (bb[0] + Ls[5], bb[1] + Ds[5], bb[2] - Rs[5], bb[3] - Us[5]), 'rules'))

    if not cands:
        why = 'no-container' + (' (refused: ' + ', '.join(sorted(refused)) + ')' if refused else '')
        return 'open', None, why
    cls, _, inner, why = min(cands, key=lambda c: (c[1], 0 if c[0] == 'box' else 1))
    return cls, inner, why


# =============================================================================================
# alignment
# =============================================================================================

def multi_alignment(frames):
    """Alignment of a multi-line source label from its line frames (adv-based).

    Spreads of the line starts / centres / ends; the smallest wins - FT.alignment's verdict
    with adv widths - unless the two smallest spreads differ by < AMBIG, which is no evidence
    either way: centre."""
    starts = [f[0] for f in frames]
    ends = [f[1] for f in frames]
    cents = [(s + e) / 2 for s, e in zip(starts, ends)]
    spread = lambda v: max(v) - min(v)
    sp = {'left': spread(starts), 'center': spread(cents), 'right': spread(ends)}
    order = sorted(sp, key=sp.get)            # stable: left, center, right on ties
    margin = sp[order[1]] - sp[order[0]]
    if margin < AMBIG:
        return 'center', f'multi-ambiguous(margin {margin:.2f})->center'
    return order[0], f'multi(margin {margin:.2f})->{order[0]}'


def _ratio(tight, far):
    return far / tight if tight > 0 else float('inf')


def cell_alignment(block, left_margin, right_margin):
    """R3: a table cell keeps the source alignment.
    multi-line  -> multi_alignment.
    single-line -> the source label's margins INSIDE THE CELL: far/tight >= CELL_RATIO is flush
                   to the tight side (a right-flush 'Molecular mass' against its number), else
                   centre. The sibling cue is NOT used for cells: glycinemass b13 has a left
                   sibling coincidence while its source is visibly right-flush."""
    frames = line_frames(block)
    if len(frames) >= 2:
        return multi_alignment(frames)
    tight, far = min(left_margin, right_margin), max(left_margin, right_margin)
    ratio = _ratio(tight, far)
    if ratio >= CELL_RATIO:
        side = 'left' if left_margin <= right_margin else 'right'
        return side, f'cell-single-margins(ratio {ratio:.1f})->{side}'
    return 'center', f'cell-single-margins(ratio {ratio:.2f})->center'


def sibling_cues(index, blocks):
    """(left, center, right): does this single-line label's left edge / centre / right edge
    coincide within SIBLING_TOL with a line edge of ANOTHER block of the same rotation?"""
    block = blocks[index]
    rot = block[0]['rot']
    m0, m1 = source_frame(block)[:2]
    mc = (m0 + m1) / 2
    cue = [False, False, False]
    for j, other in enumerate(blocks):
        if j == index or abs(other[0]['rot'] - rot) > SIBLING_ROT:
            continue
        for a0, a1, _, _ in line_frames(other):
            if abs(a0 - m0) <= SIBLING_TOL:
                cue[0] = True
            if abs((a0 + a1) / 2 - mc) <= SIBLING_TOL:
                cue[1] = True
            if abs(a1 - m1) <= SIBLING_TOL:
                cue[2] = True
    return tuple(cue)


def open_alignment(index, blocks, left_clear, right_clear):
    """Alignment of an OPEN label.
    multi-line  -> multi_alignment.
    single-line -> (1) FLUSH against an obstacle: tight side <= FLUSH_TIGHT and far/tight >=
                   FLUSH_RATIO stays flush to that side and grows away from it;
                   (2) a SIBLING-EDGE cue: exactly the left edge, or exactly the right edge,
                   coincides with another block's;
                   (3) centre.

    SIBLING_TOL IS MEASURED, NOT CHOSEN. The census's 0.5 re-aligned rxn2 'Reactant'/
    'Coefficient' (right edges 0.498 pt apart - coincidental) to the right, which moved the
    translation 'Stuðull' 7.6 pt off its brace in a figure [USER] had approved; ethene b0/b17
    (left edges 0.027 pt apart) are a real column and must cue. 0.2 separates the two."""
    frames = line_frames(blocks[index])
    if len(frames) >= 2:
        return multi_alignment(frames)
    tight, far = min(left_clear, right_clear), max(left_clear, right_clear)
    ratio = _ratio(tight, far)
    if tight <= FLUSH_TIGHT and ratio >= FLUSH_RATIO:
        side = 'left' if left_clear <= right_clear else 'right'
        return side, f'single-flush(tight {tight:.2f}, ratio {ratio:.1f})->{side}'
    cue = sibling_cues(index, blocks)
    if cue == (True, False, False):
        return 'left', 'single-cue-left-only->left'
    if cue == (False, False, True):
        return 'right', 'single-cue-right-only->right'
    return 'center', 'single-cue(L%dC%dR%d)->center' % tuple(int(c) for c in cue)


# =============================================================================================
# free box (open labels)
# =============================================================================================

def _obstacle(frame, rot):
    t = math.radians(rot)
    return (frame[0], frame[1], frame[2], frame[3], math.cos(t), math.sin(t))


def _inside(x, y, ob):
    a0, a1, n0, n1, c, s = ob
    a = x * c + y * s
    n = -x * s + y * c
    return a0 <= a <= a1 and n0 <= n <= n1


def _ray_meets(ob, x0, y0, dx, dy, limit):
    """Conservative pre-filter: can the ray (x0,y0)+d*(dx,dy), 0<=d<=limit, enter the obstacle?
    Slab test in the obstacle's frame, widened by a hair so it never drops an obstacle that the
    exact per-step _inside() test would hit."""
    a0, a1, n0, n1, c, s = ob
    pa, pn = x0 * c + y0 * s, -x0 * s + y0 * c
    va, vn = dx * c + dy * s, -dx * s + dy * c
    lo, hi = 0.0, limit
    for p, v, m0, m1 in ((pa, va, a0 - 1e-6, a1 + 1e-6), (pn, vn, n0 - 1e-6, n1 + 1e-6)):
        if abs(v) < 1e-12:
            if p < m0 or p > m1:
                return False
        else:
            t0, t1 = (m0 - p) / v, (m1 - p) / v
            if t0 > t1:
                t0, t1 = t1, t0
            lo, hi = max(lo, t0), min(hi, t1)
            if lo > hi:
                return False
    return True


def _march(px, wpx, hpx, page_h, obstacles, a, n, rot, da, dn):
    """Distance (pt, in MARCH_STEP steps) from (a, n) along (da, dn) in the block's frame to the
    first dark pixel or obstacle ('hit'), or to the last sample still on the page ('page')."""
    t = math.radians(rot)
    c, s = math.cos(t), math.sin(t)
    x0, y0 = a * c - n * s, a * s + n * c
    dx, dy = da * c - dn * s, da * s + dn * c
    near = [ob for ob in obstacles if _ray_meets(ob, x0, y0, dx, dy, MARCH_LIMIT)]
    k = 0
    while k * MARCH_STEP < MARCH_LIMIT:
        d = k * MARCH_STEP
        x, y = x0 + dx * d, y0 + dy * d
        ix, iy = math.floor(x * S), math.floor((page_h - y) * S)
        if not (0 <= ix < wpx and 0 <= iy < hpx):
            return max(d - MARCH_STEP, 0.0), 'page'
        if px[ix, iy] < DARK_LEVEL or any(_inside(x, y, ob) for ob in near):
            return d, 'hit'
        k += 1
    return k * MARCH_STEP, 'page'


def _samples(lo, hi, k):
    if hi - lo < 1e-6:
        return [lo]
    return [lo + 0.15 * (hi - lo) + i * (0.7 * (hi - lo)) / (k - 1) for i in range(k)]


def free_box(index, blocks, dark, page_h):
    """Free box of an open label, in its own rotation. Rays leave the source frame's four sides
    (SIDE_SAMPLES across the normal extent for left/right, END_SAMPLES across the along extent
    for up/down, each spread over the middle 70 %) and stop at the first dark pixel of `dark`
    (a Pillow 'L' image of artwork.png, L < DARK_LEVEL), the first point inside ANOTHER block's
    source line frame, or the page edge. Each side's clearance is the minimum over its rays.

    Returns FL, FR (along coordinates of the free box's left/right edges), room_up, room_down,
    free_left_clear, free_right_clear, and the per-side stop reason ('hit' if any ray hit)."""
    px = dark.load()
    wpx, hpx = dark.size
    block = blocks[index]
    rot = block[0]['rot']
    a0, a1, n0, n1 = source_frame(block)
    obstacles = [_obstacle(f, other[0]['rot'])
                 for j, other in enumerate(blocks) if j != index
                 for f in line_frames(other)]

    def side(starts):
        res = [_march(px, wpx, hpx, page_h, obstacles, a, n, rot, da, dn) for a, n, da, dn in starts]
        return min(r[0] for r in res), ('hit' if any(r[1] == 'hit' for r in res) else 'page')

    L, Lby = side([(a0, n, -1.0, 0.0) for n in _samples(n0, n1, SIDE_SAMPLES)])
    R, Rby = side([(a1, n, 1.0, 0.0) for n in _samples(n0, n1, SIDE_SAMPLES)])
    U, Uby = side([(a, n1, 0.0, 1.0) for a in _samples(a0, a1, END_SAMPLES)])
    D, Dby = side([(a, n0, 0.0, -1.0) for a in _samples(a0, a1, END_SAMPLES)])
    return {'FL': a0 - L, 'FR': a1 + R, 'room_up': U, 'room_down': D,
            'free_left_clear': L, 'free_right_clear': R,
            'by': {'left': Lby, 'right': Rby, 'up': Uby, 'down': Dby}}


# =============================================================================================
# the per-block entry point
# =============================================================================================

def _container_for(index, blocks, page, dark, page_h):
    block = blocks[index]
    rot = block[0]['rot']
    a0, a1, n0, n1 = source_frame(block)
    if _axis_aligned(rot):
        cls, inner, why = classify(page, page_bbox(block))
    else:
        cls, inner, why = 'open', None, 'rotated'
    if cls in ('box', 'cell'):
        L, R, D, U = _inner_to_frame(inner, rot)
        c = {'cls': cls, 'why': why, 'L': L, 'R': R, 'D': D, 'U': U,
             'src_left_margin': a0 - L, 'src_right_margin': R - a1,
             'src_up_margin': U - n1, 'src_down_margin': n0 - D}
        if cls == 'box':
            c['align'], c['align_why'] = 'center', 'box->center (R2)'
        else:
            c['align'], c['align_why'] = cell_alignment(block, c['src_left_margin'], c['src_right_margin'])
        return c
    fb = free_box(index, blocks, dark, page_h)
    align, align_why = open_alignment(index, blocks, fb['free_left_clear'], fb['free_right_clear'])
    return {'cls': 'open', 'why': why,
            'FL': fb['FL'], 'FR': fb['FR'], 'room_up': fb['room_up'], 'room_down': fb['room_down'],
            'free_left_clear': fb['free_left_clear'], 'free_right_clear': fb['free_right_clear'],
            'align': align, 'align_why': align_why}


def _error_container(index, blocks, exc):
    """An 'open' container with ZERO free room around the source frame (or around the origin
    when even the frame cannot be computed): the layout then keeps the source width, shrinks to
    the floor and names any overhang, rather than spreading a label across artwork nobody
    measured."""
    try:
        a0, a1 = source_frame(blocks[index])[:2]
    except Exception:
        a0 = a1 = 0.0
    return {'cls': 'open', 'why': f'error: {type(exc).__name__}',
            'FL': a0, 'FR': a1, 'room_up': 0.0, 'room_down': 0.0,
            'free_left_clear': 0.0, 'free_right_clear': 0.0,
            'align': 'center', 'align_why': 'error->center'}


def container_for(index, blocks, page, dark, page_h):
    """The container of blocks[index]. NEVER raises.

    index   the block's position in `blocks` (FT.merge_blocks(FT.group(runs))) - used only to
            find the block and to exclude it from its own obstacles and siblings
    blocks  every block of the figure (kept ones too: they are obstacles and sibling cues)
    page    load_page(artwork.pdf), loaded once per figure
    dark    Pillow 'L' image of artwork.png (200 dpi); dark := L < DARK_LEVEL
    page_h  page height in pt

    box / cell: {'cls', 'why', 'L', 'R', 'D', 'U' (inner, in the block's along/normal frame),
                 'src_left_margin', 'src_right_margin', 'src_up_margin', 'src_down_margin',
                 'align' ('center' for a box - R2; the source's for a cell - R3), 'align_why'}
    open:       {'cls': 'open', 'why', 'FL', 'FR', 'room_up', 'room_down',
                 'free_left_clear', 'free_right_clear', 'align', 'align_why'}

    A block whose rotation is not within ROT_SNAP of a multiple of 90 degrees is 'open' with
    why 'rotated' (its page bbox is inflated, so enclosure means nothing); its free box is
    still measured in its own rotation."""
    try:
        return _container_for(index, blocks, page, dark, page_h)
    except Exception as exc:          # noqa: BLE001 - never raising IS the contract
        return _error_container(index, blocks, exc)
```

## The tests — `test_figcontainers.py` (verbatim)

```python
#!/usr/bin/env python3
"""Tests for figcontainers.py - container detection and open/cell alignment (§C140 ③). Run:

    python3 test_figcontainers.py

Plain checks, like the siblings - no pytest in this tree.

Cases 1-10 use SYNTHETIC page dicts (the shape load_page() returns, planted by hand) and
blank/barred Pillow images, so they need neither a PDF nor pdfplumber. Case 11 builds a REAL
tiny PDF with cairo.PDFSurface in a temporary directory and proves pdfplumber reports what
cairo drew in the shape classify() expects - that is how the end-to-end tests plant
containers.

Each detection rule is paired with a POSITIVE CONTROL that differs from the refused case in
exactly the one property the rule tests (a rect 0.3 pt from the page edge is a box where one
0.1 pt from it is not; a rect of 29,850 pt² is a box where one of 30,000 pt² is not; a bar that
makes a label flush is removed and the label centres), so a harness that refused everything
could not read as a pass.
"""
import math
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'pylibs'))

from PIL import Image  # noqa: E402

import figcontainers as FC  # noqa: E402

fails = []


def check(label, ok, detail=''):
    print(('  PASS  ' if ok else '  FAIL  ') + label + (': ' + detail if detail else ''), flush=True)
    fails.append(label) if not ok else None


def close(a, b, tol=1e-9):
    return a is not None and b is not None and all(abs(x - y) <= tol for x, y in zip(a, b)) and len(a) == len(b)


# ------------------------------------------------------------------ synthetic builders
W, H = 400.0, 300.0


def run(x, y, text='Label', size=9.0, rot=0.0, adv=40.0):
    return {'x': x, 'y': y, 'rot': rot, 'size': size, 'adv': adv, 'text': text, 'font': 'F'}


def obj(kind, x0, y0, x1, y1, stroke=True, fill=False, lw=1.0, path=None, oid=None):
    o = {'object_type': kind, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
         'stroke': stroke, 'fill': fill, 'linewidth': lw, 'path': path or [], 'pts': []}
    if oid is not None:
        o['oid'] = oid
    return o


def page(rects=(), curves=(), lines=(), w=W, h=H):
    return {'width': w, 'height': h, 'bbox': (0.0, 0.0, w, h),
            'rects': list(rects), 'curves': list(curves), 'lines': list(lines)}


def blank(w=W, h=H):
    return Image.new('L', (math.ceil(w * FC.S), math.ceil(h * FC.S)), 255)


def bar(img, x0, x1, y0, y1, h=H):
    """paint a dark bar covering page rect [x0,x1]x[y0,y1] (pt, y-up)"""
    px = img.load()
    for ix in range(int(x0 * FC.S), int(x1 * FC.S)):
        for iy in range(int((h - y1) * FC.S), int((h - y0) * FC.S)):
            px[ix, iy] = 0
    return img


# one horizontal label: frame a0=100 a1=140, n0=100-0.21*10=97.9, n1=100+0.73*10=107.3
LABEL = [run(100.0, 100.0, size=10.0, adv=40.0)]
FR = FC.source_frame(LABEL)

print('\n== 0. source frame from the PDF advances, per run')
check('frame of a plain label', close(FR, (100.0, 140.0, 97.9, 107.3)), str(FR))
SUB = [run(100.0, 100.0, 'H', size=9.0, adv=6.5), run(106.5, 97.0, '2', size=6.0, adv=3.3)]
fs = FC.source_frame(SUB)
check('a subscript run pulls n0 down (per-run frame)', close(fs, (100.0, 109.8, 97.0 - 0.21 * 6.0, 100.0 + 0.73 * 9.0)), str(fs))
check('page_bbox of an unrotated frame is the frame', close(FC.page_bbox(LABEL), (100.0, 97.9, 140.0, 107.3)))

print('\n== 1. closed stroked rect -> box, inset by max(linewidth, MIN_RULE)/2')
p = page(rects=[obj('rect', 90, 90, 160, 120, lw=2.0)])
cls, inner, why = FC.classify(p, FC.page_bbox(LABEL))
check('lw 2.0 -> box', cls == 'box' and why == 'stroked-closed', f'{cls} {why}')
check('lw 2.0 -> inner inset 1.0 on every side', close(inner, (91, 91, 159, 119)), str(inner))
p = page(rects=[obj('rect', 90, 90, 160, 120, lw=0.0)])
cls, inner, why = FC.classify(p, FC.page_bbox(LABEL))
check('lw 0 (hairline) -> inset MIN_RULE/2 = 0.5', cls == 'box' and close(inner, (90.5, 90.5, 159.5, 119.5)), f'{cls} {inner}')
c = FC.container_for(0, [LABEL], p, blank(), H)
check('container_for box: inner in the along/normal frame',
      c['cls'] == 'box' and close((c['L'], c['R'], c['D'], c['U']), (90.5, 159.5, 90.5, 119.5)), str(c))
check('container_for box: source margins',
      close((c['src_left_margin'], c['src_right_margin'], c['src_up_margin'], c['src_down_margin']),
            (9.5, 19.5, 119.5 - 107.3, 97.9 - 90.5)), str(c))
check('container_for box: always centred (R2)', c['align'] == 'center', c['align_why'])
# a closed CURVE (rounded rect) is a box too; an OPEN stroked curve is not
cc = obj('curve', 90, 90, 160, 120, lw=1.5, path=['m', 'c', 'l', 'c', 'l', 'c', 'l', 'c', 'h'])
cls, inner, why = FC.classify(page(curves=[cc]), FC.page_bbox(LABEL))
check('closed curve (ends in h) -> box, inset 0.75', cls == 'box' and close(inner, (90.75, 90.75, 159.25, 119.25)), f'{cls} {inner}')
oc = obj('curve', 90, 90, 160, 120, lw=1.5, path=['m', 'c', 'l', 'c'])
cls, inner, why = FC.classify(page(curves=[oc]), FC.page_bbox(LABEL))
check('open stroked curve (a bracket) -> open', cls == 'open', f'{cls} {why}')

print('\n== 2. four rule segments that span the cell -> cell, inset by each rule\'s half-thickness')
rules = [obj('line', 90, 80, 90, 130, lw=0.5, oid=1), obj('line', 160, 80, 160, 130, lw=2.0, oid=2),
         obj('line', 80, 90, 170, 90, lw=0.5, oid=3), obj('line', 80, 120, 170, 120, lw=0.5, oid=4)]
cls, inner, why = FC.classify(page(lines=rules), FC.page_bbox(LABEL))
check('spanning rules -> cell via rules', cls == 'cell' and why == 'rules', f'{cls} {why}')
check('inner: 0.5 on the hairline sides, 1.0 on the 2 pt right rule', close(inner, (90.5, 90.5, 159.0, 119.5)), str(inner))

print('\n== 3. four rules that do NOT span (box edges + an arrow line) -> open')
# the label sits over an arrow BETWEEN two boxes: left/right are the boxes' facing edges, below is
# the arrow line (stops 5 pt short of the left box and 10 pt short of the right one), above is a
# long line. All four sides are bracketed, nothing encloses it.
boxA = obj('rect', 20, 80, 90, 130, lw=1.0, oid=10)
boxB = obj('rect', 160, 80, 230, 130, lw=1.0, oid=11)
arrow = obj('line', 95, 97, 150, 97, lw=1.0, oid=12)
top = obj('line', 60, 125, 200, 125, lw=1.0, oid=13)
ARROW_LABEL = [run(100.0, 100.0, size=8.0, adv=40.0)]
p3 = page(rects=[boxA, boxB], lines=[arrow, top])
cls, inner, why = FC.classify(p3, FC.page_bbox(ARROW_LABEL))
check('bracketing, non-spanning rules -> open', cls == 'open', f'{cls} {why}')
check('... and the why names the refusal', 'rules-not-spanning' in (why or ''), why)
# positive control: extend the arrow line to meet both boxes -> the same four sides span -> cell
arrow_full = obj('line', 90, 97, 160, 97, lw=1.0, oid=12)
cls, inner, why = FC.classify(page(rects=[boxA, boxB], lines=[arrow_full, top]), FC.page_bbox(ARROW_LABEL))
check('control: the same geometry with a spanning bottom rule -> cell', cls == 'cell' and why == 'rules', f'{cls} {why}')

print('\n== 4. fill-only rect -> cell, inset MIN_RULE/2')
cls, inner, why = FC.classify(page(rects=[obj('rect', 90, 90, 160, 120, stroke=False, fill=True, lw=0.0)]), FC.page_bbox(LABEL))
check('fill-only rect -> cell via fill-rect', cls == 'cell' and why == 'fill-rect', f'{cls} {why}')
check('fill-rect inner inset 0.5', close(inner, (90.5, 90.5, 159.5, 119.5)), str(inner))
cls, inner, why = FC.classify(page(curves=[obj('curve', 90, 90, 160, 120, stroke=False, fill=True, path=['m', 'l', 'l', 'l', 'h'])]), FC.page_bbox(LABEL))
check('a fill-only CURVE is not a label patch -> open', cls == 'open', f'{cls} {why}')

print('\n== 5. a candidate within EDGE of the page edge -> open')
cls, inner, why = FC.classify(page(rects=[obj('rect', 0.1, 90, 160, 120)]), FC.page_bbox(LABEL))
check('stroked rect 0.1 pt from the left page edge -> open', cls == 'open' and 'page-edge' in why, f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 90, 90, 160, H - 0.2)]), FC.page_bbox(LABEL))
check('stroked rect 0.2 pt from the top page edge -> open', cls == 'open', f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 0.3, 90, 160, 120)]), FC.page_bbox(LABEL))
check('control: 0.3 pt from the edge -> box', cls == 'box', f'{cls} {why}')
edge_rules = [obj('line', 0.2, 80, 0.2, 130, oid=1), obj('line', 160, 80, 160, 130, oid=2),
              obj('line', 0, 90, 170, 90, oid=3), obj('line', 0, 120, 170, 120, oid=4)]
cls, inner, why = FC.classify(page(lines=edge_rules), FC.page_bbox(LABEL))
check('rules cell whose left rule is 0.2 pt from the page edge -> open', cls == 'open' and 'rules-page-edge' in why, f'{cls} {why}')

print('\n== 6. an enclosing path covering >= 25 % of the page -> open')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 250, 200)]), FC.page_bbox(LABEL))  # 200*150 = 30000 = 25 %
check('stroked rect of exactly 25 % -> open', cls == 'open' and 'area' in why, f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 249, 200)]), FC.page_bbox(LABEL))  # 29850
check('control: 24.9 % -> box', cls == 'box', f'{cls} {why}')
big_rules = [obj('line', 50, 40, 50, 210, oid=1), obj('line', 250, 40, 250, 210, oid=2),
             obj('line', 40, 50, 260, 50, oid=3), obj('line', 40, 200, 260, 200, oid=4)]   # cell 200 x 150 = 25 %
cls, inner, why = FC.classify(page(lines=big_rules), FC.page_bbox(LABEL))
check('rules cell of exactly 25 % -> open', cls == 'open' and 'rules-area' in why, f'{cls} {why}')
big_rules[1] = obj('line', 249, 40, 249, 210, oid=2)
cls, inner, why = FC.classify(page(lines=big_rules), FC.page_bbox(LABEL))
check('control: rules cell of 24.9 % -> cell', cls == 'cell' and why == 'rules', f'{cls} {why}')
cls, inner, why = FC.classify(page(rects=[obj('rect', 50, 50, 249, 200), obj('rect', 90, 90, 160, 120, lw=1.0)]), FC.page_bbox(LABEL))
check('nested: the smallest enclosing candidate wins', cls == 'box' and close(inner, (90.5, 90.5, 159.5, 119.5)), f'{cls} {inner}')

print('\n== 7. a block rotated 90 deg inside a box -> box, inner mapped into along/normal')
# rot 90: along = y, normal = -x. run at x=50, y=30, size 10, adv 40:
#   a0=30 a1=70, n0=-50-2.1=-52.1, n1=-50+7.3=-42.7 -> page bbox x [42.7,52.1], y [30,70]
R90 = [run(50.0, 30.0, size=10.0, rot=90.0, adv=40.0)]
check('rot 90 source frame', close(FC.source_frame(R90), (30.0, 70.0, -52.1, -42.7)), str(FC.source_frame(R90)))
check('rot 90 page bbox', close(FC.page_bbox(R90), (42.7, 30.0, 52.1, 70.0)), str(FC.page_bbox(R90)))
p7 = page(rects=[obj('rect', 10, 10, 60, 100, lw=1.0)])
c = FC.container_for(0, [R90], p7, blank(), H)
check('rot 90 -> box', c['cls'] == 'box', str(c))
check('rot 90 inner: L=10.5 R=99.5 D=-59.5 U=-10.5',
      close((c.get('L'), c.get('R'), c.get('D'), c.get('U')), (10.5, 99.5, -59.5, -10.5)), str(c))
check('rot 90 margins: left 19.5, right 29.5, up 32.2, down 7.4',
      close((c.get('src_left_margin'), c.get('src_right_margin'), c.get('src_up_margin'), c.get('src_down_margin')),
            (19.5, 29.5, 32.2, 7.4)), str(c))
R270 = [run(50.0, 70.0, size=10.0, rot=-90.0, adv=40.0)]   # along = -y, normal = x
c = FC.container_for(0, [R270], p7, blank(), H)
check('rot -90 -> box with inner L=-99.5 R=-10.5 D=10.5 U=59.5',
      c['cls'] == 'box' and close((c['L'], c['R'], c['D'], c['U']), (-99.5, -10.5, 10.5, 59.5)), str(c))
R89 = [run(50.0, 30.0, size=10.0, rot=89.6, adv=40.0)]
c = FC.container_for(0, [R89], p7, blank(), H)
check('rot 89.6 (within 0.5 of 90) -> box, inner inscribed (never wider than the exact one)',
      c['cls'] == 'box' and c['R'] - c['L'] <= 89.0 + 1e-9 and c['U'] - c['D'] <= 49.0 + 1e-9, str(c))

print('\n== 8. rotated 30 deg -> open "rotated", even inside a box')
R30 = [run(60.0, 60.0, size=10.0, rot=30.0, adv=20.0)]
c = FC.container_for(0, [R30], page(rects=[obj('rect', 10, 10, 160, 150)]), blank(), H)
check('rot 30 -> open with why rotated', c['cls'] == 'open' and c['why'] == 'rotated', str(c))
check('rot 30 still carries a free box', all(k in c for k in ('FL', 'FR', 'room_up', 'room_down', 'free_left_clear', 'free_right_clear')), str(sorted(c)))

print('\n== 9. container_for never raises')
bad = page(rects=[obj('rect', 90, 90, 160, 120)])
bad['rects'] = None
try:
    c = FC.container_for(0, [LABEL], bad, blank(), H)
    check('broken page dict -> open "error: TypeError"', c['cls'] == 'open' and c['why'] == 'error: TypeError', str(c))
    check('... with zero free room around the source frame',
          (c['FL'], c['FR'], c['room_up'], c['room_down'], c['free_left_clear'], c['free_right_clear']) == (100.0, 140.0, 0.0, 0.0, 0.0, 0.0), str(c))
except Exception as e:  # noqa: BLE001
    check('broken page dict -> open "error: TypeError"', False, f'RAISED {type(e).__name__}: {e}')
try:
    c = FC.container_for(0, [LABEL], page(), None, H)
    check('dark image None on an open block -> open "error: AttributeError"', c['cls'] == 'open' and c['why'] == 'error: AttributeError', str(c))
except Exception as e:  # noqa: BLE001
    check('dark image None on an open block -> open "error: AttributeError"', False, f'RAISED {type(e).__name__}: {e}')
try:
    c = FC.container_for(5, [LABEL], page(), blank(), H)
    check('index out of range -> open "error: IndexError", frame fallback 0', c['cls'] == 'open' and c['why'] == 'error: IndexError' and c['FL'] == 0.0, str(c))
except Exception as e:  # noqa: BLE001
    check('index out of range -> open "error: IndexError"', False, f'RAISED {type(e).__name__}: {e}')
c = FC.container_for(0, [LABEL], page(), blank(), H)
check('control: the same block on a sound page is open WITHOUT error', c['cls'] == 'open' and not c['why'].startswith('error'), str(c))

print('\n== 10. alignment')
# free box sanity on a blank page: label a0=100 -> left clear to the page edge
fb = FC.free_box(0, [LABEL], blank(), H)
# the image is ceil(400*S) = 1112 px wide, 0.32 pt wider than the page: the last on-image sample
# decides, so the right side may run one step past x = 400.
check('free box on a blank page: stopped by the page on every side',
      fb['by'] == {'left': 'page', 'right': 'page', 'up': 'page', 'down': 'page'}, str(fb))
check('free box FL/FR are along coordinates of the page edges (to one step)',
      abs(fb['FL'] - 0.0) <= FC.MARCH_STEP and abs(fb['FR'] - 400.0) <= FC.MARCH_STEP + 1e-9, str(fb))
check('free box room_up / room_down reach the page (to one step)',
      abs(fb['room_up'] - (H - 107.3)) <= FC.MARCH_STEP + 1e-9 and abs(fb['room_down'] - 97.9) <= FC.MARCH_STEP + 1e-9, str(fb))
# (a) flush: a dark bar ending 2 pt left of the label, nothing to its right
img = bar(blank(), 96.0, 98.0, 80.0, 120.0)
c = FC.container_for(0, [LABEL], page(), img, H)
check('flush: bar 2 pt to the left -> left, single-flush', c['align'] == 'left' and c['align_why'].startswith('single-flush'), f"{c['align']} {c['align_why']} L={c['free_left_clear']}")
c = FC.container_for(0, [LABEL], page(), blank(), H)
check('control: bar removed -> center', c['align'] == 'center', f"{c['align']} {c['align_why']}")
img = bar(blank(), 142.0, 144.0, 80.0, 120.0)
c = FC.container_for(0, [LABEL], page(), img, H)
check('flush: bar 2 pt to the right -> right', c['align'] == 'right' and c['align_why'].startswith('single-flush'), f"{c['align']} {c['align_why']}")
# another block is an obstacle too
NEIGH = [run(142.5, 100.0, 'X', size=10.0, adv=5.0)]
fb = FC.free_box(0, [LABEL, NEIGH], blank(), H)
check('another block\'s source line box stops the march', abs(fb['free_right_clear'] - 2.5) < 1e-9 and fb['by']['right'] == 'hit', str(fb))
# ... and its frame is PER RUN: a formula above whose subscript '3' hangs 3 pt below its baseline
# stops the up ray at the SUBSCRIPT's glyph box (n0 = 117 - 0.21*7 = 115.53 -> room 8.25), not at
# the base run's (120 - 0.21*9 = 118.11 -> room 11.0). The FishLemon labels under CH3COOH are this shape.
FORMULA = [run(100.0, 120.0, 'CH', size=9.0, adv=11.0), run(111.0, 117.0, '3', size=7.0, adv=4.0),
           run(115.0, 120.0, 'COOH', size=9.0, adv=25.0)]
check('fixture: the formula is one FT line', len(FC.line_frames(FORMULA)) == 1)
fb = FC.free_box(0, [LABEL, FORMULA], blank(), H)
check('an obstacle\'s subscript glyph box stops the up march (room_up 8.25, not 11.0)',
      abs(fb['room_up'] - 8.25) < 1e-9 and fb['by']['up'] == 'hit', str(fb))
# (b) left-only sibling cue, far from any obstacle
A = [run(100.0, 100.0, 'Short', size=9.0, adv=40.0)]
B = [run(100.1, 150.0, 'A much longer one', size=9.0, adv=80.0)]
c = FC.container_for(0, [A, B], page(), blank(), H)
check('left-only sibling cue (0.1 pt) -> left', c['align'] == 'left' and c['align_why'] == 'single-cue-left-only->left', f"{c['align']} {c['align_why']}")
# (c) rxn2 geometry: 'Reactant' b11 [92.222, 128.240] and 'Coefficient' b12 [85.220, 127.742] -
# right edges 0.498 pt apart, a coincidence. At the measured SIBLING_TOL 0.2 there is no cue.
REACT = [run(92.222, 148.659, 'Reactant', size=9.0, adv=128.240 - 92.222)]
COEF = [run(85.220, 131.658, 'Coefficient', size=9.0, adv=127.742 - 85.220)]
RXN2 = [REACT, COEF]
for i, nm in ((0, 'Reactant'), (1, 'Coefficient')):
    c = FC.container_for(i, RXN2, page(), blank(), H)
    check(f'rxn2 {nm}: 0.498 pt right-edge coincidence -> no cue -> center', c['align'] == 'center', f"{c['align']} {c['align_why']}")
# (d) ethene geometry: b0 left 22.527, b17 left 22.500 - a real column (0.027 pt) -> left
ETH0 = [run(22.527, 55.882, 'required to react with H2O to produce', size=9.0, adv=209.02 - 22.527)]
ETH17 = [run(22.5, 116.382, 'The number of moles and the mass of', size=9.0, adv=174.069 - 22.5)]
c = FC.container_for(1, [ETH0, ETH17], page(), blank(), H)
check('ethene b17: 0.027 pt left coincidence -> left', c['align'] == 'left' and c['align_why'] == 'single-cue-left-only->left', f"{c['align']} {c['align_why']}")
# (e) multi-line: two smallest spreads within AMBIG -> center; a clear left column -> left
AMB = [run(100.0, 100.0, 'line one', size=9.0, adv=40.0), run(100.3, 89.0, 'line two', size=9.0, adv=40.6)]
# starts spread 0.3, ends spread 0.9, centres spread 0.6 -> two smallest 0.3 / 0.6 differ by 0.3 < 0.5
check('fixture: the multi-line block has two FT lines', len(FC.line_frames(AMB)) == 2)
c = FC.container_for(0, [AMB], page(), blank(), H)
check('multi-line ambiguous (0.3 vs 0.6) -> center', c['align'] == 'center' and c['align_why'].startswith('multi-ambiguous'), f"{c['align']} {c['align_why']}")
LEFTCOL = [run(100.0, 100.0, 'line one', size=9.0, adv=40.0), run(100.0, 89.0, 'a second, longer line', size=9.0, adv=80.0)]
c = FC.container_for(0, [LEFTCOL], page(), blank(), H)
check('control: multi-line left column (0 vs 20) -> left', c['align'] == 'left' and c['align_why'].startswith('multi('), f"{c['align']} {c['align_why']}")
# (f) cell alignment keeps the source's: right-flush single line in a rules cell
CELLRULES = [obj('line', 20, 80, 20, 130, oid=1), obj('line', 160, 80, 160, 130, oid=2),
             obj('line', 10, 90, 170, 90, oid=3), obj('line', 10, 120, 170, 120, oid=4)]
RFLUSH = [run(100.0, 100.0, 'Molecular mass', size=9.0, adv=58.0)]   # a1 = 158; inner R = 159.5
c = FC.container_for(0, [RFLUSH], page(lines=CELLRULES), blank(), H)
check('cell: right-flush source (margins 79.5 / 1.5) -> right', c['cls'] == 'cell' and c['align'] == 'right', f"{c['cls']} {c['align']} {c['align_why']}")
MID = [run(60.0, 100.0, 'Element', size=9.0, adv=40.0)]
c = FC.container_for(0, [MID], page(lines=CELLRULES), blank(), H)
check('cell: centred source (margins 39.5 / 59.5) -> center', c['cls'] == 'cell' and c['align'] == 'center', f"{c['cls']} {c['align']} {c['align_why']}")
c = FC.container_for(0, [RFLUSH], page(rects=[obj('rect', 20, 80, 160, 130)]), blank(), H)
check('box: a right-flush source is still centred (R2)', c['cls'] == 'box' and c['align'] == 'center', f"{c['cls']} {c['align']}")

print('\n== 11. a REAL tiny PDF drawn with cairo: pdfplumber reports what classify expects')
try:
    import cairo
except Exception as e:  # noqa: BLE001
    cairo = None
    check('cairo importable for the real-PDF case', False, f'{type(e).__name__}: {e}')
if cairo is not None:
    PW, PH = 300.0, 200.0
    with tempfile.TemporaryDirectory() as td:
        pdf = os.path.join(td, 'containers.pdf')
        surf = cairo.PDFSurface(pdf, PW, PH)
        ctx = cairo.Context(surf)
        ctx.set_source_rgb(0, 0, 0)
        # (i) a stroked rect, cairo coords y-DOWN: x 20..120, y 20..80 -> PDF y 120..180
        ctx.set_line_width(1.0)
        ctx.rectangle(20, 20, 100, 60)
        ctx.stroke()
        # (ii) a rounded rect, closed: x 160..280, y 20..80
        ctx.set_line_width(1.5)
        r = 8.0
        x0, y0, x1, y1 = 160.0, 20.0, 280.0, 80.0
        ctx.new_sub_path()
        ctx.arc(x1 - r, y0 + r, r, -math.pi / 2, 0)
        ctx.arc(x1 - r, y1 - r, r, 0, math.pi / 2)
        ctx.arc(x0 + r, y1 - r, r, math.pi / 2, math.pi)
        ctx.arc(x0 + r, y0 + r, r, math.pi, 3 * math.pi / 2)
        ctx.close_path()
        ctx.stroke()
        # (iii) a 2x2 table grid of separate lines: x 20..220 (cols at 20, 120, 220), y 110..190 (rows at 110, 150, 190)
        ctx.set_line_width(0.5)
        for gx in (20, 120, 220):
            ctx.move_to(gx, 110)
            ctx.line_to(gx, 190)
            ctx.stroke()
        for gy in (110, 150, 190):
            ctx.move_to(20, gy)
            ctx.line_to(220, gy)
            ctx.stroke()
        surf.finish()
        pg = FC.load_page(pdf)
    shapes = {k: [(o['object_type'], o['stroke'], o['fill'], o['linewidth'], o['path'][-1:] if o['path'] else [],
                   tuple(round(o[z], 2) for z in ('x0', 'y0', 'x1', 'y1'))) for o in pg[k]] for k in ('rects', 'curves', 'lines')}
    for k in ('rects', 'curves', 'lines'):
        print(f'        pdfplumber {k}: {shapes[k]}')
    print(f"        page width/height/bbox: {pg['width']} {pg['height']} {pg['bbox']}")
    check('page size and origin', (pg['width'], pg['height'], pg['bbox']) == (PW, PH, (0.0, 0.0, PW, PH)))
    rect_hits = [o for o in pg['rects'] if abs(o['x0'] - 20) < 0.01 and abs(o['y0'] - 120) < 0.01]
    check('cairo rectangle()+stroke -> one rect, stroked, not filled, linewidth 1.0, y flipped to PDF 120..180',
          len(rect_hits) == 1 and rect_hits[0]['stroke'] and not rect_hits[0]['fill'] and rect_hits[0]['linewidth'] == 1.0
          and abs(rect_hits[0]['y1'] - 180) < 0.01, str(shapes['rects']))
    rr = [o for o in pg['curves'] if abs(o['x0'] - 160) < 0.01]
    check('cairo rounded rect (arcs + close_path) -> one curve, stroked, linewidth 1.5, closed',
          len(rr) == 1 and rr[0]['stroke'] and rr[0]['linewidth'] == 1.5 and FC._closed(rr[0]), str(shapes['curves']))
    check('cairo grid move_to/line_to/stroke -> six lines, linewidth 0.5', len(pg['lines']) == 6
          and all(o['object_type'] == 'line' and o['stroke'] and o['linewidth'] == 0.5 for o in pg['lines']), str(shapes['lines']))
    # plant labels: inside the rect, inside the rounded rect, inside grid cell (cols 20..120, PDF rows 50..90)
    in_rect = [run(40.0, 145.0, 'In box', size=9.0, adv=30.0)]
    in_round = [run(190.0, 145.0, 'Rounded', size=9.0, adv=40.0)]
    in_cell = [run(40.0, 65.0, 'Cell', size=9.0, adv=30.0)]
    blocks = [in_rect, in_round, in_cell]
    dark = Image.new('L', (math.ceil(PW * FC.S), math.ceil(PH * FC.S)), 255)
    c0 = FC.container_for(0, blocks, pg, dark, PH)
    check('real PDF: label in the cairo rect -> box, inner inset 0.5', c0['cls'] == 'box'
          and close((c0['L'], c0['R'], c0['D'], c0['U']), (20.5, 119.5, 120.5, 179.5), 1e-3), str(c0))
    c1 = FC.container_for(1, blocks, pg, dark, PH)
    check('real PDF: label in the rounded rect -> box, inner inset 0.75', c1['cls'] == 'box'
          and close((c1['L'], c1['R'], c1['D'], c1['U']), (160.75, 279.25, 120.75, 179.25), 1e-2), str(c1))
    c2 = FC.container_for(2, blocks, pg, dark, PH)
    check('real PDF: label in the grid -> cell via rules, inner inset 0.5', c2['cls'] == 'cell' and c2['why'] == 'rules'
          and close((c2['L'], c2['R'], c2['D'], c2['U']), (20.5, 119.5, 50.5, 89.5), 1e-3), str(c2))

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
```
