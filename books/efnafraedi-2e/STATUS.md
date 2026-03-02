# Efnafræði - Translation Status

> Last updated: 2026-02-15

## Overview

| Metric | Count |
|--------|-------|
| Total chapters | 21 + 13 appendices |
| Extraction complete | 8 chapters (01-05, 09, 12, 13) + 13 appendices |
| MT output received | 8 chapters + 13 appendices |
| MT preview rendered | 8 chapters + 13 appendices |
| Pass 1 complete | 1 (ch 1) |
| Pass 1 in progress | 0 |
| Published (MT preview) | 8 chapters + appendices (all rendered content) |
| Published (faithful) | 0 (blocked on Phase 9) |

## Current Phase: Phase 9 — Close the Write Gap

**Problem:** Approved segment edits in the database are not yet written to `03-faithful-translation/` files. Without those files, `cnxml-inject` has no input for the faithful publication track.

**Status:** NOT STARTED

See [ROADMAP.md](../../ROADMAP.md) and [docs/workflow/development-plan-phases-9-13.md](../../docs/workflow/development-plan-phases-9-13.md) for details.

## Pipeline Status by Chapter

Pipeline: Extract → MT → Review → Inject → Render → Publish

| Ch | Title | Extract | MT | Review | MT Preview | Faithful | Notes |
|----|-------|---------|----|----|------------|----------|-------|
| 1 | Grunnhugmyndir | ✅ | ✅ | ✅ | ✅ | ⏳ | Pass 1 complete, awaiting Phase 9 |
| 2 | Atóm, sameindir og jónir | ✅ | ✅ | 🔄 | ✅ | ⏳ | In segment editor |
| 3 | Samsetning efna | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 4 | Magn- og efnareikningar | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 5 | Thermochemistry | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 6 | Electronic Structure | - | - | - | - | - | Source available, not extracted |
| 7 | Periodic Properties | - | - | - | - | - | Source available, not extracted |
| 8 | Chemical Bonding | - | - | - | - | - | Source available, not extracted |
| 9 | Molecular Geometry | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 10 | Liquids and Solids | - | - | - | - | - | Source available, not extracted |
| 11 | Solutions | - | - | - | - | - | Source available, not extracted |
| 12 | Kinetics | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 13 | Equilibria | ✅ | ✅ | ⏳ | ✅ | ⏳ | |
| 14-21 | (remaining) | - | - | - | - | - | Source available, not extracted |
| App | Appendices A-M | ✅ | ✅ | ⏳ | ✅ | ⏳ | 13 appendices |

## Publication Status

### MT Preview (Machine-Translated)
Published at [namsbokasafn.is](https://namsbokasafn.is):
- ✅ Chapter 1: Grunnhugmyndir (Essential Ideas)
- ✅ Chapter 2: Atóm, sameindir og jónir (Atoms, Molecules, and Ions)
- ✅ Chapter 3: Samsetning efna (Composition of Substances)
- ✅ Chapter 4: Magn- og efnareikningar (Stoichiometry)
- ✅ Chapter 5: Thermochemistry
- ✅ Chapter 9: Molecular Geometry
- ✅ Chapter 12: Kinetics
- ✅ Chapter 13: Equilibria
- ✅ Appendices A-M

### Faithful Translation (Human-Verified)
- ⏳ Chapter 1: Segment edits approved, awaiting file sync (Phase 9)
- Future chapters follow after Phase 9 tooling is complete

## Directory State

| Directory | Contents |
|-----------|----------|
| `02-for-mt/` | 8 chapters + appendices (EN segments) |
| `02-mt-output/` | 8 chapters + appendices (IS segments from MT) |
| `02-machine-translated/` | 8 chapters + appendices (merged MT output) |
| `03-editing/` | Empty (no active Pass 1 editing sessions) |
| `03-faithful-translation/` | Empty (blocked on Phase 9) |
| `04-localization/` | Empty (Pass 2 not started) |
| `04-localized-content/` | Empty (Pass 2 not started) |
| `05-publication/mt-preview/` | 8 chapters + appendices (HTML rendered) |
| `05-publication/faithful/` | Empty (blocked on Phase 9) |
| `tm/` | Empty (TM creation blocked on faithful translations) |

## Recent Milestones

- **2026-02-10**: Directory structure overhaul completed
- **2026-02-10**: All 13 appendices extracted, processed, and rendered
- **2026-02-08**: Chapters 9, 12, 13 extracted and processed through MT
- **2026-02-05**: Phase 8 complete (segment editor rebuild)
- **2026-01-13**: First 3 chapters published as MT preview
- **2024-12-10**: Chapter 1 Pass 1 review complete

## Next Steps

1. **Immediate**: Complete Phase 9 — write approved edits to `03-faithful-translation/` files
2. **Short-term**: Inject & render faithful version of Chapter 1
3. **Medium-term**: Continue Pass 1 reviews for chapters 2-5 in segment editor
4. **Long-term**: Extract and process remaining chapters (6-8, 10-11, 14-21)

## Image Translation

Image translation is tracked separately. Most chapters have diagrams and figures that need Icelandic labels.

| Status | Chapters |
|--------|----------|
| Completed | 0 |
| In progress | 0 |
| Not started | All |

Estimated effort: 2-3 hours per chapter for figures requiring translation.

---

**Legend:**
- ✅ Complete
- 🔄 In progress
- ⏳ Pending
- - Not started
