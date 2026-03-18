# CNXML Round-Trip Fidelity: What Survives and What Doesn't

**Date:** 2026-03-18
**Updated:** 2026-03-18 (corrected with API pipeline data — old pipeline data was misleading)
**Context:** Evaluating whether the Extract→Translate→Inject pipeline can produce CNXML suitable for merging back with the OpenStax publishing platform.

## Summary

The pipeline preserves **most** CNXML structure with high fidelity. Structural elements like sections, tables, figures, exercises, glossary, and MathML all round-trip correctly.

**IMPORTANT: Old manual pipeline vs API pipeline produce different results.** Initial testing used old manual MT output (protect → web UI → unprotect), which showed 27 missing elements. Re-testing with the API pipeline (api-translate.js, no protection) revealed **different issues** — fewer emphasis losses but a new term overproduction bug.

### API Pipeline Results (ch01, 7 modules)

| Issue | Count | Modules |
|-------|-------|---------|
| `<term>` overproduction | **+56** | m68664 (16→72) |
| `<emphasis>` lost | -3 | m68664 (-1), m68674 (-2) |
| `<equation>` wrapper lost | -3 | m68667 (-1), m68683 (-2) |
| `<link>` lost (cross-doc) | -2 | m68674 (-1), m68690 (-1) |
| `<sup>` overproduction | +2 | m68674 |
| SEG tag corruption | -2 | m68683 (m68683→m6-8683, losing 1 definition + 1 meaning) |
| `<term>` overproduction | +1 | m68674 |
| **Perfect modules** | — | m68663, m68670 |

**Verdict:** The API pipeline is better for emphasis preservation (3 lost vs 15) but has a critical term/bold disambiguation bug. Block-level structure is sound. A dedicated fidelity pass is needed before batch translation.

---

## What Survives (Round-Trips Correctly)

| CNXML Feature | Extraction | Storage | Injection | Status |
|---------------|-----------|---------|-----------|--------|
| Element IDs (`id="fs-..."`) | SEG tags | structure.json | Rebuilt | ✅ |
| Section nesting & order | Recursive | structure.json | Rebuilt | ✅ |
| `<para>` with id | Segments | structure.json | Rebuilt | ✅ |
| `<emphasis effect="italics\|bold\|underline">` | `*` / `**` / `++` | — | Reversed | ⚠️ 15 lost in ch01 (Gap 6a) |
| `<emphasis class="...">` | `{=text=}` | inline-attrs.json | Reversed with class | ✅ |
| `<term id="..." class="...">` | `__text__` | inline-attrs.json | Reversed with id+class | ✅ |
| `<m:math>` (MathML) | `[[MATH:N]]` | equations.json | Exact restoration | ✅ |
| `<sub>` / `<sup>` | `~sub~` / `^sup^` | — | Reversed | ⚠️ 4 `<sup>` lost in ch01 (Gap 6b) |
| `<link target-id="..."/>` | `[#ref-id]` | — | Reversed | ✅ |
| `<link url="...">text</link>` | `[text](url)` | — | Reversed | ✅ |
| `<link document="..." target-id="...">` | `[doc#target]` | — | Reversed | ✅ |
| `<link document="...">` (no target-id) | Not extracted | — | Lost | ❌ 2 lost in ch01 (Gap 6d) |
| `<footnote id="...">` | `[footnote: text]` | inline-attrs.json | Reversed with id | ✅ |
| `<newline/>` | `[[BR]]` | — | Reversed | ✅ |
| `<space count="N"/>` | `[[SPACE:N]]` | — | Reversed | ✅ |
| `<figure id="..." class="...">` | Structure | structure.json | Rebuilt | ✅ |
| `<media id="..." alt="...">` | Structure | structure.json (id, alt, src, mimeType) | Rebuilt | ✅ |
| `<caption>` text | Segments | structure.json | Rebuilt | ✅ |
| `<table>` with `id`, `class`, `summary` | Structure | structure.json | Rebuilt | ✅ |
| `<entry namest="" nameend="" align="" valign="">` | Structure | structure.json (all attrs) | Rebuilt | ✅ |
| `<colspec>` | Structure | structure.json | Rebuilt | ✅ |
| `<list>` with `list-type`, `number-style`, `bullet-style` | Items segmented | structure.json | Rebuilt | ✅ |
| `<exercise>` / `<problem>` / `<solution>` | Nested | structure.json | Rebuilt | ✅ |
| `<note id="..." class="...">` | Content segmented | structure.json | Rebuilt | ✅ |
| `<example>` | Content segmented | structure.json | Rebuilt | ✅ |
| `<equation id="..." class="...">` | MathML stored | equations.json | Rebuilt | ⚠️ 3 wrappers lost in ch01 (Gap 6c) |
| `<glossary>` / `<definition>` / `<meaning>` | Segmented | structure.json | Rebuilt | ✅ |
| Document root attributes (`xmlns`, etc.) | — | regex from original | Copied verbatim | ✅ |
| `<content>` structure | Recursive | structure.json | Rebuilt | ✅ |

