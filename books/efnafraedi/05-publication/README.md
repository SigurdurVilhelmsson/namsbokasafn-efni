# Publication Folder Structure

This folder contains web-ready markdown content in two parallel tracks:

## Folder Structure

```
05-publication/
├── mt-preview/          # Machine translation previews
│   ├── chapters/        # Chapter markdown files
│   └── toc.json         # Table of contents for MT version
├── faithful/            # Human-reviewed translations
│   ├── chapters/        # Chapter markdown files
│   └── toc.json         # Table of contents for faithful version
├── glossary.json        # Shared terminology (both versions)
└── toc.json             # Index of available versions
```

## Version Tracks

### mt-preview (Vélþýðing)

**Source:** `02-mt-output/` (machine translation from malstadur.is)

**Quality level:** Unreviewed machine translation

**Use case:** Early access for students while editorial review is in progress

**Status tracking:** `publication.mtPreview` in chapter status.json

**Workflow:**
1. Convert MT output from `02-mt-output/` to markdown
2. Add frontmatter with `version: mt-preview`
3. Place in `mt-preview/chapters/ch##/`
4. Update `mt-preview/toc.json`

### faithful (Yfirfarin þýðing)

**Source:** `03-faithful/` (after Pass 1 editorial review)

**Quality level:** Human-reviewed faithful translation

**Use case:** Production content after linguistic review complete

**Status tracking:** `publication.faithful` in chapter status.json

**Workflow:**
1. Convert reviewed content from `03-faithful/` to markdown
2. Add frontmatter with `version: faithful`
3. Place in `faithful/chapters/ch##/`
4. Update `faithful/toc.json`

## Future: Localized Version

When Pass 2 (localization) is implemented, add:

```
05-publication/
└── localized/           # Localized for Iceland (future)
    ├── chapters/
    └── toc.json
```

## File Naming

```
chapters/
└── ch##/
    ├── index.md         # Chapter introduction
    ├── ##.1.md          # Section files
    ├── ##.2.md
    └── ...
```

## Frontmatter Requirements

Each markdown file must include:

```yaml
---
title: "Section Title"
titleIs: "Icelandic Title"
chapter: 3
section: 1
version: "mt-preview"  # or "faithful" or "localized"
sourceVersion: "2024-11-01"
lastUpdated: "2026-01-12"
---
```

## Reader Website Integration

The reader website should:

1. Check available versions in root `toc.json`
2. Default to highest quality version available
3. Allow user to switch between versions
4. Display version badge (e.g., "Vélþýðing" vs "Yfirfarin")

## Status Tracking

Chapter status.json now tracks publication per version:

```json
{
  "publication": {
    "mtPreview": {
      "complete": true,
      "date": "2026-01-12"
    },
    "faithful": {
      "complete": false
    }
  }
}
```
