# Verification — §C140 ⑦, spend gates, 0 ISK

> 🧊 **FROZEN, 2026-09-16.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ⑦ and ⏩ RESUME) and in
> `../../REGISTER.md`. If this document disagrees with `PREDICTIONS.md`, the design or the plan,
> they win, per the rule in the sibling `README.md`.
> **Cost of everything here: 0 ISK.** `test_figrings.py` printed `ALL PASS` before the one
> `figure-run.js` invocation batch, and every batch ran `--dry-run` — `git status --porcelain --
> books/` was empty both before Task 1's baseline and after this run.

Design: [`docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md`](../../../../docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md)
(§6 is the plan this folder executes) · plan: [`docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md`](../../../../docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md) ·
predictions, written before this task's code existed: [`PREDICTIONS.md`](PREDICTIONS.md).

## Predictions P1–P10

| # | predicted | measured | file |
|---|---|---|---|
| P1 | All 34 bought figures: `blocks.json` sha256 identical before/after; `glyphRepairs` empty for all 34 | ✅ `P1 bought 34 blocks moved: [] ; repairs in bought: []` — every bought basename's `blocks_sha256` column is unchanged and its after-row `glyphRepairs` is `null` | `reports/before/summary.tsv`, `reports/after/summary.tsv` |
| P2 | PentIso after: 3 blocks read `boiling point: 36 °C` / `27 °C` / `9.5 °C`, still `send:true`; `glyphRepairs [{glyph: H11034, to: °, count: 3}]` | ✅ after-row: `ok`, 6 blocks, 6 sendable, `glyphRepairs [{"glyph": "H11034", "to": "°", "count": 3}]`; the three blocks' `english` reads `'n-pentane boiling point: 36 °C'`, `'isopentane boiling point: 27 °C'`, `'neopentane boiling point: 9.5 °C'`, each `send=True`. **Positive control:** the before-row (pre-repair) blocks hold the literal unrepaired `36 8C` / `27 8C` / `9.5 8C` | `reports/after/summary.tsv`, `reports/after/blocks/CNX_Chem_10_01_PentIso.blocks.json`, `reports/before/blocks/CNX_Chem_10_01_PentIso.blocks.json` |
| P3 | Amontons2 after: blocks `−100` and `−50`, `send:false`; `glyphRepairs [{glyph: H11002, to: −, count: 2}]` | ✅ after-row `glyphRepairs [{"glyph": "H11002", "to": "−", "count": 2}]`; blocks `'−100'` and `'−50'` both `send=False`. **Positive control:** the before-row (pre-repair) blocks hold the literal unrepaired `'2100'` and `'250'` | `reports/after/summary.tsv`, `reports/after/blocks/CNX_Chem_09_02_Amontons2.blocks.json`, `reports/before/blocks/CNX_Chem_09_02_Amontons2.blocks.json` |
| P4 | rvosmosis after: refused `production-page` (Letter 612×792); not prepared | ✅ after-row `status=refused:production-page`, no artwork/blocks recorded; dry ch11 prints `⚠️ REFUSED — production page: CNX_Chem_11_04_rvosmosis  …/CNX_Chem_11_04_rvosmosis.pdf  612×792 pt (Letter)` | `reports/after/summary.tsv`, `reports/after/dry-ch11.txt` |
| P5 | N2O5 after: resolves to `CNX_Chem_18_07_N2O5.eps`; prepares to 7 verbatim blocks, 0 sendable | ✅ after-row `artwork=…/CNX_Chem_18_07_N2O5.eps`, `status=ok`, `blocks=7`, `sendable=0` | `reports/after/summary.tsv` |
| P6 | dry ch11 after: rvosmosis under `REFUSED — production page` and a still-mapped line naming `CNX_Chem_11_04_rvosmosis_IS.svg`; not in the "hole" list | ✅ both lines present (`⚠️ readers still see an earlier translated copy of CNX_Chem_11_04_rvosmosis: media/CNX_Chem_11_04_rvosmosis_IS.svg (mapping row present) — refusing does not retire it`); the "hole" list names 5 figures (`HeArsol`, `electrolyt`, `bromine`, `deice`, `Cottrellp`) and rvosmosis is **not** among them — `6 unresolved` = 5 holes + 1 refusal | `reports/after/dry-ch11.txt` |
| P7 | dry ch18 after: N2O5 `copied-photo`; no refusal | ✅ `copied-photo chars=7 formText=0 images=2 paint=0 held=7v/0u/0f  CNX_Chem_18_07_N2O5`; no `REFUSED` line anywhere in the file. ⚠️ **Design-scope note, not a P7 failure:** the design's own § 6.3 additionally expected a "still-mapped line" here. § 3.5 gates that line on a figure being *refused*, and N2O5 is not — it resolves cleanly to its EPS — so no still-mapped line fires for it, by the design's own rule, not by a bug. `CNX_Chem_18_07_N2O5_IS.svg` (the live June sheet) is therefore **not** named anywhere in this run's output, unlike rvosmosis's | `reports/after/dry-ch18.txt` |
| P8 | dry ch10 after: `glyphs repaired by the read layer` names PentIso 3× H11034 → °; the would-buy list includes PentIso | ✅ `glyphs repaired by the read layer — misread without a ToUnicode map (1): CNX_Chem_10_01_PentIso  3× H11034 → °`; would-buy list carries `CNX_Chem_10_01_PentIso  6 block(s), 202 chars` | `reports/after/dry-ch10.txt` |
| P9 | dry ch05 (control) after: no refusal, no glyph section; would-buy figures = its `translated` figures with no sidecar | ✅ no `REFUSED`, `glyphs repaired` or `glyphs NOT repaired` line anywhere in the file; summary reports `16 translated`, the would-buy list names exactly 16 figures, and none of the 16 (nor any other ch05 figure) has a `.is.json` sidecar under `books/efnafraedi-2e/figure-text/` (only ch03/ch04/ch14 figures do) | `reports/after/dry-ch5.txt` |
| P10 | Full `npm test`: the failing names equal the 36 before-names, both directions | ✅ `now 36 before 36`; `only-now []`, `only-before []`; `files that died without a failing test: []`; planted control `tools/__tests__/zz.test.js :: planted` correctly surfaces as only-now, proving the diff itself is not vacuous. Python: `test_readlayer.py`, `test_figure_prepare.py`, `test_sources.py`, `test_sendable.py`, `test_figure_compose.py`, `test_make_fixture.py` all `ALL PASS` | `reports/after/npm-failing-by-name.txt`, `reports/before/npm-failing-by-name.txt`, `reports/after/python-tests.txt` |

**All ten predictions met.** ⚠️ **Scope note on P10's Python half:** the baseline (`reports/before/python-tests.txt`,
Task 1) ran 5 files — `test_make_fixture.py` did not exist yet when the baseline was taken. The after-run
(this task) runs the 6 files the brief names; the 6th is a new addition on this branch (Task 6), not a
baseline regression — there is no "before" line to compare it against.

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

Copied from the design's § 8 — its owner; not restated elsewhere:

- The page signal sees only standard paper sizes; a production page saved at a non-standard size is
  invisible to it. Measured instances: 0.
- The repair table knows 3 glyph names; any other fails closed and ships that glyph unbought and undrawn.
- Native TrueType fonts cannot be checked by glyph name (1,088 of 1,092 use `post` format 3); their safety
  rests on the `(3,1)` cmap argument in the evidence, not a per-glyph measurement.
- Python tests are not in CI.
