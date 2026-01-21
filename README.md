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

Þýðingarferlið felur í sér 5 skref:

```
1. CNXML → EN Markdown        → Umbreyta frumtexta
2. Vélþýðing                  → malstadur.is
3. Málfarsrýni                → Prófarkalesin þýðing (VISTUÐ)
4. Þýðingaminni               → Matecat Align → TMX (VISTAÐ)
5. Útgáfa                     → Birta á vef
```

Útgáfukerfið styður þrjár brautir: `mt-preview` (vélþýðing), `faithful` (ritstýrð), og `localized` (staðfærð).

Sjá nánar í [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md).

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
| [Verkflæði](docs/workflow/simplified-workflow.md) | 5-skrefa þýðingarferli |
| [Málfarsrýni](docs/editorial/pass1-linguistic.md) | Ritstjórn umferð 1 |
| [Staðfærsla](docs/editorial/pass2-localization.md) | Ritstjórn umferð 2 |
| [Hugtök](docs/editorial/terminology.md) | Hugtakastaðlar og orðasafn |
| [CLI tól](docs/technical/cli-reference.md) | Skipanalínutól |
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
| [Simplified Workflow](docs/workflow/simplified-workflow.md) | 5-step translation pipeline (current) |
| [Pass 1: Linguistic Review](docs/editorial/pass1-linguistic.md) | First editorial pass |
| [Pass 2: Localization](docs/editorial/pass2-localization.md) | Second editorial pass |
| [Terminology](docs/editorial/terminology.md) | Terminology standards and glossary |
| [CLI Reference](docs/technical/cli-reference.md) | Command-line tools |
| [Schemas](docs/technical/schemas.md) | JSON Schema field definitions |
| [Publication Format](docs/technical/publication-format.md) | 3-track publication structure |
| [Pipeline Server](server/README.md) | Web automation server |
| [Contributing](docs/contributing/getting-started.md) | How to participate |

## CLI Tools

| Tool | Description | Status |
|------|-------------|--------|
| `pipeline-runner` | Full CNXML → markdown pipeline | Active |
| `cnxml-to-md` | CNXML → Markdown with equations | Active |
| `prepare-for-align` | Prepare files for Matecat Align | Active |
| `add-frontmatter` | Add YAML frontmatter for publication | Active |
| `split-for-erlendur` | Split files at 18k chars for MT | Active |
| `apply-equations` | Restore LaTeX equations from JSON | Active |
| `clean-markdown` | Fix Pandoc artifacts | Active |
| `docx-to-md` | DOCX → Markdown conversion | Active |
| `fix-figure-captions` | Fix figure caption formatting | Active |
| `repair-directives` | Fix directive syntax | Active |
| `replace-math-images` | Replace equation images with LaTeX | Active |
| `export-parallel-corpus` | Export TM to parallel text | Active |
| `validate-chapter` | Validate chapter structure | Active |
| `process-chapter` | Full chapter processing pipeline | Active |
| `cnxml-math-extract` | Extract MathML from CNXML | Active |
| `strip-docx-to-txt` | Extract plain text from DOCX | Active |
| `cnxml-to-xliff` | CNXML → XLIFF (Matecat Align) | Deprecated |
| `create-bilingual-xliff` | Create bilingual XLIFF | Deprecated |
| `md-to-xliff` | Markdown → XLIFF | Deprecated |
| `xliff-to-md` | XLIFF → Markdown | Deprecated |
| `xliff-to-tmx` | XLIFF → TMX | Deprecated |

*21 tools total (16 active, 5 deprecated)*

See [docs/technical/cli-reference.md](docs/technical/cli-reference.md) for detailed usage.

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

## /analytics

| Method | Path |
|--------|------|
| GET | `/stats` |
| GET | `/recent` |
| POST | `/event` |
| GET | `/dashboard-data` |

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
| GET | `/:slug/download` |

## /decisions

| Method | Path |
|--------|------|
| GET | `/types` |
| GET | `/stats` |
| GET | `/recent` |
| GET | `/` |
| GET | `/:id` |
| POST | `/` |

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

## /feedback

| Method | Path |
|--------|------|
| GET | `/types` |
| POST | `/` |
| GET | `/` |
| GET | `/stats` |
| GET | `/open` |
| GET | `/:id` |
| POST | `/:id/status` |
| POST | `/:id/resolve` |
| POST | `/:id/priority` |
| POST | `/:id/assign` |
| POST | `/:id/respond` |

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

## /my-work

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/summary` |

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

## /publication

| Method | Path |
|--------|------|
| GET | `/:bookSlug/:chapterNum/status` |
| GET | `/:bookSlug/:chapterNum/readiness` |
| POST | `/:bookSlug/:chapterNum/mt-preview` |
| POST | `/:bookSlug/:chapterNum/faithful` |
| POST | `/:bookSlug/:chapterNum/localized` |
| GET | `/:bookSlug/overview` |

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
| GET | `/dashboard` |
| GET | `/activity/timeline` |
| GET | `/activity/types` |
| GET | `/:book` |
| GET | `/:book/summary` |
| GET | `/:book/:chapter` |
| GET | `/:book/scan` |
| POST | `/:book/sync` |
| POST | `/:book/:chapter/sync` |

## /suggestions

| Method | Path |
|--------|------|
| POST | `/scan/:sectionId` |
| POST | `/scan-book/:bookSlug` |
| GET | `/:sectionId` |
| GET | `/:sectionId/stats` |
| GET | `/patterns` |
| POST | `/:id/accept` |
| POST | `/:id/reject` |
| POST | `/:id/modify` |
| POST | `/:sectionId/bulk` |
| POST | `/:sectionId/sync-log` |

## /sync

| Method | Path |
|--------|------|
| GET | `/config` |
| POST | `/prepare` |
| POST | `/create-pr` |
| GET | `/status/:prNumber` |
| GET | `/prs` |

## /terminology

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/lookup` |
| GET | `/stats` |
| GET | `/review-queue` |
| GET | `/categories` |
| GET | `/:id` |
| POST | `/` |
| PUT | `/:id` |
| DELETE | `/:id` |
| POST | `/:id/approve` |
| POST | `/:id/dispute` |
| POST | `/:id/discuss` |
| POST | `/import/csv` |
| POST | `/import/excel` |
| POST | `/import/key-terms` |
| POST | `/import/existing-glossary` |

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
| GET | `/terminology` |
| GET | `/decisions` |
| GET | `/my-work` |
| GET | `/localization-review` |
| GET | `/feedback` |
| GET | `/admin/feedback` |
| GET | `/for-teachers` |

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
| POST | `/assignments` |
| GET | `/assignments` |
| GET | `/assignments/mine` |
| POST | `/assignments/:id/complete` |
| POST | `/assignments/:id/cancel` |


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
