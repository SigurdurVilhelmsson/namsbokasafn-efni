# Evidence — §C140 ㊱, the one `COMPOSER_VERSION` bump `'3'` → `'4'` — build, 2026-09-17

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Open work and status live in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊱ and its ⏩ RESUME). **This folder carries no status
> verbs.** If it disagrees with the register, **the register wins** (CLAUDE.md § One source of truth).
> **0 ISK** — the three `figure-run.js` invocations per chapter (dry, live, convergence; six in all) under `reports/recompose/` ran bare `--stale` on
> figures that all carry a committed sidecar; each live run printed `MT spawned for 0 figure(s)`. Nothing called
> `translate-blocks.mjs`.

Design: [`docs/superpowers/specs/2026-09-17-c140-c36-composer-version-bump-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c36-composer-version-bump-design.md)
(rulings V1–V6, predictions B0–B7) · results: [`VERIFICATION.md`](VERIFICATION.md).

## What the folder holds

- `instruments/sidecar_probe.mjs` — every committed sidecar's stamps, `state` keys and `isStale` (the driver's own
  function) under the current constant.
- `instruments/frf_compare.cjs` — B1's single-file by-name comparison. `instruments/npm_compare.cjs` — B7's full-run
  comparison (a copy of ⑥b's, repointed). `instruments/head_fields.py` — which woff2 `head` fields differ.
- `instruments/media_value_check.py` — each modified `_IS.svg` against `HEAD`: artwork part, text group, faces, and every
  embedded woff2 table except `head`; planted-text, swapped-blob and self controls first. Reuses ⑥b's `figparts.py`.
- `reports/understand.json` — the four-lens read-only map written before the spec (server, driver/render, tests/fixtures,
  precedent), verbatim from the workflow's result (written by the controller: workflow agents return text, not files).
- `reports/before/` — B0: sidecar probe at `'3'`, approval pre-flight, and the vitest baseline (a byte copy of ⑥b's
  `npm-failing-by-name-final.txt`, taken at `b2ea6cfd`, whose code this branch equals).
- `reports/bump-only-sidecar-probe.txt`, `reports/bump-only-figure-run-free.txt` — B1 on the bump commit alone.
- `reports/recompose/` — B2 dry runs, B3 live runs, B4 convergence dry runs, B5 `sidecar-diff.txt`, B6
  `media-value-check.json` and `media-restore.txt`, the second approval pre-flight.
- `reports/after-sidecar-probe.txt` — the probe after restamping.
- `reports/after/` — B7: Python suites and vitest by name.
- `reports/final-review/review.json` — the final review, verbatim.

## Commands

```bash
# B0 (repo root, on the bump's parent)
node experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/sidecar_probe.mjs
git fetch origin; git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'        # exit 1
git grep -l '"composedVersion": "3"' origin/main -- 'books/*/figure-text/*.json' | wc -l    # 34
# B1 (on the bump commit)
npx vitest run tools/__tests__/figure-run-free.test.js --reporter=json --outputFile=<scratch>/frf.json
node experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/frf_compare.cjs <scratch>/frf.json <report>
# B2 / B3 / B4 — bare --stale, never --force, foreground; FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py ALL PASS first
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run     # then --chapter 4
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale               # then --chapter 4
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run     # again: 15 + 19 skipped-current
# B5
git diff --numstat -- books/efnafraedi-2e/figure-text
# B6, then the restore of every timestamp-only figure
python3 -u experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/media_value_check.py <out.json>
git restore --source=HEAD -- <each path in the json's timestamp_only list>
# B6 addendum: which head fields — a stand-in compose (the live files were already restored)
(cd experiments/figure-text-translation && python3 -u evidence/2026-09-17-c6b-build/instruments/compose34.py --out <scratch>/s34 --prep-root <prep> --skip-prep)
mkdir <scratch>/m && for d in <scratch>/s34/work/*/; do cp $d/translated.svg <scratch>/m/$(basename $d)_IS.svg; done
python3 -u experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/head_fields.py <scratch>/m HEAD
# B7
(cd experiments/figure-text-translation && for t in $(ls test_*.py | sort); do
   r=$(FIGTEXT_PYLIBS=./pylibs python3 -u $t 2>/dev/null); echo "$t: rc=$? $(printf '%s\n' "$r" | tail -1)"; done)
npx vitest run --reporter=json --outputFile=<scratch>/vitest.json
node experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/instruments/npm_compare.cjs <scratch>/vitest.json
```
