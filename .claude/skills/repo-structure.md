---
name: repo-structure
description: Ensure correct file naming and locations. Always active when creating, moving, or saving files. Prevents files from being saved in wrong locations.
---

# Repository Structure and File Naming

## Critical Rules

### File Preservation
**Source files are sacred. NEVER modify files in 01-source/ or 02-mt-output/.**

| Folder | Permission | Notes |
|--------|------------|-------|
| 01-source/ | READ ONLY | Original OpenStax CNXML files |
| 02-mt-output/ | READ ONLY | MT reference only |
| 02-for-mt/ | GENERATED | Created by cnxml-extract |
| 02-structure/ | GENERATED | Structure/equations JSON |
| 03-faithful/ | READ + WRITE | Reviewed IS segments |
| 03-translated/ | GENERATED | Translated CNXML from inject |
| 04-localized/ | READ + WRITE | Pass 2 localized segments |
| 05-publication/ | GENERATED | HTML from cnxml-render |
| tm/ | READ ONLY | Managed by Matecat |
| glossary/ | READ + WRITE | Terminology database |

### Before Modifying Any File

1. Verify folder permissions (see above)
2. Create backup: `{filename}.{YYYY-MM-DD-HHMM}.bak`
3. Or commit current state to git
4. Log the action in `logs/activity-log.md`

## Naming Conventions

### Chapter Folders
- Format: `ch{NN}` with zero-padded two digits
- Correct: `ch01`, `ch02`, `ch03`, ... `ch21`
- Wrong: `ch1`, `chapter-01`, `chapter1`

### Segment Files (Current Pipeline)
- **EN segments:** `{moduleId}-segments.en.md`
- **IS segments (MT):** `{moduleId}-segments.is.md`
- **IS segments (reviewed):** `{moduleId}-segments.is.md` (in 03-faithful/)
- **Location:** `books/{book}/02-for-mt/ch{NN}/` or `03-faithful/ch{NN}/`
- Example: `m68781-segments.en.md`, `m68781-segments.is.md`

### Structure Files
- **Structure JSON:** `{moduleId}-structure.json`
- **Equations JSON:** `{moduleId}-equations.json`
- **Location:** `books/{book}/02-structure/ch{NN}/`

### Translated CNXML
- **Format:** `{moduleId}.cnxml`
- **Location:** `books/{book}/03-translated/ch{NN}/`
- Example: `m68781.cnxml`

### Rendered HTML
- **Format:** `{moduleId}.html`
- **Location:** `books/{book}/05-publication/faithful/ch{NN}/` (or mt-preview/, localized/)
- Example: `m68781.html`

### Status Files
- Always: `status.json` (lowercase)
- Location: `books/{book}/chapters/ch{NN}/status.json`

## Folder Structure Reference

```
books/{book}/
├── 01-source/
│   └── ch{NN}/             # Original CNXML files
├── 02-for-mt/
│   └── ch{NN}/             # EN segments for MT
│       ├── *-segments.en.md
│       └── *-strings.en.md
├── 02-structure/
│   └── ch{NN}/             # Extracted structure
│       ├── *-structure.json
│       └── *-equations.json
├── 02-mt-output/
│   └── ch{NN}/             # IS segments from MT
│       └── *-segments.is.md
├── 03-faithful/
│   └── ch{NN}/             # Reviewed segments (Pass 1)
│       └── *-segments.is.md
├── 03-translated/
│   └── ch{NN}/             # Translated CNXML
│       └── *.cnxml
├── 04-localized/
│   └── ch{NN}/             # Localized segments (Pass 2)
│       └── *-segments.is.md
├── 05-publication/
│   ├── mt-preview/ch{NN}/  # MT HTML
│   ├── faithful/ch{NN}/    # Reviewed HTML
│   └── localized/ch{NN}/   # Localized HTML
│       └── *.html
├── tm/
│   ├── *.tmx               # Translation memory
│   └── exports/            # Parallel corpus
├── glossary/
│   └── terminology-en-is.csv
└── chapters/
    └── ch{NN}/
        └── status.json     # Chapter status
```

## Validation Rules

Before creating any file:
1. Target folder exists
2. Naming convention matches stage
3. Chapter number is zero-padded
4. Not creating in wrong stage folder
5. Not overwriting without backup

Common mistakes to prevent:
- Saving to 03-faithful/ during localization (should be 04-localized/)
- Creating ch1/ instead of ch01/
- Editing files in GENERATED directories (02-for-mt/, 03-translated/, 05-publication/)
- Modifying files in READ ONLY directories (01-source/, 02-mt-output/, tm/)

## Current Pipeline File Flow

```
01-source/ch{NN}/*.cnxml
    ↓ (cnxml-extract.js)
02-for-mt/ch{NN}/*-segments.en.md
02-structure/ch{NN}/*-structure.json
    ↓ (manual MT via malstadur.is)
02-mt-output/ch{NN}/*-segments.is.md
    ↓ (manual review via /segment-editor)
03-faithful/ch{NN}/*-segments.is.md
    ↓ (cnxml-inject.js)
03-translated/ch{NN}/*.cnxml
    ↓ (cnxml-render.js)
05-publication/faithful/ch{NN}/*.html
```
