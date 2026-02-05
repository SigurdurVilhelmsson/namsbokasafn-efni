# Markdown Formatting Issues and Solutions

This document describes rendering issues discovered during development of the namsbokasafn-vefur reader application, and where each fix should be implemented.

## Summary

| Issue | Fix Location | Status |
|-------|--------------|--------|
| `\mspace{Xmu}` LaTeX commands | namsbokasafn-efni (pipeline) | Done |
| Orphan `:::` directive markers | namsbokasafn-efni (pipeline) | Done |
| Subscript/superscript syntax | namsbokasafn-efni (pipeline) | Done |
| Escaped tildes in text | namsbokasafn-efni (pipeline) | Done |
| GFM strikethrough conflict | namsbokasafn-vefur (runtime) | Done |
| Content block rendering | namsbokasafn-vefur (runtime) | Done |

---

## Issues to Fix in namsbokasafn-efni Pipeline

These issues should be fixed during content processing so the output markdown is clean and portable.

### 1. LaTeX `\mspace{Xmu}` Commands

**Problem:** Pandoc generates `\mspace{6mu}` and similar spacing commands that KaTeX doesn't support.

**Example:**
```latex
$_{\mspace{6mu} 5}^{10}\text{B}$
```

**Solution:** Replace `\mspace{Xmu}` with KaTeX-compatible equivalents:

| Pandoc | KaTeX | Description |
|--------|-------|-------------|
| `\mspace{3mu}` | `\,` | thin space |
| `\mspace{4mu}` | `\:` | medium space |
| `\mspace{5mu}` | `\;` | thick space |
| `\mspace{6mu}` | `\;\,` | thick + thin (~6mu) |
| `\mspace{18mu}` | `\quad` | quad space |

**Scope:** 22 occurrences in 7 files (all in `05-publication/mt-preview/`)

**Implementation:** Add to post-processing in the publication pipeline.

---

### 2. Orphan `:::` Directive Markers

**Problem:** Nested remark-directive blocks only need ONE closing `:::`, but content sometimes has multiple closing markers that render as literal text.

**Example (problematic):**
```markdown
:::note
Content here

:::definition{term="X"}
Definition text
:::

:::
```

The outer `:::` is orphaned and renders as literal text.

**Example (correct):**
```markdown
:::note
Content here

:::definition{term="X"}
Definition text
:::
```

**Solution:** During pipeline processing, detect and remove orphan `:::` markers. A `:::` on its own line that doesn't open a new directive should be removed.

**Implementation:** Add cleanup step to remove lines containing only `:::` markers (with possible whitespace).

---

### 3. Subscript and Superscript Syntax

**Problem:** The content uses `~text~` for subscript and `^text^` for superscript, but:
- Some tildes are escaped (`\~`) when they shouldn't be
- The syntax conflicts with GFM strikethrough

**Examples in content:**
```markdown
(\~10^−3^)          # Escaped tilde, should be (~10^−3^)
CHCl~3~             # Correct subscript syntax
Na^+^               # Correct superscript syntax
```

**Solution:**
1. Replace `\~` with `~` where it's meant as subscript (before alphanumeric content)
2. Ensure sub/superscript content only contains alphanumeric characters and +/-

**Implementation:** Add regex cleanup:
```javascript
// Fix escaped tildes used for subscript
content = content.replace(/\\\~(\w)/g, '~$1');
```

---

### 4. Pandoc Table Border Artifacts

**Problem:** Pandoc sometimes generates table-like horizontal rules or border artifacts.

**Example:**
```markdown
------------------------------------------------------------
| Header | Header |
------------------------------------------------------------
```

**Solution:** Convert to standard GFM table format or remove decorative borders.

---

## Issues Fixed in namsbokasafn-vefur (Runtime)

These fixes remain in the webapp because they're consumer-specific or defensive measures.

### 1. GFM Strikethrough Conflict

**Problem:** `remarkGfm` interprets `~text~` as strikethrough, conflicting with subscript.

**Solution:** Configure remarkGfm with `{ singleTilde: false }` so only `~~text~~` triggers strikethrough.

**Rationale:** This is a parser configuration choice specific to each consumer.

---

### 2. Content Block Rendering

**Problem:** Custom directives (:::note, :::example, etc.) need specific HTML structure for styling.

**Solution:** Custom rehype plugin transforms directive output to styled HTML blocks.

**Rationale:** The visual presentation is consumer-specific. The source markdown uses standard remark-directive syntax.

---

### 3. Defensive LaTeX Preprocessing

**Solution:** The webapp has a `preprocessLatex()` function as a fallback for any `\mspace` commands that slip through.

**Rationale:** Defense in depth - catches issues even if source isn't perfectly clean.

---

## Implementation (Completed)

**Option A was implemented:** Created `tools/clean-markdown.js` post-processing script.

### Usage

```bash
# Process a single file
node tools/clean-markdown.js <file.md>

# Process a directory
node tools/clean-markdown.js --batch <directory>

# Process all mt-preview files across all books
node tools/clean-markdown.js --all

# Preview changes without writing
node tools/clean-markdown.js --all --dry-run --verbose
```

### Results (2026-01-14)

Applied to all 41 files in `books/efnafraedi/05-publication/mt-preview/`:

| Fix Type | Count |
|----------|-------|
| `\mspace` commands | 27 |
| Orphan `:::` markers | 442 |
| Escaped tildes | 16 |
| Table artifacts | 0 (already cleaned) |

**Total: 33 files modified, 485 issues fixed.**

---

## Original Implementation Options (for reference)

### Option A: Post-processing Script (IMPLEMENTED)

Created `tools/clean-markdown.js` script that:
1. Replaces `\mspace{Xmu}` with KaTeX equivalents
2. Removes orphan `:::` markers
3. Fixes escaped tildes used for subscript
4. Normalizes table formatting

### Option B: Pandoc Lua Filter (not implemented)

Would create a Lua filter for Pandoc that handles LaTeX spacing during conversion.

### Option C: Integration into docx-to-md.js (not implemented)

Would add cleanup functions to the existing `postProcessMarkdown()` function.

---

## Testing

Verified with these test cases:

1. **LaTeX spacing:** `$_{\mspace{6mu} 5}^{10}\text{B}$` → `$_{\;\, 5}^{10}\text{B}$` ✅
2. **Subscript:** `H~2~O` should show subscript 2 ✅
3. **Superscript:** `Na^+^` should show superscript + ✅
4. **Nested directives:** No orphan `:::` in output ✅
5. **Tables:** Clean GFM format without border artifacts ✅

---

## Files Affected (Now Fixed)

Files that had `\mspace` commands (now fixed):
- `books/efnafraedi/05-publication/mt-preview/chapters/02/2-3-atomic-structure-and-symbolism.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/02/2-exercises.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/02/chapter-2.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/03/3-key-equations.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/04/4-3-reaction-stoichiometry.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/04/4-exercises.md`
- `books/efnafraedi/05-publication/mt-preview/chapters/04/4-key-equations.md`
