# Efnafræði - Translation Status

> Last updated: 2026-02-09

## Overview

| Metric | Count |
|--------|-------|
| Total chapters | 21 |
| Extraction complete | 13 (ch 1-5, 7, 9-13, appendices) |
| MT output received | 13 |
| Pass 1 complete | 1 (ch 1) |
| Pass 1 in progress | 0 |
| TM created | 4 (ch 1-4) |
| Published (MT preview) | 3 (ch 1-3) |
| Published (faithful) | 0 |

## Current Phase: Phase 9

**Phase 9: Close the Write Gap** — Applying approved segment edits from database to `03-faithful/` files to unblock the inject→render pipeline for faithful publications.

See [ROADMAP.md](../../ROADMAP.md) and [docs/workflow/development-plan-phases-9-13.md](../../docs/workflow/development-plan-phases-9-13.md) for details.

## Pipeline Status by Chapter

Current pipeline: Extract → MT → Review → Inject → Render

| Ch | Title | Extract | MT | Review | Inject | Render | Notes |
|----|-------|---------|----|----|--------|--------|-------|
| 1 | Grunnhugmyndir | ✅ | ✅ | ✅ | ⏳ | ⏳ | Pass 1 complete, awaiting segment sync |
| 2 | Atóm, sameindir og jónir | ✅ | ✅ | 🔄 | ⏳ | ⏳ | In segment editor |
| 3 | Samsetning efna | ✅ | ✅ | ⏳ | ⏳ | ⏳ | MT preview published |
| 4 | Magn- og efnareikningar | ✅ | ✅ | ⏳ | ⏳ | ⏳ | TM created |
| 5 | Thermochemistry | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Source ready |
| 6 | Electronic Structure | - | - | - | - | - | Not started |
| 7 | Periodic Properties | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Partial extraction |
| 8 | Chemical Bonding | - | - | - | - | - | Not started |
| 9 | Molecular Geometry | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Extracted 2026-02-08 |
| 10 | Liquids and Solids | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Partial extraction |
| 11 | Solutions | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Extracted 2026-02-08 |
| 12 | Kinetics | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Extracted 2026-02-08 |
| 13 | Equilibria | ✅ | ✅ | ⏳ | ⏳ | ⏳ | Extracted 2026-02-08 |
| 14-21 | (remaining) | - | - | - | - | - | Not started |
| App | Appendices A-M | ✅ | ✅ | ⏳ | ⏳ | ⏳ | 13 appendices extracted |

## Publication Status

### MT Preview (AI-Assisted)
Published at [namsbokasafn.is](https://namsbokasafn.is):
- ✅ Chapter 1: Essential Ideas / Grunnhugmyndir
- ✅ Chapter 2: Atoms, Molecules, and Ions
- ✅ Chapter 3: Composition of Substances

### Faithful Translation (Human-Verified)
- ⏳ Chapter 1: Segment edits approved, awaiting file sync (Phase 9)
- Future chapters will follow after Phase 9 tooling is complete

## Recent Milestones

- **2026-02-08**: Chapters 9, 11, 12, 13 extracted and processed through MT
- **2026-02-08**: All appendices (A-M) extracted
- **2026-02-05**: Phase 8 complete (segment editor rebuild)
- **2026-01-13**: First 3 chapters published as MT preview
- **2024-12-10**: Chapter 1 Pass 1 review complete

## Next Steps

1. **Immediate**: Complete Phase 9 segment sync tooling
2. **Short-term**: Apply approved edits to ch 1, inject & render faithful version
3. **Medium-term**: Review chapters 2-4 in segment editor
4. **Long-term**: Extract and process remaining chapters (14-21)

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
