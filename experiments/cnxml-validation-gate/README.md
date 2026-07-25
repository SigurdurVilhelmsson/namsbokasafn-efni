# CNXML schema validation gate — experiment

Does validating reinjected CNXML against OpenStax's own RelaxNG schema (via `jing`) give
us a reliable fail-loud gate, and what would it take to make it permanent?

**Answer: yes, and it's cheap (~0.7 s/chapter). Chemistry passes 149/149 today. Biology
has 13 real defects. Read [FINDINGS.md](FINDINGS.md).**

This is a **standalone experiment**. Nothing here is wired into the pipeline, the server,
or CI. Integration is a separate task requiring approval.

## Files

| File | What |
|---|---|
| [FINDINGS.md](FINDINGS.md) | **Start here** — verdict, bugs found, integration proposal, effort estimate |
| [BASELINE-REPORT.md](BASELINE-REPORT.md) | Per-file results, error classification, root-cause traces |
| [SETUP.md](SETUP.md) | Reproducible toolchain, schema selection, pinned SHAs, required flags |
| `validate-cnxml.js` | The gate prototype |
| `analyze-paired.mjs` | Paired original-vs-reinjected analysis used for the baseline |
| `allowlist.json` | Default allowlist — **empty**, as specified |
| `allowlist.recommended.json` | The three class-(c) upstream/schema noise rules, each documented |
| `external/` | OpenStax clones — **gitignored, never vendored** (AGPL-3.0) |
| `results/` | Raw jing output — gitignored |

## Quick start

```bash
# one-time: fetch the schema (see SETUP.md §2 for pinned SHAs)
cd experiments/cnxml-validation-gate/external
git clone --branch poet-schema --depth 50 https://github.com/openstax/cnxml.git cnxml

# validate anything
cd ..
node validate-cnxml.js ../../books/efnafraedi-2e/03-translated/mt-preview/ch12

# realistic run: suppress upstream/schema noise that pristine OpenStax content also trips
node validate-cnxml.js --allowlist allowlist.recommended.json ../../books/efnafraedi-2e/03-translated
```

Exit codes: `0` valid · `1` validation errors · `2` setup/fatal (missing schema, bad
allowlist, no input). Setup problems are never reported as document failures.

## Three things that will bite you if you reimplement this

1. **`jing -i` is mandatory.** Without it the grammar doesn't compile at all (CNXML's
   `table/@id` is `xsd:ID`, MathML 3's `anyElement` matches it untyped). `-i` is also
   OpenStax's own flag. Cost: no duplicate-id checking, so this script does its own.
2. **jing aborts the rest of the batch after a `fatal:` error.** A naive
   `jing schema.rng *.cnxml` silently skips every file after a malformed one — fail-quiet.
   This actually hid three real defects during the experiment.
3. **Pristine OpenStax content does not validate clean** (660/1192 files). That's a
   schema/upstream quirk, not our bug — hence the allowlist. Always compare against the
   paired original before blaming the pipeline.

## Licensing

`openstax/cnxml` and `openstax/cnx-transforms` are **AGPL-3.0**. They are cloned into
`external/` (gitignored) and never committed. `jing` is invoked as an external tool; the
`.rng` files are consumed as validation *data*. **No XSLT or code from those repos was
copied into this codebase.** Files read for understanding are cited in FINDINGS.md §8.
