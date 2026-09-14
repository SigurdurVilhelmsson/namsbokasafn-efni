# Adversarial verification of the §C140 t23 fix round

**Verdict:** I found no blocker. Every changed prediction row reproduces under my own code, and so does the [USER] R9 ruling.
- **Should-fix:** one. A box or cell label that misses width *and* height names only the width axis (0 of 176 blocks exposed).
- **Notes:** eight.

**Cost:** 0 ISK. No MT, and `figure-run.js` was never run.

**Workspace:** everything is under `/home/siggi/dev/scratch-c140/plan/verify2/`.
- `int/` and `fix/` are copies of the two trees.
- `wtjs/` and `wtjs2/` are `git clone --shared` copies at 135c08ae with the commit-5 diff applied.
- I never edited tree-fix, pred2 or wt. 0 files under them are newer than my marker.

## (5) Stage diffs apply cleanly
`diffs-final/compose.{1-base-to-A,2-A-to-B,3-B-to-C}.diff` apply in order onto a copy of the repo `compose.py` (c4fc0ff1).
- I checked with both `patch -F0` and `git apply`.
- The results are byte-identical to `stages/{A,B,C}/compose.py`, and stage C equals `tree-fix/compose.py` (a80322d2).

Reproduce:
```
cd verify2/p5g && git apply ../../tree-fix/diffs-final/compose.{1-base-to-A,2-A-to-B,3-B-to-C}.diff && cmp compose.py ../../tree-fix/compose.py
```

## (1) Prediction rows
**Provenance.** I recomposed the 34 figures with **unpatched** copies of each build (`recompose.py`). The `<text>` elements, the report and stdout are equal to `pred2/work/FINAL` for tree-fix (34/34) and to `pred/work/FINAL` for tree-int (34/34). So the raw files the predictions were read from are the builds' real output.

**Raw diff** (`diffprev.py`):
- Layout items moved on exactly the 16 named blocks.
- Diag rows moved on 18: the 16, plus `bound` on flowchart b10 and b11.
- Reports are equal 34/34 once `containerErrors`, `axis` and `linePt` are removed. `containerErrors` is `[]` on 34/34.
- Unchanged rows are unchanged: `analysis-final` per_tag, flag_table and ranks are identical.

**Changed rows, recomputed with my own baseline grouping and fontTools hmtx widths** (`margins_adj.py`):

| Row | Result |
|---|---|
| BOUNDED margin < 2.5 | 11 → 7. argon b0 and copperMoles b0 2.29 / 2.28 → 4.29; empform b0 / b3 2.48 → 7.49 |
| Adjacency | 81 → 72 gaps in 34 blocks. One gap lost in each of the 9 named blocks; combustion b1's gap survives |
| Production margins | 2.05/2.05, 1.71/1.71, 1.46/1.96, −4.94/−4.94, 2.33/2.33 (unrounded 2.054, 1.708, 1.458/1.958, −4.936, 2.329) |
| R9 bound-partition margins | 0.80 / 1.13 / 1.19 → 4.81 / 5.14 / 11.20 |
| Overflow | 7 entries, all width axis, `linePt == needPt` |
| Decision movers vs prototype | 31 → 19; the 12 that left include combustion b1 and b2 |

On the decision movers: my first pass read 38 → 26, because the prototype diag has no overflow field. Deriving overflow from the prototype's step gives 31 → 19.

**Not re-derived:**
- the 155 x0/top count and the leave-one-out attributions;
- pixel rows, which I took from pred2's measure re-run;
- spec-text row 9, carried from the previous verifier.

## (2) The R9 ruling is implemented exactly
`r9check.py` uses my own widths plus a brute-force min-max partition search, which agrees with the build's partition search on every block and mode.

**Controls:**
- tree-fix reproduces pred2's diag 176/176, and tree-int reproduces pred's 176/176.
- tree-fix with the literal R9 predicate reproduces the previous lines, size and step 176/176. So F2–F5 moved nothing on the 34; F1 is the only mover.

**Symbols-only vs no R9, 11 blocks:** argon b0, b1; copperMoles b0, b2, b3; potassium b0, b2; empform b0, b2, b3, b5. All are boxes at 9.0 pt, step fit.

**Literal vs symbols-only, 16 blocks:** argon b0, copperMoles b0, glycine b0, sacch b0, vitC b2, empform b0, b3, map2 b1, map3 b1, combmap b1, b5, combustion b1, b2, map7 b1, map8 b4, b5.

