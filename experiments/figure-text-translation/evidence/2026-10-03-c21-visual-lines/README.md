# §C140 ㉑ — the visual line count: the 0-ISK before/after measurement

> **FROZEN EVIDENCE.** Written by the PR that built ㉑ (branch `feat/c140-c49-step2-code-fixes`). Status lives in the
> campaign register (§C140 ㉑ and ㊾), never here. Design: `docs/superpowers/specs/2026-10-02-c140-step2-recompose-pass-design.md`, D3.

`c21_measure.py` composes the same prepared inputs with two composers — the tree at the commit before ㉑'s first
commit (`base.sha`) and the tree at ㉑'s last commit (`after.sha`) — using each figure's **committed** sidecar as
`--translations`, the input `tools/figure-run.js` hands `figure-compose.py` on a recompose. It records every
`figlayout.decide` call and compares the records, every run-exact `<text>` element and the SVG bytes.

- **0 ISK.** It never imports or spawns `tools/figure-run.js`, `translate-blocks.mjs` or
  `tools/publish-figure-svg.js`, and writes only under `--data`, which is off-repo:
  `~/.cache/namsbokasafn-audit/2026-10-03-c21/`.
- **Population (27).** The 13 rule-A figures that have a sidecar; the 11 sidecar figures whose rule-A merges are all
  in KEPT blocks — the population the rejected `line_frames` design would move, so the discriminating control — for SIBLING-CUE leaks only (measured: with `line_frames` mutated onto `visual_lines`, or with only `sibling_cues` mutated, exactly one decide record of the 27 figures moves, `CNX_Chem_17_02_Galvanicel` `Flow of cations`, align right → center; with only `free_box`'s obstacles mutated, 0 of 163 records and 0 of 27 SVGs move. So the obstacle half is pinned by Part 3 Task 2's free-box pin alone, and CbcCltPckd's byte-identical SVG is not evidence that `C|B|A` stays three lines); and 3 of
  the 34 originally bought figures. `CNX_Chem_07_04_Ques11ans_img`, the 14th rule-A figure, is retired and has no
  sidecar.
- **Prediction (registered in the script before the run).** Exactly 4 decide records change, each to one drawn line
  with `n_src` 1: Nitrogen `ammonium (NH4|+|)`, `nitrites (NO2|–`, `nitrates (NO3|–` and conjugate_img
  `NH4|+ (conjugate acid)`. Every other record is identical by value; every figure's run-exact `<text>` is identical;
  the other 25 SVGs are byte-identical.
- **Controls.** `before2` re-runs the base composer on `CNX_Chem_14_03_corresp` (54 laid-out blocks): it must be
  byte-identical to `before` (determinism, part of the VERDICT). `BASELINE` reports how many `before` copies reproduce
  the committed `media/<b>_IS.svg` `<text>` elements (the copy the '5' pass replaces): a miss is a figure the pass
  changes for a reason outside ㉑ — a finding for the pass, not a ㉑ defect.
- `report.txt` is the verbatim output of `compare`.
