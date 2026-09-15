# Tasks 13–16 execution report

BASE2 = `6cf8ab89`. All four tasks installed in order W→S→C→L (Task 13→14→15→16 = R15→R12→R14→R13), one commit per task, exactly as briefed. Final `git status --porcelain` is empty; `git log --oneline 6cf8ab89..HEAD` shows exactly the four expected commits.

## Deviation (applies to Task 13 Step 1 only)

Task 13 Step 1's second command line was:
```
export EV2=$EXP/evidence/2026-09-15-t23-review-fixes REF2=$EV2/reference SCRATCH=/home/siggi/dev/scratch-c140/build
```
This fails mechanically: bash expands all words of a single `export` command before performing any of that command's assignments, so `$EV2` in `REF2=$EV2/reference` expands to empty (assigned by an *earlier* command, not this one) — `REF2` became `/reference`. `cd "$REF2"` then failed with "No such file or directory".

**Correction run** (obviously-intended, same values): split the line into two sequential exports —
```
export EV2=$EXP/evidence/2026-09-15-t23-review-fixes
export REF2=$EV2/reference
```
Confirmed by an isolated test (`A=/tmp/testexp; export EV2=$A/sub REF2=$EV2/reference; echo $REF2` → `/reference`) before applying the fix. All other export blocks in the four briefs use fully-literal absolute paths for interdependent variables (no `$EXP`/`$EV2` chaining within one command), so this one-line correction was the only instance needed across all four tasks. Nothing about what was asserted, tested, or compared was changed.

---

## Task 13 — R15, artwork shift (`-noshrink -nocenter` + prepare guard)

- **Step 1** (manifest + clean tree, with the correction above): `sha256sum -c MANIFEST.sha256 | grep -av ': OK$'` → no output; `manifest-check exit=0`. `git status --porcelain` → empty. `git log --oneline -1` → `6cf8ab89 docs(figures): [USER]'s review of the 34 …`. **Matches.**
- **Step 2** (Python baseline `t13/base`): all 18 files `rc=0 fails=0`, each `last='ALL PASS'` except `test_readlayer.py` → `last='  ALL PASS'`. 18 lines. **Matches.**
- **Step 3** (RED, patch `04-test_figure_prepare.patch` applied): `tail -1` →
  `3 FAILED: 7c prepare's artwork.svg of a FRACTIONAL page draws every point exactly where the <text> convention (x, page_h - y) puts it, 7 PRECONDITION figure-prepare.py exposes artwork_transform_refusal, 7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to read`. **Matches exactly.**
- **Step 4** (GREEN, patches `01`,`02`,`03` applied): `tail -1` → `ALL PASS`. **Matches.**
- **Step 5** (mutation — `refusal = artwork_transform_refusal(...)` → `refusal = None`, `count==1` asserted): `tail -1` → `1 FAILED: 7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json`, then `restored` (cmp succeeded). **Matches.**
- **Step 6** (suite `t13/py` vs `t13/base`): `compare done`, nothing before it. **Matches.**
- **Step 7** (commit): staged `strip-text.py, svgfix.py, figure-prepare.py, test_figure_prepare.py`. `lint-staged could not find any staged files matching configured tasks` (info line, not a modification/rejection). Commit **`2786fc9a`**. Tree clean after.

## Task 14 — R12, `text-rendering="geometricPrecision"`

- **Step 1** (RED, patch `13-test_svgout.patch`): `cmp` against `REF2/test_svgout.py` → `test-installed`. `tail -1` → `1 FAILED: S1 every one of the 8 <text> elements resolves to text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated glyph)` (preceded by unrelated `FFTM NOT subset; don't know how to subset; dropped` font-subsetting stderr noise, not part of the asserted line). **Matches.**
- **Step 2** (GREEN, patches `12`,`16`): `test_svgout.py: ALL PASS`, `test_compose_runexact.py: ALL PASS`, `test_compose_t23.py: ALL PASS`. **Matches.**
- **Step 3** (mutation — `'<g text-rendering="geometricPrecision">'` → `'<g>'`, count==1): same S1 FAILED line, then `restored` (cmp succeeded). **Matches.**
- **Step 4** (suite `t14/py` vs `t13/base`): `NEW FILE test_svgout.py: rc=0 fails=[] last='ALL PASS'`, then `compare done`, nothing else before it. **Matches.** Commit: staged `svgout.py, test_svgout.py, figscripts.py`; lint-staged info line only. Commit **`443e6834`**. Tree clean after.

## Task 15 — R14, poppler text colour

