# Verification — §C140 ⑥a, kept STIX symbols drawn in the official STIX 1.1.0 font (`FigSym`), 0 ISK

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ⑥ and its ⏩ RESUME) and in
> `../../REGISTER.md`. If this document disagrees with `PREDICTIONS.md`, the design or the plan,
> they win, per the rule in the sibling `README.md`. **If this folder disagrees with the campaign
> register, the register wins** (CLAUDE.md § One source of truth) — this folder is evidence, never
> status.
> **Cost of everything here: 0 ISK.** Tasks 1–4 never ran `tools/figure-run.js` or
> `translate-blocks.mjs` — every compose and recount ran the composer's own Python scripts directly
> against a scratch output directory. Task 5's nine `figure-run.js --stale --force` invocations each
> ran after `test_figrings.py` printed `ALL PASS`, against figures that already carry a committed
> sidecar, and each printed `MT spawned for 0 figure(s), 0 billable characters`.

Design: [`docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md)
· plan: [`docs/superpowers/plans/2026-09-17-c140-c6a-stix-regular.md`](../../../../docs/superpowers/plans/2026-09-17-c140-c6a-stix-regular.md) ·
predictions, written before this build's measurement runs: [`PREDICTIONS.md`](PREDICTIONS.md) ·
evidence the design rests on (frozen, a separate earlier folder — read-only exploration, no code):
[`../2026-09-17-c6-explore/README.md`](../2026-09-17-c6-explore/README.md) (its `kerning.md` and
`critic.md` in particular).

Built on `feat/c140-c6a-stix-regular`, stacked on ④'s `feat/c140-c4-strip-keeps-gstate` (PR #476):
Task 1 (baseline recount + predictions, `0e830726`), Task 2 (`figsym.py` + its licence handling,
`4721dd0e`, applying controller ruling R3), Task 3 (the composer draws eligible runs in FigSym,
`b76dfcae`), Task 4 (after-measurements, `cd65c607`), a pin fix (R7, `e554f69c`), Task 5 (recompose,
`c091dd4e`), this task (Task 6, evidence write-up).

## Predictions P1–P8

| # | predicted | measured | file |
|---|---|---|---|
| P1 | On the 34: kept STIX-Regular blocks 42, translated 3 (all in `CNX_Chem_04_04_sandwich`), other STIX faces 0, characters outside the official cmap 0; prep keys identical to ④'s | ✅ `TOTALS: kept_blocks=42 translated_blocks=3 other_face_blocks=0 unique_chars=4 chars_outside_cmap=0` (unique characters drawn: `' '`, `'+'`, `'='`, `'×'`); all 34 figures `byte-identical` against ④'s `reports/after/blocks/` | `reports/before/stix-recount.json`, `reports/before/keys-vs-c4.txt` |
| P2 | For every figure: the same number of `<text>` elements with the same text, x, y, size, weight, style and fill; `font-family` changes from `FigIS` to `FigSym` exactly on the run-exact items drawn from an eligible run, nowhere else; figures with no eligible run: identical text lists, no FigSym face, no metadata | ✅ before/after `texts total: 647` (both counts identical); `other_field_diffs=0` on all 34 rows of `textlist-compare.txt`; the 9 figures with a kept STIX block show `changed_family_count` 6,6,6,8,4,3,4,2,4 (sum **43** changed `<text>` items — see the counting-units note below); the other 25 figures show `changed_family_count=0`, identical faces, no metadata | `reports/after/textlists.json` (647=647), `reports/after/textlist-compare.txt` |
| P3 | A figure with an eligible run gains exactly one `@font-face` for FigSym (400/normal) after its FigIS rules; FigIS rules keep their order; a FigIS face whose only characters moved to FigSym disappears | ✅ two clauses; **third clause not exercised**. Every one of the 9 recompose figures' `faces_after` is its unchanged `faces_before` list with exactly one `{family: FigSym, weight: 400, style: normal}` appended after the existing FigIS rule(s), in the same order (e.g. HClsoln: `FigIS/400/normal, FigIS/400/italic` → `+ FigSym/400/normal`). **"A FigIS face whose only characters moved to FigSym disappears" has 0 instances on this corpus** — every one of the 9 keeps every FigIS face it had; covered on a synthetic fixture instead (`test_svgout.py` case T3, all characters moved to FigSym → face list is exactly `['FigSym']`) | `reports/after/textlist-compare.txt` (`faces_before`/`faces_after` columns) |
| P4 | All 34 after-SVGs parse as XML; every figure with an eligible run carries one `<metadata>` holding the copyright notice, the trademark notice and the pinned licence text; no other figure carries one | ✅ `xml_ok_after=True` on all 34; `metadata_before=False` on all 34; `metadata_after=True` on exactly the 9 recompose figures, `False` on the other 25; `compare_textlists.py` additionally parses a freshly computed `figsym.metadata_element()` with the same `ElementTree` reader `textlist.py` uses and asserts every present `metadata_text` is **byte-equal** to it (stronger than "contains the words") — 0 concerns reported | `reports/after/textlist-compare.txt` |
| P5 | The FigSym subset embedded in every such figure has no forbidden word in name IDs 1–6/16/17/21/22 or the CFF names, and keeps name IDs 0 and 7 and the CFF Notice verbatim | ✅ `reports/after/names.txt` — the embedded FigSym woff2 was extracted by regex from the actual `@font-face` rule in each of the 9 after-SVGs (not re-derived from `figsym.subset_woff2` in isolation, so it checks what actually shipped): all 9 report `violations=[]`, `ids_0_7_notice_match_official=True` — copyright, trademark and CFF Notice are byte-identical to the official STIX 1.1.0 file's | `reports/after/names.txt` |
| P6 | On the figures with an eligible run, the kept STIX glyphs render closer to the source raster after than before; removing the FigSym `@font-face` rule changes the after render | ✅ not marginally — **43 of 43** individual FigSym `<text>` items improved (`raw_improved=N/N` and `glyph_only_improved=N/N` on every one of the 9 figures); **9 of 9** figures show `majority_raw=True`/`majority_glyph=True`; **9 of 9** show `any_norule_differs=True` (the no-rule control: stripping the `@font-face` rule changes the render — a mis-named family does not fall back silently) | `reports/after/chromium-stix.txt`, `reports/after/chromium-look.md` |
| P7 | Only the figures P2 names change under `books/`; for each, the artwork part is byte-identical and the text group differs; `MT spawned for 0 figure(s)`; no sidecar or mapping change | ✅ `git status --porcelain -- books/` lists exactly the 9 recompose-set `_IS.svg` files, all `M`, nothing else; all 9 runs printed `MT spawned for 0 figure(s), 0 billable characters` and `VERDICT ok`; `parts-compare.json`: `all_ok: true`, every row `artwork_same=true textgroup_changed=true` with an unchanged `text_count`; no `figure-text/*.is.json` sidecar or `image-mapping.json` touched | `reports/recompose/git-status-books.txt`, `reports/recompose/CNX_Chem_*.txt` (9 run transcripts), `reports/recompose/parts-compare.json` |
| P8 | Every Python suite prints `ALL PASS`; root vitest failing names equal the baseline by name | ⚠️ **Python: met. Vitest: NOT met on Task 4's own run, but a controller-ruled pin fix (R7) restores it — re-verified fresh in this task (36=36 by name).** See "The vitest collision and its fix" below | `reports/after/python-tests.txt` (16/16 `ALL PASS`); `reports/after/npm-compare.txt` (Task 4's pre-fix 37, unmodified); `reports/after/npm-compare-after-pin-fix.txt` + `reports/after/npm-failing-by-name-after-pin-fix.txt` (this task's post-fix, post-recompose re-run) |

**Counting-units note (P2/P4, flagged in Task 4's review):** Task 1 counts **42 kept STIX
BLOCKS** (`stix-recount.json`, the block unit `figtext.merge_blocks` produces). Task 4 counts **43
changed `<text>` ITEMS** (`textlist-compare.txt`, the run/item unit `compose.py` draws). These are
not a discrepancy: one block can hold more than one run, and `CNX_Chem_04_02_HClsoln`'s single kept
STIX block (`' '`, `'+'`) draws as 2 separate `<text>` items — 42 blocks across the 9 figures yield
43 drawn items. State both, with their units, rather than reconciling them into one number.

**`test_figsym.py` check count:** committed commit `4721dd0e`'s message says "22/22 checks" — this
is **wrong**. A fresh count in this task (`grep -cE '^\s+PASS\s'` over a clean re-run) gives **31**
PASS lines, 0 FAIL, matching the controller's own re-derivation in the SDD ledger (`4 + 10 + 8 + 9`
across the file's four numbered sections). The stated 22 is not recoverable as a correct count of
anything in the committed file; state 31.

## The vitest collision and its fix (P8)

Task 4's first full root vitest run (before the pin fix) showed `now 37 before 36` — one new
failure: `tools/__tests__/figure-text-sidecar.test.js`'s "no Python file in the figure-text tree
reaches for a hashing library". Root cause: `figsym.py` (Task 2) imports `hashlib` and computes
`sha256` digests for the font/licence integrity checks the design's T3/T5 require, which collided
with a pre-existing pin (item ⑰) asserting no `.py` file in `experiments/figure-text-translation/`
reaches for a hashing library at all. The controller ruled this **a pin collision, not a defect**
(R7) and dispatched a fix, amending the pin to allow exactly `figsym.py` and `test_figsym.py` by
name while still asserting those two files contain none of `renderHash`/`composedHash`/
`computeRenderHash` — ⑰'s real invariant (no *sidecar-hash* implementation in Python) stays intact
for them specifically. Commit `e554f69c`; full account in
`.superpowers/sdd/2026-09-17-c140-c6a-stix-regular/pin-fix-report.md` (gitignored, not committed —
cited here for provenance only, per this folder's own rule against citing files that never reach
git; the fix itself is the committed diff to `tools/__tests__/figure-text-sidecar.test.js`).

**This task re-ran the full root vitest fresh, on top of Task 5's recompose (`c091dd4e`), to verify
the fix on the actual final tree** — the pin fix's own commit only re-ran the one affected test
file, not the whole suite:

```
vitest JSON: numTotalTestSuites=1823 numTotalTests=6544 numPassedTests=6507 numFailedTests=36 numFailedTestSuites=37 success=false
test files in JSON: 407
now 36 before 36
only-now []
only-before []
files that died without a failing test: []
CONTROL planted shows as only-now: ["tools/__tests__/zz.test.js :: planted"]
```

**36 = 36 by name, `only-now []`, `only-before []`, `files that died without a failing test: []`, and
the planted-name control fires correctly (`zz.test.js :: planted` shows as only-now, proving the
comparator would actually detect a real new failure). P8's vitest half is MET on this run.**
`numPassedTests` 6507 — one more than Task 4's own before-pin-fix run (`numPassedTests=6505`),
consistent with the one collision failure being resolved rather than merely hidden. A byte diff of
`reports/before/npm-failing-by-name.txt` against this run's
`reports/after/npm-failing-by-name-after-pin-fix.txt` shows **no difference** — the 36 failing names
are identical, not merely equal in count. **State plainly: Task 4's own run showed 37 failing names
(one new, the pin collision) before the pin fix; this task's fresh re-run, after the pin fix and
after Task 5's recompose, shows 36 — the unmodified baseline — because the fix narrows the pin's
predicate rather than removing a real defect.** Neither number is wrong for what it measured; they
describe the tree at two different commits. (`numTotalTests` also ticked up by one, 6543→6544,
because the pin fix itself added one new test — "the allowlisted files still implement no sidecar
hash, even though they hash" — which passes.)

## Controls

- **The rename mutation (Task 2, commit `4721dd0e`'s message).** Replacing `figsym.py`'s CFF
  rename (`cff.fontNames = ['FigSym-Regular']`) with a no-op made `subset_woff2` raise
  `FontUnavailable: renamed subset still names a reserved name or word: ['CFF fontNames:
  STIXGeneral-Regular']` — the self-check catching the mutation and naming the exact surviving
  reserved string. Golden-copy restore verified byte-identical by `cmp` afterward. This is the
  positive control for P5 (`test_figsym.py` section [3]'s check 3f is the same assertion run
  against the **official, unrenamed** font directly: `3f CONTROL — the unrenamed official font DOES
  violate: ['name ID 1 …STIXGeneral', 'name ID 3 …', 'name ID 4 …STIXGeneral-Regular', 'name ID 6
  …STIXGeneral-Regular']`).
- **The no-rule Chromium control (Task 4, P6).** For every one of the 9 recompose figures,
  `chromium_stix.py` renders a fourth arm — the after-SVG with its `FigSym` `@font-face` rule
  surgically removed (asserting exactly one such rule was present to remove) — and diffs it against
  the same source crop. `any_norule_differs=True` on all 9: removing the rule visibly changes the
  render (the browser falls back to a substitute font, not silently reproducing the FigSym look),
  which is what makes P6's "the family is really used" claim checkable rather than assumed.
- **The missing-font negative arm.** Two independent instruments exercise this: `test_figsym.py`
  1c/1d (a wrong-hash file and a missing file are both REFUSED, naming the reason) and
  `test_compose_runexact.py`'s R7 (with `FIGTEXT_STIX_FONT` pointed at a nonexistent path, a fresh
  `compose.py --control --svg` on `CNX_Chem_04_02_HClsoln` exits non-zero — an uncaught
  `figsym.FontUnavailable` — and writes no `compose-report.json`; the whole script dies before
  producing a report, exactly as the design requires so a figure with an eligible run is never
  silently composed without its promised font).

## Known limits

- **Only the STIX Regular face was ever compared against the official 1.1.0 file** (ruling T2/T3).
  Italic, Bold and BoldItalic STIX runs are unchanged (drawn in Liberation, as before) and are
  **counted, not converted** — `stix-recount.json`'s `other_face_blocks=0` on all 34, because the
  34 bought figures happen to use no non-Regular STIX face; the corpus at large does (338 Italic,
  58 Bold, 48 BoldItalic blocks) → campaign register §C140 ㉞.
- **The 3 translated STIX blocks (all in `CNX_Chem_04_04_sandwich`) stay in Liberation/FigIS.** Per
  ruling T2, only kept run-exact runs are eligible; `sandwich`'s row in `textlist-compare.txt` shows
  `changed_family_count=0` — a visible inconsistency inside that one figure (its `+`/`=` are
  drawn in STIX-shaped Liberation glyphs, not the real STIX 1.1.0), logged, not fixed here.
- **Firefox and WebKit are not measured.** Only Chromium (Playwright, `<img>`-sandboxed via
  `render-check.mjs`, the same route `cnxml-render.js` publishes through) was on this box.
- **`translated.png` (the cairo raster path) stays Liberation Sans.** `compose.py`'s
  `ctx.select_font_face` call is unchanged — cairo's toy font API cannot load an uninstalled STIX
  font — and nothing in `tools/` or `server/` reads that PNG, so this has no reader-visible
  consequence (confirmed unchanged in Task 3's report).
- **The Chromium crop box is a simple font-size-derived heuristic** and clips a neighbouring glyph
  on 2 of 4 `CNX_Chem_14_03_FishLemon` rows (`reports/after/chromium-look.md`) — cosmetic only; each
  crop is compared to itself across the four render arms, so a consistent clip cancels out of the
  reported numbers.
- **`textlist.py`/`compare_textlists.py` use stdlib `xml.etree.ElementTree`** (flagged by an
  automated security-review hook for XXE in general) — same precedent as ④'s build: these scripts
  parse only this pipeline's own generated SVGs and `figsym`'s own generated `<metadata>` string,
  never attacker-controlled input; not changed.
- **STIX Italic/Bold/BoldItalic and the 6 TrueType STIX objects are unmeasured against the official
  files** → campaign register §C140 ㉞ — before buying resumes beyond ch03/ch04.
- **Per-run kerning (⑥b) is a separate, unruled item** (design ruling T1) → campaign register
  §C140 ㉝. STIX 1.1.0 has 0 kern pairs among the 4 characters this build draws, so the two halves
  do not interact.

## Recompose set

**9 figures** — every figure with `kept_blocks > 0` in `reports/before/stix-recount.json`
(`CNX_Chem_04_04_sandwich`, 0 kept / 3 translated, is correctly excluded):
`CNX_Chem_03_01_alsulfatemass_img`, `CNX_Chem_03_01_aspirin`, `CNX_Chem_03_01_chloroform`,
`CNX_Chem_03_01_glycinemass_img`, `CNX_Chem_03_01_saltMass`, `CNX_Chem_04_01_basehyd_img`,
`CNX_Chem_04_01_rxn2`, `CNX_Chem_04_02_HClsoln`, `CNX_Chem_14_03_FishLemon` — all efnafraedi-2e,
ch03/ch04. `reports/after/recompose-set.txt` names it; `reports/recompose/` holds the 9 run
transcripts, the `git status --porcelain -- books/` output, `figparts.py`'s before/after JSON and
comparison, the recomposed textlists (with the licence `<metadata>` confirmed present in the
**published** files, not just the scratch compose — `metadata: True` on all 9 in
`textlists-recomposed.json`), and the Chromium look (`look.md`, two renders).

## Reproducing

```bash
cd experiments/figure-text-translation

# Task 1 — baseline recount (worktree at ④'s head ff00d5fb)
python3 -u evidence/2026-09-17-c6a-build/instruments/compose34.py --out <scratch>/before
python3 evidence/2026-09-17-c6a-build/instruments/textlist.py <scratch>/before/work/*/translated.svg \
  > evidence/2026-09-17-c6a-build/reports/before/textlists.json
python3 evidence/2026-09-17-c6a-build/instruments/stix_recount.py   # writes stix-recount.json, keys-vs-c4.txt

# Task 4 — after measurements (current tree)
python3 -u evidence/2026-09-17-c6a-build/instruments/compose34.py --out <scratch>/after
python3 evidence/2026-09-17-c6a-build/instruments/textlist.py <scratch>/after/work/*/translated.svg \
  > evidence/2026-09-17-c6a-build/reports/after/textlists.json
python3 evidence/2026-09-17-c6a-build/instruments/compare_textlists.py   # P2/P3/P4/P5
python3 evidence/2026-09-17-c6a-build/instruments/chromium_stix.py       # P6

FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1   # ALL PASS before any figure-run
# ... (16-suite loop, see README.md)

# Task 5 — recompose (foreground, one figure at a time)
cd ../..
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure <basename> --stale --force

# Task 6 — vitest re-run after the R7 pin fix (this task)
npx vitest run --reporter=json --outputFile=<scratch>/vitest-after-pin.json
node evidence/2026-09-17-c6a-build/instruments/npm_compare_after_pin_fix.cjs <scratch>/vitest-after-pin.json
```

Full per-task command sequences (with exact scratch paths) are in the task briefs under
`.superpowers/sdd/2026-09-17-c140-c6a-stix-regular/` — gitignored, not committed, and not re-typed a
second time here; the instrument scripts that implement them are what is committed, in
`instruments/`.
