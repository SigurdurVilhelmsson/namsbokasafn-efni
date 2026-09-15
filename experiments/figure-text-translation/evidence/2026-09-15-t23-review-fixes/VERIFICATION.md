# Verification — Tasks 13–18: [USER]'s review-fix rulings (R12–R15) installed, then recomposed on the 34 bought figures

> 🧊 **FROZEN, 2026-09-15.** Cited, never synced. Status lives in the campaign register (§C140, ⏩ RESUME)
> and in `../../REGISTER.md`. This measures the four composer fixes Tasks 13–16 installed (test-first, one
> commit each), Task 17's scratch recomposition of the 34 bought figures with the repository composer, and
> Task 18's repair run — `tools/figure-run.js --stale --force` recomposing the same 34 already-bought,
> already-sidecar'd figures under production code paths, at 0 ISK. If this folder disagrees with
> `PREDICTIONS.md` or the plan/spec it implements, they win, per the rule in the sibling `README.md`.
> **Cost of everything here: 0 ISK** — `MT spawned for 0 figure(s)` on both chapters (every figure already
> has a sidecar; `--force` only suppresses the skipped-current check, never spend).

**BASE2** (the commit that adds the Addendum — 2026-09-15 to the plan, "Tasks 13–19 — [USER]'s review
fixes"): `6cf8ab89`
**HEAD** (Tasks 13–16, before Task 18): `e922fa21`
**HEAD** (verified here, after Task 18's data commit): `38f60765`

```
git log --oneline 6cf8ab89..38f60765
38f60765 feat(figures): recompose the 34 ch03/ch04 figures with [USER]'s review fixes
e922fa21 fix(figures): no lone symbol, no useless line in box and cell labels (R13)
df69820a fix(figures): draw DeviceCMYK text in poppler's colour, keep RGB/Gray exact (R14)
443e6834 fix(figures): render figure text with geometricPrecision so spaces survive at every zoom (R12)
2786fc9a fix(figures): draw the artwork where the text is — pdftocairo -svg -noshrink -nocenter + a prepare guard (R15)
```

Install order was W → S → C → L (Task 13 → 14 → 15 → 16 = R15 → R12 → R14 → R13); the patch numbers are not
the order. `git status --porcelain` was empty at the start of Task 18 and is empty again after Step 8's
commit, confirmed below.

---

## Tasks 13–16 — the four composer fixes, test-first, one commit each

Full step-by-step detail (manifest check, Python baseline, every RED/GREEN/mutation/compare line, and the
one bash-export correction needed) is in `task-13-16-report.md`, cited here rather than restated in full;
the lines the addendum's own STOP conditions gate on are reproduced below.

### Task 13 — R15, artwork shift (`pdftocairo -svg -noshrink -nocenter` + a prepare guard)

- RED (patch `04-test_figure_prepare.patch`): `3 FAILED: 7c prepare's artwork.svg of a FRACTIONAL page draws
  every point exactly where the <text> convention (x, page_h - y) puts it, 7 PRECONDITION figure-prepare.py
  exposes artwork_transform_refusal, 7g PRECONDITION svgfix exposes PDFTOCAIRO_SVG_FLAGS for the guard to
  read`
- GREEN (patches `01`,`02`,`03`): `ALL PASS`
- Mutation (`refusal = artwork_transform_refusal(...)` → `refusal = None`, anchor `count == 1`): `1 FAILED:
  7g prepare EXITS 1 when the guard refuses, with the refusal in prepare.json`, then `restored` (cmp
  succeeded)
- Compare (`t13/py` vs `t13/base`): `compare done`, nothing before it
- Commit `2786fc9a`

### Task 14 — R12, `text-rendering="geometricPrecision"`

- RED (patch `13-test_svgout.patch`): `1 FAILED: S1 every one of the 8 <text> elements resolves to
  text-rendering=geometricPrecision (layout segments, the subscript, run-exact bold/italic, the rotated
  glyph)`
- GREEN (patches `12`,`16`): `test_svgout.py: ALL PASS`, `test_compose_runexact.py: ALL PASS`,
  `test_compose_t23.py: ALL PASS`
- Mutation (`'<g text-rendering="geometricPrecision">'` → `'<g>'`, `count == 1`): same S1 FAILED line, then
  `restored`
- Compare (`t14/py` vs `t13/base`): `NEW FILE test_svgout.py: rc=0 fails=[] last='ALL PASS'`, then
  `compare done`, nothing else before it
- Commit `443e6834`

### Task 15 — R14, poppler text colour

- RED (composer not yet wired; patches `05,08,09,10,11`): `test_figcolour.py: 8 FAILED: 1e K=1 …, 1e rich
  black (corpus) …, 1e CMYK blue …, 1e CMYK red …, 1a K=1 draws (35,31,32) = #231f20 …, 1b the corpus rich
  black draws (33,28,29) …, 2a translated 'Observation and curiosity' …, 2d kept 'H2O (g)' …`;
  `test_readlayer.py: 2 FAILED: 7a PIN — compose.cmyk draws through figcolour.fill_rgb, the one conversion,
  7b2 a DeviceGray/RGB glyph in this population keeps its OWN space - not folded into cmyk`;
  `test_compose_runexact.py: 1 FAILED: C1 CONTROL the translated ARC is byte-identical to the unchanged
  composer but for ruling (C)'s fill, which is exactly figcolour.fill_rgb of the planted fill`;
  `test_compose_t23.py: 1 FAILED: G1 CONTROL the kept population is byte-identical to the unchanged composer
  - except the planted decimal, which may differ ONLY by 26.98 -> 26,98, and ruling (C)'s fill, which is
  exactly figcolour.fill_rgb of the planted fill`
- GREEN (patches `06`,`07`): `test_figcolour.py: ALL PASS`, `test_readlayer.py: ALL PASS`,
  `test_compose_runexact.py: ALL PASS`, `test_compose_t23.py: ALL PASS`
- Mutation on pure module (`return poppler_cmyk_rgb(c, m, y, k)` → naive `(1-c)(1-k)` formula, `count == 1`,
  after wiring): same 8 `test_figcolour.py` FAILED names, same `C1 CONTROL` and `G1 CONTROL` lines, then
  `restored`
- Trap mutation (old folding `readlayer.py` from `HEAD`, i.e. Task 14's commit, under the wired composer):
  `8 FAILED: 1e Gray 0 …, 1e Gray 0.5 …, 1e RGB blue …, 1e RGB black …, 1c DeviceGray 0 stays PURE black
  (0,0,0), exactly, 1d a DeviceRGB value is drawn unchanged, exactly (no table, no fixed-point), 2b
  translated 'Form a hypothesis' …, 2c kept 'Test the hypothesis' …`, then `restored`
- Compare (`t15/py` vs `t13/base`): `NEW FILE test_figcolour.py: rc=0 fails=[] last='ALL PASS'`, `NEW FILE
  test_svgout.py: rc=0 fails=[] last='ALL PASS'`, then `compare done`
- Commit `df69820a`

### Task 16 — R13, rules A and E for box/cell labels

- RED (patch `15-test_figlayout.patch`): `10 FAILED:` `flowchart b10`, `flowchart b7`, `flowchart b15`,
  `flowchart b9`, `E alone (no symbol)`, `A: a binding count that fits only when shrunk …`, `E in the width
  floor-overflow path`, `E in the height floor-overflow path`, `E does not keep the size of the count it
  rejects`, `CONTROL E's surviving count takes the largest size where it fits`
- GREEN (patch `14-figlayout.patch`): `ALL PASS`
- Three named mutations (golden → mutate → test → restore → cmp, `count == 1` asserted each time):
  1. `_ae=False` (both rules off): same 10 FAIL lines as RED, then `restored`
  2. `return False` (E off, A on): 6 FAIL lines — `E alone`, `E in the width floor-overflow path`, `E in the
     height floor-overflow path`, `E does not keep the size of the count it rejects`, `case pair: 'Massi af
     cu' and 'Massi af Cu' …`, `CONTROL E's surviving count …` — then `restored`
  3. `lone = False` (A off, E on): 4 FAIL lines — `flowchart b7`, `flowchart b15`, `flowchart b9`, `A: a
     binding count that fits only when shrunk …` — then `restored`
- Compare (`t16/py` vs `t13/base`, plus a hash check against `PREDICTIONS.json`'s `tree_files_sha256`): `NEW
  FILE test_figcolour.py …`, `NEW FILE test_svgout.py …`, `compare done`; `composer files matching the
  verified build: 9 of 9 differ: []`
- Commit `e922fa21`

All four: `lint-staged could not find any staged files matching configured tasks` (info line, not a
modification or rejection) on commit; `git status --porcelain` empty after each. **Verdict: MATCH** on
every RED/GREEN/mutation/compare line, per `task-13-16-report.md`.

---

## Task 17 — the 34 in scratch, composed with the repository composer

Full detail in `task-17-report.md`, cited rather than restated; the required lines follow verbatim.

**Step 1 — the two `DONE` lines** (prep + compose, two halves):

```
DONE 15 figures prep_fail=0 compose_fail=0
DONE 19 figures prep_fail=0 compose_fail=0
```

15 + 19 = 34, `prep_fail=0 compose_fail=0` both halves.

**Step 2 — the eight keys, `34/34 MATCH` each, against `PREDICTIONS.json`** (`predict.py check … --dir
"$SCRATCH/t17/regen"`):

```
  artwork_svg_sha256       34/34 MATCH
  blocks_sha256            34/34 MATCH
  runs_sha256              34/34 MATCH
  compose_report_sha256    34/34 MATCH
  media_artwork_sha256     34/34 MATCH
  media_textgroup_sha256   34/34 MATCH
  text_count               34/34 MATCH
  style_font_faces         34/34 MATCH
34/34 MATCH
```

No MISMATCH on any key.

**Step 3 — census (repository build, 34 `translated.svg` files)**:

```
boundaries 164, space-bearing 24
   lost       1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   added      1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   narrowed   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   collision  1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   overhang   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 0.0
CENSUS-DONE
```

**Control census (committed pre-fix `_IS.svg` media, 34 files, same 164 boundaries / 24 space-bearing
population)**:

```
   lost       1:8 1.25:0 1.5:3 1.75:0 2.0833333:2 2.5:2 3:1 | total 16
   added      1:0 1.25:7 1.5:1 1.75:0 2.0833333:0 2.5:1 3:0 | total 9
   narrowed   1:1 1.25:0 1.5:0 1.75:3 2.0833333:3 2.5:0 3:1 | total 8
   collision  1:53 1.25:0 1.5:2 1.75:22 2.0833333:14 2.5:1 3:2 | total 94
   overhang   1:14 1.25:6 1.5:6 1.75:2 2.0833333:5 2.5:1 3:2 | total 36
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 8.9688
CENSUS-DONE
```

**Bond check (etheneBr, committed pre-fix media vs repository build)**:

- svg0 (committed pre-fix media) → segment `(3443, 3528)` on rows 200…232
- svg1 (repository build) → segment `(3454, 3539)` on rows 201…233
- `BOND-DONE`

No Chromium survivors at any checkpoint (`pgrep -a chrome-headless` before Step 1, mid-run and after Step 3
all printed nothing / `no chromium survivors`). Repository tree unmodified for the whole of Task 17
(`git status --porcelain` empty throughout).

**Verdict: MATCH** on every key and line, per `task-17-report.md`.

---

## Task 18 — the repair run: `tools/figure-run.js --stale --force`, verified BY VALUE, committed

### Step 1 — pre-flight editorial state (Task 10 Step 1's commands verbatim)

```
$ git fetch origin
$ git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'; echo "state-grep exit=$?"
(no output)
state-grep exit=1
$ git grep -l '"composedVersion"' origin/main -- 'books/efnafraedi-2e/figure-text/*.json' | wc -l
34
```

No approved/edited figure on `origin/main` since the plan was written. **MATCH.**

### Step 2 — dry runs (`--stale --force --dry-run`)

**ch03:**
```
DRY RUN — nothing bought, nothing written under books/
efnafraedi-2e ch03: 15 figure(s) across 5 module(s)
  --stale: 26 figure(s) in this chapter have no sidecar and were not selected. …
    15  translated
    15  = enumerated
VERDICT ok
```

**ch04:**
```
DRY RUN — nothing bought, nothing written under books/
efnafraedi-2e ch04: 19 figure(s) across 6 module(s)
  --stale: 11 figure(s) in this chapter have no sidecar and were not selected. …
    19  translated
    19  = enumerated
VERDICT ok
```

Both chapters listed only `figure-prepare.py warnings` of the `subset font` kind — no `artwork.svg
transform` warning, no `failed-*`/`unresolved`/`unreadable-text`/`copied-*` row. **MATCH.**

### Step 3 — live runs (`--stale --force`, foreground, one chapter at a time)

**ch03:**
```
    15  translated
    15  = enumerated
  MT spawned for 0 figure(s) — only a figure with NO sidecar is spendable
  published 15 figure(s) into …/books/efnafraedi-2e/media/
VERDICT ok
  NOTE (not a failure): 5 figure(s) had English-kept numbers drawn with a decimal comma
```

**ch04:**
```
    19  translated
    19  = enumerated
  MT spawned for 0 figure(s) — only a figure with NO sidecar is spendable
  published 19 figure(s) into …/books/efnafraedi-2e/media/
VERDICT ok
  NOTE (not a failure): 2 figure(s) carry label(s) drawn at the floor that overhang their space — the report names each
```

ch04's overflow NOTE names `CNX_Chem_04_03_flowchart` (2 blocks) and `CNX_Chem_04_05_combmap_img` (5
blocks) — flowchart and combmap, as `PREDICTIONS.md` lists. `MT spawned for 0 figure(s)` both chapters; same
outcome tallies as Step 2's dry runs; no `failed-*`/`unresolved`/`unreadable-text` row; no `unformatted` /
`containerErrors` NOTE. **MATCH.**

### Step 4 — exactly the 34 media changed

```
$ git status --porcelain | awk '{print $1, $2}' | sed -E 's#(books/efnafraedi-2e/media)/.*#\1/…#' | sort | uniq -c
     34 M books/efnafraedi-2e/media/…
$ git status --porcelain -- books/efnafraedi-2e/figure-text books/efnafraedi-2e/media/image-mapping.json | wc -l
0
```

No sidecar or mapping change — `composedVersion`/`composedHash` did not differ (already `'3'` since Task
10). **MATCH.**

### Step 5 — recomposed media equal the prediction, by value

```
$ python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --media | tail -5
  media_artwork_sha256     34/34 MATCH
  media_textgroup_sha256   34/34 MATCH
  text_count               34/34 MATCH
  style_font_faces         34/34 MATCH
34/34 MATCH
```

Every figure's artwork and every label, byte for byte, as the verified build drew them; the `<style>` bytes
are excluded from this check because the woff2 `head.modified` timestamp is not pinned in a `figure-run.js`
compose. **MATCH.**

### Step 6 — census and bond on the committed media

```
$ MEDIA34=$(...); echo $MEDIA34 | wc -w
34
$ python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t18/census" $MEDIA34
boundaries 164, space-bearing 24
   lost       1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   added      1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   narrowed   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   collision  1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   overhang   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 0.0
CENSUS-DONE
$ python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t18/bond" ".../CNX_Chem_04_03_etheneBr_img_IS.svg"
   row 201 [(3395, 3403), (3427, 3435), (3454, 3539), (3562, 3569), (3594, 3601)]
   row 233 [(3394, 3402), (3429, 3436), (3454, 3539), (3561, 3568), (3595, 3602)]
BOND-DONE
$ pgrep -a chrome-headless || echo "no chromium survivors"
no chromium survivors
```

Every class `total 0`, `worst |delta| pt = 0.0`; bond segment `(3454, 3539)` on rows 201…233 — the source's
pixel columns, matching Task 17's repository build exactly (the committed media are the same bytes Task 17
verified in scratch). **MATCH.**

### Step 7 — the JS failing set is the baseline

Task 7 Step 3's commands re-run with `--outputFile="$SCRATCH/t18-js.json"`, snippet argument `t18-js.json`:

```
$ npx vitest run --reporter=json --outputFile="$SCRATCH/t18-js.json" > "$SCRATCH/t18-js.log" 2>&1; echo "exit=$?"
exit=1
tests 6498
NEWLY RED: []
NEWLY GREEN: []
suites failing to LOAD: [] | baseline: []
```

`exit=1` is vitest's own exit code with the whole-repo baseline red set still present (36 named failures
unrelated to figures, per Task 7's report) — not a Task 18 regression. `tests 6498` is the same total Task 7
measured; this task reports the count without judging it, per instruction. `NEWLY RED: []` and `NEWLY GREEN:
[]` — the delta is empty in both directions. **MATCH.**

### Step 8 — commit

Staged: `books/efnafraedi-2e/media/*_IS.svg` (34 files). `lint-staged could not find any staged files
matching configured tasks` (info line, not a modification or rejection — same message Tasks 13–16 saw).
Commit **`38f60765`**. `git status --porcelain` empty after.

---

## Commands used

All commands are reproduced verbatim in-line above and in `task-13-16-report.md` / `task-17-report.md`;
Task 18's own commands are exactly `task-18-brief.md`'s Steps 1–9, run unmodified except for the
`--outputFile`/snippet-argument substitution Step 7 specifies.

---

## Result

Tasks 13–16 installed the four composer fixes test-first, one commit each, with every RED, GREEN and
mutation result matching `task-13-16-report.md`. Task 17 composed the 34 bought figures with the repository
composer in scratch and matched `PREDICTIONS.json` on all eight keys (34/34), with a browser census of
0/0/0/0/0 against a control census on the pre-fix committed media showing the measured defects (lost 16 /
collision 94 / overhang 36), and the etheneBr bond back at the source's pixel columns. Task 18 recomposed
the same 34 figures under `tools/figure-run.js --stale --force` — `MT spawned for 0 figure(s)` both
chapters, exactly the 34 media files changed (no sidecar, no mapping), the recomposed media equal to the
verified build byte for byte on `predict.py --media`'s four keys, the same 0/0/0/0/0 census and
`(3454, 3539)` bond on the committed media, and the JS suite's failing set unchanged (`NEWLY RED: []`,
`NEWLY GREEN: []`). No STOP condition fired at any step. Not rendered or synced — publication is [USER]'s
call.
