# §C140 ② ⑨ ③ integrated into compose.py, in scratch

0 ISK. No MT was called and `figure-run.js` was never run. The repo was read-only throughout. At the end: `git status --porcelain` printed 0 lines, and `find -L experiments/figure-text-translation` (pylibs included) and `books/efnafraedi-2e/figure-text` found 0 files newer than the start marker. As a control, the same `find` over tree-int's root finds 2 files (compose.py, test_compose_t23.py). No `__pycache__` exists under tree-int or snap.

## Layout
- **Tree:** `/home/siggi/dev/scratch-c140/plan/tree-int`. It is `cp -a` of base-tree plus the five modules, their unit tests, the numloc figtext widening and the strip-text/figure-prepare edits. All six module suites printed ALL PASS before compose.py was touched:
  - svgfix 28
  - numloc 31
  - figscripts 84
  - figcontainers 68
  - figlayout 72
  - figure_prepare 67 (the svgfix builder's section 6 included)
- **Unchanged composer:** `work/compose.base.py`, read-only. Runnable snapshots are `plan/snap/{base,A,B,C}`.
- **Diffs:**
  - `diffs/compose.A.diff`: base→A, 243 lines
  - `diffs/compose.B.diff`: A→B, 84 lines
  - `diffs/compose.C.diff`: B→C, 284 lines
  - `diffs/compose.base-to-C.diff`: 388 lines
- **E2E:** `test_compose_t23.py` (599 lines) and `fixtures/compose-t23-golden.json`, captured from snap/base. A recapture was byte-identical. Capture is refused on A and on C.

## What each stage changes in compose.py
- **A (commit 2, ②):**
  - Adds `import figscripts`.
  - The loop becomes `for BI, b in enumerate(blocks)`.
  - `source_tokens` runs before the arc branch; `transfer` + `words` run per paragraph.
  - `wrap()` operates on (char, style) lists, with widths from `seg_width`, a hinted segment sum.
  - `sz0 = body_size` on the straight path.
  - Each segment is one ITEMS entry at sz·ratio, with baseline + sz·frac.
  - ITEMS gain `path`; layout items gain `line` and `seg`.
  - The report gains `unformatted`; stdout gets a NOTE starting with `\n`.
- **B (commit 3, ⑨):** `localise_block` applies `numloc.localize_runs` per `FT.lines` line to the raw runs before `draw_run_exact`, skipped under `--control`. The report gains `localized`, with a NOTE.
- **C (commit 4, ③):**
  - `BOXW`, `maxw`, `wrap()`, the hinted `seg_advance` and `FT.alignment` are gone from the path.
  - `lin_advance` measures on a separate 8×8 context with `HINT_METRICS_OFF`, memoised.
  - The page and dark image load lazily, once per figure.
  - Each translated straight block calls `container_for`, builds adv-based cues, calls `figlayout.decide`, and draws x0[j], top − j·lead.
  - The report gains `overflow`, with a NOTE; the per-block line gains `[cls step]`.

## E2E: every assertion × stage
Source: `work/t23/matrix.txt`; one final test file run against base, A, B and C.

| assertion | base | A | B | C |
|---|---|---|---|---|
| S1 3 / S1 4 (8.000 pt, 3.000 below) | FAIL | PASS | PASS | PASS |
| S2 `unformatted` present, nothing for placed formula | FAIL | PASS | PASS | PASS |
| S3 named miss: both stretches `absent` | FAIL | PASS | PASS | PASS |
| D1 `26,98` at golden x,y | FAIL | FAIL | PASS | PASS |
| D2 `localized == ['26.98']` | FAIL | FAIL | PASS | PASS |
| L1 box, every line centred ±0.5 | FAIL | FAIL | FAIL | PASS |
| L2 cell stays right-flush ±0.5 | FAIL | FAIL | FAIL | PASS |
| L3 arrow label keeps 2 lines | FAIL | FAIL | FAIL | PASS |
| L5 floor word drawn at 7.5 | FAIL | FAIL | FAIL | PASS |
| L6 named in `overflow` | FAIL | FAIL | FAIL | PASS |
| L7 edited identity label laid out in its box | FAIL | FAIL | FAIL | PASS |
| L8 report line names class + step | FAIL | FAIL | FAIL | PASS |
| G1 / G3 / D3 / T2 / L4c (controls) | PASS | PASS | PASS | PASS |
| T1 text sentinel, 8 labels | PASS | PASS | PASS | PASS |
| L0 edited identity exits 0 | PASS | PASS | PASS | PASS |
| L4 clears the arrow | PASS | PASS | PASS | PASS |
| G2 byte-identity arm / ③ arm | PASS | PASS | PASS | (③ arm) PASS |

Totals: base 34 PASS / 13 FAIL; A 38/9; B 40/7; C 47/0 (25 of the PASS lines are preconditions).

Three rows could never be RED:
- **L0** is green on base: the crash was the prototype census's, never compose.py's. L7 carries the RED for that case.
- **L4** is green on base by geometry. L4c proves its test fires on a label drawn one line higher.
- **T1** is an invariant. T2 is its control and fails 3 of 3 corrupted copies.

## Real data (the 34, one figure at a time, instrumented copies)
The drivers are `work/realdata.py`, `work/stepdiff.py` and `work/p10`.

**A**
- exit 0 on 34/34; report multisets equal 34/34.
- Kept items identical 34/34 (277 items).
- The 21 figures with no styled translated block have text layers byte-equal to prep, 21/21.
- 142/142 unstyled layout blocks are item-identical.
- 52 styled items in 13 figures and 34 blocks, matching the evidence per figure. Ratio 0.7778 throughout; frac ±0.3333 and −0.222x.
- Text sentinel 176/176; its control fires.
- `unformatted` is empty on all 34.

**B**
- Kept items identical except exactly 35 runs, changed '.'→',' only:
  - alsulfatemass 7
  - aspirin 7
  - chloroform 7
  - glycinemass 9
  - saltMass 5
- Everything else is unchanged; `localized` names exactly those keys.

**C**
- exit 0 on 34/34; multisets equal; kept items identical to B 34/34.
- Classes: box 66 / cell 26 / open 84; 0 disagreements with the census, block by block.
- Steps:
  - box: fit 65, floor-overflow 1
  - cell: fit 26
  - open: i 65, ii 7, iii-anchor 2, iii-displaced 4, v-overflow 6
- Overflow, 7 entries:
  - flowchart #13 and #14: Mólstyrkur 34.58 > 34.0 at 7.5
  - combmap #8: Prósentusamsetning 68.37 > 54.5 at 7.5
  - combmap #11 and #13: Mólmassi 29.56 > 27.0 at 7.0
  - combmap #12 and #14: Efnajöfnustuðull 49.81 > 45.203 at 7.0
- Compose time: max exocytosis 1.36 s, then sandwich 1.24 s.
- Against the r2 prototype: 147 of 176 blocks are identical. The 29 movers are the 28 blocks figlayout's informational run predicted, matching it exactly, plus empform#8.
- R9 is bound on 174 of 176 blocks; flowchart #10 and #11 are the two it cannot bind.

**Extra check, an edited identity label on real data:** HClsoln's three identity blocks edited into translations exit 0, with 11 styled stretches (italic aq/l/g, subscripts 2/3, superscripts +/–).

## Named findings for the plan
1. **Seven overflows, not eight.** empform b8 fits at 7.5 pt: the production box inner is 0.223 pt wider than the census (budget 52.213 vs 51.99; the word needs 52.10). Spec §4 tells [USER] this label overhangs.
2. **A translated compose with a missing or unreadable `artwork.pdf` exits 1 with no report.** `--control` is unaffected. Proposal: add an `artwork.pdf` precondition to figure-compose.py, in commit 5.
3. **Legacy list values are flattened at C.** 0 committed sidecars are affected.
4. **`test_compose_runexact` C1 moves at C.** A re-scope is written and passes on base, A, B and C.
5. **`test_figure_compose` did not move.** Its case 10 cannot run in scratch.
