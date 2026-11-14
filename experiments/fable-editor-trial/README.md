# Fable editor trial

A side trial: Claude Fable 5.2 edits one chapter's machine translation (ch10), and the result is
compared with the MT and the term pass. Plan and guard rails:
[docs/plans/2026-11-14-fable-editor-trial-plan.md](../../docs/plans/2026-11-14-fable-editor-trial-plan.md).
Nothing here writes under `books/`, and editors never see Fable's text.

| File | What it does |
|---|---|
| `prompt-v1.md` | The system prompt. Committed before the run; its sha256 goes into the run record. |
| `run-trial.mjs` | Builds the requests and sends them through `tools/ai-review/harness.js`. Without `--yes`, a free dry run. |
| `promote.mjs` | Copies a finished run from the records directory into `runs/<runId>/`, with its ledger lines. |
| `compare.mjs` | `report` writes `results/<runId>/` (metrics, report, FE layer files, blind sheet and sealed key); `score` scores the filled-in blind answers. |
| `lib.mjs` | The shared, tested pieces (`tools/__tests__/fable-editor-trial.test.js`). |

The commands, in order, are in the plan's §5.4. Two rules: `--records` is an absolute path outside the
repository, and do not open `results/<runId>/blind-key.b64` before you have ranked the sheet.

`blind-answers.csv` has one row per item: `rank_A`…`rank_C` (1 = best; ties allowed) and
`accept_A`…`accept_C` (`y` or `n`, would accept as is). A `-` marks a letter the item does not have,
because two conditions gave the same text.
