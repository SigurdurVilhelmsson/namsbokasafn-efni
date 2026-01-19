# Námsbókasafn - Þýðingaverkefni

**Íslenskar þýðingar á opnum kennslubókum frá OpenStax**

## Um verkefnið

Námsbókasafn er verkefni sem miðar að því að gera hágæða námsbækur á íslensku aðgengilegar öllum. Við þýðum opnar kennslubækur frá [OpenStax](https://openstax.org/) og aðlögum þær að íslenskum aðstæðum.

Afurðir verkefnisins eru þrenns konar:
1. **Nákvæmar þýðingar** - prófarkalesnar þýðingar sem endurspegla frumtextann nákvæmlega
2. **Þýðingaminni** - prófarkalesið EN↔IS parað textasafn
3. **Staðfærð útgáfa** - aðlöguð að íslenskum aðstæðum með SI einingum, íslenskum dæmum og viðbótum eftir þörfum

## Bækur

| Bók | Frumrit | Staða | Útgáfa |
|-----|---------|-------|--------|
| **Efnafræði** | [Chemistry 2e](https://openstax.org/details/books/chemistry-2e) | Í vinnslu | [efnafraedi.app](https://efnafraedi.app) |
| **Líffræði** | [Biology 2e](https://openstax.org/details/books/biology-2e) | Væntanlegt | - |

## Verkflæði

Þýðingarferlið felur í sér 8 skref með tveimur umferðum yfirlestrar:

```
1. Undirbúningur frumtexta    → Sækja .docx frá OpenStax
2. Vélþýðing                  → Þýða á malstadur.is
3. Þýðingaminni               → Pörun EN/IS texta í Matecat
4. TM-studd þýðing            → Þýða paraðan texta
5. Ritstjórn 1 - Málfarsrýni  → Prófarkalesin þýðing (VISTUÐ)
6. Uppfæra þýðingaminni       → Prófarkalesið TM (VISTAÐ)
7. Ritstjórn 2 - Staðfærsla   → SI einingar, íslensk dæmi
8. Útgáfa                     → Umbreyta í .md og birta
```

Sjá nánar í [docs/workflow.md](docs/workflow.md).

## Uppbygging geymslu

```
books/
└── efnafraedi/
    ├── 01-source/           # Frumtexti frá OpenStax
    ├── 02-mt-output/        # Vélþýðing (til viðmiðunar)
    ├── 03-faithful/         # Nákvæm þýðing eftir 1. yfirlestur
    ├── 04-localized/        # Staðfærð útgáfa eftir 2. yfirlestur
    ├── 05-publication/      # Útgefin .md skjöl
    ├── tm/                  # Þýðingaminni (.tmx)
    └── glossary/            # Hugtakasafn
```

## Vefviðmót

Verkflæðið er hægt að keyra í gegnum vefþjón með leiðsögn:

```bash
cd server
npm install
npm start
```

Opnaðu http://localhost:3000/workflow

| Slóð | Lýsing |
|------|--------|
| `/workflow` | Leiðsögn í gegnum verkflæði |
| `/issues` | Atriðastjórnun |
| `/images` | Myndaþýðingaeftirlit |
| `/status` | Stöðuyfirlit |

Sjá [server/README.md](server/README.md) fyrir nánari upplýsingar.

## Skjölun

| Skjal | Lýsing |
|-------|--------|
| [Verkflæði](docs/workflow.md) | 8-skrefa þýðingarferli |
| [Ritstjórnarleiðbeiningar](docs/editorial-guide.md) | Leiðbeiningar fyrir ritstjóra |
| [Hugtök](docs/terminology.md) | Hugtakastaðlar og orðasafn |
| [Skipanir](docs/cli-quick-reference.md) | Flýtileiðbeiningar fyrir skipanir |
| [Skriftur](docs/scripts-guide.md) | Leiðbeiningar fyrir sjálfvirkni |
| [Vefþjónn](server/README.md) | Sjálfvirknivefþjónn |

## Að taka þátt

Verkefnið þarf ritstjóra til að yfirfara þýðingar. Sjá [docs/contributing.md](docs/contributing.md) fyrir leiðbeiningar.

## Höfundaréttur

### Þýðingar
Allar þýðingar eru gefnar út undir [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) leyfi.

### Frumefni
Byggt á opnum kennslubókum frá [OpenStax](https://openstax.org/), Rice University.

**Efnafræði:** Paul Flowers, Klaus Theopold, Richard Langley, William R. Robinson - *Chemistry 2e*, OpenStax, 2019

---

# English Section

## What This Repository Contains

This repository contains the translation workflow and content for Icelandic translations of OpenStax textbooks. The project uses a **two-pass editorial process** to produce genuinely valuable assets:

### Assets Produced

1. **Faithful Translation** (`03-faithful/`)
   - Human-verified Icelandic translation faithful to the source
   - Not machine translation output - contains human corrections
   - Available in .docx and .md formats

2. **Human-Verified Translation Memory** (`tm/`)
   - Segment-aligned EN↔IS parallel text
   - TMX format plus parallel .txt exports
   - Valuable for training MT systems and Icelandic LLMs

3. **Localized Version** (`04-localized/`, `05-publication/`)
   - Adapted for Icelandic secondary school students
   - SI units, Icelandic context and examples
   - Extended exercises where beneficial

4. **Terminology Glossary** (`glossary/`)
   - Standardized Icelandic chemistry/biology terminology
   - CSV format for easy integration

### The Two-Pass Editorial Process

**Pass 1: Linguistic Review**
- Editor reviews for language quality and terminology
- Focus on natural, accurate Icelandic
- NO localization changes
- Output: Faithful translation (preserved)

**Pass 2: Localization**
- Convert units (imperial → SI)
- Add Icelandic context and examples
- Extended exercises where beneficial
- All changes documented in localization logs
- Output: Localized version for students

### Using the Translation Memory

The human-verified TM can be used for:
- Training machine translation systems for Icelandic
- Fine-tuning Icelandic language models
- Other translation projects
- Linguistic research

All assets are released under **CC BY 4.0** license.

## Pipeline Server

The translation workflow can be run through a web-based guided interface:

```bash
cd server
npm install
npm start
```

Access at http://localhost:3000/workflow

| URL | Description |
|-----|-------------|
| `/workflow` | Step-by-step workflow wizard |
| `/issues` | Issue review dashboard |
| `/images` | Image translation tracker |
| `/status` | Pipeline status overview |

Features:
- GitHub OAuth authentication with role-based access
- Automatic issue classification and routing
- Image translation tracking with OneDrive linking
- PR-based content sync to repository

See [server/README.md](server/README.md) for full documentation.

## Documentation

| Document | Description |
|----------|-------------|
| [Workflow](docs/workflow.md) | 8-step translation pipeline |
| [Editorial Guide](docs/editorial-guide.md) | Instructions for editors |
| [Terminology](docs/terminology.md) | Terminology standards and glossary |
| [CLI Quick Reference](docs/cli-quick-reference.md) | Command cheat sheet |
| [Scripts Guide](docs/scripts-guide.md) | Automation script usage |
| [Schema Reference](docs/schema-reference.md) | JSON Schema field definitions |
| [Pipeline Server](server/README.md) | Web automation server |
| [Contributing](docs/contributing.md) | How to participate |

## CLI Tools

<!-- tools-start -->
# CLI Tools

*Auto-generated from tools/ directory*

| Tool | Description |
|------|-------------|
| `add-frontmatter` | ============================================================ |
| `apply-equations` | Support both { equations: {...} } and direct { EQ:1: ..., EQ |
| `clean-markdown` | ============================================================ |
| `cnxml-math-extract` | ============================================================ |
| `cnxml-to-md` | raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/ |
| `cnxml-to-xliff` | raw.githubusercontent.com/openstax/osbooks-chemistry-bundle/ |
| `create-bilingual-xliff` | Try YAML frontmatter first |
| `docx-to-md` | ============================================================ |
| `export-parallel-corpus` | No description |
| `fix-figure-captions` | ============================================================ |
| `md-to-xliff` | Extract YAML frontmatter if present |
| `pipeline-runner` | Markdown for Erlendur MT |
| `prepare-for-align` | Single EN file |
| `process-chapter` | ============================================================ |
| `repair-directives` | Directives that can contain nested directives |
| `replace-math-images` | ============================================================ |
| `split-for-erlendur` | Erlendur MT character limits |
| `strip-docx-to-txt` | Parse command line arguments |
| `validate-chapter` | No description |
| `xliff-to-md` | No description |
| `xliff-to-tmx` | Extract file attributes |

*21 tools total*

<!-- tools-end -->

## API Routes

<!-- routes-start -->
# API Routes

*Auto-generated from server/routes/*

## /activity

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/recent` |
| GET | `/user/:userId` |
| GET | `/book/:book` |
| GET | `/section/:book/:chapter/:section` |
| GET | `/my` |
| GET | `/types` |

## /admin

| Method | Path |
|--------|------|
| GET | `/catalogue` |
| GET | `/catalogue/predefined` |
| POST | `/catalogue/sync` |
| POST | `/catalogue/add` |
| POST | `/books/register` |
| GET | `/books` |
| GET | `/books/:slug` |
| GET | `/books/:slug/chapters/:chapter` |
| POST | `/migrate` |

## /auth

| Method | Path |
|--------|------|
| GET | `/status` |
| GET | `/login` |
| GET | `/callback` |
| GET | `/me` |
| POST | `/logout` |
| GET | `/roles` |

## /books

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/:bookId` |
| GET | `/:bookId/chapters/:chapter` |

## /editor

| Method | Path |
|--------|------|
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/:section` |
| POST | `/:book/:chapter/:section/save` |
| POST | `/:book/:chapter/:section/submit` |
| GET | `/:book/:chapter/:section/history` |
| GET | `/history/:historyId` |
| POST | `/:book/:chapter/:section/restore/:historyId` |
| GET | `/section/:sectionId` |
| POST | `/section/:sectionId/save` |
| POST | `/section/:sectionId/submit-review` |
| POST | `/section/:sectionId/submit-localization` |

## /images

| Method | Path |
|--------|------|
| GET | `/:book` |
| GET | `/:book/:chapter` |
| GET | `/:book/:chapter/:id` |
| POST | `/:book/:chapter/:id/status` |
| POST | `/:book/:chapter/:id/upload` |
| GET | `/:book/:chapter/:id/download` |
| POST | `/:book/:chapter/init` |
| POST | `/:book/:chapter/:id/approve` |

## /issues

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/stats` |
| GET | `/session/:sessionId` |
| POST | `/session/:sessionId/:issueId/resolve` |
| GET | `/:id` |
| POST | `/:id/resolve` |
| POST | `/batch-resolve` |
| POST | `/auto-fix` |
| POST | `/report` |

## /localization

| Method | Path |
|--------|------|
| GET | `/:sectionId` |
| POST | `/:sectionId/log/add` |
| PUT | `/:sectionId/log/:entryId` |
| DELETE | `/:sectionId/log/:entryId` |
| POST | `/:sectionId/log/save` |
| POST | `/:sectionId/submit` |
| POST | `/:sectionId/approve` |
| POST | `/:sectionId/request-changes` |
| GET | `/stats` |

## /matecat

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/config` |
| POST | `/projects` |
| GET | `/projects/:id/status` |
| GET | `/jobs/:id/stats` |
| GET | `/jobs/:id/urls` |
| GET | `/jobs/:id/download` |
| GET | `/projects` |
| POST | `/projects/:id/poll` |

## /modules

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/books` |
| GET | `/book/:bookId` |
| GET | `/chapter/:chapter` |
| GET | `/:moduleId` |

## /notifications

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| POST | `/:id/read` |
| POST | `/read-all` |

## /process

| Method | Path |
|--------|------|
| POST | `/cnxml` |
| POST | `/module/:moduleId` |
| GET | `/jobs/:jobId` |
| GET | `/jobs` |

## /reviews

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/count` |
| GET | `/:id` |
| POST | `/:id/approve` |
| POST | `/:id/changes` |

## /sections

| Method | Path |
|--------|------|
| GET | `/:sectionId` |
| POST | `/:sectionId/upload/:uploadType` |
| POST | `/:sectionId/assign-reviewer` |
| POST | `/:sectionId/assign-localizer` |
| POST | `/:sectionId/status` |
| POST | `/:sectionId/submit-review` |
| POST | `/:sectionId/approve-review` |
| POST | `/:sectionId/request-changes` |

## /status

| Method | Path |
|--------|------|
| GET | `/:book` |
| GET | `/:book/summary` |
| GET | `/:book/:chapter` |

## /sync

| Method | Path |
|--------|------|
| GET | `/config` |
| POST | `/prepare` |
| POST | `/create-pr` |
| GET | `/status/:prNumber` |
| GET | `/prs` |

## /views

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/login` |
| GET | `/workflow` |
| GET | `/issues` |
| GET | `/images` |
| GET | `/editor` |
| GET | `/reviews` |
| GET | `/status` |
| GET | `/books` |

## /workflow

| Method | Path |
|--------|------|
| POST | `/start` |
| GET | `/sessions` |
| GET | `/sessions/all` |
| GET | `/:sessionId` |
| POST | `/:sessionId/upload/:step` |
| GET | `/:sessionId/download/:artifact` |
| GET | `/:sessionId/download-all` |
| POST | `/:sessionId/advance` |
| POST | `/:sessionId/cancel` |
| GET | `/:sessionId/errors` |
| POST | `/:sessionId/retry` |
| POST | `/:sessionId/rollback` |
| POST | `/:sessionId/reset` |
| GET | `/:sessionId/recovery` |


<!-- routes-end -->

### Attribution Requirements

When using these assets, please attribute:
```
Icelandic translation managed by Sigurður E. Vilhelmsson
Original: [Book Title], OpenStax, Rice University
License: CC BY 4.0
```

## Contact

**Sigurður E. Vilhelmsson**
Translator and Project Lead

**Related Repositories:**
- [namsbokasafn-vefur](https://github.com/SigurdurVilhelmsson/namsbokasafn-vefur) - Publication website

---

*This project is not affiliated with OpenStax or Rice University. OpenStax is not responsible for the content of these translations.*