## Known Gaps

### Gap 1: `<md:title>` Not Translated — FIXED
**Severity:** ~~Medium~~ Fixed (commit `ce3cab5`)
**What:** The metadata title (`<md:title>`) inside `<metadata>` was not being updated with the translated document title.
**Fix:** `cnxml-inject.js` now replaces `<md:title>` with the translated document title during injection.

### Gap 2: `<md:abstract>` Handling
**Severity:** Low
**What:** The abstract content is extracted (intro para + list items appear as segments), but the metadata wrapper `<md:abstract>` reconstruction needs verification.
**Impact:** Learning objectives might not appear correctly in OpenStax's module view.
**Fix complexity:** Low — verify current behavior; may already work.

### Gap 3: Whitespace & Indentation Differences
**Severity:** Low (cosmetic)
**What:** The injected CNXML has different indentation/whitespace than the original. The XML is semantically equivalent but not byte-identical.
**Impact:** Diff tools show many changes that are purely whitespace. Not a functional issue for OpenStax processing (XML parsers normalize whitespace), but complicates manual comparison.
**Fix complexity:** Medium — would require tracking original indentation during extraction.

### Gap 4: XML Declaration & Processing Instructions
**Severity:** Low
**What:** Original XML declarations (`<?xml version="1.0"?>`) and any processing instructions are not preserved. The injection generates a standard declaration.
**Impact:** Minimal — OpenStax likely normalizes these.
**Fix complexity:** Low.

### Gap 5: Attribute Order
**Severity:** None (cosmetic)
**What:** Reconstructed CNXML may emit attributes in a different order than the original.
**Impact:** None — XML attribute order is not significant per the XML spec.
**Fix complexity:** N/A — not a real issue.

### Gap 6: Inline Markup Round-Trip Failures (Empirically Measured)
**Severity:** HIGH — this is the largest remaining fidelity issue
**What:** Empirical comparison of chapter 1 (7 modules) found **27 missing inline elements** across 6 modules:

| Element | Source Count | Translated Count | Lost | Affected Modules |
|---------|-------------|-----------------|------|------------------|
| `<emphasis>` | 29 total | 14 | **-15** | m68664 (-9), m68670 (-5), m68674 (-1) |
| `<sup>` | 79 | 75 | **-4** | m68674 |
| `<equation>` wrapper | 32 | 29 | **-3** | m68667 (-1), m68683 (-2) |
| `<newline/>` | 3 | 1 | **-2** | m68667 (-1), m68683 (-1) |
| `<link>` | 22 | 20 | **-2** | m68674 (-1, cross-doc without target-id), m68690 (-1) |
| `<term>` | varied | varied | **-1** | m68670 |

**Root causes identified:**

**6a. `<emphasis>` loss (15 missing):** The extraction converts `<emphasis effect="italics">` → `*text*` and `<emphasis effect="bold">` → `**text**`. The injection uses regexes in `reverseInlineMarkup()` to convert back. Failures occur when:
- Emphasis spans contain other inline markup (links, terms, sub/superscripts)
- Multiple emphasis markers are adjacent without separating text
- MT output changes the position or number of `*` markers
- The `*`/`**` markers interact with markdown link syntax `[text](url)`

**6b. `<sup>` loss (4 missing):** The extraction converts `<sup>N</sup>` → `^N^`. The injection regex needs lookbehind/lookahead to avoid false positives. Edge cases where the `^` marker is adjacent to other markup (like `[[MATH:N]]` or `<!-- SEG -->`) may fail to match.

**6c. `<equation>` wrapper loss (3 missing):** The `<equation>` element wraps `<m:math>` blocks. The MathML content itself is preserved via `[[MATH:N]]` placeholders (stored in equations.json and restored exactly). But the wrapping `<equation id="..." class="...">` element may not be reconstructed during injection — the MathML is inserted inline without its structural wrapper.

**6d. Cross-document links without `target-id` (1-2 missing):** Extraction code at `cnxml-extract.js:265` requires both `document` and `target-id` attributes. Links like `<link document="m68860">Appendix B</link>` (pointing to an entire module, no target-id) fall through and become plain text.

**6e. `<newline/>` loss (2 missing):** Some `[[BR]]` markers don't survive the MT round-trip. Either the MT engine strips them or the markdown format causes them to be absorbed into whitespace.

**6f. `<term>` loss (1 missing):** One `__term__` marker was likely damaged by MT (underscores modified) and not reconstructed.

**Impact:** The translated CNXML renders correctly as HTML (emphasis/links degrade to plain text gracefully). But the structural differences would prevent clean merging with OpenStax source.

**Fix plan:** See "Fix Plan for Inline Markup Fidelity" section below.

### Gap 7: Unicode Subscript Conversion by MT API — FIXED
**Severity:** ~~Low~~ Fixed (commit `1d7dc82`)
**What:** The Málstaður API occasionally converts `~2~` to Unicode subscript `₂`.
**Fix:** `api-translate.js` includes `normalizeUnicode()` post-processing that converts Unicode sub/superscripts back to `~N~`/`^N^` format before writing output.

