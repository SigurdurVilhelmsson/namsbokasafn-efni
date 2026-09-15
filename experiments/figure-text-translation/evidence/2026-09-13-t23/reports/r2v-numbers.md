# r2v-numbers — adversarial re-derivation of the r2 (§C140 ② + ③ + ⑨) prototype's numbers

**Date:** 2026-09-13. **Cost:** 0 ISK. Nothing that calls the MT was run. The only composer run was a cmp-verified copy of the
repo's unpatched `compose.py`, used as an independent V0 control. It draws locally and writes to scratch.
**Repo:** read-only. Every python run that imported any repo or scratch module had `PYTHONDONTWRITEBYTECODE=1`, plus
`PYTHONPYCACHEPREFIX` pointing into scratch.
⚠️ **Disclosure:** two early inspection one-liners lacked the variable: the census/userflags/items/diag heredoc, and
the first (failed, `KeyError`) c3b census class tabulation. They imported only the stdlib (`json`, `collections`), so
no bytecode can land in the repo. The final `find -newer critic.md` over
`experiments/figure-text-translation` (which includes its `__pycache__`) returns nothing.
No npm, vitest or `test_*.py`. No Chromium. At the end, `pgrep -x python3 / headless_shell / chromium` all came back empty.
**Scratch:** `/home/siggi/dev/scratch-c140/r2v-numbers/` (`scripts/`, `out/`, `repo_v0/`, `repotree/`).
**Lens:** numbers. Every headline number was recomputed with my own scripts from the raw composer output
(`r2/work/<tag>/<b>/items.json`, `compose-report.json`) and from the inherited inputs (`prep/figs`, `c3/*.jsonl`,
`c3/userflags.json`, `c3b/census.json`, `c3b/measure-V0.jsonl`, sidecars). The builder's `measure-*.jsonl` served only
as something to compare against, never as an input. Its `analyse.py` / `sentinels.py` / `tables.md` were not used.

**What I share with the builder (declared):** the instrument definitions only. These are `c3lib` (Fig, ink_mask,
measure_adv), `containers.seed_mask/TOL`, `baseline.glyphbox_mask`, and c3b's four verdict functions, which I re-typed.
**What is independent of the builder's adapter:**
- line grouping by geometry, never by `r2line` tags;
- base size as the character-weighted mode of item sizes, never `diag['sz']`;
- drawn extents from the cairo advance of each item, never `diag['drawn_widths']`;
- my own class rule from c3 container fields;
- my own overflow recomputation;
- my own source anchors;
- an unpatched repo-composer V0 run.

---

## Verdict

**Almost every headline number reproduces exactly from independent sources**, on all 176 blocks in all 8 measured
cells:
- my per-block rows equal the builder's measure rows field by field (lines, text, size, pixel counts, margins within
  their 2-dp rounding);
- the verdict totals, PROBLEM, unresolved, overflow and below-8.5 lists, and rank tuples all match;
- the cross-cell identity and decimal claims hold, and so do the planted controls.

**Seven numeric or population statements are wrong or overstated** (§2). Most are small. Two change how the result
should be framed:
- **(D1)** the headline's "three single words wider than their budget at the floor" is true of only **1 of 3** in the
  recommended cell;
- **(D2)** "PROBLEM blocks 50 → 4" is labelled with the wrong population.

No disagreement flips the recommended cell or any verdict count.

## 1. Re-derived numbers (builder vs mine)

Population is the 176 layout blocks unless stated. Unit: block.

