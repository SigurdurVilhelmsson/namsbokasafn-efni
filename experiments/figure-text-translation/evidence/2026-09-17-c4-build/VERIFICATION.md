# Verification — §C140 ④, `strip-text.py` keeps graphics state, 0 ISK

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ④ and its ⏩ RESUME) and in
> `../../REGISTER.md`. If this document disagrees with `PREDICTIONS.md`, the design or the plan,
> they win, per the rule in the sibling `README.md`. **If this folder disagrees with the campaign
> register, the register wins** (CLAUDE.md § One source of truth) — this folder is evidence, never
> status.
> **Cost of everything here: 0 ISK.** `test_figrings.py` printed `ALL PASS` before the one
> `figure-run.js` invocation this folder records, that invocation ran `--stale --force` on a figure
> that already has a committed sidecar (`MT spawned for 0 figure(s)`), and every other command here
> either read files or ran a local Python/Node script.

Design: [`docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md)
· plan: [`docs/superpowers/plans/2026-09-17-c140-c4-strip-keeps-gstate.md`](../../../../docs/superpowers/plans/2026-09-17-c140-c4-strip-keeps-gstate.md) ·
predictions, written before this task's measurement runs: [`PREDICTIONS.md`](PREDICTIONS.md) ·
evidence the design rests on (frozen, a separate earlier folder — measurements only, no code):
[`../2026-09-16-c4-explore/README.md`](../2026-09-16-c4-explore/README.md).

Built on `feat/c140-c4-strip-keeps-gstate`: Task 1 (baseline + predictions, `6dc3dafc`), Task 2 (the
fix + TDD suite, `606c835e`), Task 3 (corpus renders/refusal walk/keys/SVG arms/suites, `7ac524f6` +
`64fcbda7`), Task 4 (recompose, `ba2b8fd4`), this task (Task 5, evidence write-up).

## Predictions P1–P8

| # | predicted | measured | file |
|---|---|---|---|
| P1 | Over 533 figures: exactly 34 differ by value, 15 above 40/channel, the changed set equal by name to the exploration's, every changed pixel at distance 0.0 from source, serialiser control 0 px, planted control detected | ✅ population **533** (bought=34, nontext-not-bought=499); **changed 34**, **>40/channel 15**; "Sets equal by name: True" (empty in both directions); direction check: 34 of 34 changed figures at distance 0.0 from source (`mean_dist_AFTER_to_SOURCE: 0.0`); SERIALISER control `count_gt40=0 count_gt0=0`; PLANTED control `count_gt40=441 count_gt0=441`, bbox `[80,100,325,345]` | `reports/after/render.log`, `reports/after/render-summary.md`, `reports/after/render-controls.json` |
| P2 | Among the 34 bought figures only `CNX_Chem_04_05_combustion` differs | ✅ "Bought figures changed (of 34 bought): ['CNX_Chem_04_05_combustion'] (expected: only ['CNX_Chem_04_05_combustion'])" | `reports/after/render-summary.md` |
| P3 | The fixed strip, run over every figure the census scanned, refuses 0 | ✅ `DONE n=910 refused=0 errors=0` — 910 is every `status: 'ok'` row in the frozen exploration's census (`../2026-09-16-c4-explore/census/results.jsonl.gz`; rvosmosis is excluded there, refused by the resolver before the strip ever runs) | `reports/after/refusal-walk.log`, `reports/after/refusal-walk.jsonl` (910 lines) |
| P4 | `reports/after/summary.tsv` equals `reports/before/summary.tsv` byte for byte, and all 38 `blocks.json` are identical | ✅ `SUMMARY-IDENTICAL` (`cmp` exit 0, re-confirmed independently: both files 39 lines — 1 header + 38 rows — byte-identical); `BLOCKS-CHECKED (diffs=0)`, counts **37**/**37**. ⚠️ **Precision on the "38" in the prediction:** 38 is the row count in `summary.tsv` (34 bought + 4 hazard figures); one of those 38, `CNX_Chem_11_04_rvosmosis`, is refused (`production-page`) in both the before- and after-run and therefore has no `blocks.json` — so 37, not 38, `blocks.json` files exist to compare, and all 37 are identical. Nothing about this is caused by ④ (rvosmosis's refusal is unchanged from before) | `reports/after/keys-identity.txt`, `reports/after/summary.tsv`, `reports/before/summary.tsv` |
| P5 | combustion's `artwork.svg` differs before/after; the other five (exocytosis-88f6, empform, HClsoln, flowchart, sandwich) are undetermined-but-unchanged; no `<mask`/`<image` count and no `svgfix.json` collapsed/addOps count rises anywhere | ✅ combustion `sha256` `34e606709e11…` (before) → `973952842917…` (after), differs; the other five: `a3cf4bb21000…`, `2157c693a803…`, `fe81039d8ea8…`, `46c1244bb176…`, `3e536fa556c5…` — identical before/after. All six rows read `rises=[]`; every `svgfix.json` dict (`addOps`/`collapsed`/`useSitesRewritten`/`clipped`/`unmatched`/`modes`) and every `mask`/`image`/`use`/`path` count is identical before→after, combustion included (its change is in raster paint operators, not in svgfix's XObject-flattening pass). **Stronger than predicted:** the "before" run's determinism control (`--twice`) found `det_before=True` for all six, so the five unchanged figures are not merely "undetermined" — non-determinism was checked for and not found | `reports/after/svg-arms-compare.txt`, `reports/after/svg-arms.json`, `reports/before/svg-arms.log`, `reports/before/svg-arms.json` |
| P6 | Only the recompose set's `_IS.svg` files change under `books/`; `textgroup_sha256` identical, `artwork_sha256` differs; `MT spawned for 0 figure(s)`; no sidecar/mapping change; combustion's recomposed copy, rendered in Chromium, shows 7 black arrowheads | ✅ recompose set = `CNX_Chem_04_05_combustion` (the only member); run transcript: "MT spawned for 0 figure(s), 0 billable characters", "published 1 figure(s)…", `VERDICT ok`; `git status --porcelain -- books/` shows exactly one line, ` M books/efnafraedi-2e/media/CNX_Chem_04_05_combustion_IS.svg` — no sidecar, no `image-mapping.json`; `textgroup_same=True artwork_changed=True text_count 32->32` (`textgroup_sha256` `3b3642559b6c…` identical both sides, `artwork_sha256` `5c86fc08…` → `ec178c83…`); Chromium render: "All 7 arrowheads … render black (matching the source … not the teal/blue … corruption), and the labels … and artwork … are otherwise unchanged" | `reports/after/recompose-set.txt`, `reports/recompose/CNX_Chem_04_05_combustion.txt`, `reports/recompose/git-status-books.txt`, `reports/recompose/parts-before.json`, `reports/recompose/parts-after.json`, `reports/recompose/parts-compare.txt`, `reports/recompose/combustion-look.md` |
| P7 | Every existing Python suite still prints `ALL PASS`; `test_strip_text.py` prints `ALL PASS` and its negative arms fail against the shipped rule; the root vitest failing names equal `reports/before/npm-failing-by-name.txt` | ✅ all **nine** suites — `test_readlayer.py`, `test_figure_prepare.py`, `test_figure_compose.py`, `test_sendable.py`, `test_sources.py`, `test_make_fixture.py`, `test_figrings.py`, `test_svgfix.py`, `test_strip_text.py` — each `ALL PASS`. Within `test_strip_text.py`, every NEGATIVE ARM check (`1b-page`, `1b-form`, `2b`, `6b`) itself `PASS`es, which means the assertion "the shipped rule produces a *different*, wrong pixel there" held true on a fresh run (e.g. `2b NEGATIVE ARM — the shipped rule draws it thin: old-rule pixel (255, 255, 255)` against source `(0, 0, 0)`). **Check count (ruling R5), re-counted fresh for this task, not carried over from an earlier report:** `grep -cE '^\s+(PASS|FAIL)\s'` over a fresh run's output gives **38** (0 `FAIL`, trailing `ALL PASS` line correctly excluded — a naive `grep -cE 'PASS\|FAIL'` over-counts to 39 by also matching that trailing line). vitest: `now 36 before 36`; `only-now []`; `only-before []`; `files that died without a failing test: []`; planted control `CONTROL planted shows as only-now: ["tools/__tests__/zz.test.js :: planted"]` | `reports/after/python-tests.txt`, `reports/after/test-strip-text.txt` (this task's fresh run), `reports/after/npm-compare.txt` |
| P8 | Unpredicted: the June-vintage copies are recorded as found, not built on | recorded as found: on the 2 figures checked (Egeom, IcePack) the June-vintage (PyMuPDF redaction) `_IS.svg` copies do **not** show the fading/lettering-loss the shipped `strip-text.py` rule produces — consistent with the two tools working by different mechanisms. **Population, re-counted for this report** (not carried over from any other document): `ls books/efnafraedi-2e/media/*_IS.svg \| wc -l` → **691**; `find books/efnafraedi-2e/figure-text -name '*.is.json' \| wc -l` → **34** (one per this pipeline's sidecar) → **657** June-vintage copies. The check covered **2 of the 657**; nothing here generalises to the other 655 | `reports/before/june-copies.md`, `reports/before/june-CNX_Chem_07_06_Egeom.png`, `reports/before/june-CNX_Chem_05_02_IcePack.png` |

**All eight predictions met** (P1–P8), with the two precision notes above (P4's 37-vs-38 wording; P5's stronger-than-predicted determinism result) — neither is a failed prediction; both are called out so a reader does not re-derive a wrong "38" or a wrong "undetermined" from this folder later.

## The two controls (P1)

From `reports/after/render-controls.json`, both against combustion's BEFORE render:

- **SERIALISER** (the shipped strip run twice, then diffed against itself): `size_match: true`, shape `[321, 1300, 3]`, `count_gt40: 0`, `count_gt0: 0` — proves the render pipeline itself introduces no drift.
- **PLANTED** (a 20×20 rectangle painted onto a copy of the BEFORE render, then diffed against the unmodified BEFORE render): `count_gt40: 441`, `count_gt0: 441`, bbox `[80, 100, 325, 345]` — proves the diff instrument detects a real, known change of the expected size.

Both controls behaved as required before any BEFORE/AFTER number in this folder is trusted.

A third, independent control exists in Task 3's SVG-arms step: the pre-fix strip run twice (`--twice`) on all six SVG-arms figures gave byte-identical `artwork.svg` each time (`det_before=True` ×6, `reports/before/svg-arms.log`) — the determinism precondition for treating a before→after sha change as a real change rather than noise.

## The mutation proof (Task 2 Step 6)

The committed commit message for `606c835e` (`git log -1 --format=%B 606c835e`) carries only the nine
existing-suite `ALL PASS` lines from Step 7; it does **not** carry Step 6's mutation-testing output. The
committed `test_strip_text.py` (Task 2's TDD suite) is the source of the check labels named below — `1c-page`,
`1c-form`, `1d-page`, `1d-form`, `2c`, `4a`, `6c` are real, named checks in that file.

**The mutation run's own console output is not committed anywhere in this repository.** It exists only in a
task report under `.superpowers/sdd/2026-09-17-c140-c4-strip-keeps-gstate/task-2-report.md`, which is
gitignored (`.superpowers/` — `.gitignore:104`) and does not travel to a clone. Per this task's instructions,
that is stated plainly here rather than presenting the mutation's failure list as if it were traceable to a
file in the evidence folder or the tracked tree.

What the (uncommitted) task report records, for context: applying the brief's mutation (replacing the
two-line block that both appends a kept operator to the output *and* increments its counter with a single
`kept += 0`, restored immediately after via a golden-copy `cmp`) produced **seven** failing checks —
`1c-page`, `1c-form`, `1d-page`, `1d-form`, `2c`, `6c`, and additionally **`4a`** — where the task brief's own
stated expectation named only the first six. The reported reason: the mutation snippet removes the
`out.append(instruction)` call along with the `kept` counter increment, so the persistent-state operator is
dropped from the output stream entirely under the mutation (not merely miscounted) — which is what also
breaks `4a` (`order: the kept rg sits after the earlier rg and before the fill`), an assertion the brief's
expected-failure list did not anticipate. This is recorded here as *what the uncommitted report says*, not as
a number this folder itself measured or can be re-derived from a file inside it.

## Recompose set

`CNX_Chem_04_05_combustion` (efnafraedi-2e, ch04) — the only bought figure whose artwork the fix changes.
`reports/after/recompose-set.txt` names it; `reports/recompose/` holds the recompose transcript, the
`git status --porcelain -- books/` output, the `figparts.py` before/after JSON and comparison, and the
Chromium look (`combustion-look.md`).

## Known limits

- **Census/walk scope.** The census (`../2026-09-16-c4-explore/census/`) and the fixed strip both walk only
  page 1 and every reachable `/Form` — not `/Pattern` resources, annotation appearances, or soft-mask group
  streams. A non-text operator sitting in one of those is neither counted nor refused by anything measured
  here.
- **`.eps`/`.ai` sources are measured after ghostscript staging**, not in their original bytes. Staging can
  rewrite what a text object contains — the census itself found this for N2O5: its native `.pdf` carries
  `k`+`gs` inside BT, its staged `.eps` (what the live pipeline actually reads) carries none. Everything
  measured here about N2O5, and about any other staged figure, describes the staged content.
- **PNG vs SVG determinism (Task 3 Step 5): checked, none found.** The "before" SVG-arms run's `--twice`
  determinism control gave `det=True` for all six figures compared (`reports/before/svg-arms.log`) — the
  pre-fix strip's `artwork.svg` output is deterministic on this box for this set, so no PNG-vs-SVG
  determinism caveat applies to P5's before/after sha comparison.
- **Overprint set inside a text object** is kept by the fixed strip (it is `/OP true` inside a `gs`
  ExtGState, itself in the persistent-state allowlist) and ignored by every renderer this pipeline uses.
  Logged in the campaign register, not built here.
- **`CNX_Chem_18_04_Nanotube`** is a 9th clipping-mode (`7 Tr`) figure found by this build's census, in
  addition to the eight `strip-text.py`'s docstring named before; its sendability is unmeasured. Keeping
  graphics state does not touch the clip mechanism (`7 Tr` is a text operator, dropped as before).
- **June-vintage copies.** Only 2 of 657 non-pipeline `_IS.svg` copies were checked (P8); nothing here
  generalises to the other 655.

## Reproducing

```bash
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1                    # ALL PASS before any figure-run
FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py > /tmp/strip-tests.txt 2>&1
grep -cE '^\s+(PASS|FAIL)\s' /tmp/strip-tests.txt                             # 38
tail -1 /tmp/strip-tests.txt                                                  # ALL PASS

# Nine-suite loop (Task 2 Step 7 / Task 3 Step 6)
for t in test_readlayer.py test_figure_prepare.py test_figure_compose.py test_sendable.py \
         test_sources.py test_make_fixture.py test_figrings.py test_svgfix.py test_strip_text.py; do
  printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs python3 $t 2>&1 | tail -1
done
```

Task 1–4's own commands (corpus render, refusal walk, keys, SVG arms, recompose) are in the task briefs
under `.superpowers/sdd/2026-09-17-c140-c4-strip-keeps-gstate/` (gitignored, not committed) and are not
re-typed a second time here; the instrument scripts that implement them are committed in `instruments/`.
