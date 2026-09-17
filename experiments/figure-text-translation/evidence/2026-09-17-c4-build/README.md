# Evidence — §C140 ④, `strip-text.py` keeps graphics state inside text objects — build, 2026-09-17

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Open work and status live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ④ and its ⏩ RESUME) and in
> `../../REGISTER.md`. **This folder carries no status verbs.**
> **0 ISK** — `test_figrings.py` printed `ALL PASS` before the one `figure-run.js` invocation this
> folder records (Task 4's recompose, `--stale --force` on a figure with a committed sidecar,
> "MT spawned for 0 figure(s)"); every other command here read files or ran a local Python/Node
> script.

Built on `feat/c140-c4-strip-keeps-gstate`, Tasks 1–4, then this task's write-up. Design:
[`docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md)
· plan: [`docs/superpowers/plans/2026-09-17-c140-c4-strip-keeps-gstate.md`](../../../../docs/superpowers/plans/2026-09-17-c140-c4-strip-keeps-gstate.md) ·
evidence this design rests on (a separate, earlier frozen folder — measurements only, no code):
[`../2026-09-16-c4-explore/README.md`](../2026-09-16-c4-explore/README.md).

**If this folder disagrees with a file it cites, the file wins.** If it disagrees with the campaign
register, **the register wins** (per CLAUDE.md § One source of truth) — this folder is evidence, never
status.

## What the folder holds

- [`PREDICTIONS.md`](PREDICTIONS.md) — P1–P8, written before any Task 3/4 measurement run, copied from
  the frozen exploration's numbers as *expectations*, not as measurements of this build.
- [`VERIFICATION.md`](VERIFICATION.md) — the P1–P8 table (predicted / measured / file), the two render
  controls plus the SVG-arms determinism control, the Task 2 mutation proof (with what is and is not
  committed), the recompose set, and this folder's Known Limits.
- `instruments/` — every script this build's reports were produced by:
  - `strip_text_before.py` — **`experiments/figure-text-translation/strip-text.py` exactly as it stood
    at `7a45f0500fe5b19287ad5b98e89360d452beda94`** (`git show 7a45f050:…strip-text.py`), the base commit
    named in the global constraints. Its `strip_text_ops` returns a 2-tuple; it is loaded as its own
    module (never by monkey-patching a function onto the fixed file) so BEFORE and AFTER are two
    independent, whole-module arms. Verified byte-identical to `git show 7a45f050:…` in this task.
  - `population.py` — builds the 533-figure render population: the 34 `group=='bought'` rows from
    `reports/before/summary.tsv` plus every row in the frozen exploration's
    `../2026-09-16-c4-explore/census/figures-with-nontext-in-bt.tsv` whose `bought` column is `0`,
    de-duplicated by basename with bought rows taking precedence.
  - `render_arms.py` — runs BEFORE and AFTER over the 533-figure population, diffing each via
    `render_diff.py` (`pdftocairo -png` at 200 dpi, RGB int16 arrays, per-channel abs-diff counts >0/>40
    plus bounding boxes); writes `render-results.jsonl`, `render-controls.json` and
    `render-summary.md`, and persists the combustion/Egeom crops.
  - `render_diff.py` — the pixel-diff primitive `render_arms.py` calls; not run standalone.
  - `refusal_walk.py` — reads the frozen exploration's census (`../2026-09-16-c4-explore/census/results.jsonl.gz`),
    stages `.eps`/`.ai` sources with the census's own ghostscript argv, opens each PDF with `pikepdf` and
    calls the fixed `strip_text`, recording ok/refused/error per figure into `refusal-walk.jsonl`.
  - `prepare_corpus.py` — re-prepares the 34 bought figures plus the four hazard figures (rvosmosis,
    N2O5, PentIso, Amontons2) through `figure-prepare.py`, hashing each `blocks.json` into
    `reports/<label>/blocks/` and writing `reports/<label>/summary.tsv`; the same instrument runs
    before and after (works against both `resolve_detail` and the older `resolve` in `sources.py`).
  - `svg_arms.py` — runs the real `figure-prepare.py` (whichever `strip-text.py` is on disk) for the six
    figures where a kept state could reach a later paint without changing a pixel (combustion,
    exocytosis-88f6, empform, HClsoln, flowchart, sandwich), recording `artwork.svg`'s sha256, size,
    `svgfix.json` and `<mask>`/`<image>`/`<use>`/`<path>` counts; `--twice` adds the determinism control.
  - `figparts.py` — copied from `../2026-09-15-t23-review-fixes/instruments/figparts.py`; splits a
    composed `_IS.svg` into its artwork/style/text-group parts and hashes the stable ones, used by the
    recompose step to prove only the artwork part moved.
  - `june_copies.py` — read-only: renders a committed `books/efnafraedi-2e/media/<b>_IS.svg` in
    Chromium (`render-check.mjs`, the reader's own renderer) alongside the source rendered by
    `pdftocairo`, and saves a side-by-side crop of the region the exploration found damaged.
  - `npm_compare.cjs` — copied from `../2026-09-16-c7-build/instruments/npm_compare.cjs` (the ⑦ fix
    wave's by-name vitest comparison), repointed at this build's `reports/after/` and
    `reports/before/npm-failing-by-name.txt`.
- `reports/before/` — Task 1's baseline, taken on the branch before Task 2's fix: `summary.tsv`,
  `blocks/*.blocks.json` (37; rvosmosis is refused and has none), `svg-arms.json`/`.log` (with the
  `--twice` determinism control), `june-copies.md` + its two crops, `npm-failing-by-name.txt`
  (see below), `run.log`.
- `reports/after/` — Task 3's measurements on the fixed strip: `render.log`, `render-results.jsonl`,
  `render-controls.json`, `render-summary.md`, `refusal-walk.jsonl` + `.log`, `keys-identity.txt`,
  `summary.tsv`, `blocks/*.blocks.json` (37), `svg-arms.json`/`.log`, `svg-arms-compare.txt`,
  `recompose-set.txt`, `python-tests.txt` (all nine suites), `npm-compare.txt`,
  `npm-failing-by-name.txt`, `test-strip-text.txt` (this task's own fresh `test_strip_text.py` run, for
  the check-count recount in `VERIFICATION.md`'s ruling R5 note), `run.log`.
- `reports/recompose/` — Task 4's recompose of the one figure in the recompose set
  (`CNX_Chem_04_05_combustion`): the run transcript, `git-status-books.txt`, `figparts.py`'s
  before/after JSON and comparison, and the Chromium look (`combustion-chromium.png`/`.host.html`,
  `combustion-look.md`).

## `reports/before/npm-failing-by-name.txt` is a byte copy

`reports/before/npm-failing-by-name.txt` in this folder is byte-identical (`cmp`, confirmed in this
task) to `../2026-09-16-c7-build/reports/after-fix/npm-failing-by-name.txt`. This is valid as this
build's "before" baseline because this branch changes no JS file at all (Task 2's commit touches only
`experiments/figure-text-translation/strip-text.py` and its new `test_strip_text.py`, neither of which
vitest runs), and PR #475 — the merge commit this branch is based on — had CI match that same 36-name
failing set. Copying it forward avoids re-running a ~5-minute full root `vitest run` a second time for a
baseline nothing here can move.

## Commands

```bash
# Task 1 (baseline)
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/prepare_corpus.py --label before \
  > evidence/2026-09-17-c4-build/reports/before/run.log 2>&1
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label before --twice \
  > evidence/2026-09-17-c4-build/reports/before/svg-arms.log 2>&1
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/june_copies.py <scratch-dir>

# Task 3 (after the fix)
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/render_arms.py \
  > evidence/2026-09-17-c4-build/reports/after/render.log 2>&1
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/refusal_walk.py \
  > evidence/2026-09-17-c4-build/reports/after/refusal-walk.log 2>&1
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/prepare_corpus.py --label after \
  > evidence/2026-09-17-c4-build/reports/after/run.log 2>&1
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c4-build/instruments/svg_arms.py --label after \
  > evidence/2026-09-17-c4-build/reports/after/svg-arms.log 2>&1
cd ../..
npx vitest run --reporter=json --outputFile=<scratch>/vitest-after.json
node experiments/figure-text-translation/evidence/2026-09-17-c4-build/instruments/npm_compare.cjs <scratch>/vitest-after.json

# Task 4 (recompose, foreground, one figure at a time)
cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1   # ALL PASS first
cd ../..
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --figure CNX_Chem_04_05_combustion --stale --force

# This task: fresh test_strip_text.py check count (ruling R5)
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_strip_text.py > <scratch>/strip-tests.txt 2>&1
grep -cE '^\s+(PASS|FAIL)\s' <scratch>/strip-tests.txt   # 38 — NOT grep -cE 'PASS|FAIL', which also matches the trailing "ALL PASS" line
```

Full per-task command sequences (with exact scratch paths) are in the task briefs under
`.superpowers/sdd/2026-09-17-c140-c4-strip-keeps-gstate/` — gitignored, not committed, and not
re-typed a second time here; the instrument scripts that implement them are what is committed, in
`instruments/`.

## Limits

One Limits block for this folder: [`VERIFICATION.md` § Known limits](VERIFICATION.md#known-limits).
Not restated here.