| claim | builder | mine | independent source | control |
|---|---|---|---|---|
| V0 control: items / png / report vs prep | 34/34 each | items JSON- and byte-equal **34/34**, png pixel-equal **34/34**, report equal **34/34** | `r2/work/V0` vs `prep/figs` read directly (not `run-V0.json`) | planted item x+0.001 and a one-pixel channel flip are both detected |
| V0 control vs the **unpatched repo composer** | — | png pixel-equal **34/34**, report equal **34/34** (ignoring `translationsPath`) | copy of repo `compose.py` (sha c4fc0ff1…, cmp-equal) run into `r2v-numbers/repo_v0` | V5 2.0/7.0 png differs on 28/31 figures with layout blocks. The 3 identical ones are brain, rxn3 and FishLemon, whose layout blocks are item-identical |
| measure-V0 == c3b's | byte-identical | `cmp` equal, sha256 ace280ca… both | c3b file (inherited) | — |
| layout-block set per tag | 176 | 176 in all 10 tags, and the set equals prep's | items.json | — |
| kept items == V0 (decimal off) | 34/34 × 8 runs | 34/34 in all 9 decimal-off tags (incl. notr, CTRL f9.0) | items.json vs prep | the dec run differs on exactly 5 figures (7/7/7/9/5) |
| my rows vs builder measure rows | — | **0 field disagreements** on 176 × 8 tags. Max \|Δ\| in frame/margins 0.005 pt (rounding) | my own geometry | comparator fires: mine(2.0/7.0) vs his(V0) → 126 blocks differ; vs his(2.0/7.5) → exactly 4 |
| text sentinel | 176/176 | **176/176 in all 10 tags**, against the sidecar value | sidecar `.is.json` + my geometric grouping | 4/4 plants fire on sacch b4 (styled): deleted char, swapped items, duplicated item, moved line |
| hit / off-page / spill / contact / text-coll | V0 32/4/24/26/7 → 1/0/2/1/0 (2.0/7.0) | **same**. Named at 2.0/7.0: hit combmap b8; spill exocytosis b4, combmap b8; contact combmap b8. At F 8.0 contact adds empform b8 | my pixel run with the instrument definitions | planted sacch b2 shift re-measured by me: ink 0/21/12, spill 0/83/124, margin 9.33/−5.67/−10.67 (equal) |
| shrunk | 15 → 15 (PAD 2.0) / 16 (PAD 2.5) | same totals. **Broken (clean in V0, shrunk now), 2.0/7.0 and 2.0/7.5:** glycine b1 8.75, potassium b1 8.75, sacch b1 8.75, Example2 b3 8.0, flowchart b13 and b14 (7.25 at F 7.0, 7.5 at F 7.5, 8.0 at F 8.0), map7 b5 8.75. PAD 2.5 adds Example2 b1 8.75. **0 blocks** broken on hit, off-page, spill, contact, text-coll, lines or PROBLEM in any of the 6 cells | items + pixels | V0 15 |
| worsened (bad in both) | as named in the builder's T3 | **2.0/7.0:** empform b8 8.75 → 7.25; moleratio2 b3 8.5 → 8.0; combmap b10 8.75 → 8.0; combmap b8 hit 10 → 29 px (spill 71 → 75, below +10). **2.0/7.5:** empform b8 → 7.5; moleratio2 b3 → 8.0; combmap b10 → 8.0; combmap b8 hit 10 → 21, spill 71 → 114. **2.0/8.0:** hit 10 → 28, spill 71 → 189. **PAD 2.5:** moleratio2 b3 → 7.25 / 7.5 / 8.0 and combmap b10 → 7.5 / 7.5 / 8.0 at F 7.0 / 7.5 / 8.0. No other block gains ink on dark, or ≥ 10 px spill, in any cell | my pixels | V0 values |
| lines ≠ source | 66 (18/48) → 18 (0/18) | same. The 18 at 2.0/7.0 (src → drawn): empform b8, flowchart b5, map2 b6, map3 b6, moleratio1 b2, moleratio2 b2, moleratio2 b3, combmap b8, b10, b11, b12, b13, b14, map7 b3, map7 b6, map8 b1 (all 2 → 1, one word each) + flowchart b15, b18 (4 → 3, 3 words). Identical list in all 6 cells | my grouping + sidecar word counts | V0 18 more-lines are detected by the same grouping |
| diag V0 == c3b's | 34/34 byte-equal | `cmp`: 34/34 byte-equal | c3b/work/V0 (inherited) | — |
| bold/fill mixing across lines | 0 of 176 | 0 of 176 layout blocks, and 0 of all blocks in the 34 figures | runs.json + meta fonts | **no positive control** (the corpus has no mixed block anywhere) |
| lines == min(src, words) | 176/176 in the 6 cells | 176/176 in the 6 cells | same | CTRL f9.0: fails exactly on sacch b1, Example2 b3 (iv-gain) |
| Σ ink on dark | 3664 → 30/22/29/32/24/31 | same | pixels | — |
| PROBLEM | 50 → 4 in all 6 cells | same 4: exocytosis b4, empform b8, moleratio2 b3, combmap b8 | my verdicts | V0 = 50 |
| unresolved [USER] mechanisms | 49 → 4 / 5 (F 8.0) | same. At F ≤ 7.5: empform b8 SHRINK, moleratio2 b3 SHRINK, combmap b8 SHRINK + WIDER. At F 8.0 empform b8 WIDER is added | `c3/userflags.json`: 50 checks / 41 blocks (WIDER 27, NARROWER 13, ANCHOR 4, SHRINK 3, TABLE 3) | V0 = 49 |
| overflow blocks | 5/8/8 (PAD 2.0), 5/9/10 (PAD 2.5) | same, and the named sets equal my recomputation (widest sidecar word at drawn size vs census R−L−2·PAD or FR−FL−2·PAD) in all 7 cells incl. CTRL f9.0 (14). openFallback 0 in the sweep, 3 in CTRL (glycine b1, potassium b1, map7 b5) | cairo + inherited c3b census | CTRL f9.0 run: 14 named |
| unnamed overhang (D-floor completeness) | — | **0 unnamed**. Blocks whose frame leaves [lo+PAD, hi−PAD] and are not in `overflow` are only etheneBr b1, b2 (source starts at the page edge, FL 0) and, at PAD 2.5, combustion b1, b4 (source 2.25/2.0 pt from its obstacle). All are anchored at the source | my extents | — |
| below 8.5 pt (sz0 ≥ 8.5) | 7 / 9; Σ 6.75, 5.5, 3.5, 9.0, 7.0, 4.0 | same names and sizes | items | V0 5 (Σ 4.0) |
| rank tuples and pick | 2.0/7.0 (4,4,5,7,6.75,0) … pick 2.0/7.0 | same 6 tuples, same pick. Σ ranked above overflow → 2.0/7.5 (5.5) | recomputed | — |
| F 7.0 vs 7.5 drawing diff | exactly 4 | exactly 4 (empform b8, flowchart b13, b14, combmap b8); same 4 for 7.5 vs 8.0 and 7.0 vs 8.0 | items per block | PAD 2.0 vs 2.5 at F 7.0 → 26 blocks differ, so the comparator does see changes |
| ② transfer on vs off | 34 token blocks / 13 figs differ; 21 figs identical | 34 blocks in 13 figures differ = exactly the diag `n_tokens` set; 21 figures identical | items | — |
| ② styled drawn | 52/52 | 52 styled items in 34 blocks. **Independent proxy:** source runs < 0.9 × base, merged per stretch, give a multiset equal to the drawn small items in 34/34 blocks (52 = 52) | runs.json vs items | the proxy fires on 34/34 blocks in notr and in V0 |
| ② × ③ | 1 block (combustion b4) | same: line partition / base size differ only on combustion b4 (9.0 vs 8.5 pt). ethene b0 also changes displacement (−6.76 vs −7.84 pt) without a step change, which the claim does not cover | my rows + diag | — |
| decimal on | 35 items, only `.`→`,`, 7/7/7/9/5, multiset == c9 | same. **Miss direction:** 0 digit-flanked `.` left in kept items (the OFF-run scan finds 35). Layout items unchanged 34/34. Report multisets unchanged. 35 `decimal` entries | items; c9's 35-value list (inherited, c9-decimal.md Population A) | OFF run = 35 |
| R3 regex strings | "verbatim" | every raw-regex string in `r2dec.py` occurs in `c9/rules_eval.py`. The only change is the fragment test on run text vs block key | string compare | — |
| box centring | 66/66 ≤ 0.5 pt | 66/66 | my line extents, census L/R | — |
| cell alignment / displacement | 21 centre + 5 right; displaced 4 (PAD 2.0), 7 (PAD 2.5) | same alignment from my rule on the inherited margins, 0 disagreements. Displacements equal: −1.42, −1.43, −0.17, −1.07; at PAD 2.5 −1.02, −1.03, −0.67, −1.57 and the 3 b13 at −0.15/−0.15/−0.16 | my extents + my anchors | — |
| OPEN steps 2.0/7.0 | i 65 · ii 6 · iii-disp 7 · iii-anchor 2 · iv-overflow 4 | geometry agrees with every label: 6 displaced at sz0, 7 shrunk + displaced, 2 shrunk + undisplaced, 4 at sz0 = floor, undisplaced | my extents | — |
| empform b8 / flowchart / combmap margins | 2.97 / 1.53 / 0.63 pt; combmap b8 −2.8 / −5.5; b12, b14 0.26–0.27 past | same (empform 2.97/2.98, 1.53/1.54, 0.63; combmap b8 −2.80/−5.50/−6.57; b12 −0.26 L/−0.21 R, b14 −0.27/−0.21; b11, b13 +0.73/+0.75) | my extents | — |
| vitC b0 | 6.01 pt both sides | 6.01 / 6.01 | same | — |
| ethene b0 | displaced 6.76 pt off the b17 edge | a0 15.77 vs source 22.53 (b17 at 22.50) | same | — |
| exocytosis b4 | false gradient spill | spill 181 px in V0 **and** in every V5 cell; the block is unchanged | pixels | — |
| inherited: c3b V3 | 15 problem / 17 unresolved | `c3b/analysis.json` V3 = 15 / 17 (inherited, not re-measured) | — | — |
| pre-registered rule | written 19:24:17Z before any V5 compose | mtime 19:24:17 precedes `r2v5.py` (19:26:01) and the first V5 `items.json` (19:33:17). Mtimes cannot rule out earlier overwritten runs | file mtimes | — |

