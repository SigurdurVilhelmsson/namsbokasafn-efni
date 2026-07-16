# Item 8 — Boundary-check trio (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` § Phase 2, item 8.
**Date:** 2026-07-16
**Status:** design approved (user-confirmed); ready for writing-plans.

## Purpose

Three small, independent "boundary" guards that make the extract → MT → inject → render
pipeline self-checking ahead of biology intake. Each targets a class of *silent* drift
where one stage's assumption diverges from another's and the mismatch only surfaces
several stages downstream (or in the reader). None re-processes content, re-MTs, or touches
frozen seg-ids.

The three:

- **B3** — producer inline-marker count check (catch marker loss at the MT producer).
- **#15** — duplicate-seg-ID policy unification (one documented policy + a pre-freeze gate).
- **D2** — shared inline/block tag classification (stop the three stages disagreeing).

## PR structure

Two PRs, splitting enforcement from refactor (per the project's robustness feedback):

- **PR 1 — enforcement guards: B3 + #15.** Additive checks; zero runtime-behavior change to
  the existing pipeline. Cohesive as "producer / freeze-boundary guards."
- **PR 2 — refactor: D2.** Behavior-preserving consolidation, verified separately. Lowest
  urgency (no active bug — pure divergence-prevention); may slip if biology intake pulls
  priority to items #10/#11.

This spec covers all three; PR 1 implements B3 + #15, PR 2 implements D2.

---

## B3 — producer inline-marker count check

### Problem

`api-translate` already guards the *segment* boundary: `validateMarkers()` throws on a
`<!-- SEG: -->` count mismatch (truncation), and `countInlineMarkers()`/`normalizeSegMarkers()`
detect and repair markers the API glued onto the previous line. The B4-D11 paired round-trip
adds a term/footnote span count-guard.

**Gap:** nothing counts the inline *content* bracket markers — `[[i:]]`, `[[b:]]`, `[[sub:]]`,
`[[sup:]]`, `[[u:]]`, `[[em:]]`, `[[link:]]`, `[[xref:]]`, `[[docref:]]` — between the EN input
and the IS output. If Málstaður drops an `[[i:]]` or a `[[link:]]`, the SEG count is unchanged
so `validateMarkers` passes; the loss stays invisible until it shows up as a fidelity gap in
`translation-errors.json` three stages later. Bracket markers are the "0% loss" format, so ANY
loss is unexpected and worth surfacing at the source.

### Design

Add to `tools/api-translate.js` (or a small helper it imports):

- `countBracketMarkers(text)` → an object tallying each inline bracket type by its opening
  token, e.g. `{ i: n, b: n, sub: n, sup: n, u: n, em: n, link: n, xref: n, docref: n,
  term: n, fn: n }`. Counts opening tokens `[[<type>:` (type-prefixed), so it is robust to
  nested markers and to the `|id`/`|class`/`|url` payloads.
- A per-chunk comparison of input vs output tallies. Any type whose output count < input
  count is a **loss**; any type whose output count > input count is a **spurious add** (also
  reported — indicates API duplication/corruption).

### Behavior: warn + report, non-gating

Losses are **reported, not thrown.** Rationale: the API is nondeterministic and a single
dropped marker should not abort a whole module's (or `--chapter` batch's) MT run — that would
be more disruptive than the loss it guards. This mirrors the existing `countInlineMarkers`
precedent (visible producer diagnostic, repaired/flagged but non-fatal).

Output surface:
- Per-module: a one-line summary when any loss/add is detected, e.g.
  `m66438: bracket-marker delta — link -1, i -2 (input vs output)`.
- Run summary: total markers lost/added across the run, so a systemic problem is visible.
- Structured: fold the per-module deltas into the existing MT run report object so a caller
  (or a future gate) can read them; do not invent a new manifest file.

### Acceptance

- Unit: `countBracketMarkers` tallies each type correctly, including nested (`[[i:[[sub:x]]]]`
  counts i:1, sub:1) and payload-bearing (`[[link:t|url]]`, `[[term:t|id]]`).
