# Verification — §C140 ⑦, spend gates, 0 ISK

> 🧊 **FROZEN, 2026-09-16.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ⑦ and ⏩ RESUME) and in
> `../../REGISTER.md`. If this document disagrees with `PREDICTIONS.md`, the design or the plan,
> they win, per the rule in the sibling `README.md`.
> **Cost of everything here: 0 ISK.** `test_figrings.py` printed `ALL PASS` before each
> `figure-run.js` invocation batch (Task 8's, and the fix wave's below), and every batch ran
> `--dry-run` — `git status --porcelain -- books/` was empty both before Task 1's baseline and after
> each run.

Design: [`docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md`](../../../../docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md)
(§6 is the plan this folder executes) · plan: [`docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md`](../../../../docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md) ·
predictions, written before this task's code existed: [`PREDICTIONS.md`](PREDICTIONS.md).

## Predictions P1–P10

| # | predicted | measured | file |
|---|---|---|---|
| P1 | All 34 bought figures: `blocks.json` sha256 identical before/after; `glyphRepairs` empty for all 34 | ✅ `P1 bought 34 blocks moved: [] ; repairs in bought: []` — every bought basename's `blocks_sha256` column is unchanged and its after-row `glyphRepairs` is `[]` — only the before-rows hold `null`, because `instruments/prepare_corpus.py` writes `null` for a `prepare.json` with no such field (corrected in the fix wave: this cell said the after-rows held `null`) | `reports/before/summary.tsv`, `reports/after/summary.tsv` |
| P2 | PentIso after: 3 blocks read `boiling point: 36 °C` / `27 °C` / `9.5 °C`, still `send:true`; `glyphRepairs [{glyph: H11034, to: °, count: 3}]` | ✅ after-row: `ok`, 6 blocks, 6 sendable, `glyphRepairs [{"glyph": "H11034", "to": "°", "count": 3}]`; the three blocks' `english` reads `'n-pentane boiling point: 36 °C'`, `'isopentane boiling point: 27 °C'`, `'neopentane boiling point: 9.5 °C'`, each `send=True`. **Positive control:** the before-row (pre-repair) blocks hold the literal unrepaired `36 8C` / `27 8C` / `9.5 8C` | `reports/after/summary.tsv`, `reports/after/blocks/CNX_Chem_10_01_PentIso.blocks.json`, `reports/before/blocks/CNX_Chem_10_01_PentIso.blocks.json` |
| P3 | Amontons2 after: blocks `−100` and `−50`, `send:false`; `glyphRepairs [{glyph: H11002, to: −, count: 2}]` | ✅ after-row `glyphRepairs [{"glyph": "H11002", "to": "−", "count": 2}]`; blocks `'−100'` and `'−50'` both `send=False`. **Positive control:** the before-row (pre-repair) blocks hold the literal unrepaired `'2100'` and `'250'` | `reports/after/summary.tsv`, `reports/after/blocks/CNX_Chem_09_02_Amontons2.blocks.json`, `reports/before/blocks/CNX_Chem_09_02_Amontons2.blocks.json` |
| P4 | rvosmosis after: refused `production-page` (Letter 612×792); not prepared | ✅ after-row `status=refused:production-page`, no artwork/blocks recorded; dry ch11 prints `⚠️ REFUSED — production page: CNX_Chem_11_04_rvosmosis  …/CNX_Chem_11_04_rvosmosis.pdf  612×792 pt (Letter)` | `reports/after/summary.tsv`, `reports/after/dry-ch11.txt` |
| P5 | N2O5 after: resolves to `CNX_Chem_18_07_N2O5.eps`; prepares to 7 verbatim blocks, 0 sendable | ✅ after-row `artwork=…/CNX_Chem_18_07_N2O5.eps`, `status=ok`, `blocks=7`, `sendable=0` | `reports/after/summary.tsv` |
| P6 | dry ch11 after: rvosmosis under `REFUSED — production page` and a still-mapped line naming `CNX_Chem_11_04_rvosmosis_IS.svg`; not in the "hole" list | ✅ both lines present (`⚠️ readers still see an earlier translated copy of CNX_Chem_11_04_rvosmosis: media/CNX_Chem_11_04_rvosmosis_IS.svg (mapping row present) — refusing does not retire it`); the "hole" list names 5 figures (`HeArsol`, `electrolyt`, `bromine`, `deice`, `Cottrellp`) and rvosmosis is **not** among them — `6 unresolved` = 5 holes + 1 refusal | `reports/after/dry-ch11.txt` |
| P7 | dry ch18 after: N2O5 `copied-photo`; no refusal | ✅ `copied-photo chars=7 formText=0 images=2 paint=0 held=7v/0u/0f  CNX_Chem_18_07_N2O5`; no `REFUSED` line anywhere in the file. ⚠️ **Not a P7 failure, but a gap — not design:** the design's § 6.3 also expected this run to name N2O5's live June copy. § 3.5 keys its still-mapped line on a *refusal*, and N2O5 is no longer refused (it resolves to its EPS), so this Task 8 run did **not** name `CNX_Chem_18_07_N2O5_IS.svg` — § 3.5 and ruling S1 could not both be met on N2O5. The fix wave names every live translated copy whose viewBox is a paper size, whatever the figure's outcome, and N2O5's sheet is now named: see P11 below (corrected in the fix wave: this cell called the gap "by the design's own rule, not by a bug") | `reports/after/dry-ch18.txt` |
| P8 | dry ch10 after: `glyphs repaired by the read layer` names PentIso 3× H11034 → °; the would-buy list includes PentIso | ✅ `glyphs repaired by the read layer — misread without a ToUnicode map (1): CNX_Chem_10_01_PentIso  3× H11034 → °`; would-buy list carries `CNX_Chem_10_01_PentIso  6 block(s), 202 chars` | `reports/after/dry-ch10.txt` |
| P9 | dry ch05 (control) after: no refusal, no glyph section; would-buy figures = its `translated` figures with no sidecar | ✅ no `REFUSED`, `glyphs repaired` or `glyphs NOT repaired` line anywhere in the file; summary reports `16 translated`, the would-buy list names exactly 16 figures, and none of the 16 (nor any other ch05 figure) has a `.is.json` sidecar under `books/efnafraedi-2e/figure-text/` — the listing holds 34 sidecars, 15 ch03, 18 ch04 and 1 ch14, and no ch05 name. The dry-run transcript holds no sidecar information; the listing was taken in the fix wave, and this branch changes nothing under `books/` (corrected in the fix wave: this cell cited only the transcript) | `reports/after/dry-ch5.txt`, `reports/after-fix/sidecars.txt` |
| P10 | Full `npm test`: the failing names equal the 36 before-names, both directions | ✅ `now 36 before 36`; `only-now []`, `only-before []` — the two committed lists are identical. ⚠️ For this Task 8 run, `files that died without a failing test: []` and the planted control (`tools/__tests__/zz.test.js :: planted` surfacing as only-now) were printed to the **console only**; neither committed `npm-failing-by-name.txt` holds them. The fix-wave run writes both, with the name lists, to `reports/after-fix/npm-compare.txt` — see P15 (corrected in the fix wave: this cell cited the two name lists for results they do not contain). Python: `test_readlayer.py`, `test_figure_prepare.py`, `test_sources.py`, `test_sendable.py`, `test_figure_compose.py`, `test_make_fixture.py` all `ALL PASS` | `reports/after/npm-failing-by-name.txt`, `reports/before/npm-failing-by-name.txt`, `reports/after/python-tests.txt` |

