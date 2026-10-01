# Evidence — §C140 ㊴ (`--stale` reaches the textless figures and never buys), measured 2026-10-01

> 🧊 **FROZEN, 2026-10-01.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊴ and its ⏩ RESUME). **If this folder
> disagrees with the register, the register wins** (CLAUDE.md § One source of truth).
> **Cost of everything here: 0 ISK.** No paid tool ran. `tools/figure-run.js` ran only as `--stale --dry-run`;
> the mutation harnesses and the spend matrix drive the real driver with a fake `spawn`, against throwaway trees.

Branch `fix/c140-c39-stale-textless`. Code commits: `cb1ba9d6d` (the fix) and `501a0f0f6` (the review round).
The commits after them are docs and evidence only (`git diff 501a0f0f6 <later> -- tools` is empty). Design
approved in session by [USER], 2026-10-01: select a figure with a sidecar FILE or a basename-keyed image-mapping
row, and refuse to buy under `--stale` in both modes.

## 1. Which figures `--stale` should reach — read-only census of chemistry

[`instruments/stale-census.cjs`](instruments/stale-census.cjs) → [`reports/stale-census.txt`](reports/stale-census.txt)

| population | figures |
|---|---|
| all enumerated | 1,148 |
| with a sidecar file — the old `--stale` reach | 459 |
| a mapping row, no sidecar (248 textless + the 10 June figures) | 258 |
| neither (readers get OpenStax's own artwork) | 431 |

459 + 258 = **717 = the mapping-row count, all `.svg`.** That identity is the case for the predicate: the rows are
exactly the figures readers are served a copy of ours for, which is exactly what a composer change can make stale.
⚠️ The script reads the chapter directory names from `01-source`, so it imports nothing from the AGPL server tree
(root `LICENSE` lists those edges; a first draft of the script did import it).

## 2. A prediction, then the real dry run — chemistry ch02

[`instruments/predict-ch02.mjs`](instruments/predict-ch02.mjs) wrote [`reports/predictions-ch02.txt`](reports/predictions-ch02.txt)
**before** the first dry run (and is byte-identical when re-run later). Then
`node tools/figure-run.js --book efnafraedi-2e --chapter 2 --stale --dry-run`:

| | predicted | old driver | `cb1ba9d6d` | `501a0f0f6` |
|---|---|---|---|---|
| selected | 32 | 21 | 32 | 32 |
| not selected | 15 | 26, called "the ones a run WITHOUT --stale would buy" | 15 | 15, new wording |
| `skipped-current` | 21 | 21 | 21 | 21 |
| textless, listed to recompose | the 11 named | — | the same 11 | the same 11 |
| refused (`skipped-unbought`) | 0 | — | 0 | 0 |

Every run: `VERDICT ok`, exit 0, `git status` clean before and after. The old-driver control put
`git show cb1ba9d6d~1:tools/figure-run.js` in place and restored the file from a golden copy, `cmp`-checked.
Reports: [`dryrun-ch02-old-driver.txt`](reports/dryrun-ch02-old-driver.txt) ·
[`dryrun-ch02-at-cb1ba9d6d.txt`](reports/dryrun-ch02-at-cb1ba9d6d.txt) ·
[`dryrun-ch02-at-501a0f0f6.txt`](reports/dryrun-ch02-at-501a0f0f6.txt).

## 3. Mutation testing — the real vitest suite

Each harness keeps golden copies, applies an edit only if its anchor occurs exactly once, restores after every round and
byte-compares (never `git checkout`). The three reports below were produced in an isolated git worktree at the commit
named, so the main tree was never mutated.

| harness | at | result | report |
|---|---|---|---|
| [`mutate.cjs`](instruments/mutate.cjs): 10 hand-made mutants + a probe | `cb1ba9d6d` | 10 killed; the probe shows `--force` buys a figure with no sidecar | [round 1](reports/mutation-round1-at-cb1ba9d6d.txt) |
| [`mutate2.cjs`](instruments/mutate2.cjs): the 5 mutants the review proposed | `cb1ba9d6d` | **all 5 SURVIVED** | [survivors](reports/mutation-survivors-at-cb1ba9d6d.txt) |
| [`mutate3.cjs`](instruments/mutate3.cjs): all 15 + 2 probes, 3 test files | `501a0f0f6` | 15 killed; both probes pass | [final](reports/mutation-final-at-501a0f0f6.txt) |

The survivors were: the refusal exempting `--force`, `--figure` or `--module` (each of which then BUYS), the verdict NOTE
needing two refusals, and the live report calling a refused figure "buyable this run". Every test was red-first, and
none of that saw them. ▶ **Red-first proves each test CAN fail; it does not prove the set covers the property.**
The backstop probe deletes the per-figure refusal and asserts that the run throws the spend-site message with 0
translate spawns.

## 4. The adversarial review of `cb1ba9d6d`

Five lenses (spend safety, selection population, report truthfulness, test adequacy, docs and other consumers) and
29 agents. Every finding went to a verifier told to refute it: **31 findings, 2 refuted.**
[`reports/review-findings.json`](reports/review-findings.json) is the workflow's result verbatim. For each lens it
gives what was checked and found sound, and each finding with its verdict. The reviewers' other scratch artifacts
were not kept.

**Spend matrix** — [`instruments/spend-matrix.mjs`](instruments/spend-matrix.mjs), the spend lens's instrument as
run. It builds **484 figures**: 8 sidecar states × 4 mapping states × 5 classes × 3 resolutions = 480, plus 2
de-hashed and 2 contested names. It runs them through 8 `--stale` configurations and 3 controls:

| configuration | translate spawns |
|---|---|
| every `--stale` run — bare, `+force`, `+dry-run`, `+module`, `+figure` and their combinations | **0** |
| controls without `--stale`: plain / `--force` / `--figure` | 5 / 5 / 1 |

[`spend-matrix-at-cb1ba9d6d.json`](reports/spend-matrix-at-cb1ba9d6d.json) (the reviewer's run) and
[`spend-matrix-at-501a0f0f6.json`](reports/spend-matrix-at-501a0f0f6.json) (re-run on the final code) are
byte-identical. ⚠️ The review's own summary called it "a 324-figure matrix". The instrument builds 484, and that
error reached a commit message before it was recounted. **⚠️ To re-run it, copy it OUTSIDE the repo first: it writes
`tmp/` and `roots/` beside itself, and its `REPO` path is absolute.**

## 5. Not shown here

- **E2E (Playwright):** it tests the server, which ㊴ does not touch, and CI runs it.
- **`test_figrings.py`'s corpus sweep** (§C140 ㊸): it cannot finish on the full corpus. The numpy trap it guards was
  checked directly instead, by confirming numpy resolves from the experiment's `pylibs`.
- **Any live, paid run.**
- **Provenance note:** the review-round commit was first `b6a06d290`. It was re-created as `501a0f0f6` with an
  identical tree, only to correct "324" to "484" in its message, before anything was pushed. The `b6a06d290` runs
  gave byte-identical dry-run and matrix outputs and the same mutation verdicts, so everything above is pinned to the
  commits that exist.
