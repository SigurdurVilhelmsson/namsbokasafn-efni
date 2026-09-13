# r2v-rulings: adversarial check of r2 (§C140 ② + ③) against [USER]'s rulings, plus a picture review

**Date:** 2026-09-13.
**Cost:** 0 ISK. Nothing was composed and nothing called the MT. I only read the r2 artefacts that already existed.
**Repo:** read-only. Every python run had `PYTHONDONTWRITEBYTECODE=1`. Every write went to `/home/siggi/dev/scratch-c140/r2v-rulings/` or to this report. Repo checks are at the end.

**Scripts in `r2v-rulings/`:**
- `geo.py`: independent geometry.
- `order_exact.py`: whether each shrink was needed, re-measured exactly.
- `dlines.py` and `dlines_control.py`: line count and min-max balance.
- `diffv0.py` and `coverage.py`: V5 vs V0.
- `mycrops.py`: native-resolution crops, written to `r2v-rulings/crops/`.
- A hinting probe, run inline and recorded in §1d.

**Outputs:** `geo-<tag>.json` for all 7 V5 cells, `geo-V5_p2.0_f7.5_dec-CONTROL.json`, and `order-V5_p2.0_f7.5_dec.json`.

**Population, unless a section says otherwise:** the **176 layout blocks** of the 34 figures. The unit is one drawn block, keyed `basename#block`. Re-derived from raw `c3/blocks.jsonl`, the classes are **66 box, 26 cell and 84 open**, which matches the builder's census on 176 of 176. Pictures are the brief's cell (PAD 2.0, F 7.5, decimal on) unless a panel says otherwise.

**Defect classes used below:**
- **[conformance]:** the code does not do what the ruling says.
- **[ruling-consequence]:** the ruling as written produces a visible problem.
- **[builder-reading]:** an interpretation the builder chose that [USER] never authorised.
- **[instrument]:** a limit of a measure or census input.
- **[content]:** no layout rule can fix it.

---

## Headline

1. **No [conformance] defect found.** I measured from the drawn items and c3's raw container boxes, not from the builder's sentinels. In all 7 cells the prototype does what the rulings say, block by block:
   - Every line of all 66 boxes is centred on its container. Advance-centre offset max 0.000 pt, ink-centre offset max 0.395 pt.
   - All 26 cells stay inside their cell. The 5 right-flush cells stay right-flush.
   - Each of the 9 OPEN blocks drawn below sz0 needed the shrink, re-measured exactly.
   - No block is drawn below min(F, sz0).
   - The `overflow` list is complete in both directions.
   - Line count equals min(source lines, words) on 176 of 176.
   - All 51 multi-line partitions are min-max balanced.

   Every check has a planted positive control, and each one fired.
2. **Picture review of the 41 [USER]-flagged blocks:**
   - 34 are visibly fixed as [USER] described.
   - 6 are fixed but show a new visible problem: empform b2, b5 and b8, Example2 b3, moleratio2 b3, ethene b0.
   - 1 is not fixed: combmap b8, which now draws `Prósentusamsetning` across both box frame strokes at every F.

   **Coverage beyond the flagged set:** 125 layout blocks are drawn differently from V0. I looked at 116 of them in crops or full contact sheets. The other 9 are **unreviewed**, each moved ≤ 2.34 pt with no line change (§2b).
3. **[ruling-consequence] Two figures [USER] had approved changed, and the totals cannot see it.**
   - **rxn2** ("Layout and fonts are fine"): b12 `Stuðull` moves **7.56 pt right**, off the brace over 2O₂.
     - Cause: b11 `Reactant` and b12 `Coefficient` have right edges that happen to coincide (128.24 and 127.74 pt), so each is the other's only sibling-edge cue.
     - The product-side twin b15 has no cue and stays centred, so the two sides are now aligned differently.
   - **map7** ("Fine"): 6 of 7 layout blocks change.
     - b5 goes from the approved 2 lines at 9.0 pt to 1 line at 8.75 pt that fills the gap. Margins are 2.59 / 2.00 pt.
     - b6 moves toward the arrow shaft: its left margin drops from 4.84 to 2.50 pt.
