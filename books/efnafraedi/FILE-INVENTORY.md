# File Inventory - Efnafræði

> Last updated: 2026-01-12
> Purpose: Track which files have been uploaded vs what's needed

## Summary

| Category | Expected | Uploaded | Missing |
|----------|----------|----------|---------|
| Source .docx (ch 1-21) | 21 chapters | 21 | 0 |
| Source .txt (ch 1-21) | 21 chapters | 21 | 0 |
| Source images (ch 1-21) | 21 chapters | 21 | 0 |
| MT Output (ch 1-4) | 4 chapters | 4 | 0 |
| Faithful (ch 1) | 1 chapter | 0 | 1 |

## Chapter-by-Chapter Status

### Priority Chapters (Pilot: January 2026)

| Ch | Source .docx | Source .txt | Images | MT Output | Matecat | Pass 1 |
|----|:------------:|:-----------:|:------:|:---------:|:-------:|:------:|
| 1  | 12 files | 12 files | 36 | 12 files | done | done |
| 2  | 13 files | 13 files | 59 | 13 files | done | in progress |
| 3  | 10 files | 10 files | 57 | 10 files | done | pending |
| 4  | 11 files | 11 files | 45 | 11 files | done | not started |

**MT Output Totals:** 46 .docx files across 4 chapters

### Future Chapters (Partial)

| Ch | Source .docx | Source .txt | Images | MT Output | Notes |
|----|:------------:|:-----------:|:------:|:---------:|-------|
| 7  | 12 files | 12 files | 113 | - | Partial chapter, target Feb 2026 |
| 10 | 12 files | 12 files | 56 | - | Partial chapter, target Feb 2026 |

### Remaining Chapters (5-6, 8-9, 11-21)

| Ch | Source .docx | Source .txt | Images | MT Output | Notes |
|----|:------------:|:-----------:|:------:|:---------:|-------|
| 5  | 9 files | 9 files | 25 | - | Not started |
| 6  | 11 files | 11 files | 75 | - | Not started |
| 8  | 10 files | 10 files | 90 | - | Not started |
| 9  | 12 files | 12 files | 18 | - | Not started |
| 11 | 11 files | 11 files | 60 | - | Not started |
| 12 | 13 files | 13 files | 55 | - | Not started |
| 13 | 10 files | 10 files | 24 | - | Not started |
| 14 | 13 files | 13 files | 83 | - | Not started |
| 15 | 9 files | 9 files | 46 | - | Not started |
| 16 | 10 files | 10 files | 21 | - | Not started |
| 17 | 13 files | 13 files | 22 | - | Not started |
| 18 | 17 files | 17 files | 127 | - | Not started |
| 19 | 8 files | 8 files | 66 | - | Not started |
| 20 | 9 files | 9 files | 172 | - | Not started |
| 21 | 12 files | 12 files | 29 | - | Not started |

### Appendices

| Type | Files |
|------|-------|
| Images | 36 |

## Totals

| Category | Count |
|----------|-------|
| Source .docx | 237 files |
| Source .txt | 237 files |
| Source images | 1,315 files |
| MT Output | 46 files |

## Excluded Large Files (>100MB)

These files exceed GitHub's 100MB limit and are stored locally only:

| File | Size |
|------|------|
| `ch10/CNX_Chem_10_05_MolSolids.eps` | 127 MB |
| `ch10/CNX_Chem_10_02_Wicking.eps` | 104 MB |
| `ch12/CNX_Chem_12_07_HetCats.eps` | 101 MB |
| `ch18/CNX_Chem_18_03_CO2vsSiO2.eps` | >100 MB |
| `ch18/CNX_Chem_18_03_CO2vsSiO2_TEMPLATE.eps` | >100 MB |
| `ch21/CNX_Chem_21_04_ChnReact1.pdf` | >100 MB |

## Still Needed

### Faithful Translations (03-faithful-translation)

Chapter 1 Pass 1 review is complete but output not yet uploaded:

```
03-faithful-translation/docx/
└── ch01/    # MISSING - upload Pass 1 reviewed translation
```

## Change Log

| Date | Change |
|------|--------|
| 2026-01-12 | Editable images uploaded for all chapters (1,315 files, 6 excluded >100MB) |
| 2026-01-12 | MT output uploaded for ch01-04 (46 files), renamed folders to match convention |
| 2026-01-12 | Deleted duplicate `1-4-measurementsv2.docx` from ch01 |
| 2026-01-12 | All source files uploaded (237 .docx, 237 .txt across 21 chapters) |
| 2026-01-12 | Initial inventory created |

## Notes

- Source files uploaded via GitHub web interface
- MT translations uploaded for chapters 1-4
- Editable images (PDF/EPS) uploaded for all chapters
- 6 large files (>100MB) excluded from repo, stored locally only
- Appendices directories created for all pipeline stages
