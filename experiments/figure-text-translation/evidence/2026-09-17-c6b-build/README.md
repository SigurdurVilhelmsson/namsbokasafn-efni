# Evidence — §C140 ⑥b, translated figure labels drawn with `font-kerning:none` — build, 2026-09-17

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Open work and status live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㉝ and its ⏩ RESUME) and in
> `../../REGISTER.md`. **This folder carries no status verbs.**
> **0 ISK** — the 31 `figure-run.js` invocations under `reports/recompose/` each ran `--stale --force` on a figure that
> already carries a committed sidecar, after `test_figrings.py` printed `ALL PASS`, and each printed
> `MT spawned for 0 figure(s)`. Every other command here read files or ran a local Python/Node script against a scratch
> directory; nothing called `translate-blocks.mjs`.

Built on `feat/c140-c6b-unkerned-labels`. Ruling: [`docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md`](../../../../docs/decisions/2026-09-17-translated-figure-labels-drawn-unkerned.md)
· design: [`docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6b-translated-labels-unkerned-design.md)
· predictions, written before the census, compare and recompose runs: [`PREDICTIONS.md`](PREDICTIONS.md)
· results: [`VERIFICATION.md`](VERIFICATION.md) · exploration this rests on (earlier, frozen):
[`../2026-09-17-c6-explore/`](../2026-09-17-c6-explore/README.md).

**If this folder disagrees with a file it cites, the file wins. If it disagrees with the campaign register, the register
wins** (CLAUDE.md § One source of truth).

## What the folder holds

- `instruments/`
  - `rd_form_probe.py` + `rd_inline.mjs` — **R-d**, run before any code: five planted SVGs that differ only in how
    `font-kerning:none` is written, measured inline (`getComputedTextLength`) and through `render-check.mjs` (`<img>`).
  - `compose34.py` — a copy of `../2026-09-17-c6a-build/instruments/compose34.py` with two changes (its docstring names
    them): compose runs through `compose_items.py`, and `--prep-root` lets the AFTER run reuse the BEFORE run's prepare.
  - `compose_items.py` — runs an **unmodified** `compose.py` with `runpy` and writes its drawn `ITEMS` to `items.json`.
  - `compare_lists.py` — P1/P3: `<text>` lists as data (every field, `style`, attribute ORDER), faces, metadata.
  - `kern_census.py` + `kern_census.mjs` — P0/P2/P4/P5: each `<text>`'s Chromium length at 3 scales against its planned
    LINEAR width, explained by the font's kern pairs; font-face status and computed `font-kerning` recorded;
    `compare`, `strip`, `attrform`, `labels`, `blocks` modes.
  - `img_pixels.py` — P6: the reader route (`render-check.mjs`, `<img>`), each figure rendered twice before and once after.
  - `figparts.py` — byte copy of `../2026-09-17-c6a-build/instruments/figparts.py` (P7).
  - `recompose_parts.py` — P7, added after the final review: each recomposed figure at two git revisions, part by part —
    artwork, text group, the text group with the property removed, and every embedded woff2 table.
  - `mutate_writer.py` — added after the final review: mutants of the writer against `test_svgout.py`, golden copy in a
    scratch directory, `cmp` after every round and at the end; refuses a dirty `svgout.py`.
  - `npm_compare.cjs` — P8: root vitest failing names by name against `reports/before/`.
- `reports/rd/` — R-d's predictions, inline lengths and analysis.
- `reports/before/` — P0 labels, P1 media comparison, the BEFORE census (`census.txt/json`, `lengths.json`, `jobs.json`
  with scratch paths as run), the dumped `items/`, P2 blocks reconciliation, the vitest baseline, `head.txt`.
- `reports/after/` — the AFTER compose log (force-added: `*.log` is gitignored), P3 comparison, the AFTER census and its comparison with BEFORE, P6 pixels,
  the per-chapter recompose dry-runs, the Python suite results (`python-tests.txt` at `01b9e04c`'s tree,
  `python-tests-final.txt` naming its commit), vitest by name (`npm-compare.txt` at `vitest-head.txt`'s commit;
  `npm-compare-final.txt` at `vitest-final-head.txt`'s commit, after the final-review fixes), the writer mutants (`mutants.txt`), `head.txt`.
- `reports/control/` — P5: the stripped census and its comparison, the byte identity of the stripped SVGs, and the
  presentation-attribute control (census with `attr_none`, `census-attrform.json`, `lengths-attrform.json`, comparison).
- `reports/recompose/` — the recompose set, 31 run transcripts, `git status -- books/`, `parts-compare.json` (from
  `recompose_parts.py`) with `parts-woff2-control.txt`, and the published-vs-compose-only list comparisons (31 and 34
  figures).
- `reports/final-review/review.json` — the final whole-branch review verbatim (three lenses; every finding with its
  refuter's verdict), written by the controller from the workflow's result.
- `reports/spec-review/review.json` — the adversarial spec review verbatim (three lenses; every finding with its refuter's
  verdict). Written by the controller from the workflow's returned result: workflow agents return text, not files.

## Commands

```bash
cd experiments/figure-text-translation
export FIGTEXT_PYLIBS=./pylibs
E=evidence/2026-09-17-c6b-build; P=$E/instruments; S=<scratch>

# R-d (before any code change)
python3 -u $P/rd_form_probe.py gen $S/rd
node $P/rd_inline.mjs $S/rd
for v in V0 V1 V2 V3 V4; do node render-check.mjs $S/rd/$v.svg $S/rd/$v.png 1200 520 1; done
python3 -u $P/rd_form_probe.py analyse $S/rd > $E/reports/rd/rd-analysis.txt

# BEFORE (unchanged composer, commit in reports/before/head.txt)
python3 -u $P/compose34.py --out $S/before > $E/reports/before/compose34.log 2>&1
python3 -u $P/kern_census.py labels $E/reports/before/p0-labels.txt
python3 -u $P/compare_lists.py p1 $S/before ../../books/efnafraedi-2e/media $E/reports/before/p1-media-compare.txt
python3 -u $P/kern_census.py jobs $S/before $S/census-before
node $P/kern_census.mjs $S/census-before/jobs.json 1,2.0833333,3 $S/census-before/lengths.json
python3 -u $P/kern_census.py join $S/before $S/census-before
python3 -u $P/kern_census.py blocks $E/reports/before $E/reports/before/p0-labels.txt $E/reports/before/p2-blocks.txt

# AFTER (commit in reports/after/head.txt), reusing BEFORE's prepare
python3 -u $P/compose34.py --out $S/after --prep-root $S/before/prep --skip-prep > $E/reports/after/compose34.log 2>&1
python3 -u $P/compare_lists.py p3 $S/before $S/after $E/reports/after/p3-compare.txt
python3 -u $P/kern_census.py jobs $S/after $S/census-after
node $P/kern_census.mjs $S/census-after/jobs.json 1,2.0833333,3 $S/census-after/lengths.json
python3 -u $P/kern_census.py join $S/after $S/census-after
python3 -u $P/kern_census.py compare $S/census-before $S/census-after $E/reports/after/census-compare.txt
python3 -u $P/img_pixels.py $S/before $S/after $S/pixels $S/census-before/census.json

# P5 controls
python3 -u $P/kern_census.py strip $S/after $S/stripped        # then jobs/mjs/join on $S/stripped, compare with before
#   byte identity (reports/control/stripped-vs-before-bytes.txt): every $S/stripped/work/<f>/translated.svg is
#   byte-equal to $S/before/work/<f>/translated.svg
python3 -u $P/kern_census.py attrform $S/after $S/attrform       # then jobs/mjs/join on $S/attrform, compare with before

# P7 recompose (repo root), each figure under the chapter whose CNXML references it (reports/recompose/recompose-set.txt)
cd ../..
(cd experiments/figure-text-translation && for t in $(ls test_*.py | sort); do
   echo "$t: $(FIGTEXT_PYLIBS=./pylibs python3 -u $t 2>/dev/null | tail -1)"; done)   # the Python suites, last stdout line each
FIGTEXT_PYLIBS=./pylibs python3 experiments/figure-text-translation/test_figrings.py | tail -1     # ALL PASS first
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure <b> ... --stale --force --dry-run   # and chapter 4
node tools/figure-run.js --book efnafraedi-2e --chapter <N> --figure <b> --stale --force            # one per figure
git status --porcelain -- books/ > experiments/figure-text-translation/evidence/2026-09-17-c6b-build/reports/recompose/git-status-books.txt
FIGTEXT_PYLIBS=experiments/figure-text-translation/pylibs python3 -u $E_ABS/instruments/recompose_parts.py \
  a62d51ab 9d8f2942 $E_ABS/reports/recompose/recompose-set.txt <scratch>/parts $E_ABS/reports/recompose/parts-compare.json
#   published-vs-compose-only: copy the 31 recompose-set figures' after/work dirs into <scratch>/after31, then
#   compare_lists.py p1 <scratch>/after31 books/efnafraedi-2e/media  (and p1 <scratch>/after books/... for all 34)
#   E_ABS = experiments/figure-text-translation/evidence/2026-09-17-c6b-build

# the writer mutants (from experiments/figure-text-translation, on a committed svgout.py)
FIGTEXT_PYLIBS=./pylibs python3 -u $E/instruments/mutate_writer.py <scratch>/mutants $E/reports/after/mutants.txt

# P8 (the baseline: the same vitest run before any code change, its failing names into reports/before/)
npx vitest run --reporter=json --outputFile=<scratch>/vitest-after.json
node experiments/figure-text-translation/evidence/2026-09-17-c6b-build/instruments/npm_compare.cjs <scratch>/vitest-after.json
#   the re-run after the final-review fixes: the same, with a second argument -final
```