## 2. Defects — numeric or population disagreements, each with both numbers

- **D1 — "Three are single words wider than their budget at the floor" is 1 of 3 in the recommended cell (PAD 2.0 / F 7.0).**
  The builder's headline and its `questionsForUser` say this, and the defect list and design implications repeat it.
  - Measured at 2.0/7.0: **empform b8** `Reynsluformúla` fits at 7.25 pt (need 50.04 ≤ budget 51.99; box margin
    2.97/2.98 pt).
  - **moleratio2 b3** `Efnajöfnustuðull` fits at 8.0 pt (need 55.80 ≤ 56.01).
  - Both are PROBLEM blocks **only** through c3b's SHRINK post-condition (`not shrunk`). A word that needs any shrink at
    all can never satisfy it.
  - **combmap b8** is the only real over-budget word (64.08 > 54.49).
  - empform b8 becomes an overflow only at F ≥ 7.5 (PAD 2.0) or PAD 2.5 with F ≥ 7.5. moleratio2 b3 becomes one only at
    PAD 2.5 with F ≥ 7.5.
  - The report body (§Headline item 3) says "SHRINK post-condition" correctly. The returned summary does not.
  - ▶ **Consequence:** the builder's questionsForUser item 3 puts all three under "hyphenate / shorter term / named
    overflow". At the recommended cell, empform b8 and moleratio2 b3 raise a SIZE question ("is 7.25 pt / 8.0 pt
    acceptable?"), not a hyphenation one. Only combmap b8 is a word wider than its box at the floor.
