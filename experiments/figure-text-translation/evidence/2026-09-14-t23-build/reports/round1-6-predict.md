# §C140 ② ⑨ ③: predictions for the repository implementation, measured on the final scratch build

**Date:** 2026-09-14. **Written before the repository implementation exists.**
**Cost:** 0 ISK. No MT was called and `tools/figure-run.js` was never run. Only `compose.py` copies were run, plus the frozen r2 instruments.
**Repo:** read-only. At the end, `git status --porcelain` printed 0 lines. `find -L … -newer plan/pred/START.marker` over `experiments/figure-text-translation` (pylibs included) and `books/efnafraedi-2e/figure-text` found 0 files. Control: the same predicate over `plan/pred/instruments` lists files.

**Disclosure.** A few inspection one-liners ran without `PYTHONDONTWRITEBYTECODE=1`. They printed JSON from scratch and imported only the stdlib, or system `cairo` for a version string. None could import a repo module. Every composer, instrument and analysis run had the variable set.

**What is predicted.** The design spec's "Real figures" leg says the ③ problem, collision, spill, contact, off-page, shrink, overflow and line-count numbers of the implementation must match predictions re-derived under the final rules. These are those predictions.

- **Population:** the 176 layout-path blocks of the 34 bought figures. The unit is one drawn block, keyed `basename#block`.
- **Build measured:** stage C of `plan/tree-int`. `plan/snap/C` is cmp-equal to it on compose / figlayout / figcontainers / figscripts / numloc / figtext / svgout.
- **Instruments:** the frozen r2 instruments, `r2/scripts/{measure,sentinels,analyse}.py` and `c3b/scripts/{c3lib,baseline,containers}.py`. They are cmp-equal to the repo's `evidence/2026-09-13-t23/instruments/{r2,c3b}/`. Only paths and field names were adapted; the list is below.
- **Reference:** V0 stays the reference. The comparison is against the frozen prototype cell `V5_p2.0_f7.5`.

## Pinned inputs

A prediction holds only if these are unchanged.

| input | value |
|---|---|
| repo HEAD (sidecars read from the working tree) | `135c08aea4480fe152e201e47e45f6944f2bc7f3` (clean). `sha256sum books/efnafraedi-2e/figure-text/*.is.json \| awk '{print $1}' \| sha256sum` → `7ebab957…` (34 files) |
| prepared figures | `scratch-c140/prep/figs`, 34 figures. From `/home/siggi/dev/scratch-c140`, `sha256sum` over `prep/figs/<b>/{runs.json,meta.json,blocks.json,artwork.png,artwork.pdf}` in `ls` order, piped to `sha256sum` → `25b766ea…`. The instruments read artwork, runs and meta from here, so the implementation must be composed from byte-identical inputs. |
| build | sha256: compose.py `ab230a68…`, figlayout.py `63d77fa7…`, figcontainers.py `a0b7294f…`, figscripts.py `1ccea27d…`, numloc.py `1ce74377…`, figtext.py `d06ae002…` |
| frozen instrument inputs | r2/census.json `0352c3dc…`, c3/userflags.json `720705ea…`, c3/blocks.jsonl `517f16bc…`, c3/baseline.jsonl `30b1209f…`, c3/containers.jsonl `773bb318…` |
| toolchain | Python 3.14.4, pycairo 1.27.0 / cairo 1.18.4 (system), Liberation Sans from /usr/share/fonts/truetype/liberation, PIL 12.3.0, pdfplumber 0.11.10, numpy 2.5.3 / scipy 1.18.1 (instruments only) |

## Controls, run first

All passed.

1. **measure.py:** the adapted copy re-measured the frozen work dirs.
   - `measure-V0.jsonl` is byte-identical to `r2/measure-V0.jsonl` (sha256 `ace280ca…`, 176 rows).
   - `measure-V5_p2.0_f7.5.jsonl` is byte-identical to the frozen file (`5ff9d8f0…`).
2. **sentinels.py:**
   - `sentinels-V5_p2.0_f7.5.json` is byte-identical to the frozen file.
   - `--control` fires 3 of 3 (deleted char, swapped positions, duplicated item) and the clean copy passes. This holds on the V5 items and on the final build's ethene b0 items.