- Unit: an input/output pair with a dropped `[[link:]]` reports `link -1`; a clean pair
  reports nothing.
- The check never throws; a lossy pair still writes `02-mt-output` (the loss is surfaced,
  not blocking).

---

## #15 — duplicate-seg-ID policy unification

### Problem

Two behaviors coexist with no documented single policy, and the enforcement half has no way
to distinguish a benign known duplicate from a new one:

- `seg-markers.cjs` `parseSegmentsMap(content, { duplicates: 'first' })` **silently** keeps
  the first occurrence of a repeated seg-id and drops the rest (the runtime consumers — inject,
  TM, etc. — all use this).
- The 6b coverage gate (`verify-extraction-coverage.js` → `analyzeModule` →
  `checkDuplicateSegIds`) **already fails** on duplicates: any module with a `sourceDup` or
  `rawDup` finding lands in `hasFindings`, and the CLI sets `process.exitCode = 1` on any
  flagged module. There is **no allowlist**.

The 6b calibration run found **12 duplicate para seg-ids across 4 frozen chemistry modules**
(`rawDup` class — the same source id emitted twice by the depth-blind renderer/extractor; the
source defines it once; identical text, so `parseSegmentsMap`'s `'first'` makes them benign at
runtime). Because the gate has no allowlist, **running it on frozen chemistry exits 1 today** —
a false alarm on content we have deliberately decided not to touch. Meanwhile a *future*
duplicate during biology intake could carry *different* text and silently drop content at inject
— exactly what the gate should catch.

So the missing piece is not enforcement (it exists) but a **grandfather mechanism** that keeps
the 12 benign frozen dups green while still failing on any new duplicate.

### Decision (user-confirmed): forbid forward, grandfather existing

One documented policy: **seg-ids must be unique per module.**
- **Runtime tolerance:** `parseSegmentsMap`'s `'first'` dedup stays as-is and is documented as
  the deliberate runtime tolerance, so already-frozen benign duplicates never break inject.
- **Freeze-boundary enforcement (already present):** the pre-freeze gate fails (exit 1) on a
  duplicate seg-id — with a new allowlist carve-out so a *known, grandfathered* duplicate is
  downgraded to informational and does not fail the gate.

### Design

- **Allowlist:** `books/<book>/dup-segid-allowlist.json` — mirrors the existing
  `residue-allowlist.json` pattern. Shape:
  ```json
  {
    "generated": "2026-07-16",
    "reason": "Pre-existing benign duplicate para seg-ids in frozen chemistry (rawDup; identical text; depth-blind duplicate-render class; 6b BIO finding). Do not extend without a content decision.",
    "entries": [
      { "module": "m68716", "kind": "rawDup", "segId": "m68716:para:fs-idm9637984", "note": "source defines once; emitted 2×; identical text" }
    ]
  }
  ```
  Populated from the actual 12 (enumerated during implementation from a live
  `verify-extraction-coverage --book efnafraedi-2e --json` run).

  **Match key precisely:** `segId` is the exact string the finding reports — for `kind:"rawDup"`
  the full `module:type:elementId` seg-id (`RAW_SEG_MARKER` capture); for `kind:"sourceDup"` the
  source element `id`. The gate matches `(module, kind, segId)` so the two dimensions never
  cross-match. The 12 known dups are all `rawDup`.
- **Gate change:** `verify-extraction-coverage.js` loads the book's allowlist (absent file →
  empty) and, for each module's `dupFindings`, splits entries into **flagged** (not allowlisted)
  and **tolerated** (allowlisted). `hasFindings` / the exit-1 decision count only flagged dups;
  tolerated dups print as an informational `tolerated` note — mirroring the residue gate's
  `stats.residues` vs `stats.tolerated` split. List-drop findings are unaffected.
- **Policy doc:** a header comment in `seg-markers.cjs` states the canonical policy (seg-ids
  unique; `'first'` = deliberate runtime tolerance; the pre-freeze gate + allowlist = the
  enforcement seam) and cross-references the gate. This resolves the "do not consolidate here"
  note in `extraction-coverage.js`.

