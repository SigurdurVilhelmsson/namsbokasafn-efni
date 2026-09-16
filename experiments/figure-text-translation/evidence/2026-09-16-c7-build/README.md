# Evidence — §C140 ⑦, spend gates: glyphs every reader misreads, production pages resolved as figures — build, 2026-09-16

> 🧊 **FROZEN, 2026-09-16.** Cited, never synced. Open work and status live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ⑦ and its ⏩ RESUME) and in
> `../../REGISTER.md` (the "driver spend gate" component row). **This folder carries no status verbs.**
> **0 ISK** — `test_figrings.py` printed `ALL PASS` before the one `figure-run.js` invocation batch,
> every `figure-run.js` call ran `--dry-run`, and `git status --porcelain -- books/` was empty both
> before Task 1's baseline and after this run.

Built on `feat/c140-c7-spend-gates`, Tasks 1–8. Design:
[`docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md`](../../../../docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md)
(this folder is its § 6) · plan: [`docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md`](../../../../docs/superpowers/plans/2026-09-16-c140-c7-spend-gates.md) ·
evidence this design rests on (a separate, earlier frozen folder — measurements only, no code):
[`../2026-09-16-c7-explore/`](../2026-09-16-c7-explore/README.md).

**If this folder disagrees with a file it cites, the file wins.** If it disagrees with the campaign
register, **the register wins** (per CLAUDE.md § One source of truth) — this folder is evidence, never
status.

## What the folder holds

- [`PREDICTIONS.md`](PREDICTIONS.md) — written before any Task-8 measurement, amended (never overwritten)
  if a run disagreed with a prediction. It did not need to be.
- [`VERIFICATION.md`](VERIFICATION.md) — the P1–P10 table: predicted, measured, and the exact file the
  number came from.
- `instruments/prepare_corpus.py` — the one script both the before- and after-runs share: it re-prepares
  the 34 bought figures plus the 4 hazard figures (PentIso, Amontons2, rvosmosis, N2O5) through
  `figure-prepare.py`, hashing each `blocks.json` and copying it into `reports/<label>/blocks/`. It works
  against both the pre- and post-change `sources.py` (uses `resolve_detail` when the function exists, else
  falls back to `resolve`), because the same instrument runs on both sides of the diff.
- `reports/before/` — the baseline, taken on `main` before any ⑦ code existed: `summary.tsv`,
  `blocks/*.blocks.json`, five dry-run chapter transcripts (ch05, ch09, ch10, ch11, ch18),
  `python-tests.txt` (5 suites, `test_make_fixture.py` did not exist yet), `npm-failing-by-name.txt` (36
  names) and `run.log`.
- `reports/after/` — the same instrument and the same five chapters, run on `feat/c140-c7-spend-gates`
  after Tasks 2–7 landed: `summary.tsv`, `blocks/*.blocks.json`, `dry-ch{5,9,10,11,18}.txt`, `dry-exit.txt`,
  `python-tests.txt` (6 suites — `test_make_fixture.py` is new on this branch), `npm-failing-by-name.txt`
  and `run.log`.

## Commands — Task 1 (baseline) and Task 8 (this run)

```bash
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1        # ALL PASS before any figure-run
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-16-c7-build/instruments/prepare_corpus.py --label <before|after> \
  > evidence/2026-09-16-c7-build/reports/<before|after>/run.log 2>&1
cd ../..
A=experiments/figure-text-translation/evidence/2026-09-16-c7-build/reports/<before|after>
for ch in 5 9 10 11 18; do node tools/figure-run.js --book efnafraedi-2e --chapter $ch --dry-run > $A/dry-ch$ch.txt 2>&1; done
git status --porcelain -- books/                                   # expect: empty

# Python suites (never in CI — run and record ALL PASS by hand)
for t in test_readlayer.py test_figure_prepare.py test_sources.py test_sendable.py test_figure_compose.py test_make_fixture.py; do
  printf '%s: ' $t; FIGTEXT_PYLIBS=./pylibs python3 $t 2>&1 | tail -1
done

# Full root npm test, compared BY NAME with the baseline (see VERIFICATION.md P10 for the diff script)
npx vitest run --reporter=json --outputFile=/tmp/vitest.json
```

The full P1–P9 check script (parses `summary.tsv`, greps the dry-run transcripts) and the P10 by-name
diff script (with its planted-name positive control) are in the task brief
(`.superpowers/sdd/2026-09-16-c140-c7-spend-gates/task-8-brief.md`) and in `VERIFICATION.md`'s
"Reproducing" section; not duplicated a third time here.

## Limits

Copied from the design's § 8 — its owner; not restated elsewhere in this repo:

- The page signal sees only standard paper sizes; a production page saved at a non-standard size is
  invisible to it. Measured instances: 0.
- The repair table knows 3 glyph names; any other fails closed and ships that glyph unbought and undrawn.
- Native TrueType fonts cannot be checked by glyph name (1,088 of 1,092 use `post` format 3); their safety
  rests on the `(3,1)` cmap argument in the evidence, not a per-glyph measurement.
- Python tests are not in CI.
