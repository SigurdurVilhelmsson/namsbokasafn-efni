---
name: repo-structure
description: Ensure correct file naming and locations. Always active when creating, moving, or saving files. Prevents files from being saved in wrong locations.
---

# Repository Structure and File Naming

## Critical Rules

### File Preservation
**Source files are sacred. NEVER modify files in 01-source/ or 02-mt-output/.**

| Folder | Permission | Notes |
|--------|------------|-------|
| 01-source/ | READ ONLY | Original OpenStax files |
| 02-mt-output/ | READ ONLY | MT reference only |
| 03-faithful/ | READ + WRITE | Create backup before editing |
| 04-localized/ | READ + WRITE | Create backup before editing |
| 05-publication/ | READ + WRITE | Create backup before editing |
| tm/ | READ ONLY | Managed by Matecat |
| glossary/ | READ + WRITE | Create backup before editing |

### Before Modifying Any File

1. Verify folder permissions (see above)
2. Create backup: `{filename}.{YYYY-MM-DD-HHMM}.bak`
3. Or commit current state to git
4. Log the action in `logs/activity-log.md`

## Naming Conventions

### Chapter Folders
- Format: `ch{NN}` with zero-padded two digits
- Correct: `ch01`, `ch02`, `ch03`, ... `ch21`
- Wrong: `ch1`, `chapter-01`, `chapter1`

### Pass 1 Output
- Format: `{section-id}-pass1-{initials}.docx`
- Example: `1.2-pass1-SEV.docx`
- Location: `books/{book}/03-faithful/docx/ch{NN}/`

### Pass 2 Output
- Format: `{section-id}-localized.docx`
- Example: `1.2-localized.docx`
- Location: `books/{book}/04-localized/docx/ch{NN}/`

### Localization Logs
- Format: `ch{NN}-log.md`
- Example: `ch03-log.md`
- Location: `books/{book}/04-localized/localization-logs/`

### Publication Markdown
- Format: `{section-id}.md`
- Example: `3.1.md` or `section-3-1.md`
- Location: `books/{book}/05-publication/chapters/`

### Status Files
- Always: `status.json` (lowercase)
- Location: `books/{book}/chapters/ch{NN}/status.json`

## Folder Structure Reference

```
books/{book}/
├── 01-source/
│   ├── docx/ch{NN}/      # Original .docx files
│   ├── txt/               # Stripped plain text
│   └── images-editable/   # High-res figure PDFs
├── 02-mt-output/
│   └── docx/              # MT output (reference)
├── 03-faithful/
│   ├── docx/ch{NN}/      # Pass 1 output
│   └── markdown/          # Converted .md
├── 04-localized/
│   ├── docx/ch{NN}/      # Pass 2 output
│   └── localization-logs/ # Change logs
├── 05-publication/
│   └── chapters/          # Final .md files
├── tm/
│   ├── *.tmx              # Translation memory
│   └── exports/           # Parallel corpus
├── glossary/
│   └── terminology-en-is.csv
└── chapters/
    └── ch{NN}/
        ├── status.json    # Chapter status
        └── files.json     # Per-file tracking
```

## Validation Rules

Before creating any file:
1. Target folder exists
2. Naming convention matches stage
3. Chapter number is zero-padded
4. Not creating in wrong stage folder
5. Not overwriting without backup

Common mistakes to prevent:
- Saving to 03-faithful/ during localization (should be 04-localized/)
- Creating ch1/ instead of ch01/
- Putting logs in docx/ folder
- Saving .md in docx/ folders
