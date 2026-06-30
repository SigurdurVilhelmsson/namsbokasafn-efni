# Audit #14 — SEG-marker parser unification (Design)

**Status:** approved by user 2026-06-29, ready for implementation plan.
**Roadmap item:** audit #14 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(folded into biology onboarding). **Guiding directive:** robustness & future-proofing over expedience
(`feedback-robustness-over-expedience`) — specifically *split behavior-preserving refactor from
behavior-changing enforcement*.

## Problem

The `<!-- SEG:module:type:elementId -->` segment-marker format is parsed by **7 hand-maintained copies**
of `parseSegments` plus several ad-hoc SEG regexes — `cnxml-inject.js:173`, `generate-tm.js:54`,
`repair-emphasis.js:41`, `lib/module-sections.js:87`, `auto-insert-placeholders.js:58`,
`server/services/segmentParser.js:102`, and an inline copy in `docx-import.js:148`. This copy-paste
divergence caused the PR #96 drift (a line-based parser dropped segments whose text shared a line with
the next marker). As more books onboard, more drift is the risk.

## Evidence (measured 2026-06-29, before designing)

Three checks against the **real corpus** decided scope and the canonical form:

1. **Parser variants are inert on biology** — all three live variants produce **0 differing maps** across
   all 13 biology segment files. Consolidation is hygiene/risk-reduction, **not** a biology bug fix.
2. **Regex choice is a proven no-op corpus-wide** — across **523 segment files / 54,379 markers**, the
   permissive (`[^\s]+`), strict (`\w+:\w-:\w-`), and exact-one-space regexes match **identically**.
   Every ID is 3-part; no whitespace or odd-char variants exist in practice. The strict regex misses 0.
3. **Duplicate-ID policy IS exercised** — **185 files** contain duplicate SEG IDs. So first-wins vs
   last-wins genuinely differ on real input; converging them is a *behavior change*, not a no-op. It must
   be preserved per-site (deferred convergence = the separate enforcement step).

**Corollary (scope boundary):** the `isApiTranslated` content-sniff (`cnxml-inject.js:3361`) — which
mis-routes 9/13 biology modules to the legacy web-UI marker-repair path because biology is a low-marker
book — is the *real* biology correctness risk, but it is a **provenance** problem (needs the unbuilt
"B2" tool/track provenance; A1's manifest carries none). It is **re-scoped as its own item**, NOT part of
#14. This refactor does **not** claim to unblock biology routing.

## Design — `tools/lib/seg-markers.js` (one regex, one parser)

A single module replaces all 7 copies. Behavior at every call site is **preserved exactly** via options;
no policy is converged in this PR.

```js
// Canonical marker — whitespace-tolerant, permissive 3-part id.
// Proven identical to all variants on 54,379 corpus markers.
export const SEG_MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;

// Map<id,text>. Marker-based slicing (content = marker→next marker, trimmed),
// so it tolerates a marker glued onto the previous line (the PR #96 case).
//   duplicates: 'first' (skip repeats) | 'last' (overwrite)
export function parseSegmentsMap(content, { duplicates = 'first' } = {}) { … }

// Structured, keep-ALL records (order preserved). content trimmed, NOT
// wrap-normalized (callers that need that apply it themselves).
//   → [{ segmentId, moduleId, segmentType, elementId, content }]
export function parseSegmentRecords(content) { … }
```

- **One implementation**, marker-based (matchAll + slice), so the glued-marker robustness lives in exactly
  one place.
- `duplicates` defaults to `'first'` (the majority + the load-bearing inject path).
- `parseSegmentRecords` keeps all occurrences (segmentParser's contract) and splits the id into parts.
- No `normalizeWraps` in the lib — it is editor-display-specific and stays in `segmentParser.js`.

## Call-site migration (each preserves current behavior)

| Site | Today | Becomes |
|------|-------|---------|
| `cnxml-inject.js:173` | first-wins Map (+dup-count log) | `parseSegmentsMap(c)`; keep the dup-count log in inject |
| `generate-tm.js:54` | first-wins Map (strict regex) | `parseSegmentsMap(c)` (regex proven equivalent) |
| `repair-emphasis.js:41` | first-wins Map | `parseSegmentsMap(c)` |
| `lib/module-sections.js:87` | **last-wins** Map | `parseSegmentsMap(c, { duplicates: 'last' })` |
| `auto-insert-placeholders.js:58` | **last-wins** Map | `parseSegmentsMap(c, { duplicates: 'last' })` |
| `server/services/segmentParser.js:102` | records + `normalizeWraps` + keep-all | `parseSegmentRecords(c)`, then map `normalizeWraps` onto `.content` |
| `docx-import.js:148` (inline copy) | array w/ id parts | `parseSegmentRecords(c)` (adapt field names) |

`generate-tm.js` also exports/uses `SEG_MARKER_REGEX` elsewhere → re-export or import `SEG_MARKER` so
there is one regex. Archived `tools/archived/*` copies are out of scope (dead code).

## Testing

- **Unit tests** for `seg-markers.js`: first-wins vs last-wins on a dup-id fixture; `parseSegmentRecords`
  keep-all + id-part split; glued-marker case (marker on previous line); whitespace-tolerant marker;
  empty input; trailing segment (EOF).
- **Characterization (the no-op proof):** for a representative set of **real corpus files including
  dup-ID files**, assert each call site's new output is **identical** to the pre-refactor output. Capture
  golden output from the current implementations first (snapshot), then assert equality after migration.
- Full `npm test` green (the suite already covers inject/generate-tm/segmentParser/repair-emphasis).

## Explicitly out of scope (logged to the plan's register)

- **`isApiTranslated` routing fix** → its own provenance item (the real biology blocker; needs B2).
- **#15 duplicate-policy convergence** (making every site first-wins) → the behavior-changing enforcement
  PR; only after this no-op refactor lands.
- **#18 whitespace-tolerance** — already absorbed (canonical regex is the tolerant superset).
- **#19 orphan legacy `*-segments(b|c|d).en.md`** files → separate cleanup.

## Acceptance

One `tools/lib/seg-markers.js`; all 7 live call sites use it; characterization proves byte-identical
output on the real corpus (incl. dup-ID files); unit tests cover the lib; `npm test` green.
