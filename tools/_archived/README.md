# Archived Tools

This directory contains tools from previous pipeline iterations that are no longer part of the active workflow.

## Why Archived

These tools were deprecated during the Phase 8 migration (2026-02-05) from the markdown assembly pipeline to the CNXML→HTML rendering pipeline.

## Markdown Assembly Pipeline Tools (Deprecated)

### Primary Pipeline Tools
- **`chapter-assembler.js`** - Assembled individual markdown sections into complete chapters
  - **Replaced by:** `cnxml-render.js` which outputs complete HTML directly
  - **Reason:** Publication format changed from markdown to HTML

- **`add-frontmatter.js`** - Added YAML frontmatter to assembled markdown
  - **Replaced by:** Not needed; HTML includes metadata in `<meta>` tags
  - **Reason:** Frontmatter was a markdown-specific requirement

- **`compile-chapter.js`** - Extracted end-of-chapter content from CNXML
  - **Replaced by:** Functionality integrated into `cnxml-render.js`
  - **Reason:** Single-pass rendering is more efficient

- **`pipeline-runner.js`** - Orchestrated the multi-step markdown assembly workflow
  - **Replaced by:** Server-side pipeline API at `/api/pipeline`
  - **Reason:** Workflow moved to web interface

### Conversion Tools
- **`cnxml-to-md.js`** - Converted CNXML to markdown with directives
  - **Replaced by:** `cnxml-extract.js` (segments) + `cnxml-render.js` (HTML)
  - **Reason:** Markdown is now only an intermediary format for MT, not publication format

- **`docx-to-md.js`** - Converted Word documents to markdown
  - **Replaced by:** Not needed; workflow moved away from docx files
  - **Reason:** Editorial review now happens in web interface, not Word

### XLIFF Tools (Partial Deprecation)
- **`cnxml-to-xliff.js`** - Generated XLIFF from CNXML for Matecat
  - **Replaced by:** `prepare-for-align.js` for TM creation only
  - **Reason:** Matecat used only for TM creation (Align), not active translation

- **`create-bilingual-xliff.js`** - Created bilingual XLIFF files
  - **Replaced by:** `prepare-for-align.js`
  - **Reason:** Simplified to single TM creation tool

- **`md-to-xliff.js`**, **`xliff-to-md.js`**, **`xliff-to-tmx.js`** - XLIFF conversion utilities
  - **Replaced by:** Direct segment-to-TM workflow
  - **Reason:** Eliminated intermediate XLIFF steps

### Processing Tools
- **`split-for-erlendur.js`** - Split files for Erlendur MT (18k char limit)
  - **Replaced by:** `protect-segments-for-mt.js` with integrated splitting
  - **Reason:** Consolidated protection and splitting into single tool

- **`apply-equations.js`** - Applied equation notation to markdown
  - **Replaced by:** `cnxml-render.js` renders equations directly
  - **Reason:** Equations handled in HTML rendering

- **`clean-markdown.js`** - Post-processed markdown artifacts
  - **Replaced by:** Not needed; HTML output doesn't have markdown artifacts
  - **Reason:** No markdown assembly means no artifacts to clean

- **`post-mt-pipeline.js`** - Post-MT processing workflow
  - **Replaced by:** `restore-segments-from-mt.js`
  - **Reason:** Simplified workflow with single restoration tool

### Content Processing
- **`strip-docx-to-txt.js`** - Extracted plain text from Word documents
  - **Status:** Never fully implemented
  - **Reason:** Workflow moved away from docx files

- **`export-parallel-corpus.js`** - Exported aligned parallel corpus
  - **Status:** Planned but not implemented
  - **Reason:** TM export via Matecat Align suffices

## Active Tools (Not Archived)

For comparison, these are the **active** tools in the current pipeline:

### Core Pipeline
- `cnxml-extract.js` - Extract segments from CNXML for MT
- `protect-segments-for-mt.js` - Protect tags for Erlendur MT
- `restore-segments-from-mt.js` - Restore protected tags after MT
- `cnxml-inject.js` - Inject translated segments back into CNXML
- `cnxml-render.js` - Render translated CNXML to semantic HTML
- `prepare-for-align.js` - Prepare bilingual segments for Matecat Align (TM creation)

### Utilities
- `validate-chapter.js` - Validate chapter structure and content
- `audit-equation-notation.js` - Check equation notation consistency
- `audit-equation-text.js` - Verify equation text extraction
- `audit-render-output.js` - Validate HTML rendering output
- `check-openstax-errata.js` - Check for OpenStax errata updates
- `check-source-updates.js` - Detect source content changes
- `openstax-fetch.cjs` - Fetch modules from OpenStax GitHub
- `generate-book-data.cjs` - Generate book metadata JSON

## Migration Notes

The Phase 8 migration (completed 2026-02-05) fundamentally changed the pipeline architecture:

**Old (Markdown):**
```
CNXML → markdown → assemble → frontmatter → publish
```

**New (HTML):**
```
CNXML → extract → segments → MT → review → inject → render → HTML
```

Key changes:
- Publication format: markdown → semantic HTML
- Editorial workflow: Word documents → web-based segment editor
- Pipeline control: CLI scripts → web API
- End-of-chapter: separate compilation → integrated rendering

## Restoration

If you need to restore any of these tools:
1. Copy from `tools/_archived/` to `tools/`
2. Update imports to work with current directory structure
3. Test against current CNXML sources
4. Update documentation

**Note:** Most of these tools reference the old directory structure (`03-faithful/docx/`, `05-publication/markdown/`) which no longer exists. Significant refactoring would be required for restoration.

## See Also

- [ROADMAP.md](../../ROADMAP.md) - Phase 8 completion details
- [CHANGELOG.md](../../CHANGELOG.md) - Version [0.5.0] deprecation notes
- [docs/workflow/simplified-workflow.md](../../docs/workflow/simplified-workflow.md) - Current pipeline
- [docs/workflow/editor-improvements-jan2026.md](../../docs/workflow/editor-improvements-jan2026.md) - Phase 8 plan
