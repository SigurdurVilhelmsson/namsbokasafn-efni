# Translation Workflow

This document describes the complete translation workflow from source material to published content.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TRANSLATION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OpenStax        malstadur.is       Matecat          Editor              │
│  ─────────       ───────────        ───────          ──────              │
│                                                                          │
│  ┌──────┐        ┌──────────┐      ┌─────────┐      ┌────────┐          │
│  │ .docx │──────▶│   .txt   │─────▶│   TM    │─────▶│ Review │          │
│  │source│  strip │  machine │ align│translate│ track│ edits  │          │
│  └──────┘        │ translate│      │ w/format│ chgs │        │          │
│                  └──────────┘      └─────────┘      └────────┘          │
│                                                           │              │
│                                                           ▼              │
│                                    ┌──────────────────────────────┐     │
│                                    │      Final .docx → .md       │     │
│                                    │        for publication       │     │
│                                    └──────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detailed Steps

### Phase 1: Source Preparation

#### Step 1: Download OpenStax .docx Files
- Download chapter files from [OpenStax](https://openstax.org/)
- These files contain full formatting, equations, and images
- Save to: `01-source/docx/`

#### Step 2: Strip to Plain Text
- Use `tools/strip-docx-to-txt.js` to remove formatting
- Plain text is needed for malstadur.is machine translation
- Save to: `01-source/txt/`

#### Step 3: Download Editable Images (Optional)
- High-resolution PDFs for figures that need text translation
- Save to: `01-source/images-editable/`

### Phase 2: Machine Translation

#### Step 4: Upload to malstadur.is
- Upload .txt files to [malstadur.is](https://malstadur.is)
- This is an Icelandic machine translation service
- Download translated .docx files
- Save to: `02-machine-translation/docx/`

### Phase 3: Translation Memory Building

#### Step 5: Align in Matecat
- Upload original + machine translation to [Matecat](https://matecat.com)
- Align sentences to build Translation Memory (TM)
- Export TM as .tmx file
- Save TM to: `tm/`

#### Step 6: Translate Formatted Document
- Upload original formatted .docx to Matecat
- Use the TM to pre-populate translations
- Review and correct each segment
- Export translated .docx (keeps original formatting/images)
- Save to: `03-tm-translated/docx/`

### Phase 4: Editorial Review

#### Step 7: Editor Review
- Editor opens .docx file from `03-tm-translated/docx/`
- Uses Word Track Changes for all edits
- Focus areas:
  - Terminology consistency
  - Grammar and style
  - Technical accuracy
  - Readability for target audience
- Save reviewed file to: `04-editor-review/docx/`

#### Step 8: Incorporate Edits
- Review editor's track changes in Matecat
- Accept or discuss suggested changes
- Update TM with final translations

#### Step 9: Export Final .docx
- Export clean final .docx without track changes
- Save to: `05-final-docx/docx/`

### Phase 5: Publication

#### Step 10: Convert to Markdown
- Use `tools/docx-to-md.js` to convert .docx to .md
- Preserves images and basic formatting
- Handles equations appropriately

#### Step 11: Add Frontmatter
- Use `tools/add-frontmatter.js` to add metadata
- Includes title, chapter, section, objectives
- Adds licensing and attribution
- See `templates/frontmatter.yaml` for template

#### Step 12: Final Publication Files
- Place completed .md files in `06-publication/chapters/`
- Update `toc.json` with chapter information
- Update `glossary.json` with new terms

## Folder Summary

| Folder | Contents | Format |
|--------|----------|--------|
| `01-source/docx/` | Original OpenStax files | .docx |
| `01-source/txt/` | Stripped plain text | .txt |
| `01-source/images-editable/` | High-res figures | .pdf |
| `02-machine-translation/docx/` | malstadur.is output | .docx |
| `03-tm-translated/docx/` | Matecat output (formatted) | .docx |
| `04-editor-review/docx/` | Editor's track changes | .docx |
| `05-final-docx/docx/` | Clean final Word files | .docx |
| `06-publication/chapters/` | Publication-ready content | .md |
| `tm/` | Translation memory | .tmx |

## Tools Used

| Tool | Purpose | Website |
|------|---------|---------|
| malstadur.is | Icelandic machine translation | https://malstadur.is |
| Matecat | CAT tool for alignment and translation | https://matecat.com |
| Microsoft Word | Editor review with track changes | - |
| Typora/Markdown | Final publication format | https://typora.io |

## Tips for Editors

1. **Use Track Changes**: Always enable Track Changes in Word before making any edits
2. **Add Comments**: Use comments for questions about terminology or meaning
3. **Check Terminology**: Refer to `docs/terminology.md` for standard translations
4. **Don't Edit Formatting**: Focus on text content, not layout/styling
5. **Note Issues**: If you find translation errors, note them in comments

## Quality Checklist

Before marking a chapter as complete:

- [ ] All sections translated
- [ ] Terminology consistent with glossary
- [ ] Technical accuracy verified
- [ ] Grammar and spelling checked
- [ ] Equations render correctly
- [ ] Image references correct
- [ ] Frontmatter complete
- [ ] TOC updated
- [ ] New terms added to glossary
