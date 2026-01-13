# Frontmatter Schema

YAML frontmatter requirements for chemistry content markdown files.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Section title in Icelandic |
| `section` | string | Section number (e.g., "1.3", "2.1") |
| `chapter` | integer | Chapter number |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `objectives` | list | Learning objectives for the section |
| `difficulty` | enum | `beginner`, `intermediate`, or `advanced` |
| `keywords` | list | Key terms covered (for search/indexing) |
| `prerequisites` | list | Concepts students should know beforehand |
| `estimatedTime` | string | Estimated reading time (e.g., "15 mín") |

## Complete Example

```yaml
---
title: Rafskaut og spenna
section: "4.2"
chapter: 4
objectives:
  - Útskýra hvað rafskaut er
  - Bera kennsl á oxun og afoxun við rafskaut
  - Reikna rafspennur rafgrinda
difficulty: intermediate
keywords:
  - rafskaut
  - anóða
  - katóða
  - rafspenna
  - hálfhvörf
prerequisites:
  - Grunnþekking á oxunartölum (kafli 3.4)
  - Skilningur á jónabindingum
estimatedTime: "20 mín"
---
```

## Minimal Example

```yaml
---
title: Inngangur að efnafræði
section: "1.1"
chapter: 1
---
```

## Notes

### Section Numbering

The `section` field should match the section's position in the book:
- Chapter 1, Section 3 → `"1.3"`
- Chapter 12, Section 1 → `"12.1"`

Use strings to preserve leading zeros if needed.

### Learning Objectives

Write objectives using action verbs (Bloom's taxonomy):
- "Útskýra..." (Explain)
- "Bera kennsl á..." (Identify)
- "Reikna..." (Calculate)
- "Greina..." (Analyze)
- "Nota..." (Apply)
- "Bera saman..." (Compare)

### Keywords

Include:
- Technical terms defined in the section
- Important concepts covered
- Terms students might search for

### Prerequisites

Reference by concept, not section number (sections may change):
- ✓ "Grunnþekking á atómbyggingu"
- ✗ "Kafli 2.1"

## Validation

When reviewing frontmatter, check:

1. **Required fields present**: title, section, chapter
2. **Section format**: String in "X.Y" format
3. **Chapter format**: Integer
4. **Objectives format**: List of strings starting with action verbs
5. **Difficulty values**: Only beginner/intermediate/advanced if present
