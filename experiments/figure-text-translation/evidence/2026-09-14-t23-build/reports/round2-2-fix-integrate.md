# §C140 compose-side finish: C1–C7 (scratch, 0 ISK)

The final compose.py and tests are in `/home/siggi/dev/scratch-c140/plan/tree-fix`, and every change is in the per-stage diffs below.
- Every changed assertion failed first on the tree it corrects.
- 12 of 12 mutants were killed.
- On the 34 real figures, stages A and B match tree-int byte for byte, and stage C moves exactly the 16 blocks the R9 ruling changes.

Runnable stage trees: `plan/fixsnap/{base,A,B,C}`, each holding the tree-fix modules plus that stage's compose.py. Instruments and run records are in `plan/c-fix/`.

## What changed in compose.py
- **C1, containerErrors (stage C).** When `container_for` returns `why` starting with `error:`, the composer appends `{key, block, why}` to the report list `containerErrors` (draw order, with multiplicity) and prints a `\nNOTE (not a failure)` section after the overflow NOTE. `load_page` is still unguarded; its comment now says why without referring to commit 5.
- **C2, a legacy list value gets one transfer.**
  - At **stage A**: one transfer on the joined value; the styles are sliced back per paragraph, so today's wrap is unchanged.
  - At **stage C**: one transfer and one word list, which flattens the value.
  - This is inert on every committed sidecar value: stages A and B are byte-identical to tree-int on items, report, SVG and stdout for 34/34 figures.
- **C3, overflow entries.** Fields are copied one by one: `key, block, word, needPt, budgetPt, sizePt, axis`, plus `linePt` when figlayout set it. The NOTE wording now depends on the axis. No stdout consumer reads the old wording (grepped `wt/tools` and the experiment files; the driver reads compose.json).

## Tests
- **C4a, arrow label.** The value is now `Mólmassi efnisins í grömmum`. The unchanged composer wraps it into 3 lines, and the top glyphs reach y 62.069, into the arrow stroke (61.25). So L4 is now RED on base, A and B. ③ keeps 2 lines with the top at 56.57.
- **C4b.** L0 is labelled a regression pin. The docstring lists the pins (L0, X4), the controls (G*, D3, T2, L4c, X0) and the sentinels (T1, T3).
- **C4c, containerErrors arm (X0–X5).**
  - No data plant can make detection raise without breaking compose.py first. So the arm runs the unchanged compose.py under a `python -c` runpy wrapper that makes `figcontainers.classify` raise for the one block whose page bbox is the cell label's.
  - The wrapper still runs on a tree without figcontainers.
  - X0 is the control that the failure reached the composer: `[open i]` instead of `[cell fit]`.
