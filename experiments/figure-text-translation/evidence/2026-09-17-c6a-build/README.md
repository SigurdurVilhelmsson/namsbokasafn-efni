# Evidence — §C140 ⑥a, kept STIX symbols drawn in the official STIX 1.1.0 font (`FigSym`) — build, 2026-09-17

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Open work and status live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ⑥ and its ⏩ RESUME) and in
> `../../REGISTER.md`. **This folder carries no status verbs.**
> **0 ISK** — `test_figrings.py` printed `ALL PASS` before each of Task 5's nine `figure-run.js`
> invocations (all nine on figures that already have a committed sidecar, `--stale --force`,
> "MT spawned for 0 figure(s)"); every other command here read files or ran a local Python/Node
> script against a scratch output directory, never `translate-blocks.mjs`.

Built on `feat/c140-c6a-stix-regular`, stacked on ④'s `feat/c140-c4-strip-keeps-gstate` (PR #476).
Design: [`docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md)
· plan: [`docs/superpowers/plans/2026-09-17-c140-c6a-stix-regular.md`](../../../../docs/superpowers/plans/2026-09-17-c140-c6a-stix-regular.md) ·
evidence this design rests on (a separate, earlier frozen folder — read-only exploration, no code):
[`../2026-09-17-c6-explore/README.md`](../2026-09-17-c6-explore/README.md).

**If this folder disagrees with a file it cites, the file wins.** If it disagrees with the campaign
register, **the register wins** (per CLAUDE.md § One source of truth) — this folder is evidence, never
status.

## What the folder holds

- [`PREDICTIONS.md`](PREDICTIONS.md) — P1–P8, written before Task 1's baseline recount matched them
  — copied from the frozen exploration's own numbers as *expectations*, filled in only where Task 1
  had already measured them.
- [`VERIFICATION.md`](VERIFICATION.md) — the P1–P8 table (predicted / measured / file), the vitest
  pin collision and its fix, the three controls, the counting-units note (42 blocks vs 43 items;
  31 `test_figsym.py` checks, not the committed commit message's wrong "22"), the recompose set, and
  this folder's Known Limits.
- `instruments/` — every script this build's reports were produced by:
  - `compose34.py` — copied from `../2026-09-15-t23-review-fixes/instruments/regen34.py`, adapted
    to resolve sources through the real `sources.py` (`resolve_source`, mirroring
    `prepare_corpus.py`'s own `lookup()`) instead of a fixed `sources.json`, and to take `--tree` as
    a repository root rather than the composer directory itself. Runs `figure-prepare.py` +
    `compose.py` for all 34 bought ch03/ch04 figures against a given tree (BEFORE: a worktree at
    ④'s head `ff00d5fb`; AFTER: the branch itself) — no MT, no `figure-run.js`, nothing under
    `books/` written.
  - `textlist.py` — reads a composed SVG's drawn `<text>` elements (text/x/y/size/weight/style/
    fill/family), its `@font-face` rules in order, and whether it carries a `<metadata>` element
    plus its text — as data, on stdout, for a list of SVG paths.
  - `stix_recount.py` — spec § 4.1's free re-count: recomputes each figure's blocks from
    `runs.json` (asserted equal to the compose report's own block list), classifies each block's
    STIX exposure by `Counter` arithmetic over the compose report's `runExact`/`translated`/
    `identity` lists (kept vs. translated vs. other-STIX-face), and checks every prep key against
    ④'s own `reports/after/blocks/` for byte-identity. Writes `stix-recount.json` and
    `keys-vs-c4.txt`.
  - `compare_textlists.py` — Task 4 Step 2: the before/after `textlist.py` comparison (P2/P3/P4),
    keyed by figure basename. Asserts the item count is unchanged, only `family` differs between
    matched indices, every family change is `FigIS → FigSym` (never the reverse, never `FigIS →
    FigIS`), every changed item's text is a substring of that figure's `compose-report.json`
    `stix.drawn` keys, and — stronger than the brief's literal "contains the words" — that a
    present `metadata_text` is byte-equal to a freshly computed `figsym.metadata_element()`. Also
    writes `names.txt` (P5): decodes each after-SVG's embedded FigSym woff2 (extracted from its own
    `@font-face` rule, not re-derived from `figsym.subset_woff2` in isolation) and runs
    `figsym.name_violations()` plus a direct check that name IDs 0/7 and the CFF `Notice` equal the
    official font's.
  - `chromium_stix.py` — Task 4 Step 3 (P6): for every recompose-set figure, renders the source
    artwork PDF (`pdftocairo -png -r 200 -singlefile`), the before-SVG, the after-SVG, and the
    after-SVG with its `FigSym` `@font-face` rule surgically removed (asserting exactly one such
    rule existed to remove) — the last three via `render-check.mjs` (Playwright Chromium, the same
    `<img>`-sandboxed route `cnxml-render.js` publishes through) — crops a box around every FigSym
    `<text>` in all four images, and records the mean absolute RGB difference to source for
    before/after plus the no-rule-vs-after difference (the negative control: a mis-named family
    falls back silently, so removing the rule must change something if FigSym is really in effect).
  - `figparts.py` — copied byte-identical from `../2026-09-17-c4-build/instruments/figparts.py`;
    splits a composed `_IS.svg` into its artwork/style/text-group parts and hashes the stable ones,
    used by the recompose step (Task 5) to prove only the text group's face attribute moved.
  - `npm_compare.cjs` — Task 4 Step 4: the by-name root-vitest comparison against ④'s own
    after-baseline (copied forward as `reports/before/npm-failing-by-name.txt` since this branch
    changes no JS file). This is the run that first surfaced the pin collision (P8, `now 37 before
    36`).
  - `npm_compare_after_pin_fix.cjs` — **Task 6.** A copy of `npm_compare.cjs` repointed to
    `*-after-pin-fix.txt` output paths, so re-running it after the R7 pin fix (and after Task 5's
    recompose) never overwrites Task 4's own `npm-failing-by-name.txt`/`npm-compare.txt` (the
    pre-fix 37 is kept, on purpose, as the record of what the collision looked like before the fix).
  - `npm_compare_fix_wave.cjs` — **the final-review fix wave** (added 2026-09-17, final review). The
    same comparison again, repointed to `*-fix-wave.txt` output paths, run after the fix wave's code
    and test changes (which touch `tools/__tests__/figure-text-sidecar.test.js`) so no earlier run's
    files are overwritten.
- `reports/before/` — Task 1's baseline, taken against a worktree at ④'s head (`ff00d5fb`), before
  any of this build's code existed: `compose34.log`, `stix-recount.json`, `keys-vs-c4.txt`,
  `textlists.json`, `npm-failing-by-name.txt` (a byte copy of ④'s own after-run baseline — see
  below).
- `reports/after/` — Tasks 3–4's measurements on the finished composer change: `compose34.log`,
  `textlists.json`, `textlist-compare.txt`, `recompose-set.txt`, `names.txt`, `chromium-stix.txt`,
  `chromium-look.md`, `crops/*.png` (9), `python-tests.txt` (16 suites), `npm-compare.txt` +
  `npm-failing-by-name.txt` (Task 4's pre-pin-fix run, showing the 37-name collision — kept as-is),
  and **Task 6's own post-pin-fix, post-recompose re-run**: `npm-compare-after-pin-fix.txt` +
  `npm-failing-by-name-after-pin-fix.txt` (36 names, byte-identical to `reports/before/
  npm-failing-by-name.txt`). And the final-review fix wave's own records (added 2026-09-17, final
  review): `fix-wave-checks.txt` (the six Python suites after the fix wave — `test_figsym.py` now has
  checks 1c2, 1d2 and 5a–5c beside the 31 that `VERIFICATION.md` counts; a scratch recompose of `HClsoln` compared
  field by field with the committed media; the shipped subsets' `OS/2.achVendID` and name IDs 13/14),
  and `npm-compare-fix-wave.txt` + `npm-failing-by-name-fix-wave.txt` (root vitest by name).
- `reports/recompose/` — Task 5's recompose of the 9-figure set: nine per-figure run transcripts
  (`CNX_Chem_*.txt`), `git-status-books.txt`, `figparts.py`'s before/after JSON and comparison
  (`parts-before.json`, `parts-after.json`, `parts-compare.json`), the recomposed textlists
  (`textlists-recomposed.json`, `textlist-family-compare.json` against Task 4's scratch output),
  the Chromium look (`look.md`, `renders/*.png` + `*.host.html` for 2 of the 9), and the
  BEFORE-worktree teardown record.

## `reports/before/npm-failing-by-name.txt` is a byte copy

`reports/before/npm-failing-by-name.txt` in this folder is byte-identical (`cmp`, confirmed in
Task 4) to `../2026-09-17-c4-build/reports/after/npm-failing-by-name.txt` (④'s own after-run). This
is valid as this build's "before" baseline because Tasks 2–3 change only
`experiments/figure-text-translation/*.py` files, its `test_*.py` suites included — none of which
vitest runs (corrected 2026-09-17, final review: this named the suites `*_test.py`).
Task 6's own fresh re-run (`reports/after/npm-failing-by-name-after-pin-fix.txt`, taken after the
R7 pin fix and after Task 5's recompose) is byte-identical to this same baseline — confirmed by
`diff`, not merely by count.

## The STIX font is never committed; its licence text is (corrected 2026-09-17, final review)

Per the design's T3/T5 and the global constraints: the official `STIXGeneral-Regular.otf` 1.1.0 is
read from `$FIGTEXT_STIX_FONT` if set, else
`~/.cache/namsbokasafn-figtext/stix-1.1.0/STIXGeneral-Regular.otf`, and `figsym.py` refuses (loudly,
naming the reason) unless it hashes to sha256
`5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7` — this file is **never** in the
repository. The licence text **is** committed, byte-identical to the pin, at
`experiments/figure-text-translation/fonts/STIX-1.1.0-LICENSE.txt` (sha256
`69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3` — the STIX 1.1.0 release's own
`pdftotext -layout` licence text, 98 lines, source PDF sha256
`f9e7dfa5f80b16145050794cf430c2473b6c060d2adbbef61bbb335d063e5680`). The committed file's bytes are
untouched (including its 3 raw U+000C page-break characters, at offsets 1006/3447/5177) — only the
in-memory `<metadata>` build normalizes `\f → \n` before escaping, because XML 1.0 forbids a literal
U+000C in text content in any form and re-extracting with `-nopgbrk` would re-pin a hash already
cited in committed evidence (ruling R3). Any box that composes a figure with a kept STIX run needs
the font file provisioned locally at the hash above — `figsym.py` is the single source of truth for
both hashes and the read path; this document does not restate them as a separate copy to drift.

## Commands

```bash
# Task 1 (baseline, against a worktree at ④'s head ff00d5fb)
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 -u evidence/2026-09-17-c6a-build/instruments/compose34.py \
  --tree <worktree root> --out <scratch>/before \
  > evidence/2026-09-17-c6a-build/reports/before/compose34.log 2>&1
python3 evidence/2026-09-17-c6a-build/instruments/textlist.py <scratch>/before/work/*/translated.svg \
  > evidence/2026-09-17-c6a-build/reports/before/textlists.json
python3 evidence/2026-09-17-c6a-build/instruments/stix_recount.py \
  --tree <worktree root> --out <scratch>/before \
  --report-dir evidence/2026-09-17-c6a-build/reports/before \
  --c4-blocks evidence/2026-09-17-c4-build/reports/after/blocks

# Task 3 (TDD; the 16 suites are listed in reports/after/python-tests.txt) (corrected 2026-09-17, final review)
FIGTEXT_PYLIBS=./pylibs python3 test_figsym.py | tail -1
FIGTEXT_PYLIBS=./pylibs python3 test_svgout.py | tail -1
FIGTEXT_PYLIBS=./pylibs python3 test_compose_runexact.py | tail -1

# Task 4 (after measurements, current branch tree)
python3 -u evidence/2026-09-17-c6a-build/instruments/compose34.py --out <scratch>/after \
  > evidence/2026-09-17-c6a-build/reports/after/compose34.log 2>&1
python3 evidence/2026-09-17-c6a-build/instruments/textlist.py <scratch>/after/work/*/translated.svg \
  > evidence/2026-09-17-c6a-build/reports/after/textlists.json
python3 evidence/2026-09-17-c6a-build/instruments/compare_textlists.py \
  --before-json evidence/2026-09-17-c6a-build/reports/before/textlists.json \
  --after-json evidence/2026-09-17-c6a-build/reports/after/textlists.json \
  --after-work <scratch>/after/work --out-dir evidence/2026-09-17-c6a-build/reports/after
FIGTEXT_PYLIBS=./pylibs python3 evidence/2026-09-17-c6a-build/instruments/chromium_stix.py \
  --recompose-set evidence/2026-09-17-c6a-build/reports/after/recompose-set.txt \
  --after-textlists evidence/2026-09-17-c6a-build/reports/after/textlists.json \
  --before-work <scratch>/before/work --after-work <scratch>/after/work \
  --after-prep <scratch>/after/prep --scratch <scratch dir> \
  --out-dir evidence/2026-09-17-c6a-build/reports/after
cd ../..
npx vitest run --reporter=json --outputFile=<scratch>/vitest-after.json
node experiments/figure-text-translation/evidence/2026-09-17-c6a-build/instruments/npm_compare.cjs \
  <scratch>/vitest-after.json

# Task 5 (recompose, foreground, one figure at a time)
cd experiments/figure-text-translation && FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py | tail -1   # ALL PASS first
cd ../..
# One invocation per figure in reports/after/recompose-set.txt, each with the chapter it ran as
# (reports/recompose/CNX_Chem_*.txt name it) (corrected 2026-09-17, final review):
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_alsulfatemass_img --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_aspirin --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_chloroform --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_glycinemass_img --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_saltMass --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --figure CNX_Chem_04_01_basehyd_img --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --figure CNX_Chem_04_01_rxn2 --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --figure CNX_Chem_04_02_HClsoln --stale --force
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --figure CNX_Chem_14_03_FishLemon --stale --force

# Task 6 (this task — vitest re-run AFTER the R7 pin fix, on top of Task 5's recompose)
npx vitest run --reporter=json --outputFile=<scratch>/vitest-after-pin.json
node experiments/figure-text-translation/evidence/2026-09-17-c6a-build/instruments/npm_compare_after_pin_fix.cjs \
  <scratch>/vitest-after-pin.json

# Final-review fix wave (added 2026-09-17, final review)
cd experiments/figure-text-translation
for t in test_figsym.py test_svgout.py test_compose_runexact.py test_compose_t23.py test_figure_compose.py \
         test_blockkey_consumers.py; do FIGTEXT_PYLIBS=./pylibs python3 -u $t | tail -1; done
python3 -u evidence/2026-09-17-c6a-build/instruments/compose34.py --only CNX_Chem_04_02_HClsoln --out <scratch>/hcl
python3 evidence/2026-09-17-c6a-build/instruments/textlist.py <scratch>/hcl/work/CNX_Chem_04_02_HClsoln/translated.svg \
  ../../books/efnafraedi-2e/media/CNX_Chem_04_02_HClsoln_IS.svg   # compared field by field: fix-wave-checks.txt § 2
cd ../..
npx vitest run --reporter=json --outputFile=<scratch>/vitest-fix-wave.json
node experiments/figure-text-translation/evidence/2026-09-17-c6a-build/instruments/npm_compare_fix_wave.cjs \
  <scratch>/vitest-fix-wave.json
```

The instrument scripts that implement these commands are committed, in `instruments/`
(corrected 2026-09-17, final review — a citation of gitignored task briefs, which no reader of this
folder can open, was removed).

## Limits

One Limits block for this folder: [`VERIFICATION.md` § Known limits](VERIFICATION.md#known-limits).
Not restated here.
