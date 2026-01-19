# CLI Tools

*Auto-generated from tools/ directory*

## Core Tools (Simplified Workflow)

| Tool | Description | Step |
|------|-------------|------|
| `add-frontmatter` | Adds or updates YAML frontmatter in Markdown files for the Chemistry Reader | 5 |
| `cnxml-to-md` | Convert CNXML to Markdown with equation placeholders | 1 |
| `pipeline-runner` | Full CNXML → Markdown pipeline with equation extraction | 1 |
| `prepare-for-align` | Prepare markdown files for Matecat Align | 4 |
| `split-for-erlendur` | Split files at 18k characters for Erlendur MT | 1 |

## Utility Tools

| Tool | Description |
|------|-------------|
| `apply-equations` | Restore LaTeX equations from JSON mapping file |
| `clean-markdown` | Fix Pandoc artifacts (mspace, orphan directives, escaped tildes) |
| `cnxml-math-extract` | Extract MathML equations from CNXML and convert to LaTeX |
| `docx-to-md` | Convert DOCX files to Markdown format |
| `export-parallel-corpus` | Export Translation Memory to parallel text files |
| `fix-figure-captions` | Fix figure caption formatting issues |
| `process-chapter` | Full chapter processing pipeline |
| `repair-directives` | Fix directive syntax issues in markdown |
| `replace-math-images` | Replace equation images with LaTeX code |
| `strip-docx-to-txt` | Extract plain text from DOCX files |
| `validate-chapter` | Validate chapter structure and status |

## Deprecated Tools

These tools are deprecated and replaced by Matecat Align in the simplified workflow.

| Tool | Description |
|------|-------------|
| `cnxml-to-xliff` | Convert CNXML to XLIFF format (DEPRECATED) |
| `create-bilingual-xliff` | Create bilingual XLIFF from EN/IS pairs (DEPRECATED) |
| `md-to-xliff` | Convert Markdown to XLIFF format (DEPRECATED) |
| `xliff-to-md` | Convert XLIFF back to Markdown (DEPRECATED) |
| `xliff-to-tmx` | Convert XLIFF to TMX format (DEPRECATED) |

---

*21 tools total (16 active, 5 deprecated)*

See [cli-reference.md](../technical/cli-reference.md) for detailed usage instructions.
