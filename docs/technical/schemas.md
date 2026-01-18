# Schema Reference

This document describes the JSON Schema used for chapter status tracking.

## Overview

Each chapter has a `status.json` file in `books/<book>/chapters/ch##/` that tracks progress through the translation workflow. These files are validated against `schemas/chapter-status.schema.json`.

## File Location

```
books/
└── efnafraedi/
    └── chapters/
        ├── ch01/
        │   └── status.json
        ├── ch02/
        │   └── status.json
        └── ...
```

## Schema Structure

```json
{
  "chapter": 1,
  "titleEn": "Essential Ideas",
  "titleIs": "Grunnhugmyndir",
  "sections": [...],
  "status": {...},
  "images": {...},
  "notes": ""
}
```

---

## Field Reference

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chapter` | integer | Yes | Chapter number (1-based) |
| `titleEn` | string | Yes | English chapter title |
| `titleIs` | string \| null | Yes | Icelandic title (null if not yet translated) |
| `sections` | array | Yes | List of section objects |
| `status` | object | Yes | Workflow status for each stage |
| `images` | object | No | Image translation tracking |
| `notes` | string | No | General notes about the chapter |

### Sections Array

Each section object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Section ID (e.g., "1.1", "2.3") |
| `titleEn` | string | Yes | English section title |
| `titleIs` | string | Yes | Icelandic title (use "TBD" if pending) |

**Example:**
```json
{
  "sections": [
    { "id": "1.1", "titleEn": "Chemistry in Context", "titleIs": "Efnafræði í samhengi" },
    { "id": "1.2", "titleEn": "Phases of Matter", "titleIs": "TBD" }
  ]
}
```

### Status Object

Contains one entry per workflow stage:

| Stage | Type | Description |
|-------|------|-------------|
| `source` | StageStatus | Source material from OpenStax |
| `mtOutput` | StageStatus | Machine translation output |
| `matecat` | StageStatusWithProgress | TM alignment in Matecat |
| `editorialPass1` | EditorialStageStatus | Linguistic review (Pass 1) |
| `tmUpdated` | StageStatus | Translation memory updated |
| `editorialPass2` | EditorialStageStatus | Localization review (Pass 2) |
| `publication` | PublicationStatus | Published to web |

#### StageStatus (Basic)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `complete` | boolean | Yes | Whether stage is complete |
| `date` | string \| null | No | Completion date (YYYY-MM-DD) |

**Example:**
```json
{
  "source": {
    "complete": true,
    "date": "2024-11-01"
  }
}
```

#### StageStatusWithProgress

Extends StageStatus with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inProgress` | boolean | No | Currently being worked on |
| `notes` | string | No | Additional notes |

**Example:**
```json
{
  "matecat": {
    "complete": false,
    "inProgress": true,
    "notes": "Currently being aligned"
  }
}
```

#### EditorialStageStatus

Extends StageStatusWithProgress with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `editor` | string \| null | No | Name of the editor |
| `pending` | boolean | No | Waiting to start |

**Example:**
```json
{
  "editorialPass1": {
    "complete": false,
    "inProgress": true,
    "editor": "Anna Sigurðardóttir",
    "notes": "Reviewing sections 1-3"
  }
}
```

#### PublicationStatus

Extends StageStatus with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string \| null | No | Version identifier |
| `notes` | string | No | Publication notes |

**Example:**
```json
{
  "publication": {
    "complete": true,
    "date": "2024-11-01",
    "version": "ai-preview",
    "notes": "AI translation published for testing"
  }
}
```

### Images Object

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer \| null | Total images requiring translation |
| `translated` | integer | Number of images translated |
| `status` | string | One of: "not-started", "in-progress", "complete" |

**Example:**
```json
{
  "images": {
    "total": 15,
    "translated": 8,
    "status": "in-progress"
  }
}
```

---

## Complete Example

```json
{
  "chapter": 1,
  "titleEn": "Essential Ideas",
  "titleIs": "Grunnhugmyndir",
  "sections": [
    { "id": "1.1", "titleEn": "Chemistry in Context", "titleIs": "Efnafræði í samhengi" },
    { "id": "1.2", "titleEn": "Phases and Classification of Matter", "titleIs": "Fasar og flokkun efna" },
    { "id": "1.3", "titleEn": "Physical and Chemical Properties", "titleIs": "Eðlis- og efnafræðilegir eiginleikar" },
    { "id": "1.4", "titleEn": "Measurements", "titleIs": "Mælingar" },
    { "id": "1.5", "titleEn": "Measurement Uncertainty, Accuracy, and Precision", "titleIs": "Óvissa, nákvæmni og skerpa" },
    { "id": "1.6", "titleEn": "Mathematical Treatment of Measurement Results", "titleIs": "Stærðfræðileg meðhöndlun mæligagna" }
  ],
  "status": {
    "source": { "complete": true, "date": "2024-11-01" },
    "mtOutput": { "complete": true, "date": "2024-11-01" },
    "matecat": { "complete": true, "date": "2024-11-15" },
    "editorialPass1": {
      "complete": true,
      "date": "2024-12-10",
      "editor": "[FÁ Teacher]"
    },
    "tmUpdated": { "complete": false },
    "editorialPass2": { "complete": false },
    "publication": {
      "complete": true,
      "date": "2024-11-01",
      "version": "ai-preview",
      "notes": "AI translation published for testing"
    }
  },
  "images": {
    "total": null,
    "translated": 0,
    "status": "not-started"
  },
  "notes": "First chapter through complete Pass 1 workflow."
}
```

---

## Validation

### Running Validation

```bash
npm run validate
```

### Common Validation Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `missing required property "complete"` | Stage missing `complete` field | Add `"complete": false` to stage |
| `expected string, got null` | `titleEn` is null | Provide English title |
| `string does not match pattern` | Invalid date format | Use YYYY-MM-DD format |
| `expected integer, got string` | Chapter is quoted | Remove quotes: `"chapter": 1` not `"chapter": "1"` |

### Schema Location

The full JSON Schema is at: `schemas/chapter-status.schema.json`

---

## Creating New Chapters

1. Copy the template:
   ```bash
   cp templates/chapter-status.json books/efnafraedi/chapters/ch22/status.json
   ```

2. Edit the new file with chapter details

3. Validate:
   ```bash
   npm run validate efnafraedi
   ```

---

## See Also

- [CLI Reference](cli-reference.md) - How to update status via CLI
- [Workflow Overview](../workflow/overview.md) - Full translation pipeline
