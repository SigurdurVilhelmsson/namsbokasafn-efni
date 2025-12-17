# Assets Documentation

This document describes the valuable assets produced by the Námsbókasafn translation project and how they can be used.

## Overview

Our two-pass editorial workflow produces four distinct valuable assets:

| Asset | Location | Format | Primary Value |
|-------|----------|--------|---------------|
| Faithful Translation | `03-faithful/` | .docx, .md | Academic, archival |
| Human-Verified TM | `tm/` | .tmx, .txt | NLP/ML training |
| Localized Translation | `04-localized/` | .docx | Education |
| Terminology Glossary | `glossary/` | .csv | Reference, NLP |

All assets are released under **CC BY 4.0** license.

---

## 1. Faithful Translation

**Location:** `books/{book}/03-faithful/`

### What It Is

A human-verified Icelandic translation that faithfully represents the English source text. This is produced after Editorial Pass 1 (linguistic review) and contains:

- Natural, grammatically correct Icelandic
- Consistent terminology
- No localization changes (units, cultural references preserved from source)
- Human corrections to machine translation

### Formats

- `.docx` - Original Word format with formatting preserved
- `.md` - Markdown conversion for easy reading and export

### Use Cases

**Academic Citation**
- Can be cited as a faithful translation of the source
- Provides a stable reference point

**Archival**
- Preserves the translation before localization
- Allows comparison between faithful and localized versions

**Translation Studies**
- Documents the translation process
- Shows pre-localization state

**Baseline for Localization**
- Serves as the starting point for localized versions
- Can be localized for different contexts

### Why It Matters

Many translation projects only preserve the final localized version. By preserving the faithful translation, we:
- Enable academic use where localization would be inappropriate
- Provide transparency in the translation process
- Create a valuable parallel corpus with the source

---

## 2. Human-Verified Translation Memory

**Location:** `books/{book}/tm/`

### What It Is

A segment-aligned parallel corpus of English source text and Icelandic translation. Crucially, this is **not just machine translation output** - it contains human corrections from Editorial Pass 1.

### Formats

- `.tmx` - Translation Memory eXchange format (industry standard)
- `exports/*.txt` - Plain text parallel files (one sentence per line)

### Contents

Each TM entry contains:
- Source segment (English)
- Target segment (Icelandic)
- Metadata (date, quality level, etc.)

### Use Cases

**Training Machine Translation Systems**
- High-quality EN↔IS parallel data is scarce
- Human-verified corrections improve MT training
- Chemistry/science domain-specific

**Training Icelandic Language Models**
- Quality Icelandic text for LLM training
- Domain-specific vocabulary
- Technical register

**Other Translation Projects**
- Translators can leverage the TM for related projects
- Consistent terminology across projects

**Linguistic Research**
- Study of Icelandic scientific terminology
- Translation studies
- Corpus linguistics

### Why It Matters

**Quality over Quantity**

Most parallel corpora are either:
- Machine-translated (low quality)
- Human-translated but not verified (variable quality)

Our TM is:
- Machine-translated initially
- Human-corrected by editor
- Verified for terminology consistency

This makes it significantly more valuable for training NLP systems.

**Domain-Specific**

General-domain parallel corpora are more common. Scientific/educational domain data in Icelandic is rare, making this particularly valuable.

### Export Format

The parallel text export (`tm/exports/`) provides easy-to-use formats:

```
en_source.txt:
The atom is the basic unit of matter.
Electrons orbit the nucleus.

is_target.txt:
Atómið er grunneieingin efnis.
Rafeindir snúast um kjarnann.
```

---

## 3. Terminology Glossary

**Location:** `books/{book}/glossary/`

### What It Is

A standardized list of Icelandic translations for scientific terms, with:
- English term
- Icelandic term
- Category
- Usage notes
- Source reference
- Approval status

### Format

Primary format is `.csv` for easy use:

```csv
english,icelandic,category,notes,source,status
atom,atóm,fundamental,,"Icelandic naming convention",approved
molecule,sameind,fundamental,,"Icelandic naming convention",approved
```

