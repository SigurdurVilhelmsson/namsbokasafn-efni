# §C140 ③ / ② module fixes F1–F7 (scratch, 0 ISK)

The work tree is `/home/siggi/dev/scratch-c140/plan/tree-fix`, copied from `tree-int`; `tree-int` is untouched (sha256 matches, 0 newer files). Diffs are in `tree-fix/diffs-fix/`. Instruments and run records are in `tree-fix/work-fix/`. compose.py is unchanged.

## Summary of impact on the 176 layout blocks
| fix | module | decisions changed (isolated) | other effect |
|---|---|---|---|
| F1 R9 symbols-only | figlayout | **11 vs no-R9** (exactly the controller's list); **16 vs tree-int literal** | bound False→True on flowchart b10/b11 |
| F2 height overhang named | figlayout | 0 | 7 overflows gain `axis:'width'`; heightFit False stays 0/92 |
| F3 floor appended | figlayout | 0 | flowchart b4 (sz0 9.0001, open i) gets an 8-step ladder; its layout is identical |
| F4 linePt | figlayout | 0 | 7 overflows gain `linePt`; 0 of 7 have linePt > needPt (all are one word on one line) |
| F5 count before size | figlayout | 0 | proof: all 92 box/cell blocks already draw min(n_src, W) lines |
| F6 body size at line base | figscripts | 0 (sz0 176/176 unchanged) | corpus: send:true **13** (the builder's 13), send:false 4, rotated 0 |
| F7 error container docs | figcontainers | 0 (docstrings only) | — |

**All fixes together:** the decisions and geometry equal F1's exactly. The only other difference is that the 7 overflow dicts gain `axis` and `linePt`.

Controls:
- The harness reproduces FINAL diag.json on 176/176.
- R9 off versus literal gives 23 decisions (positive control).
- F1's line texts equal the controller's `r9_variants.py` output on 23/23 blocks in all three modes.

## F1 — R9 binds symbols only
- `cut_allowed`: a cut is allowed if `len(w) > 2 or (w.isalpha() and w.islower())`.
- Blocks that change against tree-int: argon b0, copperMoles b0, glycine b0, sacch b0, vitC b2, empform b0/b3, map2 b1, map3 b1, combmap b1/b5, combustion b1/b2, map7 b1, map8 b4/b5.
- Tests:
  - RED on tree-int: lowercase `af`/`og`/`á`/`í` may end a line; the real argon b0 shape becomes `Mól af | Ar atómum (mól)`.
  - Guards (tree-int already passes): `2`, `m2`, `Cu`, `Ar`, `A`, `K` bind. Mutants M1a–d kill all of them.

## F2 — a box/cell height failure is named
- If no (count, size) meets width and height, the count chosen by width alone is kept and drawn at the floor.
- It is named `{word: None, needPt: glyph-box height, budgetPt: hb, sizePt, axis: 'height'}`, with step `floor-overflow`.
- The "shrink until height fits" loop is kept as the ruling words it, but it provably never stops above the floor (proof is in a code comment).
- Every width overflow carries `axis: 'width'`.
- Tests RED on tree-int: 10, including 3 changed ones.
  - Reviewer case A (box) and B (cell): 2 lines at 7.5, named 18.048 > 8.

## F3 — `size_steps` always ends at the floor
- An 8.9 pt source's ladder now ends 7.65, 7.5.
- Reviewer case D2 (a label that fits only at the floor) draws at 7.5, step fit.
- 9.0001 now gives 8 steps; this changed an existing assertion.

## F4 — `linePt`
- Added to every width-axis overflow. `needPt` still names the word.
- Reviewer case E: needPt 33.75, linePt 67.5.
- In box floor-overflow, linePt ≤ needPt holds by construction.

## F5 — box/cell line count before size
- The count loop is outside the size loop. n ≤ n_src is tried first, closest first; n > n_src only after that.
- Tests RED on tree-int:
  - Reviewer case H2: 1 line at 8.5.
  - Height case: 2 lines at 8.0 instead of 1 line at 9.0.
- Guard (reviewer case H): 2 lines at 9.0 when nothing else fits at the floor. Killed by mutant M5.
- Why nothing changes on the 176: the 18 blocks with fewer lines than the source all have fewer words than source lines.
- The equivalence harness with the final module (R9 and height off) passes 176/176 in all 7 configs.

## F6 — `body_size`
- Each run's letters are counted at its line's `line_styles` base.
- B5 (real Manometer Patm → 9.0) is RED on tree-int.
- Guards: B6 (qout → 7.0) is killed by mutant M6; B3b (tie between two lines' bases) is killed by M6b.
- Corpus census:
  - send:true: exactly Manometer ×4, Relation E°cell, Dorbital ×3, MolSpeed1 ×2, CFSE ×3.
  - send:false: Ex9soln, Dorbital, pMOsigma ×2.
  - The result equals the builder's ALT vote on every block, so counting inverted lines changed nothing.

## F7 — the error container's docstrings
- Corrected: `why` = `'error: <Type>'` is the only record of a detection error; a label that fits leaves no trace; the caller must report it.
- Tests:
  - 2 docstring checks, RED on tree-int.
  - Characterization checks, killed by mutants M7a–d: a fitting label gives `overflow None`, the container never gains a line, and the exact `why` holds on the reviewer's hostile inputs.

## End-to-end tests
- **test_compose_t23 L6** now fails. It asserts the exact overflow key set, and F2/F4 add `axis` and `linePt`. A re-scope proposal is supplied: RED on tree-int, GREEN on tree-fix. Every other t23 check is identical to tree-int.
- **test_compose_runexact** is identical to tree-int (C1 has been red since stage C).
- **test_figure_compose** has the same outcomes by name (86/8, the 8 being environmental). Its 5a byte count varies between runs of the same tree; the drawn text is identical.

## Stale because of F1
The predictions that depend on the 16 re-partitioned blocks need re-deriving: the margin-below-2.5 list and the R9 row.