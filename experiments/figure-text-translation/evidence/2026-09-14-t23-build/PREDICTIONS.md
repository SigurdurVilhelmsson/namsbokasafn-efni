# §C140 ② ⑨ ③: predictions for the repository implementation, re-derived on the fixed scratch build

**Date:** 2026-09-14. **Written before the repository implementation exists.**
**Supersedes:** `plan/pred/PREDICTIONS.md` (same date, measured on the unfixed build). Where the two disagree, this file wins.
**Cost:** 0 ISK. No MT was called and `tools/figure-run.js` was never run. Only copies of `compose.py` were run, plus the frozen r2 instruments.
**Repo:** read-only. At the end, `git status --porcelain` printed 0 lines, and `find -L … -newer plan/pred2/START.marker` over `experiments/figure-text-translation` (pylibs included) and `books/efnafraedi-2e/figure-text` found 0 files. Control: the same predicate over `plan/pred2/instruments` lists 29 files. 0 files newer than the marker in `tree-fix`, `pred`, `tree-int`, `c-fix`, `r2`, `c3` or `prep`.

**Disclosure.** A few inspection one-liners ran without `PYTHONDONTWRITEBYTECODE=1`. They read JSON from scratch and imported only the stdlib. Every composer, instrument and analysis run had the variable set.

## What changed since the previous round

The build measured here is `plan/tree-fix`. It differs from the previous round's build (tree-int stage C) by these fixes:

| fix | where | what |
|---|---|---|
| F1 | figlayout | **R9 binds symbols only** ([USER] ruling 2026-09-14, supersedes the literal R9). A 1-2 character word may not end a line, unless it is lowercase alphabetic (`w.isalpha() and w.islower()`: `af`, `og`, `á`, `í`). |
| F2 | figlayout | A box/cell label that meets its height budget at no size shrinks to the floor and is named (`axis: 'height'`). Every overflow entry carries `axis`. |
| F3 | figlayout | An off-grid body size appends the floor to the size ladder. |
| F4 | figlayout | Width overflows carry `linePt`, the widest drawn line. |
| F5 | figlayout | Box/cell tries line count before size, like the open path's (iii) before (iv). |
| F6 | figscripts | `body_size` votes at each line's resolved base. |
| F7 | figcontainers | Docstrings only. The module is AST-equal to tree-int with docstrings removed. |
| compose | compose.py | One `transfer` per value (a list value is joined first). New report key `containerErrors`. Overflow copied field by field. |

