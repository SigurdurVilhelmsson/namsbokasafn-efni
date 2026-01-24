# MT Syntax Survival Analysis Report

**Date:** 2026-01-24
**MT System:** Erlendur (malstadur.is)
**Source File:** `mt-sample.en.md`
**Output File:** `mt-sample.is.md`
**Pipeline Version:** Post commit `bfc5a5a`

---

## Analysis Summary

| Category | MT Output | After Pipeline | Notes |
| :--- | :---: | :---: | :--- |
| YAML Frontmatter | ❌ | ❌ | Requires pre-MT protection |
| Directive Blocks | ⚠️ | ✅ | Fixed: merged markers split |
| Link Syntax | ⚠️ | ✅ | Fixed: brackets unescaped |
| Equation Placeholders | ⚠️ | ✅ | Fixed: brackets unescaped |
| Image Attributes | ✅ | ✅ | No issues |
| Figure Captions | ✅ | ✅ | No issues |
| Term Definitions | ✅ | ✅ | No issues |
| Tables | ❌ | ❌ | Requires pre-MT protection |
| Subscripts/Superscripts | ✅ | ✅ | No issues |
| Math Delimiters | ⚠️ | ✅ | Fixed: LaTeX escapes removed |
| Special Characters | ✅ | ✅ | No issues |
| Nested Structures | ⚠️ | ✅ | Fixed: directive closings |
| Edge Cases | ⚠️ | ✅ | Fixed: complex merged markers |

**Legend:** ✅ Working | ⚠️ Has Issues | ❌ Broken (needs pre-MT protection)

---

## Pipeline Test Results

### Test Run: 2026-01-24

```
$ node tools/post-mt-pipeline.js test/mt-sample.is.md --verbose

Processing 1 file(s)...
Processing: test/mt-sample.is.md
  [OK] Restore Images
  [OK] Restore Links
  [OK] Repair Directives

Post-MT Pipeline Complete
──────────────────────────────────────────────────
  Files processed: 1
  Successful: 1
  Failed: 0

Step Statistics:
  Images restored: 3
  Links restored: 3 URLs, 5 refs, 3 docs
  Directives repaired: 20 changes (merged markers split + closings added)
```

### Verification Results

| Check | Before Pipeline | After Pipeline |
| :--- | :---: | :---: |
| Escaped brackets `\[` | Multiple | 0 |
| Escaped equations `\[\[EQ:` | 10 | 0 |
| Merged `::: ` markers | 15+ | 0 |
| LaTeX escaped `\_` | Multiple | 0 |

### Sample Fixes Verified

**Links restored:**
```markdown
# Before (MT output)
\[Heimsæktu OpenStax\]{url="https://openstax.org/..."}

# After (pipeline)
[Heimsæktu OpenStax](https://openstax.org/...)
```

**Equations restored:**
```markdown
# Before (MT output)
Kjörgaslögmálið \[\[EQ:1\]\] lýsir...

# After (pipeline)
Kjörgaslögmálið [[EQ:1]] lýsir...
```

**Directives restored:**
```markdown
# Before (MT output)
:::note Fyrsta athugasemd. ::: :::warning Viðvörun :::

# After (pipeline)
:::note
Fyrsta athugasemd.
:::
:::warning
Viðvörun
:::
```

**LaTeX restored:**
```markdown
# Before (MT output)
$$ K\_{eq} = \frac{\[C\]^c\[D\]^d}{\[A\]^a\[B\]^b} $$

# After (pipeline)
$$ K_{eq} = \frac{[C]^c[D]^d}{[A]^a[B]^b} $$
```

---

## Issues Fixed by Pipeline

### 1. Link Brackets Escaped ✅ FIXED

**Problem:** Erlendur escapes `[` and `]` with backslashes
**Solution:** `restore-links.js` now unescapes brackets before pattern matching

### 2. Equation Placeholders Escaped ✅ FIXED

**Problem:** `[[EQ:N]]` becomes `\[\[EQ:N\]\]`
**Solution:** `restore-links.js` unescapes equation placeholder brackets

### 3. Directive Closing Markers Merged ✅ FIXED

**Problem:** `content :::` on same line, multiple `:::` merged
**Solution:** `repair-directives.js` splits merged markers onto separate lines

### 4. LaTeX Content Escaped ✅ FIXED

**Problem:** `_{eq}` becomes `\_{eq}`, `[C]` becomes `\[C\]` in math
**Solution:** `restore-links.js` unescapes within `$...$` and `$$...$$` blocks

### 5. Isotope Notation Escaped ✅ FIXED

**Problem:** `_{6}^{14}C` becomes `\_{6}^{14}C`
**Solution:** `restore-links.js` unescapes isotope patterns

