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

Þýðingarferlið notar Extract-Inject-Render röð:

```
1a. CNXML → EN bútar + bygging    → cnxml-extract
1b. Verndun og skipting fyrir VÞ  → protect-segments-for-mt
2.  Vélþýðing                     → malstadur.is
3.  Málfarsrýni                   → Prófarkalesin þýðing (VISTUÐ)
4.  Þýðingaminni                  → Matecat Align → TMX (VISTAÐ)
5a. Innsetning í CNXML-byggningu  → cnxml-inject
5b. Útgáfa í HTML                 → cnxml-render
```

Útgáfukerfið styður þrjár brautir: `mt-preview` (vélþýðing), `faithful` (ritstýrð), og `localized` (staðfærð).

Sjá nánar í [docs/workflow/simplified-workflow.md](docs/workflow/simplified-workflow.md).

## Uppbygging geymslu

```
books/
└── efnafraedi/
    ├── 01-source/           # Frumtexti frá OpenStax (CNXML)
    ├── 02-for-mt/           # EN Markdown-bútar fyrir vélþýðingu
    ├── 02-structure/        # Skjalabygging (JSON)
    ├── 02-mt-output/        # Vélþýðing (IS bútar)
    ├── 03-faithful/         # Nákvæm þýðing eftir 1. yfirlestur
    ├── 03-translated/       # Þýdd CNXML skjöl (frá inject)
    ├── 04-localized/        # Staðfærð útgáfa eftir 2. yfirlestur
    ├── 05-publication/      # Útgefin HTML skjöl (frá render)
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
| [Ritillsáætlun](docs/workflow/editor-improvements-jan2026.md) | Endurbygging ritils fyrir CNXML→HTML |
| [Aðalverkferli](docs/workflow/master-pipeline.md) | Nákvæmt verkferli frá CNXML til útgáfu |

## Að taka þátt

Verkefnið þarf ritstjóra til að yfirfara þýðingar. Sjá [docs/contributing/getting-started.md](docs/contributing/getting-started.md) fyrir leiðbeiningar.

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
   - Available as markdown segments and rendered HTML

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
| [Master Pipeline](docs/workflow/master-pipeline.md) | Complete CNXML→HTML pipeline reference |
| [Simplified Workflow](docs/workflow/simplified-workflow.md) | 5-step translation pipeline overview |
| [Pass 1: Linguistic Review](docs/editorial/pass1-linguistic.md) | First editorial pass |
| [Pass 2: Localization](docs/editorial/pass2-localization.md) | Second editorial pass |
| [Terminology](docs/editorial/terminology.md) | Terminology standards and glossary |
| [CLI Reference](docs/technical/cli-reference.md) | Command-line tools |
| [Schemas](docs/technical/schemas.md) | JSON Schema field definitions |
| [Publication Format](docs/technical/publication-format.md) | 3-track publication structure |
| [Pipeline Server](server/README.md) | Web automation server |
| [Contributing](docs/contributing/getting-started.md) | How to participate |
| [Editor Rebuild Plan](docs/workflow/editor-improvements-jan2026.md) | CNXML→HTML pipeline integration |

## CLI Tools (Extract-Inject-Render Pipeline)

| Tool | Purpose | Pipeline Step |
|------|---------|---------------|
| `cnxml-extract` | Extract translatable segments from CNXML | Step 1a |
| `protect-segments-for-mt` | Protect markers and split for MT | Step 1b |
| `restore-segments-from-mt` | Restore markers in MT output | Step 2 (post-MT) |
| `cnxml-inject` | Inject translations into CNXML structure | Step 5a |
| `cnxml-render` | Render translated CNXML to semantic HTML | Step 5b |
| `prepare-for-align` | Clean files for Matecat Align TM creation | Step 4 |
| `validate-chapter` | Validate chapter content and structure | Validation |

*7 active tools. 42 deprecated tools archived in `tools/_archived/`.*

See [docs/technical/cli-reference.md](docs/technical/cli-reference.md) for detailed usage.

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