**Literal vs no R9:** 23 blocks.

## (3) F2–F6 and the compose changes
**Numbering.** I found no written definition of C1–C3. `compare_int.py` calls the list join "C2", and the mutants are named MC1–MC6. So I covered the three compose changes by name: the list-join transfer, `containerErrors`, and the overflow entry copied field by field.

**Module fixes** (`probes_f.py int|fix`): 10 constructed probes are RED on int and GREEN on fix, and the 5 controls pass on both.
- **F2:** box and cell height misses are named with axis `height` at 7.5 pt.
- **F3:** an 8.9 pt size ladder reaches the floor.
- **F4:** `linePt` 56.25 > `needPt` 33.75.
- **F5:** 1 line at 8.25 pt instead of 2 lines at 9.0.
- **F6:** Patm body size 9.0 (int gives 6.75).
- **F7:** docstrings only; the module is AST-equal to tree-int.

**Compose changes on real figures** (`probes_c.py`), RED on int and GREEN on fix:
- **`containerErrors`:** with detection planted to fail, it names all 3 glycine blocks, and the stdout NOTE follows a blank line.
- **List join:** a legacy list value gives no false `absent` at stages A, B and C, and draws the same `<text>` as the str value.
- **Height overflow:** a real argon box made to miss height is named with axis `height` and a "glyph box" NOTE.

**Worktree `figure-compose.py`,** on a repo-shaped copy of tree-fix:
- `containerErrors` and height/width overflows reach `compose.json` verbatim. HEAD's wrapper drops them.
- A missing `artwork.pdf` is refused before the child runs; a corrupt one is refused with "wrote no compose-report.json".

**Silent overflow.** Open line-count and word overhangs are named. The corner below is not.

## (4) Commit-5 JS
- **RED:** with only the test diffs applied, 13 of 14 new JS tests fail. The 14th, "says nothing when every count is zero", is a control that passes on old code by design. Python 2h, 4g–4i, 11a, 11b and 11d also fail.
- **GREEN:** with the sources applied, all 117 tests in the two files pass, and the Python file is ALL PASS.
- **NOTEs are non-fatal:** `verdict()` stays `ok` with all four NOTE reasons and turns not-ok when a fatal reason is added.
- **Full vitest** (`js-full-{before,after}.json`): before, 6480 tests with 36 failing, identical by name to the controller's run. After, the same 36 fail by name, plus 14 new tests, all passing.

## Findings
1. **should-fix: a height miss can still go unnamed.**
   - A box or cell label that misses **both** width and height names only the width axis.
   - `heightFit` is never reported, so the height miss appears in no output (docstring-admitted).
   - Exposure is 0 of 176. Reproduce with the `F2 RESIDUAL` row of `probes_f.py`.
2. **note: subscripts are not in the height budget.** The glyph-box height uses base size only. A subscript can fall 0.58 pt past the container edge with `heightFit` True and no overflow, in both builds. On the 34 the minimum margin is 3.97 pt (`vert_extent.out`).
3. **note: the driver misdescribes a height overflow.** `summarise` prints "a line needs 40.04 pt … (height)" under "wrap or shorten them". No JS test covers axis `height` (`height-note.txt`).
4. **note: 21 new unit pins were never RED on tree-int.** The builder's mutants kill every one except the bare CONTROLs, which is by design; I re-ran all 12 with golden restores. Label them PIN or CONTROL in the plan.
5. **note: the ruling's predicate misses its intent at the edges.** It exempts unit symbols `g`/`l` and binds `Í` and `(g`. Exposure is 0 line breaks.
6. **note: empform b9 depends on the tie-break.** It has two exact min-max partitions, so a different tie-break moves it legitimately. Add it to the hazards.
7. **note: F5 has no recorded ruling.** It moves 0 decisions.
8. **note: `artwork.pdf` is now required everywhere.** A figure with no translated label also refuses when `artwork.pdf` is missing. The comment says this is deliberate; exposure is about zero.
9. **note: vitest writes into the main repo through symlinked `node_modules`.**
   - It writes the repo's gitignored `node_modules/.vite` (the controller's run, 11:13) and `.vite-temp` (mine, 12:54, before I replaced the symlink; now empty).
   - No tracked file changed.

## Disclosures
- A few stdlib-only inspection one-liners ran without `PYTHONDONTWRITEBYTECODE`. No new `__pycache__` appeared in repo pylibs (checked with `find -newermt`).
- The `.git/worktrees/wt` directory mtime moved from a transient `git status` lock.