3. **analyse.py:**
   - Control mode (frozen TAGS) gives `analysis.json` and `tables.md` byte-identical to `r2/`.
   - In final mode, all 8 frozen per-tag entries are identical to control mode. Adding the new tag moved nothing.
4. **Composer re-run with the extended DIAG dump:**
   - rc 0 on 34/34.
   - `items.json` and `compose-report.json` are byte-equal to `tree-int/work/C` on 34/34, so the dump moved nothing.
   - The diag's realdata fields equal tree-int's on 176/176 rows.
   - Keys agree on 176/176: the instrument's key (c3b/tree figtext + blockkey), the build's diag key and `report.blocks[bi]`.
5. **Attribution harness** (`attribute.py`, which runs `figlayout.decide` on switched inputs):
   - All prototype inputs reproduce the frozen r2 diag on 176/176 (wrapped lines, size, step, top, anchor+disp, widths).
   - All final inputs reproduce the build's diag on 176/176 (lines, size, step, align, x0, top, disp, vdisp, overflow).
6. **Supplementary linear-render runner:** in `hinted` mode it is byte-identical to `measure-FINAL.jsonl`.
7. **Fragility harness:** `decide()` reproduces the build on 176/176.

## Instrument adaptations

This is the complete list. Every verdict function, threshold, census and userflag file is unchanged. The `.adapt.diff` files in `instruments/` are the mechanical record.

- **A1 import path.** baseline.py, containers.py, measure.py and sentinels.py: `sys.path` now points at the adapted copies, one line each. c3lib.py: 0 lines changed.
- **A2 input and output paths.**
  - measure.py and sentinels.py read the work root from `PRED_WORK_ROOT` (default `r2/work`) and write to `plan/pred/out`.
  - analyse.py reads re-measured tags from `plan/pred/out` and the 6 non-re-measured frozen cells from `r2/`. It reads the build tag's reports from `plan/pred/work` and writes to `plan/pred/out`.
- **A3 field names (measure.py).** `r2line ← line`, `r2seg ← seg`. The r2 branch is taken when either tag is present. V0 rows still take the unchanged else-branch.
- **A4 TAGS (analyse.py).** Final mode appends the build tag to the frozen TAGS. V0 stays the reference and `best_by_rule` stays over the frozen SWEEP.
- **A5 overflow report names (analyse.py).**
  - `needPt→need_pt`, `budgetPt→budget_pt` (both rounded to 3 dp as r2 did), `sizePt→size`.
  - `cls` is taken from the diag.
  - An entry with `word: None` (a line-count overhang) maps to r2's `openFallback`. There are 0 such entries.
- **A6 diag rows** (`run_final.py`, dumped from the Layout):
  - `sz ← layout.size`, `rot`.
  - `drawn_widths ← layout.widths`. These are the build's own LINEAR widths; r2 wrote its own hinted widths. It is the same role, "the composer's width function", in a different metric.
  - `r2 = {cls, step, pad 2.0, disp_pt ← layout.disp, vdisp_pt ← layout.vdisp}`. Step names are the build's own: `v-overflow` is r2's `iv-overflow`, the same rule renumbered in the spec.
- **Deliberately not adapted.** sentinels.py still builds its ② expectation with the frozen `r2/tree/c2_scripts`. It still measures adjacency, box extents and cell anchors with cairo's hinted 200-dpi advances. The cell anchor still comes from `census.cell_align` and the box centre from census L/R. These are the frozen definitions. Where they read the linear build differently, the table says so and a labelled supplementary check gives the linear reading.

## The predictions

Frozen instruments, 176 blocks. The "final build" column is the prediction the repository implementation is held to.

A "SUPP" label marks a supplementary check. SUPP numbers explain a delta; they are never the prediction.

