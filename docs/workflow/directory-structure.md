# Directory Structure (Updated 2026-02-10)

This document describes the current, cleaned-up directory structure for the translation workflow.

## Overview

The workflow progresses through clear stages with separate working and final directories:

```
MT Output → Machine Translated → MT Preview (students can use)
              ↓
            Editing → Faithful Translation → Faithful (academically citable)
              ↓
            Localization → Localized Content → Localized (fully adapted)
```

## Directory Structure

```
books/efnafraedi/
├── 01-source/              # 🔒 READ ONLY - OpenStax CNXML originals
│   └── chNN/               #   Original CNXML modules + media
│
├── 02-for-mt/              # GENERATED - EN segments for MT
│   └── chNN/               #   m{id}-segments.en.md
│
├── 02-mt-output/           # 🔒 READ ONLY - Raw MT from Erlendur
│   └── chNN/               #   m{id}-segments.is.md (may be split)
│
├── 02-structure/           # GENERATED - Document structure metadata
│   └── chNN/               #   m{id}-structure.json, m{id}-equations.json
│
├── 02-machine-translated/  # STAGING - Merged MT segments
│   └── chNN/               #   m{id}-segments.is.md (merged, ready for preview)
│
├── 03-editing/             # ✏️ WORKING - Editorial review in progress
│   └── chNN/               #   Copied from 02-machine-translated
│
├── 03-faithful-translation/ # ✅ FINAL - Completed editorial review
│   └── chNN/               #   Moved from 03-editing when complete
│
├── 03-translated/          # GENERATED - Injected CNXML (intermediate)
│   └── <track>/chNN/       #   m{id}.cnxml (track = mt-preview, faithful, localized)
│
├── 04-localization/        # ✏️ WORKING - Localization in progress
│   └── chNN/               #   Copied from 03-faithful-translation
│
├── 04-localized-content/   # ✅ FINAL - Completed localization
│   └── chNN/               #   Moved from 04-localization when complete
│
└── 05-publication/         # GENERATED - Web-ready HTML
    ├── mt-preview/         #   From 02-machine-translated (unreviewed)
    ├── faithful/           #   From 03-faithful-translation (reviewed)
    └── localized/          #   From 04-localized-content (adapted)
```

## Workflow Stages

### Stage 1: Extract & Machine Translation

```bash
# 1a. Extract CNXML to segments
node tools/cnxml-extract.js --input books/efnafraedi/01-source/chNN

# 1b. Protect segments for MT
node tools/protect-segments-for-mt.js --chapter NN

# 1c. MANUAL: Download, run through Erlendur MT, save to 02-mt-output

# 1d. Unprotect and merge MT output
node tools/unprotect-segments.js --chapter NN

# 1e. Copy to machine-translated (staging)
cp 02-mt-output/chNN/*.is.md 02-machine-translated/chNN/

# 1f. Render MT Preview
node tools/cnxml-inject.js --chapter NN --source-dir 02-machine-translated
node tools/cnxml-render.js --chapter NN --track mt-preview
```

**Output:** `05-publication/mt-preview/chapters/NN/`
**Status:** Unreviewed MT, acceptable for immediate student use

### Stage 2: Editorial Review (Pass 1)

```bash
# 2a. Initialize editing
cp -r 02-machine-translated/chNN 03-editing/

# 2b. MANUAL: Edit via server interface
#     - Fix translation errors
#     - Improve terminology
#     - Ensure linguistic accuracy

# 2c. Move to faithful when complete
mv 03-editing/chNN 03-faithful-translation/

# 2d. Render Faithful track
node tools/cnxml-inject.js --chapter NN --source-dir 03-faithful-translation
node tools/cnxml-render.js --chapter NN --track faithful
```

**Output:** `05-publication/faithful/chapters/NN/`
**Status:** Human-reviewed, academically citable

### Stage 3: Localization (Pass 2)

```bash
# 3a. Initialize localization
cp -r 03-faithful-translation/chNN 04-localization/

# 3b. MANUAL: Localize via server interface
#     - Convert units (F→C, miles→km)
#     - Adapt examples for Iceland
#     - Update cultural references

# 3c. Move to localized-content when complete
mv 04-localization/chNN 04-localized-content/

# 3d. Render Localized track
node tools/cnxml-inject.js --chapter NN --source-dir 04-localized-content
node tools/cnxml-render.js --chapter NN --track localized
```

**Output:** `05-publication/localized/chapters/NN/`
**Status:** Fully adapted for Icelandic students

## Publication Tracks

| Track | Source | Quality | Use Case |
|-------|--------|---------|----------|
| **mt-preview** | `02-machine-translated/` | Unreviewed MT | Early access, non-citable |
| **faithful** | `03-faithful-translation/` | Human-reviewed | Production, academically citable |
| **localized** | `04-localized-content/` | Reviewed + adapted | Best experience for Icelandic students |

## Web Application Behavior

The `namsbokasafn-vefur` sync script checks tracks in priority order:
1. **Localized** (best) - if available
2. **Faithful** (good) - if available
3. **MT Preview** (acceptable) - fallback

Students automatically see the highest quality version available for each chapter.

## Current Status (2026-02-10)

**Chapters processed:**
- Chapters 01-05, 09, 12, 13

**Current state:**
- All chapters: MT Preview track ✅ (05-publication/mt-preview/)
- No chapters: Faithful track (not yet reviewed)
- No chapters: Localized track (not yet localized)

## Removed Directories

The following directories were removed during cleanup (backed up to `.backup-20260210/`):
- `05-publication/for-mt/` - Should never have existed
- `03-machine-translation/` - Old markdown-based workflow (abandoned)
- `03-faithful/` - Old directory name (replaced by 03-faithful-translation)

## Tools Summary

| Tool | Purpose |
|------|---------|
| `cnxml-extract.js` | CNXML → segments + structure |
| `protect-segments-for-mt.js` | Prepare segments for MT |
| `unprotect-segments.js` | Merge split files, restore content |
| `cnxml-inject.js` | Segments → CNXML |
| `cnxml-render.js` | CNXML → HTML |