Also exported to `.json` for web use.

### Use Cases

**Other Translators**
- Reference for translating scientific texts
- Ensures consistency across projects

**NLP Applications**
- Named entity recognition for scientific terms
- Domain-specific dictionaries

**Educational Resources**
- Study aids for students
- Reference material for teachers

**Terminology Research**
- Documentation of Icelandic scientific terminology
- Input for official terminology databases

### Why It Matters

Scientific terminology in Icelandic is:
- Sometimes inconsistent across sources
- Not always documented in official databases
- Important for maintaining Icelandic as a language of science

This glossary contributes to:
- Standardization of Icelandic scientific terminology
- Preservation of Icelandic technical vocabulary
- Resources for future translation work

---

## 4. Localized Translation

**Location:** `books/{book}/04-localized/` and `books/{book}/05-publication/`

### What It Is

The final translation adapted for Icelandic secondary school students, including:
- SI units (metric system)
- Icelandic cultural context and examples
- Local relevance (geothermal, fishing industry, etc.)
- Extended exercises where beneficial

### Formats

- `.docx` in `04-localized/docx/` - Source files with changes
- `.md` in `05-publication/chapters/` - Publication-ready web content

### Accompanying Documentation

Each localized chapter has a **localization log** (`04-localized/localization-logs/`) documenting:
- Every unit conversion made
- Cultural adaptations
- Added content
- Rationale for changes

### Use Cases

**Education**
- Primary use: teaching Icelandic students
- Published at efnafraedi.app

**Pedagogical Research**
- Study of localization in educational materials
- Comparison with source and faithful translation

**Model for Other Languages**
- Documentation shows how localization was done
- Can inform similar projects in other languages

### Why It Matters

Localization isn't just translation - it's adaptation for the target audience. The localized version:
- Uses units familiar to Icelandic students
- Provides relevant context
- Connects to local knowledge and experience

The localization logs provide transparency and enable academic study of the localization process.

---

## How to Cite / Attribution

### Required Attribution

All assets are under CC BY 4.0. When using any asset, include:

```
Icelandic translation by Sigurður E. Vilhelmsson
Source: [Book Title] by [Authors], OpenStax, Rice University
License: CC BY 4.0
```

### Suggested Citations

**For the faithful translation:**
```
Vilhelmsson, S.E. (trans.) (2024). Efnafræði [Icelandic translation of
Chemistry 2e]. Námsbókasafn. https://github.com/SigurdurVilhelmsson/namsbokasafn-efni
Original: Flowers, P., et al. Chemistry 2e. OpenStax, Rice University.
```

**For the Translation Memory:**
```
Vilhelmsson, S.E. (2024). Icelandic Chemistry Translation Memory (EN-IS).
Námsbókasafn. https://github.com/SigurdurVilhelmsson/namsbokasafn-efni
Based on Chemistry 2e by Flowers, P., et al. OpenStax, Rice University.
```

**For the localized version:**
```
Vilhelmsson, S.E. (2024). Efnafræði: Staðfærð útgáfa fyrir íslenska nemendur.
Námsbókasafn. https://efnafraedi.app
Based on Chemistry 2e by Flowers, P., et al. OpenStax, Rice University.
```

---

## Access and Download

### Repository

All assets are in the GitHub repository:
https://github.com/SigurdurVilhelmsson/namsbokasafn-efni

### Published Website

The localized version is published at:
https://efnafraedi.app

### Downloading Assets

**Clone the repository:**
```bash
git clone https://github.com/SigurdurVilhelmsson/namsbokasafn-efni.git
```

**Download specific assets:**
Navigate to the relevant folder in GitHub and download individual files.

---

## Contributing

If you'd like to contribute to improving these assets:
- See [contributing.md](contributing.md) for how to participate
- Feedback on terminology is especially welcome
- Report issues via GitHub Issues

---

## Contact

**Sigurður E. Vilhelmsson**
Project Lead and Translator

For questions about using these assets, please open a GitHub issue or contact the project lead.