- **D2 — Wrong population on "PROBLEM blocks 50 → 4".**
  - The returned keyNumbers row labels the population "50 [USER]-flagged items over 41 blocks". The headline says
    "Across the 50 [USER]-flagged items, problem blocks fall from 50 to 4".
  - PROBLEM is computed over **all 176 blocks** (extended verdict ∪ blocks with an unresolved flag).
  - The V0 set of 50 is **40 flagged + 10 unflagged** blocks: exocytosis b2, b4; potassium b2; empform b1, b4;
    flowchart b0, b13, b14; combmap b11, b13.
  - One flagged block (vitC b0) is not in the V0 PROBLEM set.
  - The 50 = 50 is a coincidence. The report file's own table has the population right (176).
- **D3 — "Blocks drawn differently from V0: 123 (PAD 2.0) / 122 (PAD 2.5)" undercounts.**
  - Comparing the items themselves: **125 / 124**.
  - The two missing blocks are **sacch b4** (`(mól–1)` → `(mól` + raised 7 pt `–1` + `)`) and **combustion b3**
    (`CO2-gleypir` → `CO` + subscript `2` + `-gleypir`).
  - Both change only through ② styling. The builder's criterion (joined text, 2-dp frame, base size) cannot see a
    styling change.
- **D4 — "flowchart b13, b14 `Mólstyrkur`: 7.5 pt, 0.28 pt per side into the 2 pt clearance (F 7.5)" is wrong for b13.**
  - The 0.28 is arithmetic ((34.56 − 34.0)/2), not a measurement.
  - Measured free-box margins at 2.0/7.5: b13 **1.99 L / 1.45 R**, i.e. 0.01 and 0.55 pt into the pad; b14 1.74 / 1.70.
    b13 sits in step iv-overflow with zero clamp, so the overhang is not split evenly.