**All ten predictions met** (P1–P10; the fix wave's P11–P15 are below). ⚠️ **Scope note on P10's Python half:** the baseline
(`reports/before/python-tests.txt`, Task 1) ran 5 files and the after-run ran 6. The 6th,
`test_make_fixture.py`, is **not** new on this branch: it was added in `d372419a` (M5 Task 2a), exists at
the branch start `ceadeca6`, and this branch leaves it untouched. Task 1's baseline simply did not run it,
so there is no "before" line to compare it against (corrected in the fix wave: this note said the file did
not exist yet and was new on this branch).

## Fix wave — final review, 2026-09-16

The final whole-branch review found that the Task 8 run named only one of the two live June whole-sheet
copies (P7's note). The fix wave names **every** live translated copy whose viewBox is a paper size, whatever
the run decides about the figure, and moves the paper-size table into `../../figure-text.config.json` as its
single owner. Predictions P11–P15 were committed before any fix-wave code or run (`PREDICTIONS.md` § Amendment — fix wave). Every file below is in
`reports/after-fix/`. **0 ISK:** `test_figrings.py` printed `ALL PASS` on the console before the prepare and
dry-run batch (not captured to a file), every `figure-run.js` call ran `--dry-run`, and
`git status --porcelain -- books/` was empty after the runs (`books-status.txt`).

| # | predicted | measured | file |
|---|---|---|---|
| P11 | dry ch18: the run names `CNX_Chem_18_07_N2O5_IS.svg` as a live translated copy that is a whole Letter sheet (612×792) | ✅ `⚠️ live translated copies that are a whole paper-size sheet, not a figure (1) — this run does not retire them; a publication step does:` then `media/CNX_Chem_18_07_N2O5_IS.svg  612×792 pt (Letter)  mapping row present  CNX_Chem_18_07_N2O5`. The only change against Task 8's transcript is those two lines | `reports/after-fix/dry-ch18.txt`, `reports/after-fix/dry-diff-vs-after.txt` |
| P12 | dry ch11: the run names `CNX_Chem_11_04_rvosmosis_IS.svg` the same way, and still prints its `REFUSED — production page` line and its still-mapped line | ✅ the same section names `media/CNX_Chem_11_04_rvosmosis_IS.svg  612×792 pt (Letter)  mapping row present  CNX_Chem_11_04_rvosmosis`; the `⚠️ REFUSED — production page: CNX_Chem_11_04_rvosmosis …  612×792 pt (Letter)` line and the `⚠️ readers still see an earlier translated copy of CNX_Chem_11_04_rvosmosis: media/CNX_Chem_11_04_rvosmosis_IS.svg (mapping row present) — refusing does not retire it` line are unchanged. The only change against Task 8's transcript is the two sheet lines | `reports/after-fix/dry-ch11.txt`, `reports/after-fix/dry-diff-vs-after.txt` |
| P13 | dry ch05, ch09, ch10 (controls): no sheet line | ✅ 0 lines naming a paper-size sheet or an unreadable viewBox in each; all three transcripts are identical to Task 8's. **Population control:** over every `*_IS.svg` under `books/*/media/` the shipped classifier finds 692 files, 2 paper-size sheets — exactly rvosmosis and N2O5, both `612×792 pt (Letter)` — and 0 copies whose viewBox could not be read | `reports/after-fix/dry-ch{5,9,10}.txt`, `reports/after-fix/dry-diff-vs-after.txt`, `reports/after-fix/sheet-census.txt` (`instruments/sheet_census.mjs`) |
| P14 | the resolver/prepare change moves nothing: `prepare_corpus.py --label after-fix` writes a `summary.tsv` byte-identical to `reports/after/summary.tsv` | ✅ `cmp` exit 0; and all 37 `blocks/*.blocks.json` compared, 0 differing, same name set | `reports/after-fix/summary-identity.txt`, `reports/after-fix/summary.tsv`, `reports/after-fix/run.log` |
| P15 | full `npm test`: failing names identical to `reports/before/npm-failing-by-name.txt`, both directions, with a planted control, and no file that died without a failing test | ✅ `now 36 before 36`; `only-now []`; `only-before []`; `files that died without a failing test: []`; `CONTROL planted shows as only-now: ["tools/__tests__/zz.test.js :: planted"]` | `reports/after-fix/npm-compare.txt` (`instruments/npm_compare.cjs`), `reports/after-fix/npm-failing-by-name.txt` |

**All five fix-wave predictions met.** Python, the same six suites as P10: every line `ALL PASS`
(`reports/after-fix/python-tests.txt`).

Reproducing the fix wave (the Task 8 commands in `reports/task-8-brief.md`, with `--label after-fix`):

```bash
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1        # ALL PASS before any figure-run
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-16-c7-build/instruments/prepare_corpus.py --label after-fix \
  > evidence/2026-09-16-c7-build/reports/after-fix/run.log 2>&1
cd ../..
A=experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after-fix
for ch in 5 9 10 11 18; do node tools/figure-run.js --book efnafraedi-2e --chapter $ch --dry-run > $A/dry-ch$ch.txt 2>&1; echo "ch$ch exit=$?" >> $A/dry-exit.txt; done
npx vitest run --reporter=json --outputFile=<scratch>/c7-vitest-after-fix.json
node experiments/figure-text-translation/evidence/2026-09-16-c7-build/instruments/npm_compare.cjs <scratch>/c7-vitest-after-fix.json
node experiments/figure-text-translation/evidence/2026-09-16-c7-build/instruments/sheet_census.mjs > $A/sheet-census.txt
find books/efnafraedi-2e/figure-text -name '*.is.json' | sort > $A/sidecars.txt
```

## The two hazards, before → after, at a glance

| | before | after |
|---|---|---|
| PentIso (ch10) | `36 8C` / `27 8C` / `9.5 8C`, all `send:true` — would have been **bought wrong** | `36 °C` / `27 °C` / `9.5 °C`, all `send:true`, 3 repairs named |
| Amontons2 (ch09) | `2100` / `250`, `send:false` — wrong text still **drawn** into the composed figure | `−100` / `−50`, `send:false`, 2 repairs named |
| rvosmosis (ch11) | resolved to the Letter-size Art Dialogue Sheet — a paid run would have bought sheet chrome and composed a whole page | refused `production-page`; nothing bought; the still-live June `_IS.svg` named as not retired |
| N2O5 (ch18) | resolved to the Letter-size InDesign placement page | resolves to its real EPS, `copied-photo`, 0 sendable |

## Reproducing

```bash
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1        # ALL PASS before any figure-run
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-16-c7-build/instruments/prepare_corpus.py --label after \
  > evidence/2026-09-16-c7-build/reports/after/run.log 2>&1
cd ../..
A=experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/after
for ch in 5 9 10 11 18; do node tools/figure-run.js --book efnafraedi-2e --chapter $ch --dry-run > $A/dry-ch$ch.txt 2>&1; done
git status --porcelain -- books/                                   # expect: empty
```

The Step-3 test-suite commands and the P1–P9 check script are in the task brief, committed
byte-exact here because `.superpowers/` is gitignored and would not travel to a clone:
[`reports/task-8-brief.md`](reports/task-8-brief.md). Not restated a second time in this file.

## Limits

The one Limits block for this folder (`README.md` points here). The design's § 8 owns the first four; the
fifth is this verification's own. Numbers measured in another evidence folder are not restated here.

- The page signal sees only standard paper sizes; a production page saved at a non-standard size is
  invisible to it — both the resolver's refusal and the fix wave's sheet naming.
- The repair table knows 3 glyph names; any other fails closed and ships that glyph unbought and undrawn.
- Native TrueType fonts cannot be checked by glyph name; their safety rests on the `(3,1)` cmap argument,
  not a per-glyph measurement — the counts are in the design's § 8.
- Python tests are not in CI.
- The shipped `_unmapped_glyphs` detector was **not** re-run over the corpus font census behind the design's
  § 2.1, so the design's § 6.2 first half ("the corpus census still finds exactly the 4 font records") has
  no prediction and no row here. Its effects are covered by P1–P3 and the five dry runs (added in the fix
  wave).
