# Verify: 1a pixel instrument + 2a run-exact prototype (adversarial)

Date 2026-09-13. 0 ISK. All work under `scratchpad/verify-pi/`. Repo not modified (git status checked at end).
Written incrementally; sections appended as each step finished.

## V1. Prototype contract, re-measured on MY regenerated outputs (not 2a's stored ones)

Instrument: `verify-pi/batch.sh` ran, for all 34 figures x {--control, translated}:
the repo's own `experiments/figure-text-translation/compose.py` IN PLACE (FIGTEXT_OUT=scratch,
PYTHONDONTWRITEBYTECODE=1), my own tagged copy (`verify-pi/tagc/compose.py`: 3-line patch adding the
block index to ITEMS), and 2a's `proto/compose.py` as-is. 204 runs, all rc 0. `verify-pi/check_proto.py`
compares; kept set computed by me from blocks.json + sidecar (not from proto's `runExact` list).
Results in `verify-pi/data/check_proto.jsonl`.

| check | result | denominator |
|---|---|---|
| A tagging inert: tag vs repo PNG bytes, `<text>` list, report | identical 34/34 both modes | 68 runs |
| B repo `<text>` == 2a's stored `orig-*` `<text>` | 34/34 both modes | 68 |
| B repo translated `<text>` == published `books/efnafraedi-2e/media/<b>_IS.svg` `<text>` | 34/34 | 34 |
| C report `blocks`/`missing`/`translated`/`degenerate` multisets, proto vs repo | equal 34/34 both modes (4 lists x 2 modes) | 34 |
| C proto `blocks` multiset == blocks.json keys | 34/34 both modes | 34 |
| proto `runExact` multiset == my independently computed kept set | 34/34 both modes | kept: 367 ctl, 191 tr |
| D translated-block ITEMS (text,x,y,rot,size,bold,rgb,dx) proto vs repo | identical 34/34 | **258 items** (tr); ctl vacuous (0 translated items) |
| D translated-block `<text>` STRINGS proto vs repo | identical 34/34 | 258 elements |
| E multiset diff of `<text>` strings: (repo - proto) subset of kept-layout elems; (proto - repo) subset of run-exact elems | 34/34 both modes | tr changed: 22 removed / 107 added over 6 figures |
| E artwork part of SVG identical | 34/34 | |
| F translated.png: pixels differing repo vs proto that lie OUTSIDE the 7x7-dilated footprint of kept items | **0 px** of 34,344 differing px | 6 figures with any diff; 15 have kept blocks |
| F positive control: repo-tr vs repo-ctl (translated blocks differ) with the same kept footprint | FishLemon 7,778/7,778 px outside; rxn2 12,744/12,744 outside; GreenChem (no translated block) 0 | 3 figures |

Note on 9 of the 15 figures with kept blocks the proto output is byte-identical to the current composer in
translated mode (e.g. etheneBr_img 14 kept, ethene_img 16 kept, 0 px diff, 0 `<text>` changed): their kept blocks
are single-run single-line labels, which the current composer already draws at the run origin.

Denominators (independent recount, `verify-pi/denom.py`, blocks.json + sidecars):
- by drawn instance: never-sent 184, sent-translated 176, sent-identity 7 = 367 (value==key and 2a's token predicate
  give the SAME split; 0 multi-line identity blocks, so the predicates are not discriminated by this corpus).
- by unique (basename,key): 105 / 162 / 7 = 274. 14 translated keys drawn twice (14 extra instances). Brief's 198 = 367-162-7.
- emit-blocks.py `english` field == `' '.join(block_lines)` for every sent block (0 mismatches), so 2a's wire model is right.
- `undecodable` in --control (current composer): 19 keys / 8 figures; all 19 are send:true, sent-translated, and have a
  line with an edge space. `(cid:` runs: 0 of 661 (grep positive control on a planted file: 1 hit). Proto reports 0.
  Translated mode: repo 0, proto 0 (the 19 are translated there). Mechanism read in code: figtext.py:221
  `strip_undecodable` returns `.strip()`ed lines, compose.py:175-177 appends when `cleaned != original`.

## V2. Instrument controls, planted detection, independent re-implementation

**Controls (i)/(ii) re-run on 3 figures of my choice** (`verify-pi/ctl3.py`, rxn2 16 blocks, map8_img 9, sandwich 7 = 32):
ours:=src -> iou1==1, run_iou1_min==1, run_cno==0 on 32/32; ours:=artwork -> nB==0, iou1==0 on 32/32.
⚠️ Both are TAUTOLOGIES (same arrays on both sides / no ink) — they prove plumbing symmetry, not that the instrument can
see damage. A non-tautological control I added: ours := src with block 0's text ink reset to artwork ->
block 0 iou1 0.0, nB 0, and every other block still exactly 1.0 (15/15, 8/8, 6/6): attribution does not bleed.

**2a E4 on MY regenerated outputs:** proto --control control.png vs a fresh `runexact_png.run_items(fit_adv=False)` +
`render(hint='default')`: 0 px differ on 34/34. Positive control (repo composer vs the same render): >0 px on 31/34
(min 888 px); 0 on brain-ec0b, exocytosis-88f6, rxn3 (all single-run single-line blocks).

**Planted detection recomputed** (`verify-pi/planted_re.py`, my own implementation of the paired rule on
`fid/planted.jsonl` vs the fit hint-default ceiling, clean blocks): reproduces 1a EXACTLY — (0,+2) 313/313,
(0,-2) 313/313, (+2,0) 301/313, (-2,0) 245/313, (+1,0) 224/313, (0,+1) 96/313, (+3,0) 310/313, flatten 47/47 clean.
⚠️ **The thresholds are fitted on the set they are then scored on.** T_RUNMIN 0.17 / T_CNO 1.5 are the p5 of the planted
2 px effect; recomputed p5 on the same rows: d_runmin (0,-2) 0.167, (+2,0) 0.182; d_cno (0,-2) 1.399. So "2 px detected
≥95%" is true by construction per metric, and 100% vertical is the OR of two p5-calibrated metrics. It is an in-sample
sensitivity, not an independent one. Informative out-of-threshold rows: (-2,0) 78%, (+1,0) 72%, (0,+1) 31%.
**Null rates of the pairwise rule with a SINGLE reference** (two faithful redraws): fit vs no-fit, either direction,
18/367 (16/313 clean, ~5%); hint none vs hint default 58/367 (16%). ⚠️ CORRECTED after V3: both are CROSS-STATE
comparisons (the "fit" ceiling is the contaminated render state, see V3), so neither is a same-state faithful-vs-faithful
null. No same-state null exists in 1a or 2a. The only same-state evidence for 2a's browser comparisons is Chromium
determinism (repeat render byte-identical; 272/360 blocks with identical `<text>` score identically) and the fact that all
32/359 sub-threshold plus-vs-current deltas sit below 0.17.

**Independent re-implementation of block scores** (`verify-pi/indep_all_float.py`: no fidelity.py import; axis-aligned
run boxes + 18 px pad, own 3x3 dilation, own IoU, own nearest-run split; only blocks with no other block's box within
26 px): 301 isolated blocks in 33 figures. With float luminance (0.299/0.587/0.114): |iou1 mine - 1a| median 0.0000,
p90 0.0000, >0.02 on 2/301; |run_iou1_min| >0.05 on 1/301. The 2 are combustion blocks 4 and 6, whose SOURCE ink
reaches past my 18 px box (recoloured arrowheads; 1a already excludes them from clean). Example rows:
combmap_img #5 `Moles of|H2O` mine 0.662 / 1a 0.6606, runmin 0.342('2') / 0.3416('2'); glycinemass_img #2 0.869 / 0.8687.
⚠️ **Threshold fragility on small blocks:** the same code with PIL's integer `L` conversion (rounding at 127.5) disagrees
by >0.02 on 22/301 blocks, up to 0.115 (e.g. STIX `+` blocks 0.130 vs 0.245; `H` 0.968 vs 0.938). Every such block has
<~110 ink px, and the shift comes from cairo antialias values sitting at the 128 threshold (nB 60 vs 86 px; nA equal).
A single-glyph block's score moves ~0.1 on a rounding choice — two-thirds of the 0.17 decision threshold.

**Edge-space re-centring (1a C5)** (`verify-pi/edge.py`, my tagged items vs runs.json first-run x, non-rotated,
same line count): centred lines WITH a trailing space: +1.028 pt (2/2; both `Stoichiometric ` in moleratio1/2), their
second line `factor` +0.232 pt; left-aligned edge-space lines: +0.000 (14/14 lines, flowchart x2, map7 x3 blocks);
CONTROL centred no-edge-space no-script lines: median 0.000, range ±0.230 pt (n=306); left control 0.000 (n=66).
19 edge-space blocks in total, as claimed; the centred+plain population is n=2 lines of ONE key.

**Visible check (1a C1, "visibly")**: the has_script block the instrument scores LEAST damaged (combmap_img #5
`Moles of|H2O`, run_iou1_min 0.342 vs ceilings 0.80/0.75) — crop `verify-pi/img/combmap5.png` (src / current / proto):
current draws `H2O` flat at full size; the source and the proto show the subscript. My own intra-line script
predicate (a run ≥1 pt smaller with a baseline ≥1 pt off the line's largest run) selects the same 52 blocks (0 disagreements
of 367); 0 of the 52 are flagged by run_cno alone (all have d_runmin ≥ 0.17); 6 carry the 999 sentinel.

## V3. NEW PROBLEM — 1a's "hint default" ceiling and ALL its planted renders were drawn in a cairo state compose.py never has

**Measured, not argued.** `runexact_png.run_items(fit_adv=True)` measures every glyph through `_meas_ctx()`, a context
with `HINT_STYLE_NONE` + `HINT_METRICS_OFF`. Creating that hint-none scaled font BEFORE the first hint-default draw of the
same face/size changes every later hint-default render in the process (cairo font-cache state; mechanism not traced
further). Probes (`verify-pi/order_probe{2,3}.py`, CNX_Chem_03_01_alsulfatemass_img):
- no measurement: nofit hint-default render == proto control.png (0 px) and == 1a's `nofit.jsonl` scores on 24/24 blocks;
- one `advance_pt()` call first: 6,073 px differ from proto control.png; the whole fit-measurement pass first: 12,953 px
  differ, and the scores now equal 1a's `ceild` on 23/24 blocks (map3_img: 8,466 px, 7/7) — for items that are NOT
  advance-fitted (`Element` is 1 item either way: runmin 0.847 clean vs 0.932 contaminated; cno 0.32 vs 0.18 px).
- Order matters: a measurement AFTER the first render changes nothing (0 px) — so the effect is a first-creation cache.

`run_all.py` builds `ceild` right after `run_items(fit_adv=True)` and a hint-none render, and `planted.py` renders all
5,976 planted images after `run_items` (fit) in a process that also renders hint none first. So:
1. **`ceild` is not "compose.py's cairo settings"** (1a §1 table, C3). compose.py's actual PNG state = the clean no-fit
   render (proven: 0 px vs proto control.png on 34/34 in a clean process, `planted_clean.py`).
2. **The fit-vs-nofit disagreement 1a attributed to advance fitting (18/367) is mostly this state difference**, not fitting
   (only 30 of 661 runs are fitted).
3. **The planted calibration does not transfer to compose's state.** `verify-pi/planted_clean.py` re-plants 1a's exact 8
   shifts in the clean state (base == proto control.png, 34/34), same metrics, same thresholds, vs its own base:

| shift (dx,dy) px | 1a (contaminated state) | clean state = compose.py | median d_cno clean |
|---|---|---|---|
| (0,+2) down | 313/313 | **193/313 (61.7%)** | 1.26 |
| (0,-2) up | 313/313 | 312/313 | 2.00 |
| (0,+1) | 96/313 | **4/313 (1.3%)** | 0.26 |
| (0,+3) | 313/313 | 313/313 | 2.26 |
| (+1,0) | 224/313 | 141/313 (45.0%) | 0 |
| (+2,0) | 301/313 | 281/313 (89.8%) | 0 |
| (-2,0) | 245/313 | 216/313 (69.0%) | 0 |
| (+3,0) | 310/313 | 296/313 (94.6%) | 0 |
| flatten (has_script) | 52/52 | **52/52** (smallest effect `O2`: d_runmin 0.176, d_cno 4.29) | |

Why: hint-default rendering snaps glyphs, so a faithful clean-state redraw already sits off the unhinted source
(clean-block faithful run_cno_max median **0.427 px** vs 0.089 contaminated), always the same way; a 2 px shift that
cancels that offset loses ~0.7 px of signal. **Faithful block-iou1 floor in compose's real state: min 0.517, median
0.843** (313 clean blocks, `fid/nofit.jsonl`) — vs 1a's 0.631 / 0.904 (contaminated) and 0.768 / 0.968 (hint none).
`Putrescinium ion` (FishLemon): clean 0.606, contaminated 0.631, hint none 0.981.
Consequence for 1a's verdicts: the paired rule's reference is worst-of(ceild, nofit), and nofit IS the right state, so
the 56 paired / 55 gross flags stand (they are far beyond both). What weakens is every NULL: "0/62 plain multi-line
blocks damaged" and "2/196 plain single-line" were read with an instrument that, in compose's state, misses a 2 px
downward shift 38% of the time and a 1 px shift 99% of the time (1a §4.3's 1.4 px re-leading is exactly that size).

## V4. Constructed defects the instrument scores as FAITHFUL (`verify-pi/blind.py`, clean state, all 34 figures)

One defect per block per render, scored by `fidelity.score_block`, flagged by 1a's operational paired rule (worst-of
ceilings from 1a's files) and separately vs the unmodified base render. Positive control in the SAME run: 2 px down shift.
Rows: `verify-pi/data/blind.jsonl` (2,582).

| defect (clean blocks) | applicable | flagged by 1a rule | median d_runmin |
|---|---|---|---|
| shift_v2 (POSITIVE CONTROL, 2 px down) | 313 | 192 (61%) | 0.181 |
| shift_v1 (1 px down) | 313 | 4 (1%) | 0.028 |
| **fill red (0.7,0,0)** | 313 | **0 (0%)** | -0.005 |
| **fill blue (0,0,0.6)** | 313 | **0 (0%)** | 0.002 |
| italic toggled | 313 | 58 (19%) | 0.080 |
| bold toggled | 313 | 150 (48%) | 0.162 |
| **last digit -> lookalike (3->8, 6->8, 1->7 ...)** | 97 | **19 (20%)** | 0.074 |
| `O` -> `0` | 49 | 32 (65%) | 0.295 |
| **`l` -> `I`** (`Al`->`AI`, `Cl`->`CI`) | 103 | **0 (0%)** | 0.054 |
| **decimal point -> comma** | 37 | **0 (0%)** | 0.015 |
| **text of two same-length labels swapped** (`32.06`<->`26.98`) | 58 | 40 (69%); 18 scored faithful | 0.288 |
| charge flip `+` <-> `–` on a superscript | 6 | 6 (100%) | 0.434 |
| charge dropped | 6 | 6 (100%) | 0.728 |

Visual: `verify-pi/img/blind_32.06.png` (src / base / 2 px shift / red / `32.08` / `32,06`): the last three are plainly
wrong to a reader and all three score faithful (alsulfatemass_img `32.06`: runmin base 0.883 -> red 0.895, `32.08` 0.878,
`32,06` 0.870; the swap to `26.98` 0.720 is also unflagged).
**Reading: 1a is a LAYOUT instrument (position, size, baseline), not a CONTENT or COLOUR instrument.** A "faithful" verdict
says nothing about the characters or the fill. That is harmless for a run-exact kept path fed from runs.json, but it
means the instrument cannot certify font fallback substitutions, a wrong face, or a colour-conversion bug, and 1a's
`has_bold 0/26` and `has_italic` nulls are weak (bold loss detected 48%, italic loss 19% even when planted).

**Scale of the V3 state effect:** of the 339 blocks whose fit and no-fit ITEMS are identical (no advance-fitted run),
334 have ceild iou1 != nofit iou1, in 34/34 figures. So the "two faithful ceilings" differ by render state, not fitting.

## V5. Remaining claims, re-measured

**2a C3 (kept blocks, translated mode, cairo)** — `verify-pi/rescore_tr.py` on MY regenerated repo-tr / proto-tr PNGs,
kept set from proto's items (== my independent kept set, V1): current 21/191 paired, 21 gross; proto 2/191 (ethene_img
blocks 5 and 7 `H`). Identical when the reference is the clean no-fit ceiling alone (21 / 2). The 21 are exactly 2a's list.
Crop `verify-pi/img/ethene_H5.png`: in translated mode the Icelandic line sits against the lower `H` — a real collision.
For proto the kept path IS the no-fit ceiling, so 0 is expected by construction; the evidence is the 21 and the crop.

**1a C8 (attribution)** — `verify-pi/attr_ctl.py`, my own exact-ownership map (each block's items rendered alone, max
coverage, no grow) from MY tagged items: current composer, control mode: 100 of 244,657 ours px misattributed, all in
ethene_img; 0 ours px unowned; 0 unattributed. Source side (ownership proxied by run-exact coverage, 201,442 of 221,486 src
px covered): 0 misattributed. NEW population (translated mode, kept blocks only, `rescore_tr.py`): 128 of 38,973 px
(0.33%) attributed to a kept block belong to another block (the ethene `H` collision), 0 lost, same for current and proto.

**1a C6 (combustion arrowheads) — confirmed, and the root cause 1a left open is now measured.** Own detector
(`src` neutral-dark, `artwork` blue-shifted >40): 1,836 px, y 151–176, x 78–1159; same detector src-vs-src: 0.
Sample pixel src (53,49,49) -> artwork (91,142,171). Crop `verify-pi/img/combustion_arrow.png`. Content-stream scan
(pikepdf, q/Q-aware): the page sets fill colour `0.698 0.675 0.639 0.74 k` INSIDE a BT..ET object and exactly **7**
non-text fill paints after that ET use it — the 7 arrowheads. strip-text.py removes the whole BT..ET (strip_text_ops,
strip-text.py:39-118), taking the `k` with it, so the arrowheads inherit the previous (blue) fill. PDF colour is graphics
state and survives ET. Census over the 34 source PDFs (page + Form XObjects): colour operators inside text objects in
18/34 figures; a later non-text paint depending on one: 1/34 (combustion, 7 fills, 0 strokes). etheneBr/HClsoln controls: 0.
1a's published-SVG half (Chromium render of `_IS.svg`) not re-rendered by me; artwork.svg is produced from the same stripped
PDF (strip-text.py:271), so the defect is upstream of both PNG and SVG.

**2a C6 (artwork.svg misregistration) — confirmed by 2a's own falsification test.** `verify-pi/reg/`: etheneBr
(468x69.5 pt) and vitC_img (438.74x62.3 pt). pikepdf copy with every page box padded to whole points (468x70, 439x63):
`pdftocairo -svg` matrix scale 0.992857 -> **1** (etheneBr) and 0.0988889 -> **0.1** (vitC, its own CTM). Chromium renders
(render-check.mjs) vs pdftocairo -png of the SAME pdf, best integer shift per horizontal third (planted (3,-2) recovered
exactly in both): unpadded etheneBr L/M/R dx = -3/0/+3 (IoU 0.50/0.59/0.63), vitC -3/0/+3 with dy 1; **padded: 0/0/0,
dy 0, IoU 0.87–0.94** on both. ⚠️ `pdftocairo -svg -origpagesizes` does NOT remove the scale (0.992857 and 0.0988889 stay)
— the fix is padding the page box, not that flag.

**2a C4 (browser, plus never worse)** — recomputed from `proto/data/bscores_mixed.jsonl` with my own pairwise code:
plus worse than current 0/360 at 1a thresholds AND 0/360 at half thresholds (0.085 / 0.75 px); current worse than plus
158 (211 at half). Sub-threshold: plus has a lower run_iou1_min than current on 32/359 blocks, by >= 0.05 on 7 (largest
0.081, aspirin `Molecular mass` 0.878 -> 0.797); plus run_cno higher by >= 0.5 px on 1. Determinism control: blocks whose
`<text>` is identical in current and proto score identically on all 4 metrics (272/360). Only Chromium exists on this box
(no Firefox/WebKit in ~/.cache/ms-playwright), so the claim's own falsification route is untestable here. And plus is not
"translated blocks untouched" in pixels: its global `text{text-rendering:geometricPrecision}` re-rasterizes them.

**2a C7 (geometricPrecision / kerning)** — independent Chromium renders of a freshly composed proto control.svg
(glycinemass_img, 22 plain blocks), scored against PDF-true source ink: my proto render reproduces 2a's proto_ctl iou1 on
22/22; adding ONLY `text{text-rendering:geometricPrecision}`: plain iou1 median 0.803 -> 0.868 (2a's plus: 0.868), higher on
20/22, lower on 1; run_cal_max median 0.496 -> 0.354. Repeat render byte-identical. Kerning (copperMoles_img): with geo on,
`font-kerning:normal` vs default 0 px differ, `none` 1,130 px differ (positive control); WITHOUT geo, `none` and `normal`
are both 0 px from default — whole-pixel advance rounding swallows the kern, so the kerning fix only exists under geo.
Embedded subset carries a GPOS `kern` feature (fontTools).

**1a C7 (STIX)** — `fc-list | grep -ic stix` = 0; `fc-match STIXGeneral` -> DejaVu Sans (runexact draws 'Liberation Sans'
explicitly). 45 symfont blocks: clean-state faithful run_cno_max median 2.78 px (p10 1.96, p90 3.42) — 1a's quoted
2.3–2.7 px comes from the contaminated ceild (median 2.43, p90 2.68). With the PDF's own STIX subset embedded (2a plus,
Chromium) the offset drops to median 0.20 px and run_iou1_min rises to 0.88, so the blocks become judgeable once the face
is supplied; "cannot be judged" is a property of the ceiling as built, not of the blocks.
(2a C4, translated kept blocks, 189 in the browser set): current worse than plus 61 (81 at half thresholds); plus worse
than current 0 (0 at half); plus lower run_iou1_min by >= 0.05 on 4.

## VERDICTS

No claim is marked `refuted`: what failed re-measurement were premises and calibration numbers (the "compose.py's hinting"
ceiling, the planted sensitivity, the 0.631 floor), not the damage findings. **1a's operational 56 paired / 55 gross verdicts
stand**: the paired rule's worst-of reference includes the no-fit ceiling, which IS compose.py's state (0 px vs proto
control.png, 34/34), and the flagged blocks sit far beyond it. Not pixel-tested: proto's translated blocks in the BROWSER
(same `<text>` strings; the only extra italic face is in HClsoln, which has no translated block; woff2 timestamps prevent a
byte compare).

| id | verdict | one line |
|---|---|---|
| 1a-C1 | confirmed | 52/52 has_script flagged; my own intra-line predicate selects the same 52; mildest instance visibly flat (crop); code compose.py:147, :264-290 (one `sz` per block, one show_text per line) |
| 1a-C2 | partially-true | reproduced in-sample exactly, but thresholds are fitted on the same planted set, and the planted renders were drawn in a cairo state compose.py never has; in compose's real state a 2 px DOWN shift is caught 193/313 (61.7%), 1 px 4/313, +2 px along 281/313; flatten still 52/52; italic/1 px/STIX limits true |
| 1a-C3 | partially-true | conclusion holds and is stronger; the 0.631 floor is a contaminated render — compose's real faithful floor is 0.517 (median 0.843); Putrescinium ion 0.606 not 0.631 |
| 1a-C4 | confirmed | independent recount 184/176/7 by instance, 105/162/7 unique, 14 translated keys drawn twice; both identity predicates agree |
| 1a-C5 | confirmed | centred trailing-space lines +1.028 pt (n=2 lines, one key) vs control ±0.23; left-aligned 0.000 (14 lines) |
| 1a-C6 | confirmed | own detector 1,836 px, crop; root cause measured: a `k` fill set inside BT..ET feeds exactly 7 later fills; 1/34 figures |
| 1a-C7 | partially-true | no STIX face (fc-list 0) — true; offset quoted from contaminated ceiling (clean median 2.78 px); blocks become judgeable once the embedded STIX subset is used (2a plus) |
| 1a-C8 | confirmed | own ownership map: 100/244,657 px, all ethene_img; src side 0; translated kept blocks 128/38,973 (0.33%) |
| 2a-C1 | confirmed | on MY regenerated outputs 0 px vs fresh no-fit render 34/34; positive control >0 on 31/34 |
| 2a-C2 | confirmed | 258 translated items and `<text>` strings identical 34/34 vs the repo's own compose.py; PNG diff outside kept footprint 0 of 34,344 px (positive control 7,778/12,744 px) |
| 2a-C3 | confirmed | 21 -> 2 reproduced on regenerated PNGs, same with the clean reference alone; the 2 are a visible collision |
| 2a-C4 | partially-true | 0/360 and 0/189 reproduced, also at half thresholds; but sub-threshold regressions exist (32/359, 7 by >=0.05), Chromium only (other browsers untestable here), and plus re-rasterizes translated blocks |
| 2a-C5 | confirmed | 19 keys / 8 figures, all edge-space, all translated in tr mode; 0 of 661 runs carry `(cid:`; code figtext.py:221 + compose.py:175-177 |
| 2a-C6 | confirmed | padding the page box to whole points removes the matrix scale and the Chromium misregistration (dx -3/0/+3 -> 0/0/0) on 2/2; `-origpagesizes` does not |
| 2a-C7 | confirmed | geo-only render: plain iou1 median 0.803 -> 0.868 (20/22 up); kerning normal == default under geo, none differs 1,130 px; without geo kerning has no pixel effect |

## NEW PROBLEMS

1. **1a's "hint default" ceiling (`ceild`) and all 5,976 planted renders were drawn after a hint-none measurement context
   existed in the process, which changes cairo's later hint-default rasterization** (6,073–12,953 px per figure; 334 of
   339 unfitted blocks score differently). compose.py never enters that state. Any calibration built on `ceild` or
   `planted.jsonl` overstates the instrument's sensitivity at compose.py's real hinting (V3 table). Fix for any future
   use: render ceilings and planted defects in a process that never calls `advance_pt`/hint none, or measure in a subprocess.
