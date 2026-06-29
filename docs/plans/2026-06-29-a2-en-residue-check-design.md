# A2 — Untranslated-EN Residue Check (Design)

**Status:** approved by lead 2026-06-29, ready for implementation plan.
**Roadmap item:** A2 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track A — correctness & trust gates). Also closes editorial-throughput roadmap Unit 4.
**Scope decision:** inject-side only this PR; the server save/submit surface is a deliberate
follow-up that will reuse the same lib.

## Problem

The injection gate checks segment **presence**, never **translatedness**. A module whose
`03-faithful-translation` (or `02-mt-output`) segments are still verbatim English passes as
`COMPLETE` and ships. This is the failure mode behind the os-embed English exercises and MTPE
residue (a reviewer leaving English fragments). `report.complete` today is:

```js
complete: stats.segmentsMissing.length === 0 && stats.mathUnresolved.length === 0
```

— presence + math-resolution only.

## Key enabling fact

`loadModuleInputs` (`tools/cnxml-inject.js:3219-3223`) already loads `enSegments` (the EN source
map, ID-keyed) alongside the IS `segments` map, for term-marker restoration. `buildCnxml`
already receives `enSegments` in `options` (`:3374`). So the EN↔IS comparison is a per-segment-ID
join on data already in memory — **no new file reads.**

## Detection approach (decided: hybrid — exact gates, ratio warns)

Two tiers, both keyed on segment ID, both comparing the **raw marker-form** text
(`segments.get(id)` before `reverseInlineMarkup`, vs `enSegments.get(id)` — same marker form):

1. **Exact-normalized match → GATES `complete`.** After normalizing both sides identically
   (strip marker delimiters but keep inner content; drop numbers/punctuation/symbols; collapse
   whitespace; lowercase), if `normEN === normIS` and the IS side has `≥ minTokens` alphabetic
   word tokens, the segment is a verbatim-untranslated residue. Near-zero false positives.
2. **Token-overlap ratio ≥ threshold → WARNS only.** For segments that aren't exact but are
   "mostly English" (partial MTPE residue), emit a non-blocking warning + manifest entry. A
   heuristic must never block a publish on its own.

**Why keep marker inner content during normalization:** a translated `[[i:fast efni]]` differs
from EN `[[i:solid]]` after normalization (correctly flagged as translated); an untranslated
segment keeps identical inner content (correctly flagged as residue). Stripping only the
delimiters preserves that signal. The same logic covers legacy `{{term}}…{{/term}}` /
`{{fn}}…{{/fn}}`, xref `[#…]`, and `[[MATH:N]]` / `[[MEDIA:N]]` placeholders.

**Thresholds (named constants):** `minTokens = 3`, `warnThreshold = 0.7`. The `minTokens` floor
exempts 1–2-word segments (many section titles, chemical formulas, cognates) from the gate to
protect against shared-vocabulary false positives — an intentional precision/recall trade.

## Components

### 1. `tools/lib/residue-check.js` — pure detector (no I/O)

- `normalizeForComparison(text) → string`
- `countAlphaTokens(normalized) → number`
- `tokenOverlapRatio(enNorm, isNorm) → number` (0–1, overlap coefficient on token sets)
- `detectResidue(enText, isText, opts) → { alphaTokens, exact, ratio, warn }`

Self-contained marker-strip regexes live here for now. If/when B3 lands a canonical shared
bracket-marker lib, this converges on it — A2 does **not** block on B3.

### 2. Wire into `buildCnxml` (`tools/cnxml-inject.js`)

In `getSeg`, before `reverseInlineMarkup`, run `detectResidue(enSegments.get(id), text)` and
accumulate into two new `stats` arrays: `residues` (exact) and `residueWarnings` (ratio). Surface
both on `report`. Extend the completeness line (`:1677`):

```js
complete: stats.segmentsMissing.length === 0
  && stats.mathUnresolved.length === 0
  && stats.residues.length === 0,
```

Guard: only run detection when an EN counterpart exists for the segment ID (skip silently if
`enSegments` is empty — e.g. EN-fallback inject, where the comparison is meaningless).

### 3. CLI surfacing + override

The existing write-gate (`:3385`, `if (!result.report.complete && !args.allowIncomplete)`) now
catches residues for free. Add a distinct console block listing residue segment IDs (so the
operator sees *why* it's incomplete — residue vs missing-segment vs unresolved-math). Print
`residueWarnings` always (non-blocking). **Override reuses the existing `--allow-incomplete`** —
no new flag; consistent with how missing-segments already override.

### 4. Residue manifest — `books/<book>/residue-report.<track>.json`

Separate from `translation-errors.json` (single responsibility: that file is tag-count fidelity,
this is translatedness). Aggregated in `main()` across the chapter's modules. Schema shaped for a
future server endpoint to read directly:

```json
{
  "track": "faithful",
  "generatedBy": "cnxml-inject.js",
  "summary": { "modules": 12, "modulesWithResidue": 1, "exactResidues": 3, "ratioWarnings": 5 },
  "modules": {
    "m68784": {
      "exact": ["m68784:para:fs-idm25079776"],
      "warnings": [{ "segmentId": "m68784:caption:CNX_…", "ratio": 0.82 }]
    }
  }
}
```

Read-merge-preserve across injects (mirror A1's manifest pattern) so a per-chapter inject doesn't
clobber other chapters' records. Track-qualified filename so a faithful inject and an mt-preview
inject keep separate residue records.

### 5. Tests (TDD — written first)

- `tools/__tests__/residue-check.test.js` — pure detector: exact EN-residue fires; clean IS
  translation doesn't; sub-`minTokens` short cognate doesn't fire; ratio-warn fires on
  mostly-English-one-word-changed; markers/numbers stripped; Icelandic letters (þ/æ/ö/ð/á…)
  counted as alpha (not stripped as symbols).
- Extend `tools/__tests__/cnxml-inject.test.js` — fixture module with one verbatim-EN segment →
  `report.complete === false` + `report.residues` lists it; all-translated fixture →
  `report.complete === true`, empty `residues`.

## Acceptance criteria (from the roadmap)

- An untranslated-English module no longer reports `COMPLETE`.
- Residues listed (console + machine-readable manifest).
- Tests with EN-residue and clean fixtures, green on the local gate (`npm test`).

## Out of scope (deliberate)

- Server editor save/submit surface (follow-up PR, reuses `residue-check.js`).
- Any change to A1's `translation-errors.json` schema.
- B3's canonical shared marker lib (A2 carries a local strip helper until B3 lands).
