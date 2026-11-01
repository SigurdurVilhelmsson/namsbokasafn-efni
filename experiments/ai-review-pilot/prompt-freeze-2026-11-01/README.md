# Prompt freeze, 2026-11-01: what the full run would send

Evidence for `docs/decisions/2026-11-01-ai-term-pass-prompt-freeze.md`. 0 USD and no network: `plan` builds
the requests and counts nothing remotely.

## Files

| File | What it is |
|---|---|
| `plan-summary.json` | `node tools/ai-review/term-pass.js plan --all --out <plan.json>`, run at `2c941e993` with the frozen inputs and the runner's defaults, then summarised. It holds the inputs the plan read (prompt and ruling set by path and sha256), its parameters, per-chapter counts and estimates, the totals, and **the sha256 of every request body** (622). |
| `summarize_plan.py` | `python3 -I summarize_plan.py <plan.json> <summary.json>`. Digests are taken over `json.dumps(body, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`, UTF-8. The full plan (about 28 MB, mostly request bodies) is not committed; re-run `plan` to get it. |

## What was checked

- **The plan read the frozen inputs:** prompt `tools/ai-review/prompts/term-pass-v2.md` (sha256 `7f9b1b35…`) and
  ruling set `experiments/terminology-consistency/results/2026-11-02/ruling-set-2026-11-02.json` (sha256
  `0aa33690…`). Parameters: `claude-opus-5-5`, effort xhigh, max tokens 32000, 8 segments and 16,000 characters
  per request.
- **`plan` is deterministic:** a second `plan --all` gave a byte-identical summary.
- **A real run sends what `plan` builds:** re-planning ch10 with the paid xhigh re-run's inputs (the 2026-11-01
  ruling set, xhigh, 32000) reproduced all 55 request bodies of run `20261101T101529Z-137d40e8` (digests
  compared against its `requests.jsonl`).

## How to use it after the full run

Digest each `requests.jsonl` body the same way and compare it with the key's `bodySha256` here. A mismatch means
the request changed after the freeze. The cause could be the prompt, the ruling set, the parameters, the
request-building code or the layer-1 text it read, so the comparison covers more than the two pinned hashes.

## Result

- **622 requests;** about 5.97 million input tokens (the planner's estimate at 3 characters a token).
- **Worst case if every answer used all 32,000 output tokens:** USD 225.35 as batches, USD 450.62 interactive.
- **A batch reserves its chapter's whole worst case,** so chapters run one at a time. The largest reservation is
  ch10's USD 19.90.
