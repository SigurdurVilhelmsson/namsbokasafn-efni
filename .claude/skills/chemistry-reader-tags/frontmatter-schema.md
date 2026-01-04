# Frontmatter Schema

Every publication markdown file requires YAML frontmatter.

## Required Fields

```yaml
---
title: "Section Title"
section: "1.3"
chapter: 1
---
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Section title displayed in header |
| `section` | string | Section number (e.g., "1.3") |
| `chapter` | integer | Chapter number |

## Optional Fields

```yaml
---
title: "Section Title"
section: "1.3"
chapter: 1
objectives:
  - First learning objective
  - Second learning objective
difficulty: intermediate
keywords:
  - efnafraedi
  - syru-basa
prerequisites:
  - Basic algebra
---
```

| Field | Type | Description |
|-------|------|-------------|
| `objectives` | list | Learning objectives (shown in emerald card) |
| `difficulty` | string | `beginner`, `intermediate`, or `advanced` |
| `keywords` | list | Topic keywords (shown in collapsible list) |
| `prerequisites` | list | Required prior knowledge |

## Difficulty Levels

- **`beginner`** (Byrjandi): Green, 1 bar
- **`intermediate`** (Midstig): Amber, 2 bars
- **`advanced`** (Framhald): Red, 3 bars

## Complete Example

```yaml
---
title: "Molmassi og mol"
section: "3.1"
chapter: 3
objectives:
  - Reikna molmassa fra efnaformulu
  - Umbreyta milli mola og gramma
  - Utskyra molhugtakid
difficulty: intermediate
keywords:
  - molmassi
  - mol
  - Avogadro
prerequisites:
  - Atomassi
  - Efnaformulur
source:
  original: "Chemistry 2e by OpenStax"
  authors: "Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson"
  license: "CC BY 4.0"
  translator: "Sigurdur E. Vilhelmsson"
  translationYear: 2025
---
```
