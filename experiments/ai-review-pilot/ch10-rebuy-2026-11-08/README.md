# ch10 AI term pass, re-bought 2026-11-08

Evidence for the ch10 re-buy that the 2026-11-04 ruling asked for: ch10 gets suggestions from a new
paid run under the full run's exact inputs, so all 23 chapters share one condition. Status lives in
the register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, entry of 2026-11-08), not here.

| File | What it is |
|---|---|
| `run.log` | The runner's output: plan line, preflight (layer 1, prompt and ruling-set hashes), result, ledger |
| `verify-ch10.mjs` | Replays every written ch10 unit through `verifyRevision` (`tools/lib/mt-layers.js`), with a wrong-hash control |
| `verify-ch10.out` | Its output on 2026-11-08 |

**Command.** `node tools/ai-review/term-pass.js run --chapter ch10 --mode batch --max-tokens 64000
--layer1-commit 0093d8da4620a2041e583d3f84d39e9b49f055a2 --yes` — the full run's per-chapter
command (its driver ran `--mode batch --max-tokens 64000` from ch08), with layer 1 pinned to the
full run's commit. ch10's layer-1 inputs are byte-identical between that commit and `main` at the
time; the pin makes the run record name the same input as the other chapters. A dry run (the same
command without `--yes`) came first.

**The run's records** are where the runner writes them: `books/efnafraedi-2e/ai-review/runs/20261108T193214Z-76357476/`
and `books/efnafraedi-2e/ai-review/ledger.jsonl`. **Layer 2** is in `books/efnafraedi-2e/02-mt-revised/ch10/`,
with its applied records in `books/efnafraedi-2e/ai-review/applied/ch10/`. The dry `apply` report is not
kept: it is regenerated free with `node tools/ai-review/term-pass.js apply --chapter ch10 --run
20261108T193214Z-76357476 --report <absolute path outside the repo>`.