- **C4d, legacy list arm (LG1, LG2).**
  - LG1 is RED on the per-paragraph composers (tree-int's A, B and C).
  - LG2 is a guard: RED on base, killed by mutant MA1.
- **C4e, R9 ruling arm (figure 3).**
  - R9a: `Mól af CO2` draws `['Mól af','CO2']`. RED on tree-int, whose literal R9 draws `['Mól','af CO2']`.
  - R9b: `Massi A atóma` draws `['Massi','A atóma']`. RED on base/A/B and green on tree-int, so it is a guard; mutants ML1 and ML3 kill it.
- **L6** is re-scoped to include `axis` and `linePt`.
- **C5.** The runexact C1 re-scope is applied. It passes on base, A, B, C and tree-fix. The original C1 fails on C, and the re-scoped C1 fails when the translated arc is sent through the layout path (mutant MRX).

## RED/GREEN matrix (`c-fix/runs/matrix-final.txt`)
| id | base | A-int | A | B-int | B | C-int (tree-int) | C | tree-fix |
|---|---|---|---|---|---|---|---|---|
| S1 ×2, S2, S3 | RED | green | green | green | green | green | green | green |
| D1, D2 | RED | RED | RED | green | green | green | green | green |
| L1–L5, L7, L8 | RED | RED | RED | RED | RED | green | green | green |
| L6 | RED | RED | RED | RED | RED | RED | green | green |
| X1, X5, X2, X3 | RED | RED | RED | RED | RED | RED | green | green |
| X0 (control) | RED | RED | RED | RED | RED | green | green | green |
| LG1 | RED | RED | green | RED | green | RED | green | green |
| LG2 (guard) | RED | green | green | green | green | green | green | green |
| R9a | RED | RED | RED | RED | RED | RED | green | green |
| R9b (guard) | RED | RED | RED | RED | RED | green | green | green |
| G1–G3, D3, L0, T1, T2, L4c, X4, T3 | green | green | green | green | green | green | green | green |

Totals:
- base: 23 FAILED.
- A-int / A: 18 / 17.
- B-int / B: 16 / 15.
- C-int: 7.
- C and tree-fix: ALL PASS.

## Mutants (`c-fix/mut/kills-vs-baseline.out`)
Each mutant is counted against its own stage's baseline reds, so it adds exactly these labels:

| mutant | adds |
|---|---|
| MC1 | X2, X3 |
| MC2 | X1, X2, X3 |
| MC3 | X3 |
| MC4 | LG1 |
| MC5 | L6 |
| MC6 | L6 |
| MA1 | LG2 (stage A baseline is 16 reds) |
| MA2 | LG1 |
| ML1 | R9b |
| ML2 | R9a |
| ML3 | R9b |
| MRX | C0, C1 (runexact) |

The golden sha256 was intact after every round and at the end.

## C6: real data (`c-fix/rd`)
- **A and B vs tree-int's stage runs:** items.json, compose-report.json, translated.svg and stdout are byte-equal on 34/34.
  - Controls: new B vs old A matches on 29/34 figures (the 5 decimal figures differ); new C vs old B reports match on 0/34.
- **C:**
  - The report differs only by `containerErrors: []` (34/34) and by the 7 overflow entries gaining `axis: width` and `linePt == needPt`.
  - Layout items moved on exactly the 16 R9 blocks and nowhere else. Each is literal → ruling:
    - argon b0 `Mól af Ar atómum | (mól)` → `Mól af | Ar atómum (mól)`
    - copperMoles b0, glycine b0, vitC b2: the same shape
    - sacch b0 → `Mól af | C7H5NO3S | (mól)`
    - empform b0 and b3, map2 b1, map3 b1, combmap b1 and b5, map7 b1, map8 b4 and b5: `Mól | af X` → `Mól af | X`
    - combustion b1 → `CO2, H2O, O2 og | aðrar lofttegundir`
    - combustion b2 → `H2O-gleypir | eins og | Mg(ClO4)2`
  - flowchart b10 and b11 flip `bound` to True; their lines are unchanged.
  - Exit 0 on 34/34, sentinel 176/176, classes 66/26/84 with 0 disagreements, steps unchanged.
- **Whole Python suite, repo-shaped nest vs nest-base** (both with tools → wt/tools; `c-fix/suite/byname.out`). By name, the only moves are:
  - runexact `C1` split into `C1` + `C1b`;
  - test_figure_prepare 6/6a/6b/6c added.
  - The new files all pass. test_make_fixture `1 tracked by git` is red in both nests (no git there).
- **Cross-check:** the commit-5 `test_figure_compose.py` and `figure-compose.py` against the C-fix composer: ALL PASS, including 2h and 11a.

## C7: diffs (`tree-fix/diffs-final/`)
- `compose.1-base-to-A.diff`, `compose.2-A-to-B.diff` and `compose.3-B-to-C.diff`, plus `compose.base-to-C.diff` and the two test diffs.
- Full stage copies: `tree-fix/stages/{A,B,C}/compose.py`.
- Applying 1+2+3 to `snap/base/compose.py` gives tree-fix/compose.py byte for byte.
- A contains only ②, B only ⑨, and C holds ③ + containerErrors + C2's flatten. The one exception is C's module docstring, which also summarises ②/⑨, as tree-int's did.

## Decisions for you
- **Should a container detection error stay a `NOTE (not a failure)`?** The alternative is a `!!` warning or a failure. A figcontainers regression would re-lay every box and cell as open, and this NOTE is the only record.
- **compose.py needs `artwork.pdf` from commit (4), but figure-compose.py's pre-flight for it only arrives in commit (5).** Between the two, a missing `artwork.pdf` crashes compose with exit 1. Move that pre-flight into commit (4), or accept the gap?
- **The spec does not name `containerErrors` or `axis`/`linePt`.** §5 lists only `unformatted`/`overflow`/`localized`, and §4's overflow shape predates `axis`/`linePt`; the plan should name both.
- **The 16 R9 blocks need to be on the picture review.**

Hygiene: the main repo's `git status --porcelain` is empty and no repo file is newer than the start marker. wt is unchanged, tree-int checks sha256 8/8, and snap is untouched.