---

## Issues Requiring Pre-MT Protection

### 1. YAML Frontmatter ❌ NOT FIXED

**Problem:**
```yaml
# Input
---
title: "Test"
chapter: 1
---

# MT Output
## titill: „Test" kafli: 1
```

**Why unfixable:** Structure completely destroyed, delimiters removed
**Required solution:** Extract frontmatter before MT, restore after

### 2. Tables ❌ NOT FIXED

**Problem:**
```markdown
# Input
| A | B |
|---|---|
| 1 | 2 |

# MT Output
| A | B | |---| ---| | 1 | 2 |
```

**Why unfixable:** Line breaks removed, cannot reliably restore row boundaries
**Required solution:** Protect tables before MT (placeholder or encoding)

### 3. Standard Markdown Links ❌ CANNOT FIX

**Problem:**
```markdown
# Input
[Link text](https://example.com)

# MT Output
Tengill texti
```

**Why unfixable:** URL completely lost by MT
**Required solution:** Use `[text]{url="..."}` format instead (already implemented)

---

## Patterns That Work Without Fixes

These patterns survive Erlendur MT unchanged:

1. ✅ **Subscripts/Superscripts**: `H~2~O`, `Na^+^`, `10^-3^`
2. ✅ **Image Attribute Blocks**: `{id="..." class="..." alt="..."}`
3. ✅ **Figure Captions**: `*Caption*{id="..."}`
4. ✅ **Term Definitions**: `**term**{id="..."}`
5. ✅ **Icelandic Characters**: á é í ó ú ý þ ð æ ö
6. ✅ **Greek Letters**: α β γ δ ε ζ η θ ι κ λ μ ν ξ π ρ σ τ φ χ ψ ω
7. ✅ **Mathematical Symbols**: → ← ↔ ≠ ≤ ≥ ± × ÷ · ° ∞ ∑ ∫ √
8. ✅ **Unicode Super/Subscripts**: ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ₀ ₁ ₂ ₃
9. ✅ **Directive Openings**: `:::directive-name`
10. ✅ **Directive Attributes**: `{#id}` after directive names
11. ✅ **Link Attribute Blocks**: `{url="..."}`, `{ref="..."}`, `{doc="..."}`

---

## Implementation Status

### Completed ✅

| Fix | File | Commit |
| :--- | :--- | :--- |
| Unescape link brackets | `restore-links.js` | `bfc5a5a` |
| Unescape equation placeholders | `restore-links.js` | `bfc5a5a` |
| Unescape LaTeX content | `restore-links.js` | `bfc5a5a` |
| Unescape isotope notation | `restore-links.js` | `bfc5a5a` |
| Split merged directive markers | `repair-directives.js` | `bfc5a5a` |
| Icelandic directive aliases | `repair-directives.js`, `chapter-assembler.js` | `bfc5a5a` |

### Pending (Future Work)

| Fix | Priority | Notes |
| :--- | :--- | :--- |
| Pre-MT frontmatter protection | Medium | Extract YAML, pass separately |
| Pre-MT table protection | Medium | Convert to placeholder format |
| Extra blank line cleanup | Low | Cosmetic only |

---

## Conclusion

The post-MT pipeline now handles all fixable Erlendur MT artifacts:

- **Bracket escaping** → Fixed via regex unescaping
- **Directive merging** → Fixed via line splitting
- **LaTeX escaping** → Fixed via math block processing

The remaining issues (YAML frontmatter, tables) require pre-MT protection which should be implemented in a future update to the pipeline.

**Key validation:** The `[text]{url="..."}` link format is confirmed as the correct approach - standard markdown links are completely destroyed by MT while our custom format survives and is automatically restored.

---

## Verification Commands

```bash
# Run pipeline on MT output
node tools/post-mt-pipeline.js test/mt-sample.is.md --verbose

# Check for remaining issues
grep -c '\\[' test/mt-sample.is.md        # Should be 0 after pipeline
grep -c '\\[\\[EQ' test/mt-sample.is.md   # Should be 0 after pipeline
grep -c ' :::' test/mt-sample.is.md       # Should be 0 after pipeline

# Compare before/after
diff test/mt-sample.is.md test/mt-sample.is.processed.md | head -50
```

---

## Changelog

- **2026-01-24**: Initial analysis and pipeline fixes implemented
  - Added bracket unescaping to `restore-links.js`
  - Added equation placeholder unescaping
  - Added LaTeX unescape within math blocks
  - Added merged directive marker splitting to `repair-directives.js`
  - Added Icelandic directive alias support
  - Created test suite with comprehensive syntax samples
