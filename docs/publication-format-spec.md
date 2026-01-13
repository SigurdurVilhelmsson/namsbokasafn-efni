# Publication Format Specification

This document describes the expected structure and format for book content published to namsbokasafn-vefur. Content in namsbokasafn-efni should be exported to this format in the `05-publication/{faithful|mt-preview}/` directories.

## Directory Structure

```
{bookSlug}/
├── toc.json                    # Table of contents with navigation structure
├── glossary.json               # Book-wide glossary terms
└── chapters/
    └── {chapterSlug}/          # e.g., "01-grunnhugmyndir"
        ├── {sectionSlug}.md    # e.g., "1-1-efnafraedi-i-samhengi.md"
        ├── image-mapping.json  # Figure number to filename mapping
        └── images/
            └── *.jpg           # Chapter images
```

## Naming Conventions

### Book Slug
- Lowercase Icelandic without accents
- Example: `efnafraedi`

### Chapter Slug
- Format: `{NN}-{title-slug}` where NN is zero-padded chapter number
- Use lowercase, hyphen-separated words
- Remove accents (ð→d, þ→th, á→a, etc.)
- Examples:
  - `01-grunnhugmyndir`
  - `02-atom-og-sameindir`

### Section Slug
- Format: `{chapter}-{section}-{title-slug}` or `{section-number}-{title-slug}`
- Introduction sections use `0-inngangur`
- Examples:
  - `0-inngangur.md`
  - `1-1-efnafraedi-i-samhengi.md`
  - `1-7-lykilhugtok.md`

## toc.json Schema

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
      "slug": "01-grunnhugmyndir",
      "sections": [
        {
          "number": "1.0",
          "title": "Inngangur",
          "slug": "0-inngangur",
          "file": "0-inngangur.md"
        },
        {
          "number": "1.1",
          "title": "Efnafræði í samhengi",
          "slug": "1-1-efnafraedi-i-samhengi",
          "file": "1-1-efnafraedi-i-samhengi.md"
        },
        {
          "number": "1.7",
          "title": "Lykilhugtök",
          "slug": "1-7-lykilhugtok",
          "file": "1-7-lykilhugtok.md",
          "type": "glossary"
        }
      ]
    }
  ]
}
```

### Chapter Object

| Field    | Type    | Required | Description                                      |
|----------|---------|----------|--------------------------------------------------|
| `number` | integer | Yes      | Chapter number (1, 2, 3...)                      |
| `title`  | string  | Yes      | Chapter title in Icelandic                       |
| `slug`   | string  | Yes      | URL-safe chapter identifier (see naming above)  |
| `sections` | array | Yes      | Array of section objects                         |

### Section Object

| Field    | Type   | Required | Description                                       |
|----------|--------|----------|---------------------------------------------------|
| `number` | string | Yes      | Section number ("1.0", "1.1", "2.3", etc.)       |
| `title`  | string | Yes      | Section title in Icelandic                        |
| `slug`   | string | Yes      | URL-safe section identifier                       |
| `file`   | string | Yes      | Filename of markdown file                         |
| `type`   | string | No       | Section type (see below)                          |

### Section Types

Optional `type` field for special sections:

| Type        | Description                    |
|-------------|--------------------------------|
| `glossary`  | Key terms (Lykilhugtök)        |
| `equations` | Key equations (Lykiljöfnur)    |
| `summary`   | Chapter summary (Samantekt)    |
| `exercises` | Practice problems (Dæmi)       |
| `answer-key`| Answers to exercises (Svör)    |

## Markdown Frontmatter

Each markdown file must include YAML frontmatter:

```yaml
---
title: "Efnafræði í samhengi"
section: "1.1"
chapter: 1
objectives:
  - Lýst sögulegri þróun efnafræðinnar
  - Nefnt dæmi um mikilvægi efnafræði í daglegu lífi
source:
  original: "Chemistry 2e by OpenStax"
  authors: "Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson"
  license: "CC BY 4.0"
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
  originalUrl: "https://openstax.org/details/books/chemistry-2e"
  translator: "Sigurður E. Vilhelmsson"
  translationYear: 2025
  modifications: "Translated to Icelandic, adapted for Icelandic high school students"
---
```

### Frontmatter Fields

| Field       | Type    | Required | Description                              |
|-------------|---------|----------|------------------------------------------|
| `title`     | string  | Yes      | Section title in Icelandic               |
| `section`   | string  | Yes      | Section number (e.g., "1.1")             |
| `chapter`   | integer | Yes      | Chapter number                           |
| `objectives`| array   | No       | Learning objectives (list of strings)    |
| `source`    | object  | Yes      | Attribution information                  |

## glossary.json Schema

```json
{
  "terms": [
    {
      "term": "nákvæmni",
      "english": "accuracy",
      "definition": "hversu vel mæling samræmist réttu gildi",
      "chapter": "1",
      "section": "1.5"
    }
  ]
}
```

### Term Object

| Field       | Type   | Required | Description                              |
|-------------|--------|----------|------------------------------------------|
| `term`      | string | Yes      | Icelandic term                           |
| `english`   | string | Yes      | Original English term                    |
| `definition`| string | Yes      | Icelandic definition                     |
| `chapter`   | string | Yes      | Chapter number where term is introduced  |
| `section`   | string | Yes      | Section number where term is introduced  |

## image-mapping.json Schema

Maps figure numbers to image filenames within each chapter:

```json
{
  "comments": "Mapping from figure numbers to actual image files",
  "mapping": {
    "1.1": "CNX_Chem_01_00_DailyChem.jpg",
    "1.2": "CNX_Chem_01_01_Alchemist.jpg"
  }
}
```

## Image References in Markdown

Images are referenced with relative paths to the `images/` directory:

```markdown
![Alt text in Icelandic](images/CNX_Chem_01_01_Alchemist.jpg)

**Mynd 1.2** Caption text in Icelandic...
```

## Custom Directives

The markdown content supports custom directives for interactive elements:

```markdown
:::practice-problem
Problem content here
:::

:::note
Note content here
:::

:::warning
Warning content here
:::

:::example
Example content here
:::
```

## Math Notation

Use LaTeX syntax with single `$` for inline and double `$$` for display math:

```markdown
The formula is $E = mc^2$ for energy.

$$
\ce{2H2 + O2 -> 2H2O}
$$
```

Chemical equations use mhchem syntax within `\ce{}`.

## Sync Workflow

The sync script (`scripts/sync-content.js`) in namsbokasafn-vefur syncs from:

1. `books/{bookSlug}/05-publication/faithful/` (preferred)
2. `books/{bookSlug}/05-publication/mt-preview/` (fallback)

Content is synced to `public/content/{bookSlug}/` in namsbokasafn-vefur.

## Validation

After syncing, content can be validated with:

```bash
npm run lint-content
```

This checks for:
- Valid toc.json structure
- All referenced files exist
- Valid frontmatter in markdown files
- Required fields present
