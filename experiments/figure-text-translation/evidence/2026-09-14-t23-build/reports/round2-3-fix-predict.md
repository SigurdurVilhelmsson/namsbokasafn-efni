I re-derived the predictions on the fixed build, `plan/tree-fix`, with the same frozen instruments. The new file is `/home/siggi/dev/scratch-c140/plan/pred2/PREDICTIONS.md`, dated 2026-09-14 and marked "written before the repository implementation exists". Every control passed, it cost 0 ISK, and the repo is untouched (`git status` clean, 0 new files under the experiment or figure-text directories).

**What moved.** The R9 symbols-only fix (F1) changed the line breaks of exactly 16 blocks: the 16 that differ between literal and symbols-only R9. It also flipped the `bound` flag on flowchart b10 and b11, whose lines stayed the same. None of the 16 changed line count, size or step. The other fixes (F2–F7) and the compose.py changes moved 0 decisions. I checked that by applying each fix alone to tree-int's module.

Rows that changed against the previous predictions:
- **Blocks with a box margin under 2.5 pt:** 11 → 7. The four that left are:
  - copperMoles b0 and argon b0: 2.28/2.29 → 4.29
  - empform b0 and b3: 2.48 → 7.49
- **R9 row:** it now binds on 176/176 blocks. Against no binding, it changes the break on 11 boxes, all named in the table: argon b0, b1; copperMoles b0, b2, b3; potassium b0, b2; empform b0, b2, b3, b5.
  - The smallest box margin among those 11 is 4.29 pt.
  - The closest R9 decision is now 4.81 pt from flipping (argon b0), against 0.80 under the literal rule.
- **Adjacency sentinel:** still 34 blocks, but 72 gaps instead of 81. The 9 gaps F1 removed are in named blocks; this reading is still an artefact of the instrument's hinted metrics.
- **Overflow:** the same 7 entries with the same values. Each now carries `axis: 'width'` and a `linePt` equal to `needPt`, because all 7 are single words. There are no height overflows.
- **`containerErrors`:** 0 on all 34 figures.
- **Compared with the prototype:** 19 blocks change a decision (was 31) and 21 are identical (was 19; combustion b1 and b2 were added).

Everything else is unchanged:
- 4 problem blocks and 4 unresolved [USER] flags.
- 1 artwork hit (combmap b8, 40 px) and 2 spills (181 and 156 px).
- 14 shrunk labels, 18 labels with fewer lines than the source, and all 9 arrow labels holding their line count.
- The same container classes, steps and sentinel results, and the same 7 fragile decisions.

**Floor consequences**, stated at 2 dp (±0.01), with production margins from the unrounded geometry:

| block | outcome | production margins | census margins |
|---|---|---|---|
| empform b8 | fits at 7.5 pt, 0.11 pt to spare | 2.05 / 2.05 | 1.94 / 1.95 |
| flowchart b13 | overflows, 34.58 > 34.00 | 1.71 / 1.71 | 1.71 / 1.70 |
| flowchart b14 | overflows, 34.58 > 34.00 | 1.46 / 1.96 | 1.46 / 1.95 |
| combmap b8 | overflows, 68.37 > 54.50 | −4.94 / −4.94 | −5.01 / −4.87 |

These production values agree with the reviewer's independent measurement to 3 dp.

**Changes to the instruments.** Paths now point at `pred2`, and each change has its own `*.adapt2.diff` file.
- `run_final.py` checks against tree-fix and against the fix round's own run in `c-fix/rd/C`. Its DIAG patch needed no change, because `axis` and `linePt` are carried inside the overflow entry.
- `fragility.py` now follows each build's own search order, so the same definitions run on both builds.
- `supplementary.py` takes margins from the unrounded geometry.
- Three new scripts: `compare_prev.py`, `isolate.py`, and a copy of the controller's `r9_variants.py`. The copy spells the literal rule out, because the original harness silently became symbols-only on the fixed module.

The hazards section also lists the spec text these numbers replace:
- the §4 R9 bullet, which becomes symbols-only;
- the floor-cost figures;
- the exocytosis cost: 4835, which is 2^12.24 rather than 2^12.4, and brain/map2's raw cost of 18 (2^4.2).

**Commands.** `bash /home/siggi/dev/scratch-c140/plan/pred2/reproduce.sh` reproduces everything in about 1 min 44 s; the individual steps are listed in the file. A second full run gave byte-identical outputs, apart from timing fields.

One disclosure: a few JSON-inspection one-liners ran without `PYTHONDONTWRITEBYTECODE=1`. They imported only the standard library.

Files are in `/home/siggi/dev/scratch-c140/plan/pred2`:
- PREDICTIONS.md
- reproduce.sh
- instruments/compare_prev.py
- instruments/isolate.py
- instruments/r9_variants.py