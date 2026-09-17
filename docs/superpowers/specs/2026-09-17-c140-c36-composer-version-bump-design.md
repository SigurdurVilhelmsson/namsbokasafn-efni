# §C140 ㊱ — bump `COMPOSER_VERSION` once, `'3'` → `'4'`, closing the ④ / ⑥a / ⑥b exception

**Date:** 2026-09-17 · **Item:** campaign register §C140 ㊱ · **Cost:** 0 ISK
**Approval:** [USER], 2026-09-17: log the bump as its own PR, then *"do the COMPOSER_VERSION bump first"* — before §C140 ㉟'s
ch03/ch04 re-render. At ⑥b's deploy the same day [USER] confirmed *"No figure-review in database"*.
**Evidence:** `experiments/figure-text-translation/evidence/2026-09-17-c36-composer-bump/` — `reports/understand.json` is a
four-lens read-only map of every consumer of the constant (server, driver/render, tests/fixtures, precedent), written
before this spec.
**Branch:** `feat/c140-c36-composer-version-bump`, from the unpushed docs branch `docs/c140-c6b-merged-deploy-owed`
(its register commits ride this PR). Its code equals `b2ea6cfd`, where ⑥b's last full vitest ran.

## 0. Rulings

| # | ruling | why | cost if wrong |
|---|---|---|---|
| V1 | **The bump commit touches `tools/lib/figure-text-sidecar.cjs` only**: `'3'` → `'4'`, a dated `'4'` history line, and the ⚠️ note rewritten to say the exception is closed — keeping "THE RULE FROM HERE". No test, fixture, server or composer file changes. | Both precedents (`4612f3e4`, `d453e8bf`) were one-file bump commits. No test hard-codes `'3'`: every one reads the constant by `require` (understand, tests lens). | none known |
| V2 | **Recompose with bare `--stale`, whole chapter, never `--force`:** `node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale`, then `--chapter 4 --stale`, each `--dry-run` first, in the foreground. `CNX_Chem_14_03_FishLemon` runs under chapter 4 (its CNXML reference). | After the bump every sidecar is stale (`composedVersion '3' ≠ '4'`), so `--stale` selects all 34 and `--force` adds nothing. It would hide whether the bump reached every sidecar and break the convergence check. Both bump precedents used bare `--stale`; `--stale --force` belonged to the no-bump recomposes. `--stale` is **required**: without it the chapters' 26 + 11 sidecar-less figures take the paid path, breaking the 2026-09-13 stop on buying. | a run without `--stale` would buy figures — the dry run and its counts are the guard |
| V3 | **Exactly one field moves in each of the 34 sidecars — `composedVersion` `"3"` → `"4"`, written by `publish-figure-svg.js`.** `composerVersion` stays `'1'`, and `renderHash`, `composedHash`, `blocks` are untouched. **No hand edit of any sidecar**, the 3 `books/__e2e-fixture__` sidecars included. | `renderHash` was hashed under `'1'` (34/34) and `isStale` re-hashes under the sidecar's OWN `composerVersion`; changing it would make every figure stale for ever (the F5 loop). A hand-set `composedVersion` would claim a recompose that did not happen — the detector ㊱ exists to restore. The e2e fixtures carry no stamps, cannot be recomposed (no `01-source/`), and are byte-checked by `server/e2e/figure-review.spec.js`. | none known |
| V4 | **Media: commit a recomposed `_IS.svg` only if it differs from the committed copy beyond the embedded woff2 `head` table; restore every timestamp-only one from `HEAD`.** Decided per figure by a by-value comparison (artwork part, text group, and every woff2 table except `head`), with a control that the comparison can see a difference. | The composer is unchanged, so a correct recompose reproduces each figure's pixels; the driver does not pin `SOURCE_DATE_EPOCH`, so each embedded font's `head.modified` moves anyway. Memory `figure-driver-box-prereqs`: *a timestamp-only recompose is noise — restore it, don't commit it*. The committed bytes were drawn by the same composer code, so `composedVersion '4'` is true of them. A figure that differs beyond `head` is exactly the miss ㊱ exists to catch — it is committed and named. Side benefit: §C140 ㉟'s sha256 gate is not reopened. | a byte change that is not timestamp-only but that the comparison cannot see — its control exists to rule that out |
| V5 | **Approval pre-flight before the data commit and again before merge:** `git fetch origin`; `git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'` exits 1, with the positive control that 34 files hold `"composedVersion": "3"`. A non-zero state count stops the work. | Precedent (E plan Task 8, t23 plan). A state written on prod and pushed by the cron would conflict with the data commit at `deploy.sh`'s pull. [USER]'s "No figure-review in database" covers today; the check covers the window until merge. | none known |
| V6 | **Deploy after merge.** The server imports the constant (`figureReviewService`: approvals are hashed under it). For the 37 state-less sidecars nothing observable changes, but an approval made on prod between merge and deploy would be hashed under `'3'` and demoted by the `'4'` deploy. | understand, server lens (3)–(4) | an approval in that window is silently demoted — the PR asks [USER] to deploy promptly |