| metric | prototype V5_p2.0_f7.5 (frozen) | final build | delta explained |
|---|---|---|---|
| **Blocks with a layout problem** (c3b extended verdict ∪ unresolved flag) | 4: exocytosis b4, empform b8, moleratio2 b3, combmap b8 | **4**, the same 4 blocks | Unchanged set. empform b8 now fits at 7.5 pt (see its row) but is still a problem through the SHRINK post-condition (`not shrunk`). exocytosis b4 is still the known spurious gradient spill (layout decision identical to the prototype). |
| **[USER]-flagged mechanisms unresolved** (50 checks / 41 blocks) | 4: row 20 empform b8 SHRINK; row 29 moleratio2 b3 SHRINK; row 32 combmap b8 SHRINK + WIDER | **4**, the same 4; resolved 46/50 | 0 checks flip in either direction. |
| **Artwork hits** (ink on dark ≥ 10 px) | 1: combmap b8 21 px | **1**: combmap b8 **40 px** | Same block; the count grew. The layout moved very little: linear width 68.37 pt against hinted 69.48, and the production box centre moved 0.074 pt left and 0.097 pt in `top`. The instrument draws each item with cairo's hinted 200-dpi advances from an x0 the build computed in linear advances, so the rendered word ends about 1.1 pt right of its laid-out extent. SUPP, same instrument with a linear raster: prototype 32 px, final 33 px, so the label is where it was. |
| Σ ink on dark, px | 22 (combmap b8 21 + copperMoles b4 1) | **41** (combmap b8 40 + copperMoles b4 1) | Only combmap b8 changes; see the row above. |
| **Off-page** (drawn ink off page > source) | 0 | **0** | |
| **Spill** (≥ 10 px outside the block's colour region) | 2: exocytosis b4 181, combmap b8 114 | **2**: exocytosis b4 **181**, combmap b8 **156** | Same 2 blocks. combmap b8 grew for the hinted-raster reason in the hits row. SUPP linear raster: prototype 119, final 132. |
| **Text-on-text** (≥ 10 px) | 0 | **0** | Every block is 0 px, on both the hinted and the SUPP linear raster. |
| **Contact** (BOUNDED, drawn container margin < 1.0 pt) | 1: combmap b8 −5.50 | **1**: combmap b8 **−5.01** (census geometry; −5.01 L / −4.87 R) | Same block; the overhang shrank 0.49 pt. Linear need is 68.37 against hinted 69.48. The production box inner is 308.301–366.801 against census 308.38–366.87. |
| BOUNDED blocks with drawn container margin < 2.5 pt (supporting) | 10: combmap b8 −5.50, empform b8 1.53, alsulfatemass/aspirin/chloroform/saltMass b2 2.00, combmap b10 2.01, chloroform b13 2.34, alsulfatemass b13 2.35, aspirin b13 2.35 | **11**: combmap b8 −5.01, empform b8 1.94, alsulfatemass/aspirin/chloroform/saltMass b2 2.13, **copperMoles b0 2.28, argon b0 2.29**, combmap b10 2.34, **empform b0 2.48, empform b3 2.48** | **Joined, R9:** `Mól af Cu atómum \| (mól)`, `Mól af Ar atómum \| (mól)` and `Mól \| af A/X atómum` were 10.10–11.26 pt clear and are now 2.28–2.48 pt from the census sides. **Left the list:** the three right-flush `Mólmassi` b13 cells (alsulfatemass, aspirin, chloroform) went from 2.34–2.35 to 2.50 pt. glycinemass b13 went from 3.43 to 2.50 pt and now ends at its source right edge (adv cues). **Cells at 2.13:** production R sits 0.13 pt inside census R and the cell is pinned at production R − PAD. |
| **Shrunk** (drawn size < block[0] size) | 15 | **14**: alsulfatemass b2 8.5, aspirin b2 8.5, chloroform b2 **8.75**, glycine b1 8.75, potassium b1 8.75, empform b8 7.5, Example2 b3 8.0, flowchart b5 8.75, flowchart b13 7.5, flowchart b14 7.5, moleratio2 b3 **7.75**, combmap b8 7.5, combmap b10 **7.75**, map7 b5 8.75 | **Left:** sacch b1 (8.75 iii-displaced → 9.0 ii), from linear metrics alone in both attribution views. **Size changes, linear metrics:** chloroform b2 8.5 → 8.75 (`Meðalsætismassi` 72.47 linear against 74.16 hinted); moleratio2 b3 8.0 → 7.75. **combmap b10 8.0 → 7.75:** linear metrics in the forward chain, but the leave-one-out view shows production geometry alone (budget 54.50 against census 54.75) also yields 7.75. **Transitions vs V0:** broken 6 (glycine b1, potassium b1, Example2 b3, flowchart b13, flowchart b14, map7 b5), worsened 3 (empform b8 8.75 → 7.5, moleratio2 b3 8.5 → 7.75, combmap b10 8.75 → 7.75). |
| **Below 8.5 pt, source ≥ 8.5** | 7 (Σ 8.5 − size = 5.5) | **7 (Σ 6.0)**: empform b8 7.5, Example2 b3 8.0, flowchart b13 7.5, flowchart b14 7.5, moleratio2 b3 **7.75**, combmap b8 7.5, combmap b10 **7.75** | Same blocks. Σ grew 0.5 because of moleratio2 b3 and combmap b10 (see the shrunk row). |
| Below 8.5 pt because the source is < 8.5 | 4: combmap b11, b12, b13, b14 at 7.0 | **4**, the same, at 7.0 (source 7.0) | Effective floor min(7.5, 7.0). |
| **Overflow** (named overhang at the floor) | 8, need > budget: empform b8 52.92 > 51.99; flowchart b13/b14 34.56 > 34.0; combmap b8 69.48 > 54.49; combmap b11/b13 29.52 > 27.0 @7.0; combmap b12 49.68 > 45.21 @7.0; combmap b14 49.68 > 45.20 @7.0 | **7**: flowchart b13 `Mólstyrkur` 34.585 > 34.000 @7.5 (open); flowchart b14 the same; combmap b8 `Prósentusamsetning` 68.372 > 54.500 @7.5 (box); combmap b11 and b13 `Mólmassi` 29.559 > 27.000 @7.0 (open); combmap b12 and b14 `Efnajöfnustuðull` 49.813 > 45.203 @7.0 (open) | **empform b8 left**, and it takes both final inputs. Linear need is 52.104 against hinted 52.92. The production stroked-closed inner gives a budget of 52.213 against the census colour-region budget of 51.99. Reverting either input brings the overflow back. The other needs moved by metric only, at +0.13 to −1.11 pt. |
| open line-count fallback (`word None`) | 0 | **0** | |
| **Lines ≠ source** (more / fewer) | 18 (0 / 18) | **18 (0 / 18)**, the same list: empform b8, flowchart b5, map2 b6, map3 b6, moleratio1 b2, moleratio2 b2, moleratio2 b3, combmap b8, b10, b11, b12, b13, b14, map7 b3, map7 b6, map8 b1 (2→1, one word each); flowchart b15, b18 (4→3, 3 words) | None. **R9 repartitions 23 blocks without changing any line count** (see the R9 row). Height budget: 0 blocks changed. |
| **More lines than the source** | 0 | **0** | |
| **The 9 arrow labels** (rows 14–19, 21) hold the source line count | 9/9: five at 9.0, three at 8.75 (glycine b1, potassium b1, sacch b1), Example2 b3 at 8.0 | **9/9: six at 9.0** (argon b2, copperMoles b1, copperMoles b4, **sacch b1**, vitC b1, Example2 b1), **two at 8.75** (glycine b1, potassium b1), Example2 b3 at 8.0 | sacch b1 moved to 9.0 (linear metrics). The spec's "five at 9.0 pt, four at 8.0–8.75 pt" becomes six / three. |
| c3b census verdict union | 15 | **14** | sacch b1 no longer shrunk. |
| rank tuple (problem, unresolved, overflow, new sub-8.5, Σ, off-page) | (4, 4, 8, 7, 5.5, 0) | **(4, 4, 7, 7, 6.0, 0)** | Follows from the overflow and Σ rows. |
| blocks drawn differently from V0 (analyse's joined-text / 2-dp frame / size criterion) | 123 | **176** | Item level (SUPP J): 0 of 176 layout blocks are item-identical to V0, and 9 of 176 are item-identical to the prototype. Linear widths set x0 for every centre- and right-aligned line. The `drawn_frame` right edge is x0 + the build's linear width on every block (A6). |
| **Container classes** (build) vs census | census 66 / 26 / 84 | **box 66 / cell 26 / open 84, 0 disagreements** block by block | |
| **Box steps** | fit 64 · floor-overflow 2 (empform b8, combmap b8) | **fit 65 · floor-overflow 1** (combmap b8) | empform b8 (see overflow). |
| **Cell steps** | fit 26 | **fit 26** | |
| **Open steps** (sentinel (d)) | i 65 · ii 6 · iii-anchor 1 · iii-displaced 6 · iv-gain 0 · iv-overflow 6 | **i 65 · ii 7 · iii-anchor 2 · iii-displaced 4 · iv-gain 0 · v-overflow 6** | **ii +sacch b1** (linear). **iii-anchor +map7 b5:** from iii-displaced; adv source cues in the forward chain, and linear widths alone give the same step in leave-one-out. **iii-displaced −sacch b1 −map7 b5.** The remaining ii: argon b2, copperMoles b1, copperMoles b4, vitC b1, Example2 b1, ethene b0. iii-displaced: glycine b1, potassium b1, Example2 b3, moleratio2 b3. iii-anchor: flowchart b5, map7 b5. v-overflow: flowchart b13, b14, combmap b11–b14. |
| **Sentinel (a) TEXT** (geometric lines reproduce the value's words) | 176/176 | **176/176** | Planted controls fire 3/3 on the build. |
| Sentinel (a) adjacency (consecutive items abut < 0.02 pt; hinted advances) | 0 blocks | **34 blocks**, exactly the 34 blocks with a styled segment | **An instrument metric artefact.** The build advances the pen by linear advances; the frozen check measures the previous item with hinted advances (81 gaps, −1.537 to +0.317 pt, largest ethene b0). SUPP, the same check with linear advances: **0 blocks**. |
| **Sentinel (c) ② placement** | 34 token blocks, 52/52 stretches, 0 drawn-styled mismatches, `unformatted` 0 | **34 blocks, 52/52, 0 mismatches, `unformatted` 0** | Tokens and words from `figscripts` equal `c2_scripts` on 176/176, so the final script rule changes nothing on the 34. Body size equals block[0] size on 176/176. Inverted-base lines: 0 of 294 token lines. |
| **Sentinel (d) box centring** (each line centre within 0.5 pt of census (L+R)/2, hinted extents) | 66/66 | **66/66** | SUPP linear: every line is exactly on the production centre (max 0.0 pt). The largest deviation from the census centre is 0.201 pt (argon b0, production R 0.29 pt inside census). |
| **Sentinel (d) cell alignment** (edge at census-align source anchor ± 0.5, hinted) | 26/26 ok (22 at anchor + 4 displaced at anchor+disp, all inside the pad) | **25/26: chloroform b2 FAILS** ("displaced but lines not at anchor+disp", edge − anchor −0.403 / −1.100 against disp −1.266, `inside_cell_pad` False) | **An instrument metric artefact on a real size change.** chloroform b2 is now 8.75 pt; its lines are `Meðalsætismassi` (72.465 linear, 74.16 hinted) and `(amu)` (23.819 / 24.12). The frozen check's hinted extent is 1.7 pt wider than the laid-out one, so it leaves the anchor and the census pad. SUPP, linear widths with adv anchors: **26/26** edges exactly at anchor + disp (max 0.0), all 26 inside production [L+2, R−2] and census [L+2−0.5, R−2+0.5]. Alignments equal census on 26/26. |
| Cells displaced (disp, pt) | 4: alsulfatemass b2 −1.425, aspirin b2 −1.428, chloroform b2 −0.168, saltMass b2 −1.068; vertical 0 | **4, the same blocks:** alsulfatemass b2 **−1.646**, aspirin b2 **−1.650**, chloroform b2 **−1.266**, saltMass b2 **−1.297**; vertical 0 | Production R sits 0.13 pt inside census R, and the line centres move with linear widths. chloroform b2 grows by its 8.75 pt size. All four now sit exactly 2.000 pt inside production R. |
| **Floor consequence: empform b8 `Reynsluformúla`** | 7.5 pt, floor-overflow, box margin **1.54 L / 1.53 R** (census) | **7.5 pt, fits** (step `fit`, not in `overflow`); margins **2.057 L / 2.056 R** (production stroked-closed inner 409.873–466.086) = **1.94 / 1.95** (census 409.99–465.98); fit slack **0.109 pt** | Linear metrics plus production container geometry (see overflow). The spec's "overflows (52.92 > 51.99) with a 1.53 pt box margin" no longer holds. Still a PROBLEM block through SHRINK. **Most fragile prediction:** 0.109 pt of slack (see hazards). |
| **Floor consequence: flowchart b13 `Mólstyrkur`** | 7.5 pt, overflow 34.56 > 34.0, free-box margins **1.99 L / 1.45 R** | **7.5 pt, v-overflow, 34.585 > 34.000;** margins **1.71 L / 1.70 R** (census FL/FR; production 1.706 / 1.704) | The overhang is split almost evenly. In the forward chain the adv source cues move x0 by 0.27 pt and linear widths by 0.01 pt. With the extent wider than [FL+PAD, FR−PAD], the minimal clamp keeps the split nearest the anchor. |
| **Floor consequence: flowchart b14 `Mólstyrkur`** | 7.5 pt, overflow, margins **1.74 L / 1.70 R** | **7.5 pt, v-overflow, 34.585 > 34.000;** margins **1.46 L / 1.95 R** (census; production 1.456 / 1.954) | Same cause as b13 (adv cues 0.27 pt). b13's asymmetry has moved to b14: 0.54 pt into the pad on its left. |
| **Floor consequence: combmap b8 `Prósentusamsetning`** | 7.5 pt, margin **−5.50** L and R, ink 21 px, spill 114 px | **7.5 pt, floor-overflow 68.372 > 54.500;** margin **−5.01 L / −4.87 R** (census; production −4.931 / −4.939); **ink 40 px, spill 156 px** (hinted raster). SUPP linear raster: ink 33, spill 132. | Overhang reduced 0.49 pt (linear need). The pixel counts grew for the hinted-raster reason in the hits row. It overhangs both frame strokes until an editor splits it. |
| Other floor-adjacent blocks | combmap b10 8.0 pt, margins 2.01/2.02; moleratio2 b3 8.0 pt, free margins 2.21 L / 2.00 R; combmap b11/b13 +0.73/+0.75; b12 −0.26/−0.21, b14 −0.27/−0.21 | combmap b10 **7.75 pt**, census 2.34/2.57 (production 2.333/2.327); moleratio2 b3 **7.75 pt**, 2.86 L / 2.00 R; combmap b11, b13 **+0.72/+0.72**; b12 **−0.18/−0.43**, b14 **−0.18/−0.44** | b12 and b14 overhang more on the right (total 0.61 against 0.47 pt): linear `Efnajöfnustuðull` is 49.813 against hinted 49.68, and the adv anchor moves the split. |
| **R9 short-token binding** (a final rule, not in the prototype) | n/a | Bound partition taken on **174/176** (not taken on flowchart b10 and b11, `Fjöldi \| agna \| af \| A/B`, one word per line); **23 blocks repartitioned, 0 line counts changed** | Boxes argon b0, b1; copperMoles b0, b2, b3; glycine b0; potassium b0, b2; sacch b0; vitC b2; empform b0, b2, b3, b5; map2 b1; map3 b1; combmap b1, b5; map7 b1; map8 b4, b5. Open: combustion b1 `CO2, H2O, O2 og aðrar \| lofttegundir` and b2 `H2O-gleypir \| eins \| og Mg(ClO4)2`, whose free-box margin stays 2.25 / 24.25. Closest after binding: copperMoles b0 2.28 and argon b0 2.29 pt from their box sides. None is a contact or a hit. |
| Height budget (a final rule) | n/a | **0 blocks changed; `heightFit` False on 0/92** | |
| **SIBLING_TOL 0.2** (final alignment vs census) | census aligns rxn2 b11 `Hvarfefni` and b12 `Stuðull` **right** (single-cue-right-only) | **centre** (single-cue(L0C0R0)); the other 108 non-box blocks equal census | This is the spec's named negative control. `Stuðull` returns 7.62 pt to a0 92.72 (V0 92.78, prototype 100.34), back under the brace [USER] approved. `Hvarfefni` is unchanged in position. No frozen verdict scores this. |
| ethene b0 column edge (named in the spec's known consequences) | a0 15.77 against its source left edge 22.53 (b17's column 22.50): **6.76 pt left** | a0 **18.28: 4.25 pt left** | Linear widths only. Step ii pins the right edge at FR − PAD, and the linear line is 2.51 pt narrower. |

## Delta sources, by rule

The attribution harness switches one input at a time between the prototype's value and the final build's value. It reports the forward cumulative chain and leave-one-out; where they disagree, the interaction is named.

- **31 blocks** change lines, size, step, alignment or overflow.
- **157 blocks** change x0 or top by more than 0.01 pt, or change a decision.
- **19 blocks** have an identical decision.

| rule | blocks whose DECISION it moves | blocks whose position it moves |
|---|---|---|
| R9 binding | lines on 23 (listed above) | x0 on 21 of them |
| linear metrics (HINT_METRICS_OFF) | size: chloroform b2, sacch b1, moleratio2 b3, combmap b10 (combmap b10 also by production geometry alone); step: sacch b1; overflow: empform b8, jointly with geometry | x0 on 162 (every centre- and right-aligned line; ethene b0 2.51 pt) |
| adv source cues (PDF advances) | step: map7 b5 in the forward chain. Leave-one-out instead flips copperMoles b1 (ii → i with hinted cues), whose final step equals the prototype's | x0 on 76 (55 open, 21 cells). The glycinemass b13 right-flush `Mólmassi` now ends at 230.28, the source edge; it was 0.93 pt short (r2v-numbers D7, closed). flowchart b13/b14 overhang split |
| production container geometry | step and overflow: empform b8 (budget 52.213 against 51.99) | top on all 66 boxes; x0 on 60 boxes and the 4 displaced cells. Box centre moves ≤ 0.201 pt, width ≤ 0.42 pt. brain b0's fill-rect cell is inset 0.5 pt per side (width −0.993). Open FL/FR differ by at most 0.254 pt on all 84, exceeding 0.25 on 6. room_up / room_down differ on 15, by more than 0.25 pt on 9 (−1.75 to −5.75 pt). Only step iv reads them, and it is never reached |
| production alignment (SIBLING_TOL 0.2) | align: rxn2 b11, b12 | x0: rxn2 b12 (7.50 pt at that step) |
| height budget | none | none |
| body size | none (equal to block[0] size on 176/176) | none |
| script rule / inverted base (figscripts vs c2_scripts) | none (tokens and words identical 176/176; 0 inverted-base lines of 294) | none |

## Hazards for the comparison

Read these before calling a miss.

1. **Decisions within 0.3 pt of flipping** (`fragility.py`, with the build's own inputs). If the implementation differs by less than a point here, these are the numbers that move first.
   - **flowchart b5** `iii-anchor` at 8.75 pt: 9.0 misses the budget by **0.035 pt**. A flip would give shrunk 13 and open i 66 / iii-anchor 1.
   - **empform b8** fits by **0.109 pt**. A flip would give overflow 8, box fit 64 / floor-overflow 2, and margins about 1.9 pt.
   - **moleratio2 b3** is iii-displaced: b_i misses by **0.141 pt**, so a flip is step-only, to iii-anchor.
   - **alsulfatemass b2 and aspirin b2** fit at 8.5 pt with **0.249 / 0.250 pt** to spare. A flip would give 8.25 pt and sub-8.5 count 9.
   - **glycine b1 and potassium b1** miss 9.0 by **0.252 pt**. A flip would give ii at 9.0 and shrunk 12.

   A container inset or metric difference of that size explains a miss on exactly these rows; any other miss does not.
2. **Three frozen-instrument readings are metric artefacts, predicted as measured:** adjacency on 34 blocks, the chloroform b2 cell fail, and combmap b8's 40 px / 156 px. They were measured with cairo's hinted 200-dpi advances on a layout the build makes in linear advances. They are predictions, not defects, and their linear readings are in the table.
3. **Inputs are part of the prediction.** Sidecars must be at the pinned HEAD. Figures must be composed from inputs byte-identical to `prep/figs`, and the instruments read artwork, runs and meta there. A re-prepared artwork.png with different bytes changes the pixel verdicts. The design says `svgfix` touches only `artwork.svg`, which no instrument reads.
4. **Step names:** the build writes `v-overflow` for r2's `iv-overflow`, as the spec renumbered the open steps.
5. **The DIAG patch depends on local variable names.** `run_final.py` reads the translated path's locals by name: `BI`, `key`, `container`, `layout`, `cues`, `ls`, `sz0`, `rot`, `width`.
   - Layout keys outside the fixed interface (`widths`, `budget`, `bound`, `heightFit`) are read only through `.get()`.
   - A missing `widths` falls back to the caller's `width()`. Exercised once: 176/176 identical widths and items byte-equal 34/34.
   - A renamed local still passes the three anchor checks, then stops with a NameError mid-run. That is an instrument failure, not a prediction miss.
6. **Spec text that these numbers supersede.** §4's "Known consequences" and "What the 7.5 pt floor costs" need updating:
   - empform b8 now fits (margin about 1.94 pt, census), where the spec says it overflows at 52.92 > 51.99 with a 1.53 pt margin.
   - ethene's line is 4.25 pt off the column edge, where the spec says about 6.8 pt.
   - flowchart b13/b14 margins are 1.71/1.70 and 1.46/1.95.
   - combmap b8 margin is −5.01 pt with spill 156 px, where the spec says −5.5 pt and 114 px.
   - The arrow labels are six at 9.0 pt, two at 8.75 and one at 8.0, where the spec says five and four.
   - The §4 evidence line "hits 32 → 1 … spill 24 → 2" is unchanged in count.

## Reproduce

Everything writes under `/home/siggi/dev/scratch-c140/plan/pred`. Figures are composed and measured one at a time. The full run takes about 1.5 minutes; peak RSS is 0.28 GB (measure.py, measured with `/usr/bin/time -v`).

```bash
# every number above, controls first (V0 / V5 byte-identity, sentinels, analyse), then the build, then supplementary
bash /home/siggi/dev/scratch-c140/plan/pred/reproduce.sh
# individual steps (all with PYTHONDONTWRITEBYTECODE=1):
cd /home/siggi/dev/scratch-c140/plan/pred
export PYTHONDONTWRITEBYTECODE=1
python3 -u instruments/measure.py V0 && cmp out/measure-V0.jsonl ../../r2/measure-V0.jsonl
python3 -u instruments/measure.py V5_p2.0_f7.5 && cmp out/measure-V5_p2.0_f7.5.jsonl ../../r2/measure-V5_p2.0_f7.5.jsonl
python3 -u instruments/sentinels.py V5_p2.0_f7.5 && cmp out/sentinels-V5_p2.0_f7.5.json ../../r2/sentinels-V5_p2.0_f7.5.json
python3 -u instruments/sentinels.py V5_p2.0_f7.5 --control
python3 -u instruments/analyse.py control && cmp out/analysis-control.json ../../r2/analysis.json && cmp out/tables-control.md ../../r2/tables.md
python3 -u instruments/run_final.py                          # composes the 34 -> work/FINAL (compare to tree-int/work/C)
PRED_WORK_ROOT=$PWD/work python3 -u instruments/measure.py FINAL
PRED_WORK_ROOT=$PWD/work python3 -u instruments/sentinels.py FINAL
PRED_WORK_ROOT=$PWD/work python3 -u instruments/sentinels.py FINAL --control
python3 -u instruments/analyse.py final                      # -> out/analysis-final.json, out/tables-final.md
python3 -u instruments/attribute.py; python3 -u instruments/supplementary.py; python3 -u instruments/fragility.py
PRED_WORK_ROOT=$PWD/work python3 -u instruments/supp_render.py FINAL linear
python3 -u instruments/supp_render.py V5_p2.0_f7.5 linear
python3 -u instruments/pred_numbers.py > out/numbers.txt   # every number in the table, printed from the JSON
```

**To hold the repository implementation to these predictions:**
1. Copy its `experiments/figure-text-translation` into scratch. Never run inside the repo.
2. Run `bash reproduce.sh <that copy> REPO`. `run_final.py`'s three patch anchors must each occur once, or it refuses.
3. Compare `out/analysis-final-REPO.json` `per_tag.REPO` and `out/sentinels-REPO.json` with the `FINAL` entries.

## Files

Everything is under `/home/siggi/dev/scratch-c140/plan/pred/`.

- **`instruments/`:** the adapted copies with their `*.adapt.diff` files and read-only `frozen/` originals, plus `run_final.py`, `attribute.py`, `supplementary.py`, `supp_render.py`, `fragility.py` and `pred_numbers.py`.
- **`out/`:**
  - `measure-{V0,V5_p2.0_f7.5,FINAL}.jsonl` and the `*.SUPP-{hinted,linear}.jsonl` files
  - `sentinels-{V5_p2.0_f7.5,FINAL}.json`
  - `analysis-{control,final}.json` and `tables-{control,final}.md`
  - `attribution.json`, `supplementary.json`, `fragility.json`, `run-FINAL.json`, `numbers.txt`
- **`work/FINAL/<figure>/`:** items.json, diag.json, compose-report.json and translated.svg.
- **`logs/`**
