# Publication Format for namsbokasafn-vefur

This document describes the required format for content in `05-publication/{faithful|mt-preview}/` directories. This format is required for compatibility with the namsbokasafn-vefur web reader.

## Why This Format?

The web reader (namsbokasafn-vefur) uses URL-based routing and expects:
- URL-safe slugs for chapters and sections
- Specific JSON schemas for navigation and glossary
- Frontmatter metadata for rendering and attribution

## Directory Structure

```
05-publication/faithful/
├── toc.json
├── glossary.json
└── chapters/
    └── 01-grunnhugmyndir/       # {NN}-{slug}
        ├── 0-inngangur.md
        ├── 1-1-efnafraedi-i-samhengi.md
        ├── image-mapping.json
        └── images/
            └── *.jpg
```

## Slug Conventions

**Chapters:** `{NN}-{title}` — zero-padded number + hyphenated title without accents
- `01-grunnhugmyndir`
- `02-atom-og-sameindir`

**Sections:** `{N}-{N}-{title}` or `0-inngangur` for introductions
- `1-1-efnafraedi-i-samhengi`
- `2-3-bygging-atoma-og-taknmal`

**Accent removal:** ð→d, þ→th, á→a, é→e, í→i, ó→o, ú→u, ý→y, æ→ae, ö→o

## toc.json

```json
{
  "title": "Efnafræði 2e",
  "attribution": {
    "originalTitle": "Chemistry 2e",
    "originalAuthors": "...",
    "publisher": "OpenStax",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "originalUrl": "https://openstax.org/details/books/chemistry-2e",
    "translator": "Sigurður E. Vilhelmsson",
    "translationYear": 2025,
    "modifications": "..."
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

**Section types:** `glossary`, `equations`, `summary`, `exercises`, `answer-key`

## Markdown Frontmatter

```yaml
---
title: "Efnafræði í samhengi"
section: "1.1"
chapter: 1
objectives:
  - Lýst sögulegri þróun efnafræðinnar
source:
  original: "Chemistry 2e by OpenStax"
  authors: "..."
  license: "CC BY 4.0"
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
  originalUrl: "https://openstax.org/details/books/chemistry-2e"
  translator: "Sigurður E. Vilhelmsson"
  translationYear: 2025
  modifications: "..."
---
```

## glossary.json

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

## Images

Reference with relative paths:

```markdown
![Alt text](images/CNX_Chem_01_01_Example.jpg)

**Mynd 1.2** Caption here...
```

## Sync

The sync script prefers `faithful/` over `mt-preview/`:

```bash
# In namsbokasafn-vefur
node scripts/sync-content.js efnafraedi
```