**Measured result:** F1 moves the line partition of **16 blocks** and the `bound` flag of 2 more. F2-F7 and the compose changes move **0 decisions** on the 176 blocks (`isolate.py`, each fix applied alone to tree-int's module). Every other frozen verdict, count and list is unchanged.

## Pinned inputs

A prediction holds only if these are unchanged.

| input | value |
|---|---|
| repo HEAD (sidecars read from the working tree) | `135c08aea4480fe152e201e47e45f6944f2bc7f3` (clean). `sha256sum books/efnafraedi-2e/figure-text/*.is.json \| awk '{print $1}' \| sha256sum` → `7ebab957…` (34 files) |
| prepared figures | `scratch-c140/prep/figs`, 34 figures. From `/home/siggi/dev/scratch-c140`, `sha256sum` over `prep/figs/<b>/{runs.json,meta.json,blocks.json,artwork.png,artwork.pdf}` in `ls` order, piped to `sha256sum` → `25b766ea…`. The instruments read artwork, runs and meta from here, so the implementation must be composed from byte-identical inputs. |
| build (`plan/tree-fix`) | sha256: compose.py `a80322d2…`, figlayout.py `6e5a697d…`, figcontainers.py `fff2d1c0…`, figscripts.py `7f4d067b…`, numloc.py `1ce74377…` (unchanged), figtext.py `d06ae002…` (unchanged), svgout.py `63ea69b9…` (unchanged), blockkey.py `008f220c…` (unchanged) |
| previous build (the comparison column) | `plan/pred/work/FINAL` and `plan/pred/out`, composed from tree-int stage C (compose `ab230a68…`, figlayout `63d77fa7…`) |
| frozen instrument inputs | r2/census.json `0352c3dc…`, c3/userflags.json `720705ea…`, c3/blocks.jsonl `517f16bc…`, c3/baseline.jsonl `30b1209f…`, c3/containers.jsonl `773bb318…` |
| toolchain | Python 3.14.4, pycairo 1.27.0 / cairo 1.18.4 (system), Liberation Sans from /usr/share/fonts/truetype/liberation, PIL 12.3.0, pdfplumber 0.11.10, numpy 2.5.3 / scipy 1.18.1 (instruments only, `c3/pylibs-np`) |

**Precision.** Every pt value is stated at 2 dp and holds to **±0.01**. Production margins are computed from the diag's **unrounded** `x0` (displacement included) and linear widths. Census margins use the frozen instrument's geometry, computed unrounded and rounded once. The previous round quoted some production margins at 3 dp from 2-dp frames. Their third decimal was rounding noise (spec reviewer, finding 1). Two instruments now agree to the third decimal on all five of those blocks. The reviewer used fontTools hmtx widths plus their own `container_for` run; this round used the diag's unrounded x0 and linear widths. The values are empform b8 2.054, combmap b8 −4.936, flowchart b13 1.708, flowchart b14 1.458 / 1.958 and combmap b10 2.329.

## Controls, run first

All passed.

1. **measure.py:** the repointed copy re-measured the frozen work dirs.
   - `measure-V0.jsonl` is byte-identical to `r2/measure-V0.jsonl` (sha256 `ace280ca…`, 176 rows).
   - `measure-V5_p2.0_f7.5.jsonl` is byte-identical to the frozen file (`5ff9d8f0…`, 176 rows).
2. **sentinels.py:**
   - `sentinels-V5_p2.0_f7.5.json` is byte-identical to the frozen file.
   - `--control` fires 3 of 3 (deleted char, swapped positions, duplicated item) and the clean copy does not fire. This holds on V5 and on the fixed build.
3. **analyse.py:**
   - Control mode gives `analysis.json` and `tables.md` byte-identical to `r2/`.
   - In final mode, all 8 frozen per-tag entries are identical to control mode.
4. **Composer re-run** (`run_final.py`, the same ITEMS and DIAG patches):
   - rc 0 on 34/34.
   - `items.json` and `compose-report.json` are byte-equal to the fix round's own stage-C run (`c-fix/rd/C`) on 34/34.
   - The diag's realdata fields equal `c-fix/rd/C` on 176/176 rows.
5. **Previous build vs fixed build** (`compare_prev.py`), every layer, by block:
   - Layout items differ on exactly **16 blocks**. They are the 16 blocks in the F1 table below. Kept items are identical in all 34 figures.
   - `compose-report.json` differs only by the new keys: `containerErrors == []` on 34/34, and `axis`/`linePt` on each overflow. With those removed, the reports are equal 34/34.
   - Diag rows differ on 18 blocks: the 16, plus flowchart b10 and b11 (`bound` False → True, lines unchanged).
   - `measure-FINAL.jsonl` rows differ on exactly the 16, in `text`, `drawn_frame`, `drawn_widths` and `geometry` only. `ink_on_dark`, `spill`, `text_coll`, `ink_off_page`, `size`, `lines` and `shrunk` are unchanged on all 176.
6. **Per-fix isolation** (`isolate.py`, fixed build's inputs):
   - tree-fix's figlayout reproduces the fixed diag 176/176.
   - tree-int's figlayout reproduces the previous diag 176/176.
   - F1 alone moves 18 decisions. That is the instrument's positive control. F2, F3, F4 and F5 each move 0.
   - F6 `body_size` old = new on 176/176, and figscripts words old = new on 176/176.
   - Every layout value is a `str`, so the compose list join is the identity.
7. **R9 three-way** (`r9_variants.py`, the controller's harness with `literal` made explicit):
   - The fixed build's own rule reproduces its diag (lines, size, step, bound) 176/176.
   - symbols ≠ off on 11 blocks (the controller's list). literal ≠ symbols on 16 (= step 5). literal ≠ off on 23 (= the previous round's R9 list).
8. **Attribution harness** (`attribute.py`): all prototype inputs reproduce the frozen r2 diag on 176/176, and all final inputs reproduce the fixed build's diag on 176/176. F3 and F5 have no switch, and the prototype control still holds.
9. **Supplementary linear-render runner:** in `hinted` mode it is byte-identical to `measure-FINAL.jsonl`.
10. **Fragility harness:** `decide()` reproduces both builds on 176/176.
11. **Full re-run of `reproduce.sh`:** every file in `out/` is byte-identical to the first run, except `run-FINAL.json`, which differs only in `secs`.

## Instrument adaptations

The A1-A6 adaptations of the previous round are carried unchanged (`instruments/*.adapt.diff`). This round adds the list below. `instruments/*.adapt2.diff` is the mechanical record against `plan/pred/instruments`. `frozen/` and c3lib.py are untouched.

- **B1 paths.** Every `plan/pred` path in a non-frozen instrument now points at `plan/pred2`. Nothing else changed in `analyse.py`, `measure.py`, `sentinels.py`, `baseline.py`, `containers.py`, `attribute.py`, `supp_render.py` and `pred_numbers.py`.
- **B2 run_final.py.**
  - The default TREE is `plan/tree-fix`, and the module byte-check is against tree-fix.
  - The byte-equality control is against `c-fix/rd/C`. Its `realdata.py` applies the same `_TagList` and `styled` patches and the same `SOURCE_DATE_EPOCH`.
  - Byte-equality to the previous build is recorded, not asserted.
  - The DIAG patch is unchanged. It dumps `layout["overflow"]` whole, so `axis` and `linePt` ride along. No other new Layout key is needed.
- **B3 analyse.py (unchanged, noted).** A5 still reads only `word`, `needPt`, `budgetPt` and `sizePt`. A `word: None` entry of either axis would land in `openFallback`; there are 0.
- **B4 fragility.py.**
  - argv `[INST WORK OUT]`, so one set of definitions runs on both builds.
  - Box/cell margins follow the build's own search order, read from the module: tree-fix tries count before size (F5), tree-int tries size before count.
  - The R9 margin is reported only where binding changes the cut.
  - Margins are unrounded in the JSON.
- **B5 supplementary.py.**
  - G margins (census and production) come from the diag's unrounded frame. They are asserted within 0.005 pt of measure's 2-dp frame.
  - New L section: BOUNDED blocks with margin < 2.5, on both builds, with production margins.
  - New P section: the F1 and R9 blocks, before and after.
- **New instruments:**
  - `compare_prev.py` (control 5).
  - `isolate.py` (control 6). It uses `pred2/iso/F<k>/`, tree-int's modules with one `iso-F<k>` diff applied. The combined figlayout diff applied to tree-int is byte-equal to tree-fix.
  - `r9_variants.py` (control 7). This is a copy of `plan/r9/r9_variants.py`. On the fixed module its old `literal` mode silently became symbols-only, so literal is now spelled out.

## The predictions

Frozen instruments, 176 blocks. The **fixed build** column is the prediction the repository implementation is held to. "SUPP" marks a supplementary check; SUPP numbers explain a delta and are never the prediction. Short names drop `CNX_Chem_`; bN is the block index.

| metric | prototype V5_p2.0_f7.5 (frozen) | previous build (`plan/pred`) | **fixed build (prediction)** | change vs previous build, explained |
|---|---|---|---|---|
| **Blocks with a layout problem** (c3b extended verdict ∪ unresolved flag) | 4: exocytosis b4, empform b8, moleratio2 b3, combmap b8 | 4, the same | **4**: exocytosis b4, empform b8, moleratio2 b3, combmap b8 | Unchanged. empform b8 fits, but is a problem through SHRINK. exocytosis b4 is the known spurious gradient spill. |
| **[USER]-flagged mechanisms unresolved** (50 checks / 41 blocks) | 4: row 20 empform b8 SHRINK; row 29 moleratio2 b3 SHRINK; row 32 combmap b8 SHRINK + WIDER | 4, the same | **4**, the same; resolved 46/50 | Unchanged. `flag_table` is identical on all 50 checks. |
| **Artwork hits** (ink on dark ≥ 10 px) | 1: combmap b8 21 px | 1: combmap b8 40 px | **1: combmap b8 40 px** | Unchanged. vs prototype: a hinted-raster artefact. SUPP linear raster: 32 prototype / 33 fixed. |
| Σ ink on dark, px | 22 | 41 | **41** (combmap b8 40 + copperMoles b4 1) | Unchanged. |
| **Off-page** | 0 | 0 | **0** | Unchanged. |
| **Spill** (≥ 10 px) | 2: exocytosis b4 181, combmap b8 114 | 2: exocytosis b4 181, combmap b8 156 | **2: exocytosis b4 181, combmap b8 156** | Unchanged. SUPP linear: combmap b8 119 prototype / 132 fixed. |
| **Text-on-text** (≥ 10 px) | 0 | 0 | **0** | Unchanged. The 16 F1 blocks are 0 px before and after. |
| **Contact** (BOUNDED, drawn container margin < 1.0 pt) | 1: combmap b8 −5.50 | 1: combmap b8 −5.01 | **1: combmap b8 −5.01** census (−5.01 L / −4.87 R); production −4.94 / −4.94 | Unchanged. The previous round's production −4.931 / −4.939 was rounding noise. |
| BOUNDED blocks with drawn container margin < 2.5 pt (supporting) | 10 | 11: combmap b8 −5.01, empform b8 1.94, alsulfatemass/aspirin/chloroform/saltMass b2 2.13, copperMoles b0 2.28, argon b0 2.29, combmap b10 2.34, empform b0 2.48, empform b3 2.48 | **7**: combmap b8 −5.01, empform b8 1.94, alsulfatemass/aspirin/chloroform/saltMass b2 2.13, combmap b10 2.34 | **F1 removed 4.** copperMoles b0 `Mól af \| Cu atómum (mól)` 2.28 → 4.29. argon b0 `Mól af \| Ar atómum (mól)` 2.29 → 4.29. empform b0 `Mól af \| A atómum` and b3 `Mól af \| X atómum` 2.48 → 7.49. Production margins of the 7 are in the L section of `out/supplementary.json`. |
| **Shrunk** (drawn size < block[0] size) | 15 | 14 | **14**: alsulfatemass b2 8.5, aspirin b2 8.5, chloroform b2 8.75, glycine b1 8.75, potassium b1 8.75, empform b8 7.5, Example2 b3 8.0, flowchart b5 8.75, flowchart b13 7.5, flowchart b14 7.5, moleratio2 b3 7.75, combmap b8 7.5, combmap b10 7.75, map7 b5 8.75 | Unchanged. vs V0: broken 6 (glycine b1, potassium b1, Example2 b3, flowchart b13, b14, map7 b5); worsened 3 (empform b8, moleratio2 b3, combmap b10). |
| **Below 8.5 pt, source ≥ 8.5** | 7 (Σ 5.5) | 7 (Σ 6.0) | **7 (Σ 6.0)**: empform b8 7.5, Example2 b3 8.0, flowchart b13 7.5, flowchart b14 7.5, moleratio2 b3 7.75, combmap b8 7.5, combmap b10 7.75 | Unchanged. |
| Below 8.5 pt because the source is < 8.5 | 4: combmap b11-b14 at 7.0 | 4, the same | **4**: combmap b11, b12, b13, b14 at 7.0 | Unchanged. Effective floor is min(7.5, 7.0). |
| **Overflow** (named overhang) | 8 | 7 | **7**, all `axis: 'width'`, `linePt == needPt`: flowchart b13 and b14 `Mólstyrkur` 34.58 > 34.00 @7.5 (open, v-overflow); combmap b8 `Prósentusamsetning` 68.37 > 54.50 @7.5 (box, floor-overflow); combmap b11 and b13 `Mólmassi` 29.56 > 27.00 @7.0 (open, v-overflow); combmap b12 and b14 `Efnajöfnustuðull` 49.81 > 45.20 @7.0 (open, v-overflow) | Same 7 entries and values. **F2/F4 add `axis` (width on 7/7) and `linePt`.** linePt equals needPt on 7/7 because every overflow is a single word. 0 entries have axis `height`. |
| `containerErrors` (new report key) | n/a | n/a (no key) | **0** on 34/34 (`[]` in every report) | New key, empty. No container detection raised on the 34. |
| open line-count fallback (`word None`) | 0 | 0 | **0** | Unchanged. |
| **Lines ≠ source** (more / fewer) | 18 (0 / 18) | 18 (0 / 18) | **18 (0 / 18)**: empform b8, flowchart b5, map2 b6, map3 b6, moleratio1 b2, moleratio2 b2, moleratio2 b3, combmap b8, b10, b11, b12, b13, b14, map7 b3, map7 b6, map8 b1 (2→1, one word each); flowchart b15, b18 (4→3, 3 words) | Unchanged. F1 repartitions 16 blocks and changes 0 line counts. |
| **More lines than the source** | 0 | 0 | **0** | Unchanged. |
| **The 9 arrow labels** hold the source line count | 9/9: five at 9.0, three at 8.75, one at 8.0 | 9/9: six at 9.0, two at 8.75, one at 8.0 | **9/9: six at 9.0** (argon b2, copperMoles b1, copperMoles b4, sacch b1, vitC b1, Example2 b1), **two at 8.75** (glycine b1, potassium b1), **Example2 b3 at 8.0** | Unchanged. No arrow label is an F1 block. |
| c3b census verdict union | 15 | 14 | **14** | Unchanged. |
| rank tuple (problem, unresolved, overflow, new sub-8.5, Σ, off-page) | (4, 4, 8, 7, 5.5, 0) | (4, 4, 7, 7, 6.0, 0) | **(4, 4, 7, 7, 6.0, 0)** | Unchanged. |
| blocks drawn differently from V0 (analyse's criterion) | 123 | 176 | **176** | Unchanged. SUPP J: item-identical to V0 0/176, to the prototype 9/176. |
| **Container classes** vs census | 66 / 26 / 84 | 66 / 26 / 84, 0 disagreements | **box 66 / cell 26 / open 84, 0 disagreements** | Unchanged. F7 is docstrings only. |
| **Box steps** | fit 64 · floor-overflow 2 | fit 65 · floor-overflow 1 | **fit 65 · floor-overflow 1** (combmap b8) | Unchanged. F5 changes no box. |
| **Cell steps** | fit 26 | fit 26 | **fit 26** | Unchanged. |
| **Open steps** | i 65 · ii 6 · iii-anchor 1 · iii-displaced 6 · iv-overflow 6 | i 65 · ii 7 · iii-anchor 2 · iii-displaced 4 · iv-gain 0 · v-overflow 6 | **i 65 · ii 7 · iii-anchor 2 · iii-displaced 4 · iv-gain 0 · v-overflow 6** | Unchanged. ii: argon b2, copperMoles b1, copperMoles b4, sacch b1, vitC b1, Example2 b1, ethene b0. iii-displaced: glycine b1, potassium b1, Example2 b3, moleratio2 b3. iii-anchor: flowchart b5, map7 b5. v-overflow: flowchart b13, b14, combmap b11-b14. |
| **Sentinel (a) TEXT** | 176/176 | 176/176 | **176/176** | Unchanged. The planted controls fire 3/3. |
| Sentinel (a) adjacency (hinted advances) | 0 blocks | 34 blocks, 81 gaps | **34 blocks, 72 gaps**, range −1.54 to +0.32 pt, largest ethene b0 | **F1 removed 9 gaps, in 9 blocks:** glycine b0, sacch b0, map2 b1, map3 b1, combmap b1, b5, combustion b2, map8 b4, b5. The new partitions break a line between a plain word and the styled formula after it (`Mól af \| C2H5O2N`), so that item pair no longer abuts. combustion b1 keeps its gap (`2` → ` og`). The block set is still exactly the 34 with a styled segment. Instrument artefact as before: SUPP linear advances give 0 blocks. |
| **Sentinel (c) ② placement** | 34 blocks, 52/52, 0 mismatches, `unformatted` 0 | the same | **34 blocks, 52/52 stretches, 0 mismatches, `unformatted` 0** | Unchanged. Inverted-base lines 0 of 294. |
| **Sentinel (d) box centring** (hinted, census centre ± 0.5) | 66/66 | 66/66 | **66/66** | Unchanged. SUPP linear: 0.00 from the production centre; at most 0.20 from the census centre (argon b0). |
| **Sentinel (d) cell alignment** (hinted) | 26/26 | 25/26, chloroform b2 fails | **25/26: chloroform b2 fails** (edge − anchor −0.40 / −1.10 against disp −1.27) | Unchanged. This is a metric artefact. SUPP linear: 26/26 at anchor + disp, all inside the pads. |
| Cells displaced (disp, pt) | 4: −1.43, −1.43, −0.17, −1.07 | 4 | **4:** alsulfatemass b2 −1.65, aspirin b2 −1.65, chloroform b2 −1.27, saltMass b2 −1.30; vertical 0 | Unchanged (previous round: −1.646, −1.650, −1.266, −1.297). Each ends 2.00 pt inside production R. |
| **Floor consequence: empform b8 `Reynsluformúla`** | 7.5 pt, floor-overflow, census margins 1.54 L / 1.53 R | 7.5 pt, fit | **7.5 pt, fit**; production margins **2.05 / 2.05** (inner 409.87-466.09); census **1.94 / 1.95**; fit slack **0.11** (linear need 52.10 against production budget 52.21) | Unchanged decision. Production 2.057/2.056 in the previous round was rounding noise; both builds give 2.05/2.05 unrounded. Still the second most fragile decision (hazard 1). |
| **Floor consequence: flowchart b13 `Mólstyrkur`** | 7.5 pt, overflow, free margins 1.99 L / 1.45 R | 7.5 pt, v-overflow | **7.5 pt, v-overflow, 34.58 > 34.00**; production **1.71 / 1.71**; census **1.71 / 1.70** | Unchanged decision. The overhang is split exactly evenly on production geometry; 1.706/1.704 was rounding noise. |
| **Floor consequence: flowchart b14 `Mólstyrkur`** | 7.5 pt, overflow, 1.74 / 1.70 | 7.5 pt, v-overflow | **7.5 pt, v-overflow, 34.58 > 34.00**; production **1.46 / 1.96**; census **1.46 / 1.95** | Unchanged. 0.54 pt into the pad on the left. |
| **Floor consequence: combmap b8 `Prósentusamsetning`** | 7.5 pt, −5.50 / −5.50, ink 21, spill 114 | 7.5 pt, floor-overflow | **7.5 pt, floor-overflow, 68.37 > 54.50**; production **−4.94 / −4.94**; census **−5.01 / −4.87**; ink 40 px, spill 156 px (hinted) | Unchanged. SUPP linear raster: ink 33, spill 132. It overhangs both frame strokes until an editor splits it. |
| Other floor-adjacent blocks | combmap b10 8.0; moleratio2 b3 8.0; combmap b11/b13 +0.73/+0.75; b12 −0.26/−0.21; b14 −0.27/−0.21 | the same as fixed | **combmap b10 7.75 pt**, production 2.33 / 2.33, census 2.34 / 2.57. **moleratio2 b3 7.75 pt**, production 2.86 / 2.00, census 2.86 / 2.00. **combmap b11, b13** 0.72 / 0.72 (both geometries). **b12** census −0.18 / −0.43, production −0.18 / −0.43. **b14** census −0.18 / −0.44, production −0.18 / −0.43 | Unchanged decisions and values. The previous round's 2.333/2.327 for combmap b10 was rounding noise. |
| **R9 short-token binding** | n/a | literal R9: bound on 174/176 (not flowchart b10, b11); 23 blocks repartitioned against no binding | **Symbols-only R9 ([USER] 2026-09-14): bound on 176/176; binding changes the partition on 11 blocks, all boxes, at 9.0 pt, step fit; 0 line counts, sizes or steps changed** | **F1.** The 11 (unbound → bound): argon b0 `Mól af Ar \| atómum (mól)` → `Mól af \| Ar atómum (mól)`; argon b1 `Massi Ar \| atóma (g)` → `Massi \| Ar atóma (g)`; copperMoles b0 → `Mól af \| Cu atómum (mól)`; copperMoles b2 → `Massi \| Cu atóma (g)`; copperMoles b3 `Fjöldi Cu \| atóma` → `Fjöldi \| Cu atóma`; potassium b0 `Mól K \| atóma (mól)` → `Mól K atóma \| (mól)`; potassium b2 → `Massi \| K atóma (g)`; empform b0 → `Mól af \| A atómum`; empform b2 → `Massi \| A atóma`; empform b3 → `Mól af \| X atómum`; empform b5 → `Massi \| X atóma`. flowchart b10 and b11 (`Fjöldi \| agna \| af \| A/B`) are now bound: `af` may end a line, and their lines are unchanged. The smallest census margin among the 11 is 4.29 (argon b0, copperMoles b0); none is a contact, a hit or a spill. The table below names the 16 F1 blocks. |
| Height budget | n/a | 0 changed; `heightFit` False 0/92 | **0 changed; `heightFit` False 0/92; 0 height overflows** | Unchanged. F2 is not reached on the 34. |
| **SIBLING_TOL 0.2** | census aligns rxn2 b11 `Hvarfefni` and b12 `Stuðull` right | centre | **centre** (single-cue(L0C0R0)); the other 108 non-box blocks equal census | Unchanged. `Stuðull` a0 92.72 (V0 92.78, prototype 100.34). |
| ethene b0 column edge | a0 15.77, 6.76 pt left of 22.53 | a0 18.28, 4.25 pt left | **a0 18.28: 4.25 pt left** | Unchanged. |
| glycinemass b13 right-flush `Mólmassi` | 0.93 short of its source edge | ends at 230.28 | **ends at 230.28, the source edge** | Unchanged. |

### The 16 blocks F1 moved (previous build → fixed build)

All are at 9.0 pt, with the same line count, size and step before and after. Ink, spill and text-on-text are 0 → 0 on all 16. "Margin" is the smallest drawn side margin: census container for boxes, free box for open blocks. Production margins are box L = R.

| block | class | previous (literal R9) | fixed (symbols-only R9) | = no-R9 partition? | margin census (production) |
|---|---|---|---|---|---|
| argon b0 | box | `Mól af Ar atómum \| (mól)` | `Mól af \| Ar atómum (mól)` | no (binding) | 2.29 (2.40) → 4.29 (4.41) |
| copperMoles b0 | box | `Mól af Cu atómum \| (mól)` | `Mól af \| Cu atómum (mól)` | no (binding) | 2.28 (2.57) → 4.29 (4.57) |
| empform b0 | box | `Mól \| af A atómum` | `Mól af \| A atómum` | no (binding) | 2.48 (2.60) → 7.49 (7.60) |
| empform b3 | box | `Mól \| af X atómum` | `Mól af \| X atómum` | no (binding) | 2.48 (2.60) → 7.49 (7.60) |
| glycine b0 | box | `Mól af C2H5O2N \| (mól)` | `Mól af \| C2H5O2N (mól)` | yes | 6.21 (6.32) → 8.21 (8.32) |
| sacch b0 | box | `Mól \| af C7H5NO3S \| (mól)` | `Mól af \| C7H5NO3S \| (mól)` | yes | 4.21 (4.32) → 9.21 (9.32) |
| vitC b2 | box | `Mól af C-vítamíni \| (mól)` | `Mól af \| C-vítamíni (mól)` | yes | 4.94 (5.15) → 6.95 (7.16) |
| map2 b1 | box | `Mól \| af Mg(OH)2` | `Mól af \| Mg(OH)2` | yes | 15.31 (15.56) → 20.31 (20.56) |
| map3 b1 | box | `Mól \| af C8H18` | `Mól af \| C8H18` | yes | 20.91 (21.17) → 25.92 (26.17) |
| combmap b1 | box | `Mól \| af CO2` | `Mól af \| CO2` | yes | 15.57 (15.55) → 17.01 (17.00) |
| combmap b5 | box | `Mól \| af H2O` | `Mól af \| H2O` | yes | 15.57 (15.55) → 17.01 (17.00) |
| map7 b1 | box | `Mól \| af NaOH` | `Mól af \| NaOH` | yes | 20.75 (21.00) → 25.75 (26.01) |
| map8 b4 | box | `Mól \| af BaSO4` | `Mól af \| BaSO4` | yes | 9.43 (9.54) → 14.43 (14.54) |
| map8 b5 | box | `Mól \| af CaSO4` | `Mól af \| CaSO4` | yes | 9.43 (9.29) → 14.43 (14.29) |
| combustion b1 | open (i) | `CO2, H2O, O2 og aðrar \| lofttegundir` | `CO2, H2O, O2 og \| aðrar lofttegundir` | yes | 2.25 → 2.25 (free box, left-aligned) |
| combustion b2 | open (i) | `H2O-gleypir \| eins \| og Mg(ClO4)2` | `H2O-gleypir \| eins og \| Mg(ClO4)2` | yes | 24.25 → 24.25 (free box) |

- In 12 of the 16, the literal rule was holding `af`/`og` off a line end, and the fixed build draws the unconstrained partition.
- In 4 (argon b0, copperMoles b0, empform b0, b3), the fixed build draws a third partition that binds the symbol (`Ar`, `Cu`, `A`, `X`) to the word after it.
- The other 7 of the 11 symbols-only blocks (argon b1, copperMoles b2, b3, potassium b0, b2, empform b2, b5) were already bound the same way by the literal rule and did not move.

## Delta sources against the prototype, by rule

The attribution harness switches one input at a time between the prototype's value and the fixed build's value, as a forward cumulative chain and as leave-one-out.

- **19 blocks** change lines, size, step, alignment or overflow (previous round: 31).
- **155 blocks** change x0 or top by more than 0.01 pt, or change a decision (previous round: 157).
- **21 blocks** have an identical decision (previous round: 19). The 2 added are combustion b1 and b2, whose partitions now equal the prototype's.

| rule | blocks whose DECISION it moves | blocks whose position it moves | change vs previous round |
|---|---|---|---|
| R9 binding (symbols-only) | lines on 11: argon b0, b1; copperMoles b0, b2, b3; potassium b0, b2; empform b0, b2, b3, b5 | x0 on the same 11 | F1: lines 23 → 11, x0 21 → 11. The 12 blocks that left (glycine b0, sacch b0, vitC b2, map2 b1, map3 b1, combmap b1, b5, combustion b1, b2, map7 b1, map8 b4, b5) now equal the prototype's partition. |
| linear metrics (HINT_METRICS_OFF) | size: chloroform b2, sacch b1, moleratio2 b3, combmap b10; step: sacch b1; overflow: empform b8, jointly with geometry | x0 on 162 | unchanged |
| adv source cues (PDF advances) | step: map7 b5 (forward); leave-one-out flips copperMoles b1 instead | x0 on 76 (forward) / 77 (leave-one-out) | unchanged |
| production container geometry | step and overflow: empform b8 | top on all 66 boxes; x0 on 64 | unchanged |
| production alignment (SIBLING_TOL 0.2) | align: rxn2 b11, b12 | x0: rxn2 b12 | unchanged |
| height budget, body size, script rule | none | none | unchanged (F2, F6: 0 decisions) |

## Hazards for the comparison

Read these before calling a miss.

1. **Decisions within 0.3 pt of flipping** (`fragility.py`, the build's own inputs). The same definitions run on both builds and give the same 7 blocks and values. Margins are 2 dp; unrounded values are in `out/fragility.json`.

   | block | decision | distance to flipping | a flip would give |
   |---|---|---|---|
   | flowchart b5 | open iii-anchor at 8.75 | 9.0 misses the budget by **0.03** (0.0349) | shrunk 13; open i 66 / iii-anchor 1 |
   | empform b8 | box fit at 7.5 | fits by **0.11** | overflow 8; box fit 64 / floor-overflow 2 |
   | moleratio2 b3 | open iii-displaced at 7.75 | b_i misses by **0.14** | step iii-anchor only |
   | alsulfatemass b2 | cell fit at 8.5 | fits by **0.25** | 8.25 pt; sub-8.5 count 8 |
   | aspirin b2 | cell fit at 8.5 | fits by **0.25** | 8.25 pt; sub-8.5 count 9 with alsulfatemass |
   | glycine b1 | open iii-displaced at 8.75 | 9.0 misses by **0.25** | ii at 9.0; shrunk 13 |
   | potassium b1 | open iii-displaced at 8.75 | 9.0 misses by **0.25** | ii at 9.0; shrunk 12 with glycine |

   - **R9 is not fragile under the ruling.** The smallest bound-partition margin (budget − the bound partition's longest line, only where binding moves the cut) is argon b0 **4.81**, then copperMoles b0 5.14 and empform b0/b3 11.20. Under the literal rule they were 0.80, 1.13 and 1.19.
   - No box/cell block has an earlier line count within reach of the F5 order.
   - A container inset or metric difference of that size explains a miss on exactly these rows; any other miss does not.
2. **Three frozen-instrument readings are metric artefacts, predicted as measured:**
   - adjacency on 34 blocks (72 gaps);
   - the chloroform b2 cell fail;
   - combmap b8's 40 px hit and 156 px spill.

   They were measured with cairo's hinted 200-dpi advances on a layout the build makes in linear advances. They are predictions, not defects, and their linear readings are in the table.
3. **Inputs are part of the prediction.**
   - Sidecars must be at the pinned HEAD.
   - Figures must be composed from inputs byte-identical to `prep/figs`, because the instruments read artwork, runs and meta there. A re-prepared artwork.png with different bytes changes the pixel verdicts.
   - `svgfix` touches only `artwork.svg`, which no instrument reads.
4. **Step names:** the build writes `v-overflow` for r2's `iv-overflow`.
5. **The DIAG patch depends on local variable names.** `run_final.py` reads the translated path's locals by name: `BI`, `key`, `container`, `layout`, `cues`, `ls`, `sz0`, `rot` and `width`. tree-fix renamed the per-paragraph loop to a single `raw` value, which the patch does not read.
   - A renamed local passes the three anchor checks, then stops with a NameError mid-run. That is an instrument failure, not a prediction miss.
   - The implementation's report must carry `axis` on every overflow and `linePt` on width overflows. analyse.py does not read them; `compare_prev.py` and this table do.
6. **Spec text that these numbers supersede.** Design spec §3 and §4 need these updates:
   - **§4 "Line partition" R9 bullet:** binding is symbols-only per the [USER] ruling of 2026-09-14. A 1-2 character word that is lowercase alphabetic (`af`, `og`, `á`, `í`) may end a line.
   - **§4 "What the 7.5 pt floor costs":**
     - empform b8 fits, with production margins 2.05 and census 1.94 / 1.95. The spec says it overflows 52.92 > 51.99 with a 1.53 margin.
     - flowchart b13 is 1.71 / 1.71 (production) or 1.71 / 1.70 (census), and b14 is 1.46 / 1.96 or 1.46 / 1.95.
     - combmap b8 is −4.94 (production) or −5.01 / −4.87 (census), with a 156 px hinted spill. The spec says −5.5 pt and 114 px.
   - **§4 known consequences:** ethene's line sits 4.25 pt off its column edge, not about 6.8. The arrow labels are six at 9.0, two at 8.75 and one at 8.0, not five and four.
   - **§4 evidence line:** "hits 32 → 1 … spill 24 → 2" is unchanged in count.
   - **§3 "Fail loudly"** (spec reviewer, finding 2): the collapsed exocytosis artwork costs **4835 = 2^12.24**, not 2^12.4, which was measured on the rejected V1 variant. "brain and map2: 18" is a raw cost of 18 (2^4.2), not a log2.

7. **A tie the partition search breaks by order** (fix-round verifier): empform b9 `Breyta hlutfalli í lægstu heilu tölur` (open, step i, 9.0 pt) has TWO exact min-max partitions, longest line 56.527 pt in both. The build draws `Breyta hlutfalli | í lægstu | heilu tölur` because the earliest cut wins a tie; the other is `Breyta hlutfalli | í lægstu heilu | tölur`. `test_figlayout.py` pins the earliest-cut rule. An implementation with a different tie-break moves this block without being wrong about the spec.
8. **Added after these numbers were derived, re-checked 2026-09-14:** a box/cell width overflow whose glyph box also misses its height budget carries `heightNeedPt` / `heightBudgetPt` on the same entry, and the driver prints a height overhang as a glyph box. `reproduce.sh <tree-fix> REFCHECK` on the build with that change: `per_tag` equal to FINAL, and compose-report.json and items.json identical on 34/34 (heightFit False on 0 of 92 box/cell blocks, so no report gains the fields).

## Reproduce

Everything writes under `/home/siggi/dev/scratch-c140/plan/pred2`. Figures are composed and measured one at a time. The full run took 1 min 44 s; peak RSS was 0.28 GB (`/usr/bin/time -v`).

```bash
# every number above, controls first, then the build, then the previous-build comparison and supplementary
bash /home/siggi/dev/scratch-c140/plan/pred2/reproduce.sh

# individual steps (all with PYTHONDONTWRITEBYTECODE=1; TMPDIR under pred2)
cd /home/siggi/dev/scratch-c140/plan/pred2
export PYTHONDONTWRITEBYTECODE=1 TMPDIR=$PWD/tmp
R2=/home/siggi/dev/scratch-c140/r2; PREV=/home/siggi/dev/scratch-c140/plan/pred
env -u PRED_WORK_ROOT python3 -u instruments/measure.py V0 && cmp out/measure-V0.jsonl $R2/measure-V0.jsonl
env -u PRED_WORK_ROOT python3 -u instruments/measure.py V5_p2.0_f7.5 && cmp out/measure-V5_p2.0_f7.5.jsonl $R2/measure-V5_p2.0_f7.5.jsonl
env -u PRED_WORK_ROOT python3 -u instruments/sentinels.py V5_p2.0_f7.5 && cmp out/sentinels-V5_p2.0_f7.5.json $R2/sentinels-V5_p2.0_f7.5.json
env -u PRED_WORK_ROOT python3 -u instruments/sentinels.py V5_p2.0_f7.5 --control
python3 -u instruments/analyse.py control && cmp out/analysis-control.json $R2/analysis.json && cmp out/tables-control.md $R2/tables.md
python3 -u instruments/run_final.py /home/siggi/dev/scratch-c140/plan/tree-fix FINAL    # -> work/FINAL, inst-C
export PRED_WORK_ROOT=$PWD/work
python3 -u instruments/measure.py FINAL
python3 -u instruments/sentinels.py FINAL
python3 -u instruments/sentinels.py FINAL --control
python3 -u instruments/analyse.py final FINAL                   # -> out/analysis-final.json, out/tables-final.md
python3 -u instruments/compare_prev.py                          # previous build vs fixed, by block
python3 -u instruments/isolate.py                               # F1..F6 alone
python3 -u instruments/r9_variants.py                           # literal / symbols / off
python3 -u instruments/attribute.py
python3 -u instruments/fragility.py
python3 -u instruments/fragility.py $PREV/inst-C $PREV/work/FINAL fragility-prev.json
python3 -u instruments/supplementary.py
python3 -u instruments/supp_render.py FINAL hinted && cmp out/measure-FINAL.SUPP-hinted.jsonl out/measure-FINAL.jsonl
python3 -u instruments/supp_render.py FINAL linear
env -u PRED_WORK_ROOT python3 -u instruments/supp_render.py V5_p2.0_f7.5 linear
python3 -u instruments/pred_numbers.py > out/numbers.txt       # every frozen number, printed from the JSON
```

**To hold the repository implementation to these predictions:**
1. Copy its `experiments/figure-text-translation` into scratch. Never run inside the repo.
2. Run `bash reproduce.sh <that copy> REPO`. `run_final.py`'s three patch anchors must each occur once, or it refuses.
3. Compare `out/analysis-final-REPO.json` `per_tag.REPO` and `out/sentinels-REPO.json` with the `FINAL` entries.
4. Check `containerErrors` and each overflow's `axis`/`linePt` in its `work/REPO/*/compose-report.json` against the table.

## Files

Everything is under `/home/siggi/dev/scratch-c140/plan/pred2/`.

- **`instruments/`:**
  - the repointed copies, with `*.adapt.diff` (A1-A6, carried) and `*.adapt2.diff` (this round), and the read-only `frozen/` originals;
  - `run_final.py`, `attribute.py`, `supplementary.py`, `supp_render.py`, `fragility.py`, `pred_numbers.py`;
  - new: `compare_prev.py`, `isolate.py`, `r9_variants.py`.
- **`iso/F1..F7/`:** tree-int modules with one fix diff applied.
- **`out/`:**
  - `measure-{V0,V5_p2.0_f7.5,FINAL}.jsonl` and the `*.SUPP-{hinted,linear}.jsonl` files
  - `sentinels-{V5_p2.0_f7.5,FINAL}.json`
  - `analysis-{control,final}.json` and `tables-{control,final}.md`
  - `compare_prev.json`, `isolate.json`, `r9_variants.json`, `attribution.json`, `fragility.json`, `fragility-prev.json`, `supplementary.json`, `run-FINAL.json`, `numbers.txt`
- **`work/FINAL/<figure>/`:** items.json, diag.json, compose-report.json, translated.svg and the compose stdout/stderr.
- **`logs/`**, **`reproduce.sh`**, **`START.marker`**
