# HTML Pipeline Issues

Tracking document for bugs discovered during initial testing of the extract-inject-render pipeline.

**Test Date:** 2026-02-01
**Test Chapter:** Chapter 5 (Thermochemistry)
**Branch:** feature/extract-inject-pipeline

---

## Fixed Issues

### 1. Image Paths Incorrect
**Status:** FIXED
**Severity:** Critical - images don't load

**Problem:**
- HTML outputs: `src="images/CNX_Chem_05_01_Waterfall.jpg"`
- Actual location: `images/media/CNX_Chem_05_01_Waterfall.jpg`
- Also: relative paths don't work because HTML content is injected into SvelteKit routes

**Fix Applied:**
Changed `cnxml-render.js` to use absolute paths:
```javascript
const normalizedSrc = src.replace(
  /^\.\.\/\.\.\/media\//,
  `/content/efnafraedi/chapters/${chapterStr}/images/media/`
);
```

---

### 2. Content Duplication
**Status:** FIXED
**Severity:** Critical - content appears twice (reading time 44min → 5min after fix)

**Problem:**
Elements inside notes/examples (figures, tables, equations) appeared twice:
- Once when note/example extracted from original CNXML (includes nested elements)
- Once when nested elements built as standalone

**Root Cause:**
`cnxml-inject.js` extracted whole notes/examples from original CNXML including nested figures/tables, but those nested elements were also in the structure as standalone elements.

**Fix Applied:**
Added `stripNestedElements()` function in `cnxml-inject.js` to remove figures/tables/equations from extracted notes/examples since they're handled separately:
```javascript
// In buildNote(), buildExample(), buildExercise():
noteCnxml = stripNestedElements(noteCnxml, ['figure', 'table', 'equation', 'example', 'exercise']);
```

---

### 3. Equations Not Rendering
**Status:** FIXED
**Severity:** High - math shows as empty boxes

**Problem:**
- HTML contained `<span class="katex-display" data-latex="...">` placeholders
- KaTeX was NOT rendering them client-side

**Fix Applied:**
Added KaTeX pre-rendering in `cnxml-render.js` and `cnxml-elements.js`:
```javascript
import katex from 'katex';

function renderLatex(latex, displayMode = true) {
  return katex.renderToString(latex, { displayMode, throwOnError: false });
}
```
Both display equations and inline math are now pre-rendered server-side.

---

### 4. Duplicate Notes in Examples
**Status:** FIXED
**Severity:** Medium - Answer boxes appeared twice

**Problem:**
Notes nested inside examples (e.g., Answer boxes) appeared twice:
- Once inside the example (from `buildExample()` extracting original CNXML)
- Once as standalone notes (from `buildNote()` processing structure.content)

**Fix Applied:**
Added check in `buildNote()` to skip notes that are nested inside examples/exercises:
```javascript
// Check if note is nested inside example/exercise in original
const noteInExamplePattern = new RegExp(
  `<example[^>]*>[\\s\\S]*?<note\\s+id="${element.id}"[^>]*>...`
);
if (noteInExamplePattern.test(originalCnxml)) {
  return null; // Skip - already included via parent
}
```

---

## Open Issues

### 5. Examples Not Structured Properly
**Status:** Open
**Severity:** Medium - functional but poor UX

**Problem:**
Examples rendered from original CNXML structure but lack proper styling integration with vefur's CSS.

**Expected structure:**
```html
<aside class="example" id="...">
  <h3>Example 5.1: Title</h3>
  <div class="problem">...</div>
  <div class="solution">...</div>
</aside>
```

**Current output:**
The structure is present but may not match vefur's expected CSS classes.

---

### 6. Exercises Not Structured Properly
**Status:** Open
**Severity:** Medium

**Problem:**
End-of-chapter exercises structure may not match vefur's CSS expectations.

---

### 7. Cross-References Empty
**Status:** Open
**Severity:** Low

**Problem:**
References like "as shown in ()" have empty parentheses - figure/table references not resolved.

**Root Cause:**
`<link target-id="..."/>` elements need to be resolved to actual figure/table numbers.

---

### 8. Inline `\times` Artifacts
**Status:** Open
**Severity:** Low

**Problem:**
Some inline text shows `×{\times}×` instead of just `×`.

**Root Cause:**
The multiplication symbol in inline text is being triple-rendered - once as Unicode, once as LaTeX, once as Unicode again.

---

## Testing Checklist

After fixes, verify:

- [x] Images load correctly
- [x] No duplicate content
- [x] Equations render with KaTeX
- [x] No duplicate notes in examples
- [ ] Examples show title, problem, solution structure
- [ ] Exercises properly formatted
- [ ] Cross-references resolve
- [ ] Tables styled correctly
- [ ] Navigation works
- [ ] Print styling works

---

## Progress Summary

| Issue | Status | Fix Location |
|-------|--------|--------------|
| Image paths | FIXED | cnxml-render.js - absolute paths |
| Content duplication | FIXED | cnxml-inject.js - stripNestedElements() |
| Equations | FIXED | cnxml-render.js, cnxml-elements.js - KaTeX pre-render |
| Duplicate notes | FIXED | cnxml-inject.js - skip nested notes |
| Examples structure | Open | CSS/structure alignment needed |
| Exercises structure | Open | CSS/structure alignment needed |
| Cross-references | Open | Link resolution needed |
| Inline \times | Open | MathML processing issue |

---

## Comparison: HTML Pipeline vs Markdown Pipeline

| Aspect | HTML Pipeline | Markdown Pipeline |
|--------|---------------|-------------------|
| ID Preservation | Full (from CNXML) | Partial (generated) |
| Structure Fidelity | High | Medium |
| Equation Handling | Working (KaTeX pre-render) | Working (rehype-katex) |
| Image Handling | Working | Working |
| Complexity | Higher | Lower |
| Maintenance | Single source | Multiple transforms |

**Conclusion so far:** The HTML pipeline preserves more structure and IDs from the original CNXML. Core functionality (images, equations, content) is now working. Remaining issues are lower priority (CSS alignment, cross-references).
