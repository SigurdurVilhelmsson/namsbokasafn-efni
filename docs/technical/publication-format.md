# Publication Format Specification v2

This document describes the unified format for book content shared between namsbokasafn-efni and namsbokasafn-vefur.

**Design principles:**
- Minimize transformation burden on efni
- Use number-based paths for URL stability
- Keep file naming in efni's natural workflow
- Derive display values at build time in vefur

## Directory Structure

```
{bookSlug}/
├── toc.json                    # Required: navigation and metadata
├── glossary.json               # Optional: book-wide glossary
└── chapters/
    └── {NN}/                   # Zero-padded chapter number (01, 02, ...)
        ├── {N-N-name}.md       # Section files (English-based names OK)
        └── images/             # Chapter images
            └── *.jpg
```

### Examples

```
efnafraedi/
├── toc.json
├── glossary.json
└── chapters/
    ├── 01/
    │   ├── 1-0-introduction.md
    │   ├── 1-1-chemistry-in-context.md
    │   ├── 1-2-phases-and-classification.md
    │   ├── 1-7-key-terms.md
    │   └── images/
    └── 02/
        ├── 2-0-introduction.md
        ├── 2-1-early-ideas.md
        └── images/
```

### Naming Conventions

| Element | Format | Examples |
|---------|--------|----------|
| Book slug | lowercase, no accents | `efnafraedi` |
| Chapter folder | zero-padded number | `01`, `02`, `10` |
| Section file | `{chapter}-{section}-{name}.md` | `2-1-early-ideas.md` |
| Introduction | `{chapter}-0-introduction.md` | `1-0-introduction.md` |

**File names:**
- Use lowercase with hyphens
- English-based names are acceptable (no Icelandic slug requirement)
- Must be URL-safe (no spaces, accents, or special characters)

## toc.json

### Schema

```json
{
  "title": "Efnafræði 2e",
  "attribution": {
    "originalTitle": "Chemistry 2e",
    "originalAuthors": "Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson",
    "publisher": "OpenStax",
    "originalUrl": "https://openstax.org/details/books/chemistry-2e",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "translator": "Sigurður E. Vilhelmsson",
    "translationYear": 2025,
    "modifications": "Translated to Icelandic, adapted for Icelandic high school students"
  },
  "chapters": [
    {
      "number": 1,
      "title": "Grunnhugmyndir",
      "sections": [
        {
          "number": "1.0",
          "title": "Inngangur",
          "file": "1-0-introduction.md"
        },
        {
          "number": "1.1",
          "title": "Efnafræði í samhengi",
          "file": "1-1-chemistry-in-context.md"
        },
        {
          "number": "1.7",
          "title": "Lykilhugtök",
          "file": "1-7-key-terms.md",
          "type": "glossary"
        }
      ]
    }
  ]
}
```

### Chapter Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | integer | Yes | Chapter number (1, 2, 3...) |
| `title` | string | Yes | Chapter title in Icelandic |
| `sections` | array | Yes | Array of section objects |

### Section Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | Section number ("1.0", "1.1", "2.3") |
| `title` | string | Yes | Section title in Icelandic |
| `file` | string | Yes | Filename (relative to chapter folder) |
| `type` | string | No | Section type (see below) |

### Section Types

| Type | Description | Icelandic Title |
|------|-------------|-----------------|
| *(default)* | Regular content section | — |
| `glossary` | Key terms | Lykilhugtök |
| `equations` | Key equations | Lykiljöfnur |
| `summary` | Chapter summary | Samantekt |
| `exercises` | Practice problems | Dæmi |
| `answer-key` | Answers to exercises | Svör |

## Markdown Files

### Frontmatter (minimal)