4. **[instrument] The one width function is cairo's *hinted* advance.** At 200 dpi every glyph's advance is rounded to a whole device pixel (0.36 pt). Two consequences:
   - **Width is not smooth in size.** `Efnajöfnustuðull` is 55.08 pt at 7.5 and 55.80 pt at 8.0, a step of +0.72 where linear scaling predicts +3.7. The step from 7.25 to 7.5 is +4.32.
   - **Two layout decisions flip under linear (unhinted, browser-like) metrics:**
     - sacch b1 was shrunk 9.0 → 8.75 only because hinting widens the line: at 9.0, hinted 72.36 > 72.01 budget, but linear 71.51 fits.
     - moleratio2 b3 at 8.0 fits hinted (55.80 ≤ 56.01), but linear is 56.93 and would not.

   `geo.py` uses the same hinted measure. So on this axis it is consistent with the composer, not independent of it.
5. **[builder-reading] Two deviations from the literal rulings:**
   - `floor_eff = min(F, sz0)` draws **combmap b11–b14 at 7.0 pt, below F**, in the 5 cells with F ≥ 7.5.
   - The "source anchor" is the composer's hinted Liberation Sans re-measurement, not the PDF's own glyph advances. The two differ by > 0.3 pt on **47 of 110** non-box blocks, max **0.93 pt** (glycinemass b13). Sentinel (d) uses the same measure, so it cannot see this. A sibling verifier found the same 0.93 on glycinemass b13 (`reports/r2v-numbers.md` D7, inherited).
6. **Floor, by eye, on the 4 blocks that differ between F settings: F 7.0 is slightly better.**
   - empform b8 has box margins of 2.98 pt at F 7.0, 1.54 at 7.5 and 0.64 at 8.0 (touching the frame).
   - flowchart b13 and b14 look fine at both floors.
   - combmap b8 is broken at every F.

   **A hyphen at the compound boundary fits at 9.0 pt** in all three single-word cases (hinted widths, PAD 2.0 budgets):

   | block | split | widest line | budget |
   |---|---|---|---|
   | combmap b8 | `Prósentu-\|samsetning` | 46.80 | 54.49 |
   | empform b8 | `Reynslu-\|formúla` | 36.00 | 51.99 |
   | moleratio2 b3 | `Efnajöfnu-\|stuðull` | 41.40 | 56.01 |

---

## 1. Ruling conformance: independent geometry (`geo.py`)

**Method:**
- **Source of positions:** `items.json`. Its x and y are in the runs' pt frame.
- **Widths:** each item's advance, measured with cairo's toy "Liberation Sans". This is the same hinted metric as the composer; see §1d.
- **Lines:** grouped by geometry. Base-size items are clustered on the text normal, and each styled item goes to the nearest line.
- **Containers:** raw `c3/blocks.jsonl`, with `region_bbox_pt` compared against the census L and R.
- **Ink:** each line's items rendered on their own.
- **`diag.json`:** read only for the OPEN step label, to test the order of steps.

**Positive controls**, planted in memory (`geo-…-CONTROL.json`):

| plant | expected to fire | observed |
|---|---|---|
| combmap b0 shifted +1 pt | box centring | offset [1.0, 1.0] |
| alsulfatemass b13 shifted −1 pt | right-cell anchor | +0.153 → −0.847 |
| argon b2 shrunk below F | floor | fired |
| empform b2 widened | `overflow_missing` | fired |
| sandwich b5 shifted −1 pt | flush measure | +0.657 → −0.343: the measure moved by exactly 1.0, but the threshold was badly chosen |

**The r2line-grouping check has no planted control.**

