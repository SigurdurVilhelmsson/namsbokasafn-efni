# File Inventory - Efnafræði

> Last updated: 2026-01-12
> Purpose: Track which files have been uploaded vs what's needed

## Summary

| Category | Expected | Uploaded | Missing |
|----------|----------|----------|---------|
| Source .docx (ch 1-21) | 21 chapters | 21 | 0 |
| Source .txt (ch 1-21) | 21 chapters | 21 | 0 |
| MT Output (ch 1-4) | 4 chapters | 0 | 4 |
| Faithful (ch 1) | 1 chapter | 0 | 1 |

## Chapter-by-Chapter Status

### Priority Chapters (Pilot: January 2026)

| Ch | Source .docx | Source .txt | MT Output | Matecat | Pass 1 |
|----|:------------:|:-----------:|:---------:|:-------:|:------:|
| 1  | 12 files | 12 files | MISSING | done | done |
| 2  | 13 files | 13 files | MISSING | done | in progress |
| 3  | 10 files | 10 files | MISSING | done | pending |
| 4  | 11 files | 11 files | MISSING | done | not started |

### Future Chapters (Partial)

| Ch | Source .docx | Source .txt | MT Output | Notes |
|----|:------------:|:-----------:|:---------:|-------|
| 7  | 12 files | 12 files | - | Partial chapter, target Feb 2026 |
| 10 | 12 files | 12 files | - | Partial chapter, target Feb 2026 |

### Remaining Chapters (5-6, 8-9, 11-21)

| Ch | Source .docx | Source .txt | MT Output | Notes |
|----|:------------:|:-----------:|:---------:|-------|
| 5  | 9 files | 9 files | - | Not started |
| 6  | 11 files | 11 files | - | Not started |
| 8  | 10 files | 10 files | - | Not started |
| 9  | 12 files | 12 files | - | Not started |
| 11 | 11 files | 11 files | - | Not started |
| 12 | 13 files | 13 files | - | Not started |
| 13 | 10 files | 10 files | - | Not started |
| 14 | 13 files | 13 files | - | Not started |
| 15 | 9 files | 9 files | - | Not started |
| 16 | 10 files | 10 files | - | Not started |
| 17 | 13 files | 13 files | - | Not started |
| 18 | 17 files | 17 files | - | Not started |
| 19 | 8 files | 8 files | - | Not started |
| 20 | 9 files | 9 files | - | Not started |
| 21 | 12 files | 12 files | - | Not started |

**Totals:** 237 .docx files, 237 .txt files

## Still Needed

### MT Output (02-mt-output)

Chapters 1-4 need MT output from malstadur.is:

```
02-mt-output/docx/
├── ch01/    # MISSING - upload malstadur.is output
├── ch02/    # MISSING - upload malstadur.is output
├── ch03/    # MISSING - upload malstadur.is output
└── ch04/    # MISSING - upload malstadur.is output
```

## Change Log

| Date | Change |
|------|--------|
| 2026-01-12 | Deleted duplicate `1-4-measurementsv2.docx` from ch01 (was duplicate of `1-4-measurements.docx`) |
| 2026-01-12 | All source files uploaded (237 .docx, 237 .txt across 21 chapters) |
| 2026-01-12 | Initial inventory created |

## Notes

- Source files uploaded via GitHub web interface
- MT translations for chapters 1-4 still pending upload
- Use `git status` to see uncommitted changes
