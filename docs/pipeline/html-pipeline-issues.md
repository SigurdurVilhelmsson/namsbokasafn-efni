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

## Open Issues

### 3. Equations Not Rendering (Client-Side)
**Status:** Open - needs vefur changes
**Severity:** High - math shows as empty boxes

**Problem:**
- HTML contains correct `<span class="katex-display" data-latex="...">` placeholders
- KaTeX is NOT rendering them client-side
- Markdown pipeline uses `rehype-katex` at build time, but HTML bypasses this

**Root Cause:**
vefur's markdown processing pipeline uses `rehype-katex` to convert LaTeX to KaTeX HTML during build. HTML content bypasses this pipeline, so `data-latex` attributes are never processed.

**Options:**
1. **Pre-render KaTeX in cnxml-render.js** (preferred - no client JS needed)
   - Use katex npm package to generate HTML during render
   - Larger HTML files but faster load
2. **Add client-side KaTeX rendering in vefur**
   - Detect HTML content with `data-latex` attributes
   - Call `katex.render()` on mount
   - Requires loading KaTeX JS globally

---

### 4. Examples Not Structured Properly
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

### 5. Exercises Not Structured Properly
**Status:** Open
**Severity:** Medium

**Problem:**
End-of-chapter exercises structure may not match vefur's CSS expectations.

---

### 6. Cross-References Empty
**Status:** Open
**Severity:** Low

**Problem:**
References like "as shown in ()" have empty parentheses - figure/table references not resolved.

**Root Cause:**
`<link target-id="..."/>` elements need to be resolved to actual figure/table numbers.

---

## Testing Checklist

After fixes, verify:

- [x] Images load correctly
- [x] No duplicate content
- [ ] Equations render with KaTeX
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
| Equations | Open | Needs KaTeX pre-rendering or client-side |
| Examples structure | Open | CSS/structure alignment needed |
| Exercises structure | Open | CSS/structure alignment needed |
| Cross-references | Open | Link resolution needed |

---

## Comparison: HTML Pipeline vs Markdown Pipeline

| Aspect | HTML Pipeline | Markdown Pipeline |
|--------|---------------|-------------------|
| ID Preservation | Full (from CNXML) | Partial (generated) |
| Structure Fidelity | High | Medium |
| Equation Handling | Needs KaTeX integration | Already works |
| Image Handling | Now working | Working |
| Complexity | Higher | Lower |
| Maintenance | Single source | Multiple transforms |

**Conclusion so far:** The HTML pipeline preserves more structure and IDs from the original CNXML. The main remaining issue is KaTeX rendering, which can be solved by pre-rendering in the pipeline.