## 1. What changes and what does not

- **Editors and readers see nothing from the bump itself.** `editorialState` returns `mt-preview` at `!sidecar.state`
  before it reads the version, for all 37 sidecars, at `'3'` and `'4'` (probed). `cnxml-render.js` emits
  `data-figure-review="mt-preview"` either way; no version or hash reaches HTML. ⚠️ §C140 ㉟'s re-render will ADD that
  attribute to sidecar figures, because the committed ch03/ch04 HTML predates both the sidecars and the badge feature —
  that change belongs to ㉟, not ㊱.
- **What `'4'` restores:** `figure-run.js` `isStale` can again tell media drawn before ④/⑥a/⑥b from media drawn after.

## 2. Tests and measurement — predictions first, `evidence/2026-09-17-c36-composer-bump/`

| # | prediction |
|---|---|
| B0 | Pre-flight: 34 sidecars with `composedVersion "3"`, `composerVersion "1"`, `composedHash === renderHash`, no `state`; 3 e2e fixtures with only `version`/`basename`/`blocks`; `isStale` false for 34/34 at `'3'`; approval check exits 1 with control 34; `test_figrings.py` ALL PASS; STIX font present. |
| B1 | Bump only: `isStale` true for 34/34. `figure-run-free.test.js` alone moves against the baseline by name: the baseline-red de-hash/pre-flight tests that were red because their figures were skipped-current turn green, and the corpus-coupled `:853`/`:910`-shaped tests turn red — re-derived by running the file, not copied from the prediction. |
| B2 | Dry runs: ch03 selects 15 and ch04 19, all `translated`, 0 skipped-current, 0 failed, `VERDICT ok`, `MT spawned`/`would buy` 0. |
| B3 | Live: both chapters `MT spawned for 0 figure(s)`, `VERDICT ok`, published 15 + 19; ring gate heals brain `mask-2` and declines exocytosis's 8. |
| B4 | Convergence: a second `--stale --dry-run` per chapter reports 15 + 19 skipped-current, 0 translated. |
| B5 | Sidecars: `git diff` touches exactly 34 files, one line each, `"composedVersion": "3"` → `"4"`; nothing else in `books/` but media; nothing under `books/__e2e-fixture__`; no `image-mapping.json` change. |
| B6 | Media, by value: every one of the 34 recomposed `_IS.svg` equals its committed copy in artwork part and text group, and its woff2 blobs differ only in `head` — so all 34 are restored from `HEAD` (V4). Control: the comparison reports a planted non-`head` difference. |
| B7 | Final: Python suites ALL PASS; root vitest failing names equal the 36-name baseline by name. |

## 3. Out of scope — logged

- **`books/*/figure-text/` is not in `scripts/git-backup.sh`'s PATHSPECS**, so a sidecar an approval writes on prod never
  reaches `main`, and `deploy.sh`'s stash-pop can conflict with a data commit touching the same file (understand, server lens).
- **`figure-run-free.test.js:853` is corpus-coupled and misnamed** ("current sidecar" checks that the file EXISTS), so
  any figure left stale keeps it red (understand, tests lens).
- Register ㊱'s `--stale --force` wording and its "commit the media churn" assumption are superseded by V2 and V4.

## 4. Known limits

- The 36-name baseline is local; CI's test job fails its own set and is compared separately, by name, on the PR.
