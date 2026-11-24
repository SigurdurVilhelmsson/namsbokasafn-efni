# Run 20261123T215036Z-63b1603d — Fable editor pass over chemistry ch10

The comparison run of the Fable editor trial (plan
[§5.4 step 3](../../../../docs/plans/2026-11-14-fable-editor-trial-plan.md)): all 11 ch10 units sent through
the Batch API, 2026-11-23 21:50:36Z → 21:57:44Z. Promoted from the records directory with `promote.mjs`
(the key was passed so its leak guard was armed). The comparison built from it is in
[`results/20261123T215036Z-63b1603d/`](../../results/20261123T215036Z-63b1603d/report.md).

| | |
|---|---|
| Model | `claude-fable-5-2`, effort `high`, `max_tokens` 64000, batch mode |
| Prompt | `prompt-v1.md`, sha256 `095c966d99dacfb39eb929a6e35efdf275cffa2ddbdbf58016af89b4172128f9` |
| Ruling set | `ruling-set-2026-11-02.json`, sha256 `0aa33690ca829be4baa4da2b34fbea1455517d426e939c3544b3a86b3049c3bd` |
| Harness commit | `ba5ec9b537ed45d41152ac876efe583c30f41711`, clean |
| Requests | 11 planned, 11 sent, 11 succeeded; no refusal, truncation or error |
| Tokens | input 390,542; output 360,168, of which thinking 243,953 |

## Cost

| Run | USD (`run-end.json`) | ISK |
|---|---|---|
| This run (step 3, whole chapter, batch) | 8.765528 | 1,104 |
| `20261123T214739Z-e202518f` (step 2, m68760 alone, interactive, $5 cap) | 0.27764 | 35 |
| `20261123T214636Z-db45ca7c` (an earlier step-2 attempt; refused 400 before any request, as the workspace id was not passed) | 0 | 0 |
| **Total for the trial's paid steps** | **9.043168** | **1,139** |

ISK at **126 ISK per USD**, the rate the project lead set for this record on 2026-11-24. Earlier AI-review
costs used the Central Bank mid-rate of their day (for example 122.4 on 9 November 2026), so convert from
the USD column if comparing against those. The step-2 run and the refused attempt
are kept only in the records directory outside the repository; step 3 sends m68760 again, and the
comparison uses this run alone (plan §5.4). The ledger reserved $15.80 against the $40 cap and released
the unused $7.03. The account is the project lead's own (plan §5.3).

## Files

`run.json` (the run record) · `requests.jsonl` / `responses.jsonl` (what was sent and received) ·
`batch.json` (the batch id, its submission and its reservation) · `fable-editor.json` (the run's input
plan: units, modules, the term-pass inputs and the G1.12 `enDrift` record) · `run-end.json`
(counts and cost) · `ledger.jsonl` (this run's lines of the cap ledger).