Note: the allowlist match key is the **raw seg-id** as `checkDuplicateSegIds` reports it
(`rawDup.segId` / `sourceDup.id`), scoped per book+module — confirmed against the live gate
output during implementation so the 12 match exactly.

### Scope guard (frozen content)

This change adds **no** re-extraction and does **not** modify any `02-*`/`03-*` chemistry file.
The 12 dups are recorded in the allowlist exactly as they exist; chemistry seg-ids are
untouched. (The alternative "fix the 12" was rejected — it would renumber 4 frozen modules =
the BIO-EX2 export-corpus risk, for dups that are currently benign.)

### Acceptance

- Unit: the gate fails (exit 1) on a module with a non-allowlisted duplicate seg-id.
- Unit: the gate passes (dup downgraded to `tolerated`) when the duplicate is allowlisted.
- Integration: the gate run over frozen `efnafraedi-2e` (with the 12 grandfathered) is green.
- The runtime path (`parseSegmentsMap` / inject) is unchanged — verified by the existing suite
  staying green.

---

## D2 — shared inline/block tag classification

### Problem

Three independent classifications of "inline vs block / handled vs not" exist and can drift:

- `tools/lib/preintake-checks.js` — `HANDLED_INLINE` (emphasis, sub, sup, link, term, footnote,
  newline, space, math) and `HANDLED_BLOCK` (para, figure, media, list, item, table, …,
  section). The richest, canonical set.
- `tools/lib/cnxml-dom.js` — `BLOCK_TAGS` = {list, equation, figure, table, note, media, para}
  (a smaller DOM-traversal set for a different question).
- `tools/cnxml-render.js` — inline lists + `ITEM_INLINE_OK`
  (`[...LOUD_SEAM_IGNORE, para, space, image, span]`).

A tag classified inline by one stage and block by another causes the exact silent
extract/render drift the campaign has repeatedly fixed.

### Design (behavior-preserving refactor)

- New `tools/lib/handled-tags.js` (ESM) exporting the canonical `HANDLED_INLINE` /
  `HANDLED_BLOCK` sets. `preintake-checks.js` re-exports from it (keeps its public surface).
- The extractor and renderer import the shared sets **where they currently hardcode an
  equivalent list**, so a tag's inline/block classification has one source of truth.
- **Do not force-merge purpose-specific subsets.** `cnxml-dom`'s `BLOCK_TAGS` (DOM traversal)
  and the renderer's `ITEM_INLINE_OK` (which tags may appear inline *inside a list item*) answer
  narrower questions than "does the pipeline handle this tag." Where a subset is genuinely a
  different concept, keep it but **document its relationship** to the canonical set (and, where
  cheap, derive it from the canonical set rather than restating literals). The goal is "cannot
  silently disagree on a tag," not "one literal list for every purpose."

### Behavior-preservation verification

- The set membership before/after must be identical for every consumer. A focused test asserts
  the shared sets equal the old literals (so the refactor provably changes nothing).
- Corpus render/extract equivalence over the existing books (reuse the render-diff /
  `verify-reextract-equivalence` harness) shows 0 changes.

### Acceptance

- Unit: `handled-tags.js` exports sets equal to the prior `preintake-checks.js` literals.
- Unit: each consumer that adopted the shared set classifies the same tags as before.
- Corpus: extract + render equivalence, 0 diffs.
- Full suite green.

---

## Out of scope (explicitly)

- No re-extraction, re-MT, re-render, or content delivery.
- No change to `parseSegmentsMap`'s runtime dedup behavior (only its documentation + a
  separate gate).
- No fixing of the 12 frozen-chem duplicate seg-ids (grandfathered, not repaired).
- No forced merge of `BLOCK_TAGS` / `ITEM_INLINE_OK` into the canonical set where they are
  genuinely different concepts.

## Testing strategy

TDD per piece. New Vitest specs under `tools/__tests__/`:
`api-translate-bracket-count.test.js` (B3), `dup-segid-gate.test.js` (#15),
`handled-tags-shared.test.js` (D2). `npm test` from repo root is the authoritative gate.
