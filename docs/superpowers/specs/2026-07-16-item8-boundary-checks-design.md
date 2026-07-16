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

Two behaviors coexist with no documented single policy, and the enforcement half measures the
wrong thing:

- `seg-markers.cjs` `parseSegmentsMap(content, { duplicates: 'first' })` **silently** keeps
  the first occurrence of a repeated seg-id and drops the rest (the runtime consumers — inject,
  TM, etc. — all use this).
- The 6b coverage gate (`verify-extraction-coverage.js` → `analyzeModule` →
  `checkDuplicateSegIds`) **already fails** on duplicates: any module with a `sourceDup` or
  `rawDup` finding lands in `hasFindings`, and the CLI sets `process.exitCode = 1`. The dup check
  counts **raw seg-id repetition** — it cannot tell a benign duplicate from one that drops content.

**Corrected measurement (2026-07-16, live gate run — supersedes the 6b register's "12 dups /
4 modules", which was a partial observation).** Frozen `efnafraedi-2e` actually has **285
`rawDup` seg-ids across 83 modules** (0 `sourceDup`). Verified against the segment text:
**all 285 are benign** — 214 byte-identical, 71 differ *only* in `[[MATH:N]]` placeholder
indices (same visible words). After normalizing opaque `[[MATH]]`/`[[MEDIA]]` placeholders with
`normalizeVisibleText`, **all 285 have identical visible text — zero real content drops.** This
is the depth-blind duplicate-*emission* artifact: the same unique source element is emitted twice
into `02-for-mt`; `'first'`-wins picks the correct words and the source element is filled once, so
nothing reaches the reader wrong (consistent with the 126-PERFECT fidelity count).

So the gate's current raw-repetition test both **false-fails on 285 benign chem dups** *and*
would **conflate** a benign artifact with a real content drop. The fix is to measure **content**,
not form.

### Decision (user-confirmed): forbid forward, grandfather existing — implemented semantically

One documented policy: **a seg-id's occurrences must carry the same visible content.**
- **Runtime tolerance:** `parseSegmentsMap`'s `'first'` dedup stays as-is and is documented as
  the deliberate runtime tolerance, so already-frozen benign duplicates never break inject.
- **Freeze-boundary enforcement:** the pre-freeze gate fails (exit 1) only when a duplicate
  seg-id's occurrences have **different normalized visible text** (a real content drop). A
  duplicate whose occurrences share the same visible text — byte-identical, or differing only in
  opaque `[[MATH:N]]`/`[[MEDIA:N]]` indices — is **benign**: reported as an informational note,
  never a failure. Grandfathering happens by *semantics*, so no allowlist and no per-book snapshot
  is needed; every current benign dup passes and every future content-dropping dup fails.

### Design

- **`checkDuplicateSegIds` gains visible-text classification.** For each seg-id that appears more
  than once, collect all occurrence texts, run each through `normalizeVisibleText`
  (import from `verify-reextract-equivalence.js` — same normalizer the 6b coverage check already
  reuses), and classify:
  - all normalized texts equal → **benign** (`{ segId, count, kind: 'benign' }`).
  - any differ → **real** (`{ segId, count, kind: 'real', sampleA, sampleB }`).

  This requires the *segment text*, which `checkDuplicateSegIds` already receives (`segText`
  param). The `rawDup` raw-count logic stays (it is what surfaces the repetition); the new step
  only labels each raw dup benign-vs-real. `sourceDup` (a source `id` on >1 element) has no
  segment text to compare and remains a hard finding (it is a genuine source-data collision; none
  exist in chemistry today).
- **Gate change.** `verify-extraction-coverage.js`: only `real` rawDups and any `sourceDup`
  count toward `hasFindings` / exit 1. `benign` rawDups print as an informational
  `benign duplicate seg-id (N×, identical visible text)` note and a summary count — mirroring the
  residue gate's `stats.residues` vs `stats.tolerated` split. List-drop findings are unaffected.
- **Policy doc.** A header comment in `seg-markers.cjs` states the canonical policy (a seg-id's
  occurrences must share visible content; `'first'` = deliberate runtime tolerance; the pre-freeze
  gate = the enforcement seam, content-based). This resolves the "do not consolidate here" note in
  `extraction-coverage.js`.

### Scope guard (frozen content)

This change adds **no** re-extraction, **no** allowlist file, and modifies **no** `books/` file.
Chemistry's 285 benign dups pass by measurement, untouched. (The alternative "fix the dups" was
rejected — it would renumber frozen modules = the BIO-EX2 export-corpus risk, for dups that lose
no content.)

### Acceptance

- Unit (`checkDuplicateSegIds`): two occurrences of one seg-id with identical text → classified
  `benign`; with different words → `real`; with same words but different `[[MATH:N]]` index →
  `benign`.
- Unit (gate): a module with a `real` dup exits 1; a module whose only dups are `benign` exits 0
  (with an informational note).
- Integration: `verify-extraction-coverage --book efnafraedi-2e` exits **0** (285 benign, 0 real),
  where it exits 1 today — the concrete proof the gate stopped false-failing on frozen chemistry.
- The runtime path (`parseSegmentsMap` / inject) is unchanged — existing suite stays green.

### Secondary (note, not a task here)

The same gate run reported `modulesMissingSource: 21` — modules the gate could not match to a
`01-source` file. The file-direct dup scan above covered all `02-for-mt` regardless, so the
285/all-benign result is complete. The gate's own source-matching gap is logged for a later look
(does not block this work).

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
- No change to `parseSegmentsMap`'s runtime dedup behavior (only its documentation).
- No allowlist file and no `books/` change for #15 — benign dups pass by semantic measurement.
- No fixing of the 285 benign frozen-chem duplicate seg-ids (they lose no content; repairing
  would renumber frozen modules = BIO-EX2 risk).
- No fix for the depth-blind duplicate-*emission* root cause, nor the gate's
  `modulesMissingSource` source-matching gap (both logged for later).
- No forced merge of `BLOCK_TAGS` / `ITEM_INLINE_OK` into the canonical set where they are
  genuinely different concepts.

## Testing strategy

TDD per piece. New Vitest specs under `tools/__tests__/`:
`api-translate-bracket-count.test.js` (B3), `dup-segid-gate.test.js` (#15),
`handled-tags-shared.test.js` (D2). `npm test` from repo root is the authoritative gate.
