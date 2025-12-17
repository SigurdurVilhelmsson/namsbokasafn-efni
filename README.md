# Námsbókasafn - Þýðingaverkefni

**Íslenskar þýðingar á opnum kennslubókum frá OpenStax**

## Um verkefnið

Námsbókasafn er verkefni sem miðar að því að gera hágæða háskólakennslubækur aðgengilegar íslenskum nemendum. Við þýðum opnar kennslubækur frá [OpenStax](https://openstax.org/) og aðlögum þær að íslenskum aðstæðum.

Verkefnið framleiðir þrenns konar verðmæt efni:
1. **Trúa þýðingu** - mannyfirfarin þýðing sem endurspeglar frumtextann nákvæmlega
2. **Þýðingaminni** - mannyfirfarið EN↔IS samhliða textasafn
3. **Staðfærða útgáfu** - aðlöguð að íslenskum aðstæðum með SI einingum og íslenskum dæmum

## Bækur

| Bók | Frumrit | Staða | Útgáfa |
|-----|---------|-------|--------|
| **Efnafræði** | [Chemistry 2e](https://openstax.org/details/books/chemistry-2e) | Í vinnslu | [efnafraedi.app](https://efnafraedi.app) |
| **Líffræði** | [Biology 2e](https://openstax.org/details/books/biology-2e) | Væntanlegt | - |

## Verkflæði

Þýðingarferlið felur í sér 8 skref með tveimur ritstjórnarumferðum:

```
1. Undirbúningur frumtexta    → Sækja .docx frá OpenStax
2. Vélþýðing                  → Þýða á malstadur.is
3. Þýðingaminni               → Samhliðasetja í Matecat
4. TM-studd þýðing            → Þýða sniðinn texta
5. Ritstjórn 1 - Málfarsrýni  → Trú þýðing (VISTUÐ)
6. Uppfæra þýðingaminni       → Mannyfirfarið TM (VISTUÐ)
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
    ├── 03-faithful/         # Trú þýðing eftir ritstjórn 1
    ├── 04-localized/        # Staðfærð útgáfa eftir ritstjórn 2
    ├── 05-publication/      # Útgefin .md skjöl
    ├── tm/                  # Þýðingaminni (.tmx)
    └── glossary/            # Hugtakasafn
```

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

### Attribution Requirements

When using these assets, please attribute:
```
Icelandic translation by Sigurður E. Vilhelmsson
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