```yaml
---
title: "Efnafræði í samhengi"
section: "1.1"
chapter: 1
---
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Section title (without section number prefix) |
| `section` | string | Yes | Section number |
| `chapter` | integer | Yes | Chapter number |

**Note:** Learning objectives remain in the content body as `:::note` blocks. Attribution comes from `toc.json`. Working metadata (status, translation type, lastUpdated) should be stripped before publication.

### Content

Standard markdown with:
- Images: `![Alt text](images/filename.jpg)`
- Math: `$inline$` and `$$display$$`
- Chemical equations: `$\ce{H2O}$`
- Custom directives: `:::note`, `:::warning`, `:::example`, `:::practice-problem`

## glossary.json (Optional)

Can be empty initially and populated incrementally.

```json
{
  "terms": []
}
```

### Full Term Object (when populated)

```json
{
  "terms": [
    {
      "term": "atómkenning",
      "english": "atomic theory",
      "definition": "Kenning sem lýsir byggingu og hegðun atóma",
      "chapter": "2",
      "section": "2.1"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `term` | string | Yes | Icelandic term |
| `english` | string | No | English term (add when available) |
| `definition` | string | Yes | Icelandic definition |
| `chapter` | string | Yes | Chapter where introduced |
| `section` | string | Yes | Section where introduced |

## URL Routing (vefur)

Vefur generates URLs from chapter and section numbers:

| Content | URL Pattern |
|---------|-------------|
| Book home | `/{bookSlug}` |
| Chapter | `/{bookSlug}/kafli/{NN}` |
| Section | `/{bookSlug}/kafli/{NN}/{N-N}` |

Examples:
- `/efnafraedi/kafli/01` — Chapter 1
- `/efnafraedi/kafli/02/2-1` — Section 2.1

Display titles (for breadcrumbs, navigation) come from `toc.json`.

## Migration from v1

If migrating from the original spec:

| v1 Requirement | v2 Change |
|----------------|-----------|
| Icelandic folder slugs (`02-atom-og-sameindir/`) | Number only (`02/`) |
| Icelandic file slugs | English-based names OK |
| `slug` field in toc.json | Removed (derived from number) |
| `source` in frontmatter | Removed (use toc.json attribution) |
| `objectives` in frontmatter | Keep in content as `:::note` |
| Populated glossary.json | Optional, can be empty |
| image-mapping.json | Optional |

## Sync Script

The sync script in namsbokasafn-vefur syncs from:

1. `books/{bookSlug}/05-publication/faithful/` (preferred)
2. `books/{bookSlug}/05-publication/mt-preview/` (fallback)

```bash
npm run sync-content              # Sync all books
npm run sync-content efnafraedi   # Sync specific book
npm run sync-content --dry-run    # Preview changes
```

## Version Switcher (Root toc.json)

Books with multiple publication tracks use a root-level `toc.json` for version selection.

### Location

`{bookSlug}/toc.json` (at publication root, not inside track folders)

### Schema

```json
{
  "bookId": "efnafraedi",
  "title": "Efnafræði",
  "versions": [
    {
      "id": "faithful",
      "label": "Yfirfarin þýðing",
      "description": "Human-reviewed faithful translation",
      "path": "faithful/",
      "priority": 1
    },
    {
      "id": "mt-preview",
      "label": "Vélþýðing (forskoðun)",
      "description": "Machine translation preview",
      "path": "mt-preview/",
      "priority": 2
    }
  ]
}
```

### Root toc.json Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookId` | string | Yes | URL-safe book identifier |
| `title` | string | Yes | Book title in Icelandic |
| `versions` | array | Yes | Available publication tracks |

### Version Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Track identifier |
| `label` | string | Yes | Display label in Icelandic |
| `description` | string | No | Extended description |
| `path` | string | Yes | Path to track folder (trailing slash) |
| `priority` | integer | Yes | Selection priority (1 = highest) |

The sync script uses priority to select which track to display when both exist for the same chapter.

## Validation

Minimal requirements for valid publication:

- [ ] `toc.json` exists with required fields
- [ ] All files referenced in `toc.json` exist
- [ ] Each markdown file has required frontmatter (`title`, `section`, `chapter`)
- [ ] Chapter folders match pattern `{NN}/`

Optional (add as needed):
- [ ] `glossary.json` has valid schema (if present)
- [ ] Images referenced in markdown exist
- [ ] No broken internal links
