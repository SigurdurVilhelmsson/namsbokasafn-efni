# §C173 evidence — the organic pre-flight census, 2026-09-21

**Frozen.** This directory is the artifact behind §C173's numbers in
`docs/plans/2026-07-21-post-item17-followup-campaign.md`. The register owns the findings; this
owns the raw material and the two instruments, so the claims can be re-derived rather than
trusted.

## Files

| file | what it is |
|---|---|
| `t2-organic-verbose-logs.tar.gz` | `source-roundtrip-check.js lifraen-efnafraedi <unit> --verbose` for all 33 organic units, as captured. **`--verbose` is load-bearing** — without it the per-module listing is capped at 4 per category and reads as complete. |
| `t2-vs-fidelity.mjs` | The instrument behind the headline result. Compares the round-trip check's `tagCountDeltas` against `translation-errors.json`'s discrepancies as **sets of `module tag`, both directions**, never by count. Run it against `efnafraedi-2e` first: that is the control, and it is the only book where both instruments are populated. |
| `size-smallcaps.mjs` | Sizes the smallcaps fix by **predicted number** — for each module with an `<emphasis>` delta, does the loss equal (unhandled-effect count + different-effect nesting count)? An EXACT match means the named mechanism is the whole story for that module; a residual is a module with a mechanism nobody has named. |
| `failing-tests-at-HEAD.txt` · `failing-tests-at-branch-point.txt` | The full-suite failing test set at `feat/organic-kickoff` and at its branch point `b43800120`, as names. **They are identical** — which is how the C173 work was shown to introduce no regression. |

## How to re-run

```bash
# the census (0 ISK, writes nothing, ~10 s for all 33 units)
for ch in ch00 ch01 … ch31 appendices; do
  node tools/source-roundtrip-check.js lifraen-efnafraedi "$ch" --verbose > "$OUT/$ch.log" 2>&1
done

# the predictor — CHEMISTRY FIRST, it is the control
node t2-vs-fidelity.mjs efnafraedi-2e      <chemistry-log-dir>
node t2-vs-fidelity.mjs lifraen-efnafraedi <organic-log-dir>
```

⚠️ **Both `.mjs` files import `@xmldom/xmldom`, so they must be run from inside the repo tree** —
Node resolves from the *file's* location and the scratch directory has no `node_modules`. Copy them
somewhere under the repo (`pipeline-output/` is gitignored) rather than running them in place if
that matters.

⚠️ **`new DOMParser({errorHandler: …})` THROWS on the installed xmldom** — it is `{onError(){}}`
now. A probe written to the old signature dies before it measures anything.

## The one result to carry

The fidelity manifest only exists **after** a paid buy and an inject. The round-trip check needs
neither. On chemistry — 149 of 149 checked — the two agree on **15 of 17 pairs with the identical
diff value and 0 disagreements**; the 2 the manifest has alone are MT-side losses the round-trip
check structurally cannot see, because it injects the module's own English.

▶ **So an unbought book's allowlist workload is measurable before a single ISK is spent.** That is
what makes buying-to-sample unnecessary, and it is the reason this census was widened from one
chapter to all 33: at ~0.3 s per unit, choosing a sample costs more than measuring everything.
