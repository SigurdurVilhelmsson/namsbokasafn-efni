# C16 legacy-guard audit scripts

Read-only measurement harness for register item **§C16** (partially-live Markdown/Matecat-era
legacy). Findings: [`docs/audit/2026-08-07-c16-partially-live-legacy-audit.md`](../../docs/audit/2026-08-07-c16-partially-live-legacy-audit.md).

Committed so the numbers can be **re-derived rather than trusted** — that audit's own closing
warning is that every figure is a measurement of a moving target.

## Why these exist rather than a grep

§C16's figures came from shape regexes over segment text, and §C16 itself records that method
mis-scoring chemistry's MathML `<mo>_____</mo>` blanks: *"a regex census alone would have
mis-scored them."*

These scripts instead **A/B the real function**. They import `reverseInlineMarkup` from
`tools/cnxml-inject.js`, then import it again from a byte-identical copy of that module whose
`hasApiMarkers` const is forced to a literal, and diff the two outputs per segment. **The only
variable is the guard**, and every preceding transform (math stashing, bracket resolution, link
conversion) runs in production order — which is exactly what a regex over raw text cannot do.

## Usage

```bash
# What the legacy branch actually changes today (guard forced TRUE):
node experiments/c16-legacy-audit/audit-guard-firings.mjs /tmp/firings.json

# What a guard FLIP would break — the C13-class hazard (guard forced FALSE):
node experiments/c16-legacy-audit/audit-guard-flip.mjs /tmp/flip.json

# Either script over a different source track:
STAGE=03-faithful-translation node experiments/c16-legacy-audit/audit-guard-firings.mjs /tmp/f.json
```

`STAGE` defaults to `02-mt-output`; `03-faithful-translation` and `04-localized-content` are the
other editable tracks. Paths resolve from `import.meta.url`, so **cwd does not matter** (and
must not — CLAUDE.md's durable rule).

## What they touch

- **Read-only over `books/`.** Nothing under `books/` is opened for writing.
- Each writes **one temp module into `tools/`** (`__c16_audit_*.mjs`, a patched copy of
  `cnxml-inject.js`) and removes it in a `finally`. If a run is killed hard, delete any
  `tools/__c16_audit_*.mjs` by hand before committing.
- Output JSON goes wherever you point argv[2].

## Traps worth knowing before you edit them

- **Do not truncate the stored strings.** The first version of `audit-guard-firings.mjs` cut
  them at 400 chars; for 11 long segments both sides were truncated identically and the diff
  reported *"no change"* where the change was merely **unobserved**. Distinguish *no effect*
  from *no observer*.
- **The patch is asserted, not assumed.** Both scripts throw if the `hasApiMarkers` regex shape
  no longer matches their patch target — otherwise a silently-unapplied patch would make the
  whole audit vacuously report zero differences.
- **State the counting unit.** These count **segments**, as parsed by the shipped
  `parseSegments()`. §C16's own figures mix per-segment and per-file units.