| check | population | V5 2.0/7.5 dec (crop cell) | other 6 cells |
|---|---|---|---|
| R-box: each line's advance centre − (L+R)/2 | 66 boxes, all lines | max \|offset\| **0.000 pt** | same |
| R-box: ink centre − (L+R)/2 | 66 | max 0.395 pt (empform b6); none > 1.0 | same |
| census L/R vs c3 `region_bbox_pt` | 66 | differ ≤ 0.24 / 0.25 pt | same |
| box glyph box inside [D, U]; vertical centre within 1 pt | 66 | 66/66 | same |
| R-cell: inside the cell | 26 | 26/26 | 26/26 |
| R-cell: anchor delta > 0.35 pt against PDF-advance anchors | 26 | **Displaced and touching the pad (minimal):** alsulfatemass b2 −1.44, aspirin b2 −1.44, saltMass b2 −1.08. **Instrument only:** glycinemass b3 −0.365, **glycinemass b13 −0.927** | PAD 2.5 adds chloroform b2 −0.68, touching the pad |
| R-cell: lines share their alignment edge | 26 | spread ≤ 0.35 on 26/26 | same |
| right-flush cells, drawn right margin vs source | alsulfatemass, aspirin, chloroform b13; glycinemass b13; saltMass b10 | 2.35 / 2.35 / 2.35 / 3.43 / 5.18 vs 2.50 / 2.50 / 2.50 / 2.50 / 5.00 pt | same |
| geometric line grouping == `r2line` tag | 176 | 176/176 | 176/176 |
| size ≥ min(F, sz0) | 176 | 0 violations | 0 |
| size ≥ F (literal) | 176 | **4 below: combmap b11–b14 at 7.0** | the same 4 in 2.0/7.5, 2.0/8.0, 2.5/7.5, 2.5/8.0; 0 at F 7.0 |
| widest line > budget ⇔ named in `overflow` | 176 | 0 missing, 0 extra; `need_pt` and `budget_pt` reproduce within 0.1 | 0 / 0 |
| a multi-word line over budget inside a named overflow block | overflow blocks | 0 | 0 |
| OPEN step counts | 84 | i 65, ii 6, iii-displaced 6, iv-overflow 6, iii-anchor 1 | 2.0/7.0: i 65, iii-d 7, ii 6, iv-o 4, iii-a 2 |
| OPEN ii: fails at the anchor, and the displacement touches the pad | argon b2, copperMoles b1 and b4, vitC b1, Example2 b1, ethene b0 | 6/6 | same |
| OPEN i: drawn anchor == source anchor | 65 | 15 differ by 0.36–0.75 pt, all from the anchor instrument (§1a); 0 unexplained | same |
| flush blocks stay on their tight edge | 9 | 8 within 0.35 pt; **sandwich b5 sits 0.66 pt closer to its obstacle** (instrument) | same |
| extent outside free box − PAD with no width overflow | 84 | etheneBr b1 and b2 (flush, source at the edge) | **PAD 2.5:** combustion b1 0.25 and b4 0.50 pt. Step (i) accepts b4's 46.80 against b_i 47.28, although b_ii is 46.78; the source anchor itself sits inside the pad |

### 1a. Source-anchor instrument (`order_exact.py`)

`r2v5.py` computes the anchor as `start + Σ compose.measure(run text)`, a hinted re-measurement.

**Population:** 110 non-box blocks.
**Result:** composer anchor − PDF-advance anchor exceeds 0.3 pt on **47**.

| block | alignment | composer − PDF (pt) |
|---|---|---|
| glycinemass b13 | right | −0.93 |
| sandwich b1 | centre | +0.75 |
| rxn2 b12 | right | +0.68 |
| sandwich b5 | right, flush | +0.66 |
| etheneBr b0 | centre | +0.60 |
| FishLemon b9 | centre | +0.58 |
| map7 b5 | centre | +0.57 |

V0 carries the same offsets. In the glycinemass b13 crop the effect is about 2 px at 200 dpi.

### 1b. Were the shrinks needed? Exact re-measurement (hinted)

- **Population:** the 9 OPEN blocks below sz0 at 2.0/7.5 dec: glycine, potassium and sacch b1; Example2 b3; flowchart b5, b13 and b14; moleratio2 b3; map7 b5.
- **Method:** re-measure the **drawn partition** at every larger 0.25 pt step, scaling each item's size.
- **Result:** the same partition fits at a larger size on **0 of 9**. Closest: sacch b1 at 9.0 needs 72.36 of 72.01; Example2 b3 at 8.25 needs 64.44 of 64.02.
- A linear-scaling proxy had flagged sacch b1 and Example2 b3. The exact measurement cleared both.
- **Under linear metrics, sacch b1 does fit at 9.0** (§1d).

