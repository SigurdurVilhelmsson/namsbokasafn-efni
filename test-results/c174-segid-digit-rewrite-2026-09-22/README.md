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
