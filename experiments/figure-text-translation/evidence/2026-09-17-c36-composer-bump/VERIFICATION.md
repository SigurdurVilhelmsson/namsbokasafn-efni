# Verification — §C140 ㊱, `COMPOSER_VERSION` `'3'` → `'4'`, 0 ISK

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Status lives in the campaign register (§C140 ㊱ and its ⏩ RESUME). If this
> document disagrees with the design, the design wins; if it disagrees with the register, **the register wins**.
> **Cost of everything here: 0 ISK** — see `README.md`'s banner.

Design: [`docs/superpowers/specs/2026-09-17-c140-c36-composer-version-bump-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c36-composer-version-bump-design.md)
· commands: [`README.md` § Commands](README.md#commands).

Built on `feat/c140-c36-composer-version-bump`: design and pre-flight (`9fe66ee3`), the bump (`be19b3a5`), the restamp
(`4eef0106`), this write-up.

## Predictions B0–B7

| # | predicted | measured | file |
|---|---|---|---|
| B0 | 34 sidecars: `composedVersion "3"`, `composerVersion "1"`, `composedHash === renderHash`, no `state`, `isStale` false; 3 e2e fixtures with `version`/`basename`/`blocks` only; approval check exits 1 with control 34; ring-gate and STIX suites pass | ✅ exactly that — probe 34/34 on every field, fixtures 3/3 (stale by construction: no `renderHash`); `git grep -c '"state"' origin/main` exit 1 at `aac07682`, control 34 — ⚠️ **committed state only: it cannot see a sidecar written on prod** (spec V5/V6, register ㊲; the prod-side check is [USER]'s, before the deploy); `test_figrings.py` and `test_figsym.py` printed `ALL PASS` before the live run and the STIX directory was listed — checked then, **not recorded to a file**; the recorded evidence for both is B7's `reports/after/python-tests.txt` (`test_figsym.py` passes only with the hash-pinned font present) | `reports/before/sidecar-probe.txt`, `approval-preflight.txt` |
| B1 | bump only: `isStale` true 34/34; only `figure-run-free.test.js` moves, by name | ✅ `isStale` true 34/34 (fixtures unchanged, 3/3). The file alone: 102 tests, 4 red — **newly red** "skips exactly the figures that really do have a current sidecar" and the R9 "names an unresolved figure" test; **newly green** 7 (the de-hash LOOKUP-ONLY three, the CONTESTED-stem test, two pre-flight refusals, the prepare-warnings test); **still red** 2 — matching the understand map's prediction name for name. This is the positive control that `'4'` reaches the real corpus, and why the bump cannot land without the restamp | `reports/bump-only-sidecar-probe.txt`, `bump-only-figure-run-free.txt` |
| B2 | dry runs: 15 + 19, all `translated`, 0 buyable, `VERDICT ok` | ✅ ch03 15 `translated` of 15 (26 sidecar-less deselected, named as the ones a run without `--stale` would buy); ch04 19 of 19 (11 deselected); no "would buy" line — printed only when something is buyable (`figure-run.js` summary); `VERDICT ok`; nothing written under `books/` | `reports/recompose/dryrun-ch3.txt`, `dryrun-ch4.txt` |
| B3 | live: `MT spawned for 0`, published 15 + 19, `VERDICT ok`, ring gate as ⑩ | ✅ both printed `MT spawned for 0 figure(s), 0 billable characters`, published 15 and 19, `VERDICT ok`; brain heals `mask-2`, exocytosis declines its 8; ch04's 7 floor-overhang notes identical to ⑥b's recompose transcripts. (The exit code was 0 on each, as seen when run, but the transcripts do not record it; `figure-run.js` `main` returns 0 exactly when its verdict is ok.) | `reports/recompose/live-ch3.txt`, `live-ch4.txt` |
| B4 | a second `--stale` dry run: 15 + 19 skipped-current | ✅ ch03 15 `skipped-current`, ch04 19, `VERDICT ok` | `reports/recompose/converge-ch3.txt`, `converge-ch4.txt` |
| B5 | 34 sidecars, one line each, `composedVersion "3"` → `"4"`; nothing else in `books/` but media; e2e fixtures untouched | ✅ 34 files, every one `+1/-1`; the only removed line `"composedVersion": "3",`, the only added `"composedVersion": "4",`; `books/__e2e-fixture__` 0 diff lines; no other `books/` path | `reports/recompose/sidecar-diff.txt` |
| B6 | all 34 recomposed `_IS.svg` timestamp-only → restored; the comparison can see a difference | ✅ 34 of 34 timestamp-only: artwork part, text group and faces identical; 50 woff2 blobs differ from `HEAD` only in `head`, and in `head` on 50 of 50 (the stamp really moved). Controls: a planted one-character text change → not timestamp-only; the first blob swapped for another figure's → not timestamp-only; the committed copy against itself → timestamp-only with 0 `head` differences. All 34 restored from `HEAD`: `books/` then shows only the 34 sidecars | `reports/recompose/media-value-check.json`, `media-restore.txt` |
| B7 | Python suites `ALL PASS`; vitest failing names = the 36-name baseline by name | ✅ Python: 23 of 23 `ALL PASS` at `4eef0106` (every `test_*.py`; `test_figure_compose.py` mints under the constant it reads) · vitest at `4eef0106` (the data commit; commit in `vitest-head.txt`): `now 36 before 36`, `only-now []`, `only-before []`, 0 files died, planted control fires — the bump plus the restamp returns exactly to the baseline B1's bump-only run moved away from | `reports/after/python-tests.txt`, `npm-compare.txt`, `vitest-head.txt` |

After the restamp (`reports/after-sidecar-probe.txt`): 34/34 `composedVersion "4"`, `composerVersion "1"`, `isStale` false.
A second approval pre-flight before the data commit exited 1 again (control 34).

## Controls

- **B1's movement** is the control that the new constant reaches the committed corpus at all; a bump the driver did not
  read would have moved nothing.
- **B4's convergence** is the control that every sidecar was restamped: one left stale would still read `translated`.
- **B6's planted controls** rule out a comparison that cannot see a difference; its `head`-on-50-of-50 rules out one that
  compared a file with itself.

## What the final review changed

A whole-branch review, three lenses, every finding checked by a refuter (`reports/final-review/review.json`): 16 findings
filed, 16 upheld, several filed by more than one lens. Applied before the PR:
- **The docstring beside the constant** credited ④ and ⑥a with a reason they did not have (prod's lack of approvals was
  confirmed only after their deploy); restored the two-ground distinction.
- **V5's approval check cannot see prod** — sidecars written on prod are never committed (㊲) — so the gate for this change
  is a prod-side check immediately before its deploy (spec V6), whose skipped cost was reproduced on scratch repos:
  stash-pop conflict, a hidden review card, every backup tick failing, the next deploy aborting.
- **Evidence without a file**: B7's placeholder and report, the review file, B0's and B3's unrecorded checks (now said so),
  B1's inline comparison (now `instruments/frf_compare.cjs`), README's invocation count and missing commands, and an
  overstated sentence about the `head` fields.
- **Register**: ㊲ now cites the design records it contradicts and the measured consequence; ㉟'s badge note had a date
  wrong; ㊳'s remedy was too narrow.

## Known limits

- The 36-name vitest baseline is local; CI's test job has its own red set, compared by name on the PR.
- The media restore rests on B6's by-value comparison, not on a render. On the LIVE recompose's files, every non-`head` woff2
  table was measured equal (B6). WHICH `head` fields differ was measured on a stand-in — an epoch-pinned scratch compose of
  the same 34 with the unchanged composer (⑥b's `compose34.py`), because the live files had already been restored: over 50
  blob pairs only `modified` and `checkSumAdjustment` differ, 50 of 50 — a timestamp and the checksum over it, which no
  renderer draws from (`reports/recompose/head-fields.txt`) (reworded 2026-09-17, final review).
- ㊲ and ㊳ (logged in the register) are not addressed here.
