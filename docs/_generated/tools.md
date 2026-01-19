# CLI Tools

*Manually maintained - last updated 2026-01-19*

## Core Tools (Simplified Workflow)

| Tool | Description | Used In |
|------|-------------|---------|
| `pipeline-runner` | Full CNXML → markdown pipeline with equation extraction | Step 1 |
| `cnxml-to-md` | Convert CNXML to Markdown with equation placeholders | Step 1 |
| `split-for-erlendur` | Split files at 18k chars for MT upload | Step 1 |
| `prepare-for-align` | Prepare files for Matecat Align | Step 4 |
| `add-frontmatter` | Add YAML frontmatter for publication (supports --track) | Step 5 |

## Utility Tools

| Tool | Description |
|------|-------------|
| `apply-equations` | Restore LaTeX equations from JSON file |
| `clean-markdown` | Fix Pandoc artifacts (mspace, orphan directives) |
| `docx-to-md` | Convert DOCX to Markdown |
| `export-parallel-corpus` | Export TM to parallel text files |
| `fix-figure-captions` | Fix figure caption formatting |
| `repair-directives` | Fix directive syntax issues |
| `replace-math-images` | Replace equation images with LaTeX |
| `cnxml-math-extract` | Extract MathML from CNXML source |
| `strip-docx-to-txt` | Extract plain text from DOCX |
| `validate-chapter` | Validate chapter structure |
| `process-chapter` | Full chapter processing pipeline |

## Deprecated Tools

| Tool | Status | Replacement |
|------|--------|-------------|
| `cnxml-to-xliff` | DEPRECATED | Matecat Align |
| `create-bilingual-xliff` | DEPRECATED | Matecat Align |
| `md-to-xliff` | DEPRECATED | Matecat Align |
| `xliff-to-md` | DEPRECATED | Matecat Align |
| `xliff-to-tmx` | DEPRECATED | Matecat exports TMX directly |

**Why deprecated?** The simplified 5-step workflow uses Matecat Align for TM creation, which handles segmentation and alignment automatically. XLIFF generation is no longer needed.

---

*21 tools total (16 active, 5 deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
