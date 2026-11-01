# The full run against the runner's cap, 2026-11-01

Evidence for `docs/decisions/2026-11-01-full-run-cap-rule-and-billing.md`, and the instrument for that record's check
after each chapter. 0 USD and no network.

## Files

| File | What it is |
|---|---|
| `cap_projection.py` | The projection (model and flags in its docstring). It reads the frozen plan's summary (`../prompt-freeze-2026-11-01/plan-summary.json`), the summary below and the ledger. |
| `plan-summary-high-16000.json` | `plan --all --effort high --max-tokens 16000` on the frozen inputs, at `8d8ef46a0`, summarised with `../prompt-freeze-2026-11-01/summarize_plan.py`. It is the fallback's worst cases. |
| `projection-2026-11-01.json` | The projection before the run, all 23 chapters left. |

## The model and its two factors

- **Reservation factor:** the real reservation over the plan's worst case. ch10's xhigh batch reserved USD 20.54
  against the plan's 19.90 (1.032); its high batch reserved 11.74 against 11.10 (1.058).
- **Cost ratio:** actual cost over reservation, from the same 2026-11-01 ch10 runs: xhigh 3.81 / 20.54 (0.185),
  high 3.32 / 11.74 (0.283).
- **One chapter is one batch.** It reserves its whole worst case first, and a refused reservation writes nothing,
  so a cut falls between chapters, never inside one.

## Result before the run

| | |
|---|---|
| Settled before the run, headroom | USD 21.15, USD 78.85 |
| Expected spend, 23 chapters at xhigh | USD 43.1 |
| Headroom left at the expected spend | USD 35.75 |
| First refusal, book order | at 1.66× the expected spend (about USD 72): ch21 |
| … with the high fallback | at 1.78× (about USD 77): ch20 switches to high, ch21 refused |
| First refusal, largest chapters first | at 1.75× |
| First refusal, smallest first | at 1.48× |

**Control:** with the cost ratio forced to 0.5 (`--ratio-x 0.5`), the projection predicts a refusal below the
expected spend (k 0.67). So it fires when spend runs high.

## Using it during the run

After each chapter settles:

```bash
python3 -I experiments/ai-review-pilot/full-run-cap-2026-11-01/cap_projection.py \
  --order <the run's chapter order> --done <chapters settled so far> --ratio-x <observed ratio>
```

The observed ratio is the full run's settled cost over its reservations so far, from the ledger. If
`firstRefusal.given.k` is below 1, the projection says the cap would refuse a later chapter at the observed rate,
and the record's rule pauses the run.

## Blind spots

- Both factors come from one chapter, ch10. The output length at xhigh varies by chapter, which is why the
  record checks after every chapter instead of trusting this projection once.
- It projects at a constant cost ratio, so a single unusually costly chapter late in the run is seen only when it
  settles.
