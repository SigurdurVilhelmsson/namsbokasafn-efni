# Corrected Directory Structure and Workflow

This document describes the corrected directory structure and workflow after fixing the confusion between MT preview and faithful tracks.

## The Problem We Fixed

**Previous (incorrect) structure:**
- Files were split between `05-publication/for-mt/` and `05-publication/mt-preview/`
- `02-machine-translated/` directory was missing
- We were treating `03-faithful-translation/` as if it contained raw MT output

**Root cause:**
- Skipped the intermediate `03-machine-translation` step
- Used `--track for-mt` when we should have used `--track mt-preview`
- Mixed unreviewed MT with human-reviewed content

## Corrected Directory Structure

```
books/efnafraedi/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML originals
│   └── media/              # Source images
│
├── 02-for-mt/              # GENERATED - Segments for MT
│   └── ch{NN}/
│       └── {moduleId}-segments.en.md
│
├── 02-mt-output/           # 🔒 READ ONLY - MT output from Erlendur
│   └── ch{NN}/
│       └── {moduleId}-segments.is.md
│
├── 02-structure/           # GENERATED - Document structure metadata
│   └── ch{NN}/
│       ├── {moduleId}-structure.json
│       └── {moduleId}-equations.json
│
├── 02-machine-translated/ # NEW! - Joined MT markdown (unreviewed)
│   └── ch{NN}/
│       └── {moduleId}.md   # Complete markdown modules
│
├── 03-faithful-translation/            # ✏️ EDITABLE - Human-reviewed translations
│   └── ch{NN}/
│       └── {moduleId}.md   # Reviewed markdown modules
│
├── 04-localized-content/           # ✏️ EDITABLE - Localized for Iceland
│   └── ch{NN}/
│       └── {moduleId}.md   # Localized markdown modules
│
└── 05-publication/         # GENERATED - Web-ready HTML
    ├── mt-preview/         # Unreviewed MT publications
    │   └── chapters/
    │       └── {NN}/
    │           ├── {N}-{section}.html
    │           ├── {N}-exercises.html
    │           ├── {N}-summary.html
    │           └── images/
    │
    ├── faithful/           # Human-reviewed publications
    │   └── chapters/
    │       └── {NN}/
    │           └── (same structure as mt-preview)
    │
    └── localized/          # Localized publications (future)
        └── chapters/
            └── {NN}/
                └── (same structure as mt-preview)
```

## Complete Workflow

### Phase 1: Extract & MT
```bash
# 1. Extract CNXML to segments for MT
node tools/cnxml-extract.js --input books/efnafraedi/01-source/ch12/ \
                            --output books/efnafraedi/02-for-mt/ch12

# 2. Protect segments for MT (tag protection)
node tools/protect-segments-for-mt.js --chapter 12

# 3. MANUAL: Download, run through Erlendur, save to 02-mt-output/

# 4. Unprotect MT output
node tools/unprotect-segments.js --chapter 12
```

### Phase 2: Join & Publish MT Preview
```bash
# 5. Join segments into complete markdown modules
node tools/join-mt-output.js --chapter 12

# 6. Render to HTML for MT-Preview publication
node tools/markdown-to-html.js --chapter 12 --track mt-preview
```

**Result:** Students can now access `05-publication/mt-preview/` while editorial review is in progress.

### Phase 3: Editorial Review
```bash
# 7. Review content in 02-machine-translated/
#    - Fix translation errors
#    - Check terminology consistency
#    - Improve grammar and style

# 8. When chapter review is complete, copy to 03-faithful-translation/
cp -r books/efnafraedi/02-machine-translated/ch12/ \
      books/efnafraedi/03-faithful-translation/ch12/
```

### Phase 4: Publish Faithful Version
```bash
# 9. Render reviewed content to HTML
node tools/markdown-to-html.js --chapter 12 --track faithful
```

**Result:** `05-publication/faithful/` now contains human-reviewed content.

### Phase 5: Localization (Future)
```bash
# 10. Localize content (units, examples, cultural references)
#     This happens in 03-faithful-translation/ → 04-localized-content/

# 11. Render localized content to HTML
node tools/markdown-to-html.js --chapter 12 --track localized
```

**Result:** `05-publication/localized/` contains culturally adapted content for Icelandic students.

## Publication Tracks

| Track | Source | Quality | Use Case |
|-------|--------|---------|----------|
| **mt-preview** | `02-machine-translated/` | Unreviewed MT | Early access while review in progress |
| **faithful** | `03-faithful-translation/` | Human-reviewed | Production content after linguistic review |
| **localized** | `04-localized-content/` | Reviewed + localized | Full adaptation for Icelandic students |

## Web Application Behavior

The `namsbokasafn-vefur` application should:

1. Check which tracks are available for each chapter
2. Default to the highest quality version available:
   - Localized (best) → Faithful (good) → MT-Preview (acceptable)
3. Display version badge to users (e.g., "Vélþýðing", "Yfirfarin", "Staðfærð")
4. Allow users to switch between available versions

## Migration Tasks

### Completed ✅
1. Created `02-machine-translated/` directory structure
2. Created `join-mt-output.js` tool to join segments
3. Processed all chapters (1-5, 9, 12-13) into `02-machine-translated/`

### Next Steps 🔲
1. **Create `markdown-to-html.js` tool** to render markdown → HTML
   - Read markdown with frontmatter
   - Render to semantic HTML
   - Output to correct publication track

2. **Migrate existing content:**
   - Content in `03-faithful-translation/` should move to `02-machine-translated/` (it's unreviewed MT)
   - After migration, `03-faithful-translation/` should be empty until editorial review is complete

3. **Delete `05-publication/for-mt/`:**
   - This directory shouldn't exist
   - Content is duplicated in `mt-preview/`

4. **Update status tracking:**
   - Track MT → Faithful → Localized progression
   - Update chapter status.json schema

5. **Update sync scripts:**
   - `sync-content.js` in namsbokasafn-vefur needs to understand new structure
   - Should sync from `05-publication/{track}/` to web app

## Tools Summary

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `cnxml-extract.js` | Extract CNXML to segments | `01-source/` | `02-for-mt/`, `02-structure/` |
| `protect-segments-for-mt.js` | Protect tags for MT | `02-for-mt/` | Modified segments |
| `unprotect-segments.js` | Unprotect MT output | `02-mt-output/` | Clean segments |
| `join-mt-output.js` | Join segments to modules | `02-mt-output/` + `02-structure/` | `02-machine-translated/` |
| `markdown-to-html.js` | Render markdown to HTML | `02-machine-translated/` or `03-faithful-translation/` or `04-localized-content/` | `05-publication/{track}/` |

## Format Decision

**Using Markdown throughout (not CNXML):**
- Simpler pipeline
- Easier for editors to work with
- Server editing UI works with markdown
- CNXML is only used for initial extraction, then we stay in markdown

The CNXML semantic information is preserved in:
- Structure JSON files (`02-structure/`)
- Markdown semantic markup (headings, lists, blockquotes, etc.)
- HTML data attributes during rendering