---

## Empirical Verification

**Tested:** Chapter 1 (ch01), 7 modules: m68663, m68664, m68667, m68670, m68674, m68683, m68690

**Method:** Tag-count comparison between source CNXML (`01-source/`) and translated CNXML (`03-translated/mt-preview/`). Counts opening tags by element name.

**Result:** 6 of 7 modules have structural differences. m68663 (Introduction, simple module) is the only one with perfect structural parity.

**Reproduction:**

```bash
# Quick tag-count comparison for a module:
python3 -c "
import re
from collections import Counter
def counts(p):
    with open(p) as f: content = f.read()
    return Counter(n for _,n in re.findall(r'<(/?)([a-zA-Z:]+)', content) if not _)
s = counts('books/efnafraedi-2e/01-source/ch01/m68674.cnxml')
t = counts('books/efnafraedi-2e/03-translated/mt-preview/ch01/m68674.cnxml')
for tag in sorted(set(list(s)+list(t))):
    if s[tag] != t[tag]: print(f'{tag}: {s[tag]} → {t[tag]} ({t[tag]-s[tag]:+d})')
"
```

---

## Fix Plan for Inline Markup Fidelity

Priority order based on impact (number of lost elements):

### Fix A: `<emphasis>` round-trip (15 lost — highest priority)

**Investigation needed:** For each of the 15 missing emphasis elements, identify the exact source text, the extracted markdown, the MT output, and the injection result. Categorize failure modes.

**Likely fixes in `cnxml-inject.js` `reverseInlineMarkup()`:**
- Improve `*italic*` and `**bold**` regex to handle adjacent markup
- Handle cases where MT output adds/removes/moves `*` markers
- Add a fallback: compare emphasis count in EN source vs IS output, warn on mismatch

**Files:** `tools/cnxml-inject.js` (reverseInlineMarkup, ~lines 530-560)

### Fix B: Cross-document links without `target-id` (2 lost)

**Fix in `cnxml-extract.js`:** Add handling for `<link document="m68860">text</link>` (document attribute only, no target-id). Extract as `[text](m68860)` or a new format like `[text][doc:m68860]`.

**Fix in `cnxml-inject.js`:** Add reverse conversion for the new link format.

**Files:** `tools/cnxml-extract.js` (~line 263), `tools/cnxml-inject.js` (~line 576)

### Fix C: `<sup>` round-trip (4 lost)

**Investigation needed:** Find the 4 specific superscripts that failed. Likely adjacent to `[[MATH:N]]` or at paragraph boundaries.

**Files:** `tools/cnxml-inject.js` (reverseInlineMarkup, ~lines 599-605)

### Fix D: `<equation>` wrapper (3 lost)

**Investigation needed:** Check whether structure.json stores the equation ID/class. If so, injection should reconstruct `<equation id="..." class="...">` around the restored MathML.

**Files:** `tools/cnxml-inject.js` (where `[[MATH:N]]` is restored, ~lines 495-504)

### Fix E: `<newline/>` and `<term>` (3 lost)

Lower priority — likely MT-related damage that's hard to prevent. Could add validation that warns when markers are lost.

---

## Verification Method

To verify round-trip fidelity for a specific module:

```bash
# 1. Extract
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 1

# 2. Translate (using existing MT output or API)
# ... segments go through translation ...

# 3. Inject
node tools/cnxml-inject.js efnafraedi-2e 1

# 4. Compare structure (ignoring whitespace and text content)
# Extract element names and attributes from both files:
grep -oP '<[a-z:]+[^>]*>' books/efnafraedi-2e/01-source/ch01/m68664.cnxml | sort > /tmp/source-elements.txt
grep -oP '<[a-z:]+[^>]*>' books/efnafraedi-2e/03-translated/mt-preview/ch01/m68664.cnxml | sort > /tmp/translated-elements.txt
diff /tmp/source-elements.txt /tmp/translated-elements.txt
```

## Recommendation for OpenStax Remerge

**Fixed so far:**
- Gap 1 (`<md:title>`) — fixed in commit `ce3cab5`
- Gap 7 (Unicode subscripts) — fixed in `api-translate.js` normalizeUnicode()

**Remaining work for full parity:**
1. **Gap 6a: `<emphasis>` round-trip** (15 lost in ch01) — highest priority, needs investigation
2. **Gap 6b/6c: `<sup>` and `<equation>` wrappers** (7 lost in ch01) — medium priority
3. **Gap 6d: Cross-document links** (2 lost in ch01) — focused fix in extract/inject
4. **Gaps 2-5:** Low priority / cosmetic

The extract→inject architecture is sound. The structural/block-level elements (sections, tables, figures, exercises, glossary) round-trip correctly. The remaining issues are in the inline markup regex system (`reverseInlineMarkup()`) and will require a dedicated investigation pass with per-element failure analysis.
