# CNXML Round-Trip Fidelity: What Survives and What Doesn't

**Date:** 2026-03-18
**Context:** Evaluating whether the Extract→Translate→Inject pipeline can produce CNXML suitable for merging back with the OpenStax publishing platform.

## Summary

The pipeline preserves **most** CNXML structure with high fidelity. The extraction stores structural metadata in sidecar files (`-structure.json`, `-equations.json`, `-inline-attrs.json`), and injection rebuilds CNXML from these plus translated segments. The round-trip is better than initially expected — term IDs, table attributes, list attributes, cross-document links, and MathML all survive.

**Verdict:** The pipeline is close to full-fidelity CNXML round-trip. The gaps below are addressable and relatively narrow.

---

## What Survives (Round-Trips Correctly)

| CNXML Feature | Extraction | Storage | Injection | Status |
|---------------|-----------|---------|-----------|--------|
| Element IDs (`id="fs-..."`) | SEG tags | structure.json | Rebuilt | ✅ |
| Section nesting & order | Recursive | structure.json | Rebuilt | ✅ |
| `<para>` with id | Segments | structure.json | Rebuilt | ✅ |
| `<emphasis effect="italics\|bold\|underline">` | `*` / `**` / `++` | — | Reversed | ✅ |
| `<emphasis class="...">` | `{=text=}` | inline-attrs.json | Reversed with class | ✅ |
| `<term id="..." class="...">` | `__text__` | inline-attrs.json | Reversed with id+class | ✅ |
| `<m:math>` (MathML) | `[[MATH:N]]` | equations.json | Exact restoration | ✅ |
| `<sub>` / `<sup>` | `~sub~` / `^sup^` | — | Reversed | ✅ |
| `<link target-id="..."/>` | `[#ref-id]` | — | Reversed | ✅ |
| `<link url="...">text</link>` | `[text](url)` | — | Reversed | ✅ |
| `<link document="m68860" target-id="...">` | `[m68860#target]` | — | Reversed | ✅ |
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
| `<equation id="..." class="...">` | MathML stored | equations.json | Rebuilt | ✅ |
| `<glossary>` / `<definition>` / `<meaning>` | Segmented | structure.json | Rebuilt | ✅ |
| Document root attributes (`xmlns`, etc.) | — | regex from original | Copied verbatim | ✅ |
| `<content>` structure | Recursive | structure.json | Rebuilt | ✅ |

## Known Gaps

### Gap 1: `<md:title>` Not Translated
**Severity:** Medium
**What:** The metadata title (`<md:title>`) inside `<metadata>` is not extracted as a translatable segment. The document `<title>` IS translated, but the metadata copy stays English.
**Impact:** OpenStax uses `<md:title>` for module listings and navigation. An untranslated `<md:title>` would show English in OpenStax's table of contents.
**Fix complexity:** Low — add `<md:title>` extraction in `cnxml-extract.js` and injection in `cnxml-inject.js`. It's a single text element.

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

### Gap 6: Edge Cases in Inline Markup
**Severity:** Low
**What:** Some edge cases in inline markup conversion may not round-trip perfectly:
- Nested emphasis (e.g., bold inside italic)
- Term markers containing sub/superscripts (handled but regex-dependent)
- Very unusual link formats
**Impact:** Rare; most content uses straightforward patterns.
**Fix complexity:** Case-by-case — add tests as edge cases are discovered.

### Gap 7: Unicode Subscript Conversion by MT API
**Severity:** Low
**What:** The Málstaður API occasionally converts `~2~` (subscript markup) to Unicode subscript `₂` in complex segments containing chemical formulas (e.g., `H~2~O` → `H₂O`). Observed in mixed-marker test but not in isolated subscript tests.
**Impact:** The `cnxml-inject.js` `reverseInlineMarkup()` function would not recognize `₂` as `<sub>2</sub>`. Would need a post-processing step or the API output would need sanitization.
**Fix complexity:** Low — add a Unicode subscript/superscript normalization step before injection.

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

The pipeline is **close enough** to full fidelity that the remaining gaps can be addressed incrementally:

1. **Gap 1 (`<md:title>`)** is the only functionally significant gap — fix this first
2. **Gap 7 (Unicode subscripts)** should be handled as part of the API integration
3. All other gaps are low-priority or cosmetic

The extract→inject architecture is sound for producing merge-ready CNXML. It was designed with structural preservation in mind (sidecar files, attribute tracking) — it just needs the few remaining gaps closed.