2. **The instrument is blind to content and colour** (V4): red or blue text 0/313, decimal point->comma 0/37, `l`->`I`
   0/103, a lookalike last digit 19/97, a same-length label swap 40/58. A "faithful" verdict certifies layout only.
3. **Small-block scores are threshold-fragile**: integer vs float luminance moves iou1 by up to 0.115 on blocks under
   ~110 ink px (22/301 isolated blocks >0.02).
4. **strip-text colour leak (root cause of 1a §4.1)**: removing a BT..ET removes fill-colour operators that later non-text
   paints rely on. 1/34 bought figures affected (combustion, 7 fills); colour ops inside text objects exist in 18/34, so the
   exposure scales with the corpus. Upstream of both PNG and published SVG.
5. **`pdftocairo -svg` misregistration fix is page-box padding, not `-origpagesizes`** (the flag leaves the scale in place).
6. **No same-state faithful-vs-faithful null exists for the pairwise rule, in 1a or 2a.** 1a's 18/367 fit-vs-nofit trips
   are the V3 render-state artefact, not noise between two faithful redraws. So the "current worse than plus 158/360" count
   has no measured false-positive rate; the "plus worse than current = 0" direction and Chromium determinism (byte-identical
   repeat render) are the parts that stand on their own.
7. 1a's §3.2 plain-block nulls ("0/62 multi-line", "2/196 single-line") and `has_bold 0/26` are weaker than stated: in
   compose's state the instrument misses 38% of 2 px downward shifts and 99% of 1 px shifts (1a §4.3's 1.4 px re-leading is
   in that blind band); planted bold loss is caught 48%, italic loss 19%.
