# File Inventory - Efnafræði

> Generated: 2026-01-12
> Purpose: Track which files have been uploaded vs what's needed

## Summary

| Category | Expected | Uploaded | Missing |
|----------|----------|----------|---------|
| Source .docx (ch 1-21) | 21 chapters | 0 | 21 |
| Source .txt (ch 1-21) | 21 chapters | 0 | 21 |
| MT Output (ch 1-4) | 4 chapters | 0 | 4 |
| Faithful (ch 1) | 1 chapter | 0 | 1 |

## Folder Structure (Ready for Upload)

```
01-source/
├── docx/
│   ├── ch01/    # Upload: OpenStax .docx files for chapter 1
│   ├── ch02/    # Upload: OpenStax .docx files for chapter 2
│   ├── ...
│   └── ch21/    # Upload: OpenStax .docx files for chapter 21
└── txt/
    ├── ch01/    # Upload: Stripped plain text (for MT)
    ├── ch02/
    ├── ...
    └── ch21/

02-mt-output/
└── docx/
    ├── ch01/    # Upload: malstadur.is output
    ├── ch02/    # Upload: malstadur.is output
    ├── ch03/    # Upload: malstadur.is output
    └── ch04/    # Upload: malstadur.is output

03-faithful/
└── docx/
    ├── ch01/    # Upload: Pass 1 reviewed translation
    ├── ch02/    # (when Pass 1 complete)
    ├── ch03/    # (when Pass 1 complete)
    └── ch04/    # (when Pass 1 complete)
```

## Chapter-by-Chapter Status

### Priority Chapters (Pilot: January 2026)

| Ch | Source .docx | Source .txt | MT Output | Matecat | Pass 1 |
|----|:------------:|:-----------:|:---------:|:-------:|:------:|
| 1  | MISSING | MISSING | MISSING | done | done |
| 2  | MISSING | MISSING | MISSING | done | in progress |
| 3  | MISSING | MISSING | MISSING | done | pending |
| 4  | MISSING | MISSING | MISSING | done | not started |

### Future Chapters (Partial)

| Ch | Source .docx | Source .txt | MT Output | Notes |
|----|:------------:|:-----------:|:---------:|-------|
| 7  | MISSING | MISSING | - | Partial chapter, target Feb 2026 |
| 10 | MISSING | MISSING | - | Partial chapter, target Feb 2026 |

### Remaining Chapters (5-6, 8-9, 11-21)

| Ch | Source .docx | Source .txt | MT Output | Notes |
|----|:------------:|:-----------:|:---------:|-------|
| 5  | MISSING | MISSING | - | Not started |
| 6  | MISSING | MISSING | - | Not started |
| 8  | MISSING | MISSING | - | Not started |
| 9  | MISSING | MISSING | - | Not started |
| 11 | MISSING | MISSING | - | Not started |
| 12 | MISSING | MISSING | - | Not started |
| 13 | MISSING | MISSING | - | Not started |
| 14 | MISSING | MISSING | - | Not started |
| 15 | MISSING | MISSING | - | Not started |
| 16 | MISSING | MISSING | - | Not started |
| 17 | MISSING | MISSING | - | Not started |
| 18 | MISSING | MISSING | - | Not started |
| 19 | MISSING | MISSING | - | Not started |
| 20 | MISSING | MISSING | - | Not started |
| 21 | MISSING | MISSING | - | Not started |

## Expected File Names

Based on OpenStax Chemistry 2e structure:

### Source Files (per chapter)

```
01-source/docx/ch{NN}/
├── {N}.0-introduction.docx    # Chapter intro
├── {N}.1-{section-name}.docx  # Section files
├── {N}.2-{section-name}.docx
├── ...
├── {N}.{X}-key-terms.docx     # End matter
├── {N}.{X}-key-equations.docx
├── {N}.{X}-summary.docx
└── {N}.{X}-exercises.docx
```

### MT Output Files

```
02-mt-output/docx/ch{NN}/
├── {N}.0-introduction-mt.docx
├── {N}.1-{section-name}-mt.docx
├── ...
```

## Upload Instructions

### For Source Files (01-source)

1. Download from OpenStax (requires educator account for .docx)
2. Place in `01-source/docx/ch{NN}/`
3. Run text extraction: `node tools/strip-docx-to-txt.js ch{NN}`
4. Plain text saved to `01-source/txt/ch{NN}/`

### For MT Output (02-mt-output)

1. Upload source .txt to malstadur.is
2. Download translated .docx
3. Place in `02-mt-output/docx/ch{NN}/`

### After Upload

Run to update status:
```bash
npm run update-status efnafraedi {chapter} source complete
npm run update-status efnafraedi {chapter} mtOutput complete
```

## Notes

- You mentioned having source files for all 21 chapters locally
- You mentioned having MT translations for chapters 1-4 locally
- This inventory will be updated as files are uploaded
- Use `git status` to see uncommitted uploads