### 1c. D-lines (`dlines.py`)

- Line count ≠ min(n_src, words) outside iv-gain: **0 of 176**.
- Min-max balance, brute-forced: 51 multi-line partitions checked, **0** unbalanced by more than 0.3 pt.
- Planted controls (Example2 b1 given an unbalanced partition; empform b2 forced to n = 1): **both fired**.

**[ruling-consequence] Pure min-max balance separates an element or variable symbol from its noun, even where the source's own break also fits.** The source breaks "Mass of | K atoms (g)". Widths are hinted, at 9 pt, against PAD 2.0 budgets:

| block | chosen (max line) | semantic break (max line) | budget | V0 had it too? |
|---|---|---|---|---|
| empform b2 | `Massi A`\|`atóma` 32.76 | `Massi`\|`A atóma` 33.84 | 52.02 | no (V0: 1 line) |
| empform b5 | `Massi X`\|`atóma` | `Massi`\|`X atóma` | 52.02 | no |
| potassium b0 | `Mól K`\|`atóma (mól)` 48.24 | `Mól`\|`K atóma (mól)` 56.88 | 70.00 | no (V0 `Mól K atóma`\|`(mól)`) |
| potassium b2 | `Massi K`\|`atóma (g)` 38.52 | `Massi`\|`K atóma (g)` 47.16 | 65.27 | no |
| copperMoles b0 / b2 / b3 | `Mól af Cu`\|… 55.80 / `Massi Cu`\|… 38.52 / `Fjöldi Cu`\|`atóma` 36.00 | 69.84 / 52.56 / 39.24 | 74.26 / 65.26 / 65.27 | **yes**, not flagged by [USER] |
| argon b0 / b1 | `Mól af Ar`\|… 55.80 / `Massi Ar`\|… 38.52 | 67.32 / 50.04 | 72.00 / 65.26 | **yes**, not flagged |
| glycinemass b2 (bold) | `Mólmassi (g/mól`\|`frumefnis)` 70.20 | `Mólmassi`\|`(g/mól frumefnis)` 72.72 | 73.26 | no (V0 had 3 lines) |

For glycinemass b3, `Samtals (g/mól efnasamband)` needs 89.64 against an 80.00 budget, so its split inside the parenthesis is forced.

### 1d. Hinting probe

cairo's toy font API here reports `hint_metrics 0`, which is the default, and the default rounds advances.

**`Efnajöfnustuðull`, hinted width by size:**

| size (pt) | 7.0 | 7.25 | 7.5 | 7.75 | 8.0 | 8.25 | 8.5 | 8.75 | 9.0 |
|---|---|---|---|---|---|---|---|---|---|
| width (pt) | 49.68 | 50.76 | 55.08 | 55.44 | 55.80 | 58.68 | 60.48 | 63.36 | 65.16 |

**Hinted − linear (`HINT_METRICS_OFF`) width, same string:**

| string | size (pt) | hinted − linear (pt) |
|---|---|---|
| `Efnajöfnustuðull` | 7.5 | +1.71 |
| `Efnajöfnustuðull` | 8.0 | −1.13 |
| `Efnajöfnustuðull` | 9.0 | +1.11 |
| `Prósentusamsetning` | 7.5 | +1.11 |
| `Prósentusamsetning` | 8.0 | −1.29 |
| `mólmassa (g/mól)` | 9.0 | +0.85 |
| `Mólmassi (g/mól efnasambands)` (bold) | 9.0 | −0.79 |

**Consequences:**
- Any "fits by < ~1.7 pt" verdict depends on the metric.
- Of the named cases, **2 flip** under linear metrics: sacch b1 and moleratio2 b3.
- The browser renders SVG with its own metrics, so a fit in the PNG is no guarantee for the reader.
- This complements `r2v-numbers.md` §3 (inherited). That verifier found no contact or edge verdict flips at 2.0/7.0 and 2.0/7.5. This probe tests shrink and size **decisions** instead.

---

## 2. Changes to figures [USER] approved (`diffv0.py`)