- **D5 — The arrow-label control "V0 drew 2 lines on these" is wrong.**
  - V0 drew **source + 1** lines on all 9: 3 lines on argon b2, copperMoles b1, vitC b1, glycine b1, potassium b1,
    sacch b1, Example2 b3 (source 2), and 4 on copperMoles b4 and Example2 b1 (source 3).
  - Read from my rows and from the builder's own `measure-V0.jsonl`, which agree.
  - The claim that V5 holds the source count 9/9 is correct.
- **D6 — "PAD 2.5 moves the 5 right-flush cells by about 0.15 pt" (returned surprises).**
  - Measured: **3 of 5** move: alsulfatemass b13 −0.15, aspirin b13 −0.15, chloroform b13 −0.16.
  - glycinemass b13 and saltMass b10 do not move (0.00).
  - Report §2 has it right ("the 3 right-flush b13 cells").
- **D7 — The cell anchor sentinel (d) "26/26 within 0.5 pt" holds only against the prototype's own anchor formula.**
  - That formula measures source widths with cairo's hinted metrics at 200 dpi.
  - Against an independent anchor, the source runs' own PDF advances (= cairo `HINT_METRICS_OFF`: 148.52 vs adv
    148.53), it is **25/26**.
  - **glycinemass b13** (right-flush `Mólmassi (g/mól efnasambands)`) ends at 229.35 pt, while the English label ended at
    **230.28 pt**: **0.93 pt** (≈2.6 px at 200 dpi) short of the source right edge it is ruled to be flush with.
  - Six centre cells differ by 0.25–0.36 pt between the two anchors, inside tolerance.
  - The builder disclosed that (d) reuses the formula. This is the concrete instance where that matters.

## 3. Robustness notes (not disagreements)