- **Step 1** (RED, composer not wired; patches `05,08,09,10,11`): `cmp` on `figcolour.py`/`test_figcolour.py` → `installed`. Four RED lines, all matching verbatim:
  - `test_figcolour.py: 8 FAILED: 1e K=1 …, 1e rich black (corpus) …, 1e CMYK blue …, 1e CMYK red …, 1a K=1 draws (35,31,32) = #231f20 …, 1b the corpus rich black draws (33,28,29) …, 2a translated 'Observation and curiosity' …, 2d kept 'H2O (g)' …`
  - `test_readlayer.py:   2 FAILED: 7a PIN — compose.cmyk draws through figcolour.fill_rgb, the one conversion, 7b2 a DeviceGray/RGB glyph in this population keeps its OWN space - not folded into cmyk`
  - `test_compose_runexact.py: 1 FAILED: C1 CONTROL the translated ARC is byte-identical to the unchanged composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill`
  - `test_compose_t23.py: 1 FAILED: G1 CONTROL the kept population is byte-identical to the unchanged composer - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill`
  **All match.**
- **Step 2** (GREEN, patches `06`,`07`): `test_figcolour.py: ALL PASS`, `test_readlayer.py:   ALL PASS`, `test_compose_runexact.py: ALL PASS`, `test_compose_t23.py: ALL PASS`. **Matches.**
- **Step 3** (mutation on pure module, after wiring — `return poppler_cmyk_rgb(c, m, y, k)` → naive `(1-c)(1-k)` formula, count==1): same 8 `test_figcolour.py` FAILED names, same `C1 CONTROL` and `G1 CONTROL` lines, then `restored`. **Matches.**
- **Step 4** (trap mutation — old folding `readlayer.py` from `HEAD` i.e. Task 14's commit, under the wired composer): `tail -1` → `8 FAILED: 1e Gray 0 …, 1e Gray 0.5 …, 1e RGB blue …, 1e RGB black …, 1c DeviceGray 0 stays PURE black (0,0,0), exactly, 1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point), 2b translated 'Form a hypothesis' …, 2c kept 'Test the hypothesis' …`, then `restored`. **Matches.**
- **Step 5** (suite `t15/py` vs `t13/base`): `NEW FILE test_figcolour.py: rc=0 fails=[] last='ALL PASS'`, `NEW FILE test_svgout.py: rc=0 fails=[] last='ALL PASS'`, then `compare done`. **Matches.** Commit: staged `figcolour.py, test_figcolour.py, compose.py, readlayer.py, test_readlayer.py, test_compose_runexact.py, test_compose_t23.py`; lint-staged info line only. Commit **`df69820a`**. Tree clean after.

## Task 16 — R13, rules A and E for box/cell labels

- **Step 1** (RED, patch `15-test_figlayout.patch`): `tail -1` → `10 FAILED:` naming, in order: `flowchart b10`, `flowchart b7`, `flowchart b15`, `flowchart b9`, `E alone (no symbol)`, `A: a binding count that fits only when shrunk …`, `E in the width floor-overflow path`, `E in the height floor-overflow path`, `E does not keep the size of the count it rejects`, `CONTROL E's surviving count takes the largest size where it fits`. **All 10 names match.**
- **Step 2** (GREEN, patch `14-figlayout.patch`): `tail -1` → `ALL PASS`. **Matches.**
- **Step 3** (three named mutations, golden→mutate→test→restore→cmp each, `count==1` asserted each time):
  1. `_ae=False` (both rules off): 10 `FAIL` lines — same 10 names as Step 1 — then `restored`. **Matches.**
  2. `return False` (E off, A on): 6 `FAIL` lines — `E alone`, `E in the width floor-overflow path`, `E in the height floor-overflow path`, `E does not keep the size of the count it rejects`, `case pair: 'Massi af cu' and 'Massi af Cu' …`, `CONTROL E's surviving count …` — then `restored`. **Matches** (the `case pair` case correctly appears here though absent from Step 1's RED set, exactly as the brief predicted).
  3. `lone = False` (A off, E on): 4 `FAIL` lines — `flowchart b7`, `flowchart b15`, `flowchart b9`, `A: a binding count that fits only when shrunk …` — then `restored`. **Matches** (`flowchart b10` correctly absent, since E alone still joins `af A`).
- **Step 4** (suite `t16/py` vs `t13/base`, plus hash check against `PREDICTIONS.json`'s `tree_files_sha256`): `NEW FILE test_figcolour.py …`, `NEW FILE test_svgout.py …`, `compare done`; `composer files matching the verified build: 9 of 9 differ: []`. **Matches.** Commit: staged `figlayout.py, test_figlayout.py`; lint-staged info line only. Commit **`e922fa21`**. Tree clean after.

---

## Final state

```
git log --oneline 6cf8ab89..HEAD
e922fa21 fix(figures): no lone symbol, no useless line in box and cell labels (R13)
df69820a fix(figures): draw DeviceCMYK text in poppler's colour, keep RGB/Gray exact (R14)
443e6834 fix(figures): render figure text with geometricPrecision so spaces survive at every zoom (R12)
2786fc9a fix(figures): draw the artwork where the text is — pdftocairo -svg -noshrink -nocenter + a prepare guard (R15)
```
`git status --porcelain` at repo root: empty. `/home/siggi/dev/scratch-c140/` untouched/not deleted.