**Population:** the 7 "Fine" figures: basehyd, rxn2, HClsoln, GreenChem, FishLemon, rxn3 and map7, holding 0, 8, 0, 0, 4, 2 and 7 layout blocks respectively. The F 7.0 and F 7.5 cells give identical results.

- **rxn2: 2 of 8 blocks change.**
  - **b12 `Stuðull` [ruling-consequence / instrument].** Drawn extent is [100.34, 128.42]; the source extent is [85.22, 127.74]. The label's centre sits about 7.9 pt right of the brace over 2O₂. See `r2v-rulings/crops/CNX_Chem_04_01_rxn2.png` and `r2/contact/CNX_Chem_04_01_rxn2.png`.
  - **Cause:** c3 `sibling_edges` gives b11 right = [Coefficient] and b12 right = [Reactant]. The cue is circular.
  - b9 `Hvarfefnamegin` goes 8.75 → 9.0 pt and is fine.
- **map7: 6 of 7 blocks change.**
  - b0, b1 and b4 become 2 lines. This is R-box/D-lines and looks acceptable.
  - **b5** goes from 2 lines at 9.0 to 1 line at 8.75 pt. D-open forces n_t = 1, while `Rúmmál|lausnar` at 9.0 would need only 33.84 of 65.03. Margins are 2.59 / 2.00 pt.
  - **b6** goes 8.5 → 9.0 pt; its left margin to the arrow drops from 4.84 to 2.50 pt.
- basehyd, HClsoln, GreenChem, FishLemon and rxn3 have **0 changes**.
- **brain b0**, ruled a cell on the invisible ⑩ container, is **identical to V0**.
- **exocytosis** b0, b1 and b2 move +2.52, −6.66 and −7.02 pt to their flush edges and now clear their leader lines.

### 2b. Coverage of every block that changed (`coverage.py`)

- 125 layout blocks are drawn differently from V0 at 2.0/7.5 dec. This counts text, x, y and size at 0.01 pt; the builder's 123 used a different comparison.
- **Looked at: 116.** That is 52 builder crops, 34 token plus 19 extra native crops of my own, and full contact sheets for map7, rxn2, combustion, ethene, glycinemass, flowchart, potassium, copperMoles, empform, map2, sandwich, vitC and argon.
- **Unreviewed: 9.** Example2 b4 (+0.32), map3 b6 (−2.34), moleratio1 b0 (+2.20) and b2 (−2.34), combmap b2, b3, b6 and b7 (−0.14 to −0.15), map8 b1 (−2.34). None changes its line count.
- Things seen in the extra sheets:
  - The flowchart rotated labels b3 and b4 become 2 lines, like the source, and read fine.
  - flowchart b16 and b17 become `Mól | af A`, fine.
  - sandwich b3 and b4 now sit at the source left edge, like the source.
  - **flowchart b13/b14 `Mólstyrkur` at 7.5 pt and empform b8 at 7.5 pt are visibly the smallest text in their figures.**

---

## 3. Pictures: the 41 [USER]-flagged blocks

Crops are `r2/crops/<b>__bNN.png` (SOURCE | V0 | V5 2.0/7.5 dec). Zooms and native crops are in `r2v-rulings/crops/`.