- **Metric sensitivity (my `unhinted.py`).**
  - Layout widths use hinted advances. Unhinted line widths differ by −2.9 % … +2.0 % (median −0.95 %) over 276 drawn
    lines at 2.0/7.0.
  - Re-growing each line about its anchor with unhinted widths flips **no** contact, edge-crossing or free-margin-1 pt
    verdict in 2.0/7.0 or 2.0/7.5.
  - **6 blocks** move from exactly filling the PAD budget to 0.07–0.56 pt inside it: alsulfatemass b2, aspirin b2,
    saltMass b2 (cells, 1.92–1.93 pt), Example2 b3 1.62, moleratio2 b3 1.44, combmap b10 1.59 pt.
  - The browser's scale-dependent drift (c2, inherited) is not this metric. This bounds the effect only for the
    unhinted limit.
- **R3 is not idempotent on 3-decimal values** (property of c9's rule, inherited, reproduced on a scratch copy of
  `r2dec.py`).
  - `1.008 → 1,008 → 1.008`: the thousands rule reads `1,008` as a grouped 1008.
  - **8 of the 35** converted kept values would revert if R3 ran twice: 1.008 ×4, 14.007 ×2, 8.064, 5.040.
  - The composer re-reads `runs.json` every time, so it is safe as built. An integration that localises the same text
    upstream (sidecar/editor, `figure-consistency.cjs`) and then runs R3 again would silently undo it.
- **Mechanism checks resolved by construction.**
  - All 9 non-prose NARROWER checks (the arrow labels, rows 14–19, 21) pass the `lines <= src_lines` disjunct, which
    D-lines guarantees. Their pixel disjunct is also true on all 9, so they are not vacuous.
  - ethene b0 ANCHOR passes only through `lines <= src_lines`, as the builder disclosed.
- **The PROBLEM metric excludes `shrunk`.** The 7 newly shrunk blocks (8 at PAD 2.5) are invisible to "50 → 4". The
  builder does report them separately.
- **text_coll** has no planted positive control (inherited gap). V0's 7 real hits, measured by the same instrument code,
  show the instrument is not blind here.
- sandwich b6 has a 10 pt `=` run inside a 9 pt block. It is drawn at 9 pt and not listed in `unformatted`. This is
  consistent with c2's token definition (a styled character requires a baseline shift or italic), not a transfer miss.

## 4. What I did not verify

- Heal / SVG / crops / contact sheets (outside this lens).
- The c3/c3b census geometry, userflags and c9 values (inherited, used as given).
- The pixel instrument code (shared by construction; my pixel counts equal the builder's because both run the same
  instrument definitions on the same items, which shows the measure files are not stale, not that the instrument is
  right).
- Browser rendering.
- Whether earlier V5 runs preceded the rule file (mtimes only).

## 5. Files

Scripts, in `r2v-numbers/scripts/`:
- `g1_control.py`, `g1b_repo_v0.py` — V0 controls;
- `mym.py` — independent per-block measure;
- `cmp_rows.py`, `cmp_ctrl.py` — field comparison and its control;
- `verdicts.py` — totals, named lists, transitions, mechanisms;
- `crosscell.py` — identity claims and ②×③;
- `decimal.py`;
- `overflow.py` — overflow and completeness;
- `geometry.py` — box, cell and open steps;
- `probe1-3.py`, `styled.py`, `vacuous.py`, `unhinted.py`.

Outputs are in `r2v-numbers/out/` (`*.txt`, `mym-<tag>.jsonl`, `verdicts.json`, `overflow.json`).

## Repo state

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain`:
```
?? docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md
```
That file was already untracked in the session-start git snapshot. I did not write or open it.

`find /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation -newer /home/siggi/dev/scratch-c140/reports/critic.md -not -path '*/pylibs/*' | head`:
```
```
(no output). The same predicate over `…/pylibs` and `books/efnafraedi-2e` also returns nothing. Positive control: over
`r2v-numbers/scripts` it lists the directory and my scripts. The repo's `experiments/figure-text-translation/__pycache__/*.pyc`
are gitignored and dated 17:19 or earlier, before critic.md (18:57). They are inherited, not written by me.
