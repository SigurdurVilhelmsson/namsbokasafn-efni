# Design Spec: CNXML Fidelity Fixes for API Translation Pipeline

**Date:** 2026-03-18
**Updated:** 2026-03-18 (corrected with API pipeline empirical data)
**Status:** Approved
**Reference:** `docs/pipeline/cnxml-fidelity-gaps.md`

## Purpose

Fix structural discrepancies between source CNXML and translated CNXML produced by the **API translation pipeline** (extract → api-translate.js → inject). Build a validation tool for ongoing fidelity regression detection.

## Context: Old vs API Pipeline Results

Initial testing used the old manual pipeline output (protect → web UI → unprotect). Re-testing with the API pipeline revealed **fundamentally different issues**:

| Issue | Old Pipeline | API Pipeline | Change |
|-------|-------------|-------------|--------|
| `<emphasis>` lost | -15 | **-3** | 5x better — protect/unprotect was causing most losses |
| `<term>` | -1 | **+56** | New — massive overproduction in m68664 |
| `<sup>` | -4 | **+2** | Reversed — now overproducing |
| `<equation>` wrapper | -3 | -3 | Same |
| `<link>` (cross-doc) | -2 | -2 | Same |
| `<newline/>` | -2 | 0 | Fixed by API (markers survive intact) |
| `<definition>` / `<meaning>` | 0 | -2 | New — from SEG tag corruption |
| m68670 | 6 issues | **PERFECT** | Fixed by API |
| **Total** | 27 | ~68 | Different problems, dominated by term overproduction |

**Key insight:** The API preserves markers much better than the web UI. But this exposes a latent bug in `reverseInlineMarkup()` — it can't reliably distinguish `__term__` from `**bold**` in the API output, causing massive term overproduction.

## Gaps (API Pipeline)

### Gap A: Term Overproduction (+56 in m68664) — HIGHEST PRIORITY

**What:** m68664 has 16 `<term>` elements in source but 72 in translated output.

**Root cause hypothesis:** The extraction converts `<term>text</term>` → `__text__` and `<emphasis effect="bold">text</emphasis>` → `**text**`. In the old pipeline, protect converted `__term__` → `{{TERM}}text{{/TERM}}`, preserving the distinction. The API sends raw segments where both `__` and `**` survive. But the MT engine may convert `**bold**` to `__bold__` (or vice versa), and `reverseInlineMarkup()` then treats all `__text__` as terms.

**Investigation:** Compare EN source segments with IS API output for m68664 — find all `__` and `**` markers and trace which ones the API changed.

**Fix location:** `tools/cnxml-inject.js` reverseInlineMarkup() — the term/bold disambiguation logic.

### Gap B: SEG Tag Corruption (m68683)

**What:** API translated `<!-- SEG:m68683:glossary-def:fs-idm327357936-def -->` as `<!-- SEG:m6-8683:glossary-def:fs-idm327357936-def -->`, inserting a hyphen in the module ID. This causes 1 missing segment at injection, losing a `<definition>` and `<meaning>` element.

**Root cause:** The MT engine treats the numeric module ID as a number and adds a thousands separator or hyphen. This is content-dependent — only some SEG tags are affected.

**Fix options:**
1. Post-processing in `api-translate.js`: normalize SEG tags after translation (regex-fix corrupted IDs by comparing against the input's SEG tags)
2. Pre-processing: add the module ID to a protected pattern list

**Recommended:** Post-processing — scan output for `<!-- SEG:` tags and validate each against the input's tags. Fix corrupted IDs by finding the closest match.

### Gap C: Emphasis Loss (-3 across m68664 and m68674)

**What:** 3 `<emphasis>` elements lost. Much smaller than the old pipeline's 15.

**Investigation:** Find the specific 3 cases and determine if they are extraction, MT, or injection issues.

### Gap D: Equation Wrappers (-3 in m68667 and m68683)

**What:** `<equation>` wrapper elements around `<m:math>` blocks not reconstructed. Same issue in both pipelines.

**Investigation:** Check whether structure.json stores equation metadata. If not, extraction needs to store it.

### Gap E: Cross-Document Links (-2 in m68674 and m68690)

**What:** `<link document="m68860">Appendix B</link>` (no target-id) becomes plain text. Same issue in both pipelines.

**Fix:** Add extraction support for `<link document="...">` without target-id.

### Gap F: Superscript Overproduction (+2 in m68674)

**What:** 2 extra `<sup>` elements appear in translated output. The API or injection is creating superscripts where the source doesn't have them.

**Investigation:** Find the 2 extra superscripts and determine source.

## Approach

Combined investigate+fix per gap. For each:
1. Forensic analysis: trace the specific failing element through extract → segments → API MT → inject
2. Identify root cause
3. Write targeted fix + regression test
4. Verify with the validation tool

## Task Order (revised for API pipeline)

1. **Build validation tool** — establishes baseline measurement
2. **Fix A: Term overproduction** — highest priority, 56 extra terms
3. **Fix B: SEG tag corruption** — post-process API output to fix damaged IDs
4. **Fix E: Cross-doc links** — focused extraction/injection change
5. **Fix D: Equation wrappers** — structural investigation
6. **Fix C: Emphasis loss** — 3 remaining cases
7. **Fix F: Superscript overproduction** — 2 extra sups
8. **Final validation run**

## Files

| File | Action | Purpose |
|------|--------|---------|
| `tools/cnxml-fidelity-check.js` | Create | Validation tool |
| `tools/api-translate.js` | Modify | Fix B (SEG tag post-processing) |
| `tools/cnxml-extract.js` | Modify | Fix E (cross-doc links) |
| `tools/cnxml-inject.js` | Modify | Fixes A, C, D, E, F (inline markup) |
| `tools/__tests__/pipeline-integration.test.js` | Modify | Regression tests |

## Success Criteria

`node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1` reports 0 discrepancies against source CNXML.

## Server-Side Glossaries (Related Enhancement)

The Málstaður API supports server-side glossaries associated with the account. Two chemistry glossaries are already configured (618 terms each). Using server-side glossaries instead of inline glossaries eliminates the 35KB payload overhead per request. This is a separate enhancement to `api-translate.js` but should be done before batch translation.