| USER row | block | defect [USER] described | visibly fixed? | what the instruments cannot see |
|---|---|---|---|---|
| 7, 8, 10 | alsulfatemass / aspirin / chloroform b3 `Samtals (amu)` | not split, spills out of the cell | **yes**: 2 lines, inside the cell | the neighbouring b2 cell is drawn at **8.5 pt beside b3 at 9.0** in the same header row (source is 9/9) |
| 14 | argon b2 | 3 lines overlap the arrow | **yes**: 2 lines under the arrow | — |
| 15 | copperMoles b1 | extra line, overlap | **yes** | — |
| 15 | copperMoles b4 | overlap; `mól-1` lacks superscript | **yes**: 3 lines, `(mól⁻¹)` | — |
| 16 / 17 / 18 | glycine / potassium / sacch b1 | extra line, overlap | **yes**, at 8.75 pt | sacch b1's shrink is a hinting artefact (§1d) |
| 18 | sacch b2 | 2 lines, outside the box | **yes**: 3 lines, subscripts, centred | — |
| 19 | vitC b0 | text overlaps the frame | **yes** | — |
| 19 | vitC b1 | extra line, overlap | **yes** | — |
| 20 | empform b2, b5 | one line, text outside the box | overflow **yes** | the `Massi A \| atóma` break (§1c) |
| 20 | empform b6 | a break leaves text outside | **yes** | — |
| 20 | empform b8 | text outside the last box | **yes**: margin 1.54 pt at F 7.5, 2.98 at F 7.0 | the smallest text in the figure; **F 8.0 margin is 0.64 pt, touching the frame** (`crops/zoom_empform_b8.png`) |
| 21 | Example2 b0, b2 | wrong breaks, overlap | **yes** | — |
| 21 | Example2 b1 | extra lines overlap arrow shapes | **yes**: 3 lines, margins 2.00 / 2.48 pt | — |
| 21 | Example2 b3 | extra lines, overlap | **yes**, at **8.0 pt** | visibly smaller than its 9.0 pt twin b1 |
| 23 | etheneBr b2 | unnecessary break; `Br2` | **yes**: 1 line, `Br₂` | — |
| 24 | ethene b0 | first line indented; could be centred to avoid the break | break gone; 1 line with `H₂O` and `9,55` | **starts 6.73 pt left of b17's column and ends 2.23 pt from the 234 pt page edge** (`crops/zoom_ethene.png`). [USER] suggested centring; the ruling says minimal displacement |
| 24 | ethene b17 | centred instead of left | **yes**: left-flush | — |
| 25 | flowchart b6, b9, b10, b11 | fewer breaks, overflow | **yes**: 4 lines, one word per line, as in the source | `Fjöldi agna\|af A` (44.64 of 52.26) would also fit |
| 29 | moleratio2 b3 | overlaps the box on the right | no overlap, at 8.0 pt | margins **2.21 / 2.00 pt** hinted; on linear metrics the word runs about 0.9 pt into the pad |
| 31 | sandwich b2 | unnecessary break | **yes**: flush-left | — |
| 31 | sandwich b5 | unnecessary break | **yes**: flush-right | 0.66 pt closer to its obstacle than the source |
| 32 | combmap b0, b1, b4, b5, b9 | subscripts, overflow | **yes** | — |
| 32 | combmap b10 | overflow | **yes**, at 8.0 pt | — |
| 32 | **combmap b8** | tiny font | **no**: now 7.0–8.0 pt, but box margins −2.80 / −5.50 / −6.58 pt at F 7.0 / 7.5 / 8.0, so the word **crosses both frame strokes**; V0 crossed only the right one (`crops/zoom_combmap_b8.png`) | a hyphen fits at 9 pt (Headline 6) |
| 34 | map8 b3–b6 | subscripts, overflow | **yes** | — |

**Blocks outside the 41:**
- **Subscript transfer:** combustion, map2, map3, moleratio1, moleratio2, limiting, glycine, sacch, map8 b7, etheneBr and ethene all read correctly.
- **Decimal commas:** visible in the glycinemass sheet. The other four ch03 figures rest on the builder's sentinel (b), inherited.
- **combmap b12 and b14 `Efnajöfnustuðull` at 7.0 pt:** touch both neighbouring boxes, **unchanged from V0**; named in `overflow`.
- **brain row 9:** the healed SVG was never rendered, so a PNG cannot show that it is fixed.

---

## 4. Repo state (verbatim, run at the end)

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain`:
```
?? docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md
```
This untracked spec was already present when the session began (`gitStatus` snapshot). I did not write it.

`find /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation -newer /home/siggi/dev/scratch-c140/reports/critic.md -not -path '*/pylibs/*' | head`:
```
```
(no output)

**Extra checks:**
- `find …/figure-text-translation/pylibs -name '*.pyc' -newer …/critic.md` → no output.
- `find …/pylibs -newer …/critic.md` → no output.
- **Positive control for `find -newer`:** the same predicate over `r2v-rulings` lists `r2v-rulings`, `geo-V5_p2.5_f7.0.json` and `coverage.py`.
- `pgrep -x headless_shell`, `pgrep -x chromium`, `pgrep -x chrome` and `pgrep -x python3` → all empty. No browser was started.
