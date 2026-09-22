# §C174 / §C175 evidence — 2026-09-22

**Open items.** These are the instruments, not a frozen record: §C174 is unfixed, so the
detector here is how you re-measure it after any repair.

| file | what |
|---|---|
| `segid-digit-rewrite.mjs` | **The detector for §C174.** Equal SEG counts, non-empty symmetric difference of id SETS between the EN and IS sides. That predicate is the whole finding — a count comparison is structurally blind to it, which is why `validateMarkers` never saw it. |
| `census-2026-09-22.txt` | Its output the day §C174 was filed: 6 digit-rewrites and 9 count-drift pairs over 207 pairs. |
| `a2b-which-pair.mjs` | Runs the BLOCKING A2b check over every pair and names the non-PASS ones. The base-rate test aborts on the first failure, so it cannot tell you how many there are — this can. |
| `a2b-failing-pairs-2026-09-22.txt` | Its output: 9 FAILs, all `lifraen-efnafraedi/ch12`, all leg `cross-side`. |

⚠️ **Both scripts must be run from inside the repo tree** — they import `tools/lib/*` and the
test helpers, and Node resolves from the FILE's location.

## Re-measuring after a §C174 repair

```bash
node pipeline-output/probes/segid-digit-rewrite.mjs   # expect: 6 -> 0 in the digit-rewrite block
```

▶ **The population line is the control.** `pairs=207` must still print; a run that examines
nothing would report "0 instances" and look like a successful repair.

## The fix (2026-09-22) — strategy 3 in `repairSegTags`

| file | what |
|---|---|
| `order-preservation.mjs` | **The gate on the whole approach.** Ordinal repair is only safe if the MT preserves marker order. Q1 — *do any pairs reorder their matched ids?* — is the question that would have killed it. Answer over 207 pairs: **0**. |
| `order-preservation-2026-09-22.txt` | That run: 192 id sequences byte-identical, 198 count-equal, 6 corruptions all at identical ordinal positions on both sides. |
| `verify-c174-fix.mjs` | The counterfactual: run the real `repairSegTags` over every committed pair. **6 changed and correctly repaired, 0 still broken, 201 untouched** — the 201 is the control proving the repair does not over-fire. |
| `mutate-guards.sh` | Neuters each of the four guards in turn and requires the matching test to go RED. |

🔴 **THE COUNTERFACTUAL IS NOT A REPAIR.** `repairSegTags` runs on freshly-returned MT
output; the committed files were written before it existed. **The class is closed for future
buys; the 6 ids on disk are unchanged**, and the two live chemistry ones still reach readers.

⚠️ **`mutate-guards.sh` earned its place immediately.** Four guards, three fired — and the
`no-reorder` one did **not**: its test passed with the guard deleted, because both ids in that
fixture were *valid*, so the callback returned early and strategy 3 was never consulted. The
replacement needs all three parts at once — two ids that swap, sharing a digit skeleton, plus a
genuinely corrupted third. ▶ **A refusal test written before the feature exists passes for free;
only mutation tells you whether it passes for the right reason.**
