# Design Spec: CNXML Inline Markup Fidelity Fixes

**Date:** 2026-03-18
**Status:** Approved
**Depends on:** Merged API integration (commit `462bffd`)
**Reference:** `docs/pipeline/cnxml-fidelity-gaps.md` (empirical data)

## Purpose

Fix 27 missing inline elements found in chapter 1's source-vs-translated CNXML comparison. Build a validation tool for ongoing fidelity regression detection.

## Context

Empirical comparison of 7 ch01 modules found these structural discrepancies between source CNXML (`01-source/`) and translated CNXML (`03-translated/mt-preview/`):

| Gap | Element | Lost | Modules Affected |
|-----|---------|------|-----------------|
| A | `<emphasis>` | 15 | m68664 (-9), m68670 (-5), m68674 (-1) |
| B | `<link document="...">` (no target-id) | 2 | m68674 (-1), m68690 (-1) |
| C | `<sup>` | 4 | m68674 |
| D | `<equation>` wrapper | 3 | m68667 (-1), m68683 (-2) |
| E | `<newline/>` + `<term>` | 3 | m68667, m68670, m68683 |

## Approach

Combined investigate+fix per gap. For each:
1. Forensic analysis: trace the specific failing element through extract → segments → MT → inject
2. Identify root cause (extraction bug, MT damage, injection regex miss)
3. Write targeted fix + regression test
4. Verify with the validation tool

## Components

### 1. Validation Tool (`tools/cnxml-fidelity-check.js`)

CLI tool that compares XML tag structure between source and translated CNXML.

```bash
# Check a single module
node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1 --module m68674

# Check entire chapter
node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1

# Check entire book
node tools/cnxml-fidelity-check.js --book efnafraedi-2e
```

**Output:** Per-module report of element count differences:
```
m68664: 1 discrepancy
  emphasis: 17 → 8 (-9)
m68674: 3 discrepancies
  emphasis: 6 → 5 (-1)
  link: 16 → 15 (-1)
  sup: 79 → 75 (-4)
...
Summary: 27 discrepancies across 6/7 modules
```

**Implementation:** Count opening tags by element name in both files, report differences. Exclude `md:content-id` and other non-structural metadata tags. Uses `BOOK_OPTION`, `CHAPTER_OPTION`, `MODULE_OPTION` from `parseArgs.js`.

Exit code 0 if no discrepancies, 1 if any found.

### 2. Fix B: Cross-Document Links Without target-id

**Root cause:** `cnxml-extract.js` line ~263 requires both `document` AND `target-id` attributes. `<link document="m68860">Appendix B</link>` (no target-id) falls through and becomes plain text.

**Fix in extraction:** Add a case for `<link document="...">text</link>` without target-id. Extract as `[text](doc:m68860)` — a new link format using the `doc:` prefix to distinguish from URLs.

**Fix in injection:** In `reverseInlineMarkup()`, add reverse conversion: `[text](doc:m68860)` → `<link document="m68860">text</link>`. Also handle self-closing: `[doc:m68860]` → `<link document="m68860"/>`.

**Impact:** Requires re-extraction of affected modules to get the new link format into segment files. Existing MT output for those segments would need re-translation or manual patching.

### 3. Fix D: `<equation>` Wrapper Elements

**Root cause (to investigate):** The MathML content is preserved via `[[MATH:N]]` → equations.json → restored inline. But standalone `<equation id="..." class="...">` elements that wrap `<m:math>` blocks may not be reconstructed. The injection may insert the MathML inline without the wrapping `<equation>` tag.

**Fix:** Investigate whether structure.json stores equation wrapper metadata. If yes, injection should reconstruct the wrapper. If not, extraction needs to store it.

### 4. Fix C: `<sup>` Round-Trip (4 lost in m68674)

**Root cause (to investigate):** The extraction converts `<sup>N</sup>` → `^N^`. Injection uses regex with lookbehind/lookahead to reverse. Failures likely occur when `^` is adjacent to `[[MATH:N]]` placeholders, `<!-- SEG -->` tags, or other markup.

**Fix:** Identify the 4 specific superscripts that fail, find the common pattern, adjust the regex.

### 5. Fix A: `<emphasis>` Round-Trip (15 lost across 3 modules)

**Root cause (to investigate):** The largest issue. Extraction converts `<emphasis effect="italics">` → `*text*` and `<emphasis effect="bold">` → `**text**`. Injection reverses with regex. Likely failure modes:
- MT output changes `*` marker positions or removes them
- Emphasis adjacent to or containing other inline markup (links, terms, sub/superscripts)
- Multiple emphasis markers without separating text
- Markdown ambiguity (e.g., `*` inside a URL or math context)

**Fix:** Investigate all 15 cases. Categorize by failure mode. Fix the regex patterns or add special-case handling.

### 6. Fix E: `<newline/>` and `<term>` (3 lost)

**Root cause (to investigate):** Likely MT-caused damage — the API translates `[[BR]]` markers or `__term__` underscores. May be partially mitigable with better post-processing.

**Fix:** Investigate whether these are extraction/injection bugs or MT artifacts. If MT artifacts, document as known limitations.

## Testing Strategy

- Each fix adds regression tests in `tools/__tests__/pipeline-integration.test.js`
- The validation tool itself gets unit tests in `tools/__tests__/cnxml-fidelity-check.test.js`
- Final success: `node tools/cnxml-fidelity-check.js --book efnafraedi-2e --chapter 1` reports 0 discrepancies

## Files

| File | Action | Purpose |
|------|--------|---------|
| `tools/cnxml-fidelity-check.js` | Create | Validation tool |
| `tools/__tests__/cnxml-fidelity-check.test.js` | Create | Validation tool tests |
| `tools/cnxml-extract.js` | Modify | Fix B (cross-doc links) |
| `tools/cnxml-inject.js` | Modify | Fixes A, B, C, D (inline markup) |
| `tools/__tests__/pipeline-integration.test.js` | Modify | Regression tests for each fix |

## Task Order

1. Build validation tool (establishes baseline measurement)
2. Fix B: cross-doc links (easy, focused)
3. Fix D: equation wrappers (structural, investigation needed)
4. Fix C: `<sup>` round-trip (4 cases, regex)
5. Fix A: `<emphasis>` round-trip (15 cases, regex — largest)
6. Fix E: `<newline/>` + `<term>` (investigation, may be MT-caused)
7. Final validation run
